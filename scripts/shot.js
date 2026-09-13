// Screenshot the local UI through the user's own Chrome.
import { chromium } from 'playwright-core';

const url = process.argv[2] || 'http://localhost:3000/';
const out = process.argv[3] || 'cache/ui.png';

(async () => {
  const b = await chromium.connectOverCDP('http://localhost:9222', { timeout: 90000 });
  const ctx = b.contexts()[0];
  const p = await ctx.newPage();
  try {
    await p.setViewportSize({ width: 1440, height: 900 });
    await p.goto(url, { timeout: 45000, waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(3500);
    await p.screenshot({ path: out, timeout: 20000 });
    console.log('saved', out);
    const missing = await p.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        ground: s.getPropertyValue('--color-ground').trim(),
        fresh: s.getPropertyValue('--color-fresh').trim(),
        saffron: s.getPropertyValue('--color-saffron').trim(),
        bodyBg: getComputedStyle(document.body).backgroundColor,
      };
    });
    console.log('tokens:', JSON.stringify(missing));
  } finally { await p.close().catch(() => {}); await b.close().catch(() => {}); }
})();
