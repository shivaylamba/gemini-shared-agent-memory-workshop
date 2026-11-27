import './lib/load-env.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { instructionsFor, taskPrompt, type Condition } from '../agent-harness/src/prompts.ts';
import { ROOT } from './lib/paths.ts';

/**
 * Writes the copyable external-agent prompts into integrations/<agent>/prompts/.
 * They are assembled from exercises/shared/*.md and exercises/<nn>/task.md, exactly as
 * `npm run exercise -- <nn> --mode external` prints them. A unit test keeps them in sync.
 */
export const PROMPT_FILES: { file: string; exercise: string; condition: Condition; title: string }[] = [
  { file: '01-baseline.md', exercise: '01', condition: 'baseline', title: 'Exercise 01: baseline (no OpenLore)' },
  { file: '02-capture.md', exercise: '02', condition: 'capture', title: 'Exercise 02: capture knowledge (OpenLore publish access)' },
  { file: '03-shared-memory.md', exercise: '03', condition: 'shared-memory', title: 'Exercise 03: shared memory (OpenLore read access)' },
];

export const AGENT_PROMPT_DIRS = ['antigravity', 'claude-code', 'codex'];

export function renderPromptFile(entry: (typeof PROMPT_FILES)[number]): string {
  return `# ${entry.title}\n\nPrepare a clean workspace first: \`npm run exercise -- ${entry.exercise} --mode external --agent <agent>\`.\nStart a NEW session in that workspace and paste everything inside the block below.\n\n\`\`\`text\n${instructionsFor(entry.condition, 'external')}\n\n${taskPrompt(entry.condition)}\n\`\`\`\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const agent of AGENT_PROMPT_DIRS) {
    const dir = join(ROOT, 'integrations', agent, 'prompts');
    mkdirSync(dir, { recursive: true });
    for (const entry of PROMPT_FILES) writeFileSync(join(dir, entry.file), renderPromptFile(entry));
  }
  console.log(`Wrote ${PROMPT_FILES.length} prompts for ${AGENT_PROMPT_DIRS.join(', ')}.`);
}
