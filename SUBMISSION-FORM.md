# Submission form answers

Copy-paste ready. Kept out of the README on purpose — this is for the form, not for judges browsing the repo.

---

## Project Title

Sous — from "I'm hungry" to a filled grocery cart

*(short version: `Sous`)*

---

## Project Description

You don't order in because you can't cook. You order in because working out what you could cook takes longer than the food takes to arrive.

Sous is an agent that closes that gap. Say what you feel like — "something with paneer around ₹200", "100g protein under ₹600" — and tick what's already in your kitchen.

It searches the live web across 8–10 different angles, reads ~16 real recipe pages in parallel, and ranks five genuinely different dishes by how much of each you already own. Pick one, and it works out what you're truly missing: a ground spice blend covers coriander powder but not a whole bay leaf; fresh tomato doesn't cover tomato purée; your chilli powder doesn't cover green chillies. Quantities are scaled to your headcount, merged before rounding, and rounded up to real pack sizes — because you can't buy a quarter of a cinnamon stick.

Then it sources each item as a real Flipkart product with a live price and live stock, fills the cart, and proves it by reading the cart back — never by trusting its own click. On a real run it asked for one garam masala, Flipkart enforced a minimum of two, and the agent caught it.

Then it stops. You open Flipkart and pay. The agent never pays, and never could.

Browse, think, act — and an honest boundary at the end.

---

## Project GitHub link

https://github.com/AshutoshVatsg/Sous_anakin

---

## Where we used Anakin

Anakin isn't a component of Sous — it's the half of Sous we didn't have to build. Every time the agent touches the outside world, that's Anakin. We used five of its products, and the project does not exist without any one of them.

### 1. Search API — finding food worth cooking

Every craving fans out into 8–10 distinct query angles: dry sabzi, gravy, grilled, lighter, starter, rice, regional, and — when a budget is named — three more hunting specifically for cheap food. One measured run turned "paneer" into **46 distinct candidate pages across 21 different sites**. This is what makes Sous a discovery engine rather than a recipe app with a fixed catalogue.

*(Note: `/v1/search` takes `prompt`, not the documented `query` — one of 15 bugs we filed.)*

### 2. URL Scraper — reading independent food blogs at scale

~16 pages read in parallel, 5 at a time, HTML out, schema.org `Recipe` JSON-LD parsed in. This is the single most important thing Anakin does for us: the recipes that actually know Indian food live on independent blogs — hebbarskitchen, vegrecipesofindia, nishamadhulika, rakskitchen, tarladalal — not in any API. **Anakin turns that entire long tail into structured data.**

It's also where protein comes from free: **81 of 99 pages** we scraped publish `nutrition.proteinContent` in markup we were already reading, so "100g protein under ₹600" costs no extra call and needs no model guessing a number.

### 3. Wire — live Flipkart product and price data

Recipe language isn't shop language, so every ingredient is resolved through Wire into a real Flipkart listing: `product_id`, `listing_id`, title, and a live price. **This is our only source of real cost data, and it changed the product.** Our seeded price guesses were systematically high — Anakin's real numbers gave us paneer at ₹84 against a ₹95 guess, garam masala ₹32 against ₹65, kasuri methi ₹14 against ₹45. Every price the UI shows traces back to a Wire call, and prices are remembered as a free side effect of every lookup, so estimates get better the more the agent is used.

Wire data also exposed problems we could then fix: asked for "fresh cream", Flipkart's own relevance ranking answers "Nandini Full Cream Milk", and plain "cream" returns a POND's face cream. We built a matcher on top of Anakin's data that knows milk, cream, butter, ghee and paneer are not each other.

### 4. Wire Build Studio — four custom actions Anakin built for us mid-hackathon

Wire had **no cart action for any Indian grocery retailer** — we checked bigbasket, blinkit, zepto, swiggy-instamart, jiomart, amazon and flipkart. So we reverse-engineered the Flipkart Minutes flow, filed a spec, and Anakin's team shipped four actions on the `flipkart-com` catalogue, all `auth_mode: none`:

```
act_flipkart_com_set_delivery_address   the pincode gate in one call
act_flipkart_com_list_products          available_quantity: LIVE STOCK
act_flipkart_com_add_to_cart            the add
act_flipkart_com_view_cart              independent verification
```

`available_quantity` is the field that made this work. In a browser it's invisible: an out-of-stock item still renders an Add button, the click silently does nothing, and the only symptom is a cart badge that doesn't move. Reading stock *before* attempting the add replaced hours of blind retry loops.

The key discovery, documented nowhere: **Flipkart Minutes is `marketplace=HYPERLOCAL`, not `GROCERY`.**

### 5. Browser API — performing the act

**Wire selects, the browser acts.** Wire resolves each ingredient to an exact listing — `product_id`, `listing_id`, live price, and on Minutes live stock — and the add is then performed against that precise product. Two flows, two browsers:

- **Cupboard restock (`/pantry`) — Anakin's Browser API.** A cloud Chrome over CDP signs into Flipkart, adds each product Wire selected, and reads the cart back as proof. Nothing runs on the user's machine: the browsing, the reasoning and the acting are all remote. A verified run: Wire returned 10 garam masalas, the model picked one ("plain garam masala; simplest direct match over whole/sabut variants"), the cloud browser added it in 8.9s, and the readback confirmed it — including catching that Flipkart had silently enforced `Minimum Order Quantity: 2`.
- **Cooking flow (`/`) — the user's own Flipkart Minutes session**, driven by a Chrome extension, so their login never leaves their machine.

Either way, the add is never trusted. Every one is proved by reading the cart back — **a click is never evidence.**

### Why Wire isn't doing the write yet, and exactly what closes it

**`act_flipkart_com_add_to_cart` works.** We have run it and it returns `present_in_cart: true`. The blocker is auth, not capability.

Because the four Minutes actions were built `auth_mode: none`, they operate on an **anonymous** cart — perfect for checking stock, but not the cart a person opens and pays from. And Wire's other route, `fk_add_to_cart` on the main `flipkart` catalogue, is `auth_mode: required` and fails at HTTP 400 because `save_session` never persists an authenticated cookie jar (issues #12–13 in our bug report — we passed the OTP fine; the credential always replays a logged-out session).

**The fix is known and costed:** register a Flipkart identity with `auth_mode: login` against the Minutes subdomain (`flipkart-minutes` / `flipkart-com`) through Build Studio. Anakin quoted that login-capable rebuild at **5,000 credits** — out of reach on a 300-credit free tier during a one-week hackathon, entirely routine in production.

The moment that credential exists, **the browser disappears completely**:

```
set_delivery_address → list_products → add_to_cart → view_cart
4 credits per ingredient · no login flow · no session ceiling · no extension
```

That is the whole agent, end to end, as four Wire calls. The architecture is already built around it — Wire is the write path, the browser is scaffolding, and we are one credential away from removing the scaffolding.

### Zero Touch

Read paths go through keyless endpoints where possible, so a judge can run the read half with no key and no setup.

### What we gave back

We built against the API hard for a week and filed **15 reproducible issues** with repro commands, including `save_session` never persisting, cloud sessions dying at ~2.5 minutes rather than the documented limits, and the `catalog=` filter on `/v1/wire/resolve` being silently ignored.

What's genuinely excellent: Zero Touch onboarding, `bb_search_products`' response shape, `GET /v1/wire/catalog/{slug}` as a discovery endpoint, and `/v1/wire-run` executing `async` actions synchronously.
