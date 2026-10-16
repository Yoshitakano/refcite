/**
 * Service Worker — オフライン対応
 *
 * Next.js の静的書き出し（out/）を対象にする。ビルド成果物のファイル名は
 * ハッシュ付きで変わるため、レガシー版のように一覧を固定できない。
 * ナビゲーション要求とビルド資産を実行時にキャッシュする方式にする。
 *
 * 外部 API（NDL / Crossref / Open Library）は絶対にキャッシュしない。
 * 書誌が古いまま返ると、ユーザーは気づかないまま誤った引用を提出しうる。
 */

// 版数を上げると古いキャッシュが破棄される。
// CSL（引用書式）を直したら必ず上げること。上げ忘れると、
// 一度アプリを開いた端末では古い書式が使われ続ける。
const VERSION = 'refcite-next-v5';

/**
 * 引用スタイルの CSL。
 * 方式を足したときに列挙し忘れるとオフラインで開けなくなるため、
 * ビルド（next.config.mjs）が登録簿から書き換える。手で編集しないこと。
 */
const STYLE_ASSETS = ['./csl/apu.csl']; // BUILD:STYLE_ASSETS

/**
 * 配信先の接頭辞（例: /refcite/）。GitHub Pages ではリポジトリ名の下に
 * 置かれるので、パスは必ずこの SW の位置からの相対で書く。
 */
const BASE = new URL('./', self.location).pathname;

/** 起動に最低限必要なもの。ハッシュを含まないパスだけを列挙する */
const SHELL = ['./', './reference/', './write/', './help/', './icon.svg',
               './icon-192.png', './icon-512.png', './manifest.webmanifest',
               ...STYLE_ASSETS,
               './csl/locales-ja-JP.xml', './csl/locales-en-US.xml'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.all(SHELL.map(async (url) => {
      try { await cache.add(new Request(url, { cache: 'reload' })); }
      catch { /* 取れなかったものは実行時に取りに行く */ }
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

/** 書誌 API か（キャッシュしてはいけない先） */
function isExternalApi(url) {
  return /(?:ndlsearch\.ndl\.go\.jp|api\.crossref\.org|openlibrary\.org)/.test(url.hostname);
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (isExternalApi(url)) return;          // 常にネットワーク
  if (url.origin !== self.location.origin) return;

  // 引用書式（CSL）は常に最新を取りに行く。
  // 書式の誤りを直しても古いキャッシュが残ると、ユーザーは気づかないまま
  // 誤った引用文献リストを提出しうる。オフライン時のみキャッシュに落とす。
  if (url.pathname.startsWith(BASE + 'csl/')) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) {
          const cache = await caches.open(VERSION);
          cache.put(request, fresh.clone());
          return fresh;
        }
      } catch { /* オフライン。キャッシュに落とす */ }
      const cached = await caches.match(request);
      return cached ?? new Response('引用書式を読み込めませんでした', { status: 503 });
    })());
    return;
  }

  e.respondWith((async () => {
    const cached = await caches.match(request);

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

    // オフラインで未キャッシュのページを要求されたら書架を返す
    if (request.mode === 'navigate') {
      const shell = await caches.match(BASE);
      if (shell) return shell;
    }
    return new Response('オフラインのため読み込めませんでした', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  })());
});
