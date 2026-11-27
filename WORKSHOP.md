# Workshop plan (75 minutes)

| Time | Activity | Outcome |
|---|---|---|
| 00–08 | Introduction, choose a participation path, `npm run doctor` | Everyone knows the difference between session context, instructions and durable knowledge, and is ready |
| 08–20 | [Exercise 01: The Amnesiac Agent](exercises/01-amnesiac-agent/README.md) | A baseline run with no shared memory; its exploration made visible |
| 20–35 | [Exercise 02: Teach an Agent to Remember](exercises/02-capture-knowledge/README.md) | Reviewed, sourced notes published to OpenLore by a governed path |
| 35–50 | [Exercise 03: Share Knowledge Across Agents](exercises/03-share-knowledge/README.md) | The same task in a fresh session that retrieves the notes |
| 50–65 | [Exercise 04: Does Memory Actually Help?](exercises/04-evaluate-memory/README.md) | Measured comparison (Experiment A); optional stale-knowledge demo |
| 65–70 | Cross-agent portability demo, then access control ([script](docs/DEMO_SCRIPT.md)) | Knowledge produced by one agent, consumed by another, with no shared conversation; a refused write and `lore history` show who can write what |
| 70–75 | Takeaways and Q&A | When to use what; freshness, provenance, access, review |

## Learning flow

```text
baseline (forget) → capture (propose) → review (promote) → reuse (fresh session) → evaluate (measure)
```

Infrastructure is installed **before** the event. Providers and integrations are not explained in
the session; they should simply work. Every live step has a recorded fallback.

See [docs/INSTRUCTOR_GUIDE.md](docs/INSTRUCTOR_GUIDE.md) for the minute-by-minute runbook, and
[PRD.md](PRD.md) for requirements.
