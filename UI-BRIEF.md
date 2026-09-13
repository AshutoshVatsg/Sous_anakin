# Design brief — Sous

## Read this first

**Sous is not a food-delivery app.** It looks like one for about four seconds, and that
is the single biggest trap in this brief.

It is an **agent**. You say *"something with paneer around ₹200"*, and it goes and reads
the live web, works out what your kitchen is already missing, and fills a real Flipkart
cart — then stops, because you are the one who pays.

The product is **the agent showing its work**. Swiggy shows you food. Sous shows you a
machine reasoning about food and then acting on your behalf. Every design decision
should push toward *"I can see it thinking, and I believe it."*

Built for a hackathon whose brief is literally *"browse, think, act — explicitly not a
chatbot."* **Judges will watch a 90-second screen recording.** If the reasoning isn't
legible at a glance, we lose.

---

## What it actually does

```
you type a craving  →  8-10 live web searches  →  ~16 recipe pages read in parallel
                    →  5 dishes ranked by what YOUR kitchen already has
you pick one        →  it re-reads that recipe, decides what's genuinely missing
                    →  fills your real Flipkart cart, proves it by reading it back
                    →  stops. Never pays.
```

---

## Screen 1 — `/` the main flow

Today: left icon rail · centre conversation column · right sidebar (basket + activity
feed) · composer pinned at the bottom. Cream ground, green primary, orange CTA.

### Components to redesign

**1. Composer — bottom, always reachable**
- Text input — *"something with paneer…"*
- Pantry chips, toggleable: `onion` `tomato` `oil` `salt` `ginger` `garlic` `paneer`
- Serves stepper (1–8)
- Budget dial (₹0–2000) with an `around` / `under` toggle
- Try-these chips: `paneer` `chole` `dal` `rajma` `aloo` `biryani`

> A price typed into the sentence beats the dial. *"paneer dish around 200"* moves the
> dial itself — **show that happening.** It's a real moment of the thing understanding you.

**2. Conversation** — alternating agent/user turns. Real strings:
- *"Looking for dishes… Reading real recipe pages — not guessing from a list"*
- *"2 of these 5 cook for around ₹200. From 5 different sites · 0.1s"*
- *"You need 10 things. Shall I add them to your Flipkart Minutes cart?"*

**3. Dish cards** — five, in a grid. Each carries a lot, and all of it matters:

| Element | Detail |
|---|---|
| Photo | from the recipe site, 16:9, sometimes missing → needs a graceful fallback |
| Cook-time badge | `20 min` |
| Rating | `★ 5.0` |
| Title | *"Paneer Sabzi / Quick Paneer Sabji (15 minutes)"* — can run to two lines |
| Source | `Indian · easyindiancookbook.com` |
| Style tags | `gravy` `lighter` `dry sabzi` `starter` `grilled`, plus `over budget` in a warning tone |
| Two prices | `≈ ₹181 to cook` **and** `₹380 first shop` — different meanings, must not blur |
| **Coverage bar** | **`you have 5/14`** + `need 9` — *the most important element on the card* |

> `≈` means estimated. A price **without** `≈` means every line came from a price we
> actually saw. **That distinction has to survive the redesign.**

**4. Plan panel** — appears after a dish is picked. This is the reasoning showcase:

- `ALREADY COVERED (4)` — `oil — you have oil` · `water — kitchen staple`
- `NEED TO BUY (10)` — each line is **name · quantity · shop-term · one line of reasoning**:
  - *"tomato puree ¼ cup — Fresh tomato does not cover tomato puree in this recipe."*
  - *"jeera ¼ tsp · cumin seeds — These are a distinct whole spice and are not covered by what you have."*
- Footer: `≈ ₹366 · ₹213 of that is pantry stock you keep · 9 of 10 items priced`
- Primary CTA: **`Add 10 to Flipkart Minutes`**

> Those reasoning sentences **are** the product. Today they're small grey text under each
> item. They deserve better. Do not hide them behind a "show more".

**5. Basket** (right) — items, running total, `Fill basket`, and the standing promise:
*"~10 min delivery · the agent never pays"*

**6. Activity feed** (right) — live SSE, monospace, timestamped:

```
0s    ▸ Reading the recipe for Paneer Sabzi
0s    ▤ Reading easyindiancookbook.com…
5.7s  ✻ gpt-5.4 read 14 lines → buy 10, covered 4
5.7s  ✓ oil — you have oil
5.7s  ✓ small onions — you have onion
```

Every line is a real API call; nothing is scripted. Event types needing distinct
treatment: `search` `read` `think` `check` `option` `reject` `added` `substitute`
`warn` `error` `budget` `protein`.

> This is the "browse, think, act" proof. It should read like a flight recorder —
> trustworthy, dense, scannable. **Never** a loading spinner with personality.

---

## Screen 2 — `/pantry`, "Stock the cupboard"

Simpler and more operational, and it contains a **live human-in-the-loop moment**.

1. Item picker — 4–5 staples
2. Phone number → `Sign in`
3. **OTP entry, under real time pressure.** An agent is holding a remote browser open
   and it dies after ~2 minutes. A six-digit box appears and the user has seconds, not
   minutes. **Design this as a moment** — convey that the session is live and finite,
   without a stressful countdown that looks broken when it runs out.
4. Live feed as each item is searched, judged, clicked, verified
5. Result: `1 of 1 in your flipkart.com cart`, plus the readback

Per-item states to style: `working` · `added` · `already in cart` · `substituted` ·
`failed` (always with a reason).

---

## The beats worth designing *for*

All captured from real runs. If the design makes these land, it wins.

1. **Coverage** — *"you have 5/14"*. Legible instantly, without reading.
2. **Reasoning** — *"Fresh tomato does not cover tomato puree in this recipe."*
3. **Substitution** — *"Rasoi Tatva Garam Masala was out of stock → Aachi Garam Masala"*
4. **Stock before the click** — *"Desi Farms ₹65 — 0 in stock, skipped"*
5. **The readback catching reality** — the agent asked for one garam masala; Flipkart
   enforced `Minimum Order Quantity: 2`, and the cart readback caught it. The agent knows
   because it verified instead of trusting its own click.
6. **The stop** — *"I've stopped here. Payment is yours."* A feature, not a limitation.
   Design it with confidence, not apology.

---

## References — what to take, what to leave

All in `Ref/`:

| File | Take | Leave |
|---|---|---|
| **Healthy Food Planner** | Closest in spirit. Soft tinted per-item cards, generous whitespace, calm green palette, right-hand summary column that totals things up | The marketing hero and the stock-photo chef |
| **Restaurant UI / BISTRO** | Three-column discipline; a persistent right-hand order panel always showing total + CTA | Heavy purple sidebar, "Good Morning Darius" dashboard framing, revenue charts — we have no analytics |
| **Food Delivery Dashboard / Platform** | Card grids, category chips, crisp food-photography treatment | Anything implying courier tracking or restaurant browsing. **We are not a delivery app** |
| **Demni's Dashboard**, **POS Power** | Data density done cleanly — many numbers without noise | The B2B/POS chrome, entirely |
| **Curry Dishes**, **Marco Ice Cream** | Warmth; food that looks worth cooking | Playful/childish type and illustration |

**The synthesis:** *Healthy Food Planner*'s calm, plus *BISTRO*'s three-column
discipline, plus a terminal-grade activity feed none of the references have — because
none of them are agents.

---

## Direction

- **Warm, calm, confident.** Indian home cooking, not a startup dashboard.
- The current palette (cream ground, green primary, orange CTA) is decent. Keep the
  warmth; push contrast and hierarchy much harder.
- **Photography is the joy; data is the substance.** Don't let the food crowd out the
  numbers, or the numbers make it clinical.
- **Legible in a 1080p screen recording.** No 11px grey-on-grey. Assume a judge watching
  at speed with the sound off.
- Light **and** dark (the feed especially wants dark).
- Responsive to ~400px — the three-column layout must degrade sanely.

### Anti-patterns

- Looking like Swiggy / Zomato / Blinkit
- Chat bubbles as the dominant metaphor — it's an agent, not a chatbot
- Reasoning hidden behind "show more"
- Fake progress, skeletons that don't map to real work, decorative "AI sparkle"
- Cart totals that read as promises — we can't see delivery fees, and we say so
- Anything implying it pays for you

---

## Technical constraints

- **Next.js 16 (Turbopack) · React 19 · Tailwind v4 · Node 24, ESM**
- Every route is **SSE**. The UI renders a stream of real events, so state arrives
  progressively and sometimes out of order. **Design for partial data as the normal case.**
- Recipe photos are third-party: some hosts block hotlinking (proxied via `/api/photo`),
  some are missing entirely. **Every image needs a real fallback.**
- Existing files: `app/page.js` (~860 lines), `app/pantry/page.js`, `app/globals.css`
- Fields can be `null` — no rating, no cook time, no protein, no price. Current copy says
  *"protein not published"* rather than guessing. **Keep that honesty visible** — the
  empty states are a feature here, not an afterthought.

## Deliverables

1. High-fidelity `/` — empty · searching · five results · dish picked with plan panel
2. High-fidelity `/pantry` — picking · awaiting OTP · running · done
3. Component specs: dish card, plan line item, activity-feed row, coverage bar,
   composer, basket
4. Light + dark tokens, type scale, spacing scale
5. Mobile (~400px) for `/`

**The one-line test:** a judge watching 90 seconds with the sound off should be able to
say *"it read real recipes, it knew what was in my kitchen, and it actually bought the
rest."*
