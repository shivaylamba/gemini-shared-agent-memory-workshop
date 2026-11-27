import './lib/load-env.ts';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listRuns, loadRun } from '../evaluation/artifacts.ts';
import { filesRead, knowledgeDocsRead } from '../evaluation/metrics.ts';
import { printEvent } from './lib/live-view.ts';
import { RUNS_DIR } from './lib/paths.ts';
import { printRunSummary } from './lib/run-summary.ts';
import { c, command, fail, heading, parseArgs } from './lib/ui.ts';

/**
 * npm run inspect -- [latest|<run-id>] [--trace] [--patch]
 * npm run inspect -- --list
 */
const { positional, flags } = parseArgs(process.argv.slice(2));
const runs = listRuns(RUNS_DIR);
if (flags.list || runs.length === 0) {
  if (runs.length === 0) fail('No runs yet.', `Start with ${command('npm run exercise -- 01')}`);
  for (const r of runs) {
    const cr = r.result.correctness;
    console.log(`${r.metadata.runId.padEnd(52)} ${r.metadata.interface.padEnd(8)} ${r.metadata.origin.padEnd(6)} ${`${r.metadata.model.provider ?? '?'}/${r.metadata.model.id ?? '?'}`.padEnd(32)} ${cr ? `${cr.checksPassed}/10` : '—'}`);
  }
  process.exit(0);
}
const wanted = positional[0] ?? 'latest';
const run = wanted === 'latest' ? runs[0] : (runs.find((r) => r.metadata.runId.startsWith(wanted)) ?? loadRun(wanted));
if (!run) fail(`Run "${wanted}" not found.`, `List runs with ${command('npm run inspect -- --list')}`);

printRunSummary(run!.metadata, run!.result, run!.dir);

heading('What the agent looked at');
const files = filesRead(run!.events);
const docs = run!.result.knowledge?.read ?? knowledgeDocsRead(run!.events);
console.log(`Files read (${files.length}): ${files.length ? files.join(', ') : c.dim(run!.events.length ? 'none' : 'unavailable (no workshop trace)')}`);
console.log(`Knowledge read (${docs.length}): ${docs.length ? docs.join(', ') : c.dim('none')}`);
if (run!.result.knowledge?.proposed?.length) console.log(`Knowledge proposed: ${run!.result.knowledge.proposed.join(', ')}`);

if (run!.result.correctness) {
  heading('Hidden checks');
  for (const check of run!.result.correctness.checks) {
    console.log(`  ${check.passed ? c.green('pass') : c.red('FAIL')}  ${check.title}${check.passed ? '' : c.dim(`  ${String(check.error ?? '').split('\n')[0]!.slice(0, 110)}`)}`);
  }
}

if (flags.trace && run!.events.length) {
  heading('Trace');
  for (const event of run!.events) printEvent(event);
}
if (flags.patch && existsSync(join(run!.dir, 'patch.diff'))) {
  heading('Patch');
  console.log(readFileSync(join(run!.dir, 'patch.diff'), 'utf8'));
}
console.log(c.dim(`\nMore: ${command(`npm run inspect -- ${run!.metadata.runId} --trace --patch`)} · final answer: ${join(run!.dir, 'final-response.md')}\n`));
