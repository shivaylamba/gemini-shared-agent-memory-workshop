import { chmodSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './paths.ts';

export const ENV_FILE = join(ROOT, '.env');

export function ensureEnvFile(): void {
  if (!existsSync(ENV_FILE)) copyFileSync(join(ROOT, '.env.example'), ENV_FILE);
}

/** Sets KEY=value in .env, replacing an existing line or appending one. */
export function setEnvValue(key: string, value: string): void {
  ensureEnvFile();
  const lines = readFileSync(ENV_FILE, 'utf8').split(/\r?\n/);
  const index = lines.findIndex((line) => line.replace(/^\s*#\s*/, '').startsWith(`${key}=`));
  const entry = `${key}=${value}`;
  if (index >= 0) lines[index] = entry;
  else lines.push(entry);
  writeFileSync(ENV_FILE, lines.join('\n').replace(/\n*$/, '\n'), { mode: 0o600 });
  if (process.platform !== 'win32') chmodSync(ENV_FILE, 0o600);
  process.env[key] = value;
}
