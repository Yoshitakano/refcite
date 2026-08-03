import { readFileSync } from 'fs';
import { CitationEngine } from '../src/citation/index.js';
import { normalizeAll } from '../src/citation/normalize.js';
const base = new URL('../src/citation/', import.meta.url);
const read = (p) => readFileSync(new URL(p, base), 'utf8');
const eng = new CitationEngine({ styles:{apu:read('styles/apu.csl')},
  locales:{'ja-JP':read('locales/locales-ja-JP.xml'),'en-US':read('locales/locales-en-US.xml')}});

// 書名にスクリプトが入った書誌（悪意ある登録者・API汚染を想定）
const evil = {
  id:'x', type:'book', language:'ja',
  title:'社会学入門<img src=x onerror="alert(1)">',
  author:[{family:'田中',given:'太郎'}],
  issued:{'date-parts':[[2020]]}, publisher:'岩波書店',
};
const out = eng.renderOne(normalizeAll([evil])[0], 'apu');
console.log('citeproc の出力:');
console.log('  ', out);
console.log('');
console.log('onerror がそのまま残っているか:', /onerror/.test(out) ? 'はい（危険）' : 'いいえ（エスケープ済み）');
console.log('<img が生タグで残っているか :', /<img/.test(out) ? 'はい（危険）' : 'いいえ');
