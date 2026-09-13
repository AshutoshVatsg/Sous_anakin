# ANAKIN.IO — MASTER REFERENCE

> ⛔ **UPDATED 12 Sep after live API testing.** Three claims below were falsified by real calls. See `EMPIRICAL-TESTS.md` — it overrides this file on any conflict. Key corrections: Zero Touch is a **300-credit per-IP pool, NOT free/unlimited**; the documented `/v1/wire/resolve` response schema is **wrong**; the `catalog=` filter on resolve is **silently ignored**. Use `GET /v1/wire/catalog/{slug}` for discovery instead of resolve.

**Single source of truth for this project. Read this first in any new session.**

Compiled 12 September 2026 from live fetches of anakin.io docs, API-reference endpoint pages, /catalog, /changelog, /products/wire, the homepage, npm, and GitHub. Supersedes `anakin-capability-audit.md` (an earlier, partly-inaccurate draft by another model — see §10 for its specific errors).

**Status markers used throughout:**
- ✅ **VERIFIED** — read directly off a live Anakin page on 12 Sep 2026
- ⚠️ **CONTRADICTION** — Anakin's own pages disagree with each other
- ❓ **UNVERIFIED** — claimed somewhere but I could not confirm it; **do not rely on this without testing**
- 🧪 **UNTESTED** — documented, but never exercised against our account

---

## 1. ORIENTATION — what Anakin actually is

Anakin.io (Anakin Inc, YC S21) sells itself as *"One API. The whole web, agent-ready."* It is a **web-access layer for agents**, not an agent framework.

It provides four layers:

| Layer | Products | What it does |
|---|---|---|
| **Browse** | URL Scraper, Map, Crawl, Search, Agentic Search | Get clean markdown/JSON out of any page |
| **Tool registry** | **Wire** | 963 sites × 5,250 pre-built actions, discoverable at runtime by intent |
| **Hands (act)** | Browser API, Browser Sessions | Real Chrome over CDP, with persisted logins |
| **Wake-up** | Website Monitoring, Webhooks | Scheduled diffing + signed callbacks |

**It does NOT provide the "think" layer.** There is no Anakin planner for arbitrary goals. Agentic Search plans *research only*. Our controller owns goal decomposition, tool selection, per-step verification, recovery, and the stop condition.

> ⚠️ **Do not confuse two different products.** `github.com/Anakin-Inc/anakin` is **AnakinScraper OSS** — a narrower self-hosted scraper (Camoufox anti-detect browser, Thompson-Sampling proxy selection, Gemini JSON extraction, `make up`). It has **no Wire, no Browser API, no Monitoring**. Also distinct from **anakin.ai**, an unrelated no-code AI app builder.

---

## 2. HACKATHON FACTS ✅

From https://anakin.io/hackathon/anakin-forge:

- **Dates: September 7–14, 2026.** One week. Online, worldwide, free.
- **Prizes:** 1st = PS5 · 2nd = MSI gaming monitor · GitHub raffle = mechanical keyboard. *"$1,000+ up for grabs."*
- **Stack rules:** *"Any stack, any approach."* No mandated tech, no points for stack choice.
- **Theme (verbatim):** agents that *"browse and read live web content, reason through multi-step tasks, and take real actions, like booking, filling forms, comparing options, or running a workflow end to end."*
- **Bar (verbatim):** *"the AI agent you ship actually does something useful."* Explicitly **not a chatbot**.
- Framed as *"the first of many drops"* — future prizes, raffles, bounties.

❓ **Judging criteria and submission mechanics are NOT published.** Not on the page, not indexed anywhere. **This is the cheapest high-value unknown — get it from the Discord.**

> A web-search snippet claimed the event ran "Aug 24 – Sep 13." The hackathon page itself says Sep 7–14. The page wins; the snippet was wrong. Don't re-litigate this.

---

## 3. OUR SITUATION (as of 12 Sep 2026)

| Factor | Value |
|---|---|
| Time remaining | ~2 days, continuous work possible |
| Account tier | **Free — 300 credits total** |
| API calls made so far | ✅ Keyless validation done 12 Sep — see `EMPIRICAL-TESTS.md`. Browser API + auth paths still untested. |
| Tooling | Codex + Claude plans |
| Judging rubric | Unknown |

**The dominant risk is that nothing has been validated.** Every capability below is documentation-level. Anakin's docs have already been caught wrong in seven places (§10), including a catalog count that differs across three of their own pages.

---

## 4. AUTH & BASE URL ✅

```
Base URL:  https://api.anakin.io
Auth:      X-API-Key: $ANAKIN_API_KEY
```

**Zero Touch (keyless) endpoints** — no key, no signup, subject to a per-IP allowance:
- `POST /v1/url-scraper/scrape` — inline scrape
- `POST /v1/wire-run` — run a read-only Wire action, synchronous
- `GET /v1/wire/catalog`, `GET /v1/wire/catalog/{slug}`, `GET /v1/wire/resolve` — discovery

**Why this matters:** Zero Touch needs no key, so a judge can run our demo with no setup. Route every read path through it that we can.

> ⛔ **CORRECTED 12 Sep by live test.** Zero Touch is **NOT free/unlimited**. It is a **300-credit pool keyed to your IP**. A keyless `/v1/wire-run` returns:
> `"credits_used":1, "trial":{"remaining_credits":298, "message":"Keyless free tier — sign up free for 300 credits and your own key."}`
> Effective total budget ≈ 600 (300 keyless + 300 account), but the keyless pool is shared by anyone on the same IP and burns down during development.

> ✅ **Also confirmed by live test:** `/v1/wire-run` executes actions declared `mode:"async"` **synchronously** — returns `{"job_id":..., "status":"completed", "data":{...}}` inline, no polling.

**Async job pattern:** most endpoints return `202 {job_id, status:"pending", poll_url}`. Poll the GET status endpoint (status GETs are rate-limit-exempt) or supply `webhook_url`.

---

## 5. ENDPOINT REFERENCE ✅

### 5.1 Wire — the crown jewel

**`GET /v1/wire/resolve`** — intent → action. **120 req/min per IP.** No key needed.

Query params: `q` (free text, matches name+description+tags) · `catalog` (slug, e.g. `airbnb`) · `category` (e.g. `travel`, `commerce`) · `auth_mode` (`none|optional|required`) · `auth` (legacy, superseded)

⛔ **The documented response schema above is WRONG — falsified by live call 12 Sep.** Documented (do NOT code against this):
```json
"params": [ {"name":"","type":"","required":true,"default":null,"description":""} ]
```

✅ **ACTUAL live response:**
```json
{"next":"POST /v1/wire/task with {action_id, params}",
 "results":[{
   "action_id":"fk_add_to_cart",
   "catalog":"flipkart",              // NOT catalog_slug / catalog_name
   "auth_required":true,
   "auth_satisfied":null,             // undocumented
   "credits":1,
   "params":{                         // OBJECT, not array
     "required":[{"name":"","type":"","default":null}],
     "optional":[{"name":"","type":"","default":null}]
   }}]}
```
**Absent from live resolve despite being documented:** `name`, `description`, `mode`, `auth_mode`, `catalog_name`, `catalog_slug`.

⛔ **`catalog=` is SILENTLY IGNORED.** `?q=cart&catalog=blinkit` returns blueridgeknives/dumco/immayasports — no error. `q` is mandatory (`?catalog=blinkit` alone → `BAD_REQUEST: q parameter is required`).

> ### ✅ USE `GET /v1/wire/catalog/{slug}` FOR DISCOVERY INSTEAD
> It actually works, scopes correctly, and is far richer. Returns per action: `action_id`, `name`, `description`, `tags[]`, **`type` (`read`/`write`)**, **`mode`**, **`auth_mode`**, `auth_required`, `parameters[]` (each with `description` + `default`), **`credits_per_call`**, `premium`, `wheel_version`, `status`, timestamps.
>
> **This** is the runtime-discoverable tool schema that maps 1:1 onto an LLM tool definition — the most Anakin-native capability available.
>
> ⚠️ **`type` means HTTP method, not state mutation.** All 5 Blinkit actions typed `write` are reads ("Returns a category's product listing"). **Always read the `description`, never trust the `type` badge.**

**`POST /v1/wire/task`** — execute. **20 req/min per user.** Key required.

Body: `action_id` (req) · `credential_id` (UUID; required when `auth_mode:"required"`, optional when `"optional"`, ignored when `"none"`) · `params` (object) · `webhook_url`

Returns `202 {status:"processing", job_id, poll_url}`.
Verbatim: *"Credits are deducted immediately at submission and refunded automatically if the job fails."*

**`POST /v1/wire-run`** — Zero Touch, read-only, **synchronous**, no key.

**Jobs:** `GET /v1/wire/jobs/{id}` (60/min) · `GET /v1/wire/jobs/{id}/download` (30/min)
**Catalog:** `GET /v1/wire/catalog`, `GET /v1/wire/catalog/{slug}` (60/min, no auth) · `GET /v1/wire/search` (**30/min** — a different, older route from `/resolve`)
**Build request:** `POST` to request a new action be built. **Never put this on a deadline's critical path.**

**Identities:** login · verify-credential · list-identities · list-providers · plus identity *sources* (1Password / Azure Key Vault connectors: create/list/get/update/verify/delete/list-source-identities/list-source-containers/list-source-entries).
Verbatim: credentials are *"AES-256 encrypted at rest · injected at runtime · never returned by the API."* Wire injects the real session server-side — *"The secret never crosses the line."*

**Catalog size:** ✅ **963 websites / 5,250 actions** (12 Sep 2026). See §10 #1 — this number is unreliable across pages. **Always read it at runtime; never quote it in the pitch.**

Categories (50+): Finance, Marketplace, Research, Shopping, Government Legal, Automotive, Travel, Entertainment, Sports, News Media, AI Tools, Developer Tools, Food Dining, Real Estate, Health, Jobs, Fashion Beauty, Education, Marketing, Gaming, Lab Supplies, Ecommerce, Business Services, Electronics, Social, Weather, Grocery, Industrial, Logistics, MRO, Hardware, Aircraft Supply, Chemicals, Retail, Scheduling, Crowdfunding, Crypto, Energy, Fitness, Food Delivery, Foodservice, Identity, Insurance, Maritime, Music, Search, Security, Utilities, Web.

**Critical caveat:** Wire does not mean every site supports every action. `auth_mode` can be `none|optional|required`. **Write capability exists only where a catalog explicitly exposes it.** Verify the live action record at runtime.

---

### 5.2 URL Scraper

- `POST /v1/url-scraper` — async, **60/min** → `202 {jobId, status:"pending"}`; poll `GET /v1/url-scraper/{id}` (unlimited)
- `POST /v1/url-scraper/scrape` — **Zero Touch inline, keyless**
- `POST /v1/url-scraper/batch` — **max 10 URLs**, 60/min; poll `GET /v1/url-scraper/batch/{id}`
- `GET` screenshot download endpoint exists

Params: `url` (req) · `formats[]` (`markdown|html|cleanedHtml|links|images|summary|screenshot|json`) · `country` (default `us`) · `useBrowser` (bool, headless Chrome via Playwright) · `generateJson` (bool) · `outputSchema` (JSON Schema) · `sessionId` · `webhook_url` · `actions[]`

**Browser actions:** `wait` · `wait_for` · `click` · `scroll` · `write` · `press`
**Hard limits:** max **15 actions**/request · **15s** per individual wait · **30s** total wait · **500 char** selector · ❓1,000-char write limit (claimed by old audit, unconfirmed) · browser actions add **+1 credit**

**When to use which:** scraper `actions[]` is for *deterministic* prep (dismiss a banner, click "load more"). Anything adaptive — where the agent must look at the result before deciding the next step — belongs in **Browser API**.

---

### 5.3 Browser API — the "act" primitive

```
wss://api.anakin.io/v1/browser-connect
```
CDP over WebSocket.

**Query params:** `?country=XX` · `?session_id=<uuid>` **or** `?session_name=<name>` (session_id wins if both) · `?record=true` · `?save_session=<name>` · `?save_url=<url>`

**Clients:** ✅ **Playwright (Python + Node) and Puppeteer.** ✅ **Selenium/ChromeDriver explicitly unsupported.**

**Confirmed Playwright surface** (per old audit, consistent with CDP): navigation, selectors, JS evaluation, screenshots, keyboard/mouse, scrolling, multiple pages, cross-site nav, console/page-error events, request/response events, WebSocket events, request interception via routing.

**Errors — WS close code 1008:**
- `404` session not found
- `422` session has no stored data — save it first
- `409` **session is being automated** ← one session cannot be used concurrently. No parallel runs against one login.

**Geo-targeting:** 20 countries get aligned exit IP + `navigator.language` + timezone + currency. Example `?country=GB` → UK residential IP (BT/Virgin/Sky), `en-GB`, `Europe/London`, GBP. Other countries route residential but fall back to `UTC`/`en-US`. Docs recommend `lumtest.com/myip.json` to verify (some IP-checkers block residential proxies).

**Recording:** `?record=true`. WebM VP8 · 15 fps · 1920×1080 · ~50 MB per 2h · **7-day retention** · presigned URL valid **1 hour** · **off by default** · **"Included (no extra credits beyond the standard 1 credit / 2 minute rate)"**. Retrieve via list / get (by UUID or connection ID) / download-with-redirect.

**Sessions:** persist cookies + localStorage. Captured **when the browser disconnects** → clean shutdown matters. Session can preserve its proxy exit IP across loads. Combine: `?record=true&save_session=my-login&save_url=https://amazon.com`
Session mgmt REST: `POST /v1/sessions/manual-start` · `POST /v1/sessions/manual-save` · `PATCH /v1/sessions/{id}` · `DELETE /v1/sessions/{id}` (all 60/min)

**Billing:** ✅ **1 credit / 2 minutes**, rounded up.

❓ **UNVERIFIED:** 2-hour max duration · 5-minute idle disconnect · **per-plan concurrency**. The old audit asserts all three; I could not find a source page. The "~50 MB for a 2-hour session" phrasing is *consistent with* a 2h cap but does not state one.

🧪 **THE GATE: whether a Free-tier account can open a CDP connection at all is completely undocumented.** If it can't, the "act" layer must come from Wire write actions instead — a different architecture. **Test this before committing to any design.**

---

### 5.4 Search & Agentic Search

**`POST /v1/search`** — ✅ **synchronous**, **3 credits**, 60/min, **max 20 results**. Returns web results, snippets, dates, and an AI summary with citations. Safe inside an interactive loop.

**`POST /v1/agentic-search`** — async, 60/min. Params: `prompt` (req) · `webhook_url`. Returns `{job_id, status, message, created_at}`. Poll `GET` result endpoint.
Four stages: **query refinement → web search → citation scraping → analysis.**
Cost: **10 credits + 1 per scraped URL** (~15–25/call). Docs: *"poll every 10 seconds"*; takes several minutes.

> Agentic Search is a *research pipeline*, not an application planner. Our controller still decides when research is needed, whether evidence suffices, and what action follows.

**Development discipline:** build against `/v1/search` (3cr). Reserve Agentic Search for the recorded demo run.

---

### 5.5 Map & Crawl

- **`POST /v1/map`** — ✅ 1 credit · up to **5,000 URLs** · depth 5 · 60/min. Params: subdomain + external-link inclusion, URL substring search, browser rendering, session, limit, depth, per-level discovery limit. Returns **URLs only**.
- **`POST /v1/crawl`** — ✅ 1 credit **per page** · **max 100 pages** · depth 5 · 60/min. Params: include/exclude globs, max pages, depth, country, browser rendering, session, webhook. Returns **page content**.

Complementary, not interchangeable. **Map first → filter → crawl the smallest relevant slice.** Never crawl 100 pages blind on a 300-credit budget.

---

### 5.6 Website Monitoring

`POST /v1/monitors` · `GET /v1/monitors` · `PUT /v1/monitors/{id}` · `DELETE` · `POST /v1/monitors/{id}/run` (manual trigger) · snapshots-and-changes · site-monitors (runs & pages)

**Scopes:** `page` (default — one URL) · `site` (scheduled crawl, reports added/removed/changed; **caps a run at 50 pages**, supports pinned pages + organic discovery) · `wire` (runs a Wire action on a schedule and diffs its JSON; `wireWatchPaths` limits comparison to specific fields)

**Watch modes:** full page in `watchFormat` (`markdown|html|cleaned_html`) = **2 credits** · specific-data via JSON Schema = **3 credits** · `aiMode:true` meaningful-change filter = **+1 credit** (accepts an optional natural-language goal; filters timestamps/ads)

**Limits:** ✅ **minimum 15-minute interval** · active monitors: **Free 5 · Pro 20 · Scale 100** · supports browser sessions and `country` · optional email + signed webhook alerts

> ⛔ **See §7 — monitoring is effectively unusable on our 300-credit budget.**

---

### 5.7 AI Visibility

Sends one prompt to multiple AI engines (ChatGPT, Gemini, Google AI Overview) with a selected country; reports per-source answers, summaries, latency, credits. Always fresh, **no caching**. Each completed source bills its own Wire action.
Endpoints: submit-search · get-search · list-searches · retry-source · list-sources.

Useful for brand/answer monitoring. **Adds little to a general browse-think-act agent.**

---

### 5.8 Webhooks

✅ Exist (changelog 14 Jul 2026): *"signed delivery verification and automatic retry logic."* Cover scraping, batches, Map, Crawl, Agentic Search, Wire, monitoring, AI Visibility.

❓ **UNVERIFIED — the old audit asserts all of these and I could not reach a webhooks doc page:**
- HMAC-SHA256 signing + header names
- 10-second receiver timeout
- max 10 registered endpoints
- results >256 KB delivered by authenticated `result_url`

**Must be read off a real delivery before relying on any of it.**

---

### 5.9 Undocumented endpoints ❓

Found **only** on the rate-limits page, with no documentation page anywhere:
```
POST /v1/ai/evaluate          10 req/min per user
POST /v1/ai/evaluate/stream   10 req/min per user
```
Purpose unknown. The old audit missed these entirely. **Worth one curl** — a streaming AI-evaluation primitive could be directly useful to the "think" layer.

---

## 6. RATE LIMITS ✅ (complete table)

| Endpoint | Limit | Scope |
|---|---|---|
| `GET /v1/wire/resolve` | **120/min** | per IP |
| `GET /v1/wire/catalog`, `/catalog/{slug}` | 60/min | per IP |
| `GET /v1/wire/search` | **30/min** | per IP |
| `POST /v1/wire/task` | **20/min** | per user |
| `GET /v1/wire/jobs`, `/jobs/{id}` | 60/min | per user |
| `GET /v1/wire/jobs/{id}/download` | 30/min | per user |
| `POST /v1/url-scraper`, `/batch` | 60/min | per user |
| `POST /v1/map`, `/v1/crawl` | 60/min | per user |
| `POST /v1/search`, `/v1/agentic-search` | 60/min | per user |
| `POST /v1/sessions/*`, `PATCH`, `DELETE` | 60/min | per user |
| `POST /v1/ai/evaluate`, `/stream` | **10/min** | per user |
| **All status-polling GETs** (scraper, agentic-search, map, crawl) | **unlimited** | — |

`/v1/wire/task` at 20/min is the tightest real constraint on an acting agent.

---

## 7. CREDIT ECONOMICS — WE HAVE 300 ⚠️

| Operation | Cost | What 300 buys |
|---|---|---|
| **Zero Touch read** (`/wire-run`, `/url-scraper/scrape`) | **0** | unlimited-ish (per-IP allowance) |
| URL scrape | 1 (+1 summary, +2 JSON, +1 browser actions) | ~300 |
| Batch scrape | 1 × URLs | — |
| Map | 1 | 300 |
| Crawl | 1 × pages | — |
| Search API | 3 | 100 |
| **Browser API** | **1 / 2 min** | **600 minutes** |
| Agentic Search | 10 + 1/URL | ~12–20 calls |
| Wire action | varies (see `credits` in resolve) | — |
| Monitor, full page @15min | 2 × 4/hr = **192/day** | **~37 hours for ONE** |
| Monitor, schema @15min | 3 × 4/hr = **288/day** | **~25 hours for ONE** |
| Monitor + aiMode @15min | 3–4 × 4/hr | **~26 hours for ONE** |

**Plans:** Starter Free = 300 · Pro $9/mo = 3,000 · Scale $29/mo = 12,000 · Enterprise custom.

### Hard consequences

1. **⛔ Monitoring is effectively unusable.** One full-page monitor at the 15-min minimum eats the entire tier in ~37 hours. **Leaving a monitor running overnight before judging would zero the account.** Any monitoring story must use `POST /v1/monitors/{id}/run` (manual trigger) or create-then-pause.
2. **✅ Browser API is the affordable act primitive.** 600 minutes total; a 10-min run = 5 credits → ~60 full demo runs. Recording free.
3. **Ration Agentic Search.** ~15–25 cr/call. Develop on `/v1/search` (3cr).
4. **Push every read to Zero Touch.** 0 credits, preserves budget for the act path, and doubles as the "judge can run it with no key" property.
5. **Pro is $9 for 10× the credits** — cheap insurance if the design needs monitoring.

---

## 8. SDKs, CLI, MCP, INTEGRATIONS ✅

**SDKs — all alpha v0.1.x:**
| Lang | Install |
|---|---|
| Python | `pip install anakin-sdk` |
| Node.js | `npm install @anakin-io/sdk` |
| Go | `go get github.com/Anakin-Inc/anakin-go` |
| Rust | `anakin-sdk = "0.1"` |
| PHP | `composer require anakin/sdk` |
| Ruby | `gem install anakin-sdk` |
| Elixir | `{:anakin, "~> 0.1"}` |
| Java | `io.github.anakin-inc:anakin-sdk:0.1.0` |
| .NET | **coming soon** |

⚠️ **The Python SDK README documents only `scrape()`, `map()`, `crawl()`.** No Wire, no Browser, no Monitoring. **Those require raw REST + Playwright.** Don't plan around SDK coverage that isn't there.

**CLI:** available — *"Scrape, search, and research from your terminal."*

**MCP — `@anakin-io/mcp` (alpha):**
```
npx -y @anakin-io/mcp init --all
```
Targets Claude Desktop, **Claude Code**, Cursor, Cline, Continue, Zed, Windsurf, VS Code.
✅ Changelog 21 Jul 2026: the connector now exposes **every Anakin product — 21 tools**, incl. Website Monitoring, AI Visibility, Browser Sessions, **Browser Automation**. Zero Touch MCP works without OAuth; a bearer key unlocks the full surface.

> This is a **near-zero-glue-code path to the whole platform**, and it's bigger than the old audit implied. Worth considering given we're working inside Claude Code.

**Integrations — available:** Claude Code plugin (skills, agents, hooks) · Cursor plugin · OpenClaw skill · Google ADK · Dify (5 tools) · Zapier (4 actions) · Make (4 modules) · MCP server
**Coming soon (do NOT depend on):** LangChain · LlamaIndex · CrewAI · Langflow · Flowise · n8n · .NET SDK

---

## 9. CODE PATTERNS

> ⚠️ Only the first snippet is verbatim from Anakin's docs. The rest are **constructed from documented parameters and are untested against our account.**

**Verbatim from Anakin's blog:**
```bash
curl https://api.anakin.io/v1/url-scraper \
  -H "X-API-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.airbnb.com/s/Miami", "useBrowser": true}'
```

**Verbatim from Anakin's homepage (Zero Touch, no key):**
```bash
curl -s https://api.anakin.io/v1/url-scraper/scrape \
  -d '{"url":"https://example.com"}'
# → { "markdown": "# Example…", "trial": {…} }
```

**Verbatim from /products/wire:**
```bash
curl https://api.anakin.io/v1/wire/catalog \
  -H "X-API-Key: $ANAKIN_API_KEY"
```

**Constructed — Wire resolve (keyless, free):**
```bash
curl -s "https://api.anakin.io/v1/wire/resolve?q=search%20flights&auth_mode=none"
```

**Constructed — Browser API via Playwright (Python):**
```python
from playwright.sync_api import sync_playwright

ws = ("wss://api.anakin.io/v1/browser-connect"
      "?api_key=KEY&country=US&record=true&save_session=my-login")

with sync_playwright() as p:
    browser = p.chromium.connect_over_cdp(ws)
    page = browser.contexts[0].pages[0]
    page.goto("https://example.com")
    # ... act, observing after every step ...
    browser.close()   # ← session is captured ON DISCONNECT. Clean shutdown matters.
```
🧪 **How the API key is passed on the WS URL is not confirmed** (`?api_key=` vs a header). Verify in the spike.

---

## 10. GOTCHAS, CONTRADICTIONS & AUDIT ERRORS

Corrections to `anakin-capability-audit.md`:

| # | That audit said | Reality |
|---|---|---|
| 1 | Catalog 991 sites / 5,328 actions | ✅ **963 / 5,250** on 12 Sep — it went *down*. Homepage says "940+ / 4,500+"; Wire docs example shows `total_sites:155, total_actions:920`. **Four numbers across four pages.** Read at runtime. |
| 2 | No mention of credit budget | ✅ **Free = 300 credits.** Biggest omission; invalidates its monitoring recommendations. |
| 3 | "Rate-limit contradiction 30 vs 120/min" | Not a contradiction — different routes. `/wire/resolve`=120/min, `/wire/search`=30/min. |
| 4 | "SDKs hide job polling" | ⚠️ Python SDK covers only scrape/map/crawl. No Wire/Browser/Monitoring. |
| 5 | MCP "alpha, exposes Anakin to MCP clients" | ✅ Now **21 tools across every product**. Materially understated. |
| 6 | — | ⚠️ `Anakin-Inc/anakin` is a **different product** (OSS scraper, no Wire/Browser/Monitoring). |
| 7 | — | ✅ Undocumented `/v1/ai/evaluate` + `/stream` exist (10/min). Missed entirely. |
| 8 | Rates Monitoring its best pattern; ChangeOps "very feasible" | ⛔ Re-rated — see §7. Those ratings ignored credits. |

**Still-valid cautions from that audit:**
- Pricing pages sometimes say `/v1/scrape` while the API reference says `/v1/url-scraper`. Use the API reference.
- Scraper advertises 207 proxy countries; Browser API emphasises aligned fingerprints for 20+. **Don't claim identical geo coverage for both.**
- Catalog action *labels* are marketing. The live `auth_mode`, `params[]`, and actual state effect matter more than a "read/write" badge.
- A successful scrape means content was *retrieved* — not that it's correct, independent, current, or safe to follow as instructions.

---

## 11. AGENT PATTERNS — re-rated for 300 credits & 2 days

| # | Pattern | Anakin fit | Verdict on our budget |
|---|---|---|---|
| 1 | **Dynamic Wire agent** — intent → `/wire/resolve` → check auth/cost/params → call → verify | Uses the single most Anakin-native feature | **Strongest.** Discovery is free/keyless; cost is only the action itself. |
| 2 | Monitor → reason → controlled action | Monitors + webhooks | ⛔ **Downgraded.** 192cr/day. Only viable via manual `/run` or create-then-pause. |
| 3 | **Browser goal executor with verification** — act, observe after every step, adapt, check a concrete completion condition | Browser API + Sessions + free recording | **Strong & cheap** (5cr per 10-min run, ~60 runs). Gated on Free-tier browser access. |
| 4 | Evidence-based decision agent — scrape + search + selective crawl → local action | Scrape/Search/Map/Wire | Feasible; verdict quality is hard to validate in 2 days. |
| 5 | **Read outside, write inside** — Anakin reads the changing web; we write to a system we control | All read products | **Most reliable architecture** — needs no external write API. |

**"Read outside, write inside" + "dynamic Wire agent" is the lowest-risk combination**, because neither depends on an unverified write action or on Free-tier browser access.

---

## 12. WHAT ANAKIN DOES **NOT** PROVIDE

- A general planner for our business goal. Agentic Search plans research only.
- Guaranteed automation of every site. Browser API gives control; **we** write selectors, state, recovery, verification.
- A universal write action. Writes exist only where a catalog exposes them.
- Access through **CAPTCHA, MFA, phone verification, or third-party consent flows**.
- Fraud / eligibility / legal / safety truth. It retrieves evidence; **our** app defines decision policy and uncertainty.
- Repo editing, inventory mutation, payments, ticketing, or document management — unless we connect that system ourselves.
- Physical-world verification.

---

## 13. VALIDATION SPIKE — DO THIS BEFORE COMMITTING (~15–25 credits, <1 hour)

| # | Test | Cost | Why |
|---|---|---|---|
| 1 | `GET /v1/wire/resolve?q=<intent>` — save real `params[]`, `credits`, `auth_mode`, `mode` | **0** | Confirms the action exists and its true schema |
| 2 | `POST /v1/wire-run` on a read-only action | **0** | Confirms Zero Touch returns real data |
| 3 | `POST /v1/wire/task` + poll `/jobs/{id}` | action cost | Confirms keyed path + job polling |
| 4 | **Playwright → `wss://.../v1/browser-connect`** | ~1–2 | 🚦 **THE GATE — is Free-tier browser access available at all?** |
| 5 | Reconnect with `?save_session=` / `?session_name=` | ~1–2 | Confirms auth state persists across runs |
| 6 | `curl POST /v1/ai/evaluate` | ? | Identify the undocumented endpoint |
| 7 | Trigger any webhook, capture headers | ~1 | **Only way to learn the real HMAC scheme** |
| 8 | Time + credit-cost one full demo run | ~5 | Confirms the demo fits budget and a 3-min pitch |

**Step 4 is the decision point.** If Free-tier Browser API is unavailable or concurrency-limited, the act layer must come from Wire write actions — a different architecture.

---

## 14. OPEN QUESTIONS

1. **Judging criteria / submission format** — unpublished. **Check Discord. Cheapest high-value unknown.**
2. Webhook signature scheme — must be read from a real delivery.
3. Free-tier Browser API availability + concurrency — undocumented.
4. `/v1/ai/evaluate` purpose — undocumented.
5. How the API key is passed on the browser-connect WS URL.
6. Browser 2h cap / 5min idle timeout — unconfirmed.
7. Whether the 300 free credits renew monthly or are one-time.

---

## 15. SOURCES (all fetched 12 Sep 2026)

- https://anakin.io/hackathon/anakin-forge
- https://anakin.io/docs/documentation
- https://anakin.io/docs/api-reference
- https://anakin.io/docs/api-reference/wire/search-actions
- https://anakin.io/docs/api-reference/wire/execute-task
- https://anakin.io/docs/api-reference/url-scraper/submit-scrape-job
- https://anakin.io/docs/api-reference/agentic-search/submit-search
- https://anakin.io/docs/api-reference/monitoring
- https://anakin.io/docs/api-reference/browser-api/saved-sessions
- https://anakin.io/docs/api-reference/browser-api/geo-targeting
- https://anakin.io/docs/api-reference/browser-api/recording
- https://anakin.io/docs/documentation/pricing
- https://anakin.io/docs/documentation/rate-limits
- https://anakin.io/docs/sdks
- https://anakin.io/docs/integrations
- https://anakin.io/catalog
- https://anakin.io/changelog
- https://anakin.io/products/wire
- https://anakin.io/blog/give-your-ai-agents-a-live-view-of-the-web
- https://github.com/Anakin-Inc/anakin
- https://github.com/Anakin-Inc/anakin-py

**Pages that 404'd** (don't waste time re-trying these exact URLs): `/docs/documentation/browser-api`, `/docs/documentation/webhooks`, `/docs/documentation/webhook`, `/docs/documentation/overview`, `/docs/documentation/browser-automation`, `/docs/use-cases/browser-automation`, `/docs/integrations/claude-code`. npmjs.com/package/@anakin-io/mcp returns 403 to fetch.
