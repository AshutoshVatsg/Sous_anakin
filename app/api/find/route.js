import { exploreDishes } from '../../../src/explore.js';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Streams discovery progress, then the ranked dish cards. */
export async function POST(req) {
  const { craving, pantry = [], pages = 12, want = 5, budget = 0, budgetMode = 'around' } = await req.json();
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
        const dishes = await exploreDishes(craving, pantry, send, { pages, want, budget, budgetMode });
        send('dishes', `${dishes.length} dishes worth cooking`, {
          dishes: dishes.map((d) => ({
            title: d.title, url: d.url, host: d.host, image: d.image,
            minutes: d.minutes, rating: d.rating, votes: d.votes,
            cuisine: d.cuisine, description: d.description, serves: d.serves,
            kind: d.kind, light: d.light, cost: d.cost,
            protein: d.protein, calories: d.calories,
            haveCount: d.haveCount, needCount: d.needCount,
            totalIngredients: d.totalIngredients, coverage: d.coverage,
            missing: (d.missing || [])
              .map((i) => ({ name: i.name, term: i.term, raw: i.raw }))
              .slice(0, 24),
          })),
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
