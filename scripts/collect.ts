import './lib/load-env.ts';
import { EXTERNAL_AGENTS, type ExternalAgent } from './lib/env.ts';
import { CollectError, collectExternalRun } from './lib/collect-run.ts';
import { normaliseExerciseId } from './lib/paths.ts';
import { printRunSummary } from './lib/run-summary.ts';
import { c, fail, parseArgs } from './lib/ui.ts';

/**
 * Grades and saves the work of an EXTERNAL agent (Antigravity, Claude Code, Codex, …)
 * in the common run-artifact format.
 *   npm run collect -- <01|02|03> [--agent <name>] [--model "<model>"] [--provider "<provider>"] [--notes "..."]
 * Token usage and tool calls are not observable by the workshop for external agents;
 * knowledge retrieval is taken from OpenLore's own event log when available.
 */
const { positional, flags } = parseArgs(process.argv.slice(2));
const exercise = normaliseExerciseId(positional[0]);
if (!exercise || exercise === '04') fail('Collect which exercise?', 'Usage: npm run collect -- 01|02|03 [--agent claude-code] [--model "..."]');
const agent = typeof flags.agent === 'string' ? flags.agent : undefined;
if (agent && !(EXTERNAL_AGENTS as readonly string[]).includes(agent)) fail(`Unknown agent "${agent}".`, `Use one of ${EXTERNAL_AGENTS.join(', ')}.`);

try {
  const outcome = await collectExternalRun({
    exercise: exercise as '01' | '02' | '03',
    agent: agent as ExternalAgent | undefined,
    model: typeof flags.model === 'string' ? flags.model : undefined,
    provider: typeof flags.provider === 'string' ? flags.provider : undefined,
    notes: typeof flags.notes === 'string' ? flags.notes : undefined,
  });
  printRunSummary(outcome.metadata, outcome.result, outcome.runDir);
  console.log(c.dim(`Knowledge metrics: ${outcome.activityNote}. Token usage: unavailable for external agents (see your agent's own usage view).`));
  console.log(c.dim('External runs are labelled "not controlled"; Experiment A only compares controlled harness pairs.\n'));
} catch (error) {
  if (error instanceof CollectError) fail(error.message, error.hint);
  fail((error as Error).message);
}
