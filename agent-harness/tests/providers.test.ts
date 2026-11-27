import { createServer, type IncomingMessage, type Server } from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runAgent } from '../src/agent.ts';
import { createLanguageModel, PROVIDERS, resolveModelConfig } from '../src/providers/index.ts';
import { listFiles } from '../src/tools/list-files.ts';
import { Tracer } from '../src/tracing.ts';
import { Workspace } from '../src/workspace.ts';

/**
 * Provider adapter tests: the REAL AI SDK provider packages talk HTTP to a local
 * server that imitates each provider's API shape. This checks request routing,
 * credentials, tool declarations, tool-result round trips and usage parsing.
 * It does not prove live availability of any model (see `npm run smoke`).
 */

interface Captured { path: string; headers: IncomingMessage['headers']; body: any }

let server: Server | undefined;
afterEach(() => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())));

async function mockProvider(responses: unknown[]): Promise<{ baseURL: string; requests: Captured[] }> {
  const requests: Captured[] = [];
  let i = 0;
  server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    requests.push({ path: req.url ?? '', headers: req.headers, body: raw ? JSON.parse(raw) : undefined });
    const response = responses[Math.min(i++, responses.length - 1)];
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(response));
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as { port: number };
  return { baseURL: `http://127.0.0.1:${address.port}/v1`, requests };
}

function toolContext() {
  const root = mkdtempSync(join(tmpdir(), 'prov-'));
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'app.ts'), 'export {}');
  const tracer = new Tracer({});
  return { tracer, ctx: { workspace: new Workspace(root), tracer, knowledgeRoot: '/knowledge', proposalsDocset: '/proposals', pristineAppRoot: root, state: { proposals: [] } } };
}

async function exercise(providerId: 'google' | 'openai' | 'anthropic', env: Record<string, string>, responses: unknown[]) {
  const { baseURL, requests } = await mockProvider(responses);
  const { config, problems } = resolveModelConfig({ MODEL_PROVIDER: providerId, ...env });
  expect(problems).toEqual([]);
  const model = createLanguageModel(config!, env, baseURL);
  const { tracer, ctx } = toolContext();
  const result = await runAgent({
    model,
    instructions: 'You are a test agent.',
    prompt: 'List the src directory.',
    tools: [listFiles],
    ctx,
    budgets: { maxModelRequests: 5, maxToolCalls: 5, maxRuntimeMs: 20_000 },
  });
  return { result, requests, tracer };
}

describe('resolveModelConfig', () => {
  it('defaults to Google Gemini and accepts GEMINI_API_KEY', () => {
    const { config, problems } = resolveModelConfig({ GEMINI_API_KEY: 'x' });
    expect(problems).toEqual([]);
    expect(config?.provider.id).toBe('google');
    expect(config?.modelId).toBe(PROVIDERS.google.defaultModel);
  });

  it('only requires the selected provider credential', () => {
    const { problems } = resolveModelConfig({ MODEL_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'x' });
    expect(problems).toEqual([]);
    const missing = resolveModelConfig({ MODEL_PROVIDER: 'openai' });
    expect(missing.problems.map((p) => p.kind)).toEqual(['missing-credential']);
  });

  it('requires MODEL_ID for providers without a default and a base URL for compatible endpoints', () => {
    expect(resolveModelConfig({ MODEL_PROVIDER: 'openrouter', OPENROUTER_API_KEY: 'x' }).problems.map((p) => p.kind)).toEqual(['missing-model']);
    expect(resolveModelConfig({ MODEL_PROVIDER: 'openai-compatible', MODEL_ID: 'm' }).problems.map((p) => p.kind)).toEqual(['missing-env']);
    expect(resolveModelConfig({ MODEL_PROVIDER: 'ollama', MODEL_ID: 'm' }).problems).toEqual([]);
    expect(resolveModelConfig({ MODEL_PROVIDER: 'nope' }).problems[0]?.kind).toBe('unknown-provider');
  });
});

describe('core provider adapters against API-shaped mock servers', () => {
  it('google: generateContent with function calling and usage metadata', async () => {
    const { result, requests, tracer } = await exercise('google', { GOOGLE_GENERATIVE_AI_API_KEY: 'test-google-key' }, [
      { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'list_files', args: { path: 'src' } }, thoughtSignature: 'c2lnbmF0dXJl' }] }, finishReason: 'STOP', index: 0 }], usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 8, totalTokenCount: 128 } },
      { candidates: [{ content: { role: 'model', parts: [{ text: 'src contains app.ts' }] }, finishReason: 'STOP', index: 0 }], usageMetadata: { promptTokenCount: 160, candidatesTokenCount: 6, totalTokenCount: 166 } },
    ]);
    expect(result.status).toBe('completed');
    expect(result.finalText).toContain('app.ts');
    expect(requests[0]!.path).toContain(`/models/${PROVIDERS.google.defaultModel}:generateContent`);
    expect(requests[0]!.headers['x-goog-api-key']).toBe('test-google-key');
    expect(JSON.stringify(requests[0]!.body.tools)).toContain('list_files');
    expect(JSON.stringify(requests[1]!.body.contents)).toContain('functionResponse');
    // Gemini 3 thought signatures are sent back with the replayed function call.
    expect(JSON.stringify(requests[1]!.body.contents)).toContain('c2lnbmF0dXJl');
    const steps = tracer.events.filter((e) => e.type === 'model.step');
    expect(steps.map((s) => (s.usage as { inputTokens: number }).inputTokens)).toEqual([120, 160]);
  });

  it('openai: Responses API with function calls and usage', async () => {
    const { result, requests, tracer } = await exercise('openai', { OPENAI_API_KEY: 'test-openai-key' }, [
      { id: 'resp_1', object: 'response', created_at: 1_765_000_000, status: 'completed', model: 'gpt-5.4-mini', output: [{ type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'list_files', arguments: '{"path":"src"}', status: 'completed' }], usage: { input_tokens: 120, input_tokens_details: { cached_tokens: 0 }, output_tokens: 8, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 128 } },
      { id: 'resp_2', object: 'response', created_at: 1_765_000_001, status: 'completed', model: 'gpt-5.4-mini', output: [{ type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'src contains app.ts', annotations: [] }] }], usage: { input_tokens: 150, input_tokens_details: { cached_tokens: 0 }, output_tokens: 6, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 156 } },
    ]);
    expect(result.status).toBe('completed');
    expect(result.finalText).toContain('app.ts');
    expect(requests[0]!.path).toBe('/v1/responses');
    expect(requests[0]!.headers.authorization).toBe('Bearer test-openai-key');
    expect(JSON.stringify(requests[0]!.body.tools)).toContain('list_files');
    expect(JSON.stringify(requests[1]!.body.input)).toContain('function_call_output');
    const steps = tracer.events.filter((e) => e.type === 'model.step');
    expect(steps.map((s) => (s.usage as { inputTokens: number }).inputTokens)).toEqual([120, 150]);
  });

  it('anthropic: Messages API with tool_use and usage', async () => {
    const { result, requests, tracer } = await exercise('anthropic', { ANTHROPIC_API_KEY: 'test-anthropic-key' }, [
      { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content: [{ type: 'tool_use', id: 'toolu_1', name: 'list_files', input: { path: 'src' } }], stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 120, output_tokens: 8 } },
      { id: 'msg_2', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content: [{ type: 'text', text: 'src contains app.ts' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 150, output_tokens: 6 } },
    ]);
    expect(result.status).toBe('completed');
    expect(result.finalText).toContain('app.ts');
    expect(requests[0]!.path).toBe('/v1/messages');
    expect(requests[0]!.headers['x-api-key']).toBe('test-anthropic-key');
    expect(JSON.stringify(requests[0]!.body.tools)).toContain('list_files');
    expect(JSON.stringify(requests[1]!.body.messages)).toContain('tool_result');
    const steps = tracer.events.filter((e) => e.type === 'model.step');
    expect(steps.map((s) => (s.usage as { inputTokens: number }).inputTokens)).toEqual([120, 150]);
  });

  it('reports provider HTTP errors with a hint instead of crashing', async () => {
    server = createServer((_req, res) => {
      res.writeHead(429, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 429, message: 'Resource exhausted', status: 'RESOURCE_EXHAUSTED' } }));
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as { port: number }).port;
    const env = { GOOGLE_GENERATIVE_AI_API_KEY: 'k' };
    const model = createLanguageModel(resolveModelConfig({ ...env }).config!, env, `http://127.0.0.1:${port}/v1`);
    const { ctx } = toolContext();
    const result = await runAgent({ model, instructions: 'x', prompt: 'y', tools: [listFiles], ctx, budgets: { maxModelRequests: 2, maxToolCalls: 2, maxRuntimeMs: 20_000 }, maxRetries: 0, pacing: { maxWaits: 0 } });
    expect(result.status).toBe('failed');
    expect(result.error?.statusCode).toBe(429);
    expect(result.error?.hint).toMatch(/replay/);
  });
});
