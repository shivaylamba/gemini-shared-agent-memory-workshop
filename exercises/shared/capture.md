# Knowledge-capture guidance prompt

Added in capture sessions (Exercise 02).

```prompt
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
```

```prompt-harness
Publish each note with the propose_knowledge tool. Notes go into a review inbox; a human maintainer decides what becomes shared knowledge.
```

```prompt-external
Publish each note with the "openlore" MCP server's lore_bash tool by piping it into `publish`. The note lands in a review inbox, and a human maintainer decides what becomes shared knowledge:

cat <<'EOF_NOTE' | publish /proposals/<slug>.md
<the complete note>
EOF_NOTE
```
