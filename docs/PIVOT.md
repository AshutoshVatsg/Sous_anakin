# Pivot: BigBasket → Flipkart for the act path

**12 Sep 2026, from live browser tests.**

## What happened

**BigBasket blocks Anakin's cloud browser.** It loaded once early on, then failed 3/3 across different residential exit IPs (Jio/Kolkata, Airtel, Airtel/Pune), serving *"This page doesn't exist. Uh-oh! Looks like this page took a wrong turn."* — a soft block, not a real 404.

**Critically: `bb_search_products` (Wire) still works perfectly.** Anakin's scraping infrastructure gets through; the CDP browser does not. So BigBasket **reading is fine, browser-driving is not** → **no cart on BigBasket.**

## What still works

| Site | Cloud browser | Verdict |
|---|---|---|
| **Flipkart** | ✅ loads, 52 KB, "Login / Sign Up / Select delivery location" | **usable** |
| **Blinkit** | ✅ loads, 13 KB | usable (but no price, no cart) |
| Zepto | ⚠️ timeout | no |
| **BigBasket** | ❌ soft-blocked 3/3 | **read-only** |

## Flipkart closes the loop

`fk_search_products` (with key, `pincode` supported) returns **`pid` AND `listing_id`** — exactly the two required params of `fk_add_to_cart`:

```json
{"pid":"PTFH9GRCNXT6H3VY","listing_id":"LSTPTFH9GRCNXT6H3VYPBLOJJ",
 "title":"Sudha Paneer","url":"https://www.flipkart.com/sudha-paneer/p/itm6bc18949b4e39"}
```

Full chain, all Wire API, no browser needed at runtime:
```
fk_search_products (pid + listing_id) → fk_add_to_cart → fk_view_cart (verify)
```

## The trade-off

| | BigBasket | Flipkart |
|---|---|---|
| price / list_price / discount | ✅ | ❌ not in search |
| `pack_weight` | ✅ `"200 g"` | ❌ |
| `in_stock` | ✅ | ❌ |
| `pid` + `listing_id` for cart | ❌ | ✅ |
| pincode binding | ❌ | ✅ |
| **cart + readback** | ❌ blocked | ✅ |

**Flipkart search is thin** — pid, listing_id, title, rating only. Price likely needs an extra `fk_product_details` call per ingredient (+1 call, +credits, +latency).

## Recommendation

**Go Flipkart end-to-end.** Mixing retailers (source on BigBasket, cart on Flipkart) is incoherent — different SKUs, different prices, and the cart wouldn't match what was shown.

Accept the thinner data. The demo beats survive:
- ✅ real products, real cart, real readback
- ✅ substitution on failure (the money beat) — trigger on add-to-cart failure instead of `in_stock: false`
- ⚠️ **pack-size reasoning is lost** unless `fk_product_details` returns weight — *"needs 150 g, pack is 200 g"* was a strong beat; test whether it can be recovered

## Remaining blocker

`fk_add_to_cart` / `fk_view_cart` are `auth_mode: required`. Flipkart catalog says `auth_type: "cookie"`, `auth_types: ["browser_state"]` → needs a logged-in browser's cookies.

**Since Flipkart loads fine in the cloud browser, this should work** — unlike BigBasket. Flow:
1. CDP connect with `?save_session=flipkart`
2. Navigate to Flipkart login, enter phone number
3. **User reads OTP from their phone**
4. Enter OTP → verify logged in → clean disconnect (session saves)
5. Register as a Wire identity via `POST /v1/wire/login` with `catalog_slug: "flipkart"`

**Needs the user's phone number and OTP. Untested.**

## Fallback if Flipkart login fails

**Path C — BigBasket, plan only.** Already fully working (`node run.js`). Rich data, honest label: *"purchase plan prepared; retailer cart has not been filled."* Weaker "act", but zero risk and shippable now.
