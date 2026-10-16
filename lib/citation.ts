/**
 * 引用エンジンの生成（クライアント専用）
 *
 * CSL スタイルとロケールは XML ファイルなので fetch で取る。
 * 生成は 1 回だけにしたいので Promise をキャッシュする。
 *
 * 提供する方式は src/citation/styles/index.js の登録簿が決める。
 * 方式を足してもこのファイルは変更しなくてよい。
 *
 * いまは APU 内での試験運用のため1種のみ。学生が選択を誤って別形式で
 * 提出する事故を避けるため、画面のスタイル選択は2種以上のときだけ出す。
 */

import { CitationEngine } from '@lib/citation/index.js';
import {
  STYLES, PRESET_STYLES, DEFAULT_STYLE_ID, styleOf,
} from '@lib/citation/styles/index.js';
import { BASE_PATH } from '@/lib/base';

export type StyleId = string;
export type SortOrder = 'ja-first' | 'en-first';

export { PRESET_STYLES, DEFAULT_STYLE_ID, styleOf };

let enginePromise: Promise<CitationEngine> | null = null;

/**
 * 引用エンジンを取得する。
 * CSL 資産は public/csl 配下に置き、静的ファイルとして配信する。
 */
export function getEngine(): Promise<CitationEngine> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const load = (p: string) => fetch(p).then((r) => {
        if (!r.ok) throw new Error(`引用スタイルを読み込めません: ${p}`);
        return r.text();
      });

      const [styleXmls, ja, en] = await Promise.all([
        Promise.all(STYLES.map((s) => load(`${BASE_PATH}/csl/${s.asset}`))),
        load(`${BASE_PATH}/csl/locales-ja-JP.xml`),
        load(`${BASE_PATH}/csl/locales-en-US.xml`),
      ]);

      return new CitationEngine({
        styles: Object.fromEntries(STYLES.map((s, i) => [s.id, styleXmls[i]])),
        locales: { 'ja-JP': ja, 'en-US': en },
      });
    })();
  }
  return enginePromise;
}
