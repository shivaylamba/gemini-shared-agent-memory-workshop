import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildPatch, writeJson, type RunMetadata, type RunResult } from './artifacts.ts';
import { CHECKS, CONSTRAINTS } from './checks.ts';
import { gradeWorkspace, type GradeResult } from './grading.ts';
import { computeMetrics, emptyMetrics, filesRead, knowledgeDocsRead, type TraceEventLike } from './metrics.ts';
import { diffSnapshots } from './snapshot.ts';

export function constraintsFrom(grade: GradeResult): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const constraint of Object.keys(CONSTRAINTS)) {
    const related = CHECKS.filter((c) => c.constraints.includes(constraint as never)).map((c) => c.id);
    out[constraint] = related.every((id) => grade.checks.find((c) => c.id === id)?.passed === true);
  }
  return out;
}

export interface FinalizeOptions {
  runDir: string;
  metadata: RunMetadata;
  workspaceDir: string;
  pristineDir: string;
  scratchDir: string;
  events: TraceEventLike[];
  status: RunResult['status'];
  error?: RunResult['error'];
  finalText?: string;
  /** Explains missing metrics for runs without a workshop trace (external agents). */
  metricsUnavailableReason?: string;
  knowledge?: RunResult['knowledge'];
}

/** Writes the common artifacts (changes, patch, grading, metrics) for any run. */
export async function finalizeRun(options: FinalizeOptions): Promise<RunResult> {
  const { runDir, metadata } = options;
  const changes = diffSnapshots(options.pristineDir, options.workspaceDir);
  writeJson(join(runDir, 'changes.json'), changes);
  writeFileSync(join(runDir, 'patch.diff'), buildPatch(changes, (path) => readFileSync(join(options.pristineDir, path), 'utf8')));

  let correctness: RunResult['correctness'] = null;
  let correctnessUnavailable: string | undefined;
  if (metadata.condition === 'capture') {
    correctnessUnavailable = 'capture runs do not implement the endpoint';
  } else {
    const grade = await gradeWorkspace({ workspaceDir: options.workspaceDir, pristineDir: options.pristineDir, scratchDir: options.scratchDir });
    correctness = { ...grade, constraints: constraintsFrom(grade) };
    writeJson(join(runDir, 'test-results.json'), grade);
  }

  const metrics = options.events.length > 0 ? computeMetrics(options.events) : emptyMetrics(options.metricsUnavailableReason ?? 'no trace recorded');
  const result: RunResult = {
    schemaVersion: metadata.schemaVersion,
    runId: metadata.runId,
    status: options.status,
    ...(options.error ? { error: options.error } : {}),
    correctness,
    ...(correctnessUnavailable ? { correctnessUnavailable } : {}),
    metrics,
    changes: {
      added: changes.filter((c) => c.action === 'added').length,
      modified: changes.filter((c) => c.action === 'modified').length,
      deleted: changes.filter((c) => c.action === 'deleted').length,
      outsideAllowedAreas: changes.map((c) => c.path).filter((p) => !p.startsWith('src/') && !p.startsWith('tests/')),
    },
    knowledge: options.knowledge ?? (options.events.length > 0 ? { read: knowledgeDocsRead(options.events), proposed: [] } : undefined),
  };
  writeJson(join(runDir, 'result.json'), result);
  writeFileSync(join(runDir, 'final-response.md'), options.finalText?.trim() ? `${options.finalText.trim()}\n` : '_No final response recorded._\n');
  void filesRead;
  return result;
}
