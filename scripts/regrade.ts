import './lib/load-env.ts';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { loadRun, readJson, writeJson, type RunResult } from '../evaluation/artifacts.ts';
import { constraintsFrom } from '../evaluation/finalize.ts';
import { gradeWorkspace } from '../evaluation/grading.ts';
import { copySnapshot, hashSnapshot, type FileChange } from '../evaluation/snapshot.ts';
import { CORE_APP, SCRATCH_DIR } from './lib/paths.ts';
import { c, fail } from './lib/ui.ts';

/**
 * Re-grades saved runs or recordings with the current hidden grader, from the
 * exact file changes they recorded (changes.json). Only correctness changes:
 * model output, trace and metrics are untouched. Each regrade is noted in
 * metadata.notes and result.regraded, so the change stays visible.
 *
 *   npm run regrade -- <run or recording folder> [...] --reason "<why>"
 */
const args = process.argv.slice(2);
const dirs: string[] = [];
let reason: string | undefined;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--reason') reason = args[++i];
  else dirs.push(args[i]!);
}
if (!dirs.length || !reason) fail('Usage: npm run regrade -- <run or recording folder> [...] --reason "<why the grader changed>"');

for (const dir of dirs.map((d) => resolve(d))) {
  const run = loadRun(dir);
  if (!run) fail(`${dir} is not a run or recording folder.`);
  if (run!.metadata.condition === 'capture') {
    console.log(c.dim(`${run!.metadata.runId}: capture runs are not graded, skipped.`));
    continue;
  }
  const work = join(SCRATCH_DIR, `regrade-${run!.metadata.runId}`);
  copySnapshot(CORE_APP, join(work, 'app'));
  const appDir = join(work, 'app');
  if (hashSnapshot(appDir) !== run!.metadata.snapshot.hash) fail(`${run!.metadata.runId}: the application snapshot changed since this run; it cannot be re-graded fairly.`);
  const changes = existsSync(join(dir, 'changes.json')) ? readJson<FileChange[]>(join(dir, 'changes.json')) : [];
  for (const change of changes) {
    const target = join(appDir, ...change.path.split('/'));
    if (!target.startsWith(appDir)) fail(`Recorded change escapes the workspace: ${change.path}`);
    if (change.action === 'deleted') rmSync(target, { force: true });
    else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, change.content ?? '');
    }
  }
  const grade = await gradeWorkspace({ workspaceDir: appDir, pristineDir: CORE_APP, scratchDir: join(work, 'scratch') });
  rmSync(work, { recursive: true, force: true });

  const before = run!.result.correctness?.checksPassed ?? null;
  const at = new Date().toISOString();
  const result: RunResult & { regraded?: { at: string; reason: string; previousChecksPassed: number | null }[] } = {
    ...run!.result,
    correctness: { ...grade, constraints: constraintsFrom(grade) },
  };
  result.regraded = [...((run!.result as typeof result).regraded ?? []), { at, reason: reason!, previousChecksPassed: before }];
  writeJson(join(dir, 'result.json'), result);
  writeJson(join(dir, 'test-results.json'), grade);
  writeJson(join(dir, 'metadata.json'), { ...run!.metadata, notes: [...(run!.metadata.notes ?? []), `Re-graded ${at.slice(0, 10)}: ${reason}`] });
  console.log(`${run!.metadata.runId}: hidden checks ${before ?? '-'} → ${c.bold(String(grade.checksPassed))}/10`);
}
