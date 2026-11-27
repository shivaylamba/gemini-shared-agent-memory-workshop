/**
 * Execution metrics computed from a run's trace (events.jsonl).
 * Every value is measured from the trace or reported by the provider. Values
 * that were not measured are null, with the reason in `unavailable`.
 * Nothing is estimated (bytes are never converted into tokens).
 */

export interface TraceEventLike {
  type: string;
  elapsedMs?: number;
  [key: string]: unknown;
}

export const METRIC_KEYS = [
  'modelRequests',
  'inputTokens',
  'outputTokens',
  'reasoningTokens',
  'cachedInputTokens',
  'totalTokens',
  'peakInputTokens',
  'toolCalls',
  'toolErrors',
  'localFileReads',
  'uniqueFilesRead',
  'localBytesRead',
  'localSearches',
  'knowledgeLists',
  'knowledgeSearches',
  'knowledgeReads',
  'uniqueKnowledgeDocsRead',
  'knowledgeBytesRetrieved',
  'proposalsPublished',
  'filesWritten',
  'testRuns',
  'elapsedMs',
  'waitMs',
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

export interface RunMetrics {
  values: Record<MetricKey, number | null>;
  unavailable: Partial<Record<MetricKey, string>>;
}

export function emptyMetrics(reason: string): RunMetrics {
  const values = Object.fromEntries(METRIC_KEYS.map((k) => [k, null])) as Record<MetricKey, number | null>;
  const unavailable = Object.fromEntries(METRIC_KEYS.map((k) => [k, reason])) as Partial<Record<MetricKey, string>>;
  return { values, unavailable };
}

interface StepUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cachedInputTokens: number | null;
  totalTokens: number | null;
}

function sumUsage(steps: StepUsage[], key: keyof StepUsage): { value: number | null; missing: number } {
  let total = 0;
  let missing = 0;
  for (const step of steps) {
    const value = step[key];
    if (typeof value === 'number') total += value;
    else missing++;
  }
  return { value: steps.length > 0 && missing === 0 ? total : null, missing };
}

export function computeMetrics(events: TraceEventLike[]): RunMetrics {
  const metrics = emptyMetrics('not measured');
  const set = (key: MetricKey, value: number | null, reason?: string) => {
    metrics.values[key] = value;
    if (value === null) metrics.unavailable[key] = reason ?? 'not measured';
    else delete metrics.unavailable[key];
  };
  const of = (type: string) => events.filter((e) => e.type === type);

  const steps = of('model.step').map((e) => (e.usage ?? {}) as StepUsage);
  set('modelRequests', steps.length);
  const tokenKeys: [MetricKey, keyof StepUsage][] = [
    ['inputTokens', 'inputTokens'],
    ['outputTokens', 'outputTokens'],
    ['reasoningTokens', 'reasoningTokens'],
    ['cachedInputTokens', 'cachedInputTokens'],
    ['totalTokens', 'totalTokens'],
  ];
  for (const [metric, usageKey] of tokenKeys) {
    const { value, missing } = sumUsage(steps, usageKey);
    set(metric, value, steps.length === 0 ? 'no model requests recorded' : `provider did not report ${usageKey} for ${missing} of ${steps.length} requests`);
  }
  const inputs = steps.map((s) => s.inputTokens).filter((v): v is number => typeof v === 'number');
  set('peakInputTokens', inputs.length === steps.length && inputs.length > 0 ? Math.max(...inputs) : null, 'provider did not report input tokens for every request');

  const results = of('tool.result');
  set('toolCalls', of('tool.call').length);
  set('toolErrors', results.filter((e) => e.ok === false).length);

  const reads = of('file.read');
  set('localFileReads', reads.length);
  set('uniqueFilesRead', new Set(reads.map((e) => String(e.path))).size);
  set('localBytesRead', reads.reduce((sum, e) => sum + (Number(e.bytes) || 0), 0));
  set('localSearches', of('file.search').length);

  const knowledgeReads = of('knowledge.read');
  set('knowledgeLists', of('knowledge.list').length);
  set('knowledgeSearches', of('knowledge.search').length);
  set('knowledgeReads', knowledgeReads.length);
  set('uniqueKnowledgeDocsRead', new Set(knowledgeReads.map((e) => String(e.path))).size);
  const retrieved = [...of('knowledge.read'), ...of('knowledge.search'), ...of('knowledge.list')];
  set('knowledgeBytesRetrieved', retrieved.reduce((sum, e) => sum + (Number(e.bytes) || 0), 0));
  set('proposalsPublished', new Set(of('knowledge.publish').map((e) => String(e.slug))).size);

  set('filesWritten', new Set(of('file.write').map((e) => String(e.path))).size);
  set('testRuns', of('tests.run').length);

  const end = events.find((e) => e.type === 'run.completed' || e.type === 'run.failed');
  set('elapsedMs', typeof end?.elapsedMs === 'number' ? end.elapsedMs : null, 'run did not record a completion event');
  // Included in elapsedMs: time spent waiting for provider rate limits (model.wait events).
  set('waitMs', of('model.wait').reduce((sum, e) => sum + (Number(e.waitMs) || 0), 0));
  return metrics;
}

/** Knowledge documents a run actually read, in order of first read. */
export function knowledgeDocsRead(events: TraceEventLike[]): string[] {
  const seen: string[] = [];
  for (const e of events) if (e.type === 'knowledge.read' && !seen.includes(String(e.path))) seen.push(String(e.path));
  return seen;
}

export function filesRead(events: TraceEventLike[]): string[] {
  const seen: string[] = [];
  for (const e of events) if (e.type === 'file.read' && !seen.includes(String(e.path))) seen.push(String(e.path));
  return seen;
}
