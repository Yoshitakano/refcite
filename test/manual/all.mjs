import { readFileSync } from 'fs';
import { CitationEngine, htmlToPlain, normalizeAll, sortReferences,
         validateItem, PRESET_STYLES } from '../src/citation/index.js';
import * as F from '../src/citation/fixtures.js';
const base = new URL('../src/citation/', import.meta.url);
const read = (p) => readFileSync(new URL(p, base), 'utf8');
const eng = new CitationEngine({
  styles: { apu: read('styles/apu.csl'), apa: read('styles/apa.csl'),
            sist02: read('styles/sist02.csl') },
  locales: { 'ja-JP': read('locales/locales-ja-JP.xml'),
             'en-US': read('locales/locales-en-US.xml') },
});
const items = normalizeAll([F.JP_BOOK_3, F.JP_ARTICLE, F.EN_ARTICLE]);
for (const s of PRESET_STYLES) {
  console.log('─'.repeat(70));
  console.log(`  ${s.label}`);
  console.log('─'.repeat(70));
  eng.renderBibliography(items, s.id).entries
     .forEach(e => console.log('  ' + htmlToPlain(e)));
}
console.log('\n=== 警告UI（必須項目の欠落）===');
validateItem(F.INCOMPLETE).forEach(i =>
  console.log(`  [${i.level}] ${i.field}: ${i.message}`));
validateItem(F.JP_BOOK_1, { hasDirectQuote: true }).forEach(i =>
  console.log(`  [${i.level}] ${i.field}: ${i.message}`));

console.log('\n=== HTML出力（リッチテキスト貼付用・斜体保持の確認）===');
console.log('  ' + eng.renderOne(normalizeAll([F.EN_ARTICLE])[0], 'apu'));
