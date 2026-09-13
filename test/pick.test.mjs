// Picking the right thing off the shelf.
//
// These came out of real Flipkart Minutes responses. The first one is why this
// file exists: asked for "fresh cream", Wire's own relevance order answered with
// "Nandini Samrudhi Full Cream Milk", and word overlap happily agreed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isRealMatch, rankOptions } from '../src/pick.js';

const ok = (product, ingredient) => isRealMatch(product, ingredient).ok;

test('milk is not cream, whatever the label says', () => {
  assert.equal(ok('Nandini Samrudhi Full Cream Milk', 'fresh cream'), false);
  assert.equal(ok('Amul Fresh Cream', 'fresh cream'), true);
  assert.equal(ok('Amul Taaza Toned Milk', 'milk'), true);
});

test('the dairy aisle is full of things that are not each other', () => {
  assert.equal(ok('Amul Butter', 'ghee'), false);
  assert.equal(ok('Gowardhan Cow Ghee', 'ghee'), true);
  assert.equal(ok('Amul Malai Paneer', 'paneer'), true);
  assert.equal(ok('Amul Malai Paneer', 'fresh cream'), false);
  assert.equal(ok('Nandini Curd', 'curd'), true);
  assert.equal(ok('Nandini Curd', 'fresh cream'), false);
});

test('flours and dals are not interchangeable either', () => {
  assert.equal(ok('Aashirvaad Whole Wheat Atta', 'atta'), true);
  assert.equal(ok('Pillsbury Chakki Fresh Atta', 'maida'), false);
  assert.equal(ok('Tata Sampann Moong Dal', 'chana dal'), false);
  assert.equal(ok('Tata Sampann Toor Dal', 'toor dal'), true);
});

test('a spice sold ground is still that spice', () => {
  assert.equal(ok('Catch Turmeric Powder', 'turmeric'), true);
  assert.equal(ok('Everest Jeera Seeds', 'cumin'), true);
  assert.equal(ok('Aachi Garam Masala', 'garam masala'), true);
});

test('but a sauce made of it is not it', () => {
  assert.equal(ok('Kissan Fresh Tomato Ketchup', 'tomato'), false);
  assert.equal(ok('Dabur Hommade Tomato Puree', 'tomato puree'), true);
});

test('regional names count as the same thing', () => {
  assert.equal(ok('OPEN SECRET Premium Whole Kaju', 'cashews'), true);
  assert.equal(ok('Fresho Palak', 'spinach'), true);
});

test('nothing from the beauty aisle ends up in dinner', () => {
  // both of these were genuinely returned for a recipe ingredient
  assert.equal(ok("POND's Bright Beauty Day Brightening Face Cream", 'cream'), false);
  assert.equal(ok('Matte Lip Crayon', 'half and half'), false);
  assert.equal(ok('Dove Body Wash', 'curd'), false);
  assert.equal(ok('Amul Fresh Cream', 'cream'), true, 'and real cream still gets through');
});

test('ranking keeps only the real matches', () => {
  const wire = [
    { product_name: 'Nandini Samrudhi Full Cream Milk', price: 27, available_quantity: 9 },
    { product_name: 'Amul Fresh Cream', price: 75, available_quantity: 4 },
    { product_name: 'Milky Mist Fresh Cream', price: 72, available_quantity: 0 },
  ];
  const ranked = rankOptions(wire, 'fresh cream');
  assert.ok(ranked.length >= 1);
  assert.ok(ranked.every((p) => /cream/i.test(p.product_name) && !/milk/i.test(p.product_name)));
  assert.equal(ranked[0].product_name, 'Amul Fresh Cream', 'in stock beats out of stock');
});
