import type { Condition } from './prompts.ts';
import { listFiles } from './tools/list-files.ts';
import { listKnowledge, proposeKnowledge, readKnowledge, searchKnowledge } from './tools/openlore.ts';
import { readFile } from './tools/read-file.ts';
import { runTests } from './tools/run-tests.ts';
import { searchFiles } from './tools/search-files.ts';
import type { HarnessTool } from './tools/types.ts';
import { writeFile } from './tools/write-file.ts';

const LOCAL_READ = [listFiles, readFile, searchFiles];
const LOCAL_WRITE = [writeFile, runTests];
const KNOWLEDGE_READ = [listKnowledge, searchKnowledge, readKnowledge];

/**
 * Tools per condition. Baseline and shared-memory get identical local tools;
 * shared-memory only adds read-only knowledge tools. Capture cannot edit code.
 */
export function toolsFor(condition: Condition): HarnessTool[] {
  switch (condition) {
    case 'baseline':
      return [...LOCAL_READ, ...LOCAL_WRITE];
    case 'shared-memory':
      return [...LOCAL_READ, ...LOCAL_WRITE, ...KNOWLEDGE_READ];
    case 'capture':
      return [...LOCAL_READ, ...KNOWLEDGE_READ, proposeKnowledge];
  }
}

export function needsOpenLore(condition: Condition): boolean {
  return condition !== 'baseline';
}
