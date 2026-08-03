import { readFileSync } from 'fs';
import { CitationEngine, htmlToPlain } from '../src/citation/engine.js';
import { normalizeAll } from '../src/citation/normalize.js';
import * as F from '../src/citation/fixtures.js';
const base = new URL('../src/citation/', import.meta.url);
const read = (p) => readFileSync(new URL(p, base), 'utf8');
const eng = new CitationEngine({ styles:{apu:read('styles/apu.csl')},
  locales:{'ja-JP':read('locales/locales-ja-JP.xml'),'en-US':read('locales/locales-en-US.xml')}});

console.log('=== 章・ウェブ ===');
for (const it of normalizeAll([F.JP_CHAPTER, F.JP_WEB])) {
  console.log(` [${it.id}] ${htmlToPlain(eng.renderOne(it,'apu'))}`);
}
console.log('\n=== 同一著者の横棒（bibliography 一括生成）===');
const { entries } = eng.renderBibliography(normalizeAll([F.JP_SAME_A, F.JP_SAME_B]), 'apu');
entries.forEach(e => console.log('  ' + htmlToPlain(e)));

console.log('\n=== 並び順（和文50音 + 欧文混在）===');
const mixed = normalizeAll([F.JP_BOOK_5, F.JP_BOOK_1, F.EN_BOOK, F.JP_BOOK_3, F.EN_ARTICLE]);
const r = eng.renderBibliography(mixed, 'apu');
r.entries.forEach((e,i) => console.log(`  ${i+1}. ${htmlToPlain(e).slice(0,52)}`));
