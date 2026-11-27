# External-agent runs (evidence, not replayable)

Runs collected with `npm run collect` from real external agents. External agents run outside the
workshop, so there is no trace to replay and token usage is unavailable; correctness is graded the
same way as every other run, and knowledge reads come from OpenLore's own log.

- `claude-code-03/`: Claude Code (Opus 5.5) in print mode, Exercise 03, 27 November 2026. A fresh
  workspace with read-only OpenLore access. It read four notes (three written by the Gemini
  harness in the `capture` recording, after review) and scored 10/10 on the hidden checks.
