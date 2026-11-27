import './lib/load-env.ts';
import { asList, parseNote } from '../agent-harness/src/knowledge-format.ts';
import { maintainerClient, serverRunning } from './lib/openlore.ts';
import { approveProposal, diffAgainstTarget, INBOX, loadProposals, rejectProposal, type Proposal } from './lib/review.ts';
import { ask, c, closePrompts, command, fail, heading, interactive, parseArgs } from './lib/ui.ts';

/**
 * Human review step. Agents can only publish into /proposals/inbox; this command,
 * running as the `maintainer` identity, promotes a proposal into /knowledge with a
 * governed OpenLore `mv` (recorded in `lore history`) or deletes it.
 *
 *   npm run lore:review                      interactive
 *   npm run lore:review -- --list
 *   npm run lore:review -- --approve <slug|all> [--force]
 *   npm run lore:review -- --reject <slug>
 * The dashboard (npm run ui) offers the same review in the browser.
 */
const { flags } = parseArgs(process.argv.slice(2));
if (!serverRunning()) fail('OpenLore is not running.', 'Start it with `npm run lore:start`.');

const lore = maintainerClient();

function show(p: Proposal): void {
  heading(`${p.slug}  ${c.dim(`proposed by ${p.proposedBy}`)}`);
  const parsed = parseNote(p.content);
  console.log(`  title     ${parsed?.frontmatter.title ?? c.red('(missing)')}`);
  console.log(`  category  ${p.category}  →  ${p.target}${p.targetExists ? c.yellow(' (replaces the approved note)') : ''}`);
  console.log(`  sources   ${asList(parsed?.frontmatter.source).join(', ') || c.red('(none)')}`);
  if (p.issues.length === 0) console.log(`  checks    ${c.green('format OK, every source path exists, no credential-shaped text')}`);
  for (const issue of p.issues) console.log(`  ${issue.level === 'error' ? c.red('error  ') : c.yellow('warning')}   ${issue.message}`);
  console.log(c.dim('\n' + p.content.split('\n').map((l) => `    ${l}`).join('\n')));
}

async function approve(p: Proposal, force: boolean): Promise<void> {
  if (p.targetExists) console.log(c.dim(await diffAgainstTarget(lore, p)));
  const result = await approveProposal(lore, p, { force });
  if (result.promoted) console.log(c.green(`  ✔ Promoted to ${result.target}${result.replaced ? ' (replaced the previous note)' : ''}`));
  else console.log(c.red(`  ✖ Not promoted: ${result.reason}. Fix the note, or use --force after reading it carefully.`));
}

async function reject(p: Proposal): Promise<void> {
  await rejectProposal(lore, p);
  console.log(c.yellow(`  ✖ Rejected and removed ${p.path}`));
}

try {
  const proposals = await loadProposals(lore);
  if (proposals.length === 0) {
    console.log(`No proposals in ${INBOX}.`);
    console.log(c.dim(`Agents publish there in Exercise 02. Behind? ${command('npm run checkpoint -- 02')} seeds reviewed knowledge.`));
  } else if (flags.list) {
    for (const p of proposals) console.log(`${p.slug.padEnd(36)} ${p.issues.some((i) => i.level === 'error') ? c.red('invalid') : c.green('valid  ')}  by ${p.proposedBy}  → ${p.target}`);
  } else if (typeof flags.approve === 'string' || typeof flags.reject === 'string') {
    const force = Boolean(flags.force);
    if (typeof flags.approve === 'string') {
      const selected = flags.approve === 'all' ? proposals : proposals.filter((p) => p.slug === flags.approve);
      if (selected.length === 0) fail(`No proposal named "${flags.approve}".`);
      for (const p of selected) {
        show(p);
        await approve(p, force);
      }
    }
    if (typeof flags.reject === 'string') {
      const p = proposals.find((x) => x.slug === flags.reject);
      if (!p) fail(`No proposal named "${flags.reject}".`);
      await reject(p!);
    }
  } else {
    if (!interactive()) fail('Interactive review needs a terminal.', 'Use --list, --approve <slug|all> or --reject <slug>.');
    for (const p of proposals) {
      show(p);
      const answer = (await ask(`\n${c.bold('[a]')}pprove, ${c.bold('[r]')}eject or ${c.bold('[s]')}kip?`, 's')).toLowerCase();
      if (answer.startsWith('a')) await approve(p, false);
      else if (answer.startsWith('r')) await reject(p);
      else console.log(c.dim('  skipped'));
    }
  }
  console.log(`\nApproved knowledge: ${command('npm run lore -- "lore meta /knowledge"')}`);
} catch (error) {
  fail((error as Error).message);
} finally {
  await lore.close();
}
closePrompts();
