// Sous — cart handover.
//
// The web app works out WHAT to buy. This does the last step: adding those
// things to the judge's own Flipkart Minutes cart, in their own signed-in
// session. Their login never leaves their machine and nothing here can pay.
//
// WHY chrome.debugger AND NOT A CONTENT SCRIPT CLICK
// Flipkart's storefront is React Native Web. It ignores a synthetic
// element.click() and it ignores a lone dispatched mouse event — a content
// script can only produce those, so a content-script click silently does
// nothing and the cart badge never moves. chrome.debugger can send
// Input.dispatchMouseEvent, which arrives as a TRUSTED event, and a full
// move -> down -> up sequence is what the page actually believes. It is the
// same mechanism Playwright used when we drove this locally.

const SEARCH = (q) => `https://www.flipkart.com/search?q=${encodeURIComponent(q)}&marketplace=HYPERLOCAL`;
const CART = 'https://www.flipkart.com/viewcart';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- debugger plumbing ---------------- */

const attached = new Set();

async function attach(tabId) {
  if (attached.has(tabId)) return;
  await new Promise((res, rej) => {
    chrome.debugger.attach({ tabId }, '1.3', () =>
      chrome.runtime.lastError ? rej(new Error(chrome.runtime.lastError.message)) : res());
  });
  attached.add(tabId);
}

async function detach(tabId) {
  if (!attached.has(tabId)) return;
  await new Promise((res) => chrome.debugger.detach({ tabId }, () => res()));
  attached.delete(tabId);
}

const send = (tabId, method, params) => new Promise((res, rej) => {
  chrome.debugger.sendCommand({ tabId }, method, params, (r) =>
    chrome.runtime.lastError ? rej(new Error(chrome.runtime.lastError.message)) : res(r));
});

/**
 * A real mouse press at (x, y).
 *
 * The move matters. Pressing without moving first leaves the page thinking the
 * pointer is still wherever it was, and React Native Web's responder never
 * takes ownership of the touch.
 */
async function realClick(tabId, x, y) {
  const base = { x, y, button: 'left', clickCount: 1 };
  await send(tabId, 'Input.dispatchMouseEvent', { ...base, type: 'mouseMoved', buttons: 0 });
  await sleep(200);
  await send(tabId, 'Input.dispatchMouseEvent', { ...base, type: 'mousePressed', buttons: 1 });
  await sleep(90);
  await send(tabId, 'Input.dispatchMouseEvent', { ...base, type: 'mouseReleased', buttons: 0 });
}

/* ---------------- page helpers, injected ---------------- */

const run = async (tabId, func, args = []) => {
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return r?.result;
};

/**
 * Find the Add button for a product and return its centre — WITHOUT scrolling.
 *
 * Ported verbatim from the local agent, including both things that cost us hours:
 *
 *  - Keep only the INNERMOST elements whose text is "Add". A Minutes results page
 *    carries ~120 of them and most are ancestors wrapping several cards, so a
 *    naive match clicks a wrapper and lands on the wrong product.
 *  - Do NOT scroll. The grid lazy-loads; one scroll took the Add count from 20 to
 *    22 and the element we had measured no longer existed when the click landed.
 *    Only consider cards already on screen and measure them in the same pass.
 */
function findAddButton(target) {
  const vis = (e) => e.offsetParent !== null;
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/).filter((w) => w.length > 2);
  const want = norm(target);
  const isAdd = (e) => /^add$/i.test((e.innerText || '').trim());

  const adds = [...document.querySelectorAll('button,a,span,div')]
    .filter((e) => vis(e) && isAdd(e))
    .filter((e) => ![...e.querySelectorAll('*')].some(isAdd));

  let best = null, bestScore = 0;
  for (const a of adds) {
    const r = a.getBoundingClientRect();
    if (r.top < 60 || r.top > window.innerHeight - 60) continue;
    // Climb until the card's own text appears: levels 1-5 are just "Add",
    // 6-7 the price pair, and the product name only shows up around level 8.
    let c = a, sc = 0, label = '';
    for (let k = 0; k < 10 && c.parentElement; k++) {
      c = c.parentElement;
      const txt = (c.innerText || '').replace(/\s+/g, ' ');
      if (txt.length > 200) break;
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
}

/** Wait for the Add buttons to stop appearing — the grid lazy-loads. */
function countAdds() {
  const isAdd = (e) => /^add$/i.test((e.innerText || '').trim());
  return [...document.querySelectorAll('button,a,span,div')]
    .filter((e) => e.offsetParent && isAdd(e))
    .filter((e) => ![...e.querySelectorAll('*')].some(isAdd)).length;
}

/**
 * Read the real Minutes cart.
 *
 * Anchored on the PACK line, because Flipkart renders rating, votes and a
 * discount badge between the pack and the price — demanding name/pack/price on
 * three consecutive lines skipped every row and reported a full cart as empty.
 */
function scrapeCart() {
  const text = (document.body.innerText || '').replace(/\s+/g, ' ');
  const rows = (document.body.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const stopAt = rows.findIndex((l) =>
    /^(Deal unlocked|Items you may|Suggested for You|Recently Viewed|Save more with|You might also|Similar)/i.test(l));
  const lines = stopAt > 0 ? rows.slice(0, stopAt) : rows;

  const isPack = (s) => /^[\d.]+\s?-?\s?[\d.]*\s?(?:g|gm|gms|kg|ml|l|ltr|pc|pcs|piece|pieces|units?)$/i
    .test(String(s).split(',')[0].trim());
  const isPrice = (s) => /^₹\s?[\d,]+$/.test(s);
  const isGone = (s) => /^(out of stock|sold out|unavailable)$/i.test(String(s).trim());
  const isNoise = (s) => isPrice(s) || isPack(s) ||
    /^(Expiry|Deal|Qty|Save|Remove|Buy|Free|Apply|View|Continue|Shop|Total|MRP|Discount|Cart|Flipkart|Minutes)/i.test(s) ||
    /^\d+$/.test(s) || s.length < 4;

  const items = [];
  const seen = new Set();
  for (let i = 1; i < lines.length; i++) {
    if (!isPack(lines[i])) continue;
    const name = lines[i - 1];
    if (isNoise(name)) continue;
    let price = null, gone = false;
    for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
      if (isPack(lines[j])) break;
      if (isGone(lines[j])) { gone = true; break; }
      if (isPrice(lines[j])) price = Number(lines[j].replace(/[^\d]/g, ''));
    }
    if (price === null && !gone) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ name, pack: lines[i], price, outOfStock: gone });
  }
  return {
    count: Number((text.match(/Minutes\/Grocery ?\((\d+)\)/i) || [])[1]) || items.length,
    total: Number((text.match(/Total Amount ₹\s?([\d,]+)/i) || [])[1]?.replace(/,/g, '')) || null,
    items,
  };
}

/* ---------------- navigation ---------------- */

async function goto(tabId, url) {
  await chrome.tabs.update(tabId, { url });
  await new Promise((res) => {
    const done = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(done);
        res();
      }
    };
    chrome.tabs.onUpdated.addListener(done);
    setTimeout(() => { chrome.tabs.onUpdated.removeListener(done); res(); }, 45000);
  });
}

/** Wait until the lazy-loading grid stops adding buttons. */
async function settle(tabId, tries = 10) {
  let last = -1, stable = 0;
  for (let i = 0; i < tries; i++) {
    await sleep(1200);
    const n = await run(tabId, countAdds).catch(() => 0);
    if (n > 0 && n === last) { if (++stable >= 2) return n; } else stable = 0;
    last = n;
  }
  return last;
}

async function readCart(tabId) {
  await goto(tabId, CART);
  await sleep(5000);
  // Switch to the Minutes tab when it holds something — the page opens on the
  // Flipkart tab, which for a groceries run is the wrong one.
  const need = await run(tabId, () => {
    const m = (document.body.innerText || '').match(/Minutes\/Grocery \((\d+)\)/i);
    return m ? Number(m[1]) > 0 : false;
  }).catch(() => false);
  if (need) {
    await run(tabId, () => {
      const el = [...document.querySelectorAll('div,span,a,button')]
        .find((e) => e.offsetParent && /^Minutes\/Grocery/i.test((e.innerText || '').trim()));
      if (el) el.click();
    }).catch(() => {});
    await sleep(4000);
  }
  return (await run(tabId, scrapeCart).catch(() => null)) || { count: 0, items: [], total: null };
}

/* ---------------- the run ---------------- */

async function findFlipkartTab() {
  const tabs = await chrome.tabs.query({ url: 'https://www.flipkart.com/*' });
  if (tabs.length) return tabs[0].id;
  const t = await chrome.tabs.create({ url: 'https://www.flipkart.com/', active: true });
  await sleep(4000);
  return t.id;
}

let running = false;

async function fillCart(items, report) {
  if (running) throw new Error('a run is already in progress');
  running = true;
  const results = [];
  let tabId = null;
  try {
    tabId = await findFlipkartTab();
    await attach(tabId);
    report({ type: 'start', message: `${items.length} item${items.length === 1 ? '' : 's'} → your own Flipkart cart` });

    let cart = await readCart(tabId);
    // Shape this exactly like the server route's event. The page reads
    // event.data.cart, and sending only a message string crashed it.
    report({ type: 'cart', message: `cart holds ${cart.items.length} item(s)`, data: { cart } });

    for (const [i, it] of items.entries()) {
      const term = (it.term || it.name || String(it)).trim();
      report({ type: 'item', message: term, data: { name: term, state: 'working', i, of: items.length } });

      // Already there? Don't buy a second one.
      const have = cart.items.find((c) => c.name.toLowerCase().includes(term.toLowerCase().split(' ')[0]));
      if (have) {
        report({ type: 'item', message: `${term} — already in cart: ${have.name}`,
                 data: { name: term, state: 'already', product: have.name, price: have.price, i, of: items.length } });
        results.push({ term, added: have.name, alreadyThere: true });
        continue;
      }

      let added = null;
      // Up to 3 attempts: some Add buttons silently refuse, and the only honest
      // test is whether the cart changed.
      for (let attempt = 1; attempt <= 3 && !added; attempt++) {
        await goto(tabId, SEARCH(term));
        await settle(tabId);
        const spot = await run(tabId, findAddButton, [term]).catch(() => null);
        if (!spot) { report({ type: 'warn', message: `${term}: nothing on screen matched` }); break; }

        await realClick(tabId, spot.x, spot.y);
        await sleep(3000);

        const after = await readCart(tabId);
        const fresh = after.items.find((c) => !cart.items.some((p) => p.name === c.name));
        if (fresh) {
          added = fresh;
          cart = after;
        } else if (attempt < 3) {
          report({ type: 'retry', message: `${spot.label.slice(0, 40)} didn't reach the cart — trying another` });
        }
      }

      if (added) {
        report({ type: 'item', message: `${term} → ${added.name}`,
                 data: { name: term, state: 'added', product: added.name, pack: added.pack, price: added.price, i, of: items.length } });
        results.push({ term, added: added.name, price: added.price });
      } else {
        report({ type: 'item', message: `${term} — couldn't be added`,
                 data: { name: term, state: 'failed', why: 'the cart never acknowledged it', i, of: items.length } });
        results.push({ term, added: null });
      }
    }

    // Proof. The write's own word is not evidence.
    const final = await readCart(tabId);
    const added = results.filter((r) => r.added).length;
    report({ type: 'done', message: `${added} of ${items.length} in your Flipkart cart`,
             data: { results, added, asked: items.length, cart: final } });
    return { results, cart: final };
  } finally {
    running = false;
    if (tabId) await detach(tabId).catch(() => {});
  }
}

/* ---------------- install ---------------- */

// Inject the bridge into Sous tabs that are ALREADY open.
//
// Content scripts only reach pages loaded after the extension was installed, so a
// visitor who opens the site, reads "install the extension", installs it, and comes
// back to the tab would otherwise find it still inert and have to work out that a
// refresh is needed. Injecting on install means their next click just works.
chrome.runtime.onInstalled.addListener(async () => {
  try {
    const tabs = await chrome.tabs.query({
      url: ['http://localhost:3000/*', 'http://127.0.0.1:3000/*', 'https://*.onrender.com/*'],
    });
    for (const t of tabs) {
      chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['bridge.js'] })
        .catch(() => { /* tab closed, or not a page we may touch */ });
    }
  } catch { /* nothing open yet — the normal case */ }
});

/* ---------------- messaging ---------------- */

// From the Sous web app (localhost or the deployed origin).
chrome.runtime.onMessageExternal.addListener((msg, sender, respond) => {
  if (msg?.type === 'ping') { respond({ ok: true, version: chrome.runtime.getManifest().version }); return true; }
  if (msg?.type !== 'fillCart' || !Array.isArray(msg.items)) return false;
  const events = [];
  fillCart(msg.items, (e) => {
    events.push(e);
    chrome.runtime.sendMessage({ type: 'progress', event: e }).catch(() => {});
  })
    .then((r) => respond({ ok: true, ...r, events }))
    .catch((e) => respond({ ok: false, error: String(e.message), events }));
  return true;                       // keep the channel open for the async reply
});

// From the page, via bridge.js. A long-lived port so progress can stream back into
// the site's own activity feed as it happens, rather than arriving in one lump at
// the end — the feed is the part that shows the agent actually working.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'sous-fill') return;
  port.onMessage.addListener((msg) => {
    if (msg?.type !== 'fillCart' || !Array.isArray(msg.items)) return;
    const post = (m) => { try { port.postMessage(m); } catch { /* page navigated away */ } };
    fillCart(msg.items, (event) => post({ type: 'progress', event }))
      .then((result) => post({ type: 'end', ok: true, result }))
      .catch((e) => post({ type: 'end', ok: false, error: String(e.message) }));
  });
});

// From the popup.
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg?.type !== 'fillCart' || !Array.isArray(msg.items)) return false;
  fillCart(msg.items, (e) => { chrome.runtime.sendMessage({ type: 'progress', event: e }).catch(() => {}); })
    .then((r) => respond({ ok: true, ...r }))
    .catch((e) => respond({ ok: false, error: String(e.message) }));
  return true;
});
