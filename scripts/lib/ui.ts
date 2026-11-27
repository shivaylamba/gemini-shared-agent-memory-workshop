import { createInterface, type Interface } from 'node:readline/promises';
import { Writable } from 'node:stream';

const useColour = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code: string) => (text: string) => (useColour ? `\x1b[${code}m${text}\x1b[0m` : text);

export const c = {
  bold: wrap('1'),
  dim: wrap('2'),
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  blue: wrap('34'),
  magenta: wrap('35'),
  cyan: wrap('36'),
};

export function heading(text: string): void {
  console.log(`\n${c.bold(text)}\n${c.dim('─'.repeat(Math.min(72, text.length + 4)))}`);
}

export function status(label: string, state: 'PASS' | 'WARN' | 'FAIL' | 'SKIP' | 'INFO' | 'NOT REQUIRED', detail = ''): void {
  const colour = state === 'PASS' ? c.green : state === 'FAIL' ? c.red : state === 'WARN' ? c.yellow : c.dim;
  console.log(`  ${label.padEnd(26)} ${colour(state.padEnd(12))} ${c.dim(detail)}`);
}

export function command(cmd: string): string {
  return c.cyan(cmd);
}

export function box(title: string, lines: string[]): void {
  const width = Math.min(120, Math.max(title.length, ...lines.map((l) => stripAnsi(l).length)) + 4);
  console.log(c.dim(`┌${'─'.repeat(width - 2)}┐`));
  console.log(`${c.dim('│')} ${c.bold(title)}${' '.repeat(Math.max(0, width - 3 - title.length))}${c.dim('│')}`);
  console.log(c.dim(`├${'─'.repeat(width - 2)}┤`));
  for (const line of lines) {
    const pad = Math.max(0, width - 3 - stripAnsi(line).length);
    console.log(`${c.dim('│')} ${line}${' '.repeat(pad)}${c.dim('│')}`);
  }
  console.log(c.dim(`└${'─'.repeat(width - 2)}┘`));
}

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

export function fail(message: string, hint?: string): never {
  console.error(`\n${c.red('✖')} ${message}`);
  if (hint) console.error(`  ${c.dim(hint)}`);
  process.exit(1);
}

export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith('--')) {
      const [key, inline] = arg.slice(2).split('=', 2) as [string, string | undefined];
      if (inline !== undefined) flags[key] = inline;
      else if (argv[i + 1] && !argv[i + 1]!.startsWith('--')) flags[key] = argv[++i]!;
      else flags[key] = true;
    } else positional.push(arg);
  }
  return { positional, flags };
}

export function interactive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY) && !process.env.CI;
}

let shared: Interface | undefined;
let closed = false;
let resetting = false;

/** One readline interface for the whole command, so typed-ahead answers are not lost. */
function prompt(): Interface | undefined {
  if (closed) return undefined;
  if (!shared) {
    shared = createInterface({ input: process.stdin, output: process.stdout });
    shared.on('close', () => {
      if (!resetting) closed = true;
    });
    process.once('beforeExit', () => shared?.close());
  }
  return shared;
}

export async function ask(question: string, fallback = ''): Promise<string> {
  if (!interactive()) return fallback;
  const rl = prompt();
  if (!rl) return fallback;
  try {
    const answer = (await rl.question(`${question} `)).trim();
    return answer || fallback;
  } catch {
    // Ctrl+D / Ctrl+C at a prompt: keep the default instead of crashing.
    return fallback;
  }
}

/**
 * Like ask(), but nothing typed or pasted is echoed: keys never appear on a
 * projected screen or in a terminal recording. Uses its own readline whose
 * output is muted after the question is printed (the terminal is in raw mode,
 * so the kernel does not echo either).
 */
export async function askSecret(question: string): Promise<string> {
  if (!interactive()) return '';
  if (shared) {
    resetting = true;
    shared.close();
    shared = undefined;
    resetting = false;
  }
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  try {
    process.stdout.write(`${question} `);
    muted = true;
    return (await rl.question('')).trim();
  } catch {
    return '';
  } finally {
    rl.close();
    process.stdout.write('\n');
  }
}

export function closePrompts(): void {
  shared?.close();
}

export async function confirm(question: string, assumeYes: boolean): Promise<boolean> {
  if (assumeYes) return true;
  if (!interactive()) return false;
  const answer = (await ask(`${question} [y/N]`, 'n')).toLowerCase();
  return answer === 'y' || answer === 'yes';
}

export async function choose<T extends string>(question: string, options: { value: T; label: string }[], fallback: T): Promise<T> {
  console.log(`\n${c.bold(question)}\n`);
  options.forEach((option, index) => console.log(`  ${c.cyan(String(index + 1))}. ${option.label}`));
  const answer = await ask(`\nChoose 1-${options.length}:`, '');
  const index = Number(answer) - 1;
  return options[index]?.value ?? options.find((o) => o.value === answer)?.value ?? fallback;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return 'unavailable';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return 'unavailable';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}
