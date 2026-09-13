import { connect, fillOne, readCart } from '../../../src/fill.js';
import { setAddress } from '../../../src/minutesdata.js';

export const runtime = 'nodejs';
export const maxDuration = 600;

/**
 * Fill the user's real Flipkart Minutes cart.
 *   Wire  -> which product, and whether it's genuinely in stock
 *   browser -> the Add click, in the user's own session
 *   readback -> proof; a click is never evidence
 */
export async function POST(req) {
  const { items = [], pincode = '560102' } = await req.json();
  const encoder = new TextEncoder();
  const t0 = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type, message, data) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type, message, data, t: +((Date.now() - t0) / 1000).toFixed(1),
          })}\n\n`));
        } catch { /* client gone */ }
      };

      let browser;
      try {
        send('addr', 'Setting your Minutes delivery address…');
        try { await setAddress(pincode); send('addr', `Delivering to ${pincode}`); }
        catch (e) { send('warn', `address: ${String(e.message).slice(0, 60)}`); }

        const conn = await connect().catch(() => null);
        if (!conn) {
          send('error', 'Could not reach your browser. Launch Chrome with --remote-debugging-port=9222 and open Flipkart.');
          return;
        }
        browser = conn.browser;
        const page = conn.page;

        let snapshot = await readCart(page);
        send('cart', `Cart currently holds ${snapshot.items.length} item(s)`, { cart: snapshot });

        // One structured event per item, keyed by the exact name the UI is showing,
        // so the shopping list can tick itself off as this runs instead of the cook
        // watching a log and guessing which line it is on.
        const results = [];
        for (const [i, it] of items.entries()) {
          send('item', `Looking for ${it.name}…`, { name: it.name, state: 'working', i, of: items.length });

          const r = await fillOne(page, it.term || it.name, send, { cart: snapshot });
          const state = r.alreadyThere ? 'already' : r.added ? 'added' : 'failed';
          send('item', r.added ? `${it.name} → ${r.added.name}` : `${it.name} not available`, {
            name: it.name,
            state,
            product: r.added?.name || null,
            pack: r.added?.pack || null,
            price: r.added?.price ?? null,
            // A substitution is when the first choice couldn't be added and a later
            // one could — worth showing, because the cook is getting a different brand.
            substituted: Boolean(r.added && r.tried?.length),
            why: r.added ? null : (r.rejected?.[0]?.why || 'nothing on the shelf matched'),
            i,
            of: items.length,
          });

          results.push({ ingredient: it.name, added: r.added || null, alreadyThere: !!r.alreadyThere });
          snapshot = await readCart(page);
        }

        send('done', 'Basket ready', {
          cart: snapshot,
          results,
          added: results.filter((r) => r.added).length,
          asked: items.length,
          seconds: +((Date.now() - t0) / 1000).toFixed(1),
        });
      } catch (err) {
        send('error', err.message);
      } finally {
        if (browser) await browser.close().catch(() => {});
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
