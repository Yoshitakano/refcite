/**
 * APU: 本文中の引用の型（マニュアル 2章・3章・7章）
 *
 * 早見表の各パターンを、そのまま本文へ差し込める形で組み立てる。
 * 出典表記そのもの（（田中, 2020, p.45）の部分）は引用エンジンに作らせ、
 * ここでは部品を受け取って地の文と組む。文字列連結で年やページを
 * 組み立て直すと、pp. の使い分けや同一著者・同年の a/b/c が落ちる。
 *
 * @type {import('../types.js').IntextPattern[]}
 */
export const INTEXT_PATTERNS = [
  {
    id: 'quote-tail',
    label: '短い直接引用・著者名を文末に',
    kind: 'direct',
    hint: '「引用文」（著者名, 年, p.数）。',
    // 「引用文」（著者名, 年, p.数）。
    build: ({ body, citation }) => ({
      text: `「${trimStop(body)}」${citation}。`,
      block: false,
    }),
  },
  {
    id: 'quote-lead',
    label: '短い直接引用・著者名を地の文に',
    kind: 'direct',
    hint: '著者（年, p.数）は「引用文」と述べている。',
    // 地の文が続くので、カギカッコ内の末尾に句点を打たない（マニュアル 2.1）
    build: ({ body, name, year, page }) => ({
      text: `${name}（${[year, page].filter(Boolean).join(', ')}）は`
        + `「${trimStop(body)}」と述べている。`,
      block: false,
    }),
  },
  {
    id: 'block',
    label: '長い直接引用（4〜5行以上）',
    kind: 'direct',
    hint: '2字下げ＋前後1行空け＋文末に（著者名, 年, p.数）',
    // カギカッコは使わない。出典は引用文末尾に丸カッコで示す（マニュアル 2.2）
    build: ({ body, citation }) => ({ text: `${body}${citation}`, block: true }),
  },
  {
    id: 'para-tail',
    label: '間接引用・著者名を文末に',
    kind: 'indirect',
    hint: '〜と考えられる（著者名, 年, p.数）。',
    build: ({ body, citation }) => ({
      text: `${trimStop(body)}${citation}。`,
      block: false,
    }),
  },
  {
    id: 'para-lead',
    label: '間接引用・著者名を地の文に',
    kind: 'indirect',
    hint: '著者（年）によれば、〜という。',
    // ページは付けない型
    build: ({ body, name, year }) => ({
      text: `${name}（${year}）によれば、${body}`,
      block: false,
    }),
  },
];

/** 末尾の句点を落とす（後ろに出典や地の文が続くため） */
function trimStop(s) {
  return String(s ?? '').replace(/[。．]$/, '');
}
