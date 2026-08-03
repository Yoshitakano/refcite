/**
 * 引用文献リストの出力（仕様 3.4）
 *
 * 3.4-2 リッチテキスト（HTML）でのクリップボードコピー
 * 3.4-3 プレーンテキスト（.txt）書き出し
 */

import { htmlToPlain, sanitizeSpacing } from './engine.js';
import { styleOf } from './styles/index.js';

/**
 * 引用文献一覧を Word / Google ドキュメント貼付用の HTML にする。
 *
 * ぶら下げインデント（hanging indent）は Word が margin-left + text-indent の
 * 組で解釈するため、CSS クラスではなくインラインスタイルで書く。
 * クラス定義はコピー時に失われる。
 *
 * 下げ幅はスタイルの layout から取る。和文では 1em が全角1字ぶんなので
 * 全角字数をそのまま em に読み替えられる。
 *
 * @param {string[]} entries  citeproc が返す HTML エントリ
 * @param {Object} [opts]
 * @param {string} [opts.heading]  見出し（例: '引用文献'）
 * @param {string} [opts.styleId]
 * @returns {string}
 */
export function toRichHtml(entries, opts = {}) {
  const { hangingIndent, lineHeight } = styleOf(opts.styleId).layout;

  const body = entries
    .map((e) => {
      // citeproc の <div class="csl-entry"> を、書式が保たれる形に置換する
      const inner = e.replace(/^<div[^>]*>/, '').replace(/<\/div>$/, '');
      return (
        '<p style="margin:0 0 0.5em 0;padding:0;' +
        `margin-left:${hangingIndent}em;text-indent:-${hangingIndent}em;` +
        `line-height:${lineHeight};">` +
        // URL の直前で改行する（マニュアル 5.6 / 5.7）。
        // CSL は改行を出せないので、目印（U+000B）を置いて変換している。
        decodeNumericEntities(sanitizeSpacing(inner)).replace(/\v/g, '<br>') +
        '</p>'
      );
    })
    .join('\n');

  const heading = opts.heading
    ? `<p style="margin:0 0 0.8em 0;font-weight:bold;">${escapeHtml(opts.heading)}</p>\n`
    : '';

  return `<div>\n${heading}${body}\n</div>`;
}

/**
 * ブロック引用（長い直接引用）の HTML。
 * 下げ幅は一覧のぶら下げインデントとは別規定なので、スタイルの
 * layout.blockQuoteIndent を使う（APU マニュアル 2.2 では全角2字）。
 *
 * @param {string} text   引用文（プレーンテキスト）
 * @param {string} source 出典表記（例: '(田中, 2020, p.10)'）
 * @param {Object} [opts]
 * @param {string} [opts.styleId]
 */
export function blockQuoteHtml(text, source, opts = {}) {
  const { blockQuoteIndent, lineHeight } = styleOf(opts.styleId).layout;
  return (
    `<p style="margin:1em 0;padding:0;margin-left:${blockQuoteIndent}em;` +
    `line-height:${lineHeight};">` +
    escapeHtml(text) +
    (source ? ` ${escapeHtml(source)}` : '') +
    '</p>'
  );
}

/**
 * プレーンテキスト版（.txt 書き出し / クリップボードの text/plain 側）。
 * @param {string[]} entries
 * @param {Object} [opts]
 * @param {string} [opts.heading]
 * @param {string} [opts.styleId]
 * @returns {string}
 */
export function toPlainText(entries, opts = {}) {
  // 改行の目印は htmlToPlain が実際の改行へ変える。
  // プレーンテキストにはインデントの概念が無いので、折り返した行は
  // スタイルの下げ幅ぶんの全角スペースで代用する。
  const indent = styleOf(opts.styleId).layout.hangingIndent;
  const lines = entries.map((e) => htmlToPlain(e, { indent }));
  return (opts.heading ? `${opts.heading}\n\n` : '') + lines.join('\n');
}

/**
 * クリップボードへ HTML とプレーンテキストの両方を載せる。
 *
 * 注意: Safari は clipboard.write() をユーザー操作起因のハンドラ内でしか
 * 許可せず、await を挟むと失敗する。そのため ClipboardItem に渡す Blob は
 * 呼び出し時点で同期的に構築しておくこと（この関数はその前提で書いてある）。
 *
 * @param {string} html
 * @param {string} plain
 * @returns {Promise<void>}
 */
export function copyToClipboard(html, plain) {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    // 古いブラウザ向けフォールバック（プレーンのみ）
    return navigator.clipboard.writeText(plain);
  }
  const item = new ClipboardItem({
    'text/html': new Blob([html], { type: 'text/html' }),
    'text/plain': new Blob([plain], { type: 'text/plain' }),
  });
  return navigator.clipboard.write([item]);
}

/**
 * .txt としてダウンロードさせる（仕様 3.4-3）。
 * @param {string} text
 * @param {string} filename
 */
export function downloadText(text, filename = 'references.txt') {
  // BOM を付ける。Windows 版 Word / メモ帳が UTF-8 を誤判定するのを防ぐ
  const blob = new Blob(['﻿' + text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * citeproc が出す数値文字参照（&#38; など）を、表示される形へ直す。
 *
 * これを残したまま Word に貼ると "&#38;" の文字列として見えてしまう。
 *
 * `<` `>` は生の文字に戻すとタグと誤認されるため、名前付き実体
 * （&lt; &gt;）へ変換する。ウェブサイト・新聞記事の URL は
 * 「<https://…>」と山括弧で囲む規定（マニュアル 5.6 / 5.7）なので、
 * この経路を通る文献が実際にある。
 */
function decodeNumericEntities(s) {
  return s
    .replace(/&#60;/g, '&lt;')
    .replace(/&#62;/g, '&gt;')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
