import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, WORKSHOP_CONFIG } from './paths.ts';

let loaded = false;

/** Loads `.env` from the repository root (if present) without overriding real environment variables. */
export function loadDotEnv(): void {
  if (loaded) return;
  loaded = true;
  const file = join(ROOT, '.env');
  if (!existsSync(file)) return;
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export const PARTICIPATION_PATHS = ['antigravity', 'harness', 'external', 'replay'] as const;
export type ParticipationPath = (typeof PARTICIPATION_PATHS)[number];

export const EXTERNAL_AGENTS = ['antigravity', 'claude-code', 'codex', 'generic'] as const;
export type ExternalAgent = (typeof EXTERNAL_AGENTS)[number];

export interface WorkshopConfig {
  path: ParticipationPath;
  /** For the external path: which agent the participant uses. Antigravity implies 'antigravity'. */
  agent?: ExternalAgent;
  createdAt?: string;
}

/** Participation path chosen in `npm run setup` (WORKSHOP_MODE overrides it). */
export function readWorkshopConfig(): WorkshopConfig {
  loadDotEnv();
  let config: WorkshopConfig = { path: 'harness' };
  if (existsSync(WORKSHOP_CONFIG)) {
    try {
      config = { ...config, ...(JSON.parse(readFileSync(WORKSHOP_CONFIG, 'utf8')) as WorkshopConfig) };
    } catch {
      // fall through to defaults
    }
  }
  const override = process.env.WORKSHOP_MODE?.trim();
  if (override && (PARTICIPATION_PATHS as readonly string[]).includes(override)) config.path = override as ParticipationPath;
  if (config.path === 'antigravity') config.agent = 'antigravity';
  return config;
}
