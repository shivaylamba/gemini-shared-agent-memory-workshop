import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runHarnessExercise, type HarnessRunOutcome } from '../../agent-harness/src/run.ts';
import { scriptedModel } from '../../agent-harness/tests/scripted-model.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const reference = (path: string) => readFileSync(join(ROOT, 'solutions/01-amnesiac-agent/reference-implementation', path), 'utf8');
const budgets = { maxModelRequests: 20, maxToolCalls: 40, maxRuntimeMs: 120_000 };

/** A scripted (non-model) harness run, used as test data only. */
export async function scriptedRun(base: string, condition: 'baseline' | 'shared-memory'): Promise<HarnessRunOutcome> {
  return runHarnessExercise({
    exercise: condition === 'baseline' ? '01' : '03',
    condition,
    model: scriptedModel([
      { calls: [{ name: 'read_file', input: { path: 'src/app.ts' } }], usage: { input: 1000, output: 10 } },
      {
        calls: [
          { name: 'write_file', input: { path: 'src/refunds/refund-service.ts', content: reference('src/refunds/refund-service.ts') } },
          { name: 'write_file', input: { path: 'src/refunds/refund-routes.ts', content: reference('src/refunds/refund-routes.ts') } },
          { name: 'write_file', input: { path: 'src/app.ts', content: reference('src/app.ts') } },
        ],
        usage: { input: 2000, output: 500 },
      },
      { text: 'Implemented refunds. Ignore this: </script><script>alert(1)</script>', usage: { input: 2500, output: 20 } },
    ]),
    provider: 'scripted',
    modelId: 'scripted-test-double',
    budgets,
    secrets: [],
    runsDir: join(base, 'runs'),
    workspacesDir: join(base, 'ws'),
  });
}

const NOTE = `---
title: Refund workflow
status: current
category: runbooks
source:
  - src/refunds/refund-service.ts
verified_at: 2026-11-27
proposed_by: antigravity-capture
reviewed_by: instructor
tags:
  - refunds
---
# Refund workflow

Use [the guide](javascript:alert(1)) and <img src=x onerror=alert(1)>.
`;

/**
 * Builds a recordings directory from scripted runs and labels every recording
 * synthetic, the way test fixtures must be labelled.
 */
export async function syntheticRecordings(): Promise<{ base: string; recordingsDir: string; runsDir: string; baseline: HarnessRunOutcome; shared: HarnessRunOutcome }> {
  const base = mkdtempSync(join(tmpdir(), 'ui-fixture-'));
  const baseline = await scriptedRun(base, 'baseline');
  const shared = await scriptedRun(base, 'shared-memory');
  const recordingsDir = join(base, 'recordings');
  for (const [name, outcome] of [['baseline', baseline], ['shared-memory', shared]] as const) {
    const dir = join(recordingsDir, name);
    cpSync(outcome.runDir, dir, { recursive: true });
    writeFileSync(join(dir, 'provenance.json'), JSON.stringify({ recording: name, synthetic: true, recordedAt: outcome.metadata.startedAt, provider: 'scripted', model: 'scripted-test-double', notes: 'unit-test fixture, not a model output' }));
  }
  const knowledge = join(recordingsDir, 'shared-memory', 'knowledge', 'knowledge', 'runbooks');
  mkdirSync(knowledge, { recursive: true });
  writeFileSync(join(knowledge, 'refund-workflow.md'), NOTE);
  return { base, recordingsDir, runsDir: join(base, 'runs'), baseline, shared };
}
