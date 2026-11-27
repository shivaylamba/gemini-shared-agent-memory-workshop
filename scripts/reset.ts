import './lib/load-env.ts';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { copySnapshot } from '../evaluation/snapshot.ts';
import { externalWorkspacePath } from './lib/external.ts';
import { seedServedFolder, serverRunning } from './lib/openlore.ts';
import { CORE_APP, HARNESS_WORKSPACES, normaliseExerciseId } from './lib/paths.ts';
import { c, closePrompts, confirm, fail, parseArgs } from './lib/ui.ts';

/**
 * Resets ONE exercise's working state. Run artifacts in runs/ are always kept.
 *   01 / 03  fresh application workspaces (harness and external) for that exercise
 *   02       restores the OpenLore folder to the minimal seed (approved notes and inbox are cleared)
 */
const { positional, flags } = parseArgs(process.argv.slice(2));
const id = normaliseExerciseId(positional[0]);
if (!id) fail('Which exercise?', 'Usage: npm run reset -- 03');
const yes = Boolean(flags.yes);

if (id === '01' || id === '03') {
  const condition = id === '01' ? 'baseline' : 'shared-memory';
  const targets = [join(HARNESS_WORKSPACES, `${id}-${condition}`), externalWorkspacePath(id, condition)].filter(existsSync);
  if (targets.length === 0) {
    console.log('Nothing to reset: no workspace for this exercise yet.');
    process.exit(0);
  }
  console.log(`This replaces with a fresh copy of the starting snapshot:\n${targets.map((t) => `  ${t}`).join('\n')}\nRun artifacts in runs/ are kept.`);
  if (!(await confirm('Reset?', yes))) fail('Cancelled.', 'Add --yes to skip this question.');
  for (const target of targets) copySnapshot(CORE_APP, target);
  console.log(c.green('✔ Reset. Agent config files (.agents/, .mcp.json, .codex/) were removed: rerun `npm run exercise` to recreate them.'));
} else if (id === '02') {
  console.log('This restores the OpenLore folder to the minimal seed: ALL approved notes in /knowledge and proposals in the inbox are deleted. Run artifacts are kept.');
  if (!(await confirm('Reset the knowledge repository?', yes))) fail('Cancelled.', 'Add --yes to skip this question.');
  seedServedFolder();
  console.log(c.green(`✔ Knowledge reset to the seed.${serverRunning() ? ' OpenLore serves the folder live; no restart needed.' : ''}`));
} else {
  console.log('Exercise 04 has nothing to reset (it only reads runs/). To discard runs, delete folders in runs/ yourself.');
}
rmSync(join(HARNESS_WORKSPACES, '.tmp'), { recursive: true, force: true });
closePrompts();
