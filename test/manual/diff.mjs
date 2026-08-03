import { readFileSync } from 'fs';
import { CitationEngine, htmlToPlain } from '../src/citation/engine.js';
import { normalizeAll } from '../src/citation/normalize.js';
import * as F from '../src/citation/fixtures.js';
const base = new URL('../src/citation/', import.meta.url);
const read = (p) => readFileSync(new URL(p, base), 'utf8');
const eng = new CitationEngine({ styles:{apu:read('styles/apu.csl')},
  locales:{'ja-JP':read('locales/locales-ja-JP.xml'),'en-US':read('locales/locales-en-US.xml')}});
const it = normalizeAll(F.ALL).find(i=>i.id==='jp-book-3');
const got = htmlToPlain(eng.renderOne(it,'apu'));
const exp = '小磯修二・村上裕一・山崎幹根（2018）『地方創生を超えて : これからの地域政策』岩波書店.';
console.log('len got/exp:', got.length, exp.length);
for (let i=0;i<Math.max(got.length,exp.length);i++){
  if(got[i]!==exp[i]){
    console.log(`差分 index ${i}`);
    console.log('  got:', JSON.stringify(got.slice(Math.max(0,i-8),i+8)), 'U+'+(got.charCodeAt(i)||0).toString(16));
    console.log('  exp:', JSON.stringify(exp.slice(Math.max(0,i-8),i+8)), 'U+'+(exp.charCodeAt(i)||0).toString(16));
    break;
  }
}
