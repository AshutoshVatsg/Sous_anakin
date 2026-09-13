# Sous

**Say what you feel like eating. It reads the web, checks your kitchen, and fills your grocery cart. You pay.**

An agent built for [**Anakin Forge**](https://anakin.io/hackathon/anakin-forge) — it
**browses** live recipe sites, **thinks** about what your kitchen is missing, and **acts**
on a real retailer. Then stops, because buying is yours to authorise.

`Next.js 16` · `React 19` · `Node 24` · **64 tests passing** · [Full write-up →](DETAILS.md)

---

## The problem

Between *"I want something good tonight"* and eating it:

```
find a dish  →  open 5 tabs  →  read 17 ingredients  →  go check the cupboards
             →  work out what's ACTUALLY missing  ←  the hard bit
             →  type each one into a grocery app, guessing pack sizes
             →  buy turmeric you already had  →  forget the kasuri methi
```

**Forty minutes of admin for one dinner.** So people order in, or cook the same three
dishes forever. Recipe apps have a curated catalogue. Grocery apps don't know what a dish
needs. Nutrition apps count but don't shop. A chatbot writes you a list and leaves you
all seven chores.

Joining them up isn't an app feature — it needs something that can read the live web,
reason about *one specific kitchen*, and act on a retailer. **That's an agent.**

---

## The flow

```
  you ─── "something with paneer around ₹200"   + tick what's in your kitchen
   ▼
┌──────────────────────────────────────────────────────────────────┐
│ BROWSE                                          Anakin Search    │
│   8–10 query angles — dry sabzi, gravy, grilled, budget…         │
│   46 distinct pages found                   Anakin URL Scraper   │
│   ~16 read in parallel → schema.org Recipe JSON-LD               │
└──────────────────────────────────────────────────────────────────┘
   ▼
┌──────────────────────────────────────────────────────────────────┐
│ THINK                                      rules + model + code  │
│   what do you ALREADY have?      "you have 5 of 14"              │
│   what does it REALLY need?      scaled, merged, rounded up      │
│   what will it cost?             fresh vs pantry, split out      │
│   hitting a protein target?      read from the recipe, free      │
│   → 5 dishes across 5 styles AND 5 sites                         │
└──────────────────────────────────────────────────────────────────┘
   ▼  you pick one
┌──────────────────────────────────────────────────────────────────┐
│ ACT                                               Anakin Wire    │
│   the real listing · product_id · price · live stock             │
│                                             Anakin Browser API   │
│   add to your real Flipkart cart                                 │
│   ── then READ THE CART BACK. A click is never evidence. ──      │
└──────────────────────────────────────────────────────────────────┘
   ▼
  STOP.  You open Flipkart and pay. The agent never pays, and never could.
```

Every line in the activity feed is a real API call. **Nothing is scripted.**

---

## How it uses Anakin

| Product | What it does here |
|---|---|
| **Search API** | Recipe pages across 8–10 query angles per craving |
| **URL Scraper** | ~16 read in parallel, 5 at a time → JSON-LD |
| **Wire** | *"garam masala"* → a real listing: `product_id`, `listing_id`, price, **live stock** |
| **Wire · Build Studio** | **Four Flipkart Minutes actions Anakin built at our request, mid-hackathon** |
| **Browser API** | Cloud Chrome signs in and performs the add — nothing runs on your machine |

### The four actions we got built

Wire had **no cart action for any Indian grocery retailer** — we checked bigbasket,
blinkit, zepto, swiggy-instamart, jiomart, amazon and flipkart. So we reverse-engineered
the Flipkart Minutes flow, [filed a spec](docs/WIRE-REQUEST-MINUTES.md), and Anakin
shipped it:

```
act_flipkart_com_set_delivery_address   auth: none   the pincode gate, in one call
act_flipkart_com_list_products          auth: none   available_quantity ← real stock
act_flipkart_com_add_to_cart            auth: none   the add
act_flipkart_com_view_cart              auth: none   independent verification
```

**`available_quantity` is what made this work.** In a browser it's invisible: an
out-of-stock item still renders an Add button, the click silently does nothing, and the
only symptom is a cart badge that doesn't move.

**The discovery that's documented nowhere:** Flipkart Minutes is `marketplace=HYPERLOCAL`,
not `GROCERY`. That one parameter is the whole trick.

### Wire decides. The browser acts.

Precisely, because this is the part a judge should be able to check:

```
Wire  fk_search_products  →  10 listings with pid + listing_id
model                     →  "picked #4 — plain garam masala; simplest
                              direct match over whole/sabut variants"
Browser API               →  opens the page, clicks Add to cart
Browser API               →  reads the cart back  ← the only evidence that counts
```

Wire's own `fk_add_to_cart` is `auth_mode: required` and we could not make it work — not
because of the OTP (we passed that), but because Anakin's `save_session` never persists an
authenticated cookie jar, so it always replays a logged-out session and Flipkart answers
HTTP 400. That's [issues #12–13](ANAKIN-BUG-REPORT.md), with evidence.

On **Minutes** the Wire chain needs no auth and is verified end to end
(`present_in_cart: true`) — but being auth-free it reaches an *anonymous* cart, so the
user-facing flow ships a **Chrome extension** (Developer Mode) that adds the plan to the
Minutes cart inside the user's own signed-in session. A stopgap: `act_flipkart_com_add_to_cart`
already does it in one call, at **4 credits per ingredient with no browser at all**.

---

## Proof it's real

Five things from actual runs — none staged.

**1 · It reasons per ingredient, and shows you why**
> *"tomato puree ¼ cup — Fresh tomato does not cover tomato puree in this recipe."*

**2 · It recovers when the shelf is empty**
> *"Rasoi Tatva Garam Masala was out of stock → Aachi Garam Masala"*

**3 · It caught reality disagreeing with its own plan**
The agent asked for **one** garam masala. Flipkart enforced a minimum and set qty **2**.
The agent knew — because it read the cart back instead of believing its click:
> `EVEREST Garam Masala · 100 g · Qty: 2 · ₹266 · Minimum Order Quantity: 2`

**4 · It eats to a target, without inventing numbers**
*"100g protein under ₹600"* → **81 of 99** recipe pages publish `proteinContent` in markup
we already read, so it costs nothing extra. Pages that don't say **"protein not
published"** rather than guessing — on a health constraint, a confident wrong number is
worse than an honest gap.

**5 · It buys the right amounts**
Scaled to your headcount, quantities merged *before* rounding (round separately and you
buy two jars), counts rounded up (half a bay leaf isn't a thing), and the leftover stated:
> `needs 250 g, smallest pack is 500 g → 250 g left over`

**The rules hold the floor.** The model can't add an ingredient that isn't in the recipe,
can't sell you something you said you own, and can't claim coverage without naming what
covers it. Every override is reported live. [64 tests](test/) pin it.

---

## Run it

```bash
npm install
echo "ANAKIN_API_KEY=ask_..." > .env    # free key: https://anakin.io/signup
npm run dev                              # → localhost:3000
npm test                                 # 64 tests, no network needed
```

`OPENAI_API_KEY` enables the model reasoning path. **It runs fine without one** — every
judgement has a deterministic fallback, which is what the tests pin.

---

## We also filed 15 bugs against Anakin

We built against the API hard for a week and wrote up
**[15 reproducible issues](ANAKIN-BUG-REPORT.md)** with repro commands — `save_session`
never persisting (#12), `fk_add_to_cart` unusable as a result (#13), cloud sessions dying
at ~2.5 min rather than the documented limits (#14), the `catalog=` filter on
`/v1/wire/resolve` silently ignored (#4), `/v1/search` taking `prompt` not the documented
`query` (#9).

We corrected our own assumptions too — [EMPIRICAL-TESTS.md](docs/EMPIRICAL-TESTS.md)
overrides our own reference doc wherever live calls disagreed with it.

**What's genuinely excellent:** Zero Touch onboarding, `bb_search_products`' response
shape, `GET /v1/wire/catalog/{slug}` for discovery, and `/v1/wire-run` executing `async`
actions synchronously.

---

## Limitations

- Minutes is live in limited pincodes; outside them, stock reads empty
- The Minutes cart fill goes through our extension, because the no-auth Wire cart is anonymous
- Anakin cloud sessions die at ~102–167s, capping one signed-in run at ~4–5 items
- Equipment (*"I have no oven"*) is collected but doesn't filter recipes yet

---

## Documentation

| | |
|---|---|
| **[DETAILS.md](DETAILS.md)** | The full write-up — variety, budget, protein, the brain, every bug we fixed |
| [DEMO-RUNBOOK.md](DEMO-RUNBOOK.md) | The verified end-to-end run, with timings |
| [ANAKIN-BUG-REPORT.md](ANAKIN-BUG-REPORT.md) | 15 issues found while building |
| [MINUTES-WIRE.md](MINUTES-WIRE.md) | The four Build Studio actions and their real responses |
| [docs/EMPIRICAL-TESTS.md](docs/EMPIRICAL-TESTS.md) | Real executed API calls |

---

**Browse. Think. Act. Then stop, and let the human pay.**
