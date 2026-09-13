# Questions for the Anakin bot / Discord

Ordered by how much the answer changes what we build. **Ask 1–3 first** — those three decide the architecture. The rest are useful but not blocking.

---

## 🔴 TIER 1 — these decide the architecture

### Q1. Free-tier Browser API access ← **the single most important question**

> Does a **free (Starter, 300-credit) account** have access to the Browser API at `wss://api.anakin.io/v1/browser-connect`, or is it a paid-plan feature? If free accounts do get it, what's the **concurrent session limit** on free vs Pro vs Scale? The docs list per-plan caps for monitors but I couldn't find them for browser sessions.

**Why it matters:** our entire "act" layer is Browser API + a saved login session. If free tier can't open a CDP connection, we pivot to Wire cart actions — a different architecture. This is our build gate.

### Q2. Hackathon credit grant

> For Anakin Forge participants — is there a **credit grant or promo code** beyond the 300 free credits? A browser-automation agent burns credits faster than a scraping project and I'd rather plan the budget correctly than run out mid-demo.

**Why it matters:** we have 4 accounts × 300 = 1,200. Workable, but a grant would let us stop rationing and iterate freely.

### Q3. Judging criteria + submission

> Where are the **judging criteria** published, and what's the **submission format and exact cutoff (with timezone)** for Sept 14? The hackathon page lists dates and prizes but I couldn't find a rubric or a submission link.

**Why it matters:** completely unknown right now. Changes how we weight demo polish vs technical depth, and we need the real freeze time.

---

## 🟠 TIER 2 — affects implementation, not architecture

### Q4. Interactive login for Browser Sessions

> What's the recommended way to do a **one-time human login** for a site that uses phone OTP (e.g. BigBasket), so the session can be saved and reused by later automated runs? Is there an interactive/live browser URL a person can click into, or is `POST /v1/sessions/manual-start` the intended flow? How long do saved sessions stay valid?

**Why it matters:** Indian grocery sites are OTP-gated. Our whole plan assumes a human logs in **once**, interactively, and the agent reuses the session. If there's no interactive path, Path A breaks.

### Q5. Zero Touch allowlist

> `fk_search_products` is listed as `auth_mode: "none"`, but calling it through keyless `/v1/wire-run` returns `{"error":"keyless_account_required"}`. Meanwhile `bb_search_products` (also `auth_mode: "none"`) **works** keyless. What determines which actions are runnable via Zero Touch? Is there a flag in the catalog response that indicates it?

**Why it matters:** we can't tell from the catalog which actions we can call without a key. Affects what we can demo key-free.

---

## 🟡 TIER 3 — bug reports / nice to know

### Q6. `catalog` filter on `/v1/wire/resolve` appears broken

> `GET /v1/wire/resolve?q=cart&catalog=blinkit` returns actions from `blueridgeknives`, `dumco` and `immayasports` — nothing from Blinkit. No error. `?q=product&catalog=blinkit` similarly returns `producthunt` and `williams-sonoma`. Is `catalog` supposed to filter results? (`?catalog=blinkit` with no `q` correctly errors with `q parameter is required`.)

### Q7. `/v1/wire/resolve` response doesn't match the docs

> The docs show `params` as an array of `{name, type, required, default, description}` plus `name`, `description`, `mode`, `auth_mode`, `catalog_slug` fields. The live response returns `params` as an **object** with `required[]` / `optional[]` arrays, uses `catalog` instead of `catalog_slug`, includes an undocumented `auth_satisfied`, and omits `name`, `description`, `mode` and `auth_mode` entirely. Which is correct? (`GET /v1/wire/catalog/{slug}` *does* return all those fields.)

### Q8. Blinkit product details returns no price

> `bli_product_details` resolves the store correctly from a pincode (560055 → merchant 31277) and returns `in_stock`, but `mrp` comes back `null` and there's no selling-price field in the response. Is price available from any Blinkit action? BigBasket's `bb_search_products` returns `price`, `list_price` and `discount_percent` fine.

### Q9. Undocumented AI endpoint

> The rate-limits page lists `POST /v1/ai/evaluate` and `/v1/ai/evaluate/stream` at 10 req/min, but I can't find a docs page for either. What do they do?

### Q10. Browser API hard limits

> What are the actual **max session duration** and **idle timeout** for Browser API? I've seen a 2-hour cap and 5-minute idle disconnect referenced but couldn't find them documented.

---

## Copy-paste version (Tier 1 only)

> Hi! Building for Anakin Forge, a few questions:
>
> **1.** Does a **free/Starter (300 credit) account** get access to the Browser API (`wss://api.anakin.io/v1/browser-connect`)? And what's the concurrent browser session limit on free vs Pro vs Scale? Docs list per-plan caps for monitors but not browser sessions.
>
> **2.** Is there a **credit grant or promo code for hackathon participants** beyond the 300 free credits? Browser automation burns through them faster than scraping.
>
> **3.** Where are the **judging criteria** and what's the **submission format + exact cutoff time/timezone** for Sept 14?
>
> **4.** For a site with phone-OTP login (e.g. BigBasket) — what's the recommended way to do a **one-time human login** so the session saves and later automated runs can reuse it? Is `/v1/sessions/manual-start` the right flow, and how long do saved sessions last?
>
> Thanks!
