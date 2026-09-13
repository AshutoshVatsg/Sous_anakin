# Build Spec — "Cook What You Want" agent

**12 Sep 2026.** Concrete build + demo plan. Supersedes DinnerGuard scope. Read with `RECOMMENDATION.md`.

---

## 0. Credits — 4 accounts, and one important gotcha

4 teammates × 300 = **1,200 account credits**, plus keyless pools (~288 remaining on this IP).

⚠️ **Browser Sessions are per-account.** A BigBasket session saved on account A is **not visible to account B**. If you burn account A's credits mid-build and switch keys, **you lose the saved login** and have to redo the manual OTP login on the new account.

**So: designate ONE account as the browser account and protect its credits.**

| Account | Role | Spend on |
|---|---|---|
| **A — "browser account"** | Holds the saved BigBasket session. **Protect this balance.** | Browser API only (~5 cr/run) |
| B, C, D | Workhorses | Wire searches, recipe scrapes, dev iteration |
| keyless (per-IP) | Free dev | `bb_search_products` while coding |

Estimated **~26 credits per full run**; 1,200 credits ≈ **45 full runs**. Not a constraint. Stop worrying about credits and start worrying about the browser gate.

---

## 1. The honest transparency question

You asked about showing search activity "even if we are not searching for the product, but to show it's working smartly."

**You don't need to fake it — and faking it is strictly worse on every axis.**

The agent genuinely makes **8–12 live Anakin calls per run**. Streaming those real events *is* the transparency show, and it costs nothing extra because the work is already happening. Fabricating events would mean **writing extra code to script fake activity** — more work, for a weaker result.

And the downside is real: a judge who opens the network tab, reads the repo, or asks "what was it doing at 0:32?" finds scripted theatre. At a hackathon run by an **API company**, judges are unusually likely to inspect exactly this. Faked tool activity is the one failure that turns a strong submission into a disqualifiable one.

**Legitimate polish that is NOT faking — use all of it:**
- Show real events with deliberate pacing (a 200 ms stagger so 8 parallel results don't flash past)
- Show the *count* of what was really examined: *"266 paneer products found → 1 matched"*
- Show ingredients being searched **in parallel**, each resolving as its real call returns
- Keep completed steps visible with checkmarks instead of clearing them
- Show real reasoning: *"needs 150 g, smallest pack 200 g"*
- Show real rejects: *"Milky Mist ₹72 — out of stock, skipped"*

That's 15+ genuine beats. It looks smarter than anything scripted, because it *is* smarter.

**The one legitimate staging:** if out-of-stock doesn't occur naturally during the demo, injecting it is fine — **as long as you label it** *"simulated stock failure"* on screen. Judges respect a deliberately triggered failure path. They don't respect a fabricated organic one.

---

## 2. User flow — chat with chips

### Interface decision: hybrid, not pure chat

Pure free-text chat is a parsing swamp ("i have some onions, maybe 2, and oil") and slow to drive on camera. Pure forms don't feel like an agent.

**Chat as the surface, clickable chips inside the replies.** Every question is tappable *and* typeable.

```
🤖  What do you want to eat?
👤  paneer butter masala

🤖  Got it. What do you already have at home?
    [onion] [tomato] [oil] [salt] [ginger] [garlic] [butter] [cream]
    ↑ tap what you have, or just type it
👤  [onion ✓] [tomato ✓] [oil ✓] [salt ✓]  + "and some ginger"

🤖  And what can you cook with?
    [induction] [gas] [kadhai] [pressure cooker] [oven] [mixer]
👤  [induction ✓] [kadhai ✓] [mixer ✓]

🤖  Where should I deliver?
👤  560055
```

Feels agentic, yields structured data, drivable in ~15 seconds.

### 🔑 Clarifying questions come AFTER the recipe, not before

This is the differentiator. Generic upfront questionnaires are a form in disguise. **Questions derived from the recipe the agent just fetched are real reasoning, and they cost nothing extra.**

```
🤖  Found it — Hebbar's Kitchen paneer butter masala, 12 ingredients.
    Three quick things:

    This recipe needs kasuri methi. Do you have it?
    [yes] [no] [what's that?]

    It serves 4 — how many are you cooking for?
    [1] [2] [4]

    It calls for cashews for the gravy. Fine, or skip?
    [use cashews] [skip them]
```

Each answer **changes the downstream search**:

| Question | Effect |
|---|---|
| kasuri methi? | adds/removes a cart item |
| **serves 4 → cooking for 2** | **halves every quantity → changes the pack math** ← the one that really matters |
| cashews? | swaps to a different recipe variant |

The serving-scale question is the most valuable. Recipe says 150 g paneer for 4; cooking for 2 → 75 g needed; smallest pack is still 200 g. The agent saying *"you'll have 125 g left over"* is genuine, useful reasoning surfaced for free.

**Cap at 3 questions.** More reads as an interrogation and drags the demo.

### Agent run — 6 stages, ~70–90 s

| # | Stage | Anakin call | Credits | Time | What the user sees |
|---|---|---|---|---|---|
| 1 | **Understand** | — (LLM) | 0 | 2 s | "Looking for: paneer butter masala · You have 5 items · Induction + kadhai" |
| 2 | **Find recipe** | `POST /v1/search` | 3 | 6 s | "Searching the web for recipes…" → 3 candidates with sources |
| 3 | **Read recipe** | `POST /v1/url-scraper` ×1–2 | 1–2 | 8 s | "Reading hebbarskitchen.com…" → "Found 12 ingredients, 8 steps" |
| 4 | **Reconcile** | — (local) | 0 | instant | "You have 4 · **You need 8**" — two visible columns |
| 5 | **Source** | `bb_search_products` ×8 **parallel** | 16 | 12 s | 8 rows resolving live: "paneer → **Verka 200 g ₹90** ✓ (266 found)" |
| 6 | **Act + verify** | Browser API + session | ~5 | 40 s | "Adding to cart…" → live cart lines → "**8/8 confirmed**" |

**Total ≈ 26 credits, ~75 s.** Good demo length.

### Result screen

```
🍲 Paneer Butter Masala · serves 2 · 35 min · induction ✓

YOU ALREADY HAVE (4)        BOUGHT FOR YOU (8)
  onion                       Verka Paneer 200 g        ₹90
  tomato                      Amul Butter 100 g         ₹62
  oil                         Everest Garam Masala 100g ₹78
  salt                        ...
  ginger
                            Cart total  ₹412  ·  ✓ verified against BigBasket

⚠️  Milky Mist Paneer was out of stock → switched to Verka Paneer
ℹ️  Recipe needs 150 g paneer; smallest pack is 200 g

[ View recipe steps ]  [ Open my BigBasket cart → ]
```

---

## 2b. Where the cart actually goes

**Into a real BigBasket account, server-side** — whichever account the saved browser session is logged into.

**The key technical fact: cart state lives on BigBasket's servers, tied to the account, not to the browser.** So the agent fills the cart from Anakin's cloud browser, and the user opens BigBasket on their own phone and the items are there. Same account, same cart.

The run ends:

```
🤖  ✓ 8 items added to your BigBasket cart — verified.
    Total ₹412. I've stopped here — payment is yours.

    [ Open my BigBasket cart → ]
```

**The agent never pays.** It stops at the cart; the user checks out themselves. That's the safe boundary *and* the better story — autonomous purchasing makes judges nervous rather than impressed.

### ⚠️ Must verify: cart is account-scoped, not device-scoped

Logged-in e-commerce carts are normally account-scoped, but **this is untested on BigBasket**. **Add to the hour-0 gate:** log in via Browser API → add one item → open BigBasket on your phone → confirm it's there. Five minutes, and it validates the entire "open my cart and pay" premise.

If BigBasket turns out to scope carts per-device, that story breaks and Flipkart's `fk_add_to_cart` (explicitly *"the authenticated user's cart"*) becomes the better target.

### 🔒 Single-user demo only

Do **not** let strangers drive a session logged into your account — they'd see your address and order history and could order on your saved card. For the hackathon: it is **your** BigBasket account, you are the user, and you say so plainly.

The multi-user version ("connect your BigBasket account") is the obvious product story — **describe it in the README, don't build it.**

**Honest framing for judges:** *"I told it what I wanted and what I had. It found a recipe, worked out what I was missing, sourced real products, and filled my actual BigBasket cart. I just pay."*

---

## 3. Buildability — honest assessment

| Stage | Effort | Risk | Why |
|---|---|---|---|
| 1 Understand | 0.5 h | 🟢 Low | One LLM call, structured output |
| 2 Find recipe | 1 h | 🟢 Low | `/v1/search` is synchronous, 3 cr |
| 3 Read recipe | 2–3 h | 🟡 Medium | Recipe sites vary. Mitigate: prefer JSON-LD `Recipe`, target 2 known-good Indian sites, cache a fallback recipe |
| 4 Reconcile | 1 h | 🟢 Low | Local set math + unit normalisation |
| 5 Source + match | 2–3 h | 🟢 **Low — PROVEN** | `bb_search_products` tested across 5 ingredients today |
| 6 Cart + verify | 4–6 h | 🔴 **HIGH — UNTESTED** | Free-tier Browser API unknown; BigBasket DOM unknown |
| Repair loop | 2 h | 🟡 Medium | Depends entirely on 6 |
| UI | 3–4 h | 🟢 Low | Event stream + result screen |
| Demo + video | 2 h | 🟢 Low | Recording is free |

**Total ≈ 18–24 h focused.** Solo + Claude over 2 days: **tight but achievable — if stage 6 works.**

**If stage 6 fails → Path C** (plan only, honest label): drops to **~12 h, comfortable**, and every remaining stage is already validated.

### Demoability: 🟢 **Very high**
- Visual and legible without narration
- Real brands on screen — instantly credible
- A genuine climax (the recovery)
- Fits 90 s naturally
- Recording is free and automatic

**The product is more demoable than it is buildable.** The gap is entirely stage 6.

---

## 4. Build order (dependency-correct)

**Hour 0 — 🚦 GATE. Nothing else first.**
1. Sign up, get key on account A
2. Playwright → `wss://api.anakin.io/v1/browser-connect` (~2 cr, 10 min)
3. Manual BigBasket login → save session → reconnect → still logged in?

Pass → Path A. Fail → Flipkart test (30 min) → Path B. Both fail → Path C.

**Hours 1–6 — the spine (no auth needed, start in parallel with the gate)**
Stages 1→5 end to end, CLI first, no UI. Exit: typing "paneer butter masala" prints 8 real SKUs with packs and prices.

**Hours 6–12 — the act**
Browser automation: add to cart, read cart back, diff vs plan.

**Day 2 AM — the money beat**
Repair loop: out-of-stock → alternate SKU → re-add → re-verify. **Cap 2 attempts.** Give this real time — it's what wins.

**Day 2 PM — ship**
UI event stream, result screen, `?record=true` capture, 90 s edit, README. **Freeze by evening.**

**Rule:** cache every API response to disk from hour 1 and develop against the cache. Re-hitting the API on every code change is how 300 credits vanish.

---

## 5. Architecture

```
Next.js / FastAPI
  │
  ├─ Controller (the "think" layer — yours, not Anakin's)
  │    understand → find → read → reconcile → source → act → verify → repair
  │    emits events to SSE stream
  │
  ├─ Anakin adapters
  │    search.ts        POST /v1/search
  │    scrape.ts        POST /v1/url-scraper
  │    wire.ts          POST /v1/wire-run   (bb_search_products)
  │    browser.ts       wss://…/browser-connect?session_name=bb&record=true
  │
  ├─ Matcher (LLM)  ingredient text → best SKU from N results
  ├─ Packs          deficit ÷ pack_weight → ceil
  └─ run.json       cached responses + event log (this is your replay mode)
```

**Keep the controller dumb and inspectable.** Its whole job is: decide the next call, check the result, decide whether to repair. That legibility *is* the agent story.

### Two details that will bite

1. **Unit normalisation.** `pack_weight` comes back as `"200 g"`, `"1 kg"`, `"1 L"`. Parse to a canonical base unit; keep count-units (`"50 pcs"`) separate. DinnerGuard §8 was right: **aggregate quantities BEFORE rounding to packs.**
2. **Ingredient → SKU matching is the real LLM task.** "150 g paneer" → pick from 266 results. Feed the model the top ~10 by relevance with brand, `pack_weight`, `price`, `in_stock`, and let it choose with a one-line reason. **That reason string is your best UI copy** — it's real reasoning, surfaced.

---

## 6. Cut list (unchanged, restated)

Nutrition · budget-as-constraint · monitoring · two-meal · slider · multi-retailer · SQLite/webhooks.

Show a running total because the price data is free. **Never write "under budget"** — you cannot see delivery fees.

---

## 6b. Anakin MCP server

Installed 12 Sep into project-local config (`C:\Users\ashut\.claude.json`, project `C:\AnakinHackathon`):

```
claude mcp add --transport http anakin https://mcp.anakin.io/mcp
```

`claude mcp list` → **✔ Connected**. Per the Jul 21 2026 changelog it exposes **21 tools covering every Anakin product**, including Browser Automation and Browser Sessions.

**Two caveats:**
1. **Requires a session restart** — MCP tool schemas load at session start. Added mid-session, it connects but the tools aren't callable until Claude Code restarts.
2. **Zero Touch only without a key.** Full surface (Browser API, Wire write actions, identities) needs `ANAKIN_API_KEY` configured on the server.

**Use it for exploration and one-off calls.** The application itself should call the REST API directly — an MCP dependency inside the product adds a moving part between you and the judges, and the adapters are ~40 lines each.

---

## 7. Blocking

1. **API key** — gates Browser API, Flipkart, and the whole stage-6 decision
2. **BigBasket account** for the demo login — use a throwaway; **no real payment method saved**
3. **Never check the key into git** — `.env` + `.gitignore` from commit 1
