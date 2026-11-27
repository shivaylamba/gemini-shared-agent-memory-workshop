# Exercise 04: Does Memory Actually Help?

⏱ **15 minutes** · [Task](task.md) · [Solution](../../solutions/04-evaluate-memory/README.md) · Back to the [workshop overview](../../README.md)

## 🎯 What you'll learn

How to evaluate an agent-memory setup honestly: correctness first, then context and exploration, with
upfront costs and the limits of one run in view.

## 🧠 The problem

"Memory makes agents better" is a hypothesis. You now have two runs on the same task. Measure them.

## 📋 Steps

1. Compare the latest baseline (01) and shared-memory (03) runs:

   ```bash
   npm run exercise -- 04            # same as: npm run evaluate
   npm run exercise -- 04 --mode replay   # compare the genuine recordings instead
   ```

2. Read the report (also saved to `runs/evaluations/*.md`):
   - **Comparable pair?** Experiment A only counts harness runs with the same provider, model,
     snapshot, prompt, budgets and harness version. External-agent runs are shown but labelled
     *not controlled*.
   - **Correctness:** hidden checks, regression tests, the five architectural constraints
   - **Context:** input and output tokens, largest single request, model requests
   - **Exploration:** files read, bytes read, searches, tool calls
   - **Knowledge:** searches, notes read, bytes retrieved
   - **Upfront cost:** the capture run from Exercise 02
3. Portability (who produced the knowledge, who consumed it):

   ```bash
   npm run evaluate -- --portability
   ```

4. *(Optional, 3 min)* Stale knowledge. Replace the provider note with an outdated one that still
   claims `status: current`, then rerun Exercise 03:

   ```bash
   npm run stale-demo -- on
   npm run exercise -- 03 --label stale-memory      # or: --mode replay --label stale-memory
   npm run evaluate -- --label stale-memory
   npm run stale-demo -- off
   ```

## 👀 What to look for

- Both runs passing every check is a valid outcome. Then the question is cost and exploration.
- If shared memory did worse, find out why: a misleading note, an unused note, or the model?
- "unavailable" means the value was not reported. It is never estimated.
- One pair of runs is a demonstration, not a benchmark.

## ✅ You're done when

- [ ] You can state what changed using measured values only
- [ ] You know whether the pair was controlled, and live or replay
- [ ] You can name the upfront cost and one risk (stale or misleading knowledge)

## 🆘 Stuck?

- **"Need one baseline run and one shared-memory run":** `npm run checkpoint -- 01` and `npm run checkpoint -- 03` add the recorded runs
- **"NOT a controlled comparison":** expected when you mix agents or models. Use Experiment B for that story.
