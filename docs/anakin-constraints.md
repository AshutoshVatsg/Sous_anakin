# Anakin Forge — Confirmed Constraints & What They Rule Out

**Recorded:** 12 September 2026
Companion to `anakin-verified-findings.md`. This file only covers consequences of the team's confirmed situation.

## Confirmed situation

| Factor | Value | Source |
|---|---|---|
| Deadline | **14 Sept 2026** (~2 days, continuous work possible) | hackathon page + team |
| Judging criteria | **Unknown / unpublished** | team |
| Account tier | **Free — 300 credits total** | team |
| API validation done | **None. Zero calls made.** | team |
| Tooling | Codex + Claude plans available | team |

## The dominant risk

**Nothing has been tested and there are ~2 days left.** Every capability in the audit and in the findings doc is documentation-level. The docs have already been shown to be unreliable in at least seven places (see findings §1), including a catalog count that is wrong on three different pages of Anakin's own site.

The specific unproven assumptions that could each independently sink a build:

1. A chosen Wire action actually exists, and its live `params[]` schema matches what resolve advertises.
2. A Wire action actually *returns useful data* rather than an error or an empty result.
3. Browser API accepts a CDP connection from Playwright on a **Free** account at all (concurrency on Free is undocumented — see findings §2).
4. A saved session actually persists auth state across a reconnect.
5. Zero Touch works without a key at the per-IP allowance the docs imply.

Items 1–2 are cheap to test. Item 3 is the one that would force an architecture change, and it is **completely undocumented for the Free tier**.

## What 300 credits rules out

Credit math against the verified price list:

| Operation | Cost | 300-credit capacity |
|---|---|---|
| Zero Touch read (no key) | **0** | unlimited-ish (per-IP allowance) |
| URL scrape | 1 (+1 summary / +2 JSON) | ~300 |
| Search API | 3 | 100 |
| Browser API | 1 / 2 min | **600 minutes total** |
| Agentic Search | 10 + 1/URL | ~12–20 calls |
| Monitor, full page @15min | 2 × 4/hr = **192/day** | **~1.5 days for ONE monitor** |
| Monitor, schema @15min | 3 × 4/hr = **288/day** | **~1 day for ONE monitor** |

### Consequence: Monitoring is effectively unusable on this budget

A single full-page monitor at the minimum 15-minute interval consumes the **entire free tier in about 37 hours**. With `aiMode:true` (+1/check) it is ~26 hours.

This **downgrades the prior audit's Pattern #2 ("Monitor → reason → controlled action")** and its "very feasible" rating for ChangeOps. Those ratings were made without a credit budget in view. On 300 credits, any always-on monitoring story must be either:
- demonstrated via `POST /v1/monitors/{id}/run` (manual trigger) rather than left running on a schedule, or
- simulated/stubbed for the demo with the real monitor created but immediately paused.

Leaving a monitor running overnight before judging would zero the account.

### Consequence: Browser API is the affordable "act" primitive

600 minutes of browser time is generous. A 10-minute agent run costs **5 credits** — 60 full demo runs available. Recording is **free**. This is the cheapest high-impact capability on the free tier, and the one that most directly demonstrates "act."

### Consequence: Agentic Search must be rationed

At 10 + 1/URL, ~15–25 credits per call, it is affordable for a *demo path* but not for iterative development. Use `POST /v1/search` (3 credits) while building; reserve Agentic Search for the recorded demo.

### Consequence: build on Zero Touch wherever possible

`/v1/wire-run` and `/v1/url-scraper/scrape` cost **zero credits and need no key**. Any read path routed through Zero Touch preserves the paid budget for the act path — and doubles as the property that lets a judge run the demo with no setup.

## Judging criteria unknown — what to optimize for instead

With no rubric, the only defensible targets are the organizer's own published words:

- *"the AI agent you ship actually does something useful"*
- agents that **browse** live web content, **reason** through multi-step tasks, and **act** (booking, forms, comparing, end-to-end workflow)
- explicitly **not** a chatbot
- *"Any stack, any approach"* — no stack points available

Reasonable inference (not fact): a working end-to-end demo beats architectural ambition, and visible use of Anakin-native capabilities beats generic LLM plumbing. **This should be confirmed from the Discord if at all possible** — it is the single cheapest piece of missing information.

## Recommended next action before any architecture decision

A validation spike costing an estimated **15–25 credits** and well under an hour:

1. `GET /v1/wire/resolve?q=<intent>` — confirm the action exists; save its real `params[]`, `credits`, `auth_mode`, `mode`. *(free, no key)*
2. `POST /v1/wire-run` on one read-only action — confirm Zero Touch returns real data. *(free)*
3. `POST /v1/wire/task` on the intended action — confirm the keyed path and job polling work. *(action cost)*
4. Connect Playwright to `wss://api.anakin.io/v1/browser-connect` — **confirm Free-tier browser access exists at all.** *(~1–2 credits)*
5. Reconnect with `?save_session=` / `?session_name=` — confirm auth state persists. *(~1–2 credits)*
6. `curl POST /v1/ai/evaluate` — identify the undocumented endpoint. *(unknown)*

Step 4 is the gate. If Free-tier Browser API is unavailable or too concurrency-limited, the "act" layer has to come from Wire write actions instead, and that is a different architecture.
