import { readFileSync, statSync } from 'node:fs';
import { z } from 'zod';
import { ToolInputError, type HarnessTool } from './types.ts';

const MAX_LINES = 400;
const MAX_BYTES = 48_000;

export const readFile: HarnessTool<{ path: string; startLine?: number; endLine?: number }> = {
  name: 'read_file',
  description: `Read a text file from the repository. Returns at most ${MAX_LINES} lines per call; use startLine/endLine for long files.`,
  inputSchema: z.object({
    path: z.string().describe('File path relative to the repository root, e.g. "src/app.ts".'),
    startLine: z.number().int().min(1).optional(),
    endLine: z.number().int().min(1).optional(),
  }),
  async execute(input, ctx) {
    const { abs, rel } = ctx.workspace.resolveForRead(input.path);
    if (statSync(abs).isDirectory()) throw new ToolInputError(`"${rel}" is a directory; use list_files`);
    const raw = readFileSync(abs);
    if (raw.includes(0)) throw new ToolInputError(`"${rel}" looks like a binary file`);
    const lines = raw.toString('utf8').split('\n');
    const start = Math.min(input.startLine ?? 1, lines.length);
    const end = Math.min(input.endLine ?? start + MAX_LINES - 1, start + MAX_LINES - 1, lines.length);
    let content = lines.slice(start - 1, end).join('\n');
    let truncated = end < lines.length;
    if (Buffer.byteLength(content) > MAX_BYTES) {
      content = content.slice(0, MAX_BYTES);
      truncated = true;
    }
    const bytes = Buffer.byteLength(content);
    ctx.tracer.emit('file.read', { path: rel, bytes, startLine: start, endLine: end, totalLines: lines.length });
    return { path: rel, startLine: start, endLine: end, totalLines: lines.length, truncated, content };
  },
};
