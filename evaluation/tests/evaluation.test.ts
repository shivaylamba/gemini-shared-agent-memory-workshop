import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { replayRecording } from '../../agent-harness/src/replay.ts';
import { runHarnessExercise } from '../../agent-harness/src/run.ts';
import { scriptedModel } from '../../agent-harness/tests/scripted-model.ts';
import { listRuns, loadRun, type LoadedRun } from '../artifacts.ts';
import { checkComparability, selectPair } from '../compare.ts';
import { computeMetrics } from '../metrics.ts';
import { buildPortability } from '../portability.ts';
import { loadRecording } from '../recordings.ts';
import { buildExperimentA, renderMarkdown } from '../report.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const reference = (path: string) => readFileSync(join(ROOT, 'solutions/01-amnesiac-agent/reference-implementation', path), 'utf8');
const budgets = { maxModelRequests: 20, maxToolCalls: 40, maxRuntimeMs: 120_000 };

describe('metrics', () => {
  it('measures only what the trace contains and marks missing usage as unavailable', () => {
    const metrics = computeMetrics([
      { type: 'model.step', usage: { inputTokens: 100, outputTokens: 5, reasoningTokens: null, cachedInputTokens: null, totalTokens: 105 } },
      { type: 'model.step', usage: { inputTokens: null, outputTokens: null, reasoningTokens: null, cachedInputTokens: null, totalTokens: null } },
      { type: 'tool.call' },
      { type: 'file.read', path: 'a.ts', bytes: 10 },
      { type: 'file.read', path: 'a.ts', bytes: 10 },
      { type: 'run.completed', elapsedMs: 1234 },
    ]);
    expect(metrics.values.modelRequests).toBe(2);
    expect(metrics.values.inputTokens).toBeNull();
    expect(metrics.unavailable.inputTokens).toMatch(/1 of 2/);
    expect(metrics.values.localFileReads).toBe(2);
    expect(metrics.values.uniqueFilesRead).toBe(1);
    expect(metrics.values.localBytesRead).toBe(20);
    expect(metrics.values.elapsedMs).toBe(1234);
  });
});

async function scriptedRun(runsDir: string, condition: 'baseline' | 'shared-memory', modelId = 'synthetic', implement = true) {
  const steps = implement
    ? [
        { calls: [{ name: 'read_file', input: { path: 'src/app.ts' } }], usage: { input: 1000, output: 10 } },
        { calls: [
          { name: 'write_file', input: { path: 'src/refunds/refund-service.ts', content: reference('src/refunds/refund-service.ts') } },
          { name: 'write_file', input: { path: 'src/refunds/refund-routes.ts', content: reference('src/refunds/refund-routes.ts') } },
          { name: 'write_file', input: { path: 'src/app.ts', content: reference('src/app.ts') } },
        ], usage: { input: 2000, output: 500 } },
        { text: 'done', usage: { input: 2500, output: 20 } },
      ]
    : [{ text: 'gave up', usage: { input: 900, output: 5 } }];
  // Shared-memory runs without a server still exercise the comparison logic (no knowledge tools are called).
  return runHarnessExercise({ exercise: condition === 'baseline' ? '01' : '03', condition, model: scriptedModel(steps), provider: 'scripted', modelId, budgets, secrets: [], runsDir, workspacesDir: join(runsDir, '..', 'ws') });
}

describe('Experiment A comparison', () => {
  it('only treats same-model harness pairs as controlled and reports measured values', async () => {
    const runsDir = join(mkdtempSync(join(tmpdir(), 'eval-')), 'runs');
    await scriptedRun(runsDir, 'baseline', 'model-a', false);
    await scriptedRun(runsDir, 'shared-memory', 'model-a', true);
    const runs = listRuns(runsDir);
    const { baseline, shared } = selectPair(runs);
    expect(baseline?.metadata.condition).toBe('baseline');
    const comparability = checkComparability(baseline!, shared!);
    expect(comparability.comparable).toBe(true);
    const report = buildExperimentA(baseline!, shared!);
    const checks = report.rows.find((r) => r.label.startsWith('Hidden checks'))!;
    expect(checks.baseline).toBe(0);
    expect(checks.shared).toBe(10);
    expect(renderMarkdown(report)).toContain('Comparable pair');

    await scriptedRun(runsDir, 'shared-memory', 'model-b', true);
    const mixed = checkComparability(baseline!, listRuns(runsDir).find((r) => r.metadata.model.id === 'model-b')!);
    expect(mixed.comparable).toBe(false);
    expect(mixed.differences.join(' ')).toMatch(/models differ/);
  });

  it('never treats external-agent runs as controlled', async () => {
    const runsDir = join(mkdtempSync(join(tmpdir(), 'eval-')), 'runs');
    const a = await scriptedRun(runsDir, 'baseline');
    const b = await scriptedRun(runsDir, 'shared-memory');
    const external = { ...loadRun(b.runDir)!, metadata: { ...b.metadata, interface: 'external' as const, controlled: false, agent: { name: 'claude-code' } } } as LoadedRun;
    const result = checkComparability(loadRun(a.runDir)!, external);
    expect(result.comparable).toBe(false);
    expect(result.differences.join(' ')).toMatch(/not controlled/);
  });
});

describe('replay', () => {
  it('refuses synthetic recordings unless explicitly allowed, and re-grades recorded changes locally', async () => {
    const base = mkdtempSync(join(tmpdir(), 'replay-'));
    const outcome = await scriptedRun(join(base, 'runs'), 'baseline');
    const recordings = join(base, 'recordings');
    cpSync(outcome.runDir, join(recordings, 'baseline'), { recursive: true });
    writeFileSync(join(recordings, 'baseline', 'provenance.json'), JSON.stringify({ recording: 'baseline', synthetic: true, recordedAt: outcome.metadata.startedAt, notes: 'unit-test fixture, not a model output' }));
    expect(loadRecording(recordings, 'baseline')).toBeUndefined();
    const recording = loadRecording(recordings, 'baseline', { allowSynthetic: true })!;
    const replay = await replayRecording({ recording, runsDir: join(base, 'runs'), workspacesDir: join(base, 'ws') });
    expect(replay.metadata.origin).toBe('replay');
    expect(replay.metadata.replayOf?.runId).toBe(outcome.runId);
    expect(replay.result.correctness?.checksPassed).toBe(10);
    expect(replay.result.metrics.values.inputTokens).toBe(outcome.result.metrics.values.inputTokens);
  });
});

describe('Experiment B portability', () => {
  it('attributes knowledge to producers and lists consumers without claiming performance effects', async () => {
    const runsDir = join(mkdtempSync(join(tmpdir(), 'port-')), 'runs');
    await scriptedRun(runsDir, 'shared-memory');
    const run = listRuns(runsDir)[0]!;
    run.result.knowledge = { read: ['/knowledge/decisions/refund-idempotency.md'], proposed: [] };
    const report = buildPortability([run], [{ path: '/knowledge/decisions/refund-idempotency.md', producer: 'antigravity-capture' }]);
    expect(report.producers[0]!.identity).toBe('antigravity-capture');
    expect(report.consumers[0]!.producersUsed).toEqual(['antigravity-capture']);
    expect(report.statement).toMatch(/NOT a controlled comparison/);
  });
});
