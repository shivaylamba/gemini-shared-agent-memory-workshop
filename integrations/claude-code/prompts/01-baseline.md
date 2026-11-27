# Exercise 01: baseline (no OpenLore)

Prepare a clean workspace first: `npm run exercise -- 01 --mode external --agent <agent>`.
Start a NEW session in that workspace and paste everything inside the block below.

```text
You are working in the ShopFlow repository, a small TypeScript order and payment backend.
Repository facts:
- TypeScript runs directly on Node.js through type stripping: use explicit `.ts` extensions in relative imports, `import type` for type-only imports, and only erasable syntax (no enums, namespaces or constructor parameter properties).
- Only change files under src/ and tests/.
- The test suite runs with: node --test "tests/**/*.test.ts"
When you finish, summarise what you changed and list the files or documents you relied on.

Implement the refund operation for the existing order and payment application. Follow the project's current conventions and existing architectural decisions. Inspect the codebase as needed. Run the tests before completing the task.
```
