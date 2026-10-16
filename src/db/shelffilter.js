/**
 * 書架の絞り込み
 *
 * 書架の一覧を、書名・著者名などの語で絞る。件数は多くても数百件で、
 * 一覧はすでにメモリ上にあるため、索引（bigram）は使わずに直接照合する。
 *
 * 以前は全項目を空白抜きで 1 本に繋いで部分一致を見ていたため、
 * 次の取りこぼしがあった。
 *   - 「ルーマン 信頼」のように語を並べると一致しない（語順が項目順と違う）
 *   - 共著の 2 人目以降・編者・訳者で引けない（表示用の著者名しか見ていない）
 *   - 読み仮名をひらがなで打つと、カタカナの読みに一致しない
 *   - 全角英数（ｌｕｈｍａｎｎ）が半角に一致しない
 */

/**
 * 照合用に文字列を揃える。
 *
 * - NFKC で全角英数・半角カナを揃える
 * - 大文字小文字を区別しない
 * - カタカナをひらがなへ寄せる（読み仮名の打ち方に依存しない）
 * - 空白・中黒・句読点を除く（「ジグムント・バウマン」を「ジグムントバウマン」でも引く）
 *
 * @param {unknown} text
 * @returns {string}
 */
export function normalizeForMatch(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\s・･,.，．、。:：;；'"’”「」『』()（）\-‐–—]/g, '');
}

/**
 * 検索語を分ける。空白（全角含む）区切りで、空の語は捨てる。
 * @param {string} query
 * @returns {string[]}
 */
export function splitQuery(query) {
  return String(query ?? '')
    .normalize('NFKC')
    .split(/\s+/)
    .map(normalizeForMatch)
    .filter(Boolean);
}

/**
 * 文献 1 件の照合対象を集める。
 * 項目ごとに分けて返す（項目をまたいだ偶然の一致を避けるため）。
 *
 * @param {{csl?: Object, transcription?: Object, tags?: string[]}} ref
 * @returns {string[]}
 */
export function shelfHaystack(ref) {
  const csl = ref.csl ?? {};
  const people = [...(csl.author ?? []), ...(csl.editor ?? []), ...(csl.translator ?? [])];
  const names = people.flatMap((p) => [
    p.literal,
    p.family,
    p.given,
    // 和名は「姓名」、欧文名は「名 姓」で打たれることがある。両方を持たせる
    `${p.family ?? ''}${p.given ?? ''}`,
    `${p.given ?? ''}${p.family ?? ''}`,
  ]);
  const year = csl.issued?.['date-parts']?.[0]?.[0];
  return [
    csl.title,
    csl['title-short'],
    csl['container-title'],
    csl.publisher,
    year,
    ...names,
    ref.transcription?.title,
    ...(ref.transcription?.authors ?? []),
    ...(ref.transcription?.authorsRaw ?? []),
    ...(ref.transcription?.displayNames ?? []),
    ...(ref.tags ?? []),
  ]
    .map(normalizeForMatch)
    .filter(Boolean);
}

/**
 * 文献が検索語にすべて一致するか（AND）。
 * 各語は、いずれかの項目に部分一致すればよい。語が無ければ常に一致。
 *
 * @param {Object} ref
 * @param {string} query
 * @returns {boolean}
 */
export function matchesShelfFilter(ref, query) {
  return matchesTerms(ref, splitQuery(query));
}

/**
 * @param {Object} ref
 * @param {string[]} terms  splitQuery 済みの語
 */
function matchesTerms(ref, terms) {
  if (!terms.length) return true;
  const hay = shelfHaystack(ref);
  return terms.every((t) => hay.some((h) => h.includes(t)));
}

/**
 * 一覧を絞り込む。順序は保つ。
 * @template T
 * @param {T[]} refs
 * @param {string} query
 * @returns {T[]}
 */
export function filterShelf(refs, query) {
  const terms = splitQuery(query);
  if (!terms.length) return refs;
  return refs.filter((r) => matchesTerms(/** @type {any} */ (r), terms));
}
