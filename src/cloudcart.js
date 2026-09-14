// The flipkart.com marketplace cart, filled by Anakin's cloud browser.
//
// WHY THIS SHAPE
// Two Anakin routes to the real Flipkart cart were tried and both are blocked by
// one defect — a persisted Flipkart session isn't one Flipkart will honour:
//
//   fk_add_to_cart (HTTP scraper + browser_state credential)
//        → [scraper_error] HTTP 400, every authenticated call, even with empty params
//   cloud browser + session_name=flipkart
//        → 14 cookies restore, Flipkart still shows "Login" (3/3 attempts)
//
// What DOES work is logging in fresh inside ONE connection and staying there. So
// this module holds a single cloud-browser connection open across the whole run:
// sign in once with an OTP, then add every item through it.
//
// Nothing here touches the local machine. No Playwright against localhost, no
// debug port, no CDP to your Chrome. The browser is Anakin's, the network is
// Anakin's, and the cart is the real flipkart.com marketplace cart.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
function envVal(name) {
  if (process.env[name]) return process.env[name].trim();
  try {
    const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(new RegExp(`^${name}=(.+)$`, 'm'));
    return m ? m[1].trim() : null;
  } catch { return null; }
}
const KEY = () => envVal('ANAKIN_SESSION_KEY') || envVal('ANAKIN_API_KEY');

/* ---------------- the held connection ---------------- */

// Shared by the login request and the add-items request, and on globalThis ON PURPOSE. Next's dev server reloads a module per route, so a
// module-level `let` gave us TWO copies of this file: the sign-in route kept the
// browser while the pantry route got a fresh empty one and reported "not signed
// in" with a live session sitting right there. Editing any file during a run was
// enough to trigger it. One store, outside the module graph, fixes both.
const S = (globalThis.__sousCloud ||= { held: null, otpResolve: null });

export const status = () => ({
  connected: Boolean(S.held),
  signedIn: Boolean(S.held?.signedIn),
  awaitingOtp: Boolean(S.otpResolve),
  openedAt: S.held?.openedAt || null,
});

/**
 * Re-read the live page instead of trusting the cached flag.
 *
 * signIn() can time out waiting for a redirect that then lands a second later,
 * leaving a genuinely signed-in browser flagged false and unusable. The browser is
 * the truth; the flag is a cache.
 */
export async function recheck() {
  if (!S.held?.page) return { ...status() };

  // A tunnel that has died still leaves S.held populated, so status() keeps
  // reporting connected:true and the next run clicks at a corpse. Probe it, and
  // drop the reference if it's gone — the UI then correctly asks for a sign-in.
  const alive = await S.held.page.evaluate(() => true).catch(() => false);
  if (!alive) { S.held = null; S.otpResolve = null; return { ...status() }; }

  S.held.signedIn = await signedIn(S.held.page);
  return { ...status() };
}

export async function disconnect() {
  if (S.held?.browser) await S.held.browser.close().catch(() => {});
  S.held = null; S.otpResolve = null;
}

/** Hand an OTP to a login that's waiting for one. */
export function supplyOtp(code) {
  const digits = String(code || '').replace(/\D/g, '');
  if (!S.otpResolve || digits.length < 4) return false;
  S.otpResolve(digits); S.otpResolve = null;
  return true;
}

/* ---------------- page helpers, all proven against the live site ---------------- */

// Anakin's browser is slow enough that domcontentloaded can time out on Flipkart.
// Navigate on 'commit' and poll for real content instead.
//
// Deliberately fast and deliberately shallow: this only answers "is there a page
// here yet". It is NOT a readiness check — Flipkart's header alone clears 600
// characters in the first poll, and the login screen never stops changing at all,
// so making this wait for a stable page cost 20 seconds and found nothing. See
// ready() for the check that actually matters before a click.
async function settle(page, want = 600, tries = 24) {
  for (let i = 0; i < tries; i++) {
    await page.waitForTimeout(700);
    const n = await page.evaluate(() => (document.body?.innerText || '').length).catch(() => 0);
    if (n > want) return n;
  }
  return 0;
}

/**
 * Wait until an element is not just present but actually wired up.
 *
 * This is the one that was missing. A product page renders the words "Add to cart"
 * long before React attaches a handler to them, so the button was found, a real
 * mouse press landed on it, and absolutely nothing happened. There's no direct
 * "is React listening" signal, so use the closest proxy: the element has to be
 * findable and its position has to stop moving. A page still laying out is a page
 * still hydrating.
 */
async function ready(page, label, tries = 14) {
  let prev = null;
  for (let i = 0; i < tries; i++) {
    const spot = await page.evaluate(AIM, label).catch(() => null);
    if (spot && prev && Math.abs(spot.x - prev.x) < 2 && Math.abs(spot.y - prev.y) < 2) return true;
    prev = spot;
    await page.waitForTimeout(600);
  }
  return Boolean(prev);
}

const go = (page, url) => page.goto(url, { timeout: 90000, waitUntil: 'commit' });

// Find the SMALLEST visible element whose own text is exactly `label`, scroll it to
// the middle of the viewport, and return fresh coordinates. Measuring before the
// scroll paints gives coordinates that are off the screen, and a click at y=963 in
// a 900px viewport silently does nothing — that cost an afternoon.
const AIM = (label) => {
  const vis = (e) => e.offsetParent !== null;
  const leaf = [...document.querySelectorAll('button,a,span,div')].filter(vis)
    .filter((e) => new RegExp(`^${label}$`, 'i').test((e.innerText || '').trim()))
    .sort((a, b) => a.getElementsByTagName('*').length - b.getElementsByTagName('*').length)[0];
  if (!leaf) return null;
  leaf.scrollIntoView({ block: 'center', inline: 'center' });
  const r = leaf.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};

/**
 * Click by identity, not by index, with a real mouse.
 *
 * Flipkart is React Native Web: it ignores element.click() and synthetic events
 * entirely. Only move → down → up through the browser's input pipeline registers.
 */
async function clickLabel(page, label) {
  await page.evaluate(AIM, label);       // scroll
  await page.waitForTimeout(1400);
  const spot = await page.evaluate(AIM, label);   // re-measure after it settles
  if (!spot) return false;
  await page.mouse.move(spot.x, spot.y);
  await page.waitForTimeout(280);
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.mouse.up();
  return true;
}

// What Flipkart says when it won't send another code. Worth keeping literal: the
// 24-hour wording is a hard block, not a "wait a moment".
const BLOCKED = /maximum attempts reached[^.]*.?[^.]*|too many (?:attempts|requests)|retry in \d+ hours?|try again later/i;

// Signed in, for ANY account. Matching the account name only ever worked for the
// one account it was written against: a different number shows a different name,
// nothing matched, and a successful login was reported as "still shows a login
// screen" — throwing away a real OTP.
//
// The header is identical either way except for one word. Logged out it offers
// "Login"; logged in it shows the account name in that exact slot. So read the
// absence, not the name.
const signedIn = (page) =>
  page.evaluate(() => {
    const t = (document.body.innerText || '');
    if (t.length < 20) return false;
    const head = t.slice(0, 400);
    if (/Log ?in|Sign ?in/i.test(head)) return false;
    return /Account|Logout|My Orders|Cart/i.test(head);
  }).catch(() => false);

/* ---------------- connect + sign in ---------------- */

/**
 * Open a cloud browser, hedged.
 *
 * Anakin's tunnel fails about two attempts in three, and the failures are
 * independent — so waiting out a dead one, then backing off, then trying again
 * spent 21 of 29 seconds doing nothing. Instead a second attempt is launched
 * while the first is still in flight, a third after that, and the first tunnel
 * that actually opens wins. Losers are closed immediately.
 *
 * Cost: a race that needs all three costs 3 credits instead of 1. On a session
 * that has died as early as 102 seconds, seconds are worth more than credits.
 */
function openBrowser(url, emit, { tries = 3, stagger = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false, launched = 0, failed = 0, last = null;
    let timer = null;
    const stop = () => { if (timer) clearInterval(timer); };

    const launch = async () => {
      const id = ++launched;
      emit('wire', id === 1
        ? 'opening an Anakin cloud browser (1 credit / 2 min)'
        : `tunnel still opening — racing attempt ${id}`);
      try {
        const browser = await chromium.connectOverCDP(url, { timeout: 45000 });
        const ctx = browser.contexts()[0] || await browser.newContext();
        const page = ctx.pages()[0] || await ctx.newPage();
        await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
        if (settled) { await browser.close().catch(() => {}); return; }  // lost the race
        emit('wire', `tunnel open (attempt ${id})`);
        settled = true; stop();
        if (id > 1) emit('check', `attempt ${id} won the race`);
        resolve({ browser, page });
      } catch (e) {
        last = e; failed++;
        if (settled) return;
        if (launched < tries) launch();                 // a dead tunnel is replaced at once
        else if (failed >= launched) {
          stop();
          reject(new Error(`Anakin cloud browser would not open after ${tries} tries — `
            + String(last?.message || 'unknown').split('\n')[0].slice(0, 90)));
        }
      }
    };

    timer = setInterval(() => { if (!settled && launched < tries) launch(); }, stagger);
    launch();
  });
}

const LOGIN_URL = 'https://www.flipkart.com/account/login?ret=/';

export async function connect(emit = () => {}, { landing = 'https://www.flipkart.com/' } = {}) {
  // Reuse only a browser that is still alive AND already where we want it.
  //
  // A failed run leaves S.held populated. Reusing it blindly handed sign-in a dead
  // or homepage-parked tab, which then reported "could not find the phone field on
  // Flipkart" with only the search box on the page — a confusing way to say "this
  // browser is not the one you think it is".
  if (S.held?.browser) {
    const alive = await S.held.page.evaluate(() => true).catch(() => false);
    if (!alive) {
      emit('warn', 'the held browser had died — opening a fresh one');
      await S.held.browser.close().catch(() => {});
      S.held = null; S.otpResolve = null;
    } else {
      if (S.held.landedOn !== landing) {
        emit('wire', 'reusing the open Anakin browser');
        await go(S.held.page, landing);
        await settle(S.held.page);
        S.held.landedOn = landing;
      } else {
        emit('wire', 'reusing the open Anakin browser');
      }
      return S.held;
    }
  }
  const key = KEY();
  if (!key) throw new Error('No Anakin key — set ANAKIN_API_KEY in .env');

  // Do NOT pass session_name.
  //
  // session_name asks Anakin to RESTORE a saved jar, and on an account that has
  // never saved one the whole tunnel 404s before it opens:
  //   404 {"error":"session not found, not yet saved, or in use","session_name":"flipkart"}
  // Playwright surfaces that as the useless "Target page, context or browser has
  // been closed", which the 3-way race then reports as three separate failures.
  //
  // Nothing is lost by dropping it: Flipkart refuses restored cookies anyway —
  // 14 cookies come back and the page still says "Login", 3 attempts out of 3
  // (ANAKIN-BUG-REPORT #12). We sign in fresh every run regardless.
  //
  // save_session is kept: it costs nothing and creates the jar for the record.
  const url = `wss://api.anakin.io/v1/browser-connect?api_key=${key}&country=IN`
    + `&save_session=flipkart&save_url=https://www.flipkart.com/`;

  const { browser, page } = await openBrowser(url, emit);
  // Land straight on the page the caller wants. Loading the homepage first and
  // then navigating cost a whole page load out of a ~100-second session.
  await go(page, landing);
  await settle(page);

  const already = await signedIn(page);
  S.held = { browser, page, signedIn: already, landedOn: landing, openedAt: new Date().toISOString() };
  emit(already ? 'check' : 'warn', already
    ? 'the restored session is live — no sign-in needed'
    : 'restored cookies are not accepted by Flipkart — a fresh sign-in is needed');
  return S.held;
}

/**
 * Sign in with a phone number and an OTP the human supplies.
 * Resolves once Flipkart accepts the code; the connection stays open afterwards.
 */
export async function signIn(phone, emit = () => {}, { otpTimeoutMs = 360000, dryRun = false, setAddress = false } = {}) {
  const { page } = await connect(emit, { landing: LOGIN_URL });
  if (await signedIn(page)) { S.held.signedIn = true; return true; }

  // Straight to the login page — no homepage, no modal, no header-link hunt. If
  // connect() already landed us there, don't pay for the load twice.
  if (S.held.landedOn !== LOGIN_URL) {
    await go(page, LOGIN_URL);
    await settle(page);
  }

  // Flipkart's phone field is <input type=number> with no placeholder.
  // Flipkart's phone field carries NO placeholder — it's a floating <label> next to
  // a "+91" prefix — so a placeholder-only detector missed it, fell back to the
  // homepage modal, and spent 8.6s of a session that has died at 102s. Look at the
  // attributes AND the surrounding block.
  const phoneIdx = async () => page.$$eval('input', (els) => els.findIndex((e) => {
    if (!e.offsetParent) return false;
    const hay = `${e.placeholder || ''} ${e.getAttribute('aria-label') || ''} ${e.name || ''} ${e.id || ''}`;
    if (/search/i.test(hay)) return false;
    if (e.type === 'number' || e.type === 'tel') return true;
    if (e.maxLength === 10) return true;
    if (/mobile|phone/i.test(hay)) return true;
    const box = e.closest('div')?.parentElement?.innerText || '';
    return /\+91|phone number|mobile number/i.test(box);
  })).catch(() => -1);

  // Poll for the field rather than sleeping a fixed amount.
  let idx = -1;
  // 20 polls, not 7. settle() returns as soon as body text clears 600 characters —
  // and Flipkart's footer alone does that while the login card is still hydrating.
  // At 7 polls we gave up after 4.9s, fell back to the homepage modal and spent
  // 8-19s getting back to the same field. A fast load still exits on the first
  // poll, so the extra patience is free when it isn't needed.
  for (let i = 0; i < 20 && idx < 0; i++) { idx = await phoneIdx(); if (idx < 0) await page.waitForTimeout(700); }

  // Fall back to the homepage route only if the direct page didn't give us a field.
  if (idx < 0) {
    emit('wire', 'login page gave no field — trying the homepage modal');
    await go(page, 'https://www.flipkart.com/');
    await settle(page);
    for (const attempt of [
      () => page.getByText(/^Login$/).first().click({ timeout: 5000 }),
      () => page.click('a[href*="/account/login"]', { timeout: 5000 }),
      () => clickLabel(page, 'Login'),
    ]) { try { await attempt(); break; } catch { /* next */ } }
    for (let i = 0; i < 16 && idx < 0; i++) { idx = await phoneIdx(); if (idx < 0) await page.waitForTimeout(700); }
  }

  if (idx < 0) {
    const seen = await page.$$eval('input', (els) => els.filter((e) => e.offsetParent)
      .map((e) => ({ type: e.type, ml: e.maxLength, ph: e.placeholder }))).catch(() => []);
    emit('warn', `inputs on the page: ${JSON.stringify(seen).slice(0, 200)}`);
    throw new Error('could not find the phone field on Flipkart');
  }

  const inputs = await page.$$('input');
  await inputs[idx].fill(String(phone));
  emit('wire', `entered ${String(phone).slice(0, 3)}****${String(phone).slice(-3)}`);

  // dryRun stops here: everything above is the part that decides how long the
  // human waits for the SMS, and it can be timed without spending a real OTP.
  if (dryRun) { emit('check', 'dry run — phone entered, OTP NOT requested'); return 'dry'; }

  if (!await clickLabel(page, 'Continue')) await inputs[idx].press('Enter');

  // Confirm the OTP screen appeared — but poll fast, because every second here is
  // a second off the human's window to fetch the SMS.
  let asked = false;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(600);
    const t = await page.evaluate(() => (document.body.innerText || '')).catch(() => '');
    if (/verification code|enter otp|code we've sent/i.test(t)) { asked = true; break; }
    if (BLOCKED.test(t)) {
      const said = (t.match(BLOCKED) || [])[0];
      throw new Error(`Flipkart refused to send an OTP to this number — it says "${said}". `
        + 'Use a different phone number, or sign in with Email-ID instead.');
    }
  }
  if (!asked) emit('warn', 'no OTP screen detected — a code may not have been sent');
  emit('otp', 'Flipkart has sent an OTP — enter it to continue');

  const code = await new Promise((resolve, reject) => {
    S.otpResolve = resolve;
    setTimeout(() => { if (S.otpResolve) { S.otpResolve = null; reject(new Error('no OTP supplied in time')); } }, otpTimeoutMs);
  });

  // Six separate <input type=number> boxes, one digit each.
  const boxes = await page.$$eval('input', (els) => els
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.offsetParent && e.type === 'number' && !/search/i.test(e.placeholder || ''))
    .map(({ i }) => i));
  const all = await page.$$('input');
  if (boxes.length >= code.length) {
    for (let d = 0; d < code.length; d++) {
      await all[boxes[d]].click({ timeout: 5000 }).catch(() => {});
      await all[boxes[d]].type(code[d], { delay: 60 });
    }
  } else if (boxes.length) {
    await all[boxes[0]].fill(code);
  } else throw new Error('no OTP field found');

  if (!await clickLabel(page, 'Verify')) await clickLabel(page, 'Submit');

  // Poll for the signed-in header. A flat sleep threw away seconds the cart run
  // needs — and when the code is wrong, it threw them away for nothing.
  // 30 polls, not 14. Flipkart's post-OTP redirect to the homepage took longer than
  // 9.8s on a live run: the login had genuinely succeeded, the header already said
  // "Account", and we threw the session away reporting a login screen.
  S.held.signedIn = false;
  for (let i = 0; i < 30 && !S.held.signedIn; i++) {
    await page.waitForTimeout(700);
    S.held.signedIn = await signedIn(page);
  }
  if (!S.held.signedIn) throw new Error('OTP submitted but Flipkart still shows a login screen');
  emit('check', 'signed in to Flipkart inside Anakin’s browser');

  // Do this BEFORE anything is added, and before the session is captured on close.
  // Both previously saved sessions read "Location not set", which is very likely
  // why every cart call — even fk_view_cart with empty params — returned HTTP 400.
  // Off by default, and deliberately so. Twice now the picker has opened and
  // rendered no saved-address row at all (only Flipkart's search box was visible),
  // so it costs ~17 seconds of a session that dies at ~160 and buys nothing. A
  // signed-in account already carries its default address. Opt in when it's fixed.
  if (setAddress) {
    await Promise.race([
      setLocation(ADDRESS, emit).catch((e) => emit('warn', `location: ${String(e.message).slice(0, 70)}`)),
      new Promise((r) => setTimeout(() => { emit('warn', 'address step hit its 25s deadline — moving on'); r(); }, 25000)),
    ]);
  }
  return true;
}

/**
 * The address we deliver to — the whole thing, not a pincode.
 *
 * A pincode picks an arbitrary point inside a postal area. Flipkart scopes stock,
 * price and the delivery promise to a *saved address*, and checkout needs one
 * anyway, so the agent selects the same address a human would pick from the list.
 * `marks` are scored against each saved row: 560102 alone cannot tell two HSR
 * Layout addresses apart, so several tokens have to agree.
 */
export const ADDRESS = {
  pincode: '560102',
  full: '1024, 7th Sector, 20th Cross Road, HSR Layout, Bengaluru, Karnataka - 560102',
  marks: ['560102', 'HSR', '7th Sector', '20th Cross', '1024'],
};

// What the header currently claims, so we don't re-open a picker for nothing.
// Scoped to the top of the page: a bare six-digit match anywhere in the body hit
// prices and offer codes, and made "already set" true when it wasn't.
const headerLoc = (page) => page.evaluate(() => {
  const head = (document.body.innerText || '').slice(0, 400);
  return (head.match(/Deliver(?:y)? to[^\n]*|\b\d{6}\b|Location not set|Select delivery location/) || [''])[0];
}).catch(() => '');

/**
 * Put the browser on that address before anything is bought.
 *
 * Our own notes from the Minutes work: "Set the delivery address FIRST —
 * everything else is location-scoped." Both saved Flipkart sessions were captured
 * reading "Location not set", which is very likely why every authenticated cart
 * call — even fk_view_cart with empty params — came back HTTP 400.
 */
export async function setLocation(addr = ADDRESS, emit = () => {}) {
  const want = typeof addr === 'string'
    ? { pincode: addr, full: addr, marks: [addr] }
    : addr;
  const { page } = S.held;
  await go(page, 'https://www.flipkart.com/');
  await settle(page);

  const before = await headerLoc(page);
  if (before.includes(want.pincode)) {
    emit('check', `delivery address already ${before.replace(/\s+/g, ' ').slice(0, 60)}`);
    return before;
  }

  for (const label of ['Select delivery location', 'Location not set', 'Enter Delivery Pincode']) {
    if (await clickLabel(page, label)) { emit('wire', `opened the address picker via "${label}"`); break; }
  }

  // Poll for the picker instead of sleeping — the whole session budget is ~100s.
  const findSaved = () => page.evaluate((marks) => {
    const vis = (e) => e.offsetParent !== null;
    const score = (t) => marks.reduce((n, m) => n + (t.toLowerCase().includes(m.toLowerCase()) ? 1 : 0), 0);
    const rows = [...document.querySelectorAll('div,span,button,li,label')].filter(vis)
      .map((e) => ({ e, t: (e.innerText || '').replace(/\s+/g, ' ').trim() }))
      .filter(({ t }) => t.length > 12 && t.length < 220)
      .map((r) => ({ ...r, s: score(r.t) }))
      .filter((r) => r.s >= 2)
      // Best match first; among equals take the tightest element, which is the row
      // itself rather than the list that contains it.
      .sort((a, b) => b.s - a.s || a.e.getElementsByTagName('*').length - b.e.getElementsByTagName('*').length);
    const hit = rows[0];
    if (!hit) return null;
    hit.e.scrollIntoView({ block: 'center' });
    const r = hit.e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: hit.t.slice(0, 90), score: hit.s };
  }, want.marks).catch(() => null);

  let saved = null;
  for (let i = 0; i < 8 && !saved; i++) { saved = await findSaved(); if (!saved) await page.waitForTimeout(600); }

  if (saved) {
    emit('wire', `saved address matched on ${saved.score} of ${want.marks.length} marks · ${saved.text}`);
    await page.mouse.move(saved.x, saved.y); await page.waitForTimeout(250);
    await page.mouse.down(); await page.waitForTimeout(120); await page.mouse.up();
  } else {
    // No saved row — not signed in yet, or the list didn't render. A pincode still
    // narrows stock and price; it just isn't the specific address.
    const box = await page.$$eval('input', (els) => els.findIndex((e) =>
      e.offsetParent && /pincode|pin code|delivery/i.test(e.placeholder || ''))).catch(() => -1);
    if (box < 0) {
      // Say what was actually on screen. "No saved address row" on its own is not
      // a finding — it can't be fixed without knowing what the picker rendered.
      const seen = await page.evaluate(() => {
        const vis = (e) => e.offsetParent !== null;
        const ins = [...document.querySelectorAll('input')].filter(vis)
          .map((e) => ({ type: e.type, ph: e.placeholder || '', ml: e.maxLength }));
        const dlg = [...document.querySelectorAll('div')].filter(vis)
          .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 240 && r.width < 760 && r.height > 160; })
          .sort((a, b) => a.getElementsByTagName('*').length - b.getElementsByTagName('*').length)[0];
        return { ins, dlg: dlg ? (dlg.innerText || '').replace(/s+/g, ' ').slice(0, 260) : '' };
      }).catch(() => ({ ins: [], dlg: '' }));
      emit('warn', `address picker showed no saved row · inputs=${JSON.stringify(seen.ins).slice(0, 120)}`);
      if (seen.dlg) emit('warn', `picker text: ${seen.dlg}`);
      return null;
    }
    const inputs = await page.$$('input');
    await inputs[box].fill(want.pincode);
    emit('warn', `no saved address found — falling back to pincode ${want.pincode}`);
    if (!await clickLabel(page, 'Submit')) await inputs[box].press('Enter');
  }

  let now = '';
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(700);
    now = await headerLoc(page);
    if (now.includes(want.pincode)) break;
  }
  const ok = now.includes(want.pincode);
  emit(ok ? 'check' : 'warn', ok
    ? `delivering to ${saved ? saved.text : want.pincode}`
    : `location still reads "${now.replace(/\s+/g, ' ').slice(0, 50) || 'unknown'}"`);
  return now;
}

/** The saved session record Anakin holds for us, by name. */
async function sessionRecord(name = 'flipkart') {
  const r = await fetch('https://api.anakin.io/v1/sessions', { headers: { 'X-API-Key': KEY() } }).catch(() => null);
  const d = r ? await r.json().catch(() => ({})) : {};
  return (d.sessions || []).find((x) => x.name === name) || null;
}

/**
 * Close the browser OURSELVES, on purpose, while it is still signed in.
 *
 * This is the whole experiment. `save_session` writes the cookie jar on a clean
 * close — but Anakin has killed every session we've had before we got there, so
 * the saved state is still the never-logged-in snapshot it was at 19:04, and the
 * Wire identity built from it replays a logged-out session. Hence HTTP 400 on
 * every authenticated cart call.
 *
 * So: sign in, then immediately hang up. If the stored cookie count moves, the
 * identity can be re-imported and Wire can do the adds with no browser at all.
 */
export async function captureSession(emit = () => {}) {
  if (!S.held?.browser) throw new Error('no open browser to capture');
  const before = await sessionRecord();
  emit('wire', `closing cleanly so save_session fires — stored now: ${before?.cookieCount ?? '?'} cookies`);

  await S.held.browser.close().catch((e) => emit('warn', `close: ${String(e.message).slice(0, 60)}`));
  S.held = null; S.otpResolve = null;

  // The save is written server-side on close; it is not instant.
  let after = before;
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    after = await sessionRecord();
    if (after && before && after.lastUsedAt !== before.lastUsedAt) break;
  }

  const moved = Boolean(after && before && after.cookieCount !== before.cookieCount);
  emit(moved ? 'check' : 'warn', moved
    ? `saved session now holds ${after.cookieCount} cookies (was ${before.cookieCount}) — re-import the identity from it`
    : `saved session still holds ${after?.cookieCount ?? '?'} cookies — the login was not captured`);
  return { before, after, moved };
}

/* ---------------- the act ---------------- */

/**
 * Add one product to the marketplace cart.
 * `pid` comes from fk_search_products, so we go straight to the product page —
 * Flipkart's canonical /x/p/x?pid= form resolves without knowing the slug.
 */
/**
 * Set the delivery pincode from the product page itself.
 *
 * The header's address picker has opened twice and rendered no saved-address row
 * at all — only Flipkart's search box was visible — so it can't be relied on. But
 * a PDP carries its own "Enter Delivery Pincode" input, which is a plain text
 * field with no modal in the way. This matters because Flipkart gates add-to-cart
 * on a delivery location for grocery: the one add that has ever worked for us had
 * the location set, and the runs that lost it silently did nothing on click.
 */
async function ensurePincode(page, pin, emit = () => {}) {
  // $$eval / $$ — the single-element forms pass ONE element, so findIndex threw,
  // the catch swallowed it, and this returned -1 every time. The gate it exists to
  // clear was therefore never cleared on any account without a saved address.
  const idx = await page.$$eval('input', (els) => els.findIndex((e) =>
    e.offsetParent && /pincode|pin code/i.test(e.placeholder || ''))).catch(() => -1);
  if (idx < 0) return false;

  const inputs = await page.$$('input');
  await inputs[idx].fill(String(pin)).catch(() => {});
  if (!await clickLabel(page, 'Check')) await inputs[idx].press('Enter').catch(() => {});
  emit('wire', `set delivery pincode ${pin} on the product page`);

  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(700);
    const done = await page.evaluate(() => /delivery by|delivery in|usually delivered|add to cart/i
      .test(document.body.innerText || '')).catch(() => false);
    if (done) return true;
  }
  return true;
}

/**
 * Did the cart actually take it? Three independent signals, because Flipkart uses
 * different ones for different products: the button flips to "Go to cart", the
 * header cart count goes up, or the page navigates to the cart outright.
 */
async function confirm(page, pre, look) {
  let state = null;
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(600);
    state = await look();
    if (!state) continue;
    if (state.went || /viewcart|checkout/.test(state.url)) return { ok: true, state };
    if (pre.cart !== null && state.cart !== null && state.cart > pre.cart) return { ok: true, state };
  }
  return { ok: false, state };
}

export async function addProduct(pid, label, emit = () => {}) {
  const { page } = S.held;
  await go(page, `https://www.flipkart.com/x/p/x?pid=${encodeURIComponent(pid)}`);
  await settle(page);

  // Read the page properly before touching it. "Clicked but nothing happened" is
  // not a diagnosis — it covers out-of-stock, a delivery-address gate, and a
  // genuinely missed button, and those need completely different fixes.
  const look = () => page.evaluate(() => {
    const t = document.body.innerText || '';
    const vis = (e) => e.offsetParent !== null;
    const badge = t.match(/Cart\s*\n\s*(\d+)/) || t.match(/Cart\s*\((\d+)\)/);
    return {
      add: /add to cart/i.test(t),
      went: /go to cart/i.test(t),
      notify: /notify me/i.test(t),
      oos: /out of stock|sold out|currently unavailable/i.test(t),
      gate: /select delivery address|enter delivery pincode|add a delivery address/i.test(t),
      cart: badge ? Number(badge[1]) : null,
      url: location.pathname,
      title: (document.querySelector('h1')?.innerText || '').replace(/\s+/g, ' ').slice(0, 70),
      buttons: [...document.querySelectorAll('button')].filter(vis)
        .map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 12),
    };
  }).catch(() => null);

  let pre = await look();
  if (!pre) return { ok: false, why: 'the product page never rendered' };

  // Location first — everything on Flipkart is location-scoped.
  if (await ensurePincode(page, ADDRESS.pincode, emit)) await settle(page, 400, 6);
  // Re-read: on a gated page the Add to cart button only appears once the
  // location is known, so the first look is stale by now.
  if (pre.gate || !pre.add) pre = (await look()) || pre;

  // An out-of-stock product shows "Notify Me" and has no button at all. Reading
  // that as a failed click wasted hours — it is a stock fact, not a mechanism fault.
  if (!pre.add) {
    emit('warn', `${label}: buttons on the page — ${JSON.stringify(pre.buttons).slice(0, 140)}`);
    return { ok: false, why: pre.notify || pre.oos ? 'out of stock at this address' : 'no add-to-cart on the page' };
  }

  // Present is not the same as wired up. Wait for the button to stop moving
  // before pressing it — see settle() above for what this cost us.
  if (!await ready(page, 'Add to cart')) return { ok: false, why: 'add-to-cart button never settled' };

  // Two presses at most. The first can land during the last of the hydration, and
  // a second real click on an already-added item is harmless — Flipkart shows
  // "Go to cart" rather than adding twice.
  let post = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (!await clickLabel(page, 'Add to cart')) {
      if (attempt === 2) return { ok: false, why: 'add-to-cart button never became clickable' };
      continue;
    }
    post = await confirm(page, pre, look);
    if (post.ok) return { ok: true, why: null };
    if (attempt === 1) emit('warn', `${label}: first click didn't take — pressing again`);
  }
  post = post?.state || null;

  if (post === null) return { ok: false, why: 'the page stopped responding after the click' };

  // Say what the page actually looked like, and keep a picture of it.
  const shot = `cache/add_${String(label).replace(/\W+/g, '_')}.png`;
  await page.screenshot({ path: shot, timeout: 12000 }).catch(() => {});
  emit('warn', `${label}: after the click — url=${post?.url} cart=${pre.cart}→${post?.cart} `
    + `gate=${post?.gate} buttons=${JSON.stringify(post?.buttons || []).slice(0, 130)}`);
  emit('warn', `screenshot → ${shot}`);
  return {
    ok: false,
    why: post?.gate ? 'Flipkart asked for a delivery address before it would add'
      : 'clicked, but the cart never acknowledged it',
  };
}

/**
 * What is the held browser actually looking at right now?
 *
 * Safe to add mid-run: the connection lives on globalThis, so reloading this
 * module to introduce a diagnostic no longer strands the session.
 */
export async function peek(shot = 'cache/peek.png') {
  if (!S.held?.page) return { error: 'no browser open' };
  const { page } = S.held;
  const seen = await page.evaluate(() => {
    const vis = (e) => e.offsetParent !== null;
    return {
      url: location.href.slice(0, 120),
      title: document.title.slice(0, 70),
      text: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 700),
      inputs: [...document.querySelectorAll('input')].filter(vis)
        .map((e) => ({ type: e.type, ph: (e.placeholder || '').slice(0, 30), ml: e.maxLength })),
      buttons: [...document.querySelectorAll('button')].filter(vis)
        .map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 12),
    };
  }).catch((e) => ({ error: String(e.message).split('\n')[0].slice(0, 100) }));
  await page.screenshot({ path: shot, timeout: 12000 }).catch(() => {});
  return { ...seen, shot, openedAt: S.held.openedAt, awaitingOtp: Boolean(S.otpResolve) };
}

/** Read the real cart back. A click is never evidence. */
export async function readCart(emit = () => {}) {
  const { page } = S.held;
  await go(page, 'https://www.flipkart.com/viewcart');
  await settle(page);
  return page.evaluate(() => {
    const lines = (document.body.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean);
    const stop = lines.findIndex((l) => /^(Suggested for You|Items you may|Recently Viewed|ABOUT)$/i.test(l));
    const rows = stop > 0 ? lines.slice(0, stop) : lines;
    const isPrice = (s) => /^₹\s?[\d,]+$/.test(s);
    const items = [];
    for (let i = 2; i < rows.length; i++) {
      if (!isPrice(rows[i])) continue;
      const name = rows[i - 2];
      if (!name || name.length < 5 || /^(Qty|Delivery|Total|Cart|Flipkart)/i.test(name)) continue;
      items.push({ name, price: Number(rows[i].replace(/[^\d]/g, '')) });
    }
    const t = (document.body.innerText || '').replace(/\s+/g, ' ');
    return {
      marketplace: Number((t.match(/Flipkart\s*\((\d+)\)/) || [])[1]) || null,
      minutes: Number((t.match(/Minutes\/Grocery\s*\((\d+)\)/) || [])[1]) || null,
      items: items.slice(0, 20),
    };
  });
}
