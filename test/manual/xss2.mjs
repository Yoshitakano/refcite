import { readFileSync } from 'fs';
import { CitationEngine } from '../src/citation/index.js';
import { normalizeAll } from '../src/citation/normalize.js';
import { toRichHtml } from '../src/citation/export.js';
const base = new URL('../src/citation/', import.meta.url);
const read = (p) => readFileSync(new URL(p, base), 'utf8');
const eng = new CitationEngine({ styles:{apu:read('styles/apu.csl')},
  locales:{'ja-JP':read('locales/locales-ja-JP.xml'),'en-US':read('locales/locales-en-US.xml')}});

const evil = {
  id:'x', type:'book', language:'ja',
  title:'社会学入門<img src=x onerror="alert(1)">',
  author:[{family:'田中',given:'太郎'}],
  issued:{'date-parts':[[2020]]}, publisher:'岩波書店',
};
const { entries } = eng.renderBibliography(normalizeAll([evil]), 'apu');
const rich = toRichHtml(entries);
console.log('toRichHtml（Word貼付・画面表示に使う）の出力:');
console.log(rich);
console.log('');
console.log('生の <img タグに戻っているか:', /<img/.test(rich) ? '★はい（XSS成立）' : 'いいえ');
