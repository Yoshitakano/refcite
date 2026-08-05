/**
 * 引用エンジンの公開 API
 *
 * 引用方式は styles/ 配下にパッケージとして置く。1方式に必要なもの
 * （CSL・本文中の引用の型・種別ごとの入力欄・体裁・並び順）が
 * 1ディレクトリにまとまっているので、方式を足すときは
 * styles/<id>/ を作って styles/index.js に登録するだけでよい。
 *
 * 現在の提供:
 *   - apu : APU ライティング・マニュアル形式
 */

export { CitationEngine, htmlToPlain, sanitizeSpacing } from './engine.js';
export { normalizeItem, normalizeAll, normalizeForBibliography,
         foldTransliteratedNames, isJapanese, extractYear } from './normalize.js';
export { sortReferences, findMissingReadings, kanaToHira } from './sort.js';
export { REQUIRED_FIELDS, CSL_TYPES } from './types.js';
export { intextPatterns, buildInText, isLongQuote, citeParts } from './intext.js';
export { buildQuoteList, quoteListToText, quoteListToHtml } from './quotes.js';
export { toRichHtml, toPlainText, blockQuoteHtml,
         copyToClipboard, downloadText } from './export.js';

// スタイル・パッケージ
export { STYLES, PRESET_STYLES, DEFAULT_STYLE_ID, styleOf } from './styles/index.js';
export { refTypesOf, refTypeOf, buildManualFields, missingRequired } from './reftypes.js';

/**
 * 引用に必要な項目が欠けていないか検査する（仕様 3.3-1 の警告 UI 用）。
 *
 * @param {import('./types.js').CSLItem} item
 * @param {Object} [opts]
 * @param {boolean} [opts.hasDirectQuote]  直接引用ノートが紐づくか
 * @returns {{ level:'error'|'warn'|'ok', field:string, message:string }[]}
 */
export function validateItem(item, opts = {}) {
  const issues = [];
  const required = {
    book: ['author', 'title', 'issued', 'publisher'],
    chapter: ['author', 'title', 'container-title', 'issued', 'publisher'],
    'article-journal': ['author', 'title', 'container-title', 'issued'],
    thesis: ['author', 'title', 'issued'],
    webpage: ['title', 'URL'],
    'paper-conference': ['author', 'title', 'issued'],
  }[item.type] ?? ['author', 'title', 'issued'];

  const LABEL = {
    author: '著者', title: 'タイトル', issued: '出版年',
    publisher: '出版社', 'container-title': '収録誌・書名', URL: 'URL',
  };

  for (const f of required) {
    const v = item[f];
    const empty = v == null
      || (Array.isArray(v) && v.length === 0)
      || (typeof v === 'string' && v.trim() === '')
      || (f === 'issued' && !v?.['date-parts'] && !v?.literal);
    if (empty) {
      issues.push({
        level: 'error',
        field: f,
        message: `${LABEL[f] ?? f}が未入力です。引用として成立しません`,
      });
    }
  }

  // 直接引用があるのにページ番号が無い場合（APU マニュアル 2.1）
  if (opts.hasDirectQuote && !item.page && !item.locator) {
    issues.push({
      level: 'warn',
      field: 'page',
      message: '直接引用にはページ番号（p. / pp.）が必要です',
    });
  }

  return issues;
}
