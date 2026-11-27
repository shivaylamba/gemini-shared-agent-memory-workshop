import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { ToolInputError, type HarnessTool } from './types.ts';

const MAX_BYTES = 100_000;

export const writeFile: HarnessTool<{ path: string; content: string }> = {
  name: 'write_file',
  description: 'Create or overwrite a TypeScript file under src/ or tests/ with the complete new content.',
  inputSchema: z.object({
    path: z.string().describe('File path relative to the repository root, e.g. "src/refunds/refund-service.ts".'),
    content: z.string().describe('The complete file content.'),
  }),
  async execute(input, ctx) {
    const bytes = Buffer.byteLength(input.content, 'utf8');
    if (bytes > MAX_BYTES) throw new ToolInputError(`content is ${bytes} bytes; the limit is ${MAX_BYTES}`);
    const { abs, rel } = ctx.workspace.resolveForWrite(input.path);
    const action = existsSync(abs) ? 'modified' : 'added';
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, input.content);
    ctx.tracer.emit('file.write', { path: rel, bytes, action });
    return { path: rel, bytes, action };
  },
};
