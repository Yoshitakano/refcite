/**
 * DOI → 書誌情報の取得（仕様 3.1-2）
 *
 * Crossref REST API を使用。CORS は `*` で開放されており、ブラウザから直接叩ける。
 *
 * 注意: polite pool（User-Agent に連絡先を入れてレート制限を緩和する運用）は
 * ブラウザから利用できない。プリフライトの access-control-allow-headers に
 * User-Agent が含まれず、そもそもブラウザは User-Agent の上書きを禁止しているため。
 * 匿名プールでの利用となるので 429 のリトライを入れてある。
 */

const API = 'https://api.crossref.org/works/';

/** Crossref の type を CSL-JSON の type へ対応付ける */
const TYPE_MAP = {
  'journal-article': 'article-journal',
  'book-chapter': 'chapter',
  'book': 'book',
  'book-part': 'chapter',
  'book-section': 'chapter',
  'monograph': 'book',
  'edited-book': 'book',
  'reference-book': 'book',
  'proceedings-article': 'paper-conference',
  'dissertation': 'thesis',
  'posted-content': 'manuscript',
  'report': 'report',
};

/**
 * 入力文字列から DOI を抽出する。
 * `https://doi.org/10.1086/227049` や `doi:10.1086/227049` の貼り付けにも対応。
 *
 * @param {string} input
 * @returns {string|null}
 */
export function extractDoi(input) {
  if (!input) return null;
  const s = String(input).trim();
  const m = s.match(/10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/);
  if (!m) return null;
  // 末尾の句読点・括弧を落とす（貼り付け時に混入しやすい）
  return m[0].replace(/[.,;)\]]+$/, '');
}

/**
 * Crossref の応答（message）を CSL-JSON へ変換する。
 *
 * 和文論文の扱いが最大の注意点。Crossref は和文論文について
 * `title` を空文字 `[""]` にし、実際の日本語タイトルを `original-title` に
 * 入れて返す（実測で確認）。これを知らずに title だけ読むと、
 * 和文論文のタイトルが空欄で取り込まれる。
 *
 * @param {Object} msg  Crossref の message オブジェクト
 * @returns {import('../citation/types.js').CSLItem}
 */
export function crossrefToCsl(msg) {
  const pick = (arr) => {
    if (!Array.isArray(arr)) return typeof arr === 'string' ? arr : undefined;
    const v = arr.find((x) => typeof x === 'string' && x.trim() !== '');
    return v ?? undefined;
  };

  // title が空なら original-title を使う（和文論文への対応）
  const title = pick(msg.title) ?? pick(msg['original-title']);
  const container =
    pick(msg['container-title']) ?? pick(msg['original-container-title']);

  const names = (list) =>
    Array.isArray(list) && list.length
      ? list.map((a) =>
          a.family || a.given
            ? { family: a.family ?? '', given: a.given ?? '' }
            : { literal: a.name ?? '' }
        )
      : undefined;

  const dateOf = (d) =>
    d?.['date-parts']?.[0]?.length ? { 'date-parts': d['date-parts'] } : undefined;

  const item = {
    id: `doi:${msg.DOI}`,
    type: TYPE_MAP[msg.type] ?? 'article-journal',
    title,
    'container-title': container,
    author: names(msg.author),
    editor: names(msg.editor),
    issued:
      dateOf(msg.issued) ??
      dateOf(msg['published-print']) ??
      dateOf(msg['published-online']),
    volume: msg.volume,
    issue: msg.issue,
    page: msg.page,
    publisher: msg.publisher,
    'publisher-place': msg['publisher-location'],
    DOI: msg.DOI,
    ISBN: Array.isArray(msg.ISBN) ? msg.ISBN[0] : msg.ISBN,
    URL: msg.URL,
    language: msg.language,
  };

  // undefined を落として CSL-JSON をきれいに保つ
  for (const k of Object.keys(item)) {
    if (item[k] === undefined || item[k] === '') delete item[k];
  }
  return item;
}

/**
 * DOI から書誌情報を取得する。
 *
 * @param {string} input  DOI 文字列 or DOI を含む URL
 * @param {Object} [opts]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {number} [opts.retries=2]  429/5xx 時のリトライ回数
 * @returns {Promise<{ ok:boolean, item?:Object, error?:string }>}
 */
export async function fetchByDoi(input, opts = {}) {
  const doi = extractDoi(input);
  if (!doi) {
    return { ok: false, error: 'DOI の形式として認識できませんでした' };
  }

  const f = opts.fetchImpl ?? fetch;
  const retries = opts.retries ?? 2;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let res;
    try {
      res = await f(API + encodeURIComponent(doi), {
        headers: { Accept: 'application/json' },
      });
    } catch (e) {
      if (attempt === retries) {
        return { ok: false, error: `ネットワークエラー: ${e.message}` };
      }
      await sleep(400 * (attempt + 1));
      continue;
    }

    if (res.status === 404) {
      return { ok: false, error: `この DOI は見つかりませんでした: ${doi}` };
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt === retries) {
        return { ok: false, error: `Crossref が混雑しています（HTTP ${res.status}）。時間をおいて再試行してください` };
      }
      await sleep(600 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      return { ok: false, error: `取得に失敗しました（HTTP ${res.status}）` };
    }

    const json = await res.json();
    if (!json?.message) {
      return { ok: false, error: '応答の形式が想定と異なります' };
    }
    return { ok: true, item: crossrefToCsl(json.message) };
  }
  return { ok: false, error: '取得に失敗しました' };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
