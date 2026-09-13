import { cartSpend, resetCartSpend } from '../../../src/flipkartcart.js';
import { status, recheck, addProduct, readCart } from '../../../src/cloudcart.js';
import { prepare, takeBasket } from '../../../src/shelf.js';
import { remember } from '../../../src/price.js';

export const runtime = 'nodejs';
export const maxDuration = 900;

/**
 * Stocking the cupboard — through Anakin, into the real flipkart.com cart.
 *
 * Split by what each half is actually good at:
 *
 *   fk_search_products   Wire, 2 credits   real listings with pid + listing_id
 *   Anakin cloud browser 1 cr / 2 min      the authenticated click, on flipkart.com
 *
 * Nothing runs on your machine. No local Chrome, no debug port, no CDP to your
 * browser — the browsing, the thinking and the acting are all remote.
 *
 * Requires /api/pantry/signin first: Flipkart won't honour a restored session, so
 * the browser is signed in once and held open for the whole run. That sign-in also
 * prepares the shelf while the OTP is in flight, so by the time this route runs
 * there is usually nothing left to decide — see src/shelf.js.
 */
export async function POST(req) {
  const { items = [] } = await req.json();
  const encoder = new TextEncoder();
  const t0 = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type, message, data) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type, message, data, credits: cartSpend().credits,
            t: +((Date.now() - t0) / 1000).toFixed(1),
          })}\n\n`));
        } catch { /* client gone */ }
      };

      const results = [];

      try {
        // Ask the live page, not the cached flag: signIn() can time out waiting for
        // a redirect that lands a second later, stranding a signed-in browser.
        const s = await recheck();
        if (!s.connected) {
          send('error', 'Not signed in. Sign in through Anakin\'s browser first — '
            + 'Flipkart rejects a restored session, so the browser has to stay open from sign-in to add.',
            { needsSignIn: true });
          return;
        }
        if (!s.signedIn) {
          send('warn', 'the page does not look signed in — trying anyway, the readback will say what really happened');
        }
        send('start', `${items.length} item${items.length === 1 ? '' : 's'} → your flipkart.com cart, all through Anakin`);

        // The shelf was almost certainly worked out during the OTP wait. If it
        // wasn't, do it now — and say so, because it costs the session time.
        let shelf = takeBasket(items);
        if (shelf) {
          send('check', `shelf already decided during sign-in — ${shelf.basket.length} picks ready, 0 extra credits`);
        } else {
          resetCartSpend();
          send('warn', 'no prepared shelf — searching now, inside the session');
          shelf = await prepare(items, send);
        }

        for (const { term, why } of shelf.misses) {
          results.push({ term, added: null, why });
          send('item', `${term} — ${why}`, { name: term, state: 'failed', why });
        }

        for (const [i, { term, pick }] of shelf.basket.entries()) {
          send('item', term, { name: term, state: 'working', i, of: items.length });
          send('wire', `cloud browser → ${pick.product_name.slice(0, 44)}`);
          const r = await addProduct(pick.product_id, term, send);

          if (r.ok && pick.price > 0) remember(term, { price: pick.price, name: pick.product_name });
          results.push({ term, added: r.ok ? pick.product_name : null, price: r.ok ? pick.price : null, why: r.why });
          send('item', r.ok ? `${term} → ${pick.product_name}` : `${term} — ${r.why}`, {
            name: term, state: r.ok ? 'added' : 'failed',
            product: pick.product_name, price: pick.price,
            priceUnknown: !(pick.price > 0), why: r.why, i, of: items.length,
          });
        }

        // proof — the write's own word is not evidence
        send('wire', 'reading the cart back');
        const cart = await readCart(send).catch(() => null);
        const added = results.filter((x) => x.added).length;
        send('done', `${added} of ${items.length} in your flipkart.com cart`, {
          results, added, asked: items.length, cart,
          spend: cartSpend(), seconds: +((Date.now() - t0) / 1000).toFixed(1),
        });
      } catch (err) {
        send('error', err.message, { spend: cartSpend() });
      } finally {
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
