// Deciding WHAT to buy, with no browser involved.
//
// This exists because of a timing fact, not a tidiness one. Anakin's cloud browser
// has died 102 and 162 seconds into a session, and a human takes the better part
// of a minute to read an SMS and type six digits. That whole minute used to be
// dead time — the agent sat on an open browser doing nothing, then started
// searching and thinking only after the session was already half spent.
//
// So the shelf is worked out WHILE the OTP is in flight: four Wire searches go out
// in parallel, the model judges all of them in one batched call, and by the time
// the code arrives every decision is made. What's left inside the fragile session
// is nothing but clicks.
import { searchProducts } from './flipkartcart.js';
import { rankOptions } from './pick.js';
import { verifyProducts } from './plan.js';

// One prepared basket, keyed by the items it was prepared for. Small on purpose:
// a prepared basket is only worth anything for the next minute or two anyway.
let cached = null;   // { key, basket, misses, at }
const keyOf = (items) => items.map((s) => String(s).toLowerCase().trim()).sort().join('|');

export const takeBasket = (items) => {
  if (!cached || cached.key !== keyOf(items)) return null;
  const age = Date.now() - cached.at;
  return age < 10 * 60 * 1000 ? cached : null;
};

/**
 * Search, rank and judge every item. Returns what to click and what to skip.
 * Nothing here touches the browser, so it is safe to run before sign-in.
 */
export async function prepare(items, emit = () => {}) {
  emit('wire', `fk_search_products × ${items.length}, in parallel`);
  const shelves = await Promise.all(items.map(async (term) => {
    const all = await searchProducts(term, { limit: 10 }).catch((e) => {
      emit('warn', `${term}: search failed — ${String(e.message).slice(0, 60)}`);
      return [];
    });
    const options = rankOptions(all, term).slice(0, 8);
    emit('option', `${term} — ${all.length} returned · ${options.length} are really ${term}`);
    return { term, options };
  }));

  const askable = shelves.filter((s) => s.options.length);
  emit('think', `one batched judgement over ${askable.length} shelf${askable.length === 1 ? '' : 'ves'}`);
  const verdicts = askable.length
    ? await verifyProducts(askable.map(({ term, options }) =>
        ({ term, options: options.map((o) => o.product_name) }))).catch(() => new Map())
    : new Map();

  const basket = [];
  const misses = [];
  for (const { term, options } of shelves) {
    if (!options.length) { misses.push({ term, why: 'nothing on the shelf matched' }); continue; }
    const verdict = verdicts.get(term);
    const idx = verdict ? verdict.index : 0;
    if (idx === null || !options[idx]) {
      emit('reject', `none of these are ${term} — ${verdict?.why || 'no match'}`);
      misses.push({ term, why: verdict?.why || 'no match' });
      continue;
    }
    if (verdict?.why && idx !== 0) emit('think', `${term}: picked #${idx + 1} — ${verdict.why}`);
    basket.push({ term, pick: options[idx] });
  }

  cached = { key: keyOf(items), basket, misses, at: Date.now() };
  emit('check', `${basket.length} of ${items.length} decided — the browser only has to click now`);
  return cached;
}
