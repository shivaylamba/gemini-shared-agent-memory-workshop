# Solution 04: How to read the comparison

`npm run evaluate` prints measured values only. There is no "expected" result to copy. Read it in this order:

1. **Is the pair controlled?** Same interface (harness), provider, model, snapshot, task prompt,
   budgets and harness version. If not, say so and use the portability report instead.
2. **Correctness:** hidden checks (of 10), regression failures, constraints respected (of 5). A
   memory setup that makes runs cheaper but less correct is a regression.
3. **Context:** sum of input tokens across requests (each request resends the history), the largest
   single request, and the number of model requests.
4. **Exploration:** file reads, unique files, bytes read, searches.
5. **Knowledge:** notes read and bytes retrieved. Did the agent use the knowledge, or read everything anyway?
6. **Upfront cost:** the capture run's tokens plus your review time. Savings on one run rarely repay
   that; savings across many sessions and agents might.
7. **Uncertainty:** one pair of runs; model outputs vary. Run each condition several times before
   claiming an effect (see [docs/POST_WORKSHOP.md](../../docs/POST_WORKSHOP.md)).

Valid conclusions include "both correct; shared memory read fewer files", "no measurable difference",
and "shared memory was worse because note X was stale". All three are useful.

Stale-knowledge discussion (`npm run stale-demo -- on`): the stale note claims `status: current`
but has `verified_at: 2023-07-11` and cites a 2023 runbook. Mitigations: show provenance and freshness
in notes, tell agents to verify claims against code, review notes when the cited source changes, and
keep history (`lore history`) to see who changed what.
