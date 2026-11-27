import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { ProviderDefinition } from './types.ts';

/**
 * Local inference through Ollama's OpenAI-compatible endpoint (`<OLLAMA_BASE_URL>/v1`).
 * Optional (P2): pick a pulled model that supports tool calling.
 */
export const ollama: ProviderDefinition = {
  id: 'ollama',
  label: 'Ollama (local, optional)',
  tier: 'optional',
  defaultModel: undefined,
  exampleModel: 'a pulled model with tool-calling support',
  credentialEnv: [],
  credentialRequired: false,
  requiredEnv: [],
  docsUrl: 'https://ollama.com/blog/openai-compatibility',
  createModel(modelId, settings) {
    const base = (settings.baseURL ?? settings.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/+$/, '');
    const provider = createOpenAICompatible({
      name: 'ollama',
      baseURL: base.endsWith('/v1') ? base : `${base}/v1`,
      includeUsage: true,
    });
    return provider(modelId);
  },
};
