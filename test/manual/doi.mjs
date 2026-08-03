import { extractDoi, crossrefToCsl, fetchByDoi } from '../src/import/crossref.js';

console.log('=== DOI 抽出（貼り付け形式のゆらぎ）===');
for (const s of [
  '10.1086/227049',
  'https://doi.org/10.1086/227049',
  'doi:10.1086/227049',
  'DOI: 10.1038/nature12373 ',
  '本文中に 10.1086/227049。',
  'https://dx.doi.org/10.7129/jject.10.169',
  'ただの文字列',
]) {
  console.log(`  ${JSON.stringify(s).padEnd(40)} -> ${extractDoi(s)}`);
}

console.log('\n=== 実 DOI 取得 ===');
const CASES = [
  ['10.1086/227049',       '欧文・社会学の古典'],
  ['10.1038/nature12373',  '欧文・自然科学'],
  ['10.7129/jject.10.169', '和文・title が空のケース'],
  ['10.9999/nonexistent',  '存在しない DOI'],
];
for (const [doi, note] of CASES) {
  const r = await fetchByDoi(doi);
  console.log(`\n[${doi}] ${note}`);
  if (!r.ok) { console.log('  NG:', r.error); continue; }
  const it = r.item;
  console.log('  type      :', it.type);
  console.log('  title     :', it.title ?? '(なし)');
  console.log('  author    :', it.author ? it.author.map(a=>`${a.family??''}${a.given??''}${a.literal??''}`).join(' / ') : '(なし)');
  console.log('  container :', it['container-title'] ?? '(なし)');
  console.log('  issued    :', JSON.stringify(it.issued));
  console.log('  vol/iss/pg:', it.volume, '/', it.issue, '/', it.page);
  console.log('  language  :', it.language);
}
