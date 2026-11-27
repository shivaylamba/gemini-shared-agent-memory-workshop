# Exercise 02: Teach an Agent to Remember

⏱ **15 minutes** · [Task prompt](task.md) · [Solution](../../solutions/02-capture-knowledge/README.md) · Next: [Exercise 03 →](../03-share-knowledge/README.md)

## 🎯 What you'll learn

The difference between conversation history and durable knowledge, and how to turn an investigation
into short, sourced, reviewed notes that any agent can retrieve later.

## 🧠 The problem

The baseline agent's discoveries vanished when its session ended. Saving the transcript does not
help: it is long, unreviewed, full of dead ends, and tied to one tool. We want decisions, rationale,
guidance and sources instead.

## 🗺 Starting state

- A fresh copy of `core-app/`
- OpenLore running with two areas:
  - `/knowledge`: approved notes. Agents can read them but not change them.
  - `/proposals/inbox`: agents publish proposals here. A maintainer (you) promotes them.
- The agent uses its own identity (for example `antigravity-capture`), so OpenLore records who wrote what

## 📋 Steps

1. Start the knowledge server and look at what is there:

   ```bash
   npm run lore:start
   npm run lore -- "ls -R /knowledge"
   ```

2. Run the capture session on the [task prompt](task.md):

   | Path | What to do |
   |---|---|
   | **Harness** | `npm run exercise -- 02` (the agent calls `propose_knowledge`) |
   | **Antigravity** | `npm run exercise -- 02 --mode external --agent antigravity`, open the folder in a **new** conversation (OpenLore is preconfigured in `.agents/mcp_config.json`), paste the prompt |
   | **Claude Code / Codex / other** | `npm run exercise -- 02 --mode external --agent claude-code` and use the printed launch command |
   | **Replay** | `npm run exercise -- 02 --mode replay`, then `npm run checkpoint -- 02` |

3. **Review** the proposals as the maintainer. Check at least one `source` path against the code yourself.

   ```bash
   npm run lore:review              # interactive: approve / reject / skip
   npm run lore:review -- --list    # or non-interactive
   ```

4. Retrieve the approved knowledge the way an agent would. These are real OpenLore shell commands:

   ```bash
   npm run lore -- "lore meta /knowledge"
   npm run lore -- "grep -rn -i idempot /knowledge"
   npm run lore -- --as maintainer "lore history /knowledge/decisions/refund-idempotency.md"
   ```

5. External agents only: `npm run collect -- 02 --agent <name>` records which proposals your agent wrote.

## 👀 What to look for

- Notes are a few dozen lines, not a transcript. Each has `status`, `verified_at` and `source`.
- The validator rejects notes with invented source paths, missing sections or credential-shaped text.
- The agent **could not** write to `/knowledge`. Only your review promoted notes, and `lore history` shows both steps.
- The knowledge lives in OpenLore, outside any model's context.

## ✅ You're done when

- [ ] At least three useful notes are approved in `/knowledge`
- [ ] Every approved note's `source` paths exist in ShopFlow
- [ ] OpenLore retrieval works (`lore meta`, `grep`, `cat`)
- [ ] No credentials or conversation history are in the notes

## 🆘 Stuck?

- **Behind or the capture run failed:** `npm run checkpoint -- 02` loads six reviewed reference notes (it keeps any notes you already approved)
- **`OpenLore is not running`:** `npm run lore:start`. Port busy? Set `OPENLORE_HTTP_PORT` in `.env`.
- **A proposal is invalid:** reject it, or fix it and publish again. `--force` exists but defeats the review.
