# Anakin.io Capability Audit for Anakin Forge

**Audit date:** 9 September 2026  
**Purpose:** Determine what Anakin currently documents, what an agent can realistically use, and what should be validated before committing to a one-week hackathon build.

## Research method and coverage

Firecrawl Map discovered the Anakin documentation surface under `/docs`, including product overviews, endpoint references, SDKs, integrations, monitoring, authentication, webhooks, and Wire identity management. Direct Firecrawl extracts were then taken from the key overview and endpoint pages.

Firecrawl's bulk Crawl endpoint returned HTTP 429 on this connected account, even after the request was reduced. Its autonomous extraction job also failed because that job's separate browser environment reported an invalid token. The audit therefore uses the successful site map plus direct current extracts of the operational documentation. It covers every documented product family and the parameters that materially affect a hackathon, but it is not a byte-for-byte archive of every language-specific SDK example.

Primary documentation entry points:

- [Documentation overview](https://anakin.io/docs/documentation)
- [API reference](https://anakin.io/docs/api-reference)
- [Wire catalog](https://anakin.io/catalog)
- [SDKs and CLI](https://anakin.io/docs/sdks)
- [Integrations](https://anakin.io/docs/integrations)
- [Pricing and credits](https://anakin.io/docs/documentation/pricing)
- [Rate limits](https://anakin.io/docs/documentation/rate-limits)

## Confirmed capability matrix

| Capability | What it actually provides | Execution and authentication | Documented limits/cost | Best agent use |
|---|---|---|---|---|
| URL Scraper | Markdown, HTML, cleaned HTML, links, images, summaries, screenshots and schema-based JSON from one URL | Inline or asynchronous; API key for full service; limited inline scraping through Zero Touch without a key | 1 credit base; summary +1; JSON +2; batch up to 10 URLs | Read the page currently relevant to an agent's task |
| Map | Discovers a site's URLs from sitemaps and links, with filtering | Asynchronous; can use browser rendering and a saved session | 1 credit; up to 5,000 URLs; depth up to 5 | Find policy, form, documentation, pricing or support pages before choosing what to read |
| Crawl | Discovers and extracts content from multiple pages on one site | Asynchronous; supports browser rendering, country routing and saved sessions | 1 credit per requested page; maximum 100 pages; depth up to 5 | Build bounded site context after Map identifies a relevant section |
| Search API | Web results, snippets, dates and an AI summary with citations | Synchronous | 3 credits; maximum 20 results | Find outside evidence or candidate sources quickly |
| Agentic Search | Four-stage query refinement, web search, citation scraping and synthesis | Asynchronous | 10 base credits plus 1 per scraped URL | Deep research where a single Search call is insufficient |
| Wire | Maintained structured actions for named sites; action discovery and parameter schemas | Public discovery; read-only Zero Touch actions can run without a key; keyed async tasks support connected and write actions where the catalog exposes them | Per-action cost in live catalog; failed tasks documented as refunded/not billed | Let an agent discover a structured site operation by intent and call it without maintaining a scraper |
| Browser API | A cloud browser controlled through Playwright, Puppeteer or another CDP-native client | API key required; arbitrary navigation, input, screenshots, routing and instrumentation are controlled by the team's code | 1 credit per 2 minutes; 2-hour hard cap; 5-minute idle timeout; plan-based concurrency | Complete a bounded interactive workflow, reproduce a web failure, or verify an action |
| Browser Sessions | Saves cookies and localStorage and restores them into later browser runs | User logs in once interactively or programmatically; later runs load by session ID/name | Loading is included; a session cannot be automated concurrently | Operate authorized authenticated pages without logging in on every run |
| Website Monitoring | Scheduled snapshot and change detection | API key; optional email and signed webhook alerts | Minimum 15 minutes; active caps Free 5, Pro 20, Scale 100 | Give an agent persistent awareness of a page, site or structured Wire result |
| AI Visibility | Runs one prompt against supported AI engines and compares answers, summaries, latency and credit use | Asynchronous; API key required; selectable country | Each completed source bills its Wire action; no caching | Brand/answer monitoring agents; less useful for general web-action projects |
| Webhooks | Signed events when async jobs or monitors finish | HMAC-SHA256 verification on the receiver | 10-second receiver timeout; up to 10 registered endpoints; results over 256 KB delivered by URL | Resume an agent when web work completes instead of polling continuously |

## Product details that matter during implementation

### URL Scraper

Canonical endpoint family: `/v1/url-scraper`.

The asynchronous endpoint accepts a URL plus output formats, proxy country, `useBrowser`, schema extraction, a saved `sessionId`, a callback URL, and optional browser actions. Supported browser actions include waiting, waiting for a selector, clicking, scrolling, writing text and pressing keys.

The documented action limits are:

- Maximum 15 actions per scrape.
- Maximum 15 seconds per individual wait.
- Maximum 30 seconds of total waits.
- Maximum selector length of 500 characters.
- Maximum write length of 1,000 characters.
- Browser actions add 1 credit.

This is useful for deterministic preparation such as dismissing a banner or clicking “load more.” A complex or adaptive workflow belongs in Browser API, where the agent can inspect the result after every step.

### Map and Crawl

Map returns URLs; Crawl returns page content. They are complementary rather than interchangeable.

Map parameters include subdomain and external-link inclusion, a URL substring search, browser rendering, a saved session, limit, depth and per-level discovery limit. Its documented maximum is 5,000 URLs.

Crawl accepts include/exclude glob patterns, maximum pages, depth, country, browser rendering, session and webhook. Its documented maximum is 100 pages and depth 5. A one-week agent should rarely crawl 100 pages blindly: Map first, filter, then crawl the smallest relevant section.

### Search and Agentic Search

Search is synchronous and bounded to 20 results. It is suitable inside an interactive loop.

Agentic Search is itself a research pipeline: refine query, search, scrape citations, synthesize. It does not replace the application agent. Your controller must still decide when research is needed, whether evidence is sufficient, and what action follows.

### Wire

The live catalog page currently states **991 websites and 5,328 callable actions**. Major catalog categories include finance, marketplaces, research, shopping, government/legal, travel, news, developer tools, food, real estate, utilities, health, jobs, social and education.

Wire has two practical modes:

1. **Zero Touch read mode:** discover catalogs and resolve actions publicly, then run a read-only action synchronously through `/v1/wire-run` without an account or API key, subject to a per-IP allowance.
2. **Keyed task mode:** submit `/v1/wire/task`, receive a job ID and poll or await a webhook. This mode is required for durable jobs, connected identities and state-changing actions.

The key agent-native feature is `/v1/wire/resolve`. The controller can search by intent, catalog, category and authentication mode. Results include the action ID, site, description, parameter schema, execution mode, authentication mode, connection state and credit cost. This allows dynamic tool selection without hardcoding every action.

Wire does not mean every website supports every desired action. The live catalog record must be checked at runtime. An action can declare auth as `none`, `optional` or `required`. Write capability exists only where a catalog explicitly exposes it.

Wire identities represent named accounts on supported sites. Connected credentials can be selected per task. The documentation also describes integrations with a user's 1Password or Azure Key Vault so credentials are read for login without storing the secret itself in Wire's database. This is too much scope for most one-week demos; a manually saved test identity is simpler.

The platform documents a build-request endpoint for requesting a new Wire action. Do not make a hackathon's critical path depend on that request being built in time.

### Browser API and Sessions

Browser API exposes a WebSocket CDP connection at `/v1/browser-connect`. Confirmed Playwright support includes navigation, selectors, JavaScript evaluation, screenshots, keyboard/mouse input, scrolling, multiple pages, cross-site navigation, console/page error events, request/response events, WebSocket events and request interception through routing. Puppeteer supports the core navigation, extraction and input surface. Selenium/ChromeDriver is explicitly unsupported.

Billing and limits:

- 1 credit per 2-minute interval, rounded up.
- Maximum session duration: 2 hours.
- Idle disconnect after 5 minutes without a CDP message.
- Concurrency depends on the account plan.
- Recording is included.
- Geographic routing has no documented surcharge.

Saved Sessions persist cookies and localStorage. A session can preserve its proxy exit IP across loads. The session is captured when the browser disconnects, so clean shutdown matters. Loading a missing, empty or concurrently used session returns explicit errors.

This gives the team a browser, not a universal autonomous operator. The team still writes the Playwright/Puppeteer logic or builds a planner that issues verified browser steps. CAPTCHAs, MFA, phone-only flows and site policies remain real constraints.

### Monitoring

Monitoring supports three scopes:

- **Page:** snapshot one URL and compare full content or schema-extracted fields.
- **Site:** crawl a site on a schedule and report added, removed and changed pages.
- **Wire:** execute a Wire action on a schedule and diff its structured JSON result.

Page monitoring costs 2 credits for full-page comparison or 3 for schema-extracted specific data. AI meaningful-change filtering adds 1 credit per check and accepts an optional natural-language goal.

Site monitors bill 1 credit per crawled page, support pinned pages plus organic discovery, and cap a run at 50 pages. Wire monitors charge the selected action's own rate; AI filtering adds 1. `wireWatchPaths` can limit comparison to particular JSON fields.

All monitor types have a minimum 15-minute interval. Active monitor caps are documented as 5 on Free, 20 on Pro and 100 on Scale.

Monitoring is Anakin's best foundation for a persistent agent: a change webhook can reopen stored case state, trigger reasoning, update a controlled system and verify the consequence.

### Webhooks and asynchronous work

Most Anakin product families use submit-then-poll jobs. Search and inline Scrape are synchronous exceptions. Webhooks can replace polling for asynchronous work.

Webhook events cover scraping, batches, Map, Crawl, Agentic Search, Wire, monitoring and AI Visibility. Delivery bodies are HMAC-SHA256 signed. Large results are delivered by an authenticated `result_url`; inline results are only an optimization below 256 KB. Receivers should acknowledge within 10 seconds and process work asynchronously.

### AI Visibility

AI Visibility sends the same prompt to supported engines such as ChatGPT, Gemini and Google AI Overview, with a selected country. It reports per-source answers, summaries, latency and credits. Results are always fresh and uncached. This is useful for brand monitoring or answer-consistency agents, but adds little to most consumer or workflow agents.

### SDKs, CLI and MCP

The documentation lists alpha SDKs for Python, Node.js, Go, Rust, PHP, Ruby, Elixir and Java. The .NET SDK is marked coming soon. SDKs hide job polling and include retries and typed errors.

Anakin CLI is marked available. The MCP server is alpha and exposes Anakin to MCP clients. Zero Touch MCP can expose scrape, Wire discovery/catalog and read actions without OAuth; a bearer key unlocks the full surface.

Available integrations listed in the docs:

- Claude Code, Cursor and OpenClaw.
- Google ADK.
- Dify, Zapier and Make.

Documented as coming soon rather than available:

- LangChain, LlamaIndex, CrewAI, Langflow and Flowise.
- n8n.
- .NET SDK.

Do not base the hackathon build on a “coming soon” native integration. Direct REST, Node/Python SDK or MCP is sufficient.

## What Anakin does not provide

The documentation does not establish any of the following as a universal capability:

- A general planner that pursues your product's business goal. Agentic Search plans research, not arbitrary workflows.
- Guaranteed automation of every site. Browser API provides control, while your code handles selectors, state, recovery and verification.
- A universal write action. Wire writes exist only in catalogs that expose them.
- Automatic access through CAPTCHA, MFA, phone calls or third-party consent flows.
- Fraud, eligibility, legal-compliance or safety truth. Anakin retrieves evidence; your application defines the decision policy and uncertainty.
- Repository editing, inventory mutation, payments, ticket creation or document management unless your application connects the corresponding controlled system.
- Physical-world verification.

## Best-supported agent patterns

### 1. Dynamic Wire agent

The agent receives an intent, searches `/v1/wire/resolve`, checks authentication/cost/parameters, calls a suitable action and verifies its result. This demonstrates an Anakin-native dynamic tool registry.

### 2. Monitor → reason → controlled action

Anakin monitors a page, site or Wire result. A signed webhook awakens the agent. The agent interprets the change, updates a controlled system, then verifies the outcome. Examples include requirements-to-task updates, recall-to-inventory holds and policy-to-compliance tickets.

### 3. Browser goal executor with verification

The agent uses Browser API to complete one authorized task on a staging or supported site. It observes after every step, changes its approach when the page differs and checks a concrete completion condition. Bug reproduction and form completion fit this pattern.

### 4. Evidence-based decision agent

The agent scrapes the current page, searches outside sources, selectively crawls relevant material, then performs a local action such as blocking checkout, creating a case or routing the user. Purchase investigation fits here, though its verdict is harder to validate than a deterministic workflow.

### 5. Read outside, write inside

Anakin reads changing external sources. The agent writes to a database, repository, inventory system, task list or document workspace controlled by the user. This is the most reliable architecture for a one-week build because external sites need no write API.

## Implications for the current hackathon ideas

| Idea | Strongest Anakin fit | External dependency | Audit judgment |
|---|---|---|---|
| ReproAgent | Browser API, recording, request/console events, Sessions | Authorized staging app and test account | Strong technical demo; avoid mandatory code repair |
| RecallOps | Search/Scrape/Crawl, Monitoring, webhooks | Inventory with product/batch identifiers | Strong persistent-agent pattern; safer conclusions than fraud scoring |
| AccessFix | Browser plus Map/Scrape | Authorized repository and staging preview | Compelling but code repair increases risk |
| PurchaseProof | Scrape, Map, Search, Wire Resolve, domain/review actions | Calibration and independent evidence | Feasible extension; fraud verdict remains difficult to validate |
| ChangeOps | Site/page monitoring and webhooks | Controlled task workspace | Very feasible; must visibly update downstream work |
| ApplyReady | Browser and Sessions | Stable form, authorization, no blocking CAPTCHA | Feasible only on a narrow set of supported forms |
| RestockPilot | Wire product/cart actions and Sessions | Exact live action plus supplier account | Choose only after the cart action succeeds in a spike |
| ExitProof | Browser and Sessions | Provider-specific cancellation path | High access risk for a one-week build |

## Documentation contradictions and implementation cautions

1. The live catalog reports 991 sites and 5,328 actions, while some homepage/docs marketing still says 940+. Use the live catalog API at runtime.
2. The Wire Resolve endpoint page says 120 requests/minute, while the general rate-limit page documents 30 requests/minute for the older `/search` discovery route. Treat 30/minute as the safe limit until a real response header confirms otherwise.
3. Pricing examples use `/v1/scrape` in places, while the current API reference names `/v1/url-scraper`. Use the canonical API-reference endpoint or current SDK.
4. URL scraping advertises proxy routing across 207 countries/territories, while Browser API documentation emphasizes residential exits and aligned fingerprints for 20+ countries. Do not claim identical geographic coverage for both products.
5. Many SDKs and MCP are alpha. Framework integration pages clearly mark several popular frameworks as coming soon.
6. Catalog action labels should be verified against the live action schema. An action's natural-language description, auth mode and actual state effect matter more than a generic “read/write” marketing label.
7. A successful scrape means content was retrieved. It does not prove that the content is correct, independent, current enough for the decision, or safe to follow as instructions.

## Recommended one-day technical validation

Before final project selection, run these tests against the team's Anakin account:

1. Call `/v1/wire/resolve` for the intended action and save the returned schema, cost and auth mode.
2. Execute one anonymous read action and one intended authenticated/write action, if the project needs it.
3. Connect Playwright to Browser API and finish one authorized test-site workflow.
4. Save a login session, reconnect, and prove the expected authenticated state remains.
5. Create a 15-minute monitor on a controlled page, change the page, verify the signed webhook and retrieve its diff.
6. Measure actual latency and credits for the proposed three-minute demo.

This validation will reveal whether the chosen project is based on working Anakin behavior rather than documentation assumptions.
