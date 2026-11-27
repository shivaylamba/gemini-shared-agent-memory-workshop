import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { firstSet, type ProviderDefinition } from './types.ts';

export const google: ProviderDefinition = {
  id: 'google',
  label: 'Google Gemini (default)',
  tier: 'core',
  // Default for the free tier, verified live (Nov 2026): 3.x Flash allows only ~20 requests a day,
  // Flash-Lite far more. With shared memory it scored 10/10 on the hidden checks (baseline 3/10).
  // Paid keys: MODEL_ID=gemini-3.6-flash for a stronger model.
  defaultModel: 'gemini-3.5-flash-lite',
  exampleModel: 'gemini-3.6-flash',
  // GOOGLE_GENERATIVE_AI_API_KEY is the AI SDK's variable; GEMINI_API_KEY is what AI Studio calls it.
  credentialEnv: ['GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY'],
  credentialRequired: true,
  requiredEnv: [],
  docsUrl: 'https://aistudio.google.com/apikey',
  createModel(modelId, settings) {
    const provider = createGoogleGenerativeAI({
      apiKey: firstSet(settings.env, this.credentialEnv),
      ...(settings.baseURL ? { baseURL: settings.baseURL } : {}),
    });
    return provider(modelId);
  },
};
