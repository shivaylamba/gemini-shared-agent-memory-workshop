import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mcpUrlOf } from '../../agent-harness/src/openlore-client.ts';
import { copySnapshot, hashSnapshot } from '../../evaluation/snapshot.ts';
import type { ExternalAgent } from './env.ts';
import type { LoreAccess } from './openlore.ts';
import { CORE_APP, externalWorkspacesDir } from './paths.ts';

export type ExternalCondition = 'baseline' | 'capture' | 'shared-memory';

export interface WorkspaceMarker {
  exercise: '01' | '02' | '03';
  condition: ExternalCondition;
  agent: ExternalAgent;
  preparedAt: string;
  snapshotHash: string;
  openlore: { enabled: boolean; identity?: string; scope?: 'read' | 'full'; endpoint?: string };
}

export const MARKER_FILE = '.workshop-run.json';

export function externalWorkspacePath(exercise: string, condition: ExternalCondition): string {
  return join(externalWorkspacesDir(), `${exercise}-${condition}`);
}

/** Fresh copy of the starting snapshot outside the repository, plus a small marker file. */
export function prepareExternalWorkspace(exercise: '01' | '02' | '03', condition: ExternalCondition, agent: ExternalAgent, lore?: LoreAccess): { dir: string; marker: WorkspaceMarker; configFiles: string[] } {
  const dir = externalWorkspacePath(exercise, condition);
  copySnapshot(CORE_APP, dir);
  const marker: WorkspaceMarker = {
    exercise,
    condition,
    agent,
    preparedAt: new Date().toISOString(),
    snapshotHash: hashSnapshot(dir),
    openlore: lore ? { enabled: true, identity: lore.identity, scope: lore.scope, endpoint: lore.endpoint } : { enabled: false },
  };
  writeFileSync(join(dir, MARKER_FILE), `${JSON.stringify(marker, null, 2)}\n`);
  const configFiles = lore ? writeAgentMcpConfig(dir, agent, lore) : [];
  return { dir, marker, configFiles };
}

export function readMarker(dir: string): WorkspaceMarker | undefined {
  const file = join(dir, MARKER_FILE);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as WorkspaceMarker) : undefined;
}

/**
 * Project-scoped MCP configuration, using each client's documented format:
 *  - Antigravity: <workspace>/.agents/mcp_config.json  { mcpServers: { name: { serverUrl, headers } } }
 *    (the docs do not mention environment-variable expansion, so the token is written into the file)
 *  - Claude Code: <workspace>/.mcp.json  { mcpServers: { name: { type: "http", url, headers } } }
 *    with ${OPENLORE_TOKEN} expansion, plus .claude/settings.json allowing the mcp__openlore tools
 *  - Codex: <workspace>/.codex/config.toml  [mcp_servers.name] url + bearer_token_env_var
 *    (project config is loaded for trusted projects only)
 */
export function writeAgentMcpConfig(dir: string, agent: ExternalAgent, lore: LoreAccess): string[] {
  const url = mcpUrlOf(lore.endpoint);
  const files: string[] = [];
  if (agent === 'antigravity') {
    mkdirSync(join(dir, '.agents'), { recursive: true });
    const file = join(dir, '.agents', 'mcp_config.json');
    writeFileSync(file, `${JSON.stringify({ mcpServers: { openlore: { serverUrl: url, headers: { Authorization: `Bearer ${lore.token}` } } } }, null, 2)}\n`, { mode: 0o600 });
    files.push(file);
  } else if (agent === 'claude-code') {
    const file = join(dir, '.mcp.json');
    writeFileSync(file, `${JSON.stringify({ mcpServers: { openlore: { type: 'http', url, headers: { Authorization: 'Bearer ${OPENLORE_TOKEN}' } } } }, null, 2)}\n`);
    mkdirSync(join(dir, '.claude'), { recursive: true });
    const settings = join(dir, '.claude', 'settings.json');
    writeFileSync(settings, `${JSON.stringify({ enabledMcpjsonServers: ['openlore'], permissions: { allow: ['mcp__openlore'] } }, null, 2)}\n`);
    files.push(file, settings);
  } else if (agent === 'codex') {
    mkdirSync(join(dir, '.codex'), { recursive: true });
    const file = join(dir, '.codex', 'config.toml');
    writeFileSync(file, `[mcp_servers.openlore]\nurl = "${url}"\nbearer_token_env_var = "OPENLORE_TOKEN"\n`);
    files.push(file);
  }
  return files;
}

/** How to launch each agent in the prepared workspace. */
export function launchInstructions(agent: ExternalAgent, dir: string, withLore: boolean, tokenCommand: string): string[] {
  switch (agent) {
    case 'antigravity':
      return [
        `Open this folder in Antigravity (App, IDE or \`agy\` CLI) and start a NEW conversation:`,
        `  ${dir}`,
        withLore
          ? 'OpenLore is configured for this workspace in .agents/mcp_config.json. Check it is connected (CLI: /mcp; App: Customizations › Installed › MCP Servers).'
          : 'Baseline: make sure no "openlore" MCP server is enabled in your global ~/.gemini/config/mcp_config.json.',
      ];
    case 'claude-code':
      return withLore
        ? [`cd "${dir}"`, `OPENLORE_TOKEN="$(${tokenCommand})" claude`, 'Approve the project MCP server "openlore" when asked; check with /mcp.']
        : [`cd "${dir}"`, 'claude', 'Baseline: `claude mcp list` must not show an "openlore" server for this folder or your user scope.'];
    case 'codex':
      return withLore
        ? [`cd "${dir}"`, `OPENLORE_TOKEN="$(${tokenCommand})" codex`, 'Trust the project when asked (needed for .codex/config.toml); `codex mcp list` should show "openlore".']
        : [`cd "${dir}"`, 'codex', 'Baseline: `codex mcp list` must not show an "openlore" server.'];
    case 'generic':
      return withLore
        ? [`Open ${dir} in your agent.`, 'Add a Streamable HTTP MCP server named "openlore":', `  URL:    (see below)`, `  Header: Authorization: Bearer <token from \`${tokenCommand}\`>`]
        : [`Open ${dir} in your agent with no OpenLore MCP server configured.`];
  }
}

export interface PreparedExternalExercise {
  exercise: '01' | '02' | '03';
  condition: ExternalCondition;
  agent: ExternalAgent;
  dir: string;
  prompt: string;
  launch: string[];
  configFiles: string[];
  openlore: { identity: string; scope: 'read' | 'full'; mcpUrl: string; tokenCommand: string } | null;
  warnings: string[];
}

/**
 * Prepares a clean external-agent workspace for an exercise and returns everything
 * the participant needs (shared by `npm run exercise -- NN --mode external` and the dashboard).
 */
export async function prepareExternalExercise(exercise: '01' | '02' | '03', agent: ExternalAgent, deps: {
  condition: ExternalCondition;
  root: string;
  serverRunning: () => boolean;
  remote: () => unknown;
  access: (agent: string, purpose: 'capture' | 'read') => LoreAccess;
  approvedCount: (agent: string) => Promise<number>;
  prompt: string;
}): Promise<PreparedExternalExercise> {
  const { condition } = deps;
  const warnings: string[] = [];
  let access: LoreAccess | undefined;
  if (condition !== 'baseline') {
    if (!deps.serverRunning() && !deps.remote()) throw new Error('OpenLore is not running. Start it with npm run lore:start.');
    if (condition === 'shared-memory' && (await deps.approvedCount(agent)) <= 1) {
      warnings.push('/knowledge is nearly empty. Review proposals (npm run lore:review) or run npm run checkpoint -- 02.');
    }
    access = deps.access(agent, condition === 'capture' ? 'capture' : 'read');
  } else if (deps.serverRunning()) {
    warnings.push('OpenLore is running. For a true baseline your agent must not have an "openlore" MCP server configured (this workspace has none).');
  }
  const { dir, configFiles } = prepareExternalWorkspace(exercise, condition, agent, access);
  const tokenCommand = `npm run -s --prefix "${deps.root}" lore:token -- ${agent} ${condition === 'capture' ? 'capture' : 'read'}`;
  return {
    exercise,
    condition,
    agent,
    dir,
    prompt: deps.prompt,
    launch: launchInstructions(agent, dir, Boolean(access), tokenCommand),
    configFiles,
    openlore: access ? { identity: access.identity, scope: access.scope, mcpUrl: mcpUrlOf(access.endpoint), tokenCommand } : null,
    warnings,
  };
}
