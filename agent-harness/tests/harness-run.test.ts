import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRun } from '../../evaluation/artifacts.ts';
import { runHarnessExercise } from '../src/run.ts';
import { scriptedModel } from './scripted-model.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const reference = (path: string) => readFileSync(join(ROOT, 'solutions/01-amnesiac-agent/reference-implementation', path), 'utf8');

function dirs() {
  const base = mkdtempSync(join(tmpdir(), 'harness-run-'));
  return { runsDir: join(base, 'runs'), workspacesDir: join(base, 'ws') };
}

const budgets = { maxModelRequests: 20, maxToolCalls: 40, maxRuntimeMs: 120_000 };

describe('harness run (synthetic scripted model)', () => {
  it('runs tools in a fresh workspace, grades the result and writes the common artifacts', async () => {
    const model = scriptedModel([
      { text: 'Exploring.', calls: [{ name: 'list_files', input: { path: 'src' } }], usage: { input: 1000, output: 20 } },
      { calls: [{ name: 'read_file', input: { path: 'src/payments/payment-service.ts' } }, { name: 'search_files', input: { query: 'createPaymentProvider' } }], usage: { input: 2000, output: 30 } },
      { calls: [{ name: 'read_file', input: { path: '../../etc/passwd' } }], usage: { input: 2500, output: 10 } },
      {
        calls: [
          { name: 'write_file', input: { path: 'src/refunds/refund-service.ts', content: reference('src/refunds/refund-service.ts') } },
          { name: 'write_file', input: { path: 'src/refunds/refund-routes.ts', content: reference('src/refunds/refund-routes.ts') } },
          { name: 'write_file', input: { path: 'src/app.ts', content: reference('src/app.ts') } },
        ],
        usage: { input: 3000, output: 900 },
      },
      { calls: [{ name: 'run_tests', input: {} }], usage: { input: 4000, output: 5 } },
      { text: 'Implemented refunds following ADR-001..005.', usage: { input: 4500, output: 50 } },
    ]);
    const { runsDir, workspacesDir } = dirs();
    const outcome = await runHarnessExercise({ exercise: '01', condition: 'baseline', model, provider: 'scripted', modelId: 'synthetic-test-double', budgets, secrets: [], runsDir, workspacesDir });

    expect(outcome.result.status).toBe('completed');
    expect(outcome.result.correctness?.checksPassed).toBe(10);
    expect(outcome.result.correctness?.regression.failed).toBe(0);
    expect(Object.values(outcome.result.correctness!.constraints).every(Boolean)).toBe(true);

    const m = outcome.result.metrics.values;
    expect(m.modelRequests).toBe(6);
    expect(m.inputTokens).toBe(17_000);
    expect(m.outputTokens).toBe(1_015);
    expect(m.peakInputTokens).toBe(4_500);
    expect(m.localFileReads).toBe(1);
    expect(m.localSearches).toBe(1);
    expect(m.toolErrors).toBe(1); // the traversal attempt
    expect(m.filesWritten).toBe(3);
    expect(m.testRuns).toBe(1);
    expect(m.knowledgeReads).toBe(0);

    const run = loadRun(outcome.runDir)!;
    expect(run.metadata.openlore.enabled).toBe(false);
    expect(run.metadata.controlled).toBe(true);
    expect(run.events.some((e) => e.type === 'tool.result' && e.ok === false && String(e.error).includes('..'))).toBe(true);
    expect(readFileSync(join(outcome.runDir, 'patch.diff'), 'utf8')).toContain('+++ b/src/refunds/refund-service.ts');
    expect(readFileSync(join(outcome.runDir, 'final-response.md'), 'utf8')).toContain('Implemented refunds');
    // write_file contents are not duplicated into the trace
    expect(readFileSync(join(outcome.runDir, 'events.jsonl'), 'utf8')).not.toContain('class RefundService');
  });

  it('starts every session without earlier conversation history or code changes', async () => {
    const { runsDir, workspacesDir } = dirs();
    const first = scriptedModel([
      { calls: [{ name: 'write_file', input: { path: 'src/refunds/refund-service.ts', content: '// changed' } }] },
      { text: 'done' },
    ]);
    const a = await runHarnessExercise({ exercise: '01', condition: 'baseline', model: first, provider: 'scripted', modelId: 'x', budgets, secrets: [], runsDir, workspacesDir });
    const second = scriptedModel([{ text: 'nothing to do' }]);
    const b = await runHarnessExercise({ exercise: '01', condition: 'baseline', model: second, provider: 'scripted', modelId: 'x', budgets, secrets: [], runsDir, workspacesDir });
    expect(b.metadata.snapshot.hash).toBe(a.metadata.snapshot.hash);
    expect(b.result.changes.modified).toBe(0);
    const prompt = second.doGenerateCalls[0]!.prompt;
    expect(prompt.map((m) => m.role)).toEqual(['system', 'user']);
  });

  it('enforces the tool-call budget', async () => {
    const { runsDir, workspacesDir } = dirs();
    const model = scriptedModel(Array.from({ length: 10 }, () => ({ calls: [{ name: 'list_files', input: {} }] })));
    const outcome = await runHarnessExercise({ exercise: '01', condition: 'baseline', model, provider: 'scripted', modelId: 'x', budgets: { ...budgets, maxToolCalls: 3 }, secrets: [], runsDir, workspacesDir });
    expect(outcome.result.status).toBe('budget_exhausted');
    expect(outcome.result.metrics.values.toolCalls).toBe(4);
  });

  it('enforces the model-request budget', async () => {
    const { runsDir, workspacesDir } = dirs();
    const model = scriptedModel(Array.from({ length: 10 }, () => ({ calls: [{ name: 'list_files', input: {} }] })));
    const outcome = await runHarnessExercise({ exercise: '01', condition: 'baseline', model, provider: 'scripted', modelId: 'x', budgets: { ...budgets, maxModelRequests: 2 }, secrets: [], runsDir, workspacesDir });
    expect(outcome.result.status).toBe('budget_exhausted');
    expect(outcome.result.metrics.values.modelRequests).toBe(2);
  });
});
