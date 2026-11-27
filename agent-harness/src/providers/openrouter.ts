import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { firstSet, type ProviderDefinition } from './types.ts';

export const openrouter: ProviderDefinition = {
  id: 'openrouter',
  label: 'OpenRouter',
  tier: 'additional',
  // OpenRouter's catalogue changes often: participants choose MODEL_ID explicitly.
  defaultModel: undefined,
  exampleModel: 'google/gemini-3.6-flash',
  credentialEnv: ['OPENROUTER_API_KEY'],
  credentialRequired: true,
  requiredEnv: [],
  docsUrl: 'https://openrouter.ai/keys',
  createModel(modelId, settings) {
    const provider = createOpenRouter({
      apiKey: firstSet(settings.env, this.credentialEnv),
      ...(settings.baseURL ? { baseURL: settings.baseURL } : {}),
    });
    return provider(modelId);
  },
};
