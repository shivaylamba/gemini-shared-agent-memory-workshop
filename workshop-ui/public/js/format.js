// Formatting helpers. A missing value is always the word "unavailable", never zero.

export function num(value) {
  return value === null || value === undefined ? null : Number(value).toLocaleString('en-US');
}

export function bytes(value) {
  if (value === null || value === undefined) return null;
  const abs = Math.abs(value);
  if (abs < 1024) return `${value} B`;
  if (abs < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function ms(value) {
  if (value === null || value === undefined) return null;
  const abs = Math.abs(value);
  if (abs < 1000) return `${value} ms`;
  if (abs < 120_000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.floor(value / 60_000)} min ${Math.round((value % 60_000) / 1000)} s`;
}

export function formatMetric(value, unit) {
  if (value === null || value === undefined) return 'unavailable';
  if (unit === 'bytes') return bytes(value);
  if (unit === 'ms') return ms(value);
  return num(value);
}

export function delta(baseline, shared, unit) {
  if (baseline === null || baseline === undefined || shared === null || shared === undefined) return '';
  const diff = shared - baseline;
  if (diff === 0) return 'No change';
  const pct = baseline !== 0 ? ` (${diff > 0 ? '+' : ''}${Math.round((diff / baseline) * 100)}%)` : '';
  const magnitude = formatMetric(Math.abs(diff), unit === 'checks' ? 'count' : unit);
  return `${diff > 0 ? '+' : '−'}${magnitude}${pct}`;
}

export function when(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const CONDITION_LABEL = {
  baseline: 'Baseline, no shared memory',
  capture: 'Knowledge capture',
  'shared-memory': 'Shared memory',
};

export function originLabel(run) {
  if (run.recording) return 'Recording';
  if (run.origin === 'replay') return `Replay of the ${run.replayOf || ''} recording`.replace('  ', ' ');
  if (run.interface === 'external') return 'External agent';
  return 'Live';
}

export function originClass(run) {
  if (run.recording) return 'replay';
  if (run.origin === 'replay') return 'replay';
  if (run.interface === 'external') return 'external';
  return 'live';
}
