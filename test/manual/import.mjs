import { readFileSync } from 'fs';
import { importByIdentifier, detectIdentifier } from '../src/import/index.js';
import { CitationEngine, htmlToPlain, sortReferences, normalizeAll } from '../src/citation/index.js';
const base = new URL('../src/citation/', import.meta.url);
const read = (p) => readFileSync(new URL(p, base), 'utf8');
const eng = new CitationEngine({ styles:{apu:read('styles/apu.csl')},
  locales:{'ja-JP':read('locales/locales-ja-JP.xml'),'en-US':read('locales/locales-en-US.xml')}});

console.log('=== 識別子の自動判別 ===');
for (const s of ['10.1086/227049','https://doi.org/10.1038/nature12373',
                 '978-4-00-023895-3','9780140449136','こんにちは']) {
  console.log(`  ${s.padEnd(38)} -> ${detectIdentifier(s) ?? '判別不能'}`);
}

console.log('\n=== 混在入力を一括取込 ===');
const inputs = ['10.1086/227049','978-4-00-023895-3','9780140449136',
                '10.7129/jject.10.169','9784480098252'];
const refs = [];
for (const inp of inputs) {
  const r = await importByIdentifier(inp);
  if (!r.ok) { console.log(`  [${inp}] NG: ${r.error}`); continue; }
  refs.push(r.reference);
  const warn = r.issues.length ? `  ⚠ ${r.issues.map(i=>i.field).join(',')}` : '';
  console.log(`  [${inp}] via ${r.reference.source.fetchedFrom}${warn}`);
}

console.log('\n=== 引用文献一覧（APU・50音順→アルファベット順）===');
const sorted = sortReferences(refs);
const items = normalizeAll(sorted.map(r=>r.csl));
eng.renderBibliography(items,'apu',{preserveOrder:true}).entries
   .forEach((e,i)=>console.log(`  ${i+1}. ${htmlToPlain(e)}`));

console.log('\n=== 要確認の文献（必須項目の欠落）===');
refs.forEach(r=>{
  const bad = (r.issues ?? []);
});
for (const inp of inputs) {
  const r = await importByIdentifier(inp);
  if (r.ok && r.issues.length)
    console.log(`  ${r.reference.csl.title?.slice(0,32)} → ${r.issues.map(i=>i.message).join(' / ')}`);
}
