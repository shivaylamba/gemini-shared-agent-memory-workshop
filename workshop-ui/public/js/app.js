import { createApi } from './api.js';
import { append, clear, h } from './dom.js';
import { renderCompare } from './views/compare.js';
import { renderHome } from './views/home.js';
import { renderKnowledge } from './views/knowledge.js';
import { renderRun } from './views/run.js';

const api = createApi();
const main = document.getElementById('main');
let cleanup = () => {};

function setCurrentNav(route) {
  for (const link of document.querySelectorAll('.nav a')) {
    const target = link.getAttribute('href');
    const current = target === '#/' ? route === '' || route.startsWith('exercise') : route.startsWith(target.slice(2));
    if (current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

async function render() {
  cleanup();
  cleanup = () => {};
  const route = location.hash.replace(/^#\/?/, '');
  setCurrentNav(route);
  clear(main);
  let status;
  try {
    status = await api.status();
  } catch (error) {
    append(main, h('div', { class: 'empty' }, h('strong', {}, 'The dashboard server is not answering'), `Restart it with npm run ui. (${error.message})`));
    return;
  }
  const ctx = { api, status };
  try {
    if (route.startsWith('exercise/')) {
      const id = route.split('/')[1];
      cleanup = id === '04' ? renderCompare(main, ctx) : renderRun(main, ctx, id);
    } else if (route.startsWith('knowledge')) cleanup = renderKnowledge(main, ctx);
    else if (route.startsWith('compare')) cleanup = renderCompare(main, ctx);
    else {
      const { runs } = await api.runs();
      renderHome(main, { status, runs });
    }
  } catch (error) {
    append(main, h('p', { class: 'error-box' }, error.message));
  }
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

const badge = document.querySelector('.mode-badge');
if (api.mode === 'static' && badge) {
  badge.classList.add('static');
  badge.lastChild.textContent = 'Replay page, read-only';
}

window.addEventListener('hashchange', render);
render();
