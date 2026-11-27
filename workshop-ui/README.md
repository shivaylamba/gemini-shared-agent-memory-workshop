# Workshop dashboard and replay page

Both are optional. Every exercise works from the terminal. The dashboard shows the same runs,
knowledge and comparisons in a browser, sized for a projector.

| | Live dashboard | Replay page |
|---|---|---|
| Start it | `npm run ui`, then open http://localhost:7430 | `npm run ui:static`, then open `workshop-ui/dist/workshop-replay.html` |
| Needs | This repository, `npm ci` | Any browser. Works offline, no server |
| Runs agents | Harness sessions, replays, and external-agent workspaces | Plays recorded runs back. Calls no model |
| Knowledge | Lists, reads and reviews (publish or reject) OpenLore notes | Shows the notes saved with the recordings. Read-only |
| Data | `runs/`, `recordings/` and the local OpenLore server | Embedded in the file when it is built |

## Live dashboard (`npm run ui`)

- **Session**: the 75-minute agenda, each exercise with its latest run, and whether this laptop is
  ready (participation path, model provider, OpenLore, recordings).
- **Exercise 01–03**: choose how to run it (workshop harness, a recording, or your own agent). A
  harness run streams each model step as it happens: files read, shared notes searched and read
  (highlighted), files written, test results, and tokens per request. When it finishes you see
  the hidden checks, the architectural constraints, the agent's final message and the diff.
  For your own agent (Antigravity, Claude Code, Codex, any MCP agent), the dashboard prepares the
  clean folder and prompt. When the agent is done, it grades and saves the result.
- **Knowledge**: the review inbox and the approved notes. Each proposal shows its format check,
  sources and target. **Publish** and **Reject** both ask for confirmation. Approved notes show
  their author, reviewer and OpenLore history.
- **Compare**: Experiment A (baseline against shared memory, with the comparability check first)
  and Experiment B (who wrote each note and which fresh sessions used it). Values that were not
  reported or could not be observed show as "unavailable". Nothing is estimated.

`WORKSHOP_UI_PORT` changes the port (default 7430).

### Security

- Listens on `127.0.0.1` only. Requests whose `Host` header is not localhost are refused, which
  blocks DNS-rebinding attacks from other websites.
- Every request that changes something needs JSON and a random token that is created per process
  and embedded in the page. No CORS headers are sent, so other sites cannot read the token.
- The browser never receives a credential. Provider keys and OpenLore tokens stay in the server
  process; the status endpoint only reports *whether* a key is set.
- The page has a strict Content Security Policy (`'self'` only) and renders knowledge notes with
  a small Markdown renderer that escapes all HTML and drops non-http(s) links.
- Reviews use the maintainer identity on the laptop that runs OpenLore. A paired laptop sees
  approved knowledge read-only.

## Replay page (`npm run ui:static`)

```bash
npm run ui:static                        # recordings/ → workshop-ui/dist/workshop-replay.html
npm run ui:static -- --include-runs      # also your own runs from runs/
npm run ui:static -- --out ~/Desktop/replay.html
```

One HTML file with the dashboard's views and the data inlined: scripts, styles, fonts and runs.
Open it from disk, mail it, or put it on a USB stick for the room. It:

- plays each recording's real events back at a readable pace, then shows its graded result;
- shows Experiment A and B for the recordings, and the notes saved with them;
- labels each run by origin (recording, live, external agent) and shows each recording's
  provenance (provider, model, date);
- cannot call a model, reach the network (`connect-src 'none'`), or change anything.

The build refuses to write the page if:

- there are no recordings and no `--include-runs`;
- a configured provider key, or anything shaped like an API key or bearer token, appears in the data.

It replaces your home directory path with `~`.

Synthetic recordings (test fixtures, `"synthetic": true` in `provenance.json`) are left out.
`--allow-synthetic` includes them for testing, and the page then carries a permanent banner saying
they are not real model output. Never present such a page as a real result.

## Files

| File | Purpose |
|---|---|
| `server.ts` | Local HTTP server and JSON API |
| `data.ts` | View data shared by the server and the static build |
| `jobs.ts` | One background run at a time, with buffered event streams |
| `build-static.ts` | Builds the replay page |
| `assets.ts` | Paths to the browser files and self-hosted fonts |
| `public/` | The browser app: plain ES modules, no build step |
| `tests/` | Server security, static build and renderer tests (`npm test`) |
