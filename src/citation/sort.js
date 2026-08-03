/**
 * 引用文献一覧の並び替え（仕様 3.4-1 / APU マニュアル 5.1）
 *
 * APU の規定: 日本語文献のみなら著者の姓を50音順、英語文献が混じるなら
 * アルファベット順。実運用では和文と欧文が混在するため、和文→欧文の順に
 * ブロックを分け、それぞれ 50音順 / アルファベット順で整える。
 *
 * 重要: 漢字のコードポイント順は 50音順と一致しない。
 * 例えば「井上(いのうえ)」と「小磯(こいそ)」はコード順では偶然正しく並ぶが、
 * 「山崎(やまざき)」と「阿部(あべ)」はコード順だと逆になる。
 * したがって和文の整列には必ず読み仮名を用いる。NDL API が
 * dcndl:creatorTranscription で読み仮名を返すため、それを保持して使う（§5.4-a）。
 */

import { isJapanese } from './normalize.js';
import { styleOf } from './styles/index.js';

/** カタカナをひらがなへ（読み仮名の表記ゆれ吸収） */
export function kanaToHira(s) {
  return String(s ?? '').replace(/[ァ-ヶ]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0x60)
  );
}

/**
 * 並び替えキーを作る。
 * 読み仮名があればそれを、無ければ姓の表記をそのまま使う（不正確だが破綻は避ける）。
 *
 * @param {Object} ref  Reference（csl と transcription を持つ）
 * @returns {{ isJa: boolean, key: string, hasReading: boolean }}
 */
export function sortKeyOf(ref) {
  const csl = ref.csl ?? ref;
  const ja = isJapanese(csl);

  const readings = ref.transcription?.authors;
  const first = csl.author?.[0] ?? csl.editor?.[0];

  if (ja) {
    // 読み仮名（NDL 由来）を最優先
    const reading = Array.isArray(readings) && readings.length ? readings[0] : null;
    if (reading) {
      return { isJa: true, key: kanaToHira(reading).replace(/[,\s]/g, ''), hasReading: true };
    }

    // 和文書誌でも筆頭著者が欧文名のことがある（訳書の原著者など）。
    // その場合ローマ字表記を 50音順の中に混ぜると並びが不自然になるため、
    // 欧文ブロック側へ回す。
    const head = [first?.family, first?.given, first?.literal]
      .filter(Boolean).join('');
    if (head && !/[぀-ヿ㐀-䶿一-鿿]/.test(head)) {
      return { isJa: false, key: head.toLowerCase(), hasReading: true };
    }

    const fallback = first?.family ?? first?.literal ?? csl.title ?? '';
    return { isJa: true, key: String(fallback), hasReading: false };
  }

  const key = [first?.family, first?.given].filter(Boolean).join(' ')
    || first?.literal || csl.title || '';
  return { isJa: false, key: String(key).toLowerCase(), hasReading: true };
}

/**
 * 引用文献一覧を APU 規定の順に並べる。
 * 和文ブロック（50音順）→ 欧文ブロック（アルファベット順）。
 *
 * 入力の型をそのまま返す（並べ替えるだけで中身は変えない）。
 *
 * @template T
 * @param {T[]} refs
 * @param {Object} [opts]
 * @param {'ja-first'|'en-first'} [opts.order]  未指定ならスタイルの既定
 * @param {string} [opts.styleId]
 * @returns {T[]}
 */
export function sortReferences(refs, opts = {}) {
  // 既定の並び順は方式ごとの規定。利用者が画面で切り替えたときは opts が勝つ
  const order = opts.order ?? styleOf(opts.styleId).sort.defaultOrder;
  const decorated = refs.map((r) => ({ ref: r, ...sortKeyOf(r) }));

  const ja = decorated.filter((d) => d.isJa);
  const en = decorated.filter((d) => !d.isJa);

  const byKey = (a, b) => a.key.localeCompare(b.key, a.isJa ? 'ja' : 'en');
  ja.sort(byKey);
  en.sort(byKey);

  const blocks = order === 'ja-first' ? [ja, en] : [en, ja];
  return blocks.flat().map((d) => d.ref);
}

/**
 * 読み仮名が無く 50音順が保証できない和文文献を洗い出す。
 * UI で「読みを補ってください」と促すために使う（設計書 §7.1）。
 *
 * @template T
 * @param {T[]} refs
 * @returns {T[]} 読み仮名を欠く和文文献
 */
export function findMissingReadings(refs) {
  return refs.filter((r) => {
    const k = sortKeyOf(r);
    return k.isJa && !k.hasReading;
  });
}
