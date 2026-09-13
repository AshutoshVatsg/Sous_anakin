# Empirical Test Log — live Anakin API calls

**Run 12 September 2026, keyless (no API key), from the project machine.**
These are *executed calls*, not documentation claims. First real validation this project has.

---

## T1 — `/v1/wire/resolve` works keyless ✅

`GET https://api.anakin.io/v1/wire/resolve?q=add%20to%20cart` → 200, real results.

### ⚠️ The documented response schema is WRONG

Docs say:
```json
"params": [ {"name":"","type":"","required":true,"default":null,"description":""} ]
```

Actual response:
```json
"params": { "required": [ {...} ], "optional": [ {...} ] }
```

`params` is an **object with `required[]` and `optional[]` arrays**, not a flat array.

Also **absent** from the live resolve response despite being documented: `name`, `description`, `mode`, `auth_mode`, `catalog_name`, `catalog_slug`.
Also **present** but undocumented: `auth_satisfied`, `catalog` (not `catalog_slug`), and a top-level `next` hint string.

Live shape:
```json
{"next":"POST /v1/wire/task with {action_id, params}",
 "results":[{"action_id":"...","auth_required":true,"auth_satisfied":null,
             "catalog":"...","credits":1,
             "params":{"required":[...],"optional":[...]}}]}
```

**Any parser written against the documented schema will break.**

## T2 — ⚠️⚠️ The `catalog` filter on resolve is SILENTLY IGNORED

`GET /v1/wire/resolve?q=cart&catalog=blinkit` returned actions from **blueridgeknives, dumco, immayasports** — nothing from Blinkit. No error, no warning.

`GET /v1/wire/resolve?q=product&catalog=blinkit` returned **producthunt, williams-sonoma, blueridgeknives**.

`GET /v1/wire/resolve?catalog=blinkit` (no `q`) → `{"error":{"code":"BAD_REQUEST","message":"q parameter is required"}}`

**Conclusions:** `q` is mandatory; `catalog` does nothing. A "dynamic Wire agent" cannot scope discovery to a site via resolve. **Use `GET /v1/wire/catalog/{slug}` instead** — it is far richer and actually works (see T3).

## T3 — `/v1/wire/catalog/{slug}` is the superior discovery endpoint ✅

Returns per action: `id`, `action_id`, `catalog_id`, `name`, `description`, `tags[]`, **`type` (`read`/`write`)**, **`mode`**, **`auth_mode`**, `auth_required`, `parameters[]` (with `description` and `default` per param), **`credits_per_call`**, `premium`, `wheel_version`, `status`, `created_at`, `updated_at`.

This has everything resolve was supposed to have, plus `type`, `tags`, and versioning. **Build tool discovery on this endpoint, not resolve.**

## T4 — ⚠️ Zero Touch is NOT unlimited — it's a 300-credit per-IP pool

Actual response tail from a keyless `/v1/wire-run`:
```json
"credits_used": 1,
"trial": { "message": "Keyless free tier — sign up free for 300 credits and your own key.",
           "remaining_credits": 298,
           "signup_url": "https://anakin.io/signup?source=keyless" }
```

**Corrects my own earlier claim that Zero Touch is free/unlimited.** It is a separate 300-credit pool keyed to the IP. Useful — it roughly doubles the effective budget to ~600 — but it is finite, shared by anyone on the same IP, and burns down during development.

## T5 — Zero Touch executes `mode: "async"` actions synchronously ✅

`POST /v1/wire-run` with `bli_product_details` (declared `mode: "async"`) returned `{"job_id": "...", "status": "completed", "data": {...}}` **inline, in one call**. No polling needed.

Big simplification: read actions can be treated as synchronous through `wire-run`.

---

## T6 — Blinkit: ARCHITECTURE.md §4 is CONFIRMED CORRECT ✅

`GET /v1/wire/catalog/blinkit` → **9 actions: 4 typed `read`, 5 typed `write`. All `auth_mode: "none"`. No cart action.**

The 5 `write`-typed actions and their own descriptions:

| action_id | type | What its description actually says |
|---|---|---|
| `act_blinkit_post_listing_widgets` | **write** | "Returns a category's product listing with cards" |
| `act_blinkit_post_product_detail` | **write** | "Returns product detail with name…" |
| `act_blinkit_product_listing_page1` | **write** | "Returns paginated category products…" |
| `act_blinkit_post_layout_search` | **write** | (search) |
| `act_blinkit_listing_widgets` | **write** | (listing) |

**Every `write`-typed Blinkit action is a read.** The `type` field reflects the **HTTP method (POST)**, not state mutation. The architecture document's claim — *"Several operations called 'write' on the page merely describe retrieving listings or product details. The page lists no add-to-cart operation"* — is **empirically verified**.

### Blinkit `bli_product_details` — executed
Pincode→store resolution **works**: `pincode: "560055"` → `merchant_id: "31277"`. Returns `title`, `brand`, `weight`, `quantity`, `description`, `key_specs`, **`in_stock`**, `category`, `lat`/`lon`.

⚠️ **But the only price field is `mrp`, and it returned `null`.** No selling price, no offer price, no discount field exists in the response at all.

**Blinkit = location binding + stock, NO usable price, NO cart.**

## T7 — BigBasket: §4 CONFIRMED CORRECT, but pricing is excellent ✅

`GET /v1/wire/catalog/bigbasket` → **4 actions, all `type: "read"`, all `auth_mode: "none"`.** No cart. Confirms the document.

### `bb_search_products` — executed (`query: "paneer"`)
Returned `total_count: 266`, 40 products/page, 7 pages. Per product:

```json
{"id":"40215943","name":"Paneer","brand":"Verka","brand_slug":"verka",
 "url":"https://www.bigbasket.com/pd/40215943/verka-paneer-200-g-pouch/",
 "price":90.0,"list_price":90.0,"currency":"INR","discount_percent":null,
 "pack_desc":"Pouch","pack_weight":"200 g","in_stock":true,
 "category":{"tlc_name":"Bakery, Cakes & Dairy","llc_name":"Paneer, Tofu & Cream"}}
```
Second result showed a real discount: `price: 72.0, list_price: 80.0, discount_percent: 10.0`.

**This is exactly what whole-pack budgeting needs: selling price + list price + discount + `pack_weight` + `in_stock` + stable product id + URL.** 2 credits/call.

⚠️ **No delivery-location parameter.** Params are only `query`, `category`, `brand`, `page`. `bb_product_details` takes only `product_url`. The architecture's concern — *"the displayed search/detail parameter schemas do not establish delivery-location binding"* — is **confirmed**.

**BigBasket = great prices + pack sizes + stock, NO location binding, NO cart.**

## T8 — 🔴 THE DOCUMENT MISSED THIS: Flipkart has a real cart pair

The architecture only checked Blinkit and BigBasket. Surveying further:

| Catalog | Cart action? |
|---|---|
| zepto | No — product detail/listing/cross-sell only |
| swiggy-instamart | No — 2 read actions |
| dmart | **Not in catalog** (empty) |
| jiomart | No — brands/categories/product_details/search |
| amazon | No cart found in action list |
| **flipkart** | ✅ **`fk_add_to_cart` + `fk_view_cart`** |

### `fk_add_to_cart`
```
type: "write" · mode: "async" · auth_mode: "REQUIRED" · credits_per_call: 3
description: "Adds a product to the authenticated user's cart and returns the updated cart."
params: product_id (req), listing_id (req), quantity (opt), price (opt)
```

### `fk_view_cart`
```
type: "read" · mode: "async" · auth_mode: "REQUIRED" · credits_per_call: 1 · wheel v1.1.0
description: "Returns the authenticated user's cart with items, quantities, prices, and totals."
params: pincode (optional)
```

**This is a genuine write + independent-readback pair** — precisely the architecture's §10 requirement *"Items added to the retailer cart and verified by readback."* `fk_view_cart` even accepts `pincode`.

**The blocker:** both are `auth_mode: "required"` → needs a Wire identity for Flipkart. Flipkart login in India is typically **OTP-based**, and Anakin explicitly does not bypass MFA.

**🔴 TESTED 13 Sep — BLOCKED, and not by the OTP.** We passed the OTP fine: Flipkart
authenticated inside Anakin's cloud browser twice, confirmed by the account name in the header.
The wall is one layer lower down:

```
POST /v1/wire-run {"action_id":"fk_view_cart","params":{},"identity_name":"flipkart"}
-> {"status":"failed","error":"[scraper_error] Failed to fetch cart: HTTP 400"}
```

Empty params, so it isn't a parameter problem. The identity's `browser_state` credential was
imported from saved session `0c0be0ab-…`, whose cookie jar is **frozen at its 19:04 creation —
14 cookies** — and stayed at 14 through two successful logins *and* a deliberate clean
`browser.close()`. `save_session` never writes. And the credential can't be supplied directly:

```
POST /v1/wire/identities/{id}/credentials {"credential_type":"browser_state","data":{}}
-> 400 "browser_state credentials are created via the connect flow, not this endpoint"
```

So Wire replays a logged-out session and always will. See ANAKIN-BUG-REPORT.md §12–13.
**The authenticated cart write has to come from the held cloud-browser connection**
(`src/cloudcart.js`), not from Wire.

---

## Summary — what these tests establish

| Claim | Verdict |
|---|---|
| Blinkit has no cart; its "write" badge is meaningless | ✅ **Architecture doc correct** |
| BigBasket has no cart, no location binding | ✅ **Architecture doc correct** |
| Real pack prices + pack sizes + stock are obtainable, keyless | ✅ **Better than the doc assumed** (BigBasket) |
| No Indian quick-commerce cart exists in Wire | ✅ Confirmed across 6 catalogs |
| **A working cart+readback pair exists on Flipkart** | 🔴 **The doc missed it** — but auth-gated |
| Documented resolve schema | ⚠️ **Wrong** |
| `catalog` filter on resolve | ⚠️ **Silently broken** |
| Zero Touch unlimited | ⚠️ **False — 300/IP pool** |

**No grocery retailer in Wire offers price + delivery-location binding + cart simultaneously.** Blinkit has location+stock but no price. BigBasket has price+packs but no location. Flipkart has a cart but requires OTP login.
