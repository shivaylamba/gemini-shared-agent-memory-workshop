import './lib/load-env.ts';
import { accessFor } from './lib/openlore.ts';

/**
 * Prints ONLY a token, for use in shell substitution:
 *   OPENLORE_TOKEN="$(npm run -s lore:token -- claude-code read)" claude
 * capture → <agent>-capture identity, full scope (can publish into the inbox)
 * read    → <agent>-reader identity, read scope (approved /knowledge only)
 */
const [agent = 'generic', purpose = 'read'] = process.argv.slice(2);
try {
  process.stdout.write(accessFor(agent, purpose === 'capture' ? 'capture' : 'read').token);
} catch (error) {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(1);
}
