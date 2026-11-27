import type { LanguageModel } from 'ai';
import { anthropic } from './anthropic.ts';
import { google } from './google.ts';
import { ollama } from './ollama.ts';
import { openaiCompatible } from './openai-compatible.ts';
import { openai } from './openai.ts';
import { openrouter } from './openrouter.ts';
import { firstSet, PROVIDER_IDS, type ProviderDefinition, type ProviderId } from './types.ts';

export { PROVIDER_IDS } from './types.ts';
export type { ProviderDefinition, ProviderId } from './types.ts';

export const PROVIDERS: Record<ProviderId, ProviderDefinition> = {
  google,
  openai,
  anthropic,
  openrouter,
  'openai-compatible': openaiCompatible,
  ollama,
};

export interface ResolvedModelConfig {
  provider: ProviderDefinition;
  modelId: string;
}

export interface ProviderProblem {
  kind: 'unknown-provider' | 'missing-model' | 'missing-credential' | 'missing-env';
  message: string;
}

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

/**
 * Reads MODEL_PROVIDER / MODEL_ID. Only the selected provider's credentials are
 * inspected; a Gemini key is never required when another provider is chosen.
 */
export function resolveModelConfig(env: Record<string, string | undefined>): { config?: ResolvedModelConfig; problems: ProviderProblem[] } {
  const providerName = (env.MODEL_PROVIDER?.trim() || 'google').toLowerCase();
  if (!isProviderId(providerName)) {
    return { problems: [{ kind: 'unknown-provider', message: `MODEL_PROVIDER="${providerName}" is not one of: ${PROVIDER_IDS.join(', ')}` }] };
  }
  const provider = PROVIDERS[providerName];
  const problems: ProviderProblem[] = [];
  const modelId = env.MODEL_ID?.trim() || provider.defaultModel;
  if (!modelId) {
    problems.push({ kind: 'missing-model', message: `${provider.label} has no default model: set MODEL_ID (for example "${provider.exampleModel}")` });
  }
  if (provider.credentialRequired && !firstSet(env, provider.credentialEnv)) {
    problems.push({ kind: 'missing-credential', message: `Set ${provider.credentialEnv.join(' or ')} for ${provider.label} (${provider.docsUrl})` });
  }
  for (const name of provider.requiredEnv) {
    if (!env[name]?.trim()) problems.push({ kind: 'missing-env', message: `Set ${name} for ${provider.label}` });
  }
  return { config: modelId ? { provider, modelId } : undefined, problems };
}

export function createLanguageModel(config: ResolvedModelConfig, env: Record<string, string | undefined>, baseURL?: string): LanguageModel {
  return config.provider.createModel(config.modelId, { env, baseURL });
}

/** Names of every credential variable across providers (used for redaction). */
export function allCredentialEnvNames(): string[] {
  return [...new Set(Object.values(PROVIDERS).flatMap((p) => p.credentialEnv))];
}
