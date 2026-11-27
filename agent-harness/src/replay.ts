import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ensureDir, newRunId, readJson, writeJson, type RunMetadata, type RunResult } from '../../evaluation/artifacts.ts';
import { finalizeRun } from '../../evaluation/finalize.ts';
import type { TraceEventLike } from '../../evaluation/metrics.ts';
import type { Recording } from '../../evaluation/recordings.ts';
import { copySnapshot, hashSnapshot, type FileChange } from '../../evaluation/snapshot.ts';
import { CORE_APP, HARNESS_WORKSPACES, RUNS_DIR, SCRATCH_DIR } from '../../scripts/lib/paths.ts';

export interface ReplayOptions {
  recording: Recording;
  onEvent?: (event: TraceEventLike) => void;
  /** Delay between replayed events in ms (0 = instant). */
  delayMs?: number;
  runsDir?: string;
  workspacesDir?: string;
}

export interface ReplayOutcome {
  runId: string;
  runDir: string;
  workspace: string;
  metadata: RunMetadata;
  result: RunResult;
}

/**
 * Replays a GENUINE recorded run without calling any model:
 *  1. re-plays the recorded trace (tool calls, knowledge reads, model usage),
 *  2. applies the recorded file changes to a fresh copy of the same snapshot,
 *  3. runs the visible tests and the hidden grader locally on that result.
 * The new run is labelled origin "replay" and points at the recording.
 */
export async function replayRecording(options: ReplayOptions): Promise<ReplayOutcome> {
  const { recording } = options;
  const recorded = recording.run.metadata;
  const runId = newRunId(recorded.exercise, recorded.label ?? recorded.condition, 'replay');
  const runDir = ensureDir(join(options.runsDir ?? RUNS_DIR, runId));
  const workspace = join(options.workspacesDir ?? HARNESS_WORKSPACES, `${recorded.exercise}-${recorded.condition}-replay`);

  copySnapshot(CORE_APP, workspace);
  const hash = hashSnapshot(workspace);
  if (hash !== recorded.snapshot.hash) {
    throw new Error(`The application snapshot changed since this recording was made (recorded ${recorded.snapshot.hash.slice(0, 12)}, now ${hash.slice(0, 12)}). Re-record with \`npm run record\`.`);
  }

  const changes = existsSync(join(recording.dir, 'changes.json')) ? readJson<FileChange[]>(join(recording.dir, 'changes.json')) : [];
  for (const change of changes) {
    const target = join(workspace, ...change.path.split('/'));
    if (!target.startsWith(workspace)) throw new Error(`Recorded change escapes the workspace: ${change.path}`);
    if (change.action === 'deleted') rmSync(target, { force: true });
    else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, change.content ?? '');
    }
  }

  for (const file of ['events.jsonl', 'prompt.md', 'final-response.md']) {
    if (existsSync(join(recording.dir, file))) cpSync(join(recording.dir, file), join(runDir, file));
  }
  if (existsSync(join(recording.dir, 'knowledge'))) cpSync(join(recording.dir, 'knowledge'), join(runDir, 'knowledge'), { recursive: true });

  for (const event of recording.run.events) {
    options.onEvent?.(event);
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
  }

  const metadata: RunMetadata = {
    ...recorded,
    runId,
    origin: 'replay',
    replayOf: { recording: recording.name, runId: recorded.runId, recordedAt: recording.provenance.recordedAt },
    workspace,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    host: { platform: `${process.platform}-${process.arch}`, node: process.version },
    notes: [...(recorded.notes ?? []), 'Replay: model output and metrics come from the recording; tests and grading were re-run locally on the recorded changes.'],
  };
  writeJson(join(runDir, 'metadata.json'), metadata);
  const recordedResult = recording.run.result;
  const finalText = existsSync(join(recording.dir, 'final-response.md')) ? readFileSync(join(recording.dir, 'final-response.md'), 'utf8') : undefined;
  const result = await finalizeRun({
    runDir,
    metadata,
    workspaceDir: workspace,
    pristineDir: CORE_APP,
    scratchDir: join(SCRATCH_DIR, runId),
    events: recording.run.events,
    status: recordedResult.status,
    error: recordedResult.error,
    finalText,
    knowledge: recordedResult.knowledge,
  });
  return { runId, runDir, workspace, metadata, result };
}
