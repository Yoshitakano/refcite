/**
 * 著者名・タイトルによる書誌検索（仕様 3.1 の主動線）
 *
 * ISBN / DOI は手元に本や論文がある場合しか使えない。実際には
 * 「あの本を入れたい」という状態から始まることが多いので、
 * 著者名とタイトルで探せるほうを主にする。
 *
 * NDL サーチは雑誌記事・講演録も返すため、書誌として使える候補
 * （category が「図書」、ISBN あり、出版社あり）を上位に並べ替える。
 */

import { ndlToCsl, splitWesternName } from './isbn.js';

const NDL_API = 'https://ndlsearch.ndl.go.jp/api/opensearch';
const OL_SEARCH = 'https://openlibrary.org/search.json';

/** XML から指定タグの中身を全部取り出す */
function pickAll(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(xml))) out.push(decodeXml(m[1].trim()));
  return out;
}
const pick = (xml, tag) => pickAll(xml, tag)[0];

function decodeXml(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

/**
 * NDL の item から検索結果用の要約を作る。
 * 一覧に出すための最小限の情報と、確定時に使う生 XML を持たせる。
 */
function summarizeNdl(itemXml) {
  const ids = pickAll(itemXml, 'dc:identifier');
  const isbn = ids.find((v) => /^[\d-]{10,}$/.test(v));
  const categories = pickAll(itemXml, 'category');
  const creators = pickAll(itemXml, 'dc:creator');

  return {
    source: 'ndl',
    title: pick(itemXml, 'dc:title') ?? pick(itemXml, 'title'),
    authors: creators.map((c) => c.replace(/,?\s*\d{4}-(\d{4})?\s*$/, '').trim()),
    publisher: pick(itemXml, 'dc:publisher'),
    year: (pick(itemXml, 'dcterms:issued') ?? pick(itemXml, 'dc:date') ?? '')
      .match(/([12]\d{3})/)?.[1],
    isbn: isbn?.replace(/-/g, ''),
    kind: categories.includes('図書') ? 'book'
        : categories.includes('記事') ? 'article' : 'other',
    raw: itemXml,
  };
}

/**
 * 候補を「書誌として使えそうな順」に並べる。
 *
 * NDL は雑誌記事や講演録も返す。学生が探しているのはたいてい書籍なので、
 * 図書 > 出版社あり > ISBN あり を優先する。記事を捨てないのは、
 * 論文を探している場合もあるため。
 */
function scoreCandidate(c) {
  let s = 0;
  // 種別の加点と減点は意図的に二重にしてある。図書への加点だけだと、
  // 出版社・ISBN が揃った記事に並ばれたとき順序が不安定になる。
  if (c.kind === 'book') s += 10;
  if (c.kind === 'article') s -= 2;
  if (c.publisher) s += 4;
  if (c.isbn) s += 4;
  if (c.year) s += 2;
  if (c.authors.length) s += 2;
  return s;
}

/**
 * NDL を著者名・タイトルで検索する。
 *
 * @param {Object} q
 * @param {string} [q.title]
 * @param {string} [q.author]
 * @param {Object} [opts]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {number} [opts.limit=20]
 * @returns {Promise<{ok:boolean, candidates?:SearchCandidate[], error?:string}>}
 */
export async function searchNdl(q, opts = {}) {
  const params = new URLSearchParams();
  if (q.title) params.set('title', q.title);
  if (q.author) params.set('creator', q.author);
  params.set('cnt', String(opts.limit ?? 20));

  const f = opts.fetchImpl ?? fetch;
  let res;
  try {
    res = await f(`${NDL_API}?${params}`);
  } catch (e) {
    return { ok: false, error: `ネットワークエラー: ${e.message}` };
  }
  if (!res.ok) return { ok: false, error: `NDL への問い合わせに失敗しました（HTTP ${res.status}）` };

  const xml = await res.text();
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml))) items.push(m[1]);

  const candidates = items
    .map(summarizeNdl)
    .filter((c) => c.title)
    .map((c) => ({ ...c, _score: scoreCandidate(c) }))
    .sort((a, b) => b._score - a._score);

  return { ok: true, candidates };
}

/**
 * Open Library を著者名・タイトルで検索する（洋書向け）。
 * @param {{title?:string, author?:string}} q
 * @param {Object} [opts]
 * @returns {Promise<{ok:boolean, candidates?:SearchCandidate[], error?:string}>}
 */
export async function searchOpenLibrary(q, opts = {}) {
  const params = new URLSearchParams();
  if (q.title) params.set('title', q.title);
  if (q.author) params.set('author', q.author);
  params.set('limit', String(opts.limit ?? 20));
  params.set('fields', 'title,author_name,first_publish_year,publisher,isbn,language');

  const f = opts.fetchImpl ?? fetch;
  let res;
  try {
    res = await f(`${OL_SEARCH}?${params}`);
  } catch (e) {
    return { ok: false, error: `ネットワークエラー: ${e.message}` };
  }
  if (!res.ok) {
    return { ok: false, error: `Open Library への問い合わせに失敗しました（HTTP ${res.status}）` };
  }

  const json = await res.json();
  const candidates = (json.docs ?? [])
    .filter((d) => d.title)
    .map((d) => ({
      source: 'open_library',
      title: d.title,
      authors: d.author_name ?? [],
      publisher: d.publisher?.[0],
      year: d.first_publish_year ? String(d.first_publish_year) : undefined,
      isbn: d.isbn?.[0],
      kind: 'book',
      raw: d,
    }));

  return { ok: true, candidates };
}

/** 和文らしい入力か（CJK を含むか） */
function looksJapanese(s) {
  return /[぀-ヿ㐀-䶿一-鿿]/.test(String(s ?? ''));
}

/**
 * 検索結果の候補。
 * `raw` は確定時に元データへ戻すために保持する（NDL は生 XML、
 * Open Library は検索 API の応答）。
 *
 * @typedef {Object} SearchCandidate
 * @property {'ndl'|'open_library'} source
 * @property {string} [title]
 * @property {string[]} authors
 * @property {string} [publisher]
 * @property {string} [year]
 * @property {string} [isbn]
 * @property {'book'|'article'|'other'} kind
 * @property {*} [raw]
 * @property {number} [_score]
 */

/**
 * 著者名・タイトルで書誌を検索する。
 *
 * 和文らしい入力なら NDL、欧文なら Open Library を優先し、
 * 結果が乏しければもう一方も引く。どちらが当たるか分からない場合が
 * あるため、片方で 3 件未満なら両方の結果を混ぜる。
 *
 * @param {{title?:string, author?:string}} q
 * @param {Object} [opts]
 * @returns {Promise<{ok:boolean, candidates?:SearchCandidate[], error?:string}>}
 */
export async function searchBibliography(q, opts = {}) {
  const title = (q.title ?? '').trim();
  const author = (q.author ?? '').trim();
  if (!title && !author) {
    return { ok: false, error: 'タイトルか著者名のどちらかを入力してください' };
  }

  const ja = looksJapanese(title) || looksJapanese(author);
  const primary = ja ? searchNdl : searchOpenLibrary;
  const secondary = ja ? searchOpenLibrary : searchNdl;

  const first = await primary({ title, author }, opts);
  const firstList = first.ok ? first.candidates : [];

  // 主候補が乏しいときだけ副次側も引く（無駄な往復を避ける）
  let secondList = [];
  if (firstList.length < 3) {
    const second = await secondary({ title, author }, opts);
    if (second.ok) secondList = second.candidates;
  }

  const candidates = [...firstList, ...secondList];
  if (!candidates.length) {
    return {
      ok: true, candidates: [],
      error: first.ok ? undefined : first.error,
    };
  }
  return { ok: true, candidates };
}

/**
 * 検索結果の候補を CSL-JSON へ変換する（ユーザーが選んだ1件を確定する）。
 *
 * @param {SearchCandidate} candidate  searchBibliography が返した候補
 * @returns {{ csl:Object, transcription?:Object }|null}
 */
export function candidateToCsl(candidate) {
  if (candidate.source === 'ndl') {
    // NDL は生 XML を持っているので、ISBN 取込と同じ変換を通せる
    const wrapped = `<item>${candidate.raw}</item>`;
    const converted = ndlToCsl(wrapped, candidate.isbn ?? '');
    if (converted) {
      if (!candidate.isbn) delete converted.csl.ISBN;
      return converted;
    }
  }

  // Open Library の検索結果は詳細 API より情報が薄いので、
  // 取れているぶんだけで組み立てる
  const csl = {
    id: candidate.isbn ? `isbn:${candidate.isbn}` : `manual:${candidate.title}`,
    type: candidate.kind === 'article' ? 'article-journal' : 'book',
    title: candidate.title,
    author: candidate.authors.length
      ? candidate.authors.map((a) =>
          /[぀-ヿ㐀-䶿一-鿿]/.test(a)
            ? (a.includes(',')
                ? { family: a.split(/,\s*/)[0], given: a.split(/,\s*/)[1] ?? '' }
                : { literal: a })
            : splitWesternName(a))
      : undefined,
    publisher: candidate.publisher,
    issued: candidate.year ? { 'date-parts': [[Number(candidate.year)]] } : undefined,
    ISBN: candidate.isbn,
  };
  for (const k of Object.keys(csl)) if (csl[k] === undefined) delete csl[k];
  return { csl, transcription: undefined };
}
