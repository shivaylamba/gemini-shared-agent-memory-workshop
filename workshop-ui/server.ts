import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listRuns } from '../evaluation/artifacts.ts';
import { loadRecording, RECORDING_NAMES, type RecordingName } from '../evaluation/recordings.ts';
import { replayRecording } from '../agent-harness/src/replay.ts';
import { instructionsFor, taskPrompt } from '../agent-harness/src/prompts.ts';
import { CollectError, collectExternalRun } from '../scripts/lib/collect-run.ts';
import { EXTERNAL_AGENTS, loadDotEnv, type ExternalAgent } from '../scripts/lib/env.ts';
import { EXERCISES } from '../scripts/lib/exercises.ts';
import { prepareExternalExercise } from '../scripts/lib/external.ts';
import { approvedNoteCount, runHarnessFromEnv } from '../scripts/lib/harness-runner.ts';
import { accessFor, clientFor, findBinary, maintainerClient, readRemote, serverRunning, startServer } from '../scripts/lib/openlore.ts';
import { RECORDINGS_DIR, ROOT, RUNS_DIR } from '../scripts/lib/paths.ts';
import { approveProposal, diffAgainstTarget, listApprovedKnowledge, loadProposals, readDocument, rejectProposal } from '../scripts/lib/review.ts';
import { FONT_FILES, PUBLIC_DIR } from './assets.ts';
import { evaluationView, portabilityView, runDetail, runList, statusView } from './data.ts';
import { JobManager } from './jobs.ts';

/**
 * Local workshop dashboard. Security model:
 *  - binds to 127.0.0.1 only and rejects requests whose Host header is not localhost (DNS rebinding);
 *  - every state-changing request needs JSON plus a per-process token embedded in the page,
 *    which other websites cannot read (no CORS headers are ever sent);
 *  - the browser never receives a credential: provider keys and OpenLore tokens stay in this process.
 */

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
};

export interface UiServerOptions {
  port?: number;
  host?: string;
  runsDir?: string;
  recordingsDir?: string;
  /** Test hook: replaces the live harness runner. */
  harnessRunner?: typeof runHarnessFromEnv;
}

export interface UiServer {
  server: Server;
  url: string;
  token: string;
  close(): Promise<void>;
}

class HttpError extends Error {
  readonly status: number;
  readonly hint?: string;
  constructor(status: number, message: string, hint?: string) {
    super(message);
    this.status = status;
    this.hint = hint;
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, 'Send JSON (content-type: application/json).');
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64_000) throw new HttpError(413, 'Request body too large.');
  }
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }
}

function exerciseParam(value: unknown, allowed: string[]): '01' | '02' | '03' {
  const id = String(value ?? '').padStart(2, '0');
  if (!allowed.includes(id)) throw new HttpError(400, `Unknown exercise "${String(value)}".`);
  return id as '01' | '02' | '03';
}

export async function createUiServer(options: UiServerOptions = {}): Promise<UiServer> {
  loadDotEnv();
  const host = options.host ?? '127.0.0.1';
  const runsDir = options.runsDir ?? RUNS_DIR;
  const recordingsDir = options.recordingsDir ?? RECORDINGS_DIR;
  const harnessRunner = options.harnessRunner ?? runHarnessFromEnv;
  const token = randomBytes(24).toString('hex');
  const jobs = new JobManager();
  let port = options.port ?? 7430;

  const allowedHosts = () => new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);

  async function withMaintainer<T>(fn: (lore: ReturnType<typeof maintainerClient>) => Promise<T>): Promise<T> {
    const lore = maintainerClient();
    try {
      return await fn(lore);
    } finally {
      await lore.close();
    }
  }

  async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    const method = req.method ?? 'GET';
    const path = url.pathname;

    if (method !== 'GET') {
      if (req.headers['x-workshop-token'] !== token) throw new HttpError(403, 'Missing or invalid dashboard token. Reload the page.');
    }

    if (method === 'GET' && path === '/api/status') return sendJson(res, 200, statusView(recordingsDir));
    if (method === 'GET' && path === '/api/runs') return sendJson(res, 200, { runs: runList(runsDir) });

    const runMatch = /^\/api\/runs\/([A-Za-z0-9._-]+)$/.exec(path);
    if (method === 'GET' && runMatch) {
      const detail = runDetail(join(runsDir, runMatch[1]!));
      if (!detail) throw new HttpError(404, `Run ${runMatch[1]} not found.`);
      return sendJson(res, 200, detail);
    }

    if (method === 'GET' && path === '/api/evaluation') {
      const q = Object.fromEntries(url.searchParams);
      return sendJson(res, 200, evaluationView(listRuns(runsDir), q));
    }
    if (method === 'GET' && path === '/api/portability') {
      let live;
      if (serverRunning()) {
        live = await withMaintainer(async (lore) => (await listApprovedKnowledge(lore)).map((d) => ({ path: d.path, producer: d.proposedBy ?? d.contributedBy })));
      }
      return sendJson(res, 200, portabilityView(listRuns(runsDir), live));
    }

    if (method === 'GET' && path === '/api/knowledge') {
      if (serverRunning()) {
        const data = await withMaintainer(async (lore) => ({ approved: await listApprovedKnowledge(lore), proposals: await loadProposals(lore) }));
        return sendJson(res, 200, { state: 'local', canReview: true, ...data });
      }
      const remote = readRemote();
      if (remote) {
        const client = clientFor(accessFor('partner', 'read'), 'dashboard');
        try {
          return sendJson(res, 200, { state: 'remote', canReview: false, endpoint: remote.endpoint, approved: await listApprovedKnowledge(client), proposals: [] });
        } finally {
          await client.close();
        }
      }
      return sendJson(res, 200, { state: 'stopped', canReview: false, installed: Boolean(findBinary()), approved: [], proposals: [] });
    }
    if (method === 'GET' && path === '/api/knowledge/doc') {
      if (!serverRunning()) throw new HttpError(409, 'OpenLore is not running.', 'Start it from the Knowledge page or with npm run lore:start.');
      const docPath = url.searchParams.get('path') ?? '';
      const data = await withMaintainer(async (lore) => {
        try {
          return await readDocument(lore, docPath);
        } catch (error) {
          throw new HttpError(400, (error as Error).message);
        }
      });
      return sendJson(res, 200, { path: docPath, ...data });
    }
    if (method === 'POST' && path === '/api/knowledge/review') {
      const body = await readJsonBody(req);
      if (!serverRunning()) throw new HttpError(409, 'OpenLore is not running.');
      const action = body.action;
      if (action !== 'approve' && action !== 'reject') throw new HttpError(400, 'action must be "approve" or "reject".');
      const slug = String(body.slug ?? '');
      const result = await withMaintainer(async (lore) => {
        const proposal = (await loadProposals(lore)).find((p) => p.slug === slug);
        if (!proposal) throw new HttpError(404, `No proposal named "${slug}" in the inbox.`);
        if (action === 'reject') {
          await rejectProposal(lore, proposal);
          return { action, slug, removed: proposal.path };
        }
        const diff = await diffAgainstTarget(lore, proposal);
        const outcome = await approveProposal(lore, proposal, { force: body.force === true });
        if (!outcome.promoted) throw new HttpError(422, `Not published: ${outcome.reason}`);
        return { action, slug, ...outcome, diff };
      });
      return sendJson(res, 200, result);
    }
    if (method === 'POST' && path === '/api/openlore/start') {
      await readJsonBody(req);
      const binary = findBinary();
      if (!binary) throw new HttpError(409, 'OpenLore is not installed.', 'Run npm run setup.');
      try {
        const started = await startServer(binary);
        return sendJson(res, 200, { running: true, pid: started.pid, alreadyRunning: started.alreadyRunning });
      } catch (error) {
        throw new HttpError(500, (error as Error).message);
      }
    }

    if (method === 'GET' && path === '/api/jobs/current') {
      const job = jobs.latest();
      return sendJson(res, 200, { job: job ? jobs.summary(job) : null });
    }
    if (method === 'POST' && path === '/api/jobs') {
      const body = await readJsonBody(req);
      const kind = body.kind;
      const label = typeof body.label === 'string' && /^[a-z0-9-]{1,40}$/.test(body.label) ? body.label : undefined;
      if (kind === 'harness') {
        const exercise = exerciseParam(body.exercise, ['01', '02', '03']);
        try {
          const job = jobs.start('harness', exercise, label, async (emit) => {
            const outcome = await harnessRunner({ exercise, label, onEvent: emit, runsDir });
            return { runId: outcome.runId };
          });
          return sendJson(res, 202, jobs.summary(job));
        } catch (error) {
          throw new HttpError(409, (error as Error).message);
        }
      }
      if (kind === 'replay') {
        const exercise = exerciseParam(body.exercise, ['01', '02', '03']);
        const name = (label === 'stale-memory' ? 'stale-memory' : exercise === '01' ? 'baseline' : exercise === '02' ? 'capture' : 'shared-memory') as RecordingName;
        if (!(RECORDING_NAMES as readonly string[]).includes(name)) throw new HttpError(400, 'Unknown recording.');
        const recording = loadRecording(recordingsDir, name);
        if (!recording) throw new HttpError(404, `No genuine "${name}" recording is available.`, 'The instructor creates recordings with npm run record.');
        const delayMs = Math.min(500, Math.max(0, Number(body.delayMs ?? 80) || 0));
        try {
          const job = jobs.start('replay', exercise, label, async (emit) => {
            const outcome = await replayRecording({ recording, onEvent: emit, delayMs, runsDir });
            return { runId: outcome.runId };
          });
          return sendJson(res, 202, jobs.summary(job));
        } catch (error) {
          throw new HttpError(409, (error as Error).message);
        }
      }
      throw new HttpError(400, 'kind must be "harness" or "replay".');
    }
    const eventsMatch = /^\/api\/jobs\/([0-9a-f-]{36})\/events$/.exec(path);
    if (method === 'GET' && eventsMatch) {
      const job = jobs.get(eventsMatch[1]!);
      if (!job) throw new HttpError(404, 'Unknown job.');
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' });
      const write = (event: { kind: string; data: unknown }) => res.write(`event: ${event.kind}\ndata: ${JSON.stringify(event.data)}\n\n`);
      for (const event of job.events) write(event);
      if (job.status !== 'running') return void res.end();
      const listener = (event: { kind: string; data: unknown }) => {
        write(event);
        if (event.kind !== 'trace') res.end();
      };
      job.listeners.add(listener);
      req.on('close', () => job.listeners.delete(listener));
      return;
    }

    if (method === 'POST' && path === '/api/external/prepare') {
      const body = await readJsonBody(req);
      const exercise = exerciseParam(body.exercise, ['01', '02', '03']);
      const agent = String(body.agent ?? '') as ExternalAgent;
      if (!(EXTERNAL_AGENTS as readonly string[]).includes(agent)) throw new HttpError(400, `Unknown agent "${agent}".`);
      const condition = EXERCISES[exercise].condition!;
      try {
        const prepared = await prepareExternalExercise(exercise, agent, {
          condition,
          root: ROOT,
          serverRunning,
          remote: readRemote,
          access: accessFor,
          approvedCount: approvedNoteCount,
          prompt: `${instructionsFor(condition, 'external')}\n\n${taskPrompt(condition)}`,
        });
        return sendJson(res, 200, prepared);
      } catch (error) {
        throw new HttpError(409, (error as Error).message);
      }
    }
    if (method === 'POST' && path === '/api/external/collect') {
      const body = await readJsonBody(req);
      const exercise = exerciseParam(body.exercise, ['01', '02', '03']);
      const agent = String(body.agent ?? '') as ExternalAgent;
      if (!(EXTERNAL_AGENTS as readonly string[]).includes(agent)) throw new HttpError(400, `Unknown agent "${agent}".`);
      const text = (key: string) => (typeof body[key] === 'string' && (body[key] as string).trim() ? (body[key] as string).trim().slice(0, 120) : undefined);
      try {
        const outcome = await collectExternalRun({ exercise, agent, model: text('model'), provider: text('provider') });
        return sendJson(res, 200, { runId: outcome.metadata.runId, activityNote: outcome.activityNote });
      } catch (error) {
        if (error instanceof CollectError) throw new HttpError(409, error.message, error.hint);
        throw error;
      }
    }

    throw new HttpError(404, `No API route for ${method} ${path}.`);
  }

  function serveFile(res: ServerResponse, file: string, extraHeaders: Record<string, string> = {}): void {
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'x-content-type-options': 'nosniff', ...extraHeaders });
    res.end(readFileSync(file));
  }

  const server = createServer(async (req, res) => {
    try {
      if (!allowedHosts().has(String(req.headers.host ?? ''))) {
        res.writeHead(421, { 'content-type': 'text/plain' });
        return void res.end('Misdirected request: the dashboard only answers on localhost.');
      }
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed.');

      if (url.pathname === '/' || url.pathname === '/index.html') {
        const html = readFileSync(join(PUBLIC_DIR, 'index.html'), 'utf8').replace('{{DASHBOARD_TOKEN}}', token).replace('{{DATA_MODE}}', 'live');
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
        });
        return void res.end(html);
      }
      const fontMatch = /^\/fonts\/([a-z0-9-]+\.woff2)$/.exec(url.pathname);
      if (fontMatch && FONT_FILES[fontMatch[1]!] && existsSync(FONT_FILES[fontMatch[1]!]!)) {
        return serveFile(res, FONT_FILES[fontMatch[1]!]!, { 'cache-control': 'max-age=86400' });
      }
      if (url.pathname.startsWith('/assets/')) {
        const file = normalize(join(PUBLIC_DIR, url.pathname.slice('/assets/'.length)));
        if (file.startsWith(resolve(PUBLIC_DIR) + sep) && existsSync(file) && TYPES[extname(file)]) return serveFile(res, file, { 'cache-control': 'no-cache' });
      }
      throw new HttpError(404, 'Not found.');
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const hint = error instanceof HttpError ? error.hint : undefined;
      if (!res.headersSent) sendJson(res, status, { error: { message: (error as Error).message, ...(hint ? { hint } : {}) } });
      else res.end();
    }
  });

  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolvePromise());
  });
  port = (server.address() as { port: number }).port;
  return {
    server,
    url: `http://${host === '127.0.0.1' ? 'localhost' : host}:${port}`,
    token,
    close: () => new Promise<void>((resolvePromise) => server.close(() => resolvePromise())),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.WORKSHOP_UI_PORT || 7430);
  try {
    const ui = await createUiServer({ port });
    console.log(`\nWorkshop dashboard: ${ui.url}\n`);
    console.log('Listening on 127.0.0.1 only. Press Ctrl+C to stop.');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    console.error(code === 'EADDRINUSE' ? `Port ${port} is busy. Set WORKSHOP_UI_PORT to another port.` : (error as Error).message);
    process.exit(1);
  }
}
