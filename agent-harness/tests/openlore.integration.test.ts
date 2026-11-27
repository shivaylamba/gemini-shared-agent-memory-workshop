import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readLoreActivity } from '../../evaluation/openlore-events.ts';
import { buildLoreJson, findBinary, LOCK } from '../../scripts/lib/openlore.ts';
import { OpenLoreClient } from '../src/openlore-client.ts';
import { runHarnessExercise } from '../src/run.ts';
import { scriptedModel } from './scripted-model.ts';

/**
 * Integration test against the REAL pinned OpenLore binary (run `npm run setup` first).
 * Starts an isolated server in a temp directory on free ports.
 */
const ROOT = join(import.meta.dirname, '..', '..');
const binary = findBinary();

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, () => {
      const port = (server.address() as { port: number }).port;
      server.close(() => resolve(port));
    });
  });
}

let dir = '';
let http = 0;
let child: ChildProcess | undefined;
const tokens: Record<string, string> = {};

function mint(identity: string, scope: 'read' | 'full'): string {
  const result = spawnSync(binary!.path, ['token', 'mint', '--identity', identity, '--scope', scope, '--ttl', '1h', '--config', join(dir, 'openlore.yml')], { cwd: dir, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

const client = (identity: string) => new OpenLoreClient({ endpoint: `http://127.0.0.1:${http}`, token: tokens[identity]!, clientName: 'integration-test' });

const VALID_NOTE = `---
title: Refund idempotency
status: current
category: decisions
source: [src/utils/idempotency.ts, docs/decisions/ADR-003-idempotent-requests.md]
verified_at: 2026-11-27
tags: [refunds, idempotency]
---
# Refund idempotency
## Decision
Refunds use IdempotencyStore.run with a refund-specific scope. Keep $VARIABLES and \`code\` literal.
## Rationale
Clients retry after timeouts.
## Implementation guidance
Forward the same key to the provider.
## Source
- src/utils/idempotency.ts
`;

describe.skipIf(!binary || binary.version !== LOCK.version)(`OpenLore ${LOCK.version} integration`, () => {
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'openlore-it-'));
    http = await freePort();
    const ssh = await freePort();
    mkdirSync(join(dir, 'state'), { recursive: true });
    cpSync(join(ROOT, 'openlore', 'seed-knowledge'), join(dir, 'served'), { recursive: true });
    const template = readFileSync(join(ROOT, 'openlore', 'config', 'openlore.yml.template'), 'utf8');
    writeFileSync(join(dir, 'openlore.yml'), template.replaceAll('{{HTTP_PORT}}', String(http)).replaceAll('{{SSH_PORT}}', String(ssh)));
    writeFileSync(join(dir, 'lore.json'), JSON.stringify(buildLoreJson()));
    child = spawn(binary!.path, ['-c', join(dir, 'openlore.yml'), join(dir, 'served')], { cwd: dir, stdio: 'ignore' });
    for (let i = 0; i < 60; i++) {
      try {
        await fetch(`http://127.0.0.1:${http}/`);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    tokens['harness-capture'] = mint('harness-capture', 'full');
    tokens['harness-reader'] = mint('harness-reader', 'read');
    tokens['maintainer'] = mint('maintainer', 'full');
  });

  afterAll(() => {
    child?.kill();
  });

  it('rejects requests without a token', async () => {
    const response = await fetch(`http://127.0.0.1:${http}/api/shell`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command: 'ls /' }) });
    expect(response.status).toBe(401);
  });

  it('enforces the docset grants: readers see only /knowledge, contributors cannot edit it', async () => {
    const reader = client('harness-reader');
    expect((await reader.exec('lore docsets')).stdout).not.toContain('proposals');
    expect((await reader.exec('echo x > /knowledge/x.md')).exitCode).not.toBe(0);
    await reader.close();
    const capture = client('harness-capture');
    expect((await capture.exec('echo x > /knowledge/x.md')).stderr).toMatch(/read-only/);
    await capture.close();
  });

  it('captures knowledge through the harness into the inbox, then a maintainer promotes it', async () => {
    const lore = client('harness-capture');
    const base = mkdtempSync(join(tmpdir(), 'it-runs-'));
    const model = scriptedModel([
      { calls: [{ name: 'list_knowledge', input: {} }, { name: 'read_file', input: { path: 'src/utils/idempotency.ts' } }] },
      { calls: [{ name: 'propose_knowledge', input: { slug: 'refund-idempotency', content: VALID_NOTE } }, { name: 'propose_knowledge', input: { slug: 'bad-note', content: '# no frontmatter' } }] },
      { text: 'Published one note.' },
    ]);
    const outcome = await runHarnessExercise({
      exercise: '02', condition: 'capture', model, provider: 'scripted', modelId: 'synthetic', secrets: [tokens['harness-capture']],
      budgets: { maxModelRequests: 10, maxToolCalls: 10, maxRuntimeMs: 60_000 },
      lore: { client: lore, identity: 'harness-capture', scope: 'full', endpoint: `http://127.0.0.1:${http}` },
      runsDir: join(base, 'runs'), workspacesDir: join(base, 'ws'),
    });
    await lore.close();
    expect(outcome.result.metrics.values.proposalsPublished).toBe(1);
    expect(outcome.result.metrics.values.toolErrors).toBe(1); // the invalid note was rejected before publishing
    expect(outcome.result.knowledge?.proposed).toEqual(['/proposals/inbox/refund-idempotency.md']);
    expect(readFileSync(join(outcome.runDir, 'events.jsonl'), 'utf8')).not.toContain(tokens['harness-capture']!);

    const maintainer = client('maintainer');
    const stored = await maintainer.exec('cat /proposals/inbox/refund-idempotency.md');
    expect(stored.stdout).toBe(VALID_NOTE);
    expect((await maintainer.exec('lore history /proposals/inbox/refund-idempotency.md')).stdout).toContain('"attribution":"harness-capture"');
    expect((await maintainer.exec('mkdir -p /knowledge/decisions')).exitCode).toBe(0);
    expect((await maintainer.exec('mv /proposals/inbox/refund-idempotency.md /knowledge/decisions/refund-idempotency.md')).exitCode).toBe(0);
    expect((await maintainer.exec("lore meta set /knowledge/decisions/refund-idempotency.md 'proposed_by=harness-capture'")).exitCode).toBe(0);
    const history = (await maintainer.exec('lore history /knowledge/decisions/refund-idempotency.md')).stdout;
    expect(history).toContain('"action":"move"');
    expect(history).toContain('"attribution":"harness-capture"');
    await maintainer.close();
  });

  it('a fresh shared-memory session retrieves the reviewed note, and OpenLore logs the read', async () => {
    const since = new Date(Date.now() - 1000);
    const lore = client('harness-reader');
    const base = mkdtempSync(join(tmpdir(), 'it-runs-'));
    const model = scriptedModel([
      { calls: [{ name: 'search_knowledge', input: { query: 'idempotency' } }] },
      { calls: [{ name: 'read_knowledge', input: { path: '/knowledge/decisions/refund-idempotency.md' } }, { name: 'read_knowledge', input: { path: '/proposals/inbox/x.md' } }] },
      { text: 'done' },
    ]);
    const outcome = await runHarnessExercise({
      exercise: '03', condition: 'shared-memory', model, provider: 'scripted', modelId: 'synthetic', secrets: [],
      budgets: { maxModelRequests: 10, maxToolCalls: 10, maxRuntimeMs: 60_000 },
      lore: { client: lore, identity: 'harness-reader', scope: 'read', endpoint: `http://127.0.0.1:${http}` },
      runsDir: join(base, 'runs'), workspacesDir: join(base, 'ws'),
    });
    await lore.close();
    expect(outcome.result.knowledge?.read).toEqual(['/knowledge/decisions/refund-idempotency.md']);
    expect(outcome.result.metrics.values.knowledgeSearches).toBe(1);
    expect(outcome.result.metrics.values.knowledgeReads).toBe(1);
    expect(outcome.result.metrics.values.toolErrors).toBe(1); // reading outside /knowledge is refused
    expect(readFileSync(join(outcome.runDir, 'knowledge', 'knowledge', 'decisions', 'refund-idempotency.md'), 'utf8')).toContain('proposed_by: harness-capture');

    await new Promise((r) => setTimeout(r, 1500));
    const activity = readLoreActivity(join(dir, 'state', 'data', 'analytics'), 'harness-reader', since);
    expect(activity.available).toBe(true);
    expect(activity.reads.map((r) => r.path)).toContain('/knowledge/decisions/refund-idempotency.md');
    expect(activity.searches.length).toBeGreaterThan(0);
  });
});
