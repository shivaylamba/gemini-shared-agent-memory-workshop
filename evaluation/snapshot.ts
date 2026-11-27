import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

/** Directories and files never treated as part of an application snapshot. */
const EXCLUDED = new Set(['node_modules', '.git', '.agents', '.codex', '.claude', '.mcp.json', '.workshop-run.json', '.DS_Store', 'AGENTS.md', 'CLAUDE.md']);

export interface SnapshotFile {
  path: string; // POSIX-style relative path
  sha256: string;
  bytes: number;
}

export function listSnapshotFiles(root: string): SnapshotFile[] {
  const files: SnapshotFile[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (EXCLUDED.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const content = readFileSync(full);
        files.push({
          path: relative(root, full).split(sep).join('/'),
          sha256: createHash('sha256').update(content).digest('hex'),
          bytes: content.length,
        });
      }
    }
  };
  walk(root);
  return files;
}

/** Content hash of an application tree: identical trees always hash identically. */
export function hashSnapshot(root: string): string {
  const hash = createHash('sha256');
  for (const file of listSnapshotFiles(root)) hash.update(`${file.path}\0${file.sha256}\n`);
  return hash.digest('hex');
}

/** Replaces `dest` with a fresh copy of `source` (excluding node_modules, VCS and agent config). */
export function copySnapshot(source: string, dest: string): void {
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(source, dest, {
    recursive: true,
    filter: (src) => {
      const name = src.split(/[\\/]/).pop() ?? '';
      if (EXCLUDED.has(name)) return false;
      try {
        return !lstatSync(src).isSymbolicLink();
      } catch {
        return false;
      }
    },
  });
}

export interface FileChange {
  path: string;
  action: 'added' | 'modified' | 'deleted';
  /** Final content for added/modified files (UTF-8). */
  content?: string;
}

/** Lists file-level changes between a pristine snapshot and a workspace. */
export function diffSnapshots(pristineRoot: string, workspaceRoot: string): FileChange[] {
  const before = new Map(listSnapshotFiles(pristineRoot).map((f) => [f.path, f]));
  const after = new Map(listSnapshotFiles(workspaceRoot).map((f) => [f.path, f]));
  const changes: FileChange[] = [];
  for (const [path, file] of after) {
    const previous = before.get(path);
    if (!previous) changes.push({ path, action: 'added', content: readFileSync(join(workspaceRoot, path), 'utf8') });
    else if (previous.sha256 !== file.sha256) changes.push({ path, action: 'modified', content: readFileSync(join(workspaceRoot, path), 'utf8') });
  }
  for (const path of before.keys()) if (!after.has(path)) changes.push({ path, action: 'deleted' });
  return changes.sort((a, b) => a.path.localeCompare(b.path));
}
