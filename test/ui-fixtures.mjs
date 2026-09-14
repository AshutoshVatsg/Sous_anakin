// UI test data only. These never ship in the app or call a grocery service.
export const dishes = [
  {
    title: "Paneer Butter Masala",
    host: "cookwithmanali.com",
    image: "/food/paneer.jpg",
    kind: "gravy",
    minutes: 40,
    rating: 4.9,
    haveCount: 6,
    needCount: 6,
    totalIngredients: 12,
    protein: 21,
  },
  {
    title: "Homestyle Palak Paneer",
    host: "indianhealthyrecipes.com",
    image: "/food/palak.jpg",
    kind: "gravy",
    minutes: 30,
    rating: 4.8,
    haveCount: 8,
    needCount: 4,
    totalIngredients: 12,
    light: "No cream or butter in this recipe.",
    protein: 19,
  },
  {
    title: "Paneer and Chickpea Curry",
    host: "thekitchn.com",
    image: "/food/chole.jpg",
    kind: "gravy",
    minutes: 35,
    rating: 4.7,
    haveCount: 7,
    needCount: 5,
    totalIngredients: 12,
    protein: 24,
  },
  {
    title: "Quick Paneer Bhurji with Fresh Coriander",
    host: "vegrecipesofindia.com",
    image: "/food/paneer.jpg",
    kind: "dry",
    minutes: 20,
    rating: null,
    haveCount: 9,
    needCount: 3,
    totalIngredients: 12,
    light: "No cream.",
    protein: null,
  },
  {
    title: "Paneer Tikka for a Quiet Evening",
    host: "hebbarskitchen.com",
    image: "/food/missing-photo.jpg",
    kind: "grilled",
    minutes: null,
    rating: null,
    haveCount: 0,
    needCount: 10,
    totalIngredients: 10,
    protein: null,
  },
].map((dish, index) => ({
  ...dish,
  url: `https://${dish.host}/recipe-${index}`,
  cuisine: "Indian",
  coverage: dish.haveCount / dish.totalIngredients,
  cost:
    index === 4
      ? null
      : {
          total: 366 + index * 35,
          meal: 181 + index * 18,
          keeps: 185 + index * 17,
          priced: 6,
          count: 6,
          unpriced: [],
          source: index === 1 ? "live" : "estimate",
        },
}));

export const plan = {
  recipe: {
    ...dishes[0],
    steps: [
      "Heat the oil in a heavy pan. Add cumin and cook until fragrant.",
      "Add the onion, ginger and garlic. Cook gently until the onion softens.",
      "Stir in tomato puree and ground spices. Cook until the oil starts to separate.",
      "Add paneer and a splash of water. Simmer gently, then finish with cream and coriander.",
    ],
  },
  have: [
    { name: "onion", reason: "You already have onion in your kitchen." },
    { name: "oil", reason: "The oil you have works for this recipe." },
    { name: "salt", reason: "A kitchen staple." },
    {
      name: "tomato",
      reason: "Your fresh tomatoes cover the chopped tomato in the sauce.",
    },
  ],
  buy: [
    {
      name: "paneer",
      term: "paneer",
      qty: "250 g",
      reason: "The main ingredient. There is no paneer in your current pantry.",
    },
    {
      name: "tomato puree",
      term: "tomato puree",
      qty: "¼ cup",
      reason:
        "Fresh tomato does not cover tomato puree in this recipe. The concentrated puree gives the sauce its body.",
    },
    {
      name: "garam masala",
      term: "garam masala",
      qty: "1 tsp",
      reason:
        "A warming spice blend for the sauce. The rest of the pack stays in your cupboard.",
    },
    {
      name: "fresh cream",
      term: "fresh cream",
      qty: "2 tbsp",
      reason:
        "Cream makes the sauce rich and smooth. Curd would give it a different flavour.",
    },
    {
      name: "cumin seeds",
      term: "cumin seeds",
      asWritten: "jeera",
      qty: "¼ tsp",
      reason:
        "Whole seeds are needed for tempering. Ground cumin is not the same thing here.",
    },
    {
      name: "coriander leaves",
      term: "coriander leaves",
      qty: "1 small bunch",
      optional: true,
      reason:
        "A fresh garnish. This is optional if you prefer to leave it out.",
    },
  ],
  cost: {
    total: 366,
    meal: 181,
    keeps: 185,
    priced: 5,
    count: 6,
    unpriced: ["coriander leaves"],
    source: "estimate",
  },
  reasoned: true,
  serves: 4,
  seconds: 5.7,
};
export const cart = {
  total: 352,
  address: "HSR Layout · 560102",
  items: [
    { name: "Amul Fresh Paneer", pack: "200 g", qty: 1, price: 95 },
    { name: "Dabur Hommade Tomato Puree", pack: "200 g", qty: 1, price: 30 },
    { name: "Aachi Garam Masala", pack: "50 g", qty: 2, price: 80 },
    { name: "Amul Fresh Cream", pack: "250 ml", qty: 1, price: 72 },
    { name: "Cumin Seeds", pack: "100 g", qty: 1, price: 75 },
  ],
};
