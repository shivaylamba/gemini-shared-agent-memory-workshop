# Exercise 03: Share Knowledge Across Agents

⏱ **15 minutes** · [Task prompt](task.md) · [Solution](../../solutions/03-share-knowledge/README.md) · Next: [Exercise 04 →](../04-evaluate-memory/README.md)

## 🎯 What you'll learn

How knowledge outlives a conversation: a brand-new session, possibly in a different agent or model,
retrieves reviewed knowledge on demand instead of re-investigating.

## 🧠 The problem

Exercise 01's agent learned the project the hard way. Exercise 02 saved the durable parts. Now a new
session, with no shared conversation history and no access to the baseline's code changes, gets the
**same task**.

## 🗺 Starting state

- A **new** copy of `core-app/`, with the same snapshot hash as Exercise 01. The runner checks this.
- A new session. Nothing from earlier conversations is passed in.
- **Read-only** OpenLore access to approved `/knowledge`. Unreviewed proposals are invisible.

## 📋 Steps

1. Run the same prompt in a fresh session:

   | Path | What to do |
   |---|---|
   | **Harness** | `npm run exercise -- 03` |
   | **Antigravity** | `npm run exercise -- 03 --mode external --agent antigravity`, open the folder in a **new** conversation, check the `openlore` MCP server is connected, paste the prompt |
   | **Claude Code** | `npm run exercise -- 03 --mode external --agent claude-code`, then `OPENLORE_TOKEN="$(npm run -s lore:token -- claude-code read)" claude` in the printed folder |
   | **Codex / other** | `npm run exercise -- 03 --mode external --agent codex` (or `generic`) and follow the printed steps |
   | **Replay** | `npm run exercise -- 03 --mode replay` |

2. External agents: `npm run collect -- 03 --agent <name> --model "<model>"`. Knowledge reads come
   from OpenLore's own event log for your agent's identity.

3. Inspect retrieval:

   ```bash
   npm run inspect -- latest          # which notes were read, which files were still read
   ```

## 👀 What to look for

- Search, then read selected notes, then verify against the source, then implement. Did the agent
  check the code, or trust the note blindly?
- Which notes were never used? Unused knowledge is not free: it costs review and maintenance.
- In pairs: Developer A captures with one agent (say Antigravity), Developer B consumes with another
  (say Claude Code). Neither sees the other's conversation. See [cross-agent demo](../../docs/DEMO_SCRIPT.md).

## ✅ You're done when

- [ ] The session started with no previous conversation and no baseline code changes
- [ ] It retrieved real knowledge (document paths and sizes appear in the run)
- [ ] The implementation and test results are saved as a separate run
- [ ] Both a baseline run and a shared-memory run exist (`npm run inspect -- --list`)

## 🆘 Stuck?

- **`/knowledge is nearly empty`:** finish the review (`npm run lore:review`) or run `npm run checkpoint -- 02`
- **Antigravity shows no `openlore` server:** see [integrations/antigravity](../../integrations/antigravity/README.md#troubleshooting)
- **Live run fails:** `npm run exercise -- 03 --mode replay` or `npm run checkpoint -- 03`
