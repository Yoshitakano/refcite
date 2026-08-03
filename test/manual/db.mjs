import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { createDb, toBigrams } from '../src/db/schema.js';
import { Repository } from '../src/db/repository.js';
import { importByIdentifier } from '../src/import/index.js';

console.log('=== bigram 生成 ===');
for (const s of ['社会学','共同性の変容','A','地域']) {
  console.log(`  ${s.padEnd(10)} -> ${JSON.stringify(toBigrams(s))}`);
}

const db = createDb('test-' + Date.now(), { indexedDB, IDBKeyRange });
const repo = new Repository(db);

console.log('\n=== 文献の保存と取得 ===');
const r1 = await importByIdentifier('9784000238953');
const saved = await repo.saveReference(r1.reference);
console.log('  保存:', saved.csl.title.slice(0,30), '| id:', saved.id.slice(0,8));
console.log('  索引数:', saved.searchIndex.length);
const got = await repo.getReference(saved.id);
console.log('  再取得:', got?.csl.title.slice(0,30));

console.log('\n=== 重複検出 ===');
const dup = await repo.findByIdentifier('9784000238953');
console.log('  同一ISBNの既存レコード:', dup ? '検出' : '未検出');

console.log('\n=== ノート保存 ===');
const n1 = await repo.saveNote({ referenceId: saved.id, type:'direct',
  body:'地方創生は地域政策の転換を迫るものである', locator:{page:'45'} });
const n2 = await repo.saveNote({ referenceId: saved.id, type:'indirect',
  body:'この議論は共同性の変容という論点に接続できる' });
console.log('  ノート2件保存 / 一覧:', (await repo.listNotes(saved.id)).length, '件');

console.log('\n=== 横断検索 ===');
for (const q of ['地方創生','共同性','岩波','存在しない語']) {
  const r = await repo.search(q);
  console.log(`  "${q}" -> 文献 ${r.references.length} / ノート ${r.notes.length}`);
}

console.log('\n=== 誤ヒット検証（bigramだけでは引っかかる語）===');
const r = await repo.search('性同共');
console.log('  "性同共"（語順違い） -> ノート', r.notes.length, '件（0が正しい）');

console.log('\n=== プロジェクト振り分け ===');
const p = await repo.saveProject({ name:'2026年前期_社会学レポート', styleId:'apu' });
await repo.assignToProject('reference', saved.id, p.id);
console.log('  振り分け後:', (await repo.listProjectReferences(p.id)).length, '件');
const inProj = await repo.search('地方創生', { projectId: p.id });
console.log('  プロジェクト絞り込み検索:', inProj.references.length, '件');

console.log('\n=== 論理削除 ===');
await repo.deleteReference(saved.id);
console.log('  削除後 getReference:', await repo.getReference(saved.id) ?? '(undefined)');
console.log('  削除後 検索ヒット:', (await repo.search('地方創生')).references.length, '件');
console.log('  紐づくノートも削除:', (await repo.listNotes(saved.id)).length, '件');
