import { createAnthropic } from '@ai-sdk/anthropic';
import { firstSet, type ProviderDefinition } from './types.ts';

export const anthropic: ProviderDefinition = {
  id: 'anthropic',
  label: 'Anthropic',
  tier: 'core',
  defaultModel: 'claude-haiku-5-5',
  exampleModel: 'claude-haiku-5-5',
  credentialEnv: ['ANTHROPIC_API_KEY'],
  credentialRequired: true,
  requiredEnv: [],
  docsUrl: 'https://console.anthropic.com/settings/keys',
  createModel(modelId, settings) {
    const provider = createAnthropic({
      apiKey: firstSet(settings.env, this.credentialEnv),
      ...(settings.baseURL ? { baseURL: settings.baseURL } : {}),
    });
    return provider(modelId);
  },
};
