import './lib/load-env.ts';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { allCredentialEnvNames, createLanguageModel, resolveModelConfig } from '../agent-harness/src/providers/index.ts';
import { budgetsFromEnv, HARNESS_VERSION, runHarnessExercise } from '../agent-harness/src/run.ts';
import { listRuns, type LoadedRun } from '../evaluation/artifacts.ts';
import { RECORDING_NAMES, type Provenance, type RecordingName } from '../evaluation/recordings.ts';
import { printEvent } from './lib/live-view.ts';
import { accessFor, clientFor, findBinary, serverRunning } from './lib/openlore.ts';
import { RECORDINGS_DIR, ROOT, RUNS_DIR } from './lib/paths.ts';
import { printRunSummary } from './lib/run-summary.ts';
import { ask, c, closePrompts, command, fail, heading, interactive, parseArgs } from './lib/ui.ts';

/**
 * Instructor tool: produces GENUINE recordings for replay mode by running the live
 * harness (or by promoting an existing live harness run).
 *   npm run record -- baseline | capture | shared-memory | stale-memory | all
 *   npm run record -- --from <run-id> <name>
 */
const { positional, flags } = parseArgs(process.argv.slice(2));
const target = positional[0];

function gitCommit(): string | undefined {
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function saveRecording(name: RecordingName, run: LoadedRun): void {
  if (run.metadata.interface !== 'harness' || run.metadata.origin !== 'live') fail('Only live harness runs can become recordings.');
  const dir = join(RECORDINGS_DIR, name);
  rmSync(dir, { recursive: true, force: true });
  cpSync(run.dir, dir, { recursive: true });
  const provenance: Provenance = {
    recording: name,
    synthetic: false,
    recordedAt: run.metadata.startedAt,
    recordedBy: process.env.USER ?? process.env.USERNAME,
    provider: run.metadata.model.provider ?? undefined,
    model: run.metadata.model.id ?? undefined,
    harnessVersion: HARNESS_VERSION,
    openloreVersion: run.metadata.openlore.serverVersion ?? findBinary()?.version,
    gitCommit: gitCommit(),
    notes: typeof flags.notes === 'string' ? flags.notes : undefined,
  };
  writeFileSync(join(dir, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
  console.log(c.green(`✔ Saved genuine recording recordings/${name} (from run ${run.metadata.runId})`));
}

async function recordLive(name: RecordingName): Promise<void> {
  const { config, problems } = resolveModelConfig(process.env);
  if (!config || problems.length) fail(`Model provider not configured: ${problems.map((p) => p.message).join('; ')}`);
  const exercise = name === 'baseline' ? '01' : name === 'capture' ? '02' : '03';
  const condition = name === 'baseline' ? 'baseline' : name === 'capture' ? 'capture' : 'shared-memory';
  let lore: Parameters<typeof runHarnessExercise>[0]['lore'];
  let token: string | undefined;
  if (condition !== 'baseline') {
    if (!serverRunning()) fail('OpenLore must be running.', command('npm run lore:start'));
    const access = accessFor('harness', condition === 'capture' ? 'capture' : 'read');
    token = access.token;
    const client = clientFor(access, `recorder-${name}`);
    await client.connect();
    lore = { client, identity: access.identity, scope: access.scope, endpoint: access.endpoint };
  }
  heading(`Recording "${name}" with ${config!.provider.id}/${config!.modelId}`);
  const outcome = await runHarnessExercise({
    exercise,
    condition,
    label: name === 'stale-memory' ? 'stale-memory' : undefined,
    model: createLanguageModel(config!, process.env),
    provider: config!.provider.id,
    modelId: config!.modelId,
    budgets: budgetsFromEnv(process.env),
    secrets: [...allCredentialEnvNames().map((n) => process.env[n]), token],
    lore,
    onEvent: printEvent,
  });
  await lore?.client.close();
  printRunSummary(outcome.metadata, outcome.result, outcome.runDir);
  if (outcome.result.status === 'failed') fail('The run failed; nothing was recorded.');
  const run = listRuns(RUNS_DIR).find((r) => r.metadata.runId === outcome.runId)!;
  saveRecording(name, run);
}

if (typeof flags.from === 'string') {
  if (!target || !(RECORDING_NAMES as readonly string[]).includes(target)) fail('Usage: npm run record -- --from <run-id> <baseline|capture|shared-memory|stale-memory>');
  const run = listRuns(RUNS_DIR).find((r) => r.metadata.runId.startsWith(flags.from as string));
  if (!run) fail(`Run ${flags.from} not found.`);
  saveRecording(target as RecordingName, run!);
} else if (target === 'all') {
  await recordLive('baseline');
  await recordLive('capture');
  console.log(`\nReview the captured proposals now in another terminal: ${command('npm run lore:review')}`);
  if (interactive()) await ask('Press Enter when /knowledge contains the reviewed notes to record the shared-memory run…');
  await recordLive('shared-memory');
  console.log(c.dim(`\nOptional: ${command('npm run stale-demo -- on')} then ${command('npm run record -- stale-memory')} then ${command('npm run stale-demo -- off')}`));
} else if (target && (RECORDING_NAMES as readonly string[]).includes(target)) {
  await recordLive(target as RecordingName);
} else {
  fail('What should be recorded?', 'Usage: npm run record -- baseline|capture|shared-memory|stale-memory|all   (or --from <run-id> <name>)');
}
if (existsSync(RECORDINGS_DIR)) console.log(c.dim('Commit recordings/ so participants without a key can replay them.'));
closePrompts();
