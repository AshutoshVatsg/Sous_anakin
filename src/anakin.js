// Anakin API adapters. All calls verified working 12 Sep 2026.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
// Next loads .env into process.env; the CLI reads the file directly.
// import.meta.dirname is undefined under Turbopack, so resolve from cwd.
const ROOT = process.cwd();
function readKey() {
  if (process.env.ANAKIN_API_KEY) return process.env.ANAKIN_API_KEY.trim();
  try {
    return (fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(/ask_[a-f0-9]+/) || [])[0];
  } catch { return null; }
}

// Resolve the key lazily. Throwing at import time takes the whole app down at
// BUILD time on a host where env vars arrive later — the pages never render and
// the error blames a missing file rather than a missing setting. Fail at the call
// instead, so the UI boots and only the call that needs a key complains.
let _key = null;
function KEY() {
  if (_key) return _key;
  _key = readKey();
  if (!_key) throw new Error('ANAKIN_API_KEY is not set — add it in the host environment');
  return _key;
}

const BASE = 'https://api.anakin.io';
const CACHE = path.join(ROOT, 'cache');
fs.mkdirSync(CACHE, { recursive: true });

let creditsUsed = 0;
const spend = (n) => { creditsUsed += n; };
const getCredits = () => creditsUsed;

// Disk cache so development doesn't burn credits on every code change.
function cacheKey(name, payload) {
  const h = crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 12);
  return path.join(CACHE, `${name}_${h}.json`);
}

async function call(endpoint, body, { cacheName, cost = 1, fresh = false } = {}) {
  const cf = cacheName ? cacheKey(cacheName, body) : null;
  if (cf && !fresh && fs.existsSync(cf)) {
    return { ...JSON.parse(fs.readFileSync(cf, 'utf8')), _cached: true };
  }
  const res = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'X-API-Key': KEY(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  spend(cost);

  // Running out of credits must be LOUD. It came back as an empty result set and
  // the agent reported "nothing found that actually contains chicken" — blaming the
  // recipe web for an empty wallet is the worst kind of wrong answer.
  if (res.status === 402 || json.error === 'insufficient_credits') {
    throw new Error(`Anakin credits exhausted — ${json.message || 'balance is 0'}`);
  }
  // Never cache a failure or an empty result — otherwise one bad run poisons every later run.
  const empty = json.status === 'failed' || json.error ||
    (json.data && Array.isArray(json.data.products) && json.data.products.length === 0);
  if (cf && !empty) fs.writeFileSync(cf, JSON.stringify(json, null, 2));
  return json;
}

/** Web search. NOTE: the parameter is `prompt`, NOT `query` (docs are wrong). 3 credits. */
async function search(prompt, opts = {}) {
  const r = await call('/v1/search', { prompt }, { cacheName: 'search', cost: 3, ...opts });
  return (r.results || []).map((x) => ({ title: x.title, url: x.url, snippet: x.snippet }));
}

/** Run a Wire action. Zero-Touch-capable actions work without a key; we always send one. */
async function wire(action_id, params, opts = {}) {
  const r = await call('/v1/wire-run', { action_id, params }, { cacheName: `wire_${action_id}`, ...opts });
  if (r.status === 'failed') throw new Error(`Wire ${action_id} failed: ${r.error}`);
  return r.data ?? r;
}

/** Scrape a URL to markdown. 1 credit. */
async function scrape(url, formats = ['markdown'], opts = {}) {
  return call('/v1/url-scraper/scrape', { url, formats }, { cacheName: 'scrape', ...opts });
}

/** Connect to Anakin's cloud browser over CDP. 1 credit / 2 min. */
async function browser({ country = 'IN', sessionName, record = false, saveSession } = {}) {
  const { chromium } = await import('playwright-core');
  const q = new URLSearchParams({ api_key: KEY(), country });
  if (sessionName) q.set('session_name', sessionName);
  if (record) q.set('record', 'true');
  if (saveSession) q.set('save_session', saveSession);
  return chromium.connectOverCDP(`wss://api.anakin.io/v1/browser-connect?${q}`, { timeout: 60000 });
}

export { search, wire, scrape, browser, getCredits, KEY };
