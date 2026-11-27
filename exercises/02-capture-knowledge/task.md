# Task: capture durable project knowledge

The exact user prompt for the capture session:

```prompt
Investigate the existing application's payment and refund architecture. Identify reusable engineering constraints, current implementation conventions and relevant architectural decisions. Create concise Markdown knowledge documents containing the decision, rationale, implementation guidance and supporting source references. Do not copy the full conversation or create an implementation of the refund endpoint.
```

Starting state: a fresh copy of `core-app/`. The agent can read the code and publish proposals into
the OpenLore review inbox (`/proposals/inbox`), but it cannot write approved knowledge. You review
the proposals and promote them with `npm run lore:review`.
