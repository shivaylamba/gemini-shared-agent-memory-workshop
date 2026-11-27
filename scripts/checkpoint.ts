import './lib/load-env.ts';
import { cpSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { replayRecording } from '../agent-harness/src/replay.ts';
import { loadRecording } from '../evaluation/recordings.ts';
import { maintainerClient, serverRunning } from './lib/openlore.ts';
import { EXERCISES_DIR, OPENLORE_SERVED, RECORDINGS_DIR, normaliseExerciseId } from './lib/paths.ts';
import { printRunSummary } from './lib/run-summary.ts';
import { c, closePrompts, command, confirm, fail, parseArgs } from './lib/ui.ts';

/**
 * Restores a known-good state so you can continue when you are behind.
 *   02  load the reviewed reference knowledge into /knowledge
 *   01  add the genuine baseline recording to runs/ (as a replay)
 *   03  add the genuine shared-memory recording to runs/ (as a replay)
 */
const { positional, flags } = parseArgs(process.argv.slice(2));
const id = normaliseExerciseId(positional[0]);
if (!id) fail('Which checkpoint?', 'Usage: npm run checkpoint -- 02');
const yes = Boolean(flags.yes);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => (statSync(join(dir, entry)).isDirectory() ? walk(join(dir, entry)) : [join(dir, entry)]));
}

if (id === '02') {
  const source = join(EXERCISES_DIR, '02-capture-knowledge', 'checkpoints', 'knowledge');
  const files = walk(source);
  const replace = Boolean(flags.replace);
  console.log(`Checkpoint 02 loads ${files.length} reviewed reference notes into /knowledge (${replace ? 'replacing' : 'keeping'} notes you already approved with the same names${replace ? '' : '; add --replace to overwrite them'}).`);
  if (!(await confirm('Continue?', yes))) fail('Cancelled.', 'Add --yes to skip this question.');
  if (serverRunning()) {
    const lore = maintainerClient();
    try {
      for (const file of files) {
        const rel = relative(source, file).split('\\').join('/');
        const target = `/knowledge/${rel}`;
        await lore.exec(`mkdir -p /knowledge/${rel.split('/')[0]}`);
        if ((await lore.exec(`test -f '${target}'`)).exitCode === 0) {
          if (!replace) {
            console.log(`  ${c.dim('kept')} ${target} ${c.dim('(already approved)')}`);
            continue;
          }
          await lore.exec(`rm '${target}'`);
        }
        const content = readFileSync(file, 'utf8');
        const result = await lore.exec(`cat <<'LORE_CHECKPOINT_EOF' > '${target}'\n${content.endsWith('\n') ? content : `${content}\n`}LORE_CHECKPOINT_EOF`);
        if (result.exitCode !== 0) throw new Error(`${target}: ${result.stderr}`);
        console.log(`  ${c.green('✔')} ${target} ${c.dim('(written through OpenLore as maintainer)')}`);
      }
    } finally {
      await lore.close();
    }
  } else {
    mkdirSync(join(OPENLORE_SERVED, 'knowledge'), { recursive: true });
    cpSync(source, join(OPENLORE_SERVED, 'knowledge'), { recursive: true, force: replace });
    console.log(c.yellow(`  OpenLore is not running: copied the notes directly into ${OPENLORE_SERVED}/knowledge (host-side write, no OpenLore history entry).`));
  }
  console.log(`\nContinue with ${command('npm run exercise -- 03')}`);
} else if (id === '01' || id === '03') {
  const name = id === '01' ? 'baseline' : 'shared-memory';
  const recording = loadRecording(RECORDINGS_DIR, name);
  if (!recording) fail(`No genuine "${name}" recording in recordings/.`, 'There is nothing to restore yet: ask the instructor, or run the exercise live.');
  if (!(await confirm(`Add the recorded ${name} run to runs/ as a replay?`, yes))) fail('Cancelled.', 'Add --yes to skip this question.');
  const outcome = await replayRecording({ recording: recording! });
  printRunSummary(outcome.metadata, outcome.result, outcome.runDir);
} else {
  console.log('Exercise 04 has no checkpoint: it evaluates whatever runs exist. Use checkpoints 01 and 03 if you are missing runs.');
}
closePrompts();
