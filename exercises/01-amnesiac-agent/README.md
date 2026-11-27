# Exercise 01: The Amnesiac Agent

⏱ **12 minutes** · [Task prompt](task.md) · [Solution](../../solutions/01-amnesiac-agent/README.md) · Next: [Exercise 02 →](../02-capture-knowledge/README.md)

## 🎯 What you'll learn

What a coding agent does when it starts a session knowing nothing about your project, and what that
investigation costs.

## 🧠 The problem

ShopFlow is a small payments backend. Refunds are not implemented. The team has already settled how
money, provider calls, retries and errors must work. Those decisions are in the code, the ADRs and an
outdated runbook, but a fresh agent session has to rediscover them every time.

## 🗺 Starting state

- A fresh copy of `core-app/` (refunds unimplemented in `src/refunds/`)
- The original docs, including a 2023 runbook that recommends the deprecated adapter
- **No shared knowledge.** OpenLore is not available in this session.

## 📋 Steps

1. Start the exercise. It prepares a clean workspace and shows the prompt:

   ```bash
   npm run exercise -- 01
   ```

2. Run the agent on the [task prompt](task.md), using your path:

   | Path | What to do |
   |---|---|
   | **Harness** (your API key) | Nothing extra. `npm run exercise -- 01` runs a fresh session and streams every tool call |
   | **Antigravity** | `npm run exercise -- 01 --mode external --agent antigravity`, open the printed folder in a **new** conversation, paste the prompt |
   | **Claude Code / Codex / other** | `npm run exercise -- 01 --mode external --agent claude-code` (or `codex`, `generic`), then follow the printed launch command |
   | **Replay** (no key) | `npm run exercise -- 01 --mode replay` |

3. External agents only: when the agent finishes, grade and save its work:

   ```bash
   npm run collect -- 01 --agent <antigravity|claude-code|codex|generic> --model "<model you used>"
   ```

4. Inspect what happened:

   ```bash
   npm run inspect -- latest            # files read, checks, constraints
   npm run inspect -- latest --trace    # every tool call
   ```

## 👀 What to look for

- How many files the agent read before writing code, and which ones
- Whether it found ADR-002 or followed the 2023 runbook (`LegacyPayGateAdapter`)
- Input tokens per model request. The full history is resent on every request.
- The hidden checks: a baseline that passes everything is a valid result

## ✅ You're done when

- [ ] A fresh session ran with visible tool calls (harness/replay), or your external agent finished
- [ ] The implementation is in a workspace you can open and the tests ran
- [ ] A baseline run exists in `runs/` (`npm run inspect -- --list`)
- [ ] No OpenLore calls happened (`Knowledge 0 searches · 0 docs read`)

Ask yourself: if another developer starts a new session tomorrow, how does their agent benefit from
everything this one just learned?

## 🆘 Stuck?

- **No key, quota error or 429:** `npm run exercise -- 01 --mode replay`
- **Run takes longer than the timebox:** stop it (Ctrl+C) and use the recorded baseline: `npm run checkpoint -- 01`
- **Agent edits files outside `src/` or `tests/`:** the harness refuses; for external agents it is reported in the run summary
