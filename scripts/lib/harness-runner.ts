import { allCredentialEnvNames, createLanguageModel, resolveModelConfig } from '../../agent-harness/src/providers/index.ts';
import { budgetsFromEnv, runHarnessExercise, type HarnessRunOutcome } from '../../agent-harness/src/run.ts';
import type { TraceEvent } from '../../agent-harness/src/tracing.ts';
import { EXERCISES } from './exercises.ts';
import { accessFor, clientFor, readRemote, serverRunning } from './openlore.ts';

export class HarnessRunError extends Error {
  readonly hint?: string;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = 'HarnessRunError';
    this.hint = hint;
  }
}

/** Number of approved notes the harness reader can see (used to warn before Exercise 03). */
export async function approvedNoteCount(agent = 'harness'): Promise<number> {
  const client = clientFor(accessFor(agent, 'read'), 'workshop-check');
  try {
    const result = await client.exec('lore meta /knowledge');
    return result.stdout.split('\n').filter((l) => l.startsWith('{')).length;
  } finally {
    await client.close();
  }
}

/**
 * Runs one live harness session for an exercise with the provider configured in
 * the environment. Shared by `npm run exercise` and the dashboard.
 */
export async function runHarnessFromEnv(options: { exercise: '01' | '02' | '03'; label?: string; onEvent?: (event: TraceEvent) => void; runsDir?: string }): Promise<HarnessRunOutcome> {
  const condition = EXERCISES[options.exercise].condition!;
  const { config, problems } = resolveModelConfig(process.env);
  if (!config || problems.length > 0) {
    throw new HarnessRunError(`Model provider not configured: ${problems.map((p) => p.message).join('; ')}`, `Run npm run setup, or use replay (npm run exercise -- ${options.exercise} --mode replay).`);
  }
  let lore: Parameters<typeof runHarnessExercise>[0]['lore'];
  let token: string | undefined;
  if (condition !== 'baseline') {
    if (!serverRunning() && !readRemote()) throw new HarnessRunError('OpenLore is not running.', 'Start it with npm run lore:start.');
    const access = accessFor('harness', condition === 'capture' ? 'capture' : 'read');
    token = access.token;
    const client = clientFor(access, `workshop-harness-${condition}`);
    await client.connect();
    lore = { client, identity: access.identity, scope: access.scope, endpoint: access.endpoint };
  }
  try {
    return await runHarnessExercise({
      exercise: options.exercise,
      condition,
      label: options.label,
      model: createLanguageModel(config, process.env),
      provider: config.provider.id,
      modelId: config.modelId,
      budgets: budgetsFromEnv(process.env),
      secrets: [...allCredentialEnvNames().map((n) => process.env[n]), token],
      lore,
      onEvent: options.onEvent,
      runsDir: options.runsDir,
    });
  } finally {
    await lore?.client.close();
  }
}
