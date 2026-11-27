import './lib/load-env.ts';
import { loadDotEnv } from './lib/env.ts';
import { smokeTestProvider } from './lib/smoke.ts';
import { c } from './lib/ui.ts';

/**
 * One tiny live tool-calling round trip with the configured provider.
 *   npm run smoke
 *   MODEL_PROVIDER=openai npm run smoke
 */
loadDotEnv();
const result = await smokeTestProvider(process.env);
console.log(`${result.ok ? c.green('PASS') : c.red('FAIL')} ${result.detail}`);
if (result.usage) console.log(c.dim(`usage reported by provider: ${result.usage.inputTokens ?? '?'} input / ${result.usage.outputTokens ?? '?'} output tokens`));
process.exitCode = result.ok ? 0 : 1;
