import { importByIdentifier, detectIdentifier } from '../src/import/index.js';
import { normalizeIsbn, isJapaneseIsbn, parseNdlName,
         parseCreatorRoles, splitWesternName } from '../src/import/isbn.js';

console.log('=== 識別子の自動判別 ===');
for (const s of ['10.1086/227049','978-4-00-023895-3','9780140449136',
                 'https://doi.org/10.1038/nature12373','ただの文字列']) {
  console.log(`  ${s.padEnd(38)} -> ${detectIdentifier(s)}`);
}

console.log('\n=== 和洋判定 ===');
for (const s of ['9784000238953','9780140449136','4000238953','9794000000000']) {
  console.log(`  ${s.padEnd(16)} 和書:${isJapaneseIsbn(s)}`);
}

console.log('\n=== 生没年の除去・姓名分割 ===');
['小磯, 修二','村上, 裕一, 1981-','Bauman, Zygmunt, 1925-2017','総務省統計局']
  .forEach(s => console.log(`  ${s.padEnd(30)} -> ${JSON.stringify(parseNdlName(s))}`));

console.log('\n=== 役割解析 ===');
console.log(' ', JSON.stringify(parseCreatorRoles(
  'Bauman, Zygmunt, 1925-2017,奥井, 智之, 1958-,ジグムント・バウマン 著,奥井智之 訳')));

console.log('\n=== 実データ取込 ===');
const CASES = [
  ['978-4-00-023895-3','和書・3名共著（ハイフン付き）'],
  ['9784480098252','和書・訳書'],
  ['9780140449136','洋書'],
  ['9784999999999','存在しないISBN'],
];
for (const [isbn, note] of CASES) {
  const r = await importByIdentifier(isbn);
  console.log(`\n[${isbn}] ${note}`);
  if (!r.ok) { console.log('  NG:', r.error); continue; }
  const c = r.reference.csl;
  const nm = (a) => a ? a.map(x=>x.family?`${x.family} ${x.given??''}`.trim():x.literal).join(' / ') : '(なし)';
  console.log('  source   :', r.reference.source.fetchedFrom);
  console.log('  title    :', c.title);
  console.log('  author   :', nm(c.author));
  console.log('  translator:', nm(c.translator));
  console.log('  publisher:', c.publisher ?? '(なし)', '| issued:', JSON.stringify(c.issued));
  console.log('  読み仮名 :', r.reference.transcription?.authors?.join(' / ') ?? '(なし/破棄)');
  if (r.issues.length) r.issues.forEach(i=>console.log(`  [${i.level}] ${i.field}: ${i.message}`));
}
