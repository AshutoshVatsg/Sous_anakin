// Drive the UI through a real search + plan and capture both screens.
import { chromium } from 'playwright-core';

const waitFor = async (p, re, tries = 45) => {
  for (let i = 0; i < tries; i++) {
    await p.waitForTimeout(2000);
    if (re.test(await p.innerText('body').catch(() => ''))) return true;
  }
  return false;
};

(async () => {
  const b = await chromium.connectOverCDP('http://localhost:9222', { timeout: 90000 });
  const ctx = b.contexts()[0];
  const p = await ctx.newPage();
  try {
    await p.setViewportSize({ width: 1440, height: 980 });
    await p.goto('http://localhost:3000/', { timeout: 45000, waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2500);

    // say the price out loud, the way a hungry person would
    const ask = 'hey I want to eat panner dish around 200';
    await p.getByPlaceholder('something with paneer…').fill(ask, { timeout: 10000 });
    await p.getByRole('button', { name: 'Find' }).click({ timeout: 10000 });
    console.log(`asked: "${ask}" — waiting for dishes…`);
    await waitFor(p, /Dishes you could make/i);
    await p.waitForTimeout(2500);
    await p.screenshot({ path: 'cache/ui_dishes.png', timeout: 20000 });
    console.log('saved cache/ui_dishes.png');

    // now pick the top dish and let the brain reconcile it against the pantry
    await p.getByRole('heading', { level: 3 }).first().click({ timeout: 10000 });
    console.log('picked the top dish — waiting for the plan…');
    await waitFor(p, /Already covered/i);
    await p.waitForTimeout(2000);
    await p.screenshot({ path: 'cache/ui_plan.png', timeout: 20000, fullPage: true });
    console.log('saved cache/ui_plan.png');
  } finally { await p.close().catch(() => {}); await b.close().catch(() => {}); }
})();
