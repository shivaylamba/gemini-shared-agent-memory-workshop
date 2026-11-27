# Starter state: Exercise 01

The starter is the shared application in [`core-app/`](../../../core-app). It is not copied here, so
there is a single source of truth. `npm run exercise -- 01` creates a fresh copy:

- harness: `.workshop/workspaces/01-baseline/` (tools are confined to it)
- external agents: `~/shopflow-workshop/01-baseline/` (outside the repository, with no MCP configuration)

Each copy is identical: its snapshot hash is recorded in the run's `metadata.json`.
