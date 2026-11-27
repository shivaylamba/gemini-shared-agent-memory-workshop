import './lib/load-env.ts';
import { AGENT_IDENTITIES, accessFor, clientFor, maintainerClient, serverRunning, readRemote } from './lib/openlore.ts';
import { c, fail, parseArgs } from './lib/ui.ts';

/**
 * Runs one command in OpenLore's restricted shell through MCP (`lore_bash`), as a
 * chosen identity. Examples:
 *   npm run lore -- "ls -R /knowledge"
 *   npm run lore -- --as maintainer "lore history /knowledge/decisions/refund-idempotency.md"
 *   npm run lore -- --as harness-capture "ls /proposals/inbox"
 */
const { positional, flags } = parseArgs(process.argv.slice(2));
const command = positional.join(' ').trim();
if (!command) {
  console.log(`Usage: npm run lore -- [--as <identity>] "<command>"\n
Identities: maintainer, <agent>-reader, <agent>-capture  (agents: ${AGENT_IDENTITIES.join(', ')})
Default identity: harness-reader (read-only).`);
  process.exit(0);
}
if (!serverRunning() && !readRemote()) fail('OpenLore is not running.', 'Start it with `npm run lore:start`.');

const as = typeof flags.as === 'string' ? flags.as : 'harness-reader';
let client;
if (as === 'maintainer') client = maintainerClient();
else {
  const match = /^(.*)-(reader|capture)$/.exec(as);
  if (!match) fail(`Unknown identity "${as}".`, 'Use maintainer, <agent>-reader or <agent>-capture.');
  client = clientFor(accessFor(match![1]!, match![2] === 'capture' ? 'capture' : 'read'), 'workshop-cli');
}

try {
  console.log(c.dim(`openlore (${as})$ ${command}`));
  const result = await client.exec(command);
  if (result.stdout) process.stdout.write(result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n`);
  if (result.stderr) process.stderr.write(c.yellow(result.stderr));
  process.exitCode = result.exitCode;
} catch (error) {
  fail((error as Error).message);
} finally {
  await client.close();
}
