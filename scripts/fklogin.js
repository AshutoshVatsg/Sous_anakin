// Drives the Flipkart OTP login inside Anakin's cloud browser, then saves the session.
// Stays connected while waiting for the user to supply the OTP via cache/otp.txt.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

// Be explicit about WHICH key. The saved session is account-scoped — it lives on
// whichever account opened the cloud browser — so grabbing the first ask_ key in
// the file by position is how you save a session onto an account you didn't mean.
const env = fs.readFileSync('.env', 'utf8');
const KEY = (env.match(/^ANAKIN_SESSION_KEY=(.+)$/m)
  || env.match(/^ANAKIN_API_KEY=(.+)$/m))[1].trim();
const PHONE = process.argv[2];
if (!PHONE || !/^\d{10}$/.test(PHONE)) {
  console.error('usage: node scripts/fklogin.js <10-digit-phone>');
  process.exit(1);
}
console.log(`using Anakin key …${KEY.slice(-6)} — the session will be saved on THAT account`);
const OTP_FILE = 'cache/otp.txt';
const log = (m) => { const s = `[${new Date().toISOString().slice(11, 19)}] ${m}`; console.log(s); fs.appendFileSync('cache/fklogin.log', s + '\n'); };

try { fs.unlinkSync(OTP_FILE); } catch {}

const shot = async (p, n) => { try { await p.screenshot({ path: `cache/fk_${n}.png`, timeout: 12000 }); log(`shot -> cache/fk_${n}.png`); } catch { log('shot skipped (' + n + ')'); } };

(async () => {
  let b;
  try {
    b = await chromium.connectOverCDP(
      `wss://api.anakin.io/v1/browser-connect?api_key=${KEY}&country=IN&save_session=flipkart&save_url=https://www.flipkart.com/`,
      { timeout: 60000 });
    log('connected');
    const ctx = b.contexts()[0] || await b.newContext();
    const page = ctx.pages()[0] || await ctx.newPage();

    await page.goto('https://www.flipkart.com/', { timeout: 75000, waitUntil: 'commit' });
    await page.waitForTimeout(7000);
    log('flipkart loaded: ' + (await page.title()).slice(0, 60));
    await shot(page, '1_home');

    // Flipkart shows a login modal on first load; if dismissed, there's a Login link in the header.
    // Flipkart's phone field is <input type="number"> with no placeholder and maxLength -1.
    const findPhone = async () => page.$$eval('input', els => els.findIndex(e =>
      e.offsetParent && (
        e.type === 'number' ||
        e.maxLength === 10 ||
        /mobile|phone/i.test(e.placeholder || '')
      ) && !/search/i.test(e.placeholder || '')));

    let idx = await findPhone();
    if (idx < 0) {
      log('no login input yet — clicking header Login');
      for (const attempt of [
        () => page.getByText(/^Login$/).first().click({ timeout: 8000 }),
        () => page.click('a[href*="/account/login"]', { timeout: 8000 }),
        () => page.getByRole('link', { name: /login/i }).first().click({ timeout: 8000 }),
      ]) {
        try { await attempt(); log('clicked Login'); break; } catch { /* next */ }
      }
      await page.waitForTimeout(5000);
      await shot(page, '2b_modal');
      idx = await findPhone();
    }
    const inputs = await page.$$('input');
    const phoneInput = idx >= 0 ? inputs[idx] : null;
    if (!phoneInput) {
      const all = await page.$$eval('input', els => els.filter(e => e.offsetParent)
        .map(e => ({ type: e.type, ml: e.maxLength, ph: e.placeholder, cls: (e.className || '').slice(0, 40) })));
      log('INPUTS VISIBLE: ' + JSON.stringify(all));
      await shot(page, '2_nologin');
      throw new Error('could not find phone input');
    }

    await phoneInput.fill(PHONE);
    log(`entered phone ${PHONE.slice(0, 3)}****${PHONE.slice(-3)}`);
    await shot(page, '3_phone');

    const btns = await page.$$eval('button', els => els.filter(e => e.offsetParent)
      .map((e, i) => ({ i, txt: (e.textContent || '').trim().slice(0, 28), disabled: e.disabled })));
    log('BUTTONS: ' + JSON.stringify(btns));

    let clicked = false;
    for (const attempt of [
      () => page.getByRole('button', { name: /request otp/i }).first().click({ timeout: 10000 }),
      () => page.getByRole('button', { name: /continue|next|login/i }).first().click({ timeout: 10000 }),
      () => phoneInput.press('Enter'),
    ]) {
      try { await attempt(); clicked = true; log('submitted phone'); break; } catch { /* next */ }
    }
    if (!clicked) throw new Error('could not submit phone number');

    // Confirm the OTP screen actually appeared before telling the user to expect a code.
    let otpScreen = false;
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(2000);
      const state = await page.evaluate(() => {
        const vis = (e) => e.offsetParent !== null;
        const ins = [...document.querySelectorAll('input')].filter(vis)
          .map(e => ({ type: e.type, ml: e.maxLength, ph: e.placeholder || '', ac: e.autocomplete || '' }));
        // grab the text of the smallest container that holds a visible input (the modal)
        let modal = '';
        const inp = [...document.querySelectorAll('input')].filter(vis)
          .find(e => !/search/i.test(e.placeholder || ''));
        if (inp) { let n = inp; for (let k = 0; k < 6 && n.parentElement; k++) n = n.parentElement; modal = (n.innerText || '').replace(/\s+/g, ' ').slice(0, 300); }
        return { ins, modal };
      });
      log(`t+${(i + 1) * 2}s inputs=${JSON.stringify(state.ins)}`);
      log(`      modal: ${state.modal.slice(0, 180)}`);
      if (/otp|verification code|code sent|enter the code/i.test(state.modal)) { otpScreen = true; break; }
      if (/too many|try again later|limit/i.test(state.modal)) throw new Error('rate limited: ' + state.modal.slice(0, 120));
    }
    if (!otpScreen) log('WARNING: no OTP screen detected — code may not have been sent');
    await shot(page, '4_otp_requested');
    log('requested OTP — waiting for cache/otp.txt (up to 6 min)');

    // Wait for the human to drop the OTP in.
    let otp = null;
    for (let i = 0; i < 180; i++) {
      if (fs.existsSync(OTP_FILE)) {
        const v = fs.readFileSync(OTP_FILE, 'utf8').trim().replace(/\D/g, '');
        if (v.length >= 4) { otp = v; break; }
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (!otp) throw new Error('no OTP supplied within 6 minutes');
    log(`got OTP (${otp.length} digits) — entering`);

    // Flipkart renders the OTP as SIX separate <input type="number"> boxes, one per digit.
    const idxs = await page.$$eval('input', els => els
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => e.offsetParent && e.type === 'number' && !/search/i.test(e.placeholder || ''))
      .map(({ i }) => i));
    log(`OTP boxes found: ${idxs.length}`);
    const allInputs = await page.$$('input');
    if (!idxs.length) throw new Error('no OTP input found');

    if (idxs.length >= otp.length) {
      for (let d = 0; d < otp.length; d++) {
        const box = allInputs[idxs[d]];
        await box.click({ timeout: 5000 }).catch(() => {});
        await box.type(otp[d], { delay: 60 });
      }
      log('typed OTP across ' + otp.length + ' boxes');
    } else {
      await allInputs[idxs[0]].fill(otp);
      log('filled OTP into single box');
    }
    await shot(page, '5_otp_entered');

    const obtns = await page.$$eval('button', els => els.filter(e => e.offsetParent)
      .map((e, i) => ({ i, txt: (e.textContent || '').trim().slice(0, 24), disabled: e.disabled })));
    log('OTP BUTTONS: ' + JSON.stringify(obtns));

    for (const attempt of [
      () => page.getByRole('button', { name: /verify|submit|login|continue/i }).first().click({ timeout: 10000 }),
      () => otpInput.press('Enter'),
    ]) {
      try { await attempt(); log('submitted OTP'); break; } catch { /* next */ }
    }
    await page.waitForTimeout(10000);

    const txt = (await page.textContent('body')).replace(/\s+/g, ' ');
    const loggedIn = !/Enter OTP|Request OTP/i.test(txt);
    log('LOGGED IN: ' + (loggedIn ? 'likely YES' : 'NO — still on OTP screen'));
    log('page: ' + txt.slice(0, 220));
    await shot(page, '6_after');

    // Touch the cart so cart cookies are part of the saved state.
    await page.goto('https://www.flipkart.com/viewcart', { timeout: 60000, waitUntil: 'commit' }).catch(() => {});
    await page.waitForTimeout(6000);
    await shot(page, '7_cart');
    log('cart page: ' + (await page.textContent('body')).replace(/\s+/g, ' ').slice(0, 200));

    log('closing cleanly so the session is captured…');
    await b.close();
    log('DONE — session should be saved as "flipkart"');
  } catch (e) {
    log('FAILED: ' + e.message.split('\n')[0]);
    if (b) await b.close().catch(() => {});
  }
})();
