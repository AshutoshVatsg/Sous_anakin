// Pricing a basket without spending a credit per item — and being honest about it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { priceOf, estimateBasket } from '../src/price.js';

const items = (...names) => names.map((n) => ({ name: n, term: n }));

// 'bread' is in the seed table and deliberately not in the warm-up list, so it
// stays a "typical" price no matter what the live cache has learned.
test('common groceries have a price, seeded or seen', () => {
  const p = priceOf('paneer');
  assert.ok(p.price > 0);
  assert.ok(p.source === 'live' || p.source === 'typical');
  assert.equal(priceOf('bread').source, 'typical');
});

test('a qualifier does not lose the match', () => {
  assert.ok(priceOf('kashmiri red chilli powder'), 'a grade is still the same product');
  assert.equal(priceOf('sliced bread').via, 'bread');
  assert.equal(priceOf('fresh coriander leaves').via, 'coriander leaves');
});

test('but another food in front of it makes it a different product', () => {
  // both of these used to price silently and wrongly — coconut milk as milk (₹34),
  // bread crumbs as bread (₹45). No price beats a confident wrong one.
  // Synthetic, so the assertion holds whatever the live cache has learned since.
  assert.equal(priceOf('xyzzy milk'), null, 'an unknown word in front is a different product');
  assert.equal(priceOf('xyzzy bread'), null);

  // And the real ones, which now have real prices of their own, must never be
  // priced AS the thing they merely end with.
  for (const t of ['coconut milk', 'bread crumbs']) {
    const p = priceOf(t);
    if (p) assert.ok(!['milk', 'bread'].includes(p.via), `${t} priced via ${p.via}`);
  }
});

test('singular and plural are the same product', () => {
  const a = priceOf('cashew'), b = priceOf('cashews');
  if (a || b) assert.equal(a?.price, b?.price, 'one cashew and many cashews cost the same pack');
});

test('an unknown item is unknown, not zero', () => {
  assert.equal(priceOf('dragonfruit compote'), null);
  assert.equal(priceOf(''), null);
});

test('a basket reports what it could not price', () => {
  const e = estimateBasket(items('paneer', 'garam masala', 'dragonfruit compote'));
  assert.equal(e.count, 3);
  assert.equal(e.priced, 2);
  assert.deepEqual(e.unpriced, ['dragonfruit compote']);
  assert.ok(e.coverage > 0.6 && e.coverage < 0.7);
  assert.ok(e.total > 0);
});

test('a basket priced from the seed table is never called "live"', () => {
  assert.equal(estimateBasket(items('bread', 'eggs')).source, 'estimate');
});

test('the spice jars are separated from the dinner', () => {
  const e = estimateBasket(items('paneer', 'cream', 'garam masala', 'cardamom powder', 'bay leaf'));
  assert.ok(e.keeps > 0, 'spices are pantry stock you keep');
  assert.equal(e.keeps + e.fresh, e.total, 'the split must account for everything');
  const dinner = estimateBasket(items('paneer', 'cream'));
  assert.equal(dinner.keeps, 0, 'paneer and cream are not pantry stock');
});

test('an empty basket costs nothing and hides nothing', () => {
  const e = estimateBasket([]);
  assert.equal(e.total, 0);
  assert.equal(e.coverage, 1);
  assert.deepEqual(e.unpriced, []);
});
