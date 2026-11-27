import { append, h, icon, status } from '../dom.js';
import { CONDITION_LABEL, originLabel, when } from '../format.js';

// The 75-minute session as a proportional strip: the one bold element of the dashboard.
const SESSION = [
  { minutes: 8, title: 'Introduction and setup check', short: 'Intro' },
  { minutes: 12, exercise: '01' },
  { minutes: 15, exercise: '02' },
  { minutes: 15, exercise: '03' },
  { minutes: 15, exercise: '04' },
  { minutes: 5, title: 'Cross-agent demo', short: 'Demo' },
  { minutes: 5, title: 'Takeaways and questions', short: 'Q&A' },
];

function lastRunFor(runs, exercise) {
  return runs.find((r) => r.exercise === exercise);
}

function sessionStrip(st, runs) {
  const exercises = Object.fromEntries(st.exercises.map((e) => [e.id, e]));
  let start = 0;
  const ticks = [];
  const segments = SESSION.map((segment) => {
    ticks.push(start);
    start += segment.minutes;
    const exercise = segment.exercise ? exercises[segment.exercise] : null;
    if (!exercise) {
      const el = h('div', { class: 'segment talk', title: `${segment.title}, ${segment.minutes} minutes` }, h('span', { class: 'seg-title' }, segment.short));
      el.style.setProperty('flex', `${segment.minutes} 1 0`);
      return el;
    }
    const done = exercise.id === '04' ? false : Boolean(lastRunFor(runs, exercise.id));
    const el = h(
      'a',
      { class: 'segment exercise', href: `#/exercise/${exercise.id}`, 'aria-label': `Exercise ${exercise.id}, ${exercise.title}, ${exercise.minutes} minutes${done ? ', has a saved run' : ''}` },
      h('span', { class: 'seg-number' }, exercise.id),
      h('span', { class: 'seg-title' }, exercise.title),
      done ? h('span', { class: 'seg-done', title: 'Has a saved run' }, icon('pass')) : null,
    );
    el.style.setProperty('flex', `${segment.minutes} 1 0`);
    return el;
  });
  ticks.push(75);
  const tickRow = h('div', { class: 'ticks', 'aria-hidden': 'true' }, ticks.map((t) => {
    const span = h('span', {}, t === 0 ? '0 min' : `${t}`);
    span.style.setProperty('left', `${(t / 75) * 100}%`);
    return span;
  }));
  return h('section', { class: 'strip-wrap', 'aria-label': 'The 75-minute session' }, h('div', { class: 'strip' }, segments), tickRow);
}

/** A short, plain description of the harness provider state (no raw env messages up front). */
export function providerSummary(p) {
  if (!p.credentialSet) {
    return h('span', {}, status('warn', `No API key for ${p.label.replace(' (default)', '')} yet`), h('span', { class: 'muted small' }, ` Add ${p.credentialEnv[0] || 'the key'} to .env, or use another path.`));
  }
  if (p.problems.length) return status('warn', p.problems[0]);
  return status('good', `${p.label.replace(' (default)', '')}, ${p.modelId}`);
}

function readiness(st) {
  const pathLabels = { antigravity: 'Google Antigravity', harness: 'Workshop harness with your own key', external: 'Your own coding agent', replay: 'Offline replay' };
  const p = st.provider;
  const lore = st.openlore;
  const items = [
    ['Participation path', h('span', {}, pathLabels[st.workshop.path] || st.workshop.path, st.workshop.agent && st.workshop.path !== 'harness' ? h('span', { class: 'muted' }, ` (${st.workshop.agent})`) : null)],
  ];
  if (st.mode === 'static') {
    items.push(['This page', h('span', {}, 'A read-only replay of recorded runs. ', h('span', { class: 'muted' }, `Built ${when(st.generatedAt)}.`))]);
  } else {
    items.push([
      'Model for the harness',
      providerSummary(p),
    ]);
    items.push([
      'Shared knowledge (OpenLore)',
      lore.running ? status('good', lore.remote ? `Paired with ${lore.remote}` : `Running at ${lore.endpoint}`) : lore.installed ? status('neutral', 'Installed, not running yet. Needed from Exercise 02.') : status('warn', 'Not installed. Run npm run setup.'),
    ]);
  }
  items.push([
    'Recordings for replay',
    st.recordings.length ? status('good', st.recordings.map((r) => r.name).join(', ')) : status('neutral', st.mode === 'static' ? 'None in this page' : 'None yet. The instructor records them with npm run record.'),
  ]);
  return h('aside', { class: 'panel readiness', 'aria-labelledby': 'ready-title' }, h('h3', { id: 'ready-title' }, 'Your setup'), h('dl', {}, items.map(([dt, dd]) => [h('dt', {}, dt), h('dd', {}, dd)])));
}

export function renderHome(root, { status: st, runs }) {
  const list = h('ol', { class: 'exercise-list' }, st.exercises.map((exercise) => {
    const last = lastRunFor(runs, exercise.id);
    const href = exercise.id === '04' ? '#/compare' : `#/exercise/${exercise.id}`;
    return h(
      'li',
      { class: 'exercise-row' },
      h('span', { class: 'num', 'aria-hidden': 'true' }, exercise.id),
      h(
        'div',
        {},
        h('h3', {}, h('a', { href }, exercise.title)),
        h('p', { class: 'meta' }, `${exercise.minutes} minutes. ${exercise.objective}`),
        last ? h('p', { class: 'last muted' }, `Latest run: ${CONDITION_LABEL[last.condition] || last.condition}, ${originLabel(last).toLowerCase()}, ${last.checksPassed === null ? 'not graded' : `${last.checksPassed} of 10 checks`}, ${when(last.startedAt)}`) : null,
      ),
      h('a', { class: 'button secondary', href }, exercise.id === '04' ? 'Compare runs' : 'Open'),
    );
  }));

  append(root, 
    h(
      'div',
      { class: 'home-head' },
      h('h1', {}, 'Beyond the context window'),
      h('p', { class: 'lede' }, 'Run a coding agent with no memory, capture what it should have remembered as reviewed knowledge, reuse it in a fresh session, and measure whether it helped.'),
    ),
    sessionStrip(st, runs),
    h('div', { class: 'home-grid' }, h('section', { 'aria-label': 'Exercises' }, list), readiness(st)),
  );
}
