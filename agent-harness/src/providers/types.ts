import type { LanguageModel } from 'ai';

export const PROVIDER_IDS = ['google', 'openai', 'anthropic', 'openrouter', 'openai-compatible', 'ollama'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ProviderSettings {
  /** Environment the provider reads its credentials and endpoints from. */
  env: Record<string, string | undefined>;
  /** Optional base URL override (used by tests to point the real SDK at a local mock server). */
  baseURL?: string;
}

export interface ProviderDefinition {
  id: ProviderId;
  label: string;
  /** Workshop priority: core providers are tested in CI against API-shaped mock servers. */
  tier: 'core' | 'additional' | 'optional';
  /** Default model, or undefined when the participant must choose MODEL_ID. */
  defaultModel?: string;
  /** Example MODEL_ID shown in setup when there is no default. */
  exampleModel: string;
  /** Environment variables that hold the credential; the first one set is used. */
  credentialEnv: string[];
  /** Whether a credential is required (local endpoints may not need one). */
  credentialRequired: boolean;
  /** Other environment variables this provider needs (e.g. a base URL). */
  requiredEnv: string[];
  docsUrl: string;
  createModel(modelId: string, settings: ProviderSettings): LanguageModel;
}

export function firstSet(env: Record<string, string | undefined>, names: string[]): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}
