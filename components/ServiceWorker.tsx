'use client';

import { useEffect } from 'react';
import { guardData } from '@/lib/db';

/**
 * 起動時の下ごしらえ。
 *
 * 1. データの控えを取る（スキーマ変更で消える事故に備える）
 * 2. Service Worker の登録（オフライン対応）
 *
 * 控えは必ず先に取る。DB を開いたあとでは、スキーマ変更は
 * すでに適用されてしまっている。
 */
export function ServiceWorker() {
  useEffect(() => {
    // 版が上がるときだけ中身を控える（毎回ではない）
    guardData();

    // 開発中に登録すると、ビルド前の古い資産が残って混乱するため本番のみ。
    // 失敗しても致命的ではないので握りつぶす（オフライン対応が無いだけで動く）。
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
