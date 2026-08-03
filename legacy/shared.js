/**
 * 画面共通の基盤。
 *
 * ページを機能で分けたため（書架 / 文献詳細 / 執筆）、
 * リポジトリ・引用エンジン・共通 UI をここに集約する。
 */

import { Repository } from '../src/db/repository.js';
import { CitationEngine } from '../src/citation/index.js';

export const repo = new Repository();

/**
 * Service Worker を登録する（オフライン対応）。
 * 失敗しても致命的ではないので握りつぶす。file:// で開いた場合や
 * HTTP（localhost 以外）では登録できない。
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(new URL('./sw.js', import.meta.url), { scope: './' })
      .catch(() => { /* オフライン対応が無いだけで動作はする */ });
  });
}

let enginePromise = null;

/** 引用エンジンを遅延生成する（CSL の取得は1回だけ） */
export function getEngine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const load = (p) => fetch(new URL(p, import.meta.url)).then((r) => r.text());
      const [apu, apa, sist02, ja, en] = await Promise.all([
        load('../src/citation/styles/apu.csl'),
        load('../src/citation/styles/apa.csl'),
        load('../src/citation/styles/sist02.csl'),
        load('../src/citation/locales/locales-ja-JP.xml'),
        load('../src/citation/locales/locales-en-US.xml'),
      ]);
      return new CitationEngine({
        styles: { apu, apa, sist02 },
        locales: { 'ja-JP': ja, 'en-US': en },
      });
    })();
  }
  return enginePromise;
}

export const $ = (id) => document.getElementById(id);

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** メッセージ表示。text が空なら消す */
export function msg(elId, text, kind = 'ok') {
  const el = $(elId);
  if (!el) return;
  el.innerHTML = text ? `<div class="msg ${kind}">${escapeHtml(text)}</div>` : '';
}

/** 書誌から表示用の著者名を作る */
export function authorLabel(csl) {
  const names = (csl.author ?? []).map((a) => a.literal ?? `${a.family ?? ''}${a.given ?? ''}`);
  if (!names.length) return '著者不明';
  return names.join('・');
}

/** 書誌から表示用の年を取り出す */
export function yearLabel(csl) {
  return csl.issued?.['date-parts']?.[0]?.[0] ?? '年不明';
}

/**
 * 現在のプロジェクトを取得する。無ければ既定を作る。
 * ページをまたいで選択を保つため settings に持たせる。
 */
export async function currentProject() {
  let projects = await repo.listProjects();
  if (!projects.length) {
    await repo.saveProject({ name: '未分類', styleId: 'apu' });
    projects = await repo.listProjects();
  }
  const id = await repo.getSetting('currentProject', projects[0].id);
  const found = projects.find((p) => p.id === id) ?? projects[0];
  return { project: found, projects };
}

export async function setCurrentProject(id) {
  await repo.setSetting('currentProject', id);
}

/** ナビゲーションの現在地を反映する */
export function markNav(page) {
  document.querySelectorAll('nav a').forEach((a) => {
    a.classList.toggle('on', a.dataset.page === page);
  });
}
