// Data access. Live mode talks to the local dashboard server; static mode reads
// the data embedded by `npm run ui:static` and plays recordings back in the browser.

class ApiError extends Error {
  constructor(message, hint, status) {
    super(message);
    this.hint = hint;
    this.status = status;
  }
}

function createLiveApi(token) {
  async function request(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { ...(options.body ? { 'content-type': 'application/json', 'x-workshop-token': token } : {}), ...(options.headers || {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(body.error?.message || `Request failed (${response.status})`, body.error?.hint, response.status);
    return body;
  }
  const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) });
  return {
    mode: 'live',
    status: () => request('/api/status'),
    runs: () => request('/api/runs'),
    run: (id) => request(`/api/runs/${encodeURIComponent(id)}`),
    evaluation: (query = {}) => request(`/api/evaluation?${new URLSearchParams(query)}`),
    portability: () => request('/api/portability'),
    knowledge: () => request('/api/knowledge'),
    document: (path) => request(`/api/knowledge/doc?${new URLSearchParams({ path })}`),
    review: (slug, action) => post('/api/knowledge/review', { slug, action }),
    startOpenLore: () => post('/api/openlore/start', {}),
    startJob: (body) => post('/api/jobs', body),
    currentJob: () => request('/api/jobs/current'),
    prepareExternal: (exercise, agent) => post('/api/external/prepare', { exercise, agent }),
    collectExternal: (body) => post('/api/external/collect', body),
    /** Subscribes to a job's event stream; returns an unsubscribe function. */
    streamJob(jobId, { onTrace, onDone, onError }) {
      const source = new EventSource(`/api/jobs/${jobId}/events`);
      source.addEventListener('trace', (e) => onTrace(JSON.parse(e.data)));
      source.addEventListener('done', (e) => {
        source.close();
        onDone(JSON.parse(e.data));
      });
      source.addEventListener('error', (e) => {
        if (e.data) onError(JSON.parse(e.data));
        else if (source.readyState === EventSource.CLOSED) onError({ message: 'Lost connection to the dashboard server.' });
        source.close();
      });
      return () => source.close();
    },
  };
}

function createStaticApi(data) {
  const runsById = new Map(data.runs.map((r) => [r.metadata.runId, r]));
  const fail = (message) => Promise.reject(new ApiError(message, 'This is a read-only replay page. Use the live dashboard (npm run ui) to do this.'));
  return {
    mode: 'static',
    status: async () => data.status,
    runs: async () => ({ runs: data.runList }),
    run: async (id) => {
      const run = runsById.get(id);
      if (!run) throw new ApiError(`Run ${id} is not in this replay page.`);
      return run;
    },
    evaluation: async () => data.evaluation,
    portability: async () => data.portability,
    knowledge: async () => ({ state: 'static', canReview: false, approved: data.knowledge.approved, proposals: data.knowledge.proposals }),
    document: async (path) => {
      const doc = data.knowledge.documents[path];
      if (!doc) throw new ApiError('This document is not part of the replay page.');
      return { path, content: doc, history: [] };
    },
    review: () => fail('Reviewing knowledge needs the live dashboard.'),
    startOpenLore: () => fail('Starting OpenLore needs the live dashboard.'),
    prepareExternal: () => fail('Preparing a workspace needs the live dashboard.'),
    collectExternal: () => fail('Collecting results needs the live dashboard.'),
    currentJob: async () => ({ job: null }),
    async startJob(body) {
      if (body.kind !== 'replay') return fail('Live runs need the live dashboard.');
      const name = body.label === 'stale-memory' ? 'stale-memory' : { '01': 'baseline', '02': 'capture', '03': 'shared-memory' }[body.exercise];
      const run = data.runs.find((r) => r.recording === name);
      if (!run) return fail(`This page has no "${name}" recording.`);
      return { id: `static-${name}`, runId: run.metadata.runId, status: 'running' };
    },
    /** Plays the recorded events back at a readable pace. */
    streamJob(jobId, { onTrace, onDone }) {
      const runId = jobId.startsWith('static-') ? data.runs.find((r) => `static-${r.recording}` === jobId)?.metadata.runId : undefined;
      const run = runId ? runsById.get(runId) : undefined;
      const events = run ? run.events : [];
      let index = 0;
      let timer;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const tick = () => {
        if (index >= events.length) {
          onDone({ runId });
          return;
        }
        onTrace(events[index++]);
        timer = setTimeout(tick, reduce ? 0 : 90);
      };
      tick();
      return () => clearTimeout(timer);
    },
  };
}

export function createApi() {
  const embedded = window.__WORKSHOP_DATA__;
  if (embedded) return createStaticApi(embedded);
  const token = document.querySelector('meta[name="dashboard-token"]')?.getAttribute('content') || '';
  return createLiveApi(token);
}

export { ApiError };
