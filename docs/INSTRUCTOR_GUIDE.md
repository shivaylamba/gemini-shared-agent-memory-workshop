# Instructor guide

**Beyond the Context Window: Building Shared Agent Memory with Gemini** · Build with Gemini, Noida · 75 minutes

This is the single runbook for delivering the workshop. Read it together with [WORKSHOP.md](../WORKSHOP.md)
(agenda and learning flow) and [PRD.md](../PRD.md) (requirements and design decisions).

## The message

Durable project knowledge belongs to the project and its team, not to one model, agent or
conversation. Gemini and Antigravity are the showcase. OpenLore shows that the same knowledge works
across the agent ecosystem. The workshop is an experiment, not a product pitch: report what you measure.

## Agenda

| Time | Segment | Do | Fallback |
|---|---|---|---|
| 00–08 | Intro, paths, readiness | Problem framing; [choose your path](CHOOSE_YOUR_PATH.md); everyone runs `npm run doctor` | Anyone not ready in 2 min: `npm run setup -- --path replay` or pair |
| 08–20 | **01 The Amnesiac Agent** | `npm run exercise -- 01` (or `--mode external`/`replay`); inspect the trace | Over 8 min: `npm run checkpoint -- 01` |
| 20–35 | **02 Teach an Agent to Remember** | `npm run lore:start`; capture; `npm run lore:review`; retrieve with `npm run lore -- …` | `npm run checkpoint -- 02` |
| 35–50 | **03 Share Knowledge Across Agents** | Fresh session, same prompt; inspect retrieval | `--mode replay` or `npm run checkpoint -- 03` |
| 50–65 | **04 Does Memory Actually Help?** | `npm run evaluate`; discuss; optional stale demo | Use replay comparison |
| 65–70 | **Cross-agent demo** | Presenter: Antigravity reads knowledge another client produced; `npm run evaluate -- --portability` | Play the backup recording |
| 70–75 | Takeaways, Q&A | Trade-offs, freshness, governance | — |

Installation must happen **before** the event (send the [participant message](#participant-preparation-message)).
Enforce timeboxes. Never debug one person's setup in front of the room.

## Runbook

### 00–08 Introduce the problem

- Ask: "Who has watched a coding agent spend ten minutes learning a codebase, then do it again the
  next session?"
- Draw three boxes:
  1. **Session context**: this conversation, gone when it ends.
  2. **Project instructions**: AGENTS.md and the like, static and per tool.
  3. **Durable shared knowledge**: reviewed, sourced, versioned, served to any agent.
- Show the [path table](CHOOSE_YOUR_PATH.md). Antigravity users need no API key; others bring one
  provider key or their own agent; everyone else replays.
- Everyone: `npm run doctor`. Red lines: replay or pair, now.
- On the projector, `npm run ui` (optional) shows the agenda, each exercise's run as it streams,
  the review inbox and the comparison in large type. Every step also works from the terminal.

### 08–20 Exercise 01

- `npm run exercise -- 01`. Narrate the stream: file reads, searches, the 2023 runbook, ADR-002.
- `npm run inspect -- latest`: files read, input tokens per request, hidden checks.
- Ask: "If another developer starts a new session tomorrow, how does their agent benefit from
  everything this one just learned?"
- Timebox 8 minutes of agent time. Then `npm run checkpoint -- 01`.

### 20–35 Exercise 02

- `npm run lore:start` (pre-started on the projector laptop).
- Flow: investigate → extract decision, rationale, guidance and sources → the agent **publishes into
  the inbox only** → human review → promote.
- `npm run lore:review`: open one note and have the room check one `source` path in the code.
- Retrieval is just files:
  `npm run lore -- "lore meta /knowledge"`, `npm run lore -- "grep -rn -i idempot /knowledge"`,
  `npm run lore -- --as maintainer "lore history /knowledge/decisions/refund-idempotency.md"`.
- Point out that the knowledge exists independently of any model context.
- Behind: `npm run checkpoint -- 02` (keeps any approved notes).

> These are the verified replacements for the SSH examples in the original brief (`ssh -p 2222 …`).
> The workshop closes SSH: keyless access is off and unknown keys are denied. All access goes over
> MCP or HTTP with per-identity tokens.

### 35–50 Exercise 03

- `npm run exercise -- 03`. Point out the "same starting snapshot" and "new session" lines.
- Watch for search → read selected notes → verify in code → implement → tests.
- Ask: which notes were used? Did the agent verify them against the code?
- Live failure: `npm run exercise -- 03 --mode replay`.

### 50–65 Exercise 04

- `npm run evaluate`. Read it top-down:
  - Is the pair controlled?
  - Correctness
  - Context and exploration
  - Knowledge retrieved
  - Capture cost
- Both runs passing every check is a valid result. If shared memory did worse, investigate it live;
  do not hide it.
- Optional (3 min): `npm run stale-demo -- on`, then the replay or a live run with
  `--label stale-memory`, then `npm run stale-demo -- off`. Discuss `status`, `verified_at`,
  `source`, verification, and `lore history`.

### 65–70 Cross-agent demo

Follow [DEMO_SCRIPT.md](DEMO_SCRIPT.md): Antigravity reads knowledge that another client produced,
without that client's conversation. Then run `npm run evaluate -- --portability`.

### 70–75 Close

- When are repository Markdown and AGENTS.md enough? One agent, one repo.
- When do you need a shared knowledge server? Several agents, tools, repos or people; access control;
  provenance; review.
- Risks: stale notes, misleading notes, prompt injection via knowledge (treat it as data), privacy of
  engineering notes.
- Share the repository QR code and [POST_WORKSHOP.md](POST_WORKSHOP.md).

## Instructor preparation checklist

- [ ] Clean laptop: `npm ci && npm run setup && npm run doctor` on macOS **and** Linux (Windows/WSL if participants will use it)
- [ ] Pick the Gemini model. Confirm `npm run smoke` passes and check the rate limits in AI Studio. Set `MODEL_ID` if the default is not right.
- [ ] Run `npm run smoke` for OpenAI and Anthropic with your keys (core providers)
- [ ] Verify OpenLore: `npm run test:integration` (real binary), `npm run lore:start`, review a proposal
- [ ] Antigravity end to end on the presenter laptop: see the checklist in [integrations/antigravity](../integrations/antigravity/README.md#presenter-checklist-do-this-before-the-event). Confirm localhost HTTP MCP works.
- [ ] Claude Code and Codex once each (`--mode external`), if you will mention them
- [ ] **Record genuine runs:** `npm run record -- all`, review proposals when prompted, then optionally `npm run stale-demo -- on && npm run record -- stale-memory && npm run stale-demo -- off`. Commit `recordings/`.
- [ ] Test replay with networking disabled: `npm run exercise -- 01 --mode replay`, `03`, `04`
- [ ] Build the offline replay page from the recordings: `npm run ui:static`. Open `workshop-ui/dist/workshop-replay.html` with Wi-Fi off and copy it to a USB stick.
- [ ] If you will project the dashboard: `npm run ui`, run one exercise and one review from it, and check readability at the back of the room
- [ ] Test every checkpoint, reset and solution command
- [ ] Rehearse the full 75 minutes, including the fallbacks
- [ ] Ask the organisers about Gemini API credits. **Never share an unrestricted key.**
- [ ] Prepare the GitHub QR code, backup screen recordings, and projector font size (≥ 18 pt terminal)
- [ ] Send the participant message (below) at least three days before the event

## Contingencies

| Problem | Immediate response |
|---|---|
| No Gemini key | Antigravity path, another provider, replay, or pair |
| Gemini quota or network failure | `--mode replay` (genuine recording) |
| OpenLore install failure | `OPENLORE_ARCHIVE` from a USB copy, pair with someone, or replay |
| Antigravity unavailable or out of quota | Harness with any key; recorded cross-client demo |
| Baseline too slow | `npm run checkpoint -- 01` |
| Knowledge capture fails | `npm run checkpoint -- 02` |
| Shared run fails | `npm run checkpoint -- 03` or replay |
| Internet down | Replay and tests are fully local. The replay page (`workshop-replay.html`) works without the repository |
| A participant cannot install anything | Send them the replay page; they follow the runs and the comparison in a browser |
| Baseline scores higher | Explain why from the trace and notes. Never manipulate results. |
| Running behind | Skip the stale demo and the participant cross-agent activity; keep the presenter demo short |

## Participant preparation message

> **Workshop: Beyond the Context Window — Building Shared Agent Memory with Gemini**
>
> To make the most of the 75 minutes, please prepare your laptop beforehand:
> Node.js 22.18+ and npm, Git, a terminal and an editor. Then clone the repository and run
> `npm ci`, `npm run setup` and `npm run doctor`.
>
> Choose one way to participate: **Google Antigravity** (signed in with your Google account; no API
> key needed), **your own API key** (Gemini from https://aistudio.google.com/apikey, OpenAI,
> Anthropic or OpenRouter), **your existing coding agent** (Claude Code, Codex, …), or **offline
> replay** (nothing needed). No paid subscription is required. Free-tier availability and quotas
> vary, so `npm run doctor -- --live` checks yours.

## Honest limitations to mention if asked

- One pair of runs is not a benchmark (see [POST_WORKSHOP.md](POST_WORKSHOP.md) for repeated runs).
- External-agent token usage is invisible to the workshop. Their knowledge reads come from OpenLore's
  own event log.
- The test sandbox uses Node's permission model, not an OS sandbox, and does not restrict network access.
- OpenLore 0.8.0 listens on all interfaces. Tokens are required, but use trusted networks.
