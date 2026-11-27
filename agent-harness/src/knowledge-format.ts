import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Workshop-defined Markdown convention for shared knowledge notes. This is a
 * convention enforced by the workshop tools, not a native OpenLore schema.
 */
export const REQUIRED_FIELDS = ['title', 'status', 'category', 'source', 'verified_at', 'tags'] as const;
export const REQUIRED_SECTIONS = ['Decision', 'Rationale', 'Implementation guidance', 'Source'] as const;
export const CATEGORIES = ['architecture', 'decisions', 'runbooks'] as const;
export const STATUSES = ['current', 'superseded', 'draft'] as const;
export const MAX_NOTE_BYTES = 8_000;

export type Frontmatter = Record<string, string | string[]>;

export interface ParsedNote {
  frontmatter: Frontmatter;
  body: string;
}

/** Minimal YAML-subset parser: `key: value`, `key: [a, b]` and block lists (`- item`). */
export function parseNote(markdown: string): ParsedNote | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(markdown);
  if (!match) return undefined;
  const frontmatter: Frontmatter = {};
  let currentListKey: string | undefined;
  for (const rawLine of match[1]!.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
    const item = /^\s+-\s+(.*)$/.exec(rawLine);
    if (item && currentListKey) {
      (frontmatter[currentListKey] as string[]).push(unquote(item[1]!));
      continue;
    }
    const kv = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(rawLine);
    if (!kv) continue;
    const key = kv[1]!;
    const value = kv[2]!.trim();
    if (value === '') {
      frontmatter[key] = [];
      currentListKey = key;
    } else if (value.startsWith('[') && value.endsWith(']')) {
      frontmatter[key] = value.slice(1, -1).split(',').map((v) => unquote(v.trim())).filter(Boolean);
      currentListKey = undefined;
    } else {
      frontmatter[key] = unquote(value);
      currentListKey = undefined;
    }
  }
  return { frontmatter, body: match[2] ?? '' };
}

function unquote(value: string): string {
  return value.replace(/^["'](.*)["']$/, '$1');
}

export function asList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : value.split(',').map((v) => v.trim()).filter(Boolean);
}

export interface NoteIssue {
  level: 'error' | 'warning';
  message: string;
}

const SECRET_SHAPES = [/AIza[0-9A-Za-z_-]{20,}/, /\bAQ\.[0-9A-Za-z_-]{30,}/, /sk-[A-Za-z0-9_-]{16,}/, /Bearer\s+[A-Za-z0-9._-]{12,}/, /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];

/**
 * Validates a proposed note. `appRoot` (optional) checks that every `source`
 * path exists in the application, so provenance can be verified.
 */
export function validateNote(markdown: string, options: { appRoot?: string } = {}): NoteIssue[] {
  const issues: NoteIssue[] = [];
  const bytes = Buffer.byteLength(markdown, 'utf8');
  if (bytes > MAX_NOTE_BYTES) issues.push({ level: 'error', message: `note is ${bytes} bytes; keep it under ${MAX_NOTE_BYTES}` });
  for (const pattern of SECRET_SHAPES) {
    if (pattern.test(markdown)) issues.push({ level: 'error', message: 'note appears to contain a credential or key' });
  }
  const parsed = parseNote(markdown);
  if (!parsed) {
    issues.push({ level: 'error', message: 'missing YAML frontmatter block (--- ... ---) at the top' });
    return issues;
  }
  const fm = parsed.frontmatter;
  for (const field of REQUIRED_FIELDS) {
    const value = fm[field];
    if (value === undefined || (Array.isArray(value) ? value.length === 0 : value === '')) {
      issues.push({ level: 'error', message: `frontmatter field "${field}" is required` });
    }
  }
  if (typeof fm.status === 'string' && !(STATUSES as readonly string[]).includes(fm.status)) {
    issues.push({ level: 'error', message: `status must be one of ${STATUSES.join(', ')}` });
  }
  if (typeof fm.category === 'string' && !(CATEGORIES as readonly string[]).includes(fm.category)) {
    issues.push({ level: 'error', message: `category must be one of ${CATEGORIES.join(', ')}` });
  }
  if (typeof fm.verified_at === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(fm.verified_at)) {
    issues.push({ level: 'error', message: 'verified_at must be a date like 2026-12-09' });
  }
  for (const section of REQUIRED_SECTIONS) {
    if (!new RegExp(`^##\\s+${section}\\s*$`, 'mi').test(parsed.body)) {
      issues.push({ level: 'error', message: `missing section "## ${section}"` });
    }
  }
  if (options.appRoot) {
    for (const source of asList(fm.source)) {
      const path = source.replace(/^`|`$/g, '').split('#')[0]!.trim();
      if (!path || /^https?:/.test(path)) continue;
      if (path.includes('..') || path.startsWith('/') || !existsSync(join(options.appRoot, path))) {
        issues.push({ level: 'error', message: `source "${path}" does not exist in the application` });
      }
    }
  }
  if (/\b(user|assistant|model)\s*:\s/i.test(parsed.body) && /\b(tool_call|function_call|I will now|Let me)\b/i.test(parsed.body)) {
    issues.push({ level: 'warning', message: 'note looks like copied conversation text; keep only durable knowledge' });
  }
  return issues;
}

export function slugIsValid(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{2,60}$/.test(slug);
}
