# Verification record

What was verified while building this repository (November 2026), how, and what still needs live
verification during instructor preparation. Nothing below is a model output or a benchmark.

## Upstream checks

| Item | Source checked | Result |
|---|---|---|
| OpenLore | GitHub `aakarim/OpenLore` source and docs at v0.8.0; release `checksums.txt` | v0.8.0 (2026-10-30), Apache-2.0, binaries for darwin/linux (amd64, arm64) and windows amd64. MCP tools `lore_bash` and `list_commands`; JSON API `/api/shell`; token mint; docsets with `ro`/`publish`/`rw`; inbox publishing; `lore history`; `lore meta`. No bind-address option; no built-in review queue. |
| Vercel AI SDK | npm `ai` 7.0.183 and provider packages; type definitions; ai-sdk.dev docs | `generateText` + `tool({ inputSchema })` + `stopWhen` (`isStepCount`) + `onStepEnd` usage; `MockLanguageModelV4` for tests |
| Providers | `@ai-sdk/google` 4.0.128, `@ai-sdk/openai` 4.0.125, `@ai-sdk/anthropic` 4.0.110, `@ai-sdk/openai-compatible` 3.0.96, `@openrouter/ai-sdk-provider` 3.1.0 (requires `ai` ^7) | Model ID lists checked for defaults |
| Gemini models and pricing | ai.google.dev pricing and rate-limit pages; AI Studio models page | `gemini-3.5-flash` listed with a free tier on the pricing page. The models page lists other stable Flash models. Free-tier limits are only shown in AI Studio. The pages disagree in places. |
| Antigravity | antigravity.google docs (install, MCP, FAQ) | Personal Google accounts work on the free plan. MCP via `mcpServers` with `serverUrl` + `headers` (Streamable HTTP only), global or `<workspace>/.agents/mcp_config.json`. CLI `agy` can use a Gemini API key. The docs do not cover localhost HTTP or header env expansion. |
| Claude Code | code.claude.com MCP docs | `claude mcp add --transport http … --header`; `.mcp.json` with `${VAR}` expansion in `headers` |
| Codex | Codex MCP docs; OpenLore's Codex guide | `[mcp_servers.x] url` + `bearer_token_env_var`; project `.codex/config.toml` for trusted projects only |
| Reference workshop | `farisaziz12/nextjs-architecture-workshop` | README structure, numbered exercises/solutions, `exercise`/`solution` commands |

## Automated tests (run in this environment)

| Suite | Command | Result here |
|---|---|---|
| Typecheck | `npm run typecheck` | pass |
| Unit tests (Vitest) | `npm test` | all pass: workspace safety, redaction, providers against Google/OpenAI/Anthropic API-shaped mock servers (real SDK packages), scripted-model harness runs including budgets and session independence, prompts, note validation, MCP config writers, policy, Experiment A/B logic, replay (synthetic fixture explicitly allowed), grader mutation tests |
| App and grader | `npm run test:app` | starter: 11 regression pass, 3 refund tests fail, 0/10 hidden; reference: 10/10, 14/14 visible |
| OpenLore integration | `npm run test:integration` | pass against the real v0.8.0 binary: 401 without a token; grants enforced; harness capture → inbox → maintainer `mv` → history keeps the author; fresh reader session retrieves the note; reads appear in OpenLore's analytics log |

Synthetic test doubles (`agent-harness/tests/scripted-model.ts`) are clearly labelled, are only used
in tests, and are never written to `recordings/`.

## End-to-end CLI run (this environment, Linux x64, Node 22.23)

`setup` (checksum-verified install from the official archive) → `lore:start` → `doctor` (harness and
Antigravity paths) → external Claude Code baseline → `collect` → external Antigravity capture (a
scripted MCP client used the exact `.agents/mcp_config.json` written for Antigravity) →
`lore:review --approve all` → `collect` (proposals attributed to `antigravity-capture` via
`lore history`) → `checkpoint 02` → external Claude Code shared-memory run (a scripted MCP client
used the `.mcp.json` + `OPENLORE_TOKEN` launch command) → `collect` (knowledge reads measured from
OpenLore's event log) → `evaluate` (correctly reported *not controlled*) → `evaluate --portability`
(producer `antigravity-capture`, consumer `claude-code`) → `inspect`, `solution 01–04`, `reset`,
`stale-demo on/off`, `lore:pair invite/join/leave`.

The interactive `npm run setup` wizard was exercised through a pseudo-terminal (harness → Anthropic → default model → key).

A second end-to-end run on a **fresh clone** covered:

- `npm ci`
- `npm run setup`: a real download of the OpenLore release from GitHub, with its SHA-256 verified
- `doctor`, `test:all`, `solution 01`
- the **harness path through the CLI**: `exercise 01` → `exercise 02` → `lore:review` → `checkpoint 02` → `exercise 03` → `evaluate`

For the harness path, `MODEL_PROVIDER=openai-compatible` pointed at a local, scripted chat-completions
server. That server is a test double, not a model. Its results are not shipped, and its token counts
are not real model usage.

**The scripted MCP clients stood in for the real agents.** This verifies the workshop and OpenLore
side of the cross-agent flow, not Antigravity or Claude Code themselves.

## Dashboard and replay page

Built after the CLI was complete, as the brief required.

| Check | How | Result |
|---|---|---|
| Server security | `workshop-ui/tests/server.test.ts` | Non-localhost `Host` → 421; POST without or with a wrong token → 403; non-JSON → 415; path traversal → 404; no CORS headers; a provider key set in the environment never appears in any response; one job at a time; synthetic recordings refused for replay |
| Replay page build | `workshop-ui/tests/static.test.ts` | Refuses synthetic recordings without `--allow-synthetic` and says so with a banner when allowed; no token, external script, stylesheet or font URL; CSP hashes match the inline script and style; recorded `</script>` text stays inert; credential-shaped data blocks the build; home directory scrubbed |
| Note rendering and charts | `workshop-ui/tests/browser-modules.test.ts` | Raw HTML escaped; `javascript:`, `data:`, `vbscript:` and protocol-relative links dropped; attribute break-out blocked; unavailable values stay "unavailable" |
| Live dashboard in a real browser | Playwright driving headless Chrome against `npm run ui` | Exercise 01 and 02 harness runs streamed and graded, publishing a proposal through the confirmation dialog (history shows the capture identity, then the maintainer's move), external-agent folder preparation, both comparison tabs, mobile width (390 px), dark mode; no console errors |
| Replay page in a real browser | Playwright, page opened from `file://` with the browser offline | All views render; a recording plays back and shows its graded result; no network requests; no console errors (so no CSP violations) |

As in the CLI run, the harness runs behind these browser checks used the scripted
chat-completions test double, and the replay page was built from scripted runs marked
`"synthetic": true`, so it showed the synthetic banner. No page built from synthetic data is
shipped. `workshop-ui/dist/` is ignored by git.

## Live run on macOS (27 November 2026)

| Check | Result |
|---|---|
| Setup on macOS arm64, Node 24 | Checksum-verified OpenLore 0.8.0 darwin_arm64 download. All suites pass: typecheck, unit, app/grader, OpenLore integration. |
| Bugs found and fixed by this run | (1) The hidden grader scored correct code 0/10 on macOS because of the `/var` → `/private/var` symlink. (2) 20 commands ignored `.env`. (3) Free-tier rate limits: requests are now paced, waits are honoured, and daily quotas stop the run at once. (4) The grader rejected one valid reading of ADR-005. Each fix has a test, and the macOS symlink case also runs on Linux. |
| Gemini key format | New AI Studio keys start with `AQ.`. They work with the native API; redaction and checks cover them. |
| Gemini free tier | `gemini-3.6-flash`: 5 requests/minute and about 20/day (not enough for one session). `gemini-3.8-flash`: 503 "high demand". `gemini-3.5-flash-lite`: works, now the default. |
| Genuine recordings | See `recordings/README.md`. Baseline 3/10 against shared memory 10/10, controlled pair, same model and budget. Input tokens 306,347 against 272,031. |
| Human review step | Three captured notes checked claim by claim against the code before approval. |
| Real cross-agent demo | Claude Code (Opus 5.5, `claude -p`, headless) in a fresh workspace read 4 notes over MCP, 3 of them written by the Gemini harness, and implemented refunds: 10/10, all 19 visible tests. |
| Codex | `codex exec` started but the account's configured default model was not available to its ChatGPT plan, and it loaded unrelated personal MCP servers. An isolated retry (`--ignore-user-config`, only the OpenLore MCP server) is prepared but not yet run. |
| Offline replay | `npm run exercise -- 01/03 --mode replay` and the replay page work from the recordings with no model call. |

## Not verified here (must be done during instructor preparation)

| Gap | Why | How to close it |
|---|---|---|
| Live model calls for OpenAI and Anthropic (Google: done) | No keys provided | `npm run smoke` with `MODEL_PROVIDER=openai` / `anthropic` |
| Default model IDs available to your keys | As above | `npm run smoke`; set `MODEL_ID` if needed |
| Antigravity end to end (sign-in, MCP to `http://localhost`, token in `headers`) | Antigravity not available | Presenter checklist in `integrations/antigravity/README.md` |
| Codex end to end (Claude Code: done) | Model not available on the ChatGPT plan; see above | `.workshop/agents-retry.sh` or one `--mode external` run |
| Genuine replay recordings | Done (Flash-Lite). Optional: re-record with a paid key and 3.6 Flash | `MODEL_ID=gemini-3.6-flash npm run record -- all` |
| Replay page from genuine recordings | Needs the recordings above | `npm run ui:static`, open it offline |
| Dashboard on macOS and Windows browsers | Only headless Chrome on Linux here | Open `npm run ui` in your projector browser during rehearsal |
| Cross-agent demo in the room | Done once headless (Gemini harness → Claude Code); rehearse it live | `docs/DEMO_SCRIPT.md` |
| macOS and Windows | Built on Linux only | CI runs unit tests on macOS; try Windows or use WSL |
| Node 24 | Only Node 22.23 was available | CI matrix includes Node 24 |
| 75-minute timing | Needs a rehearsal | Full dry run with the fallbacks |
