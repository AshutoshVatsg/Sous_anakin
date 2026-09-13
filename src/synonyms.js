// Recipe language -> Indian retail search terms.
// Recipe sites write Western names; BigBasket stocks Indian ones. This bridges them.

const SYNONYMS = {
  'half-and-half': 'fresh cream', 'half and half': 'fresh cream',
  'heavy cream': 'fresh cream', 'whipping cream': 'fresh cream',
  'ground red chiles': 'red chilli powder', 'red chile powder': 'red chilli powder',
  'cayenne': 'red chilli powder', 'chili powder': 'red chilli powder',
  'ground cumin': 'cumin powder', 'cumin seed': 'jeera',
  'ground coriander': 'coriander powder', 'cilantro': 'coriander leaves',
  'ground turmeric': 'turmeric powder', 'turmeric': 'turmeric powder',
  'clarified butter': 'ghee', 'all-purpose flour': 'maida',
  'whole wheat flour': 'atta', 'gram flour': 'besan',
  'white sugar': 'sugar', 'granulated sugar': 'sugar',
  'green chiles': 'green chilli', 'green chilies': 'green chilli',
  'garbanzo beans': 'chickpeas', 'kidney beans': 'rajma',
  'yogurt': 'curd', 'plain yogurt': 'curd',
  'scallion': 'spring onion', 'eggplant': 'brinjal',
  'bell pepper': 'capsicum', 'green pepper': 'capsicum', 'red pepper': 'capsicum',
  'yellow pepper': 'capsicum', 'green bell pepper': 'capsicum',
  'kosher salt': 'salt', 'sea salt': 'salt',
  'okra': 'bhindi', 'bottle gourd': 'lauki',
  'peanut oil': 'groundnut oil', 'vegetable oil': 'sunflower oil',
  'tomato sauce': 'tomato puree', 'tomato paste': 'tomato puree',
  'light cream': 'fresh cream',
  'green chili': 'green chilli',
  'green chilli': 'green chilli',
  'tej patta': 'bay leaf',
  'kashmiri chilli powder': 'kashmiri red chilli powder',
  'dry fenugreek leaves': 'kasuri methi',
  'fenugreek leaves': 'kasuri methi',
  'coriander leaves': 'coriander', 'cilantro leaves': 'coriander',
  'garlic cloves': 'garlic',
  'garlic clove': 'garlic',
  'ginger garlic paste': 'ginger garlic paste',
  'cottage cheese': 'paneer',
  'spinach': 'palak', 'spinach leaves': 'palak', 'baby spinach': 'palak',
  'coriander powder': 'dhania powder', 'curry leaves': 'curry leaves',
  'cumin seeds': 'jeera', 'mustard seeds': 'rai',
};

// Prose words that aren't part of a product name.
const NOISE = new RegExp([
  'fresh', 'finely', 'coarsely', 'chopped', 'minced', 'grated', 'crushed',
  'whole', 'large', 'small', 'medium', 'ripe', 'peeled', 'seeded', 'deseeded',
  'diced', 'sliced', 'cubed', 'julienned', 'shredded', 'softened', 'melted',
  'warm', 'cold', 'hot', 'room temperature', 'to taste', 'optional',
  'or more', 'as needed', 'divided', 'packed', 'lightly', 'firmly',
  'cut into', 'inch', 'pieces', 'cubes', 'thinly', 'roughly', 'for garnish',
  'plus more', 'if needed', 'beaten', 'boiled', 'cooked', 'raw', 'dried',
].map((w) => `\\b${w}\\b`).join('|'), 'gi');

/** Ingredient name -> best retail search term. */
function searchTerm(name) {
  let n = String(name).toLowerCase().trim();
  n = n.replace(/\(.*?\)/g, ' ').replace(/,.*$/, ' ');           // drop parentheticals & post-comma prose

  for (const [from, to] of Object.entries(SYNONYMS)) {           // longest match first
    if (n.includes(from)) return to;
  }
  n = n.replace(/\b(medium|large|small)[-\s]?sized\b/g, ' ')   // "medium-sized" as one unit
       .replace(NOISE, ' ')
       .replace(/[^a-z\s-]/g, ' ')
       .replace(/(^|\s)-+|-+(\s|$)/g, ' ')                      // strip orphaned hyphens
       .replace(/\s+/g, ' ').trim();
  for (const [from, to] of Object.entries(SYNONYMS)) {           // retry after cleaning
    if (n === from || n.includes(from)) return to;
  }
  return n || String(name).toLowerCase();
}

export { searchTerm, SYNONYMS };
