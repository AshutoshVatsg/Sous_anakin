// Filling the Flipkart Minutes cart, with honest verification.
//
// Verification rule: a click is never evidence. After each ingredient we read the
// REAL cart and check the chosen product is in it. At the end we reconcile the whole
// basket against the cart page, so the summary can only report what actually landed.
import { chromium } from 'playwright-core';
import { products as wireProducts } from './minutesdata.js';
import { rankOptions, rejections, isRealMatch, cartKey } from './pick.js';
import { remember } from './price.js';
import { aliasesOf, ensure } from './knowledge.js';
import { verifyProducts } from './plan.js';

const SEARCH = (q) => `https://www.flipkart.com/search?q=${encodeURIComponent(q)}&marketplace=HYPERLOCAL`;
const CART = 'https://www.flipkart.com/viewcart';

export async function connect() {
  const b = await chromium.connectOverCDP('http://localhost:9222', { timeout: 90000 });
  const ctx = b.contexts()[0];
  const p = ctx.pages().find((x) => /flipkart\.com/.test(x.url())) || (await ctx.newPage());
  await p.bringToFront().catch(() => {});
  return { browser: b, page: p };
}

/**
 * Everything currently in the Minutes cart.
 *
 * The cart page has two tabs — "Flipkart" and "Minutes/Grocery" — and it opens on
 * the Flipkart one, which for a groceries run is empty. Reading without switching
 * tabs reports an empty cart while Minutes holds the items. That bug made every
 * successful add look like a failure.
 */
export async function readCart(p) {
  await p.goto(CART, { timeout: 60000, waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);

  // switch to the Minutes tab if it isn't already showing
  try {
    const onMinutes = await p.evaluate(() =>
      !/Your cart is empty/i.test(document.body.innerText || '') ||
      !/Minutes\/Grocery/i.test(document.body.innerText || ''));
    if (!onMinutes) {
      await p.getByText(/Minutes\/Grocery/i).first().click({ timeout: 8000 });
      await p.waitForTimeout(4000);
    }
  } catch { /* single-tab layout, or already there */ }

  // wait out "Hang on, loading content"
  for (let i = 0; i < 8; i++) {
    const loading = await p.evaluate(() => /Hang on, loading/i.test(document.body.innerText || '')).catch(() => false);
    if (!loading) break;
    await p.waitForTimeout(2000);
  }

  // The tab header says how many items are in there — "Minutes/Grocery (4)" — so
  // the parse can be checked against it instead of trusted. It was returning 1 of
  // 4 on a half-loaded page, and this read is what stops the agent buying a second
  // garam masala, so an under-read is not a cosmetic bug.
  let out = await scrapeCart(p);
  for (let i = 0; i < 5 && out.count > out.items.length; i++) {
    await p.waitForTimeout(2500);
    const retry = await scrapeCart(p);
    if (retry.items.length <= out.items.length) continue;
    out = retry;
  }
  if (out.count > out.items.length) out.partial = true;   // say so rather than pretend
  return out;
}

function scrapeCart(p) {
  return p.evaluate(() => {
    const text = (document.body.innerText || '').replace(/\s+/g, ' ');
    const lines = (document.body.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean);

    // The cart rows come first; below them sit "you may also like" carousels with the
    // same name/pack/price shape. Stop at the first recommendation heading.
    const stopAt = lines.findIndex((l) =>
      /^(Deal unlocked|Items you may|Suggested for You|Recently Viewed|Save more with|You might also|Similar)/i.test(l));
    const rows = stopAt > 0 ? lines.slice(0, stopAt) : lines;

    // Flipkart writes the pack with a variant after a comma — "100 g, Pure
    // Flavoured", "2 Units, 400-500gm" — so only the part before the comma is the
    // pack. Requiring the whole line to be a pack lost 2 of 4 rows.
    const isPack = (s) =>
      /^[\d.]+\s?-?\s?[\d.]*\s?(?:g|gm|gms|kg|ml|l|ltr|pc|pcs|piece|pieces|units?)$/i
        .test(String(s).split(',')[0].trim());
    const isPrice = (s) => /^₹\s?[\d,]+$/.test(s);
    // An out-of-stock row has no price at all. It is still IN the cart, and the
    // duplicate guard has to see it or the agent buys a second one.
    const isGone = (s) => /^(out of stock|sold out|unavailable)$/i.test(String(s).trim());
    const isNoise = (s) =>
      isPrice(s) || isPack(s) ||
      /^(Expiry|Deal|Qty|Save|Remove|Buy|Free|Apply|View|Continue|Shop|Total|MRP|Discount|Cart|Flipkart|Minutes)/i.test(s) ||
      /^\d+$/.test(s) || s.length < 4;

    const items = [];
    const seen = new Set();
    for (let i = 2; i < rows.length; i++) {
      const priced = isPrice(rows[i]), gone = isGone(rows[i]);
      if (!priced && !gone) continue;
      const pack = rows[i - 1], name = rows[i - 2];
      if (!isPack(pack) || isNoise(name)) continue;          // require a real <name>/<pack>/₹ triple
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        name, pack,
        price: priced ? Number(rows[i].replace(/[^\d]/g, '')) : null,
        outOfStock: gone,
      });
    }

    return {
      count: Number((text.match(/Minutes\/Grocery ?\((\d+)\)/i) || text.match(/(\d+) ?Cart/i) || [])[1]) || items.length,
      total: Number((text.match(/Total Amount ₹\s?([\d,]+)/i) || [])[1]?.replace(/,/g, '')) || null,
      address: (text.match(/Deliver to:?\s*([^|]{0,55}\d{6})/i) || [])[1] || null,
      items,
    };
  });
}

const addCount = (p) => p.evaluate(() => [...document.querySelectorAll('button,div,span,a')]
  .filter((e) => e.offsetParent && /^add$/i.test((e.innerText || '').trim())).length);

async function settle(p, tries = 12) {
  let last = -1, stable = 0;
  for (let i = 0; i < tries; i++) {
    await p.waitForTimeout(1300);
    const n = await addCount(p).catch(() => 0);
    if (n > 0 && n === last) { if (++stable >= 2) return n; } else stable = 0;
    last = n;
  }
  return last;
}

/** Find the card matching a product name and click its Add — by identity, not index. */
async function clickCardFor(p, productName) {
  const spot = await p.evaluate((target) => {
    const vis = (e) => e.offsetParent !== null;
    const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
    const want = norm(target);
    let best = null, bestScore = 0;
    [...document.querySelectorAll('button,div,span,a')]
      .filter((e) => vis(e) && /^add$/i.test((e.innerText || '').trim()))
      .forEach((a) => {
        let c = a; for (let k = 0; k < 6 && c.parentElement; k++) c = c.parentElement;
        const txt = (c.innerText || '').replace(/\s+/g, ' ');
        const r = a.getBoundingClientRect();
        if (r.top < 60 || r.top > window.innerHeight - 60) return;
        const have = norm(txt);
        const s = want.filter((w) => have.includes(w)).length / (want.length || 1);
        if (s > bestScore) {
          bestScore = s;
          best = { x: r.x + r.width / 2, y: r.y + r.height / 2, label: txt.slice(0, 60), score: s };
        }
      });
    return best;
  }, productName);

  if (!spot || spot.score < 0.4) return { clicked: false, why: 'no matching card on screen' };
  await p.mouse.move(spot.x, spot.y);
  await p.waitForTimeout(220);
  await p.mouse.down(); await p.waitForTimeout(100); await p.mouse.up();
  await p.waitForTimeout(2800);
  return { clicked: true, label: spot.label };
}

/**
 * Buy one ingredient. Tries real alternatives across brands, and proves each
 * attempt against the actual cart rather than trusting the click.
 */
export async function fillOne(p, ingredient, emit = () => {}, { maxTries = 4, cart = null } = {}) {
  // Don't buy what's already in the basket. Without this, a failed verification
  // turns into five garam masalas.
  const current = cart || await readCart(p);
  const already = current.items.find((it) => isRealMatch(it.name, ingredient).ok);
  if (already) {
    emit('already', `${ingredient} — already in cart: ${already.name} ${already.pack || ''} ₹${already.price}`);
    return { ingredient, added: already, alreadyThere: true, tried: [], rejected: [] };
  }

  // Ask the shop under every name we know this by, not just the one the recipe
  // used. A single term meant that when "kasuri methi" came back empty the agent
  // gave up — while the knowledge layer was sitting on "dried fenugreek leaves".
  await ensure([ingredient], emit).catch(() => 0);   // no-op if already known
  const names = [...new Set([ingredient, ...aliasesOf(ingredient)])].slice(0, 3);
  let options = [], rejected = [], usedName = ingredient;

  for (const name of names) {
    try {
      const all = await wireProducts(name);
      const ranked = rankOptions(all, name);
      if (!ranked.length) {
        emit('oos', `${name}: ${all.length} found, none of them are ${name}`);
        rejected = rejected.length ? rejected : rejections(all, name);
        continue;
      }
      options = ranked;
      rejected = rejections(all, name);
      usedName = name;
      if (name !== ingredient) emit('substitute', `nothing under "${ingredient}" — the shop calls it "${name}"`);
      break;
    } catch (e) {
      emit('wire_fail', `${name}: Wire unavailable (${String(e.message).slice(0, 36)})`);
    }
  }

  if (options.length) {
    emit('wire', `${usedName}: ${options.length} real, in-stock alternatives`);
    // The rules narrow the shelf; the model settles which of the survivors IS the
    // thing. Without this, "banana" put a Banana Stem in a real cart.
    const verdict = (await verifyProducts([{ term: usedName, options: options.map((o) => o.product_name) }])
      .catch(() => new Map())).get(usedName);
    if (verdict) {
      if (verdict.index === null) {
        emit('reject', `none of these are ${usedName} — ${verdict.why}`);
        options = [];
      } else if (verdict.index > 0) {
        emit('option', `picked #${verdict.index + 1} — ${verdict.why}`);
        options = [options[verdict.index], ...options.filter((_, i) => i !== verdict.index)];
      }
    }
    if (options[0]?.price > 0) remember(ingredient, { price: options[0].price, name: options[0].product_name });
    options.slice(0, 4).forEach((o, i) =>
      emit('option', `${i + 1}. ${o.product_name} ₹${o.price} (${o.available_quantity} in stock)`));
    rejected.slice(0, 3).forEach((r) => emit('reject', `${r.name} ₹${r.price} — ${r.why}`));
  }

  const targets = options.length ? options : [{ product_name: ingredient, price: null, available_quantity: null }];
  const tried = [];

  for (const opt of targets.slice(0, maxTries)) {
    await p.goto(SEARCH(opt.product_name), { timeout: 60000, waitUntil: 'domcontentloaded' });
    await settle(p);
    const r = await clickCardFor(p, opt.product_name);
    if (!r.clicked) { tried.push({ name: opt.product_name, why: r.why }); continue; }

    // PROOF: is it in the real cart now?
    const cart = await readCart(p);
    const key = cartKey(opt.product_name);
    const inCart = cart.items.find((it) => {
      const a = cartKey(it.name).split(' '), b = key.split(' ');
      return b.filter((w) => a.includes(w)).length / (b.length || 1) >= 0.5;
    });
    if (inCart) {
      emit('added', `${ingredient} → ${inCart.name} ${inCart.pack || ''} ₹${inCart.price}`);
      // A real price, seen in a real cart. Remembering it makes every later
      // estimate better and costs nothing.
      remember(ingredient, { price: inCart.price, pack: inCart.pack, name: inCart.name });
      if (tried.length) emit('substitute', `(${tried[0].name} couldn't be added — used this instead)`);
      return { ingredient, added: inCart, chose: opt, tried, rejected };
    }
    tried.push({ name: opt.product_name, why: 'clicked but never reached the cart' });
    emit('retry', `${opt.product_name} didn't reach the cart — trying the next alternative`);
  }

  emit('failed', `${ingredient}: ${tried.length} alternatives tried, none reached the cart`);
  return { ingredient, added: null, tried, rejected };
}
