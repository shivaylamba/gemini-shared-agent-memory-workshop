import './lib/load-env.ts';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { maintainerClient, serverRunning } from './lib/openlore.ts';
import { OPENLORE_DIR, OPENLORE_SRC } from './lib/paths.ts';
import { c, command, fail, heading, parseArgs } from './lib/ui.ts';

/**
 * Optional Exercise 04 demo: a stale note that recommends the deprecated adapter.
 *   npm run stale-demo -- on       replace /knowledge/decisions/payment-provider.md with the stale note
 *   npm run stale-demo -- off      restore the previous note
 *   npm run stale-demo -- status   show the note's frontmatter and OpenLore history
 * Every change goes through OpenLore as the maintainer, so `lore history` shows it.
 */
const TARGET = '/knowledge/decisions/payment-provider.md';
const BACKUP = join(OPENLORE_DIR, 'stale-demo-backup.md');
const action = parseArgs(process.argv.slice(2)).positional[0] ?? 'status';
if (!serverRunning()) fail('OpenLore is not running.', command('npm run lore:start'));

const lore = maintainerClient();
async function write(content: string): Promise<void> {
  await lore.exec('mkdir -p /knowledge/decisions');
  if ((await lore.exec(`test -f '${TARGET}'`)).exitCode === 0) await lore.exec(`rm '${TARGET}'`);
  const result = await lore.exec(`cat <<'LORE_STALE_EOF' > '${TARGET}'\n${content.endsWith('\n') ? content : `${content}\n`}LORE_STALE_EOF`);
  if (result.exitCode !== 0) throw new Error(result.stderr);
}

try {
  if (action === 'on') {
    const current = await lore.exec(`cat '${TARGET}'`);
    if (current.exitCode === 0 && !current.stdout.includes('stale-demo')) {
      mkdirSync(OPENLORE_DIR, { recursive: true });
      writeFileSync(BACKUP, current.stdout);
    }
    await write(readFileSync(join(OPENLORE_SRC, 'stale-demo', 'payment-provider.stale.md'), 'utf8'));
    console.log(c.yellow(`Stale note installed at ${TARGET}.`));
    console.log(`Run a fresh shared-memory session: ${command('npm run exercise -- 03 --label stale-memory')} (or replay: ${command('npm run exercise -- 03 --mode replay --label stale-memory')})`);
  } else if (action === 'off') {
    const restore = existsSync(BACKUP) ? readFileSync(BACKUP, 'utf8') : readFileSync(join(OPENLORE_SRC, 'stale-demo', 'payment-provider.corrected.md'), 'utf8');
    await write(restore);
    console.log(c.green(`Restored ${TARGET}.`));
  }
  heading(TARGET);
  console.log((await lore.exec(`head -n 12 '${TARGET}'`)).stdout);
  heading('lore history (newest first)');
  for (const line of (await lore.exec(`lore history '${TARGET}'`)).stdout.split('\n').filter(Boolean).slice(0, 6)) {
    try {
      const h = JSON.parse(line) as { time: string; attribution: string; action: string; from?: string };
      console.log(`  ${h.time}  ${h.attribution.padEnd(20)} ${h.action}${h.from ? ` from ${h.from}` : ''}`);
    } catch {
      console.log(`  ${line}`);
    }
  }
  console.log(c.dim('\nDiscuss: which fields (status, verified_at, source) and which code checks would have exposed the stale note?'));
} catch (error) {
  fail((error as Error).message);
} finally {
  await lore.close();
}
