import { searchBibliography, candidateToCsl } from '../../src/import/search.js';
const CASES = [
  { title:'地方創生を超えて', author:'小磯' },
  { title:'', author:'中沢新一' },
  { title:'コミュニティ', author:'バウマン' },
  { title:'Gender Trouble', author:'Butler' },
  { title:'存在しない架空の書名ZZZ', author:'' },
];
for (const q of CASES) {
  const r = await searchBibliography(q);
  console.log(`\n【title="${q.title}" author="${q.author}"】`);
  if (!r.ok) { console.log('  NG:', r.error); continue; }
  if (!r.candidates.length) { console.log('  候補なし'); continue; }
  r.candidates.slice(0,4).forEach((c,i)=>{
    console.log(`  ${i+1}. [${c.kind}] ${c.title?.slice(0,40)}`);
    console.log(`     ${c.authors.slice(0,3).join(' / ') || '著者—'} | ${c.publisher ?? '出版社—'} | ${c.year ?? '年—'} | ${c.source}`);
  });
  const csl = candidateToCsl(r.candidates[0]);
  console.log('  → 先頭を CSL 化:', JSON.stringify(csl?.csl).slice(0,150));
}
