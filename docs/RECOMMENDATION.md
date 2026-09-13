# Recommendation — what to build, and why

**12 September 2026.** Based on `EMPIRICAL-TESTS.md` (live calls), `ARCHITECTURE-ANALYSIS.md`, and the refined product idea.

---

## 1. Verdict on your reframing: take it

> *"the person is hungry, he wants to eat and make something based on what he has typed and what tools he has — no money constraint; all ingredients of the dish get added to the cart for him"*

**This is a better product than DinnerGuard, and it is better for reasons that are specific and verifiable, not just "simpler".**

It removes the three things that were actually blocking you:

| Removed | Why it was blocking |
|---|---|
| **Budget certification** | Required a *payable total* = merchandise + delivery fees + discounts, location-bound. No Wire grocery action returns fees. This was unachievable, and DinnerGuard's own §8 admitted it ("a pre-cart result with unknown fees is **provisional**"). |
| **Location-bound pricing** | `bb_search_products` has **no location parameter** — not "we don't know the pincode", the field does not exist. Unfixable from the outside. |
| **Nutrition sourcing** | An FDC-backed dataset with food-state records is a data-engineering project, invisible to a judge in 90 seconds. |

**Important correction to your assumption:** you said location works "as the person would already have his things set up." That's true for a *browser session* (their account has an address), but **not for Wire** — `bb_search_products` accepts only `query`, `category`, `brand`, `page`. There is nowhere to put a pincode. Your reframing makes this stop mattering, which is the right fix. Don't try to solve it.

**What survives — and it's the good part:** browse → think → act, with pack-size reasoning and an out-of-stock recovery. That maps exactly onto the hackathon brief.

---

## 2. What is already PROVEN working (tested today, keyless, no key needed)

`bb_search_products` via `POST /v1/wire-run`, 2 credits/call:

| Query | Results | Sample |
|---|---|---|
| paneer | 266 | Verka Paneer, ₹90.0, `pack_weight: "200 g"`, in_stock ✅ · Milky Mist ₹72.0 (list ₹80, **10% off**) |
| onion | 23 | fresho! Onion Local/Economy, `pack_weight: "1 kg"` ✅ |
| garam masala | 184 | Everest 100 g ✅ · Aachi 50 g ✅ |
| mustard oil | 223 | Dalda Kachi Ghani, `1 L` ✅ |
| toor dal | 707 | bb Royal 1 kg ✅ · bb Popular 5 kg ✅ |

Every field the product needs: `price`, `list_price`, `discount_percent`, **`pack_weight`** (handles both mass and volume), `in_stock`, stable `id`, `url`, `brand`, category taxonomy.

**The entire browse + think half of your product is already validated.** No key, no auth, no risk. That is a large de-risking — most teams at hour 40 do not have this.

---

## 3. The one remaining hard problem: the cart

Everything else is solved. "Add to cart" is the whole risk, and it is the whole *point* — it's the "act" the brief asks for.

Three ways to get it, in priority order:

### 🥇 Path A — Wire for reading, Browser API for the one write **(recommended)**

Use each Anakin product for what it is actually good at:

- **Wire** (`bb_search_products`) for structured ingredient→SKU lookup — fast, JSON, cheap, proven
- **Browser API + saved session** for the single write: adding to the real BigBasket cart, then reading the cart back

**Why the OTP problem disappears here.** Blinkit/BigBasket logins are phone-OTP. That kills *programmatic* login — but Browser Sessions are designed for exactly this: **a human logs in once, interactively, and the session is saved** (cookies + localStorage). Every later agent run loads it by `session_name`. The agent never sees an OTP because a person already handled it, once, before the demo.

**Bonus that matters a lot:** `?record=true` costs **zero extra credits** and produces a 1080p WebM of the agent operating the real site. **That is your demo video, generated for free, by the thing it's demonstrating.**

Cost: ~5 credits per 10-minute run. You have room for ~60 runs.

**Risk:** Free-tier Browser API access is undocumented and untested. **This is the gate. Test it first.**

### 🥈 Path B — Flipkart, pure Wire, no browser

Flipkart has a complete API pipeline:
- `fk_search_products` — `pincode` ✅, `auth_mode: none`, returns pid/url/title/price
- `fk_add_to_cart` — `auth_mode: required`, 3 cr, *"Adds a product to the authenticated user's cart and returns the updated cart"*
- `fk_view_cart` — `auth_mode: required`, 1 cr, `pincode` ✅, *"items, quantities, prices, and totals"*

**Advantage:** real location binding, and no browser dependency at all.

**Risks:** (1) `fk_add_to_cart` requires `listing_id`, which search does not appear to return — may need an extra `fk_product_details` call per item. (2) Flipkart identity creation is OTP-gated. (3) Flipkart's grocery range is weaker than BigBasket's for Indian cooking ingredients.

⚠️ **I could not test this** — `fk_search_products` returned `keyless_account_required` despite `auth_mode: none`. **New finding: Zero Touch has a narrower allowlist than `auth_mode` implies.** Needs your key.

### 🥉 Path C — Guaranteed floor: no cart, honest label

Ships on what's already proven. Produces a complete shopping plan with real SKUs, packs and stock, and states plainly *"purchase plan prepared; retailer cart has not been filled"* (DinnerGuard §10's honest label).

**Keep this as your floor.** It can be built entirely from validated calls, needs no auth, and cannot fail. But the "act" is weaker against a brief that explicitly asks for *"booking, filling forms, running a workflow end to end."*

---

## 4. The demo — design it around one beat

Judges watch 90 seconds. Five things land:

1. **Relatable setup** — "I want paneer butter masala. I have onion, tomato, oil. I have an induction stove and a kadhai."
2. **Live data, visibly real** — actual brands: *Verka*, *Everest*, *fresho!*. Not mock data.
3. **A moment of genuine reasoning** — *"recipe needs 150 g paneer; the smallest pack is 200 g, so you'll buy 200 g."* Cheap to build, instantly legible.
4. **🔑 THE MOMENT — recovery.** *"Milky Mist Paneer is out of stock → switching to Verka Paneer 200 g."* **This is the single most important beat in the entire demo.** It is what separates an agent from a script.
5. **A completed, verified action** — cart filled, then **read back** from the retailer, not from your own plan.

DinnerGuard's §1 was right that *"the defining moment is a verified basket repair."* **Keep that instinct. Drop the budget scaffolding that was built around it.** Out-of-stock is a better trigger than budget overrun anyway: it's more common, more relatable, and needs no fee data to be true.

> Since prices come free with the data, **show a running total** — but as information, never as a promise. Never write "under budget."

---

## 5. What to cut, definitively

| Cut | Reason |
|---|---|
| **Nutrition / protein targets** | Largest cost, zero visibility in a 90-second video. Cut entirely. |
| **Budget as a constraint** | Needs fees Wire doesn't expose. Display the total; never certify it. |
| **Monitoring** | 192 credits/day on a 300-credit account. Account-destroying. |
| **Two-meal enumeration** | Only after a single meal works end to end — which it won't, in 2 days. |
| **Budget slider** | Depends on a constraint you no longer have. |
| **Multi-retailer** | One retailer, done properly. |
| **SQLite persistence / webhook inbox** | No monitors ⇒ no webhooks ⇒ no durable state needed. A JSON run log is enough. |

Cutting these removes ~10 of the ~15 subsystems I counted in `ARCHITECTURE-ANALYSIS.md` §4.

## 6. What to keep from DinnerGuard

Its reasoning was excellent even where its scope wasn't:

- **§10's three-outcome honesty table** — never call a product link a filled cart. This is your integrity backbone; it's also what makes Path C shippable without embarrassment.
- **§8's "combine quantities BEFORE rounding to packs"** — subtle and correct.
- **Verify by independent readback**, never by reusing your own planned total.
- **§12's demo integrity** — every rupee in the video comes from a real captured run; don't stage a stock failure and call it organic. *(If you must inject an out-of-stock to guarantee the beat, label it as injected. Judges respect that; a fabricated "organic" failure is the kind of thing that loses trust if noticed.)*
- **§1's commitment gate** — but **tighten it to 90 minutes.** It's the 12th, not the 11th.

---

## 7. Plan for the ~2 days

**Hour 0 — 🚦 THE GATE (blocking, do nothing else first)**
1. Get an API key → https://anakin.io/signup
2. Connect Playwright to `wss://api.anakin.io/v1/browser-connect` (~2 credits, ~10 min). **Does Free tier allow it?**
3. Log into BigBasket manually in that browser, save the session, reconnect, confirm you're still logged in.

- **Both pass → Path A.** Commit and don't look back.
- **Browser fails → test Flipkart identity (30 min) → Path B.**
- **Both fail → Path C**, which is already proven and cannot fail.

**Hours 1–5 — the think layer** *(no auth needed, can start in parallel with the gate)*
Recipe intake → ingredient extraction → pantry deficit → `bb_search_products` per missing ingredient → LLM ingredient→SKU matching → pack rounding. **All of this runs on validated keyless calls.**

**Hours 5–10 — the act layer**
Browser automation: add each SKU to the BigBasket cart, read the cart back, diff against plan.

**Day 2 AM — the repair loop**
Out-of-stock or add-failure → pick alternative SKU → re-add → re-verify. **Cap at 2 attempts** (DinnerGuard §10 was right). This is the money beat — give it real time.

**Day 2 PM — demo**
Capture a run with `?record=true`. Free 1080p WebM. Edit to 90 s. Write README. **Freeze early.**

**Throughout:** develop against cached JSON responses. Don't re-hit the API on every code change — that's how 300 credits vanish.

---

## 8. Credit budget

You have **~600 effective**: 288 keyless remaining (per-IP) + 300 account.

| Item | Cost |
|---|---|
| Dev/testing on cached responses | ~0 |
| ~40 ingredient searches during dev | ~80 (use the keyless pool) |
| Browser gate test | ~2 |
| ~15 full browser runs @10 min | ~75 |
| Final demo runs | ~20 |
| **Total** | **~180** — comfortable |

Spend the **keyless pool** on development searches; save the **account credits** for browser time.

---

## 9. What I need from you to proceed

1. **An Anakin API key.** Blocking for the gate, for Browser API, and for Flipkart. Everything else I can do without it.
2. **A BigBasket account** you're willing to log into for the demo (use a throwaway if you'd rather — and do not use a real payment method).
3. **Confirm the retailer.** BigBasket has the best data by a clear margin, and I'd default to it.

---

## 10. Bottom line

Your instinct is right, and the evidence backs it. **Drop the budget and nutrition; keep browse → think → act with an out-of-stock recovery.**

The browse and think halves are **already proven working** — that's more validated ground than most teams have at this point. The cart is the only real risk, and there's a tested-in-90-minutes gate with two fallbacks beneath it, the lowest of which cannot fail.

Build the recovery moment. That's what wins.
