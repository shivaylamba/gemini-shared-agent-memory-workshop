# OpenLore in this workshop

[OpenLore](https://github.com/aakarim/OpenLore) (Apache-2.0) serves a folder of Markdown to AI agents
as a virtual filesystem, over MCP, a JSON API, SSH and the web. The workshop pins **v0.8.0**
(released 2026-10-30).

| File | Purpose |
|---|---|
| `openlore.lock.json` | Pinned release, download URLs and SHA-256 per platform (from the release's `checksums.txt`) |
| `config/openlore.yml.template` | Server settings: ports, `require_auth`, token issuer, writes enabled, analytics |
| `seed-knowledge/` | Starting content: `/knowledge/README.md` and an empty `/proposals/inbox` |
| `templates/knowledge-note.md` | Note format (a workshop convention, not an OpenLore schema) |
| `stale-demo/` | Notes for the optional stale-knowledge demo |

`npm run setup` installs the binary into `.workshop/bin/`. `npm run lore:start` generates
`.workshop/openlore/{openlore.yml,lore.json}`, copies the seed to `.workshop/openlore/served/` on
first start, and runs:

```bash
openlore -c .workshop/openlore/openlore.yml .workshop/openlore/served
```

## Access model

- `/knowledge`: approved notes. `reader` and `contributor` roles get `ro`; `maintainer` gets `rw`.
- `/proposals`: `contributor` gets `publish` (inbox writes only); `maintainer` gets `rw`; readers cannot see it.
- Tokens are minted with `openlore token mint --identity <name> --scope read|full --ttl 12h`.
  There is no anonymous HTTP access. Keyless SSH is off and unknown keys are denied.

Useful commands (all real OpenLore shell commands, run through MCP):

```bash
npm run lore -- "lore meta /knowledge"                          # frontmatter index
npm run lore -- "grep -rn -i refund /knowledge"                 # search
npm run lore -- "cat /knowledge/decisions/refund-idempotency.md"
npm run lore -- --as maintainer "ls /proposals/inbox"
npm run lore -- --as maintainer "lore history /knowledge/decisions/refund-idempotency.md"
npm run lore -- --as maintainer "lore validate /knowledge"
```

## Known limitations (v0.8.0)

- No bind-address setting: the HTTP and SSH ports listen on all interfaces. Tokens are required.
- No built-in review queue. The workshop implements review as a maintainer `mv` from the inbox
  (`npm run lore:review`), which OpenLore records in `lore history`.
- The analytics event log the workshop reads (`state/data/analytics/events/*.jsonl`) is observed
  behaviour, not a documented API.
