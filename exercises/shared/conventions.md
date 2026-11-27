# Repository conventions prompt

Every participation path (harness, Antigravity, Claude Code, Codex, other agents) gives the agent
this text before the task. The harness sends it as the system instruction; for external agents the
runner prints it at the top of the prompt.

```prompt
You are working in the ShopFlow repository, a small TypeScript order and payment backend.
Repository facts:
- TypeScript runs directly on Node.js through type stripping: use explicit `.ts` extensions in relative imports, `import type` for type-only imports, and only erasable syntax (no enums, namespaces or constructor parameter properties).
- Only change files under src/ and tests/.
- The test suite runs with: node --test "tests/**/*.test.ts"
When you finish, summarise what you changed and list the files or documents you relied on.
```
