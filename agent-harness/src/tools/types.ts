import type { z } from 'zod';
import type { OpenLoreClient } from '../openlore-client.ts';
import type { Tracer } from '../tracing.ts';
import type { Workspace } from '../workspace.ts';

export interface ToolContext {
  workspace: Workspace;
  tracer: Tracer;
  /** OpenLore client; only present in conditions that have shared memory. */
  lore?: OpenLoreClient;
  knowledgeRoot: string;
  proposalsDocset: string;
  /** Pristine application used to validate knowledge `source` references. */
  pristineAppRoot: string;
  state: { proposals: string[] };
}

export interface HarnessTool<Input = any> {
  name: string;
  description: string;
  inputSchema: z.ZodType<Input>;
  execute(input: Input, ctx: ToolContext): Promise<Record<string, unknown>>;
}

/** Errors thrown by tools are returned to the model as tool errors, not as crashes. */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolInputError';
  }
}

export function truncate(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: `${text.slice(0, maxChars)}\n… [truncated ${text.length - maxChars} characters]`, truncated: true };
}
