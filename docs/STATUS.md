# Sous — Build Status

**12 Sep 2026, evening.** Working product. Web app + CLI both running.

## Run it

```bash
npm run dev      # → http://localhost:3000
npm run cli      # node run.js "palak paneer" --have oil,salt,onion --serves 2
```

## Latest verified run — 9/9 sourced, 0 missing, 19.1s, 42 credits

```
Palak Paneer Recipe (Homestyle Palak Paneer Ki Sabji) | maggi.in
have 5 · bought 9 · missing 0 · ₹270.81

  ₹  60    Maggi Masala-Ae-Magic Mixed Masala Powder · 72 g
  ₹  24.8  fresho! Palak - With Roots · 500 g
  ₹  36.4  Khetika Merta Jeera/Cumin Seeds · 100 g
  ₹  11.24 bb Royal Ginger Garlic Paste · 100 g
  ₹  11    fresho! Green Chilli - Small · 100 g
  ₹  22.77 Catch Turmeric Powder/Arisina Pudi · 100 g
  ₹  37    GRB Powder - Red Chilli · 100 g
  ₹  57.6  Desi Farms Malai Paneer · 200 g
  ₹  10    fresho! Ginger · 100 g

PACK REASONING
  - needs 250 g, smallest pack is 500 g → 250 g left over
  - needs 125 g, smallest pack is 200 g → 75 g left over
```

Earlier paneer-butter-masala run produced an **organic substitution**:
`⇄ Rasoi Tatva Garam Masala was out of stock → Aachi Garam Masala`

## Stack

**Next.js 16.3.5 (Turbopack) · React 19.3 · Tailwind v4 · Node 24, ESM**
SSE streams every real agent event to the UI as it happens. No scripted activity.

```
app/page.js           chat UI: chips, live event feed, result cards
app/api/cook/route.js SSE stream of the pipeline
src/anakin.js         Anakin adapters + disk cache (search, wire, scrape, browser)
src/pipeline.js       findRecipe → reconcile → source
src/units.js          unit conversion + pack rounding (honest fallbacks)
src/synonyms.js       recipe language → Indian retail terms
run.js                CLI
cache/                cached API responses — dev without burning credits
```

## What works

| Stage | Status |
|---|---|
| Find recipe (`/v1/search`, param is **`prompt`** not `query`) | ✅ |
| Read recipe — Allrecipes via Wire, **any site via JSON-LD** | ✅ Indian sites work (maggi.in, hebbarskitchen) |
| Parse ingredients — ranges, slashes, fractions, count words | ✅ |
| Scale by servings | ✅ |
| Pantry reconcile + staple exclusion + duplicate merge | ✅ |
| Source real SKUs (`bb_search_products`) | ✅ |
| **Pack rounding** — "needs 125 g, pack is 200 g → 75 g left over" | ✅ |
| **Substitution on out-of-stock** | ✅ fires organically |
| Live SSE event stream | ✅ |
| Cart fill | ⛔ deferred — see `PIVOT.md` |

## Parser cases handled (all verified)

```
"200 to 250 grams paneer"          → 200 g paneer
"2 cups/300 grams or 4 to 5 medium-sized tomato" → 2 cup tomato
"1 teaspoonful cumin seeds"        → 1 tsp → jeera
"2 units green chillies"           → green chilli
"1 inch ginger" / "4 cloves garlic"→ ginger / garlic
"⅓ cup hot water"                  → [staple, excluded]
"2 to 3 tbsp light cream"          → fresh cream
"250 g spinach"                    → palak
```

## Bugs fixed this session
- Lip-crayon match (`half-and-half` → Matte Lip Crayon ₹299) — non-food category filter + zero-overlap rejection
- **Cache poisoning** — failures/empties were cached, permanently breaking later runs
- BigBasket 500s under fan-out — concurrency capped at 3, retry with backoff
- Range/slash/fraction quantities, hyphenated words, `or`-alternatives
- Count words leaking into search terms
- Bottled water being added to the basket
- ESM/CJS conflict under Turbopack; `import.meta.dirname` undefined → read key from `process.env` with file fallback

## Known gaps
1. **No cart fill** — BigBasket blocks Anakin's browser (see `PIVOT.md`). Basket is honestly labelled "plan, cart not filled".
2. Occasional BigBasket empty responses → retries cost credits (~30-40/run).
3. Equipment chips are collected but not yet used to filter recipes.
4. No LLM in the loop — all matching is deterministic. Works well; an LLM would improve edge-case SKU choice.

## Next
1. Recipe steps panel + equipment filtering
2. Deep-link "open all in BigBasket" as the honest act
3. Demo recording + README
4. Cart fill (deferred — decide Flipkart vs plan-only)

## Credits
~210 of 300 used on the primary account. Keyless pool ~288 (per-IP). 3 spare teammate accounts.
