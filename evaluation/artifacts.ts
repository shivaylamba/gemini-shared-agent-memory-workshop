import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTwoFilesPatch } from 'diff';
import type { GradeResult } from './grading.ts';
import type { RunMetrics, TraceEventLike } from './metrics.ts';
import type { FileChange } from './snapshot.ts';

/**
 * Common run artifact format for every participation path:
 *
 *   runs/<run-id>/
 *     metadata.json       who/what/how: interface, agent, provider, model, condition, snapshot, budgets
 *     events.jsonl        trace (harness runs; absent for external agents)
 *     result.json         status, correctness and metrics (null = unavailable, with a reason)
 *     patch.diff          unified diff against the starting snapshot
 *     changes.json        exact changed files (used by replay)
 *     test-results.json   visible tests + hidden checks
 *     final-response.md   the agent's final message (when available)
 *     knowledge/          knowledge read or proposed during the run (when available)
 */
export const SCHEMA_VERSION = 1;

export type RunInterface = 'harness' | 'external';
export type RunOrigin = 'live' | 'replay';
export type Condition = 'baseline' | 'capture' | 'shared-memory';

export interface RunMetadata {
  schemaVersion: number;
  runId: string;
  exercise: '01' | '02' | '03';
  condition: Condition;
  label?: string;
  interface: RunInterface;
  origin: RunOrigin;
  /** Set for replays: which recording was replayed. */
  replayOf?: { recording: string; runId: string; recordedAt?: string };
  /** True only for harness runs, where the workshop controls tools, prompt, budgets and isolation. */
  controlled: boolean;
  agent: { name: string; version?: string };
  model: { provider: string | null; id: string | null; reportedBy: 'harness' | 'participant' | 'unknown' };
  openlore: { enabled: boolean; identity?: string; scope?: 'read' | 'full'; endpoint?: string; serverVersion?: string };
  snapshot: { source: 'core-app'; hash: string };
  prompt: { taskSha256: string; instructionsSha256: string };
  budgets: { maxModelRequests: number; maxToolCalls: number; maxRuntimeMs: number } | null;
  generation: { temperature: string; maxOutputTokens: string; maxRetries: number; requestsPerMinute?: number } | null;
  isolation: string;
  workspace: string;
  harnessVersion: string;
  startedAt: string;
  finishedAt?: string;
  host: { platform: string; node: string };
  notes?: string[];
}

export interface RunResult {
  schemaVersion: number;
  runId: string;
  status: 'completed' | 'budget_exhausted' | 'timeout' | 'failed' | 'collected';
  error?: { message: string; statusCode?: number; hint?: string };
  correctness: (Omit<GradeResult, 'checks'> & { checks: GradeResult['checks']; constraints: Record<string, boolean> }) | null;
  correctnessUnavailable?: string;
  metrics: RunMetrics;
  changes: { added: number; modified: number; deleted: number; outsideAllowedAreas: string[] };
  knowledge?: { read: string[]; proposed: string[] };
}

export interface LoadedRun {
  dir: string;
  metadata: RunMetadata;
  result: RunResult;
  events: TraceEventLike[];
}

export function buildPatch(changes: FileChange[], readOriginal: (path: string) => string): string {
  return changes
    .map((change) => {
      const before = change.action === 'added' ? '' : readOriginal(change.path);
      const after = change.action === 'deleted' ? '' : (change.content ?? '');
      return createTwoFilesPatch(`a/${change.path}`, `b/${change.path}`, before, after, '', '', { context: 3 });
    })
    .join('\n');
}

export function writeJson(file: string, value: unknown): void {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

export function readEvents(dir: string): TraceEventLike[] {
  const file = join(dir, 'events.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as TraceEventLike);
}

export function loadRun(dir: string): LoadedRun | undefined {
  const metadataFile = join(dir, 'metadata.json');
  const resultFile = join(dir, 'result.json');
  if (!existsSync(metadataFile) || !existsSync(resultFile)) return undefined;
  return { dir, metadata: readJson<RunMetadata>(metadataFile), result: readJson<RunResult>(resultFile), events: readEvents(dir) };
}

/** All completed runs, newest first. */
export function listRuns(runsDir: string): LoadedRun[] {
  if (!existsSync(runsDir)) return [];
  return readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => loadRun(join(runsDir, entry.name)))
    .filter((run): run is LoadedRun => Boolean(run))
    .sort((a, b) => b.metadata.startedAt.localeCompare(a.metadata.startedAt));
}

export function newRunId(exercise: string, condition: string, tag: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', '-');
  const suffix = Math.random().toString(16).slice(2, 6);
  return `${stamp}-${exercise}-${condition}-${tag}-${suffix}`;
}

export function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true });
  return dir;
}
