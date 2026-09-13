import { connect, signIn, supplyOtp, status, disconnect, captureSession, recheck } from '../../../../src/cloudcart.js';
import { prepare } from '../../../../src/shelf.js';
import { resetCartSpend } from '../../../../src/flipkartcart.js';

export const runtime = 'nodejs';
export const maxDuration = 600;

/**
 * Sign in to Flipkart inside Anakin's cloud browser, and KEEP THE CONNECTION.
 *
 * Anakin can persist a Flipkart session, but Flipkart won't honour it on a later
 * connection — 14 cookies come back and the page still says "Login", three times
 * out of three. So the browser opened here is held open in the module and every
 * add in /api/pantry runs through this same signed-in page.
 *
 * The OTP wait is not dead time. A human takes most of a minute to read an SMS,
 * and the session has died as early as 102 seconds — so while the code is in
 * flight the agent searches for every item and settles every choice. By the time
 * the six digits land, the browser has nothing left to do but click.
 *
 * GET  — what state are we in?
 * POST { phone, items }  — start the sign-in, prepare the shelf, wait for the OTP
 * POST { otp }    — hand the code to the waiting sign-in
 * DELETE — close the browser
 */
export async function GET() {
  // Ask the browser, not the flag — see recheck() for why.
  return Response.json(await recheck());
}

export async function DELETE() {
  await disconnect();
  return Response.json({ ok: true, ...status() });
}

export async function POST(req) {
  const { phone, otp, items = [], capture = false, setAddress = false } = await req.json().catch(() => ({}));

  // The OTP arrives as its own tiny request while the sign-in stream is still open.
  if (otp) {
    const taken = supplyOtp(otp);
    return Response.json({ ok: taken, ...status() },
      taken ? undefined : { status: 409 });
  }
  if (!phone || !/^\d{10}$/.test(String(phone))) {
    return Response.json({ error: 'a 10-digit phone number is required' }, { status: 400 });
  }

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
        // Both at once: the browser walks towards the OTP prompt while the shelf
        // is worked out over HTTP. Neither waits on the other.
        resetCartSpend();
        const shelf = items.length
          ? prepare(items, (t, m, d) => send(t, m, d)).catch((e) => {
              send('warn', `shelf prep failed — ${String(e.message).slice(0, 70)}`);
              return null;
            })
          : Promise.resolve(null);

        await connect(send);
        const auth = signIn(String(phone), send, { setAddress });
        await Promise.all([auth, shelf]);

        // capture: hang up while still signed in, so save_session writes an
        // authenticated cookie jar for the Wire identity to be rebuilt from.
        if (capture) {
          const cap = await captureSession(send);
          send('done', cap.moved
            ? 'login captured — the saved session is authenticated now'
            : 'login was NOT captured — the saved session is unchanged',
            { ...status(), capture: cap });
          return;
        }
        send('done', 'signed in, shelf decided — the browser stays open for the pantry run', status());
      } catch (err) {
        send('error', err.message);
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
