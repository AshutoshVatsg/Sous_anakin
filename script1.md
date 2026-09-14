# Sous — “Dinner starts before the cooking.”

Recording-ready demo script for the Anakin Forge submission and social video.

**Main cut:** approximately 90 seconds, around 200 spoken words. Record the actual workflow first, then record the voiceover against the footage. The timestamps below are editing targets, not claims about execution speed.

**The impression we want to leave:** “They used Anakin to connect real recipe sites to a real grocery cart—and built an agent that can explain its decisions.”

## 1. The main film — 90 seconds

### 0:00–0:06 · Start with the result

**SHOW:** A tight crop of the actual Flipkart cart from the recorded run. Product names and quantities visible; personal details masked. No title animation before the proof.

**SAY:**

> “This is my actual grocery cart. It started with one sentence.”

**ON SCREEN:** `One craving → a real cart`

**EDIT:** Cut back to Sous before the search. Small label: `Earlier in the same run`.

### 0:06–0:18 · Make the problem personal

**SHOW:** The dinner desk. Briefly open **My kitchen**, showing onion, tomato, oil and salt. Type `something with paneer around ₹200` and press **Find dinner**.

**SAY:**

> “I wanted something with paneer, around two hundred rupees. I already had a few ingredients. I didn't want another recipe to cross-check and shop for.”

**ON SCREEN:** `The craving. The budget. Your kitchen.`

### 0:18–0:30 · Introduce Sous through its work

**SHOW:** Real search and read events in the agent's notebook, then the recipe cards arriving. Bring the notebook into the crop; don't leave it unreadably small at the edge.

**SAY:**

> “So we built Sous. Anakin Search and URL Scraper bring in real recipe pages. Sous compares them with my kitchen and shows me what I can make.”

**ON SCREEN:** `BROWSE · Anakin Search + URL Scraper`

### 0:30–0:44 · The moment that makes it more than search

**SHOW:** Hold on one card's **you have / need** coverage. Select the dish, then settle on a complete ingredient-reasoning line. Use the tomato-purée example only if it appears in this recording.

**SAY:**

> “Here's the important bit: I have tomatoes. This recipe needs tomato purée. Sous keeps it on the shopping list—and explains why. Every missing ingredient gets that kind of check.”

**ON SCREEN:** `THINK · A reason for every ingredient`

**HOLD:** Leave the reason readable for at least three seconds. This is the shot people should remember.

### 0:44–0:55 · Make the economics understandable

**SHOW:** The plan's covered ingredients, missing items and cost breakdown. Point once at the distinction between cooking cost and buying full packs; avoid sweeping the cursor around.

**SAY:**

> “It separates what I own from what I need, and the cost of this meal from buying full packs. Estimates are marked. Missing information stays missing.”

**ON SCREEN:** `Cost to cook ≠ first-shop cost`

### 0:55–1:08 · Cross from advice into action

**SHOW:** Click **Add … to Flipkart Minutes**. Show the real product/stock events and the ingredient state changing. Shorten waits with an explicit `Wait shortened` caption.

**SAY:**

> “Then Anakin Wire checks real product listings and stock. Sous adds the missing groceries through my signed-in browser, showing the choices and anything it couldn't add.”

**ON SCREEN:** `ACT · Real products. Visible outcomes.`

### 1:08–1:21 · Prove it, then show the boundary

**SHOW:** The final cart readback in Sous, followed by the matching contents on Flipkart. Keep any failed-item count visible. Do not click a payment control.

**SAY:**

> “But an Add button isn't proof. It reads the cart back. These are the actual contents, not just its shopping list. Then it stops. I review. I pay.”

**ON SCREEN:** `Verified in the cart. Payment stays with you.`

### 1:21–1:30 · Give people a line to remember

**SHOW:** Return to the finished Sous workspace. End card: **Sous**, `Built with Anakin`, and the repository link.

**SAY:**

> “Anakin connects the web and the shop. Sous handles the work between craving and cooking. You make dinner. Sous does the homework.”

**END CARD:**

```text
sous.
You make dinner. Sous does the homework.

Built with Anakin
github.com/AshutoshVatsg/Sous_anakin
```

## 2. The 30-second social cut

Use the same real footage, edited more tightly. Keep large captions: the story must work with sound off.

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:05 | Actual Flipkart cart → craving input | “This grocery cart started with: ‘Something with paneer around two hundred rupees.’” |
| 0:05–0:12 | Search events → coverage bar | “We built Sous with Anakin. It reads real recipes and checks what you already have.” |
| 0:12–0:19 | One ingredient reason → real product selection | “It explains what's missing, finds the groceries, and adds them to your cart.” |
| 0:19–0:25 | Cart readback → matching retailer contents | “Then it checks what actually landed—and stops before payment.” |
| 0:25–0:30 | Sous end card | “You make dinner. Sous does the homework. What would you ask it to cook?” |

**Cover text:** `I gave an agent a craving. It filled my grocery cart.`

Don't squeeze the entire desktop into a vertical video. Reframe the input, coverage, reasoning and cart as separate shots. The UI is evidence, not background texture.

## 3. Optional Anakin showcase — add 35–45 seconds

For a longer judge-facing demo, insert this before the closing line. This is a **separate Cupboard flow**, not a continuation of the Minutes cart shown above.

**SHOW:** Navigate to **Cupboard**, select a small staple list, then show the phone-to-OTP handover. Mask the entire phone number and OTP. After verification, the current UI automatically continues stocking. Show its real readback and, if available, the matching regular Flipkart cart.

**SAY:**

> “We also built a cupboard flow using Anakin's cloud browser. Wire finds the products while the browser waits for my sign-in code. Once I authorise it, the browser adds the selected staples and reads the cart back.
>
> “That's why Anakin matters here: Search and URL Scraper reach the recipe web. Wire reaches the product data. The cloud browser lets this flow act inside an authenticated shopping session.
>
> “Sous supplies the kitchen context, ingredient decisions and checks. The result is an agent that can explain its work—and do something with it.”

**ON SCREEN:** `Separate flow · Cupboard · Anakin cloud browser`

**Optional builder-story line**, if you have room and the supporting request/action records on screen:

> “We also worked with Anakin's team on four custom Flipkart Minutes Wire actions during the hackathon. We weren't just consuming the platform—we helped expand what it could do.”

This last claim is documented in [the action request](docs/WIRE-REQUEST-MINUTES.md) and [the recorded Wire responses](MINUTES-WIRE.md). Do not imply that those anonymous-cart actions are what filled the signed-in cart in the main demo.

## 4. Let a real surprise become the best scene

Replace an existing line with one of these only when the recording supports it. Don't add all three and overcrowd the film.

**If the retailer enforces a different quantity:**

> “I asked for one. The retailer required two. Sous shows what actually landed—not what it hoped would happen.”

Show the retailer's quantity and minimum-order message. The historical example is documented in [DEMO-RUNBOOK.md](DEMO-RUNBOOK.md); use historical footage with a `Previous recorded run` label if it does not occur in this take. The Minutes parser does not currently expose every quantity field, so don't promise a quantity-two badge in Sous unless this run actually renders one.

**If a brand substitution occurs:**

> “The first choice couldn't be added. It found an alternative—and made the change visible.”

**If an item cannot be added:**

> “This one couldn't be added. It tells me why. A useful agent needs to report the gaps, not hide them.”

Keep the actual partial-success count. A small, clearly verified result is stronger evidence than a large shopping list presented as a completed cart.

## 5. Ready-to-post copy

### Short X / Twitter post

> I gave an agent a craving: “paneer around ₹200.”
>
> It read recipes, checked my pantry, explained what was missing, and filled a real grocery cart.
>
> Then it verified the cart—and stopped before payment.
>
> Meet Sous. Built with Anakin.
>
> You cook. It does the homework.

Attach the real demo. Put the repository link in a reply and tag Anakin's official account after checking the correct handle. Publish the completed-cart wording only with a recording that proves it.

### Longer caption / LinkedIn / launch thread opener

> The annoying part of cooking isn't always cooking.
>
> It's finding a recipe, checking the cupboard, translating the ingredients into grocery searches, and working out what you actually need to buy.
>
> We built Sous to take on that work.
>
> Give it a craving and tell it what's in your kitchen. It reads real recipe pages, compares the ingredients, explains what's missing, and adds groceries to a real Flipkart cart. Then it reads the cart back and leaves the payment to you.
>
> Anakin powers the web access: Search and URL Scraper for recipes, Wire for product data, and Browser API for our separate cloud-based cupboard flow.
>
> My favourite detail: it can explain why having tomatoes doesn't necessarily cover tomato purée. That small decision is the difference between matching words and helping someone cook.
>
> You make dinner. Sous does the homework.
>
> Watch the demo. What would you ask it to cook?

## 6. Recording checklist — keep the proof clean

- **Record a real run.** `scripts/ui-smoke.mjs`, `test/ui-fixtures.mjs` and the screenshots in `cache/ui-review/` use synthetic browser-test data. They are useful for UI review, not evidence of real shopping.
- **Choose the working path before recording.** In the current code, `/api/basket` connects to local Chrome on debug port 9222 through `src/fill.js`. The separate `/pantry` flow uses Anakin's cloud browser. An extension is mentioned in older documentation but is not what the current main route calls. Rehearse the intended setup; don't assume the home screen alone is enough.
- **Make the pincode real.** The main basket route defaults to `560102`; the UI currently does not send a user-selected pincode. Confirm that it matches the test shopping context. Do not claim nationwide availability.
- **Make the pantry real.** Select ingredients you actually have. Choose a naturally short missing-item list where possible; don't tick ingredients you don't own just to manufacture a cleaner result.
- **Check the cart before and after.** Pre-existing items must not be presented as additions made by this run. Use a dedicated test context if available; don't erase someone's existing groceries for the video.
- **Rehearse without wasting OTP attempts.** Keep the phone ready for Cupboard, select a short list, and start recording before sign-in. Project logs document short-lived cloud sessions; don't spend that session filming a long introduction. Do not use another person's number to work around a rate limit.
- **Distinguish fresh reads from cached data.** Search and recipe scraping are cached by the app. If your recording uses them, add `Cached recipe results; cart actions recorded separately` or another precise label. Don't call a cached response a fresh live search.
- **Keep the edit honest.** Caption sped-up sections `Sped up` and jump-cut waits `Wait shortened`. Never edit unrelated runs into an apparent single successful transaction. Keep the original recording.
- **Protect private information.** Mask phone numbers, codes, names, delivery addresses, account details, keys and debug URLs. Disable notifications before recording.
- **Preserve price meaning.** ₹200 is the requested cooking budget, not a promise that full packs plus checkout charges cost ₹200. Keep estimate marks, unknown prices and failed-item counts visible.
- **Prioritise legibility.** Record at 1920×1080, use restrained cursor movement, and crop into evidence. Keep captions away from reasoning, prices and the cart. Lower background music under the narration; let “I review. I pay.” breathe.
- **End with the actual boundary.** Show the review link and stop. Say “added to the cart,” not “ordered,” “paid,” or “delivered.” This prototype's no-payment behaviour is a deliberate workflow boundary, not a claim that the browser is technically incapable of clicking payment controls.

## 7. What to leave out of this film

Don't lead with the tech stack, a logo sequence, a feature inventory, or “the best AI agent.” Don't spend the core 90 seconds on bug counts, unsupported time savings, guaranteed nutrition, exact search counts from another run, or claims that every activity row is a separate API request—some rows report local reasoning and checks.

The film only needs to earn four beliefs:

1. It read real recipes.
2. It understood something specific about this kitchen.
3. It acted on a real shopping site and checked the result.
4. The person stayed in control.

**Let the viewer decide it's cool. Give them the evidence to get there.**

---

Prepared against the current frontend, `app/api/basket/route.js`, `app/api/pantry/route.js`, `src/anakin.js`, `src/fill.js`, `UI-BRIEF.md`, and the project's recorded demo evidence. This file is a shooting script, not a report that a new live shopping run has been performed.
