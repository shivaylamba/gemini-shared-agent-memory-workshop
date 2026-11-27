import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseNote } from '../agent-harness/src/knowledge-format.ts';
import type { LoadedRun } from './artifacts.ts';
import { summarise, type PortabilityReport } from './report.ts';

export interface KnowledgeDocMeta {
  path: string;
  producer?: string;
}

/** Producer of a reviewed note: `proposed_by` (set by lore:review from OpenLore history) or `contributed_by`. */
export function producerOf(frontmatter: Record<string, unknown>): string | undefined {
  const value = frontmatter.proposed_by ?? frontmatter.contributed_by;
  return typeof value === 'string' && value ? value : undefined;
}

/** Collects producer provenance from knowledge snapshots stored with runs (no server needed). */
export function knowledgeFromRuns(runs: LoadedRun[]): KnowledgeDocMeta[] {
  const docs = new Map<string, KnowledgeDocMeta>();
  for (const run of runs) {
    const root = join(run.dir, 'knowledge', 'knowledge');
    if (!existsSync(root)) continue;
    const walk = (dir: string, rel: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, `${rel}/${entry}`);
        else if (entry.endsWith('.md')) {
          const parsed = parseNote(readFileSync(full, 'utf8'));
          docs.set(`${rel}/${entry}`, { path: `${rel}/${entry}`, producer: parsed ? producerOf(parsed.frontmatter) : undefined });
        }
      }
    };
    walk(root, '/knowledge');
  }
  return [...docs.values()];
}

/**
 * Experiment B: who produced the shared knowledge, and which agents/models
 * consumed it in fresh sessions. This demonstrates portability; it is not a
 * controlled performance comparison.
 */
export function buildPortability(runs: LoadedRun[], knowledge: KnowledgeDocMeta[]): PortabilityReport {
  const byProducer = new Map<string, string[]>();
  for (const doc of knowledge) {
    const producer = doc.producer ?? 'unknown (no provenance recorded)';
    byProducer.set(producer, [...(byProducer.get(producer) ?? []), doc.path]);
  }
  const producerFor = new Map(knowledge.map((d) => [d.path, d.producer ?? 'unknown']));
  const consumers = runs
    .filter((run) => run.metadata.condition === 'shared-memory')
    .map((run) => {
      const read = run.result.knowledge?.read;
      const measured = Array.isArray(read) && (run.metadata.interface === 'harness' || run.result.metrics.values.knowledgeReads !== null);
      return {
        run: summarise(run),
        documentsRead: measured ? read! : null,
        ...(measured ? {} : { documentsReadUnavailable: 'not observable for this external run' }),
        checksPassed: run.result.correctness?.checksPassed ?? null,
        producersUsed: measured ? [...new Set(read!.map((p) => producerFor.get(p) ?? 'unknown'))] : [],
      };
    });
  return {
    experiment: 'B: cross-agent knowledge portability',
    generatedAt: new Date().toISOString(),
    statement:
      'This shows that knowledge written by one agent or model was retrieved and used by another in a fresh session, through OpenLore. ' +
      'It is NOT a controlled comparison: differences in correctness or cost between different agents or models cannot be attributed to shared memory.',
    producers: [...byProducer.entries()].map(([identity, documents]) => ({ identity, documents })),
    consumers,
  };
}
