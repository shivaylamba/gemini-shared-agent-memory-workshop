import { relative } from 'node:path';
import type { RunMetadata, RunResult } from '../../evaluation/artifacts.ts';
import { CONSTRAINTS } from '../../evaluation/checks.ts';
import { ROOT } from './paths.ts';
import { box, c, formatBytes, formatMs } from './ui.ts';

const num = (v: number | null | undefined) => (v === null || v === undefined ? c.dim('unavailable') : v.toLocaleString('en-US'));

export function printRunSummary(metadata: RunMetadata, result: RunResult, runDir: string): void {
  const m = result.metrics.values;
  const origin = metadata.origin === 'replay' ? c.yellow(`REPLAY of recording "${metadata.replayOf?.recording}" (no model was called)`) : c.green('LIVE');
  const lines: string[] = [
    `Origin       ${origin}`,
    `Agent        ${metadata.agent.name} · ${metadata.model.provider ?? '?'}/${metadata.model.id ?? '?'}${metadata.interface === 'external' ? c.dim(' (reported by participant)') : ''}`,
    `Status       ${result.status}${result.error ? ` — ${result.error.message.slice(0, 80)}` : ''}`,
  ];
  if (result.error?.hint) lines.push(`Hint         ${c.yellow(result.error.hint)}`);
  if (result.correctness) {
    const cr = result.correctness;
    const constraintsOk = Object.values(cr.constraints).filter(Boolean).length;
    lines.push(`Correctness  ${cr.checksPassed === cr.checksTotal ? c.green(`${cr.checksPassed}/${cr.checksTotal}`) : c.yellow(`${cr.checksPassed}/${cr.checksTotal}`)} hidden checks · regression ${cr.regression.failed === 0 ? c.green('passing') : c.red(`${cr.regression.failed} failing`)} · constraints ${constraintsOk}/${Object.keys(CONSTRAINTS).length}`);
    const failed = cr.checks.filter((check) => !check.passed).map((check) => check.id);
    if (failed.length) lines.push(`             ${c.dim(`failed: ${failed.join(', ')}`)}`);
  } else if (result.correctnessUnavailable) lines.push(`Correctness  ${c.dim(result.correctnessUnavailable)}`);
  lines.push(`Changes      +${result.changes.added} added, ${result.changes.modified} modified, ${result.changes.deleted} deleted${result.changes.outsideAllowedAreas.length ? c.yellow(` (outside src/ and tests/: ${result.changes.outsideAllowedAreas.join(', ')})`) : ''}`);
  lines.push(`Exploration  ${num(m.localFileReads)} file reads (${num(m.uniqueFilesRead)} unique, ${formatBytes(m.localBytesRead)}) · ${num(m.localSearches)} searches · ${num(m.toolCalls)} tool calls`);
  lines.push(`Knowledge    ${num(m.knowledgeSearches)} searches · ${num(m.knowledgeReads)} docs read · ${formatBytes(m.knowledgeBytesRetrieved)} retrieved${m.proposalsPublished ? ` · ${m.proposalsPublished} proposals published` : ''}`);
  lines.push(`Context      ${num(m.inputTokens)} input tokens · ${num(m.outputTokens)} output tokens · ${num(m.modelRequests)} model requests`);
  lines.push(`Time         ${formatMs(m.elapsedMs)}`);
  lines.push('');
  lines.push(`Artifacts    ${relative(ROOT, runDir) || runDir}`);
  box(`Run ${metadata.runId}`, lines);
}
