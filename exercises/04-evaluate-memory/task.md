# Task: evaluate whether shared memory helped

No agent prompt. Compare the baseline run (Exercise 01) with the shared-memory run (Exercise 03):

```bash
npm run evaluate                    # Experiment A: controlled comparison (same harness, provider, model and budget)
npm run evaluate -- --portability   # Experiment B: who produced the knowledge, who consumed it
```

Answer three questions with measured values only:

1. Did correctness change (10 hidden checks, regression tests, the five architectural constraints)?
2. Did exploration and context change (files read, input tokens, model requests, time)?
3. What did the knowledge cost up front (the capture run), and did it pay for itself here?
