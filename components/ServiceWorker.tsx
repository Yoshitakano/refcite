'use client';

import { useEffect } from 'react';

/**
 * Service Worker の登録（オフライン対応）。
 *
 * 開発中に登録すると、ビルド前の古い資産が残って混乱するため本番のみ。
 * 失敗しても致命的ではないので握りつぶす（オフライン対応が無いだけで動く）。
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
