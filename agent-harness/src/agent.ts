import { APICallError, generateText, isStepCount, RetryError, tool, type LanguageModel, type ToolSet } from 'ai';
import { isDailyQuota, pacedModel, type PacingOptions } from './pacing.ts';
import type { HarnessTool, ToolContext } from './tools/types.ts';

export interface Budgets {
  maxModelRequests: number;
  maxToolCalls: number;
  maxRuntimeMs: number;
}

export type AgentStatus = 'completed' | 'budget_exhausted' | 'timeout' | 'failed';

export interface AgentRunResult {
  status: AgentStatus;
  finalText: string;
  steps: number;
  toolCalls: number;
  error?: { message: string; statusCode?: number; hint?: string };
}

export interface AgentRunOptions {
  model: LanguageModel;
  instructions: string;
  prompt: string;
  tools: HarnessTool[];
  ctx: ToolContext;
  budgets: Budgets;
  /** Provider-call retries handled by the AI SDK (default 2). */
  maxRetries?: number;
  /** Rate-limit handling; see pacing.ts. Waits are traced as model.wait events. */
  pacing?: Omit<PacingOptions, 'onWait'>;
}

/** Keeps large tool inputs (file contents, notes) out of the trace; they are stored as artifacts instead. */
function summariseInput(name: string, input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (typeof value === 'string' && (key === 'content' || value.length > 500)) out[key] = `<${Buffer.byteLength(value)} bytes>`;
    else out[key] = value;
  }
  if (name === 'write_file' || name === 'propose_knowledge') out.bytes = Buffer.byteLength(String(input?.content ?? ''));
  return out;
}

/** The SDK wraps the final failure in a RetryError after exhausting retries. */
export function rootError(error: unknown): unknown {
  return RetryError.isInstance(error) ? (error.lastError ?? error) : error;
}

export function hintFor(error: unknown): string | undefined {
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 401 || error.statusCode === 403) return 'The provider rejected the credential. Check the API key for MODEL_PROVIDER in .env.';
    if (error.statusCode === 404) return 'The model was not found. Check MODEL_ID for your provider.';
    if (error.statusCode === 429 && isDailyQuota(error)) {
      return 'Daily quota used up (Gemini free tier: about 20 requests per day on 3.x Flash; quotas reset at midnight Pacific time). Use gemini-3.5-flash-lite (the default; a much larger free daily quota), a paid key, Antigravity, or --mode replay.';
    }
    if (error.statusCode === 429) return 'Rate limit or quota exhausted. Wait, switch provider/model, or use replay mode (--mode replay).';
  }
  return undefined;
}

/**
 * A bounded tool-calling loop on the Vercel AI SDK. One call = one fresh session:
 * no conversation history from any earlier run is passed in.
 */
export async function runAgent(options: AgentRunOptions): Promise<AgentRunResult> {
  const { ctx, budgets } = options;
  const { tracer } = ctx;
  let toolCalls = 0;
  let callSeq = 0;
  let steps = 0;
  let lastFinishReason: string | undefined;
  let finalText = '';

  const toolSet: ToolSet = {};
  for (const harnessTool of options.tools) {
    toolSet[harnessTool.name] = tool({
      description: harnessTool.description,
      inputSchema: harnessTool.inputSchema,
      execute: async (input: any) => {
        const callId = `call-${++callSeq}`;
        toolCalls++;
        tracer.emit('tool.call', { callId, name: harnessTool.name, input: summariseInput(harnessTool.name, input) });
        if (toolCalls > budgets.maxToolCalls) {
          const message = `Tool-call budget (${budgets.maxToolCalls}) exhausted. Stop calling tools and give your final summary.`;
          tracer.emit('tool.result', { callId, name: harnessTool.name, ok: false, durationMs: 0, error: message, budgetExceeded: true });
          throw new Error(message);
        }
        const started = Date.now();
        try {
          const output = await harnessTool.execute(input, ctx);
          tracer.emit('tool.result', { callId, name: harnessTool.name, ok: true, durationMs: Date.now() - started, outputBytes: Buffer.byteLength(JSON.stringify(output)) });
          return output;
        } catch (error) {
          const message = (error as Error).message ?? String(error);
          tracer.emit('tool.result', { callId, name: harnessTool.name, ok: false, durationMs: Date.now() - started, error: message.slice(0, 1000) });
          throw error;
        }
      },
    });
  }

  // The runtime budget counts working time: time spent waiting for a provider's
  // rate limit extends the deadline, so free-tier sessions are not cut short.
  const abort = new AbortController();
  let deadline = Date.now() + budgets.maxRuntimeMs;
  const timer = setInterval(() => {
    if (Date.now() > deadline) abort.abort(new Error('runtime budget exhausted'));
  }, 250);

  try {
    const model =
      typeof options.model === 'string'
        ? options.model
        : pacedModel(options.model, {
            ...options.pacing,
            onWait: (info) => {
              deadline += info.waitMs;
              tracer.emit('model.wait', info);
            },
          });
    const result = await generateText({
      model,
      instructions: options.instructions,
      prompt: options.prompt,
      tools: toolSet,
      stopWhen: [isStepCount(budgets.maxModelRequests), () => toolCalls > budgets.maxToolCalls],
      abortSignal: abort.signal,
      maxRetries: options.maxRetries ?? 2,
      onStepEnd: (step) => {
        steps++;
        lastFinishReason = step.finishReason;
        const usage = step.usage;
        tracer.emit('model.step', {
          step: step.stepNumber,
          finishReason: step.finishReason,
          modelId: step.response?.modelId ?? null,
          toolCalls: step.toolCalls.map((call) => call.toolName),
          text: (step.text ?? '').slice(0, 600),
          usage: {
            inputTokens: usage?.inputTokens ?? null,
            outputTokens: usage?.outputTokens ?? null,
            reasoningTokens: usage?.outputTokenDetails?.reasoningTokens ?? null,
            cachedInputTokens: usage?.inputTokenDetails?.cacheReadTokens ?? null,
            totalTokens: usage?.totalTokens ?? null,
          },
        });
      },
    });
    finalText = result.text;
    const stoppedEarly = lastFinishReason === 'tool-calls';
    return { status: stoppedEarly ? 'budget_exhausted' : 'completed', finalText, steps, toolCalls };
  } catch (error) {
    if (abort.signal.aborted) return { status: 'timeout', finalText, steps, toolCalls, error: { message: 'Runtime budget exhausted' } };
    const root = rootError(error);
    const statusCode = APICallError.isInstance(root) ? root.statusCode : undefined;
    return {
      status: 'failed',
      finalText,
      steps,
      toolCalls,
      error: { message: tracer.redactText((root as Error).message ?? String(root)).slice(0, 2000), statusCode, hint: hintFor(root) },
    };
  } finally {
    clearInterval(timer);
  }
}
