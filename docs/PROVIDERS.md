# Model providers (workshop harness)

The harness uses the [Vercel AI SDK](https://ai-sdk.dev) (`ai` 7.0.183) behind one small provider
registry (`agent-harness/src/providers/`). Every provider gets the same tools, prompts, budgets,
tracing and evaluation. **Only the selected provider needs a credential.**

```bash
# .env
MODEL_PROVIDER=google        # google | openai | anthropic | openrouter | openai-compatible | ollama
MODEL_ID=                    # empty = provider default
```

| Provider | Package | Credential | Default model | Tier | Status |
|---|---|---|---|---|---|
| `google` (default) | `@ai-sdk/google` 4.0.128 | `GOOGLE_GENERATIVE_AI_API_KEY` or `GEMINI_API_KEY` | `gemini-3.5-flash-lite` (paid keys: `gemini-3.6-flash`) | core | Mock-API tests, and **live on a free-tier AI Studio key** (macOS, Nov 2026): all four recordings |
| `openai` | `@ai-sdk/openai` 4.0.125 (Responses API) | `OPENAI_API_KEY` | `gpt-5.4-mini` | core | Adapter tested against a mock; **live: verify** |
| `anthropic` | `@ai-sdk/anthropic` 4.0.110 | `ANTHROPIC_API_KEY` | `claude-haiku-5-5` | core | Adapter tested against a mock; **live: verify** |
| `openrouter` | `@openrouter/ai-sdk-provider` 3.1.0 | `OPENROUTER_API_KEY` | none: set `MODEL_ID` (e.g. `google/gemini-3.6-flash`) | additional | Config tested; live not verified |
| `openai-compatible` | `@ai-sdk/openai-compatible` 3.0.96 | `OPENAI_COMPATIBLE_API_KEY` (optional) + `OPENAI_COMPATIBLE_BASE_URL` | none: set `MODEL_ID` | additional | Config tested; live not verified |
| `ollama` | `@ai-sdk/openai-compatible` → `${OLLAMA_BASE_URL}/v1` | none | none: a pulled model with tool calling | optional | Config tested; live not verified |

## How the defaults were chosen (November 2026)

- **Gemini:** the default is `gemini-3.5-flash-lite`, because the free tier only gives 3.x Flash about 20 requests a day. With shared memory it scored 10/10 on the hidden checks (baseline: 3/10) in the recorded runs. With a paid key, set `MODEL_ID=gemini-3.6-flash`. Google's models page lists `gemini-3.8-flash` and
  `gemini-3.6-flash` as the stable Flash models. The deprecations page says `gemini-3.5-flash` is
  no longer offered in AI Studio and its requests go to 3.6 Flash. On a free-tier key (November
  2026), `gemini-3.6-flash` and `gemini-3.5-flash` passed `npm run smoke`, and `gemini-3.8-flash`
  answered 503 "high demand". A Flash-class model is the default because the refund task needs
  reliable multi-step tool calling.
- **Gemini free tier: not enough for the workshop on 3.x Flash.** On a free key (November 2026),
  Google's 429 reported 5 requests per minute for `gemini-3.6-flash`, and the daily quota ran out
  after about 20 requests. A published summary of AI Studio's limits gives 20 requests per day for
  3.8 and 3.6 Flash, and 500 per day for 3.5 Flash-Lite and 3.1 Flash-Lite. One agent session needs
  10 to 30 requests, and the workshop needs three. **Free-tier participants: set
  `MODEL_ID=gemini-3.5-flash-lite`**, or use Antigravity (no key) or replay. Quotas are per Google
  Cloud project, not per key, and daily quotas reset at midnight Pacific time. Check your own limits
  in AI Studio.
- **Pacing:** set `MODEL_REQUESTS_PER_MINUTE=5` on the free tier, and the harness spaces requests
  about 12 s apart. Without it, the harness still waits out a per-minute 429 for as long as Google
  asks, up to 2 minutes. A daily-quota 429 stops the run at once with a hint. Waiting time is
  shown separately ("of which waiting for provider rate limits") and does not use up
  `AGENT_MAX_RUNTIME_SECONDS`.
- **New Gemini keys start with `AQ.`** (Google's auth keys). AI Studio no longer issues `AIza…`
  keys and is phasing them out. The workshop supports both.
- **OpenAI, Anthropic:** small, tool-capable models from each SDK's model list (`gpt-5.4-mini`,
  `claude-haiku-5-5`). Paid keys required; costs for one run are small but not zero.
- No model IDs are hard-coded outside the provider files. `MODEL_ID` always wins.

## What "tested" means here

`agent-harness/tests/providers.test.ts` runs the **real** AI SDK provider packages against local HTTP
servers that imitate each API. Those tests check:

- the endpoint path and auth header (`x-goog-api-key`, `Authorization: Bearer`, `x-api-key`)
- that tools are declared and tool results are sent back (`functionResponse`, `function_call_output`, `tool_result`)
- that Gemini 3 thought signatures round-trip
- that usage is parsed
- that HTTP errors such as 429 produce a hint instead of a crash

They do **not** prove that a model ID exists or that your key has quota. For that:

```bash
npm run smoke                       # one tiny live tool-calling round trip with your configured provider
MODEL_PROVIDER=anthropic npm run smoke
npm run doctor -- --live
```

## Usage metrics per provider

Token counts come from the provider's usage metadata via the AI SDK (`inputTokens`, `outputTokens`,
reasoning and cached tokens where reported). If a provider omits a value for any request, the
workshop reports it as **unavailable**. It never estimates.

## Security

- Keys live only in `.env` (gitignored, mode 0600). They are never written to workspaces or run
  artifacts, and they never reach the browser.
- Traces are redacted: known secret values and key-shaped strings (Google `AQ.…` and `AIza…`, `sk-…`, `sk-ant-…`, JWTs, `Bearer …`).
- Agent-written code runs in a child process with a scrubbed environment, so no keys are visible to it.
