// Recipe source preference.
//
// NOT a whitelist. Any site publishing schema.org Recipe JSON-LD is readable —
// that's what makes this work on the open web. This only decides which result to
// TRY FIRST when search returns several, so "chole masala" lands on an Indian home
// cook rather than a US food magazine.

const TRUSTED_INDIAN = [
  'vegrecipesofindia.com', 'hebbarskitchen.com', 'indianhealthyrecipes.com',
  'cookwithmanali.com', 'spiceupthecurry.com', 'whiskaffair.com',
  'cubesnjuliennes.com', 'myfoodstory.com', 'archanaskitchen.com',
  'maggi.in', 'sanjeevkapoor.com', 'tarladalal.com', 'ndtv.com',
  'vismaifood.com', 'pipingpotcurry.com', 'ministryofcurry.com',
  'cookingcarnival.com', 'werecipes.com', 'sharmispassions.com',
  'rakskitchen.net', 'padhuskitchen.com', 'swasthisrecipes.com',
];

// Reliable structured markup, but Western-leaning — fine as a fallback.
const GENERAL = [
  'allrecipes.com', 'bbcgoodfood.com', 'seriouseats.com', 'food.com',
  'simplyrecipes.com', 'bonappetit.com', 'thekitchn.com', 'delish.com',
  'epicurious.com', 'taste.com.au', 'recipetineats.com',
];

// Never useful as a recipe source.
const BLOCK = /youtube\.com|pinterest\.|facebook\.com|instagram\.com|reddit\.com|amazon\.|quora\.com|\.pdf$/i;

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const listed = (host, list) => list.some((d) => host === d || host.endsWith(`.${d}`));

/** Higher is better. Indian sources win for Indian dishes; anything parseable still scores > 0. */
export function scoreSource(url, { indian = true } = {}) {
  const host = hostOf(url);
  if (!host || BLOCK.test(url)) return -1;              // never try these
  if (listed(host, TRUSTED_INDIAN)) return indian ? 10 : 6;
  if (listed(host, GENERAL)) return 5;
  return 2;                                             // unknown site — still worth trying
}

/** Order search results best-first without discarding anything readable. */
export function rankSources(results, opts = {}) {
  return results
    .map((r) => ({ ...r, host: hostOf(r.url), _score: scoreSource(r.url, opts) }))
    .filter((r) => r._score > 0)
    .sort((a, b) => b._score - a._score);
}

export { TRUSTED_INDIAN, GENERAL };
