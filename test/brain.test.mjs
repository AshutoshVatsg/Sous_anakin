// The brain's regression suite: parsing, scaling, and pantry coverage.
//
// These are the judgements that decide what lands in someone's cart, so every
// case below is one we actually got wrong at some point. Run with:  node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredient, scaleQuantity } from '../src/pipeline.js';
import { planShopping } from '../src/reason.js';

// useModel:false pins these to the deterministic rules. The suite exists to prove
// the floor the model is checked against — testing the model itself would be slow,
// non-deterministic, and would fail differently every week.
const plan = (raws, pantry, serves = 2, recipeServes = 2) =>
  planShopping(
    { title: 't', serves: recipeServes, ingredients: raws.map(parseIngredient) },
    pantry, serves, () => {}, { useModel: false },
  );

const covered = (p, name) => p.have.find((h) => h.name.includes(name));
const bought = (p, name) => p.buy.find((b) => b.name.includes(name));

test('parses quantities recipes actually write', () => {
  assert.equal(parseIngredient('1 & ½ inch ginger').name, 'ginger');
  assert.equal(parseIngredient('1 & ½ inch ginger').qty, 1.5);
  assert.equal(parseIngredient('200 to 250 grams paneer').qty, 200);
  assert.equal(parseIngredient('2 cups/300 grams curd').unit, 'cup');
  assert.equal(parseIngredient('1 inch ginger & 6 garlic cloves').name, 'ginger');
  assert.equal(parseIngredient('4 medium-sized tomatoes').name, 'medium-sized tomatoes');
  // both from one real vegrecipesofindia page
  assert.equal(parseIngredient('3  cloves').name, 'cloves', 'bare count word IS the product');
  assert.equal(parseIngredient('4 cloves garlic').name, 'garlic', '…but not when something follows it');
  assert.equal(parseIngredient('¼ teaspoon turmeric powder ((ground turmeric))').name, 'turmeric powder');
  // drinks and desserts measure in scoops and pints, not cups and inches
  assert.equal(parseIngredient('2 scoops vanilla ice cream').name, 'vanilla ice cream');
  assert.equal(parseIngredient('1 pint vanilla ice cream').name, 'vanilla ice cream');
  assert.equal(parseIngredient('a few banana chips').name, 'banana chips');
  // "1/2-inch piece fresh ginger" was becoming the product "piece ginger"
  assert.equal(parseIngredient('1/2-inch piece fresh ginger, finely chopped').term, 'ginger');
  assert.equal(parseIngredient('2 tbsps cocoa powder').unit, 'tbsp');
  assert.equal(parseIngredient('1 tej patta (– small sized, (Indian bay leaf))').term, 'bay leaf');
});

test('counts round up — you cannot buy a quarter of a cinnamon stick', () => {
  assert.equal(scaleQuantity(1, null, 0.25), 1);
  assert.equal(scaleQuantity(3, null, 0.5), 2);
  assert.equal(scaleQuantity(0.25, 'tsp', 0.5), 0.25);   // never vanishes
  assert.equal(scaleQuantity(200, 'g', 0.5), 100);
  assert.equal(scaleQuantity(null, 'g', 0.5), null);
});

test('size and knife-work words do not change what you buy', async () => {
  const p = await plan(['1 large white onion, thinly sliced', '4 medium tomatoes'],
    ['onion', 'tomato']);
  assert.ok(covered(p, 'onion'), 'a large white onion is an onion');
  assert.ok(covered(p, 'tomatoes'), 'a medium tomato is a tomato');
});

test('colour binds only where it is the product', async () => {
  const chilli = await plan(['2 green chillies', '1 tsp red chili powder'],
    ['red chilli', 'chilli powder']);
  assert.ok(bought(chilli, 'green chillies'), 'red chillies are not green chillies');
  assert.ok(covered(chilli, 'red chili powder'), 'chilli powder is red chilli powder');

  const onion = await plan(['1 white onion'], ['red onion']);
  assert.ok(covered(onion, 'onion'), 'onion colour is cosmetic');
});

test('a processed pantry item does not cover a whole one', async () => {
  const p = await plan(['½ cup fresh coriander leaves', '2 green chillies'],
    ['coriander powder', 'chilli powder']);
  assert.ok(bought(p, 'coriander'), 'coriander powder is not a bunch of coriander');
  assert.ok(bought(p, 'chillies'), 'chilli powder is not a fresh chilli');
});

test('and a whole pantry item does not cover a processed one', async () => {
  const p = await plan(['2 tbsp tomato puree'], ['tomato']);
  assert.ok(bought(p, 'puree'), 'a tomato is not tomato puree');
});

test('a ground blend covers the ground spice', async () => {
  const p = await plan(['1 tsp coriander powder', '½ tsp cumin powder', '¼ tsp cardamom powder'], ['garam masala']);
  for (const n of ['coriander', 'cumin', 'cardamom']) {
    assert.ok(covered(p, n), `garam masala should cover ${n} powder`);
  }
});

test('but never the whole spice you temper in fat', async () => {
  const p = await plan(['2 bay leaf', '1 inch cinnamon stick', '3 whole cloves', '1 tsp cumin seeds'],
    ['garam masala']);
  for (const n of ['bay leaf', 'cinnamon', 'clove', 'cumin']) {
    assert.ok(bought(p, n), `${n} is tempered whole — ground blend is not a substitute`);
  }
});

test('the cloves in "garlic cloves" are garlic', async () => {
  const p = await plan(['6 large garlic cloves'], ['garam masala']);
  assert.ok(bought(p, 'garlic'), 'a substring match had garam masala covering the garlic');
});

test('and never the fresh herb of the same name', async () => {
  const p = await plan(['2 tbsp chopped coriander leaves'], ['garam masala']);
  assert.ok(bought(p, 'coriander'), 'garam masala has coriander seed, not the leaves');
});

test('owning one half of a paste does not claim the other', async () => {
  const loose = await plan(['6 garlic cloves'], ['ginger']);
  assert.ok(bought(loose, 'garlic'), 'ginger is not ginger-garlic paste');

  const paste = await plan(['6 garlic cloves', '1 inch ginger'], ['ginger garlic paste']);
  assert.equal(paste.buy.length, 0, 'the paste covers both');
});

test('staples are never shopped for, whatever the recipe calls them', async () => {
  const p = await plan(['1 cup water', 'salt to taste', '½ tsp kosher salt', '1 tsp sea salt'], []);
  assert.equal(p.buy.length, 0, 'kosher salt is salt');
});

test('American produce names become what the shop stocks', () => {
  assert.equal(parseIngredient('1 medium green pepper, diced').term, 'capsicum');
  assert.equal(parseIngredient('2 tbsp chopped cilantro').term, 'coriander leaves');
  assert.equal(parseIngredient('1 cup all-purpose flour').term, 'maida');
});

test('units and fillers stack, and none of them are the product', () => {
  // every one of these came off a real page during a milkshake search
  assert.equal(parseIngredient('1 cup of vanilla ice cream').name, 'vanilla ice cream');
  assert.equal(parseIngredient('2 scoops of strawberry syrup').name, 'strawberry syrup');
  assert.equal(parseIngredient('1/2-inch piece fresh ginger').name, 'fresh ginger');
});
