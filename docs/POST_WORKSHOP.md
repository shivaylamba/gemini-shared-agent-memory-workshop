# After the workshop

Ideas to take further. None of these are needed during the 75 minutes.

## 1. Repeated-run benchmark (P2)

One pair of runs is a demonstration. Model outputs vary, so to say anything about an effect, repeat
each condition:

```bash
for i in 1 2 3 4 5; do npm run exercise -- 01 --mode harness; npm run exercise -- 03 --mode harness; done
```

Then compare distributions, not single values: median and spread of input tokens, files read and
checks passed. Keep provider, model, budgets and snapshot fixed. Report capture cost separately and
amortise it over the number of consumer sessions. Do not claim net savings from one session.

## 2. Access-control experiments (P2)

`npm run setup` generates `.workshop/openlore/lore.json`; its source is `buildLoreJson()` in
`scripts/lib/openlore.ts`. Things to try:

- A `private` docset of engineering notes that only `maintainer` can read. Confirm readers get
  "file does not exist" even with the exact path.
- Per-agent docsets: a `harness-reader` that cannot see `/knowledge/runbooks`
- OpenLore folder rules (`size/kilobytes`, `okf`) to reject oversized or malformed notes at write
  time (see OpenLore `docs/concepts/folder-rules.md`)

## 3. Stale-knowledge drills

- `npm run stale-demo -- on`, then run Exercise 03 a few times. How often does the agent catch the
  contradiction with ADR-002?
- Add a review rule: notes whose `source` files changed since `verified_at` are flagged for review.

## 4. Other agents

- Import an existing Claude Code project memory into OpenLore with OpenLore's `lore` client
  (`lore agent import claude`, OpenLore 0.8.0).
- Connect more MCP clients from the OpenLore guides (Cursor, OpenCode, …).

## 5. Hosted OpenLore

For a team, follow OpenLore's [production checklist](https://openlore.sh/docs/): HTTPS, a pinned
image on a persistent volume, passkeys or OAuth instead of minted tokens, and no anonymous access.
