#!/usr/bin/env node
/**
 * Sous — say what you want to cook and what's already in your kitchen.
 *
 *   node cook.js "paneer butter masala" --have onion,oil,salt --serves 2
 *   node cook.js "palak paneer" --have oil,salt --max 5
 *   node cook.js "dal tadka" --have oil,salt --dry-run        (plan only, no cart)
 *
 * Layers:
 *   Anakin Search + URL Scraper -> a real recipe off the live web
 *   local reasoning             -> scale, subtract pantry, merge, drop staples
 *   Wire (Build Studio)         -> Minutes products + available_quantity
 *   Playwright                  -> the Add click, in the user's own session
 *   cart readback               -> proof; a click is never evidence
 */
import { findRecipe } from './src/pipeline.js';
import { planShopping, thinking, reasoningCalls } from './src/reason.js';
import { connect, fillOne, readCart } from './src/fill.js';
import { setAddress } from './src/minutesdata.js';

const argv = process.argv.slice(2);
const flagIdx = (n) => argv.indexOf(`--${n}`);
const flag = (n, d) => { const i = flagIdx(n); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes(`--${n}`);

// the dish is the first bare argument that isn't a flag's value
const flagValues = new Set(['have', 'serves', 'max', 'pin'].map(flagIdx).filter((i) => i >= 0).map((i) => argv[i + 1]));
const dish = argv.find((a) => !a.startsWith('--') && !flagValues.has(a)) || 'paneer butter masala';

const pantry = flag('have', 'oil,salt').split(',').map((s) => s.trim()).filter(Boolean);
const serves = parseInt(flag('serves', '2'), 10);
const maxItems = parseInt(flag('max', '5'), 10);
const pincode = flag('pin', '560102');
const dryRun = has('dry-run');

const C = { d: '\x1b[2m', b: '\x1b[1m', g: '\x1b[32m', y: '\x1b[33m', c: '\x1b[36m', m: '\x1b[35m', r: '\x1b[31m', x: '\x1b[0m' };
const t0 = Date.now();
const el = () => `${C.d}${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s${C.x}`;
const ICON = {
  search: `${C.c}⌕`, found: `${C.c}⌕`, read: `${C.c}▤`, parsed: `${C.c}▤`, skip: `${C.d}·`,
  reconcile: `${C.c}⊞`, rank: `${C.c}⌕`, wire: `${C.c}🔎`, option: `${C.d}   `,
  reject: `${C.d}  ✗`, added: `${C.g}✅`, retry: `${C.y}  ↻`, substitute: `${C.m}  ⇄`,
  already: `${C.g}✓`, failed: `${C.r}❌`, wire_fail: `${C.y}  ⚠`,
};
const log = (t, m) => console.log(`${el()} ${ICON[t] || `${C.c}▸`}${C.x} ${m}`);

(async () => {
  console.log(`\n${C.b}🍳 Sous${C.x}`);
  console.log(`${C.d}"${dish}" · you have: ${pantry.join(', ')} · serves ${serves}${C.x}\n`);

  // ---- 1. a real recipe, read off the live web
  const recipe = await findRecipe(dish, log);

  // ---- 2. reason about what genuinely needs buying
  const plan = await planShopping(recipe, pantry, serves, log);
  const { have, buy: need, scale } = plan;

  // anything named in the dish comes first — "paneer butter masala" must never
  // drop paneer to a max-items cap; then required; then optional garnishes
  const dishWords = dish.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const priority = (n) =>
    dishWords.some((w) => (n.name || '').includes(w) || (n.term || '').includes(w)) ? 0 : n.optional ? 2 : 1;
  const shopping = [...need].sort((a, b) => priority(a) - priority(b)).slice(0, maxItems);
  const dropped = need.filter((n) => !shopping.includes(n));
  if (dropped.length) log('skip', `leaving off ${dropped.length}: ${dropped.map((d) => d.name).slice(0, 4).join(', ')}`);

  console.log(`\n${C.b}🍲 ${recipe.title}${C.x}`);
  console.log(`${C.d}${recipe.host} · serves ${serves}${scale !== 1 ? ` (recipe serves ${recipe.serves}, ×${scale.toFixed(2)})` : ''} · via ${recipe.source}${C.x}`);

  const haveShown = [...new Map(have.map((h) => [h.term || h.name, h])).values()];
  console.log(`\n${C.b}ALREADY COVERED (${haveShown.length})${C.x}${C.d}${plan.reasoned ? ' · reasoned' : ''}${C.x}`);
  haveShown.forEach((h) => console.log(`  ${C.g}✓${C.x} ${(h.name || '').padEnd(24)}${C.d}${h.reason || h.matchedPantry || ''}${C.x}`));

  console.log(`\n${C.b}NEED TO BUY (${shopping.length})${C.x}`);
  shopping.forEach((n) => {
    const qty = n.qtyText || (n.qty ? `${n.qty}${n.unit || ''}` : '');
    console.log(`  ${C.y}•${C.x} ${(n.name || '').padEnd(24)}${C.d}${qty.padEnd(10)}${n.reason || ''}${C.x}`);
  });

  if (dryRun) { console.log(`\n${C.d}--dry-run: stopping before the cart · ${((Date.now() - t0) / 1000).toFixed(1)}s${C.x}\n`); return; }

  // ---- 3. fill the cart: Wire chooses in-stock alternatives, Playwright clicks
  console.log(`\n${C.b}FILLING YOUR FLIPKART MINUTES CART${C.x}`);
  try { await setAddress(pincode); log('rank', `delivery address set · ${pincode}`); }
  catch (e) { log('wire_fail', `address: ${String(e.message).slice(0, 45)}`); }

  const { browser, page } = await connect();
  try {
    const before = await readCart(page);
    log('rank', `cart currently holds ${before.items.length} item(s)`);

    const results = [];
    let snapshot = before;
    for (const n of shopping) {
      console.log('');
      results.push(await fillOne(page, n.term, log, { cart: snapshot }));
      snapshot = await readCart(page);          // keep the running view current
    }

    // ---- 4. reconcile against the real cart — the summary can only show what landed
    const after = await readCart(page);
    const added = results.filter((r) => r.added);
    const missed = results.filter((r) => !r.added);

    console.log(`\n${'═'.repeat(66)}`);
    console.log(`${C.b}CART VERIFIED${C.x}  ${after.items.length} items${after.total ? ` · ₹${after.total}` : ''}`);
    if (after.address) console.log(`${C.d}delivering to ${after.address.trim()} · ~10 min${C.x}`);
    console.log('═'.repeat(66));
    after.items.forEach((i) =>
      console.log(`  ${C.g}•${C.x} ${i.name.slice(0, 38).padEnd(40)} ${(i.pack || '').padEnd(8)} ${C.b}₹${i.price}${C.x}`));

    if (missed.length) {
      console.log(`\n${C.y}COULDN'T BUY (${missed.length})${C.x}`);
      missed.forEach((r) => {
        console.log(`  ${C.y}⚠${C.x} ${r.ingredient}`);
        (r.tried || []).slice(0, 2).forEach((t) => console.log(`     ${C.d}tried ${t.name.slice(0, 34)} — ${t.why}${C.x}`));
        (r.rejected || []).slice(0, 2).forEach((x) => console.log(`     ${C.d}${x.name.slice(0, 30)} — ${x.why}${C.x}`));
      });
    }

    console.log(`\n  ${C.b}${added.length}/${shopping.length}${C.x} of this run's ingredients reached the cart`);
    console.log(`  ${C.d}open flipkart.com/viewcart to pay — the agent never pays${C.x}`);
    console.log(`${C.d}\n  ${((Date.now() - t0) / 1000).toFixed(1)}s total${C.x}\n`);
  } finally { await browser.close(); }
})().catch((e) => { console.error(`\n${C.r}FAILED:${C.x} ${e.message}\n`); process.exit(1); });
