#!/usr/bin/env node
// Add ingredients straight to the Flipkart Minutes cart (no recipe step).
//   node order.js paneer butter tomato
import { connect, fillOne, readCart } from './src/fill.js';
import { setAddress } from './src/minutesdata.js';

const ITEMS = process.argv.slice(2).length ? process.argv.slice(2) : ['paneer', 'butter'];
const ICON = { wire:'🔎', option:'   ', reject:'  ✗', added:'✅', retry:'  ↻',
               failed:'❌', wire_fail:'  ⚠', substitute:'  ⇄' };
const log = (t, m) => console.log(`${ICON[t] || '▸'} ${m}`);

(async () => {
  try { await setAddress('560102'); log('▸', 'delivery address set · 560102 HSR Layout'); }
  catch (e) { log('wire_fail', `address: ${String(e.message).slice(0,45)}`); }

  const { browser, page } = await connect();
  const results = [];
  try {
    const before = await readCart(page);
    console.log(`cart before: ${before.items.length} items\n`);
    for (const it of ITEMS) { results.push(await fillOne(page, it, log)); console.log(''); }

    const after = await readCart(page);
    const ok = results.filter(r => r.added);
    console.log('='.repeat(62));
    console.log(`CART: ${after.items.length} items · ₹${after.total ?? '?'}`);
    if (after.address) console.log(`deliver to ${after.address.trim()}`);
    console.log('='.repeat(62));
    after.items.forEach(i => console.log(`  • ${i.name.slice(0,40).padEnd(42)} ${(i.pack||'').padEnd(8)} ₹${i.price}`));
    const bad = results.filter(r => !r.added);
    if (bad.length) { console.log('\nnot added:'); bad.forEach(r => console.log(`  ⚠ ${r.ingredient}`)); }
    console.log(`\n  ${ok.length}/${ITEMS.length} of this run's ingredients added`);
  } finally { await browser.close(); }
})();
