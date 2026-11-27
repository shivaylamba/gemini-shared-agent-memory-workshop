import './lib/load-env.ts';
import { networkInterfaces } from 'node:os';
import { OpenLoreClient } from '../agent-harness/src/openlore-client.ts';
import { captureIdentity, ports, readerIdentity, readRemote, serverRunning, tokenFor, writeRemote } from './lib/openlore.ts';
import { box, c, command, fail, parseArgs } from './lib/ui.ts';

/**
 * Pairing two laptops on ONE OpenLore server (optional, P1).
 *   host:     npm run lore:pair -- invite            prints a join command with short-lived partner tokens
 *   partner:  npm run lore:pair -- join <url> --reader <token> --capture <token>
 *   partner:  npm run lore:pair -- leave             go back to the local server
 *
 * Security: the server always requires tokens (no anonymous access). Partner tokens
 * belong to dedicated identities (partner-capture can only publish into the inbox,
 * partner-reader can only read /knowledge) and expire after 4 hours. Traffic is plain
 * HTTP on the local network, so tokens can be observed by others on the same Wi-Fi.
 * Prefer the one-laptop demo unless you are on a network you trust.
 */
const { positional, flags } = parseArgs(process.argv.slice(2));
const action = positional[0];

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i): i is NonNullable<typeof i> => Boolean(i && i.family === 'IPv4' && !i.internal))
    .map((i) => i.address);
}

if (action === 'invite') {
  if (!serverRunning()) fail('Start your OpenLore server first.', command('npm run lore:start'));
  const reader = tokenFor(readerIdentity('partner'), 'read', 4);
  const capture = tokenFor(captureIdentity('partner'), 'full', 4);
  const host = typeof flags.host === 'string' ? flags.host : lanAddresses()[0];
  if (!host) fail('Could not find a LAN address.', 'Pass --host <your-ip>.');
  box('Pairing invite (valid 4 hours)', [
    `Partner runs this in their copy of the workshop:`,
    '',
    `npm run lore:pair -- join http://${host}:${ports().http} --reader ${reader.slice(0, 12)}… --capture ${capture.slice(0, 12)}…`,
    '',
    c.yellow('Plain HTTP on the local network: anyone on this Wi-Fi could observe the tokens.'),
    c.yellow('Share the full command privately (it is printed below, not in this box).'),
  ]);
  console.log(`\nnpm run lore:pair -- join http://${host}:${ports().http} --reader ${reader} --capture ${capture}\n`);
  console.log(c.dim('If the partner cannot connect, your firewall may block the port; use the one-laptop demo instead.'));
} else if (action === 'join') {
  const endpoint = positional[1];
  if (!endpoint || typeof flags.reader !== 'string' || typeof flags.capture !== 'string') fail('Usage: npm run lore:pair -- join <url> --reader <token> --capture <token>');
  const client = new OpenLoreClient({ endpoint: endpoint!, token: flags.reader as string, clientName: 'pair-check' });
  try {
    const result = await client.exec('lore docsets');
    if (result.exitCode !== 0) fail('Connected, but the reader token was refused.', result.stderr);
  } catch (error) {
    fail(`Could not reach ${endpoint}: ${(error as Error).message}`, 'Check the address, that both laptops are on the same network, and the host firewall.');
  } finally {
    await client.close();
  }
  writeRemote({ endpoint: endpoint!, readerToken: flags.reader as string, captureToken: flags.capture as string });
  console.log(c.green(`✔ Paired with ${endpoint}. Exercises 02 and 03 now use the shared server (identities partner-capture / partner-reader).`));
} else if (action === 'leave') {
  writeRemote(undefined);
  console.log(c.green('✔ Using the local OpenLore server again.'));
} else {
  const remote = readRemote();
  console.log(remote ? `Paired with ${remote.endpoint}` : 'Not paired (using the local server).');
  console.log(c.dim('Usage: npm run lore:pair -- invite | join <url> --reader <t> --capture <t> | leave'));
}
