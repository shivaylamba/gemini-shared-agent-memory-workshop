import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { OpenLoreClient } from '../../agent-harness/src/openlore-client.ts';
import { loadDotEnv } from './env.ts';
import {
  BIN_DIR,
  OPENLORE_AUTH,
  OPENLORE_CONFIG,
  OPENLORE_DIR,
  OPENLORE_LOG,
  OPENLORE_PID,
  OPENLORE_SERVED,
  OPENLORE_SRC,
  OPENLORE_STATE,
  OPENLORE_TOKENS,
} from './paths.ts';

export interface LockFile {
  version: string;
  tag: string;
  downloadBase: string;
  assets: Record<string, { file: string; sha256: string }>;
}

export const LOCK: LockFile = JSON.parse(readFileSync(join(OPENLORE_SRC, 'openlore.lock.json'), 'utf8'));

/** Agents that get their own OpenLore identities, so `lore history` shows who wrote what. */
export const AGENT_IDENTITIES = ['harness', 'antigravity', 'claude-code', 'codex', 'generic', 'partner'] as const;
export type AgentIdentity = (typeof AGENT_IDENTITIES)[number];

export function captureIdentity(agent: string): string {
  return `${agent}-capture`;
}
export function readerIdentity(agent: string): string {
  return `${agent}-reader`;
}

export function ports(): { http: number; ssh: number } {
  loadDotEnv();
  return { http: Number(process.env.OPENLORE_HTTP_PORT || 7420), ssh: Number(process.env.OPENLORE_SSH_PORT || 7422) };
}

export function localEndpoint(): string {
  return `http://localhost:${ports().http}`;
}

// ---------------------------------------------------------------- binary

export function platformKey(): string {
  return `${process.platform}-${process.arch}`;
}

export function binaryName(): string {
  return process.platform === 'win32' ? 'openlore.exe' : 'openlore';
}

export interface BinaryInfo {
  path: string;
  version?: string;
  source: 'OPENLORE_BIN' | 'workshop' | 'PATH';
}

function versionOf(path: string): string | undefined {
  const result = spawnSync(path, ['version'], { encoding: 'utf8', timeout: 10_000 });
  if (result.status !== 0) return undefined;
  return /openlore\s+(\S+)/.exec(result.stdout)?.[1];
}

/** Finds the OpenLore binary: OPENLORE_BIN, then .workshop/bin, then PATH. */
export function findBinary(): BinaryInfo | undefined {
  loadDotEnv();
  const candidates: BinaryInfo[] = [];
  if (process.env.OPENLORE_BIN) candidates.push({ path: process.env.OPENLORE_BIN, source: 'OPENLORE_BIN' });
  candidates.push({ path: join(BIN_DIR, binaryName()), source: 'workshop' });
  candidates.push({ path: binaryName(), source: 'PATH' });
  for (const candidate of candidates) {
    if (candidate.source !== 'PATH' && !existsSync(candidate.path)) continue;
    const version = versionOf(candidate.path);
    if (version) return { ...candidate, version };
  }
  return undefined;
}

export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * Downloads the pinned release for this platform, verifies its SHA-256 and
 * extracts `openlore` and `lore` into .workshop/bin. OPENLORE_ARCHIVE can point
 * at an already-downloaded archive (offline installs); it is verified the same way.
 */
export async function installBinary(log: (line: string) => void): Promise<BinaryInfo> {
  const asset = LOCK.assets[platformKey()];
  if (!asset) throw new Error(`No pinned OpenLore build for ${platformKey()}. Supported: ${Object.keys(LOCK.assets).join(', ')}`);
  mkdirSync(BIN_DIR, { recursive: true });
  const archive = join(BIN_DIR, asset.file);

  if (process.env.OPENLORE_ARCHIVE) {
    cpSync(process.env.OPENLORE_ARCHIVE, archive);
    log(`Using archive from OPENLORE_ARCHIVE (${process.env.OPENLORE_ARCHIVE})`);
  } else {
    const url = `${LOCK.downloadBase}/${asset.file}`;
    log(`Downloading ${url}`);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
    writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  }

  const actual = sha256File(archive);
  if (actual !== asset.sha256) {
    rmSync(archive, { force: true });
    throw new Error(`Checksum mismatch for ${asset.file}: expected ${asset.sha256}, got ${actual}`);
  }
  log(`SHA-256 verified (${actual.slice(0, 16)}…)`);

  const extract = spawnSync('tar', [asset.file.endsWith('.zip') ? '-xf' : '-xzf', asset.file, binaryName(), process.platform === 'win32' ? 'lore.exe' : 'lore'], { cwd: BIN_DIR, encoding: 'utf8' });
  if (extract.status !== 0) throw new Error(`Could not extract ${asset.file}: ${extract.stderr || extract.error?.message}`);
  rmSync(archive, { force: true });
  if (process.platform !== 'win32') chmodSync(join(BIN_DIR, binaryName()), 0o755);
  const info = findBinary();
  if (!info || info.version !== LOCK.version) throw new Error(`Installed binary reports version ${info?.version ?? 'unknown'}, expected ${LOCK.version}`);
  return info;
}

// ---------------------------------------------------------------- configuration

export function buildLoreJson(): Record<string, unknown> {
  const identities: Record<string, unknown>[] = [];
  for (const agent of AGENT_IDENTITIES) {
    identities.push({ name: captureIdentity(agent), comment: `${agent}: proposes knowledge into the review inbox`, roles: ['contributor'] });
    identities.push({ name: readerIdentity(agent), comment: `${agent}: reads approved knowledge only`, roles: ['reader'] });
  }
  identities.push({ name: 'maintainer', comment: 'Human reviewer: promotes or rejects proposals', roles: ['maintainer'] });
  return {
    allow_keyless: false,
    unknown_identity: 'deny',
    default_cwd: '/knowledge',
    roles: {
      reader: { comment: 'Read approved knowledge' },
      contributor: { comment: 'Read approved knowledge and publish proposals into the inbox' },
      maintainer: { comment: 'Review proposals and maintain approved knowledge' },
    },
    docsets: {
      knowledge: { paths: ['/knowledge'], access: { allow: { reader: 'ro', contributor: 'ro', maintainer: 'rw' } } },
      proposals: { paths: ['/proposals'], inbox: 'inbox', access: { allow: { contributor: 'publish', maintainer: 'rw' } } },
    },
    identities,
  };
}

/** Writes openlore.yml and lore.json, and seeds the served folder the first time. */
export function writeServerConfig(): void {
  const { http, ssh } = ports();
  mkdirSync(OPENLORE_STATE, { recursive: true });
  const template = readFileSync(join(OPENLORE_SRC, 'config', 'openlore.yml.template'), 'utf8');
  writeFileSync(OPENLORE_CONFIG, template.replaceAll('{{HTTP_PORT}}', String(http)).replaceAll('{{SSH_PORT}}', String(ssh)));
  writeFileSync(OPENLORE_AUTH, `${JSON.stringify(buildLoreJson(), null, 2)}\n`);
  if (!existsSync(OPENLORE_SERVED)) seedServedFolder();
}

export function seedServedFolder(): void {
  rmSync(OPENLORE_SERVED, { recursive: true, force: true });
  mkdirSync(OPENLORE_SERVED, { recursive: true });
  cpSync(join(OPENLORE_SRC, 'seed-knowledge'), OPENLORE_SERVED, { recursive: true });
}

// ---------------------------------------------------------------- server process

export function readPid(): number | undefined {
  if (!existsSync(OPENLORE_PID)) return undefined;
  const pid = Number(readFileSync(OPENLORE_PID, 'utf8').trim());
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => server.close(() => resolve(false)));
    server.listen(port);
  });
}

export async function httpReachable(endpoint: string): Promise<boolean> {
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(2_000) });
    return response.status > 0;
  } catch {
    return false;
  }
}

export async function startServer(binary: BinaryInfo): Promise<{ pid: number; alreadyRunning: boolean }> {
  const existing = readPid();
  if (existing && isAlive(existing)) return { pid: existing, alreadyRunning: true };
  const { http, ssh } = ports();
  for (const port of [http, ssh]) {
    if (await portInUse(port)) {
      throw new Error(`Port ${port} is already in use. Stop the other process or set OPENLORE_HTTP_PORT / OPENLORE_SSH_PORT in .env.`);
    }
  }
  writeServerConfig();
  const out = openSync(OPENLORE_LOG, 'a');
  const child = spawn(binary.path, ['-c', OPENLORE_CONFIG, OPENLORE_SERVED], {
    cwd: OPENLORE_DIR,
    detached: true,
    stdio: ['ignore', out, out],
    windowsHide: true,
  });
  child.unref();
  if (!child.pid) throw new Error('Could not start OpenLore');
  writeFileSync(OPENLORE_PID, String(child.pid));
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (!isAlive(child.pid)) throw new Error(`OpenLore exited during start-up. See ${OPENLORE_LOG}`);
    if (await httpReachable(`http://127.0.0.1:${http}/`)) return { pid: child.pid, alreadyRunning: false };
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`OpenLore did not answer on port ${http} within 15 s. See ${OPENLORE_LOG}`);
}

export async function stopServer(): Promise<boolean> {
  const pid = readPid();
  if (!pid) return false;
  let stopped = false;
  if (isAlive(pid)) {
    process.kill(pid);
    for (let i = 0; i < 40 && isAlive(pid); i++) await new Promise((r) => setTimeout(r, 100));
    if (isAlive(pid)) process.kill(pid, 'SIGKILL');
    stopped = true;
  }
  rmSync(OPENLORE_PID, { force: true });
  return stopped;
}

export function serverRunning(): boolean {
  const pid = readPid();
  return Boolean(pid && isAlive(pid));
}

// ---------------------------------------------------------------- tokens

export type TokenScope = 'read' | 'full';

interface StoredToken {
  identity: string;
  scope: TokenScope;
  token: string;
  expiresAt: string;
}

const TOKEN_TTL_HOURS = 12;

/**
 * Mints (or reuses) a short-lived token for a lore.json identity with
 * `openlore token mint`. `read` tokens can never write, whatever the identity's grants.
 */
export function tokenFor(identity: string, scope: TokenScope, ttlHours = TOKEN_TTL_HOURS): string {
  mkdirSync(OPENLORE_TOKENS, { recursive: true });
  const file = join(OPENLORE_TOKENS, `${identity}-${scope}.json`);
  if (existsSync(file)) {
    const stored = JSON.parse(readFileSync(file, 'utf8')) as StoredToken;
    if (Date.parse(stored.expiresAt) - Date.now() > 30 * 60_000) return stored.token;
  }
  const binary = findBinary();
  if (!binary) throw new Error('OpenLore is not installed. Run `npm run setup`.');
  if (!existsSync(OPENLORE_CONFIG)) writeServerConfig();
  const result = spawnSync(binary.path, ['token', 'mint', '--identity', identity, '--scope', scope, '--ttl', `${ttlHours}h`, '--config', OPENLORE_CONFIG], {
    cwd: OPENLORE_DIR,
    encoding: 'utf8',
    timeout: 15_000,
  });
  const token = result.stdout.trim();
  if (result.status !== 0 || !token) throw new Error(`openlore token mint failed for ${identity}: ${result.stderr.trim()}`);
  const stored: StoredToken = { identity, scope, token, expiresAt: new Date(Date.now() + ttlHours * 3_600_000).toISOString() };
  writeFileSync(file, JSON.stringify(stored), { mode: 0o600 });
  return token;
}

// ---------------------------------------------------------------- remote (paired) servers

export interface RemoteConfig {
  endpoint: string;
  /** Tokens issued by the host for this participant (see `npm run lore:pair`). */
  captureToken?: string;
  readerToken?: string;
}

const REMOTE_FILE = join(OPENLORE_DIR, 'remote.json');

export function readRemote(): RemoteConfig | undefined {
  loadDotEnv();
  if (existsSync(REMOTE_FILE)) return JSON.parse(readFileSync(REMOTE_FILE, 'utf8')) as RemoteConfig;
  if (process.env.OPENLORE_ENDPOINT && process.env.OPENLORE_ENDPOINT !== localEndpoint()) {
    return { endpoint: process.env.OPENLORE_ENDPOINT, captureToken: process.env.OPENLORE_CAPTURE_TOKEN, readerToken: process.env.OPENLORE_READER_TOKEN };
  }
  return undefined;
}

export function writeRemote(config: RemoteConfig | undefined): void {
  mkdirSync(OPENLORE_DIR, { recursive: true });
  if (!config) rmSync(REMOTE_FILE, { force: true });
  else writeFileSync(REMOTE_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export interface LoreAccess {
  endpoint: string;
  identity: string;
  scope: TokenScope;
  token: string;
  remote: boolean;
}

/** Credentials an agent should use: its capture identity (exercise 02) or reader identity (exercise 03). */
export function accessFor(agent: string, purpose: 'capture' | 'read'): LoreAccess {
  const remote = readRemote();
  if (remote) {
    const token = purpose === 'capture' ? remote.captureToken : remote.readerToken;
    if (!token) throw new Error(`The paired server did not provide a ${purpose} token. Ask the host to run \`npm run lore:pair -- invite\` again.`);
    return { endpoint: remote.endpoint, identity: purpose === 'capture' ? captureIdentity('partner') : readerIdentity('partner'), scope: purpose === 'capture' ? 'full' : 'read', token, remote: true };
  }
  const identity = purpose === 'capture' ? captureIdentity(agent) : readerIdentity(agent);
  const scope: TokenScope = purpose === 'capture' ? 'full' : 'read';
  return { endpoint: localEndpoint(), identity, scope, token: tokenFor(identity, scope), remote: false };
}

export function maintainerClient(): OpenLoreClient {
  return new OpenLoreClient({ endpoint: localEndpoint(), token: tokenFor('maintainer', 'full'), clientName: 'workshop-maintainer' });
}

export function clientFor(access: LoreAccess, clientName: string): OpenLoreClient {
  return new OpenLoreClient({ endpoint: access.endpoint, token: access.token, clientName });
}
