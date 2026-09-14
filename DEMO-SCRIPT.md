# Demo script — Sous

Shooting script for the submission video. **Target 2:30.** A 90-second cut is at the bottom.

Two rules while recording:

1. **Never say a thing the screen isn't doing.** The activity feed is real; let it carry you.
2. **Don't narrate the UI.** Say why it matters, not what it is. The screen shows *what*.

---

## The 30-second version

*If you ever have to pitch it out loud with no screen:*

> Five tabs open, a recipe on each, and you still can't tell if you can make any of them — because none of those pages knows what's in your kitchen. Sous is an agent that closes that gap. You say what you feel like and tick what you've got. It reads the live web — real recipe blogs, not a fixed catalogue — ranks dishes by how much you already own, works out what's genuinely missing, and fills your actual Flipkart cart with real products at real prices. Then it stops, because you're the one who pays. Anakin is what made it possible: Search and URL Scraper for the web, Wire for live product data, and four custom Flipkart Minutes actions their team built for us during the hackathon.

---

## The 2:30 script

### 0:00 – 0:15 · The problem

| Screen | Voiceover |
|---|---|
| Browser with 5 recipe tabs open. Slowly cycle through two of them. | *"Five tabs open, a recipe on each — and I still can't tell if I can make any of them. Because none of these pages knows what's in my kitchen."* |
| Cut to Sous, empty state. | *"So I built an agent that does."* |

> **Note:** the tabs shot takes ten seconds and is worth it. It's the only moment that earns the viewer's attention before you start showing features.

---

### 0:15 – 0:35 · The ask, and the browse

| Screen | Voiceover |
|---|---|
| Type: **`something with paneer around ₹200`** | *"I tell it what I feel like."* |
| Tick pantry chips: onion, tomato, oil, salt | *"And what I've already got."* |
| Hit Find. Activity feed starts streaming. | *"Now it goes and reads the web — properly."* |
| Feed shows the plan line, then the search angles | *"Ten different search angles, because 'paneer' isn't one question — dry sabzi, gravy, grilled, and three more hunting specifically for cheap food, since I named a budget."* |
| Feed shows pages being read | *"Forty-six pages found. Sixteen of them read in parallel — through Anakin's Search API and URL Scraper. Real recipe blogs, not a fixed catalogue."* |

> **Point at the feed, not away from it.** Every line is a live API call. That's the proof this isn't scripted, and judges at an API company will look.

---

### 0:35 – 1:00 · The think

| Screen | Voiceover |
|---|---|
| Five dish cards land | *"Five dishes — and deliberately five **different** dishes, from five different sites. Ask seven search engines about paneer and they all hand back the same famous gravy."* |
| Hover/point at a coverage bar: **you have 5/14** | *"But this is the bit that matters. They're ranked by how much I **already own**. Not by what's popular — by what's in my kitchen."* |
| Point at prices | *"Each one costed before I pick it, so 'around ₹200' actually means something."* |

---

### 1:00 – 1:30 · The reasoning — **the heart of the demo**

| Screen | Voiceover |
|---|---|
| Click a dish. Plan panel opens. | *"I pick one, and it re-reads that recipe and works out what I'm genuinely missing."* |
| Scroll slowly through NEED TO BUY. **Pause on a reasoning line.** | *"And every line has a reason."* |
| Read one aloud, verbatim from screen | *"'Fresh tomato does not cover tomato purée in this recipe.' I ticked tomato. It's still buying purée — and it tells me why."* |
| Point at another | *"My chilli powder doesn't cover whole green chillies. A ground spice blend doesn't cover a whole bay leaf — you temper those in hot fat, powder can't do that job."* |
| Point at quantities | *"Scaled to two people, and rounded up to real pack sizes. You can't buy a quarter of a cinnamon stick."* |

> **Slow down here.** This is the 30 seconds that separates you from a recipe app with a shopping list. Let a reasoning line sit on screen long enough to actually read.

---

### 1:30 – 2:05 · The act

| Screen | Voiceover |
|---|---|
| Hit the fill button. Feed resumes. | *"Then it shops."* |
| Feed shows Wire returning options | *"Anakin's Wire turns 'garam masala' into a real Flipkart listing — actual product, actual price, and on Minutes, actual stock. So it knows something's out of stock **before** it tries to add it."* |
| Feed shows the model choosing | *"The model picks which of the ten is really the thing — because ten results for 'coriander' includes the seeds and the leaves, and they're not the same ingredient."* |
| Items tick over to added | *"Then it adds them."* |
| **Cart readback appears** | *"And then it reads the cart back. Because a click is never evidence."* |
| **Point at `Minimum Order Quantity: 2`** *(if present)* | *"Look at this — I asked for one. Flipkart quietly enforced a minimum of two. The agent knows, because it checked instead of trusting itself."* |

---

### 2:05 – 2:30 · The stop, and Anakin

| Screen | Voiceover |
|---|---|
| Final cart state on screen | *"And then it stops. The cart's full, on my real account. I open Flipkart and I pay."* |
| Hold a beat | *"It never pays. It never could. That's deliberate."* |
| Cut to the repo / Anakin actions list | *"None of this has an API. Recipes live on independent blogs; prices and stock live behind a retailer. **Anakin is what made both reachable** — Search and URL Scraper for the web, Wire for live product data, and four custom Flipkart Minutes actions their team built for us mid-hackathon, after we found there was no grocery cart action anywhere in the catalogue."* |
| End card: Sous + repo URL | *"Browse. Think. Act. Then stop, and let the human pay."* |

---

## Pre-flight — do all of this before you hit record

**Warm the cache.** Run your exact demo craving once beforehand. `src/anakin.js` caches by request hash, so the take is fast, free, and can't fail mid-search.

- [ ] `npm test` — 64 passing
- [ ] `npm run dev` up, correct port
- [ ] Run the demo craving once to warm it
- [ ] `curl -s localhost:3000/api/pantry/signin` → expect `connected:false` (clean slate)
- [ ] Phone in hand if the act path needs an OTP
- [ ] Browser zoom ~110% — the activity feed must be readable at 1080p
- [ ] Close other tabs except the five for the opening shot
- [ ] Screen recorder at 1080p, cursor highlighting on

**Sign in off-camera if you're using the cloud-browser path.** The session dies at 102–167s and OTP attempts are finite. Signing in first and starting the recording at the add is a normal edit, not a cheat — you're not claiming it was one continuous take.

---

## If something breaks

| Breaks | Do this |
|---|---|
| Search returns nothing | Stop. Check credits — an empty wallet reads as an empty internet. Cached craving avoids this entirely |
| Cloud session dies mid-add | `curl -X DELETE localhost:3000/api/pantry/signin`, retry with fewer items. **Costs a fresh OTP** |
| An item fails to add | **Keep it in.** *"Twelve of sixteen"* honestly reported is better than a fake clean run — and the feed says why it failed |
| No out-of-stock happens naturally | Don't fake one. If you must show the path, say **"simulated stock failure"** on screen. Judges respect a deliberately triggered failure; a fabricated organic one is disqualifying |

---

## The 90-second cut

If the submission caps at 90 seconds, keep these and drop the rest:

| | |
|---|---|
| 0:00–0:10 | Five tabs. *"None of these knows what's in my kitchen."* |
| 0:10–0:25 | Type the craving, tick the pantry, feed starts. Name **Anakin Search + URL Scraper** once |
| 0:25–0:40 | Five cards. **Point at the coverage bar.** *"Ranked by what's already in my kitchen."* |
| 0:40–1:05 | **The reasoning panel.** Read one line aloud. This is non-negotiable — it's the whole differentiator |
| 1:05–1:25 | Fill the cart. **Wire for real products and stock**, then the readback |
| 1:25–1:30 | *"Then it stops. I pay."* |

**What gets cut:** the budget explanation, the variety explanation, the protein flow, the bug report. All of it is in the README for anyone who wants it.

**What never gets cut:** the coverage bar, one reasoning line read aloud, and the cart readback. Those three are the product.
