/**
 * 書誌データ正規化層
 *
 * 外部 API（NDL / Crossref / Open Library）の応答はそのままでは引用に使えない。
 * §5.4-d で実測した以下の癖を吸収する。
 *   - publish_date が "June 1, 2006" のような自由書式（Open Library）
 *   - 書名が全角大文字のレコードがある（Open Library）
 *   - 和文判定を CSL に伝える手段が無い（CSL の language は値で分岐できない）
 */

/** 和文かどうかの判定。CJK 文字を含めば和文とみなす */
export function isJapanese(item) {
  if (typeof item.language === 'string' && /^ja/i.test(item.language)) return true;
  const probe = [
    item.title,
    item.publisher,
    item['container-title'],
    ...(item.author ?? []).flatMap((a) => [a.family, a.given, a.literal]),
  ]
    .filter(Boolean)
    .join('');
  // ひらがな・カタカナ・漢字
  return /[぀-ヿ㐀-䶿一-鿿]/.test(probe);
}

/**
 * 自由書式の日付文字列から西暦年を取り出す。
 * "June 1, 2006" / "2003" / "2018.7" / "平成30年" などに対応。
 * @returns {number|null}
 */
export function extractYear(input) {
  if (input == null) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  const s = String(input);
  // 西暦4桁を優先（1000-2999 の範囲に限る）
  const m = s.match(/\b([12]\d{3})\b/);
  if (m) return Number(m[1]);
  return null;
}

/**
 * 全角大文字だけで構成された書名を Title Case 相当に直す。
 * Open Library に "REASSEMBLING THE SOCIAL: AN INTRODUCTION..." のような
 * レコードが存在するため（§5.4-d）。
 */
export function fixShoutingTitle(title) {
  if (!title || typeof title !== 'string') return title;
  const letters = title.replace(/[^A-Za-z]/g, '');
  if (letters.length < 8) return title;          // 短い略語等は触らない
  const upper = title.replace(/[^A-Z]/g, '').length;
  if (upper / letters.length < 0.9) return title; // 大半が大文字のときだけ
  return title
    .toLowerCase()
    .replace(/(^|[:.!?]\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase());
}

/** ページ範囲のダッシュを半角ハイフンに統一（APU 準拠） */
export function normalizePageRange(page) {
  if (!page) return page;
  return String(page).replace(/[‐-―−]/g, '-').replace(/\s*-\s*/g, '-');
}

/**
 * CSL-JSON を引用エンジンに渡せる状態へ正規化する。
 *
 * 重要: 和文判定の結果を `annote: 'ja'` として埋める。CSL の条件分岐は
 * `variable="language"` では値を見られず存在の有無しか判定できないため、
 * スタイル側は annote の有無を見て和文/欧文を切り替える（apu.csl の注記参照）。
 * genre ではなく annote を使うのは、APA が genre を "[Ja]" として出力に
 * 表示してしまい、他スタイルの表示を汚すため（実測で確認）。
 *
 * @param {import('./types.js').CSLItem} item
 * @returns {import('./types.js').CSLItem}
 */
export function normalizeItem(item) {
  const out = { ...item };

  if (out.title) out.title = fixShoutingTitle(out.title);
  if (out['container-title']) {
    out['container-title'] = fixShoutingTitle(out['container-title']);
  }
  if (out.page) out.page = normalizePageRange(out.page);

  // 日付: date-parts が無く literal だけのものを救う
  if (!out.issued?.['date-parts']) {
    const y = extractYear(out.issued?.literal ?? out.issued);
    if (y) out.issued = { 'date-parts': [[y]] };
  }

  const ja = isJapanese(out);
  out.language = ja ? 'ja' : (out.language ?? 'en');
  if (ja) out.annote = 'ja';
  else delete out.annote;

  // 著者不明の補完。
  // CSL 既定では著者が空だとタイトルが著者位置へ繰り上がり、本来のタイトルが
  // 消えて書誌が壊れる。substitute 内の <text value> は citeproc が無視する
  // ため、スタイル側では解決できず、ここで実データとして補う。
  // Crossref は和文誌の著者情報を持たないことがあり（author: null）、
  // このケースは実際に発生する（実測で確認）。
  const noAuthor =
    (!Array.isArray(out.author) || out.author.length === 0) &&
    (!Array.isArray(out.editor) || out.editor.length === 0);
  if (noAuthor) {
    out.author = [{ literal: ja ? '著者名不明' : 'Author unknown' }];
    out._authorUnknown = true; // UI 側で警告を出すための目印
  }

  return out;
}

/** 配列版 */
export function normalizeAll(items) {
  return items.map(normalizeItem);
}
