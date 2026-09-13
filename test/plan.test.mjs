// The search the agent plans for itself.
//
// Only the no-key fallback is asserted here — the planned path is a live model
// call, and a test that needs the network is a test that fails on a Tuesday. What
// matters is that the fallback has the same SHAPE, so every caller works either way.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fallbackPlan } from '../src/plan.js';

test('the fallback plan has the shape callers rely on', () => {
  const p = fallbackPlan('something with paneer');
  assert.equal(p.ingredient, 'paneer');
  assert.equal(p.broad, true);
  assert.equal(p.planned, false, 'and is honest about not being planned');
  assert.deepEqual(p.wants, []);
  assert.ok(p.queries.length >= 6);
  assert.ok(p.queries.every((q) => q.q.includes('paneer') && q.tag));
});

test('a named dish still goes down the narrow path without a key', () => {
  const p = fallbackPlan('Paneer Butter Masala');
  assert.equal(p.broad, false);
  assert.ok(p.queries.every((q) => q.q.toLowerCase().includes('paneer butter masala')));
});

test('a budget adds cheap angles even in the fallback', () => {
  const plain = fallbackPlan('paneer', 0).queries.length;
  const withBudget = fallbackPlan('paneer', 300).queries.length;
  assert.ok(withBudget > plain, 'naming a price should widen the search, not narrow it');
});
