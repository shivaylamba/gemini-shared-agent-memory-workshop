import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashSnapshot } from '../../evaluation/snapshot.ts';
import { writeAgentMcpConfig } from '../lib/external.ts';
import { buildLoreJson } from '../lib/openlore.ts';

const lore = { endpoint: 'http://localhost:7420', identity: 'claude-code-reader', scope: 'read' as const, token: 'test-token-value', remote: false };

describe('external agent MCP configuration', () => {
  it('writes each client\'s documented project config', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ext-'));
    writeAgentMcpConfig(dir, 'antigravity', lore);
    const antigravity = JSON.parse(readFileSync(join(dir, '.agents', 'mcp_config.json'), 'utf8'));
    expect(antigravity.mcpServers.openlore).toEqual({ serverUrl: 'http://localhost:7420/mcp', headers: { Authorization: 'Bearer test-token-value' } });

    writeAgentMcpConfig(dir, 'claude-code', lore);
    const claude = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf8'));
    expect(claude.mcpServers.openlore).toEqual({ type: 'http', url: 'http://localhost:7420/mcp', headers: { Authorization: 'Bearer ${OPENLORE_TOKEN}' } });
    expect(readFileSync(join(dir, '.mcp.json'), 'utf8')).not.toContain('test-token-value');

    writeAgentMcpConfig(dir, 'codex', lore);
    expect(readFileSync(join(dir, '.codex', 'config.toml'), 'utf8')).toBe('[mcp_servers.openlore]\nurl = "http://localhost:7420/mcp"\nbearer_token_env_var = "OPENLORE_TOKEN"\n');
  });

  it('keeps agent config out of the snapshot hash', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ext-hash-'));
    const before = hashSnapshot(dir);
    writeAgentMcpConfig(dir, 'claude-code', lore);
    writeAgentMcpConfig(dir, 'codex', lore);
    writeAgentMcpConfig(dir, 'antigravity', lore);
    expect(existsSync(join(dir, '.mcp.json'))).toBe(true);
    expect(hashSnapshot(dir)).toBe(before);
  });
});

describe('OpenLore policy', () => {
  it('lets agents publish only into the inbox and readers see only approved knowledge', () => {
    const policy = buildLoreJson() as { allow_keyless: boolean; unknown_identity: string; docsets: Record<string, { access: { allow: Record<string, string> } }>; identities: { name: string; roles: string[] }[] };
    expect(policy.allow_keyless).toBe(false);
    expect(policy.unknown_identity).toBe('deny');
    expect(policy.docsets.knowledge!.access.allow).toEqual({ reader: 'ro', contributor: 'ro', maintainer: 'rw' });
    expect(policy.docsets.proposals!.access.allow).toEqual({ contributor: 'publish', maintainer: 'rw' });
    expect(policy.docsets.proposals!.access.allow.reader).toBeUndefined();
    const names = policy.identities.map((i) => i.name);
    for (const agent of ['harness', 'antigravity', 'claude-code', 'codex', 'generic', 'partner']) {
      expect(names).toContain(`${agent}-capture`);
      expect(names).toContain(`${agent}-reader`);
    }
  });
});

describe('exported prompts', () => {
  it('match what the runner prints (run `npm run prompts:export` after editing prompts)', async () => {
    const { AGENT_PROMPT_DIRS, PROMPT_FILES, renderPromptFile } = await import('../export-prompts.ts');
    for (const agent of AGENT_PROMPT_DIRS) {
      for (const entry of PROMPT_FILES) {
        expect(readFileSync(join(import.meta.dirname, '..', '..', 'integrations', agent, 'prompts', entry.file), 'utf8'), `${agent}/${entry.file}`).toBe(renderPromptFile(entry));
      }
    }
  });
});
