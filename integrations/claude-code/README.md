# Path C: Claude Code

Use Claude Code with its own model access. The workshop prepares clean workspaces and project-scoped
MCP configuration, and grades results with the same tests.

## Verified against the Claude Code docs

- `claude mcp add --transport http <name> <url> --header "Authorization: Bearer …"` adds an HTTP MCP server.
- Project scope is `.mcp.json` in the project root, and Claude Code asks for approval before using
  it. `headers` support `${VAR}` expansion, so **the token is not written to disk**: you pass it as
  `OPENLORE_TOKEN` when you launch Claude.
- OpenLore's own guide recommends allowing `mcp__openlore` so filesystem-like searches are not
  mistaken for local disk scans. The workshop writes `.claude/settings.json` in the workspace for this.

## Each exercise

```bash
npm run exercise -- 03 --mode external --agent claude-code
cd ~/shopflow-workshop/03-shared-memory
OPENLORE_TOKEN="$(npm run -s --prefix <path-to-workshop> lore:token -- claude-code read)" claude
```

The runner prints the exact launch command, including the workshop path. Inside Claude, check
`/mcp` (expect `openlore`), then paste the prompt from [prompts/](prompts).

Save the result: `npm run collect -- 03 --agent claude-code --model "<model>"`.

**Baseline (Exercise 01):** no `.mcp.json` is written. Also check `claude mcp list` does not show an
`openlore` server at user or local scope.

## What is measured

Correctness, regression, and OpenLore reads and searches (from OpenLore's event log for
`claude-code-reader`). Tokens and tool calls are unavailable. Runs are labelled *not controlled*.
