const $items = document.getElementById('items');
const $go = document.getElementById('go');
const $feed = document.getElementById('feed');

// Remember the last list so a judge doesn't retype it after the popup closes.
chrome.storage.local.get(['lastItems'], ({ lastItems }) => {
  if (lastItems && !$items.value) $items.value = lastItems;
});

function line(type, message) {
  const row = document.createElement('div');
  row.className = `row ${type}`;
  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = type.slice(0, 8);
  const msg = document.createElement('span');
  msg.className = 'msg';
  msg.textContent = message;
  row.append(tag, msg);
  $feed.append(row);
  $feed.scrollTop = $feed.scrollHeight;
}

/**
 * Accept either a plain list or the JSON Sous produced.
 *
 * The plan's buy[] entries are {name, term, qty, reason, ...} and `term` is the
 * one that gets typed into Flipkart — "chopped cilantro" is bought as
 * "coriander leaves" — so prefer it when present.
 */
function parseItems(raw) {
  const text = raw.trim();
  if (!text) return [];
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      const list = Array.isArray(parsed) ? parsed : (parsed.buy || parsed.items || []);
      return list
        .map((x) => (typeof x === 'string' ? x : x.term || x.name))
        .filter(Boolean)
        .map((t) => ({ term: String(t) }));
    } catch {
      /* not JSON after all — fall through to line parsing */
    }
  }
  return text.split('\n').map((s) => s.trim()).filter(Boolean).map((t) => ({ term: t }));
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'progress' && msg.event) {
    const e = msg.event;
    line(e.data?.state || e.type, e.message);
  }
});

$go.addEventListener('click', () => {
  const items = parseItems($items.value);
  if (!items.length) { line('error', 'nothing to add — put one item per line'); return; }

  chrome.storage.local.set({ lastItems: $items.value });
  $feed.textContent = '';
  $go.disabled = true;
  $go.textContent = 'Working…';

  chrome.runtime.sendMessage({ type: 'fillCart', items }, (res) => {
    $go.disabled = false;
    $go.textContent = 'Add to my Flipkart cart';
    if (chrome.runtime.lastError) { line('error', chrome.runtime.lastError.message); return; }
    if (!res?.ok) { line('error', res?.error || 'the run stopped unexpectedly'); return; }
    const n = res.results.filter((r) => r.added).length;
    line('done', `${n} of ${res.results.length} in your cart — open Flipkart and pay`);
  });
});
