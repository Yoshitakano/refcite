/**
 * 本文中の引用の組み立て（方式によらない部分）
 *
 * 出典表記そのものは引用エンジンが作る。ここでの仕事は、その表記を
 * 部品（著者名・年・ページ）に分け、選ばれたスタイルの型に渡すこと。
 * 型そのもの（どう地の文と組むか）は各スタイルのパッケージが持つ。
 */

import { styleOf } from './styles/index.js';

/**
 * 本文中の引用の型の一覧。
 * @param {string} [styleId]
 * @returns {import('./styles/types.js').IntextPattern[]}
 */
export function intextPatterns(styleId) {
  return styleOf(styleId).intextPatterns;
}

/**
 * ブロック引用にすべき長さか。
 * 閾値はスタイルごとの規定（APU はマニュアル 2.2 の 4〜5行）。
 *
 * @param {string} text
 * @param {string} [styleId]
 */
export function isLongQuote(text, styleId) {
  return String(text ?? '').length >= styleOf(styleId).layout.longQuoteChars;
}

/**
 * 出典表記を部品に分ける。
 *
 * 「（石井, 1991b, pp.10-12）」→
 *   { name:'石井', year:'1991b', page:'pp.10-12' }
 *
 * @param {string} citation
 * @returns {{name:string, year:string, page:string}}
 */
export function citeParts(citation) {
  const s = String(citation ?? '');
  const inner = s.replace(/^[（(]|[）)]$/g, '');
  return {
    name: inner.split(/,\s*/)[0] ?? '',
    year: s.match(/(\d{4}[a-z]?)/)?.[1] ?? '',
    page: s.match(/pp?\.[^）)]+/)?.[0] ?? '',
  };
}

/**
 * 本文へ差し込む形の引用文を組み立てる。
 *
 * @param {Object} opts
 * @param {string} opts.patternId  スタイルの intextPatterns の id
 * @param {string} opts.body       引用文または要約
 * @param {string} opts.citation   引用エンジンが作った出典表記
 * @param {string} [opts.styleId]
 * @returns {{ text:string, block:boolean }}
 *   block が true ならブロック引用（下げ幅はスタイルの layout に従う）
 */
export function buildInText({ patternId, body, citation, styleId }) {
  const patterns = styleOf(styleId).intextPatterns;
  // 未知の id では先頭の型に倒す。スタイルを切り替えたとき、
  // 保存済みのノートが他方式にしか無い型を指すことがある。
  const pattern = patterns.find((p) => p.id === patternId) ?? patterns[0];

  const text = String(body ?? '').trim();
  const cite = String(citation ?? '').trim();

  return pattern.build({ body: text, citation: cite, ...citeParts(cite) });
}
