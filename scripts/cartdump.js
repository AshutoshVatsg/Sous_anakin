import { connect, readCart } from '../src/fill.js';

(async () => {
  const { browser, page } = await connect();
  try {
    const cart = await readCart(page);
    console.log('count   :', cart.count);
    console.log('total   : ₹' + cart.total);
    console.log('address :', cart.address);
    console.log('items   :', cart.items.length);
    cart.items.forEach((i) => console.log(`   • ${String(i.name).slice(0, 44).padEnd(46)} ${String(i.pack || '').padEnd(9)} ₹${i.price}`));

    if (!cart.items.length) {
      console.log('\n--- page lines (parser found nothing) ---');
      const lines = await page.evaluate(() =>
        (document.body.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 40));
      lines.forEach((l, i) => console.log(String(i).padStart(3), JSON.stringify(l.slice(0, 66))));
    }
  } finally { await browser.close(); }
})();
