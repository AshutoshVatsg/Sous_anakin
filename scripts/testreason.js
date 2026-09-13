import { planShopping, thinking } from '../src/reason.js';
const recipe = {
  title: 'Paneer Butter Masala', serves: 4,
  ingredients: [
    {raw:'200 grams paneer', name:'paneer', term:'paneer'},
    {raw:'2 tablespoons butter', name:'butter', term:'butter'},
    {raw:'1 teaspoon cumin seeds', name:'cumin seeds', term:'jeera'},
    {raw:'1 teaspoon coriander powder', name:'coriander powder', term:'coriander'},
    {raw:'2 green cardamom', name:'cardamom', term:'cardamom'},
    {raw:'1 inch cinnamon', name:'cinnamon', term:'cinnamon'},
    {raw:'1 cup tomato puree', name:'tomato puree', term:'tomato puree'},
    {raw:'1 large onion, chopped', name:'onion', term:'onion'},
    {raw:'1 teaspoon ginger paste', name:'ginger paste', term:'ginger'},
    {raw:'1 teaspoon garlic paste', name:'garlic paste', term:'garlic'},
    {raw:'3 tablespoons fresh cream', name:'fresh cream', term:'fresh cream'},
    {raw:'1 teaspoon butter for garnish', name:'butter', term:'butter'},
    {raw:'salt to taste', name:'salt', term:'salt'},
    {raw:'1.5 cups water', name:'water', term:'water'},
  ],
};
const pantry = ['garam masala','onion','tomato','salt','oil','ginger garlic paste'];
console.log('reasoning active:', thinking(), '\n');
const p = await planShopping(recipe, pantry, 2, (t,m)=>console.log(`  [${t}] ${m}`));
console.log('\nALREADY HAVE:');
p.have.forEach(h=>console.log('  ✓', (h.name||h.item||'').padEnd(22), h.reason||h.matchedPantry||''));
console.log('\nBUY:');
p.buy.forEach(b=>console.log('  •', (b.name||'').padEnd(22), String(b.term||'').padEnd(18), b.reason||''));
console.log('\nreasoned:', p.reasoned);
