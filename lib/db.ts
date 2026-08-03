/**
 * リポジトリへのアクセス（クライアント専用）
 *
 * `new Repository()` は Dexie を介して IndexedDB を開くため、サーバ側で
 * 評価されると落ちる。Next.js は静的書き出しでもビルド時に一度モジュールを
 * 評価するので、トップレベルでインスタンス化してはいけない。
 * 初回アクセス時に遅延生成する。
 */

import { Repository } from '@lib/db/repository.js';

let instance: Repository | null = null;

/**
 * リポジトリを取得する。ブラウザ以外で呼ぶとエラーになる。
 * 呼び出しは必ず useEffect / イベントハンドラの中から行うこと。
 */
export function getRepo(): Repository {
  if (typeof window === 'undefined') {
    throw new Error('リポジトリはブラウザでのみ利用できます');
  }
  if (!instance) instance = new Repository();
  return instance;
}
