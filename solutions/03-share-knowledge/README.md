# Solution 03: Share Knowledge Across Agents

```bash
npm run solution -- 03
```

The target implementation is the same as [Solution 01](../01-amnesiac-agent/README.md): same task,
same reference, same hidden checks. `npm run solution -- 03` grades it in its own workspace
(`.workshop/solutions/03/`).

What a good shared-memory session looks like in the trace (`npm run inspect -- latest --trace`):

1. `list_knowledge` or `search_knowledge` for refunds, idempotency and the provider
2. `read_knowledge` on two or three relevant notes, not the whole repository
3. `read_file` on the sources the notes point to (verification), then on the files to change
4. `write_file` for the refund route, the service and the provider wiring, then `run_tests`

The knowledge it should find is in [Solution 02](../02-capture-knowledge/README.md).
