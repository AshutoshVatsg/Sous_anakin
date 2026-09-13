'use client';
import { useState, useEffect } from 'react';

/* ---------------------------------------------------------------- data */

/**
 * The cupboard, not the fridge.
 *
 * These are the things `src/price.js` classifies as `keeps` — bought once every
 * few weeks, good for months, and nobody needs them in ten minutes. That's exactly
 * why this page can run entirely through Anakin: the urgency that forces the
 * cooking flow into your own logged-in browser isn't here.
 */
const SHELVES = [
  {
    name: 'Oils & fats',
    items: ['ghee', 'sunflower oil', 'mustard oil', 'groundnut oil'],
  },
  {
    name: 'Everyday masalas',
    items: ['garam masala', 'red chilli powder', 'turmeric powder', 'coriander powder',
            'cumin powder', 'chaat masala', 'sambar powder'],
  },
  {
    name: 'Whole spices',
    items: ['jeera', 'mustard seeds', 'bay leaf', 'cinnamon stick', 'cloves', 'cardamom', 'hing'],
  },
  {
    name: 'Flours & grains',
    items: ['atta', 'maida', 'besan', 'suji', 'basmati rice', 'poha'],
  },
  {
    name: 'Dals & pulses',
    items: ['toor dal', 'moong dal', 'chana dal', 'urad dal', 'rajma', 'chickpeas'],
  },
  {
    name: 'Jars & sauces',
    items: ['tomato puree', 'soy sauce', 'vinegar', 'kasuri methi', 'ginger garlic paste', 'sugar'],
  },
];

const MARK = {
  wire: '◆', addr: '⌖', option: '·', reject: '✕', think: '✳',
  check: '✓', item: '▸', warn: '!', error: '✕', start: '▸', done: '★',
};
const TONE = {
  wire: 'text-saffron', check: 'text-fresh', reject: 'text-ink-3',
  error: 'text-stop', warn: 'text-warn', think: 'text-saffron', done: 'text-fresh',
};

async function streamPost(url, body, onEvent) {
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop();
    for (const p of parts) {
      if (!p.startsWith('data: ')) continue;
      try { onEvent(JSON.parse(p.slice(6))); } catch { /* partial frame */ }
    }
  }
}

/* ---------------------------------------------------------------- page */

export default function Pantry() {
  const [picked, setPicked] = useState([]);
  const [events, setEvents] = useState([]);
  const [itemState, setItemState] = useState({});
  const [credits, setCredits] = useState(0);
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Flipkart won't honour a restored session, so the cloud browser signs in once
  // and stays open for the whole run. That's what these three bits of state track.
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [auth, setAuth] = useState({ connected: false, signedIn: false, awaitingOtp: false });

  useEffect(() => {
    fetch('/api/pantry/signin').then((r) => r.json()).then(setAuth).catch(() => {});
  }, []);

  const toggle = (it) =>
    setPicked((p) => (p.includes(it) ? p.filter((x) => x !== it) : [...p, it]));

  async function startSignIn() {
    if (!/^\d{10}$/.test(phone) || busy) return;
    setBusy(true); setError(null); setEvents([]); setItemState({}); setCredits(0); setSummary(null);
    let ok = false;
    try {
      // The picked items travel with the phone number on purpose: the agent
      // searches and decides while the OTP is in flight, so the short-lived
      // browser session is spent clicking rather than thinking.
      await streamPost('/api/pantry/signin', { phone, items: picked }, (ev) => {
        if (typeof ev.credits === 'number') setCredits(ev.credits);
        if (ev.type === 'done') ok = Boolean(ev.data && ev.data.signedIn);
        if (ev.type === 'otp') setAuth((a) => ({ ...a, awaitingOtp: true, connected: true }));
        if (ev.type === 'done') setAuth({ ...ev.data, awaitingOtp: false });
        if (ev.type === 'error') setError(ev.message);
        setEvents((prev) => [...prev, ev]);
      });
    } catch (e) { setError(String(e.message)); }
    setBusy(false);

    // The stream's own verdict is not the last word. signIn() has thrown
    // "OTP submitted but Flipkart still shows a login screen" at a browser that was
    // genuinely signed in — the redirect simply landed a second after the poll gave
    // up. So ask the live page before deciding, or a good session gets abandoned.
    const live = await fetch('/api/pantry/signin').then((r) => r.json()).catch(() => null);
    if (live) setAuth(live);

    // Don't make the human press a second button. The session is measured in
    // seconds and it is already running.
    if ((ok || live?.signedIn) && picked.length) stockUp({ keepLog: true });
  }

  async function sendOtp() {
    const r = await fetch('/api/pantry/signin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp }),
    });
    if (!r.ok) setError('That code was not accepted — is the sign-in still waiting?');
    setOtp('');
  }

  async function stockUp({ keepLog = false } = {}) {
    if (!picked.length) return;
    setBusy(true); setError(null); setSummary(null);
    if (!keepLog) { setEvents([]); setItemState({}); setCredits(0); }
    try {
      await streamPost('/api/pantry', { items: picked }, (ev) => {
        if (typeof ev.credits === 'number') setCredits(ev.credits);
        if (ev.type === 'item' && ev.data?.name) {
          setItemState((s) => ({ ...s, [ev.data.name]: ev.data }));
        } else if (ev.type === 'done') {
          setSummary(ev.data);
        } else if (ev.type === 'error') {
          setError(ev.message);
        }
        setEvents((prev) => [...prev, ev]);
      });
    } catch (e) { setError(String(e.message)); }
    setBusy(false);
  }

  const done = Object.values(itemState).filter((s) => s.state === 'added').length;

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-7 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <a href="/" className="text-[12px] text-ink-3 underline decoration-rule underline-offset-2 hover:text-fresh">
            ← cooking
          </a>
          <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-tight">Stock the cupboard</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-snug text-ink-2">
            Ghee, masalas, flour, dal — the things you buy once a month and never need
            in ten minutes. This fills your <strong className="font-semibold text-ink">real
            flipkart.com cart</strong>, entirely through Anakin: Wire finds the listings,
            and Anakin&apos;s own cloud browser does the clicking. Nothing runs on your machine —
            no local Chrome, no debug port.
          </p>
        </div>

        <div className="panel shrink-0 px-4 py-3 text-right">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">Anakin credits</div>
          <div className={`text-[26px] font-semibold leading-tight ${credits ? 'text-saffron' : 'text-ink-3'}`}>
            {credits}
          </div>
          <div className="text-[10.5px] text-ink-3">Wire search · cloud browser</div>
        </div>
      </header>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* ---------------- the shelves ---------------- */}
        <div className="space-y-4">
          {SHELVES.map((shelf) => (
            <section key={shelf.name} className="panel p-4">
              <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                {shelf.name}
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {shelf.items.map((it) => {
                  const s = itemState[it];
                  const landed = s?.state === 'added';
                  const failed = s?.state === 'failed';
                  const working = s?.state === 'working';
                  return (
                    <button key={it} onClick={() => !busy && toggle(it)} disabled={busy}
                      data-on={picked.includes(it)}
                      title={s?.product || s?.why || ''}
                      className={`chip px-2.5 py-1 text-[12.5px] disabled:cursor-default
                        ${landed ? 'line-through opacity-60' : ''}
                        ${failed ? 'opacity-50 line-through' : ''}`}>
                      {working && <span className="mr-1 text-saffron">⋯</span>}
                      {landed && <span className="mr-1 text-fresh">✓</span>}
                      {failed && <span className="mr-1 text-stop">✕</span>}
                      {it}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}

          <p className="px-1 text-[11.5px] leading-relaxed text-ink-3">
            <strong className="font-semibold text-ink-2">Two Flipkart catalogues, and they are not the same.</strong>{' '}
            The cooking flow uses <code className="text-[11px]">flipkart-com</code> — Minutes, ten-minute
            delivery, custom Build Studio actions that are <code className="text-[11px]">auth_mode: none</code>{' '}
            and only reach an <em>anonymous</em> cart. That is why it drives your own browser.
            Cupboard stock isn&apos;t urgent, so this page uses{' '}
            <code className="text-[11px]">flipkart</code> instead, where{' '}
            <code className="text-[11px]">fk_add_to_cart</code> is{' '}
            <code className="text-[11px]">auth_mode: required</code> and lands in the cart you actually
            check out from. It needs a Flipkart identity connected in the Anakin dashboard once —
            after that, no browser is involved at all.
          </p>
        </div>

        {/* ---------------- run it ---------------- */}
        <aside className="space-y-4">
          {/* Sign-in has to happen here and stay open: Flipkart rejects a restored
              session, so the browser that signs in must be the one that clicks. */}
          <div className="panel p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-semibold">Anakin browser</span>
              <span className={`text-[11.5px] ${auth.signedIn ? 'text-fresh' : 'text-ink-3'}`}>
                {auth.signedIn ? '✓ signed in' : auth.awaitingOtp ? 'waiting for OTP' : 'not signed in'}
              </span>
            </div>

            {!auth.signedIn && !auth.awaitingOtp && (
              <>
                <p className="mt-1 text-[11.5px] leading-snug text-ink-3">
                  Flipkart won&apos;t honour a saved session, so sign in once and the browser
                  stays open for the whole run.
                </p>
                <div className="mt-2 flex gap-2">
                  <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="10-digit Flipkart number" inputMode="numeric"
                    className="min-w-0 flex-1 rounded-xl border border-rule bg-sunk px-3 py-2 text-[13px]
                               outline-none placeholder:text-ink-3 focus:border-fresh focus:bg-surface" />
                  <button onClick={startSignIn} disabled={phone.length !== 10 || busy}
                    className="shrink-0 rounded-xl bg-fresh px-4 py-2 text-[13px] font-semibold text-white
                               transition hover:bg-fresh-2 disabled:opacity-40">
                    {busy ? '…' : 'Sign in'}
                  </button>
                </div>
              </>
            )}

            {auth.awaitingOtp && (
              <>
                <p className="mt-1 text-[11.5px] leading-snug text-saffron">
                  Flipkart has sent a code to {phone || 'your phone'}.
                </p>
                <div className="mt-2 flex gap-2">
                  <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="OTP" inputMode="numeric" autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && otp.length >= 4 && sendOtp()}
                    className="min-w-0 flex-1 rounded-xl border border-saffron bg-surface px-3 py-2 text-[13px]
                               tracking-[0.3em] outline-none" />
                  <button onClick={sendOtp} disabled={otp.length < 4}
                    className="shrink-0 rounded-xl bg-saffron px-4 py-2 text-[13px] font-semibold text-white
                               transition hover:bg-saffron-2 disabled:opacity-40">
                    Enter
                  </button>
                </div>
              </>
            )}

            {auth.signedIn && (
              <p className="mt-1 text-[11.5px] leading-snug text-ink-3">
                Signed in inside Anakin&apos;s browser. Nothing is running on your machine.
              </p>
            )}
          </div>

          <div className="panel p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-semibold">
                {picked.length} selected
              </span>
              {done > 0 && <span className="text-[12px] text-fresh">{done} in the cart</span>}
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-ink-3">
              {picked.length
                ? `${picked.length * 2} credits of fk_search_products, plus the open browser at 1 credit / 2 min.`
                : 'Pick what you’re out of.'}
            </p>
            <button onClick={stockUp} disabled={!picked.length || busy || !auth.signedIn}
              className="mt-3 w-full rounded-xl bg-saffron px-4 py-3 text-[14px] font-semibold text-white
                         shadow-sm transition hover:bg-saffron-2 disabled:opacity-40">
              {busy ? `Stocking… ${done}/${picked.length}`
                    : auth.signedIn ? 'Stock up via Anakin' : 'Sign in first'}
            </button>
            {summary && (
              <a href="https://www.flipkart.com/viewcart" target="_blank" rel="noreferrer"
                className="mt-2 block rounded-xl bg-fresh px-4 py-3 text-center text-[13.5px] font-semibold text-white transition hover:bg-fresh-2">
                {summary.added} of {summary.asked} added · open cart →
              </a>
            )}
            {error && (
              <p className="mt-3 rounded-xl border border-stop/25 bg-stop/5 px-3 py-2 text-[12px] text-stop">{error}</p>
            )}
          </div>

          <div className="panel flex max-h-[62vh] flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-rule-soft px-4 py-3">
              <h3 className="text-[13px] font-semibold">Every Wire call</h3>
              {busy && <span className="flex items-center gap-1.5 text-[11px] text-fresh">
                <span className="live-dot h-1.5 w-1.5 rounded-full bg-fresh" />live</span>}
            </div>
            <div className="scroll-quiet flex-1 overflow-y-auto px-4 py-3 font-mono text-[11.5px] leading-relaxed">
              {!events.length && (
                <p className="py-6 text-center font-sans text-ink-3">
                  Each line below is one billed Anakin action.
                </p>
              )}
              {events.map((e, i) => (
                <div key={i} className="rise flex gap-2">
                  <span className="w-8 shrink-0 text-right text-ink-3">{e.t}s</span>
                  <span className={`w-3 shrink-0 ${TONE[e.type] || 'text-ink-3'}`}>{MARK[e.type] || '▸'}</span>
                  <span className={`min-w-0 break-words ${TONE[e.type] || 'text-ink-2'}`}>{e.message}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
