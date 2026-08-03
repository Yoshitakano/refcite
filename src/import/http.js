/**
 * 外部 API への問い合わせ（共通）
 *
 * 書誌 API は無応答になることがある。実測では NDL の初回応答に
 * 12.5 秒かかった（2 回目以降は 0.06 秒。コールドスタートと思われる）。
 * タイムアウトを設けないと、遅いだけの回線では画面が固まったまま
 * 戻らず、利用者には中断する手立てがない。
 *
 * `AbortSignal.timeout()` は Safari 16 以降で使えるが、
 * それ以前の iOS でも動かす必要があるため AbortController を自前で回す。
 */

/**
 * 既定のタイムアウト（ミリ秒）。
 *
 * 実測の応答時間は NDL 0.05 秒、Crossref 0.6 秒、Open Library 1.0 秒。
 * 12 秒あれば、コールドスタートを含めて通常は収まる。
 * これ以上長くしても、待たされる利用者の不快さが増えるだけで
 * 取得成功率はほとんど上がらない。
 */
export const DEFAULT_TIMEOUT = 12000;

/**
 * 1 回の取込操作にかける上限（ミリ秒）。
 *
 * ISBN 取込は NDL と Open Library を順に試すため、1 件あたりの
 * 制限だけでは最悪 2 倍待つことになる。全体の上限を別に設ける。
 */
export const TOTAL_BUDGET = 18000;

/**
 * タイムアウトで打ち切られたことを表す。
 *
 * 通信そのものの失敗（圏外・DNS 不達）と区別する。利用者への
 * 案内が変わるため（前者は「時間をおいて」、後者は「接続を確認」）。
 */
export class TimeoutError extends Error {
  constructor(ms) {
    super(`応答がありませんでした（${Math.round(ms / 1000)}秒）`);
    this.name = 'TimeoutError';
    this.timeout = true;
  }
}

/**
 * タイムアウト付きの fetch。
 *
 * 中断は `AbortController` で行う。時間切れになった時点で接続を切るので、
 * 応答を待ち続けて端末の接続枠を占有し続けることがない。
 *
 * @param {typeof fetch} f  fetch 実装（テストでは差し替える）
 * @param {string} url
 * @param {Object} [init]  fetch のオプション
 * @param {number} [init.timeout]  ミリ秒。既定 15 秒
 * @returns {Promise<Response>}
 * @throws {TimeoutError} 時間切れ
 */
export async function fetchWithTimeout(f, url, init = {}) {
  const { timeout = DEFAULT_TIMEOUT, ...rest } = init;

  // AbortController が無い環境（古い実行系・簡易モック）では素通しする。
  // 打ち切れないだけで、取得そのものは従来どおり動く。
  if (typeof AbortController === 'undefined') {
    return f(url, rest);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);

  try {
    return await f(url, { ...rest, signal: ctrl.signal });
  } catch (e) {
    // abort による失敗は、通信エラーではなく時間切れとして扱う。
    // 名前は実装により AbortError / DOMException などまちまちなので、
    // 自分で張ったタイマーが発火済みかどうかで判断する。
    if (ctrl.signal.aborted) throw new TimeoutError(timeout);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 例外を利用者向けの文言にする。
 *
 * @param {Error} e
 * @param {string} who  問い合わせ先の呼び名（'NDL' など）
 * @returns {string}
 */
export function describeError(e, who) {
  if (e?.timeout) {
    return `${who}から応答がありません。混雑しているか、通信が遅い可能性があります。`
      + '時間をおいて試すか、手入力で登録してください';
  }
  return `${who}に接続できませんでした（${e?.message ?? '原因不明'}）。`
    + 'インターネット接続を確認してください';
}
