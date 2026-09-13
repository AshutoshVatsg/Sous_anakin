// Stages 2-5: find recipe -> read -> reconcile -> source (with pack rounding + substitution).
import { search, wire, scrape } from './anakin.js';
import { searchTerm } from './synonyms.js';
import { rankSources } from './sources.js';
import { toGrams, planPacks } from './units.js';
import { hasBrain, chooseSku, understand, chooseRecipe, suggestDishes, getLlmCalls } from './brain.js';

/* ================= Stage 2/3: find + read a recipe ================= */

// Two paths: Allrecipes has a structured Wire action (fast, clean).
// Anything else -> scrape + JSON-LD, which covers Indian recipe sites.
async function findRecipe(dish, emit, opts = {}) {
  const { indian = true } = opts;

  // A dish card already knows its page — read it directly instead of searching again.
  if (opts.url) {
    emit('read', `Reading ${hostOf(opts.url)}…`);
    try {
      const recipe = await readRecipe({ url: opts.url, title: dish }, emit);
      if (recipe && recipe.ingredients.length >= 4) {
        emit('parsed', `${recipe.ingredients.length} ingredients · serves ${recipe.serves}`, recipe);
        return recipe;
      }
    } catch (e) { emit('skip', `${hostOf(opts.url)} — ${e.message.slice(0, 40)}, searching instead`); }
  }

  const q = indian ? `${dish} recipe indian` : `${dish} recipe`;
  emit('search', `Searching the web for "${dish}"…`);
  const results = await search(q);
  emit('found', `${results.length} candidates`, { results: results.slice(0, 5) });

  const ranked = rankSources(results, { indian });
  emit('rank', `Preferring ${ranked[0]?.host || 'best source'} of ${ranked.length} readable sources`);
  const pool = ranked.slice(0, 4);
  if (hasBrain() && pool.length > 1) {
    const pick = await chooseRecipe(pool.map(r => ({ ...r, host: hostOf(r.url) })), { dish, equipment: opts.equipment || [], serves: opts.serves }, emit);
    if (pick > 0) pool.unshift(pool.splice(pick, 1)[0]);   // try the chosen one first
  }
  for (const r of pool) {
    try {
      const recipe = await readRecipe(r, emit);
      if (recipe && recipe.ingredients.length >= 4) {
        emit('parsed', `${recipe.ingredients.length} ingredients · serves ${recipe.serves} · ${recipe.source}`, recipe);
        return recipe;
      }
      emit('skip', `${hostOf(r.url)} — too few ingredients, trying next`);
    } catch (e) {
      emit('skip', `${hostOf(r.url)} — ${e.message.slice(0, 50)}, trying next`);
    }
  }
  throw new Error(`Could not extract a usable recipe for "${dish}"`);
}

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

async function readRecipe(result, emit) {
  const ar = result.url.match(/allrecipes\.com\/recipe\/(\d+)\/([^/?#]+)/);
  if (ar) {
    emit('read', `Reading structured data from allrecipes.com…`);
    const d = await wire('act_allrecipes_recipe_detail_ssr_recipe', { recipe_id: ar[1], recipe_slug: ar[2] });
    return build(d.recipe_name || result.title, result.url, d.recipe_yield, d.recipe_ingredients, d.recipe_instructions, 'Wire');
  }
  emit('read', `Reading ${hostOf(result.url)}…`);
  const page = await scrape(result.url, ['html']);
  const ld = extractRecipeJsonLd(page.html || '');
  if (!ld) throw new Error('no Recipe JSON-LD');
  return build(ld.name || result.title, result.url, ld.recipeYield, ld.recipeIngredient, ld.recipeInstructions, 'JSON-LD', ld);
}

function build(title, url, yieldRaw, ingredients, instructions, source, ld = {}) {
  return {
    title: decode(title || 'Recipe').trim(),
    url, source, host: hostOf(url),
    serves: parseServes(yieldRaw),
    ingredients: (ingredients || []).map(parseIngredient).filter((i) => i.name),
    steps: normaliseSteps(instructions),
    // presentation metadata — free, it's already in the JSON-LD we fetched
    image: pickImage(ld.image),
    minutes: isoMinutes(ld.totalTime) || (isoMinutes(ld.prepTime) + isoMinutes(ld.cookTime)) || null,
    rating: ld.aggregateRating?.ratingValue ? Number(ld.aggregateRating.ratingValue) : null,
    votes: ld.aggregateRating?.ratingCount ? Number(ld.aggregateRating.ratingCount) : null,
    cuisine: [].concat(ld.recipeCuisine || []).filter(Boolean).join(', ') || null,
    category: [].concat(ld.recipeCategory || []).filter(Boolean).join(', ') || null,
    description: decode(ld.description).replace(/\s+/g, ' ').trim().slice(0, 220) || null,
  };
}

/** JSON-LD images come as a string, an array, or an ImageObject — normalise. */
function pickImage(img) {
  if (!img) return null;
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) return pickImage(img[0]);
  return img.url || img.contentUrl || null;
}

/** "PT1H20M" -> 80 */
function isoMinutes(iso) {
  if (!iso || typeof iso !== 'string') return 0;
  const h = Number((iso.match(/(\d+)H/) || [])[1] || 0);
  const m = Number((iso.match(/(\d+)M/) || [])[1] || 0);
  return h * 60 + m;
}

const parseServes = (y) => {
  const m = String(Array.isArray(y) ? y[0] : y || '').match(/\d+/);
  return m ? parseInt(m[0], 10) : 4;
};

// JSON-LD instructions come three ways: plain strings, HowToStep objects, and
// HowToSection objects that hold the real steps in itemListElement. Reading only the
// top level turned a 14-step recipe into two lines that were section HEADINGS.
function normaliseSteps(ins, depth = 0) {
  if (!ins || depth > 3) return [];
  const list = Array.isArray(ins) ? ins : [ins];
  const out = [];
  for (const s of list) {
    if (!s) continue;
    if (typeof s === 'string') { out.push(decode(s)); continue; }
    if (s.itemListElement) { out.push(...normaliseSteps(s.itemListElement, depth + 1)); continue; }
    const text = decode(s.text || s.name || '');
    if (text) out.push(text);
  }
  return out.map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t.length > 3);
}

// JSON-LD lives inside HTML, so its strings arrive escaped — "1 &amp; ½ inch ginger".
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…',
  frac12: '½', frac14: '¼', frac34: '¾', deg: '°',
};
export const decode = (s) => String(s || '')
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&([a-z][a-z0-9]*);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);

/** Pull schema.org Recipe out of a page's JSON-LD, including @graph and arrays. */
function extractRecipeJsonLd(html) {
  const blocks = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    let parsed;
    try { parsed = JSON.parse(b[1].trim()); } catch { continue; }
    const found = findRecipeNode(parsed);
    if (found) return found;
  }
  return null;
}

function findRecipeNode(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) { for (const n of node) { const f = findRecipeNode(n); if (f) return f; } return null; }
  const t = node['@type'];
  if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) return node;
  if (node['@graph']) return findRecipeNode(node['@graph']);
  return null;
}

/* ================= Stage 1b: discover what they could cook ================= */

/**
 * "I have paneer, onion, tomato — what can I make?"
 * Proposes dishes, fetches the REAL recipe for each in parallel, then ranks by how
 * much of each the person already owns. The ranking is computed from live recipe
 * data, not guessed — that's what makes it a decision rather than a suggestion.
 */
async function discover(pantry, craving, emit, { consider = 4 } = {}) {
  emit('think', `Working out what you can make from ${pantry.length} ingredients…`);
  const ideas = await suggestDishes(pantry, craving, emit, { n: consider });

  emit('discover', `Checking ${ideas.length} dishes against real recipes…`);
  const checked = await Promise.all(ideas.map(async (idea) => {
    try {
      const results = rankSources(await search(`${idea.name} recipe indian`), { indian: true });
      for (const r of results.slice(0, 2)) {
        try {
          const recipe = await readRecipe(r, () => {});
          if (recipe && recipe.ingredients.length >= 4) {
            const total = recipe.ingredients.length;
            const owned = recipe.ingredients.filter((ing) =>
              ing.staple || pantry.some((p) => {
                const b = p.toLowerCase().trim();
                return b.length > 2 && (ing.name.includes(b) || ing.term.includes(b));
              })).length;
            const coverage = owned / total;
            emit('candidate', `${idea.name} — you have ${owned} of ${total} ingredients`,
              { dish: idea.name, owned, total, coverage, host: recipe.host });
            return { idea, recipe, owned, total, coverage, missing: total - owned };
          }
        } catch { /* try next result */ }
      }
    } catch { /* skip this idea */ }
    emit('skip', `${idea.name} — couldn't find a usable recipe`);
    return null;
  }));

  const viable = checked.filter(Boolean).sort((a, b) => b.coverage - a.coverage || a.missing - b.missing);
  if (!viable.length) throw new Error('Could not find any cookable dish from those ingredients');

  const best = viable[0];
  emit('picked', `Best match: ${best.recipe.title} — you already have ${best.owned} of ${best.total}, need ${best.missing}`,
    { options: viable.map((v) => ({ dish: v.idea.name, title: v.recipe.title, owned: v.owned, total: v.total, host: v.recipe.host })) });
  return { chosen: best, options: viable };
}

/* ================= Ingredient parsing ================= */

const UNIT_LOOKUP = {
  cup: 'cup', cups: 'cup', tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp', tbsps: 'tbsp', tbs: 'tbsp',
  tablespoonful: 'tbsp', tablespoonfuls: 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp', tsps: 'tsp', teaspoonful: 'tsp', teaspoonfuls: 'tsp',
  gram: 'g', grams: 'g', g: 'g', gm: 'g', gms: 'g',
  kilogram: 'kg', kg: 'kg', ml: 'ml', milliliter: 'ml', liter: 'l', litre: 'l', l: 'l',
  ounce: 'oz', ounces: 'oz', oz: 'oz', pound: 'lb', pounds: 'lb', lb: 'lb',
};

// Measure words that are NOT convertible units but still aren't part of the product name.
// "2 units green chillies", "1 inch ginger", "1 sachet masala", "4 cloves garlic".
// "2 scoops vanilla ice cream" was becoming the product "scoops vanilla ice creams".
// Drinks and desserts measure in scoops, pints and bars the way curries measure in
// inches and cloves.
const COUNT_WORDS = /^(units?|nos?|pcs?|pieces?|sachets?|packets?|pkts?|inch|inches|pinch|pinches|handfuls?|cloves?|sprigs?|stalks?|pods?|bunch(?:es)?|slices?|strands?|drops?|dashes?|cans?|tins?|bowls?|glass(?:es)?|scoops?|pints?|quarts?|bars?|cubes?|sticks?|bottles?|jars?|boxes|box|balls?|squares?|sheets?)$/i;

// Things nobody buys for a recipe. "⅓ cup hot water" should not become bottled water.
const ALWAYS_HAVE = /^((?:hot |cold |warm |luke?warm )?water|ice(?: cubes)?|(?:table |kosher |sea |rock |pink |himalayan )?salt|as required|to taste)$/i;

function parseIngredient(raw) {
  let text = String(raw).replace(/&amp;/g, '&').trim();

  // Collapse ranges to their lower bound BEFORE parsing:
  // "200 to 250 grams" -> "200 grams" · "1 or 2 green chili" -> "1 green chili"
  let t = text
    // "2 cups/300 grams" -> "2 cups"   (recipes give a second measurement after a slash)
    .replace(/([\d.]+\s*[a-zA-Z]+)\s*\/\s*[\d.]+\s*[a-zA-Z]+/, '$1')
    // "200 to 250 grams" -> "200 grams" · "1 or 2 chilli" -> "1 chilli"
    .replace(/([\d.¼½¾⅓⅔⅛]+)\s*(?:to|or|-|–|—)\s*([\d.¼½¾⅓⅔⅛]+)/i, '$1')
    // "1 & ½ inch ginger" -> "1 ½ inch ginger", so the fractions add instead of
    // the "&" derailing the parse and ending up inside the product name.
    .replace(/^\s*([\d.]+)\s*(?:&|and)\s*([¼½¾⅓⅔⅛]|\d+\s*\/\s*\d+)/i, '$1 $2')
    .replace(/^\s*(?:about|approx\.?|around)\s+/i, '')
    // "a few banana chips", "a couple of eggs", "a handful of nuts"
    .replace(/^\s*a\s+(?:few|couple\s+of|handful\s+of|little)\s+/i, '')
    // "1/2-inch piece ginger" — the hyphen hid the unit and the product became
    // "piece ginger". Only after a NUMBER, so "medium-sized" stays one word.
    .replace(/([\d/¼½¾⅓⅔⅛])\s*-\s*(?=[a-z])/gi, '$1 ');

  const m = t.match(/^([\d./\s¼½¾⅓⅔⅛]+)?\s*([a-zA-Z]+)?\s*(.*)$/);
  const qty = parseQty(m && m[1]);
  const word = m && m[2] ? m[2].toLowerCase() : null;
  const maybeUnit = word ? UNIT_LOOKUP[word] || null : null;
  // A count word ("units", "inch", "cloves") is dropped: not a unit, not part of the name.
  const isCount = word && !maybeUnit && COUNT_WORDS.test(word);
  // With no unit the name is simply whatever follows the quantity — rejoining the
  // captured words would insert a space into "medium-sized".
  // "4 cloves garlic" is garlic; bare "3 cloves" is the spice, and falling back to
  // the raw line there produced the product name "3 cloves".
  let name = (maybeUnit || isCount)
    ? (String(m[3] || '').trim() || (isCount ? m[2] : ''))
    : t.slice((m[1] || '').length);

  // Measures stack: "1/2 inch piece fresh ginger" is a quantity, then a unit, then
  // another unit. Only the first was being consumed, leaving "piece ginger".
  // And "1 cup of vanilla ice cream" leaves an "of" that became part of the product.
  if (maybeUnit || isCount) {
    let next;
    name = String(name).trim().replace(/^of\s+/i, '');
    while ((next = String(name).trim().match(/^([a-zA-Z]+)\s+(.+)$/)) &&
           (COUNT_WORDS.test(next[1]) || UNIT_LOOKUP[next[1].toLowerCase()])) {
      name = next[2].replace(/^of\s+/i, '');
    }
  }

  const unwrap = (s) => {                // "((ground turmeric))" — innermost first,
    let prev;                            // one pass of /\(.*?\)/ left a stray ")"
    do { prev = s; s = s.replace(/\([^()]*\)/g, ' '); } while (s !== prev);
    return s.replace(/[()]/g, ' ');
  };

  const clean = (s) => unwrap(s)
    .replace(/\s+[–—]\s*.*$/, ' ')       // drop trailing "– slit, reserve a few"
    .replace(/\s+-\s+.*$/, ' ')          // ...but never split hyphenated words ("medium-sized")
    .replace(/,.*$/, ' ')                // drop post-comma prose
    // "salt to taste", "oil for frying", "coriander for garnish" — the trailing
    // instruction is not part of the thing you put in the basket.
    .replace(/\b(?:or\s+)?(?:to taste|as required|as needed|as per taste|for garnish(?:ing)?|for frying|for deep frying|for tempering|for serving|for cooking)\b.*$/i, ' ')
    .replace(/\s+/g, ' ').trim().toLowerCase();

  name = clean(name || t).replace(/^\s*or\s+[\d.]*\s*/i, '');   // "or 4 medium tomato" -> "medium tomato"
  // "2 cups or 4 medium tomato": the alternative comes first and the real name follows.
  // Prefer the side of "or" that still has a name.
  if (/\bor\b/i.test(name)) {
    const [before, after] = name.split(/\s+\bor\b\s+/i);
    const b = clean(before || ''), a = clean((after || '').replace(/^[\d.\s]+[a-z]*\s+/i, ''));
    name = b || a || name;
    if (!b && a) name = a;
  }
  // "ginger & 6 garlic cloves" -> "ginger": the first thing named is the thing to buy.
  name = name.replace(/(?:\band\b|&).*$/i, ' ')
    .replace(/^[^a-z0-9]+/i, '')       // stray punctuation left by a mangled quantity
    .replace(/\s+/g, ' ').trim();

  const optional = /\boptional\b/i.test(text);
  const staple = ALWAYS_HAVE.test(name);
  return { raw: text, qty, unit: maybeUnit, name, term: searchTerm(name), optional, staple };
}

/**
 * Scale a recipe quantity to the number of people actually eating.
 *
 * Counts round UP to a whole number: you cannot buy a quarter of a cinnamon stick
 * or half a bay leaf, and rounding down would leave the cook short. Spoon measures
 * snap to the nearest quarter so the list reads like a recipe rather than a
 * spreadsheet. Weights and volumes scale plainly.
 */
function scaleQuantity(qty, unit, scale) {
  if (qty == null) return null;
  const q = qty * scale;
  if (!unit) return Math.max(1, Math.ceil(q - 1e-6));
  if (unit === 'tsp' || unit === 'tbsp') return Math.max(0.25, Math.round(q * 4) / 4);
  return +q.toFixed(q < 10 ? 2 : 0);
}

// Cooks read "½ tsp", not "0.5tsp".
const VULGAR = { 0.13: '⅛', 0.25: '¼', 0.33: '⅓', 0.5: '½', 0.67: '⅔', 0.75: '¾' };

function qtyLabel(qty, unit) {
  if (qty == null) return null;
  const whole = Math.floor(qty);
  const frac = VULGAR[+(qty - whole).toFixed(2)];
  const num = frac ? `${whole || ''}${frac}` : String(+Number(qty).toFixed(2));
  return unit ? `${num} ${unit}` : num;
}

function parseQty(s) {
  if (!s) return null;
  const F = { '¼': .25, '½': .5, '¾': .75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': .125 };
  let t = s.trim();
  for (const [g, v] of Object.entries(F)) t = t.split(g).join(` ${v} `);
  const n = t.trim().split(/\s+/).reduce((sum, p) => {
    if (p.includes('/')) { const [a, b] = p.split('/').map(Number); return sum + (b ? a / b : 0); }
    return sum + (parseFloat(p) || 0);
  }, 0);
  return n || null;
}

/* ================= Stage 4: reconcile against pantry ================= */

function reconcile(recipe, pantry, servings, emit) {
  const scale = servings / recipe.serves;
  const have = [], need = [], seen = new Map();

  for (const ing of recipe.ingredients) {
    const scaled = { ...ing, qty: scaleQuantity(ing.qty, ing.unit, scale) };

    if (ing.staple) { have.push({ ...scaled, matchedPantry: 'kitchen staple' }); continue; }

    const owned = pantry.find((p) => {
      const b = p.toLowerCase().trim();
      return b.length > 2 && (ing.name.includes(b) || ing.term.includes(b));
    });
    if (owned) { have.push({ ...scaled, matchedPantry: owned }); continue; }

    // Recipes list the same thing twice ("2 tbsp butter", "1 tsp butter – optional").
    // Merge into one purchase line, summing grams. Aggregate BEFORE pack rounding.
    const g = toGrams(scaled.qty, scaled.unit, scaled.name);
    const prev = seen.get(ing.term);
    if (prev) {
      if (prev.grams != null && g.grams != null) prev.grams += g.grams;
      prev.mergedFrom = (prev.mergedFrom || [prev.raw]).concat(scaled.raw);
      continue;
    }
    const entry = { ...scaled, ...g };
    seen.set(ing.term, entry);
    need.push(entry);
  }

  const merged = need.filter((n) => n.mergedFrom).length;
  const note = [scale !== 1 ? `scaled ×${scale.toFixed(2)}` : null, merged ? `${merged} merged` : null]
    .filter(Boolean).join(' · ');
  emit('reconcile', `You have ${have.length} of ${recipe.ingredients.length} → need ${need.length}${note ? ` (${note})` : ''}`,
    { have, need, scale });
  return { have, need, scale };
}

/* ================= Stage 5: source + substitute ================= */

const NON_FOOD = /beauty|cosmetic|makeup|personal care|hygiene|cleaning|household|baby care|pet|stationery|home/i;

function rank(products, term) {
  const terms = term.split(/\s+/).filter((t) => t.length > 2);
  return products
    .filter((p) => !NON_FOOD.test(`${p.category?.tlc_name || ''} ${p.category?.llc_name || ''}`))
    .map((p) => ({ ...p, _score: terms.filter((t) => `${p.name} ${p.brand}`.toLowerCase().includes(t)).length }))
    .filter((p) => p._score > 0)
    .sort((a, b) => b._score - a._score || a.price - b.price);
}

async function sourceOne(ing, emit) {
  const term = ing.term;
  let data;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      data = await wire('bb_search_products', { query: term }, { cost: 2 });
      if (data.products && data.products.length) break;
    } catch (e) {
      if (attempt === 3) { emit('sku_error', `${ing.name} → ${e.message.slice(0, 45)}`, { ing }); return { ing, sku: null, reason: 'error' }; }
    }
    if (attempt < 3) { emit('retry', `${ing.name} — empty, retrying (${attempt}/2)`); await sleep(1200 * attempt); }
  }

  const all = (data && data.products) || [];
  if (!all.length) { emit('sku_miss', `${ing.name} → no results for "${term}"`, { ing }); return { ing, sku: null, reason: 'no_results' }; }

  const ranked = rank(all, term);
  if (!ranked.length) { emit('sku_miss', `${ing.name} → ${all.length} results, none matched "${term}"`, { ing }); return { ing, sku: null, reason: 'no_match', found: all.length }; }

  const inStock = ranked.filter((p) => p.in_stock);
  if (!inStock.length) { emit('sku_miss', `${ing.name} → all ${ranked.length} options out of stock`, { ing }); return { ing, sku: null, reason: 'out_of_stock', found: all.length }; }

  // JUDGEMENT: the model picks from the real shortlist and says why.
  // Falls back to deterministic ranking when there's no API key or the call fails.
  let sku = null, why = null, judged = false;
  if (hasBrain()) {
    const c = await chooseSku({ ...ing }, inStock, emit);
    if (c.sku) { sku = c.sku; why = c.why; judged = true; }
    else if (!c.fallback) {                       // model actively rejected every option
      emit('sku_miss', `${ing.name} → ${c.why || 'no genuine match'}`, { ing });
      return { ing, sku: null, reason: 'rejected_by_brain', why: c.why, found: all.length };
    }
  }
  if (!sku) sku = inStock[0];

  // THE RECOVERY BEAT: top-ranked option was out of stock, so we moved.
  const first = ranked[0];
  let substituted = null;
  if (!first.in_stock && sku.id !== first.id) {
    substituted = { from: `${first.brand} ${first.name}`.trim(), to: `${sku.brand} ${sku.name}`.trim() };
    emit('substitute', `${first.brand} ${first.name} is out of stock → switching to ${sku.brand} ${sku.name}`, { ing, substituted });
  }

  // ARITHMETIC stays in code — the model never computes pack counts or money.
  const pack = planPacks(ing.grams, sku.pack_weight, ing.basis);
  const line = +(pack.packs * sku.price).toFixed(2);
  emit('sku', `${ing.name} → ${sku.brand} ${sku.name} ${sku.pack_weight} ₹${sku.price}${pack.packs > 1 ? ` ×${pack.packs}` : ''}${why ? ` — ${why}` : ''}`,
    { ing, sku, pack, found: all.length, considered: ranked.length, substituted, why, judged });
  return { ing, sku, pack, line, found: all.length, considered: ranked.length, substituted, why, judged };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Cap concurrency: BigBasket 500s under heavy fan-out.
async function source(need, emit, { concurrency = 3 } = {}) {
  emit('source', `Sourcing ${need.length} ingredients from BigBasket…`);
  const out = new Array(need.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, need.length) }, async () => {
    while (i < need.length) { const idx = i++; out[idx] = await sourceOne(need[idx], emit); }
  }));
  return out;
}

export { findRecipe, discover, reconcile, source, parseIngredient, scaleQuantity, qtyLabel, extractRecipeJsonLd, understand, hasBrain, getLlmCalls };
