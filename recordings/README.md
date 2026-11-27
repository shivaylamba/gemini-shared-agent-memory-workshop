# Recordings (offline replay)

Replay mode re-plays **genuine** recorded harness runs: the model's real tool calls, the knowledge
it read or proposed, its file changes and its provider-reported token usage. Then it re-runs the
tests and the hidden grader locally on those changes. No model is called, and every replayed run is
labelled `origin: replay` with a pointer to its recording.

## Status: genuine recordings included (27 November 2026)

Recorded live on macOS (Node 24) with the workshop harness, `google/gemini-3.5-flash-lite`, on a
free-tier AI Studio key paced to 5 requests per minute. Each `provenance.json` has the details.

| Recording | Result |
|---|---|
| `baseline/` (Exercise 01, no memory) | 3/10 hidden checks, 0/5 constraints. Used all 30 model requests, mostly exploring. |
| `capture/` (Exercise 02) | 3 proposals. A reviewer checked each claim and source against the code and approved all three. |
| `shared-memory/` (Exercise 03) | 10/10 hidden checks, 5/5 constraints. Same model, budget, prompt and starting code as the baseline. |
| `stale-memory/` (Exercise 04 demo) | 10/10. The stale note was not among the notes the agent read. |
| `external/claude-code-03/` | Not replayable (no trace). A real Claude Code session (Opus 5.5) collected in Exercise 03: it read 4 notes from OpenLore (3 written by the Gemini harness) and scored 10/10. Kept as evidence for the cross-agent demo. |

The graded recordings were re-graded once with `npm run regrade` after a grader fix. Two readings of
ADR-005 are now accepted for refunding a fully refunded order. Model output and metrics are
unchanged, and `result.json` and `metadata.json` record the regrade.

To re-record (for example with a paid key and `MODEL_ID=gemini-3.6-flash`):

```bash
npm run lore:start
npm run record -- all          # baseline → capture → (review) → shared-memory
npm run stale-demo -- on && npm run record -- stale-memory && npm run stale-demo -- off   # optional
git add recordings && git commit -m "Re-record"
```

Or promote a good live run you already have: `npm run record -- --from <run-id> baseline`.

Each recording directory holds the run artifacts plus `provenance.json`:

```json
{ "recording": "baseline", "synthetic": false, "recordedAt": "…", "provider": "google", "model": "…",
  "harnessVersion": "1.0.0", "openloreVersion": "0.8.0", "gitCommit": "…" }
```

Replay refuses recordings marked `synthetic: true` (unit-test fixtures). It also refuses recordings
whose application snapshot hash no longer matches `core-app/`.

`npm run ui:static` turns these recordings into one offline HTML page. See
[workshop-ui/README.md](../workshop-ui/README.md).

| Directory | Used by |
|---|---|
| `baseline/` | `npm run exercise -- 01 --mode replay`, `npm run checkpoint -- 01` |
| `capture/` | `npm run exercise -- 02 --mode replay` |
| `shared-memory/` | `npm run exercise -- 03 --mode replay`, `npm run checkpoint -- 03` |
| `stale-memory/` | `npm run exercise -- 03 --mode replay --label stale-memory` |
