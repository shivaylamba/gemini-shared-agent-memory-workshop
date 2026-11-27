import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { HarnessTool } from './types.ts';

const MAX_ENTRIES = 300;

export const listFiles: HarnessTool<{ path?: string; maxDepth?: number }> = {
  name: 'list_files',
  description: 'List files and directories in the repository (relative paths; directories end with "/").',
  inputSchema: z.object({
    path: z.string().optional().describe('Directory relative to the repository root. Defaults to the root.'),
    maxDepth: z.number().int().min(1).max(6).optional().describe('How many directory levels to descend (default 3).'),
  }),
  async execute(input, ctx) {
    const { abs, rel } = ctx.workspace.resolveForRead(input.path ?? '.');
    const maxDepth = input.maxDepth ?? 3;
    const entries: string[] = [];
    let truncated = false;
    const walk = (dir: string, relDir: string, depth: number) => {
      for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
        if (ctx.workspace.isDenied(relPath) || entry.isSymbolicLink()) continue;
        if (entries.length >= MAX_ENTRIES) {
          truncated = true;
          return;
        }
        entries.push(entry.isDirectory() ? `${relPath}/` : relPath);
        if (entry.isDirectory() && depth < maxDepth) walk(join(dir, entry.name), relPath, depth + 1);
      }
    };
    walk(abs, rel, 1);
    return { path: rel || '.', entries, truncated };
  },
};
