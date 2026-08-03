/**
 * Service Worker — オフライン対応（設計書 §2）
 *
 * データは IndexedDB にあるため、アプリの殻（HTML/CSS/JS と CSL スタイル）が
 * キャッシュされていればオフラインでも書架の閲覧・抜き書き・引用リスト生成が
 * できる。取込だけが外部 API を要するので使えない。
 *
 * 外部 API（NDL / Crossref / Open Library）は絶対にキャッシュしない。
 * 書誌が古いまま返ると、ユーザーは気づかないまま誤った引用を提出しうる。
 */

const VERSION = 'refcite-v1';

/** 殻として必要なファイル。1つでも取得に失敗すると install が失敗する */
const SHELL = [
  './',
  './index.html',
  './detail.html',
  './write.html',
  './style.css',
  './shared.js',
  './scanner.js',
  './icon.svg',
  './manifest.webmanifest',
  './pages/shelf.js',
  './pages/detail.js',
  './pages/write.js',
  './vendor/dexie.mjs',
  './vendor/citeproc.mjs',
  '../src/citation/index.js',
  '../src/citation/engine.js',
  '../src/citation/normalize.js',
  '../src/citation/sort.js',
  '../src/citation/export.js',
  '../src/citation/types.js',
  '../src/db/schema.js',
  '../src/db/repository.js',
  '../src/import/index.js',
  '../src/import/crossref.js',
  '../src/import/isbn.js',
  '../src/import/search.js',
  '../src/import/barcode.js',
  '../src/citation/styles/apu.csl',
  '../src/citation/styles/apa.csl',
  '../src/citation/styles/sist02.csl',
  '../src/citation/locales/locales-ja-JP.xml',
  '../src/citation/locales/locales-en-US.xml',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // 個別に入れる。1ファイルの失敗で全体を落とさないため
    // （ZXing は 440KB あり、必要になるまで取得しない）
    await Promise.all(SHELL.map(async (url) => {
      try { await cache.add(new Request(url, { cache: 'reload' })); }
      catch { /* 取得できなかったものは実行時に取りに行く */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/** 外部 API か（キャッシュしてはいけない先） */
function isExternalApi(url) {
  return /(?:ndlsearch\.ndl\.go\.jp|api\.crossref\.org|openlibrary\.org)/.test(url.hostname);
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 書誌 API は常にネットワーク。オフラインなら素直に失敗させ、
  // 呼び出し側（import 層）のエラーメッセージに委ねる
  if (isExternalApi(url)) return;

  // 同一オリジンのみ扱う
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    const cached = await caches.match(request);

    // キャッシュ優先で即座に返しつつ、裏で更新する（stale-while-revalidate）。
    // 開発中もオフラインでも同じ挙動になり、体感が安定する。
    const network = fetch(request).then(async (res) => {
      if (res && res.ok) {
        const cache = await caches.open(VERSION);
        cache.put(request, res.clone());
      }
      return res;
    }).catch(() => null);

    if (cached) return cached;

    const fresh = await network;
    if (fresh) return fresh;

    // HTML の要求がオフラインで落ちたときは書架を返す
    if (request.mode === 'navigate') {
      const shell = await caches.match('./index.html');
      if (shell) return shell;
    }
    return new Response('オフラインのため読み込めませんでした', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  })());
});
