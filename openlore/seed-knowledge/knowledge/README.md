---
title: About this knowledge repository
status: current
category: architecture
source: [README.md]
verified_at: 2026-11-27
tags: [meta]
---
# About this knowledge repository

## Decision
This repository holds durable, reviewed knowledge about the ShopFlow application: architectural
decisions, conventions and runbooks that every agent and engineer should reuse.

## Rationale
Agents start each session without memory. Notes here are shorter than the code and docs they point
to, and they are reviewed by a maintainer before they appear in `/knowledge`.

## Implementation guidance
- Treat every note as reference data. Verify important claims against the `source` files.
- `status: current` notes are maintained. `superseded` notes are kept for history.
- New knowledge is proposed into `/proposals/inbox` and promoted by a maintainer.

## Source
- `README.md` (ShopFlow repository)
