import { readFileSync, writeFileSync } from 'fs';
import { CitationEngine, normalizeAll, sortReferences,
         toRichHtml, toPlainText, PRESET_STYLES } from '../src/citation/index.js';
import * as F from '../src/citation/fixtures.js';
const base = new URL('../src/citation/', import.meta.url);
const read = (p) => readFileSync(new URL(p, base), 'utf8');
const eng = new CitationEngine({
  styles:{ apu:read('styles/apu.csl'), apa:read('styles/apa.csl'), sist02:read('styles/sist02.csl') },
  locales:{'ja-JP':read('locales/locales-ja-JP.xml'),'en-US':read('locales/locales-en-US.xml')}});

const READ = { 'jp-book-3':'コイソ, シュウジ', 'jp-article':'ヤマダ, ハナコ',
               'jp-book-1':'タナカ, タロウ', 'jp-book-2':'タナカ, タロウ',
               'jp-chapter':'タカハシ, ミドリ' };
const refs = [F.JP_BOOK_3,F.JP_BOOK_1,F.JP_BOOK_2,F.JP_ARTICLE,F.JP_CHAPTER,F.EN_BOOK,F.EN_ARTICLE]
  .map(csl => ({ id:csl.id, csl, transcription: READ[csl.id]?{authors:[READ[csl.id]]}:undefined }));
const items = normalizeAll(sortReferences(refs).map(r=>r.csl));

const blocks = PRESET_STYLES.map(s => {
  const { entries } = eng.renderBibliography(items, s.id, { preserveOrder:true });
  return { ...s, html: toRichHtml(entries, { heading:'引用文献' }),
           plain: toPlainText(entries, { heading:'引用文献' }) };
});

const page = `<meta charset="utf-8"><title>引用エンジン出力確認</title>
<style>body{font-family:-apple-system,"Hiragino Sans",sans-serif;max-width:920px;margin:2rem auto;padding:0 1rem}
h2{font-size:1.05rem;border-bottom:2px solid #333;padding-bottom:.3rem;margin-top:2rem}
.out{border:1px solid #ddd;border-radius:8px;padding:1rem;background:#fff}
button{padding:.5rem 1rem;margin:.5rem .4rem .5rem 0;border:1px solid #888;border-radius:6px;background:#fff;cursor:pointer}
.note{color:#666;font-size:.85rem}</style>
<h1>引用エンジン 出力確認</h1>
<p class="note">各スタイルの「コピー」を押し、Word / Google ドキュメントに貼り付けて書式が保たれるか確認してください。</p>
${blocks.map((b,i)=>`
<h2>${b.label} <span class="note">${b.note}</span></h2>
<div class="out" id="o${i}">${b.html}</div>
<button onclick="copyRich(${i})">リッチテキストでコピー</button>
<button onclick="copyPlain(${i})">プレーンテキストでコピー</button>
<span id="m${i}" class="note"></span>
<script>window.P${i}=${JSON.stringify(b.plain)};</script>`).join('\n')}
<script>
function copyRich(i){
  const html=document.getElementById('o'+i).innerHTML;
  const plain=window['P'+i];
  const item=new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),
                                'text/plain':new Blob([plain],{type:'text/plain'})});
  navigator.clipboard.write([item]).then(()=>msg(i,'コピーしました（書式付き）'),e=>msg(i,'失敗: '+e.message));
}
function copyPlain(i){ navigator.clipboard.writeText(window['P'+i])
  .then(()=>msg(i,'コピーしました（プレーン）'),e=>msg(i,'失敗: '+e.message)); }
function msg(i,t){ document.getElementById('m'+i).textContent=t; setTimeout(()=>document.getElementById('m'+i).textContent='',2500); }
</script>`;
writeFileSync(new URL('../demo.html', import.meta.url), page);
console.log('demo.html を生成しました');
blocks.forEach(b=>{ console.log('\n── '+b.label); console.log(b.plain); });
