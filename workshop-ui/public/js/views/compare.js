import { legend, metricRow } from '../charts.js';
import { append, clear, h, status } from '../dom.js';
import { delta, formatMetric, originLabel, when } from '../format.js';

const CONSTRAINT_TITLES = {
  'integer-paise': 'Amounts in integer paise',
  'refundable-limit': 'Never refunds more than is left',
  idempotency: 'Idempotent requests',
  'current-adapter': 'Current payment adapter only',
  'error-envelope': 'Standard error responses',
};

function mark(value) {
  if (value === null || value === undefined) return h('span', { class: 'muted' }, 'n/a');
  return value ? status('good', 'Pass') : status('bad', 'Fail');
}

function runOption(run, selectedId) {
  const label = `${run.agent === 'workshop-harness' ? 'Harness' : run.agent}, ${run.model}, ${originLabel(run).toLowerCase()}${run.label ? `, ${run.label}` : ''}, ${run.checksPassed === null ? 'not graded' : `${run.checksPassed}/10`}, ${when(run.startedAt)}`;
  return h('option', { value: run.runId, selected: run.runId === selectedId }, label);
}

function experimentA(container, api, query) {
  clear(container);
  append(container, h('p', { class: 'muted' }, 'Loading…'));
  api.evaluation(query).then((view) => {
    clear(container);
    const report = view.report;
    if (api.mode !== 'static') {
      const baselineSelect = h('select', { id: 'baseline-select' }, view.candidates.baselines.map((r) => runOption(r, report?.baseline.runId)));
      const sharedSelect = h('select', { id: 'shared-select' }, view.candidates.shared.map((r) => runOption(r, report?.shared.runId)));
      const apply = () => experimentA(container, api, { baseline: baselineSelect.value, shared: sharedSelect.value });
      baselineSelect.addEventListener('change', apply);
      sharedSelect.addEventListener('change', apply);
      if (view.candidates.baselines.length || view.candidates.shared.length) {
        append(container, h('div', { class: 'selectors' },
          h('div', { class: 'field' }, h('label', { for: 'baseline-select' }, 'Baseline run'), baselineSelect),
          h('div', { class: 'field' }, h('label', { for: 'shared-select' }, 'Shared-memory run'), sharedSelect),
        ));
      }
    }
    if (!report) {
      append(container, h('div', { class: 'empty' }, h('strong', {}, `Missing ${view.missing.join(' and ')}`), 'Run Exercise 01 and Exercise 03 (live, with your own agent, or as replays), then come back.'));
      return;
    }
    const c = report.comparability;
    append(container, 
      c.comparable
        ? h('div', { class: 'callout good' }, h('p', {}, status('good', 'Controlled comparison')), h('p', { class: 'small' }, 'Same harness, provider, model, starting code, prompt and budget. The only difference is access to shared memory.'))
        : h('div', { class: 'callout warn' }, h('p', {}, status('warn', 'Not a controlled comparison')), h('ul', { class: 'small' }, c.differences.map((d) => h('li', {}, d))), h('p', { class: 'small' }, 'Use the numbers below as a description of two runs, not as the effect of shared memory.')),
      h('ul', { class: 'small muted' }, c.notes.map((n) => h('li', {}, n))),
    );

    const correctness = report.rows.filter((r) => r.group === 'Correctness');
    append(container, 
      h('section', { class: 'result-grid', 'aria-label': 'Correctness' },
        h('div', {}, h('h3', {}, 'Hidden checks'), h('table', { class: 'checks-table' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Check'), h('th', { scope: 'col' }, 'Baseline'), h('th', { scope: 'col' }, 'Shared memory'))),
          h('tbody', {}, report.checks.map((check) => h('tr', {}, h('td', {}, check.title), h('td', {}, mark(check.baseline)), h('td', {}, mark(check.shared))))),
        )),
        h('div', {}, h('h3', {}, 'Architectural constraints'), h('table', { class: 'checks-table' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Constraint'), h('th', { scope: 'col' }, 'Baseline'), h('th', { scope: 'col' }, 'Shared memory'))),
          h('tbody', {}, report.constraints.map((con) => h('tr', {}, h('td', {}, CONSTRAINT_TITLES[con.id] || con.title), h('td', {}, mark(con.baseline)), h('td', {}, mark(con.shared))))),
        ),
        h('p', { class: 'small muted' }, correctness.map((r) => `${r.label}: ${formatMetric(r.baseline, r.unit)} baseline, ${formatMetric(r.shared, r.unit)} shared memory`).join('. '))),
      ),
    );

    const groups = ['Context', 'Exploration', 'Knowledge', 'Time'];
    const descriptions = {
      Context: 'Tokens the provider reported. Every request resends the conversation, so input tokens add up.',
      Exploration: 'How much of the repository the agent read to find its way.',
      Knowledge: 'What it retrieved from shared memory instead.',
      Time: 'Wall-clock time of the agent session.',
    };
    append(container, h('section', { class: 'stack', 'aria-label': 'Cost and exploration' }, legend(), groups.map((group) => h('div', { class: 'metric-group' },
      h('h3', {}, group),
      h('p', { class: 'small muted' }, descriptions[group]),
      report.rows.filter((r) => r.group === group).map((row) => metricRow(row)),
    ))));

    append(container, h('details', {}, h('summary', {}, 'Show every value as a table'), h('table', { class: 'checks-table' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Group'), h('th', { scope: 'col' }, 'Metric'), h('th', { scope: 'col', class: 'num' }, 'Baseline'), h('th', { scope: 'col', class: 'num' }, 'Shared memory'), h('th', { scope: 'col', class: 'num' }, 'Difference'))),
      h('tbody', {}, report.rows.map((row) => h('tr', {}, h('td', {}, row.group), h('td', {}, row.label), h('td', { class: 'num' }, formatMetric(row.baseline, row.unit)), h('td', { class: 'num' }, formatMetric(row.shared, row.unit)), h('td', { class: 'num' }, delta(row.baseline, row.shared, row.unit) || '—')))),
    )));
    append(container, h('p', { class: 'small muted' }, `Baseline ${report.baseline.runId}. Shared memory ${report.shared.runId}.${report.capture ? ` Capture (upfront cost, not included above) ${report.capture.runId}.` : ''} "unavailable" means the value was not reported or not observable. Nothing is estimated.`));
  }).catch((error) => {
    clear(container);
    append(container, h('p', { class: 'error-box' }, error.message));
  });
}

function experimentB(container, api) {
  clear(container);
  append(container, h('p', { class: 'muted' }, 'Loading…'));
  api.portability().then((report) => {
    clear(container);
    append(container, h('div', { class: 'callout' }, h('p', {}, report.statement)));
    const readers = new Map();
    for (const consumer of report.consumers) for (const doc of consumer.documentsRead || []) readers.set(doc, [...(readers.get(doc) || []), consumer.run]);
    const docs = report.producers.flatMap((p) => p.documents.map((d) => ({ doc: d, producer: p.identity })));
    append(container, 
      h('section', { class: 'panel' }, h('h3', {}, 'Who wrote each note, and who used it'), docs.length
        ? h('table', { class: 'checks-table flow-table' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Note'), h('th', { scope: 'col' }, 'Written by'), h('th', { scope: 'col' }, 'Read in fresh sessions by'))),
          h('tbody', {}, docs.map(({ doc, producer }) => h('tr', {}, h('td', {}, doc), h('td', {}, producer), h('td', {}, (readers.get(doc) || []).map((r) => `${r.agent} (${r.model})`).join(', ') || h('span', { class: 'muted' }, 'not read yet'))))))
        : h('p', { class: 'muted' }, 'No approved notes with provenance yet.')),
      h('section', { class: 'panel' }, h('h3', {}, 'Fresh sessions that used shared memory'), report.consumers.length
        ? h('table', { class: 'checks-table' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Agent and model'), h('th', { scope: 'col' }, 'How it ran'), h('th', { scope: 'col' }, 'Notes read'), h('th', { scope: 'col', class: 'num' }, 'Hidden checks'))),
          h('tbody', {}, report.consumers.map((c) => h('tr', {}, h('td', {}, `${c.run.agent}, ${c.run.model}`), h('td', {}, `${c.run.interface === 'external' ? 'External agent' : 'Harness'}, ${c.run.origin}`), h('td', {}, c.documentsRead ? (c.documentsRead.length ? c.documentsRead.join(', ') : 'none') : h('span', { class: 'muted' }, 'unavailable')), h('td', { class: 'num' }, c.checksPassed === null ? 'n/a' : `${c.checksPassed}/10`)))))
        : h('p', { class: 'muted' }, 'No shared-memory runs yet. Run Exercise 03.')),
    );
  }).catch((error) => {
    clear(container);
    append(container, h('p', { class: 'error-box' }, error.message));
  });
}

export function renderCompare(root, ctx) {
  const body = h('div', { class: 'stack-lg' });
  const tabA = h('button', { type: 'button', role: 'tab', 'aria-selected': 'true', id: 'tab-a' }, 'Did shared memory help?');
  const tabB = h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', id: 'tab-b' }, 'Who wrote and who used the knowledge');
  const select = (which) => {
    tabA.setAttribute('aria-selected', String(which === 'a'));
    tabB.setAttribute('aria-selected', String(which === 'b'));
    body.setAttribute('aria-labelledby', which === 'a' ? 'tab-a' : 'tab-b');
    if (which === 'a') experimentA(body, ctx.api, {});
    else experimentB(body, ctx.api);
  };
  tabA.addEventListener('click', () => select('a'));
  tabB.addEventListener('click', () => select('b'));
  append(root, 
    h('div', { class: 'view-head' },
      h('p', { class: 'crumb' }, h('a', { href: '#/' }, 'Session'), ' / Exercise 04, 15 minutes'),
      h('h1', {}, 'Does memory actually help?'),
      h('p', { class: 'lede' }, 'Correctness first, then what each run had to read and send to the model. Only measured values appear here.'),
    ),
    h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Experiments' }, tabA, tabB),
    body,
  );
  body.setAttribute('role', 'tabpanel');
  select('a');
  return () => {};
}
