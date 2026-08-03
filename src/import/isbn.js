/**
 * ISBN → 書誌情報の取得（仕様 3.1-1）
 *
 * 和書は NDL サーチ、洋書は Open Library を使う。実測のカバー率（§5.4-c）:
 *   人文社会系の和書10件 → NDL 9/10、Open Library 2/10
 * したがって和書で Open Library に頼る設計は成立しない。
 *
 * ISBN の先頭が 978-4 / 979-4（日本）なら NDL を優先し、
 * 見つからなければ Open Library、それでも駄目なら手入力へ落とす。
 */

import { fetchWithTimeout, DEFAULT_TIMEOUT, TOTAL_BUDGET } from './http.js';

const NDL_API = 'https://ndlsearch.ndl.go.jp/api/opensearch';
const OL_API = 'https://openlibrary.org/api/books';

/** ハイフン・空白を除いた ISBN を返す。妥当でなければ null */
export function normalizeIsbn(input) {
  if (!input) return null;
  const s = String(input).replace(/[-\s]/g, '');
  if (/^\d{9}[\dXx]$/.test(s)) return s.toUpperCase();   // ISBN-10
  if (/^97[89]\d{10}$/.test(s)) return s;                 // ISBN-13
  return null;
}

/** 日本の出版物か（978-4 / 979-4 で始まるか） */
export function isJapaneseIsbn(isbn) {
  const s = normalizeIsbn(isbn);
  if (!s) return false;
  if (s.length === 10) return s.startsWith('4');
  return s.startsWith('9784') || s.startsWith('9794');
}

/**
 * NDL の著者表記を CSL の姓名へ分解する。
 * NDL は `小磯, 修二` や `村上, 裕一, 1981-` の形で返す。
 * 生没年（1981- など）は書誌情報ではないため除去する。
 */
export function parseNdlName(raw) {
  if (!raw) return null;
  // 生没年を落とす
  const cleaned = String(raw)
    .replace(/,?\s*\d{4}-(\d{4})?\s*$/, '')
    .trim();
  const parts = cleaned.split(/,\s*/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    const family = parts[0].trim();
    const given = parts[1].trim();
    // 訳書の原著者など、NDL が欧文名を返すことがある。
    // 和文用の姓名連結（区切りなし）を当てると "Bauman Zygmunt" のように
    // 崩れるため、CJK を含まない名前は literal にまとめて原形を保つ。
    if (!/[぀-ヿ㐀-䶿一-鿿]/.test(cleaned)) {
      return { family, given, literal: `${family}, ${given}` };
    }
    return { family, given };
  }
  return { literal: cleaned };
}

/**
 * NDL の <author> から役割ごとの氏名を拾う。
 * 例: "Bauman, Zygmunt, 1925-2017,奥井, 智之, 1958-,ジグムント・バウマン 著,奥井智之 訳"
 * 末尾側に「〜 著」「〜 訳」「〜 編」の表記が並ぶ。
 *
 * @param {string|undefined} raw
 * @returns {{ authors:string[], translators:string[], editors:string[] }}
 */
export function parseCreatorRoles(raw) {
  const out = { authors: [], translators: [], editors: [],
                authorsRaw: [], translatorsRaw: [], editorsRaw: [] };
  if (!raw) return out;

  // 役割語は同じ役割の人が続くとき最後の1人にしか付かない。
  //   「ニクラス・ルーマン 著,大庭健, 正村俊之 訳」
  //     → ルーマン=著 / 大庭健・正村俊之=訳
  // 役割語の無い断片を捨てると、大庭健が著者に落ちて共著扱いになる
  // （実データで確認）。そこで役割語が現れるまで保留し、見つかった時点で
  // まとめてその役割へ入れる。
  // <author> は dc:creator の羅列と責任表示が連結された形で返る。
  //   "Luhmann, Niklas, 1927-1998,大庭, 健, ...,ニクラス・ルーマン 著,大庭健, 正村俊之 訳"
  // 前半をそのまま解析すると、役割語に到達した時点で姓名の断片や生没年まで
  // その役割へ入ってしまう。役割語を含む最初の断片から後ろだけを見る。
  // 役割語は角括弧で囲まれることがある（「エミール・デュルケーム [著]」）。
  // 括弧を無視して役割語を拾う。
  const ROLE = /[\[［]?\s*(著|訳|編著|編|監修|監訳)\s*[\]］]?$/;

  const chunks = String(raw).split(/[,、]/);
  const firstRole = chunks.findIndex((c) => ROLE.test(c.trim()));

  // 役割語を持つ断片から始めると、同じ役割で先行する人が落ちる。
  //   「カール・マルクス, フリードリヒ・エンゲルス 著,大内兵衛 訳」
  //     → 「著」の断片から始めるとマルクスが消える
  // 責任表示の始まりまで遡る必要がある。ただし前半には dc:creator の
  // 羅列（「Luhmann, Niklas, 1927-1998」など）が連結されており、
  // そこまで遡ると生没年や姓名の断片を拾ってしまう。
  //
  // dc:creator 由来の断片は「姓, 名」形式で分割されるため、
  // 生没年を含むか、直後の断片と組で1人を表す。責任表示側は
  // 中黒か空白で1断片＝1人になっている。この違いで境界を見つける。
  let start = firstRole;
  if (firstRole > 0) {
    for (let i = firstRole - 1; i >= 0; i--) {
      const c = chunks[i].trim();
      // 生没年を含む断片、または空は dc:creator 由来なので越えない
      if (!c || /\d{4}\s*-/.test(c)) break;
      // 「姓」だけの断片（次が名）も dc:creator 由来。
      // 責任表示の人名は中黒を含むか、そもそも姓名が連結されている
      const looksSplitName = c.length <= 4 && !/[・･\s]/.test(c)
        && !/[a-zA-Z]/.test(c) && i > 0;
      if (looksSplitName) break;
      start = i;
    }
  }
  const scoped = firstRole >= 0 ? chunks.slice(start) : chunks;

  const pending = [];
  const pendingRaw = [];
  const bucket = { 訳: out.translators, 監訳: out.translators,
                   編: out.editors, 編著: out.editors, 監修: out.editors };
  const rawBucket = { 訳: out.translatorsRaw, 監訳: out.translatorsRaw,
                      編: out.editorsRaw, 編著: out.editorsRaw, 監修: out.editorsRaw };

  for (const chunk of scoped) {
    const s = chunk.trim();
    if (!s) continue;
    const m = s.match(/^(.*?)[\[［]?\s*(著|訳|編著|編|監修|監訳)\s*[\]］]?$/);
    // 照合用は中黒・空白を除いた形。ただし表示に使う元表記も残す
    // （「ニクラス・ルーマン」の区切りは和訳書の姓の切り出しに要る）
    const clean = (v) => v.replace(/[・\s]/g, '');

    if (!m) { pending.push(clean(s)); pendingRaw.push(s); continue; }

    const name = clean(m[1]);
    if (name) { pending.push(name); pendingRaw.push(m[1].trim()); }
    (bucket[m[2]] ?? out.authors).push(...pending);
    (rawBucket[m[2]] ?? out.authorsRaw).push(...pendingRaw);
    pending.length = 0;
    pendingRaw.length = 0;
  }

  // 最後まで役割語が現れなかったものは著者とみなす
  out.authors.push(...pending);
  out.authorsRaw.push(...pendingRaw);
  return out;
}

/** XML から タグの中身を全て取り出す */
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
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

/**
 * 欧文表記の原著者に対応するカタカナ表記を責任表示から探す。
 *
 * 責任表示の「ニクラス・ルーマン」は名→姓の順（中黒区切り）なので、
 * 末尾を姓とみなす。名は頭文字だけ残して「ルーマン, N.」にする。
 *
 * @param {{family?:string, given?:string}} western  欧文の著者
 * @param {string[]} displayNames  責任表示の元表記（中黒を保持したもの）
 * @returns {{family:string, given:string}|null}
 */
export function japaneseNameOf(western, displayNames) {
  if (!displayNames?.length) return null;

  // 表示名のうち CJK を含むものだけが候補
  const cjk = displayNames.filter((n) => /[぀-ヿ㐀-䶿一-鿿]/.test(n));
  if (!cjk.length) return null;

  // 著者が1人なら素直に対応付く。複数人のときは対応が取れないので触らない
  // （誤って別人の名前を当てるより、欧文のまま出すほうが安全）
  if (cjk.length !== 1) return null;

  // 「ニクラス・ルーマン」は中黒で名と姓に分かれる。末尾が姓。
  // 中黒が無ければ全体を姓として扱う（「マルクス」など）。
  const parts = cjk[0].split(/[・･]/).filter(Boolean);
  const family = parts[parts.length - 1];
  const initial = western.given?.trim()?.[0];
  if (!initial) return { family, given: '' };

  // 和訳書の原著者は「ルーマン, N.」と姓名の間に読点を置く。
  // 和文の姓名は区切り無しで連結する（田中太郎）ため、CSL の
  // sort-separator="" がそのまま効いてしまう。literal に完成形を
  // 入れて、その表記を保つ。
  return { family, given: `${initial}.`, literal: `${family}, ${initial}.` };
}

/**
 * NDL OpenSearch の応答（XML）を CSL-JSON + 読み仮名へ変換する。
 *
 * @param {string} xml
 * @param {string} isbn
 * @returns {{ csl:Object, transcription:Object }|null}
 */
export function ndlToCsl(xml, isbn) {
  const itemMatch = xml.match(/<item>([\s\S]*?)<\/item>/);
  if (!itemMatch) return null;
  const item = itemMatch[1];

  const title = pick(item, 'dc:title') ?? pick(item, 'title');
  if (!title) return null;

  const creators = pickAll(item, 'dc:creator');
  const readings = pickAll(item, 'dcndl:creatorTranscription');
  const roles = parseCreatorRoles(pick(item, 'author'));

  // dcterms:issued は "2018.7" のような形。西暦4桁だけ拾う
  const issuedRaw = pick(item, 'dcterms:issued') ?? pick(item, 'dc:date');
  const year = issuedRaw?.match(/([12]\d{3})/)?.[1];

  // 訳書では原著者と訳者がまとめて dc:creator に入る。
  // <author> の役割表記（「〜 著」「〜 訳」）を手掛かりに振り分ける。
  const parsed = creators.map(parseNdlName).filter(Boolean);
  const translators = [];
  const authors = [];
  for (const p of parsed) {
    const key = p.family ?? p.literal ?? '';
    (roles.translators.some((t) => t.includes(key)) ? translators : authors).push(p);
  }

  // 和訳書の原著者を和文表記に直す。
  //
  // NDL は原著者を欧文表記（Luhmann, Niklas）で返すが、和訳書は日本語
  // 文献として扱うのが慣行で、引用文献一覧では「ルーマン, N」の形にする。
  // 責任表示にカタカナ表記（ニクラス・ルーマン）があるので、そこから
  // 姓を取り、名は頭文字だけ残す。
  //
  // 対象は「訳者がいる」かつ「著者が欧文表記」の場合に限る。
  // 洋書（訳者なし）は欧文のままでなければならない。
  if (translators.length) {
    for (let i = 0; i < authors.length; i++) {
      const a = authors[i];
      const western = a.family && !/[぀-ヿ㐀-䶿一-鿿]/.test(a.family);
      if (!western) continue;
      const ja = japaneseNameOf(a, roles.authorsRaw);
      if (ja) authors[i] = ja;
    }
  }

  const csl = {
    id: `isbn:${isbn}`,
    type: 'book',
    title,
    author: authors.length ? authors : (parsed.length ? parsed : undefined),
    translator: translators.length ? translators : undefined,
    publisher: pick(item, 'dc:publisher'),
    issued: year ? { 'date-parts': [[Number(year)]] } : undefined,
    ISBN: isbn,
    language: 'ja',
  };
  for (const k of Object.keys(csl)) {
    if (csl[k] === undefined) delete csl[k];
  }

  const cleanReadings = readings.map((r) =>
    r.replace(/,?\s*\d{4}-(\d{4})?\s*$/, '').trim()
  );

  return {
    csl,
    transcription: {
      title: pick(item, 'dcndl:titleTranscription'),
      // 読み仮名は「著者と同数・同順で返る」とは限らない。
      // 訳書では原著者（欧文名）に読みが付かず、訳者の分だけ返ることがある
      // （例: creator=[Bauman Zygmunt, 奥井智之] に対し reading=[オクイ, トモユキ] のみ）。
      // 添字で対応付けると別人の読みを割り当ててしまい 50音順が壊れるため、
      // 件数が一致するときだけ対応付け、しないときは破棄する。
      authors:
        cleanReadings.length === creators.length ? cleanReadings : undefined,
      // 突き合わせできなかった生の読みは、UI での手動補完の候補として残す
      authorsRaw: cleanReadings.length ? cleanReadings : undefined,
      // 責任表示に現れる表示名。訳書の原著者は dc:creator が欧文表記
      // （Bauman, Zygmunt）で返るため、日本語話者が「バウマン」で検索しても
      // 索引に当たらない。責任表示にはカタカナ表記（ジグムント・バウマン）が
      // あるので、検索用の別名として保持する。
      displayNames: [
        ...roles.authors, ...roles.translators, ...roles.editors,
      ].filter(Boolean),
    },
  };
}

/**
 * Open Library の応答を CSL-JSON へ変換する。
 *
 * 既知の癖（§5.4-d）:
 *   - publish_date が "June 1, 2006" のような自由書式 → 年だけ抽出
 *   - 書名が全角大文字のレコードがある → normalize 層で整える
 */
export function openLibraryToCsl(data, isbn) {
  const v = data?.[`ISBN:${isbn}`];
  if (!v || !v.title) return null;

  const year = String(v.publish_date ?? '').match(/([12]\d{3})/)?.[1];

  const csl = {
    id: `isbn:${isbn}`,
    type: 'book',
    title: v.subtitle ? `${v.title}: ${v.subtitle}` : v.title,
    author: v.authors?.length
      ? v.authors.map((a) => splitWesternName(a.name))
      : undefined,
    publisher: v.publishers?.[0]?.name,
    'publisher-place': v.publish_places?.[0]?.name,
    issued: year ? { 'date-parts': [[Number(year)]] } : undefined,
    'number-of-pages': v.number_of_pages ? String(v.number_of_pages) : undefined,
    ISBN: isbn,
  };
  for (const k of Object.keys(csl)) {
    if (csl[k] === undefined) delete csl[k];
  }
  return { csl, transcription: undefined };
}

/** "Fyodor Dostoyevsky" → { family:'Dostoyevsky', given:'Fyodor' } */
export function splitWesternName(name) {
  const s = String(name ?? '').trim();
  if (!s) return { literal: '' };
  if (s.includes(',')) {
    const [family, given] = s.split(/,\s*/);
    return { family: family.trim(), given: (given ?? '').trim() };
  }
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { literal: s };
  return { family: parts.pop(), given: parts.join(' ') };
}

/**
 * ISBN から書誌情報を取得する。
 *
 * @param {string} input
 * @param {Object} [opts]
 * @param {typeof fetch} [opts.fetchImpl]
 * @param {number} [opts.timeout]  1 API あたりの制限時間（ミリ秒）
 * @param {number} [opts.totalBudget]  取込全体の上限（ミリ秒）
 * @returns {Promise<{ok:boolean, csl?:Object, transcription?:Object,
 *                     source?:string, error?:string}>}
 */
export async function fetchByIsbn(input, opts = {}) {
  const isbn = normalizeIsbn(input);
  if (!isbn) return { ok: false, error: 'ISBN の形式として認識できませんでした' };

  const f = opts.fetchImpl ?? fetch;
  const timeout = opts.timeout;
  // 和書は NDL を先に、洋書は Open Library を先に試す
  const order = isJapaneseIsbn(isbn) ? ['ndl', 'ol'] : ['ol', 'ndl'];

  const errors = [];
  let timedOut = false;
  // 2 つの API を順に試すので、1 件ごとの制限だけでは最悪 2 倍待つ。
  // 全体の持ち時間から、残り時間を割り当てる。
  const started = Date.now();
  const budget = opts.totalBudget ?? TOTAL_BUDGET;

  for (const src of order) {
    const left = budget - (Date.now() - started);
    if (left <= 0) { timedOut = true; break; }
    const each = Math.min(timeout ?? DEFAULT_TIMEOUT, left);
    try {
      const r = src === 'ndl'
        ? await tryNdl(f, isbn, each)
        : await tryOpenLibrary(f, isbn, each);
      if (r) return { ok: true, ...r, source: src === 'ndl' ? 'ndl' : 'open_library' };
    } catch (e) {
      if (e?.timeout) timedOut = true;
      errors.push(`${src}: ${e.message}`);
    }
  }

  // 時間切れを「見つからなかった」と伝えてはいけない。
  // 実際には存在する本で、あとで試せば取れる可能性が高い。
  if (timedOut) {
    return {
      ok: false,
      error: '書誌データベースから応答がありませんでした。混雑しているか、'
        + '通信が遅い可能性があります。時間をおいて試すか、手入力で登録してください',
    };
  }

  return {
    ok: false,
    error: errors.length
      ? `書誌情報が見つかりませんでした（${errors.join(' / ')}）`
      : 'この ISBN の書誌情報が見つかりませんでした。手入力で登録してください',
  };
}

async function tryNdl(f, isbn, timeout) {
  const res = await fetchWithTimeout(f, `${NDL_API}?isbn=${encodeURIComponent(isbn)}`, { timeout });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ndlToCsl(await res.text(), isbn);
}

async function tryOpenLibrary(f, isbn, timeout) {
  const url = `${OL_API}?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=data`;
  const res = await fetchWithTimeout(f, url, { timeout });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return openLibraryToCsl(await res.json(), isbn);
}
