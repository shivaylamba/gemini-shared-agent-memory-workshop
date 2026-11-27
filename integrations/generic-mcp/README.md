# Any MCP-capable agent

OpenLore speaks standard MCP over Streamable HTTP. It exposes two tools: `lore_bash` (run a command in
OpenLore's restricted, read-mostly shell) and `list_commands`.

```bash
npm run exercise -- 03 --mode external --agent generic
```

Configure your agent with:

| Setting | Value |
|---|---|
| Transport | Streamable HTTP |
| URL | `http://localhost:7420/mcp` (or your paired server) |
| Header | `Authorization: Bearer <token>` |
| Token | `npm run -s lore:token -- generic read` (Exercise 03) or `... generic capture` (Exercise 02) |

Useful commands inside `lore_bash`: `lore meta /knowledge`, `grep -rn -i <word> /knowledge`,
`cat /knowledge/<path>.md`. To publish a proposal (Exercise 02):
`cat <<'EOF_NOTE' | publish /proposals/<slug>.md … EOF_NOTE`.

No MCP support? Any HTTP client can use OpenLore's JSON API:

```bash
curl -s -X POST http://localhost:7420/api/shell \
  -H "Authorization: Bearer $(npm run -s lore:token -- generic read)" \
  -H 'Content-Type: application/json' -d '{"command":"lore meta /knowledge"}'
```

Save results with `npm run collect -- <nn> --agent generic --model "<model>"`.
