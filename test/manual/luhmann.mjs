import { parseCreatorRoles, ndlToCsl } from '../../src/import/isbn.js';
console.log('=== 責任表示の解析（修正後）===');
for (const s of [
  'ニクラス・ルーマン 著,大庭健, 正村俊之 訳',
  'ジグムント・バウマン 著,奥井智之 訳',
  '小磯修二, 村上裕一, 山崎幹根 著',
  '田中健一 編',
]) {
  const r = parseCreatorRoles(s);
  console.log(`  "${s}"`);
  console.log(`     著:${JSON.stringify(r.authors)} 訳:${JSON.stringify(r.translators)} 編:${JSON.stringify(r.editors)}`);
}
console.log('\n=== 実データでの変換 ===');
const xml = await (await fetch('https://ndlsearch.ndl.go.jp/api/opensearch?title=' +
  encodeURIComponent('信頼 社会的な複雑性の縮減メカニズム') + '&cnt=1')).text();
const r = ndlToCsl(xml.match(/<item>[\s\S]*?<\/item>/)[0], '');
console.log('  author    :', JSON.stringify(r.csl.author));
console.log('  translator:', JSON.stringify(r.csl.translator));
