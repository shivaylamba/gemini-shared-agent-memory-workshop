import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Runs node:test files that import agent-written code in a constrained child process:
 *
 *  - Node permission model (--permission): file-system reads limited to the listed
 *    paths, no file-system writes outside a throwaway temp dir, no child processes,
 *    no worker threads, no native addons.
 *  - Scrubbed environment: only PATH plus explicitly passed variables, so no model
 *    API keys or OpenLore tokens reach agent code.
 *  - Hard wall-clock timeout; the process is killed when exceeded.
 *
 * Limitations (documented in docs/ARCHITECTURE.md): the Node 22 permission model
 * does not restrict network access, and it is not an OS-level sandbox.
 */

export interface TestCaseResult {
  name: string;
  file?: string;
  status: 'passed' | 'failed';
  durationMs: number;
  error?: string;
}

export interface TestRunResult {
  passed: number;
  failed: number;
  total: number;
  tests: TestCaseResult[];
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  /** Raw stderr (truncated); useful when a file fails to load. */
  stderr: string;
}

export interface RunNodeTestsOptions {
  cwd: string;
  /** Test files (absolute or relative to cwd). */
  files: string[];
  /** Extra readable paths besides cwd (e.g. the hidden grader file). */
  readPaths?: string[];
  env?: Record<string, string>;
  timeoutMs?: number;
}

const reporterPath = fileURLToPath(new URL('./json-reporter.mjs', import.meta.url));

let cachedIsolationFlag: string | undefined;

/** Node 22 calls it --experimental-test-isolation; Node 23.6+ renamed it to --test-isolation. Probe once. */
function isolationFlag(): string {
  if (cachedIsolationFlag) return cachedIsolationFlag;
  const probe = spawnSync(process.execPath, ['--test-isolation=none', '-e', ''], { stdio: 'ignore', timeout: 10_000 });
  cachedIsolationFlag = probe.status === 0 ? '--test-isolation=none' : '--experimental-test-isolation=none';
  return cachedIsolationFlag;
}

export async function runNodeTests(options: RunNodeTestsOptions): Promise<TestRunResult> {
  // Every path is resolved to its real path: the permission model compares real paths,
  // and macOS temp folders live behind a symlink (/var -> /private/var).
  const cwd = realpathSync(resolve(options.cwd));
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'shopflow-sandbox-')));
  const readable = [cwd, realpathSync(reporterPath), ...(options.readPaths ?? []).map((p) => realpathSync(resolve(p)))];
  const args = [
    '--permission',
    ...readable.map((p) => `--allow-fs-read=${p}`),
    `--allow-fs-write=${scratch}`,
    '--disable-warning=ExperimentalWarning',
    '--test',
    isolationFlag(),
    '--test-timeout=15000',
    `--test-reporter=${reporterPath}`,
    '--test-reporter-destination=stdout',
    ...options.files,
  ];
  const env: Record<string, string> = { PATH: process.env.PATH ?? '', TMPDIR: scratch, TMP: scratch, TEMP: scratch, NODE_ENV: 'test', ...options.env };
  if (process.platform === 'win32' && process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;

  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 60_000;

  return new Promise<TestRunResult>((resolvePromise) => {
    const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { if (stderr.length < 20_000) stderr += chunk.toString('utf8'); });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);

    child.on('close', (exitCode) => {
      clearTimeout(timer);
      rmSync(scratch, { recursive: true, force: true });
      const tests: TestCaseResult[] = [];
      for (const line of stdout.split('\n')) {
        if (!line.trim().startsWith('{')) continue;
        try {
          const parsed = JSON.parse(line) as TestCaseResult & { nesting?: number; skipped?: boolean };
          if (parsed.skipped) continue;
          tests.push({ name: parsed.name, file: parsed.file, status: parsed.status, durationMs: parsed.durationMs, error: parsed.error });
        } catch {
          // ignore non-JSON output
        }
      }
      const passed = tests.filter((t) => t.status === 'passed').length;
      const failed = tests.filter((t) => t.status === 'failed').length;
      resolvePromise({
        passed,
        failed,
        total: tests.length,
        tests,
        exitCode,
        timedOut,
        durationMs: Date.now() - started,
        stderr: stderr.slice(0, 8_000),
      });
    });
  });
}
