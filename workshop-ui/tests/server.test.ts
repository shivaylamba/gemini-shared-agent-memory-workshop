import { request } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { HarnessRunOutcome } from '../../agent-harness/src/run.ts';
import { createUiServer, type UiServer } from '../server.ts';
import { syntheticRecordings } from './fixtures.ts';

interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function send(server: UiServer, path: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Reply> {
  const { port } = new URL(server.url);
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: options.method ?? 'GET', headers: { host: `localhost:${port}`, ...options.headers } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

const FAKE_KEY = 'AIzaFAKE-test-value-that-must-never-leave-0123456789';

describe('dashboard server', () => {
  let server: UiServer;
  let runsDir: string;
  let fixture: Awaited<ReturnType<typeof syntheticRecordings>>;
  let harnessCalls = 0;
  let previousKey: string | undefined;

  beforeAll(async () => {
    previousKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = FAKE_KEY;
    fixture = await syntheticRecordings();
    runsDir = fixture.runsDir;
    server = await createUiServer({
      port: 0,
      runsDir,
      recordingsDir: fixture.recordingsDir,
      harnessRunner: async ({ onEvent }) => {
        harnessCalls++;
        onEvent?.({ type: 'run.started', seq: 0, t: 0 } as never);
        await new Promise((r) => setTimeout(r, 150));
        onEvent?.({ type: 'run.completed', seq: 1, t: 1, status: 'completed' } as never);
        return { runId: fixture.baseline.runId } as HarnessRunOutcome;
      },
    });
  }, 120_000);

  afterAll(async () => {
    await server?.close();
    if (previousKey === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    else process.env.GOOGLE_GENERATIVE_AI_API_KEY = previousKey;
  });

  it('answers only on localhost (DNS rebinding guard)', async () => {
    const { port } = new URL(server.url);
    const reply = await send(server, '/api/status', { headers: { host: `attacker.example:${port}` } });
    expect(reply.status).toBe(421);
  });

  it('serves the page with a per-process token, a strict CSP and no CORS', async () => {
    const reply = await send(server, '/');
    expect(reply.status).toBe(200);
    expect(reply.body).toContain(`content="${server.token}"`);
    expect(reply.body).not.toContain('{{');
    expect(String(reply.headers['content-security-policy'])).toContain("script-src 'self'");
    expect(reply.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('never sends a credential value to the browser', async () => {
    const status = await send(server, '/api/status');
    expect(status.status).toBe(200);
    expect(status.body).not.toContain(FAKE_KEY);
    const parsed = JSON.parse(status.body);
    expect(parsed.provider.credentialSet).toBe(true);
    for (const path of ['/api/runs', `/api/runs/${fixture.baseline.runId}`, '/api/evaluation', '/']) {
      expect((await send(server, path)).body).not.toContain(FAKE_KEY);
    }
  });

  it('rejects state-changing requests without the token or without JSON', async () => {
    const noToken = await send(server, '/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"kind":"harness","exercise":"01"}' });
    expect(noToken.status).toBe(403);
    const wrongToken = await send(server, '/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json', 'x-workshop-token': 'guess' }, body: '{}' });
    expect(wrongToken.status).toBe(403);
    const form = await send(server, '/api/jobs', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-workshop-token': server.token }, body: 'kind=harness' });
    expect(form.status).toBe(415);
    expect(harnessCalls).toBe(0);
  });

  it('does not serve files outside the public folder', async () => {
    for (const path of ['/assets/..%2fserver.ts', '/assets/../server.ts', '/assets/%2e%2e/%2e%2e/package.json', '/api/runs/..%2f..%2fpackage.json']) {
      const reply = await send(server, path);
      expect(reply.status, path).toBe(404);
      expect(reply.body).not.toContain('createUiServer');
    }
  });

  it('lists runs and builds the comparison from measured values', async () => {
    const runs = JSON.parse((await send(server, '/api/runs')).body).runs;
    expect(runs.map((r: { runId: string }) => r.runId).sort()).toEqual([fixture.baseline.runId, fixture.shared.runId].sort());
    const evaluation = JSON.parse((await send(server, '/api/evaluation')).body);
    expect(evaluation.report.baseline.runId).toBe(fixture.baseline.runId);
    expect(evaluation.report.comparability.comparable).toBe(true);
    const detail = JSON.parse((await send(server, `/api/runs/${fixture.shared.runId}`)).body);
    expect(detail.result.correctness.checksPassed).toBe(10);
    expect((await send(server, '/api/runs/no-such-run')).status).toBe(404);
  });

  it('runs one job at a time and streams its events', async () => {
    const headers = { 'content-type': 'application/json', 'x-workshop-token': server.token };
    const started = await send(server, '/api/jobs', { method: 'POST', headers, body: JSON.stringify({ kind: 'harness', exercise: '01' }) });
    expect(started.status).toBe(202);
    const job = JSON.parse(started.body);
    const second = await send(server, '/api/jobs', { method: 'POST', headers, body: JSON.stringify({ kind: 'harness', exercise: '01' }) });
    expect(second.status).toBe(409);
    const stream = await send(server, `/api/jobs/${job.id}/events`);
    expect(stream.headers['content-type']).toContain('text/event-stream');
    expect(stream.body).toContain('event: trace');
    expect(stream.body).toContain(`event: done\ndata: {"runId":"${fixture.baseline.runId}"}`);
    expect(harnessCalls).toBe(1);
  });

  it('refuses to replay synthetic recordings', async () => {
    const reply = await send(server, '/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json', 'x-workshop-token': server.token }, body: JSON.stringify({ kind: 'replay', exercise: '01' }) });
    expect(reply.status).toBe(404);
    expect(JSON.parse(reply.body).error.message).toMatch(/No genuine "baseline" recording/);
  });

  it('validates inputs', async () => {
    const headers = { 'content-type': 'application/json', 'x-workshop-token': server.token };
    expect((await send(server, '/api/jobs', { method: 'POST', headers, body: JSON.stringify({ kind: 'harness', exercise: '09' }) })).status).toBe(400);
    expect((await send(server, '/api/external/prepare', { method: 'POST', headers, body: JSON.stringify({ exercise: '01', agent: '../../etc' }) })).status).toBe(400);
    expect((await send(server, '/api/jobs', { method: 'POST', headers, body: '[1,2]' })).status).toBe(400);
  });
});
