/**
 * 抜き書きの一括書き出し
 *
 * 1つの文献に溜めた抜き書きを、すべて直接引用の形
 * 「〜〜」（著者, 年, p.数）で出す。1件ずつコピーするより、
 * まとめて下書きへ流し込んでから削るほうが書きやすい。
 *
 * 出典表記は引用エンジンに作らせる。文字列連結で組むと
 * p./pp. の使い分けや、同一著者・同年の a/b/c が落ちる。
 */

import { buildInText } from './intext.js';

/**
 * 抜き書きを直接引用の形へ揃えて並べる。
 *
 * @param {Object} opts
 * @param {Object} opts.engine     CitationEngine
 * @param {Object[]} opts.items    正規化済みの全書誌（同一著者の判別に要る）
 * @param {string} opts.referenceId  対象文献の CSL id
 * @param {Object[]} opts.notes    その文献のノート
 * @param {string} [opts.styleId]
 * @param {boolean} [opts.withComment]  自分のコメントも添えるか
 * @returns {{ lines: {text:string, comment?:string, page?:string}[], skipped: number }}
 *   skipped はページ数が無く出力できなかった件数
 */
export function buildQuoteList({
  engine, items, referenceId, notes, styleId, withComment = false,
}) {
  const quotes = (notes ?? []).filter((n) => n.type === 'direct' && n.body?.trim());

  const lines = [];
  let skipped = 0;

  for (const n of quotes) {
    const page = n.locator?.page?.trim();
    // ページ数の無い直接引用は引用として成立しない（マニュアル 2.1）。
    // 黙って出すと不完全な引用がそのまま本文へ移るので、出さずに数える。
    if (!page) { skipped++; continue; }

    const citation = engine.renderCitation(
      items, [{ id: referenceId, locator: page }], styleId);

    const { text } = buildInText({
      patternId: 'quote-tail',   // 「〜〜」（著者, 年, p.数）。
      body: n.body,
      citation,
      styleId,
    });

    lines.push({
      text,
      page,
      comment: withComment ? (n.comment?.trim() || undefined) : undefined,
    });
  }

  return { lines, skipped };
}

/**
 * 書き出し結果をプレーンテキストにする。
 * コメントは引用と混ざらないよう行を分け、印を付ける。
 *
 * @param {{text:string, comment?:string}[]} lines
 * @returns {string}
 */
export function quoteListToText(lines) {
  return lines
    .map((l) => (l.comment ? `${l.text}\n［メモ］${l.comment}` : l.text))
    .join('\n\n');
}

/**
 * 書き出し結果を Word 貼付用の HTML にする。
 *
 * 引用と自分のコメントは見た目でも分ける。混ざったまま本文へ
 * 転記されると剽窃になりかねない。
 *
 * @param {{text:string, comment?:string}[]} lines
 * @param {Object} [opts]
 * @param {string} [opts.heading]
 * @returns {string}
 */
export function quoteListToHtml(lines, opts = {}) {
  const body = lines.map((l) => {
    const quote = `<p style="margin:0 0 .35em 0;line-height:1.9;">${esc(l.text)}</p>`;
    if (!l.comment) return quote;
    return quote
      + '<p style="margin:0 0 1em 0;line-height:1.8;color:#666;font-size:.95em;">'
      + `［メモ］${esc(l.comment)}</p>`;
  }).join('\n');

  const heading = opts.heading
    ? `<p style="margin:0 0 .8em 0;font-weight:bold;">${esc(opts.heading)}</p>\n`
    : '';

  return `<div>\n${heading}${body}\n</div>`;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
