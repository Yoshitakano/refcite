'use client';

/**
 * 抜き書き・所感メモの表示と編集。
 *
 * 引用文（他人の言葉）と自分のコメントは視覚的にはっきり分ける。
 * 混ざったまま本文に転記されると剽窃になりかねないため。
 */

import { useState } from 'react';
import { getRepo } from '@/lib/db';
import type { Note } from '@/lib/hooks';

export function NoteItem({ note, onChanged }: { note: Note; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body ?? '');
  const [comment, setComment] = useState(note.comment ?? '');
  const [page, setPage] = useState(note.locator?.page ?? '');
  const [err, setErr] = useState('');

  const isQuote = note.type === 'direct';

  function startEdit() {
    setBody(note.body ?? '');
    setComment(note.comment ?? '');
    setPage(note.locator?.page ?? '');
    setErr('');
    setEditing(true);
  }

  async function save() {
    const b = body.trim();
    if (!b) { setErr('引用文が空です'); return; }
    // 直接引用はページ数が無いと引用として成立しない（マニュアル 2.1）。
    // 登録時に必須にしているので、編集で消せてしまうと辻褄が合わない
    if (isQuote && !page.trim()) { setErr('直接引用にはページ数が必要です'); return; }

    // 既存レコードを土台にする。項目を並べ直すと、
    // ここに書いていない値（projectIds など）が消える
    await getRepo().saveNote({
      ...note,
      body: b,
      comment: comment.trim() || undefined,
      locator: { ...note.locator, page: page.trim() || undefined },
    });
    setEditing(false);
    onChanged();
  }

  return (
    <div className={`note ${isQuote ? 'direct' : 'memo'}`}>
      <div className="note-head">
        <span>{isQuote ? '直接引用' : '所感メモ'}</span>
        {note.locator?.page
          ? <span className="page-tag">p.{note.locator.page}</span>
          : isQuote && <span style={{ color: 'var(--err)' }}>ページ未記入</span>}
        <span style={{ marginLeft: 'auto' }}>
          {!editing && (
            <button className="sm ghost" onClick={startEdit}>編集</button>
          )}
          <button className="sm ghost" onClick={async () => {
            if (!confirm('削除します。よろしいですか？')) return;
            await getRepo().deleteNote(note.id);
            onChanged();
          }}>削除</button>
        </span>
      </div>

      {!editing && <div className="note-body">{note.body}</div>}

      {note.comment && !editing && (
        <div className="note-comment">
          <span className="lbl">自分のコメント</span>
          {note.comment}
        </div>
      )}

      {editing && (
        <div className="note-edit">
          <label>{isQuote ? '引用文' : 'メモ'}</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            style={{ minHeight: '4em' }}
            placeholder={isQuote ? '原文をそのまま書き写す' : '自分の言葉での要約・考察'}
            autoFocus
          />

          <label>
            ページ{isQuote && <span className="req"> *</span>}
          </label>
          <input
            value={page}
            onChange={(e) => setPage(e.target.value)}
            placeholder="45  /  52-54"
            style={{ maxWidth: '12rem' }}
          />

          {isQuote && (
            <>
              <label>この引用へのコメント（任意）</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => {
                  // 引用文を見ながら書く作業なので、その場で保存できるようにする
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save();
                }}
                style={{ minHeight: '3.2em' }}
                placeholder="なぜ引いたか、どう使うか、疑問に思ったこと"
              />
            </>
          )}

          {err && <div className="msg err" style={{ marginTop: '.5rem' }}>{err}</div>}

          <div className="row" style={{ marginTop: '.5rem' }}>
            <button className="sm" onClick={save}>保存</button>
            <button className="sm ghost" onClick={() => setEditing(false)}>キャンセル</button>
          </div>
        </div>
      )}
    </div>
  );
}
