import type { TraceEventLike } from '../../evaluation/metrics.ts';
import { c, formatBytes } from './ui.ts';

/** Prints one compact terminal line per interesting trace event. */
export function printEvent(event: TraceEventLike): void {
  const t = c.dim(`${String(Math.round((Number(event.elapsedMs) || 0) / 1000)).padStart(4)}s`);
  switch (event.type) {
    case 'run.started':
      console.log(`${t} ${c.bold('session started')} ${c.dim(`${event.provider}/${event.model} · tools: ${(event.tools as string[]).join(', ')}`)}`);
      break;
    case 'model.step': {
      const usage = event.usage as { inputTokens: number | null; outputTokens: number | null } | undefined;
      const calls = (event.toolCalls as string[]) ?? [];
      const tokens = usage?.inputTokens != null ? `${usage.inputTokens.toLocaleString()} in / ${usage.outputTokens?.toLocaleString() ?? '?'} out` : 'usage not reported';
      console.log(`${t} ${c.magenta('model')}  step ${Number(event.step) + 1} · ${tokens}${calls.length ? ` · calls ${calls.join(', ')}` : ` · ${String(event.finishReason)}`}`);
      break;
    }
    case 'model.wait': {
      const seconds = Math.round(Number(event.waitMs) / 1000);
      const why = event.reason === 'pace' ? 'pacing to MODEL_REQUESTS_PER_MINUTE' : event.reason === 'overloaded' ? 'provider overloaded (503)' : 'provider rate limit (429)';
      console.log(`${t} ${c.yellow('wait')}   ${seconds}s · ${why}`);
      break;
    }
    case 'tool.call': {
      const input = (event.input ?? {}) as Record<string, unknown>;
      const detail = input.path ?? input.query ?? input.slug ?? '';
      console.log(`${t}   ${c.cyan('▸')} ${String(event.name)} ${c.dim(String(detail))}`);
      break;
    }
    case 'tool.result':
      if (event.ok === false) console.log(`${t}     ${c.red('✖')} ${c.red(String(event.error).split('\n')[0]!.slice(0, 140))}`);
      break;
    case 'file.read':
      console.log(`${t}     ${c.dim(`read ${formatBytes(Number(event.bytes))}`)}`);
      break;
    case 'knowledge.search':
      console.log(`${t}     ${c.green('knowledge')} ${Number(event.matches)} matches in ${(event.paths as string[]).length} docs`);
      break;
    case 'knowledge.read':
      console.log(`${t}     ${c.green('knowledge')} read ${String(event.path)} (${formatBytes(Number(event.bytes))})`);
      break;
    case 'knowledge.publish':
      console.log(`${t}     ${c.green('published')} ${String(event.path)} ${c.dim('(awaiting review)')}`);
      break;
    case 'file.write':
      console.log(`${t}     ${c.yellow('wrote')} ${String(event.path)} (${formatBytes(Number(event.bytes))}, ${String(event.action)})`);
      break;
    case 'tests.run':
      console.log(`${t}     ${Number(event.failed) === 0 ? c.green('tests') : c.yellow('tests')} ${Number(event.passed)} passed, ${Number(event.failed)} failed`);
      break;
    case 'run.completed':
      console.log(`${t} ${c.bold('session ended')} ${c.dim(String(event.status))}`);
      break;
    case 'run.failed':
      console.log(`${t} ${c.red('session failed')} ${String((event.error as { message?: string })?.message ?? '')}`);
      break;
  }
}
