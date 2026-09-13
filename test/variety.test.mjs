// Variety: five results for "paneer" should be five different dinners.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readCraving, readBudget, readProtein, parseProtein, styleQueries, dishQueries, budgetFit, budgetCeiling, mentions, dishKind, lightness, signature, pickDiverse } from '../src/variety.js';

const card = (title, extra = {}) => ({
  title, description: '', ingredients: [], ...extra,
  kind: undefined, _score: extra._score ?? 1,
});
const classified = (title, extra) => { const c = card(title, extra); c.kind = dishKind(c); return c; };

test('an ingredient asks for ideas, a dish asks for that dish', () => {
  assert.deepEqual(readCraving('something with paneer'), { ingredient: 'paneer', broad: true });
  assert.deepEqual(readCraving('paneer'), { ingredient: 'paneer', broad: true });
  assert.equal(readCraving('Paneer Butter Masala').broad, false);
  assert.equal(readCraving('dal tadka').broad, false);
});

test('people type sentences, not search queries', () => {
  // typed verbatim into the box; it used to search for the whole sentence
  const r = readCraving('hey I want to eat panner dish');
  assert.equal(r.ingredient, 'paneer', 'filler stripped and the typo fixed');
  assert.equal(r.broad, true, 'this is a request for ideas, not for one named dish');

  assert.equal(readCraving('can you find me some chicken recipes').ingredient, 'chicken');
  assert.equal(readCraving("I'm craving aloo tonight").ingredient, 'aloo');
  assert.equal(readCraving('show me a paneer dish for dinner').broad, true);

  // and a named dish still survives the filter intact
  assert.equal(readCraving('hey make me Paneer Butter Masala').ingredient, 'Paneer Butter Masala');
  assert.equal(readCraving('hey make me Paneer Butter Masala').broad, false);
});

test('a price can just be said out loud', () => {
  assert.deepEqual(readBudget('something with paneer around ₹400'),
    { text: 'something with paneer', budget: 400, mode: 'around' });
  assert.equal(readBudget('paneer under 500').budget, 500);
  assert.equal(readBudget('paneer under 500').mode, 'under');
  assert.equal(readBudget('chicken below rs 300').mode, 'under');
  assert.equal(readBudget('dal upto 250').mode, 'under');
  assert.equal(readBudget('paneer for 600 rupees').budget, 600);
  assert.equal(readBudget('₹350 paneer dish').budget, 350);
});

test('a number that is not a price stays out of the budget', () => {
  // these all used to be the same regex, and all of them are traps
  assert.equal(readBudget('paneer 65 fry').budget, 0, '65 is the dish, not the money');
  assert.equal(readBudget('biryani for 4 people').budget, 0);
  assert.equal(readBudget('something with paneer').budget, 0);
  assert.equal(readBudget('paneer around 10').budget, 0, 'too small to be a grocery shop');
  assert.equal(readBudget('paneer under 999999').budget, 0);
});

test('the price is taken out of what we search for', () => {
  const { text } = readBudget('paneer tikka under ₹450');
  assert.equal(text, 'paneer tikka', 'searching for "under ₹450" would find nothing');
  assert.equal(readCraving(readBudget('something with paneer around 400').text).ingredient, 'paneer');
});

test('a broad craving fans out across styles of cooking', () => {
  const tags = styleQueries('paneer').map((s) => s.tag);
  for (const t of ['dry', 'gravy', 'grilled', 'light', 'snack', 'rice']) assert.ok(tags.includes(t), t);
  assert.ok(styleQueries('paneer').every((s) => s.q.includes('paneer')));
  assert.ok(dishQueries('dal tadka').every((s) => s.q.includes('dal tadka')));
});

test('the style is read off the recipe, not the search that found it', () => {
  assert.equal(dishKind(card('Paneer Bhurji')), 'dry');
  assert.equal(dishKind(card('Dry Paneer Sabzi')), 'dry');
  assert.equal(dishKind(card('Paneer Tikka (Oven & Tawa)')), 'grilled');
  assert.equal(dishKind(card('Paneer Butter Masala')), 'gravy');
  assert.equal(dishKind(card('Kadai Paneer Recipe')), 'gravy');
  assert.equal(dishKind(card('Paneer Biryani')), 'rice');
  assert.equal(dishKind(card('Paneer Pakora')), 'snack');
  // not everything people ask for is a curry
  assert.equal(dishKind(card('Thick and Creamy Oreo Milkshake')), 'drink');
  assert.equal(dishKind(card('Mango Lassi')), 'drink');
  assert.equal(dishKind(card('Gajar Ka Halwa')), 'sweet');
});

test('paneer tikka masala is a curry, not a grill', () => {
  assert.equal(dishKind(card('Paneer Tikka Masala')), 'gravy');
});

test('"lighter" is a fact about the ingredients or it is not claimed', () => {
  const ing = (...names) => names.map((n) => ({ name: n, raw: n }));
  assert.ok(lightness(card('x', { ingredients: ing('paneer', 'capsicum', 'onion') })));
  assert.equal(lightness(card('x', { ingredients: ing('paneer', 'fresh cream') })), null);
  assert.equal(lightness(card('x', { ingredients: ing('paneer', 'unsalted butter') })), null);
  assert.equal(lightness(card('x', { ingredients: ing('paneer', 'oil for deep frying') })), null);
});

test('the signature strips the ingredient and the filler', () => {
  assert.deepEqual(signature('How to Make Paneer Butter Masala, Step by Step', 'paneer'), ['butter']);
  assert.deepEqual(signature('Paneer Bhurji Recipe | Restaurant Style', 'paneer'), ['bhurji']);
  assert.deepEqual(signature('Easy Paneer Masala Recipe', 'paneer'), []);
});

test('five sites\' butter masala is one idea, not five', () => {
  const ranked = [
    classified('Paneer Butter Masala', { _score: 9 }),
    classified('Butter Paneer Makhani', { _score: 8 }),
    classified('How to Make Paneer Butter Masala, Step by Step', { _score: 7 }),
    classified('Paneer Bhurji', { _score: 6 }),
    classified('Paneer Tikka', { _score: 5 }),
    classified('Paneer Biryani', { _score: 4 }),
  ];
  const picked = pickDiverse(ranked, 4, 'paneer').map((c) => c.title);
  assert.ok(picked.includes('Paneer Butter Masala'), 'the best one still leads');
  assert.ok(!picked.includes('How to Make Paneer Butter Masala, Step by Step'), 'no second butter masala');
  for (const t of ['Paneer Bhurji', 'Paneer Tikka', 'Paneer Biryani']) {
    assert.ok(picked.includes(t), `${t} should make the shortlist`);
  }
});

test('a dish has to actually contain what was asked for', () => {
  const dish = (title, ...names) => ({ title, ingredients: names.map((n) => ({ name: n, term: n })) });

  // all three really came back for "I want to eat oats dish today"
  assert.equal(mentions(dish('Indian Style Savory Oats', 'rolled oats', 'onion'), 'oats'), true);
  assert.equal(mentions(dish('Tandoori Mushroom Tikka', 'mushroom', 'curd'), 'oats'), false);
  assert.equal(mentions(dish('Biriyani Pulao Recipe', 'basmati rice', 'onion'), 'oats'), false);

  // the ingredient can be in the list without being in the title
  assert.equal(mentions(dish('Masala Dosa', 'oats flour', 'urad dal'), 'oats'), true);
  // and singular/plural must not decide it
  assert.equal(mentions(dish('Baked Oatmeal', 'rolled oat', 'milk'), 'oats'), true);
  assert.equal(mentions(dish('Egg Bhurji', 'egg', 'onion'), 'eggs'), true);
  // every word of a two-word craving has to land
  assert.equal(mentions(dish('Paneer Bhurji', 'paneer', 'onion'), 'paneer tikka'), false);
  // and regional names count, given the alias table
  const alias = (w) => (w === 'spinach' ? ['spinach', 'palak'] : [w]);
  assert.equal(mentions(dish('Palak Paneer', 'palak', 'paneer'), 'spinach', alias), true);
});

test('"around ₹400" is a target, not a race to the bottom', () => {
  const at = (n) => budgetFit(n, 400, 'around');
  assert.equal(at(380), 1, 'right in the zone');
  assert.equal(at(440), 1, 'inside the tolerance band');
  assert.ok(at(200) < at(380), 'half the budget answers the question less well');
  assert.ok(at(90) < at(200), 'and a tenth of it even less');
  assert.ok(at(600) < 0, 'over the line is a penalty, not a low score');
});

test('"under ₹400" is a limit, so cheap is simply fine', () => {
  const at = (n) => budgetFit(n, 400, 'under');
  assert.equal(at(390), 1);
  assert.equal(at(200), 1, 'well under a limit is not a flaw');
  assert.ok(at(60) < 1, 'but suspiciously cheap is still nudged down');
  assert.ok(at(500) < 0);
  assert.ok(budgetCeiling(400, 'under') < budgetCeiling(400, 'around'));
});

test('with no price named, nothing about the budget applies', () => {
  assert.equal(budgetFit(500, 0), 0);
  assert.equal(budgetFit(0, 400), 0);
});

test('a stated price is a constraint, not a tiebreaker', () => {
  const dish = (title, meal, score) => {
    const c = card(title, { _score: score });
    c.kind = dishKind(c); c.cost = { priced: 3, meal };
    return c;
  };
  // the expensive ones score higher on everything except the thing that was asked for
  const ranked = [
    dish('Paneer Butter Masala', 520, 9),
    dish('Shahi Paneer', 610, 8),
    dish('Paneer Pulao', 700, 7),
    dish('Paneer Bhurji', 140, 6),
    dish('Chilli Paneer', 180, 5),
  ];
  const fits = (c) => c.cost.meal <= 200;
  const picked = pickDiverse(ranked, 3, 'paneer', { fits }).map((c) => c.title);
  assert.equal(picked[0], 'Paneer Bhurji', 'the cheapest that fits leads, not the best-scoring');
  assert.ok(picked.includes('Chilli Paneer'), 'both in-budget dishes come before any over it');
  assert.equal(picked.length, 3, 'and the list is still filled out');
});

test('when nothing fits, it still returns the cheapest rather than nothing', () => {
  const dish = (title, meal, score) => {
    const c = card(title, { _score: score });
    c.kind = dishKind(c); c.cost = { priced: 3, meal };
    return c;
  };
  const ranked = [dish('Paneer Butter Masala', 520, 9), dish('Paneer Bhurji', 480, 6)];
  const picked = pickDiverse(ranked, 2, 'paneer', { fits: () => false });
  assert.equal(picked.length, 2, 'an empty screen is not an answer');
});

test('variety never costs us the count', () => {
  const ranked = [
    classified('Paneer Butter Masala', { _score: 9 }),
    classified('Paneer Butter Masala Recipe', { _score: 8 }),
    classified('Easy Paneer Butter Masala', { _score: 7 }),
  ];
  assert.equal(pickDiverse(ranked, 3, 'paneer').length, 3, 'backfills rather than returning short');
  assert.equal(pickDiverse(ranked, 3, 'paneer')[0].title, 'Paneer Butter Masala');
});

test('a protein goal is read before the price, not as the price', () => {
  const g = readProtein('100g protein under ₹600');
  assert.equal(g.wanted, true);
  assert.equal(g.goal, 100);
  // and the 100 must be gone, or the budget parser plans a ₹100 dinner
  assert.ok(!/100/.test(g.text), `left "${g.text}"`);
  assert.equal(readBudget(g.text).budget, 600);
});

test('protein asked for without a number is still a protein request', () => {
  assert.deepEqual(
    { wanted: readProtein('protein rich diet under 600').wanted, goal: readProtein('protein rich diet under 600').goal },
    { wanted: true, goal: null });
  assert.equal(readProtein('something with paneer').wanted, false);
  assert.equal(readProtein('I want to complete my protein').wanted, true);
});

test('veg and non-veg are picked up, and absent when unsaid', () => {
  assert.equal(readProtein('high protein veg dinner').diet, 'veg');
  assert.equal(readProtein('high protein chicken meal').diet, 'nonveg');
  assert.equal(readProtein('90g protein for today').diet, null, 'unsaid means show both');
});

test('protein is parsed from however the site writes it', () => {
  assert.equal(parseProtein('30 g'), 30);
  assert.equal(parseProtein('14 grams'), 14);
  assert.equal(parseProtein('5g'), 5);
  assert.equal(parseProtein(null), null);
  assert.equal(parseProtein('900 g'), null, 'not a plate of food — a parse error');
});
