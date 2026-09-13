// The model proposes; the rules hold the floor.
//
// Every case here is a real answer a real model gave when eight of them were
// benchmarked on one paneer recipe. The point of this layer is that a model being
// right most of the time is not the same as being safe to trust with a cart.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredient } from '../src/pipeline.js';
import { rulePlan, reconcilePlans } from '../src/reason.js';

const RAWS = [
  '15 whole cashews', '1 & ½ inch ginger', '6 large garlic cloves',
  '2 tbsp unsalted butter', '250 g paneer', '1 cup water', 'salt to taste',
];
const PANTRY = ['onion', 'tomato', 'oil', 'salt'];
const rules = () => rulePlan({ title: 't', serves: 2, ingredients: RAWS.map(parseIngredient) }, PANTRY, 2);

const bought = (p, n) => p.buy.find((b) => b.name.includes(n));
const covered = (p, n) => p.have.find((h) => h.name.includes(n));

test('a model that forgets an ingredient does not remove it', () => {
  // gpt-5.4-mini really did drop both of these from a dish that needs them
  const out = { buy: [{ item: 'cashews' }, { item: 'unsalted butter' }, { item: 'paneer' }], have: [] };
  const p = reconcilePlans(rules(), out, PANTRY);
  assert.ok(bought(p, 'ginger'), 'ginger was in the recipe and nothing covers it');
  assert.ok(bought(p, 'garlic'), 'garlic was in the recipe and nothing covers it');
  assert.ok(p.notes.some((n) => /left it out/.test(n)), 'and the gap is reported, not hidden');
});

test('a model that invents an ingredient does not get to add it', () => {
  // gpt-5.4-nano added black pepper, which appears nowhere in the recipe
  const out = { buy: [{ item: 'paneer' }, { item: 'black pepper powder' }], have: [] };
  const p = reconcilePlans(rules(), out, PANTRY);
  assert.ok(!bought(p, 'pepper'), 'not in the recipe, not in the cart');
  assert.deepEqual(p.invented, ['black pepper powder']);
});

test('coverage has to point at something in the kitchen', () => {
  const out = {
    buy: [{ item: 'paneer' }],
    have: [{ item: 'whole cashews', reason: 'commonly available at home' }],
  };
  const p = reconcilePlans(rules(), out, PANTRY);
  assert.ok(bought(p, 'cashews'), 'a vibe is not a pantry item');
  assert.ok(p.notes.some((n) => /nothing to cover it/.test(n)));
});

test('…and is accepted when it does', () => {
  const out = {
    buy: [{ item: 'paneer' }],
    have: [{ item: '1 & ½ inch ginger', reason: 'you have ginger garlic paste' }],
  };
  const p = reconcilePlans(rules(), out, [...PANTRY, 'ginger garlic paste']);
  assert.ok(covered(p, 'ginger'), 'the reason names something they own');
});

test('the model may add a purchase the rules thought was covered', () => {
  const withPaste = ['1 inch ginger', '4 garlic cloves'].map(parseIngredient);
  const base = rulePlan({ title: 't', serves: 2, ingredients: withPaste }, ['ginger garlic paste'], 2);
  assert.equal(base.buy.length, 0, 'the rules cover both from the paste');

  const out = { buy: [{ item: 'ginger', reason: 'the paste is cooked; this dish wants it fresh' }], have: [] };
  const p = reconcilePlans(base, out, ['ginger garlic paste']);
  assert.ok(bought(p, 'ginger'), 'the model knows something the rules do not');
  assert.ok(p.notes.some((n) => /we inferred you had it/.test(n)), 'and the disagreement is on the record');
});

test('but not one the cook said they already own', () => {
  const ing = ['4 medium tomatoes', '1 tsp red chilli powder'].map(parseIngredient);
  const base = rulePlan({ title: 't', serves: 2, ingredients: ing }, ['tomato', 'chilli powder'], 2);
  assert.equal(base.buy.length, 0);

  // gpt-5.4 really did try to sell tomatoes to someone who had ticked "tomato"
  const out = { buy: [{ item: 'tomatoes' }, { item: 'red chilli powder' }], have: [] };
  const p = reconcilePlans(base, out, ['tomato', 'chilli powder']);
  assert.equal(p.buy.length, 0, 'the kitchen they described is not the model\'s to overrule');
});

test('nobody gets sold water or salt', () => {
  const out = { buy: [{ item: 'water' }, { item: 'salt' }, { item: 'paneer' }], have: [] };
  const p = reconcilePlans(rules(), out, PANTRY);
  assert.ok(!p.buy.some((b) => b.name === 'water'));
  assert.ok(!p.buy.some((b) => b.name === 'salt'), 'note "unsalted butter" contains "salt"');
});

test('every line of the recipe survives the round trip', () => {
  const r = rules();
  const p = reconcilePlans(r, { buy: [], have: [] }, PANTRY);
  assert.equal(p.have.length + p.buy.length, r.have.length + r.buy.length,
    'an empty model answer must change nothing');
});
