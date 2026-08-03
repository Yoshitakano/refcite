import { readFileSync } from 'fs';
import { CitationEngine, htmlToPlain, normalizeAll, sortReferences,
         findMissingReadings, PRESET_STYLES } from '../src/citation/index.js';
import { importByIdentifier } from '../src/import/index.js';
const base = new URL('../src/citation/', import.meta.url);
const read = (p) => readFileSync(new URL(p, base), 'utf8');
const eng = new CitationEngine({
  styles:{ apu:read('styles/apu.csl'), apa:read('styles/apa.csl'), sist02:read('styles/sist02.csl') },
  locales:{'ja-JP':read('locales/locales-ja-JP.xml'),'en-US':read('locales/locales-en-US.xml')}});

const IDS = ['9784000238953','9784480098252','9784006003685','9780140449136','10.1086/227049'];
const refs = [];
for (const id of IDS) {
  const r = await importByIdentifier(id);
  if (r.ok) refs.push(r.reference);
  else console.log('取得失敗:', id, r.error);
}

const missing = findMissingReadings(refs);
if (missing.length) {
  console.log('⚠ 読み仮名が無く50音順が保証できない和文文献:');
  missing.forEach(r=>console.log('   -', r.csl.title?.slice(0,40)));
  console.log();
}

const sorted = sortReferences(refs);
const items = normalizeAll(sorted.map(r=>r.csl));
for (const s of PRESET_STYLES) {
  console.log('── ' + s.label);
  eng.renderBibliography(items, s.id, { preserveOrder:true }).entries
     .forEach(e=>console.log('   ' + htmlToPlain(e)));
  console.log();
}
