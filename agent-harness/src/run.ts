import { mkdirSync, writeFileSync } from 'node:fs';
import { pacingFromEnv, type PacingOptions } from './pacing.ts';
import { join } from 'node:path';
import type { LanguageModel } from 'ai';
import { ensureDir, newRunId, SCHEMA_VERSION, writeJson, type RunMetadata, type RunResult } from '../../evaluation/artifacts.ts';
import { finalizeRun } from '../../evaluation/finalize.ts';
import { copySnapshot, hashSnapshot } from '../../evaluation/snapshot.ts';
import { CORE_APP, HARNESS_WORKSPACES, RUNS_DIR, SCRATCH_DIR } from '../../scripts/lib/paths.ts';
import { runAgent, type Budgets } from './agent.ts';
import type { OpenLoreClient } from './openlore-client.ts';
import { instructionsFor, sha256, taskPrompt, type Condition } from './prompts.ts';
import { toolsFor } from './tool-registry.ts';
import { Tracer, type TraceEvent } from './tracing.ts';
import { Workspace } from './workspace.ts';

export const HARNESS_VERSION = '1.0.0';

export interface HarnessRunOptions {
  exercise: '01' | '02' | '03';
  condition: Condition;
  label?: string;
  model: LanguageModel;
  provider: string;
  modelId: string;
  budgets: Budgets;
  /** Values to scrub from traces (API keys, tokens). */
  secrets: (string | undefined)[];
  lore?: { client: OpenLoreClient; identity: string; scope: 'read' | 'full'; endpoint: string };
  onEvent?: (event: TraceEvent) => void;
  runsDir?: string;
  workspacesDir?: string;
  /** Defaults to MODEL_REQUESTS_PER_MINUTE from the environment. */
  pacing?: Omit<PacingOptions, 'onWait'>;
}

export interface HarnessRunOutcome {
  runId: string;
  runDir: string;
  workspace: string;
  metadata: RunMetadata;
  result: RunResult;
}

export function budgetsFromEnv(env: Record<string, string | undefined>): Budgets {
  const num = (name: string, fallback: number) => {
    const value = Number(env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    maxModelRequests: num('AGENT_MAX_MODEL_REQUESTS', 30),
    maxToolCalls: num('AGENT_MAX_TOOL_CALLS', 60),
    maxRuntimeMs: num('AGENT_MAX_RUNTIME_SECONDS', 300) * 1000,
  };
}

/**
 * Runs one fresh harness session against a fresh copy of the starting snapshot
 * and writes the common run artifacts. No earlier conversation or code is reused.
 */
export async function runHarnessExercise(options: HarnessRunOptions): Promise<HarnessRunOutcome> {
  const runsDir = options.runsDir ?? RUNS_DIR;
  const runId = newRunId(options.exercise, options.label ?? options.condition, 'harness');
  const runDir = ensureDir(join(runsDir, runId));
  const workspaceDir = join(options.workspacesDir ?? HARNESS_WORKSPACES, `${options.exercise}-${options.condition}`);
  copySnapshot(CORE_APP, workspaceDir);
  const snapshotHash = hashSnapshot(workspaceDir);

  const instructions = instructionsFor(options.condition, 'harness');
  const prompt = taskPrompt(options.condition);
  const pacing = options.pacing ?? pacingFromEnv(process.env);
  const metadata: RunMetadata = {
    schemaVersion: SCHEMA_VERSION,
    runId,
    exercise: options.exercise,
    condition: options.condition,
    ...(options.label ? { label: options.label } : {}),
    interface: 'harness',
    origin: 'live',
    controlled: true,
    agent: { name: 'workshop-harness', version: HARNESS_VERSION },
    model: { provider: options.provider, id: options.modelId, reportedBy: 'harness' },
    openlore: options.lore
      ? { enabled: true, identity: options.lore.identity, scope: options.lore.scope, endpoint: options.lore.endpoint, serverVersion: options.lore.client.serverVersion }
      : { enabled: false },
    snapshot: { source: 'core-app', hash: snapshotHash },
    prompt: { taskSha256: sha256(prompt), instructionsSha256: sha256(instructions) },
    budgets: options.budgets,
    generation: { temperature: 'provider default', maxOutputTokens: 'provider default', maxRetries: 2, ...(pacing.requestsPerMinute ? { requestsPerMinute: pacing.requestsPerMinute } : {}) },
    isolation: 'harness: workspace-confined tools, no shell, sandboxed test runs (Node permission model, scrubbed env)',
    workspace: workspaceDir,
    harnessVersion: HARNESS_VERSION,
    startedAt: new Date().toISOString(),
    host: { platform: `${process.platform}-${process.arch}`, node: process.version },
  };
  writeJson(join(runDir, 'metadata.json'), metadata);
  writeFileSync(join(runDir, 'prompt.md'), `## Instructions\n\n${instructions}\n\n## Task\n\n${prompt}\n`);

  const tracer = new Tracer({ file: join(runDir, 'events.jsonl'), secrets: options.secrets, listener: options.onEvent });
  const workspace = new Workspace(workspaceDir);
  const ctx = {
    workspace,
    tracer,
    lore: options.lore?.client,
    knowledgeRoot: '/knowledge',
    proposalsDocset: '/proposals',
    pristineAppRoot: CORE_APP,
    state: { proposals: [] as string[] },
  };

  tracer.emit('run.started', { runId, condition: options.condition, provider: options.provider, model: options.modelId, tools: toolsFor(options.condition).map((t) => t.name) });
  const outcome = await runAgent({ model: options.model, instructions, prompt, tools: toolsFor(options.condition), ctx, budgets: options.budgets, pacing });
  if (outcome.status === 'failed') tracer.emit('run.failed', { error: outcome.error });
  else tracer.emit('run.completed', { status: outcome.status, steps: outcome.steps, toolCalls: outcome.toolCalls });

  // Keep a copy of every knowledge document this run read or proposed (for inspection and replay).
  const knowledgeDir = join(runDir, 'knowledge');
  const read = [...new Set(tracer.events.filter((e) => e.type === 'knowledge.read').map((e) => String(e.path)))];
  const proposed = [...new Set(tracer.events.filter((e) => e.type === 'knowledge.publish').map((e) => String(e.path)))];
  if (options.lore && (read.length > 0 || proposed.length > 0)) {
    for (const path of [...read, ...proposed]) {
      try {
        const doc = await options.lore.client.exec(`cat '${path.replace(/'/g, '')}'`);
        if (doc.exitCode === 0) {
          const target = join(knowledgeDir, ...path.split('/').filter(Boolean));
          mkdirSync(join(target, '..'), { recursive: true });
          writeFileSync(target, doc.stdout);
        }
      } catch {
        // best effort: the trace still records what was read
      }
    }
  }

  metadata.finishedAt = new Date().toISOString();
  writeJson(join(runDir, 'metadata.json'), metadata);
  const result = await finalizeRun({
    runDir,
    metadata,
    workspaceDir,
    pristineDir: CORE_APP,
    scratchDir: join(SCRATCH_DIR, runId),
    events: tracer.events,
    status: outcome.status,
    error: outcome.error,
    finalText: outcome.finalText,
    knowledge: { read, proposed },
  });
  return { runId, runDir, workspace: workspaceDir, metadata, result };
}
