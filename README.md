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
