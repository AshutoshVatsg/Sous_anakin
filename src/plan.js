// Turning a sentence into a search the agent chose for itself.
//
// WHY THIS EXISTS
// The old path ran seven fixed query templates — dry sabzi, gravy, tikka, rice —
// with whatever text was left after a regex stripped the filler. Typing
// "find me best dry chicken dish" produced:
//
//     dry best dry chicken sabzi recipe without gravy
//     best dry chicken pulao biryani rice recipe
//
// Nonsense queries, and then a shortlist deliberately spread across gravy, rice
// and snack — ignoring the one thing the cook actually asked for. Templates cannot
// know that "dry" is a constraint, that "jain" means no onion or garlic, that
// "under 30 minutes" is about cook time, or that chicken is not cooked like paneer.
//
// So the agent reads the sentence and decides what to search for. Code still does
// the searching, the reading, the arithmetic and the verifying — but the PLAN is
// the model's, which is the difference between an agent and a form.
import fs from 'node:fs';
import path from 'node:path';
import { readCraving, styleQueries, dishQueries, budgetQueries } from './variety.js';

const ROOT = process.cwd();
function envVal(name) {
  if (process.env[name]) return process.env[name].trim();
  try {
    const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(new RegExp(`^${name}=(.+)$`, 'm'));
    return m ? m[1].trim() : null;
  } catch { return null; }
}
const KEY = envVal('OPENAI_API_KEY');
const MODEL = envVal('LLM_MODEL') || 'gpt-5.4';
export const canPlan = () => Boolean(KEY);

async function ask(system, user, { maxTokens = 1500 } = {}) {
  if (!KEY) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        response_format: { type: 'json_object' },
        max_completion_tokens: maxTokens,
      }),
    });
    const text = await res.text();
    if (!res.ok) { console.warn('[plan]', res.status, text.slice(0, 140)); return null; }
    return JSON.parse(JSON.parse(text).choices[0].message.content);
  } catch (e) { console.warn('[plan] failed:', String(e.message).slice(0, 90)); return null; }
}

/** The deterministic plan, used when there's no key and as the shape of the answer. */
export function fallbackPlan(text, budget = 0) {
  const { ingredient, broad } = readCraving(text);
  const queries = broad
    ? (budget > 0 ? [...budgetQueries(ingredient), ...styleQueries(ingredient)] : styleQueries(ingredient))
    : dishQueries(ingredient);
  return { ingredient, broad, wants: [], avoid: [], queries, planned: false };
}

/**
 * Read what the cook asked for and decide how to go looking for it.
 *
 * Returns { ingredient, broad, wants[], avoid[], queries[], planned }.
 * `wants` are the constraints they stated in their own words — they are enforced
 * later against the recipes we actually read, not just hoped for in the query.
 */
export async function planSearch(text, { pantry = [], budget = 0, mode = 'around', protein = null } = {}) {
  const fallback = fallbackPlan(text, budget);
  if (!KEY) return fallback;

  const out = await ask(
    `You plan recipe searches for an Indian grocery agent.

Read what the cook typed and decide how to search. Think about what they actually
constrained, not just the food word:

- "dry chicken" constrains the STYLE — no gravy. "chicken curry" constrains it the
  other way.
- "jain" means no onion, no garlic, no root vegetables. "no onion no garlic" the same.
- "quick" / "under 30 minutes" constrains cook time.
- "high protein", "low oil", "keto", "vegan" constrain the ingredients.
- A named dish ("Paneer Butter Masala") is not a constraint — it IS the request,
  and then broad is false and every query should hunt the best version of that dish.

When the cook asks for PROTEIN, they have not named an ingredient — they've named a
goal. Set "ingredient" to the protein source you'd actually build the meal around,
and spread the queries across several genuine high-protein sources: paneer, chicken,
eggs, fish, soya chunks, dal, curd, tofu. Respect veg/non-veg if they said one, and
cover both if they did not. Search for dishes where the protein is the substance of
the meal, not a garnish.

Give 6-8 search queries that a real recipe site would rank for. Write them the way
someone searches, not as a sentence.

EVERY query must be aimed at ONE dish's own recipe page. Queries like "high protein
indian recipes" or "15 best protein dishes" return roundup articles with no recipe
on them — asking that way, nine of twelve pages we opened had nothing to cook. So
name the dish: "soya keema recipe", "egg bhurji recipe", "fish curry recipe",
"paneer tikka recipe". Always include the word "recipe". Use the words a cook would use for THIS food —
chicken is roasted, fried, tandoori, sukka; paneer is bhurji, tikka, sabzi. Cover
different genuine variations when the request is broad, but never contradict a
stated constraint: if they said dry, do not search for gravy.

Reply with JSON only, shaped exactly like:
{"ingredient":string,"broad":boolean,"wants":[string],"avoid":[string],"queries":[string]}

"ingredient" is the food to look for, cleaned of filler ("find me best dry chicken
dish" -> "chicken"). "wants" are the constraints in short plain words a cook would
recognise, e.g. ["dry, not gravy"], ["no onion or garlic"], ["ready in 30 minutes"].`,
    JSON.stringify({
      typed: text,
      already_have: pantry,
      budget: budget || null,
      budget_mode: budget ? mode : null,
      protein_goal_grams: protein?.goal || null,
      wants_protein: Boolean(protein?.wanted),
      diet: protein?.diet || null,
    }),
  );

  const queries = (out?.queries || []).map((q) => String(q).trim()).filter(Boolean).slice(0, 8);
  if (!out?.ingredient || queries.length < 3) return fallback;

  const broad = out.broad !== false;
  return {
    ingredient: String(out.ingredient).trim(),
    broad,
    // A named dish is the request, not a constraint on it. Left in, "Paneer Butter
    // Masala" became a want and every candidate got re-judged against its own name.
    wants: broad ? (out.wants || []).map((w) => String(w).trim()).filter(Boolean).slice(0, 4) : [],
    avoid: broad ? (out.avoid || []).map((w) => String(w).trim()).filter(Boolean).slice(0, 6) : [],
    queries: queries.map((q, i) => ({ tag: `q${i + 1}`, q })),
    planned: true,
  };
}

/**
 * Which of these shelf products IS the ingredient?
 *
 * Rules narrow the field well and then fall over on the last step. Asked for
 * "banana" the shop offered **Banana Stem** — a vegetable — and the word-overlap
 * check waved it through; "vanilla extract" matched **Custard Powder Vanilla**.
 * Each miss is its own special case and a table of them never ends.
 *
 * So the shortlist stays code — in stock, right substance, not from the beauty
 * aisle — and the final "is that actually the thing" is judged. Batched: one call
 * for a whole shopping list, not one per item.
 *
 * Returns Map of term -> { index, why } where index is null for "none of these".
 */
export async function verifyProducts(items = []) {
  const out = new Map();
  if (!KEY || !items.length) return out;

  const answer = await ask(
    `You are checking a grocery app's search results.

For each ingredient, pick the option that genuinely IS that ingredient, or say none.
Be literal about what the product is:

- "Banana Stem" is a vegetable, not a banana.
- "Custard Powder Vanilla" is not vanilla extract.
- "Maggi Pazzta Instant Cheese Macaroni" is a ready meal, not plain pasta.
- A brand in front is fine: "Amul Malai Paneer" IS paneer.
- A different form is fine when that is how it sells: "Turmeric Powder" IS turmeric.

Prefer the plainest version of the thing. Give a short reason.

Reply with JSON only, shaped exactly like:
{"picks":[{"term":string,"index":number|null,"why":string}]}`,
    JSON.stringify({ items: items.map((it) => ({ term: it.term, options: it.options.slice(0, 8) })) }),
    { maxTokens: 2000 },
  );

  for (const p of answer?.picks || []) {
    if (typeof p.term === 'string') {
      out.set(p.term, {
        index: typeof p.index === 'number' ? p.index : null,
        why: String(p.why || '').slice(0, 90),
      });
    }
  }
  return out;
}

/**
 * Check the recipes we actually read against what the cook asked for.
 *
 * This is the half that templates can never do. A query for "dry chicken" still
 * returns curries; only reading the ingredients tells you which. Returns a Map of
 * index -> { ok, why }; an empty Map means we couldn't judge and nothing is dropped.
 */
export async function judgeDishes(cards, wants = [], avoid = []) {
  const verdicts = new Map();
  if (!KEY || !cards.length || (!wants.length && !avoid.length)) return verdicts;

  const out = await ask(
    `You are checking recipes against what a cook asked for.

For each dish decide whether it genuinely satisfies EVERY constraint. Judge from the
ingredients and the title, not from the name alone — a "dry roast" with a cup of
coconut milk is not dry, and a dish listing onion does not satisfy "no onion".

Be strict but not pedantic: a dish is fine if it meets the constraint as a cook
would understand it. Give a short reason either way.

Reply with JSON only, shaped exactly like:
{"dishes":[{"i":number,"ok":boolean,"why":string}]}`,
    JSON.stringify({
      must: wants,
      avoid,
      dishes: cards.map((c, i) => ({
        i,
        title: c.title,
        minutes: c.minutes || null,
        ingredients: (c.ingredients || []).map((x) => x.name).slice(0, 30),
      })),
    }),
    { maxTokens: 2500 },
  );

  for (const d of out?.dishes || []) {
    if (typeof d.i === 'number' && cards[d.i]) {
      verdicts.set(d.i, { ok: Boolean(d.ok), why: String(d.why || '').slice(0, 120) });
    }
  }
  return verdicts;
}
