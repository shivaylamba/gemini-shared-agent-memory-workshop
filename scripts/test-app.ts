import './lib/load-env.ts';
import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gradeWorkspace } from '../evaluation/grading.ts';
import { copySnapshot } from '../evaluation/snapshot.ts';
import { CORE_APP, SOLUTIONS_DIR } from './lib/paths.ts';
import { c } from './lib/ui.ts';

/**
 * Verifies the sample app and the grader:
 *  - starting state: regression tests pass, refund tests fail, hidden checks 0/10
 *  - reference implementation: everything passes (10/10)
 */
let ok = true;
const expect = (condition: boolean, message: string) => {
  console.log(`${condition ? c.green('✔') : c.red('✖')} ${message}`);
  ok &&= condition;
};

const starter = await gradeWorkspace({ workspaceDir: CORE_APP, pristineDir: CORE_APP, scratchDir: mkdtempSync(join(tmpdir(), 'grade-starter-')) });
expect(starter.regression.failed === 0 && starter.regression.passed > 0, `starter: ${starter.regression.passed} regression tests pass`);
expect(starter.visibleRefundTests.failed === 3, `starter: ${starter.visibleRefundTests.failed} visible refund tests fail (the task)`);
expect(starter.checksPassed === 0, `starter: ${starter.checksPassed}/10 hidden checks`);

const reference = join(mkdtempSync(join(tmpdir(), 'reference-')), 'app');
copySnapshot(CORE_APP, reference);
cpSync(join(SOLUTIONS_DIR, '01-amnesiac-agent', 'reference-implementation'), reference, { recursive: true });
const graded = await gradeWorkspace({ workspaceDir: reference, pristineDir: CORE_APP, scratchDir: mkdtempSync(join(tmpdir(), 'grade-ref-')) });
expect(graded.checksPassed === 10, `reference: ${graded.checksPassed}/10 hidden checks`);
expect(graded.regression.failed === 0 && graded.visibleRefundTests.failed === 0, `reference: all ${graded.regression.passed + graded.visibleRefundTests.passed} visible tests pass`);

process.exitCode = ok ? 0 : 1;
