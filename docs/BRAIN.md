# The reasoning layer

## The design principle

> **LLM decides. Code computes.**

| The model judges | Code calculates |
|---|---|
| What does this person actually want? | Serving scale arithmetic |
| Which recipe suits their kitchen? | Pack rounding `ceil(need ÷ pack)` |
| **Which of 266 products is the right one, and why?** | Line totals, basket total |
| Is this substitute acceptable for this dish? | Stock filtering, dedupe |

Never let a model do arithmetic. Never let a regex make a judgement call. The first version had it backwards — the "think" layer was string matching.

## Why it matters — a real failure from a live run

Deterministic matching produced:

```
"1 to 2 tablespoons coriander leaves"  →  Mai Rasoi Whole Coriander SEEDS · 50 g
```

**Seeds are not leaves.** No amount of token-overlap scoring catches that — the words match perfectly. The model's first rule does:

> *"It MUST actually be the ingredient. A sauce/paste/pickle is NOT the raw ingredient. Reject mismatches."*

Same class of bug as the earlier `half-and-half → Matte Lip Crayon`. Category filters patch symptoms; judgement fixes the cause.

## Four reasoning points

| # | Function | Job |
|---|---|---|
| 1 | `understand(text)` | Free text → `{dish, pantry[], equipment[], serves}`. Lets someone type *"I'm hungry, something with paneer, I've got onion and oil"* |
| 2 | `chooseRecipe(candidates, ctx)` | Picks the candidate matching their equipment. Returns a reason |
| 3 | **`chooseSku(ing, products)`** | **The high-value one.** Sees the real shortlist with pack sizes, prices, stock — picks one and explains in ≤12 words. Returns `-1` to reject all |
| 4 | `judgeSubstitution(...)` | Is the replacement acceptable for *this* dish? |

`chooseSku`'s `why` string is surfaced directly in the UI — genuine reasoning, shown to the user, not decoration.

## Degrades safely

`hasBrain()` is false without a key, and **every function falls back to the deterministic path**. The app never hard-fails; the demo always runs. This also means we can demo with or without spending OpenAI credits.

```
no key  → deterministic ranking      (0 LLM cost, ~20s/run)
key set → model judgement + reasons  (~10-14 calls/run)
```

## Setup

Add to `.env` (already gitignored):

```
OPENAI_API_KEY=sk-...
LLM_MODEL=gpt-4.1-mini      # optional override
```

⚠️ **Verify the model name against your account before the demo** — model IDs change, and my knowledge has a cutoff. List what your key can actually call:

```bash
curl -s https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  | grep -o '"id":"gpt[^"]*"' | sort -u
```

Then set `LLM_MODEL` to one of those. Pick a small/cheap one — every call is a short structured-JSON request.

## Cost

~10–14 calls per run, all small (≤700 output tokens, JSON mode, temperature 0.1).
On a cheap small model that's well under $0.01 per run — your $20 covers thousands of runs, not dozens.

**But dev iteration should stay on the deterministic path.** Only switch the key on when you're testing reasoning quality or recording the demo.

## Why OpenAI here

You have $20 of OpenAI credit, so that's what `brain.js` targets. The layer is a single `think()` function — swapping providers is a one-function change if you ever want to.
