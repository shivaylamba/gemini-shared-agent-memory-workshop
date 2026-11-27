import { createOpenAI } from '@ai-sdk/openai';
import { firstSet, type ProviderDefinition } from './types.ts';

export const openai: ProviderDefinition = {
  id: 'openai',
  label: 'OpenAI',
  tier: 'core',
  defaultModel: 'gpt-5.4-mini',
  exampleModel: 'gpt-5.4-mini',
  credentialEnv: ['OPENAI_API_KEY'],
  credentialRequired: true,
  requiredEnv: [],
  docsUrl: 'https://platform.openai.com/api-keys',
  createModel(modelId, settings) {
    const provider = createOpenAI({
      apiKey: firstSet(settings.env, this.credentialEnv),
      ...(settings.baseURL ? { baseURL: settings.baseURL } : {}),
    });
    return provider(modelId);
  },
};
