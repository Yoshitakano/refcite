/**
 * 引用スタイル・パッケージの型
 *
 * 1つの引用方式に必要なものを1か所へまとめるための取り決め。
 * CSL ファイルだけでは表せない規定（本文中の引用の型、種別ごとの入力欄、
 * 一覧のインデント幅、並び順）を同じパッケージに置く。
 *
 * 新しい方式を足すときは styles/<id>/ を作り、この形の既定値を
 * default export して styles/index.js の REGISTRY に登録する。
 * アプリ側のコードには一切触れなくてよい。
 *
 * @typedef {Object} CitationStyle
 * @property {string} id                    識別子（'apu'）。保存済みデータが参照する
 * @property {string} label                 画面に出す名前
 * @property {string} note                  補足（提供元など）
 * @property {string} asset                 CSL ファイル名。public/csl/ 配下の名前
 * @property {IntextPattern[]} intextPatterns  本文中の引用の型
 * @property {RefType[]} refTypes           手入力の文献種別と入力欄
 * @property {Layout} layout                出力の体裁
 * @property {SortRule} sort                引用文献一覧の並び順
 *
 * @typedef {Object} IntextPattern
 * @property {string} id
 * @property {string} label
 * @property {'direct'|'indirect'} kind
 * @property {string} hint                  画面に出す書式の見本
 * @property {(parts: CiteParts) => {text:string, block:boolean}} build
 *   出典表記の部品から本文へ差し込む文字列を作る。
 *   block が true ならブロック引用として貼る。
 *
 * @typedef {Object} CiteParts
 * @property {string} body      引用文・要約（利用者の入力）
 * @property {string} citation  引用エンジンが作った出典表記の全体
 * @property {string} name      著者名だけ
 * @property {string} year      年（接尾辞 a/b/c を含む）
 * @property {string} page      ページ部分（'p.45' / 'pp.10-12'）
 *
 * @typedef {Object} Layout
 * @property {number} hangingIndent   一覧の2行目以降の下げ幅（全角字数）
 * @property {number} blockQuoteIndent ブロック引用の下げ幅（全角字数）
 * @property {number} longQuoteChars  ブロック引用に切り替える文字数の目安
 * @property {string} lineHeight      行間
 *
 * @typedef {Object} SortRule
 * @property {'ja-first'|'en-first'} defaultOrder
 * @property {boolean} useReadings    和文を読み仮名で並べるか
 *
 * @typedef {Object} RefType
 * @property {string} id
 * @property {string} label           画面に出す種別名
 * @property {string} desc            補足説明
 * @property {string} cslType         CSL-JSON の type
 * @property {string} format          書式の見本（規定の記載どおり）
 * @property {string} section         典拠（'マニュアル 5.1' など）
 * @property {Field[]} fields         入力欄。書式に現れる順に並べる
 * @property {string} [note]          注意書き
 *
 * @typedef {Object} Field
 * @property {string} key
 * @property {string} label
 * @property {'text'|'lines'|'date'} type
 * @property {boolean} [required]
 * @property {string} [placeholder]
 * @property {string} [hint]
 * @property {'short'} [width]
 */

export {};
