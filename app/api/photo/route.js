export const runtime = 'nodejs';

/**
 * Fetch a recipe photo server-side.
 *
 * Several Indian food blogs block hotlinking on the Referer header, so an <img>
 * pointing straight at them renders an empty box. Asking for the same bytes from
 * the server, with no referer, gets the picture the recipe actually published.
 */

const PRIVATE = /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1)/i;

export async function GET(req) {
  const raw = new URL(req.url).searchParams.get('u');
  if (!raw) return new Response('missing u', { status: 400 });

  let target;
  try { target = new URL(raw); } catch { return new Response('bad url', { status: 400 }); }
  // Only ever fetch a public image over TLS — this endpoint must not become a way
  // to probe whatever is listening on this machine.
  if (target.protocol !== 'https:' || PRIVATE.test(target.hostname)) {
    return new Response('refused', { status: 400 });
  }

  try {
    const res = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.startsWith('image/')) return new Response('not an image', { status: 404 });

    return new Response(res.body, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch {
    return new Response('upstream failed', { status: 502 });
  }
}
