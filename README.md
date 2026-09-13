# Sous

**Tell it what you feel like eating. It fills your grocery cart. You pay.**

Built for [**Anakin Forge**](https://anakin.io/hackathon/anakin-forge), 7–14 September 2026.

An agent that **browses** the live web, **thinks** about what your kitchen already
contains, and **acts** on a real retailer — then stops at the cart, because buying is
yours to authorise.

> 📖 Every claim here is backed by a real run. The full engineering write-up is in
> **[DETAILS.md](DETAILS.md)**.

---

## The problem

You're hungry and you half-know what you want. You do **not** know which of the
seventeen things a recipe lists you already own — and you're not going to stand in the
kitchen cross-referencing a food blog against your own shelves.

So you order in, or you buy things you already have.

---

## The flow

```
  you ─── "something with paneer around ₹200"
   │        + tick what's in your kitchen
   ▼
┌─────────────────────────────────────────────────────────────────┐
│ BROWSE                                       Anakin Search      │
│   8–10 search angles — dry sabzi, gravy, grilled, budget…       │
│   46 distinct pages found                                       │
│                                              Anakin URL Scraper │
│   ~16 read in parallel → schema.org Recipe JSON-LD              │
└─────────────────────────────────────────────────────────────────┘
   ▼
┌─────────────────────────────────────────────────────────────────┐
│ THINK                                     rules + model + code  │
│   what do you ALREADY have?        "you have 5 of 14"           │
│   what does the dish REALLY need?  scaled, merged, rounded      │
│   what will it cost?               fresh vs pantry, split out   │
│   hitting a protein target?        read from the recipe, free   │
│   5 dishes — different dishes, styles AND sites                 │
└─────────────────────────────────────────────────────────────────┘
   ▼  you pick one
┌─────────────────────────────────────────────────────────────────┐
│ ACT                                              Anakin Wire    │
│   find the real product · pid · price · stock                   │
│                                            Anakin Browser API   │
│   add it to your real Flipkart cart                             │
│   ── then READ THE CART BACK. A click is never evidence. ──     │
└─────────────────────────────────────────────────────────────────┘
   ▼
  STOP.  You open Flipkart and pay. The agent never pays, and never could.
```

Every line in the activity feed is a real API call. **Nothing is scripted.**

---

## How it uses Anakin

| Product | What it does here |
|---|---|
| **Search API** | Finds recipe pages across 8–10 query angles per craving |
| **URL Scraper** | Reads ~16 of them in parallel, 5 at a time, JSON-LD out the other side |
| **Wire** | Turns *"garam masala"* into a real listing — `product_id`, `listing_id`, price, and on Minutes, **live stock** |
| **Wire · Build Studio** | **Four Flipkart Minutes actions Anakin built at our request, during the hackathon** |
| **Browser API** | A cloud Chrome that signs in and performs the add — nothing runs on your machine |

### The four Minutes actions we commissioned

Wire had **no cart action for any Indian grocery retailer** — we checked bigbasket,
blinkit, zepto, swiggy-instamart, jiomart, amzn-in and flipkart. So we reverse-engineered
the Minutes flow ([the request we filed](docs/WIRE-REQUEST-MINUTES.md)) and Anakin built it:

| Action | `auth_mode` | What it unlocked |
|---|---|---|
| `act_flipkart_com_set_delivery_address` | `none` | The pincode gate, in one call instead of a human tap |
| `act_flipkart_com_list_products` | `none` | **`available_quantity`** — real stock, *before* we try to add |
| `act_flipkart_com_add_to_cart` | `none` | The add itself |
| `act_flipkart_com_view_cart` | `none` | Independent verification |

**`available_quantity` is the field that made this work.** In a browser it is invisible:
an out-of-stock item still renders an Add button, the click silently does nothing, and
the only symptom is a cart badge that doesn't move. Reading stock *first* replaced hours
of blind retry loops.

**The key discovery, documented nowhere:** Flipkart Minutes is `marketplace=HYPERLOCAL`,
not `GROCERY`. That one parameter is the whole trick, and it cost us a day.

---

## Wire decides. The browser acts.

This split is deliberate, and we want to be precise about it because it's the part a
judge should be able to verify.

**Cupboard restock — `flipkart` catalogue, the main marketplace**

```
Wire  fk_search_products ──→ 10 listings, with pid + listing_id
model ──→ "picked #4 — plain garam masala; simplest direct match
           over whole/sabut or super variants"
Browser API ──→ opens the product page, clicks Add to cart
Browser API ──→ reads the cart back
```

Wire's own `fk_add_to_cart` is `auth_mode: required`, and we could not make it work —
not because of the OTP (we passed that fine), but because Anakin's `save_session` never
persists an authenticated cookie jar, so the credential always replays a logged-out
session and Flipkart answers HTTP 400. That's issues **#12–13** in
[ANAKIN-BUG-REPORT.md](ANAKIN-BUG-REPORT.md), with the evidence.

So: **Wire chooses the product; the cloud browser performs the click.** Both halves are
Anakin. Nothing runs on your machine.

**Quick commerce — `flipkart-com` catalogue, Minutes**

Here the Wire actions are `auth_mode: none` and the full chain is **verified working**:

```json
add_to_cart  → {"items":[{"product_id":"PTFF4M3EEPVVKDUG","quantity":1,
                          "present_in_cart":true,"error":null}]}
```

Because they need no auth, they reach an **anonymous** cart — ideal for checking stock,
but not the cart you personally open and pay from. So for the user-facing Minutes flow we
ship a **Chrome extension, loaded via Developer Mode**, which takes the plan the agent
produced and adds those items to the Minutes cart inside the user's own signed-in session.
Their login never leaves their machine.

**This is a stopgap, not an architecture.** `act_flipkart_com_add_to_cart` already does
this in one call — we've run it. The moment those actions exist in an
account-authenticated form, the extension deletes itself and the whole flow is pure Wire,
no browser at all. **4 credits per ingredient, no login, no session limit.**

---

## The thinking is the hard part

Finding a recipe is easy. Deciding what you actually need to buy is not:

| The recipe says | Your kitchen has | Sous says | Why |
|---|---|---|---|
| 1 large white onion | onion | ✅ covered | Size and knife-work don't change what you buy |
| 2 green chillies | chilli powder | 🛒 buy | A processed item never covers a whole one |
| 1 tsp coriander powder | garam masala | ✅ covered | The blend contains the ground spice |
| 2 bay leaf, 1" cinnamon | garam masala | 🛒 buy | Whole spices are tempered in fat; powder can't |
| 2 tbsp coriander leaves | garam masala | 🛒 buy | It has coriander *seed*, not the leaves |
| 6 garlic **cloves** | garam masala | 🛒 buy | Those cloves are garlic, not the spice |

**The model judges; code computes.** A model decides whether *ginger* covers
*ginger-garlic paste*. Code does every number — scaling, pack rounding, totals — because
models shouldn't do arithmetic and regexes shouldn't make judgement calls.

And the model is **not trusted**. Its plan is merged into the rules' plan, never
substituted for it:

| The model does | What happens |
|---|---|
| Forgets an ingredient | The rules' verdict stands |
| Invents an ingredient | Dropped — *"not in the recipe, ignored: chaat masala"* |
| Says buy something you **told us** you have | Refused. Your kitchen is not the model's to overrule |
| Claims coverage with no reason | Refused unless the reason names something you own |

Every override is reported live in the activity feed. **64 tests** pin this behaviour.

---

## Eating to a target, not just to a craving

Plenty of people don't shop by craving — they shop to a **protein target**. Gym, recovery,
diabetes, pregnancy, a doctor's instruction. *"100g protein under ₹600"* is a real
sentence, and Sous answers it as one constraint, not two keywords:

```
> 100g protein under 600

plan     read that as: paneer · high protein
search   8 angles · 40 distinct pages · 16 read, 14 usable
protein  a serving: 47 g, 21 g, 18 g, 15 g, 4 g · 3 servings of the best reaches 100 g
budget   5 of 5 cook for under ₹600

 47 g · 47%   Fish Fry              ≈ ₹117 to cook   foodnetwork.com
 21 g · 21%   Dahi Chicken Curry    ≈ ₹ 95 to cook   whiskaffair.com
 18 g · 18%   Kerala Soya Roast     ≈ ₹147 to cook   hebbarskitchen.com
 15 g · 15%   Egg Bhurji            ≈ ₹122 to cook   thekitchn.com
  4 g ·  4%   Moong Dal Chilla      ≈ ₹ 83 to cook   vegrecipesofindia.com
```

**The protein number is never invented.** Of 99 recipe pages we'd scraped, **81 publish
`nutrition.proteinContent`** in the JSON-LD we were already reading — so it costs no extra
call and no model guess. Where a site doesn't publish it, the card says **"protein not
published"** rather than making a number up. On a health constraint, a confident wrong
figure is worse than an honest gap.

- **The goal is parsed before the price.** Otherwise *"100g protein under ₹600"* hands the
  100 to the budget parser and plans a hundred-rupee dinner.
- **Nothing is hardcoded about what protein is.** The planner knows paneer, chicken, fish,
  eggs and soya are where it comes from, and spreads the search across them.
- **Veg / non-veg is respected** when you say it, and you get both when you don't.
- It tells you **how many servings reach your goal** — one dish rarely does.

Two real failures this exposed, both fixed: the relevance gate demanded the craving appear
in the recipe, but for a protein request the "ingredient" is a **goal, not a food** — it
threw away 9 of 12 pages including a 35 g fish curry. And protein queries kept returning
listicles (*"15 best high-protein recipes"*) which carry no recipe markup at all. Usable
pages went from **3 of 12 to 14 of 16**.

## …and it buys the right amounts

A shopping list is useless if the quantities are wrong. All of this is arithmetic, so
**code does it, never the model**:

| | |
|---|---|
| **Scaled to your table** | Recipe serves 4, you're cooking for 2 — every quantity halves |
| **Merged before rounding** | Garam masala in the marinade *and* the gravy is one line, summed first. Round each separately and you buy two jars |
| **Counts round up** | Half a bay leaf isn't a thing. You cannot buy a quarter of a cinnamon stick |
| **Cooks' fractions** | Spoons snap to quarters and render as `1½ tbsp`, not `1.473 tbsp` |
| **Pack reality, stated** | `needs 250 g, smallest pack is 500 g → 250 g left over` |

That last line is from a real run. The agent doesn't pretend a 500 g pack is 250 g of
spinach — it tells you what you'll have left, so the number on the card is the number at
checkout.

## Five things that actually happened

Not staged. Each came out of a real run.

**1. It reasons about your kitchen, per ingredient**
> *"tomato puree ¼ cup — Fresh tomato does not cover tomato puree in this recipe."*

**2. It recovers when the shelf is empty**
> *"Rasoi Tatva Garam Masala was out of stock → Aachi Garam Masala"*

**3. It knows stock before it clicks**
> *"Desi Farms Low Fat Paneer ₹65 — 0 in stock, skipped"*

**4. It catches reality disagreeing with the plan**
The agent asked for **one** garam masala. Flipkart enforced `Minimum Order Quantity: 2`
and set the quantity itself. **The agent knew** — because it read the cart back instead
of believing its own click:
> `EVEREST Garam Masala · 100 g · Qty: 2 · ₹266 · Minimum Order Quantity: 2`

**5. It learns what it has never met**
Ingredients the agent doesn't know are looked up once and remembered forever —
**230 so far**, with real prices. Asking for eggs once priced `coconut milk` at ₹34 by
inheriting *milk*'s price. Now an unknown returns **no price** rather than a confident
wrong one, and the real answer came back at ₹77.

---

## Honesty rules the code follows

- A successful fetch means content was *retrieved*, not that it's correct
- Failures and empty responses are **never cached** — a poisoned cache silently breaks every later run
- Partial is partial: *"12 of 16 added"* is never reported as success
- Unknown stays unknown — an unconvertible unit never becomes a confident number
- `≈ ₹366` means estimated; a price without `≈` means **every line came from a price we actually saw**
- Running out of credits is reported as an empty wallet, never as an empty internet
- **The agent stops at a filled cart. It never pays, and it never could**

---

## Run it

```bash
npm install
echo "ANAKIN_API_KEY=ask_..." > .env      # free key: https://anakin.io/signup
npm run dev                                # → http://localhost:3000
npm test                                   # 64 tests, no network needed
```

`OPENAI_API_KEY` turns on the model reasoning path. **It runs fine without one** — every
judgement has a deterministic fallback, which is what the test suite pins.

**Stack:** Next.js 16 (Turbopack) · React 19 · Tailwind v4 · Node 24, ESM.
Every route is SSE, so the UI shows the agent working rather than a spinner.

---

## What we found in Anakin's API

We built against it hard for a week and filed
**[15 reproducible issues](ANAKIN-BUG-REPORT.md)**, with repro commands — including
`save_session` never persisting (#12), `fk_add_to_cart` being unusable as a consequence
(#13), cloud sessions dying at ~2.5 minutes rather than the documented limits (#14), the
`catalog=` filter on `/v1/wire/resolve` being silently ignored (#4), and `/v1/search`
taking `prompt` rather than the documented `query` (#9).

We also corrected our own assumptions when live calls disproved them —
[EMPIRICAL-TESTS.md](docs/EMPIRICAL-TESTS.md) overrides our own reference document
wherever the two disagree.

**What works exceptionally well:** Zero Touch onboarding, `bb_search_products`' response
shape, `GET /v1/wire/catalog/{slug}` as a discovery endpoint, and `/v1/wire-run` running
`async` actions synchronously.

---

## Limitations, stated plainly

- Flipkart Minutes is live in limited pincodes; outside them, stock reads empty
- The Minutes cart fill currently runs through our Chrome extension, because the
  no-auth Wire cart is anonymous — see [above](#wire-decides-the-browser-acts)
- Anakin's cloud browser sessions die at ~102–167s, which caps one signed-in run at
  roughly 4–5 items
- Recipe photos are whatever the source site published — occasionally a stock image
- Equipment (*"I have no oven"*) is collected but doesn't yet filter recipes

---

## Documentation

| | |
|---|---|
| **[DETAILS.md](DETAILS.md)** | The full engineering write-up — variety, budget, protein, the brain |
| [DEMO-RUNBOOK.md](DEMO-RUNBOOK.md) | The verified end-to-end run, with timings |
| [ANAKIN-BUG-REPORT.md](ANAKIN-BUG-REPORT.md) | 15 issues found while building |
| [MINUTES-WIRE.md](MINUTES-WIRE.md) | The four Build Studio actions and their real responses |
| [docs/EMPIRICAL-TESTS.md](docs/EMPIRICAL-TESTS.md) | Real executed API calls |
| [docs/PIVOT.md](docs/PIVOT.md) | Why this stopped being a BigBasket product |
| [ANAKIN-REFERENCE.md](ANAKIN-REFERENCE.md) | Master reference, compiled from live fetches |

---

**Browse. Think. Act. Then stop, and let the human pay.**
