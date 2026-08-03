/**
 * 引用エンジンの型定義（JSDoc）
 *
 * 書誌データは CSL-JSON を正とする。citeproc-js にそのまま渡せる形を保つことで
 * 変換層を持たずに済み、将来の Zotero 連携も自明になる。
 */

/**
 * CSL-JSON の人名。
 * 和名は family/given に分割して保持する。NDL API が姓名分割済みで返すため
 * この形に素直に載る。
 * @typedef {Object} CSLName
 * @property {string} [family]
 * @property {string} [given]
 * @property {string} [literal]  分割できない団体名等
 */

/**
 * @typedef {Object} CSLDate
 * @property {number[][]} [date-parts]  [[2018, 7]] のような形
 * @property {string} [literal]
 */

/**
 * @typedef {Object} CSLItem
 * @property {string} id
 * @property {string} type            'book' | 'article-journal' | 'chapter' ...
 * @property {string} [title]
 * @property {CSLName[]} [author]
 * @property {CSLName[]} [translator]
 * @property {CSLName[]} [editor]
 * @property {CSLDate} [issued]
 * @property {string} [publisher]
 * @property {string} [publisher-place]
 * @property {string} [container-title]  雑誌名・書名（論文の場合）
 * @property {string} [volume]
 * @property {string} [issue]
 * @property {string} [page]
 * @property {string} [DOI]
 * @property {string} [ISBN]
 * @property {string} [URL]
 * @property {string} [language]        'ja' | 'en' ...
 * @property {string} [edition]
 * @property {string} [annote]        和文フラグ（normalize.js が付ける・§9.2a）
 * @property {boolean} [_authorUnknown] 著者不明を補完した印
 */

/**
 * アプリ内部の文献レコード。CSL-JSON を包み、アプリ固有情報を外側に持つ。
 * @typedef {Object} Reference
 * @property {string} id
 * @property {CSLItem} csl
 * @property {Object} [transcription]   読み仮名（50音順ソート用・NDL 由来）
 * @property {string} [transcription.title]
 * @property {string[]} [transcription.authors]
 * @property {Object} source
 * @property {string[]} projectIds
 */

export const CSL_TYPES = /** @type {const} */ ([
  'book',
  'chapter',
  'article-journal',
  'thesis',
  'webpage',
  'paper-conference',
]);

/** 引用として成立するために最低限必要なフィールド（§6.2 の警告 UI が参照） */
export const REQUIRED_FIELDS = {
  book: ['author', 'title', 'issued', 'publisher'],
  chapter: ['author', 'title', 'container-title', 'issued', 'publisher'],
  'article-journal': ['author', 'title', 'container-title', 'issued'],
  thesis: ['author', 'title', 'issued'],
  webpage: ['title', 'URL'],
  'paper-conference': ['author', 'title', 'issued'],
};

export {};
