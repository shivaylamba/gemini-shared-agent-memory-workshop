import { MockLanguageModelV4 } from 'ai/test';

/**
 * SYNTHETIC TEST DOUBLE. Replays a fixed script of tool calls so the harness can
 * be tested without a model provider. Its outputs are not model outputs and are
 * never written to recordings/.
 */
export interface ScriptedStep {
  text?: string;
  calls?: { name: string; input: Record<string, unknown> }[];
  usage?: { input: number; output: number };
}

export function scriptedModel(script: ScriptedStep[]) {
  let id = 0;
  const results = script.map((step) => ({
    content: [
      ...(step.text ? [{ type: 'text' as const, text: step.text }] : []),
      ...(step.calls ?? []).map((call) => ({ type: 'tool-call' as const, toolCallId: `t${++id}`, toolName: call.name, input: JSON.stringify(call.input) })),
    ],
    finishReason: { unified: (step.calls?.length ? 'tool-calls' : 'stop') as 'tool-calls' | 'stop', raw: 'scripted' },
    usage: {
      inputTokens: { total: step.usage?.input ?? 100, noCache: step.usage?.input ?? 100, cacheRead: 0, cacheWrite: undefined },
      outputTokens: { total: step.usage?.output ?? 10, text: step.usage?.output ?? 10, reasoning: 0 },
    },
    warnings: [],
  }));
  return new MockLanguageModelV4({ provider: 'scripted', modelId: 'synthetic-test-double', doGenerate: results });
}
