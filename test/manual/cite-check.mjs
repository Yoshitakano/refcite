import { readFileSync } from 'fs';
import { CitationEngine, htmlToPlain, normalizeAll } from '../../src/citation/index.js';
import { ndlToCsl } from '../../src/import/isbn.js';
const base = new URL('../../src/citation/', import.meta.url);
const read = (p) => readFileSync(new URL(p, base), 'utf8');
const eng = new CitationEngine({ styles:{apu:read('styles/apu.csl')},
  locales:{'ja-JP':read('locales/locales-ja-JP.xml'),'en-US':read('locales/locales-en-US.xml')}});

const CASES = [
  ['信頼 社会的な複雑性の縮減メカニズム', '訳者2名の訳書'],
  ['コミュニティ 安全と自由の戦場', '訳者1名の訳書'],
  ['地方創生を超えて', '和書・共著'],
  ['はじまりのレーニン', '和書・単著'],
];
for (const [q, note] of CASES) {
  const xml = await (await fetch('https://ndlsearch.ndl.go.jp/api/opensearch?title=' +
    encodeURIComponent(q) + '&cnt=1')).text();
  const m = xml.match(/<item>[\s\S]*?<\/item>/);
  if (!m) { console.log(`  [${note}] ヒットなし`); continue; }
  const r = ndlToCsl(m[0], '');
  console.log(`【${note}】`);
  console.log('  ' + htmlToPlain(eng.renderOne(normalizeAll([r.csl])[0], 'apu')));
}
