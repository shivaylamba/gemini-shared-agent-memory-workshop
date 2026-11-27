import './lib/load-env.ts';
import { cpSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseNote, validateNote } from '../agent-harness/src/knowledge-format.ts';
import { gradeWorkspace } from '../evaluation/grading.ts';
import { availableRecordings } from '../evaluation/recordings.ts';
import { copySnapshot } from '../evaluation/snapshot.ts';
import { EXERCISES } from './lib/exercises.ts';
import { CORE_APP, EXERCISES_DIR, RECORDINGS_DIR, ROOT, SCRATCH_DIR, SOLUTION_WORKSPACES, SOLUTIONS_DIR, normaliseExerciseId } from './lib/paths.ts';
import { box, c, command, fail, heading, parseArgs } from './lib/ui.ts';

/**
 * npm run solution -- <01-04>
 * Reference solutions run in their own workspace (.workshop/solutions/<nn>) and never touch your work.
 */
const { positional } = parseArgs(process.argv.slice(2));
const id = normaliseExerciseId(positional[0]);
if (!id) fail('Which solution?', 'Usage: npm run solution -- 01');
const info = EXERCISES[id];
box(`Solution ${id} — ${info.title}`, [`Reference material: solutions/${id === '01' ? '01-amnesiac-agent' : id === '02' ? '02-capture-knowledge' : id === '03' ? '03-share-knowledge' : '04-evaluate-memory'}/README.md`]);

async function referenceImplementation(): Promise<void> {
  const dir = join(SOLUTION_WORKSPACES, id!);
  copySnapshot(CORE_APP, dir);
  cpSync(join(SOLUTIONS_DIR, '01-amnesiac-agent', 'reference-implementation'), dir, { recursive: true });
  heading('Human-written reference implementation (not an agent run)');
  console.log(`Workspace: ${relative(ROOT, dir)}`);
  const grade = await gradeWorkspace({ workspaceDir: dir, pristineDir: CORE_APP, scratchDir: join(SCRATCH_DIR, `solution-${id}-${Date.now()}`) });
  for (const check of grade.checks) console.log(`  ${check.passed ? c.green('pass') : c.red('FAIL')}  ${check.title}`);
  console.log(`\n  Hidden checks ${grade.checksPassed}/${grade.checksTotal} · regression ${grade.regression.passed} passed, ${grade.regression.failed} failed · visible refund tests ${grade.visibleRefundTests.passed}/${grade.visibleRefundTests.passed + grade.visibleRefundTests.failed}`);
  console.log(c.dim(`\n  Files: src/refunds/refund-service.ts, src/refunds/refund-routes.ts, src/app.ts (one line: inject the provider)`));
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

try {
  if (id === '01' || id === '03') {
    await referenceImplementation();
    const recordings = availableRecordings(RECORDINGS_DIR).filter((r) => r.name === (id === '01' ? 'baseline' : 'shared-memory'));
    heading('Recorded agent run');
    if (recordings.length) console.log(`Genuine recording available: ${command(`npm run exercise -- ${id} --mode replay`)}`);
    else console.log(c.dim('No genuine recording in recordings/ yet (the instructor creates them with `npm run record`).'));
    if (id === '03') console.log(`\nKnowledge a shared-memory session should find: ${command('npm run solution -- 02')}`);
  } else if (id === '02') {
    const root = join(EXERCISES_DIR, '02-capture-knowledge', 'checkpoints', 'knowledge');
    heading('Reviewed reference knowledge (written by the workshop authors)');
    for (const file of walk(root)) {
      const content = readFileSync(file, 'utf8');
      const parsed = parseNote(content);
      const issues = validateNote(content, { appRoot: CORE_APP });
      console.log(`  ${issues.length ? c.red('✖') : c.green('✔')} /knowledge/${relative(root, file).split('\\').join('/')}  ${c.dim(String(parsed?.frontmatter.title ?? ''))}`);
    }
    console.log(`\nLoad them into OpenLore (keeps notes you already approved; --replace overwrites them): ${command('npm run checkpoint -- 02')}`);
  } else {
    heading('How to read Experiment A');
    console.log(readFileSync(join(SOLUTIONS_DIR, '04-evaluate-memory', 'README.md'), 'utf8').split('\n').slice(0, 40).join('\n'));
    console.log(`\nRun it: ${command('npm run evaluate')}`);
  }
} catch (error) {
  fail((error as Error).message);
}
