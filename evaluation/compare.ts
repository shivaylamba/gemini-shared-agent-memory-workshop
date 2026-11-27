import type { LoadedRun } from './artifacts.ts';
import type { MetricKey } from './metrics.ts';

/**
 * Experiment A — controlled memory comparison.
 * Only a pair that shares interface, provider, model, starting snapshot, task
 * prompt, budgets and harness version counts as controlled. Everything else is
 * reported, but explicitly labelled as not comparable.
 */

export interface Comparability {
  comparable: boolean;
  differences: string[];
  notes: string[];
}

export function checkComparability(baseline: LoadedRun, shared: LoadedRun): Comparability {
  const a = baseline.metadata;
  const b = shared.metadata;
  const differences: string[] = [];
  const notes: string[] = [];
  if (a.condition !== 'baseline') differences.push(`first run is ${a.condition}, not baseline`);
  if (b.condition !== 'shared-memory') differences.push(`second run is ${b.condition}, not shared-memory`);
  if (!a.controlled || !b.controlled) differences.push('external-agent runs are not controlled (tools, prompts and budgets are outside the workshop harness)');
  if (a.interface !== b.interface) differences.push(`interfaces differ (${a.interface} vs ${b.interface})`);
  if (a.agent.name !== b.agent.name) differences.push(`agents differ (${a.agent.name} vs ${b.agent.name})`);
  if (a.model.provider !== b.model.provider || a.model.id !== b.model.id) differences.push(`models differ (${a.model.provider}/${a.model.id} vs ${b.model.provider}/${b.model.id})`);
  if (a.snapshot.hash !== b.snapshot.hash) differences.push('starting snapshots differ');
  if (a.prompt.taskSha256 !== b.prompt.taskSha256) differences.push('task prompts differ');
  if (JSON.stringify(a.budgets) !== JSON.stringify(b.budgets)) differences.push('budgets differ');
  if (a.harnessVersion !== b.harnessVersion) differences.push(`harness versions differ (${a.harnessVersion} vs ${b.harnessVersion})`);
  if (a.prompt.instructionsSha256 !== b.prompt.instructionsSha256) notes.push('Instructions differ only by the shared-memory guidance paragraph (intentional).');
  if (a.origin !== 'live' || b.origin !== 'live') notes.push(`Origins: baseline ${a.origin}${a.replayOf ? ` of ${a.replayOf.recording}` : ''}, shared-memory ${b.origin}${b.replayOf ? ` of ${b.replayOf.recording}` : ''}. Replays reuse recorded model behaviour and metrics; grading was re-run locally.`);
  if (b.label) notes.push(`Shared-memory run label: ${b.label}.`);
  notes.push('One pair of runs is a demonstration, not a benchmark: model outputs vary between runs.');
  return { comparable: differences.length === 0, differences, notes };
}

export interface ComparisonRow {
  group: 'Correctness' | 'Context' | 'Exploration' | 'Knowledge' | 'Time';
  label: string;
  baseline: number | null;
  shared: number | null;
  unit?: 'tokens' | 'bytes' | 'ms' | 'count' | 'checks';
  /** For "lower is better" metrics the sign of the delta is interpreted accordingly. */
  lowerIsBetter?: boolean;
}

const METRIC_ROWS: { key: MetricKey; group: ComparisonRow['group']; label: string; unit: ComparisonRow['unit']; lowerIsBetter?: boolean }[] = [
  { key: 'inputTokens', group: 'Context', label: 'Input tokens (sum over requests)', unit: 'tokens', lowerIsBetter: true },
  { key: 'outputTokens', group: 'Context', label: 'Output tokens', unit: 'tokens', lowerIsBetter: true },
  { key: 'reasoningTokens', group: 'Context', label: 'Reasoning tokens', unit: 'tokens', lowerIsBetter: true },
  { key: 'cachedInputTokens', group: 'Context', label: 'Cached input tokens', unit: 'tokens' },
  { key: 'peakInputTokens', group: 'Context', label: 'Largest single request (input tokens)', unit: 'tokens', lowerIsBetter: true },
  { key: 'modelRequests', group: 'Context', label: 'Model requests', unit: 'count', lowerIsBetter: true },
  { key: 'localFileReads', group: 'Exploration', label: 'File reads', unit: 'count', lowerIsBetter: true },
  { key: 'uniqueFilesRead', group: 'Exploration', label: 'Unique files read', unit: 'count', lowerIsBetter: true },
  { key: 'localBytesRead', group: 'Exploration', label: 'Bytes read from the repository', unit: 'bytes', lowerIsBetter: true },
  { key: 'localSearches', group: 'Exploration', label: 'Code searches', unit: 'count', lowerIsBetter: true },
  { key: 'toolCalls', group: 'Exploration', label: 'Tool calls (all)', unit: 'count', lowerIsBetter: true },
  { key: 'testRuns', group: 'Exploration', label: 'Test runs', unit: 'count' },
  { key: 'knowledgeSearches', group: 'Knowledge', label: 'Knowledge searches', unit: 'count' },
  { key: 'knowledgeReads', group: 'Knowledge', label: 'Knowledge documents read', unit: 'count' },
  { key: 'knowledgeBytesRetrieved', group: 'Knowledge', label: 'Knowledge bytes retrieved', unit: 'bytes' },
  { key: 'elapsedMs', group: 'Time', label: 'Elapsed time', unit: 'ms', lowerIsBetter: true },
  { key: 'waitMs', group: 'Time', label: 'of which waiting for provider rate limits', unit: 'ms' },
];

export function comparisonRows(baseline: LoadedRun, shared: LoadedRun): ComparisonRow[] {
  const rows: ComparisonRow[] = [];
  const ca = baseline.result.correctness;
  const cb = shared.result.correctness;
  rows.push({ group: 'Correctness', label: 'Hidden checks passed (of 10)', baseline: ca?.checksPassed ?? null, shared: cb?.checksPassed ?? null, unit: 'checks' });
  rows.push({ group: 'Correctness', label: 'Regression tests failed', baseline: ca?.regression.failed ?? null, shared: cb?.regression.failed ?? null, unit: 'count', lowerIsBetter: true });
  rows.push({
    group: 'Correctness',
    label: 'Architectural constraints respected (of 5)',
    baseline: ca ? Object.values(ca.constraints).filter(Boolean).length : null,
    shared: cb ? Object.values(cb.constraints).filter(Boolean).length : null,
    unit: 'count',
  });
  for (const row of METRIC_ROWS) {
    rows.push({ group: row.group, label: row.label, baseline: baseline.result.metrics.values[row.key], shared: shared.result.metrics.values[row.key], unit: row.unit, lowerIsBetter: row.lowerIsBetter });
  }
  return rows;
}

export interface Selection {
  baseline?: LoadedRun;
  shared?: LoadedRun;
  capture?: LoadedRun;
}

/**
 * Picks the latest shared-memory run (excluding labelled variants such as
 * stale-memory unless asked) and the latest baseline run that is comparable to it.
 */
export function selectPair(runs: LoadedRun[], options: { baselineId?: string; sharedId?: string; label?: string; origin?: 'live' | 'replay' } = {}): Selection {
  const byId = (id?: string) => (id ? runs.find((r) => r.metadata.runId === id || r.metadata.runId.startsWith(id)) : undefined);
  const eligible = runs.filter((r) => !options.origin || r.metadata.origin === options.origin);
  const shared = byId(options.sharedId) ?? eligible.find((r) => r.metadata.condition === 'shared-memory' && (options.label ? r.metadata.label === options.label : !r.metadata.label));
  let baseline = byId(options.baselineId);
  if (!baseline) {
    const baselines = eligible.filter((r) => r.metadata.condition === 'baseline');
    baseline = (shared ? baselines.find((r) => checkComparability(r, shared).comparable) : undefined) ?? baselines[0];
  }
  const capture = eligible.find((r) => r.metadata.condition === 'capture');
  return { baseline, shared, capture };
}
