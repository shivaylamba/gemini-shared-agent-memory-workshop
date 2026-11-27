import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { firstSet, type ProviderDefinition } from './types.ts';

export const openaiCompatible: ProviderDefinition = {
  id: 'openai-compatible',
  label: 'OpenAI-compatible endpoint',
  tier: 'additional',
  defaultModel: undefined,
  exampleModel: 'your-model-id',
  credentialEnv: ['OPENAI_COMPATIBLE_API_KEY'],
  // Some self-hosted endpoints do not need a key.
  credentialRequired: false,
  requiredEnv: ['OPENAI_COMPATIBLE_BASE_URL'],
  docsUrl: 'https://ai-sdk.dev/providers/openai-compatible-providers',
  createModel(modelId, settings) {
    const baseURL = settings.baseURL ?? settings.env.OPENAI_COMPATIBLE_BASE_URL;
    if (!baseURL) throw new Error('OPENAI_COMPATIBLE_BASE_URL is not set');
    const provider = createOpenAICompatible({
      name: 'openai-compatible',
      baseURL,
      apiKey: firstSet(settings.env, this.credentialEnv),
      includeUsage: true,
    });
    return provider(modelId);
  },
};
