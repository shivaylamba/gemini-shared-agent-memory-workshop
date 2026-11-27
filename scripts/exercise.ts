import './lib/load-env.ts';
import { join, relative } from 'node:path';
import { resolveModelConfig } from '../agent-harness/src/providers/index.ts';
import { instructionsFor, taskPrompt } from '../agent-harness/src/prompts.ts';
import { replayRecording } from '../agent-harness/src/replay.ts';
import { budgetsFromEnv } from '../agent-harness/src/run.ts';
import { listRuns } from '../evaluation/artifacts.ts';
import { loadRecording, RECORDING_FOR_EXERCISE } from '../evaluation/recordings.ts';
import { hashSnapshot } from '../evaluation/snapshot.ts';
import { EXTERNAL_AGENTS, readWorkshopConfig, type ExternalAgent } from './lib/env.ts';
import { EXERCISES } from './lib/exercises.ts';
import { prepareExternalExercise } from './lib/external.ts';
import { printEvent } from './lib/live-view.ts';
import { approvedNoteCount, HarnessRunError, runHarnessFromEnv } from './lib/harness-runner.ts';
import { accessFor, readRemote, serverRunning } from './lib/openlore.ts';
import { CORE_APP, EXERCISE_SLUGS, RECORDINGS_DIR, ROOT, RUNS_DIR, normaliseExerciseId, type ExerciseId } from './lib/paths.ts';
import { printRunSummary } from './lib/run-summary.ts';
import { box, c, command, fail, heading, parseArgs } from './lib/ui.ts';
import { runEvaluate } from './evaluate.ts';

/**
 * npm run exercise -- <01-04> [--mode harness|external|replay] [--agent antigravity|claude-code|codex|generic] [--label <name>]
 * The default mode comes from `npm run setup` (WORKSHOP_MODE).
 */
const { positional, flags } = parseArgs(process.argv.slice(2));
const id = normaliseExerciseId(positional[0]);
if (!id) fail('Which exercise?', 'Usage: npm run exercise -- 01 [--mode harness|external|replay]');

const config = readWorkshopConfig();
const defaultMode = config.path === 'replay' ? 'replay' : config.path === 'harness' ? 'harness' : 'external';
const mode = (typeof flags.mode === 'string' ? (flags.mode === 'live' ? 'harness' : flags.mode) : defaultMode) as 'harness' | 'external' | 'replay';
if (!['harness', 'external', 'replay'].includes(mode)) fail(`Unknown mode "${String(flags.mode)}".`, 'Use --mode harness, --mode external or --mode replay.');
const agent = (typeof flags.agent === 'string' ? flags.agent : config.agent ?? (config.path === 'antigravity' ? 'antigravity' : 'generic')) as ExternalAgent;
if (mode === 'external' && !(EXTERNAL_AGENTS as readonly string[]).includes(agent)) fail(`Unknown agent "${agent}".`, `Use one of ${EXTERNAL_AGENTS.join(', ')}.`);
const label = typeof flags.label === 'string' ? flags.label : undefined;

const info = EXERCISES[id];
const readme = `exercises/${EXERCISE_SLUGS[id]}/README.md`;
const modeLabel = mode === 'harness' ? 'Workshop harness (live model)' : mode === 'external' ? `External agent: ${agent}` : 'Offline replay (genuine recording, no model calls)';

box(`Exercise ${id} — ${info.title}  (${info.minutes} min)`, [
  `Objective   ${info.objective}`,
  `Start       ${info.startingState}`,
  `Mode        ${modeLabel}`,
  `Guide       ${readme}`,
]);

function requireOpenLore(): void {
  if (!serverRunning() && !readRemote()) fail('OpenLore is not running.', `Start it with ${command('npm run lore:start')} (or use ${command(`npm run exercise -- ${id} --mode replay`)}).`);
}

async function knowledgeCount(): Promise<number> {
  return approvedNoteCount(mode === 'harness' ? 'harness' : agent);
}

function nextSteps(lines: string[]): void {
  heading('Next');
  for (const line of lines) console.log(`  ${line}`);
  console.log('');
}

async function runHarness(exercise: '01' | '02' | '03'): Promise<void> {
  const condition = EXERCISES[exercise].condition!;
  const { config: modelConfig, problems } = resolveModelConfig(process.env);
  if (!modelConfig || problems.length > 0) {
    fail(`Model provider not configured: ${problems.map((p) => p.message).join('; ')}`, `Run ${command('npm run setup')}, or use ${command(`npm run exercise -- ${exercise} --mode replay`)}.`);
  }
  if (condition !== 'baseline') requireOpenLore();
  if (condition === 'shared-memory') {
    const count = await approvedNoteCount();
    if (count <= 1) console.log(c.yellow(`! /knowledge holds ${count} note(s). Finish Exercise 02 (npm run lore:review) or run ${command('npm run checkpoint -- 02')}.`));
  }
  const budgets = budgetsFromEnv(process.env);
  heading(`Fresh ${condition} session · ${modelConfig!.provider.id}/${modelConfig!.modelId} · budget ${budgets.maxModelRequests} requests / ${budgets.maxToolCalls} tool calls / ${budgets.maxRuntimeMs / 1000}s`);
  if (exercise === '03') {
    const baseline = listRuns(RUNS_DIR).find((r) => r.metadata.condition === 'baseline');
    const hash = hashSnapshot(CORE_APP);
    if (baseline) console.log(baseline.metadata.snapshot.hash === hash ? c.green(`✔ Same starting snapshot as baseline run ${baseline.metadata.runId} (${hash.slice(0, 12)})`) : c.yellow('! The application changed since your baseline run: the comparison will not be controlled.'));
    console.log(c.green('✔ New session: no conversation history and no baseline code changes are carried over.'));
  }
  let outcome;
  try {
    outcome = await runHarnessFromEnv({ exercise, label, onEvent: printEvent });
  } catch (error) {
    if (error instanceof HarnessRunError) fail(error.message, error.hint);
    throw error;
  }
  printRunSummary(outcome.metadata, outcome.result, outcome.runDir);
  if (condition === 'capture') {
    nextSteps([
      `Review the proposals (you are the maintainer): ${command('npm run lore:review')}`,
      `Inspect what was published: ${command('npm run lore -- --as maintainer "ls /proposals/inbox"')}`,
      `Then continue with ${command('npm run exercise -- 03')}`,
    ]);
  } else {
    nextSteps([
      `Inspect the trace: ${command('npm run inspect -- latest')}`,
      `Workspace: ${relative(ROOT, outcome.workspace)}  ·  patch: ${relative(ROOT, join(outcome.runDir, 'patch.diff'))}`,
      exercise === '01' ? `Next exercise: ${command('npm run exercise -- 02')}` : `Compare: ${command('npm run exercise -- 04')}`,
    ]);
  }
}

async function runExternal(exercise: '01' | '02' | '03'): Promise<void> {
  const condition = EXERCISES[exercise].condition!;
  let prepared;
  try {
    prepared = await prepareExternalExercise(exercise, agent, {
      condition,
      root: ROOT,
      serverRunning,
      remote: readRemote,
      access: accessFor,
      approvedCount: approvedNoteCount,
      prompt: `${instructionsFor(condition, 'external')}\n\n${taskPrompt(condition)}`,
    });
  } catch (error) {
    fail((error as Error).message, `Or use ${command(`npm run exercise -- ${exercise} --mode replay`)}.`);
  }
  const p = prepared!;
  for (const warning of p.warnings) console.log(c.yellow(`! ${warning}`));

  heading('1. Open this clean workspace in a NEW agent session');
  for (const line of p.launch) console.log(`  ${line}`);
  console.log(c.dim(`  The workspace is outside the workshop repository, so solutions, recordings and the grader are not in the agent's project.`));
  console.log(c.dim('  External agents are not sandboxed by the workshop: their results are marked "not controlled".'));

  heading('2. OpenLore');
  if (!p.openlore) console.log(`  ${c.bold('Not available')} in this exercise (baseline).`);
  else {
    console.log(`  Identity  ${p.openlore.identity} (${p.openlore.scope === 'read' ? 'read-only: sees approved /knowledge only' : 'can publish proposals into /proposals/inbox; cannot change /knowledge'})`);
    console.log(`  MCP URL   ${p.openlore.mcpUrl}   (Streamable HTTP; header Authorization: Bearer <token>)`);
    if (p.configFiles.length) console.log(`  Config    ${p.configFiles.map((f) => relative(p.dir, f)).join(', ')} ${c.dim('(written for you)')}`);
    console.log(`  Token     ${command(p.openlore.tokenCommand)} ${c.dim('(expires in 12 h)')}`);
  }

  heading('3. Paste this prompt');
  console.log(c.dim('─'.repeat(72)));
  console.log(p.prompt);
  console.log(c.dim('─'.repeat(72)));

  nextSteps([
    `Run the tests yourself at any time: ${command(`cd "${p.dir}" && node --test "tests/**/*.test.ts"`)}`,
    condition === 'capture'
      ? `When the agent has published its notes: ${command('npm run lore:review')}, then ${command(`npm run collect -- ${exercise} --agent ${agent}`)}`
      : `When the agent has finished, grade and save the result: ${command(`npm run collect -- ${exercise} --agent ${agent} --model "<model you used>"`)}`,
  ]);
}

async function runReplay(exercise: '01' | '02' | '03'): Promise<void> {
  const name = label === 'stale-memory' ? 'stale-memory' : RECORDING_FOR_EXERCISE[exercise]!;
  const recording = loadRecording(RECORDINGS_DIR, name as never);
  if (!recording) {
    fail(`No genuine "${name}" recording is available in recordings/.`, 'Recordings are made by the instructor with `npm run record` (see recordings/README.md). Pair with a neighbour meanwhile.');
  }
  const p = recording!.provenance;
  console.log(c.yellow(`REPLAY: recorded ${p.recordedAt} with ${p.provider}/${p.model} (harness ${p.harnessVersion}). No model is called; tests and grading run locally.`));
  const outcome = await replayRecording({ recording: recording!, onEvent: printEvent, delayMs: flags.slow ? 120 : 0 });
  printRunSummary(outcome.metadata, outcome.result, outcome.runDir);
  if (exercise === '02') {
    nextSteps([
      `Recorded proposals: ${relative(ROOT, join(outcome.runDir, 'knowledge'))}`,
      `Load reviewed knowledge for Exercise 03: ${command('npm run checkpoint -- 02')} (needs OpenLore) — or just continue: ${command('npm run exercise -- 03 --mode replay')}`,
    ]);
  } else {
    nextSteps([`Inspect: ${command(`npm run inspect -- ${outcome.runId}`)}`, exercise === '01' ? `Next: ${command('npm run exercise -- 02 --mode replay')}` : `Next: ${command('npm run exercise -- 04 --mode replay')}`]);
  }
}

try {
  if (id === '04') {
    await runEvaluate(mode === 'replay' ? ['--origin', 'replay'] : []);
  } else if (mode === 'harness') await runHarness(id as '01' | '02' | '03');
  else if (mode === 'external') await runExternal(id as '01' | '02' | '03');
  else await runReplay(id as '01' | '02' | '03');
} catch (error) {
  fail((error as Error).message);
}

export type { ExerciseId };
