import { readFileSync } from 'fs';
import { CitationEngine, normalizeAll, sortReferences,
         toRichHtml, toPlainText } from '../src/citation/index.js';
import * as F from '../src/citation/fixtures.js';
const base = new URL('../src/citation/', import.meta.url);
const read = (p) => readFileSync(new URL(p, base), 'utf8');
const eng = new CitationEngine({
  styles:{ apu:read('styles/apu.csl') },
  locales:{'ja-JP':read('locales/locales-ja-JP.xml'),'en-US':read('locales/locales-en-US.xml')}});

const refs = [F.JP_BOOK_3, F.JP_ARTICLE, F.EN_ARTICLE, F.JP_BOOK_1]
  .map(csl => ({ id: csl.id, csl,
    transcription: csl.id==='jp-book-3' ? {authors:['コイソ, シュウジ']}
                 : csl.id==='jp-article' ? {authors:['ヤマダ, ハナコ']}
                 : csl.id==='jp-book-1'  ? {authors:['タナカ, タロウ']} : undefined }));
const sorted = sortReferences(refs);
const items = normalizeAll(sorted.map(r=>r.csl));
const { entries } = eng.renderBibliography(items, 'apu', { preserveOrder: true });

console.log('=== プレーンテキスト（.txt 書き出し）===');
console.log(toPlainText(entries, { heading:'引用文献' }));
console.log('\n=== リッチテキスト HTML（Word 貼付用）===');
console.log(toRichHtml(entries, { heading:'引用文献' }));
