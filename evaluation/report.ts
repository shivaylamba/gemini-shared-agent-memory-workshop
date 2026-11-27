import type { LoadedRun } from './artifacts.ts';
import { CHECKS, CONSTRAINTS } from './checks.ts';
import { checkComparability, comparisonRows, type Comparability, type ComparisonRow } from './compare.ts';

export interface ExperimentAReport {
  experiment: 'A: controlled memory comparison';
  generatedAt: string;
  comparability: Comparability;
  baseline: RunSummary;
  shared: RunSummary;
  capture?: RunSummary;
  rows: ComparisonRow[];
  checks: { id: string; title: string; baseline: boolean | null; shared: boolean | null }[];
  constraints: { id: string; title: string; baseline: boolean | null; shared: boolean | null }[];
}

export interface RunSummary {
  runId: string;
  origin: string;
  replayOf?: string;
  interface: string;
  agent: string;
  model: string;
  condition: string;
  label?: string;
  status: string;
  startedAt: string;
}

export function summarise(run: LoadedRun): RunSummary {
  const m = run.metadata;
  return {
    runId: m.runId,
    origin: m.origin,
    ...(m.replayOf ? { replayOf: `${m.replayOf.recording} (${m.replayOf.runId})` } : {}),
    interface: m.interface,
    agent: m.agent.name,
    model: `${m.model.provider ?? 'unknown'}/${m.model.id ?? 'unknown'}`,
    condition: m.condition,
    ...(m.label ? { label: m.label } : {}),
    status: run.result.status,
    startedAt: m.startedAt,
  };
}

export function buildExperimentA(baseline: LoadedRun, shared: LoadedRun, capture?: LoadedRun): ExperimentAReport {
  const checkOf = (run: LoadedRun, id: string) => run.result.correctness?.checks.find((c) => c.id === id)?.passed ?? null;
  return {
    experiment: 'A: controlled memory comparison',
    generatedAt: new Date().toISOString(),
    comparability: checkComparability(baseline, shared),
    baseline: summarise(baseline),
    shared: summarise(shared),
    ...(capture ? { capture: summarise(capture) } : {}),
    rows: comparisonRows(baseline, shared),
    checks: CHECKS.map((c) => ({ id: c.id, title: c.title, baseline: checkOf(baseline, c.id), shared: checkOf(shared, c.id) })),
    constraints: Object.entries(CONSTRAINTS).map(([id, title]) => ({
      id,
      title,
      baseline: baseline.result.correctness?.constraints[id] ?? null,
      shared: shared.result.correctness?.constraints[id] ?? null,
    })),
  };
}

export function formatValue(value: number | null, unit?: ComparisonRow['unit']): string {
  if (value === null) return 'unavailable';
  if (unit === 'ms') return Math.abs(value) < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`;
  if (unit === 'bytes') return Math.abs(value) < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} KB`;
  return value.toLocaleString('en-US');
}

export function formatDelta(row: ComparisonRow): string {
  if (row.baseline === null || row.shared === null) return '—';
  const diff = row.shared - row.baseline;
  if (diff === 0) return 'same';
  const pct = row.baseline !== 0 ? ` (${diff > 0 ? '+' : ''}${Math.round((diff / row.baseline) * 100)}%)` : '';
  return `${diff > 0 ? '+' : ''}${formatValue(diff, row.unit === 'checks' ? 'count' : row.unit)}${pct}`;
}

const mark = (value: boolean | null) => (value === null ? 'n/a' : value ? 'pass' : 'FAIL');

export function renderMarkdown(report: ExperimentAReport): string {
  const lines: string[] = [];
  lines.push('# Experiment A: controlled memory comparison', '');
  lines.push(`Generated ${report.generatedAt}. All values are measured from run artifacts; "unavailable" means the value was not reported or not observable.`, '');
  lines.push(report.comparability.comparable ? '**Comparable pair:** same interface, provider, model, snapshot, task prompt, budgets and harness version.' : `**Not a controlled comparison:** ${report.comparability.differences.join('; ')}.`, '');
  for (const note of report.comparability.notes) lines.push(`- ${note}`);
  lines.push('', '| Run | Run ID | Origin | Agent | Model | Status |', '|---|---|---|---|---|---|');
  for (const [name, run] of [['Baseline', report.baseline], ['Shared memory', report.shared], ...(report.capture ? [['Capture (upfront cost)', report.capture]] : [])] as [string, RunSummary][]) {
    lines.push(`| ${name} | \`${run.runId}\` | ${run.origin}${run.replayOf ? ` of ${run.replayOf}` : ''} | ${run.agent} | ${run.model} | ${run.status} |`);
  }
  lines.push('', '| Group | Metric | Baseline | Shared memory | Difference |', '|---|---|---|---|---|');
  for (const row of report.rows) lines.push(`| ${row.group} | ${row.label} | ${formatValue(row.baseline, row.unit)} | ${formatValue(row.shared, row.unit)} | ${formatDelta(row)} |`);
  lines.push('', '## Hidden checks', '', '| Check | Baseline | Shared memory |', '|---|---|---|');
  for (const check of report.checks) lines.push(`| ${check.title} | ${mark(check.baseline)} | ${mark(check.shared)} |`);
  lines.push('', '## Architectural constraints', '', '| Constraint | Baseline | Shared memory |', '|---|---|---|');
  for (const c of report.constraints) lines.push(`| ${c.title} | ${mark(c.baseline)} | ${mark(c.shared)} |`);
  lines.push('');
  return lines.join('\n');
}

export interface PortabilityReport {
  experiment: 'B: cross-agent knowledge portability';
  generatedAt: string;
  statement: string;
  producers: { identity: string; documents: string[] }[];
  consumers: { run: RunSummary; documentsRead: string[] | null; documentsReadUnavailable?: string; checksPassed: number | null; producersUsed: string[] }[];
}

export function renderPortabilityMarkdown(report: PortabilityReport): string {
  const lines = ['# Experiment B: cross-agent knowledge portability', '', report.statement, '', '## Knowledge producers (from OpenLore provenance)', ''];
  if (report.producers.length === 0) lines.push('_No reviewed knowledge with recorded provenance found._');
  for (const p of report.producers) lines.push(`- **${p.identity}**: ${p.documents.map((d) => `\`${d}\``).join(', ')}`);
  lines.push('', '## Knowledge consumers', '', '| Consumer run | Agent | Model | Interface | Docs read | Producers used | Hidden checks |', '|---|---|---|---|---|---|---|');
  for (const c of report.consumers) {
    lines.push(`| \`${c.run.runId}\` | ${c.run.agent} | ${c.run.model} | ${c.run.interface} (${c.run.origin}) | ${c.documentsRead ? c.documentsRead.length : `unavailable${c.documentsReadUnavailable ? `: ${c.documentsReadUnavailable}` : ''}`} | ${c.producersUsed.join(', ') || '—'} | ${c.checksPassed ?? 'n/a'}/10 |`);
  }
  lines.push('');
  return lines.join('\n');
}
