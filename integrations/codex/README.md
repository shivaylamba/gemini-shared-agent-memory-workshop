# Path C: Codex

## Verified against the Codex and OpenLore docs

- Streamable HTTP servers: `[mcp_servers.<name>]` with `url`. A bearer token comes from an
  environment variable named by `bearer_token_env_var`.
- Project-scoped `.codex/config.toml` is loaded **only for trusted projects**.
- OpenLore's guide shows `codex mcp add openlore --url …` (writes `~/.codex/config.toml`). The
  workshop uses the project file instead, so baseline sessions stay clean.

## Each exercise

```bash
npm run exercise -- 03 --mode external --agent codex
cd ~/shopflow-workshop/03-shared-memory
OPENLORE_TOKEN="$(npm run -s --prefix <path-to-workshop> lore:token -- codex read)" codex
```

The workspace contains:

```toml
[mcp_servers.openlore]
url = "http://localhost:7420/mcp"
bearer_token_env_var = "OPENLORE_TOKEN"
```

Trust the project when Codex asks, check `codex mcp list`, and paste the prompt from [prompts/](prompts).
Save with `npm run collect -- 03 --agent codex --model "<model>"`.

**Baseline:** `codex mcp list` must not show an `openlore` server (remove one added with `codex mcp add`).

**Not verified here:** Codex was not available in the build environment. Rehearse once before the event.
