// Variety: making "something with paneer" return five *different* dinners.
//
// Left alone, every search angle for an ingredient converges on the same famous
// gravy — you get butter masala five times from five sites. Nobody needs that.
// So we fan the search across styles of cooking, then classify what actually came
// back and refuse to shortlist two of the same dish.
//
// Everything here reads the recipe itself. The style label is not "the query that
// found it" — a page found by a "dry sabzi" search is often still a curry.

/**
 * Pull a price out of what someone typed.
 *
 *   "paneer under 500"        -> { budget: 500, mode: 'under' }
 *   "something with paneer around ₹400" -> { budget: 400, mode: 'around' }
 *
 * `around` is a target, not a ceiling: our price is an estimate, so drawing a hard
 * line at exactly ₹400 would be false precision. `under` is taken more literally.
 */
export function readBudget(input) {
  const text = String(input || '');
  const m = text.match(
    /(?:(around|about|approx\.?|roughly|near|upto|up to|under|below|less than|within|max|budget(?:\s+of)?)\s*)?(?:₹|rs\.?|inr)?\s*(\d{2,5})\s*(?:₹|rs\.?|rupees?|bucks?)?/i,
  );
  // A number with no money word and no currency isn't a budget — "2 people",
  // "65 fry", "paneer 65" must not silently become a price.
  if (!m) return { text: text.trim(), budget: 0, mode: null };
  const money = /₹|rs\.?|inr|rupees?|bucks?/i.test(m[0]);
  const word = (m[1] || '').toLowerCase();
  if (!money && !word) return { text: text.trim(), budget: 0, mode: null };

  const budget = Number(m[2]);
  if (!(budget >= 50 && budget <= 20000)) return { text: text.trim(), budget: 0, mode: null };
  return {
    text: text.replace(m[0], ' ').replace(/\s+/g, ' ').trim(),
    budget,
    mode: /under|below|less|within|max|upto|up to/.test(word) ? 'under' : 'around',
  };
}

// People type sentences, not search queries. "hey I want to eat panner dish" is a
// request for paneer, and feeding the whole sentence to a search engine finds the
// wrong thing — worse, it looked like a named dish, so the agent stopped looking
// for variety and for anything cheap.
const OPENER = /^\s*(?:hey|hi|hello|yo|ok|okay|so|please|pls)\b[\s,]*/i;
const INTENT = /^\s*(?:(?:can|could|would)\s+(?:you|u)\s+)?(?:i\s*'?\s*m\s+craving|i\s+am\s+craving|i\s*'?\s*d\s+like|i\s+(?:want|wanna|need|would\s+like|feel\s+like)|give\s+me|get\s+me|find\s+me|show\s+me|suggest|recommend|make\s+me|cook\s+me|craving|looking\s+for)\b\s*(?:to\s+(?:eat|cook|make|have)\s*)?/i;
const CARRIER = /^\s*(?:some|a|an|the|any)\s+/i;
const TAIL = /\b(?:dish(?:es)?|recipes?|sabzi|curry\s+dish|food|meal|item(?:s)?)\b\s*$|\b(?:to\s+eat|for\s+(?:dinner|lunch|tonight|today)|tonight|today|please)\b\s*$/i;

// Typos we have actually been handed. Not a spellchecker — a short list of the
// ones that matter, because the search term feeds every later stage.
const TYPOS = { panner: 'paneer', paner: 'paneer', panir: 'paneer', chiken: 'chicken', chikcen: 'chicken', tomatoe: 'tomato', brocolli: 'broccoli' };

/**
 * Is this a protein request, and how much?
 *
 *   "protein rich diet under 600"  -> { wanted: true, goal: null }
 *   "100g protein for ₹600"        -> { wanted: true, goal: 100 }
 *   "high protein veg dinner"      -> { wanted: true, goal: null, diet: 'veg' }
 *
 * Runs BEFORE the budget parser and strips its own number, or "100g protein under
 * ₹600" hands the 100 to the budget and plans a hundred-rupee dinner.
 */
export function readProtein(input) {
  const text = String(input || '');
  if (!/\bprotein/i.test(text)) return { wanted: false, goal: null, diet: null, text: text.trim() };

  const m = text.match(/(\d{2,3})\s*(?:g|gm|gms|grams?)?\s*(?:of\s+)?protein/i)
    || text.match(/protein[^\d]{0,12}?(\d{2,3})\s*(?:g|gm|gms|grams?)/i);
  const n = m ? Number(m[1]) : NaN;
  const goal = n >= 20 && n <= 400 ? n : null;

  const diet = /\bnon[- ]?veg\b|\bchicken\b|\bfish\b|\bmutton\b|\begg/i.test(text) ? 'nonveg'
    : /\bveg(etarian)?\b|\bvegan\b|\bjain\b/i.test(text) ? 'veg'
    : null;

  return {
    wanted: true,
    goal,
    diet,
    text: (m ? text.replace(m[0], ' protein ') : text).replace(/\s+/g, ' ').trim(),
  };
}

/** schema.org writes protein as "30 g", "14 grams", "5g". It is PER SERVING. */
export function parseProtein(v) {
  if (v == null) return null;
  const m = String(v).match(/([\d.]+)\s*(?:g|gm|gms|grams?)?/i);
  const n = m ? Number(m[1]) : NaN;
  // A plateful over 150 g of protein is a parse error, not a dinner.
  return Number.isFinite(n) && n > 0 && n <= 150 ? Math.round(n) : null;
}

/** "hey I want to eat panner dish" -> { ingredient: 'paneer', broad: true }. */
export function readCraving(craving) {
  const text = String(craving || '').trim();

  let s = text.replace(OPENER, '');
  const hadIntent = INTENT.test(s);
  s = s.replace(INTENT, '');
  const hadSomething = /^\s*(?:something|anything|some\s+dish|dishes?)\s+(?:with|using|from|out of)\s+/i.test(s);
  s = s.replace(/^\s*(?:something|anything|some\s+dish|dishes?)\s+(?:with|using|from|out of)\s+/i, '');
  s = s.replace(CARRIER, '');
  let hadTail = false;
  while (TAIL.test(s)) { s = s.replace(TAIL, '').trim(); hadTail = true; }

  const ingredient = (s.trim() || text)
    .split(/\s+/).map((w) => TYPOS[w.toLowerCase()] || w).join(' ').trim();

  // A bare ingredient ("paneer"), or a sentence that asked for "something with X"
  // or "a X dish", is a request for ideas. "Paneer Butter Masala" names a dish.
  const broad = hadSomething || hadTail || !/\s/.test(ingredient)
    || (hadIntent && ingredient.split(/\s+/).length === 1);
  return { ingredient, broad };
}

/**
 * Search angles for an ingredient. Each one goes after a different kind of dinner
 * so the candidate pool isn't seven spellings of the same curry.
 */
export function styleQueries(x) {
  return [
    { tag: 'dry', q: `dry ${x} sabzi recipe without gravy` },
    { tag: 'gravy', q: `${x} curry gravy recipe indian` },
    { tag: 'grilled', q: `${x} tikka tandoori grilled recipe` },
    { tag: 'light', q: `healthy high protein ${x} recipe less oil` },
    { tag: 'snack', q: `${x} starter snack recipe quick` },
    { tag: 'rice', q: `${x} pulao biryani rice recipe` },
    { tag: 'regional', q: `south indian ${x} recipe` },
  ];
}

/**
 * Extra angles for when a price was named. Cheap food is not a style of cooking —
 * it's a shape of recipe: short ingredient lists, everyday vegetables, nothing that
 * needs cream or cashews. Searching for that shape finds cheaper dishes than
 * sorting expensive ones by price ever will.
 */
export function budgetQueries(x) {
  return [
    { tag: 'cheap', q: `budget friendly ${x} recipe few ingredients` },
    { tag: 'simple', q: `simple everyday ${x} recipe 5 ingredients` },
    { tag: 'homely', q: `${x} sabzi recipe without cream or cashew` },
  ];
}

/**
 * Does this recipe actually contain the thing that was asked for?
 *
 * Searching "oats" returns pages that merely *mention* oats — an oats-free
 * Tandoori Mushroom Tikka and a chicken biryani both made a shortlist for
 * "I want to eat oats dish today". A dish that doesn't contain the ingredient
 * isn't a worse answer to the question; it isn't an answer at all.
 */
export function mentions(card, ingredient, alias = (w) => [w]) {
  const want = String(ingredient || '').toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (!want.length) return true;
  const hay = [card.title, ...(card.ingredients || []).map((i) => `${i.name} ${i.term}`)]
    .join(' ').toLowerCase();
  // Every word of the craving has to show up somewhere — "paneer tikka" needs both.
  // Matched on the stem so "oats" finds oatmeal and "eggs" finds egg.
  const stem = (w) => w.replace(/s$/, '');
  return want.every((w) => alias(w).some((a) => new RegExp(`\\b${stem(a)}`, 'i').test(hay)));
}

/** The most a dish may cost and still count as answering the price that was named. */
export const budgetCeiling = (budget, mode = 'around') => budget * (mode === 'under' ? 1.02 : 1.15);

/**
 * How well a dish's cost answers the price that was named. 1 is right in the zone,
 * negative is over the line.
 *
 * "Around ₹400" is a target, not a minimisation: a ₹380 dinner answers it better
 * than a ₹90 one does. Someone who budgets ₹400 and gets shown the cheapest thing
 * on the internet has been misread — they said what they were willing to spend.
 * "Under ₹400" is a limit, so anything below it is fine and only the absurdly
 * cheap is nudged down.
 */
export function budgetFit(meal, budget, mode = 'around') {
  if (!(budget > 0) || !(meal > 0)) return 0;
  const ratio = meal / budgetCeiling(budget, mode);
  if (ratio > 1) return -Math.min(3, 0.5 + (ratio - 1) * 3);
  if (mode === 'under') return ratio < 0.3 ? 0.7 : 1;
  const of = meal / budget;
  if (of >= 0.7) return 1;
  if (of >= 0.45) return 0.8;
  return 0.55;
}

/** Angles for a dish someone named outright — we want the *best* version of it. */
export function dishQueries(x) {
  return [
    { tag: 'main', q: `${x} recipe indian` },
    { tag: 'best', q: `best ${x} recipe` },
    { tag: 'easy', q: `easy ${x} recipe home style` },
    { tag: 'authentic', q: `authentic ${x} recipe ingredients` },
    { tag: 'restaurant', q: `${x} restaurant style recipe` },
    { tag: 'steps', q: `${x} recipe step by step` },
    { tag: 'home', q: `how to make ${x} at home` },
  ];
}

const RICH = /\b(cream|malai|khoya|mawa|condensed milk|butter|ghee|cheese slice|mayonnaise)\b/i;
const FRIED = /\b(deep fry|deep-fried|deep fried|for frying|oil for deep)\b/i;

/**
 * What kind of dinner is this, judged from the recipe rather than the search that
 * found it. Returns a short label the card can show.
 */
export function dishKind(card) {
  const text = [card.title, card.description, ...(card.ingredients || []).map((i) => i.name)]
    .filter(Boolean).join(' ').toLowerCase();
  const title = String(card.title || '').toLowerCase();

  if (/\b(milkshakes?|shakes?|smoothies?|lassi|juices?|mocktails?|coolers?|sherbet|thandai|chaas|coffee|tea|chai)\b/.test(title)) return 'drink';
  if (/\b(halwa|kheer|barfi|burfi|ladoos?|laddus?|jamun|rabri|phirni|custard|puddings?|cakes?|brownies?|cookies?|ice creams?|falooda)\b/.test(title)) return 'sweet';
  if (/\b(biryani|pulao|pulav|fried rice|khichdi|tehri|pilaf)\b/.test(title)) return 'rice';
  if (/\b(pakora|pakoda|roll|frankie|sandwich|cutlet|tikki|samosa|momo|kathi|nugget|toast|puff|popcorn|fritter)\b/.test(title)) return 'snack';
  // Gravy words win over "tikka", because paneer tikka masala is a curry.
  if (/\b(makhani|gravy|korma|kurma|kofta|kadai|kadhai|butter masala|tikka masala|curry|do pyaza|handi|lababdar)\b/.test(title)) return 'gravy';
  if (/\b(tikka|tandoori|grill|skewer|angara|malai tikka)\b/.test(title)) return 'grilled';
  if (/\b(dry|sukha|sukhi|bhurji|burji|tawa|jalfrezi|roast|stir fry|stir-fry|chilli|manchurian|65)\b/.test(title)) return 'dry';
  if (/\b(masala|sabzi|sabji|ki sabji)\b/.test(title)) return 'gravy';
  if (/\b(paratha|naan|roti|kulcha|dosa|uttapam|idli)\b/.test(title)) return 'bread';
  return /\bgravy|curry\b/.test(text) ? 'gravy' : 'dish';
}

/**
 * Is this the lighter option? Only claimed from the ingredient list — no cream,
 * butter, ghee or khoya, and nothing deep fried. The reason is shown to the cook,
 * so it has to be a fact about the recipe, not a vibe.
 */
export function lightness(card) {
  const names = (card.ingredients || []).map((i) => `${i.name} ${i.raw || ''}`).join(' ');
  if (RICH.test(names)) return null;
  if (FRIED.test(names) || FRIED.test(String(card.description || ''))) return null;
  return 'no cream, butter or ghee';
}

// Words that say nothing about *which* dish this is.
const STOP = new Set([
  'recipe', 'recipes', 'how', 'make', 'making', 'home', 'the', 'and', 'for', 'with',
  'step', 'steps', 'best', 'easy', 'quick', 'authentic', 'restaurant', 'style',
  'indian', 'north', 'south', 'punjabi', 'dhaba', 'homemade', 'simple', 'perfect',
  'ultimate', 'classic', 'traditional', 'instant', 'pot', 'video', 'photos',
  'masala', 'curry', 'gravy', 'sabzi', 'sabji', 'recipes', 'dish', 'food', 'veg',
  'vegetarian', 'minutes', 'mins', 'without', 'from', 'scratch', 'super', 'tasty',
  'delicious', 'creamy', 'rich', 'special', 'famous', 'popular', 'hotel', 'dhabha',
]);

/**
 * The words that identify a dish, with the thing you asked for removed.
 * "How to Make Paneer Butter Masala, Step by Step" -> ['butter']
 * "Paneer Bhurji"                                  -> ['bhurji']
 */
export function signature(title, ingredient = '') {
  const drop = new Set(String(ingredient).toLowerCase().split(/\s+/).filter(Boolean));
  return String(title || '').toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !drop.has(w));
}

const overlaps = (a, b) => (a.length && b.length ? a.some((t) => b.includes(t)) : !a.length && !b.length);

/**
 * Shortlist `want` dishes that are actually different from each other.
 *
 * Best-first, but a dish is skipped while something sharing its identity is already
 * on the list — two sites' butter masala is one idea, not two. Then the spread
 * widens in stages: a new dish from a new site in a new style first, then relaxing
 * the site, then the style. Only once variety runs out do we backfill on score.
 *
 * The site rule matters because the trusted Indian blogs score highest, so without
 * it a shortlist of five drifts into two dishes each from the same two blogs.
 */
export function pickDiverse(ranked, want, ingredient = '', opts = {}) {
  const { fits } = opts;
  const sig = new Map(ranked.map((c) => [c, signature(c.title, ingredient)]));
  const chosen = [], usedSigs = [], usedKinds = new Set(), usedHosts = new Set();

  const take = (c) => {
    chosen.push(c); usedSigs.push(sig.get(c));
    usedKinds.add(c.kind); usedHosts.add(c.host);
  };
  const novel = (c) => !chosen.includes(c) && !usedSigs.some((u) => overlaps(sig.get(c), u));

  const fill = (from) => {
    const pass = (accept) => {
      for (const c of from) {
        if (chosen.length >= want) return;
        if (accept(c)) take(c);
      }
    };
    pass((c) => novel(c) && !usedKinds.has(c.kind) && !usedHosts.has(c.host));
    pass((c) => novel(c) && !usedKinds.has(c.kind));
    pass((c) => novel(c) && !usedHosts.has(c.host));
    pass(novel);
    pass((c) => !chosen.includes(c));
  };

  // A price the cook stated is a constraint, not a tiebreaker. Variety is how we
  // fill the list, but only from the dishes that actually fit; anything over the
  // line is a last resort, so "five dishes under ₹200" doesn't come back as five
  // dishes over ₹200 arranged tastefully.
  if (fits) {
    fill(ranked.filter(fits));
    fill(ranked.filter((c) => !fits(c)));
  } else {
    fill(ranked);
  }
  return chosen;
}
