// Deciding whether a product really is the ingredient, and choosing between brands.
//
// Two rules, learned from real failures:
//
//  1. An ingredient is a GOAL, not a brand. "paneer" is satisfied by Gowardhan,
//     Nandini or Amul — whichever is actually in stock. Matching must be
//     position-independent and brand-agnostic.
//
//  2. But form matters, and it matters CONDITIONALLY. "Paneer Masala Mix" is not
//     paneer. "Tomato Ketchup" is not a tomato. Yet "Turmeric Powder" IS turmeric
//     and "Jeera Seeds" IS cumin — because ground/whole is how spices are sold.
//     So form conflicts only apply to ingredients that aren't spices.

/* ---------- regional names: Indian products are labelled in Hindi as often as English ---------- */
const SAME = [
  ['cashew', 'cashews', 'kaju'], ['coriander', 'dhania', 'cilantro'],
  ['cumin', 'jeera'], ['turmeric', 'haldi'], ['chilli', 'chili', 'mirch', 'mirchi'],
  ['paneer', 'cottage cheese'], ['curd', 'yogurt', 'yoghurt', 'dahi'],
  ['flour', 'atta', 'maida'], ['ghee', 'clarified butter'],
  ['fenugreek', 'methi', 'kasuri'], ['cardamom', 'elaichi'], ['clove', 'laung'],
  ['cinnamon', 'dalchini'], ['bay', 'tejpatta'], ['lentil', 'dal', 'daal'],
  ['chickpea', 'chana', 'chole'], ['kidney', 'rajma'], ['spinach', 'palak'],
  ['okra', 'bhindi'], ['brinjal', 'eggplant'], ['cauliflower', 'gobi', 'gobhi'],
  ['peas', 'matar'], ['potato', 'aloo'], ['onion', 'pyaz'],
  ['garlic', 'lahsun'], ['ginger', 'adrak'], ['cream', 'malai'],
];

/* ---------- spices: sold ground or whole, so "powder"/"seeds" are correct, not drift ---------- */
const SPICES = new Set([
  'turmeric', 'haldi', 'cumin', 'jeera', 'coriander', 'dhania', 'chilli', 'chili',
  'mirch', 'mirchi', 'masala', 'garam', 'pepper', 'cardamom', 'elaichi', 'clove',
  'laung', 'cinnamon', 'dalchini', 'fenugreek', 'methi', 'kasuri', 'mustard', 'rai',
  'asafoetida', 'hing', 'bay', 'tejpatta', 'saffron', 'kesar', 'fennel', 'saunf',
  'nutmeg', 'mace', 'paprika', 'oregano', 'salt', 'sugar', 'pepper',
]);

/* ---------- forms that mean "a different product", when the ingredient isn't a spice ---------- */
const DIFFERENT_PRODUCT = [
  { form: ['masala', 'mix', 'seasoning', 'curry'], label: 'a spice mix' },
  { form: ['sauce', 'ketchup', 'puree', 'paste', 'pickle', 'chutney'], label: 'a sauce/paste' },
  { form: ['biscuit', 'cookie', 'chips', 'namkeen', 'wafer', 'snack'], label: 'a snack' },
  { form: ['juice', 'drink', 'beverage', 'soda'], label: 'a drink' },
  { form: ['oil'], label: 'an oil' },
  { form: ['soap', 'shampoo', 'cleaner', 'detergent'], label: 'a non-food item' },
];

/* ---------- substances that are simply not each other ----------
   Wire's own relevance order answers "fresh cream" with "Full Cream MILK", because
   the word cream is right there in the name. Word overlap cannot catch this; you
   have to know that milk and cream are different things. The head noun of a product
   name is the last one — "Full Cream Milk" is milk, "Amul Malai Paneer" is paneer. */
const SUBSTANCE = {
  milk: 'milk', cream: 'cream', malai: 'cream', butter: 'butter', ghee: 'ghee',
  curd: 'curd', dahi: 'curd', yogurt: 'curd', yoghurt: 'curd',
  cheese: 'cheese', paneer: 'paneer', khoya: 'khoya', mawa: 'khoya',
  atta: 'atta', maida: 'maida', besan: 'besan', suji: 'suji', sooji: 'suji', rava: 'suji',
  toor: 'toor', arhar: 'toor', moong: 'moong', chana: 'chana', urad: 'urad', masoor: 'masoor',
};

/** The substance a name is actually about: the last one mentioned. */
const substanceOf = (words) => {
  for (let i = words.length - 1; i >= 0; i--) if (SUBSTANCE[words[i]]) return SUBSTANCE[words[i]];
  return null;
};

/* ---------- the beauty aisle, which shares a lot of words with the dairy aisle ---------- */
const NON_FOOD = /\b(face|facial|skin|beauty|brightening|fairness|whitening|lotion|moisturi[sz]\w*|serum|cleanser|scrub|shampoo|conditioner|soap|body\s*wash|handwash|lipstick|crayon|kajal|talc|deodorant|perfume|sanitiz\w*|wipes?|diapers?|toothpaste|detergent|dishwash\w*|floor|toilet|repellent|freshener)\b/i;

const tokens = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);

export function synonyms(word) {
  const out = new Set([word]);
  for (const group of SAME) if (group.includes(word)) group.forEach((g) => out.add(g));
  return [...out];
}

const isSpice = (want) => want.some((w) => synonyms(w).some((s) => SPICES.has(s)));

/**
 * Does this product satisfy the ingredient?
 * Returns { ok, score, why } — score is how completely the ingredient is matched.
 */
export function isRealMatch(productName, ingredient) {
  const product = tokens(productName);
  const want = tokens(ingredient).filter((w) => w.length > 2);
  if (!want.length) return { ok: false, why: 'no searchable term' };

  // Searching "cream" on a general marketplace returns face cream; "half and half"
  // once returned a lip crayon. Nothing from the beauty aisle goes in a recipe.
  if (NON_FOOD.test(productName)) return { ok: false, why: 'not food' };

  const matched = want.filter((w) =>
    synonyms(w).some((syn) => product.some((x) => x === syn || x.startsWith(syn) || syn.startsWith(x))));
  if (!matched.length) return { ok: false, why: `no mention of ${want.join('/')}` };

  // Leaves and seeds are different ingredients even for the same plant:
  // coriander leaves garnish a curry, coriander seeds season it.
  const asksLeaves = /\bleaves?\b/i.test(ingredient);
  const isSeeds = product.includes('seeds') || product.includes('seed');
  if (asksLeaves && isSeeds) return { ok: false, why: `those are seeds, not ${want[0]} leaves` };

  // Milk is not cream, maida is not atta, moong is not chana — however many words
  // the two names happen to share.
  const wantSub = substanceOf(want), prodSub = substanceOf(product);
  if (wantSub && prodSub && wantSub !== prodSub) {
    return { ok: false, why: `that's ${prodSub}, not ${wantSub}` };
  }

  // Other form conflicts only apply to non-spices — "Turmeric Powder" IS turmeric.
  if (!isSpice(want)) {
    for (const { form, label } of DIFFERENT_PRODUCT) {
      const inProduct = form.some((f) => product.includes(f));
      const asked = form.some((f) => tokens(ingredient).includes(f));
      if (inProduct && !asked) return { ok: false, why: `that's ${label}, not ${want[0]}` };
    }
  }
  return { ok: true, score: matched.length / want.length };
}

/**
 * Every genuine, in-stock alternative for this ingredient — across brands —
 * best match first, then cheapest. This is what makes substitution possible.
 */
export function rankOptions(wireProducts, ingredient) {
  const seen = new Set();
  return wireProducts
    .map((p) => ({ ...p, match: isRealMatch(p.product_name, ingredient) }))
    .filter((p) => {
      if (!p.match.ok || !(p.available_quantity > 0)) return false;
      const key = String(p.product_name).toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    // Flipkart's marketplace search omits `price` on some listings entirely. A bare
    // `a.price - b.price` then yields NaN and sorts those to the FRONT — the least
    // known options first. Priced items lead; unpriced keep their match order behind.
    .sort((a, b) => {
      if (b.match.score !== a.match.score) return b.match.score - a.match.score;
      const ap = a.price > 0, bp = b.price > 0;
      if (ap !== bp) return ap ? -1 : 1;
      return ap ? a.price - b.price : 0;
    });
}

/** What was rejected and why — so the agent can explain itself honestly. */
export function rejections(wireProducts, ingredient) {
  return wireProducts.map((p) => {
    const m = isRealMatch(p.product_name, ingredient);
    if (!m.ok) return { name: p.product_name, price: p.price, why: m.why };
    if (!(p.available_quantity > 0)) return { name: p.product_name, price: p.price, why: 'out of stock' };
    return null;
  }).filter(Boolean);
}

/** Normalised key for checking a chosen product against what the cart actually shows. */
export const cartKey = (name) => tokens(name).filter((w) => w.length > 2).sort().join(' ');
