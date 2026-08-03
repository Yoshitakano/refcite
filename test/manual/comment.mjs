import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { createDb } from '../src/db/schema.js';
import { Repository } from '../src/db/repository.js';
import { importByIdentifier } from '../src/import/index.js';

const repo = new Repository(createDb('cm-'+Date.now(), { indexedDB, IDBKeyRange }));
const r = await importByIdentifier('9784000238953');
const ref = await repo.saveReference(r.reference);

console.log('=== 引用＋コメントを保存 ===');
const n = await repo.saveNote({
  referenceId: ref.id, type:'direct',
  body:'地方創生の議論は、地域政策の根本的な転換を迫るものである',
  comment:'この「転換」という語の含意が曖昧。第2章の論点に使えそう',
  locator:{ page:'45' },
});
console.log('  body   :', n.body.slice(0,24));
console.log('  comment:', n.comment.slice(0,24));

console.log('\n=== 検索（引用文側）===');
let s = await repo.search('根本的な転換');
console.log('  "根本的な転換" -> ノート', s.notes.length, '件');

console.log('\n=== 検索（コメント側）===');
for (const q of ['含意が曖昧','第2章の論点']) {
  s = await repo.search(q);
  console.log(`  "${q}" -> ノート ${s.notes.length} 件`);
}

console.log('\n=== 後からコメントを追加・編集 ===');
const n2 = await repo.saveNote({
  referenceId: ref.id, type:'direct', body:'コメントなしの引用', locator:{page:'88'},
});
console.log('  追加直後 comment:', n2.comment ?? '(なし)');
const updated = await repo.saveNote({ ...n2, comment:'あとから付けたコメント' });
console.log('  編集後 comment  :', updated.comment);
const all = await repo.listNotes(ref.id);
console.log('  ノート総数:', all.length, '/ コメント付き:', all.filter(x=>x.comment).length);

console.log('\n=== コメントの削除（空文字→undefined）===');
const cleared = await repo.saveNote({ ...updated, comment: undefined });
console.log('  削除後:', cleared.comment ?? '(なし)');
s = await repo.search('あとから付けた');
console.log('  削除後の検索ヒット:', s.notes.length, '件（0が正しい）');

console.log('\n=== バックアップ往復でコメントが残るか ===');
const dump = await repo.exportJson();
const repo2 = new Repository(createDb('cm2-'+Date.now(), { indexedDB, IDBKeyRange }));
await repo2.importJson(JSON.parse(JSON.stringify(dump)));
const s2 = await repo2.search('含意が曖昧');
console.log('  復元先での検索:', s2.notes.length, '件');
console.log('  復元先のコメント:', s2.notes[0]?.comment?.slice(0,20) ?? '(なし)');
