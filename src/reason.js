// The reasoning layer — deciding what actually needs buying.
//
// Division of labour:
//   model -> judgement  (does my garam masala cover these three spices? is tomato
//                        purée the same as a tomato? what substitutes for cream?)
//   code  -> arithmetic (scaling, pack rounding, totals) and all verification
//
// One call reasons over the WHOLE recipe rather than ingredient-by-ingredient,
// because the interesting judgements are relational: a blend covering three spices,
// or two lines being the same thing measured differently.
//
// Everything degrades to a deterministic path when no key is set, so the agent
// always runs — it just reasons less well.
import fs from 'node:fs';
import path from 'node:path';
import { scaleQuantity } from './pipeline.js';

const ROOT = process.cwd();
function envVal(name) {
  if (process.env[name]) return process.env[name].trim();
  try {
    const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(new RegExp(`^${name}=(.+)$`, 'm'));
    return m ? m[1].trim() : null;
  } catch { return null; }
}

const KEY = envVal('OPENAI_API_KEY');
// Picked by eval, not by feel: three recipes × hand-checked shopping lists, scored
// on what it missed, what it tried to sell you that you already own, and what it
// invented. Nine models; gpt-5.4 tied for the best score and was the only one at
// that score with no reasoning-token surcharge. See README → Which model.
const MODEL = envVal('LLM_MODEL') || 'gpt-5.4';
export const thinking = () => Boolean(KEY);

let calls = 0;
export const reasoningCalls = () => calls;

// The two model families disagree about how to name the same two parameters:
// gpt-5.x wants max_completion_tokens and rejects a temperature it didn't choose,
// gpt-4.x wants max_tokens. Rather than keep a table of which is which — it would
// be wrong the week a new model ships — send the modern spelling and fall back
// once on the specific complaint.
async function ask(system, user, schema, { maxTokens = 2000 } = {}) {
  if (!KEY) return null;

  const body = (legacy) => ({
    model: MODEL,
    messages: [
      { role: 'system', content: `${system}\n\nReturn JSON only, shaped exactly like: ${schema}` },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
    ...(legacy ? { max_tokens: maxTokens, temperature: 0.1 } : { max_completion_tokens: maxTokens }),
  });

  const post = async (legacy) => {
    calls++;
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body(legacy)),
    });
    return { res, text: await res.text() };
  };

  try {
    let { res, text } = await post(false);
    if (!res.ok && /max_completion_tokens|max_tokens/.test(text)) ({ res, text } = await post(true));
    if (!res.ok) { console.warn('[reason]', res.status, text.slice(0, 140)); return null; }
    return JSON.parse(JSON.parse(text).choices[0].message.content);
  } catch (e) { console.warn('[reason] failed:', e.message.slice(0, 90)); return null; }
}

/* ================= deterministic fallback knowledge ================= */

// Blends that make their component spices unnecessary.
const COVERS = {
  'garam masala': ['cumin', 'coriander', 'cardamom', 'clove', 'cinnamon', 'bay leaf', 'peppercorn', 'nutmeg', 'mace'],
  'sambar powder': ['coriander', 'cumin', 'fenugreek', 'red chilli', 'turmeric'],
  'curry powder': ['turmeric', 'cumin', 'coriander', 'fenugreek'],
  'pav bhaji masala': ['cumin', 'coriander', 'red chilli', 'amchur'],
  'chaat masala': ['cumin', 'amchur', 'black salt'],
  'ginger garlic paste': ['ginger', 'garlic'],
};

// Things nobody shops for.
const ASSUMED = /^((?:hot |cold |warm |lukewarm )?water|ice(?: cubes)?|(?:table |kosher |sea |rock |pink |himalayan )?salt|to taste|as required|as needed|oil for frying)$/i;

// Processed forms. If the RECIPE asks for one and the pantry item is the plain
// ingredient, it is NOT covered — tomato purée is not a tomato, and ginger paste
// is not a knob of ginger.
const FORMS = ['puree', 'purée', 'paste', 'powder', 'sauce', 'ketchup', 'pickle', 'dried', 'frozen', 'crushed', 'ground'];

const bits = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);

// Size and knife-work words describe a recipe line without changing what you buy:
// nobody stocks "large white onion" separately from "onion". Note that "fresh",
// "dried" and "whole" are deliberately NOT here — those do change the product.
const NOISE = new Set([
  'large', 'medium', 'small', 'big', 'extra', 'baby', 'jumbo', 'thin', 'thick', 'long',
  'sized', 'heaped', 'level', 'generous', 'firm', 'soft',
  'chopped', 'sliced', 'diced', 'minced', 'grated', 'finely', 'roughly', 'thinly',
  'cubed', 'peeled', 'deseeded', 'slit', 'halved', 'quartered', 'julienned',
  'shredded', 'torn', 'beaten', 'washed', 'rinsed', 'cut',
]);

// Colour is usually cosmetic — a red onion is an onion — but for a few foods it IS
// the product: a green chilli is not a red chilli. So a colour word in the recipe
// line is only binding when it matters for that food AND the pantry names a colour
// too, which keeps "chilli powder" covering "red chilli powder".
const COLOURS = new Set(['red', 'green', 'white', 'yellow', 'black', 'brown', 'purple', 'golden']);
const COLOUR_MATTERS = /chilli|chili|pepper|capsicum|lentil|\bdal\b|rice|vinegar|wine|sugar|cabbage|grapes?|beans?|sesame/i;

/**
 * Does a pantry item satisfy this recipe line?
 * Requires every meaningful word of the ingredient to be present in the pantry item —
 * so "ginger garlic paste" covers "ginger paste", but plain "tomato" does not cover
 * "tomato puree".
 */
function pantryCovers(pantryItem, ingredientName) {
  const have = bits(pantryItem);
  const raw = bits(ingredientName).filter((w) => w.length > 2);
  if (!raw.length || !have.length) return false;

  const colourBinds = have.some((h) => COLOURS.has(h)) && COLOUR_MATTERS.test(ingredientName);
  const want = raw.filter((w) => {
    if (NOISE.has(w)) return false;
    if (COLOURS.has(w)) return colourBinds;
    return true;
  });
  if (!want.length) return false;

  // every word the recipe still asks for must appear in what you have
  const allPresent = want.every((w) => have.some((h) => h === w || h.startsWith(w) || w.startsWith(h)));
  if (!allPresent) return false;

  // If the recipe wants a processed form, the pantry item must have it too.
  const wantedForm = FORMS.find((f) => want.includes(f));
  if (wantedForm && !have.some((h) => h.startsWith(wantedForm.slice(0, 5)))) return false;

  // And the other way round: a processed pantry item does not cover a whole one.
  // Chilli powder is not a green chilli; coriander powder is not a bunch of coriander.
  const heldForm = FORMS.find((f) => have.some((h) => h.startsWith(f.slice(0, 5))));
  if (heldForm && !wantedForm) return false;

  return true;
}

export function rulePlan(recipe, pantry, servings) {
  const scale = servings / (recipe.serves || servings);
  const owned = pantry.map((p) => p.toLowerCase().trim());
  const coveredBy = {};
  for (const [blend, parts] of Object.entries(COVERS)) {
    // The pantry item must NAME the blend. Matching the other way round meant
    // owning plain "ginger" claimed everything ginger-garlic paste covers.
    if (owned.some((o) => o.includes(blend))) parts.forEach((p) => { coveredBy[p] = blend; });
  }

  const have = [], buy = [];
  const seen = new Map();
  for (const ing of recipe.ingredients) {
    const name = ing.name || '';
    if (ASSUMED.test(name.trim())) { have.push({ ...ing, reason: 'kitchen staple' }); continue; }

    const match = owned.find((o) => pantryCovers(o, name) || pantryCovers(o, ing.term || ''));
    if (match) { have.push({ ...ing, reason: `you have ${match}` }); continue; }

    // A ground blend covers the GROUND spice and nothing else.
    //
    // Two ways that goes wrong. The fresh herb: garam masala has coriander seed,
    // not the leaves you scatter on top. And the WHOLE spice: you temper a bay
    // leaf, a cinnamon stick or cumin seeds in hot fat and they perfume the oil —
    // a spoon of ground blend does not do that job. Eight different models were
    // asked this and every one of them bought the whole tej patta; they were right
    // and the first version of this rule was wrong.
    const fresh = /\b(leaves|leaf|fresh|sprigs?|stalks?|bunch)\b/i.test(name);
    const whole = /\b(whole|stick|sticks|pods?|seeds?|crushed|split|badi|sabut)\b/i.test(`${name} ${ing.raw || ''}`);
    // And the cover has to be the ingredient itself, not a word inside it. A plain
    // substring test had garam masala covering "6 garlic cloves" — those cloves are
    // segments of garlic, not the spice.
    const cover = (fresh || whole) ? null : Object.keys(coveredBy).find((c) => {
      if (/clove/.test(c) && /\bgarlic\b/i.test(name)) return false;
      return new RegExp(`\\b${c}s?\\b`, 'i').test(name);
    });
    if (cover) { have.push({ ...ing, reason: `covered by your ${coveredBy[cover]}` }); continue; }

    const key = ing.term || name;
    if (seen.has(key)) { seen.get(key).mergedFrom.push(ing.raw); continue; }
    const entry = { ...ing, qty: scaleQuantity(ing.qty, ing.unit, scale), mergedFrom: [ing.raw], reason: null };
    seen.set(key, entry);
    buy.push(entry);
  }
  return { have, buy, scale, reasoned: false };
}

/* ================= verifying what the model said ================= */

const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2);

const alike = (a, b) => a === b || a.startsWith(b) || b.startsWith(a);
const subset = (A, B) => A.length > 0 && A.every((w) => B.some((x) => alike(x, w)));

/** Do two ingredient names refer to the same thing? "cashews" vs "whole cashews". */
function sameItem(a, b) {
  const A = words(a), B = words(b);
  if (!A.length || !B.length) return false;
  const hits = A.filter((w) => B.some((x) => alike(x, w))).length;
  return hits / Math.min(A.length, B.length) >= 0.5;
}

/**
 * How well does one of the model's items answer this recipe line? Higher is better.
 *
 * Taking the FIRST loose match was wrong in a way worth remembering: the model's
 * "clove" matched the line "6 large garlic cloves" before its own "garlic" did, so
 * the garlic silently became cloves and then deduplicated away. The line already
 * carries a parsed retail term — "garlic" — so matching against that first settles it.
 */
function matchStrength(item, line) {
  const I = words(item);
  if (!I.length) return 0;
  const T = words(line.term), N = words(line.name);
  if (T.length && subset(I, T) && subset(T, I)) return 3;   // the same term, both ways
  if (T.length && (subset(I, T) || subset(T, I))) return 2;
  if (subset(I, N)) return 1.5;
  return sameItem(item, line.name) ? 1 : 0;
}

function bestMatch(list, line) {
  let best = null, score = 0;
  for (const m of list) {
    const s = matchStrength(m.item, line);
    if (s > score) { best = m; score = s; }
  }
  return best;
}

/**
 * Merge the model's plan into the rules' plan, keeping the rules as the floor.
 *
 * Benchmarking eight models on one recipe showed exactly why this layer exists:
 * one silently dropped ginger and garlic from a dish that needs both, and another
 * invented black pepper that appears nowhere in the recipe. A model that is right
 * most of the time still cannot be the last word on what lands in someone's cart.
 *
 * So: the model may ADD a purchase (it knows tomato purée isn't a tomato), but it
 * may only REMOVE one by naming something the cook actually owns. Anything it
 * forgot keeps the rules' verdict, and anything it invented is dropped.
 */
export function reconcilePlans(rules, out, pantry = []) {
  const modelBuy = out?.buy || [], modelHave = out?.have || [];
  const owned = pantry.map((p) => String(p).toLowerCase().trim()).filter(Boolean);
  const have = [], buy = [], notes = [];
  const claimed = new Set();

  const lines = [
    ...rules.have.map((h) => ({ ...h, ruled: 'have' })),
    ...rules.buy.map((b) => ({ ...b, ruled: 'buy' })),
  ];

  for (const line of lines) {
    // Nobody shops for water. The model does not get a vote on staples.
    if (line.staple) { have.push({ ...line, reason: line.reason || 'kitchen staple' }); continue; }

    const asBuy = bestMatch(modelBuy, line);
    const asHave = bestMatch(modelHave, line);
    if (asBuy) claimed.add(asBuy);

    // What the cook told us is in their kitchen is not the model's to overrule.
    // It kept putting tomatoes and chilli powder in the basket of someone who had
    // said, in the interface, that they own both. Inferred coverage — "your garam
    // masala covers this" — is ours, and that it may argue with.
    const stated = line.ruled === 'have' && /^you have\b/i.test(String(line.reason || ''));
    if (stated) { have.push(line); continue; }

    if (asBuy) {
      if (line.ruled === 'have') notes.push(`${line.name}: we inferred you had it, model says buy — buying`);
      buy.push({
        ...line,
        term: asBuy.search_term || line.term,
        qtyText: asBuy.quantity || null,
        optional: Boolean(asBuy.optional) || Boolean(line.optional),
        reason: asBuy.reason || line.reason || null,
      });
      continue;
    }

    if (asHave) {
      // A claim of coverage has to point at something in the kitchen.
      const basis = line.ruled === 'have'
        || owned.some((o) => o.length > 2 && String(asHave.reason || '').toLowerCase().includes(o));
      if (basis) { have.push({ ...line, reason: asHave.reason || line.reason }); continue; }
      notes.push(`${line.name}: model called it covered with nothing to cover it — buying`);
      buy.push(line);
      continue;
    }

    // The model never mentioned it. That is not permission to skip it.
    if (line.ruled === 'have') have.push(line);
    else { notes.push(`${line.name}: model left it out — kept from the recipe`); buy.push(line); }
  }

  const invented = modelBuy.filter((m) => !claimed.has(m)).map((m) => m.item);
  if (invented.length) notes.push(`not in the recipe, ignored: ${invented.slice(0, 4).join(', ')}`);

  // Several recipe lines can map to one product — "2 green cardamom" and "¼ tsp
  // cardamom powder" both became "cardamom powder" and the basket got three of it.
  const once = new Map();
  for (const b of buy) {
    const key = String(b.term || b.name).toLowerCase().trim();
    if (once.has(key)) { once.get(key).mergedFrom = [...(once.get(key).mergedFrom || []), b.raw]; continue; }
    once.set(key, b);
  }

  return { have, buy: [...once.values()], scale: rules.scale, reasoned: true, notes, invented };
}

/* ================= the reasoning pass ================= */

/**
 * Decide what genuinely needs buying, given a recipe and what's in the kitchen.
 * Returns { have, buy, scale, reasoned, notes } where each entry carries a `reason`
 * the UI can show — the explanation IS the product, not decoration.
 */
export async function planShopping(recipe, pantry, servings, emit = () => {}, opts = {}) {
  const fallback = rulePlan(recipe, pantry, servings);
  if (!KEY || opts.useModel === false) return fallback;

  const out = await ask(
    `You are an experienced Indian home cook planning a grocery run.

Given a recipe and what the cook already has, decide what they genuinely need to BUY.

Think about these, in order:
1. COVERAGE — does something they own already cover a recipe line? Garam masala covers
   cumin/coriander/cardamom/clove/cinnamon. Ginger-garlic paste covers separate ginger
   and garlic. Say so rather than making them buy it twice.
2. NOT THE SAME THING — tomato is not tomato purée; coriander leaves are not coriander
   seeds; curd is not cream. Do not treat these as owned.
3. STAPLES — water, salt, oil for frying: assume they have them.
4. DUPLICATES — the same ingredient listed twice (e.g. butter for the gravy and butter
   for garnish) is ONE purchase. Merge them.
5. OPTIONAL — garnishes and "if you like" items are lower priority.
6. SEARCH TERM — for each thing to buy, give the phrase an Indian grocery app would
   match. Prefer the common retail name ("fresh cream", not "light cream"; "paneer",
   not "Indian cottage cheese").

Be decisive. Every item needs a one-clause reason a cook would accept.`,
    JSON.stringify({
      dish: recipe.title,
      recipe_serves: recipe.serves,
      cooking_for: servings,
      already_have: pantry,
      ingredients: recipe.ingredients.map((i) => i.raw),
    }),
    `{"have":[{"item":string,"reason":string}],
      "buy":[{"item":string,"search_term":string,"quantity":string,"optional":boolean,"reason":string}],
      "notes":string}`,
  );

  if (!out?.buy?.length) { emit('think', 'reasoning unavailable — using rule-based plan'); return fallback; }

  // The model proposes; the rules hold the floor. Never the other way round.
  const plan = reconcilePlans(fallback, out, pantry);
  emit('think', `${MODEL} read ${recipe.ingredients.length} lines → buy ${plan.buy.length}, covered ${plan.have.length}`);
  plan.have.filter((h) => h.reason && !/staple/i.test(h.reason)).slice(0, 6)
    .forEach((h) => emit('covered', `${h.name} — ${h.reason}`));
  plan.notes.slice(0, 4).forEach((n) => emit('check', n));
  if (out.notes) emit('note', String(out.notes).slice(0, 150));

  return plan;
}

/**
 * Choose between real, in-stock products — with a reason.
 * The model never does arithmetic; it picks, and code computes what that costs.
 */
export async function chooseProduct(ingredient, options, needText, emit = () => {}) {
  if (!KEY || options.length <= 1) return { index: 0, why: null };

  const out = await ask(
    `Choose which grocery product to buy for a recipe ingredient.

Judge in this order:
1. Is it actually the ingredient? A masala/mix/sauce is NOT the raw ingredient. Reject those.
2. Pack size versus what's needed — least waste, but never under-buy.
3. Value, then a brand a cook would recognise.
If none is a genuine match, return index -1.
"why" must be one short shopper-style clause, 12 words maximum.`,
    JSON.stringify({
      ingredient, needed: needText || 'unspecified',
      options: options.map((o, i) => ({
        i, name: o.product_name, price: o.price, in_stock: o.available_quantity,
      })),
    }),
    `{"index": number, "why": string}`,
    { maxTokens: 250 },
  );

  if (out && Number.isInteger(out.index)) {
    if (out.index === -1) { emit('reject', `${ingredient}: ${out.why || 'no genuine match'}`); return { index: -1, why: out.why }; }
    if (options[out.index]) return { index: out.index, why: out.why };
  }
  return { index: 0, why: null };
}

/** Suggest a cooking substitute when an ingredient can't be bought at all. */
export async function substituteFor(ingredient, dish, pantry, emit = () => {}) {
  if (!KEY) return null;
  const out = await ask(
    `An ingredient is unavailable. Suggest the best practical substitute for THIS dish,
preferring something the cook already has. If there is no acceptable substitute, say so.`,
    JSON.stringify({ dish, unavailable: ingredient, cook_has: pantry }),
    `{"substitute": string|null, "search_term": string|null, "why": string}`,
    { maxTokens: 200 },
  );
  if (out?.substitute) emit('substitute', `${ingredient} unavailable → ${out.substitute}: ${out.why}`);
  return out;
}
