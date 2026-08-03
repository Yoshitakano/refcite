import { sortReferences, findMissingReadings, sortKeyOf } from '../src/citation/sort.js';

// 漢字コード順と50音順が食い違う例
const mk = (id, family, given, reading) => ({
  id, csl: { id, type:'book', title:id, language:'ja',
             author:[{family,given}], issued:{'date-parts':[[2020]]}, publisher:'X' },
  transcription: reading ? { authors:[reading] } : undefined,
});
const refs = [
  mk('r1','山崎','幹根','ヤマザキ, ミキネ'),
  mk('r2','阿部','太郎','アベ, タロウ'),
  mk('r3','小磯','修二','コイソ, シュウジ'),
  mk('r4','井上','一郎','イノウエ, イチロウ'),
  { id:'e1', csl:{ id:'e1', type:'book', title:'Zebra', language:'en',
      author:[{family:'Zimmer',given:'A'}], issued:{'date-parts':[[2020]]}, publisher:'Y'} },
  { id:'e2', csl:{ id:'e2', type:'book', title:'Apple', language:'en',
      author:[{family:'Adams',given:'B'}], issued:{'date-parts':[[2020]]}, publisher:'Y'} },
];

console.log('=== 漢字コード順（誤った並び）===');
[...refs].filter(r=>r.transcription).sort((a,b)=>
  a.csl.author[0].family.localeCompare(b.csl.author[0].family,'ja')
).forEach(r=>console.log('  '+r.csl.author[0].family));

console.log('\n=== 読み仮名による50音順（正しい並び）===');
sortReferences(refs).forEach(r=>{
  const a=r.csl.author[0];
  console.log(`  ${a.family||a.literal}${a.given?a.given:''}  [key=${sortKeyOf(r).key}]`);
});

console.log('\n=== 読み仮名を欠く和文文献の検出 ===');
const noRead = [...refs, mk('r9','鈴木','花子',null)];
console.log('  検出:', findMissingReadings(noRead).map(r=>r.csl.author[0].family));
