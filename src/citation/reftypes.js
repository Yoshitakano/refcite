/**
 * 手入力の文献種別（方式によらない入口）
 *
 * 種別の中身（どんな欄をどの順で出すか、CSL-JSON へどう組むか）は
 * 方式ごとに違うので、各スタイルのパッケージが持つ。ここはその取り次ぎ。
 */

import { styleOf } from './styles/index.js';

/**
 * そのスタイルの文献種別一覧。
 * @param {string} [styleId]
 * @returns {import('./styles/types.js').RefType[]}
 */
export function refTypesOf(styleId) {
  return styleOf(styleId).refTypes;
}

/**
 * id から種別を引く。未知の id では先頭の種別に倒す。
 * @param {string} id
 * @param {string} [styleId]
 */
export function refTypeOf(id, styleId) {
  const types = refTypesOf(styleId);
  return types.find((t) => t.id === id) ?? types[0];
}

/**
 * 入力値を CSL-JSON へ組み立てる。
 * @param {string} typeId
 * @param {Record<string,string>} values
 * @param {string} [styleId]
 */
export function buildManualFields(typeId, values, styleId) {
  return styleOf(styleId).buildManualFields(typeId, values);
}

/**
 * 必須項目が埋まっているか調べる。
 * @returns {string[]} 未入力の項目名
 */
export function missingRequired(typeId, values, styleId) {
  return refTypeOf(typeId, styleId).fields
    .filter((f) => f.required && !String(values[f.key] ?? '').trim())
    .map((f) => f.label);
}
