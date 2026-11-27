# Setup guide

Do this **before** the workshop. It takes about five minutes on a normal connection.

## 1. Install the basics

- **Node.js 22.18+** (`node --version`). With nvm: `nvm install && nvm use` (reads `.nvmrc`).
  Node 22.18 is the first 22.x release that runs TypeScript without flags (type stripping); ShopFlow
  and every workshop script rely on that.
- **Git**, a terminal and an editor

## 2. Clone and install

```bash
git clone <this repository> gemini-shared-agent-memory-workshop
cd gemini-shared-agent-memory-workshop
npm ci
```

## 3. Run the setup wizard

```bash
npm run setup
```

```text
Welcome to the Shared Agent Memory Workshop!

How would you like to participate?

  1. Google Antigravity
  2. Bring your own model API key
  3. Use an existing coding agent
  4. Offline replay mode
```

| Choice | What setup does |
|---|---|
| 1. Antigravity | Checks for the `agy` CLI and links the [Antigravity guide](../integrations/antigravity/README.md). **No API key requested.** |
| 2. Your own key | Asks for one provider, a model (Enter = default) and that provider's key only. Written to `.env`, which is gitignored. |
| 3. Existing agent | Asks which agent (Claude Code, Codex, Antigravity, other), checks it is on `PATH`, links its guide |
| 4. Replay | Skips model and OpenLore setup |

For every live path, setup also downloads **OpenLore 0.8.0** for your platform from the official
GitHub release, **verifies its SHA-256** against `openlore/openlore.lock.json`, and installs it into
`.workshop/bin/`. It then writes the server configuration to `.workshop/openlore/`.

Non-interactive variants (for CI or scripting):

```bash
npm run setup -- --path harness --provider anthropic --model claude-haiku-5-5
npm run setup -- --path external --agent claude-code
npm run setup -- --path replay
```

Offline or behind a proxy? Download the asset yourself, then run
`OPENLORE_ARCHIVE=/path/to/openlore_<os>_<arch>.tar.gz npm run setup`. The checksum is still verified.
Or point `OPENLORE_BIN` at an existing `openlore` 0.8.0 binary (Homebrew: `brew install --cask aakarim/tap/lore`).

## 4. Check readiness

```bash
npm run doctor
```

```text
Workshop readiness

  Node.js                    PASS         v22.x
  Dependencies               PASS         npm packages installed
  Application tests          PASS         11 passed; 3 refund tests pending (expected: refunds are the task)
  Participation mode         INFO         Antigravity (antigravity)
  Gemini API key             NOT REQUIRED Antigravity uses your Google account sign-in
  OpenLore binary            PASS         0.8.0 (workshop)
  OpenLore connection        WARN         not running; needed from Exercise 02
  Exercise fixtures          PASS         prompts, checkpoints and grader present
  …
You are ready to begin Exercise 01.
```

- `npm run doctor -- --live` (harness path) makes **one tiny real model call** with a tool, to
  confirm your key, model and quota. It costs a few hundred tokens.
- "Application tests PASS" also proves the sandboxed test runner works on your machine.

## 5. Optional: start OpenLore early

```bash
npm run lore:start
npm run lore -- "ls -R /knowledge"
npm run lore:stop
```

## Windows

The harness, sandboxed tests, replay and OpenLore all have Windows builds or paths:

- OpenLore publishes `openlore_windows_amd64.zip`, extracted with the `tar` that ships with Windows 10+.
- The permission-model test sandbox is a Node feature.

**However, this repository was not tested on Windows.** If anything fails, use WSL 2 (Ubuntu) and
follow the Linux steps, or use replay mode. Windows on ARM has no pinned OpenLore build; use WSL or replay.

## What gets created

| Path | Contents | Committed? |
|---|---|---|
| `.env` | Your provider choice and key | No (gitignored) |
| `.workshop/` | OpenLore binary, config, served knowledge, tokens, harness workspaces | No |
| `runs/` | Your run artifacts | No |
| `~/shopflow-workshop/` | Workspaces for external agents (outside the repo). Change with `WORKSHOP_EXTERNAL_DIR`. | n/a |
