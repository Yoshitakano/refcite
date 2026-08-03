import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { createDb } from '../../src/db/schema.js';
import { Repository } from '../../src/db/repository.js';

const repo = new Repository(createDb('perf-'+Date.now(), { indexedDB, IDBKeyRange }));
const WORDS = ['社会','地域','政策','共同体','近代','資本','労働','文化','権力','言説',
               '構造','主体','歴史','経済','都市','移民','家族','教育','医療','環境'];
const rnd = (a) => a[Math.floor(Math.random()*a.length)];

for (const N of [100, 500, 2000]) {
  const r2 = new Repository(createDb('p'+N+'-'+Date.now(), { indexedDB, IDBKeyRange }));
  const t0 = Date.now();
  for (let i=0;i<N;i++) {
    const ref = await r2.saveReference({
      id:`r${i}`,
      csl:{ id:`r${i}`, type:'book', language:'ja',
        title:`${rnd(WORDS)}と${rnd(WORDS)}の${rnd(WORDS)}論 第${i}巻`,
        author:[{family:rnd(['田中','佐藤','鈴木','高橋']),given:'太郎'}],
        issued:{'date-parts':[[2000+(i%25)]]}, publisher:rnd(['岩波書店','有斐閣','講談社']) },
      source:{ kind:'manual', identifier:`id-${i}` },
    });
    if (i % 3 === 0) {
      await r2.saveNote({ referenceId:ref.id, type:'direct',
        body:`${rnd(WORDS)}における${rnd(WORDS)}の変容について論じた箇所である`,
        comment:`${rnd(WORDS)}の観点から再検討したい`, locator:{page:String(i)} });
    }
  }
  const tWrite = Date.now()-t0;
  const t1 = Date.now();
  const res = await r2.search('社会');
  const tSearch = Date.now()-t1;
  const t2 = Date.now();
  await r2.listReferences();
  const tList = Date.now()-t2;
  console.log(`  ${String(N).padStart(4)}件: 登録 ${String(tWrite).padStart(5)}ms / 検索 ${String(tSearch).padStart(4)}ms (${res.references.length}+${res.notes.length}件) / 一覧 ${tList}ms`);
}
