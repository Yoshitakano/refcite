import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { createDb } from '../../src/db/schema.js';
import { Repository } from '../../src/db/repository.js';
import { searchBibliography, importFromCandidate, importManual } from '../../src/import/index.js';
import { readFileSync } from 'fs';
import { CitationEngine, htmlToPlain, normalizeAll } from '../../src/citation/index.js';

const base = new URL('../../src/citation/', import.meta.url);
const read = (p) => readFileSync(new URL(p, base), 'utf8');
const eng = new CitationEngine({ styles:{apu:read('styles/apu.csl')},
  locales:{'ja-JP':read('locales/locales-ja-JP.xml'),'en-US':read('locales/locales-en-US.xml')}});
const repo = new Repository(createDb('sf-'+Date.now(), { indexedDB, IDBKeyRange }));

console.log('=== ① 著者名＋タイトルで検索 → 登録 ===');
const r = await searchBibliography({ title:'地方創生を超えて', author:'小磯' });
console.log('  候補:', r.candidates.length, '件 / 先頭:', r.candidates[0].title.slice(0,30));
const imp = await importFromCandidate(r.candidates[0]);
console.log('  取込:', imp.ok ? 'OK' : imp.error, '| source:', imp.reference?.source.fetchedFrom);
const saved = await repo.saveReference(imp.reference);
console.log('  引用:', htmlToPlain(eng.renderOne(normalizeAll([saved.csl])[0],'apu')));
console.log('  読み仮名:', saved.transcription?.authors?.join(' / ') ?? '(なし)');

console.log('\n=== ② 著者名だけで検索 ===');
const r2 = await searchBibliography({ author:'中沢新一' });
console.log('  候補:', r2.candidates.length, '件');
r2.candidates.slice(0,3).forEach(c=>console.log(`   - ${c.title.slice(0,28)} (${c.year ?? '—'})`));

console.log('\n=== ③ 洋書 ===');
const r3 = await searchBibliography({ title:'Gender Trouble', author:'Butler' });
const imp3 = await importFromCandidate(r3.candidates[0]);
console.log('  取込:', imp3.ok ? 'OK' : imp3.error);
if (imp3.ok) console.log('  引用:', htmlToPlain(eng.renderOne(normalizeAll([imp3.reference.csl])[0],'apu')));

console.log('\n=== ④ 手入力（検索で見つからない場合）===');
const m = importManual({
  title:'ゼミ配布資料：地域社会論', authors:['山田, 花子'], readings:['ヤマダ, ハナコ'],
  year:'2024', publisher:'私家版', type:'book',
});
console.log('  取込:', m.ok ? 'OK' : m.error);
console.log('  引用:', htmlToPlain(eng.renderOne(normalizeAll([m.reference.csl])[0],'apu')));
console.log('  source.kind:', m.reference.source.kind);
console.log('  警告:', m.issues.map(i=>i.field).join(',') || 'なし');
