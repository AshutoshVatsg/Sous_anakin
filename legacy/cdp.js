// Minimal CDP driver for ONE page target.
//
// Why not Playwright: chromium.connectOverCDP() attaches to every target in the
// browser, so a single slow tab (the user had 17 open) stalls the whole connection.
// Talking to one page's WebSocket directly is immune to that — and CDP's
// Input.dispatchMouseEvent produces TRUSTED events, which React Native Web requires.
import WebSocket from 'ws';

export class Page {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }

  static async attach(match = /flipkart\.com/, { port = 9222 } = {}) {
    const list = await fetch(`http://localhost:${port}/json/list`).then((r) => r.json());
    const pages = list.filter((t) => t.type === 'page');
    const target = pages.find((t) => match.test(t.url));
    if (!target) throw new Error(`no tab matching ${match} (${pages.length} pages open)`);

    const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
    const page = new Page(ws);
    await new Promise((res, rej) => {
      ws.once('open', res); ws.once('error', rej);
      setTimeout(() => rej(new Error('cdp connect timeout')), 15000);
    });
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw);
      const p = page.pending.get(msg.id);
      if (p) { page.pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); }
    });
    return page;
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.delete(id)) rej(new Error(`${method} timeout`)); }, 45000);
    });
  }

  /** Run an expression in the page and get the value back. */
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression: `(() => { ${expression} })()`,
      returnByValue: true, awaitPromise: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'eval failed');
    return r.result?.value;
  }

  async goto(url) {
    await this.send('Page.enable').catch(() => {});
    await this.send('Page.navigate', { url });
    await this.wait(1500);
    // wait for the document to actually be interactive
    for (let i = 0; i < 40; i++) {
      const st = await this.eval('return document.readyState').catch(() => null);
      if (st === 'complete' || st === 'interactive') break;
      await this.wait(500);
    }
  }

  /** A real, trusted click at viewport coordinates. */
  async click(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons: 0 });
    await this.wait(120);
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await this.wait(90);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  }

  wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
  close() { try { this.ws.close(); } catch {} }
}

export const cartCount = (page) =>
  page.eval(`const m=document.body.innerText.match(/(\\d+)\\s*Cart/); return m?Number(m[1]):null;`);
