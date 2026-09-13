# Wire build request — Flipkart Minutes (quick commerce)

**For the Anakin team.** We reverse-engineered this flow end-to-end on 13 Sep 2026 while building for Anakin Forge. Everything below is verified working in a real browser against a real account — the URLs, marketplace ID, gating behaviour and control text are all confirmed, not guessed.

**Why it matters:** Wire currently has **no cart action for any Indian grocery retailer**. We checked bigbasket, blinkit, zepto, swiggy-instamart, jiomart, amzn-in and flipkart — only `fk_add_to_cart` exists, and it targets the regular Flipkart marketplace, which does not stock fresh dairy or produce. Quick commerce is a whole category of agent use cases that's currently unreachable.

---

## The key discovery

**Flipkart Minutes is `marketplace=HYPERLOCAL`** — not `GROCERY`. This is the single thing that unblocks everything, and it isn't documented anywhere.

| Marketplace ID | What it is |
|---|---|
| *(default)* | Regular Flipkart — parcel shipping, no fresh groceries |
| `GROCERY` | Flipkart Grocery — separate pincode gate, packaged goods |
| **`HYPERLOCAL`** | **Flipkart Minutes — 10-min delivery, fresh dairy/produce** |
| `FKT` | Flipkart Travel |

---

## Actions requested

### 1. `fkm_search_products` — search Minutes *(read, auth: none or optional)*

```
GET https://www.flipkart.com/search?q={query}&marketplace=HYPERLOCAL
```

Should return per product:

| Field | Example from a live page |
|---|---|
| `name` | "Nandini Medium Fat Paneer" |
| `pack` | "200 g" · "450-550g" · "0.95-1.05Kg" |
| `price` | 85 |
| `mrp` | 90 |
| `discount_percent` | 5 |
| `sponsored` | true for cards prefixed "AD" |
| `in_stock` | — see the caveat below |
| `product_id` / `url` | for the cart action |

⚠️ **Stock is not reliably shown in the DOM.** An item can display an Add button, be silently capped (e.g. Nandini paneer caps at qty 2), and the click then does nothing. **Please expose a real availability/max-quantity field** — it's the single hardest thing to detect from the client side and it's what forces agents into blind retry loops.

⚠️ **Products are duplicated across carousels.** The same item appears many times on one results page — we counted 120 Add buttons for ~8 distinct products. Please dedupe.

### 2. `fkm_add_to_cart` — add to the Minutes cart *(write, auth: required)*

Needs to add a product to the **Minutes/Grocery** cart specifically, which is separate from the regular Flipkart cart. The cart page shows them as distinct tabs:

```
13 Cart    Flipkart (6)    Minutes/Grocery (7)
```

Should return the updated cart, or at minimum a clear success/failure — **failure being distinguishable from "capped/out of stock"**, which is currently indistinguishable from a click that simply didn't land.

### 3. `fkm_view_cart` — read the Minutes cart *(read, auth: required)*

Returns items, quantities, prices, totals, and the delivery address. Needed for independent verification after a write. Live example:

```
5 Minutes delivery · Deliver to: Ashutosh Vats, 560102
1024, 7th Sector, 20th Cross Road, HSR Layout, Bengaluru
Free delivery unlocked · ₹50 off coupon unlocked
```

### 4. `fkm_set_delivery_address` — set the Minutes location *(write, auth: required)*

**This is the gate that blocks everything.** Minutes maintains its **own** delivery address, separate from the main Flipkart site's. Setting the main-site location does **not** propagate — we confirmed this repeatedly.

The flow:
```
1. GET /flipkart-minutes-store?marketplace=HYPERLOCAL&autoSwitchAddress=true
2. → redirects to /hyperlocal-preview-page
3. → shows "Select delivery address" + "Use my current location"
4. → clicking it lists the account's saved addresses
5. → selecting one loads the store
```

Ideally: accept a saved-address id or a pincode, set it server-side, done.

---

## What blocks automation today (in case it's useful signal)

We attempted this through Anakin's Browser API first and could not complete it. Findings:

1. **`/flipkart-minutes-store` without the query params is a marketing page** — FAQs only, no store. The real entry needs `?marketplace=HYPERLOCAL&autoSwitchAddress=true`.
2. **The Minutes store never initialises in the cloud browser.** It renders the shell, shows the address and "5 min", then sits on *"Hang on, loading content"* indefinitely — and makes **zero product API requests**. No console errors. Works instantly in a normal browser on the same account.
3. **The address picker is React Native Web** (`css-*` / `r-*` classes). It ignores `.click()`, synthetic events, and real CDP pointer events. Only genuine user input completes it.
4. **The control text is `Add`, not `Add to cart`** — the latter is used on regular Flipkart. Easy to miss.

We ultimately drove it via CDP against the user's own Chrome, where all of the above works fine — which suggests the blocking is fingerprint/environment-based rather than logical.

---

## How we're submitting this

```bash
curl -X POST https://api.anakin.io/v1/wire/build-request \
  -H "X-API-Key: $ANAKIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "website_url": "https://www.flipkart.com/flipkart-minutes-store?marketplace=HYPERLOCAL",
    "description": "Flipkart Minutes (quick commerce, marketplace=HYPERLOCAL). Need: search products, add to Minutes cart, view Minutes cart, set delivery address. Minutes keeps its own delivery address separate from the main site, gated on /hyperlocal-preview-page. Full spec in WIRE-REQUEST-MINUTES.md.",
    "actions": ["search products", "add to cart", "view cart", "set delivery address"]
  }'
```

*(`website_url` is the only confirmed-required field; the others are our best guess at the schema.)*

---

## Priority, if you can only build one

**`fkm_search_products`** — search with real prices, pack sizes and genuine stock. Reading is what agents need most, it needs no auth, and the cart can be driven in the user's own browser. A read-only Minutes action would unlock a lot on its own.
