import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXERCISES_DIR } from '../../scripts/lib/paths.ts';

export type Condition = 'baseline' | 'capture' | 'shared-memory';
export type Surface = 'harness' | 'external';

/** Extracts the fenced block with the given info string (```prompt, ```prompt-harness, ...). */
export function readPromptBlock(file: string, tag = 'prompt'): string {
  const text = readFileSync(file, 'utf8');
  const fence = new RegExp('```' + tag + '\\r?\\n([\\s\\S]*?)\\r?\\n```(?!\\S)', 'm');
  const match = fence.exec(text);
  if (!match) throw new Error(`No \`\`\`${tag} block in ${file}`);
  return match[1]!.trim();
}

const shared = (name: string) => join(EXERCISES_DIR, 'shared', name);

export function taskPrompt(condition: Condition): string {
  const exercise = condition === 'capture' ? '02-capture-knowledge' : condition === 'baseline' ? '01-amnesiac-agent' : '03-share-knowledge';
  return readPromptBlock(join(EXERCISES_DIR, exercise, 'task.md'));
}

/**
 * Instructions given before the task. Baseline and shared-memory differ only by
 * the shared-memory guidance paragraph (plus the knowledge tools themselves).
 */
export function instructionsFor(condition: Condition, surface: Surface): string {
  const parts = [readPromptBlock(shared('conventions.md'))];
  if (surface === 'harness') parts.push('Use only the provided tools to inspect and change the repository.');
  if (condition === 'shared-memory') {
    parts.push(readPromptBlock(shared('shared-memory.md')));
    parts.push(readPromptBlock(shared('shared-memory.md'), `prompt-${surface}`));
  }
  if (condition === 'capture') {
    parts.push(readPromptBlock(shared('capture.md')));
    parts.push(readPromptBlock(shared('capture.md'), `prompt-${surface}`));
  }
  return parts.join('\n\n');
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
