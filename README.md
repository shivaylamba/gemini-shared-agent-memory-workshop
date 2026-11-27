# Beyond the Context Window: Building Shared Agent Memory with Gemini

A 75-minute hands-on workshop for **Build with Gemini, Noida**. You will run a coding agent with no
memory, capture what it should have remembered as reviewed knowledge in
[OpenLore](https://github.com/aakarim/OpenLore), reuse that knowledge in a fresh session (possibly a
different agent or model), and **measure** whether it helped.

> Durable project knowledge belongs to the project and its team, not to one model, agent or conversation.

Gemini and Google Antigravity are the primary path. Any of these also works:

| Path | You need | Model access |
|---|---|---|
| **A. Google Antigravity** | Antigravity installed, signed in with a Google account | Your Antigravity plan (free tier works; quota applies). **No API key.** |
| **B. Bring your own key** | An API key for **one** provider | Gemini (default), OpenAI, Anthropic, OpenRouter, any OpenAI-compatible endpoint, or Ollama |
| **C. Existing coding agent** | Claude Code, Codex or another MCP-capable agent | The agent's own |
| **D. Offline replay** | Nothing extra | None: genuine recorded runs, re-graded on your laptop |

Every path uses the same ShopFlow app, the same task prompts, the same tests and hidden checks, and
the same OpenLore knowledge. Not sure which to pick? See [docs/CHOOSE_YOUR_PATH.md](docs/CHOOSE_YOUR_PATH.md).

## 🎓 What you'll learn

- Why session context, project instructions and durable shared knowledge are different things
- How to turn an agent's investigation into short, sourced, **reviewed** notes, without saving transcripts
- How agents and models retrieve shared knowledge over MCP, with per-identity access control and provenance
- How to evaluate memory honestly: correctness first, then tokens and exploration, with upfront costs and stale knowledge in view

## 🗺 Architecture

```text
 Participant interfaces          Model access                 Shared knowledge              Common app & evaluation
 ──────────────────────          ────────────                 ────────────────              ───────────────────────
 Google Antigravity ─────────── own Google sign-in ─┐
 Claude Code / Codex / … ─────── agent's own ───────┼── MCP (Streamable HTTP, ──► OpenLore 0.8.0 ──► /knowledge  (approved, read-only)
 Workshop harness (AI SDK) ───── Gemini · OpenAI ───┤    bearer token per             (Markdown,      /proposals/inbox (agents publish here)
                                 Anthropic · …      │    identity)                     lore history)
 Offline replay ──────────────── none (recorded) ───┘
                                        │
                     every path works on a fresh copy of core-app/ (ShopFlow) ──► same visible tests + hidden grader ──► runs/<id>/ (common format)
```

- `core-app/`: ShopFlow, a small TypeScript payments backend. Refunds are the task.
- `agent-harness/`: a small, bounded tool-calling agent on the [Vercel AI SDK](https://ai-sdk.dev). Tools are confined to the workspace, there is no shell, and tests run in a sandbox.
- `openlore/`: the pinned OpenLore release, server configuration, seed knowledge and note template
- `evaluation/`: hidden grader, metrics, Experiment A (controlled) and Experiment B (portability)
- `integrations/`: Antigravity, Claude Code, Codex and generic MCP guides with copyable prompts

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## ✅ Prerequisites

- **Node.js 22.18 or newer** (see `.nvmrc`), npm, Git, a terminal and an editor
- macOS or Linux. Windows works natively for the harness and replay; see [docs/SETUP.md](docs/SETUP.md#windows).
- Plus what your path needs (table above). **No paid subscription is required.**

## ⚡ Five-minute setup (do this before the workshop)

```bash
git clone <this repository> gemini-shared-agent-memory-workshop
cd gemini-shared-agent-memory-workshop
npm ci
npm run setup      # asks how you want to participate; installs the pinned OpenLore (checksum verified)
npm run doctor     # checks only what your path needs
```

`npm run doctor` ends with **"You are ready to begin Exercise 01."** Full guide: [docs/SETUP.md](docs/SETUP.md).

## 🧪 Exercises

| # | Exercise | Time | Start | You'll |
|---|---|---|---|---|
| 01 | [The Amnesiac Agent](exercises/01-amnesiac-agent/README.md) | 12 min | `npm run exercise -- 01` | Run the refund task with no shared memory and inspect what the agent had to rediscover |
| 02 | [Teach an Agent to Remember](exercises/02-capture-knowledge/README.md) | 15 min | `npm run lore:start` then `npm run exercise -- 02` | Capture decisions as notes, review them, and publish them to OpenLore |
| 03 | [Share Knowledge Across Agents](exercises/03-share-knowledge/README.md) | 15 min | `npm run exercise -- 03` | Repeat the task in a fresh session that retrieves the reviewed knowledge |
| 04 | [Does Memory Actually Help?](exercises/04-evaluate-memory/README.md) | 15 min | `npm run exercise -- 04` | Compare correctness, tokens, exploration and retrieval with measured values only |

The default mode comes from `npm run setup`. Override it per command:

```bash
npm run exercise -- 01 --mode harness                          # path B
npm run exercise -- 01 --mode external --agent antigravity     # path A (also claude-code, codex, generic)
npm run exercise -- 01 --mode replay                           # path D
```

### 👉 Start here

```bash
npm run exercise -- 01
```

## 🧭 Solutions, checkpoints and resets

| Command | What it does |
|---|---|
| `npm run solution -- 01` … `04` | Reference solution in its own workspace (never touches yours), graded with the same checks |
| `npm run checkpoint -- 02` | Load reviewed reference knowledge into OpenLore if you are behind |
| `npm run checkpoint -- 01` / `03` | Add the genuine recorded run to `runs/` (needs recordings) |
| `npm run reset -- 03` | Fresh workspace for one exercise (asks first; keeps `runs/`) |
| `npm run inspect -- latest` | What the agent read, wrote and retrieved; hidden checks |
| `npm run collect -- 03 --agent claude-code` | Grade and save an external agent's work in the common format |
| `npm run lore -- "lore meta /knowledge"` | Run a command in OpenLore's shell (default identity is read-only) |
| `npm run lore:review` | Review proposals as the maintainer: promote or reject |

## 🖥 Optional: dashboard and replay page

Prefer a browser? `npm run ui` opens a local dashboard at http://localhost:7430. It runs the
exercises, streams what the agent reads and writes, reviews knowledge, and compares runs. It
listens on localhost only and never sends your keys to the browser.

`npm run ui:static` builds one offline HTML file that plays the recorded runs back with no server
and no model. See [workshop-ui/README.md](workshop-ui/README.md).

## 🤝 Pairs and the cross-agent demo

Developer A captures knowledge with one agent (for example Antigravity). Developer B starts a fresh
session in another agent or model (for example Claude Code, or the harness with an Anthropic key)
and retrieves it. Neither sees the other's conversation. On one laptop this needs no networking.
Across two laptops, run `npm run lore:pair -- invite` on the host; tokens are required, short-lived
and least-privilege. See [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

## 🆘 Troubleshooting

- **Not ready after `doctor`?** Fix the FAIL lines, or switch to replay (`npm run setup -- --path replay`) and pair up.
- **Gemini free tier:** works out of the box: setup picks `gemini-3.5-flash-lite` and paces requests to 5 per minute, so a session takes about 5–7 minutes. (3.x Flash allows only about 20 requests a day on the free tier.)
- **Quota exhausted for the day:** use another provider (`MODEL_PROVIDER`), Antigravity, or `--mode replay`.
- **`OpenLore is not running`:** `npm run lore:start`. Port busy? Set `OPENLORE_HTTP_PORT` in `.env`.
- More: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)

## 📚 Further learning

- [docs/PARTICIPANT_GUIDE.md](docs/PARTICIPANT_GUIDE.md): the workshop in one page
- [docs/POST_WORKSHOP.md](docs/POST_WORKSHOP.md): repeated-run benchmarks, access-control experiments, stale-knowledge drills
- [docs/PROVIDERS.md](docs/PROVIDERS.md): provider setup and default models
- [OpenLore documentation](https://openlore.sh/docs/)
- Instructors: [docs/INSTRUCTOR_GUIDE.md](docs/INSTRUCTOR_GUIDE.md), [WORKSHOP.md](WORKSHOP.md) and [PRD.md](PRD.md)

The repository structure and exercise style follow Faris Aziz's
[nextjs-architecture-workshop](https://github.com/farisaziz12/nextjs-architecture-workshop).
