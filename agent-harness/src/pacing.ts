import { setTimeout as sleepFor } from 'node:timers/promises';
import { APICallError, wrapLanguageModel, type LanguageModelMiddleware } from 'ai';

/**
 * Keeps a harness session inside a provider's rate limits.
 *
 *  - Optional client-side pacing: at most `requestsPerMinute` model requests in
 *    any 60-second window (set MODEL_REQUESTS_PER_MINUTE, e.g. 5 for the Gemini
 *    free tier).
 *  - When the provider still answers 429 (rate limit) or 503 (overloaded), wait
 *    as long as it asks (Retry-After, Google's RetryInfo, or "retry in Ns" in the
 *    message), then send the same request again. Bounded by `maxWaits`.
 *
 * Every wait is reported through `onWait`, so traces and metrics show how much of
 * a run's elapsed time was spent waiting rather than working.
 */

export interface PacingOptions {
  requestsPerMinute?: number;
  /** How many rate-limit or overload responses to wait out per request. Default 6. */
  maxWaits?: number;
  /** Upper bound for one wait. Default 120 s. */
  maxWaitMs?: number;
  onWait?: (info: { reason: 'pace' | 'rate-limit' | 'overloaded'; waitMs: number; attempt?: number; statusCode?: number }) => void;
  /** Test hooks. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
}

const DEFAULT_MAX_WAITS = 6;
const DEFAULT_MAX_WAIT_MS = 120_000;
const WINDOW_MS = 60_000;

/** Parses the delay a provider asked for, in milliseconds, from an API error. */
export function retryDelayMs(error: unknown, nowMs = Date.now()): number | undefined {
  if (!APICallError.isInstance(error)) return undefined;
  const headers = error.responseHeaders ?? {};
  const retryAfter = Object.entries(headers).find(([name]) => name.toLowerCase() === 'retry-after')?.[1];
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - nowMs);
  }
  // Google: {"error":{"details":[{"@type":"...RetryInfo","retryDelay":"52s"}]}}
  const body = typeof error.responseBody === 'string' ? error.responseBody : '';
  const retryInfo = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(body);
  if (retryInfo) return Number(retryInfo[1]) * 1000;
  const inMessage = /retry in (\d+(?:\.\d+)?)\s*s/i.exec(error.message);
  if (inMessage) return Number(inMessage[1]) * 1000;
  return undefined;
}

/**
 * A daily quota (Gemini free tier: requests per day) does not come back by waiting a
 * minute. Google names the quota in the error (e.g. GenerateRequestsPerDayPerProjectPerModel-FreeTier).
 */
export function isDailyQuota(error: unknown): boolean {
  if (!APICallError.isInstance(error) || error.statusCode !== 429) return false;
  const text = `${error.message} ${typeof error.responseBody === 'string' ? error.responseBody : ''}`;
  return /PerDay|per day|requests per day|daily/i.test(text);
}

function waitReason(error: unknown): 'rate-limit' | 'overloaded' | undefined {
  if (!APICallError.isInstance(error)) return undefined;
  if (error.statusCode === 429) return 'rate-limit';
  if (error.statusCode === 503) return 'overloaded';
  return undefined;
}

type WrappableModel = Parameters<typeof wrapLanguageModel>[0]['model'];

export function pacedModel<M extends WrappableModel>(model: M, options: PacingOptions = {}): ReturnType<typeof wrapLanguageModel> {
  const sleep = options.sleep ?? ((ms: number, signal?: AbortSignal) => sleepFor(ms, undefined, { signal }));
  const now = options.now ?? Date.now;
  const maxWaits = options.maxWaits ?? DEFAULT_MAX_WAITS;
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const rpm = options.requestsPerMinute && options.requestsPerMinute > 0 ? options.requestsPerMinute : undefined;
  const sent: number[] = [];

  async function pace(signal?: AbortSignal): Promise<void> {
    if (!rpm) return;
    const cutoff = now() - WINDOW_MS;
    while (sent.length && sent[0]! <= cutoff) sent.shift();
    if (sent.length < rpm) return;
    const waitMs = sent[0]! + WINDOW_MS - now() + 250;
    if (waitMs > 0) {
      if (waitMs >= 1_000) options.onWait?.({ reason: 'pace', waitMs });
      await sleep(waitMs, signal);
    }
  }

  const middleware: LanguageModelMiddleware = {
    specificationVersion: 'v4',
    wrapGenerate: async ({ doGenerate, params }) => {
      for (let attempt = 1; ; attempt++) {
        await pace(params.abortSignal);
        sent.push(now());
        try {
          return await doGenerate();
        } catch (error) {
          const reason = waitReason(error);
          if (!reason || attempt > maxWaits || isDailyQuota(error)) throw error;
          const asked = retryDelayMs(error, now());
          // A provider asking for longer than we are willing to wait means a long quota window: stop now.
          if (asked !== undefined && asked > maxWaitMs) throw error;
          const fallback = Math.min(maxWaitMs, 5_000 * 2 ** (attempt - 1));
          const waitMs = Math.min(maxWaitMs, (asked ?? fallback) + 1_000);
          options.onWait?.({ reason, waitMs, attempt, statusCode: (error as APICallError).statusCode });
          await sleep(waitMs, params.abortSignal);
        }
      }
    },
  };
  return wrapLanguageModel({ model, middleware });
}

/** MODEL_REQUESTS_PER_MINUTE caps request rate (e.g. 5 on the Gemini free tier). Unset = no cap. */
export function pacingFromEnv(env: Record<string, string | undefined>): Pick<PacingOptions, 'requestsPerMinute'> {
  const rpm = Number(env.MODEL_REQUESTS_PER_MINUTE);
  return Number.isFinite(rpm) && rpm > 0 ? { requestsPerMinute: Math.floor(rpm) } : {};
}
