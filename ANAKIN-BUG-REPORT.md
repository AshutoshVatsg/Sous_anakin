# Anakin — issues found while building (12 Sep 2026)

Account: a Starter/free account. All reproduced live. Ordered by impact.

---

## 1. 🔴 Browser sessions: orphaned session blocks the slot, cannot be deleted

**Repro:**
```bash
curl -X POST https://api.anakin.io/v1/sessions/manual-start \
  -H "X-API-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"name":"probe","websiteUrl":"https://www.bigbasket.com/"}'
# -> {"sessionId":"31e3a486-...","expiresIn":595, ...}
```

Then a second `manual-start` returns:
```json
{"code":"session_limit_reached","error":"User has reached the browser_session session limit (1)",
 "existingSessionId":"31e3a486-2190-4d49-802e-9abd7dee5887","limit":1}
```

But deleting that exact session fails:
```bash
curl -X DELETE https://api.anakin.io/v1/sessions/31e3a486-... -H "X-API-Key: $KEY"
# -> {"error":"Session not found"}
```

**So the session simultaneously exists (blocks the limit) and does not exist (can't be deleted).**
`POST /v1/sessions/{id}/stop` and `/end` both return `Cannot POST`. The only escape is waiting ~10 min for expiry.

**Impact:** on a 1-session free tier, one stuck session blocks all interactive browser work.
**Suggested:** make DELETE release the slot, or expose a documented "end session" endpoint.

---

## 2. 🔴 `manual-start` returns internal Docker hostnames — unusable via API

```json
{"novncUrl":"ws://c7a0542154e1:6080/websockify",
 "wsUrl":"/sessions/{id}/playwright-ws"}
```

`c7a0542154e1` is a container hostname, not resolvable externally. Neither
`wss://api.anakin.io/v1/sessions/{id}/playwright-ws` (with `token` or `api_key`)
nor `browser-connect?session_id={id}` could attach.

The working viewer URL turns out to be **`https://anakin.io/sessions/interactive/{sessionId}`**,
which is **not returned in the response and not in the docs**. We only found it from a screenshot.

**Suggested:** return the public `interactive` URL in the `manual-start` payload, and document it.

---

## 3. 🟠 BigBasket appears to block Anakin's browser infrastructure

`https://www.bigbasket.com/` returns **HTTP 500** with BigBasket's own
*"This page doesn't exist / Our engineers are fixing it"* page inside the Anakin cloud browser.

Confirmed across 4 separate CDP connections on different residential exits
(Jio/Kolkata, Airtel/Pune, Airtel, Excitel/Faridabad) — and **in Anakin's own interactive
session viewer**, which rules out our client code.

Intermittent, not absolute: one product URL returned HTTP 200 with 44 KB of real content,
then the same URL was blocked 60 s later. Roughly 1-in-3 success.

**Notably, Wire is unaffected** — `bb_search_products` works reliably through the same account.
So it's specific to the browser egress, not to Anakin overall.

Related: `bb_search_products` intermittently fails with
`[scraper_error] BigBasket homepage warm-up failed: HTTP 500` — likely the same root cause,
since that action warms up the homepage first. Each retry costs 2 credits.

**Suggested:** if the Wire action can avoid the homepage warm-up, that would both fix the
intermittent failures and cut wasted credits.

---

## 4. 🟠 `GET /v1/wire/resolve` — `catalog` filter silently ignored

```bash
curl "https://api.anakin.io/v1/wire/resolve?q=cart&catalog=blinkit"
```
Returns actions from **blueridgeknives, dumco, immayasports** — nothing from Blinkit.
No error, no warning. Same with `?q=product&catalog=blinkit` → producthunt, williams-sonoma.

(`?catalog=blinkit` with no `q` correctly errors: `q parameter is required`.)

**Impact:** an agent can't scope discovery to a site. We had to use `GET /v1/wire/catalog/{slug}` instead.

---

## 5. 🟠 `GET /v1/wire/resolve` response doesn't match its documentation

Docs show `params` as a flat array plus `name`, `description`, `mode`, `auth_mode`, `catalog_slug`.

**Actual response:**
```json
{"action_id":"...","catalog":"flipkart","auth_required":true,"auth_satisfied":null,"credits":1,
 "params":{"required":[...],"optional":[...]}}
```

- `params` is an **object** (`required[]`/`optional[]`), not an array
- `catalog`, not `catalog_slug` / `catalog_name`
- `auth_satisfied` present but undocumented
- `name`, `description`, `mode`, `auth_mode` **absent entirely**

`GET /v1/wire/catalog/{slug}` *does* return all of those — so the two endpoints disagree.

---

## 6. 🟡 Zero Touch allowlist isn't discoverable

`fk_search_products` is `auth_mode: "none"` in the catalog, but keyless `/v1/wire-run` returns:
```json
{"error":"keyless_account_required"}
```
while `bb_search_products` (also `auth_mode: "none"`) works keyless.

**Suggested:** expose a `zero_touch: true/false` flag in the catalog so clients can tell.

---

## 7. 🟡 `type: "write"` means HTTP method, not state mutation

All 5 Blinkit actions typed `write` are reads — their own descriptions say
*"Returns a category's product listing"*, *"Returns product detail"*, *"Returns paginated category products"*.

This is misleading when scanning the catalog for genuine write capability.
**Suggested:** separate `http_method` from `mutates_state`.

---

## 8. 🟡 Undocumented endpoints

`POST /v1/ai/evaluate` and `/v1/ai/evaluate/stream` appear on the rate-limits page (10/min)
with no documentation page. They turn out to be an **autonomous browser agent** — prompt in,
tool loop out (`goto`, `type_text`) with per-step `reasoning`. That's a significant capability
that nothing in the docs mentions.

---

## 9. 🟡 Smaller doc mismatches

- `POST /v1/search` takes **`prompt`**, not `query`. Passing `query` returns `{"error":"invalid_request","message":"Prompt is required"}`. Docs and SDK examples say `query`.
- `POST /v1/sessions/manual-start` requires `websiteUrl` (camelCase), undocumented.
- Catalog totals differ across pages: `/catalog` says **963 sites / 5,250 actions**; homepage says "940+ platforms · 4,500+ ops"; Wire docs example shows `total_sites: 155, total_actions: 920`.

---

## 10. 🟠 `jm_search_products` (JioMart) is broken

```bash
curl -X POST https://api.anakin.io/v1/wire-run -H "X-API-Key: $KEY" \
  -d '{"action_id":"jm_search_products","params":{"query":"paneer"}}'
# -> {"status":"failed","error":"[scraper_error] JioMart API returned HTTP 404"}
```

The action is `status: "active"` in the catalog. This removes the only viable
alternative grocery data source to BigBasket.

---

## 11. 🟡 No grocery retailer on Wire has a cart action

Searched `/v1/wire/resolve` across 7 cart phrasings. Every catalog exposing
cart/order actions is B2B or niche:

| Catalog | Actions |
|---|---|
| app4sales, dumco | B2B ordering |
| blueridgeknives, weknife | knife retail |
| cytiva, bdbiosciences | lab supplies |
| vitals, vivino, toasttab, sebi | misc |
| **ubereats** | `ue_checkout`, `ue_get_carts` — restaurant delivery |

Not an India gap — grocery cart coverage is absent globally. A BigBasket/Blinkit/Instamart
cart action would unlock a whole class of agent use cases.

---

## 12. 🔴 `save_session` never persists — the stored cookie jar is frozen at creation

**This is the one that blocks everything else below it.** `browser-connect?save_session=<name>`
records that a session was *used* but never writes the updated cookies back.

Saved session `0c0be0ab-1474-4001-bace-6bae03baf42d` ("flipkart"), via `GET /v1/sessions`:

| moment | `lastUsedAt` | `cookieCount` | `storageItemCount` |
|---|---|---|---|
| created | 2026-09-13T19:04:44Z | 14 | 14 |
| after a run that **logged in successfully** | 2026-09-13T20:04:47Z | **14** | **14** |
| after a second login + **deliberate clean `browser.close()`** | 2026-09-13T20:11:34Z | **14** | **14** |

Both runs reached a genuinely authenticated Flipkart page — the header rendered the account
name, not "Login". The second run closed the browser *on purpose* while still signed in,
specifically to trigger the save. The jar never moved off its 19:04 contents.

Note `lastUsedAt` is stamped at **connect** time, not close time (20:11:34 is when the tunnel
opened; the close was ~20:13). So the close path appears not to write at all.

Connect URL used:
```
wss://api.anakin.io/v1/browser-connect?api_key=…&country=IN
  &session_name=flipkart&save_session=flipkart&save_url=https://www.flipkart.com/
```

**Consequence:** restoring with `session_name=flipkart` returns 16 cookies and Flipkart still
shows "Login" — 4 attempts out of 4. An authenticated session cannot be persisted at all.

---

## 13. 🔴 `fk_add_to_cart` / `fk_view_cart` always fail — a direct consequence of #12

```bash
POST /v1/wire-run {"action_id":"fk_view_cart","params":{},"identity_name":"flipkart"}
-> 200 {"status":"failed","error":"[scraper_error] Failed to fetch cart: HTTP 400"}
```

Empty params, so this is not a parameter problem. The identity's credential:

```json
{"credential_type":"browser_state","status":"active",
 "metadata":{"domain":"flipkart.com","cookie_count":14,"imported_from":"browser_session",
             "saved_session_id":"0c0be0ab-…"},
 "created_at":"2026-09-13T19:12:20Z"}
```

It was imported from the session in #12 — i.e. from a **never-authenticated** cookie jar,
and because of #12 it can never be re-imported from an authenticated one. Wire is faithfully
replaying a logged-out session, and Flipkart answers 400.

**There is no way out of this loop through the API:**

```bash
POST /v1/wire/identities/{id}/credentials {"credential_type":"browser_state","data":{}}
-> 400 "browser_state credentials are created via the connect flow, not this endpoint"
```

So `browser_state` can *only* come from a saved browser session, and saved browser sessions
never update. Combined with #2 (the dashboard's guided browser never provisions — "Failed to
fetch"), there is no path by which a working Flipkart credential can be created.

**Suggested:** either make `save_session` write on close, or accept cookies directly on
`POST /v1/wire/identities/{id}/credentials`. Either one unblocks it.

---

## 14. 🟠 Cloud browser sessions die at ~2–3 minutes, not the documented limits

Docs indicate a 2-hour cap and a 5-minute idle disconnect. Observed lifetimes, with the
browser continuously busy (never idle):

| run | tunnel open → death | what killed it |
|---|---|---|
| 1 | **102 s** | `session ended` mid-OTP-typing |
| 2 | **167 s** | `Target page, context or browser has been closed`, during add-to-cart |
| 3 | ~145 s | survived to a deliberate close |

Credits were confirmed available in all three cases. A ~2.5-minute ceiling makes any flow
involving a human step — an OTP is the obvious one — a race the user usually loses.

**Suggested:** document the real ceiling, or expose a keepalive.

---

## 15. 🟡 `browser-connect` tunnels fail roughly two attempts in three

A single `connectOverCDP` usually reports "browser has been closed" and looks like a client
bug. Racing three staggered attempts and keeping the first that opens works reliably and cut
our time-to-first-page from ~29 s to ~8 s — but callers shouldn't have to discover that.

---

## What's working well

- **Zero Touch is excellent** — `/v1/wire-run` keyless with a 300-credit per-IP trial let us
  validate the whole read path before signing up. Best onboarding of any API we looked at.
- `bb_search_products` returns exactly the right shape: `price`, `list_price`, `discount_percent`,
  `pack_weight`, `in_stock`, stable ids. Genuinely well-designed for agents.
- `GET /v1/wire/catalog/{slug}` is the best discovery endpoint on the platform — richer and more
  reliable than `resolve`.
- Browser API connects fast (3–4 s) on free tier with correctly aligned residential geo.
- `/v1/wire-run` runs `mode: "async"` actions synchronously — a big simplification.
