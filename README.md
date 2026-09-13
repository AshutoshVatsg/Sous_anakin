# Sous

**Say what you feel like eating. Ten minutes later it's at your door.**

Built for [Anakin Forge](https://anakin.io/hackathon/anakin-forge), Sept 2026.

An agent that **browses** the live web, **thinks** about what a real kitchen already
contains, and **acts** on a real retailer — it fills your actual Flipkart Minutes
cart and then stops, because you are the one who pays.

---

## The problem

You're hungry. You know roughly what you want. You do *not* know which of the
seventeen things a recipe lists you already own, and you are not going to stand in
the kitchen cross-referencing a blog post against your own shelves.

So you either order in, or you buy things you already have.

## What Sous does

You type **"something with paneer"** and tick what's in your kitchen.

1. **Searches the web across seven angles** — and if you named an *ingredient*
   rather than a dish, those angles go after different kinds of dinner: dry
   sabzi, gravy, grilled, lighter, starter, rice, regional. Name a price and
   three more go hunting for cheap food specifically
2. **Reads ~16 recipe pages in parallel** — Anakin URL Scraper, schema.org
   `Recipe` JSON-LD, so Indian food blogs work and not just Allrecipes
3. **Ranks them by how much you already have** — plus source quality, rating and
   cook time, so an authentic recipe you're missing three things from beats a
   Western adaptation you're missing two from
4. **Shortlists five dishes that are actually different** — different dishes,
   different styles, different sites — with the real photo, cook time, rating,
   style, an estimated shop cost, and a "you have 7 of 22" bar.
   Set a [budget](#budget) and it ranks for that too
5. **You pick one.** It re-reads that recipe and works out what's *genuinely*
   missing — see [the brain](#the-brain), below
6. **Fills your Flipkart Minutes cart** — checking stock before each add, trying
   alternatives when something's out, and reading the cart back to prove it
7. **Stops.** You open Flipkart and pay.

Every line in the activity feed is a real API call. Nothing is scripted.

---

## Run it

```bash
npm install
cat > .env <<EOF
ANAKIN_API_KEY=ask_...       # free key: https://anakin.io/signup
ANAKIN_WIRE_KEY=ask_...      # the account holding the Minutes Build Studio actions
EOF
npm run dev                  # → http://localhost:3000
npm test                     # the brain's regression suite
```

To let it fill your real cart, run your own Chrome with a debug port and be
logged in to Flipkart:

```bash
chrome --remote-debugging-port=9222
```

That is deliberate: **it acts inside your session, never a headless one it
controls.** Your login never leaves your machine.

CLI, if you prefer:

```bash
npm run cli -- "palak paneer" --have oil,salt,onion,tomato --serves 2
```

An `OPENAI_API_KEY` in `.env` turns on the model reasoning path. **It runs fine
without one** — every judgement has a deterministic fallback, which is what the
test suite pins.

Warm the price memory with real Flipkart prices (1 Anakin credit per term, once —
run it with no flag first to see the cost and change nothing):

```bash
npm run prices              # dry run: what it would fetch and what it costs
npm run prices -- --run     # do it
```

### Which model

Picked by eval, not by feel. Three real recipes × hand-checked shopping lists,
scored on the three things that actually hurt a cook:

- **missed** — it left out something the dish needs (weight 3: you can't cook)
- **sells-you-yours** — it put something in the cart you'd said you own (weight 2)
- **invented** — it added something not in the recipe (weight 2)

| Model | Penalty | Errors | Output tokens (3 calls) | Thinking |
|---|---|---|---|---|
| **gpt-5.4** | **3** | 1 missed | **2053** | — |
| gpt-5.5 | 3 | 1 missed | 5020 | 3000 |
| gpt-5.6-sol | 3 | 1 missed | 3291 | 1293 |
| gpt-5.6-luna | 3 | 1 missed | 3288 | 1291 |
| gpt-5.6-terra | 3 | 1 missed | 2325 | 521 |
| gpt-4.1-mini | 3 | 1 missed | 2144 | — |
| gpt-5.4-mini | 2 | 1 "invented" | 2397 | — |
| gpt-5.4-nano | 2 | 1 "invented" | 2315 | — |
| gpt-4.1 | 6 | 2 missed | 2075 | — |

**The honest reading: after the verification layer, model choice barely moves the
result.** Nine models land within a few points, and both "invented" flags are the
eval's own fault — the model wrote *hing*, the recipe said *asafoetida*, and they
are the same thing. The failure modes that separated models on a single recipe
(dropped ingredients, invented ingredients, selling you your own tomatoes) are
exactly the ones the reconciler catches, so paying more buys very little.

**`gpt-5.4` is the default**: tied for the best score with no reasoning-token
surcharge — gpt-5.5 spends 2.4× the output tokens on thinking for the same answer.
If you want the strongest reasoning and don't mind the bill, `gpt-5.6-terra` is the
cheapest of the thinking tier. Override with `LLM_MODEL=` in `.env`.

Per-token prices aren't quoted here because there's no pricing endpoint to read
them from and guessing them would be worse than saying so — check OpenAI's pricing
page. What's measurable is the shape: ~500 tokens in and ~700 out per reasoning
call. **Anakin credits are the budget that binds, not the model.**

*(An earlier single-recipe benchmark in this project claimed gpt-5.4-mini "dropped
ginger and garlic". Across three scenarios that didn't reproduce — it was one noisy
run, and the table above supersedes it.)*

---

## The brain

> **The model judges. Code computes.**

The hard part isn't finding a recipe. It's deciding what you actually need to buy,
and every one of these rules exists because we got it wrong first:

| The recipe says | Your kitchen has | Sous says | Why |
|---|---|---|---|
| 1 large white onion | onion | ✅ covered | Size and knife-work don't change what you buy |
| 2 green chillies | chilli powder | 🛒 buy | A processed item never covers a whole one |
| ¼ tsp red chili powder | chilli powder | ✅ covered | Colour only binds when the pantry states one too |
| 1 white onion | red onion | ✅ covered | Onion colour is cosmetic |
| 1 tsp coriander powder | garam masala | ✅ covered | The blend contains the ground spice |
| 2 bay leaf, 1" cinnamon | garam masala | 🛒 buy | Whole spices are tempered in fat; powder can't |
| 2 tbsp coriander leaves | garam masala | 🛒 buy | It has coriander *seed*, not the leaves |
| 2 tbsp tomato purée | tomato | 🛒 buy | A tomato is not tomato purée |
| 6 garlic **cloves** | garam masala | 🛒 buy | Those cloves are garlic, not the spice |
| 6 garlic cloves | ginger | 🛒 buy | Owning half of "ginger-garlic paste" claims neither |

Arithmetic stays in code, and it's the boring kind that matters: a recipe for four
scaled to two gives ½ a bay leaf, so **counts round up** — you cannot buy a quarter
of a cinnamon stick. Spoon measures snap to quarters and render as `1½ tbsp`,
because cooks read fractions.

Recipe language is also not shop language. `chopped cilantro` is searched as
**coriander leaves**, `whole cashews` as **cashews**, `all-purpose flour` as
**maida**. The UI shows both, so you can see the translation it made.

### Knowledge is learned, not shipped

The tables above encode Indian vegetarian cooking, because that is what we tested
against. **They are a warm start, not a worldview.** Asking for eggs exposed it:

| Ingredient | Before |
|---|---|
| `turmeric` | no price — the table only knew `turmeric powder` |
| `coconut milk` | **₹34, priced as milk** — a silent, confident, wrong answer |
| `bread crumbs` | **₹45, priced as bread** |
| `tofu`, `prawns`, `oats`, `pasta`, `soya chunks`, `chicken` | nothing at all |

Two fixes, and only one of them is a patch.

The patch: a price is now only inherited through a **qualifier** — a grade or a
brand. Another food in front of it makes it a different product, so `coconut milk`
returns *no price* rather than milk's. A confident wrong number is worse than an
honest gap.

The structural fix is `src/knowledge.js`. Ingredients the agent has never met are
**looked up once and remembered forever** in `cache/knowledge.json`:

```
learn  looked up 40 ingredients I hadn't seen before

tofu           fresh   retail=tofu          pack=200 g   aliases: soy paneer, bean curd
prawns         fresh   retail=prawns        pack=250 g   aliases: shrimp, jhinga
soya chunks    KEEPS   retail=soya chunks   pack=200 g   aliases: meal maker, nutri nuggets
turmeric       KEEPS   retail=haldi powder  pack=100 g   aliases: turmeric powder, haldi
eggs           fresh   retail=eggs          pack=6 pc    aliases: anda, egg
```

The split is the same one as everywhere else in this project: **the model supplies
knowledge, code supplies every number.** It is asked what a shop calls a thing,
what else it's called, and whether it lives in the cupboard or the fridge. It is
explicitly *never* asked a price — those come from Wire, and `npm run prices --
--run --missing` fetches exactly the ones the agent has learned but can't cost yet.

That closes the loop. Nine real prices came back the first time it ran, including
**coconut milk at ₹77** against the ₹34 the old guess produced.

With no `OPENAI_API_KEY` the tables still run the show and the agent still works —
it just knows less.

### The model proposes, the rules hold the floor

With `OPENAI_API_KEY` set, a model reads the whole recipe and decides what's
missing. It is good at the judgement the rules can't reach — *"the recipe calls
for ginger paste and you have neither ginger nor the paste"*, *"tomato does not
replace lemon juice"* — and every line in the UI carries its reasoning.

It is also not trusted. Benchmarking eight models on one paneer recipe is the
reason this layer exists:

- **gpt-5.4-mini silently dropped ginger and garlic** from a dish that needs both
- **gpt-5.4-nano invented black pepper**, which appears nowhere in the recipe
- **gpt-5.4 tried to sell tomatoes** to a cook who had ticked "tomato"

So the model's plan is merged into the rules' plan, not substituted for it:

| The model does | What happens |
|---|---|
| Forgets an ingredient | The rules' verdict stands — *"model left it out, kept from the recipe"* |
| Invents an ingredient | Dropped — *"not in the recipe, ignored: chaat masala"* |
| Says buy something we **inferred** you had | Accepted; it knows things the rules don't |
| Says buy something you **told us** you have | Refused. Your kitchen is not the model's to overrule |
| Claims coverage with no reason | Refused unless the reason names something you own |
| Suggests buying water or salt | Ignored |

Every override is reported in the activity feed, live, during the demo.

The rules also got better because of the benchmark. Every one of the eight models
bought the whole bay leaf that our `garam masala` rule claimed to cover — and they
were right. **A ground blend covers a ground spice, never a whole one**: you temper
tej patta, a cinnamon stick or cumin seeds in hot fat, and a spoon of powder does
not do that job. That rule is now in the tests.

---

## Protein targets

> *"100g protein under 600"*

Protein turned out to be **free**. Of 99 cached recipe pages, **81 publish
`nutrition.proteinContent`** in the JSON-LD we already scrape — no extra call, and
no model inventing a number. Where a site doesn't publish it, the card says
*protein not published* rather than guessing.

A protein goal is read **before** the price, because otherwise "100g protein under
₹600" hands the 100 to the budget parser and plans a hundred-rupee dinner. Nothing
is hardcoded about what protein *is* — the planner already knows paneer, chicken,
fish, eggs and soya, and spreads the search across them. Say veg or non-veg and it
respects that; say neither and you get both.

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

**Why ingredients get priced before dishes get searched.** Searching first and
pricing after is what produced *"0 of 5 under ₹200"* — you pay 8 searches and 16
scrapes to learn nothing fits. Protein and cached prices are free, so the cheap
signals rank the *sources* first and the expensive search is aimed only at ones
that can clear the budget.

Two things this exposed, both fixed:

- The relevance gate demanded the craving appear in the recipe — and for a protein
  request the "ingredient" is a **goal, not a food**. It threw away 9 of 12 pages,
  including a 35 g fish curry.
- Protein queries returned **listicles** — "15 best high-protein recipes" — which
  carry no recipe markup at all. The planner is now told every query must aim at one
  dish's own page. Usable pages went from 3 of 12 to 14 of 16.

Variety still decides *which* five; a stated goal decides the order they're shown
in, so a 4 g dish can't sit above a 15 g one on a screen about protein.

---

## Variety

Ask seven search engines about paneer and they all hand back the same famous
gravy. Best-first ranking then gives you butter masala five times from five sites,
which is one idea, not five.

So **"something with paneer" and "Paneer Butter Masala" are treated as different
questions.** A bare ingredient is a request for ideas, and the search fans out
across *styles of cooking* rather than spellings of one dish. A named dish is a
request for that dish, and the angles stay on it.

Then each page is classified from the recipe itself — not from the query that
found it, because a page turned up by a "dry sabzi" search is often still a curry.
The shortlist spreads across dishes, styles **and sites** before it backfills on
score, and **"lighter" is only claimed when the ingredient list has no cream,
butter, ghee or deep frying** — it's a fact about the recipe, not a vibe.

The site rule earns its place. One measured run for "paneer" pulled **35 pages
from 21 distinct sites** — hebbarskitchen, vegrecipesofindia, indianhealthyrecipes,
tarladalal, nishamadhulika, ministryofcurry, rakskitchen, foodviva, cult.fit,
timesofindia, BBC Good Food, NYT Cooking and more. But the trusted Indian blogs
also score highest, so without a diversity rule the final five drifted into two
dishes each from the same two blogs. With it, five dishes come from five sites.

One real run, pantry of onion/tomato/oil/salt:

```
looking for different ways to cook paneer…
7 search angles · 35 distinct pages found
reading 16 of them, 5 at a time
5 dishes across 5 styles · gravy, snack, dry, rice, grilled

 • Paneer Chingari — Dhaba Style Gravy     gravy             20 min · 7/26
 • Paneer Cutlet | Paneer Tikki            starter           30 min · 6/21
 • Paneer 65 Fry                           dry sabzi         25 min · 6/27
 • Paneer Pulao                            rice              25 min · 5/25
 • Air Fryer Paneer Tikka                  grilled · lighter 53 min · 2/15
```

Ask for *Paneer Butter Masala* by name and you correctly get five versions of
butter masala instead — that's the question you asked.

### And it has to actually contain the thing

Search engines answer "oats" with pages that merely *mention* oats. A real run for
*"I want to eat oats dish today"* shortlisted **Tandoori Mushroom Tikka** and a
**chicken biryani** — neither contains a single oat. A dish that doesn't contain
the ingredient isn't a worse answer to the question; it isn't an answer at all.

Every candidate is now checked against its own parsed ingredient list, on the stem
so *oats* finds oatmeal, and through the regional alias table so *spinach* finds
palak. The feed says what it threw away — `5 pages dropped — no oats in the
recipe` — and if nothing survives you get the closest matches with a warning
rather than an empty screen.

Two smaller things from the same run: JSON-LD arrives HTML-escaped, so
`Oats Dosa Recipe (Instant &amp; Crispy)` is now decoded; and **a price said in one
message no longer pins itself to every later search**. The dial is a setting and
persists; a spoken price belongs to the message it was spoken in.

---

## Budget

Every dish is costed before you pick one. Set the price two ways:

- **the dial** — drag to any figure up to ₹2000, and choose `around` or `under`
- **just say it** — *"something with paneer around ₹400"*, *"paneer tikka under
  ₹450"*, *"chole below rs 300"*. The price is parsed out of the sentence, the
  dial moves to match, and the rest is used as the search

`around` is a target, not a wall: the price is an estimate, so a dish up to ~15%
over still counts as a fit. `under` is taken literally. Saying a price in the
sentence beats the dial — saying it out loud is the more explicit instruction.

A number alone is never a price. *"paneer 65 fry"* is a dish, *"biryani for 4
people"* is a headcount, and both used to parse as ₹65 and ₹4 until the tests
caught it — a budget needs a currency mark or a word like *around* / *under*.

Pricing five candidates live would be ~75 Wire calls per search, which on a
300-credit account is not a product. So prices come from **memory**:

- **live** — a real Flipkart Minutes price. Written to `cache/prices.json` as a
  free side effect of every stock check and every cart fill, and `npm run prices`
  warms the common terms deliberately at 1 credit each, once.
- **typical** — a seeded pack price, for the long tail only.

The seeded numbers turned out to be *systematically high*, which is the argument
for doing it properly: real paneer was ₹84 against a ₹95 guess, garam masala ₹32
against ₹65, kasuri methi ₹14 against ₹45.

The warm-up runs every candidate through the same matcher the cart uses, and that
caught a live bug worth keeping: **asked for "fresh cream", Flipkart's own
relevance order answers "Nandini Samrudhi Full Cream Milk"** — the word *cream* is
right there in the name. Word overlap agreed with it. So the matcher now knows that
milk, cream, butter, ghee, curd and paneer are not each other, that maida is not
atta and moong is not chana, and that a product's substance is its *last* noun.
Searching plain "cream" also returned a POND's face cream, so the beauty aisle is
excluded outright — the same failure that once put a lip crayon in a recipe.

The two are never blended silently. A card shows `≈ ₹415` for an estimate and
`₹415` only when every line came from a price we actually saw, plus how many of
the items it could price at all. **An estimate that hides its own coverage is a
lie with a ₹ in front of it.**

### What a budget is actually about

Ask for a paneer dish around ₹200 and the naive answer is *nothing qualifies* —
every dish costs ₹400–₹1000 because a cook with four things in the kitchen is
buying a spice rack, not a dinner. That made the feature useless, so there are
three numbers and each says what it means:

| | |
|---|---|
| **total** | What the checkout says today |
| **fresh** | The food you actually eat tonight |
| **meal** | The fresh food **plus a fair share of the jars** — this is what a budget is compared against |

The fair share is `keeps ÷ 8`, on the assumption a jar sees roughly eight dinners.
Both extremes are wrong and we hit both: charging a whole ₹140 cardamom tin to one
curry makes every dish unaffordable, and charging none of it let a dish needing
**22 new items on a ₹1563 shop** advertise itself as a ₹214 dinner. `PANTRY_USES`
is one constant at the top of `src/price.js`, deliberately visible.

Cards show both, so nothing is hidden at checkout:

```
≈ ₹181 to cook        ₹380 first shop
≈ ₹263 to cook        ₹606 first shop     over budget
```

### A stated price is a constraint, not a tiebreaker

Three things changed when a budget stopped being a scoring nudge:

1. **The search itself hunts cheap food.** Three extra angles — *budget friendly,
   few ingredients*, *simple everyday, 5 ingredients*, *sabzi without cream or
   cashew* — because cheap isn't a style you can sort your way into. Ten angles
   instead of seven, 46 candidate pages instead of 35.
2. **The shortlist is filled from the dishes that fit, first.** Variety decides the
   order *within* that set; dishes over the line are a last resort. Otherwise
   "five dishes under ₹200" comes back as five dishes over ₹200, arranged tastefully.
3. **A short shopping list is rewarded and source trust is halved.** At full weight
   a trusted blog's 16-ingredient korma outranked a 9-ingredient sabzi that was
   cheaper and fit better. Which blog it came from matters less than what was asked.

It still **never censors**: if nothing fits, you get the cheapest found and are told
so — *"Nothing came in under ₹200 — here are the 5 cheapest"* — because the price is
an estimate and an empty screen is not an answer.

### "around" is a target; "under" is a limit

These are different requests and they rank differently. Someone who says **around
₹500** has told you what they're willing to spend — answering with the cheapest
thing on the internet misreads them — so the score peaks *at* the budget and falls
off below it. Someone who says **under ₹500** has named a ceiling, and anything
below it is simply fine.

The same craving, the same kitchen, three ways:

```
"paneer dish around 500"     ₹392  ₹240  ₹442  ₹336  ₹306     ← lands near ₹500
"paneer dish under 500"      ₹242  ₹240  ₹336  ₹253  ₹306     ← lands under it
"something with paneer"      ₹392  ₹343  ₹287  ₹253  ₹228     ← price isn't a factor
```

With no price named **none of this applies** — the ranking is the normal one, best
dinner first. Most people, most of the time, are not on a tight budget.

Typed verbatim into the box, from a kitchen holding onion/tomato/oil/salt:

```
> hey I want to eat panner dish around 200

keeping the shop around ₹200
10 search angles · 46 distinct pages found
2 of 5 cook for around ₹200 · 2 found in range

 • Quick Paneer Sabji     gravy · lighter   ≈ ₹181 to cook    ₹380 first shop   need 9
 • Paneer Korma           gravy · lighter   ≈ ₹180 to cook    ₹580 first shop   need 16
 • Paneer Cutlet          starter           ≈ ₹263 to cook    ₹606 first shop   over budget
 • Paneer Bhurji          dry sabzi         ≈ ₹240 to cook    ₹347 first shop   over budget
 • Air Fryer Paneer Tikka grilled           ≈ ₹253 to cook    ₹360 first shop   over budget
```

That sentence also exercises the other half: **people type sentences, not search
queries.** `hey I want to eat panner dish around 200` is stripped to the craving
`paneer` — greeting, intent, the trailing word *dish*, the price, and the typo all
removed. Before that, the whole sentence went to the search engine *and* looked
like a named dish, so the agent stopped looking for variety or for anything cheap.

```bash
npm test     # 64 tests: the brain, the model checks, variety, pricing, matching
```

---

## Architecture

```
app/page.js               chat UI, dish cards, live SSE event feed
app/api/find/route.js     discovery — streams progress, returns 5 ranked dishes
app/api/cook/route.js     one dish — read the recipe, reason about the pantry
app/api/basket/route.js   fill the real cart, with readback proof

src/explore.js            multi-angle search → parallel scrape → rank
src/variety.js            style fan-out, dish classification, diverse shortlist
src/price.js              remembered prices, basket estimates, keeps-vs-eats split
src/knowledge.js          ingredients the agent has never met, learned once and kept
app/api/photo/route.js    image proxy — some food blogs block hotlinking
src/pipeline.js           recipe reading, ingredient parsing, scaling
src/reason.js             what genuinely needs buying — rules, model, and the
                          verification that keeps the model honest
src/pick.js               which product on the shelf is the right one
src/fill.js               the cart, in your own browser session
src/minutesdata.js        Wire: address, stock, catalog
src/sources.js            22 trusted Indian recipe sites, 11 general, a blocklist
src/synonyms.js           recipe language → Indian retail terms
src/anakin.js             Anakin adapters + a disk cache that never caches failures
src/units.js, brain.js    unit conversion, pack rounding and the older LLM
                          judgement points — still driving the BigBasket CLI
```

**Stack:** Next.js 16 (Turbopack) · React 19 · Tailwind v4 · Node 24, ESM.
Every route is SSE, so the UI shows the agent working rather than a spinner.

---

## How it uses Anakin

| Product | Used for |
|---|---|
| **Search API** | Finding recipe pages, several query angles per craving |
| **URL Scraper** | Reading them — 5 at a time, JSON-LD out the other side |
| **Wire · Build Studio** | Four custom Flipkart Minutes actions, built for this project |
| **Browser API** | Evaluated for cart automation — see *What we hit*, below |

The four Minutes actions live on catalog `flipkart-com` and were commissioned
through Build Studio during the hackathon ([MINUTES-WIRE.md](MINUTES-WIRE.md)):

| Action | Gives us |
|---|---|
| `act_flipkart_com_set_delivery_address` | The pincode gate, in one call instead of a human tap |
| `act_flipkart_com_list_products` | `available_quantity` — **stock, before we try to add** |
| `act_flipkart_com_add_to_cart` | The add itself |
| `act_flipkart_com_view_cart` | Independent verification |

`available_quantity` is the field that made this work. In the browser it is
invisible: an out-of-stock item still renders an Add button, the click silently
does nothing, and the only symptom is a cart badge that doesn't move. Reading
stock *first* replaced hours of blind retry loops.

### Wire reads, the browser writes

The Minutes actions are `auth_mode: none`, so they operate on an **anonymous**
cart — perfect for checking stock, useless for filling *your* basket. A
login-capable rebuild quotes at 5,000 credits.

So the split is deliberate: **Wire decides what's real and in stock; your own
Chrome does the add.** You end up looking at your own cart, on your own account,
with your own address — and nothing we run ever holds your credentials.

---

## What we hit

Seven platforms were tried before Flipkart Minutes worked. This is the honest table:

| Platform | Outcome |
|---|---|
| BigBasket (browser) | ❌ WAF block page, visible in Anakin's own session viewer |
| BigBasket (Wire) | ✅ Best product data — but no cart action exists |
| Amazon Fresh | ⚠️ `am_view_cart` exists; product pages come back stripped |
| Blinkit / Zepto / Instamart | ❌ Location-gated SPAs, no cart action |
| JioMart | ❌ 404s through the scraper |
| Flipkart (main) | ✅ Cart works — but it isn't quick commerce |
| **Flipkart Minutes** | ✅ **Works.** `marketplace=HYPERLOCAL` is the whole trick |

That last line cost a day. Flipkart Minutes is not a separate site — it is the
same Flipkart under a marketplace parameter, and `GROCERY` is the wrong one.

Things that also fought us, recorded in [ANAKIN-BUG-REPORT.md](ANAKIN-BUG-REPORT.md):

- Flipkart's UI is React Native Web: it ignores synthetic `.click()` and raw CDP
  `Input.dispatchMouseEvent`, and only accepts a real `move → down → up`
- `connectOverCDP` attaches to *every* open tab — 17 of them timed out the run
- The cart lives on a different tab than the one you searched from, so reading the
  wrong tab made every successful add look like a failure. That bug put five garam
  masalas in a real cart before we caught it
- Verifying an add by DOM index checked a *different* element list than the index
  came from, and cheerfully reported 4 of 4 added when none had landed

Which is why the agent now proves every add by reading the cart back. **A click is
never evidence.**

---

## Honesty rules the code follows

- A successful fetch means content was *retrieved*, not that it's correct
- Failures and empty responses are **never** cached — a poisoned cache silently
  breaks every later run
- Partial is partial: "12 of 16 added" is never reported as success
- Unknown stays unknown — an unconvertible unit never becomes a confident number
- The agent stops at a filled cart. **It never pays, and it never could**

## Limitations

- Cart filling needs your own Chrome on a debug port, and you logged into Flipkart
- Flipkart Minutes is live in limited pincodes; outside them, stock reads empty
- Recipe photos are whatever the source site published — occasionally a stock image
- Equipment ("I have no oven") is collected but doesn't yet filter recipes

## Docs

[DEMO-RUNBOOK.md](DEMO-RUNBOOK.md) · [MINUTES-WIRE.md](MINUTES-WIRE.md) · [BRAIN.md](docs/BRAIN.md) ·
[ANAKIN-REFERENCE.md](ANAKIN-REFERENCE.md) · [ANAKIN-BUG-REPORT.md](ANAKIN-BUG-REPORT.md) ·
[EMPIRICAL-TESTS.md](docs/EMPIRICAL-TESTS.md) · [PIVOT.md](docs/PIVOT.md)
