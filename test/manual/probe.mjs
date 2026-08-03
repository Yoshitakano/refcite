import { readFileSync } from 'fs';
import { CitationEngine, htmlToPlain } from '../src/citation/engine.js';
const base = new URL('../src/citation/', import.meta.url);
const read = (p) => readFileSync(new URL(p, base), 'utf8');
const eng = new CitationEngine({
  styles:{ apa:read('styles/apa.csl'), sist02:read('styles/sist02.csl') },
  locales:{'ja-JP':read('locales/locales-ja-JP.xml'),'en-US':read('locales/locales-en-US.xml')}});
const mk = (extra) => ({ id:'x', type:'book', title:'社会学入門',
  author:[{family:'田中',given:'太郎'}], issued:{'date-parts':[[2020]]},
  publisher:'岩波書店', language:'ja', ...extra });
// 候補フィールドが APA/SIST の出力に現れるか
for (const [name, extra] of [
  ['なし',        {}],
  ['genre',       {genre:'ja'}],
  ['annote',      {annote:'ja'}],
  ['note',        {note:'ja'}],
  ['archive',     {archive:'ja'}],
  ['custom',      {custom:{ja:true}}],
]) {
  const a = htmlToPlain(eng.renderOne(mk(extra),'apa'));
  const s = htmlToPlain(eng.renderOne(mk(extra),'sist02'));
  const dirty = a.includes('ja')||a.includes('Ja')||s.includes('ja')||s.includes('Ja');
  console.log(`${dirty?'汚染':'clean'}  ${name.padEnd(8)} APA: ${a}`);
}
