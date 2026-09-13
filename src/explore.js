// Discovery: "something with paneer" -> a handful of dishes worth cooking tonight.
//
// Scrapes many candidate pages in parallel, keeps the ones with real recipe markup,
// and ranks them by how much of each the cook ALREADY has. The ranking is computed
// from live recipe data, which is what makes it a recommendation rather than a guess.
import { search, scrape } from './anakin.js';
import { extractRecipeJsonLd, parseIngredient } from './pipeline.js';
import { rankSources, scoreSource } from './sources.js';
import { readCraving, readBudget, readProtein, parseProtein, styleQueries, dishQueries, budgetQueries, budgetCeiling, budgetFit, dishKind, lightness, mentions, pickDiverse } from './variety.js';
import { synonyms } from './pick.js';
import { ensure, aliasesOf } from './knowledge.js';
import { planSearch, fallbackPlan, judgeDishes } from './plan.js';
import { estimateBasket } from './price.js';

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

// JSON-LD is embedded in HTML, so its strings arrive HTML-escaped: a title came
// through as "Oats Dosa Recipe (Instant &amp; Crispy)".
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…',
  frac12: '½', frac14: '¼', frac34: '¾', deg: '°',
};
const decode = (s) => String(s || '')
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&([a-z][a-z0-9]*);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);

const pickImage = (img) => !img ? null
  : typeof img === 'string' ? img
  : Array.isArray(img) ? pickImage(img[0])
  : (img.url || img.contentUrl || null);

const isoMinutes = (iso) => {
  if (!iso || typeof iso !== 'string') return 0;
  return Number((iso.match(/(\d+)H/) || [])[1] || 0) * 60 + Number((iso.match(/(\d+)M/) || [])[1] || 0);
};

/** Turn one scraped page into a dish card, or null if it isn't a real recipe. */
function toCard(url, html, pantry) {
  const ld = extractRecipeJsonLd(html || '');
  if (!ld || !(ld.recipeIngredient || []).length) return null;

  // A page is a real recipe if it tells you how to make the thing — not if it has
  // enough ingredients to look like an Indian curry.
  //
  // This used to demand six ingredients, on the reasoning that "a real Indian main
  // has ~8+ lines". A milkshake has four. Asking for one, eight of twelve pages
  // read were thrown away here and the shortlist came back three dishes short. The
  // point of the check was to reject ingredient-explainer stubs, so check for that
  // instead: something to cook, and instructions for cooking it.
  const ingredients = ld.recipeIngredient.map(parseIngredient).filter((i) => i.name);
  const hasSteps = Boolean(ld.recipeInstructions && (Array.isArray(ld.recipeInstructions)
    ? ld.recipeInstructions.length : String(ld.recipeInstructions).length > 40));
  if (ingredients.length < 3) return null;
  if (ingredients.length < 6 && !hasSteps) return null;

  const owned = pantry.map((p) => p.toLowerCase().trim());
  const covered = (ing) =>
    ing.staple || owned.some((o) => o.length > 2 && (ing.name.includes(o) || ing.term.includes(o)));
  const missing = ingredients.filter((ing) => !covered(ing));
  const haveCount = ingredients.length - missing.length;

  const total = isoMinutes(ld.totalTime) || (isoMinutes(ld.prepTime) + isoMinutes(ld.cookTime));
  const card = {
    title: decode(ld.name).trim().slice(0, 80),
    url, host: hostOf(url),
    image: pickImage(ld.image),
    // Some sites publish a nonsense totalTime ("PT1M" for a curry). A number that
    // obviously can't be true is worse than no number.
    minutes: total >= 5 ? total : null,
    rating: ld.aggregateRating?.ratingValue ? Number(ld.aggregateRating.ratingValue) : null,
    votes: ld.aggregateRating?.ratingCount ? Number(ld.aggregateRating.ratingCount) : null,
    cuisine: [].concat(ld.recipeCuisine || []).filter(Boolean).join(', ') || null,
    description: decode(ld.description).replace(/\s+/g, ' ').trim().slice(0, 180) || null,
    serves: Number(String(Array.isArray(ld.recipeYield) ? ld.recipeYield[0] : ld.recipeYield || '').match(/\d+/)?.[0]) || 4,
    ingredients,
    missing,
    totalIngredients: ingredients.length,
    haveCount,
    needCount: missing.length,
    coverage: ingredients.length ? haveCount / ingredients.length : 0,
  };

  // Protein comes free: 82% of the recipe pages we already scrape publish it in
  // their nutrition block, per serving. No extra call, no model guessing a number.
  card.protein = parseProtein(ld.nutrition?.proteinContent);
  card.calories = parseProtein(ld.nutrition?.calories) || null;

  // What kind of dinner this is, read off the recipe itself.
  card.kind = dishKind(card);
  card.light = lightness(card);
  // And roughly what the shop will cost — from prices we've seen, not live calls.
  card.cost = estimateBasket(missing);
  return card;
}

/**
 * Find dishes for a craving ("something with paneer") or a named dish.
 *
 * @param craving   what the cook fancies
 * @param pantry    what they already have — drives the ranking
 * @param opts.pages  how many pages to scrape (default 15)
 * @param opts.want   how many dishes to return (default 5)
 */
export async function exploreDishes(craving, pantry = [], emit = () => {}, opts = {}) {
  const { pages = 15, want = 5, concurrency = 5 } = opts;

  // Protein first: "100g protein under ₹600" would otherwise hand the 100 to the
  // budget parser and plan a hundred-rupee dinner.
  const goal = readProtein(craving);
  craving = goal.text || craving;

  // A price typed into the sentence wins over the one set on the dial — saying it
  // out loud is the more explicit instruction.
  const spoken = readBudget(craving);
  craving = spoken.text || craving;
  const budget = spoken.budget || opts.budget || 0;
  const mode = spoken.budget ? spoken.mode : (opts.budgetMode || 'around');

  // The agent decides what to search for. Templates could not tell that "dry" in
  // "find me best dry chicken dish" is a constraint, and cheerfully searched for
  // "dry best dry chicken sabzi recipe without gravy" and then offered a curry.
  // It also knows perfectly well that paneer, chicken, fish, eggs and soya are
  // where protein comes from — better than a list we'd maintain.
  const plan = await planSearch(craving, { pantry, budget, mode, protein: goal })
    .catch(() => fallbackPlan(craving, budget));
  const { ingredient, broad, wants, avoid, queries } = plan;

  if (budget > 0) emit('budget', `keeping the shop ${mode} ₹${budget}`, { budget, mode });
  emit('plan', plan.planned
    ? `read that as: ${ingredient}${wants.length ? ` · ${wants.join(' · ')}` : ''}`
    : `looking for ${ingredient}`,
    { ingredient, wants, avoid, planned: plan.planned });
  emit('search', broad
    ? `${queries.length} ways to look for ${ingredient}…`
    : `searching the web for "${ingredient}"…`);

  const seen = new Set();
  const lanes = [];
  for (const { tag, q } of queries) {
    try {
      const hits = rankSources(await search(q), { indian: true }).filter((r) => {
        const key = r.url.split('?')[0];
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (hits.length) lanes.push({ tag, hits });
    } catch (e) {
      // An empty wallet is not an empty internet — stop and say which it is.
      if (/credits/i.test(e.message)) { emit('error', e.message); throw e; }
      emit('skip', `search "${q.slice(0, 30)}" failed`);
    }
  }
  if (!lanes.length) throw new Error('No search results came back — check the Anakin key and its credit balance');

  // Take one page from each angle in turn. Slicing off the front instead would
  // fill the whole batch from the first angle and undo the fan-out.
  const pool = [];
  for (let round = 0; pool.length < pages; round++) {
    const before = pool.length;
    for (const lane of lanes) {
      if (pool.length >= pages) break;
      if (lane.hits[round]) pool.push(lane.hits[round]);
    }
    if (pool.length === before) break;            // every angle exhausted
  }
  emit('search', `${lanes.length} search angles · ${seen.size} distinct pages found`);
  emit('found', `reading ${pool.length} of them, ${concurrency} at a time`);

  // scrape in parallel, bounded — one slow blog shouldn't hold up the batch
  const cards = [];
  let cursor = 0, read = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, pool.length) }, async () => {
    while (cursor < pool.length) {
      const r = pool[cursor++];
      try {
        const page = await scrape(r.url, ['html']);
        const card = toCard(r.url, page.html, pantry);
        read++;
        if (card) { cards.push(card); emit('card', `${card.title.slice(0, 42)} — you have ${card.haveCount}/${card.totalIngredients}`); }
      } catch { read++; }
    }
  }));
  emit('read', `${read} pages read · ${cards.length} had usable recipe data`);

  // drop near-duplicate titles across sites
  const byTitle = new Set();
  let unique = cards.filter((c) => {
    const k = c.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 26);
    if (byTitle.has(k)) return false;
    byTitle.add(k);
    return true;
  });

  // Learn anything we've never met before — the craving itself, and every
  // ingredient on the shortlist's shopping lists. One call, cached forever, and it
  // is what lets "eggs", "tofu" or "prawns" behave as well as "paneer" does.
  const learned = await ensure([ingredient, ...unique.flatMap((c) => c.missing.map((i) => i.term))], emit)
    .catch(() => 0);
  // Costing happens per page as it's read, so anything just learned has to be
  // re-costed — that's how "turmeric" stops being unpriced.
  if (learned) for (const c of unique) c.cost = estimateBasket(c.missing);

  // …and drop anything that doesn't actually contain what was asked for. Search
  // engines answer "oats" with pages that only mention oats; a mushroom tikka is
  // not a worse oats dish, it is not an oats dish. Only when a craving is broad —
  // a named dish is its own answer.
  // Only for a single-word ingredient. "a quick jain dinner" plans beautifully but
  // "jain dinner" is a style of eating, not something that appears in an ingredient
  // list — demanding it be there would throw away every correct answer. The stated
  // constraints are enforced below, which is the right place for that request.
  // …but not for a protein request. There the "ingredient" is a GOAL, not a food:
  // the planner answers "protein", and demanding the word protein appear in the
  // recipe threw away 9 of 12 pages including a 35 g fish curry. The protein
  // ranking and the constraint check below are what keep those honest.
  if (broad && !goal.wanted && !/\s/.test(ingredient)) {
    const alias = (w) => aliasesOf(w, synonyms);
    const real = unique.filter((c) => mentions(c, ingredient, alias));
    if (real.length) {
      if (real.length < unique.length) {
        emit('check', `${unique.length - real.length} page${unique.length - real.length === 1 ? '' : 's'} dropped — no ${ingredient} in the recipe`);
      }
      unique = real;
    } else {
      emit('warn', `nothing found that actually contains ${ingredient} — showing the closest matches`);
    }
  }

  // Hold the recipes against what was actually asked for. A query for "dry chicken"
  // still returns curries; only reading the ingredients tells you which is which,
  // and that judgement is the model's — there is no regex for "this is dry".
  if (wants.length || avoid.length) {
    const verdicts = await judgeDishes(unique, wants, avoid).catch(() => new Map());
    if (verdicts.size) {
      // Attach the verdict to the card BEFORE filtering — indices refer to the
      // list we sent, and they stop meaning anything the moment it's filtered.
      unique.forEach((c, i) => {
        const v = verdicts.get(i);
        c.why = v?.why || null;
        c.matches = v ? v.ok : null;
      });
      const asked = wants.concat(avoid).join(', ');
      const ok = unique.filter((c) => c.matches !== false);
      const dropped = unique.length - ok.length;

      if (ok.length >= Math.min(want, 3)) {
        unique = ok;
        if (dropped) emit('check', `${dropped} dropped — not ${asked}`);
        const lead = unique.find((c) => c.matches && c.why);
        if (lead) emit('covered', `${lead.title.slice(0, 34)} — ${lead.why}`);
      } else if (dropped) {
        // Too few survived to fill a shortlist. Say so rather than show three
        // cards, and put the ones that do match first.
        emit('warn', `only ${ok.length} are ${asked} — showing the closest others too`);
        unique = [...ok, ...unique.filter((c) => c.matches === false)];
      }
    }
  }

  // Rank on a blend, not coverage alone: an authentic Indian recipe you're
  // missing 3 things from beats a Western adaptation you're missing 2 from.
  // "Around ₹200" gets a tolerance band — the price IS an estimate, and a hard
  // line at exactly ₹200 would be false precision. "Under ₹200" is nearly literal.
  const ceiling = budgetCeiling(budget, mode);
  const fits = (c) => c.cost.priced > 0 && c.cost.meal <= ceiling;

  const scoreOf = (c) => {
    const source = scoreSource(c.url, { indian: true });     // 10 Indian, 5 general, 2 unknown
    const rating = c.rating ? Math.min(c.rating / 5, 1) : 0.5;
    const quick = c.minutes ? Math.max(0, 1 - c.minutes / 90) : 0.4;

    // Asked for protein: that IS the ask, so a dish that delivers it outranks a
    // nicer dish that doesn't. Per serving, because that's what people track.
    let proteinScore = 0;
    if (goal.wanted) {
      if (c.protein) {
        // 30 g in one sitting is a big plateful; score against that, not the goal,
        // so a 100 g target doesn't make every real dish look like a failure.
        proteinScore = Math.min(c.protein / 30, 1) * 3.5;
        // With a budget too, what matters is grams per rupee.
        if (budget > 0 && c.cost.meal > 0) {
          proteinScore += Math.min((c.protein / c.cost.meal) / 0.25, 1) * 2;
        }
      } else {
        proteinScore = -0.8;   // unknown protein can't win a protein search
      }
    }

    // No price named: find the best dinner. Most people, most of the time.
    if (budget <= 0 || !c.cost.priced) {
      return c.coverage * 3 + (source / 10) * 2 + rating * 1.2 + quick * 0.6 + proteinScore;
    }

    // A price named: landing near it is the job, and "the best dish on the
    // internet" is demoted to a tiebreaker. Which blog it came from matters least
    // of all — at full weight, a trusted site's 16-ingredient korma outranked a
    // 9-ingredient sabzi that was cheaper and fit better.
    return budgetFit(c.cost.meal, budget, mode) * 3.5
      + Math.max(0, 1 - c.needCount / 16) * 1.5   // a short list IS the budget
      + c.coverage * 2
      + (source / 10) * 0.8
      + rating * 0.8
      + quick * 0.4
      + proteinScore;
  };
  const ranked = unique
    .map((c) => ({ ...c, _score: scoreOf(c) }))
    .sort((a, b) => b._score - a._score);

  // Best-first is not the same as useful. Five sites' butter masala is one idea,
  // so the shortlist spreads across dishes, styles and sites — but only ever from
  // the dishes that fit the price, when one was named.
  const shortlist = broad
    ? pickDiverse(ranked, want, ingredient, budget > 0 ? { fits } : {})
    : ranked.slice(0, want);

  // Variety decides WHICH five; a stated protein goal decides the order they're
  // shown in. Otherwise the diversity pass can put a 4 g dish above a 15 g one on
  // a screen whose whole point is protein.
  if (goal.wanted) shortlist.sort((a, b) => (b.protein || 0) - (a.protein || 0));

  const kinds = [...new Set(shortlist.map((c) => c.kind))];
  const sites = new Set(shortlist.map((c) => c.host));
  if (broad && kinds.length > 1) emit('ranked', `${shortlist.length} dishes across ${kinds.length} styles · ${kinds.join(', ')}`);
  emit('ranked', `from ${sites.size} different site${sites.size === 1 ? '' : 's'} · ${seen.size} pages considered`);
  if (budget > 0) {
    const pool = ranked.filter(fits).length;
    const within = shortlist.filter(fits).length;
    emit('budget', within
      ? `${within} of ${shortlist.length} cook for ${mode} ₹${budget} · ${pool} found in range`
      : `nothing found ${mode} ₹${budget} — showing the ${shortlist.length} cheapest instead`,
      { budget, mode, within, pool });
  }
  if (goal.wanted) {
    const known = shortlist.filter((c) => c.protein);
    const best = known.reduce((a, c) => Math.max(a, c.protein), 0);
    const need = goal.goal && best ? Math.ceil(goal.goal / best) : null;
    emit('protein', known.length
      ? `protein a serving: ${known.map((c) => `${c.protein} g`).join(', ')}`
        + (need ? ` · ${need} serving${need === 1 ? '' : 's'} of the best reaches ${goal.goal} g` : '')
      : 'none of these publish their protein — I can\'t rank them on it',
      { goal: goal.goal, diet: goal.diet, best, need, known: known.length });
  }
  emit('ranked', `top pick: ${shortlist[0]?.title.slice(0, 40)} — ${shortlist[0]?.haveCount}/${shortlist[0]?.totalIngredients} in your kitchen`);
  return shortlist;
}
