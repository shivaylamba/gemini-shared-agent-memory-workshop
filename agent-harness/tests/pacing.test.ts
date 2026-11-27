import { APICallError, generateText } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { pacedModel, pacingFromEnv, retryDelayMs } from '../src/pacing.ts';

const okResult = {
  content: [{ type: 'text' as const, text: 'ok' }],
  finishReason: { unified: 'stop' as const, raw: 'stop' },
  usage: {
    inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: undefined },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  },
  warnings: [],
};

function apiError(statusCode: number, extra: { body?: string; headers?: Record<string, string>; message?: string } = {}) {
  return new APICallError({
    message: extra.message ?? `HTTP ${statusCode}`,
    url: 'https://example.invalid/v1',
    requestBodyValues: {},
    statusCode,
    responseHeaders: extra.headers ?? {},
    responseBody: extra.body ?? '',
    isRetryable: statusCode === 429 || statusCode >= 500,
  });
}

/** A model that fails with the given errors first, then answers. */
function flakyModel(errors: Error[]) {
  let calls = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      calls++;
      const error = errors.shift();
      if (error) throw error;
      return okResult;
    },
  });
  return { model, calls: () => calls };
}

function fakeClock() {
  let t = 1_000_000;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    advance: (ms: number) => (t += ms),
    sleeps,
  };
}

describe('retryDelayMs', () => {
  it('reads Retry-After, Google RetryInfo and "retry in Ns"', () => {
    expect(retryDelayMs(apiError(429, { headers: { 'Retry-After': '7' } }))).toBe(7000);
    expect(retryDelayMs(apiError(429, { body: '{"error":{"details":[{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"52s"}]}}' }))).toBe(52_000);
    expect(retryDelayMs(apiError(429, { message: 'Quota exceeded ... Please retry in 52.223868064s.' }))).toBeCloseTo(52_223.868, 0);
    expect(retryDelayMs(apiError(429))).toBeUndefined();
    expect(retryDelayMs(new Error('not an API error'))).toBeUndefined();
  });
});

describe('pacedModel', () => {
  it('waits as long as the provider asks after a 429, then sends the request again', async () => {
    const clock = fakeClock();
    const waits: { reason: string; waitMs: number }[] = [];
    const flaky = flakyModel([apiError(429, { message: 'Please retry in 3s.' })]);
    const model = pacedModel(flaky.model, { sleep: clock.sleep, now: clock.now, onWait: (w) => waits.push(w) });
    const result = await generateText({ model, prompt: 'hi', maxRetries: 0 });
    expect(result.text).toBe('ok');
    expect(flaky.calls()).toBe(2);
    expect(waits).toEqual([expect.objectContaining({ reason: 'rate-limit', waitMs: 4000 })]);
  });

  it('backs off on 503 overload without a stated delay', async () => {
    const clock = fakeClock();
    const flaky = flakyModel([apiError(503), apiError(503)]);
    const model = pacedModel(flaky.model, { sleep: clock.sleep, now: clock.now });
    await generateText({ model, prompt: 'hi', maxRetries: 0 });
    expect(clock.sleeps).toEqual([6000, 11000]);
  });

  it('does not wait on other errors, and gives up after maxWaits', async () => {
    const clock = fakeClock();
    const bad = flakyModel([apiError(400)]);
    await expect(generateText({ model: pacedModel(bad.model, { sleep: clock.sleep, now: clock.now }), prompt: 'hi', maxRetries: 0 })).rejects.toThrow('HTTP 400');
    expect(clock.sleeps).toEqual([]);

    const limited = flakyModel([apiError(429), apiError(429), apiError(429)]);
    await expect(generateText({ model: pacedModel(limited.model, { sleep: clock.sleep, now: clock.now, maxWaits: 2 }), prompt: 'hi', maxRetries: 0 })).rejects.toThrow('HTTP 429');
    expect(limited.calls()).toBe(3);
  });

  it('stops at once on a daily quota, or when the provider asks for longer than maxWaitMs', async () => {
    const clock = fakeClock();
    const daily = flakyModel([apiError(429, { body: '{"error":{"details":[{"violations":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]},{"retryDelay":"30s"}]}}' })]);
    await expect(generateText({ model: pacedModel(daily.model, { sleep: clock.sleep, now: clock.now }), prompt: 'hi', maxRetries: 0 })).rejects.toThrow('HTTP 429');
    expect(daily.calls()).toBe(1);
    const long = flakyModel([apiError(429, { message: 'Please retry in 3600s.' })]);
    await expect(generateText({ model: pacedModel(long.model, { sleep: clock.sleep, now: clock.now }), prompt: 'hi', maxRetries: 0 })).rejects.toThrow('retry in 3600s');
    expect(long.calls()).toBe(1);
    expect(clock.sleeps).toEqual([]);
  });

  it('keeps at most N requests in any minute when requestsPerMinute is set', async () => {
    const clock = fakeClock();
    const waits: number[] = [];
    const model = pacedModel(flakyModel([]).model, { requestsPerMinute: 2, sleep: clock.sleep, now: clock.now, onWait: (w) => waits.push(w.waitMs) });
    for (let i = 0; i < 3; i++) await generateText({ model, prompt: 'hi', maxRetries: 0 });
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBe(60_250);
  });

  it('reads MODEL_REQUESTS_PER_MINUTE', () => {
    expect(pacingFromEnv({ MODEL_REQUESTS_PER_MINUTE: '5' })).toEqual({ requestsPerMinute: 5 });
    expect(pacingFromEnv({})).toEqual({});
    expect(pacingFromEnv({ MODEL_REQUESTS_PER_MINUTE: 'lots' })).toEqual({});
  });
});
