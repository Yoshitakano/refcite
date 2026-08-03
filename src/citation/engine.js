/**
 * 引用エンジン ― citeproc-js ラッパ
 *
 * 責務は「CSL-JSON の配列 + スタイル指定」から引用文献リストを生成すること。
 * citeproc-js は sys オブジェクト経由でスタイル・ロケール・書誌を要求してくる
 * 同期 API のため、必要な資産は生成前に全てメモリに載せておく必要がある。
 */

import CSL from 'citeproc';

/**
 * 引用エンジン。スタイルとロケールを保持し、書誌リストの整形を行う。
 */
export class CitationEngine {
  /**
   * @param {Object} assets
   * @param {Record<string,string>} assets.styles   styleId -> CSL XML
   * @param {Record<string,string>} assets.locales  'ja-JP' -> ロケール XML
   */
  constructor({ styles, locales }) {
    this.styles = styles;
    this.locales = locales;
  }

  /**
   * 書誌リストを整形する。
   *
   * @param {import('./types.js').CSLItem[]} items
   * @param {string} styleId  'apa' | 'sist02' | ...
   * @param {Object} [opts]
   * @param {string} [opts.lang]  強制ロケール。未指定ならスタイル既定に従う
   * @param {boolean} [opts.preserveOrder]
   *   true なら items の並びをそのまま保つ。
   *   citeproc は自前の <sort> で並べ替えるが、漢字のコードポイント順は
   *   50音順と一致しないため、読み仮名を持つアプリ側（sort.js）で
   *   並べた順を優先したい場合に使う。
   * @returns {{ entries: string[], ids: string[] }} entries は HTML 文字列
   */
  renderBibliography(items, styleId, opts = {}) {
    // 保存済みのプロジェクトが、今は提供していないスタイル（過去に選べた
    // 'apa' など）を指していることがある。例外で画面全体を落とすより、
    // 利用できる最初のスタイルで出すほうが実害が小さい。
    const available = Object.keys(this.styles);
    if (!available.length) throw new Error('引用スタイルが読み込まれていません');
    const styleXml = this.styles[styleId] ?? this.styles[available[0]];

    // citeproc は id をキーに同期的に書誌を引きに来るため、事前に索引を作る
    const byId = new Map(items.map((it) => [String(it.id), it]));

    const sys = {
      retrieveItem: (id) => byId.get(String(id)),
      retrieveLocale: (lang) =>
        this.locales[lang] ?? this.locales['en-US'] ?? null,
    };

    const engine = new CSL.Engine(sys, styleXml, opts.lang, !!opts.lang);
    engine.updateItems(items.map((it) => String(it.id)));

    const [meta, entries] = engine.makeBibliography();
    const outIds = meta.entry_ids.flat().map(String);
    const trimmed = entries.map((e) => e.trim());

    if (!opts.preserveOrder) {
      return { entries: trimmed, ids: outIds };
    }

    // citeproc の並びを、引数で与えられた順に戻す
    const byOutId = new Map(outIds.map((id, i) => [id, trimmed[i]]));
    const wanted = items.map((it) => String(it.id));
    return {
      entries: wanted.map((id) => byOutId.get(id)).filter(Boolean),
      ids: wanted,
    };
  }

  /**
   * 単一文献を整形する（プレビュー用途）。
   * @param {import('./types.js').CSLItem} item
   * @param {string} styleId
   * @param {Object} [opts]
   * @returns {string} HTML 文字列
   */
  renderOne(item, styleId, opts = {}) {
    const { entries } = this.renderBibliography([item], styleId, opts);
    return entries[0] ?? '';
  }

  /**
   * 本文中の出典表記を作る（マニュアル 2章・3章・7章）。
   *
   *   単著        （田中, 2020, p.45）
   *   2名の共著   （田中・佐藤, 2014, pp.10-12）
   *   3名以上     （加藤ほか, 2013, p.31）
   *   複数文献    （伊藤, 2020, p.5; 渡辺, 2021, p.11）
   *
   * @param {import('./types.js').CSLItem[]} items  全書誌（同一著者の判別に要る）
   * @param {{id:string, locator?:string}[]} cites  引用する文献とページ
   * @param {string} styleId
   * @returns {string} 例: 「（田中, 2020, p.45）」
   */
  renderCitation(items, cites, styleId) {
    const available = Object.keys(this.styles);
    if (!available.length) throw new Error('引用スタイルが読み込まれていません');
    const styleXml = this.styles[styleId] ?? this.styles[available[0]];

    const byId = new Map(items.map((it) => [String(it.id), it]));
    const sys = {
      retrieveItem: (id) => byId.get(String(id)),
      retrieveLocale: (lang) => this.locales[lang] ?? this.locales['en-US'] ?? null,
    };

    const engine = new CSL.Engine(sys, styleXml);
    const allIds = items.map((it) => String(it.id));
    engine.updateItems(allIds);

    // 同一著者・同年の a/b/c を確定させる。
    //
    // citeproc は「同じクラスタ内で衝突する」か「逐次処理で先行引用がある」
    // ときにしか採番しない。単発の引用では衝突が見えないため
    // 「石井, 1991」のままになり、一覧の「石井六（1991b）」と食い違う
    // （実測で確認）。
    //
    // そこで全書誌を 1 つのクラスタとして一度描画し、どの文献に
    // どの接尾辞が付くかの対応表を作ってから、本来の引用に当てる。
    const suffixes = new Map();
    if (allIds.length > 1) {
      const probe = engine.previewCitationCluster(
        { citationItems: allIds.map((id) => ({ id })), properties: { noteIndex: 0 } },
        [], [], 'text');
      // 「石井, 1991a; 石井, 1991b」の並びは updateItems の順に対応する
      const parts = probe.replace(/^[（(]|[）)]$/g, '').split('; ');
      allIds.forEach((id, i) => {
        const m = parts[i]?.match(/\d{4}([a-z])/);
        if (m) suffixes.set(id, m[1]);
      });
    }

    const cluster = {
      citationItems: cites.map((c) => ({
        id: String(c.id),
        locator: c.locator,
        label: c.locator ? 'page' : undefined,
      })),
      properties: { noteIndex: 0 },
    };
    let out = engine.previewCitationCluster(cluster, [], [], 'text');

    // 採番された文献には接尾辞を補う
    for (const c of cites) {
      const suffix = suffixes.get(String(c.id));
      if (!suffix) continue;
      const item = byId.get(String(c.id));
      const year = item?.issued?.['date-parts']?.[0]?.[0];
      if (year == null) continue;
      // すでに接尾辞が付いていれば触らない
      out = out.replace(new RegExp(`${year}(?![a-z])`), `${year}${suffix}`);
    }

    return sanitizeSpacing(out);
  }

  /** 利用可能なスタイル ID の一覧 */
  availableStyles() {
    return Object.keys(this.styles);
  }
}

/**
 * HTML 出力からプレーンテキストを得る。
 * .txt 書き出し（仕様 3.4-3）とクリップボードの text/plain 側で使う。
 *
 * @param {string} html
 * @param {Object} [opts]
 * @param {number} [opts.indent]  折り返した行の下げ幅（全角字数）
 */
export function htmlToPlain(html, opts = {}) {
  return expandLineBreaks(sanitizeSpacing(
    html
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/\s+\n/g, '\n')
  ), opts.indent).trim();
}

/**
 * 改行の目印（U+000B）を実際の改行に変える。
 *
 * CSL は改行を出力できないため、URL の直前などに目印を置いている。
 * 折り返した行はスタイルの規定ぶん下げるが、プレーンテキストには
 * インデントの概念がないので全角スペースで代用する。
 *
 * ここで styleOf を引かないのは、この層をスタイル非依存に保つため。
 * 呼び出し側（toPlainText）が layout から取って渡す。
 *
 * @param {string} s
 * @param {number} [indent]  全角字数
 */
function expandLineBreaks(s, indent = 4) {
  return s.replace(/\v/g, '\n' + '\u3000'.repeat(indent));
}

/**
 * citeproc-js が挿入する特殊空白・ダッシュを通常文字へ均す。
 *
 * citeproc は整形の過程で U+202F（narrow no-break space）や U+00A0 を混ぜ、
 * ページ範囲のハイフンを en dash (U+2013) に変換する。見た目はほぼ同じだが
 * Word に貼ると別文字として残り、検索・置換や文字数カウントで齟齬が出る。
 * APU 形式はページ範囲に半角ハイフンを用いるため、ここで統一する。
 *
 * @param {string} s
 */
export function sanitizeSpacing(s) {
  return s
    .replace(/[    ]/g, ' ')  // 各種ノーブレークスペース
    .replace(/(\d)\s*[–—]\s*(\d)/g, '$1-$2'); // ページ範囲のダッシュ
}
