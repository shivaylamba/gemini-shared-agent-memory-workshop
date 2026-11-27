import './lib/load-env.ts';
import { findBinary, LOCK, localEndpoint, maintainerClient, ports, startServer } from './lib/openlore.ts';
import { OPENLORE_LOG, OPENLORE_SERVED } from './lib/paths.ts';
import { box, c, command, fail } from './lib/ui.ts';

const binary = findBinary();
if (!binary) fail('OpenLore is not installed.', 'Run `npm run setup` (it downloads and verifies the pinned release).');
if (binary.version !== LOCK.version) console.log(c.yellow(`! OpenLore ${binary.version} found at ${binary.path}; the workshop is pinned to ${LOCK.version}.`));

try {
  const { pid, alreadyRunning } = await startServer(binary);
  const client = maintainerClient();
  const docsets = await client.exec('lore docsets');
  await client.close();
  if (docsets.exitCode !== 0) fail('OpenLore started but the maintainer check failed.', docsets.stderr);
  const { http } = ports();
  box(alreadyRunning ? 'OpenLore is already running' : 'OpenLore started', [
    `Version     ${binary.version} (${binary.source}: ${binary.path})`,
    `PID         ${pid}`,
    `MCP         ${localEndpoint()}/mcp   (token required)`,
    `Served      ${OPENLORE_SERVED}`,
    `Docsets     /knowledge (approved, read-only for agents)   /proposals/inbox (review inbox)`,
    `Log         ${OPENLORE_LOG}`,
    '',
    `Note: OpenLore ${LOCK.version} listens on all interfaces (port ${http}); every HTTP call needs a token.`,
    '',
    `Try it      ${command('npm run lore -- "ls -R /knowledge"')}`,
    `Stop        ${command('npm run lore:stop')}`,
  ]);
} catch (error) {
  fail((error as Error).message);
}
