/**
 * 文献取込の公開 API（仕様 3.1）
 *
 * 取得した書誌は「ヒットした＝正しい」とは限らない。実測で以下を確認している。
 *   - Crossref は和文論文の title を空文字にし、日本語タイトルを original-title に入れる
 *   - Crossref は書評論文などで author を null にする
 *   - Open Library は ISBN が版を一意に決めるため、意図と異なる言語版が返りうる
 *   - NDL は訳書の原著者と訳者をまとめて dc:creator に入れる
 * したがって取込後は必ず確認画面を挟み、ユーザーが目視修正できるようにする
 * （設計書 §5.4-e）。
 */

/**
 * 取込結果。ok が false のときは reference/issues を持たない。
 * 呼び出し側で ok を先に確かめること。
 *
 * @typedef {Object} ImportedReference
 * @property {string} id
 * @property {import('../citation/types.js').CSLItem} csl  CSL-JSON の書誌
 * @property {Object} [transcription]           読み仮名（50音順ソート用）
 * @property {{kind:string, identifier?:string, fetchedFrom?:string, fetchedAt?:string}} source
 * @property {string[]} projectIds
 * @property {string[]} tags
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * 取込結果。ok が false のときは reference/issues を持たない。
 * 呼び出し側で ok を先に確かめること。
 *
 * @typedef {Object} ImportResult
 * @property {boolean} ok
 * @property {ImportedReference} [reference]
 * @property {Array<{level:string, field:string, message:string}>} [issues]
 * @property {string} [error]
 */

import { fetchByDoi, extractDoi } from './crossref.js';
import { fetchByIsbn, normalizeIsbn } from './isbn.js';
import { candidateToCsl } from './search.js';
import { normalizeItem } from '../citation/normalize.js';
import { validateItem } from '../citation/index.js';

export { fetchByDoi, extractDoi, crossrefToCsl } from './crossref.js';
export { searchBibliography, candidateToCsl } from './search.js';
export {
  fetchByIsbn, normalizeIsbn, isJapaneseIsbn,
  ndlToCsl, openLibraryToCsl, parseNdlName, splitWesternName,
} from './isbn.js';

/**
 * 入力文字列が DOI か ISBN かを判定する。
 * @param {string} input
 * @returns {'doi'|'isbn'|null}
 */
export function detectIdentifier(input) {
  if (!input) return null;
  if (extractDoi(input)) return 'doi';
  if (normalizeIsbn(input)) return 'isbn';
  return null;
}

/**
 * DOI / ISBN を自動判別して取り込む。
 *
 * @param {string} input
 * @param {Object} [opts]
 * @param {typeof fetch} [opts.fetchImpl]
 * @returns {Promise<ImportResult>}
 */
export async function importByIdentifier(input, opts = {}) {
  const kind = detectIdentifier(input);
  if (!kind) {
    return {
      ok: false,
      error: 'DOI・ISBN のいずれとしても認識できませんでした',
    };
  }

  if (kind === 'doi') {
    const r = await fetchByDoi(input, opts);
    if (!r.ok) return { ok: false, error: r.error };
    return finish(normalizeItem(r.item), {
      kind: 'doi',
      identifier: extractDoi(input),
      fetchedFrom: 'crossref',
    });
  }

  const r = await fetchByIsbn(input, opts);
  if (!r.ok) return { ok: false, error: r.error };
  return finish(normalizeItem(r.csl), {
    kind: 'isbn',
    identifier: normalizeIsbn(input),
    fetchedFrom: r.source,
  }, r.transcription);
}

/**
 * 検索結果から選んだ候補を Reference に確定する。
 *
 * 検索で得られる書誌は ISBN 取込より情報が薄いことがある（特に
 * Open Library の検索 API）。ISBN が判明している候補は、詳細 API を
 * 引き直して情報を補う。
 *
 * @param {Object} candidate  searchBibliography の候補
 * @param {Object} [opts]
 * @returns {Promise<ImportResult>}
 */
export async function importFromCandidate(candidate, opts = {}) {
  // ISBN があるなら詳細取得のほうが確実（読み仮名・訳者などが取れる）
  if (candidate.isbn) {
    const r = await fetchByIsbn(candidate.isbn, opts);
    if (r.ok) {
      return finish(normalizeItem(r.csl), {
        kind: 'isbn',
        identifier: normalizeIsbn(candidate.isbn),
        fetchedFrom: r.source,
      }, r.transcription);
    }
  }

  const converted = candidateToCsl(candidate);
  if (!converted) {
    return { ok: false, error: 'この候補を書誌情報に変換できませんでした' };
  }
  return finish(normalizeItem(converted.csl), {
    kind: 'search',
    identifier: candidate.isbn ?? undefined,
    fetchedFrom: candidate.source,
  }, converted.transcription);
}

/**
 * 手入力で文献を登録する（検索で見つからなかった場合の最終手段）。
 *
 * @param {Object} fields { title, authors:string[], year, publisher,
 *                          containerTitle, volume, issue, page, type }
 * @returns {ImportResult}
 */
export function importManual(fields) {
  /** 「姓, 名」を CSL の人名へ。分けられなければ literal に入れる */
  const toNames = (list) => (list ?? [])
    .map((s) => String(s).trim()).filter(Boolean)
    .map((s) => {
      const parts = s.split(/[,、]\s*/);
      return parts.length >= 2 && parts[1]
        ? { family: parts[0], given: parts.slice(1).join(' ') }
        : { literal: s };
    });

  const authors = toNames(fields.authors);
  const editors = toNames(fields.editors);

  // 新聞記事は発行年月日まで持つ（マニュアル 5.7）。
  // それ以外は年だけでよい。
  const issued = fields.dateParts?.length
    ? { 'date-parts': [fields.dateParts] }
    : (() => {
        const y = Number(String(fields.year ?? '').match(/\d{4}/)?.[0]);
        return y ? { 'date-parts': [[y]] } : undefined;
      })();

  const text = (v) => String(v ?? '').trim() || undefined;

  // アクセス日は「2026-08-03」の形で来る
  const accessed = fields.accessed
    ? (() => {
        const parts = String(fields.accessed).split('-').map(Number).filter(Boolean);
        return parts.length ? { 'date-parts': [parts] } : undefined;
      })()
    : undefined;

  const csl = {
    id: `manual:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: fields.type || 'book',
    title: text(fields.title),
    author: authors.length ? authors : undefined,
    editor: editors.length ? editors : undefined,
    issued,
    accessed,
    publisher: text(fields.publisher),
    'publisher-place': text(fields.place),
    'container-title': text(fields.containerTitle),
    'event-title': text(fields.eventTitle),
    volume: text(fields.volume),
    issue: text(fields.issue),
    page: text(fields.page),
    genre: text(fields.genre),
    edition: text(fields.edition),
    URL: text(fields.url),
  };
  for (const k of Object.keys(csl)) if (csl[k] === undefined) delete csl[k];

  const readings = (fields.readings ?? []).map((s) => String(s).trim()).filter(Boolean);

  return finish(normalizeItem(csl), { kind: 'manual' },
    readings.length
      ? { authors: readings.length === authors.length ? readings : undefined,
          authorsRaw: readings }
      : undefined);
}

function finish(csl, source, transcription) {
  const reference = {
    id: csl.id,
    csl,
    transcription,
    source: { ...source, fetchedAt: new Date().toISOString() },
    projectIds: [],
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return { ok: true, reference, issues: validateItem(csl) };
}
