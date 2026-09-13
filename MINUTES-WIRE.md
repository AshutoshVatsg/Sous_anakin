# Flipkart Minutes via Wire — WORKING

**13 Sep 2026.** Anakin built the Minutes actions we requested. **The entire quick-commerce flow now runs through Wire — no browser, no login, no location gate.**

Catalog slug: **`flipkart-com`** (not `flipkart-minutes-store`). Distinct from the older `flipkart` catalog.

## The four actions — all `auth: none`, 1 credit each

| Action | Type | Params |
|---|---|---|
| `act_flipkart_com_set_delivery_address` | write | `pincode*`, `address_line1`, `city`, `state`, `latitude`, `longitude` |
| `act_flipkart_com_list_products` | read | `product_id*`, `listing_id*`, `page_uri` |
| `act_flipkart_com_add_to_cart` | write | `product_id*`, `listing_id*`, `quantity` |
| `act_flipkart_com_view_cart` | read | `product_id*`, `listing_id*`, `quantity` |

## Verified responses

### set_delivery_address — solves the gate that blocked us all day
```json
{"delivery_address":{"pincode":"560102","address_line1":"1024, 7th Sector, 20th Cross Road, HSR Layout",
 "city":"Bengaluru","state":"Karnataka","latitude":12.9765944,"longitude":77.5992708},"status":"updated"}
```
No `hyperlocal-preview-page`, no React Native Web address picker, no human tap. One call.

### list_products — includes the stock field that was invisible in the DOM
```json
{"product_name":"Amul Malai Paneer",       "price":100,"currency":"INR","available_quantity":3, "availability":"IN_STOCK",
 "product_id":"PTFFSFHZPJ9AHZGT","listing_id":"LSTPTFFSFHZPJ9AHZGTGKKB32"}
{"product_name":"Milky Mist Paneer",       "price":95, "available_quantity":10,"availability":"IN_STOCK", ...}
{"product_name":"Desi Farms Low Fat Paneer","price":65, "available_quantity":0,  ...}
```

**`available_quantity` is the single most valuable field here.** In the browser this was invisible — an item showed an Add button, the click silently did nothing, and the only way to detect it was watching the cart badge fail to change. Now it's readable *before* attempting the add. Desi Farms showing `0` is exactly the case that caused hours of blind retry loops.

### add_to_cart — the real thing
```json
{"items":[{"listing_id":"LSTPTFF4M3EEPV...","product_id":"PTFF4M3EEPVVKDUG",
           "quantity":1,"present_in_cart":true,"error":null}]}
```

### view_cart — independent verification
```json
{"items":[{"product_id":"...","present_in_cart":false,"error":"Product is now out of stock."}],
 "item_count":0,"price":0,"total_cost":0,"added":false}
```
Note it distinguishes *"out of stock"* from a generic failure — which is what the browser path never could.

## What this replaces

Everything below is now unnecessary:

| Was needed | Now |
|---|---|
| Local Chrome with `--remote-debugging-port` | ❌ not needed |
| Flipkart OTP login + saved browser session | ❌ not needed (`auth: none`) |
| `hyperlocal-preview-page` address gate, tapped by a human | ✅ one API call |
| Guessing stock from a failed cart-badge update | ✅ `available_quantity` |
| Deduping 120 Add buttons across carousels | ✅ clean product list |
| React Native Web pointer-event fights | ❌ gone |

## Gotchas

1. **`list_products` requires `product_id` and `listing_id`** despite being a "list" action — pass any valid Minutes pid/lid and it returns the surrounding product list. Slightly odd ergonomics; a pure `query` param would be better.
2. **Flipkart's cart API rate-limits hard.** `add_to_cart` and `view_cart` both hit `HTTP 429 from 1.rome.api.flipkart.com/api/5/cart/browse` under repeated calls. Ours succeeded on the 3rd attempt with 45s backoff. **Production code must back off** — 429 is not a failure, it's "wait".
3. Set the delivery address **first** — everything else is location-scoped.

## Working sequence

```
1. act_flipkart_com_set_delivery_address   (pincode 560102)
2. act_flipkart_com_list_products          → products + available_quantity
3. pick one with available_quantity > 0    ← no more blind retries
4. act_flipkart_com_add_to_cart            (with backoff on 429)
5. act_flipkart_com_view_cart              → verify independently
```

**4 credits per ingredient, no browser, no auth.**
