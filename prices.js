// Warm the price memory with REAL Flipkart Minutes prices.
//
// The seeded table in src/price.js is a fallback, not the product. This pulls the
// live price for the terms that actually turn up in Indian home cooking and writes
// them to cache/prices.json, after which almost every dish is costed from prices
// the agent genuinely saw. One credit per term, once — then it's free forever.
//
//   node prices.js            # see what it would cost, change nothing
//   node prices.js --run      # do it
//   node prices.js --run 20   # just the first 20 terms
import { products } from './src/minutesdata.js';
import { rankOptions } from './src/pick.js';
import { remember, priceOf } from './src/price.js';
import { learned } from './src/knowledge.js';
import { verifyProducts } from './src/plan.js';

// Ordered by how often they show up in the recipes we actually read.
const TERMS = [
  'paneer', 'fresh cream', 'butter', 'curd', 'milk', 'ghee',
  'onion', 'tomato', 'potato', 'ginger', 'garlic', 'green chilli', 'capsicum',
  'coriander leaves', 'curry leaves', 'palak', 'lemon', 'peas', 'carrot',
  'cashews', 'almonds', 'peanuts',
  'garam masala', 'red chilli powder', 'turmeric powder', 'coriander powder',
  'cumin powder', 'jeera', 'kasuri methi', 'bay leaf', 'cinnamon stick',
  'cloves', 'cardamom', 'black pepper', 'mustard seeds', 'hing', 'chaat masala',
  'tomato puree', 'sugar', 'sunflower oil', 'maida', 'atta', 'besan',
  'basmati rice', 'toor dal', 'moong dal', 'chana dal', 'rajma', 'chickpeas',
  'ginger garlic paste',
];

const args = process.argv.slice(2);
const run = args.includes('--run');
const limit = Number(args.find((a) => /^\d+$/.test(a))) || TERMS.length;
const named = args.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));

// --missing closes the loop: the agent LEARNS an ingredient it has never met
// (tofu, prawns, soya chunks) and that leaves it knowing what the thing is called
// but not what it costs. This fetches exactly those, and nothing it already knows.
const missing = args.includes('--missing')
  ? Object.keys(learned()).filter((t) => priceOf(t)?.source !== 'live')
  : [];

const todo = named.length ? named : (missing.length ? missing : TERMS.slice(0, limit));

// Anything already remembered is skipped — re-running costs nothing extra.
const fresh = todo.filter((t) => priceOf(t)?.source !== 'live');

console.log(`${todo.length} terms · ${todo.length - fresh.length} already known · ${fresh.length} to fetch`);
console.log(`cost: ${fresh.length} Anakin credit${fresh.length === 1 ? '' : 's'} (1 per term, Wire list_products)`);

if (!run) {
  console.log('\nnothing fetched. add --run to do it.');
  process.exit(0);
}

// Fetch first, judge once. Rules narrow the shelf; the model settles which of the
// survivors is actually the thing, because "Banana Stem" passed every rule we had.
const shortlists = [];
let missed = 0;
for (const term of fresh) {
  try {
    // Same matcher the cart uses. Wire's own relevance order returns full cream
    // MILK for "fresh cream", and a price memory built on that is worse than none.
    const all = await products(term);
    const options = rankOptions(all, term).filter((p) => p.price > 0).slice(0, 8);
    if (!options.length) { missed++; console.log(`  ·  ${term.padEnd(22)} no real match in stock`); continue; }
    shortlists.push({ term, options });
  } catch (e) {
    missed++;
    console.log(`  ✕  ${term.padEnd(22)} ${String(e.message).slice(0, 60)}`);
  }
}

const picks = await verifyProducts(
  shortlists.map((s) => ({ term: s.term, options: s.options.map((o) => o.product_name) })),
).catch(() => new Map());

let got = 0, rejected = 0;
for (const { term, options } of shortlists) {
  const verdict = picks.get(term);
  // No verdict at all (no key, or the call failed) means fall back to the ranking.
  const idx = verdict ? verdict.index : 0;
  if (idx === null || !options[idx]) {
    rejected++;
    console.log(`  ·  ${term.padEnd(22)} rejected — ${verdict?.why || 'nothing on the shelf is this'}`);
    continue;
  }
  const best = options[idx];
  remember(term, { price: best.price, name: best.product_name });
  got++;
  console.log(`  ✓  ${term.padEnd(22)} ₹${String(best.price).padEnd(5)} ${best.product_name.slice(0, 44)}`
    + (verdict?.why && idx !== 0 ? `\n       ↳ ${verdict.why}` : ''));
}
console.log(`\n${got} real prices remembered · ${missed} unavailable · ${rejected} rejected as not-the-thing`);
