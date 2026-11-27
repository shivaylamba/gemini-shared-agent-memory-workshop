import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HARNESS_VERSION } from '../../agent-harness/src/run.ts';
import { instructionsFor, sha256, taskPrompt } from '../../agent-harness/src/prompts.ts';
import { ensureDir, newRunId, SCHEMA_VERSION, writeJson, type RunMetadata, type RunResult } from '../../evaluation/artifacts.ts';
import { finalizeRun } from '../../evaluation/finalize.ts';
import { readLoreActivity } from '../../evaluation/openlore-events.ts';
import { hashSnapshot } from '../../evaluation/snapshot.ts';
import { readWorkshopConfig, type ExternalAgent } from './env.ts';
import { externalWorkspacePath, readMarker } from './external.ts';
import { maintainerClient, readRemote, serverRunning } from './openlore.ts';
import { CORE_APP, OPENLORE_ANALYTICS, RUNS_DIR, SCRATCH_DIR } from './paths.ts';

export class CollectError extends Error {
  readonly hint?: string;
  constructor(message: string, hint?: string) {
    super(message);
    this.name = 'CollectError';
    this.hint = hint;
  }
}

export interface CollectOptions {
  exercise: '01' | '02' | '03';
  agent?: ExternalAgent;
  model?: string;
  provider?: string;
  notes?: string;
}

export interface CollectOutcome {
  runDir: string;
  metadata: RunMetadata;
  result: RunResult;
  activityNote: string;
}

/**
 * Grades and saves the work of an EXTERNAL agent in the common run-artifact format.
 * Token usage and tool calls are not observable; knowledge retrieval is taken from
 * OpenLore's own event log when available. Shared by `npm run collect` and the dashboard.
 */
export async function collectExternalRun(options: CollectOptions): Promise<CollectOutcome> {
  const exercise = options.exercise;
  const condition = exercise === '01' ? 'baseline' : exercise === '02' ? 'capture' : 'shared-memory';
  const workspace = externalWorkspacePath(exercise, condition);
  const marker = readMarker(workspace);
  if (!marker) throw new CollectError(`No prepared workspace at ${workspace}.`, `Prepare it first with npm run exercise -- ${exercise} --mode external.`);

  const config = readWorkshopConfig();
  const agent = (options.agent ?? marker!.agent ?? config.agent ?? 'generic') as ExternalAgent;
  const modelId = options.model?.trim() || null;
  const provider = options.provider?.trim() || null;

  const runId = newRunId(exercise, condition, agent);
  const runDir = ensureDir(join(RUNS_DIR, runId));
  const snapshotHash = marker!.snapshotHash;
  const notes: string[] = [`Collected from ${workspace}; prepared ${marker!.preparedAt}.`];
  if (options.notes) notes.push(options.notes);

  const metadata: RunMetadata = {
    schemaVersion: SCHEMA_VERSION,
    runId,
    exercise,
    condition,
    interface: 'external',
    origin: 'live',
    controlled: false,
    agent: { name: agent },
    model: { provider, id: modelId, reportedBy: modelId ? 'participant' : 'unknown' },
    openlore: marker!.openlore,
    snapshot: { source: 'core-app', hash: snapshotHash },
    prompt: { taskSha256: sha256(taskPrompt(condition)), instructionsSha256: sha256(instructionsFor(condition, 'external')) },
    budgets: null,
    generation: null,
    isolation: 'external agent: workspace outside the repository; not sandboxed or budgeted by the workshop',
    workspace,
    harnessVersion: HARNESS_VERSION,
    startedAt: marker!.preparedAt,
    finishedAt: new Date().toISOString(),
    host: { platform: `${process.platform}-${process.arch}`, node: process.version },
    notes,
  };
  if (hashSnapshot(CORE_APP) !== snapshotHash) notes.push('WARNING: core-app changed after this workspace was prepared.');
  writeJson(join(runDir, 'metadata.json'), metadata);

  // Knowledge activity, measured by the OpenLore server itself (local server only).
  let knowledge: { read: string[]; proposed: string[] } | undefined;
  let activityNote = 'external agent: not observable by the workshop';
  const metricsPatch: Record<string, number> = {};
  if (marker!.openlore.enabled && marker!.openlore.identity && !readRemote()) {
    const activity = readLoreActivity(OPENLORE_ANALYTICS, marker!.openlore.identity, new Date(marker!.preparedAt));
    if (activity.available) {
      const read = [...new Set(activity.reads.map((r) => r.path))];
      knowledge = { read, proposed: [] };
      metricsPatch.knowledgeReads = activity.reads.length;
      metricsPatch.uniqueKnowledgeDocsRead = read.length;
      metricsPatch.knowledgeSearches = activity.searches.length;
      metricsPatch.knowledgeBytesRetrieved = activity.reads.reduce((s, r) => s + r.bytes, 0) + activity.hits.reduce((s, h) => s + h.bytes, 0);
      activityNote = 'measured from OpenLore analytics events for this identity';
    }
  }

  // Capture: which proposals did this agent's identity write? `lore history` follows promotions
  // out of the inbox, so notes that were already reviewed are still attributed correctly.
  if (condition === 'capture' && serverRunning()) {
    const client = maintainerClient();
    try {
      const listing = await client.exec("find /proposals/inbox /knowledge -name '*.md'");
      const proposed: string[] = [];
      const since = Date.parse(marker!.preparedAt);
      for (const path of listing.stdout.split('\n').filter((p) => p.endsWith('.md') && !p.endsWith('/README.md'))) {
        const history = (await client.exec(`lore history '${path}'`)).stdout.split('\n').filter(Boolean).map((line) => {
          try {
            return JSON.parse(line) as { attribution?: string; action?: string; target?: string; time?: string };
          } catch {
            return {};
          }
        });
        const write = history.find((h) => h.attribution === marker!.openlore.identity && h.action === 'write' && Date.parse(h.time ?? '') >= since - 1000);
        if (!write) continue;
        proposed.push(write.target ?? path);
        const content = (await client.exec(`cat '${path}'`)).stdout;
        const target = join(runDir, 'knowledge', ...path.split('/').filter(Boolean));
        mkdirSync(join(target, '..'), { recursive: true });
        writeFileSync(target, content);
      }
      knowledge = { read: knowledge?.read ?? [], proposed };
      metricsPatch.proposalsPublished = proposed.length;
    } finally {
      await client.close();
    }
  }

  const result = await finalizeRun({
    runDir,
    metadata,
    workspaceDir: workspace,
    pristineDir: CORE_APP,
    scratchDir: join(SCRATCH_DIR, runId),
    events: [],
    status: 'collected',
    metricsUnavailableReason: 'external agent: token usage, tool calls and file reads are not observable by the workshop',
    knowledge,
  });
  // Merge server-side knowledge metrics (measured by OpenLore, not estimated).
  for (const [key, value] of Object.entries(metricsPatch)) {
    (result.metrics.values as Record<string, number | null>)[key] = value;
    delete (result.metrics.unavailable as Record<string, string>)[key];
  }
  writeJson(join(runDir, 'result.json'), result);

  return { runDir, metadata, result, activityNote };
}
