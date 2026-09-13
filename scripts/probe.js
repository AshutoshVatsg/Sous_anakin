// What does schema.org Recipe JSON-LD actually give us beyond ingredients?
import { search, scrape } from '../src/anakin.js';
import { extractRecipeJsonLd } from '../src/pipeline.js';

const q = process.argv[2] || 'paneer butter masala recipe indian';

(async () => {
  const results = await search(q);
  console.log(`${results.length} search results\n`);

  for (const r of results.slice(0, 3)) {
    try {
      const page = await scrape(r.url, ['html']);
      const ld = extractRecipeJsonLd(page.html || '');
      if (!ld) { console.log(`✗ ${r.url.slice(0, 55)} — no Recipe JSON-LD`); continue; }

      const img = ld.image;
      const imgUrl = typeof img === 'string' ? img
        : Array.isArray(img) ? (typeof img[0] === 'string' ? img[0] : img[0]?.url)
        : img?.url;

      console.log(`✓ ${(ld.name || '').slice(0, 50)}`);
      console.log(`   image   : ${imgUrl ? imgUrl.slice(0, 72) : 'NONE'}`);
      console.log(`   time    : prep=${ld.prepTime || '-'} cook=${ld.cookTime || '-'} total=${ld.totalTime || '-'}`);
      console.log(`   rating  : ${ld.aggregateRating?.ratingValue || '-'} (${ld.aggregateRating?.ratingCount || 0} votes)`);
      console.log(`   cuisine : ${ld.recipeCuisine || '-'} · category: ${ld.recipeCategory || '-'}`);
      console.log(`   yield   : ${ld.recipeYield} · ingredients: ${(ld.recipeIngredient || []).length}`);
      console.log(`   desc    : ${String(ld.description || '').slice(0, 90)}`);
      console.log(`   keys    : ${Object.keys(ld).filter((k) => !k.startsWith('@')).join(', ').slice(0, 130)}\n`);
    } catch (e) { console.log(`✗ ${r.url.slice(0, 50)} — ${String(e.message).slice(0, 40)}`); }
  }
})();
