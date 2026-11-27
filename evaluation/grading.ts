import { copyFileSync, cpSync, existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECKS, checkIdOf } from './checks.ts';
import { runNodeTests, type TestRunResult } from './sandbox/run-node-tests.ts';
import { copySnapshot } from './snapshot.ts';

const GRADER = fileURLToPath(new URL('./graders/refund-grader.test.ts', import.meta.url));

export interface CheckResult {
  id: string;
  title: string;
  passed: boolean;
  error?: string;
}

export interface SuiteSummary {
  passed: number;
  failed: number;
  failures: { name: string; error?: string }[];
}

export interface GradeResult {
  checks: CheckResult[];
  checksPassed: number;
  checksTotal: number;
  /** Original (pristine) visible tests for orders, payments and utils. */
  regression: SuiteSummary;
  /** Original visible refund tests. */
  visibleRefundTests: SuiteSummary;
  graderLoadError?: string;
  timedOut: boolean;
  durationMs: number;
}

const REFUND_TEST_FILE = 'refunds.test.ts';

function summarise(run: TestRunResult, predicate: (file: string) => boolean): SuiteSummary {
  const tests = run.tests.filter((t) => predicate(basename(t.file ?? '')));
  return {
    passed: tests.filter((t) => t.status === 'passed').length,
    failed: tests.filter((t) => t.status === 'failed').length,
    failures: tests.filter((t) => t.status === 'failed').map((t) => ({ name: t.name, error: t.error })),
  };
}

/**
 * Grades a workspace without touching it:
 *  1. copies the workspace into a scratch grading directory,
 *  2. restores the ORIGINAL visible tests (agents cannot weaken them),
 *  3. runs the visible tests and the hidden grader in the sandbox.
 */
export async function gradeWorkspace(options: { workspaceDir: string; pristineDir: string; scratchDir: string }): Promise<GradeResult> {
  const started = Date.now();
  // Resolve symlinks first: the sandbox grants access by real path, and on macOS the
  // temp folder (/var/folders/...) is a symlink to /private/var/folders/....
  mkdirSync(options.scratchDir, { recursive: true });
  const scratchDir = realpathSync(options.scratchDir);
  const gradingDir = join(scratchDir, 'app');
  copySnapshot(options.workspaceDir, gradingDir);
  rmSync(join(gradingDir, 'tests'), { recursive: true, force: true });
  mkdirSync(join(gradingDir, 'tests'), { recursive: true });
  cpSync(join(options.pristineDir, 'tests'), join(gradingDir, 'tests'), { recursive: true });

  const visible = await runNodeTests({ cwd: gradingDir, files: ['tests/**/*.test.ts'], timeoutMs: 60_000 });
  // The hidden grader is copied next to (never into) the grading copy.
  const graderDir = join(scratchDir, 'grader');
  mkdirSync(graderDir, { recursive: true });
  copyFileSync(GRADER, join(graderDir, 'refund-grader.test.ts'));
  writeFileSync(join(graderDir, 'package.json'), '{ "type": "module" }\n');
  const hidden = await runNodeTests({
    cwd: scratchDir,
    files: ['grader/refund-grader.test.ts'],
    env: { SHOPFLOW_WORKSPACE: gradingDir },
    timeoutMs: 60_000,
  });

  const byId = new Map<string, { passed: boolean; error?: string }>();
  for (const test of hidden.tests) {
    const id = checkIdOf(test.name);
    if (id) byId.set(id, { passed: test.status === 'passed', error: test.error });
  }
  const graderLoadError = byId.size === 0 ? (hidden.tests[0]?.error ?? hidden.stderr.slice(0, 2000)) || 'grader produced no results' : undefined;

  const checks: CheckResult[] = CHECKS.map((check) => {
    const result = byId.get(check.id);
    return { id: check.id, title: check.title, passed: result?.passed ?? false, error: result ? result.error : graderLoadError };
  });

  if (existsSync(scratchDir)) rmSync(scratchDir, { recursive: true, force: true });

  return {
    checks,
    checksPassed: checks.filter((c) => c.passed).length,
    checksTotal: checks.length,
    regression: summarise(visible, (file) => file !== REFUND_TEST_FILE),
    visibleRefundTests: summarise(visible, (file) => file === REFUND_TEST_FILE),
    graderLoadError,
    timedOut: visible.timedOut || hidden.timedOut,
    durationMs: Date.now() - started,
  };
}
