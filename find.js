#!/usr/bin/env node
// node find.js "paneer" --have onion,tomato,oil,salt --pages 15 --want 5
import { exploreDishes } from './src/explore.js';
const argv=process.argv.slice(2);
const flag=(n,d)=>{const i=argv.indexOf(`--${n}`);return i>=0?argv[i+1]:d;};
const craving=argv.find(a=>!a.startsWith('--')&&!['onion,tomato,oil,salt'].includes(a))||'paneer';
const pantry=flag('have','oil,salt').split(',').map(s=>s.trim()).filter(Boolean);
const pages=parseInt(flag('pages','15'),10), want=parseInt(flag('want','5'),10);
const C={d:'\x1b[2m',b:'\x1b[1m',g:'\x1b[32m',y:'\x1b[33m',c:'\x1b[36m',x:'\x1b[0m'};
const t0=Date.now();
const log=(t,m)=>console.log(`${C.d}${((Date.now()-t0)/1000).toFixed(1).padStart(5)}s${C.x} ${C.c}▸${C.x} ${m}`);
(async()=>{
 console.log(`\n${C.b}🔍 What can I cook with ${craving}?${C.x}\n${C.d}you have: ${pantry.join(', ')}${C.x}\n`);
 const dishes=await exploreDishes(craving,pantry,log,{pages,want});
 console.log(`\n${C.b}${dishes.length} DISHES WORTH COOKING${C.x}\n`);
 dishes.forEach((d,i)=>{
   const pct=Math.round(d.coverage*100);
   console.log(`${C.b}${i+1}. ${d.title}${C.x}`);
   console.log(`   ${C.g}you have ${d.haveCount}/${d.totalIngredients} (${pct}%)${C.x} · need ${d.needCount} more`);
   console.log(`   ${C.d}${d.minutes?d.minutes+' min · ':''}${d.rating?`★ ${d.rating} (${d.votes||0})· `:''}${d.cuisine||''} · ${d.host}${C.x}`);
   if(d.image) console.log(`   ${C.d}📷 ${d.image.slice(0,78)}${C.x}`);
   if(d.description) console.log(`   ${C.d}${d.description.slice(0,96)}${C.x}`);
   console.log('');
 });
 console.log(`${C.d}${((Date.now()-t0)/1000).toFixed(1)}s${C.x}\n`);
})();
