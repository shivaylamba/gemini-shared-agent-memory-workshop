# Troubleshooting

**First rule during the workshop:** if something takes more than two minutes, switch to replay
(`--mode replay`) or pair with a neighbour, and fix it afterwards.

## Setup

| Symptom | Fix |
|---|---|
| `Node.js … is too old` | Install Node 22.18+ (`nvm install && nvm use`) |
| `ERR_UNKNOWN_FILE_EXTENSION ".ts"` | Node < 22.18. Upgrade. |
| `Dependencies FAIL` | `npm ci` |
| `Download failed` / proxy | Download the release asset manually and run `OPENLORE_ARCHIVE=<file> npm run setup`. Or set `OPENLORE_BIN`. Or use replay. |
| `Checksum mismatch` | Do not use that archive. Re-download from the official release page. |
| `Application tests FAIL` | The Node permission model or test runner failed; check the message. On Windows, try WSL. |

## Harness and providers

| Symptom | Fix |
|---|---|
| `Model provider not configured` | `npm run setup` or edit `.env`. Only the chosen provider's key is needed. |
| HTTP 401/403 | Wrong key for `MODEL_PROVIDER` |
| HTTP 404 | `MODEL_ID` not available to your key. Try the provider default (empty `MODEL_ID`). |
| HTTP 429 "requests per minute" (Gemini free tier: 5/min) | Set `MODEL_REQUESTS_PER_MINUTE=5` in `.env`. The harness also waits out 429s by itself (shown as `wait` lines) |
| HTTP 429 "daily quota" (Gemini free tier: about 20 requests/day on 3.x Flash) | Waiting does not help until midnight Pacific. Use `MODEL_ID=gemini-3.5-flash-lite` (much larger free daily quota), a paid key, Antigravity, or `--mode replay` |
| HTTP 503 "high demand" | Temporary. The harness waits and retries; or pick another `MODEL_ID` (e.g. `gemini-3.6-flash`) |
| Run stops with `budget_exhausted` | The model used up `AGENT_MAX_MODEL_REQUESTS` or `AGENT_MAX_TOOL_CALLS`. The partial result is still graded. Raise budgets for **both** conditions if you change them. |
| Run is slow | Ctrl+C, then `npm run checkpoint -- 01` (or `03`) |

## OpenLore

| Symptom | Fix |
|---|---|
| `OpenLore is not running` | `npm run lore:start` |
| `Port 7420 is already in use` | Stop the other process, or set `OPENLORE_HTTP_PORT` / `OPENLORE_SSH_PORT` in `.env`, then `npm run lore:start` |
| `OpenLore exited during start-up` | See `.workshop/openlore/server.log` |
| 401 Unauthorized | Token expired (12 h). Rerun the exercise command; it mints a new one. |
| `read-only filesystem` when publishing | You used a reader token, or wrote outside `/proposals/<slug>.md`. Agents publish with `cat <<'EOF' \| publish /proposals/<slug>.md`. |
| `/knowledge is nearly empty` | `npm run lore:review` (approve proposals) or `npm run checkpoint -- 02` |
| Proposal rejected by the validator | Fix the frontmatter, sections or `source` paths, then publish again |

## External agents

| Symptom | Fix |
|---|---|
| Agent does not show `openlore` | Open the **prepared folder itself**; reload MCP; see the agent's guide in `integrations/` |
| Claude Code: `${OPENLORE_TOKEN}` sent literally | Launch with `OPENLORE_TOKEN="$(npm run -s --prefix <workshop> lore:token -- claude-code read)" claude` |
| Codex ignores `.codex/config.toml` | Trust the project when Codex asks |
| Baseline agent can see OpenLore | Remove the global or user-scope `openlore` server for Exercise 01 |
| `No prepared workspace` on collect | Run `npm run exercise -- <nn> --mode external` first |

## Replay

| Symptom | Fix |
|---|---|
| `No genuine "…" recording` | This copy has no recordings yet. Ask the instructor for the recordings bundle, or pair. |
| `The application snapshot changed since this recording` | `core-app/` was edited. `git checkout core-app`, or re-record. |

## Dashboard and replay page

| Symptom | Fix |
|---|---|
| `Port 7430 is busy` | Set `WORKSHOP_UI_PORT` in `.env`, or stop the other process. |
| `Misdirected request` | Open `http://localhost:7430`, not the laptop's network address. The dashboard only answers on localhost. |
| `Missing or invalid dashboard token` | The server restarted. Reload the page. |
| `A run is already in progress` | One run at a time per laptop. Wait for it, or watch it on its exercise page. |
| `npm run ui:static`: `No recordings were found` | Record first (`npm run record -- all`), or build from your own runs with `--include-runs`. |
| `npm run ui:static`: `looks like … key` | A run contains something shaped like a credential. Find it in `runs/<id>/` or `recordings/`, remove the run, and build again. |
