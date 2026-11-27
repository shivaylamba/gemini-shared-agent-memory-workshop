import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { instructionsFor, taskPrompt, type Condition } from '../agent-harness/src/prompts.ts';
import { PROVIDERS, resolveModelConfig } from '../agent-harness/src/providers/index.ts';
import { listRuns, loadRun, type LoadedRun } from '../evaluation/artifacts.ts';
import { selectPair } from '../evaluation/compare.ts';
import { buildPortability, knowledgeFromRuns, type KnowledgeDocMeta } from '../evaluation/portability.ts';
import { availableRecordings } from '../evaluation/recordings.ts';
import { buildExperimentA } from '../evaluation/report.ts';
import { readWorkshopConfig } from '../scripts/lib/env.ts';
import { EXERCISES } from '../scripts/lib/exercises.ts';
import { findBinary, LOCK, localEndpoint, readRemote, serverRunning } from '../scripts/lib/openlore.ts';

/**
 * Data shapes served to the dashboard. The static replay build calls the same
 * functions at build time, so both modes render identical structures.
 * Nothing here ever includes a credential value.
 */

export interface ExerciseView {
  id: string;
  title: string;
  minutes: number;
  objective: string;
  startingState: string;
  condition: Condition | null;
  openlore: string;
  prompts: { harness: { instructions: string; task: string } | null; external: string | null };
}

export function exerciseViews(): ExerciseView[] {
  return Object.values(EXERCISES).map((e) => ({
    id: e.id,
    title: e.title,
    minutes: e.minutes,
    objective: e.objective,
    startingState: e.startingState,
    condition: e.condition ?? null,
    openlore: e.openlore,
    prompts: e.condition
      ? {
          harness: { instructions: instructionsFor(e.condition, 'harness'), task: taskPrompt(e.condition) },
          external: `${instructionsFor(e.condition, 'external')}\n\n${taskPrompt(e.condition)}`,
        }
      : { harness: null, external: null },
  }));
}

export interface StatusView {
  mode: 'live' | 'static';
  generatedAt: string;
  workshop: { path: string; agent?: string };
  provider: { id: string; label: string; modelId: string | null; credentialSet: boolean; credentialEnv: string[]; problems: string[] };
  openlore: { installed: boolean; version?: string; pinned: string; running: boolean; remote?: string; endpoint: string };
  recordings: { name: string; provider?: string; model?: string; recordedAt: string; synthetic: boolean }[];
  exercises: ExerciseView[];
}

export function statusView(recordingsDir: string): StatusView {
  const config = readWorkshopConfig();
  const { config: model, problems } = resolveModelConfig(process.env);
  const providerId = (process.env.MODEL_PROVIDER?.trim() || 'google').toLowerCase();
  const provider = PROVIDERS[providerId as keyof typeof PROVIDERS];
  const binary = findBinary();
  const remote = readRemote();
  return {
    mode: 'live',
    generatedAt: new Date().toISOString(),
    workshop: { path: config.path, ...(config.agent ? { agent: config.agent } : {}) },
    provider: {
      id: providerId,
      label: provider?.label ?? providerId,
      modelId: model?.modelId ?? null,
      credentialSet: !problems.some((p) => p.kind === 'missing-credential'),
      credentialEnv: provider?.credentialEnv ?? [],
      problems: problems.map((p) => p.message),
    },
    openlore: {
      installed: Boolean(binary),
      ...(binary?.version ? { version: binary.version } : {}),
      pinned: LOCK.version,
      running: serverRunning() || Boolean(remote),
      ...(remote ? { remote: remote.endpoint } : {}),
      endpoint: remote?.endpoint ?? localEndpoint(),
    },
    recordings: availableRecordings(recordingsDir).map((r) => ({ name: r.name, provider: r.provenance.provider, model: r.provenance.model, recordedAt: r.provenance.recordedAt, synthetic: Boolean(r.provenance.synthetic) })),
    exercises: exerciseViews(),
  };
}

export interface RunListItem {
  runId: string;
  exercise: string;
  condition: string;
  label?: string;
  interface: string;
  origin: string;
  replayOf?: string;
  controlled: boolean;
  agent: string;
  model: string;
  status: string;
  startedAt: string;
  checksPassed: number | null;
}

export function runListItem(run: LoadedRun): RunListItem {
  const m = run.metadata;
  return {
    runId: m.runId,
    exercise: m.exercise,
    condition: m.condition,
    ...(m.label ? { label: m.label } : {}),
    interface: m.interface,
    origin: m.origin,
    ...(m.replayOf ? { replayOf: m.replayOf.recording } : {}),
    controlled: m.controlled,
    agent: m.agent.name,
    model: `${m.model.provider ?? 'unknown'}/${m.model.id ?? 'unknown'}`,
    status: run.result.status,
    startedAt: m.startedAt,
    checksPassed: run.result.correctness?.checksPassed ?? null,
  };
}

export function runList(runsDir: string): RunListItem[] {
  return listRuns(runsDir).map(runListItem);
}

export interface RunDetail {
  metadata: LoadedRun['metadata'];
  result: LoadedRun['result'];
  events: LoadedRun['events'];
  finalResponse: string;
  patch: string;
  patchTruncated: boolean;
  knowledge: { path: string; content: string }[];
}

const MAX_PATCH = 200_000;

function readKnowledgeFiles(runDir: string): { path: string; content: string }[] {
  const root = join(runDir, 'knowledge');
  if (!existsSync(root)) return [];
  const files: { path: string; content: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.md')) files.push({ path: `/${relative(root, full).split(sep).join('/')}`, content: readFileSync(full, 'utf8') });
    }
  };
  walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function runDetail(runDir: string): RunDetail | undefined {
  const run = loadRun(runDir);
  if (!run) return undefined;
  const read = (name: string) => (existsSync(join(runDir, name)) ? readFileSync(join(runDir, name), 'utf8') : '');
  const patch = read('patch.diff');
  return {
    metadata: run.metadata,
    result: run.result,
    events: run.events,
    finalResponse: read('final-response.md'),
    patch: patch.slice(0, MAX_PATCH),
    patchTruncated: patch.length > MAX_PATCH,
    knowledge: readKnowledgeFiles(runDir),
  };
}

export interface EvaluationView {
  candidates: { baselines: RunListItem[]; shared: RunListItem[] };
  report: ReturnType<typeof buildExperimentA> | null;
  missing: string[];
}

export function evaluationView(runs: LoadedRun[], query: { baseline?: string; shared?: string; label?: string; origin?: string }): EvaluationView {
  const selection = selectPair(runs, {
    baselineId: query.baseline || undefined,
    sharedId: query.shared || undefined,
    label: query.label || undefined,
    origin: query.origin === 'live' || query.origin === 'replay' ? query.origin : undefined,
  });
  const missing: string[] = [];
  if (!selection.baseline) missing.push('a baseline run (Exercise 01)');
  if (!selection.shared) missing.push('a shared-memory run (Exercise 03)');
  return {
    candidates: {
      baselines: runs.filter((r) => r.metadata.condition === 'baseline').map(runListItem),
      shared: runs.filter((r) => r.metadata.condition === 'shared-memory').map(runListItem),
    },
    report: selection.baseline && selection.shared ? buildExperimentA(selection.baseline, selection.shared, selection.capture) : null,
    missing,
  };
}

export function portabilityView(runs: LoadedRun[], liveKnowledge?: KnowledgeDocMeta[]) {
  return buildPortability(runs, liveKnowledge ?? knowledgeFromRuns(runs));
}
