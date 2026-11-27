# PRD: Beyond the Context Window: Building Shared Agent Memory with Gemini

Single source of truth for the workshop's requirements. It consolidates the original handoff brief
and the **multi-provider, agent-agnostic update**; where they conflict, the update wins. Status
columns reflect what is implemented and verified in this repository (details:
[docs/VERIFICATION.md](docs/VERIFICATION.md)).

## 1. Context

- **Event:** Build with Gemini, Noida. **75 minutes.** Adapted from a 3.5-hour AI Engineer Sydney
  workshop that used OpenLore.
- **Philosophy:** Gemini-first, not Gemini-exclusive. We cannot assume a Gemini key, Antigravity, a
  paid subscription, a particular provider, or quota.
- **Core message:** durable project knowledge belongs to the project and its team, not to one model,
  agent or conversation. OpenLore makes it portable across agents.
- **Pedagogy:** Faris Aziz's [nextjs-architecture-workshop](https://github.com/farisaziz12/nextjs-architecture-workshop):
  README-driven, numbered exercises, solutions, simple commands.

## 2. Public abstract

Your coding agent learns how a project works, only for the next session to repeat the same
investigation. Another agent misses an architectural decision, follows outdated instructions or
cannot access knowledge held in a different tool. Increasing the context window alone does not
solve these problems.

In this 75-minute hands-on workshop, you'll explore how to build a shared memory layer for AI agents
using Google Gemini, Antigravity and OpenLore, an open-source knowledge repository for AI agents.

Starting with a supplied software project, you'll run an engineering task without shared memory,
capture relevant architectural decisions and project knowledge, and make that knowledge available
across agent sessions and tools. You'll explore how Gemini-powered agents, and other agents, can
retrieve and reuse persistent knowledge without relying on previous conversation history.

You'll then compare agent behaviour with and without shared memory, examining task correctness,
context consumption and repeated codebase exploration. We'll also discuss knowledge freshness,
access controls and deciding what agents should remember.

**Who it's for:** developers and AI enthusiasts interested in coding agents, multi-agent
applications or persistent agent memory. Basic programming knowledge helps. No prior experience
with agent memory is required.

**What you'll need:** a laptop with Node.js 22.18+. Then one of: Google Antigravity (signed in with
your Google account; no API key needed), an API key for Gemini or another supported provider, an
existing MCP-capable coding agent, or nothing at all (offline replay). No paid subscription is
required; free-tier availability and quotas vary.

## 3. Participation paths

| Path | Interface | Model access | OpenLore | Harness needed? | Status |
|---|---|---|---|---|---|
| A | Google Antigravity | Google account sign-in (no API key) | MCP via `<ws>/.agents/mcp_config.json` | No | Implemented per official docs; **live verification pending** (no Antigravity in the build environment) |
| B | Workshop harness (Vercel AI SDK) | Gemini (default), OpenAI, Anthropic, OpenRouter, OpenAI-compatible, Ollama | MCP (built-in client) | Yes | Implemented; core adapters tested against API-shaped mocks; **live smoke tests pending** (no keys in the build environment) |
| C | Claude Code, Codex, other MCP agents | Agent's own | MCP (`.mcp.json` with `${OPENLORE_TOKEN}`; `.codex/config.toml` with `bearer_token_env_var`; generic header) | No | Implemented per official docs; **live verification pending** |
| D | Offline replay | None | Recorded snapshots | No | Implemented and tested with labelled synthetic fixtures; **genuine recordings pending** (`npm run record`) |

All paths use the same ShopFlow snapshot, prompts ([`exercises/shared`](exercises/shared) +
`task.md`), tests, hidden grader and artifact format. The harness is never required between external
agents and OpenLore. Antigravity credentials are never read or reused.

## 4. Architecture

1. **Participant interfaces:** Antigravity · harness · external MCP agents · replay runner
2. **Model providers:** AI SDK provider registry (`agent-harness/src/providers/`); only the selected
   provider needs a credential; no model IDs outside the provider files
3. **Shared knowledge:** OpenLore 0.8.0 (pinned, SHA-256 verified), real MCP and HTTP. Docsets
   `/knowledge` (approved) and `/proposals` (inbox); per-agent `-capture` and `-reader` identities;
   tokens required
4. **Common app and evaluation:** `core-app/` snapshot → fresh workspace → sandboxed visible tests +
   hidden grader → `runs/<id>/`

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 5. Sample application: ShopFlow

A TypeScript payments backend with in-memory data and a deterministic mock gateway (PayGate v2
current, v1 deprecated). Five constraints are discoverable in code and docs in every condition:

1. integer paise (ADR-001)
2. refunds never exceed the refundable amount (ADR-005)
3. idempotent requests (ADR-003)
4. current adapter only (ADR-002)
5. standardized errors (ADR-004)

A 2023 runbook recommends the deprecated adapter, for realism. Task:
`POST /api/orders/:orderId/refund` with `{"amount":15000,"idempotencyKey":"refund-request-001"}`.

**Ten hidden checks:** full refund, partial refund, invalid amounts, excessive amount, unknown order,
idempotent retry, cumulative accounting, current adapter, standardized errors, provider failure.
Plus regression tests from the **original** visible suite.

## 6. Exercises (unchanged use case)

| # | Exercise | Time | Common prompt | Paths |
|---|---|---|---|---|
| 01 | The Amnesiac Agent | 12 | Implement refunds (baseline, no OpenLore) | harness · external · replay |
| 02 | Teach an Agent to Remember | 15 | Capture decisions as notes → inbox → human review | harness · external · replay + checkpoint |
| 03 | Share Knowledge Across Agents | 15 | Same prompt as 01, fresh session, read-only `/knowledge` | harness · external · replay |
| 04 | Does Memory Actually Help? | 15 | Experiments A and B | all |

Commands: `npm run exercise -- NN [--mode harness|external|replay] [--agent …]`,
`npm run collect -- NN` (external), `npm run solution -- NN`, `npm run checkpoint -- NN`,
`npm run reset -- NN`.

## 7. Evaluation

- **Experiment A, controlled memory comparison (primary):** the same harness, provider, model,
  snapshot, task prompt, generation settings, budgets and harness version, with and without OpenLore.
  Measures correctness, regression, constraints, input and output tokens (provider-reported),
  exploration, knowledge retrieval and time. Anything else is labelled *not controlled*.
- **Experiment B, cross-agent portability:** producer identities from OpenLore provenance; consumer
  runs of any agent or model. No performance attribution.
- External agents: tokens and tool calls are unavailable (never estimated). Knowledge reads come from
  OpenLore's event log for the agent's identity.
- Capture cost is reported separately. One pair of runs is a demonstration, not a benchmark.

## 8. Non-goals

A custom vector database or OpenLore replacement; a production agent platform; multi-tenant hosting;
complex auth exercises; mandatory dashboards; paid subscriptions; duplicating the workshop per
provider or agent.

## 9. Priorities and status

| Priority | Feature | Status |
|---|---|---|
| P0 | Faris-style README-driven workshop, four exercises, solutions | ✅ |
| P0 | ShopFlow and deterministic tests; hidden grader validated by mutation tests | ✅ |
| P0 | Real OpenLore integration (integration tests against the pinned binary) | ✅ |
| P0 | Gemini-first multi-provider harness (Google, OpenAI, Anthropic) | ✅ Google live on a free-tier key (macOS) · OpenAI and Anthropic: mock-API tests only |
| P0 | Direct Antigravity path | ✅ implemented per docs · ⏳ live verification |
| P0 | Interactive setup + path-aware doctor | ✅ |
| P0 | Generic external-agent path (`--mode external`, `collect`) | ✅ |
| P0 | Offline replay | ✅ with genuine recordings (Gemini 3.5 Flash-Lite, 27 Nov 2026) |
| P0 | Common evaluation (Experiments A and B), instructor runbook | ✅ |
| P1 | Claude Code and Codex guides | ✅ Claude Code live (headless, Exercise 03, 10/10) · ⏳ Codex: the ChatGPT-plan account could not use the configured default model; isolated retry prepared (`--ignore-user-config`) |
| P1 | OpenRouter and OpenAI-compatible providers | ✅ config-level tests |
| P1 | Cross-device pairing (`npm run lore:pair`) | ✅ tested on one host |
| P1 | Visual dashboard (`npm run ui`), static browser replay (`npm run ui:static`) | ✅ built after the CLI; security and build tests; browser E2E with a scripted test double · ✅ static page built from the genuine recordings |
| P2 | Ollama | ✅ via OpenAI-compatible endpoint, untested live |
| P2 | Hosted multi-tenant OpenLore, advanced ACLs, repeated-run benchmark | Documented in POST_WORKSHOP |

## 10. Definition of done

| Criterion | Status |
|---|---|
| Antigravity participants complete it without a Gemini key | ⏳ instructions and config implemented; not installed on the test Mac, so not run live |
| Non-Gemini key participants complete it | ⏳ OpenAI and Anthropic adapters pass mock-API tests; needs `npm run smoke` with real keys |
| External agents don't need the harness | ✅ (flow verified with scripted MCP clients standing in for the agents) |
| Replay works without live model access | ✅ genuine recordings included and replayed offline |
| Same app, tasks and tests for every path | ✅ |
| Real OpenLore knowledge created, retrieved and reused across sessions | ✅ (integration tests + E2E) |
| ≥ 1 cross-agent portability demonstration verified | ✅ notes written by the Gemini harness, reviewed, then used by a real Claude Code session (Opus 5.5) in a fresh Exercise 03 workspace: 10/10 |
| Controlled comparisons use consistent configurations | ✅ enforced in `evaluation/compare.ts` |
| External-agent limitations documented | ✅ |
| Commands, checkpoints and solutions work | ✅ |
| Fits 75 minutes | ⏳ requires rehearsal |
