import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceError';
  }
}

/** Path segments and file names agents may never read or write. */
const DENIED_SEGMENTS = new Set(['.git', 'node_modules', '.agents', '.codex', '.claude', '.workshop', 'solutions', 'recordings', 'runs', 'evaluation']);
const DENIED_FILE_PATTERNS = [/^\.env($|\.)/i, /\.pem$/i, /\.key$/i, /^id_(rsa|ed25519|ecdsa)/i, /^\.mcp\.json$/i, /^\.workshop-run\.json$/i, /secret/i, /credential/i];

/** Writable areas and file types (identical for every condition). */
const WRITABLE_PREFIXES = ['src/', 'tests/'];
const WRITABLE_EXTENSIONS = ['.ts'];

/**
 * Confines file operations to one directory. Every path is relative to the
 * workspace root; traversal, absolute paths, symlink escapes and sensitive
 * files are rejected.
 */
export class Workspace {
  readonly root: string;

  constructor(root: string) {
    this.root = realpathSync(resolve(root));
  }

  /** Normalises an agent-supplied relative path ("" or "." means the root). */
  normalise(input: string): string {
    if (typeof input !== 'string') throw new WorkspaceError('path must be a string');
    if (input.includes('\0')) throw new WorkspaceError('path contains a NUL byte');
    let path = input.trim().replace(/\\/g, '/');
    if (path.startsWith('~')) throw new WorkspaceError('home-relative paths are not allowed');
    if (isAbsolute(path) || /^[A-Za-z]:/.test(path) || path.startsWith('/')) {
      throw new WorkspaceError('use a path relative to the repository root (absolute paths are not allowed)');
    }
    path = path.replace(/^\.\/+/, '');
    if (path === '.' ) path = '';
    const segments = path.split('/').filter((s) => s !== '' && s !== '.');
    if (segments.some((s) => s === '..')) throw new WorkspaceError('".." is not allowed in paths');
    return segments.join('/');
  }

  isDenied(relPath: string): boolean {
    const segments = relPath.split('/').filter(Boolean);
    if (segments.some((s) => DENIED_SEGMENTS.has(s))) return true;
    const name = segments.at(-1) ?? '';
    return DENIED_FILE_PATTERNS.some((pattern) => pattern.test(name));
  }

  /** Resolves an existing file or directory for reading. */
  resolveForRead(input: string): { abs: string; rel: string } {
    const rel = this.normalise(input);
    if (this.isDenied(rel)) throw new WorkspaceError(`access to "${rel}" is not allowed`);
    const abs = join(this.root, rel);
    if (!existsSync(abs)) throw new WorkspaceError(`"${rel || '.'}" does not exist`);
    this.assertInside(realpathSync(abs), rel);
    return { abs, rel };
  }

  /** Resolves a path for writing: only TypeScript files under src/ or tests/. */
  resolveForWrite(input: string): { abs: string; rel: string } {
    const rel = this.normalise(input);
    if (!rel) throw new WorkspaceError('a file path is required');
    if (this.isDenied(rel)) throw new WorkspaceError(`writing "${rel}" is not allowed`);
    if (!WRITABLE_PREFIXES.some((prefix) => rel.startsWith(prefix))) {
      throw new WorkspaceError(`you may only write files under ${WRITABLE_PREFIXES.join(' or ')}`);
    }
    if (!WRITABLE_EXTENSIONS.some((ext) => rel.endsWith(ext))) {
      throw new WorkspaceError(`you may only write ${WRITABLE_EXTENSIONS.join(', ')} files`);
    }
    const abs = join(this.root, rel);
    if (existsSync(abs)) {
      if (lstatSync(abs).isSymbolicLink()) throw new WorkspaceError(`"${rel}" is a symbolic link`);
      this.assertInside(realpathSync(abs), rel);
    } else {
      // The nearest existing ancestor must be inside the workspace.
      let ancestor = dirname(abs);
      while (!existsSync(ancestor)) ancestor = dirname(ancestor);
      this.assertInside(realpathSync(ancestor), rel);
    }
    return { abs, rel };
  }

  relativeOf(abs: string): string {
    return relative(this.root, abs).split(sep).join('/');
  }

  private assertInside(realAbs: string, rel: string): void {
    const relToRoot = relative(this.root, realAbs);
    if (relToRoot.startsWith('..') || isAbsolute(relToRoot)) {
      throw new WorkspaceError(`"${rel}" resolves outside the workspace`);
    }
  }
}
