import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ToolInputError, type HarnessTool } from './types.ts';

const MAX_MATCHES = 80;
const MAX_FILE_BYTES = 512_000;

export const searchFiles: HarnessTool<{ query: string; path?: string; regex?: boolean }> = {
  name: 'search_files',
  description: 'Search file contents in the repository (case-insensitive). Returns "path:line: text" matches.',
  inputSchema: z.object({
    query: z.string().min(1).max(200).describe('Text to search for (or a regular expression when regex is true).'),
    path: z.string().optional().describe('Limit the search to this directory or file (relative path).'),
    regex: z.boolean().optional(),
  }),
  async execute(input, ctx) {
    const { abs, rel } = ctx.workspace.resolveForRead(input.path ?? '.');
    let matcher: (line: string) => boolean;
    if (input.regex) {
      let pattern: RegExp;
      try {
        pattern = new RegExp(input.query, 'i');
      } catch (error) {
        throw new ToolInputError(`invalid regular expression: ${(error as Error).message}`);
      }
      matcher = (line) => pattern.test(line);
    } else {
      const needle = input.query.toLowerCase();
      matcher = (line) => line.toLowerCase().includes(needle);
    }

    const matches: string[] = [];
    let filesSearched = 0;
    let truncated = false;
    const visit = (absPath: string, relPath: string) => {
      if (truncated) return;
      const stat = statSync(absPath);
      if (stat.isDirectory()) {
        for (const entry of readdirSync(absPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
          const childRel = relPath ? `${relPath}/${entry.name}` : entry.name;
          if (ctx.workspace.isDenied(childRel) || entry.isSymbolicLink()) continue;
          visit(join(absPath, entry.name), childRel);
        }
        return;
      }
      if (stat.size > MAX_FILE_BYTES) return;
      const raw = readFileSync(absPath);
      if (raw.includes(0)) return;
      filesSearched++;
      const lines = raw.toString('utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (matcher(lines[i]!)) {
          if (matches.length >= MAX_MATCHES) {
            truncated = true;
            return;
          }
          matches.push(`${relPath}:${i + 1}: ${lines[i]!.trim().slice(0, 200)}`);
        }
      }
    };
    visit(abs, rel);
    ctx.tracer.emit('file.search', { query: input.query, path: rel || '.', matches: matches.length, filesSearched });
    return { query: input.query, matches, truncated, filesSearched };
  },
};
