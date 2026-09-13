import { findRecipe, qtyLabel } from '../../../src/pipeline.js';
import { planShopping, thinking } from '../../../src/reason.js';
import { getCredits } from '../../../src/anakin.js';
import { estimateBasket } from '../../../src/price.js';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** "red chili powder" and "red chilli powder" are the same line, spelled twice. */
const flat = (s) => String(s || '').toLowerCase().replace(/chili/g, 'chilli').replace(/[^a-z]/g, '');
const sameThing = (a, b) => !a || !b || flat(a) === flat(b);

/**
 * Plan a dish: find the recipe, reason about what's genuinely missing.
 * Cart filling is a separate call because it needs the user's own browser.
 */
export async function POST(req) {
  const { dish, pantry = [], serves = 2, url = null } = await req.json();
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
      try {
        send('start', `Reading the recipe for ${dish}`);
        const recipe = await findRecipe(dish, send, { url });
        const plan = await planShopping(recipe, pantry, serves, send);

        send('plan', 'Shopping list ready', {
          recipe: {
            title: recipe.title, host: recipe.host, url: recipe.url, image: recipe.image,
            minutes: recipe.minutes, rating: recipe.rating, votes: recipe.votes,
            cuisine: recipe.cuisine, serves: recipe.serves,
            steps: (recipe.steps || []).slice(0, 25),
          },
          have: plan.have.map((h) => ({ name: h.name, reason: h.reason || h.matchedPantry })),
          // The search term leads, because that is literally what gets typed into
          // Flipkart. The recipe's own wording follows when it differs, so the cook
          // can see why "chopped cilantro" became "coriander leaves".
          buy: plan.buy.map((b) => ({
            name: b.term || b.name, term: b.term,
            asWritten: sameThing(b.term, b.name) ? null : b.name,
            qty: b.qtyText || qtyLabel(b.qty, b.unit),
            optional: Boolean(b.optional), reason: b.reason || null,
          })),
          cost: estimateBasket(plan.buy),
          reasoned: plan.reasoned,
          thinking: thinking(),
          serves,
          credits: getCredits(),
          seconds: +((Date.now() - t0) / 1000).toFixed(1),
        });
      } catch (err) {
        send('error', err.message);
      } finally { controller.close(); }
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
