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
  // Switch to Minutes whenever that tab exists and isn't already showing.
  //
  // The old condition was `!empty || !hasMinutesTab`, which is true the moment the
  // FLIPKART tab holds anything — so with one parcel item in the cart it never
  // switched, read the wrong tab, and reported an empty Minutes basket while the
  // groceries sat one click away.
  try {
    const need = await p.evaluate(() => {
      const t = document.body.innerText || '';
      const m = t.match(/Minutes\/Grocery \((\d+)\)/i);
      if (!m) return false;                       // single-tab layout
      // The active tab's rows are what innerText shows below the tab strip. If the
      // Minutes count is non-zero but no row is rendered, we're on the other tab.
      return Number(m[1]) > 0;
    });
    if (need) {
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

    // Anchor on the PACK line, not on the price.
    //
    // This used to demand name/pack/price on three consecutive lines. Flipkart now
    // renders rating, vote count and a discount badge between the pack and the
    // price — "EVEREST Garam Masala / 100 g / 4.5 / • / (902) / 2% / Rs272 / Rs266"
    // — so the triple never matched, every row was skipped, and a cart holding
    // items read as empty. That made every successful add look like a failure.
    //
    // The pack line is the reliable anchor: the name sits immediately above it, and
    // the price is the LAST rupee figure in the few lines below (struck-through MRP
    // comes first, the payable price second).
    const items = [];
    const seen = new Set();
    for (let i = 1; i < rows.length; i++) {
      if (!isPack(rows[i])) continue;
      const name = rows[i - 1];
      if (isNoise(name)) continue;

      let price = null, gone = false;
      for (let j = i + 1; j < Math.min(i + 8, rows.length); j++) {
        if (isPack(rows[j])) break;                  // ran into the next row
        if (isGone(rows[j])) { gone = true; break; }
        if (isPrice(rows[j])) price = Number(rows[j].replace(/[^\d]/g, ''));
      }
      if (price === null && !gone) continue;         // not a cart row at all

      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ name, pack: rows[i], price, outOfStock: gone });
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

/**
 * Find the card matching a product name and click its Add — by identity, not index.
 *
 * Two things this has to survive, both measured on the live Minutes page:
 *
 * 1. ~120 Add buttons for ~8 distinct products. They are carousel duplicates and
 *    they ALL report the same y coordinate, stacked on top of each other. Picking
 *    any element whose text is "Add" grabs an ancestor wrapping several cards, and
 *    the click then lands on whatever happens to be on top — which is how "ginger"
 *    matched at score 1.0, clicked, and never reached the cart.
 *    Fix: keep only the INNERMOST Add elements (ones containing no further Add).
 *
 * 2. Coordinates measured before a scroll has painted point off-screen, and a click
 *    at y=963 in a 900px viewport silently does nothing. Fix: scroll first, let it
 *    paint, then re-measure in a second evaluate. Same approach as AIM() in
 *    cloudcart.js, which is what made the cloud-browser path reliable.
 */
async function clickCardFor(p, productName) {
  // Measure and click WITHOUT moving the page.
  //
  // scrollIntoView looked like the right fix and was the regression. The Minutes
  // grid lazy-loads: one scroll took the Add-button count from 20 to 22, React
  // replaced the card, and the element we had just measured no longer existed when
  // the click landed. Playwright's own .click() auto-scrolls, so it failed the same
  // way. Four ancestor levels, raw mouse and .click() all missed for the same reason.
  //
  // So: only consider cards already on screen, and take the coordinates in the same
  // evaluate that chooses them. settle() has already waited for the grid to stop
  // changing, which is what makes that safe.
  const spot = await p.evaluate((target) => {
    const vis = (e) => e.offsetParent !== null;
    const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
    const want = norm(target);
    const isAdd = (e) => /^add$/i.test((e.innerText || '').trim());

    // Innermost Add elements only. There are ~120 on a Minutes results page and
    // most are ancestors wrapping several cards.
    const adds = [...document.querySelectorAll('button,a,span,div')]
      .filter((e) => vis(e) && isAdd(e))
      .filter((e) => ![...e.querySelectorAll('*')].some(isAdd));

    let best = null, bestScore = 0;
    for (const a of adds) {
      const r = a.getBoundingClientRect();
      if (r.top < 60 || r.top > window.innerHeight - 60) continue;   // on screen already
      // Climb until the card's own text shows up. Levels 1-5 are just "Add", 6-7
      // the price pair; the product name only appears around level 8.
      let c = a, sc = 0, label = '';
      for (let k = 0; k < 10 && c.parentElement; k++) {
        c = c.parentElement;
        const txt = (c.innerText || '').replace(/\s+/g, ' ');
        if (txt.length > 200) break;          // climbed past the card into the grid
        const have = norm(txt);
        const s2 = want.filter((w) => have.includes(w)).length / (want.length || 1);
        if (s2 > sc) { sc = s2; label = txt.slice(0, 60); }
      }
      if (sc > bestScore) {
        bestScore = sc;
        best = { x: r.x + r.width / 2, y: r.y + r.height / 2, label, score: sc };
      }
    }
    return best && bestScore >= 0.4 ? best : null;
  }, productName);

  if (!spot) return { clicked: false, why: 'no matching card on screen' };

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
