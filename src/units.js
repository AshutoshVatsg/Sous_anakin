// Unit normalisation + pack rounding.
// Principle (from the architecture review): aggregate quantities BEFORE rounding to packs,
// and never invent a conversion — unknown stays unknown rather than becoming a confident number.

const VOLUME_ML = { cup: 240, tbsp: 15, tsp: 5, ml: 1, l: 1000, floz: 30 };
const MASS_G = { g: 1, kg: 1000, oz: 28.35, lb: 453.6 };

// Ingredient-specific densities (g per cup). A universal grams-per-cup rule is invalid,
// so anything not listed here stays unconverted and is flagged.
const DENSITY_G_PER_CUP = {
  paneer: 226, cheese: 113, butter: 227, ghee: 216, oil: 218, milk: 244,
  cream: 238, yogurt: 245, curd: 245, water: 240,
  flour: 120, atta: 120, maida: 120, besan: 92, rice: 185, sugar: 200,
  jaggery: 200, salt: 273, cashew: 137, almond: 143, peanut: 146,
  onion: 160, tomato: 180, potato: 150, peas: 145, spinach: 30, coriander: 16,
  dal: 200, lentil: 192, chickpea: 200, rajma: 184,
};

function densityFor(name) {
  const n = name.toLowerCase();
  const hit = Object.keys(DENSITY_G_PER_CUP).find((k) => n.includes(k));
  return hit ? DENSITY_G_PER_CUP[hit] : null;
}

/** Recipe quantity -> grams. Returns {grams, basis} or {grams:null, basis:'unknown'} — never guesses. */
function toGrams(qty, unit, name) {
  if (qty == null) return { grams: null, basis: 'no_quantity' };
  if (!unit) return { grams: null, basis: 'count' };            // "2 onions" — a count, not a mass
  const u = unit.toLowerCase();
  if (MASS_G[u]) return { grams: qty * MASS_G[u], basis: 'mass' };
  if (VOLUME_ML[u]) {
    const d = densityFor(name);
    if (!d) return { grams: null, basis: 'unknown_density' };   // honest: we can't convert this
    return { grams: (qty * VOLUME_ML[u] / 240) * d, basis: 'volume_density' };
  }
  return { grams: null, basis: 'unknown_unit' };
}

/** Pack size string -> grams. "200 g" | "1 kg" | "1 L" | "50 pcs" */
function packToGrams(packWeight) {
  if (!packWeight) return null;
  const m = String(packWeight).match(/([\d.]+)\s*(kg|g|ml|l|ltr|litre|pcs|pc|n|u)\b/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const u = m[2].toLowerCase();
  if (u === 'kg') return n * 1000;
  if (u === 'g') return n;
  if (u === 'l' || u === 'ltr' || u === 'litre') return n * 1000;  // treat 1ml ~ 1g for liquids
  if (u === 'ml') return n;
  return null;                                                     // pcs/count — handled separately
}

/**
 * How many packs to buy, and why.
 * Returns { packs, needGrams, packGrams, leftoverGrams, basis, explain }
 */
function planPacks(needGrams, packWeight, basis) {
  const packGrams = packToGrams(packWeight);
  if (needGrams == null || packGrams == null) {
    return {
      packs: 1, needGrams, packGrams, leftoverGrams: null, basis,
      explain: `1 pack (${packWeight || 'size unknown'}) — couldn't compute exact need`,
      exact: false,
    };
  }
  const packs = Math.max(1, Math.ceil(needGrams / packGrams));
  const leftover = packs * packGrams - needGrams;
  const r = (n) => (n >= 1000 ? `${(n / 1000).toFixed(2)} kg` : `${Math.round(n)} g`);
  return {
    packs, needGrams, packGrams, leftoverGrams: leftover, basis, exact: true,
    explain: packs === 1 && leftover > 0
      ? `needs ${r(needGrams)}, smallest pack is ${packWeight} → ${r(leftover)} left over`
      : `needs ${r(needGrams)} → ${packs} × ${packWeight}`,
  };
}

export { toGrams, packToGrams, planPacks, densityFor };
