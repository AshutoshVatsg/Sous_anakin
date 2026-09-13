# Project: Anakin Forge Hackathon

## Read this first

**`ANAKIN-REFERENCE.md` is the master reference for everything Anakin.io.** It was compiled 12 Sep 2026 from live fetches of Anakin's docs, API reference, catalog, changelog, npm and GitHub.

**Read it before doing any web research on Anakin.** It already contains the full endpoint surface, credit costs, rate limits, limits, gotchas, and a list of URLs that 404. Re-searching wastes time and burns context.

## Fast facts

- Hackathon: **Anakin Forge, Sept 7–14 2026.** Build an agent that can **browse, think, act** — explicitly not a chatbot.
- Account: **Free tier, 300 credits.** This is a hard budget and it shapes every design decision.
- **Nothing has been tested against the API yet.** Treat all capabilities as documentation-level until proven.
- Judging criteria: **unpublished/unknown.**

## Non-negotiable rules for this project

1. **Don't trust Anakin's docs blindly.** They've been caught wrong in 7 places, including a catalog count that differs across three of their own pages. Mark claims ✅ verified / ❓ unverified / 🧪 untested.
2. **Never hardcode the catalog size.** Read `/v1/wire/catalog` at runtime.
3. **Monitoring is effectively banned on our budget** — one full-page monitor at the 15-min minimum burns 192 credits/day and would zero the account in ~37 hours. Use manual `POST /v1/monitors/{id}/run` if monitoring is needed at all.
4. **Prefer Zero Touch** (`/v1/wire-run`, `/v1/url-scraper/scrape`) for reads — 0 credits, no key, and it lets a judge run the demo with no setup.
5. **Develop against `/v1/search` (3cr), not Agentic Search (10+1/URL).** Save the expensive call for the recorded demo.
6. **Don't assume — ask.** The user has explicitly asked not to have conclusions jumped to or details invented.

## Files

| File | What it is |
|---|---|
| `ANAKIN-REFERENCE.md` | **Master reference. Start here.** |
| `docs/EMPIRICAL-TESTS.md` | **Real executed API calls (12 Sep). Overrides the reference on any conflict.** |
| `docs/ARCHITECTURE-ANALYSIS.md` | Deep critique of `docs/ARCHITECTURE.md` against the empirical results |
| `docs/ARCHITECTURE.md` | The team's design for the agent (DinnerGuard) |
| `docs/anakin-verified-findings.md` | Verification pass notes (folded into the master ref) |
| `docs/anakin-constraints.md` | Budget/time constraint analysis (folded into the master ref) |
| `docs/anakin-capability-audit.md` | ⚠️ Earlier draft by another model. **~85% right but contains 7 known errors** — see §10 of the master ref. Superseded; don't cite it directly. |

## Biggest open risk

Whether a **Free-tier account can open a Browser API CDP connection at all** is completely undocumented. If it can't, the "act" layer has to come from Wire write actions instead — a materially different architecture. See §13 of the master reference for the validation spike that settles it.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
