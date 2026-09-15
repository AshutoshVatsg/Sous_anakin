/**
 * Talking to the Sous cart-handover extension.
 *
 * The deployed app cannot fill a cart by itself: the server has no browser, and
 * nobody should hand it their Flipkart login. So the page works out WHAT to buy and
 * the extension does the adding, inside the visitor's own signed-in session. Their
 * credentials never leave their machine and never reach us.
 *
 * Detection is by announcement, not by extension id. An unpacked extension's id is
 * derived from the folder it was loaded from, so it differs on every machine — a
 * hardcoded id would work for us and for nobody else.
 */

const WIRE = "__sous";

/** Resolves to { version } if the extension is present, or null after `timeout`. */
export function detectExtension(timeout = 900) {
  if (typeof window === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      clearTimeout(timer);
      resolve(value);
    };
    const onMessage = (event) => {
      if (event.source !== window) return;
      if (event.data?.[WIRE] === "ready") done({ version: event.data.version });
    };
    // The marker is the reliable signal — the content script stamps <html> the
    // moment it runs, so there is no window in which we can ask too early.
    const stamped = document.documentElement.getAttribute("data-sous-extension");
    if (stamped) { done({ version: stamped }); return; }

    window.addEventListener("message", onMessage);
    // Fallback for a page that loaded before the extension existed.
    window.postMessage({ [WIRE]: "ping" }, "*");
    const timer = setTimeout(() => done(null), timeout);
  });
}

/**
 * Fill the cart through the extension.
 *
 * Deliberately the same shape as streamPost(url, body, onEvent) so the caller can
 * swap one for the other, and the same event vocabulary so the activity feed does
 * not need to know which path ran.
 */
export function fillViaExtension(items, onEvent) {
  return new Promise((resolve, reject) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const onMessage = (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.id !== id) return;

      if (data[WIRE] === "event") {
        onEvent(data.event);
      } else if (data[WIRE] === "end") {
        window.removeEventListener("message", onMessage);
        if (data.ok) resolve(data.result);
        else reject(new Error(data.error || "The cart handover stopped unexpectedly."));
      }
    };
    window.addEventListener("message", onMessage);
    window.postMessage({ [WIRE]: "fill", id, items }, "*");
  });
}
