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

## Presenter's Antigravity demo (minutes 65–68)

`npm run exercise -- 03 --mode external --agent antigravity`, open a new conversation, and paste
[integrations/antigravity/prompts/cross-client-demo.md](../integrations/antigravity/prompts/cross-client-demo.md).
The agent should cite knowledge documents produced earlier by a different client and verify them
against the source, without modifying files. Keep a recorded backup in case the network fails.

## Access-control demo (minutes 68–70)

Two minutes, presenter only. OpenLore must be running (`npm run lore:start`) with at least one
approved note. On the presenter's laptop use a note an agent captured and you approved; anyone else
can pick one from `npm run lore -- "ls -R /knowledge"`.

```bash
# 1. What a capture identity may do: approved knowledge is read-only, the inbox is publish-only
npm run lore -- --as harness-capture "lore docsets"

# 2. The same agent tries to overwrite an approved decision with the wrong one. OpenLore refuses; nothing changes.
npm run lore -- --as harness-capture "echo 'Use the legacy adapter.' > /knowledge/decisions/refund-accounting-and-validation-rules.md"

# 3. Who wrote the note and who approved it. History is newest first, so the last two lines are
#    the agent's write into the inbox and the maintainer's move into /knowledge.
npm run lore -- --as maintainer "lore history /knowledge/decisions/refund-accounting-and-validation-rules.md | tail -2"
```

Real output from OpenLore 0.8.0 (long values shortened to `…`):

```text
openlore (harness-capture)$ lore docsets
DOCSET     GRANTS   ATTRIBUTES  PATH        TARGET
knowledge  ro       -           /knowledge  -
proposals  publish  inbox       /proposals  -

openlore (harness-capture)$ echo 'Use the legacy adapter.' > /knowledge/decisions/….md
redirect: /knowledge/decisions/….md: read-only filesystem: grants (ro) do not permit write on /knowledge/decisions/….md (run 'lore docsets')

openlore (maintainer)$ lore history /knowledge/decisions/….md | tail -2
{"commit_id":"…","time":"…","attribution":"maintainer","target":"/knowledge/decisions/….md","action":"move","hash":"…","from":"/proposals/inbox/….md"}
{"commit_id":"…","time":"…","attribution":"harness-capture","target":"/proposals/inbox/….md","action":"write","hash":"…"}
```

If there is time, two more refusals:

| Command | Result |
|---|---|
| `npm run lore -- --as harness-reader "ls /proposals/inbox"` | `No such file or directory`: readers cannot even see the inbox |
| `npm run lore -- --as harness-reader "echo x > /knowledge/x.md"` | `token scope does not allow writes; use a full-scope token` |

What to say: each agent gets its own identity and a short-lived, least-privilege token. The refusal
comes from OpenLore's grants (`.workshop/openlore/lore.json`), not from the agent choosing to behave.
Requests without a token are refused, and every write carries the identity that made it.

Use the identity that captured your note: `harness-capture` for the harness, `antigravity-capture`,
`claude-code-capture` or `codex-capture` for external agents. `lore history` shows which one.
