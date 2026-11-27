import './lib/load-env.ts';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROVIDERS, PROVIDER_IDS, isProviderId, resolveModelConfig } from '../agent-harness/src/providers/index.ts';
import { ensureEnvFile, setEnvValue } from './lib/dotenv-file.ts';
import { EXTERNAL_AGENTS, loadDotEnv, PARTICIPATION_PATHS, readWorkshopConfig, type ExternalAgent, type ParticipationPath, type WorkshopConfig } from './lib/env.ts';
import { findBinary, installBinary, LOCK, writeServerConfig } from './lib/openlore.ts';
import { HARNESS_WORKSPACES, ROOT, RUNS_DIR, WORKSHOP_CONFIG, WORKSHOP_DIR } from './lib/paths.ts';
import { ask, askSecret, c, choose, closePrompts, command, fail, heading, interactive, parseArgs } from './lib/ui.ts';

const { flags } = parseArgs(process.argv.slice(2));
loadDotEnv();

const [major, minor] = process.versions.node.split('.').map(Number) as [number, number];
if (major < 22 || (major === 22 && minor < 18)) fail(`Node.js ${process.version} is too old.`, 'Install Node.js 22.18 or newer (see .nvmrc), then run `npm ci`.');
if (!existsSync(join(ROOT, 'node_modules', 'ai'))) fail('Dependencies are not installed.', 'Run `npm ci` first.');

console.log(`\n${c.bold('Welcome to the Shared Agent Memory Workshop!')}`);
console.log(c.dim('Every path uses the same ShopFlow app, tasks, tests and OpenLore knowledge.\n'));

mkdirSync(WORKSHOP_DIR, { recursive: true });
mkdirSync(HARNESS_WORKSPACES, { recursive: true });
mkdirSync(RUNS_DIR, { recursive: true });
ensureEnvFile();

const previous = readWorkshopConfig();
let path: ParticipationPath;
if (typeof flags.path === 'string' && (PARTICIPATION_PATHS as readonly string[]).includes(flags.path)) path = flags.path as ParticipationPath;
else if (!interactive()) path = previous.path;
else {
  path = await choose<ParticipationPath>(
    'How would you like to participate?',
    [
      { value: 'antigravity', label: `Google Antigravity ${c.dim('(sign in with your Google account; no API key needed)')}` },
      { value: 'harness', label: `Bring your own model API key ${c.dim('(workshop harness: Gemini, OpenAI, Anthropic, OpenRouter, …)')}` },
      { value: 'external', label: `Use an existing coding agent ${c.dim('(Claude Code, Codex, or any MCP-capable agent)')}` },
      { value: 'replay', label: `Offline replay mode ${c.dim('(no model, no key, no network)')}` },
    ],
    previous.path,
  );
}

const config: WorkshopConfig = { path, createdAt: new Date().toISOString() };

function onPath(binary: string): string | undefined {
  const result = spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 10_000, shell: process.platform === 'win32' });
  return result.status === 0 ? (result.stdout || result.stderr).trim().split('\n')[0] : undefined;
}

if (path === 'harness') {
  heading('Model provider');
  let provider = typeof flags.provider === 'string' ? flags.provider : process.env.MODEL_PROVIDER || 'google';
  if (interactive() && typeof flags.provider !== 'string') {
    provider = await choose(
      'Which provider will you use? (only that provider needs a key)',
      PROVIDER_IDS.map((id) => ({ value: id, label: `${PROVIDERS[id].label}${PROVIDERS[id].defaultModel ? c.dim(`  default model: ${PROVIDERS[id].defaultModel}`) : c.dim('  you choose MODEL_ID')}` })),
      isProviderId(provider) ? provider : 'google',
    );
  }
  if (!isProviderId(provider)) fail(`Unknown provider "${provider}".`, `Choose one of ${PROVIDER_IDS.join(', ')}.`);
  const definition = PROVIDERS[provider];
  setEnvValue('MODEL_PROVIDER', provider);

  let model = typeof flags.model === 'string' ? flags.model : process.env.MODEL_ID || '';
  if (interactive() && typeof flags.model !== 'string') {
    model = await ask(`Model ID ${c.dim(definition.defaultModel ? `(Enter for ${definition.defaultModel})` : `(e.g. ${definition.exampleModel})`)}:`, model || definition.defaultModel || '');
  }
  setEnvValue('MODEL_ID', model === definition.defaultModel ? '' : model);
  if (provider === 'google' && !process.env.MODEL_REQUESTS_PER_MINUTE) {
    // Free-tier Gemini allows 5 requests per minute; pacing keeps sessions under it.
    setEnvValue('MODEL_REQUESTS_PER_MINUTE', '5');
    console.log(c.dim('  Pacing set to 5 requests per minute (Gemini free tier). With a paid key, clear MODEL_REQUESTS_PER_MINUTE in .env.'));
  }

  for (const name of definition.requiredEnv) {
    if (!process.env[name] && interactive()) setEnvValue(name, await ask(`${name}:`, ''));
  }
  if (definition.credentialEnv.length > 0 && !definition.credentialEnv.some((name) => process.env[name])) {
    if (interactive()) {
      console.log(c.dim(`\nGet a key: ${definition.docsUrl}`));
      const key = await askSecret(`Paste your ${definition.credentialEnv[0]} ${c.dim('(hidden as you paste; stored only in .env; Enter to add it later)')}:`);
      if (key) {
        setEnvValue(definition.credentialEnv[0]!, key);
        console.log(c.green(`  ✔ Key saved to .env (${key.length} characters).`));
      }
    }
  }
  const { problems } = resolveModelConfig(process.env);
  for (const problem of problems) console.log(c.yellow(`  ! ${problem.message}`));
  if (problems.length === 0) console.log(c.green(`  ✔ ${definition.label} configured (${process.env.MODEL_ID || definition.defaultModel})`));
}

if (path === 'antigravity') {
  heading('Google Antigravity');
  const cli = onPath('agy');
  console.log(cli ? c.green(`  ✔ Antigravity CLI found: ${cli}`) : c.dim('  Antigravity CLI (agy) not found on PATH. The Antigravity app or IDE works too.'));
  console.log(`  Sign in with your Google account inside Antigravity. ${c.bold('No Gemini API key is needed for this path.')}`);
  console.log(`  Install / sign-in guide: ${c.cyan('https://antigravity.google/docs/install')}`);
  console.log(`  Workshop guide: ${c.cyan('integrations/antigravity/README.md')}`);
  config.agent = 'antigravity';
}

if (path === 'external') {
  heading('Existing coding agent');
  let agent = (typeof flags.agent === 'string' ? flags.agent : previous.agent) as ExternalAgent | undefined;
  if (interactive() && typeof flags.agent !== 'string') {
    agent = await choose<ExternalAgent>('Which agent?', [
      { value: 'claude-code', label: 'Claude Code' },
      { value: 'codex', label: 'Codex' },
      { value: 'antigravity', label: 'Google Antigravity' },
      { value: 'generic', label: 'Another MCP-capable agent' },
    ], agent ?? 'claude-code');
  }
  if (!agent || !(EXTERNAL_AGENTS as readonly string[]).includes(agent)) agent = 'generic';
  config.agent = agent;
  const binary = agent === 'claude-code' ? 'claude' : agent === 'codex' ? 'codex' : agent === 'antigravity' ? 'agy' : undefined;
  const found = binary ? onPath(binary) : undefined;
  if (binary) console.log(found ? c.green(`  ✔ ${binary} found: ${found}`) : c.yellow(`  ! ${binary} not found on PATH (fine if you use the desktop app).`));
  console.log(`  Guide: ${c.cyan(`integrations/${agent === 'generic' ? 'generic-mcp' : agent}/README.md`)}`);
}

writeFileSync(WORKSHOP_CONFIG, `${JSON.stringify(config, null, 2)}\n`);
setEnvValue('WORKSHOP_MODE', path);

heading('OpenLore (shared knowledge server)');
if (path === 'replay' && !flags['with-openlore']) {
  console.log(c.dim('  Not required for replay. (Add --with-openlore to install it anyway.)'));
} else {
  let binary = findBinary();
  if (binary?.version === LOCK.version) {
    console.log(c.green(`  ✔ OpenLore ${binary.version} already available (${binary.source}: ${binary.path})`));
  } else {
    try {
      binary = await installBinary((line) => console.log(c.dim(`  ${line}`)));
      console.log(c.green(`  ✔ Installed OpenLore ${binary.version} to ${binary.path}`));
    } catch (error) {
      console.log(c.red(`  ✖ ${(error as Error).message}`));
      console.log(c.dim(`  Manual install: download ${LOCK.downloadBase}/<asset> for your platform, then run`));
      console.log(c.dim('  OPENLORE_ARCHIVE=/path/to/archive npm run setup   (the checksum is still verified)'));
      console.log(c.dim('  or set OPENLORE_BIN to an existing openlore 0.8.0 binary. Replay mode works without OpenLore.'));
    }
  }
  if (findBinary()) {
    writeServerConfig();
    console.log(c.green('  ✔ Server configuration written to .workshop/openlore/ (tokens required; agents publish only into the inbox)'));
  }
}

heading('Next');
console.log(`  ${command('npm run doctor')}   checks only what your path (${c.bold(path)}) needs`);
console.log(`  ${command('npm run exercise -- 01')}   starts Exercise 01\n`);
closePrompts();
