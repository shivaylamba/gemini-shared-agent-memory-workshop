# Cross-agent knowledge portability demo (Experiment B)

Show that knowledge written by one agent is retrieved and used by a different agent or model, through
OpenLore, with **no shared conversation history**. This demonstrates portability, not a controlled
performance improvement.

## One laptop, two clients (recommended)

Prerequisites: `npm run lore:start`; Antigravity signed in; Claude Code installed, **or** an
Anthropic/OpenAI key for the harness.

| Step | Developer A: producer (Antigravity) | Developer B: consumer (Claude Code or harness) |
|---|---|---|
| 1 | `npm run exercise -- 02 --mode external --agent antigravity`, then open the folder in a **new** Antigravity conversation and paste the capture prompt | |
| 2 | The agent publishes notes with `lore_bash` → `publish` (identity `antigravity-capture`) | |
| 3 | `npm run lore:review`: read, check one source, approve | |
| 4 | `npm run lore -- --as maintainer "lore history /knowledge/decisions/<note>.md"` shows `antigravity-capture` wrote it and `maintainer` promoted it | |
| 5 | | `npm run exercise -- 03 --mode external --agent claude-code`, then `OPENLORE_TOKEN=… claude` in the printed folder (new session). **Or** `MODEL_PROVIDER=anthropic npm run exercise -- 03 --mode harness` |
| 6 | | The agent searches and reads `/knowledge` as `claude-code-reader` (or `harness-reader`) and implements refunds |
| 7 | | `npm run collect -- 03 --agent claude-code --model "<model>"` (external only) |
| 8 | Both: `npm run evaluate -- --portability` | |

Expected report shape (values depend on your runs):

```text
Producers (from OpenLore provenance)
  antigravity-capture        /knowledge/decisions/payment-provider.md, /knowledge/decisions/refund-idempotency.md
Consumers (fresh shared-memory sessions)
  claude-code · <model> (external, live)  checks n/10
     read: /knowledge/decisions/refund-idempotency.md, …
     knowledge produced by: antigravity-capture
```

What to say: neither developer saw the other's conversation. The knowledge belongs to the project,
lives in OpenLore, and is governed: agents could only propose, a human promoted, and every read and
write is attributed to an identity.

What **not** to say: "Claude did better than Antigravity because of memory." Different agents and
models are not a controlled comparison (Experiment A covers that).

## Two laptops (optional)

On the host:

```bash
npm run lore:start
npm run lore:pair -- invite        # prints a join command with 4-hour partner tokens
```

On the partner's laptop (same network):

```bash
npm run lore:pair -- join http://<host-ip>:7420 --reader <token> --capture <token>
npm run exercise -- 03 --mode external --agent claude-code   # now uses partner-reader on the host's server
npm run lore:pair -- leave                                    # afterwards
```

- Tokens are required. The server never accepts anonymous requests.
- Partner identities are least-privilege: `partner-capture` can only publish into the inbox, and
  `partner-reader` can only read approved knowledge.
- Traffic is **plain HTTP**. Others on the same Wi-Fi could observe tokens. Use this only on a
  network you trust; otherwise use the one-laptop demo.
- Knowledge-read metrics for the partner come from the **host's** OpenLore event log. On the
  partner's laptop they are reported as unavailable.

## Presenter's Antigravity demo (minutes 65–70)

`npm run exercise -- 03 --mode external --agent antigravity`, open a new conversation, and paste
[integrations/antigravity/prompts/cross-client-demo.md](../integrations/antigravity/prompts/cross-client-demo.md).
The agent should cite knowledge documents produced earlier by a different client and verify them
against the source, without modifying files. Keep a recorded backup in case the network fails.
