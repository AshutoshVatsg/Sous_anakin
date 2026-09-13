// What will this dinner actually cost?
//
// Pricing every candidate dish live would mean ~75 Wire calls per search, which
// on a 300-credit budget is not a product. So prices come from memory instead:
//
//   live    — a real Flipkart Minutes price we saw while filling a cart or
//             checking stock. Written to cache/prices.json, free, and it makes
//             the estimate better every time the agent runs.
//   typical — a seeded pack price for common Indian groceries, for the long tail.
//
// The two are never mixed up. Anything shown to the cook says which it is, and
// says how many items of the basket it could price at all. An estimate that
// hides its own coverage is a lie with a number attached.
import fs from 'node:fs';
import path from 'node:path';
import { keepsFor, aliasesOf } from './knowledge.js';

const FILE = path.join(process.cwd(), 'cache', 'prices.json');

// Typical Flipkart Minutes pack prices, ₹. Round numbers on purpose: these are
// estimates and the UI says so. A live price always wins over one of these.
const TYPICAL = {
  paneer: { price: 95, pack: '200 g' },
  butter: { price: 62, pack: '100 g' },
  'unsalted butter': { price: 70, pack: '100 g' },
  ghee: { price: 130, pack: '200 ml' },
  cream: { price: 75, pack: '200 ml' },
  'fresh cream': { price: 75, pack: '200 ml' },
  curd: { price: 35, pack: '400 g' },
  milk: { price: 34, pack: '500 ml' },
  cheese: { price: 130, pack: '200 g' },
  onion: { price: 35, pack: '1 kg' },
  tomato: { price: 30, pack: '500 g' },
  potato: { price: 40, pack: '1 kg' },
  ginger: { price: 20, pack: '100 g' },
  garlic: { price: 35, pack: '200 g' },
  'ginger garlic paste': { price: 45, pack: '200 g' },
  'green chilli': { price: 12, pack: '100 g' },
  capsicum: { price: 30, pack: '250 g' },
  coriander: { price: 15, pack: '100 g' },
  'coriander leaves': { price: 15, pack: '100 g' },
  'curry leaves': { price: 12, pack: '50 g' },
  'mint leaves': { price: 15, pack: '50 g' },
  palak: { price: 25, pack: '250 g' },
  spinach: { price: 25, pack: '250 g' },
  cabbage: { price: 30, pack: '1 pc' },
  cauliflower: { price: 40, pack: '1 pc' },
  peas: { price: 50, pack: '500 g' },
  carrot: { price: 30, pack: '500 g' },
  beans: { price: 35, pack: '250 g' },
  brinjal: { price: 30, pack: '500 g' },
  bhindi: { price: 35, pack: '500 g' },
  lemon: { price: 15, pack: '2 pc' },
  'spring onion': { price: 25, pack: '100 g' },
  mushroom: { price: 55, pack: '200 g' },
  corn: { price: 40, pack: '200 g' },

  cashews: { price: 145, pack: '100 g' },
  almonds: { price: 130, pack: '100 g' },
  raisins: { price: 60, pack: '100 g' },
  peanuts: { price: 45, pack: '200 g' },

  'garam masala': { price: 65, pack: '100 g' },
  'red chilli powder': { price: 55, pack: '100 g' },
  'turmeric powder': { price: 35, pack: '100 g' },
  'coriander powder': { price: 45, pack: '100 g' },
  'dhania powder': { price: 45, pack: '100 g' },
  'cumin powder': { price: 60, pack: '100 g' },
  jeera: { price: 60, pack: '100 g' },
  'kasuri methi': { price: 45, pack: '25 g' },
  'bay leaf': { price: 30, pack: '25 g' },
  'cinnamon stick': { price: 55, pack: '50 g' },
  cloves: { price: 70, pack: '50 g' },
  cardamom: { price: 130, pack: '25 g' },
  'cardamom powder': { price: 140, pack: '25 g' },
  'black pepper': { price: 80, pack: '100 g' },
  'mustard seeds': { price: 30, pack: '100 g' },
  rai: { price: 30, pack: '100 g' },
  hing: { price: 55, pack: '25 g' },
  'chaat masala': { price: 55, pack: '100 g' },
  'pav bhaji masala': { price: 60, pack: '100 g' },
  'sambar powder': { price: 60, pack: '100 g' },
  amchur: { price: 45, pack: '100 g' },
  'black salt': { price: 30, pack: '200 g' },

  'tomato puree': { price: 60, pack: '200 g' },
  'tomato ketchup': { price: 95, pack: '500 g' },
  'soy sauce': { price: 70, pack: '200 ml' },
  vinegar: { price: 45, pack: '200 ml' },
  'corn flour': { price: 45, pack: '100 g' },
  maida: { price: 45, pack: '500 g' },
  atta: { price: 65, pack: '1 kg' },
  besan: { price: 60, pack: '500 g' },
  rice: { price: 110, pack: '1 kg' },
  'basmati rice': { price: 150, pack: '1 kg' },
  sugar: { price: 50, pack: '1 kg' },
  oil: { price: 140, pack: '1 l' },
  'sunflower oil': { price: 140, pack: '1 l' },
  'mustard oil': { price: 160, pack: '1 l' },
  'groundnut oil': { price: 180, pack: '1 l' },
  toor: { price: 90, pack: '500 g' },
  'toor dal': { price: 90, pack: '500 g' },
  'moong dal': { price: 85, pack: '500 g' },
  'chana dal': { price: 75, pack: '500 g' },
  'urad dal': { price: 90, pack: '500 g' },
  rajma: { price: 95, pack: '500 g' },
  chickpeas: { price: 80, pack: '500 g' },
  chole: { price: 80, pack: '500 g' },
  poha: { price: 45, pack: '500 g' },
  suji: { price: 45, pack: '500 g' },
  bread: { price: 45, pack: '400 g' },
  eggs: { price: 85, pack: '6 pc' },
};

// Words that describe a version of a thing rather than a different thing. Anything
// outside this — "coconut" in front of "milk" — makes it a separate product.
const QUALIFIER = /^(fresh|frozen|raw|whole|organic|premium|classic|regular|plain|unsalted|salted|low|fat|full|toned|double|extra|light|pure|natural|desi|country|farm|homestyle|kashmiri|malai|table|rock|sea|kosher|pink|himalayan|red|green|white|yellow|black|brown|golden|small|medium|large|baby|thin|thick|long|short|grain|refined|cold|pressed|virgin|packed|loose|value|pack|sliced|chopped|grated|crushed|minced|diced|dried|roasted|instant|quick|rolled|steel|cut|\d+)$/i;

const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

let memory = null;
function load() {
  if (memory) return memory;
  try { memory = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { memory = {}; }
  return memory;
}

/**
 * Record a real price the agent actually saw. Called from the cart paths, so the
 * estimate improves as a side effect of using the product — no extra credits.
 */
export function remember(term, { price, pack = null, name = null } = {}) {
  const k = key(term);
  if (!k || !(price > 0)) return;
  const mem = load();
  mem[k] = { price: Math.round(price), pack, name, seenAt: new Date().toISOString().slice(0, 10) };
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(mem, null, 2));
  } catch { /* a read-only disk must not break a cart */ }
}

/** Best known price for a shopping term, and honest about where it came from. */
export function priceOf(term) {
  const k = key(term);
  if (!k) return null;
  const mem = load();

  // A recipe says "cashew", the table says "cashews". Singular and plural are the
  // same product and should never decide whether something gets a price.
  for (const form of [k, k.endsWith('s') ? k.slice(0, -1) : `${k}s`]) {
    if (mem[form]) return { ...mem[form], source: 'live', ...(form === k ? {} : { via: form }) };
    if (TYPICAL[form]) return { ...TYPICAL[form], source: 'typical', ...(form === k ? {} : { via: form }) };
  }

  // A learned name often IS a term we have a price for: "turmeric" was unpriced
  // while "turmeric powder" sat right there in the table, and the shop calls it
  // "haldi powder". Try every name the agent has learned for this thing.
  for (const alt of aliasesOf(k, () => [])) {
    if (alt === k) continue;
    if (mem[alt]) return { ...mem[alt], source: 'live', via: alt };
    if (TYPICAL[alt]) return { ...TYPICAL[alt], source: 'typical', via: alt };
  }

  // Fall back to a known term that this one merely QUALIFIES: "amul malai paneer"
  // is paneer, "kashmiri red chilli powder" is chilli powder. The qualifier has to
  // be a brand or a grade — never another food.
  //
  // Matching on bare containment priced coconut milk at ₹34 by finding "milk" in
  // it, and bread crumbs at ₹45 by finding "bread". Both were silently wrong, and
  // a confident wrong price is worse than no price at all, so an unrecognised
  // qualifier now returns null and the UI reports the item as unpriced.
  const pool = [...Object.keys(mem).map((x) => [x, 'live']), ...Object.keys(TYPICAL).map((x) => [x, 'typical'])]
    .filter(([x]) => x.length > 3 && k.endsWith(x) && k !== x)
    .sort((a, b) => b[0].length - a[0].length);

  for (const [name, source] of pool) {
    const qualifier = k.slice(0, k.length - name.length).trim().split(/\s+/).filter(Boolean);
    if (!qualifier.every((w) => QUALIFIER.test(w))) continue;
    return { ...(source === 'live' ? mem[name] : TYPICAL[name]), source, via: name };
  }
  return null;
}

// Things you buy once and keep for months. A first paneer curry looks expensive
// because it includes a cardamom jar — but that jar is not the cost of dinner, and
// a basket total that doesn't say so misleads the cook.
// Roughly how many dinners one jar of something sees before it runs out. Used to
// charge a dish its fair share of the spice rack rather than all of it or none.
const PANTRY_USES = 8;

const KEEPS = /powder|masala|seeds?|\bdal\b|flour|atta|maida|besan|suji|rice|sugar|salt|\boil\b|ghee|vinegar|sauce|ketchup|puree|honey|methi|hing|\bbay leaf\b|cinnamon|cardamom|clove|pepper|jeera|\brai\b|amchur|cashew|almond|raisin|peanut|rajma|chickpea|chole|poha|tea|coffee|baking/i;

/**
 * What this basket costs, as far as we can tell.
 *
 * `coverage` is the fraction of items we could price and `keeps` is how much of
 * the total is long-life pantry stock — the caller must show both. A confident
 * number that hides what it could not price is a lie with a ₹ in front of it.
 */
export function estimateBasket(items = []) {
  let total = 0, keeps = 0, priced = 0, live = 0;
  const unpriced = [];
  for (const it of items) {
    const term = it.term || it.name;
    const p = priceOf(term);
    if (!p) { unpriced.push(it.name || it.term); continue; }
    total += p.price;
    // What the agent has learned about this ingredient beats the regex, which only
    // ever knew Indian vegetarian staples. The regex is the fallback.
    const learned = keepsFor(term);
    if (learned === null ? (KEEPS.test(term) || KEEPS.test(p.via || '')) : learned) keeps += p.price;
    priced++;
    if (p.source === 'live') live++;
  }
  const n = items.length;
  return {
    // Three numbers, because one would have to lie.
    //
    //   total — what the checkout says today.
    //   fresh — the food you eat tonight.
    //   meal  — what this dinner is really worth costing you: the fresh food plus
    //           a FAIR SHARE of the jars. Charging a whole ₹140 cardamom tin to one
    //           curry makes every dish unaffordable; charging none of it let a dish
    //           needing 22 new items claim to be a ₹214 dinner on a ₹1563 shop.
    //
    // PANTRY_USES is the assumption doing the work and it is deliberately visible.
    total: Math.round(total),
    keeps: Math.round(keeps),
    fresh: Math.round(total - keeps),
    meal: Math.round((total - keeps) + keeps / PANTRY_USES),
    priced, live,
    unpriced,
    count: n,
    coverage: n ? priced / n : 1,
    // Only call it a real price when every line came from something we actually saw.
    source: priced && live === priced ? 'live' : 'estimate',
  };
}

export { TYPICAL };
