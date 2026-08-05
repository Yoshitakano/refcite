/**
 * ローカル DB スキーマ（設計書 §3）
 *
 * IndexedDB を Dexie 経由で使う。サーバを持たない設計のため、ここが唯一の
 * 永続化層になる（§1.1）。フェーズ2 の同期に備え、全エンティティに
 * UUID・createdAt・updatedAt・deletedAt（論理削除）を持たせる。
 *
 * 全文検索（仕様 3.3-2）は bigram インデックスで実現する。日本語は
 * 空白で語が区切られないため、単純な前方一致では「共同性」を含む本文を
 * 「同性」で引けてしまったり、逆に中間一致が引けなかったりする。
 * 形態素解析器は辞書が数 MB あり初回ロードが重いので、MVP では
 * 2文字組（bigram）の多値インデックスで妥協する。学生の文献数（数百件）
 * なら実用速度に収まる。
 */

import Dexie from 'dexie';

/** 検索対象から除く文字（記号・空白）*/
const IGNORE = /[\s　-〿＀-／：-＠!-/:-@[-`{-~]/g;

/**
 * 文字列を bigram の配列にする。
 * 1文字だけの語も引けるよう、1文字の場合はその文字自体を返す。
 *
 * @param {string} text
 * @returns {string[]} 重複を除いた bigram
 */
export function toBigrams(text) {
  const s = String(text ?? '')
    .toLowerCase()
    .replace(IGNORE, '');
  if (!s) return [];
  if (s.length === 1) return [s];
  const out = new Set();
  for (let i = 0; i < s.length - 1; i++) {
    out.add(s.slice(i, i + 2));
  }
  return [...out];
}

/**
 * 検索クエリを bigram に分解する。
 * 索引側と同じ正規化を通す必要があるため toBigrams を共用する。
 */
export function queryBigrams(query) {
  return toBigrams(query);
}

/**
 * Reference から検索用 bigram を作る。
 * 書誌（タイトル・著者）と、後述の Note 本文の両方を横断できるようにする。
 *
 * @param {Object} ref
 * @returns {string[]}
 */
export function referenceBigrams(ref) {
  const csl = ref.csl ?? {};
  const names = [...(csl.author ?? []), ...(csl.editor ?? []), ...(csl.translator ?? [])]
    .map((a) => `${a.family ?? ''}${a.given ?? ''}${a.literal ?? ''}`)
    .join('');
  const text = [
    csl.title,
    csl['container-title'],
    csl.publisher,
    names,
    ref.transcription?.title,
    ...(ref.transcription?.authors ?? []),
    // 訳書の原著者は dc:creator が欧文表記で返るため、責任表示の
    // カタカナ表記（ジグムント・バウマン）も索引に入れる。これが無いと
    // 日本語話者が「バウマン」で検索しても引けない（実測で確認）。
    ...(ref.transcription?.authorsRaw ?? []),
    ...(ref.transcription?.displayNames ?? []),
    ...(ref.tags ?? []),
  ]
    .filter(Boolean)
    .join(' ');
  return toBigrams(text);
}

/**
 * Note から bigram を作る。
 * 引用文（body）だけでなく、それに付けた自分のコメント（comment）も
 * 検索対象にする。「あの引用に何を書いたか」から辿れる必要があるため。
 */
export function noteBigrams(note) {
  return toBigrams([note.body, note.comment, note.locator?.page, note.locator?.chapter]
    .filter(Boolean).join(' '));
}

/**
 * DB を開く。
 *
 * インデックス設計の要点:
 *   - `*searchIndex` は多値インデックス（配列の各要素にインデックスが張られる）。
 *     bigram 検索の要。
 *   - `*projectIds` も多値。プロジェクト振り分け（仕様 3.3-3）で使う。
 *   - `deletedAt` は論理削除。全クエリで未削除に絞る必要がある。
 *
 * @param {string} [name]
 * @param {Object} [deps]  テスト用に indexedDB 実装を差し替える
 */
/**
 * 利用者のデータが入るテーブル。
 *
 * ここから外れると中身ごと消える。IndexedDB のスキーマ変更は
 * `notes: null` のような一行でテーブルを破棄でき、しかも DB を開いた
 * 瞬間に起きるため、画面が出たときには手遅れになっている。
 * createDb の最後で照合し、欠けていたら例外にする。
 */
export const REQUIRED_TABLES = ['references', 'notes', 'projects', 'settings'];

/** コードが期待するスキーマの版 */
export const SCHEMA_VERSION = 1;

export function createDb(name = 'refcite', deps = {}) {
  const db = new Dexie(name, deps.indexedDB ? {
    indexedDB: deps.indexedDB,
    IDBKeyRange: deps.IDBKeyRange,
  } : undefined);

  db.version(SCHEMA_VERSION).stores({
    // 文献
    references: 'id, createdAt, updatedAt, deletedAt, *projectIds, *searchIndex',
    // 抜き書き・考察
    notes: 'id, referenceId, type, createdAt, updatedAt, deletedAt, *projectIds, *searchIndex',
    // プロジェクト（レポート単位）
    projects: 'id, name, createdAt, updatedAt, deletedAt',
    // 設定（引用スタイルの選択など、単一レコード）
    settings: 'key',
  });

  // 必須テーブルが揃っているか、開く直前に確かめる。
  //
  // ready は全ての version() 定義が済んでから走るので、
  // 版を足す順序に関係なく最終的な形を見られる。ここで例外にすると
  // Dexie は open を中断するため、テーブルを破棄する変更は適用されない。
  db.on('ready', () => {
    const defined = db.tables.map((t) => t.name);
    const missing = REQUIRED_TABLES.filter((t) => !defined.includes(t));
    if (missing.length) {
      throw new Error(
        `スキーマ定義から必須テーブルが欠けています: ${missing.join(', ')}。`
        + 'このまま開くと利用者のデータが失われます。'
      );
    }
  });

  return db;
}

/**
 * 重複判定用のキーを作る。
 *
 * 「筆頭著者の姓 + 出版年 + タイトルの主要部」で照合する。
 * 副題（`:` 以降）を落とすのは、同じ本でも取得元によって副題の有無や
 * 区切り文字が揺れるため（NDL は `書名 : 副題`、Open Library は
 * `title` と `subtitle` が別）。
 *
 * 記号・空白・大小文字を無視して比較する。年が無いものは誤判定を
 * 招きやすいので対象外にする。
 *
 * @param {Object} csl
 * @returns {string|null}
 */
export function duplicateKey(csl) {
  if (!csl) return null;
  const year = csl.issued?.['date-parts']?.[0]?.[0];
  if (!year) return null;

  const title = String(csl.title ?? '')
    .split(/[:：]/)[0]              // 副題を落とす
    .toLowerCase()
    .replace(IGNORE, '');
  if (!title) return null;

  const first = csl.author?.[0] ?? csl.editor?.[0];
  const author = String(first?.family ?? first?.literal ?? '')
    .toLowerCase().replace(IGNORE, '');

  return `${author}|${year}|${title}`;
}

/** UUID を採る。crypto.randomUUID が無い環境向けのフォールバック付き */
export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const nowIso = () => new Date().toISOString();
