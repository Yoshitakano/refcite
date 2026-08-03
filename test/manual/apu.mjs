import { readFileSync } from 'fs';
import { CitationEngine, htmlToPlain } from '../src/citation/engine.js';
import { normalizeAll } from '../src/citation/normalize.js';
import * as F from '../src/citation/fixtures.js';
const base = new URL('../src/citation/', import.meta.url);
const read = (p) => readFileSync(new URL(p, base), 'utf8');
const eng = new CitationEngine({
  styles: { apu: read('styles/apu.csl') },
  locales: {
    'ja-JP': read('locales/locales-ja-JP.xml'),
    'en-US': read('locales/locales-en-US.xml'),
  },
});
const EXPECT = {
  'jp-book-1':  '田中太郎（2020）『社会学入門』岩波書店.',
  'jp-book-2':  '田中太郎・佐藤花子（2019）『社会調査の方法』有斐閣.',
  'jp-book-3':  '小磯修二・村上裕一・山崎幹根（2018）『地方創生を超えて : これからの地域政策』岩波書店.',
  'jp-book-5':  '田中太郎・佐藤花子・加藤次郎・鈴木一郎・高橋実（2021）『現代社会論』東京大学出版会.',
  'jp-article': '山田花子（2019）「地域社会における共同性の変容」『社会学評論』70(2), 123-140.',
  'en-book':    'Latour, B. (2005). Reassembling the Social: An Introduction to Actor-Network-Theory. Oxford: Oxford University Press.',
  'en-article': 'Kucsko, G., Maurer, P. C., & Yao, N. Y. (2013). Nanometre-scale thermometry in a living cell. Nature, 500(7460), 54-58.',
};
let pass=0, fail=0;
for (const item of normalizeAll(F.ALL)) {
  let out;
  try { out = htmlToPlain(eng.renderOne(item, 'apu')); }
  catch (e) { out = 'ERROR: ' + e.message; }
  const exp = EXPECT[item.id];
  const ok = exp && out === exp;
  if (exp) { ok ? pass++ : fail++; }
  console.log(`${ok ? 'PASS' : 'FAIL'} [${item.id}]`);
  console.log(`   実際: ${out}`);
  if (exp && !ok) console.log(`   期待: ${exp}`);
}
console.log(`\n=== ${pass} pass / ${fail} fail ===`);
