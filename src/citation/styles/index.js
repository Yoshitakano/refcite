/**
 * 引用スタイルの登録簿
 *
 * 提供する方式をここに並べる。方式を足すときに触るのはこのファイルだけで、
 * 画面や出力のコードは変更しなくてよい（styles/types.js の取り決めに従う限り）。
 *
 * いまは APU 内での試験運用のため1種のみ。学生が選択を誤って別形式で
 * 提出する事故を避けるねらいもあり、画面のスタイル選択は2種以上に
 * なったときだけ出す。
 */

import apu from './apu/index.js';

/** @type {import('./types.js').CitationStyle[]} */
export const STYLES = [apu];

/** 既定のスタイル。プロジェクトに指定が無いときに使う */
export const DEFAULT_STYLE_ID = apu.id;

/**
 * id からスタイル定義を引く。
 *
 * 未知の id では既定のスタイルを返す。提供する方式を減らしたとき、
 * 保存済みのプロジェクトが消えた id（'apa' など）を指したままになる。
 * ここで例外を投げると画面全体が落ちるため、既定へ倒すほうが実害が小さい。
 *
 * 索引を作り置きせず毎回 STYLES を見るのは、登録簿と引き当ての結果が
 * 食い違わないようにするため。方式は多くても数種なので線形探索で足りる。
 *
 * @param {string} [id]
 * @returns {import('./types.js').CitationStyle}
 */
export function styleOf(id) {
  return STYLES.find((s) => s.id === id)
    ?? STYLES.find((s) => s.id === DEFAULT_STYLE_ID)
    ?? STYLES[0];
}

/**
 * 画面に出す一覧（id・表示名・補足だけ）。
 * 画面はこれを読むだけでよく、CSL や種別定義までは知らなくてよい。
 */
export const PRESET_STYLES = STYLES.map(({ id, label, note }) => ({ id, label, note }));

/** 現在の登録内容から画面用の一覧を作る（登録簿を触ったあとに使う） */
export function presetStyles() {
  return STYLES.map(({ id, label, note }) => ({ id, label, note }));
}
