'use client';

/**
 * 書誌情報の手動編集。
 *
 * 自動取得した書誌は「ヒットした＝正しい」とは限らない（設計書 §5.4-e）。
 * 特に Open Library は ISBN が版を一意に決める仕様上、意図と異なる
 * 言語版を返すことがある。ここで直せる導線が必須。
 */

import { useMemo, useState } from 'react';
import { getRepo } from '@/lib/db';
import { useEngine } from '@/lib/hooks';
import type { Reference, CSL } from '@/lib/hooks';
import { DEFAULT_STYLE_ID } from '@/lib/citation';
import { normalizeAll } from '@lib/citation/index.js';

export function ReferenceEditor({ reference, onSaved, onCancel }: {
  reference: Reference;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const c = reference.csl;
  const names = (list?: { family?: string; given?: string; literal?: string }[]) =>
    (list ?? [])
      .map((a) => a.literal ?? `${a.family ?? ''}, ${a.given ?? ''}`.replace(/,\s*$/, ''))
      .join('\n');

  const [f, setF] = useState({
    title: c.title ?? '',
    authors: names(c.author),
    translators: names(c.translator),
    editors: names(c.editor),
    readings: (reference.transcription?.authors ?? reference.transcription?.authorsRaw ?? []).join('\n'),
    year: String(c.issued?.['date-parts']?.[0]?.[0] ?? ''),
    publisher: c.publisher ?? '',
    container: c['container-title'] ?? '',
    volume: c.volume ?? '',
    issue: c.issue ?? '',
    page: c.page ?? '',
    // 規則で表せない書式のための最後の逃げ道（設計書 §4.3）。
    // 入っていればこの文字列がそのまま引用文献一覧に出る。
    override: reference.citationOverride ?? '',
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });

  const { engine } = useEngine();

  // 編集中の内容から引用文を作って見せる。
  // 最終形を手直しする際の下敷きにもなる。
  const preview = useMemo(() => {
    if (!engine) return '';
    try {
      const lines = (v: string) => v.split('\n').map((x) => x.trim()).filter(Boolean);
      const toNames = (v: string) => lines(v).map((x) => {
        const parts = x.split(/[,、]\s*/);
        return parts.length >= 2 && parts[1]
          ? { family: parts[0], given: parts.slice(1).join(' ') }
          : { literal: x };
      });
      const year = Number(f.year.match(/\d{4}/)?.[0]);
      const draft: CSL = {
        ...c,
        title: f.title.trim() || undefined,
        author: toNames(f.authors).length ? toNames(f.authors) : undefined,
        translator: toNames(f.translators).length ? toNames(f.translators) : undefined,
        editor: toNames(f.editors).length ? toNames(f.editors) : undefined,
        issued: year ? { 'date-parts': [[year]] } : undefined,
        publisher: f.publisher.trim() || undefined,
        'container-title': f.container.trim() || undefined,
        volume: f.volume.trim() || undefined,
        issue: f.issue.trim() || undefined,
        page: f.page.trim() || undefined,
      };
      return engine.renderOne(normalizeAll([draft])[0], DEFAULT_STYLE_ID).replace(/<[^>]+>/g, '');
    } catch {
      return '';
    }
  }, [engine, f, c]);

  async function save() {
    const lines = (v: string) => v.split('\n').map((s) => s.trim()).filter(Boolean);

    const toNames = (v: string) => lines(v).map((s) => {
      const parts = s.split(/[,、]\s*/);
      return parts.length >= 2 && parts[1]
        ? { family: parts[0], given: parts.slice(1).join(' ') }
        : { literal: s };
    });
    const authors = toNames(f.authors);
    const translators = toNames(f.translators);
    const editors = toNames(f.editors);
    const readings = lines(f.readings);
    const year = Number(f.year.match(/\d{4}/)?.[0]);

    const csl: CSL = { ...c };
    csl.title = f.title.trim() || undefined;
    csl.author = authors.length ? authors : undefined;
    csl.translator = translators.length ? translators : undefined;
    csl.editor = editors.length ? editors : undefined;
    csl.issued = year ? { 'date-parts': [[year]] } : undefined;
    csl.publisher = f.publisher.trim() || undefined;
    csl['container-title'] = f.container.trim() || undefined;
    csl.volume = f.volume.trim() || undefined;
    csl.issue = f.issue.trim() || undefined;
    csl.page = f.page.trim() || undefined;
    for (const k of Object.keys(csl)) {
      if (csl[k] === undefined) delete csl[k];
    }

    await getRepo().saveReference({
      ...reference,
      csl,
      // 空文字なら上書きを解除する
      citationOverride: f.override.trim() || undefined,
      transcription: {
        ...reference.transcription,
        // 読みは著者と件数が揃ったときだけ 50音順に使う。
        // 数が合わないまま使うと別人の読みが割り当たり並びが壊れる。
        authors: readings.length && readings.length === authors.length ? readings : undefined,
        authorsRaw: readings.length ? readings : reference.transcription?.authorsRaw,
      },
    });
    onSaved();
  }

  return (
    <div style={{ marginTop: '.8rem', paddingTop: '.8rem', borderTop: '1px solid var(--line)' }}>
      <div className="hint" style={{ marginTop: 0 }}>
        自動取得した情報が誤っている場合はここで直せます。
      </div>
      <label>タイトル</label>
      <input value={f.title} onChange={set('title')} />

      <label>著者（1行に1人、「姓, 名」の形式）</label>
      <textarea value={f.authors} onChange={set('authors')} style={{ minHeight: '3.2em' }} />

      <label>訳者（1行に1人、「姓, 名」の形式）</label>
      <textarea value={f.translators} onChange={set('translators')}
                style={{ minHeight: '3.2em' }}
                placeholder={'奥井, 智之'} />

      <label>編者（1行に1人。編書や章を引く場合）</label>
      <textarea value={f.editors} onChange={set('editors')}
                style={{ minHeight: '3.2em' }}
                placeholder={'田中, 健一'} />

      <label>著者の読み（1行に1人・50音順の並べ替えに使う）</label>
      <textarea value={f.readings} onChange={set('readings')} style={{ minHeight: '3.2em' }}
                placeholder={'コイソ, シュウジ\nムラカミ, ユウイチ'} />

      <div className="row">
        <div style={{ flex: 1 }}>
          <label>出版年</label>
          <input value={f.year} onChange={set('year')} placeholder="2018" />
        </div>
        <div style={{ flex: 2 }}>
          <label>出版社</label>
          <input value={f.publisher} onChange={set('publisher')} />
        </div>
      </div>

      <label>収録誌・書名（論文・章の場合）</label>
      <input value={f.container} onChange={set('container')} />

      <div className="row">
        <div style={{ flex: 1 }}><label>巻</label><input value={f.volume} onChange={set('volume')} /></div>
        <div style={{ flex: 1 }}><label>号</label><input value={f.issue} onChange={set('issue')} /></div>
        <div style={{ flex: 1 }}><label>ページ</label><input value={f.page} onChange={set('page')} /></div>
      </div>

      <label>引用文（最終形）</label>
      <div className="hint" style={{ marginTop: 0, marginBottom: '.3rem' }}>
        上の項目では表せない書式にしたい場合、ここに直接書けます。
        入力するとこの文字列がそのまま引用文献一覧に出ます（空欄なら自動生成）。
      </div>
      <textarea value={f.override} onChange={set('override')}
                style={{ minHeight: '3.2em' }}
                placeholder={preview || '田中太郎（2020）『社会学入門』岩波書店.'} />
      {preview && !f.override.trim() && (
        <div className="preview" style={{ marginTop: '.3rem' }}>
          <span className="hint" style={{ margin: 0, display: 'block' }}>
            いまの自動生成
          </span>
          {preview}
        </div>
      )}

      <div className="row" style={{ marginTop: '1rem', justifyContent: 'flex-end' }}>
        {f.override.trim() && (
          <button className="ghost sm" onClick={() => setF({ ...f, override: '' })}
                  style={{ marginRight: 'auto' }}>
            自動生成に戻す
          </button>
        )}
        <button className="ghost" onClick={onCancel}>キャンセル</button>
        <button onClick={save}>保存</button>
      </div>
    </div>
  );
}
