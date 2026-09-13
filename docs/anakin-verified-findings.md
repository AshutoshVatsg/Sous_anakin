# Anakin.io — Verified Capability Findings

**Verification date:** 12 September 2026
**Method:** Live fetch of anakin.io docs, API-reference endpoint pages, /catalog, /changelog, /products/wire, homepage, npm + GitHub repos.
**Status key:** ✅ verified against live page · ⚠️ contradiction found · ❓ could not verify (do not assert)

---

## 0. TIME-CRITICAL

✅ **Anakin Forge Hackathon runs September 7–14, 2026** (quoted from https://anakin.io/hackathon/anakin-forge).
Today is 12 September 2026. That leaves roughly **2 days**.

Prizes (verbatim): 1st = PS5, 2nd = MSI gaming monitor, GitHub raffle = mechanical keyboard. "$1,000+ up for grabs."
Stack rules (verbatim): "Any stack, any approach" — no mandated tech.

❓ **Judging criteria and submission mechanics are NOT published on the hackathon page.** Not found anywhere indexed.

> Note: a web search result claimed the event ran "August 24 – September 13." The hackathon page itself says September 7–14. The page wins; the search snippet was wrong.

---

## 1. Corrections to the prior audit

| # | Prior audit said | Live reality | Impact |
|---|---|---|---|
| 1 | Catalog: 991 sites / 5,328 actions | ✅ **963 sites / 5,250 actions** (12 Sep) | Number *went down*. Homepage says "940+ platforms · 4,500+ ops"; Wire docs example shows `total_sites: 155`. **Four different numbers across four pages.** Never hardcode — read `/v1/wire/catalog` at runtime. |
| 2 | No mention of free-tier credits | ✅ **Starter (Free) = 300 credits.** Pro $9/mo = 3,000. Scale $29/mo = 12,000. | **Biggest omission in the audit.** 300 credits is a hard demo budget. See §4. |
| 3 | Rate-limit conflict 30 vs 120/min | ✅ Both real, different routes: `/v1/wire/resolve` = **120 req/min per IP**; `/v1/wire/search` = **30 req/min per IP** | Audit's caution was correct; they are not actually in conflict. |
| 4 | SDKs "hide job polling" | ⚠️ Python SDK README documents **only `scrape()`, `map()`, `crawl()`** | No SDK coverage for Wire, Browser, or Monitoring. Those need raw REST + Playwright. |
| 5 | MCP "alpha, exposes Anakin to MCP clients" | ✅ Changelog Jul 21 2026: MCP connector now exposes **every Anakin product — 21 tools**, incl. Monitoring, AI Visibility, Browser Sessions, Browser Automation | Materially bigger than the audit implied. Near-zero-glue-code path. |
| 6 | — | ⚠️ `github.com/Anakin-Inc/anakin` is **AnakinScraper OSS — a different, narrower product** (scrape only, self-hosted, Camoufox anti-detect, Thompson-Sampling proxy selection). **No Wire / Browser / Monitoring.** | Do not conflate the hosted API with the OSS repo. |
| 7 | — | ✅ Undocumented endpoints found on the rate-limits page: `POST /v1/ai/evaluate` and `/v1/ai/evaluate/stream`, **10 req/min** | ❓ No doc page exists. Purpose unknown. Audit missed entirely. |

---

## 2. Verified endpoint surface

Base: `https://api.anakin.io` · Auth header: **`X-API-Key`**

### Wire
- ✅ `GET /v1/wire/resolve` — intent → action. Params: `q`, `catalog`, `category`, `auth_mode` (`none|optional|required`), `auth` (legacy).
  Returns per result: `action_id`, `catalog_name`, `catalog_slug`, `name`, `description`, `mode` (`async|sync`), `auth_mode`, `auth_required`, `connected`, `params[]` (name/type/required/default/description), `credits`. **120/min per IP.**
- ✅ `POST /v1/wire/task` — params `action_id`, `credential_id` (UUID), `params`, `webhook_url`. → `202 {status, job_id, poll_url}`. **20/min per user.**
  Verbatim: *"Credits are deducted immediately at submission and refunded automatically if the job fails."*
- ✅ `GET /v1/wire/jobs/{id}` (60/min), `/download` (30/min)
- ✅ `GET /v1/wire/catalog`, `GET /v1/wire/catalog/{slug}` (60/min, no auth)
- ✅ `POST /v1/wire-run` — **Zero Touch: read-only action, no key, no signup, synchronous**
- ✅ Identity management: login, verify-credential, list-identities, plus identity *sources* (1Password / Key Vault style connectors)
  Verbatim: credentials are *"AES-256 encrypted at rest · injected at runtime · never returned by the API."*

### URL Scraper
- ✅ `POST /v1/url-scraper` (async, 60/min) → `202 {jobId, status:"pending"}`; poll `GET /v1/url-scraper/{id}` (unlimited)
- ✅ `POST /v1/url-scraper/scrape` — **Zero Touch keyless inline scrape** (per homepage example)
- ✅ `POST /v1/url-scraper/batch` — up to 10 URLs
- ✅ Params: `url`, `formats[]` (`markdown|html|cleanedHtml|links|images|summary|screenshot|json`), `country`, `useBrowser`, `generateJson`, `outputSchema`, `sessionId`, `webhook_url`, `actions[]`
- ✅ Action types: `wait`, `wait_for`, `click`, `scroll`, `write`, `press`. Limits: **max 15 actions; 15s per wait; 30s total wait; 500-char selector.**

### Browser API — the "act" primitive
- ✅ `wss://api.anakin.io/v1/browser-connect` (CDP over WebSocket)
- ✅ Query params: `?country=XX`, `?session_id=<uuid>` **or** `?session_name=<name>` (session_id wins), `?record=true`, `?save_session=<name>`, `?save_url=<url>`
- ✅ Clients: **Playwright (Python + Node) and Puppeteer.** Selenium unsupported.
- ✅ Errors: WS close **1008** — 404 session not found · 422 session has no stored data · **409 session is being automated** (no concurrent use of one session)
- ✅ Geo: 20 countries with aligned exit IP + `navigator.language` + timezone + currency formatting. Others route residential but fall back to UTC / en-US.
- ✅ Recording: WebM VP8, 15 fps, 1920×1080, ~50 MB per 2-hour session, **7-day retention**, presigned URL valid 1 hour, **no extra credits**. Off by default.
- ✅ Billing: **1 credit / 2 minutes**
- ❓ 2-hour max duration and 5-minute idle timeout — the audit claims these; I could not find the source page. The "~50 MB for a 2-hour session" phrasing is *consistent with* a 2h cap but is not a statement of one.
- ❓ Per-plan concurrency limits — **not found in docs.**

### Search
- ✅ `POST /v1/search` — synchronous, **3 credits**, 60/min, max 20 results
- ✅ `POST /v1/agentic-search` — params `prompt`, `webhook_url` → `{job_id, status, message, created_at}`. Four stages: query refinement → web search → citation scraping → analysis. **10 credits + 1/URL.** Docs: *"poll every 10 seconds"*; takes several minutes.

### Map / Crawl
- ✅ `POST /v1/map` (1 credit, up to 5,000 URLs, depth 5), `POST /v1/crawl` (1 credit/page, max 100 pages, depth 5). Both 60/min. Status GETs unlimited.

### Monitoring
- ✅ `POST /v1/monitors`, `GET /v1/monitors`, `PUT /v1/monitors/{id}`, `POST /v1/monitors/{id}/run`
- ✅ Scopes: `page` (default) · `site` · `wire`
- ✅ Costs: full-page 2 credits · schema-extracted 3 credits · `aiMode:true` +1 credit
- ✅ **Min interval 15 min.** Active monitors: Free 5 · Pro 20 · Scale 100
- ✅ Supports browser sessions and `country`

### Webhooks
- ✅ Exist (changelog Jul 14 2026): "signed delivery verification and automatic retry logic"
- ❓ **HMAC header names, exact payload shape, 10s receiver timeout, 10-endpoint cap, 256 KB `result_url` threshold — all unverified.** The audit asserts these; I could not reach a webhooks doc page. Treat as unconfirmed until observed in a real delivery.

---

## 3. Integrations (verified)

**Available:** Claude Code plugin (skills, agents, hooks) · Cursor · OpenClaw · Google ADK · Dify · Zapier (4 actions) · Make (4 modules) · MCP server
**Coming soon:** LangChain · LlamaIndex · CrewAI · Langflow · Flowise · n8n · .NET SDK

MCP install: `npx -y @anakin-io/mcp init --all` — targets Claude Desktop, Claude Code, Cursor, Cline, Continue, Zed, Windsurf, VS Code.
SDKs, all alpha v0.1.x: Python `anakin-sdk` · Node `@anakin-io/sdk` · Go · Rust · PHP · Ruby · Elixir · Java. .NET pending.

---

## 4. Credit budget reality (NEW — audit omitted this entirely)

Free tier = **300 credits**.

Rough costs for a demo run:
- Browser API: 1 credit / 2 min → a 10-minute agent run = **5 credits**
- Agentic Search: **10 + 1/URL** → one deep-research call ≈ 15–25 credits
- Search: 3 · Scrape: 1 (+1 summary, +2 JSON) · Map: 1 · Crawl: 1/page
- Monitor at 15-min interval, full page: 2 credits × 4/hr = **192 credits/day** ← one monitor left running overnight can consume the entire free tier

**Implication:** if the build leans on Monitoring or Agentic Search, 300 credits is tight. Pro at $9 (3,000 credits) is cheap insurance for a judged demo.

---

## 5. What Anakin genuinely gives you vs. what you build

**Anakin gives:**
- the *browse* layer — scrape / map / crawl / search
- a *dynamic tool registry* — `/v1/wire/resolve`, the agent-native crown jewel
- a *hands* layer — CDP browser + persisted auth sessions
- a *wake-up* layer — monitors + webhooks

**You build:** the *think* layer. There is no Anakin planner for arbitrary goals — Agentic Search plans research only. Your controller owns goal decomposition, tool selection, verification after each act, recovery, and the stop condition.

**Anakin does not provide:** universal write access (writes exist only where a catalog exposes them) · CAPTCHA / MFA bypass · correctness or safety guarantees on retrieved content · any controlled system to write into.

---

## 6. Highest-leverage, verified-only observations

1. `/v1/wire/resolve` returns `params[]` + `credits` + `auth_mode` per action — a **runtime-discoverable tool schema**. An agent that selects tools from this at runtime rather than hardcoding them is the most Anakin-native thing buildable, and nothing else in the docs competes as a differentiator.
2. **Zero Touch (`/v1/wire-run`, `/v1/url-scraper/scrape`) needs no key** → a judge can run the demo with zero setup. Strong submission property.
3. **Browser recording is free and yields a WebM** → an automatic demo video of the agent acting, at no credit cost. 7-day retention outlasts judging.
4. `save_session` + `session_name` means authenticated flows work without re-login per run — but **409 on concurrent use** forbids parallel runs against one session.
5. `params[]` from resolve maps 1:1 onto an LLM tool-definition schema, so tool selection can be delegated to the model with no hand-maintained registry.
6. The `mode` field (`sync|async`) per action means the controller must handle both paths — some Wire actions return inline, others need job polling.

---

## 7. Open questions requiring the team's answer or a live test

1. Judging criteria / submission format — unpublished. **Check the Discord or registration email.**
2. Webhook signature scheme — must be read from a real delivery.
3. Browser concurrency on the Free plan — must be tested.
4. `/v1/ai/evaluate` — undocumented; worth one curl.
5. Whether the team's account is Free (300 credits) or paid.

---

## Sources

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
- https://github.com/Anakin-Inc/anakin
- https://github.com/Anakin-Inc/anakin-py
