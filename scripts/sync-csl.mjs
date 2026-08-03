/**
 * CSL 資産を public/ へ同期する。
 *
 * src/citation/styles/ が正。public/ はビルド成果物として扱い、
 * 手で編集しない。build と dev の前に必ず走らせる。
 *
 * 配信するのは CSL とロケールだけ。styles/ 配下にはパッケージの
 * JavaScript や README も入っているので、ディレクトリごと複製すると
 * ソースが公開側へ出てしまう（実際に一度そうなった）。
 *
 * next.config.mjs も同じ同期を行う。`next build` を直接叩くと
 * このスクリプトが飛ぶため、二重に持たせてある。
 */
import { cp, mkdir, copyFile } from 'fs/promises';
import { STYLES } from '../src/citation/styles/index.js';

const to = new URL('../public/csl/', import.meta.url);
await mkdir(to, { recursive: true });

await cp(new URL('../src/citation/locales/', import.meta.url), to, { recursive: true });

for (const s of STYLES) {
  await copyFile(
    new URL(`../src/citation/styles/${s.id}/style.csl`, import.meta.url),
    new URL(s.asset, to),
  );
}

console.log(`CSL 資産を public/csl へ同期しました（${STYLES.length} 方式）`);
