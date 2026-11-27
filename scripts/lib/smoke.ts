import { APICallError, generateText, isStepCount, tool } from 'ai';
import { z } from 'zod';
import { hintFor, rootError } from '../../agent-harness/src/agent.ts';
import { createLanguageModel, resolveModelConfig } from '../../agent-harness/src/providers/index.ts';

const SMOKE_TIMEOUT_MS = 90_000;

/**
 * Live provider check: one tiny tool-calling round trip (a few hundred tokens).
 * Used by `npm run doctor -- --live` and `npm run smoke`.
 */
export async function smokeTestProvider(env: Record<string, string | undefined>): Promise<{ ok: boolean; detail: string; usage?: { inputTokens?: number; outputTokens?: number } }> {
  const { config, problems } = resolveModelConfig(env);
  if (!config || problems.length > 0) return { ok: false, detail: problems.map((p) => p.message).join('; ') };
  let called = false;
  try {
    const result = await generateText({
      model: createLanguageModel(config, env),
      prompt: 'Call the get_magic_number tool once, then reply with only the number it returned.',
      tools: {
        get_magic_number: tool({
          description: 'Returns the magic number.',
          inputSchema: z.object({}),
          execute: async () => {
            called = true;
            return { number: 4217 };
          },
        }),
      },
      stopWhen: isStepCount(3),
      // No retries: a quota or rate-limit error should be shown as it is, not waited out.
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(SMOKE_TIMEOUT_MS),
    });
    const ok = called && result.text.includes('4217');
    return {
      ok,
      detail: ok ? `${config.provider.id}/${config.modelId}: tool call round trip OK` : `${config.provider.id}/${config.modelId}: ${called ? 'tool called but answer was unexpected' : 'model did not call the tool'} (${result.text.slice(0, 80)})`,
      usage: { inputTokens: result.totalUsage.inputTokens, outputTokens: result.totalUsage.outputTokens },
    };
  } catch (error) {
    const root = rootError(error) as Error & { name?: string };
    const label = `${config.provider.id}/${config.modelId}`;
    if (root?.name === 'TimeoutError' || root?.name === 'AbortError') {
      return { ok: false, detail: `${label}: no answer within ${SMOKE_TIMEOUT_MS / 1000}s. The model may be overloaded, or not available to this key; try another MODEL_ID.` };
    }
    const status = APICallError.isInstance(root) && root.statusCode ? ` (HTTP ${root.statusCode})` : '';
    const hint = hintFor(root);
    return { ok: false, detail: `${label}${status}: ${String(root?.message ?? root).slice(0, 300)}${hint ? `\n  ${hint}` : ''}` };
  }
}
