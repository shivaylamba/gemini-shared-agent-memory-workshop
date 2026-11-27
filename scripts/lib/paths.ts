import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const CORE_APP = join(ROOT, 'core-app');
export const WORKSHOP_DIR = join(ROOT, '.workshop');
export const RUNS_DIR = join(ROOT, 'runs');
export const RECORDINGS_DIR = join(ROOT, 'recordings');
export const EXERCISES_DIR = join(ROOT, 'exercises');
export const SOLUTIONS_DIR = join(ROOT, 'solutions');
export const OPENLORE_SRC = join(ROOT, 'openlore');
export const WORKSHOP_CONFIG = join(WORKSHOP_DIR, 'config.json');

/** Harness workspaces live inside the repo: the harness confines every tool to them. */
export const HARNESS_WORKSPACES = join(WORKSHOP_DIR, 'workspaces');
export const SOLUTION_WORKSPACES = join(WORKSHOP_DIR, 'solutions');
export const SCRATCH_DIR = join(WORKSHOP_DIR, 'scratch');

/**
 * Workspaces for external coding agents (Antigravity, Claude Code, Codex, ...) live
 * OUTSIDE the repository so the agent's project root does not contain solutions,
 * the hidden grader, recordings or earlier runs.
 */
export function externalWorkspacesDir(): string {
  return resolve(process.env.WORKSHOP_EXTERNAL_DIR || join(homedir(), 'shopflow-workshop'));
}

export const OPENLORE_DIR = join(WORKSHOP_DIR, 'openlore');
export const OPENLORE_SERVED = join(OPENLORE_DIR, 'served');
export const OPENLORE_STATE = join(OPENLORE_DIR, 'state');
export const OPENLORE_TOKENS = join(OPENLORE_DIR, 'tokens');
export const OPENLORE_CONFIG = join(OPENLORE_DIR, 'openlore.yml');
export const OPENLORE_AUTH = join(OPENLORE_DIR, 'lore.json');
export const OPENLORE_PID = join(OPENLORE_DIR, 'server.pid');
export const OPENLORE_LOG = join(OPENLORE_DIR, 'server.log');
export const BIN_DIR = join(WORKSHOP_DIR, 'bin');

export const EXERCISE_IDS = ['01', '02', '03', '04'] as const;
export type ExerciseId = (typeof EXERCISE_IDS)[number];

export const EXERCISE_SLUGS: Record<ExerciseId, string> = {
  '01': '01-amnesiac-agent',
  '02': '02-capture-knowledge',
  '03': '03-share-knowledge',
  '04': '04-evaluate-memory',
};

export function normaliseExerciseId(value: string | undefined): ExerciseId | undefined {
  if (!value) return undefined;
  const padded = value.padStart(2, '0');
  return (EXERCISE_IDS as readonly string[]).includes(padded) ? (padded as ExerciseId) : undefined;
}

/** OpenLore's analytics event log (data_dir/analytics), used to measure external agents' retrieval. */
export const OPENLORE_ANALYTICS = join(OPENLORE_STATE, 'data', 'analytics');
