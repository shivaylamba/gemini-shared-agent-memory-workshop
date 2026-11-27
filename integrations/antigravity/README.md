# Path A: Google Antigravity

Use Antigravity directly, signed in with your Google account. **You do not need a Gemini API key or
the workshop harness.** The workshop prepares clean workspaces, connects them to OpenLore over MCP,
and grades the results with the same tests as every other path.

## Verified against the Antigravity docs (November 2026)

- **Sign-in:** personal Google accounts work on any plan, including the free tier (FAQ). The App and
  IDE use a browser sign-in; the CLI is `agy`. Free-plan quotas apply and can run out. The CLI can
  also use a Gemini API key (`"modelProvider": "gemini"` plus `GEMINI_API_KEY`), but this workshop
  does not need one.
- **MCP:** custom servers go in `mcpServers` in `~/.gemini/config/mcp_config.json` (global) or
  `<workspace>/.agents/mcp_config.json` (workspace). Remote servers use `serverUrl` (or `url`), plus
  `headers`, and must speak Streamable HTTP. OpenLore 0.8.0 does.
- **Not verified here:** this repository was built without access to Antigravity. Before the event,
  the presenter must run the checklist below on a real install. The docs do not say whether plain
  `http://localhost` MCP URLs or environment-variable expansion in `headers` are supported. The
  workshop therefore writes a short-lived, least-privilege token into the workspace file.
- **Credentials:** the workshop never reads or reuses Antigravity's account credentials.

## Setup (once)

```bash
npm ci
npm run setup        # choose "1. Google Antigravity"
npm run lore:start   # needed from Exercise 02
npm run doctor
```

## Each exercise

```bash
npm run exercise -- 01 --mode external --agent antigravity
```

The runner prepares `~/shopflow-workshop/<nn>-<condition>/`, a fresh copy of ShopFlow outside this
repository, and prints the prompt (also in [prompts/](prompts)).

1. In Antigravity, open that folder and start a **new conversation**. Never continue an earlier one:
   the point is a fresh session.
2. Exercises 02 and 03 add `.agents/mcp_config.json` to the folder:

   ```json
   { "mcpServers": { "openlore": { "serverUrl": "http://localhost:7420/mcp", "headers": { "Authorization": "Bearer <token>" } } } }
   ```

   Check that `openlore` is connected: in the CLI run `/mcp`; in the App go to Customizations ›
   Installed › MCP Servers; in the IDE use the agent panel ⋮ › MCP Servers.
3. Paste the prompt. Let the agent work and run the tests.
4. Save the result: `npm run collect -- <nn> --agent antigravity --model "<model shown in Antigravity>"`.
   After Exercise 02, review the proposals with `npm run lore:review`.

**Baseline (Exercise 01):** the workspace has no MCP config, but a global `openlore` entry in
`~/.gemini/config/mcp_config.json` would leak into it. Remove or disable it for Exercise 01.

## Identities and access

| Exercise | Identity | Token scope | Can |
|---|---|---|---|
| 02 | `antigravity-capture` | full | read `/knowledge`; publish into `/proposals/inbox` only |
| 03 | `antigravity-reader` | read | read approved `/knowledge` only |

`lore history` shows `antigravity-capture` as the author of its proposals, and `maintainer` as the
reviewer who promoted them.

## What the workshop can measure for Antigravity runs

- Correctness and regression: yes (same grader)
- Knowledge reads and searches: yes, from OpenLore's own event log for `antigravity-reader`
- Tokens, tool calls, files read: **unavailable**. They are not observable outside Antigravity and are never estimated.
- Antigravity runs are labelled *not controlled* and are not used in Experiment A.

## Presenter checklist (do this before the event)

- [ ] Sign in on the presenter laptop; confirm the free or paid plan has quota left
- [ ] `npm run exercise -- 03 --mode external --agent antigravity`; open the folder; confirm `openlore` shows as connected
- [ ] Ask "Run `lore docsets` with the openlore lore_bash tool". Expect only `knowledge  ro`.
- [ ] Run [prompts/cross-client-demo.md](prompts/cross-client-demo.md) end to end; record a backup screen capture
- [ ] If localhost HTTP is rejected, fall back to the global config with the same `serverUrl` and `headers`, and note it in the instructor guide

## Troubleshooting

- **`openlore` not listed:** reload MCP config (`/mcp` in the CLI); make sure you opened the prepared folder itself, not its parent
- **401 Unauthorized:** the token expired (12 h). Rerun `npm run exercise -- <nn> --mode external --agent antigravity`
- **Quota exhausted:** switch to the harness with another provider, or replay
