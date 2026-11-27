# Choose your path

```text
Do you have Google Antigravity installed and signed in?
 ├─ yes → Path A: Antigravity (recommended; no API key needed)
 └─ no → Do you have an API key with quota (Gemini, OpenAI, Anthropic, OpenRouter, …)?
          ├─ yes → Path B: workshop harness with your key
          └─ no → Do you already use Claude Code, Codex or another MCP-capable agent?
                   ├─ yes → Path C: your agent
                   └─ no → Path D: offline replay (or pair with someone)
```

| | A. Antigravity | B. Harness (your key) | C. Your agent | D. Replay |
|---|---|---|---|---|
| Needs | Antigravity + Google sign-in | One provider key | Claude Code / Codex / … | Nothing |
| Gemini API key | Not required | Only if you pick Gemini | Not required | Not required |
| Runs the model | Antigravity | Workshop harness | Your agent | No (recorded) |
| OpenLore connection | MCP (`.agents/mcp_config.json`) | MCP (built in) | MCP (`.mcp.json`, `.codex/config.toml`, …) | Recorded snapshots |
| Same app, prompts, tests | ✔ | ✔ | ✔ | ✔ |
| Token and tool metrics | Unavailable | Measured | Unavailable | Recorded (from a live harness run) |
| Knowledge reads measured | ✔ (OpenLore event log) | ✔ (trace) | ✔ (OpenLore event log) | Recorded |
| Counts in Experiment A | No (not controlled) | **Yes** | No (not controlled) | Yes (labelled replay) |
| Counts in Experiment B | ✔ | ✔ | ✔ | ✔ |

**Why can't external agents count in Experiment A?** A controlled comparison needs the same tools,
prompt, budget and model in both conditions, all controlled by the workshop. External agents bring
their own system prompts, tools and context management, so their runs are reported but labelled
*not controlled*.

**Path D without the repository:** the instructor can hand out `workshop-replay.html`
(`npm run ui:static`). It plays the recorded runs and the comparison in any browser, offline.

**Prefer a browser to the terminal?** Every path works from the dashboard too: `npm run ui`
([workshop-ui/README.md](../workshop-ui/README.md)).

**Switching paths:** run `npm run setup` again, or override one command with `--mode` (and `--agent`).
You can mix paths: for example, capture knowledge with Antigravity and consume it with the harness.
That is exactly the [cross-agent demo](DEMO_SCRIPT.md).
