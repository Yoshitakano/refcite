/**
 * 回帰テスト。
 *
 * 従来の test/*.mjs は出力を目視するだけのスクリプトで、合否を判定して
 * いなかった。実際、50音順ソートを完全に無効化しても「OK」を出す状態
 * だった。ここでは期待値との照合を行い、壊れたら必ず落ちるようにする。
 *
 * 実行: node test/run.mjs
 */

import { readFileSync } from 'fs';
import fs2 from 'node:fs';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import {
  CitationEngine, htmlToPlain, normalizeAll, sortReferences,
  findMissingReadings, validateItem, toRichHtml, toPlainText, blockQuoteHtml,
} from '../src/citation/index.js';
import { createDb, toBigrams, duplicateKey, REQUIRED_TABLES, SCHEMA_VERSION } from '../src/db/schema.js';
import { losingFields } from '../src/db/safety.js';
import { Repository } from '../src/db/repository.js';
import { NOTE_SORTS, DEFAULT_NOTE_SORT, sortNotes, pageValue } from '../src/db/notesort.js';
import {
  extractDoi, crossrefToCsl,
} from '../src/import/crossref.js';
import {
  normalizeIsbn, isJapaneseIsbn, parseNdlName, parseCreatorRoles,
  ndlToCsl, openLibraryToCsl, splitWesternName, japaneseNameOf,
} from '../src/import/isbn.js';
import { searchNdl, searchBibliography, candidateToCsl } from '../src/import/search.js';
import { importManual } from '../src/import/index.js';
import { refTypesOf, buildManualFields, missingRequired } from '../src/citation/reftypes.js';
import { classifyBarcode, barcodeToIsbn } from '../src/import/barcode.js';
import { fetchWithTimeout, describeError } from '../src/import/http.js';
import { fetchByIsbn } from '../src/import/isbn.js';
import { fetchByDoi } from '../src/import/crossref.js';
import { intextPatterns, buildInText, isLongQuote } from '../src/citation/intext.js';
import { STYLES, PRESET_STYLES, styleOf, DEFAULT_STYLE_ID } from '../src/citation/styles/index.js';
import { foldTransliteratedNames } from '../src/citation/normalize.js';
import { buildQuoteList, quoteListToText, quoteListToHtml } from '../src/citation/quotes.js';
import * as F from '../src/citation/fixtures.js';

let pass = 0, fail = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; return; }
  fail++;
  failures.push(`${name}\n    期待: ${e}\n    実際: ${a}`);
}

function ok(name, cond, detail = '') {
  if (cond) { pass++; return; }
  fail++;
  failures.push(`${name}${detail ? '\n    ' + detail : ''}`);
}

// ---------- 引用エンジン ----------

const base = new URL('../src/citation/', import.meta.url);
const read = (p) => readFileSync(new URL(p, base), 'utf8');
const engine = new CitationEngine({
  // APU 内での試験運用のため、提供するスタイルは APU 準拠の1種のみ
  styles: { apu: read('styles/apu/style.csl') },
  locales: {
    'ja-JP': read('locales/locales-ja-JP.xml'),
    'en-US': read('locales/locales-en-US.xml'),
  },
});
const render = (item, style = 'apu') =>
  htmlToPlain(engine.renderOne(normalizeAll([item])[0], style));

// APU 形式（マニュアル 5.2 / 5.3 / 5.5）
check('APU 和書・単著', render(F.JP_BOOK_1),
  '田中太郎（2020）『社会学入門』岩波書店.');
check('APU 和書・2名', render(F.JP_BOOK_2),
  '田中太郎・佐藤花子（2019）『社会調査の方法』有斐閣.');
check('APU 和書・3名', render(F.JP_BOOK_3),
  '小磯修二・村上裕一・山崎幹根（2018）『地方創生を超えて : これからの地域政策』岩波書店.');
check('APU 和書・5名（一覧では全員記載）', render(F.JP_BOOK_5),
  '田中太郎・佐藤花子・加藤次郎・鈴木一郎・高橋実（2021）『現代社会論』東京大学出版会.');
check('APU 和文論文', render(F.JP_ARTICLE),
  '山田花子（2019）「地域社会における共同性の変容」『社会学評論』70(2), 123-140.');
check('APU 欧文書籍', render(F.EN_BOOK),
  'Latour, B. (2005). Reassembling the Social: An Introduction to Actor-Network-Theory. Oxford: Oxford University Press.');
check('APU 欧文論文', render(F.EN_ARTICLE),
  'Kucsko, G., Maurer, P. C., & Yao, N. Y. (2013). Nanometre-scale thermometry in a living cell. Nature, 500(7460), 54-58.');
check('APU 和文・章', render(F.JP_CHAPTER),
  '高橋みどり（2021）「移民政策の国際比較」田中健一編『グローバル社会の課題』（pp.45-67）東京大学出版会.');

// ---------- APU ライティング・マニュアル 5.1〜5.7 の全項目 ----------
//
// APU 内で試験運用するため、マニュアルの規定をそのまま満たすことを保証する。
// 期待値はマニュアルの記載例をそのまま使う（意訳しない）。

// 5.1 単著（和文）: 著者名(出版年)『書名:副題』出版社.
check('APU 5.1 単著（和文）', render({
  id: 'm51', type: 'book', language: 'ja',
  title: '地域社会と多文化共生:アジア太平洋地域の事例',
  author: [{ family: '山田', given: '太郎' }],
  issued: { 'date-parts': [[2020]] }, publisher: 'ミネルヴァ書房',
}), '山田太郎（2020）『地域社会と多文化共生:アジア太平洋地域の事例』ミネルヴァ書房.');

// 5.1 単著（欧文）: Family, F. (出版年). Title. City: Publisher.
check('APU 5.1 単著（欧文）', render({
  id: 'm51e', type: 'book', language: 'en',
  title: 'Globalization and cultural identity in Southeast Asia: A comparative study',
  author: [{ family: 'Smith', given: 'John' }],
  issued: { 'date-parts': [[2019]] },
  publisher: 'Cambridge University Press', 'publisher-place': 'Cambridge',
}), 'Smith, J. (2019). Globalization and cultural identity in Southeast Asia: A comparative study. Cambridge: Cambridge University Press.');

// 5.2 共著: 日本語はナカグロ「・」で接続
check('APU 5.2 共著', render({
  id: 'm52', type: 'book', language: 'ja', title: '観光産業の未来',
  author: [{ family: '佐藤', given: '花子' }, { family: '鈴木', given: '一郎' }],
  issued: { 'date-parts': [[2018]] }, publisher: '有斐閣',
}), '佐藤花子・鈴木一郎（2018）『観光産業の未来』有斐閣.');

// 5.3 編者がいる本のなかの1章
check('APU 5.3 章（和文）', render({
  id: 'm53', type: 'chapter', language: 'ja', title: '移民政策の国際比較',
  author: [{ family: '高橋', given: 'みどり' }],
  editor: [{ family: '田中', given: '健一' }],
  'container-title': 'グローバル社会の課題', page: '45-67',
  issued: { 'date-parts': [[2021]] }, publisher: '東京大学出版会',
}), '高橋みどり（2021）「移民政策の国際比較」田中健一編『グローバル社会の課題』（pp.45-67）東京大学出版会.');

// 編者が1人なら Ed.（2人以上なら Eds.）
check('APU 5.3 章（欧文）', render({
  id: 'm53e', type: 'chapter', language: 'en', title: 'Chapter title here',
  author: [{ family: 'Brown', given: 'Alice' }],
  editor: [{ family: 'Lee', given: 'Mark' }],
  'container-title': 'Book title', page: '45-67',
  issued: { 'date-parts': [[2020]] },
  publisher: 'Oxford University Press', 'publisher-place': 'Oxford',
}), 'Brown, A. (2020). Chapter title here. In M. Lee (Ed.), Book title (pp. 45-67). Oxford: Oxford University Press.');

// 5.4 編書全体: 著者が無く編者だけなら「編」を付ける
check('APU 5.4 編書全体', render({
  id: 'm54', type: 'book', language: 'ja', title: 'グローバル社会の課題',
  editor: [{ family: '田中', given: '健一' }],
  issued: { 'date-parts': [[2021]] }, publisher: '東京大学出版会',
}), '田中健一編（2021）『グローバル社会の課題』東京大学出版会.');

// 5.5 学術雑誌論文
check('APU 5.5 雑誌論文（和文）', render({
  id: 'm55', type: 'article-journal', language: 'ja',
  title: '観光地における住民参加の意義',
  author: [{ family: '中村', given: '健太' }],
  'container-title': '観光学研究', volume: '15', issue: '2', page: '33-50',
  issued: { 'date-parts': [[2019]] },
}), '中村健太（2019）「観光地における住民参加の意義」『観光学研究』15(2), 33-50.');

check('APU 5.5 雑誌論文（欧文）', render({
  id: 'm55e', type: 'article-journal', language: 'en',
  title: 'Article title here', author: [{ family: 'Davis', given: 'Emma' }],
  'container-title': 'Journal Name', volume: '12', issue: '3', page: '45-67',
  issued: { 'date-parts': [[2021]] },
}), 'Davis, E. (2021). Article title here. Journal Name, 12(3), 45-67.');

// 5.6 ウェブサイト: (オンライン)アクセス日<URL>
check('APU 5.6 ウェブサイト', render({
  id: 'm56', type: 'webpage', language: 'ja', title: '人口推計',
  author: [{ literal: '総務省統計局' }], 'container-title': '総務省統計局サイト',
  issued: { 'date-parts': [[2024]] }, accessed: { 'date-parts': [[2026, 8, 3]] },
  URL: 'https://www.stat.go.jp/',
}), '総務省統計局（2024）「人口推計」『総務省統計局サイト』（オンライン）2026年8月3日アクセス\n\u3000\u3000\u3000\u3000＜https://www.stat.go.jp/＞');

// 5.7 新聞記事: 発行年月日まで出し、朝刊/夕刊とページを付ける
check('APU 5.7 新聞記事', render({
  id: 'm57', type: 'article-newspaper', language: 'ja',
  title: '見出し:副見出し', author: [{ family: '記者', given: '太郎' }],
  'container-title': '某新聞', edition: '朝刊', page: '3',
  issued: { 'date-parts': [[2024, 5, 1]] },
}), '記者太郎（2024年5月1日）「見出し:副見出し」『某新聞』朝刊, p.3.');

// ---------- 本文中の出典表記（マニュアル 2章・3章・4章・7章） ----------
//
// 引用文献一覧より使用頻度が高い。7章の早見表をそのまま検証する。
{
  const items = normalizeAll([
    { id:'i1', type:'book', language:'ja', title:'T1',
      author:[{ family:'田中', given:'太郎' }],
      issued:{'date-parts':[[2020]]}, publisher:'P' },
    { id:'i2', type:'book', language:'ja', title:'T2',
      author:[{ family:'田中', given:'太郎' }, { family:'佐藤', given:'花子' }],
      issued:{'date-parts':[[2014]]}, publisher:'P' },
    { id:'i3', type:'book', language:'ja', title:'T3',
      author:[{ family:'加藤', given:'一' }, { family:'乙', given:'二' },
              { family:'丙', given:'三' }],
      issued:{'date-parts':[[2013]]}, publisher:'P' },
    { id:'i4', type:'book', language:'ja', title:'T4',
      author:[{ family:'伊藤', given:'四' }],
      issued:{'date-parts':[[2020]]}, publisher:'P' },
    { id:'i5', type:'book', language:'ja', title:'T5',
      author:[{ family:'渡辺', given:'五' }],
      issued:{'date-parts':[[2021]]}, publisher:'P' },
    { id:'i6a', type:'book', language:'ja', title:'先の本',
      author:[{ family:'石井', given:'六' }],
      issued:{'date-parts':[[1991]]}, publisher:'P' },
    { id:'i6b', type:'book', language:'ja', title:'後の本',
      author:[{ family:'石井', given:'六' }],
      issued:{'date-parts':[[1991]]}, publisher:'P' },
  ]);
  const cite = (cs) => engine.renderCitation(items, cs, 'apu');

  check('APU 本文中: 単著', cite([{ id:'i1', locator:'45' }]),
    '（田中, 2020, p.45）');
  // 2ページ以上は pp.（マニュアル 2.1 表記の細則）
  check('APU 本文中: 2名の共著・複数ページ', cite([{ id:'i2', locator:'10-12' }]),
    '（田中・佐藤, 2014, pp.10-12）');
  // 3名以上は「1人目の姓＋ほか」（マニュアル 4章）
  check('APU 本文中: 3名以上', cite([{ id:'i3', locator:'31' }]),
    '（加藤ほか, 2013, p.31）');
  // 複数文献は半角セミコロン＋半角スペース（マニュアル 3章）
  check('APU 本文中: 複数文献',
    cite([{ id:'i4', locator:'5' }, { id:'i5', locator:'11' }]),
    '（伊藤, 2020, p.5; 渡辺, 2021, p.11）');
  // 同一著者・同年は a/b/c。一覧側と食い違ってはならない（マニュアル 5章）
  check('APU 本文中: 同一著者・同年', cite([{ id:'i6b', locator:'12' }]),
    '（石井, 1991b, p.12）');
  check('APU 本文中: ページなし（間接引用）', cite([{ id:'i1' }]),
    '（田中, 2020）');

  // 一覧側でも同じ接尾辞が付き、2件目は横棒になること
  const bib = engine.renderBibliography(
    normalizeAll([items.find((i) => i.id === 'i6a'), items.find((i) => i.id === 'i6b')]),
    'apu', { preserveOrder: true }).entries.map(htmlToPlain);
  check('APU 一覧: 同一著者・同年の a/b', bib[0], '石井六（1991a）『先の本』P.');
  check('APU 一覧: 同一著者は2件目を横棒に', bib[1], '――――（1991b）『後の本』P.');
}

// 引用の型（マニュアル 7章の早見表）。本文へそのまま貼れる形になること
{
  const items = normalizeAll([
    { id:'p1', type:'book', language:'ja', title:'T',
      author:[{ family:'山田', given:'太郎' }],
      issued:{'date-parts':[[2020]]}, publisher:'P' },
  ]);
  const cite = (loc) => engine.renderCitation(items, [{ id:'p1', locator: loc }], 'apu');
  const body = '地域社会における多文化共生は日常的な相互理解によって実現される';

  // 著者名を文末に置く型。カギカッコ内に句点を打たず、丸カッコの後に句点
  check('APU 7章: 短い直接引用・文末',
    buildInText({ patternId:'quote-tail', body, citation: cite('45') }).text,
    `「${body}」（山田, 2020, p.45）。`);

  // 地の文に置く型。マニュアル 2.1 の例と同じ形
  check('APU 7章: 短い直接引用・地の文',
    buildInText({ patternId:'quote-lead', body, citation: cite('45') }).text,
    `山田（2020, p.45）は「${body}」と述べている。`);

  // ブロック引用はカギカッコを使わない（マニュアル 2.2）
  {
    const r = buildInText({ patternId:'block', body, citation: cite('45') });
    ok('APU 7章: ブロック引用はカギカッコ無し', !r.text.includes('「'), r.text);
    ok('APU 7章: ブロック引用の印', r.block === true);
  }

  check('APU 7章: 間接引用・文末',
    buildInText({ patternId:'para-tail', body, citation: cite('29') }).text,
    `${body}（山田, 2020, p.29）。`);
  // 地の文に著者を置く型もページを添え、句点で閉じる
  check('APU 7章: 間接引用・地の文',
    buildInText({ patternId:'para-lead', body, citation: cite('40') }).text,
    `山田（2020, p.40）によれば、${body}。`);
  // ページが無いときに「（2020, ）」とならないこと
  check('APU 7章: 間接引用・地の文（ページなし）',
    buildInText({ patternId:'para-lead', body, citation: cite() }).text,
    `山田（2020）によれば、${body}。`);
  // 本文がすでに句点で終わっていても重ねない
  check('APU 7章: 間接引用・地の文（句点の重複を避ける）',
    buildInText({ patternId:'para-lead', body: body + '。', citation: cite('40') }).text,
    `山田（2020, p.40）によれば、${body}。`);

  // 複数ページでも pp. が保たれること（文字列連結だと落ちる）
  ok('APU 7章: 複数ページは pp.',
    buildInText({ patternId:'quote-tail', body, citation: cite('10-12') })
      .text.includes('pp.10-12'));

  // ブロック引用の閾値（マニュアル 2.2: 目安 4〜5 行 ≒ 160 字）
  check('APU 2.2: 短い引用は非ブロック', isLongQuote('あ'.repeat(159)), false);
  check('APU 2.2: 長い引用はブロック', isLongQuote('あ'.repeat(160)), true);
}

// ---------- 引用文の最終形の手直し ----------
//
// 規則で表せない書式のための逃げ道（設計書 §4.3）。
{
  const ovRepo = new Repository(createDb('ov-' + Date.now(), { indexedDB, IDBKeyRange }));
  const base = { type:'book', language:'ja', author:[{ family:'田中', given:'太郎' }],
                 issued:{'date-parts':[[2020]]}, publisher:'岩波書店' };
  await ovRepo.saveReference({ id:'ov-a',
    csl:{ ...base, id:'ov-a', title:'社会学入門' }, source:{ kind:'manual' } });
  await ovRepo.saveReference({ id:'ov-b',
    csl:{ ...base, id:'ov-b', title:'別の本' }, source:{ kind:'manual' },
    citationOverride:'田中太郎（2020）『別の本』〔第2版〕岩波書店.' });

  check('最終形: 保存して読み戻せる',
    (await ovRepo.getReference('ov-b'))?.citationOverride,
    '田中太郎（2020）『別の本』〔第2版〕岩波書店.');

  // 手直しした文献は citeproc に渡さない。渡すと同一著者の横棒（――――）や
  // 同年の a/b が手直し分を数に入れて付き、噛み合わない出力になる
  {
    const refs = sortReferences(await ovRepo.listReferences());
    const items = normalizeAll(refs.map((r) => r.csl));
    const autoIdx = [], autoItems = [];
    refs.forEach((r, i) => {
      if (!r.citationOverride?.trim()) { autoIdx.push(i); autoItems.push(items[i]); }
    });
    const auto = autoItems.length
      ? engine.renderBibliography(autoItems, 'apu', { preserveOrder: true }).entries
      : [];
    const out = refs.map((r) => r.citationOverride?.trim() ?? '');
    autoIdx.forEach((idx, k) => { out[idx] = htmlToPlain(auto[k]); });

    ok('最終形: 手直し分がそのまま出る',
       out.includes('田中太郎（2020）『別の本』〔第2版〕岩波書店.'), JSON.stringify(out));
    // 手直し分を除いた結果、残り1件なので横棒も年サフィックスも付かない
    ok('最終形: 手直し分が横棒・年サフィックスに影響しない',
       out.every((e) => !e.includes('――――') && !/2020[ab]/.test(e)),
       JSON.stringify(out));
  }
}

// ---------- 手入力（種別ごとの入力項目 → 引用出力） ----------
//
// 種別を先に選ばせ、その種別に必要な項目だけを出す方式。
// 入力からマニュアルの書式どおりに出力できることを確かめる。
{
  const entry = (typeId, values) => {
    const r = importManual(buildManualFields(typeId, values));
    return r.ok && r.reference ? render(r.reference.csl) : `(登録できず: ${r.error})`;
  };

  check('手入力: 書籍', entry('book', {
    authors: '山田, 太郎', year: '2020',
    title: '地域社会と多文化共生：アジア太平洋地域の事例', publisher: 'ミネルヴァ書房',
  }), '山田太郎（2020）『地域社会と多文化共生：アジア太平洋地域の事例』ミネルヴァ書房.');

  // 編書全体は編者を著者位置に置く（マニュアル 5.4）
  check('手入力: 編書全体', entry('edited-book', {
    editors: '田中, 健一', year: '2021',
    title: 'グローバル社会の課題', publisher: '東京大学出版会',
  }), '田中健一編（2021）『グローバル社会の課題』東京大学出版会.');

  check('手入力: 編書のなかの1章', entry('chapter', {
    authors: '高橋, みどり', year: '2021', title: '移民政策の国際比較',
    editors: '田中, 健一', containerTitle: 'グローバル社会の課題',
    page: '45-67', publisher: '東京大学出版会',
  }), '高橋みどり（2021）「移民政策の国際比較」田中健一編『グローバル社会の課題』（pp.45-67）東京大学出版会.');

  check('手入力: 学術雑誌論文', entry('article-journal', {
    authors: '中村, 健太', year: '2019', title: '観光地における住民参加の意義',
    containerTitle: '観光学研究', volume: '15', issue: '2', page: '33-50',
  }), '中村健太（2019）「観光地における住民参加の意義」『観光学研究』15(2), 33-50.');

  check('手入力: ウェブサイト', entry('webpage', {
    authors: '環境省', year: '2022',
    title: '地球温暖化対策の推進に関する法律', containerTitle: '環境省ホームページ',
    accessed: '2023-01-15', url: 'https://www.env.go.jp/example',
  }), '環境省（2022）「地球温暖化対策の推進に関する法律」『環境省ホームページ』（オンライン）2023年1月15日アクセス\n\u3000\u3000\u3000\u3000＜https://www.env.go.jp/example＞');

  // URL は山括弧で囲み、ハイパーリンクにはしない（マニュアル 5.6）。
  // リッチテキストでは &lt; に、プレーンでは < になる必要がある。
  {
    const csl = importManual(buildManualFields('newspaper-online', {
      authors: '岡本, 淳', date: '2022-08-02', title: '地方創生、次の一手は',
      containerTitle: '読売新聞', accessed: '2023-01-15',
      url: 'https://www.example.co.jp/article',
    })).reference.csl;
    const { entries } = engine.renderBibliography(
      normalizeAll([csl]), 'apu', { preserveOrder: true });
    const rich = toRichHtml(entries);
    ok('URL: ハイパーリンクにしない', !/<a\s/i.test(rich), rich);
    // 山括弧は全角。半角だとタグと紛れ、実体参照への変換が要る
    ok('URL: 全角の山括弧で囲む',
       rich.includes('＜https') && rich.includes('＞'), rich);
    ok('URL: 数値文字参照が残らない', !rich.includes('&#'), rich);
    // アクセス日の直後で改行する
    ok('URL: リッチテキストは <br> で改行',
       /アクセス<br>＜https/.test(rich), rich);
    ok('URL: プレーンは改行＋全角4字下げ',
       toPlainText(entries).includes('アクセス\n\u3000\u3000\u3000\u3000＜https'),
       JSON.stringify(toPlainText(entries)));
  }

  // 新聞は発行年月日まで持つ。日付入力から date-parts を作る
  check('手入力: 新聞記事（紙）', entry('article-newspaper', {
    authors: '斎藤, 修', date: '2021-03-15',
    title: '観光業界に打撃：コロナ禍の影響続く', containerTitle: '朝日新聞',
    edition: '朝刊', page: '5',
  }), '斎藤修（2021年3月15日）「観光業界に打撃：コロナ禍の影響続く」『朝日新聞』朝刊, p.5.');

  // オンライン版は URL の有無で紙面版と区別する
  check('手入力: 新聞記事（オンライン）', entry('newspaper-online', {
    authors: '岡本, 淳', date: '2022-08-02', title: '地方創生、次の一手は',
    containerTitle: '読売新聞', accessed: '2023-01-15',
    url: 'https://www.example.co.jp/article',
  }), '岡本淳（2022年8月2日）「地方創生、次の一手は」『読売新聞』（オンライン）2023年1月15日アクセス\n\u3000\u3000\u3000\u3000＜https://www.example.co.jp/article＞');

  check('手入力: 学位論文', entry('thesis', {
    authors: '鈴木, 花子', year: '2020',
    title: '地方都市における観光政策の効果分析',
    genre: '博士学位論文', publisher: '○○大学大学院',
  }), '鈴木花子（2020）『地方都市における観光政策の効果分析』博士学位論文, ○○大学大学院.');

  check('手入力: 学会発表', entry('speech', {
    authors: '岡田, 里奈', year: '2022',
    title: '地域観光の担い手育成に関する一考察',
    eventTitle: '日本観光学会全国大会', place: '福岡',
  }), '岡田里奈（2022）「地域観光の担い手育成に関する一考察」日本観光学会全国大会, 福岡.');

  check('手入力: 白書', entry('report', {
    authors: '国土交通省', year: '2022',
    title: '観光白書 令和4年版', publisher: '国土交通省',
  }), '国土交通省（2022）『観光白書 令和4年版』国土交通省.');

  // 必須項目の検出。種別ごとに何が必須かが違う
  check('手入力: 書籍の必須項目',
    missingRequired('book', { authors: '甲' }), ['出版年', '書名', '出版社']);
  check('手入力: 新聞の必須項目',
    missingRequired('article-newspaper', {}), ['発行年月日', '見出し', '新聞名']);
  check('手入力: 埋まっていれば空', missingRequired('book', {
    authors: '甲', year: '2020', title: 'T', publisher: 'P' }), []);

  // 全種別が入力欄を持つこと（定義漏れの検出）
  ok('手入力: 全種別に入力欄がある',
     refTypesOf().every((t) => t.fields.length > 0));
}

// ---------- マニュアル 9章（規定のない種別・APA 一般原則からの類推） ----------

check('APU 9.1 学位論文', render({
  id: 'c91', type: 'thesis', language: 'ja',
  title: '地方都市における観光政策の効果分析',
  author: [{ family: '鈴木', given: '花子' }],
  genre: '博士学位論文', publisher: '○○大学大学院',
  issued: { 'date-parts': [[2020]] },
}), '鈴木花子（2020）『地方都市における観光政策の効果分析』博士学位論文, ○○大学大学院.');

check('APU 9.2 学会発表', render({
  id: 'c92', type: 'speech', language: 'ja',
  title: '地域観光の担い手育成に関する一考察',
  author: [{ family: '岡田', given: '里奈' }],
  'event-title': '日本観光学会全国大会', 'publisher-place': '福岡',
  issued: { 'date-parts': [[2022]] },
}), '岡田里奈（2022）「地域観光の担い手育成に関する一考察」日本観光学会全国大会, 福岡.');

check('APU 9.3 白書', render({
  id: 'c93', type: 'report', language: 'ja', title: '観光白書 令和4年版',
  author: [{ literal: '国土交通省' }], publisher: '国土交通省',
  issued: { 'date-parts': [[2022]] },
}), '国土交通省（2022）『観光白書 令和4年版』国土交通省.');

// 過去に選べたスタイル（'apa' など）が保存されたままでも落ちないこと。
// 提供を APU 1種に絞ったため、既存プロジェクトが未知の styleId を指しうる。
ok('未知のスタイルでも例外にしない',
   render({ id: 'ls2', type: 'book', language: 'ja', title: 'テスト',
            author: [{ family: '甲', given: '一' }],
            issued: { 'date-parts': [[2020]] }, publisher: 'P' }, 'apa')
     .includes('『テスト』'));

// 他スタイルに和文フラグが漏れていないこと（genre → annote へ変更した経緯）

// 著者不明時にタイトルが著者位置へ繰り上がらないこと
const noAuthor = { id:'na', type:'article-journal', language:'ja',
  title:'著者不明の論文', 'container-title':'某誌', volume:'1', page:'1-9',
  issued:{'date-parts':[[2000]]} };
ok('著者不明でもタイトルが本来の位置に残る',
   render(noAuthor).includes('「著者不明の論文」'), render(noAuthor));

// 特殊文字の正規化
ok('ページ範囲が半角ハイフン', !/[–—]/.test(render(F.JP_ARTICLE)), render(F.JP_ARTICLE));
ok('U+202F が混入しない', !/ | /.test(render(F.JP_BOOK_3)));

// ---------- 50音順ソート ----------

const mkRef = (id, family, given, reading, lang = 'ja') => ({
  id, csl: { id, type:'book', title:id, language:lang,
             author:[{ family, given }], issued:{'date-parts':[[2020]]}, publisher:'X' },
  transcription: reading ? { authors:[reading] } : undefined,
});
const sortCase = [
  mkRef('r1','山崎','幹根','ヤマザキ, ミキネ'),
  mkRef('r2','阿部','太郎','アベ, タロウ'),
  mkRef('r3','小磯','修二','コイソ, シュウジ'),
  { id:'e1', csl:{ id:'e1', type:'book', title:'Z', language:'en',
      author:[{family:'Zimmer',given:'A'}], issued:{'date-parts':[[2020]]}, publisher:'Y'} },
  { id:'e2', csl:{ id:'e2', type:'book', title:'A', language:'en',
      author:[{family:'Adams',given:'B'}], issued:{'date-parts':[[2020]]}, publisher:'Y'} },
];
check('50音順ソート（漢字コード順では誤る並び）',
  sortReferences(sortCase).map((r) => r.id),
  ['r2', 'r3', 'r1', 'e2', 'e1']);

check('読み仮名の欠落を検出',
  findMissingReadings([mkRef('x','鈴木','花子',null)]).map((r) => r.id), ['x']);

// 和文／欧文の並び順切替（執筆ページから設定できる）
check('並び順: 欧文を先にする',
  sortReferences(sortCase, { order: 'en-first' }).map((r) => r.id),
  ['e2', 'e1', 'r2', 'r3', 'r1']);

// preserveOrder が効いていること
const ordered = normalizeAll(sortReferences(sortCase).map((r) => r.csl));
const kept = engine.renderBibliography(ordered, 'apu', { preserveOrder: true });
check('preserveOrder でアプリ側の並びが保たれる', kept.ids, ['r2','r3','r1','e2','e1']);

// ---------- 検証（警告 UI） ----------

check('必須項目の欠落を検出',
  validateItem(F.INCOMPLETE).map((i) => i.field).sort(),
  ['author', 'issued', 'publisher']);
check('直接引用でページ欠落を警告',
  validateItem(F.JP_BOOK_1, { hasDirectQuote: true }).map((i) => i.field), ['page']);

// ---------- 取込（ネットワーク不要な変換部分） ----------

check('DOI 抽出（URL 形式）', extractDoi('https://doi.org/10.1086/227049'), '10.1086/227049');
check('DOI 抽出（文中）', extractDoi('本文中に 10.1086/227049。'), '10.1086/227049');
check('DOI 抽出（非DOI）', extractDoi('ただの文字列'), null);

// Crossref: 和文論文は title が空で original-title に実体が入る
check('Crossref 和文論文のタイトル復元',
  crossrefToCsl({ DOI:'10.x/y', type:'journal-article', title:[''],
    'original-title':['和文タイトル'], language:'ja' }).title, '和文タイトル');

check('ISBN 正規化', normalizeIsbn('978-4-00-023895-3'), '9784000238953');
check('和書判定', [isJapaneseIsbn('9784000238953'), isJapaneseIsbn('9780140449136')], [true, false]);
check('生没年の除去', parseNdlName('村上, 裕一, 1981-'), { family:'村上', given:'裕一' });
check('生没年の除去（没年あり）', parseNdlName('土屋, 俊, 1952-2020'),
  { family:'土屋', given:'俊' });
// 姓名が分割されていない表記。この形では生没年除去が無いと literal に
// そのまま残り、引用文に「1867-1916」が出てしまう。
// （姓, 名, 生没年 の形は split の先頭2要素を取るため除去が無くても通り、
//   単体では除去漏れを検出できない）
check('生没年の除去（姓名未分割）', parseNdlName('夏目漱石, 1867-1916'),
  { literal:'夏目漱石' });
// 生没年が引用文に出てしまわないこと（除去漏れは出力で初めて気づく類の不具合）
ok('生没年が引用出力に混入しない',
   !/19\d{2}-/.test(render({ id:'ls', type:'book', language:'ja',
     title:'テスト', publisher:'X', issued:{'date-parts':[[2020]]},
     author:[parseNdlName('村上, 裕一, 1981-')] })),
   render({ id:'ls', type:'book', language:'ja', title:'テスト', publisher:'X',
     issued:{'date-parts':[[2020]]}, author:[parseNdlName('村上, 裕一, 1981-')] }));
{
  const r = parseCreatorRoles('ジグムント・バウマン 著,奥井智之 訳');
  check('責任表示の役割解析',
    { authors: r.authors, translators: r.translators, editors: r.editors },
    { authors:['ジグムントバウマン'], translators:['奥井智之'], editors:[] });
  // 中黒を保った元表記も残す（和訳書の姓の切り出しに要る）
  check('責任表示の元表記を保持', r.authorsRaw, ['ジグムント・バウマン']);
}

// 役割語は同じ役割が続くとき最後の1人にしか付かない。
// 「大庭健」を著者に落とすと共著扱いになり、引用が誤る（実データで確認）。
{
  const r = parseCreatorRoles('ニクラス・ルーマン 著,大庭健, 正村俊之 訳');
  check('役割語が最後だけの訳者2名',
    { a: r.authors, t: r.translators },
    { a: ['ニクラスルーマン'], t: ['大庭健', '正村俊之'] });
}

// 役割語は角括弧で囲まれることがある（NDL の実データ）。
// 括弧を見落とすと著者が空になり、dc:creator の全員が著者扱いになる。
{
  const r = parseCreatorRoles('エミール・デュルケーム [著],宮島喬 訳');
  check('責任表示: 角括弧つきの役割語',
    { a: r.authors, t: r.translators },
    { a: ['エミールデュルケーム'], t: ['宮島喬'] });
}

// 原著者が2名いる訳書。役割語を持つ断片から始めると1人目が落ちる
{
  const r = parseCreatorRoles('カール・マルクス, フリードリヒ・エンゲルス 著,大内兵衛 訳');
  check('責任表示: 原著者2名',
    { a: r.authors, t: r.translators },
    { a: ['カールマルクス', 'フリードリヒエンゲルス'], t: ['大内兵衛'] });
}

// <author> は dc:creator の羅列と責任表示が連結されて返る。
// 前半を解析すると姓名の断片や生没年まで役割へ入ってしまう。
{
  const r = parseCreatorRoles(
    'Luhmann, Niklas, 1927-1998,大庭, 健, 1946-2018,正村, 俊之, 1953-,' +
    'ニクラス・ルーマン 著,大庭健, 正村俊之 訳');
  check('dc:creator の羅列を混入させない',
    { a: r.authors, t: r.translators },
    { a: ['ニクラスルーマン'], t: ['大庭健', '正村俊之'] });
}

// 和訳書の原著者は「ルーマン, N.」の形にする（和文文献として扱う慣行）
check('和訳書の原著者を和文表記へ',
  japaneseNameOf({ family: 'Luhmann', given: 'Niklas' }, ['ニクラス・ルーマン']),
  { family: 'ルーマン', given: 'N.', literal: 'ルーマン, N.' });
// 著者が複数で対応が取れないときは触らない（別人を当てるより安全）
check('対応が取れなければ変換しない',
  japaneseNameOf({ family: 'A', given: 'B' }, ['甲・乙', '丙・丁']), null);
check('欧文名の分割', splitWesternName('Fyodor Dostoyevsky'),
  { family:'Dostoyevsky', given:'Fyodor' });

// NDL: 訳書で読み仮名の件数が著者と合わないとき破棄されること
const ndlXml = `<item>
  <dc:title>コミュニティ</dc:title>
  <dc:creator>Bauman, Zygmunt, 1925-2017</dc:creator>
  <dc:creator>奥井, 智之, 1958-</dc:creator>
  <dcndl:creatorTranscription>オクイ, トモユキ, 1958-</dcndl:creatorTranscription>
  <dc:publisher>筑摩書房</dc:publisher>
  <dcterms:issued>2017.12</dcterms:issued>
  <author>ジグムント・バウマン 著,奥井智之 訳</author>
</item>`;
const ndl = ndlToCsl(ndlXml, '9784480098252');
ok('訳書: 原著者と訳者を分離',
   ndl.csl.author?.length === 1 && ndl.csl.translator?.length === 1,
   JSON.stringify({ a: ndl.csl.author, t: ndl.csl.translator }));
check('訳書: 件数不一致の読み仮名は破棄', ndl.transcription.authors, undefined);
check('NDL: 年の抽出', ndl.csl.issued, { 'date-parts': [[2017]] });

// 訳書の引用出力。原著者は和文表記、訳者は全員を「・」で連ねる
{
  const t = ndlToCsl(`<item>
    <dc:title>信頼 : 社会的な複雑性の縮減メカニズム</dc:title>
    <dc:creator>Luhmann, Niklas, 1927-1998</dc:creator>
    <dc:creator>大庭, 健, 1946-2018</dc:creator>
    <dc:creator>正村, 俊之, 1953-</dc:creator>
    <dc:publisher>勁草書房</dc:publisher><dcterms:issued>1990</dcterms:issued>
    <author>Luhmann, Niklas, 1927-1998,大庭, 健, 1946-2018,正村, 俊之, 1953-,ニクラス・ルーマン 著,大庭健, 正村俊之 訳</author>
  </item>`, '');
  check('訳書: 原著者を和文表記へ', t.csl.author, [
    { family: 'ルーマン', given: 'N.', literal: 'ルーマン, N.' }]);
  check('訳書: 訳者2名を分離', t.csl.translator,
    [{ family: '大庭', given: '健' }, { family: '正村', given: '俊之' }]);
  check('訳書: 引用出力', render(t.csl),
    'ルーマン, N.（1990）『信頼 : 社会的な複雑性の縮減メカニズム』大庭健・正村俊之訳，勁草書房.');
}

// 実アプリの経路（ndlToCsl）でも生没年が落ちること。
// parseNdlName 単体だけを見ていると、呼び出し側の変更で漏れても気づけない。
const ndlLife = ndlToCsl(`<item><dc:title>T</dc:title>
  <dc:creator>村上, 裕一, 1981-</dc:creator><dc:publisher>P</dc:publisher>
  <dcterms:issued>2018</dcterms:issued><author>村上裕一 著</author></item>`, '1');
check('NDL 経由でも生没年が落ちる', ndlLife.csl.author, [{ family:'村上', given:'裕一' }]);

// 著者不明の補完（citeproc の substitute でタイトルが繰り上がるのを防ぐ）
const filled = normalizeAll([{ id:'nz', type:'book', title:'著者のない本',
  language:'ja', issued:{'date-parts':[[2020]]}, publisher:'P' }])[0];
check('著者不明を補完する', filled.author, [{ literal: '著者名不明' }]);
ok('著者不明のフラグが立つ', filled._authorUnknown === true);

// Open Library: 自由書式の日付から年を取り出す
check('Open Library: publish_date から年を抽出',
  openLibraryToCsl({ 'ISBN:1': { title:'T', publish_date:'June 1, 2006' } }, '1').csl.issued,
  { 'date-parts': [[2006]] });

// ---------- 著者名・タイトル検索（取込の主動線） ----------

// 候補の並べ替え: 雑誌記事より書籍を優先する。NDL は講演録や記事も
// 返すため、これが無いと学生が探している書籍が埋もれる。
{
  const ndlXml = `<?xml version="1.0"?><rss><channel>
    <item><dc:title>記事タイトル</dc:title><category>記事</category>
      <dc:creator>著者, 一郎</dc:creator></item>
    <item><dc:title>書籍タイトル</dc:title><category>図書</category>
      <dc:creator>著者, 一郎</dc:creator><dc:publisher>岩波書店</dc:publisher>
      <dcterms:issued>2018</dcterms:issued>
      <dc:identifier>978-4-00-023895-3</dc:identifier></item>
  </channel></rss>`;
  const res = await searchNdl({ title: 'x' }, {
    fetchImpl: async () => ({ ok: true, text: async () => ndlXml }),
  });
  ok('検索: NDL の応答を解析できる', res.ok && res.candidates.length === 2);
  check('検索: 書籍が記事より上位', res.candidates[0].title, '書籍タイトル');

  // 出版社・ISBN・年が同条件で、種別だけが違う場合。
  // これらの加点が同じなので、書籍優先の加点が無いと順序が保証されない。
  const tieXml = `<?xml version="1.0"?><rss><channel>
    <item><dc:title>記事A</dc:title><category>記事</category>
      <dc:creator>著者, 一郎</dc:creator><dc:publisher>某社</dc:publisher>
      <dcterms:issued>2018</dcterms:issued>
      <dc:identifier>978-4-00-000000-0</dc:identifier></item>
    <item><dc:title>書籍B</dc:title><category>図書</category>
      <dc:creator>著者, 一郎</dc:creator><dc:publisher>某社</dc:publisher>
      <dcterms:issued>2018</dcterms:issued>
      <dc:identifier>978-4-00-023895-3</dc:identifier></item>
  </channel></rss>`;
  const tie = await searchNdl({ title: 'x' }, {
    fetchImpl: async () => ({ ok: true, text: async () => tieXml }),
  });
  check('検索: 他条件が同じなら書籍を優先', tie.candidates[0].title, '書籍B');
  check('検索: 種別を判別', res.candidates.map((c) => c.kind), ['book', 'article']);
  check('検索: ISBN を抽出', res.candidates[0].isbn, '9784000238953');

  // 候補 → CSL 変換（NDL は生 XML を持つので ISBN 取込と同じ変換を通す）
  const conv = candidateToCsl(res.candidates[0]);
  check('検索候補の CSL 化: タイトル', conv.csl.title, '書籍タイトル');
  check('検索候補の CSL 化: 著者', conv.csl.author, [{ family: '著者', given: '一郎' }]);
}

// 入力が空なら検索しない
{
  const r = await searchBibliography({ title: '', author: '' });
  ok('検索: 空入力を拒否', !r.ok && /入力してください/.test(r.error));
}

// 手入力での登録
{
  const m = importManual({
    title: '手入力の本', authors: ['山田, 花子'], readings: ['ヤマダ, ハナコ'],
    year: '2024', publisher: '私家版', type: 'book',
  });
  ok('手入力: 登録できる', m.ok);
  check('手入力: 著者を姓名に分割', m.reference.csl.author, [{ family: '山田', given: '花子' }]);
  check('手入力: source.kind', m.reference.source.kind, 'manual');
  check('手入力: 読み仮名を保持', m.reference.transcription?.authors, ['ヤマダ, ハナコ']);
  check('手入力: 引用出力', render(m.reference.csl),
    '山田花子（2024）『手入力の本』私家版.');

  // 読みの件数が著者と合わなければ 50音順には使わない
  const m2 = importManual({
    title: 'T', authors: ['山田, 花子', '田中, 太郎'], readings: ['ヤマダ, ハナコ'],
  });
  check('手入力: 読みの件数不一致は破棄', m2.reference.transcription?.authors, undefined);
}

// ---------- バーコード判定（仕様 3.1-1） ----------

check('バーコード: 和書 ISBN', classifyBarcode('9784000238953'), 'isbn');
check('バーコード: 洋書 ISBN', classifyBarcode('9780140449136'), 'isbn');
check('バーコード: ハイフン付き', classifyBarcode('978-4-00-023895-3'), 'isbn');
// 日本の書籍は2段バーコード。下段（192始まり）を読むと無効な値が入るため、
// 「上段を写して」と促す必要がある。ISBN として通してはいけない。
check('バーコード: 価格コード（下段）を弾く', classifyBarcode('1921900000000'), 'price');
check('バーコード: 書籍以外の JAN を弾く', classifyBarcode('4901234567894'), 'unknown');
check('バーコード: ISBN-10 は対象外', classifyBarcode('400023895X'), 'unknown');
check('バーコード: ISBN 抽出', barcodeToIsbn('978-4-00-023895-3'), '9784000238953');
check('バーコード: 非 ISBN からは取り出さない', barcodeToIsbn('1921900000000'), null);

// ---------- 永続化・検索 ----------

const repo = new Repository(createDb('run-' + Date.now(), { indexedDB, IDBKeyRange }));

check('bigram 生成', toBigrams('社会学'), ['社会', '会学']);

const savedRef = await repo.saveReference({
  id: 'ref-1',
  csl: { id:'ref-1', type:'book', title:'地方創生を超えて', language:'ja',
         author:[{family:'小磯',given:'修二'}], issued:{'date-parts':[[2018]]},
         publisher:'岩波書店' },
  source: { kind:'isbn', identifier:'9784000238953' },
});
ok('保存時に検索索引が作られる', (savedRef.searchIndex ?? []).length > 0);
check('重複検出（識別子）', (await repo.findByIdentifier('9784000238953'))?.id, 'ref-1');

// 識別子が違っても書誌が同じなら候補として拾う。
// 同じ本を ISBN と DOI の双方から取り込む場合に必要。
{
  const sameBook = { type:'book', language:'ja', title:'地方創生を超えて : 副題が付いた版',
    author:[{family:'小磯',given:'修二'}], issued:{'date-parts':[[2018]]}, publisher:'岩波書店' };
  const found = await repo.findSimilar(sameBook);
  check('重複検出（書誌の内容・副題の揺れを吸収）', found.map((r) => r.id), ['ref-1']);

  // 改訂版や別の著者は同一視しない（誤って統合すると別の文献が消える）
  const revised = { ...sameBook, issued:{'date-parts':[[2022]]} };
  check('重複検出: 年が違えば別物', (await repo.findSimilar(revised)).length, 0);
  const other = { ...sameBook, author:[{family:'佐藤',given:'太郎'}] };
  check('重複検出: 著者が違えば別物', (await repo.findSimilar(other)).length, 0);
  // 年が無いものは誤判定を招くので対象外。
  // 除外しないと year が undefined のままキーに入り、年不明の文献同士が
  // 「|undefined|タイトル」で一致してしまう。
  const noYear = { ...sameBook, issued: undefined };
  check('重複検出: 年が無ければ判定しない', (await repo.findSimilar(noYear)).length, 0);
  check('重複検出: 年なしはキーを作らない', duplicateKey(noYear), null);
  // 年不明の別の本を登録しても、互いに重複と判定されないこと
  await repo.saveReference({ id:'ny1',
    csl:{ id:'ny1', type:'book', language:'ja', title:'年不明の本A',
          author:[{family:'甲',given:'一'}] }, source:{ kind:'manual' } });
  const ny2 = { type:'book', language:'ja', title:'年不明の本A',
                author:[{family:'甲',given:'一'}] };
  check('重複検出: 年不明同士を同一視しない', (await repo.findSimilar(ny2)).length, 0);
  // 自分自身は除外できる
  check('重複検出: 自分自身を除外',
    (await repo.findSimilar(sameBook, 'ref-1')).length, 0);
}

await repo.saveNote({ referenceId:'ref-1', type:'direct',
  body:'地域政策の根本的な転換を迫る', comment:'第2章の論点に使えそう',
  locator:{ page:'45' } });

check('検索: 書誌', (await repo.search('地方創生')).references.length, 1);
check('検索: 抜き書き本文', (await repo.search('根本的な転換')).notes.length, 1);
check('検索: コメント', (await repo.search('第2章の論点')).notes.length, 1);
check('検索: 未登録語', (await repo.search('存在しない語句')).references.length, 0);

// 語順の検証。索引に実在する bigram だけで構成した語を使う。
// 本文「地域政策の根本的な転換を迫る」は「転換」「政策」を含むので、
// 「転換政策」の bigram（転換/換政/政策）のうち2つが索引に当たる。
// 索引だけで結果を返す実装だとこれが誤ヒットする。
check('検索: 索引に当たる語順違いを弾く',
  (await repo.search('転換政策')).notes.length, 0);
check('検索: コメント側の語順違いも弾く',
  (await repo.search('論点第2章')).notes.length, 0);

// 検索性能。全件が同じ語を含む最悪ケース。
// bigram を OR (anyOf) で引く実装では 2000 件で 78 秒かかった。
// 検索は入力のたびに走るので、ここが遅いと操作が破綻する。
{
  const perf = new Repository(createDb('perf-' + Date.now(), { indexedDB, IDBKeyRange }));
  const N = 400;
  for (let i = 0; i < N; i++) {
    await perf.saveReference({
      id: `p${i}`,
      csl: { id: `p${i}`, type: 'book', language: 'ja', title: `社会学研究 第${i}巻`,
             author: [{ family: '田中', given: '太郎' }],
             issued: { 'date-parts': [[2020]] }, publisher: '岩波書店' },
      source: { kind: 'manual', identifier: `p-${i}` },
    });
  }
  const t = Date.now();
  const hit = await perf.search('社会学研究');
  const ms = Date.now() - t;
  check('検索: 全件ヒットでも件数は正しい', hit.references.length, N);
  ok(`検索: 最悪ケースが実用的な速度（${ms}ms）`, ms < 1500,
     `${N}件で ${ms}ms かかった`);
}

// 論理削除
await repo.deleteReference('ref-1');
check('削除後は取得できない', await repo.getReference('ref-1'), undefined);
check('削除後は検索に出ない', (await repo.search('地方創生')).references.length, 0);
check('削除で紐づくノートも落ちる', (await repo.listNotes('ref-1')).length, 0);

// バックアップ往復
const repo2 = new Repository(createDb('run2-' + Date.now(), { indexedDB, IDBKeyRange }));
await repo2.saveReference({ id:'b1',
  csl:{ id:'b1', type:'book', title:'テスト本', language:'ja',
        author:[{family:'田中',given:'太郎'}], issued:{'date-parts':[[2020]]}, publisher:'X' },
  source:{ kind:'manual' } });
await repo2.saveNote({ referenceId:'b1', type:'direct', body:'引用文', comment:'コメント', locator:{page:'1'} });
const dump = await repo2.exportJson();

const repo3 = new Repository(createDb('run3-' + Date.now(), { indexedDB, IDBKeyRange }));
await repo3.importJson(JSON.parse(JSON.stringify(dump)));
check('バックアップ往復: 文献', (await repo3.listReferences()).length, 1);
check('バックアップ往復: コメントが残る',
  (await repo3.search('コメント')).notes[0]?.comment, 'コメント');
ok('バックアップ往復: 索引が再構築される',
   (await repo3.search('テスト本')).references.length === 1);

let rejected = false;
try { await repo3.importJson({ format:'other' }); } catch { rejected = true; }
ok('不正なバックアップを拒否', rejected);

// ---------- 出力 ----------

const { entries } = engine.renderBibliography(
  normalizeAll([F.JP_BOOK_3, F.EN_ARTICLE]), 'apu', { preserveOrder: true });
const rich = toRichHtml(entries);
// 引用文献一覧は2行目以降を全角4字下げる（マニュアル 5章）。
// ブロック引用の2字下げ（マニュアル 2.2）とは別の規定なので混同しないこと。
ok('リッチテキスト: ぶら下げインデントは全角4字',
   rich.includes('margin-left:4em') && rich.includes('text-indent:-4em'), rich);
ok('ブロック引用は全角2字下げのまま',
   blockQuoteHtml('引用文', '（甲, 2020, p.1）').includes('margin-left:2em'));
ok('リッチテキスト: 斜体が保たれる', rich.includes('<i>'));
ok('リッチテキスト: 数値文字参照が実体に戻る', rich.includes('&') && !rich.includes('&#38;'));
ok('リッチテキスト: タグ挿入を許さない',
   !toRichHtml(engine.renderBibliography(normalizeAll([{
     id:'evil', type:'book', language:'ja', title:'本<img src=x onerror=alert(1)>',
     author:[{family:'田',given:'中'}], issued:{'date-parts':[[2020]]}, publisher:'X',
   }]), 'apu').entries).includes('<img'));
ok('プレーンテキストにタグが残らない', !/<[a-z]/i.test(toPlainText(entries)));

// ---------- スタイル・パッケージ（他方式を足せる形か） ----------

// 登録簿の体裁
ok('パッケージ: 登録簿に apu がいる', STYLES.some((x) => x.id === 'apu'));
ok('パッケージ: 既定スタイルは apu', DEFAULT_STYLE_ID === 'apu');
ok('パッケージ: PRESET_STYLES は id/label/note だけを出す',
   PRESET_STYLES.every((x) => Object.keys(x).sort().join() === 'id,label,note'));

// 必須項目が揃っているか。足りないまま登録すると出力側で落ちる
for (const st of STYLES) {
  ok(`パッケージ[${st.id}]: 必要な定義が揃っている`,
     !!st.asset && Array.isArray(st.intextPatterns) && st.intextPatterns.length > 0
     && Array.isArray(st.refTypes) && st.refTypes.length > 0
     && typeof st.buildManualFields === 'function'
     && typeof st.layout?.hangingIndent === 'number'
     && typeof st.layout?.blockQuoteIndent === 'number'
     && typeof st.layout?.longQuoteChars === 'number'
     && !!st.sort?.defaultOrder);
  ok(`パッケージ[${st.id}]: 本文中の型がすべて build を持つ`,
     st.intextPatterns.every((p) => typeof p.build === 'function' && !!p.id && !!p.kind));
  ok(`パッケージ[${st.id}]: CSL が実在する`,
     fs2.existsSync(new URL(`../src/citation/styles/${st.id}/style.csl`, import.meta.url)));
}

// APU の規定値が package に載っているか（数値をここで固定しておく）
ok('パッケージ: APU のぶら下げは全角4字', styleOf('apu').layout.hangingIndent === 4);
ok('パッケージ: APU のブロック引用は全角2字', styleOf('apu').layout.blockQuoteIndent === 2);

// 未知の id は既定へ倒す（提供を減らしたとき保存済みデータが指しうる）
ok('パッケージ: 未知の id は既定スタイルへ倒す', styleOf('apa').id === 'apu');
ok('パッケージ: 未指定でも既定スタイルを返す', styleOf(undefined).id === 'apu');

// --- 出力層がスタイルの値を実際に見ているか ---
//
// パッケージ化の要は「方式ごとの数値がハードコードされていないこと」。
// 別方式を1つ登録簿へ挿し込み、アプリ側のコードに触れずに
// 出力が変わることを確かめる。
const fake = {
  id: '__test', label: '検証用', note: '', asset: '__test.csl',
  intextPatterns: [{
    id: 'plain', label: '素', kind: 'direct', hint: '',
    build: ({ body, name, year }) => ({ text: `[${name}/${year}] ${body}`, block: false }),
  }],
  refTypes: [{ id: 'book', label: '本', desc: '', cslType: 'book',
               format: '', section: '', fields: [] }],
  buildManualFields: () => ({}),
  layout: { hangingIndent: 1, blockQuoteIndent: 3, longQuoteChars: 5, lineHeight: '2.0' },
  sort: { defaultOrder: 'en-first', useReadings: false },
};
STYLES.push(fake);

ok('差し替え: 一覧のぶら下げ幅がスタイルに従う',
   toRichHtml(['<div class="csl-entry">あ</div>'], { styleId: '__test' })
     .includes('margin-left:1em;text-indent:-1em'));
ok('差し替え: 行間がスタイルに従う',
   toRichHtml(['<div class="csl-entry">あ</div>'], { styleId: '__test' })
     .includes('line-height:2.0'));
ok('差し替え: ブロック引用の下げ幅がスタイルに従う',
   blockQuoteHtml('引用', '(甲)', { styleId: '__test' }).includes('margin-left:3em'));
ok('差し替え: ブロック引用の閾値がスタイルに従う',
   isLongQuote('あいうえおか', '__test') && !isLongQuote('あいうえおか', 'apu'));
ok('差し替え: 本文中の型がスタイルのものになる',
   intextPatterns('__test').length === 1 && intextPatterns('apu').length === 5);
ok('差し替え: buildInText がスタイルの build を使う',
   buildInText({ patternId: 'plain', body: '本文',
                 citation: '（甲, 2020, p.1）', styleId: '__test' }).text
   === '[甲/2020] 本文');
ok('差し替え: 未知の型は先頭に倒す',
   buildInText({ patternId: 'no-such', body: '本文',
                 citation: '（甲, 2020）', styleId: '__test' }).block === false);
ok('差し替え: 種別一覧がスタイルのものになる', refTypesOf('__test').length === 1);

// プレーンテキストの下げ幅も layout 由来（全角スペースの数で見る）
{
  const one = engine.renderBibliography(normalizeAll([{
    id:'w1', type:'webpage', language:'ja', title:'ページ',
    author:[{literal:'環境省'}], issued:{'date-parts':[[2022]]},
    'container-title':'サイト', URL:'https://e.jp',
    accessed:{'date-parts':[[2023,1,15]]},
  }]), 'apu').entries;
  ok('差し替え: プレーンの下げ幅がスタイルに従う',
     toPlainText(one, { styleId: '__test' }).includes('\n\u3000＜https')
     && toPlainText(one, { styleId: 'apu' }).includes('\n\u3000\u3000\u3000\u3000＜https'));
}

// 並び順の既定もスタイル由来
{
  const mixed = [
    { id:'e', csl:{ id:'e', type:'book', title:'A Book',
       author:[{family:'Smith',given:'J.'}], issued:{'date-parts':[[2020]]} } },
    { id:'j', csl:{ id:'j', type:'book', title:'和の本', language:'ja',
       author:[{family:'田中',given:'太郎'}], issued:{'date-parts':[[2020]]} },
      transcription:{ authors:['タナカ, タロウ'] } },
  ];
  ok('差し替え: 並び順の既定がスタイルに従う',
     sortReferences(mixed, { styleId: 'apu' })[0].id === 'j'
     && sortReferences(mixed, { styleId: '__test' })[0].id === 'e');
}

STYLES.pop();
ok('差し替え: 後始末できている', STYLES.every((x) => x.id !== '__test'));

// ---------- 配信資産（公開してよいものだけか） ----------
//
// styles/ にはパッケージの JS や README も入っている。
// ディレクトリごと複製するとソースが公開側へ出る（実際に一度そうなった）。
{
  const dir = new URL('../public/csl/', import.meta.url);
  if (fs2.existsSync(dir)) {
    const files = fs2.readdirSync(dir);
    const allowed = new Set([
      ...STYLES.map((x) => x.asset),
      'locales-ja-JP.xml', 'locales-en-US.xml',
    ]);
    ok('配信資産: 余計なファイルを公開していない',
       files.every((n) => allowed.has(n)),
       files.filter((n) => !allowed.has(n)).join(', '));
    ok('配信資産: 各方式の CSL が揃っている',
       STYLES.every((x) => files.includes(x.asset)));
  }
}

// ---------- タイムアウト ----------
//
// 書誌 API は無応答になることがある（実測で NDL の初回に 12.5 秒）。
// 打ち切れないと画面が固まったまま戻らず、利用者に中断の手立てがない。
{
  // 応答しない fetch。abort されたときだけ reject する
  const hang = (url, init) => new Promise((_, rej) => {
    init?.signal?.addEventListener('abort', () => {
      const e = new Error('aborted'); e.name = 'AbortError'; rej(e);
    });
  });

  // --- 共通ヘルパ ---
  let timedOut = false;
  try {
    await fetchWithTimeout(hang, 'https://example.test/', { timeout: 200 });
  } catch (e) { timedOut = !!e.timeout; }
  ok('タイムアウト: 時間切れを timeout 印で返す', timedOut);

  ok('タイムアウト: 通信失敗と時間切れの文言が違う',
     describeError({ timeout: true }, 'X') !== describeError(new Error('down'), 'X'));
  ok('タイムアウト: 時間切れの文言は再試行を促す',
     /時間をおいて/.test(describeError({ timeout: true }, 'X')));
  ok('タイムアウト: 通信失敗の文言は接続確認を促す',
     /接続を確認/.test(describeError(new Error('down'), 'X')));

  // --- ISBN: 2 つの API を順に試すので 2 回ぶん待つ ---
  const t0 = Date.now();
  const r = await fetchByIsbn('9784000612142', { fetchImpl: hang, timeout: 300 });
  const spent = Date.now() - t0;
  ok('タイムアウト: ISBN 取込が待ち続けない', spent < 2000, `${spent}ms`);
  ok('タイムアウト: ISBN は「見つからない」と誤って伝えない',
     r.ok === false && !/見つかりませんでした（/.test(r.error) && /応答がありません/.test(r.error),
     r.error);

  // 2 API を順に試すときの全体上限。1 件ごとの制限だけでは倍待つ
  const t3 = Date.now();
  const budgeted = await fetchByIsbn('9784000612142',
    { fetchImpl: hang, timeout: 1000, totalBudget: 1200 });
  const bspent = Date.now() - t3;
  ok('タイムアウト: ISBN 全体の上限が効く', bspent < 1600, `${bspent}ms（2000なら未適用）`);
  ok('タイムアウト: 上限超過も時間切れとして伝える',
     budgeted.ok === false && /応答がありません/.test(budgeted.error));

  // --- DOI: 時間切れは再試行しない（3 回ぶん待たせない） ---
  const t1 = Date.now();
  const d = await fetchByDoi('10.1086/227049', { fetchImpl: hang, timeout: 300 });
  const dspent = Date.now() - t1;
  ok('タイムアウト: DOI の時間切れは再試行しない', dspent < 900, `${dspent}ms`);
  ok('タイムアウト: DOI が時間切れを伝える', d.ok === false && /応答がありません/.test(d.error));

  // --- 通常のネットワークエラーは従来どおり再試行する ---
  let calls = 0;
  const failing = () => { calls++; return Promise.reject(new Error('network down')); };
  const d2 = await fetchByDoi('10.1086/227049', { fetchImpl: failing, timeout: 300 });
  ok('タイムアウト: 通信エラーは従来どおり再試行する', calls === 3, `${calls}回`);
  ok('タイムアウト: 通信エラーは接続確認を促す', /接続を確認/.test(d2.error));

  // --- 検索も打ち切れる ---
  const t2 = Date.now();
  const sr = await searchNdl({ title: '社会学' }, { fetchImpl: hang, timeout: 300 });
  ok('タイムアウト: 著者名・タイトル検索が待ち続けない', Date.now() - t2 < 900);
  ok('タイムアウト: 検索が時間切れを伝える', sr.ok === false && /応答がありません/.test(sr.error));

  // --- 成功時にタイマーが邪魔をしないこと ---
  const okFetch = () => Promise.resolve({
    ok: true, status: 200,
    text: () => Promise.resolve('<rss></rss>'),
    json: () => Promise.resolve({ docs: [] }),
  });
  const good = await searchNdl({ title: 'x' }, { fetchImpl: okFetch, timeout: 5000 });
  ok('タイムアウト: 正常時は素通りする', good.ok === true);
}

// ---------- 使い方ページの例 ----------
//
// 出力例は画面側で引用エンジンに作らせている（直書きすると書式を直したとき
// 例だけ古くなる）。空や壊れた形で出ると、説明として成立しない。
{
  const book = {
    id:'sample-book', type:'book', language:'ja', title:'地域社会と多文化共生',
    author:[{family:'田中',given:'太郎'}], issued:{'date-parts':[[2020]]},
    publisher:'岩波書店',
  };
  const news = {
    id:'sample-news', type:'article-newspaper', language:'ja',
    title:'地方創生、次の一手は', author:[{family:'岡本',given:'淳'}],
    issued:{'date-parts':[[2022,8,2]]}, 'container-title':'読売新聞',
    URL:'https://www.example.co.jp/article', accessed:{'date-parts':[[2023,1,15]]},
  };
  const { entries } = engine.renderBibliography(
    normalizeAll([book, news]), 'apu', { preserveOrder: true });
  const b = htmlToPlain(entries[0]);
  const n = htmlToPlain(entries[1]);

  ok('使い方: 書籍の例が正しく出る',
     b === '田中太郎（2020）『地域社会と多文化共生』岩波書店.', b);
  ok('使い方: 新聞の例に改行と全角括弧が入る',
     n.includes('\n\u3000\u3000\u3000\u3000＜') && n.includes('＞'), n);

  const cite = engine.renderCitation(
    normalizeAll([book]), [{ id:'sample-book', locator:'45' }], 'apu');
  ok('使い方: 出典表記の例が正しい', cite === '（田中, 2020, p.45）', cite);

  // 画面はブロック引用以外の型を並べる。どれも空にならないこと
  const shown = intextPatterns('apu').filter((p) => p.id !== 'block');
  ok('使い方: 並べる引用の型が4つある', shown.length === 4, String(shown.length));
  ok('使い方: どの型の例も空にならない',
     shown.every((p) => {
       const t = buildInText({ patternId: p.id, body: '多文化共生は地域の課題である',
                               citation: cite, styleId: 'apu' }).text;
       return t.length > 10 && t.includes('田中') && t.includes('2020');
     }));

  // 手入力の種別一覧も画面に出す
  ok('使い方: 文献種別を一覧できる',
     refTypesOf('apu').length >= 10 && refTypesOf('apu').every((t) => !!t.label));
}

// ---------- 訳書の原著者名 ----------
//
// citeproc はカタカナ姓を CJK 名と判定し、sort-separator を無視して
// 空白で繋ぐ（実測: sort-separator=", " を与えても「ルーマン N.」）。
// CSL では変えられないので、一覧に渡す前に literal へ畳んでいる。
const LUHMANN = {
  id:'luhmann', type:'book', language:'ja',
  title:'信頼 : 社会的な複雑性の縮減メカニズム',
  author:[{family:'ルーマン',given:'N.'}],
  translator:[{family:'大庭',given:'健'},{family:'正村',given:'俊之'}],
  issued:{'date-parts':[[1990]]}, publisher:'勁草書房',
};
{
  const items = normalizeAll([LUHMANN]);
  const bib = htmlToPlain(engine.renderBibliography(items, 'apu').entries[0]);
  ok('訳書: 一覧は「ルーマン, N.」と読点で区切る',
     bib === 'ルーマン, N.（1990）『信頼 : 社会的な複雑性の縮減メカニズム』大庭健・正村俊之訳，勁草書房.',
     bib);

  // 本文中は姓のみ。literal を渡すとここが「ルーマン, N., 1990」になる
  const cite = engine.renderCitation(items, [{ id:'luhmann', locator:'40' }], 'apu');
  ok('訳書: 本文中の出典表記は姓のみ', cite === '（ルーマン, 1990, p.40）', cite);

  // 和名は続けて書く（巻き込んでいないこと）
  const jp = normalizeAll([{
    id:'jp', type:'book', language:'ja', title:'地域社会と多文化共生',
    author:[{family:'田中',given:'太郎'}], issued:{'date-parts':[[2020]]},
    publisher:'岩波書店',
  }]);
  ok('訳書: 和名は姓名を続けて書く',
     htmlToPlain(engine.renderBibliography(jp, 'apu').entries[0])
       === '田中太郎（2020）『地域社会と多文化共生』岩波書店.');

  // 訳者がいない和文の著者は畳まない
  const notFolded = foldTransliteratedNames(normalizeAll([{
    id:'x', type:'book', language:'ja', title:'本',
    author:[{family:'ルーマン',given:'N.'}], issued:{'date-parts':[[1990]]},
  }])[0]);
  ok('訳書: 訳者がいなければ畳まない', !notFolded.author[0].literal);

  // 欧文文献は従来どおり
  const en = normalizeAll([{
    id:'en', type:'book', title:'Liquid Modernity',
    author:[{family:'Bauman',given:'Zygmunt'}], issued:{'date-parts':[[2000]]},
    publisher:'Polity',
  }]);
  ok('訳書: 欧文文献は従来どおり',
     htmlToPlain(engine.renderBibliography(en, 'apu').entries[0]).startsWith('Bauman, Z.'));
}

// ---------- 抜き書きの一括書き出し ----------
{
  const items = normalizeAll([LUHMANN]);
  const notes = [
    { id:'n1', type:'direct', locator:{page:'40'},
      body:'信頼は不確定性を反省し、希望は不確定性を消去するのである',
      comment:'希望との対比が要点' },
    { id:'n2', type:'direct', locator:{page:'12-14'}, body:'複雑性の縮減という機能' },
    { id:'n3', type:'direct', locator:{}, body:'ページを書き忘れた引用' },
    { id:'n4', type:'indirect', body:'所感メモ' },
    { id:'n5', type:'direct', locator:{page:'9'}, body:'   ' },
  ];
  const r = buildQuoteList({ engine, items, referenceId:'luhmann', notes, styleId:'apu' });

  ok('一括: 直接引用だけを出す', r.lines.length === 2, String(r.lines.length));
  ok('一括: ページ数の無いものを数える', r.skipped === 1, String(r.skipped));
  ok('一括: 「〜〜」（著者, 年, p.数）の形に揃う',
     r.lines[0].text === '「信頼は不確定性を反省し、希望は不確定性を消去するのである」（ルーマン, 1990, p.40）。',
     r.lines[0].text);
  ok('一括: 複数ページは pp. になる', r.lines[1].text.includes('pp.12-14'), r.lines[1].text);
  ok('一括: 既定ではコメントを出さない', r.lines[0].comment === undefined);

  const rc = buildQuoteList({ engine, items, referenceId:'luhmann', notes,
                              styleId:'apu', withComment:true });
  ok('一括: 求められればコメントを添える', rc.lines[0].comment === '希望との対比が要点');

  const text = quoteListToText(rc.lines);
  ok('一括: プレーンでは引用とメモを行で分ける',
     text.includes('。\n［メモ］希望との対比が要点'), text.slice(0, 90));

  const html = quoteListToHtml(rc.lines);
  ok('一括: HTML でも引用とメモを分ける',
     html.includes('［メモ］') && html.includes('color:#666'));
  ok('一括: HTML にタグを埋め込ませない',
     !quoteListToHtml([{ text:'<img src=x onerror=alert(1)>' }]).includes('<img'));

  // 抜き書きが無ければ空で返る（画面側は何も出さない）
  const empty = buildQuoteList({ engine, items, referenceId:'luhmann',
                                 notes:[], styleId:'apu' });
  ok('一括: 抜き書きが無ければ空', empty.lines.length === 0 && empty.skipped === 0);
}

// ---------- 抜き書きの並べ替え ----------
{
  const mk = (id, created, page, commentAt) => ({
    id, createdAt: created, locator: page ? { page } : {},
    ...(commentAt ? { comment: 'メモ', commentAt } : {}),
  });
  const NS = [
    mk('A', '2026-01-01T00:00:00Z', '12-14', '2026-03-01T00:00:00Z'),
    mk('B', '2026-01-02T00:00:00Z', '7'),
    mk('C', '2026-01-03T00:00:00Z', '40', '2026-02-01T00:00:00Z'),
    mk('D', '2026-01-04T00:00:00Z', ''),
  ];
  const ids = (id) => sortNotes(NS, id).map((n) => n.id).join('');

  ok('並べ替え: 登録が新しい順', ids('created-desc') === 'DCBA', ids('created-desc'));
  ok('並べ替え: 登録が古い順', ids('created-asc') === 'ABCD', ids('created-asc'));

  // 文字列比較だと "7" > "12" になる。必ず数値で比べること
  ok('並べ替え: ページは数値で比べる', ids('page-asc') === 'BACD', ids('page-asc'));
  ok('並べ替え: 範囲は開始ページで見る', pageValue('12-14') === 12);
  ok('並べ替え: ページ降順', ids('page-desc') === 'CABD', ids('page-desc'));
  // 降順で先頭に来ると、本文を追う目的で並べたのに関係ない項目が最初に出る
  ok('並べ替え: ページ無しは向きによらず末尾',
     ids('page-asc').endsWith('D') && ids('page-desc').endsWith('D'));

  ok('並べ替え: コメントが新しい順', ids('comment-desc') === 'ACBD', ids('comment-desc'));
  ok('並べ替え: コメントが古い順', ids('comment-asc') === 'CABD', ids('comment-asc'));
  ok('並べ替え: コメント無しは末尾',
     ids('comment-desc').slice(-2) === 'BD' && ids('comment-asc').slice(-2) === 'BD');

  ok('並べ替え: 元の配列を壊さない', NS.map((n) => n.id).join('') === 'ABCD');
  ok('並べ替え: 未知の指定は既定へ倒す', ids('no-such') === ids(DEFAULT_NOTE_SORT));
  ok('並べ替え: 選択肢が6つある', NOTE_SORTS.length === 6);
  ok('並べ替え: 空でも落ちない', sortNotes([], 'page-asc').length === 0
     && sortNotes(undefined, 'page-asc').length === 0);
}

// commentAt はコメントの中身が変わったときだけ打ち直す。
// updatedAt はページ数の修正でも動くため、並べ替えには使えない
{
  const r = new Repository(createDb('notesort-' + Date.now(), { indexedDB, IDBKeyRange }));
  const ref = await r.saveReference({ csl: { id:'x', type:'book', title:'本' } });
  const n1 = await r.saveNote({ referenceId: ref.id, type:'direct',
                                body:'引用', locator:{page:'10'} });
  ok('commentAt: コメントが無ければ持たない', !n1.commentAt);

  const n2 = await r.saveNote({ ...n1, comment: '最初のメモ' });
  ok('commentAt: コメントを付けたら記録する', !!n2.commentAt);

  // ページ数だけ直す → commentAt は動かない
  await new Promise((res) => setTimeout(res, 5));
  const n3 = await r.saveNote({ ...n2, locator: { page: '11' } });
  ok('commentAt: 他を直しても動かない', n3.commentAt === n2.commentAt);
  ok('commentAt: updatedAt のほうは動く', n3.updatedAt !== n2.updatedAt);

  // コメントを書き換える → 打ち直す
  await new Promise((res) => setTimeout(res, 5));
  const n4 = await r.saveNote({ ...n3, comment: '書き換えた' });
  ok('commentAt: コメントを変えたら打ち直す', n4.commentAt !== n3.commentAt);

  // コメントを消す → 時刻も消す
  const n5 = await r.saveNote({ ...n4, comment: undefined });
  ok('commentAt: コメントを消したら時刻も消す', !n5.commentAt);

  // 旧データ（commentAt を持たない）は updatedAt で補う
  await r.db.notes.put({ ...n1, id:'old', comment:'昔のメモ',
                         commentAt: undefined, updatedAt:'2026-05-05T00:00:00Z' });
  const listed = await r.listNotes(ref.id);
  const old = listed.find((n) => n.id === 'old');
  ok('commentAt: 旧データは updatedAt で補う', old?.commentAt === '2026-05-05T00:00:00Z');
}

// ---------- データ保全 ----------
//
// 利用者の書誌・抜き書きはこの端末にしか無い。一度壊すと取り返しがつかない。
{
  // スキーマ定義から必須テーブルが欠けたら、開く前に止まること。
  // IndexedDB は `notes: null` の一行でテーブルを破棄でき、
  // しかも開いた瞬間に起きるため、事後には戻せない
  ok('保全: 必須テーブルの一覧がある',
     REQUIRED_TABLES.includes('references') && REQUIRED_TABLES.includes('notes')
     && REQUIRED_TABLES.includes('projects') && REQUIRED_TABLES.includes('settings'));

  {
    const db = createDb('guard-' + Date.now(), { indexedDB, IDBKeyRange });
    // 誤ってテーブルを破棄する版を足した状況を作る
    db.version(99).stores({ notes: null });
    let blocked = false;
    try { await db.open(); } catch { blocked = true; }
    ok('保全: テーブルを消す変更は開く前に止まる', blocked);
    // 止まった以上、破棄は適用されていない
    ok('保全: 止まったので破棄は適用されない', !db.isOpen());
  }

  // 取込の検証。replace は既存を消してから書くので、
  // 壊れたファイルを受け取ると「消しただけ」で終わりかねない
  const seed = async () => {
    const r = new Repository(createDb('imp-' + Math.random(), { indexedDB, IDBKeyRange }));
    const ref = await r.saveReference({ csl: { id:'x', type:'book', title:'大事な文献' } });
    await r.saveNote({ referenceId: ref.id, type:'direct', body:'大事な抜き書き',
                       locator:{ page:'40' } });
    return r;
  };

  {
    const r = await seed();
    let stopped = false;
    try { await r.importJson({ format:'refcite-backup', references:'壊れている' },
                             { mode:'replace' }); }
    catch { stopped = true; }
    ok('保全: 壊れたバックアップを断る', stopped);
    ok('保全: 断ったので既存が残る', (await r.listReferences()).length === 1);
  }

  {
    const r = await seed();
    let stopped = false;
    try { await r.importJson({ format:'refcite-backup', references:[], notes:[], projects:[] },
                             { mode:'replace' }); }
    catch { stopped = true; }
    ok('保全: 空のファイルでの replace を断る', stopped);
    ok('保全: 断ったので既存が残る（空ファイル）', (await r.listReferences()).length === 1);
  }

  {
    // 正常なファイルは通ること（守りが厳しすぎて使えないのでは意味がない）
    const src = await seed();
    const dump = await src.exportJson();
    const dst = await seed();
    const res = await dst.importJson(dump, { mode:'replace' });
    ok('保全: 正常なバックアップは通る', res.references === 1 && res.notes === 1);
  }

  // 削除は論理削除。物理削除しないので書き戻せる
  {
    const r = await seed();
    const [ref] = await r.listReferences();
    await r.deleteReference(ref.id);
    ok('保全: 削除は論理削除（レコードは残る）',
       (await r.db.references.get(ref.id))?.deletedAt != null);
    ok('保全: 削除した文献の抜き書きも論理削除',
       (await r.db.notes.toArray()).every((n) => n.deletedAt != null));
  }

  // 保存で既存の項目が失われないか調べる道具
  ok('保全: 項目が消えるのを見つける',
     losingFields({ title:'あり', page:'40' }, { title:'あり' }, ['title','page'])
       .join() === 'page');
  ok('保全: もともと無い項目は数えない',
     losingFields({ title:'あり' }, { title:'あり' }, ['title','page']).length === 0);
  ok('保全: 新規保存では何も報せない',
     losingFields(null, { title:'あり' }, ['title']).length === 0);
}

// ---------- プロジェクトから外す ----------
//
// 「外す」は「削除」ではない。文献は書架に残り、抜き書きも消えない。
// 取り違えると、他のレポートで使っている文献まで巻き添えになる
{
  const r = new Repository(createDb('rm-' + Date.now(), { indexedDB, IDBKeyRange }));
  const pA = await r.saveProject({ name: 'レポートA' });
  const pB = await r.saveProject({ name: 'レポートB' });
  const ref = await r.saveReference({
    csl: { id:'x', type:'book', title:'共有する文献' },
    projectIds: [pA.id, pB.id],
  });
  await r.saveNote({ referenceId: ref.id, type:'direct', body:'抜き書き',
                     locator:{ page:'1' } });

  await r.removeFromProject('reference', ref.id, pA.id);

  ok('外す: 指定したプロジェクトから消える',
     (await r.listProjectReferences(pA.id)).length === 0);
  ok('外す: 他のプロジェクトには残る',
     (await r.listProjectReferences(pB.id)).length === 1);
  ok('外す: 書架には残る', (await r.listReferences()).length === 1);
  ok('外す: 抜き書きは消えない', (await r.listNotes(ref.id)).length === 1);
  ok('外す: 論理削除もされない',
     (await r.db.references.get(ref.id))?.deletedAt == null);

  // 入れ直せること
  await r.assignToProject('reference', ref.id, pA.id);
  ok('外す: 入れ直せる', (await r.listProjectReferences(pA.id)).length === 1);

  // 属していないプロジェクトから外しても壊れない
  const pC = await r.saveProject({ name: 'レポートC' });
  await r.removeFromProject('reference', ref.id, pC.id);
  ok('外す: 属していなくても壊れない', (await r.listReferences()).length === 1);
}

// ---------- 抜き書きの編集 ----------
//
// 画面は既存レコードを土台にして保存する。項目を並べ直すと、
// そこに書いていない値（projectIds・chapter など）が黙って消える
{
  const r = new Repository(createDb('ed-' + Date.now(), { indexedDB, IDBKeyRange }));
  const ref = await r.saveReference({ csl: { id:'x', type:'book', title:'本' } });
  const n = await r.saveNote({
    referenceId: ref.id, type:'direct', body:'元の引用', comment:'元のコメント',
    locator:{ page:'40', chapter:'第2章' }, projectIds:['p1','p2'],
  });

  // 画面と同じ形（既存を spread して一部だけ差し替える）
  const saved = await r.saveNote({
    ...n, body:'直した引用', comment:'直したコメント',
    locator:{ ...n.locator, page:'41' },
  });

  ok('編集: 本文が変わる', saved.body === '直した引用');
  ok('編集: コメントが変わる', saved.comment === '直したコメント');
  ok('編集: ページが変わる', saved.locator.page === '41');
  ok('編集: 触っていない locator の項目が残る', saved.locator.chapter === '第2章');
  ok('編集: プロジェクトの割り当てが残る', saved.projectIds?.length === 2);
  ok('編集: 登録日時は変わらない', saved.createdAt === n.createdAt);

  // 本文を書き換えたら検索索引も作り直されること。
  // 古いままだと、直した抜き書きが検索で引けなくなる
  const hit = await r.search('直した引用');
  ok('編集: 新しい本文で検索できる', hit.notes.length === 1);
  const stale = await r.search('元の引用');
  ok('編集: 古い本文では引けない', stale.notes.length === 0);

  // コメントを消せること（空文字は undefined になる）
  const cleared = await r.saveNote({ ...saved, comment: undefined });
  ok('編集: コメントを消せる', !cleared.comment);
  ok('編集: コメントを消したら commentAt も消える', !cleared.commentAt);
}

// ---------- 「すべての文献」表示 ----------
//
// プロジェクトに属さない文献が埋もれると、取り込んだのに見つからない
// という状態になる。全件表示はその受け皿
{
  const r = new Repository(createDb('all-' + Date.now(), { indexedDB, IDBKeyRange }));
  const pA = await r.saveProject({ name: 'レポートA' });
  await r.saveReference({ csl:{ id:'a', type:'book', title:'Aに属する' },
                          projectIds:[pA.id] });
  await r.saveReference({ csl:{ id:'b', type:'book', title:'どこにも属さない' },
                          projectIds:[] });
  const del = await r.saveReference({ csl:{ id:'c', type:'book', title:'削除済み' },
                                      projectIds:[pA.id] });
  await r.deleteReference(del.id);

  const all = await r.listReferences();
  const titles = all.map((x) => x.csl.title);
  ok('全件: プロジェクト未所属の文献も並ぶ', titles.includes('どこにも属さない'));
  ok('全件: 所属済みの文献も並ぶ', titles.includes('Aに属する'));
  ok('全件: 削除済みは並ばない', !titles.includes('削除済み'));
  ok('全件: 件数が合う', all.length === 2, String(all.length));

  // プロジェクト表示は絞られること（全件表示と混同していない）
  const inA = await r.listProjectReferences(pA.id);
  ok('全件: プロジェクト表示は絞られる',
     inA.length === 1 && inA[0].csl.title === 'Aに属する');
}

// ---------- 結果 ----------

console.log('');
if (failures.length) {
  console.log('失敗:');
  failures.forEach((f) => console.log('  ✗ ' + f));
  console.log('');
}
console.log(`${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
