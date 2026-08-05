/**
 * 抜き書きの並べ替え
 *
 * 溜まってくると、読んだ順に見たいときと、本の頭から順に
 * 追いたいときが出てくる。前者は登録順、後者はページ順。
 */

/**
 * 並べ替えの選択肢。画面のプルダウンはこの定義から作る。
 * @type {{id: string, label: string}[]}
 */
export const NOTE_SORTS = [
  { id: 'created-desc', label: '登録が新しい順' },
  { id: 'created-asc', label: '登録が古い順' },
  { id: 'page-asc', label: 'ページの小さい順' },
  { id: 'page-desc', label: 'ページの大きい順' },
  { id: 'comment-desc', label: 'コメントが新しい順' },
  { id: 'comment-asc', label: 'コメントが古い順' },
];

export const DEFAULT_NOTE_SORT = 'created-desc';

/**
 * ページ表記から並べ替え用の数値を取り出す。
 *
 * 「40」「12-14」「iv」「40頁」などが入りうる。範囲は開始ページで見る。
 * 数字が拾えないものは末尾へ回す（大きな値を返す）。
 * 文字列比較にすると「7」が「12」より後になるため、必ず数値で比べる。
 *
 * @param {string} [page]
 * @returns {number}
 */
export function pageValue(page) {
  const m = String(page ?? '').match(/\d+/);
  return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER;
}

/**
 * 抜き書きを並べ替える。元の配列は変更しない。
 *
 * @template {{createdAt?: string, commentAt?: string,
 *             locator?: {page?: string}}} T
 * @param {T[]} notes
 * @param {string} [sortId]
 * @returns {T[]}
 */
export function sortNotes(notes, sortId = DEFAULT_NOTE_SORT) {
  const list = [...(notes ?? [])];
  const byCreated = (a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''));

  switch (sortId) {
    case 'created-asc':
      return list.sort(byCreated);

    case 'page-asc':
    case 'page-desc': {
      const dir = sortId === 'page-asc' ? 1 : -1;
      return list.sort((a, b) => {
        const pa = pageValue(a.locator?.page);
        const pb = pageValue(b.locator?.page);
        // ページ数の無いものは向きによらず末尾。降順で先頭に来ると、
        // 本文を追う目的で並べたのに関係ない項目が最初に出てしまう
        const na = pa === Number.MAX_SAFE_INTEGER;
        const nb = pb === Number.MAX_SAFE_INTEGER;
        if (na !== nb) return na ? 1 : -1;
        if (na) return byCreated(a, b);
        // 同じページ内では登録順にする。並びが毎回変わると探しにくい
        const d = pa - pb;
        return d !== 0 ? d * dir : byCreated(a, b);
      });
    }

    case 'comment-asc':
    case 'comment-desc': {
      const dir = sortId === 'comment-asc' ? 1 : -1;
      return list.sort((a, b) => {
        // コメントの無いものは常に末尾。日付順の中に混ぜても意味がない
        const ac = !!a.commentAt, bc = !!b.commentAt;
        if (ac !== bc) return ac ? -1 : 1;
        if (!ac) return byCreated(a, b);
        return String(a.commentAt).localeCompare(String(b.commentAt)) * dir;
      });
    }

    case 'created-desc':
    default:
      return list.sort((a, b) => byCreated(b, a));
  }
}
