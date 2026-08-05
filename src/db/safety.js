/**
 * データ保全
 *
 * 利用者の書誌・抜き書きはこの端末の中にしか無い。サーバに控えが無いので、
 * 一度壊すと取り返しがつかない。開発側の不注意で消えることを防ぐ。
 *
 * 想定している事故:
 *   1. スキーマ変更の書き損じ（`notes: null` のような指定でテーブルごと消える）
 *   2. 取込（復元）の失敗で、既存データを消したあとに書き戻せない
 *   3. 保存処理の不具合で、既存レコードを空の値で上書きする
 *
 * いずれも「消える瞬間」は静かなので、事後に気づいても遅い。
 * 変更を加える前に必ず控えを取り、異常を検知したら書き込みを止める。
 */

/** 自動バックアップの保存先（localStorage のキー） */
const AUTO_KEY = 'refcite:auto-backup';
const AUTO_META = 'refcite:auto-backup-meta';

/**
 * スキーマの版が上がる前に、中身をまるごと控える。
 *
 * IndexedDB のスキーマ変更は、書き損じるとテーブルごと消える。しかも
 * 開いた瞬間に起きるため、画面が出たときには手遅れになっている。
 * 開く前に読み出して localStorage へ逃がしておく（別の保存領域なので、
 * IndexedDB 側の事故に巻き込まれない）。
 *
 * @param {Object} db  Dexie インスタンス（未 open）
 * @param {number} expectedVersion  コードが期待する版
 * @returns {Promise<{taken:boolean, reason?:string}>}
 */
export async function backupBeforeUpgrade(db, expectedVersion) {
  if (typeof indexedDB === 'undefined' || typeof localStorage === 'undefined') {
    return { taken: false, reason: 'no-storage' };
  }

  let existing;
  try {
    // 既存の版を調べる。まだ無ければ何も守るものが無い
    const dbs = typeof indexedDB.databases === 'function'
      ? await indexedDB.databases()
      : null;
    if (dbs) {
      const found = dbs.find((d) => d.name === db.name);
      if (!found) return { taken: false, reason: 'new-db' };
      existing = found.version;
    }
  } catch {
    // databases() が使えない環境。控えを取る側に倒す
  }

  // Dexie の版は 10 倍された値で入る（version(1) → 10）
  if (existing != null && existing >= expectedVersion * 10) {
    return { taken: false, reason: 'same-version' };
  }

  try {
    const dump = await readAllRaw(db.name);
    if (!dump) return { taken: false, reason: 'empty' };
    localStorage.setItem(AUTO_KEY, JSON.stringify(dump));
    localStorage.setItem(AUTO_META, JSON.stringify({
      at: new Date().toISOString(),
      fromVersion: existing ?? null,
      toVersion: expectedVersion,
      counts: {
        references: dump.references?.length ?? 0,
        notes: dump.notes?.length ?? 0,
        projects: dump.projects?.length ?? 0,
      },
    }));
    return { taken: true };
  } catch (e) {
    // 容量超過など。控えは取れなくても起動は妨げない
    return { taken: false, reason: e?.name ?? 'failed' };
  }
}

/**
 * Dexie を通さず、生の IndexedDB で全件読み出す。
 *
 * Dexie で開くとスキーマ定義が適用され、その時点で版が上がってしまう。
 * 控えを取る目的では、いまディスクにあるものをそのまま読む必要がある。
 */
function readAllRaw(name) {
  return new Promise((resolve) => {
    const req = indexedDB.open(name);   // 版を指定せず、現状のまま開く
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const idb = req.result;
      const names = [...idb.objectStoreNames];
      if (!names.length) { idb.close(); return resolve(null); }

      const out = { format: 'refcite-backup', version: 1, auto: true,
                    exportedAt: new Date().toISOString() };
      try {
        const tx = idb.transaction(names, 'readonly');
        let left = names.length;
        for (const n of names) {
          const all = tx.objectStore(n).getAll();
          all.onsuccess = () => {
            out[n] = all.result;
            if (--left === 0) { idb.close(); resolve(out); }
          };
          all.onerror = () => {
            if (--left === 0) { idb.close(); resolve(out); }
          };
        }
      } catch {
        idb.close();
        resolve(null);
      }
    };
    // 他タブが開いていて版を上げられない場合。控えは諦める
    req.onblocked = () => resolve(null);
  });
}

/** 自動バックアップの情報。無ければ null */
export function autoBackupInfo() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const meta = localStorage.getItem(AUTO_META);
    return meta ? JSON.parse(meta) : null;
  } catch { return null; }
}

/** 自動バックアップの中身。無ければ null */
export function autoBackupData() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(AUTO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/**
 * 保存しようとしている内容が、既存を壊さないか調べる。
 *
 * 保存処理の不具合で、入力済みの項目が抜けたレコードを put すると
 * 既存が黙って上書きされる。「項目が減る」変更だけを異常とみなす
 * （利用者が自分で消した場合と区別が付かないため、止めずに報せる）。
 *
 * @param {Object} before  保存前のレコード（無ければ null）
 * @param {Object} after   保存しようとしているレコード
 * @param {string[]} watch 見張る項目
 * @returns {string[]} 失われる項目名
 */
export function losingFields(before, after, watch) {
  if (!before) return [];
  return watch.filter((k) => {
    const b = before[k];
    const a = after[k];
    if (b == null || b === '') return false;          // もともと無い
    if (Array.isArray(b)) return Array.isArray(a) ? a.length === 0 && b.length > 0 : a == null;
    return a == null || a === '';
  });
}
