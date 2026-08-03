/**
 * APU ライティング・マニュアル形式
 *
 * 立命館アジア太平洋大学のライティング・マニュアルに準拠した引用方式。
 * このディレクトリで完結させてあるので、他方式を足すときは apu/ を
 * 複製して中身を差し替え、styles/index.js に登録すればよい。
 *
 *   style.csl    引用文献一覧・出典表記の書式（CSL）
 *   intext.js    本文中の引用の型（マニュアル 2章・3章・7章）
 *   reftypes.js  手入力の文献種別と入力欄（マニュアル 5章・9章）
 *   index.js     このファイル。上をまとめて1つの定義にする
 *
 * CSL で表せない規定（インデント幅・並び順）も、CSL の外側ではなく
 * ここに書く。方式ごとに違う値なので、出力側に固定で持たせると
 * 2つ目の方式を足した時点で破綻する。
 */

import { INTEXT_PATTERNS } from './intext.js';
import { REF_TYPES, buildManualFields } from './reftypes.js';

/** @type {import('../types.js').CitationStyle} */
const apu = {
  id: 'apu',
  label: 'APU ライティング・マニュアル',
  note: '立命館アジア太平洋大学',

  // public/csl/ 配下へ配信されるファイル名。
  // ビルド時に next.config.mjs が <id>.csl として書き出す。
  asset: 'apu.csl',

  intextPatterns: INTEXT_PATTERNS,
  refTypes: REF_TYPES,

  // 入力値から CSL-JSON への組み立て。編書は編者を著者位置に置く、
  // 新聞は日付を年月日まで持つ、といった方式固有の扱いを吸収する。
  buildManualFields,

  layout: {
    // 引用文献一覧の2行目以降は全角4字下げ（マニュアル 5章）
    hangingIndent: 4,
    // ブロック引用は全角2字下げ（マニュアル 2.2）。
    // 一覧のぶら下げインデントとは別規定なので、片方を直すとき
    // もう片方を巻き込まないこと。
    blockQuoteIndent: 2,
    // 4〜5行以上でブロック引用に切り替える（マニュアル 2.2）。
    // 行数は貼り付け先の幅で変わるため、和文 40字 × 4行 ≒ 160字で近似する。
    longQuoteChars: 160,
    lineHeight: '1.8',
  },

  sort: {
    // 和文のみなら50音順、欧文が混じるならアルファベット順（マニュアル 5.1）。
    // 混在時は和文ブロック → 欧文ブロックの順に置く。
    defaultOrder: 'ja-first',
    // 漢字のコードポイント順は50音順と一致しないため読み仮名を使う
    useReadings: true,
  },
};

export default apu;
