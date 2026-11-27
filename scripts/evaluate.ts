import './lib/load-env.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNote } from '../agent-harness/src/knowledge-format.ts';
import { listRuns } from '../evaluation/artifacts.ts';
import { selectPair } from '../evaluation/compare.ts';
import { buildPortability, knowledgeFromRuns, producerOf, type KnowledgeDocMeta } from '../evaluation/portability.ts';
import { buildExperimentA, formatDelta, formatValue, renderMarkdown, renderPortabilityMarkdown, type ExperimentAReport } from '../evaluation/report.ts';
import { maintainerClient, serverRunning } from './lib/openlore.ts';
import { ROOT, RUNS_DIR } from './lib/paths.ts';
import { c, command, heading, parseArgs } from './lib/ui.ts';

/**
 * npm run evaluate                       Experiment A (controlled comparison)
 * npm run evaluate -- --portability      Experiment B (cross-agent portability)
 * Options: --baseline <run-id> --shared <run-id> --label stale-memory --origin live|replay
 */
function printExperimentA(report: ExperimentAReport): void {
  heading('Experiment A — controlled memory comparison');
  if (report.comparability.comparable) console.log(c.green('✔ Controlled pair: same interface, provider, model, snapshot, prompt, budgets and harness.'));
  else {
    console.log(c.yellow(c.bold('⚠ NOT a controlled comparison:')));
    for (const d of report.comparability.differences) console.log(c.yellow(`   • ${d}`));
  }
  for (const note of report.comparability.notes) console.log(c.dim(`   ${note}`));
  const runLine = (name: string, r: ExperimentAReport['baseline']) => console.log(`  ${name.padEnd(15)} ${r.runId}  ${r.origin === 'replay' ? c.yellow(`replay of ${r.replayOf}`) : c.green('live')}  ${r.agent} · ${r.model}  ${c.dim(r.status)}`);
  console.log('');
  runLine('Baseline', report.baseline);
  runLine('Shared memory', report.shared);
  if (report.capture) runLine('Capture', report.capture);
  let group = '';
  console.log('');
  console.log(c.bold(`  ${'Metric'.padEnd(42)} ${'Baseline'.padStart(14)} ${'Shared memory'.padStart(14)}   Difference`));
  for (const row of report.rows) {
    if (row.group !== group) {
      group = row.group;
      console.log(c.dim(`  ${group}`));
    }
    console.log(`  ${row.label.padEnd(42)} ${formatValue(row.baseline, row.unit).padStart(14)} ${formatValue(row.shared, row.unit).padStart(14)}   ${formatDelta(row)}`);
  }
  console.log('');
  console.log(c.bold('  Hidden checks'));
  for (const check of report.checks) {
    const m = (v: boolean | null) => (v === null ? c.dim('n/a ') : v ? c.green('pass') : c.red('FAIL'));
    console.log(`  ${check.title.padEnd(42)} ${m(check.baseline).padStart(14)} ${m(check.shared).padStart(14)}`);
  }
}

async function liveKnowledgeMeta(): Promise<KnowledgeDocMeta[] | undefined> {
  if (!serverRunning()) return undefined;
  const client = maintainerClient();
  try {
    const list = await client.exec("find /knowledge -name '*.md'");
    const docs: KnowledgeDocMeta[] = [];
    for (const path of list.stdout.split('\n').filter(Boolean)) {
      const content = await client.exec(`cat '${path}'`);
      const parsed = parseNote(content.stdout);
      docs.push({ path, producer: parsed ? producerOf(parsed.frontmatter) : undefined });
    }
    return docs;
  } catch {
    return undefined;
  } finally {
    await client.close();
  }
}

export async function runEvaluate(argv: string[]): Promise<void> {
  const { flags } = parseArgs(argv);
  const runs = listRuns(RUNS_DIR);
  const outDir = join(RUNS_DIR, 'evaluations');
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '');

  if (flags.portability) {
    const knowledge = (await liveKnowledgeMeta()) ?? knowledgeFromRuns(runs);
    const report = buildPortability(runs, knowledge);
    heading('Experiment B — cross-agent knowledge portability');
    console.log(c.yellow(report.statement));
    console.log(c.bold('\n  Producers (from OpenLore provenance)'));
    for (const p of report.producers) console.log(`  ${p.identity.padEnd(28)} ${p.documents.join(', ')}`);
    console.log(c.bold('\n  Consumers (fresh shared-memory sessions)'));
    for (const consumer of report.consumers) {
      console.log(`  ${consumer.run.agent} · ${consumer.run.model} (${consumer.run.interface}, ${consumer.run.origin})  checks ${consumer.checksPassed ?? 'n/a'}/10`);
      console.log(c.dim(`     read: ${consumer.documentsRead ? consumer.documentsRead.join(', ') || '(nothing)' : `unavailable — ${consumer.documentsReadUnavailable}`}`));
      if (consumer.producersUsed.length) console.log(c.dim(`     knowledge produced by: ${consumer.producersUsed.join(', ')}`));
    }
    if (report.consumers.length === 0) console.log(c.dim('  No shared-memory runs yet (Exercise 03).'));
    const file = join(outDir, `portability-${stamp}`);
    writeFileSync(`${file}.json`, JSON.stringify(report, null, 2));
    writeFileSync(`${file}.md`, renderPortabilityMarkdown(report));
    console.log(`\nSaved ${relative(ROOT, file)}.{json,md}\n`);
    return;
  }

  const selection = selectPair(runs, {
    baselineId: typeof flags.baseline === 'string' ? flags.baseline : undefined,
    sharedId: typeof flags.shared === 'string' ? flags.shared : undefined,
    label: typeof flags.label === 'string' ? flags.label : undefined,
    origin: flags.origin === 'live' || flags.origin === 'replay' ? flags.origin : undefined,
  });
  if (!selection.baseline || !selection.shared) {
    heading('Experiment A — controlled memory comparison');
    console.log(`Need one baseline run (Exercise 01) and one shared-memory run (Exercise 03) in runs/.`);
    console.log(`  baseline:      ${selection.baseline ? selection.baseline.metadata.runId : c.red('missing')}`);
    console.log(`  shared memory: ${selection.shared ? selection.shared.metadata.runId : c.red('missing')}`);
    console.log(c.dim(`\nNo live runs? Use the genuine recordings: ${command('npm run exercise -- 01 --mode replay')} and ${command('npm run exercise -- 03 --mode replay')}.`));
    process.exitCode = 1;
    return;
  }
  const report = buildExperimentA(selection.baseline, selection.shared, selection.capture);
  printExperimentA(report);
  const file = join(outDir, `experiment-a-${stamp}`);
  writeFileSync(`${file}.json`, JSON.stringify(report, null, 2));
  writeFileSync(`${file}.md`, renderMarkdown(report));
  console.log(`\nSaved ${relative(ROOT, file)}.{json,md}`);
  console.log(c.dim(`Portability view (who produced, who consumed): ${command('npm run evaluate -- --portability')}\n`));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runEvaluate(process.argv.slice(2));
}
