// The REAL Flipkart cart, entirely through Anakin.
//
// Two Flipkart catalogues exist and they are not the same thing:
//
//   flipkart-com   Minutes / quick commerce. Custom Build Studio actions we had
//                  commissioned. `auth_mode: none` — an ANONYMOUS cart, which is
//                  why the cooking flow drives your own browser instead.
//
//   flipkart       The main marketplace. `fk_add_to_cart` is `auth_mode: required`
//                  and adds to the AUTHENTICATED USER'S cart. No browser, no CDP,
//                  no debug port — and the item lands in the cart you actually
//                  check out from.
//
// Cupboard stock — ghee, masala, atta, dal — is ordinary marketplace grocery, not
// ten-minute delivery. So it belongs on this path, and this path is pure Anakin.
//
// It needs one thing the Minutes actions didn't: a connected IDENTITY. Without one
// every authenticated call fails, so `identities()` is checked first and the error
// says what to do rather than what went wrong.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CATALOG = 'flipkart';

function envVal(name) {
  if (process.env[name]) return process.env[name].trim();
  try {
    const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(new RegExp(`^${name}=(.+)$`, 'm'));
    return m ? m[1].trim() : null;
  } catch { return null; }
}
// This catalogue is public Anakin, not a custom build, so the main key reaches it.
const KEY = envVal('ANAKIN_API_KEY') || envVal('ANAKIN_WIRE_KEY');

let spent = 0;
const calls = [];
export const cartSpend = () => ({ credits: spent, calls: [...calls] });
export const resetCartSpend = () => { spent = 0; calls.length = 0; };

/**
 * /v1/wire-run executes even async-declared actions synchronously and returns the
 * result inline — verified against this API — so there is no polling loop here.
 */
async function run(action_id, params, { retries = 3, cost = 3 } = {}) {
  if (!KEY) throw new Error('No Anakin key — set ANAKIN_API_KEY in .env');

  for (let i = 0; i < retries; i++) {
    const t0 = Date.now();
    const res = await fetch('https://api.anakin.io/v1/wire-run', {
      method: 'POST',
      headers: { 'X-API-Key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_id, params }),
    });
    const j = await res.json().catch(() => ({}));
    spent += cost;
    calls.push({ action: action_id, ms: Date.now() - t0, ok: j.status === 'completed' });

    if (j.status === 'completed') return j.data ?? j;

    const blob = JSON.stringify(j);
    if (/INSUFFICIENT_CREDITS|insufficient_credits/i.test(blob)) {
      const bal = j.error?.balance ?? 0;
      throw new Error(`Anakin credits exhausted (balance ${bal}) — ${action_id} costs ${cost}`);
    }
    // An authenticated action with no identity fails every time; retrying wastes credits.
    if (/identit|unauthor|not logged|login required/i.test(blob)) {
      throw new Error(`${action_id} needs a connected Flipkart identity — add one in the Anakin dashboard under the flipkart site, then retry`);
    }
    if (/429|rate/i.test(j.error?.message || j.error || '')) {
      await new Promise((r) => setTimeout(r, 7000 * (i + 1)));
      continue;
    }
    throw new Error(j.error?.message || j.error || j.message || `${action_id} failed`);
  }
  throw new Error(`${action_id}: rate limited after retries`);
}

/** Which Flipkart logins Anakin can act as. Empty means nothing authenticated will run. */
export async function identities() {
  const r = await fetch('https://api.anakin.io/v1/wire/identities', { headers: { 'X-API-Key': KEY } });
  const d = await r.json().catch(() => ({}));
  const all = d.identities || [];
  return all.filter((x) => !x.site || /flipkart/i.test(x.site) || /flipkart/i.test(x.catalog || ''));
}

/** Confirm the catalogue is visible and say whether the cart actions can actually run. */
export async function check() {
  const r = await fetch(`https://api.anakin.io/v1/wire/catalog/${CATALOG}`, { headers: { 'X-API-Key': KEY } });
  const d = await r.json().catch(() => ({}));
  const actions = (d.actions || []).map((a) => a.action_id);
  const ids = await identities().catch(() => []);
  return {
    actions,
    hasCart: actions.includes('fk_add_to_cart'),
    identities: ids.length,
    ready: actions.includes('fk_add_to_cart') && ids.length > 0,
  };
}

const num = (v) => {
  const n = Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

/**
 * Search the marketplace. Normalised into the same shape `rankOptions` already
 * expects, so the matcher and the model verifier work here unchanged.
 */
export async function searchProducts(term, { pincode = '560102', limit = 10 } = {}) {
  const d = await run('fk_search_products', { query: term, pincode, domain: 'in', limit: String(limit) },
    { cost: 2 });
  const list = d.products || d.results || d.items || (Array.isArray(d) ? d : []);
  return list.map((p) => ({
    product_name: p.title || p.name || p.product_name || '',
    price: num(p.price ?? p.selling_price ?? p.current_price),
    product_id: p.pid || p.product_id || p.productId || null,
    listing_id: p.lid || p.listing_id || p.listingId || null,
    url: p.url || p.link || null,
    rating: p.rating ?? null,
    // The marketplace doesn't publish stock the way Minutes does. Anything it
    // returns is purchasable, so don't invent a number we can't see.
    available_quantity: 1,
    inStock: true,
  })).filter((p) => p.product_name && p.product_id);
}

/** Add to the authenticated user's cart. Returns whatever the action reports. */
export const addToCart = (product_id, listing_id, quantity = 1, price = null) =>
  run('fk_add_to_cart', {
    product_id,
    listing_id,
    quantity: String(quantity),
    ...(price ? { price: String(price) } : {}),
  }, { cost: 3 });

/** Read the authenticated cart back — proof, independent of what the write claimed. */
export const viewCart = (pincode = '560102') =>
  run('fk_view_cart', { pincode }, { cost: 3 });
