import { duplicateKey } from '../../src/db/schema.js';
const mk = (t,f,y) => ({ title:t, author:[{family:f,given:'x'}], issued:{'date-parts':[[y]]} });
const cases = [
  ['同一書（副題あり/なし）', mk('地方創生を超えて : これからの地域政策','小磯',2018), mk('地方創生を超えて','小磯',2018)],
  ['同一書（区切り違い）',   mk('コミュニティ：安全と自由の戦場','Bauman',2017), mk('コミュニティ : 安全と自由の戦場','Bauman',2017)],
  ['別の年（改訂版）',       mk('社会学入門','田中',2018), mk('社会学入門','田中',2020)],
  ['別の著者',               mk('社会学入門','田中',2020), mk('社会学入門','佐藤',2020)],
  ['別の本',                 mk('社会学入門','田中',2020), mk('社会調査法','田中',2020)],
];
for (const [note,a,b] of cases) {
  const ka=duplicateKey(a), kb=duplicateKey(b);
  console.log(`  ${(ka===kb?'同一':'別物').padEnd(4)} ${note}`);
}
console.log('  年なしは対象外:', duplicateKey({title:'X',author:[{family:'A'}]}) === null);
