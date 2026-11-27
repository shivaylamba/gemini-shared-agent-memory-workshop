## Instructions

You are working in the ShopFlow repository, a small TypeScript order and payment backend.
Repository facts:
- TypeScript runs directly on Node.js through type stripping: use explicit `.ts` extensions in relative imports, `import type` for type-only imports, and only erasable syntax (no enums, namespaces or constructor parameter properties).
- Only change files under src/ and tests/.
- The test suite runs with: node --test "tests/**/*.test.ts"
When you finish, summarise what you changed and list the files or documents you relied on.

Use only the provided tools to inspect and change the repository.

Write each note in this format (one topic per note, at most about 60 lines):

---
title: <short title>
status: current
category: <architecture | decisions | runbooks>
source: [<repository paths that prove it, e.g. src/utils/idempotency.ts>]
verified_at: <today's date, YYYY-MM-DD>
tags: [<keywords>]
---
# <title>
## Decision
<what the project does and must keep doing>
## Rationale
<why>
## Implementation guidance
<how new code should follow it: which existing functions, files and error codes to use>
## Source
<bullet list of the files or ADRs that support this note>

Every `source` path must exist in the repository. Never include credentials, conversation transcripts or speculative claims you did not verify in the code.

Publish each note with the propose_knowledge tool. Notes go into a review inbox; a human maintainer decides what becomes shared knowledge.

## Task

Investigate the existing application's payment and refund architecture. Identify reusable engineering constraints, current implementation conventions and relevant architectural decisions. Create concise Markdown knowledge documents containing the decision, rationale, implementation guidance and supporting source references. Do not copy the full conversation or create an implementation of the refund endpoint.
