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
  const [draft, setDraft] = useState(note.comment ?? '');
  const isQuote = note.type === 'direct';

  async function saveComment() {
    await getRepo().saveNote({ ...note, comment: draft.trim() || undefined });
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
          {isQuote && (
            <button className="sm ghost" onClick={() => { setDraft(note.comment ?? ''); setEditing(true); }}>
              {note.comment ? 'コメントを編集' : 'コメントを付ける'}
            </button>
          )}
          <button className="sm ghost" onClick={async () => {
            if (!confirm('削除します。よろしいですか？')) return;
            await getRepo().deleteNote(note.id);
            onChanged();
          }}>削除</button>
        </span>
      </div>

      <div className="note-body">{note.body}</div>

      {note.comment && !editing && (
        <div className="note-comment">
          <span className="lbl">自分のコメント</span>
          {note.comment}
        </div>
      )}

      {editing && (
        <div className="comment-edit">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // 引用文を見ながら書く作業なので、その場で保存できるようにする
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') saveComment();
            }}
            style={{ minHeight: '3.2em' }}
            placeholder="なぜ引いたか、どう使うか、疑問に思ったこと"
            autoFocus
          />
          <div className="row" style={{ marginTop: '.4rem' }}>
            <button className="sm" onClick={saveComment}>保存</button>
            <button className="sm ghost" onClick={() => setEditing(false)}>キャンセル</button>
          </div>
        </div>
      )}
    </div>
  );
}
