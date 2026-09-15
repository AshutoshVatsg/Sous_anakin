// The bridge between the Sous page and the extension.
//
// WHY A CONTENT SCRIPT AND NOT externally_connectable BY ID
// An unpacked extension's ID is derived from the folder it was loaded from, so it
// differs on every machine. A page that hardcodes one ID would work for us and for
// nobody else — including every judge. A content script needs no ID at all: it is
// already inside the page, so it can just announce itself.
//
// Protocol, all via window.postMessage on the page's own origin:
//   ext  -> page   { __sous: 'ready',  version }
//   page -> ext    { __sous: 'ping' }
//   page -> ext    { __sous: 'fill',  id, items }
//   ext  -> page   { __sous: 'event', id, event }      (many)
//   ext  -> page   { __sous: 'end',   id, ok, ... }    (once)

const VERSION = chrome.runtime.getManifest().version;

// Stamp the document as well as announcing.
//
// A postMessage handshake races: if the page asks before we are injected, or we
// announce before the page is listening, detection fails even though everything
// works. An attribute on <html> has no such window — it is simply there, and the
// page can read it synchronously whenever it likes. The announce stays for pages
// that were already loaded when the extension was installed.
const mark = () => {
  try { document.documentElement.setAttribute('data-sous-extension', VERSION); } catch { /* no DOM yet */ }
};
const announce = () => window.postMessage({ __sous: 'ready', version: VERSION }, '*');

mark();
announce();
document.addEventListener('DOMContentLoaded', mark);

window.addEventListener('message', (e) => {
  if (e.source !== window || !e.data || typeof e.data !== 'object') return;
  const msg = e.data;

  if (msg.__sous === 'ping') { announce(); return; }
  if (msg.__sous !== 'fill' || !Array.isArray(msg.items)) return;

  const id = msg.id;
  let port;
  try {
    port = chrome.runtime.connect({ name: 'sous-fill' });
  } catch (err) {
    window.postMessage({ __sous: 'end', id, ok: false, error: 'the extension was reloaded — refresh and try again' }, '*');
    return;
  }

  port.onMessage.addListener((m) => {
    if (m.type === 'progress') window.postMessage({ __sous: 'event', id, event: m.event }, '*');
    else if (m.type === 'end') {
      window.postMessage({ __sous: 'end', id, ok: m.ok, error: m.error, result: m.result }, '*');
      try { port.disconnect(); } catch { /* already gone */ }
    }
  });

  port.onDisconnect.addListener(() => {
    window.postMessage({ __sous: 'end', id, ok: false, error: 'the extension stopped responding' }, '*');
  });

  port.postMessage({ type: 'fillCart', items: msg.items });
});
