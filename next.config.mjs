/**
 * ビルドのたびに CSL 資産を public/ へ同期する。
 *
 * `npm run build` は同期スクリプトを前に走らせるが、`next build` を
 * 直接叩くと飛んでしまい、公開側だけ古い CSL が残る。
 * 実際にそれで修正が反映されていない状態に気づけなかったため、
 * 設定の読み込み時に必ず同期する。
 *
 * 各スタイルは styles/<id>/style.csl を持つ。配信名は登録簿の asset に
 * 合わせるので、方式を足しても ここは触らなくてよい。
 */
import { cpSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'fs';
import { STYLES } from './src/citation/styles/index.js';

const here = import.meta.dirname;
mkdirSync(`${here}/public/csl`, { recursive: true });
cpSync(`${here}/src/citation/locales`, `${here}/public/csl`, { recursive: true });
for (const s of STYLES) {
  copyFileSync(
    `${here}/src/citation/styles/${s.id}/style.csl`,
    `${here}/public/csl/${s.asset}`,
  );
}

// Service Worker が先読みする CSL の一覧を登録簿に合わせる。
// 手で書くと方式を足したときに漏れ、その端末だけオフラインで開けなくなる。
{
  const swPath = `${here}/public/sw.js`;
  // Service Worker の位置からの相対パス。配信先の接頭辞（/refcite/ など）に依存させない
  const list = STYLES.map((s) => `'./csl/${s.asset}'`).join(', ');
  const sw = readFileSync(swPath, 'utf8');
  const next = sw.replace(
    /^const STYLE_ASSETS = .*; \/\/ BUILD:STYLE_ASSETS$/m,
    `const STYLE_ASSETS = [${list}]; // BUILD:STYLE_ASSETS`,
  );
  if (next !== sw) writeFileSync(swPath, next);
}

/**
 * Next.js 設定。
 *
 * 静的書き出し（output: 'export'）にする理由:
 *   サーバを持たない設計（設計書 §1.1）を維持するため。データは
 *   IndexedDB にのみ置き、外部 API はブラウザから直接叩く。
 *   静的ファイルとして配信できれば PWA 化もそのまま通る。
 */
const nextConfig = {
  output: 'export',
  // GitHub Pages ではリポジトリ名の下に置かれる（lib/base.ts）。ローカルでは空
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  distDir: '.next',
  images: { unoptimized: true },   // 静的書き出しでは最適化が使えない
  // 末尾スラッシュ付きにすると out/ をそのまま配信したときのパスが安定する
  trailingSlash: true,
  // ホームディレクトリにも package-lock.json があるため、
  // 明示しないとワークスペースルートを誤検出する
  turbopack: { root: import.meta.dirname },
};
export default nextConfig;
