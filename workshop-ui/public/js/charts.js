import { h } from './dom.js';
import { delta, formatMetric } from './format.js';

// Paired horizontal bars: one row per metric, baseline (lighter) above shared memory
// (darker), two shades of one hue (validated ordinal pair, light and dark mode).
// Each row has its own scale because the metrics have different units; the value is
// printed at the bar tip, a tooltip repeats it on hover or keyboard focus, and the
// same numbers are always available in the table view.

/** Returns bar widths in percent of the row maximum; null stays null (unavailable). */
export function barWidths(values) {
  const present = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  const max = present.length ? Math.max(...present.map((v) => Math.abs(v))) : 0;
  return values.map((v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    if (max === 0) return 0;
    return Math.max(0, (Math.abs(v) / max) * 100);
  });
}

let tooltipEl;
function showTooltip(target, text) {
  tooltipEl ??= h('div', { class: 'tooltip', role: 'tooltip' });
  tooltipEl.textContent = text;
  document.body.append(tooltipEl);
  const rect = target.getBoundingClientRect();
  const top = Math.max(8, rect.top - tooltipEl.offsetHeight - 8);
  const left = Math.min(window.innerWidth - tooltipEl.offsetWidth - 8, rect.left + rect.width / 2 - tooltipEl.offsetWidth / 2);
  tooltipEl.style.setProperty('top', `${top}px`);
  tooltipEl.style.setProperty('left', `${Math.max(8, left)}px`);
}
function hideTooltip() {
  tooltipEl?.remove();
}

function barLine(kind, value, width, unit, metricLabel) {
  const seriesName = kind === 'base' ? 'Baseline' : 'Shared memory';
  if (width === null) return h('div', { class: 'bar-line' }, h('span', { class: 'bar-missing' }, `${seriesName}: unavailable`));
  const text = formatMetric(value, unit);
  const tip = `${metricLabel}, ${seriesName.toLowerCase()}: ${text}`;
  // Leave room on the right for the value label: the longest bar uses 82% of the track.
  const bar = h('div', { class: `bar ${kind}`, tabindex: '0', role: 'img', 'aria-label': tip });
  bar.style.setProperty('width', `${Math.max(width * 0.82, value === 0 ? 0 : 0.6)}%`);
  const label = h('span', { class: 'bar-value' }, text);
  label.style.setProperty('left', `${Math.max(width * 0.82, value === 0 ? 0 : 0.6)}%`);
  for (const [event, handler] of [['mouseenter', () => showTooltip(bar, tip)], ['focus', () => showTooltip(bar, tip)], ['mouseleave', hideTooltip], ['blur', hideTooltip]]) bar.addEventListener(event, handler);
  return h('div', { class: 'bar-line' }, bar, label);
}

export function metricRow(row) {
  const [baseWidth, sharedWidth] = barWidths([row.baseline, row.shared]);
  return h(
    'div',
    { class: 'metric-row' },
    h('div', { class: 'm-label' }, row.label),
    h('div', { class: 'bars' }, barLine('base', row.baseline, baseWidth, row.unit, row.label), barLine('shared', row.shared, sharedWidth, row.unit, row.label)),
    h('div', { class: 'm-delta' }, delta(row.baseline, row.shared, row.unit)),
  );
}

export function legend() {
  return h(
    'div',
    { class: 'legend', 'aria-label': 'Legend' },
    h('span', {}, h('i', { class: 'base', 'aria-hidden': 'true' }), 'Baseline (Exercise 01, no shared memory)'),
    h('span', {}, h('i', { class: 'shared', 'aria-hidden': 'true' }), 'Shared memory (Exercise 03)'),
  );
}
