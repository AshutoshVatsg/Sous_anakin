// What the agent knows about an ingredient it has never met.
//
// THE PROBLEM THIS SOLVES
// The tables in synonyms.js, pick.js and price.js encode Indian vegetarian cooking,
// because that is what we tested against. They are a warm start, not a worldview.
// Ask for eggs, tofu, prawns, oats or pasta and a fixed table has nothing to say:
// no retail name, no idea whether it lives in the cupboard or the fridge, no
// aliases. The agent then guessed — and guessed badly, pricing coconut milk as milk.
//
// THE SPLIT
//   the model supplies KNOWLEDGE   — what an Indian shop calls this, what else it
//                                    is called, cupboard or fresh, roughly what
//                                    size pack it comes in
//   code supplies EVERY NUMBER     — prices come from Wire, never from the model,
//                                    because a model will happily invent ₹80
//
// Learned once, written to cache/knowledge.json, free forever after. The hardcoded
// tables remain as the fallback for when there is no key, so the agent still runs.
import fs from 'node:fs';
import path from 'node:path';

const FILE = path.join(process.cwd(), 'cache', 'knowledge.json');
const ROOT = process.cwd();

function envVal(name) {
  if (process.env[name]) return process.env[name].trim();
  try {
    const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(new RegExp(`^${name}=(.+)$`, 'm'));
    return m ? m[1].trim() : null;
  } catch { return null; }
}
const KEY = envVal('OPENAI_API_KEY');
const MODEL = envVal('LLM_MODEL') || 'gpt-5.4';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

let mem = null;
function load() {
  if (mem) return mem;
  try { mem = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { mem = {}; }
  return mem;
}
function save() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(mem, null, 2));
  } catch { /* a read-only disk must not break a search */ }
}

/** What we already know about a term, or null. */
export function known(term) {
  const k = norm(term);
  return k ? (load()[k] || null) : null;
}

export const hasKnowledge = () => Boolean(KEY);

/**
 * Learn the terms we don't already know, in one call.
 * Returns the number actually learned; silently returns 0 with no key, because
 * every caller has a table to fall back on.
 */
export async function ensure(terms = [], emit = () => {}) {
  const store = load();
  const todo = [...new Set(terms.map(norm).filter((t) => t && t.length > 1 && !store[t]))];
  if (!todo.length || !KEY) return 0;

  const batch = todo.slice(0, 40);
  const out = await ask(batch);
  if (!out) return 0;

  let learned = 0;
  for (const item of out.ingredients || []) {
    const k = norm(item.name);
    if (!k || !batch.includes(k)) continue;
    store[k] = {
      retail: norm(item.retail_term) || k,
      aliases: [...new Set((item.aliases || []).map(norm).filter(Boolean))],
      keeps: Boolean(item.keeps),
      pack: item.typical_pack || null,
      learnedAt: new Date().toISOString().slice(0, 10),
    };
    learned++;
  }
  if (learned) { save(); emit('learn', `looked up ${learned} ingredient${learned === 1 ? '' : 's'} I hadn't seen before`); }
  return learned;
}

async function ask(terms) {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `You know Indian grocery shopping. For each ingredient give:

- retail_term: what to type into an Indian grocery app to find it. Prefer the local
  retail name ("kasuri methi", not "dried fenugreek leaves"; "maida", not
  "all-purpose flour"; "curd", not "yogurt").
- aliases: other names the SAME thing is sold or written under, including Hindi or
  regional names. Only true synonyms. Coconut milk is NOT milk. Bread crumbs are
  NOT bread.
- keeps: true if it lives in the cupboard for months once opened (spices, flours,
  pulses, oils, sauces, dried goods). false if it is perishable and bought for the
  dish (fresh produce, dairy, meat, fish, eggs, herbs, paneer, tofu).
- typical_pack: the smallest pack it usually sells in, e.g. "200 g", "6 pc", "1 l".

NEVER state a price. Prices are looked up live and a guessed one is worse than none.

Reply with JSON only, shaped exactly like:
{"ingredients":[{"name":string,"retail_term":string,"aliases":[string],"keeps":boolean,"typical_pack":string}]}`,
          },
          { role: 'user', content: JSON.stringify({ ingredients: terms }) },
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: 3000,
      }),
    });
    const text = await res.text();
    if (!res.ok) { console.warn('[knowledge]', res.status, text.slice(0, 140)); return null; }
    return JSON.parse(JSON.parse(text).choices[0].message.content);
  } catch (e) { console.warn('[knowledge] failed:', String(e.message).slice(0, 90)); return null; }
}

/* ---------------- what the rest of the code asks of it ---------------- */

/** Every name this ingredient goes by, learned plus whatever the caller knows. */
export function aliasesOf(term, fallback = (w) => [w]) {
  const k = norm(term);
  const seed = new Set(fallback(k));
  const kn = known(k);
  if (kn) { seed.add(kn.retail); kn.aliases.forEach((a) => seed.add(a)); }
  return [...seed].filter(Boolean);
}

/** Cupboard item or bought-for-this-dish? null when we genuinely don't know. */
export function keepsFor(term) {
  const kn = known(term);
  return kn ? kn.keeps : null;
}

/** The phrase to type into the shop, if we've learned a better one. */
export function retailFor(term) {
  const kn = known(term);
  return kn ? kn.retail : null;
}

/** Everything the agent has learned so far — used by the price warm-up. */
export const learned = () => ({ ...load() });
