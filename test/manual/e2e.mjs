import { readFileSync } from 'fs';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { createDb } from '../src/db/schema.js';
import { Repository } from '../src/db/repository.js';
import { importByIdentifier } from '../src/import/index.js';
import { CitationEngine, htmlToPlain, normalizeAll, sortReferences,
         toPlainText, PRESET_STYLES } from '../src/citation/index.js';

const base = new URL('../src/citation/', import.meta.url);
const read = (p) => readFileSync(new URL(p, base), 'utf8');
const eng = new CitationEngine({
  styles:{ apu:read('styles/apu.csl'), apa:read('styles/apa.csl'), sist02:read('styles/sist02.csl') },
  locales:{'ja-JP':read('locales/locales-ja-JP.xml'),'en-US':read('locales/locales-en-US.xml')}});

const repo = new Repository(createDb('e2e-'+Date.now(), { indexedDB, IDBKeyRange }));

console.log('① プロジェクト作成');
const proj = await repo.saveProject({ name:'2026年前期_社会学レポート', styleId:'apu' });
console.log('   ', proj.name, '(スタイル:', proj.styleId + ')');

console.log('\n② 文献の取込・保存・振り分け');
for (const id of ['978-4-00-023895-3','9784480098252','9784006003685','10.1086/227049']) {
  const r = await importByIdentifier(id);
  if (!r.ok) { console.log('    取得失敗:', id, r.error); continue; }
  const dup = await repo.findByIdentifier(r.reference.source.identifier);
  if (dup) { console.log('    重複のためスキップ:', id); continue; }
  const s = await repo.saveReference(r.reference);
  await repo.assignToProject('reference', s.id, proj.id);
  const warn = r.issues.length ? ` ⚠${r.issues.length}件の警告` : '';
  console.log(`    + ${s.csl.title?.slice(0,26)}${warn}`);
}

console.log('\n③ 抜き書きを記録');
const refs = await repo.listProjectReferences(proj.id);
await repo.saveNote({ referenceId: refs[0].id, type:'direct',
  body:'地方創生の議論は、地域政策の根本的な転換を迫るものである',
  locator:{ page:'45' }, projectIds:[proj.id] });
console.log('    直接引用1件を記録');

console.log('\n④ 横断検索');
for (const q of ['地方創生','バウマン','転換']) {
  const r = await repo.search(q, { projectId: proj.id });
  console.log(`    "${q}" -> 文献 ${r.references.length} / ノート ${r.notes.length}`);
}

console.log('\n⑤ 引用文献リスト生成（プロジェクト設定スタイル）');
const stored = await repo.listProjectReferences(proj.id);
const sorted = sortReferences(stored);
const items = normalizeAll(sorted.map(r=>r.csl));
const { entries } = eng.renderBibliography(items, proj.styleId, { preserveOrder:true });
console.log(toPlainText(entries, { heading:'引用文献' }).split('\n').map(l=>'    '+l).join('\n'));

console.log('\n⑥ バックアップ');
const dump = await repo.exportJson();
console.log('    JSON:', (JSON.stringify(dump).length/1024).toFixed(1), 'KB',
            `(文献${dump.references.length}/ノート${dump.notes.length})`);
