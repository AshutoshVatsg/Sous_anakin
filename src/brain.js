// The reasoning layer.
//
// Division of labour — this is the whole design principle:
//   LLM  -> judgement   (what does the user mean? which SKU is right? is this substitute acceptable?)
//   code -> arithmetic  (pack rounding, scaling, totals — never trust a model with numbers)
//
// Every function degrades to a deterministic fallback when no API key is set,
// so the app never hard-fails and the demo always runs.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
function readEnv(name) {
  if (process.env[name]) return process.env[name].trim();
  try {
    const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(new RegExp(`^${name}=(.+)$`, 'm'));
    return m ? m[1].trim() : null;
  } catch { return null; }
}

const OPENAI_KEY = readEnv('OPENAI_API_KEY');
const MODEL = readEnv('LLM_MODEL') || 'gpt-4.1-mini';
export const hasBrain = () => Boolean(OPENAI_KEY);

let llmCalls = 0;
export const getLlmCalls = () => llmCalls;

/** One structured-JSON call. Returns null on any failure — callers must have a fallback. */
async function think(system, user, schemaHint, { maxTokens = 700 } = {}) {
  if (!OPENAI_KEY) return null;
  try {
    llmCalls++;
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: `${system}\n\nReply with JSON only, matching: ${schemaHint}` },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) { console.warn('[brain]', res.status, (await res.text()).slice(0, 160)); return null; }
    const j = await res.json();
    return JSON.parse(j.choices[0].message.content);
  } catch (e) {
    console.warn('[brain] failed:', e.message.slice(0, 100));
    return null;
  }
}

/* ========== 1. Understand what the person actually wants ========== */

const DISH_NOISE = /\b(i want|i'd like|i feel like|make me|cook|some|something|to eat|for dinner|for lunch|tonight|please)\b/gi;

export async function understand(text, emit) {
  const out = await think(
    `You read a hungry person's message and extract what they want to cook.
Infer an Indian dish name when they describe a craving rather than naming a dish.
"pantry" = ingredients they say they already have. "equipment" = cooking gear they mention.
Only include what they actually said — never invent pantry items.`,
    text,
    `{"dish": string, "pantry": string[], "equipment": string[], "serves": number|null, "note": string}`,
    { maxTokens: 300 },
  );

  if (out?.dish) {
    emit?.('think', `Understood: ${out.dish}${out.note ? ` — ${out.note}` : ''}`, out);
    return { dish: out.dish, pantry: out.pantry || [], equipment: out.equipment || [], serves: out.serves || null };
  }
  const dish = text.replace(DISH_NOISE, ' ').replace(/\s+/g, ' ').trim() || text;
  return { dish, pantry: [], equipment: [], serves: null };
}

/* ========== 1b. Discover what they could actually cook ========== */

// Fallback dish ideas keyed on a hero ingredient, used when there's no API key.
const IDEAS_BY_INGREDIENT = {
  paneer: ['paneer butter masala', 'palak paneer', 'paneer bhurji', 'kadai paneer', 'matar paneer'],
  chicken: ['butter chicken', 'chicken curry', 'chicken biryani', 'chilli chicken', 'chicken korma'],
  egg: ['egg curry', 'egg bhurji', 'egg fried rice', 'anda masala'],
  potato: ['aloo gobi', 'aloo paratha', 'dum aloo', 'jeera aloo', 'aloo matar'],
  rice: ['veg pulao', 'jeera rice', 'lemon rice', 'curd rice', 'veg biryani'],
  dal: ['dal tadka', 'dal makhani', 'dal fry', 'sambar'],
  chickpea: ['chole masala', 'chana masala', 'chole bhature'],
  rajma: ['rajma masala', 'rajma chawal'],
  cauliflower: ['aloo gobi', 'gobi manchurian', 'gobi paratha'],
  spinach: ['palak paneer', 'palak dal', 'aloo palak'],
  tomato: ['tomato rasam', 'tomato curry', 'shorba'],
  onion: ['onion pakora', 'onion uttapam'],
};

/**
 * Given what's in the kitchen (and any craving), propose dishes worth cooking.
 * This is the agent choosing WHAT to cook, not just how to shop for it.
 */
export async function suggestDishes(pantry, craving, emit, { n = 5 } = {}) {
  const out = await think(
    `You are an Indian home cook. Given what someone already has and what they feel like eating,
propose ${n} specific, well-known dishes they could realistically make tonight.
Favour dishes that use MANY of their existing ingredients — that's the whole point.
Use real dish names people search for. No invented fusion dishes.
"uses" lists which of THEIR ingredients each dish would use.`,
    JSON.stringify({ has: pantry, craving: craving || null }),
    `{"dishes":[{"name":string,"uses":string[],"why":string}]}`,
    { maxTokens: 600 },
  );

  if (out?.dishes?.length) {
    emit?.('think', `Considering ${out.dishes.length} dishes you could make: ${out.dishes.map((d) => d.name).join(', ')}`, out);
    return out.dishes.slice(0, n);
  }

  // Deterministic fallback: pivot on the most "hero" ingredient present.
  const hero = Object.keys(IDEAS_BY_INGREDIENT).find((k) => pantry.some((p) => p.toLowerCase().includes(k)));
  const list = (hero ? IDEAS_BY_INGREDIENT[hero] : ['dal tadka', 'jeera rice', 'aloo gobi', 'veg pulao'])
    .slice(0, n).map((name) => ({ name, uses: hero ? [hero] : [], why: hero ? `uses your ${hero}` : 'simple everyday dish' }));
  emit?.('think', `Considering: ${list.map((d) => d.name).join(', ')}`, { dishes: list });
  return list;
}

/* ========== 2. Choose which recipe actually suits this kitchen ========== */

export async function chooseRecipe(candidates, ctx, emit) {
  if (candidates.length <= 1) return 0;

  const out = await think(
    `Pick the recipe best suited to this cook's equipment and situation.
Prefer authentic Indian home recipes from reputable sites.
Avoid recipes needing equipment they don't have. Be decisive.`,
    JSON.stringify({
      want: ctx.dish, equipment: ctx.equipment, serves: ctx.serves,
      candidates: candidates.map((c, i) => ({ i, title: c.title, site: c.host || c.url })),
    }),
    `{"pick": number, "why": string}`,
    { maxTokens: 200 },
  );

  if (out && Number.isInteger(out.pick) && candidates[out.pick]) {
    emit?.('think', `Chose ${candidates[out.pick].host || 'recipe'} — ${out.why}`, out);
    return out.pick;
  }
  return 0;
}

/* ========== 3. Pick the right product — the highest-value judgement ========== */

/**
 * Given the real shortlist from BigBasket, choose the SKU a sensible shopper would.
 * The model sees quantity needed, pack sizes, prices and stock — but does NOT do the
 * pack arithmetic; code does that afterwards from the chosen SKU.
 */
export async function chooseSku(ing, products, emit) {
  const shortlist = products.slice(0, 12).map((p, i) => ({
    i, name: `${p.brand} ${p.name}`.trim(), pack: p.pack_weight,
    price: p.price, off: p.discount_percent || 0, in_stock: p.in_stock,
  }));

  const needStr = ing.grams != null ? `${Math.round(ing.grams)} g`
    : (ing.qty ? `${ing.qty}${ing.unit ? ' ' + ing.unit : ''}` : 'unspecified');

  const out = await think(
    `Choose which grocery product to buy for a recipe ingredient.
Rules, in order:
1. It MUST actually be the ingredient. A sauce/paste/pickle is NOT the raw ingredient. Reject mismatches.
2. It MUST be in stock.
3. Prefer the pack that covers the needed amount with least waste.
4. Between similar options prefer better value, then a recognised brand.
If nothing is a genuine match, return pick: -1.
"why" must be one short shopper-style clause, max 12 words.`,
    JSON.stringify({ ingredient: ing.name, recipe_line: ing.raw, need: needStr, options: shortlist }),
    `{"pick": number, "why": string}`,
    { maxTokens: 200 },
  );

  if (out && Number.isInteger(out.pick)) {
    if (out.pick === -1) { emit?.('think', `${ing.name} → no genuine match among ${products.length}`, out); return { sku: null, why: out.why }; }
    const sku = products[out.pick];
    if (sku) return { sku, why: out.why };
  }
  return { sku: null, why: null, fallback: true };   // caller falls back to deterministic ranking
}

/* ========== 4. Judge a substitution ========== */

export async function judgeSubstitution(ing, from, to, emit) {
  const out = await think(
    `A recipe ingredient's best product is out of stock. Say whether the replacement is acceptable
for this recipe, in one short sentence a cook would find useful.`,
    JSON.stringify({ ingredient: ing.name, recipe_line: ing.raw, out_of_stock: from, replacement: to }),
    `{"acceptable": boolean, "note": string}`,
    { maxTokens: 150 },
  );
  return out || { acceptable: true, note: null };
}
