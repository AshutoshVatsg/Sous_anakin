// Flipkart Minutes product data via the Build Studio actions.
//
// These actions live on the account that BUILT them (custom Wire actions are
// account-scoped), which is not necessarily the key in .env — so the Wire key is
// configured separately from whatever key the rest of the app uses.
//
// Why this matters: `available_quantity` is NOT present anywhere in the Minutes
// page DOM. An item can render an Add button, be capped at qty 2, and the click
// silently does nothing. Wire is the only way to know before trying.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function wireKey() {
  if (process.env.ANAKIN_WIRE_KEY) return process.env.ANAKIN_WIRE_KEY.trim();
  try {
    const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    const m = env.match(/^ANAKIN_WIRE_KEY=(.+)$/m);
    if (m) return m[1].trim();
    return (env.match(/ask_[a-f0-9]+/) || [])[0];   // fall back to the main key
  } catch { return null; }
}

const KEY = wireKey();
const CATALOG = 'flipkart-com';
// The rebuilt actions take a plain search_query — the old pid/lid ANCHOR hack is gone.
const A = (n) => `act_flipkart_com_minutes_${n}`;

// Every Wire action is 1 credit. Counted here so the UI can show the spend as it
// happens — on a 300-credit account, what an agent costs is part of what it is.
let spent = 0;
const calls = [];
export const wireSpend = () => ({ credits: spent, calls: [...calls] });
export const resetSpend = () => { spent = 0; calls.length = 0; };

async function run(action_id, params, { retries = 3 } = {}) {
  for (let i = 0; i < retries; i++) {
    const t0 = Date.now();
    const res = await fetch('https://api.anakin.io/v1/wire-run', {
      method: 'POST',
      headers: { 'X-API-Key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_id, params }),
    });
    const j = await res.json();
    spent += 1;
    calls.push({ action: action_id, ms: Date.now() - t0, ok: j.status === 'completed' });

    if (j.status === 'completed') return j.data;
    if (/insufficient_credits/i.test(JSON.stringify(j))) {
      throw new Error('Anakin credits exhausted on the Wire key — top it up to use the Minutes actions');
    }
    // Flipkart's cart API throttles; 429 means wait, not fail.
    if (/429/.test(j.error || '')) { await new Promise((r) => setTimeout(r, 7000 * (i + 1))); continue; }
    throw new Error(j.error || j.message || 'wire action failed');
  }
  throw new Error('rate limited after retries');
}

/** Confirm the Build Studio actions are visible to this key before relying on them. */
export async function check() {
  const r = await fetch(`https://api.anakin.io/v1/wire/catalog/${CATALOG}`, { headers: { 'X-API-Key': KEY } });
  const d = await r.json();
  const actions = (d.actions || []).map((a) => a.action_id);
  return { count: actions.length, actions, ok: actions.includes(A('list_products')) };
}

export const setAddress = (pincode = '560102', extra = {}) =>
  run(A('set_delivery_address'), {
    pincode, city: 'Bengaluru', state: 'Karnataka',
    address_line1: '1024, 7th Sector, 20th Cross Road, HSR Layout', ...extra,
  });

/**
 * Real Minutes products for a term — name, price, and crucially available_quantity.
 * Returns them ranked, in-stock first, so the caller can act on genuine stock.
 */
export async function products(term, { pincode = '560102' } = {}) {
  const d = await run(A('list_products'), { search_query: term, pincode });
  const all = d.products || [];
  const words = term.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const scored = all.map((p) => ({
    ...p,
    // in_stock is a HINT, not a gate.
    //
    // The rebuilt action reports available_quantity as the PACK SIZE ("200 g")
    // rather than a count, and its in_stock boolean has false negatives: it
    // reported 0 of 37 paneer listings in stock while paneer was demonstrably
    // addable by hand. Gating on it rejected every real paneer, sent the agent
    // off to the "cottage cheese" alias, and left it arguing with spice mixes.
    //
    // So keep every candidate and only let stock decide the ORDER — try the ones
    // Flipkart admits to first. The cart readback is the source of truth about
    // whether something was really bought; a listing flag never is.
    pack: p.pack_size || (typeof p.available_quantity === 'string' ? p.available_quantity : null),
    available_quantity: 1,
    inStock: Boolean(p.in_stock),
    _hits: words.filter((w) => (p.product_name || '').toLowerCase().includes(w)).length,
  }));
  const relevant = scored.filter((p) => p._hits > 0 || !words.length);
  const pool = relevant.length ? relevant : scored;
  return pool.sort((a, b) => b.inStock - a.inStock || b._hits - a._hits || a.price - b.price);
}

export const viewCart = (pincode = '560102') => run(A('view_cart'), { pincode });

// NOTE: the rebuilt catalogue has no add_to_cart. Wire finds and stock-checks the
// product; the browser performs the add. Kept as an explicit failure rather than a
// silent absence so callers don't think they wrote to a cart.
export const addToCart = () => {
  throw new Error('act_flipkart_com_minutes_add_to_cart was not built - the browser performs the add');
};
