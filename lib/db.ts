/**
 * リポジトリへのアクセス（クライアント専用）
 *
 * `new Repository()` は Dexie を介して IndexedDB を開くため、サーバ側で
 * 評価されると落ちる。Next.js は静的書き出しでもビルド時に一度モジュールを
 * 評価するので、トップレベルでインスタンス化してはいけない。
 * 初回アクセス時に遅延生成する。
 */

import { Repository } from '@lib/db/repository.js';
import { SCHEMA_VERSION } from '@lib/db/schema.js';
import { backupBeforeUpgrade } from '@lib/db/safety.js';

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

/**
 * スキーマの版が上がる前に、中身を控える。
 *
 * 利用者のデータはこの端末にしか無い。スキーマ変更を書き損じると
 * テーブルごと消え、しかも DB を開いた瞬間に起きるので事後には戻せない。
 * 開く前に localStorage へ逃がしておく（IndexedDB 側の事故に巻き込まれない）。
 *
 * getRepo() より先に呼ぶこと。アプリ起動時（ServiceWorker と同じ位置）に
 * 一度だけ走らせる。
 */
export async function guardData(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    // Dexie を通さず版だけ見たいので、控え用に使い捨ての参照を作る
    const { default: Dexie } = await import('dexie');
    await backupBeforeUpgrade(new Dexie('refcite'), SCHEMA_VERSION);
  } catch {
    // 控えが取れなくても起動は妨げない
  }
}
