import { append, replace, clear, copyBlock, h, status, toast } from '../dom.js';
import { bytes, num, originClass, originLabel, when } from '../format.js';

const AGENTS = [
  ['antigravity', 'Google Antigravity'],
  ['claude-code', 'Claude Code'],
  ['codex', 'Codex'],
  ['generic', 'Another MCP-capable agent'],
];

const MEMORY_EVENTS = new Set(['knowledge.list', 'knowledge.search', 'knowledge.read', 'knowledge.publish']);

/**
 * Renders a run's trace as a "tape": one group per model request, with the tool calls the
 * model asked for underneath. Tool events arrive before the model.step event that closes
 * their request, so a group opens on the first tool call and is labelled when the step ends.
 * Shared-memory events are the only accent-coloured rows.
 */
class Tape {
  constructor(list, counters) {
    this.list = list;
    this.counters = counters;
    this.reset();
  }

  reset() {
    clear(this.list);
    this.group = null;
    this.steps = 0;
    this.maxTokens = 1;
    this.fills = [];
    this.state = { files: new Set(), notes: new Set(), searches: 0, tests: null, input: 0, inputKnown: true, toolCalls: 0, proposals: new Set() };
    this.empty = h('li', {}, h('div', { class: 'empty' }, h('strong', {}, 'Nothing has run yet'), 'Start a session to watch the agent work. Each tool call appears here as it happens, and shared-memory reads are highlighted.'));
    append(this.list, this.empty);
    this.renderCounters();
  }

  openGroup() {
    if (this.group) return this.group;
    this.empty?.remove();
    this.empty = null;
    const label = h('span', { class: 'label' }, `Step ${this.steps + 1}`);
    const fill = h('div', { class: 'token-fill' });
    const tokens = h('span', { class: 'tokens' }, 'waiting for the model');
    const body = h('ul', { class: 'step-body' });
    const li = h('li', { class: 'step' }, h('div', { class: 'step-head' }, label, h('div', { class: 'token-track', 'aria-hidden': 'true' }, fill), tokens), body);
    append(this.list, li);
    this.group = { li, body, fill, tokens, memory: false };
    return this.group;
  }

  row(className, what, detail, fresh) {
    const group = this.openGroup();
    const li = h('li', { class: `ev ${className}${fresh ? ' fresh' : ''}` }, h('span', { class: 'what' }, what), h('span', { class: 'detail' }, detail || ''));
    append(group.body, li);
    if (className.includes('memory')) {
      group.memory = true;
      group.li.classList.add('memory-step');
    }
    return li;
  }

  add(event, { live = false } = {}) {
    const s = this.state;
    switch (event.type) {
      case 'tool.call': {
        s.toolCalls++;
        const input = event.input || {};
        const target = input.path || input.query || input.slug || '';
        const memory = String(event.name).includes('knowledge');
        const what = [memory ? h('span', { class: 'tag' }, 'Shared memory') : null, h('span', { class: 'tool' }, event.name), target ? [' ', h('code', {}, String(target))] : null];
        this.lastRow = this.row(memory ? 'memory' : event.name === 'write_file' ? 'write' : '', what, '', live);
        break;
      }
      case 'tool.result':
        if (event.ok === false) {
          this.row('error', status('bad', String(event.error || 'Tool call refused').split('\n')[0].slice(0, 160)), '', live);
        }
        break;
      case 'file.read':
        s.files.add(event.path);
        if (this.lastRow) this.lastRow.querySelector('.detail').textContent = `${bytes(event.bytes)} read`;
        break;
      case 'file.search':
        if (this.lastRow) this.lastRow.querySelector('.detail').textContent = `${num(event.matches)} matches`;
        break;
      case 'file.write':
        if (this.lastRow) this.lastRow.querySelector('.detail').textContent = `${event.action}, ${bytes(event.bytes)}`;
        break;
      case 'knowledge.list':
        if (this.lastRow) this.lastRow.querySelector('.detail').textContent = `${num(event.documents)} notes listed`;
        break;
      case 'knowledge.search':
        s.searches++;
        if (this.lastRow) this.lastRow.querySelector('.detail').textContent = `${num(event.matches)} matches in ${(event.paths || []).length} notes`;
        break;
      case 'knowledge.read':
        s.notes.add(event.path);
        if (this.lastRow) this.lastRow.querySelector('.detail').textContent = `${bytes(event.bytes)} retrieved`;
        break;
      case 'knowledge.publish':
        s.proposals.add(event.slug);
        if (this.lastRow) this.lastRow.querySelector('.detail').textContent = 'sent for review';
        break;
      case 'tests.run':
        s.tests = { passed: event.passed, failed: event.failed };
        if (this.lastRow) replace(this.lastRow.querySelector('.detail'), event.failed === 0 ? status('good', `${event.passed} passed`) : status('bad', `${event.failed} failed, ${event.passed} passed`));
        break;
      case 'model.step': {
        const group = this.openGroup();
        this.steps++;
        const usage = event.usage || {};
        if (typeof usage.inputTokens === 'number') {
          s.input += usage.inputTokens;
          this.maxTokens = Math.max(this.maxTokens, usage.inputTokens);
          group.tokens.textContent = `${num(usage.inputTokens)} tokens in, ${num(usage.outputTokens) ?? '?'} out`;
          group.fill.dataset.tokens = String(usage.inputTokens);
          this.fills.push(group.fill);
          for (const fill of this.fills) fill.style.setProperty('width', `${(Number(fill.dataset.tokens) / this.maxTokens) * 100}%`);
        } else {
          s.inputKnown = false;
          group.tokens.textContent = 'usage not reported';
        }
        if (!(event.toolCalls || []).length && event.text) append(group.li, h('p', { class: 'step-text' }, String(event.text).slice(0, 600)));
        this.group = null;
        break;
      }
      case 'model.wait': {
        const why = event.reason === 'pace' ? 'keeping under the request limit' : event.reason === 'overloaded' ? 'the provider is overloaded' : 'the provider rate limit';
        append(this.list, h('li', { class: 'tape-wait' }, status('neutral', `Waiting ${Math.round(Number(event.waitMs) / 1000)} s for ${why}`)));
        break;
      }
      case 'run.completed':
        append(this.list, h('li', { class: 'tape-end' }, status(event.status === 'completed' ? 'good' : 'warn', event.status === 'completed' ? 'Session finished' : `Session stopped: ${String(event.status).replace('_', ' ')}`)));
        break;
      case 'run.failed':
        append(this.list, h('li', { class: 'tape-end' }, status('bad', `Session failed: ${event.error?.message || 'unknown error'}`), event.error?.hint ? h('p', { class: 'muted small' }, event.error.hint) : null));
        break;
      default:
        break;
    }
    this.renderCounters();
    if (live) this.list.scrollTop = this.list.scrollHeight;
  }

  renderCounters() {
    const s = this.state;
    const cell = (value, label) => h('div', {}, h('dd', { class: value === null ? 'unavailable' : '' }, value === null ? 'unavailable' : value), h('dt', {}, label));
    replace(this.counters, 
      cell(num(s.files.size), 'files read'),
      cell(num(s.notes.size), 'shared notes read'),
      cell(s.tests ? `${s.tests.passed}/${s.tests.passed + s.tests.failed}` : '—', 'tests passing, latest run'),
      cell(s.inputKnown ? num(s.input) : null, 'input tokens so far'),
    );
  }

  /** For runs without a trace (external agents), show measured values from the result instead. */
  showUntraced(detail) {
    clear(this.list);
    const m = detail.result.metrics.values;
    append(this.list, h('li', {}, h('div', { class: 'empty' }, h('strong', {}, 'No trace for this run'), 'External agents run outside the workshop, so their tool calls and tokens cannot be observed. Knowledge reads below come from OpenLore’s own event log when it was available.')));
    this.state.notes = new Set((detail.result.knowledge?.read) || []);
    replace(this.counters, 
      h('div', {}, h('dd', { class: 'unavailable' }, 'unavailable'), h('dt', {}, 'files read')),
      h('div', {}, h('dd', { class: m.knowledgeReads === null ? 'unavailable' : '' }, m.knowledgeReads === null ? 'unavailable' : num(m.uniqueKnowledgeDocsRead)), h('dt', {}, 'shared notes read')),
      h('div', {}, h('dd', {}, detail.result.correctness ? `${detail.result.correctness.regression.passed + detail.result.correctness.visibleRefundTests.passed}/${detail.result.correctness.regression.passed + detail.result.correctness.regression.failed + detail.result.correctness.visibleRefundTests.passed + detail.result.correctness.visibleRefundTests.failed}` : '—'), h('dt', {}, 'visible tests passing')),
      h('div', {}, h('dd', { class: 'unavailable' }, 'unavailable'), h('dt', {}, 'input tokens')),
    );
  }
}

function resultSection(detail) {
  const r = detail.result;
  const m = detail.metadata;
  const parts = [];
  if (r.correctness) {
    const c = r.correctness;
    const constraintNames = {
      'integer-paise': 'Amounts in integer paise',
      'refundable-limit': 'Never refunds more than is left',
      idempotency: 'Idempotent requests',
      'current-adapter': 'Current payment adapter only',
      'error-envelope': 'Standard error responses',
    };
    parts.push(
      h(
        'div',
        { class: 'result-grid' },
        h(
          'div',
          {},
          h('h3', {}, `Hidden checks: ${c.checksPassed} of ${c.checksTotal}`),
          h('table', { class: 'checks-table' }, h('tbody', {}, c.checks.map((check) => h('tr', {}, h('td', {}, check.title), h('td', {}, check.passed ? status('good', 'Pass') : status('bad', 'Fail')))))),
        ),
        h(
          'div',
          {},
          h('h3', {}, 'Architectural constraints'),
          h('table', { class: 'checks-table' }, h('tbody', {}, Object.entries(c.constraints).map(([id, ok]) => h('tr', {}, h('td', {}, constraintNames[id] || id), h('td', {}, ok ? status('good', 'Respected') : status('bad', 'Broken')))))),
          h('p', { class: 'small muted' }, `Regression tests: ${c.regression.passed} passed, ${c.regression.failed} failed. Changed files: ${r.changes.added} added, ${r.changes.modified} modified, ${r.changes.deleted} deleted.`),
        ),
      ),
    );
  } else if (r.correctnessUnavailable) {
    parts.push(h('p', { class: 'muted' }, `Not graded: ${r.correctnessUnavailable}.`));
  }
  if (m.condition === 'capture') {
    const proposed = r.knowledge?.proposed || [];
    parts.push(h('div', { class: 'callout memory' }, h('p', {}, proposed.length ? `${proposed.length} note${proposed.length === 1 ? '' : 's'} sent for review: ` : 'No notes were sent for review.', proposed.map((p, i) => [i ? ', ' : '', h('code', {}, p)])), h('p', {}, h('a', { href: '#/knowledge' }, 'Review them on the Knowledge page'))));
  }
  if (detail.finalResponse && !detail.finalResponse.startsWith('_No final')) parts.push(h('details', {}, h('summary', {}, 'The agent’s final message'), h('pre', { class: 'small' }, detail.finalResponse)));
  if (detail.patch) parts.push(h('details', {}, h('summary', {}, 'Code changes (diff)'), h('pre', { class: 'small mono' }, detail.patch), detail.patchTruncated ? h('p', { class: 'small muted' }, 'Diff truncated. See patch.diff in the run folder.') : null));
  if (detail.recording) {
    const p = detail.provenance || {};
    const model = [p.provider, p.model].filter(Boolean).join('/') || 'model not recorded';
    parts.push(h('p', { class: 'small muted' }, `The ${detail.recording} recording (${p.synthetic ? 'synthetic test fixture, not model output' : 'a genuine run'}), recorded ${when(p.recordedAt)} with ${model}${p.recordedBy ? ` by ${p.recordedBy}` : ''}. Run ${m.runId}.`));
  } else {
    parts.push(h('p', { class: 'small muted' }, `Run ${m.runId}, saved in runs/${m.runId}`));
  }
  return h('div', { class: 'stack' }, parts);
}

export function renderRun(root, ctx, exerciseId) {
  const { api, status: st } = ctx;
  const exercise = st.exercises.find((e) => e.id === exerciseId);
  if (!exercise || !exercise.condition) {
    append(root, h('div', { class: 'empty' }, h('strong', {}, 'There is no such exercise'), h('a', { href: '#/' }, 'Back to the session overview')));
    return () => {};
  }
  const isStatic = api.mode === 'static';
  const recordingName = { '01': 'baseline', '02': 'capture', '03': 'shared-memory' }[exercise.id];
  const recordingInfo = st.recordings.find((r) => r.name === recordingName);
  const hasRecording = Boolean(recordingInfo);
  const harnessReady = !isStatic && st.provider.problems.length === 0;
  const needsLore = exercise.condition !== 'baseline';
  const loreReady = st.openlore.running;
  const preferExternal = ['antigravity', 'external'].includes(st.workshop.path);

  const counters = h('dl', { class: 'counters', 'aria-live': 'polite' });
  const tapeList = h('ol', { class: 'tape', 'aria-label': 'Trace of the agent session' });
  const tape = new Tape(tapeList, counters);
  const originPill = h('span', { class: 'pill' }, 'No run selected');
  const resultBox = h('div', { class: 'stack' });
  const action = h('div', { class: 'stack' });
  const historyBox = h('div', {});
  let unsubscribe = () => {};

  const options = [
    {
      value: 'harness',
      title: 'Workshop harness',
      detail: isStatic
        ? 'Needs the live dashboard (npm run ui).'
        : harnessReady
          ? `Runs ${st.provider.label.replace(' (default)', '')}, ${st.provider.modelId}, in a fresh session.${needsLore && !loreReady ? ' OpenLore must be running first.' : ''}`
          : !st.provider.credentialSet
            ? `Needs an API key: add ${st.provider.credentialEnv[0] || 'one'} to .env (npm run setup).`
            : st.provider.problems[0] || 'Model provider not configured.',
      disabled: !harnessReady,
    },
    {
      value: 'replay',
      title: 'Replay a recording',
      detail: !hasRecording ? 'No recording for this exercise yet.' : recordingInfo.synthetic ? 'Plays a synthetic test recording. No model is called.' : 'Plays a recorded run. No model is called.',
      disabled: !hasRecording,
    },
    {
      value: 'external',
      title: 'Your own agent',
      detail: isStatic ? 'Needs the live dashboard (npm run ui).' : 'Antigravity, Claude Code, Codex or another MCP agent works in a clean folder.',
      disabled: isStatic,
    },
  ];
  const firstEnabled = (preferExternal && !isStatic ? options.find((o) => o.value === 'external') : null) || options.find((o) => !o.disabled);
  let mode = firstEnabled ? firstEnabled.value : null;

  const fieldset = h('fieldset', { class: 'mode-choice' }, h('legend', {}, 'How will you run it?'), options.map((o) => {
    const input = h('input', { type: 'radio', name: 'mode', value: o.value, checked: o.value === mode, disabled: o.disabled });
    input.addEventListener('change', () => {
      mode = o.value;
      renderAction();
    });
    return h('label', { class: 'mode-option' }, input, h('span', { class: 'opt-title' }, o.title), h('span', { class: 'opt-detail' }, o.detail));
  }));

  function setOrigin(run) {
    originPill.className = `pill ${originClass(run)}`;
    originPill.textContent = originLabel(run);
  }

  async function showRun(runId, { fromLive = false } = {}) {
    const detail = await api.run(runId);
    if (!fromLive) {
      tape.reset();
      if (detail.events.length) for (const event of detail.events) tape.add(event);
      else tape.showUntraced(detail);
    }
    setOrigin({ ...detail.metadata, replayOf: detail.metadata.replayOf?.recording, recording: detail.recording });
    replace(resultBox, resultSection(detail));
    for (const button of historyBox.querySelectorAll('button')) button.setAttribute('aria-current', String(button.dataset.run === runId));
  }

  function follow(job) {
    unsubscribe();
    tape.reset();
    clear(resultBox);
    originPill.className = `pill ${job.kind === 'replay' ? 'replay' : 'live'}`;
    originPill.textContent = job.kind === 'replay' ? 'Replaying a recording' : 'Live session running';
    unsubscribe = api.streamJob(job.id, {
      onTrace: (event) => tape.add(event, { live: true }),
      onDone: async ({ runId }) => {
        if (api.mode !== 'static') toast('Run saved');
        try {
          await refreshHistory();
          if (runId) await showRun(runId, { fromLive: true });
        } catch (error) {
          replace(resultBox, h('div', { class: 'callout bad' }, h('p', {}, `The run finished but could not be loaded: ${error.message}`)));
        }
        renderAction();
      },
      onError: (error) => {
        replace(resultBox, h('div', { class: 'callout bad' }, h('p', {}, error.message || 'The run failed.'), error.hint ? h('p', { class: 'muted' }, error.hint) : null));
        renderAction();
      },
    });
  }

  async function start(kind) {
    try {
      const job = await api.startJob({ kind, exercise: exercise.id });
      follow(job);
      renderAction(true);
    } catch (error) {
      replace(resultBox, h('div', { class: 'callout bad' }, h('p', {}, error.message), error.hint ? h('p', { class: 'muted' }, error.hint) : null));
    }
  }

  function promptDetails() {
    const promptText = mode === 'external' ? exercise.prompts.external : `${exercise.prompts.harness.instructions}\n\n${exercise.prompts.harness.task}`;
    return h('details', {}, h('summary', {}, mode === 'external' ? 'The prompt your agent receives' : 'The prompt the agent receives'), copyBlock(promptText));
  }

  function renderAction(running = false) {
    clear(action);
    if (mode === null) {
      append(action, h('p', { class: 'muted' }, isStatic ? 'This page has no recording for this exercise. Any saved runs are listed below.' : 'No way to run this exercise is ready yet. Run npm run setup.'), promptDetails());
    } else if (mode === 'harness') {
      append(action, 
        h('button', { class: 'button', type: 'button', disabled: running || !harnessReady || (needsLore && !loreReady), onclick: () => start('harness') }, running ? 'Session running' : 'Run a fresh session'),
        needsLore && !loreReady ? h('p', { class: 'small muted' }, 'Start OpenLore on the Knowledge page or with npm run lore:start.') : null,
        promptDetails(),
      );
    } else if (mode === 'replay') {
      append(action, h('button', { class: 'button', type: 'button', disabled: running || !hasRecording, onclick: () => start('replay') }, running ? 'Replay running' : 'Play the recording'), promptDetails());
    } else {
      const select = h('select', { id: 'agent-select' }, AGENTS.map(([value, label]) => h('option', { value, selected: value === (st.workshop.agent || 'antigravity') }, label)));
      const prepareButton = h('button', { class: 'button', type: 'button' }, 'Prepare a clean workspace');
      const output = h('div', { class: 'stack' });
      prepareButton.addEventListener('click', async () => {
        prepareButton.disabled = true;
        try {
          const prepared = await api.prepareExternal(exercise.id, select.value);
          replace(output, externalInstructions(prepared));
        } catch (error) {
          replace(output, h('div', { class: 'callout bad' }, h('p', {}, error.message)));
        } finally {
          prepareButton.disabled = false;
        }
      });
      append(action, h('div', { class: 'field' }, h('label', { for: 'agent-select' }, 'Agent'), select), prepareButton, output);
    }
  }

  function externalInstructions(p) {
    const modelInput = h('input', { id: 'model-input', placeholder: 'For example Gemini 3.5 Flash', autocomplete: 'off' });
    const collectButton = h('button', { class: 'button', type: 'button' }, exercise.condition === 'capture' ? 'Record which notes it proposed' : 'Grade and save the result');
    collectButton.addEventListener('click', async () => {
      collectButton.disabled = true;
      try {
        const { runId } = await api.collectExternal({ exercise: exercise.id, agent: p.agent, model: modelInput.value });
        toast('Run saved');
        await refreshHistory();
        await showRun(runId);
      } catch (error) {
        toast(error.message);
      } finally {
        collectButton.disabled = false;
      }
    });
    return h(
      'div',
      { class: 'stack' },
      p.warnings.map((w) => h('div', { class: 'callout warn' }, w)),
      h('h3', {}, 'Open this folder in a new session'),
      copyBlock(p.launch.join('\n')),
      p.openlore
        ? h('div', { class: 'callout memory' }, h('p', {}, `Shared memory: identity `, h('code', {}, p.openlore.identity), p.openlore.scope === 'read' ? ', read-only.' : ', can only send notes for review.'), h('p', { class: 'small' }, 'MCP server: ', h('code', {}, p.openlore.mcpUrl)))
        : h('p', { class: 'muted' }, 'No shared memory in this exercise. The folder has no OpenLore configuration.'),
      h('h3', {}, 'Paste this prompt'),
      copyBlock(p.prompt),
      h('h3', {}, 'When your agent has finished'),
      h('div', { class: 'field' }, h('label', { for: 'model-input' }, 'Model you used (optional)'), modelInput),
      collectButton,
    );
  }

  async function refreshHistory() {
    const { runs } = await api.runs();
    const mine = runs.filter((r) => r.exercise === exercise.id);
    clear(historyBox);
    if (!mine.length) {
      append(historyBox, h('p', { class: 'muted small' }, 'No saved runs for this exercise yet.'));
      return;
    }
    append(historyBox, h('ul', { class: 'history-list' }, mine.slice(0, 12).map((r) => h('li', {}, h('button', { type: 'button', dataset: { run: r.runId }, onclick: () => showRun(r.runId) },
      h('span', { class: 'h-main' }, `${r.agent === 'workshop-harness' ? 'Harness' : r.agent}, ${r.model.replace('unknown/unknown', 'model not reported')}`),
      h('span', { class: 'h-sub' }, h('span', { class: `pill ${originClass(r)}` }, originLabel(r)), r.label ? h('span', { class: 'pill' }, r.label) : null, h('span', {}, r.checksPassed === null ? 'not graded' : `${r.checksPassed}/10 checks`), h('span', {}, when(r.startedAt))),
    )))));
  }

  append(root, 
    h('div', { class: 'view-head' },
      h('p', { class: 'crumb' }, h('a', { href: '#/' }, 'Session'), ` / Exercise ${exercise.id}, ${exercise.minutes} minutes`),
      h('h1', {}, exercise.title),
      h('p', { class: 'lede' }, exercise.objective),
    ),
    h('div', { class: 'run-layout' },
      h('div', { class: 'stack-lg' },
        h('section', { class: 'panel stack', 'aria-label': 'Run the exercise' }, h('p', { class: 'muted' }, exercise.startingState), fieldset, action),
        h('section', { class: 'panel', 'aria-labelledby': 'counter-title' }, h('h3', { id: 'counter-title' }, 'This session'), counters),
        h('section', { class: 'panel', 'aria-labelledby': 'history-title' }, h('h3', { id: 'history-title' }, 'Saved runs'), historyBox),
      ),
      h('div', { class: 'stack-lg' },
        h('section', { class: 'panel tape-panel', 'aria-labelledby': 'tape-title' }, h('div', { class: 'tape-head' }, h('h2', { id: 'tape-title', class: 'h3' }, 'What the agent did'), originPill), tapeList),
        h('section', { 'aria-label': 'Result', 'aria-live': 'polite' }, resultBox),
      ),
    ),
  );
  renderAction();
  refreshHistory()
    .then(async () => {
      const { job } = await api.currentJob();
      if (job && job.status === 'running' && job.exercise === exercise.id) {
        follow(job);
        renderAction(true);
      } else {
        const latest = historyBox.querySelector('button');
        if (latest) await showRun(latest.dataset.run);
      }
    })
    .catch((error) => replace(resultBox, h('p', { class: 'error-box' }, error.message)));
  return () => unsubscribe();
}
