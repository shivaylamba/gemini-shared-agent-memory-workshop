import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseNote, validateNote } from '../src/knowledge-format.ts';
import { instructionsFor, taskPrompt } from '../src/prompts.ts';
import { toolsFor } from '../src/tool-registry.ts';
import { validateKnowledgePath } from '../src/tools/openlore.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const CORE_APP = join(ROOT, 'core-app');

describe('prompts', () => {
  it('uses the exact same task prompt for the baseline and shared-memory sessions', () => {
    expect(taskPrompt('baseline')).toBe(taskPrompt('shared-memory'));
    expect(taskPrompt('baseline')).toBe("Implement the refund operation for the existing order and payment application. Follow the project's current conventions and existing architectural decisions. Inspect the codebase as needed. Run the tests before completing the task.");
  });

  it('differs between conditions only by the shared-memory guidance', () => {
    const baseline = instructionsFor('baseline', 'harness');
    const shared = instructionsFor('shared-memory', 'harness');
    expect(shared.startsWith(baseline)).toBe(true);
    expect(shared.slice(baseline.length)).toMatch(/shared knowledge repository/);
    expect(instructionsFor('baseline', 'external')).not.toMatch(/OpenLore/);
  });

  it('gives baseline and shared-memory the same local tools', () => {
    const names = (c: 'baseline' | 'shared-memory' | 'capture') => toolsFor(c).map((t) => t.name);
    expect(names('shared-memory').slice(0, names('baseline').length)).toEqual(names('baseline'));
    expect(names('shared-memory')).not.toContain('propose_knowledge');
    expect(names('capture')).not.toContain('write_file');
    expect(names('baseline').some((n) => n.includes('knowledge'))).toBe(false);
  });
});

describe('knowledge notes', () => {
  const note = readFileSync(join(ROOT, 'openlore', 'templates', 'knowledge-note.md'), 'utf8');

  it('accepts the template and parses list frontmatter', () => {
    expect(validateNote(note, { appRoot: CORE_APP })).toEqual([]);
    expect(parseNote(note)?.frontmatter.source).toEqual(['src/utils/idempotency.ts', 'docs/decisions/ADR-003-idempotent-requests.md']);
  });

  it('rejects missing sections, invented sources and credentials', () => {
    const issues = (text: string) => validateNote(text, { appRoot: CORE_APP }).filter((i) => i.level === 'error').map((i) => i.message).join(' | ');
    expect(issues(note.replace('## Rationale', '## Why'))).toMatch(/Rationale/);
    expect(issues(note.replace('src/utils/idempotency.ts,', 'src/utils/made-up.ts,'))).toMatch(/does not exist/);
    expect(issues(note.replace('Network failures', 'key AIzaSyA1234567890123456789012345 Network failures'))).toMatch(/credential/);
    expect(issues('# no frontmatter')).toMatch(/frontmatter/);
  });

  it('only allows reading Markdown under /knowledge', () => {
    expect(validateKnowledgePath('/knowledge/decisions/a.md', '/knowledge')).toBe('/knowledge/decisions/a.md');
    for (const bad of ['/proposals/inbox/a.md', '/knowledge/../proposals/a.md', '/knowledge/a.txt', 'knowledge/a.md', "/knowledge/a.md'; rm -r /"]) {
      expect(() => validateKnowledgePath(bad, '/knowledge'), bad).toThrow();
    }
  });
});
