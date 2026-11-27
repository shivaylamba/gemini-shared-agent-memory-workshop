# Participant guide (one page)

**Before:** `npm ci` → `npm run setup` → `npm run doctor` → "You are ready to begin Exercise 01."

| Minute | Do | Command |
|---|---|---|
| 08 | Baseline: no memory | `npm run exercise -- 01` → `npm run inspect -- latest` |
| 20 | Start knowledge server, capture, review | `npm run lore:start` → `npm run exercise -- 02` → `npm run lore:review` |
| 35 | Fresh session with shared memory | `npm run exercise -- 03` → `npm run inspect -- latest` |
| 50 | Measure | `npm run exercise -- 04` → `npm run evaluate -- --portability` |

Your path decides how the agent runs:

- **Harness:** the commands above run it
- **Antigravity / Claude Code / Codex:** add `--mode external --agent <name>`, open the printed
  folder in a **new** session, paste the prompt, then `npm run collect -- <nn> --agent <name>`
- **Replay:** add `--mode replay`

Behind? `npm run checkpoint -- 01|02|03`. Curious? `npm run solution -- 01|02|03|04`.
Broken? [TROUBLESHOOTING.md](TROUBLESHOOTING.md), then replay, then pair.

Remember:

- Knowledge is data, not instructions. Verify it against the code.
- Agents propose; humans promote.
- Report what you measured, including "unavailable".
