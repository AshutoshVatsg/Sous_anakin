#!/usr/bin/env node
import { findRecipe, reconcile, source } from './src/pipeline.js';
import { getCredits } from './src/anakin.js';

const argv = process.argv.slice(2);
const dish = argv.find((a) => !a.startsWith('--')) || 'paneer butter masala';
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const pantry = flag('have', 'oil,salt').split(',').map(s => s.trim()).filter(Boolean);
const serves = parseInt(flag('serves', '2'), 10);

const C = { d:'\x1b[2m', b:'\x1b[1m', g:'\x1b[32m', y:'\x1b[33m', r:'\x1b[31m', c:'\x1b[36m', m:'\x1b[35m', x:'\x1b[0m' };
const t0 = Date.now();
const ICON = { sku:C.g+'✓', sku_miss:C.y+'⚠', sku_error:C.r+'✗', substitute:C.m+'⇄', retry:C.y+'↻', skip:C.d+'·' };
const emit = (t, m) => console.log(`${C.d}${((Date.now()-t0)/1000).toFixed(1).padStart(5)}s${C.x} ${ICON[t]||C.c+'▸'}${C.x} ${m}`);

(async () => {
  console.log(`\n${C.b}🍳 Cook What You Want${C.x}\n${C.d}${dish} · have: ${pantry.join(', ')} · serves ${serves}${C.x}\n`);
  const recipe = await findRecipe(dish, emit);
  const { have, need, scale } = reconcile(recipe, pantry, serves, emit);
  const sourced = await source(need, emit);

  console.log(`\n${C.b}🍲 ${recipe.title}${C.x}`);
  console.log(`${C.d}${recipe.host} · serves ${serves} (recipe serves ${recipe.serves}, ×${scale.toFixed(2)}) · via ${recipe.source}${C.x}`);

  console.log(`\n${C.b}ALREADY IN YOUR KITCHEN (${have.length})${C.x}`);
  have.forEach(h => console.log(`  ${C.g}✓${C.x} ${h.raw} ${C.d}← ${h.matchedPantry}${C.x}`));

  const ok = sourced.filter(s => s.sku);
  console.log(`\n${C.b}TO BUY (${ok.length}/${sourced.length})${C.x}`);
  let total = 0;
  ok.forEach(({ ing, sku, pack, line, found, substituted }) => {
    total += line;
    console.log(`  ${C.b}₹${String(line).padStart(6)}${C.x}  ${sku.brand} ${sku.name} ${C.d}· ${sku.pack_weight}${pack.packs>1?` ×${pack.packs}`:''}${C.x}`);
    console.log(`          ${C.d}for "${ing.raw}"${C.x}`);
    if (pack.exact) console.log(`          ${C.c}↳ ${pack.explain}${C.x}`);
    if (substituted) console.log(`          ${C.m}⇄ ${substituted.from} was out of stock${C.x}`);
    console.log(`          ${C.d}${found} products checked on BigBasket${C.x}`);
  });

  const miss = sourced.filter(s => !s.sku);
  if (miss.length) { console.log(`\n${C.y}COULD NOT SOURCE (${miss.length})${C.x}`); miss.forEach(m => console.log(`  ${C.y}⚠${C.x} ${m.ing.raw} ${C.d}(${m.reason})${C.x}`)); }

  console.log(`\n  ${C.b}Basket total  ₹${total.toFixed(2)}${C.x}   ${C.d}${miss.length?'PARTIAL · ':''}plan verified in-stock · cart not filled${C.x}`);
  console.log(`${C.d}\n${((Date.now()-t0)/1000).toFixed(1)}s · ~${getCredits()} credits${C.x}\n`);
})().catch(e => { console.error(`\n${C.r}FAILED:${C.x} ${e.message}\n`); process.exit(1); });
