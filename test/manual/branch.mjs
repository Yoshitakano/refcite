import { readFileSync } from 'fs';
import { CitationEngine, htmlToPlain } from '../src/citation/index.js';
const base = new URL('../src/citation/', import.meta.url);
const read = (p) => readFileSync(new URL(p, base), 'utf8');
const eng = new CitationEngine({ styles:{apu:read('styles/apu.csl')},
  locales:{'ja-JP':read('locales/locales-ja-JP.xml'),'en-US':read('locales/locales-en-US.xml')}});

const mk = (extra) => ({ id:'t', type:'article-journal', annote:'ja', language:'ja',
  title:'テスト論文', 'container-title':'テスト誌', volume:'10', page:'1-9',
  issued:{'date-parts':[[1997]]}, ...extra });

console.log('著者あり  :', htmlToPlain(eng.renderOne(mk({author:[{family:'小内',given:'透'}]}),'apu')));
console.log('著者なし  :', htmlToPlain(eng.renderOne(mk({}),'apu')));
console.log('著者空配列:', htmlToPlain(eng.renderOne(mk({author:[]}),'apu')));
