import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/**
 * Thin client for OpenLore's MCP-over-HTTP endpoint (verified against OpenLore v0.8.0):
 *   - tools: `lore_bash` { command } and `list_commands`
 *   - `lore_bash` returns structuredContent { stdout, stderr, exit_code, output }
 *   - each call runs in a fresh restricted shell (no host process execution)
 * Authentication: a bearer token minted with `openlore token mint` for a lore.json identity.
 */

export interface LoreResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class OpenLoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenLoreError';
  }
}

export interface OpenLoreClientOptions {
  /** Base URL, e.g. http://localhost:7420 (the client appends /mcp unless the URL already ends with it). */
  endpoint: string;
  token: string;
  clientName?: string;
  timeoutMs?: number;
}

export function mcpUrlOf(endpoint: string): string {
  const trimmed = endpoint.replace(/\/+$/, '');
  return trimmed.endsWith('/mcp') ? trimmed : `${trimmed}/mcp`;
}

export class OpenLoreClient {
  private client: Client | undefined;
  private readonly options: OpenLoreClientOptions;
  serverVersion: string | undefined;

  constructor(options: OpenLoreClientOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
    if (this.client) return;
    const transport = new StreamableHTTPClientTransport(new URL(mcpUrlOf(this.options.endpoint)), {
      requestInit: { headers: { Authorization: `Bearer ${this.options.token}` } },
    });
    const client = new Client({ name: this.options.clientName ?? 'shopflow-workshop', version: '1.0.0' });
    try {
      await client.connect(transport);
    } catch (error) {
      throw new OpenLoreError(`Could not connect to OpenLore at ${mcpUrlOf(this.options.endpoint)}: ${(error as Error).message}`);
    }
    this.client = client;
    this.serverVersion = client.getServerVersion()?.version;
  }

  async exec(command: string): Promise<LoreResult> {
    await this.connect();
    const result = await this.client!.callTool(
      { name: 'lore_bash', arguments: { command } },
      undefined,
      { timeout: this.options.timeoutMs ?? 30_000 },
    );
    if (result.isError) {
      const text = Array.isArray(result.content) ? result.content.map((c) => ('text' in c ? c.text : '')).join('\n') : '';
      throw new OpenLoreError(`lore_bash failed: ${text || 'unknown error'}`);
    }
    const structured = result.structuredContent as { stdout?: string; stderr?: string; exit_code?: number } | undefined;
    if (structured && typeof structured.exit_code === 'number') {
      return { stdout: structured.stdout ?? '', stderr: structured.stderr ?? '', exitCode: structured.exit_code };
    }
    const text = Array.isArray(result.content) ? result.content.map((c) => ('text' in c ? c.text : '')).join('') : '';
    return { stdout: text, stderr: '', exitCode: 0 };
  }

  async close(): Promise<void> {
    await this.client?.close().catch(() => undefined);
    this.client = undefined;
  }
}

/** Quotes a value for OpenLore's restricted shell using single quotes. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
