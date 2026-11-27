import { z } from 'zod';
import { runNodeTests } from '../../../evaluation/sandbox/run-node-tests.ts';
import type { HarnessTool } from './types.ts';

/** The only command agents can run: the repository's visible test suite, inside the sandbox. */
export const runTests: HarnessTool<Record<string, never>> = {
  name: 'run_tests',
  description: 'Run the repository test suite (node --test "tests/**/*.test.ts") and report passing and failing tests.',
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const result = await runNodeTests({ cwd: ctx.workspace.root, files: ['tests/**/*.test.ts'], timeoutMs: 90_000 });
    ctx.tracer.emit('tests.run', { passed: result.passed, failed: result.failed, timedOut: result.timedOut, durationMs: result.durationMs });
    const failures = result.tests
      .filter((t) => t.status === 'failed')
      .slice(0, 12)
      .map((t) => ({ test: t.name, file: t.file?.split(/[\\/]/).slice(-2).join('/'), error: (t.error ?? '').slice(0, 700) }));
    return {
      passed: result.passed,
      failed: result.failed,
      timedOut: result.timedOut,
      failures,
      ...(result.total === 0 || result.timedOut ? { stderr: result.stderr.slice(0, 3000) } : {}),
    };
  },
};
