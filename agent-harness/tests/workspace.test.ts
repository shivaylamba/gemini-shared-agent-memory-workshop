import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Workspace, WorkspaceError } from '../src/workspace.ts';

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'ws-test-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src', 'a.ts'), 'export {}');
  writeFileSync(join(root, '.env'), 'GEMINI_API_KEY=secret');
  const outside = mkdtempSync(join(tmpdir(), 'ws-outside-'));
  writeFileSync(join(outside, 'data.txt'), 'nope');
  symlinkSync(outside, join(root, 'src', 'escape'));
  return { root, outside, ws: new Workspace(root) };
}

describe('Workspace', () => {
  it('reads files inside the workspace', () => {
    const { ws } = setup();
    expect(ws.resolveForRead('src/a.ts').rel).toBe('src/a.ts');
    expect(ws.resolveForRead('./src/a.ts').rel).toBe('src/a.ts');
  });

  it('rejects traversal, absolute and home paths', () => {
    const { ws } = setup();
    for (const bad of ['../x', 'src/../../etc/passwd', '/etc/passwd', 'C:\\Windows', '~/x', 'a\0b']) {
      expect(() => ws.resolveForRead(bad), bad).toThrow(WorkspaceError);
    }
  });

  it('rejects symlink escapes', () => {
    const { ws } = setup();
    expect(() => ws.resolveForRead('src/escape/data.txt')).toThrow(/outside the workspace/);
  });

  it('denies secrets and agent configuration', () => {
    const { ws } = setup();
    expect(() => ws.resolveForRead('.env')).toThrow(/not allowed/);
    for (const name of ['.env.local', 'node_modules/x', '.git/config', '.mcp.json', '.agents/mcp_config.json', 'solutions/x.ts']) {
      expect(ws.isDenied(name), name).toBe(true);
    }
  });

  it('only allows writing TypeScript under src/ and tests/', () => {
    const { ws } = setup();
    expect(ws.resolveForWrite('src/refunds/new.ts').rel).toBe('src/refunds/new.ts');
    expect(ws.resolveForWrite('tests/extra.test.ts').rel).toBe('tests/extra.test.ts');
    for (const bad of ['docs/x.md', 'package.json', 'src/x.js', '../src/x.ts', 'src/escape/x.ts', '.env']) {
      expect(() => ws.resolveForWrite(bad), bad).toThrow(WorkspaceError);
    }
  });
});
