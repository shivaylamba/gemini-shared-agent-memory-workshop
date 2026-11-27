import { CATEGORIES, parseNote, validateNote, type NoteIssue } from '../../agent-harness/src/knowledge-format.ts';
import { shellQuote, type OpenLoreClient } from '../../agent-harness/src/openlore-client.ts';
import { CORE_APP } from './paths.ts';

/**
 * Knowledge review, shared by `npm run lore:review` and the dashboard. Every
 * operation runs through OpenLore as the `maintainer` identity, so promotions and
 * rejections are governed writes recorded in `lore history`.
 */
export const INBOX = '/proposals/inbox';

export interface Proposal {
  slug: string;
  path: string;
  content: string;
  issues: NoteIssue[];
  proposedBy: string;
  category: string;
  target: string;
  targetExists: boolean;
}

export interface HistoryEntry {
  time: string;
  attribution: string;
  action: string;
  target?: string;
  from?: string;
}

export interface KnowledgeDoc {
  path: string;
  category: string;
  title?: string;
  status?: string;
  verifiedAt?: string;
  proposedBy?: string;
  contributedBy?: string;
  reviewedBy?: string;
}

async function run(lore: OpenLoreClient, cmd: string): Promise<string> {
  const result = await lore.exec(cmd);
  if (result.exitCode !== 0) throw new Error(`${cmd.split('\n')[0]}: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout;
}

export async function historyOf(lore: OpenLoreClient, path: string): Promise<HistoryEntry[]> {
  const result = await lore.exec(`lore history ${shellQuote(path)}`);
  return result.stdout
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as HistoryEntry];
      } catch {
        return [];
      }
    });
}

export async function loadProposals(lore: OpenLoreClient): Promise<Proposal[]> {
  const listing = await lore.exec(`ls ${INBOX}`);
  const files = listing.stdout.split(/\s+/).filter((f) => f.endsWith('.md') && f !== 'README.md');
  const proposals: Proposal[] = [];
  for (const file of files) {
    const path = `${INBOX}/${file}`;
    const content = (await lore.exec(`cat ${shellQuote(path)}`)).stdout;
    const authors = [...new Set((await historyOf(lore, path)).map((h) => h.attribution).filter(Boolean))];
    const parsed = parseNote(content);
    const rawCategory = typeof parsed?.frontmatter.category === 'string' ? parsed.frontmatter.category : 'decisions';
    const category = (CATEGORIES as readonly string[]).includes(rawCategory) ? rawCategory : 'decisions';
    const target = `/knowledge/${category}/${file}`;
    proposals.push({
      slug: file.replace(/\.md$/, ''),
      path,
      content,
      issues: validateNote(content, { appRoot: CORE_APP }),
      proposedBy: authors.join(', ') || 'unknown',
      category,
      target,
      targetExists: (await lore.exec(`test -f ${shellQuote(target)}`)).exitCode === 0,
    });
  }
  return proposals;
}

export async function listApprovedKnowledge(lore: OpenLoreClient): Promise<KnowledgeDoc[]> {
  const result = await lore.exec('lore meta /knowledge');
  const docs: KnowledgeDoc[] = [];
  for (const line of result.stdout.split('\n')) {
    if (!line.startsWith('{')) continue;
    try {
      const meta = JSON.parse(line) as Record<string, unknown>;
      const rel = String(meta.path);
      const str = (key: string) => (typeof meta[key] === 'string' ? (meta[key] as string) : undefined);
      docs.push({
        path: `/knowledge/${rel}`,
        category: rel.includes('/') ? rel.split('/')[0]! : 'general',
        title: str('title'),
        status: str('status'),
        verifiedAt: str('verified_at')?.slice(0, 10),
        proposedBy: str('proposed_by'),
        contributedBy: str('contributed_by'),
        reviewedBy: str('reviewed_by'),
      });
    } catch {
      // skip malformed lines
    }
  }
  return docs.sort((a, b) => a.path.localeCompare(b.path));
}

export async function readDocument(lore: OpenLoreClient, path: string): Promise<{ content: string; history: HistoryEntry[] }> {
  if (!/^\/(knowledge|proposals\/inbox)(\/[A-Za-z0-9][A-Za-z0-9._-]*)+\.md$/.test(path) || path.includes('..')) {
    throw new Error('Only Markdown documents under /knowledge or /proposals/inbox can be opened.');
  }
  const content = await run(lore, `cat ${shellQuote(path)}`);
  return { content, history: await historyOf(lore, path) };
}

export interface ApproveResult {
  promoted: boolean;
  target: string;
  replaced: boolean;
  reason?: string;
}

export async function approveProposal(lore: OpenLoreClient, p: Proposal, options: { force?: boolean } = {}): Promise<ApproveResult> {
  const errors = p.issues.filter((i) => i.level === 'error');
  if (errors.length > 0 && !options.force) {
    return { promoted: false, target: p.target, replaced: false, reason: `${errors.length} validation error(s): ${errors.map((e) => e.message).join('; ')}` };
  }
  await run(lore, `mkdir -p /knowledge/${p.category}`);
  const exists = (await lore.exec(`test -f ${shellQuote(p.target)}`)).exitCode === 0;
  if (exists) await run(lore, `rm ${shellQuote(p.target)}`);
  await run(lore, `mv ${shellQuote(p.path)} ${shellQuote(p.target)}`);
  const today = new Date().toISOString().slice(0, 10);
  // `lore meta set` takes one key=value per call.
  for (const entry of [`proposed_by=${p.proposedBy.replace(/'/g, '')}`, 'reviewed_by=maintainer', `reviewed_at=${today}`]) {
    await run(lore, `lore meta set ${shellQuote(p.target)} ${shellQuote(entry)}`);
  }
  return { promoted: true, target: p.target, replaced: exists };
}

export async function rejectProposal(lore: OpenLoreClient, p: Proposal): Promise<void> {
  await run(lore, `rm ${shellQuote(p.path)}`);
}

export async function diffAgainstTarget(lore: OpenLoreClient, p: Proposal): Promise<string> {
  if (!p.targetExists) return '';
  return (await lore.exec(`diff -u ${shellQuote(p.target)} ${shellQuote(p.path)}`)).stdout;
}

export function titleOf(content: string): string | undefined {
  const title = parseNote(content)?.frontmatter.title;
  return typeof title === 'string' ? title : undefined;
}
