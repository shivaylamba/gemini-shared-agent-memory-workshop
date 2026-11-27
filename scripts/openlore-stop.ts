import './lib/load-env.ts';
import { stopServer } from './lib/openlore.ts';
import { c } from './lib/ui.ts';

const stopped = await stopServer();
console.log(stopped ? c.green('✔ OpenLore stopped.') : c.dim('OpenLore was not running.'));
