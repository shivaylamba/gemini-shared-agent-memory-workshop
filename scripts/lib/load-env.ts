import { loadDotEnv } from './env.ts';

/**
 * Side-effect import: loads .env before any other module of a command runs.
 * Every CLI entry point imports this first, so settings and keys from
 * `npm run setup` apply without exporting them in the shell.
 */
loadDotEnv();
