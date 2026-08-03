'use client';

/**
 * 画面共通の小さな部品。
 *
 * バニラ版で毎回 innerHTML を組み立てていた箇所を、React の
 * コンポーネントとして切り出す。エスケープが自動で効くので、
 * バニラ版で 19 箇所あった innerHTML への直接代入が不要になる。
 */

import type { ReactNode } from 'react';
import type { CSL } from '@/lib/hooks';

export type MessageKind = 'ok' | 'warn' | 'err';

export function Message({ kind = 'ok', children }: { kind?: MessageKind; children?: ReactNode }) {
  if (!children) return null;
  return <div className={`msg ${kind}`}>{children}</div>;
}

export function Section({ title, count, children }: {
  title: string; count?: string | number; children: ReactNode;
}) {
  return (
    <section>
      <h2>
        {title}
        {count !== undefined && count !== '' && <span className="n"> {count}</span>}
      </h2>
      {children}
    </section>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <div className="hint">{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Badge({ kind, children }: { kind?: 'ok' | 'err'; children: ReactNode }) {
  return <span className={`badge${kind ? ' ' + kind : ''}`}>{children}</span>;
}

/** 書誌から表示用の著者名を作る */
export function authorLabel(csl: CSL): string {
  const names = (csl.author ?? []).map(
    (a) => a.literal ?? `${a.family ?? ''}${a.given ?? ''}`
  );
  return names.length ? names.join('・') : '著者不明';
}

/** 書誌から表示用の年を取り出す */
export function yearLabel(csl: CSL): string | number {
  return csl.issued?.['date-parts']?.[0]?.[0] ?? '年不明';
}

/**
 * 引用のプレビュー。
 *
 * citeproc が返す HTML には斜体などの書式が含まれるため、
 * ここだけは dangerouslySetInnerHTML を使う必要がある。
 * citeproc は `<` `>` を数値文字参照へ変換するので、書誌に
 * スクリプトが仕込まれていても生タグには戻らない（検証済み）。
 */
export function CitationPreview({ html, missing }: { html: string; missing?: string[] }) {
  return (
    <div className="preview">
      <span dangerouslySetInnerHTML={{ __html: html }} />
      {missing?.map((label) => (
        <span key={label} className="miss"> [{label}なし]</span>
      ))}
    </div>
  );
}

/**
 * HTML へ差し込む文字列を安全にする。
 * 手直しされた引用文をリッチテキストに載せるときに使う。
 */
export function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 欠落フィールドの日本語ラベル */
export const FIELD_LABELS: Record<string, string> = {
  author: '著者',
  issued: '出版年',
  publisher: '出版社',
  title: 'タイトル',
  'container-title': '収録誌',
  page: 'ページ',
};
