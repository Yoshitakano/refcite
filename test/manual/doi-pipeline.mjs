import { readFileSync } from 'fs';
import { CitationEngine, htmlToPlain, normalizeAll, sortReferences,
         validateItem, PRESET_STYLES } from '../src/citation/index.js';
import { fetchByDoi } from '../src/import/crossref.js';
const base = new URL('../src/citation/', import.meta.url);
const read = (p) => readFileSync(new URL(p, base), 'utf8');
const eng = new CitationEngine({
  styles:{ apu:read('styles/apu.csl'), apa:read('styles/apa.csl'), sist02:read('styles/sist02.csl') },
  locales:{'ja-JP':read('locales/locales-ja-JP.xml'),'en-US':read('locales/locales-en-US.xml')}});

const DOIS = [
  'https://doi.org/10.1086/227049',
  '10.1038/nature12373',
  '10.7129/jject.10.169',
];

const items = [];
for (const d of DOIS) {
  const r = await fetchByDoi(d);
  if (!r.ok) { console.log('取得失敗:', d, r.error); continue; }
  items.push(r.item);
  const issues = validateItem(r.item);
  if (issues.length) {
    console.log(`⚠ [${r.item.id}] ${r.item.title?.slice(0,32)}`);
    issues.forEach(i => console.log(`    [${i.level}] ${i.field}: ${i.message}`));
  }
}
console.log();
const norm = normalizeAll(sortReferences(items.map(csl=>({id:csl.id,csl}))).map(r=>r.csl));
for (const s of PRESET_STYLES) {
  console.log('── ' + s.label);
  eng.renderBibliography(norm, s.id, { preserveOrder:true }).entries
     .forEach(e => console.log('   ' + htmlToPlain(e)));
  console.log();
}
