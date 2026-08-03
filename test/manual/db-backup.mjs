import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { createDb } from '../src/db/schema.js';
import { Repository } from '../src/db/repository.js';
import { importByIdentifier } from '../src/import/index.js';

const mk = (n) => new Repository(createDb('bk-'+n+'-'+Date.now(), { indexedDB, IDBKeyRange }));

// 端末A: データ作成
const A = mk('a');
const p = await A.saveProject({ name:'卒業論文_第2章', styleId:'apu' });
for (const id of ['9784000238953','9784480098252','10.1086/227049']) {
  const r = await importByIdentifier(id);
  if (r.ok) {
    const s = await A.saveReference(r.reference);
    await A.assignToProject('reference', s.id, p.id);
    await A.saveNote({ referenceId:s.id, type:'direct',
      body:`${s.csl.title?.slice(0,12)}に関する抜き書き`, locator:{page:'10'} });
  }
}
const dump = await A.exportJson();
console.log('=== 端末A ===');
console.log('  文献:', dump.references.length, '/ ノート:', dump.notes.length,
            '/ プロジェクト:', dump.projects.length);
const json = JSON.stringify(dump);
console.log('  JSONサイズ:', (json.length/1024).toFixed(1), 'KB');

// 端末B: 取り込み
const B = mk('b');
const res = await B.importJson(JSON.parse(json));
console.log('\n=== 端末B（取り込み後）===');
console.log('  取り込み:', JSON.stringify(res));
console.log('  文献一覧:', (await B.listReferences()).length, '件');
console.log('  プロジェクト:', (await B.listProjects()).map(x=>x.name).join(', '));

console.log('\n=== 取り込み先で検索が動くか（索引の再構築確認）===');
for (const q of ['地方創生','コミュニティ','抜き書き']) {
  const r = await B.search(q);
  console.log(`  "${q}" -> 文献 ${r.references.length} / ノート ${r.notes.length}`);
}

console.log('\n=== 不正なファイルの拒否 ===');
try { await B.importJson({ format:'something-else' }); }
catch (e) { console.log('  ', e.message); }

console.log('\n=== replace モード ===');
const before = (await B.listReferences()).length;
await B.importJson({ format:'refcite-backup', version:1, references:[], notes:[], projects:[], settings:[] }, { mode:'replace' });
console.log(`  ${before} 件 -> ${(await B.listReferences()).length} 件`);
