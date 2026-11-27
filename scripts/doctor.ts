import './lib/load-env.ts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readPromptBlock } from '../agent-harness/src/prompts.ts';
import { resolveModelConfig } from '../agent-harness/src/providers/index.ts';
import { availableRecordings } from '../evaluation/recordings.ts';
import { runNodeTests } from '../evaluation/sandbox/run-node-tests.ts';
import { hashSnapshot } from '../evaluation/snapshot.ts';
import { readWorkshopConfig } from './lib/env.ts';
import { accessFor, clientFor, findBinary, LOCK, maintainerClient, ports, portInUse, readRemote, serverRunning } from './lib/openlore.ts';
import { CORE_APP, EXERCISES_DIR, RECORDINGS_DIR, ROOT } from './lib/paths.ts';
import { smokeTestProvider } from './lib/smoke.ts';
import { c, command, parseArgs, status } from './lib/ui.ts';

/** Readiness check that validates only what the chosen participation path needs. */
const { flags } = parseArgs(process.argv.slice(2));
const config = readWorkshopConfig();
const path = config.path;
const live = path !== 'replay';
const blocking: string[] = [];
const advice: string[] = [];

const PATH_LABELS = { antigravity: 'Antigravity', harness: 'Harness (bring your own key)', external: 'Existing coding agent', replay: 'Offline replay' } as const;

console.log(`\n${c.bold('Workshop readiness')}\n`);

// Node.js
const [major, minor] = process.versions.node.split('.').map(Number) as [number, number];
if (major > 22 || (major === 22 && minor >= 18)) status('Node.js', 'PASS', process.version);
else {
  status('Node.js', 'FAIL', `${process.version}; need >= 22.18 (type stripping)`);
  blocking.push('Install Node.js 22.18+ (see .nvmrc)');
}

// Dependencies
if (existsSync(join(ROOT, 'node_modules', 'ai')) && existsSync(join(ROOT, 'node_modules', '@modelcontextprotocol', 'sdk'))) status('Dependencies', 'PASS', 'npm packages installed');
else {
  status('Dependencies', 'FAIL', 'run npm ci');
  blocking.push('Run `npm ci`');
}

// Application tests (also proves the sandboxed test runner works on this machine)
try {
  const result = await runNodeTests({ cwd: CORE_APP, files: ['tests/**/*.test.ts'], timeoutMs: 60_000 });
  const refundFailures = result.tests.filter((t) => t.status === 'failed' && t.file?.endsWith('refunds.test.ts')).length;
  const otherFailures = result.failed - refundFailures;
  if (result.total > 0 && otherFailures === 0) status('Application tests', 'PASS', `${result.passed} passed; ${refundFailures} refund tests pending (expected: refunds are the task)`);
  else {
    status('Application tests', 'FAIL', result.total === 0 ? result.stderr.split('\n')[0] ?? 'no tests ran' : `${otherFailures} unexpected failures`);
    blocking.push('The ShopFlow tests do not run in the sandbox; see docs/TROUBLESHOOTING.md');
  }
} catch (error) {
  status('Application tests', 'FAIL', (error as Error).message);
  blocking.push('The ShopFlow tests could not start');
}

status('Participation mode', 'INFO', PATH_LABELS[path] + (config.agent && path !== 'harness' ? ` (${config.agent})` : ''));

// Model provider: only the harness path needs credentials.
if (path === 'harness') {
  const { config: modelConfig, problems } = resolveModelConfig(process.env);
  if (problems.length > 0) {
    status('Model provider', 'FAIL', problems.map((p) => p.message).join('; '));
    blocking.push('Configure MODEL_PROVIDER/MODEL_ID and the provider key in .env (or rerun `npm run setup`)');
  } else {
    status('Model provider', 'PASS', `${modelConfig!.provider.label}: ${modelConfig!.modelId}`);
    if (flags.live) {
      const smoke = await smokeTestProvider(process.env);
      status('Live model check', smoke.ok ? 'PASS' : 'FAIL', smoke.detail);
      if (!smoke.ok) blocking.push('The live model check failed; use replay mode or another provider');
    } else advice.push(`${command('npm run doctor -- --live')} makes one tiny real model call to verify your key, model and quota.`);
  }
  const usingGoogle = modelConfig?.provider.id === 'google';
  status('Gemini API key', usingGoogle ? (problems.length === 0 ? 'PASS' : 'FAIL') : 'NOT REQUIRED', usingGoogle ? (problems.length === 0 ? 'set' : 'see Model provider above') : `provider is ${modelConfig?.provider.id ?? process.env.MODEL_PROVIDER}`);
} else {
  status('Gemini API key', 'NOT REQUIRED', path === 'antigravity' ? 'Antigravity uses your Google account sign-in' : '');
}

// OpenLore
if (live) {
  const remote = readRemote();
  const binary = findBinary();
  if (remote) status('OpenLore binary', 'NOT REQUIRED', `using paired server ${remote.endpoint}`);
  else if (binary?.version === LOCK.version) status('OpenLore binary', 'PASS', `${binary.version} (${binary.source})`);
  else if (binary) status('OpenLore binary', 'WARN', `found ${binary.version}; workshop pinned to ${LOCK.version}`);
  else {
    status('OpenLore binary', 'FAIL', 'not installed');
    blocking.push('Run `npm run setup` to install the pinned OpenLore release');
  }

  if (remote || serverRunning()) {
    try {
      const agent = path === 'harness' ? 'harness' : (config.agent ?? 'generic');
      const readerAccess = accessFor(agent, 'read');
      const captureAccess = accessFor(agent, 'capture');
      const reader = clientFor(readerAccess, 'doctor');
      const readerView = await reader.exec('lore docsets');
      await reader.close();
      const capture = clientFor(captureAccess, 'doctor');
      const captureView = await capture.exec('lore docsets');
      await capture.close();
      const readerOk = readerView.exitCode === 0 && readerView.stdout.includes('knowledge') && !readerView.stdout.includes('proposals');
      const captureOk = captureView.exitCode === 0 && /proposals\s+publish/.test(captureView.stdout);
      let maintainerOk = true;
      if (!remote) {
        const maintainer = maintainerClient();
        maintainerOk = (await maintainer.exec('test -d /knowledge')).exitCode === 0;
        await maintainer.close();
      }
      if (readerOk && captureOk && maintainerOk) status('OpenLore connection', 'PASS', `${remote ? remote.endpoint : `localhost:${ports().http}`}; ${readerAccess.identity} reads /knowledge, ${captureAccess.identity} publishes to the inbox`);
      else {
        status('OpenLore connection', 'FAIL', 'unexpected access rights; rerun `npm run lore:start`');
        blocking.push('OpenLore access check failed');
      }
    } catch (error) {
      status('OpenLore connection', 'FAIL', (error as Error).message.slice(0, 120));
      blocking.push('Could not talk to OpenLore');
    }
  } else {
    const busy = (await portInUse(ports().http)) ? ` (port ${ports().http} is busy: another process?)` : '';
    status('OpenLore connection', 'WARN', `not running${busy}; needed from Exercise 02`);
    advice.push(`Start the knowledge server before Exercise 02: ${command('npm run lore:start')}`);
  }
} else {
  status('OpenLore', 'NOT REQUIRED', 'replay uses recorded knowledge snapshots');
}

// Exercise fixtures
try {
  for (const slug of ['01-amnesiac-agent', '02-capture-knowledge', '03-share-knowledge']) readPromptBlock(join(EXERCISES_DIR, slug, 'task.md'));
  const checkpointOk = existsSync(join(EXERCISES_DIR, '02-capture-knowledge', 'checkpoints', 'knowledge'));
  const graderOk = existsSync(join(ROOT, 'evaluation', 'graders', 'refund-grader.test.ts'));
  const hash = hashSnapshot(CORE_APP);
  if (checkpointOk && graderOk) status('Exercise fixtures', 'PASS', `prompts, checkpoints and grader present; snapshot ${hash.slice(0, 12)}`);
  else {
    status('Exercise fixtures', 'FAIL', 'missing checkpoint or grader files');
    blocking.push('Repository files are missing; re-clone the workshop');
  }
} catch (error) {
  status('Exercise fixtures', 'FAIL', (error as Error).message);
  blocking.push('Exercise prompts are unreadable');
}

// Recordings (required for replay, useful as a fallback for everyone)
const recordings = availableRecordings(RECORDINGS_DIR);
if (recordings.length > 0) status('Replay recordings', 'PASS', recordings.map((r) => `${r.name} (${r.provenance.provider ?? '?'}/${r.provenance.model ?? '?'})`).join(', '));
else if (path === 'replay') {
  status('Replay recordings', 'FAIL', 'no genuine recordings in recordings/ yet');
  blocking.push('This copy of the workshop has no recordings. Ask the instructor for the recorded bundle, or pair with someone.');
} else status('Replay recordings', 'WARN', 'none yet (instructor records them with `npm run record`)');

if (path === 'antigravity' || path === 'external') {
  advice.push(`Exercises print a prompt and a workspace to open in your agent: ${command('npm run exercise -- 01')}`);
}

console.log('');
if (blocking.length === 0) console.log(c.green(c.bold('You are ready to begin Exercise 01.')) + `  ${command('npm run exercise -- 01')}`);
else {
  console.log(c.red(c.bold('Not ready yet:')));
  for (const item of blocking) console.log(`  ${c.red('•')} ${item}`);
  console.log(c.dim(path === 'replay' ? '\nStuck? Pair with a neighbour.' : `\nStuck? Switch to replay (${command('npm run setup -- --path replay')}) or pair with a neighbour.`));
}
for (const item of advice) console.log(c.dim(`• `) + item);
console.log('');
process.exitCode = blocking.length === 0 ? 0 : 1;
