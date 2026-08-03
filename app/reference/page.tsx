'use client';

/**
 * 文献の詳細（書架のサブページ）
 *
 * 1冊の文献に対して抜き書きと所感メモを溜める。
 * 抜き書き（直接引用）とメモを画面上で分けているのは、引用作法上
 * まったく別物だから。直接引用はページ数が無いと引用として成立しない
 * ため必須にし、メモは任意にしている。
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getRepo } from '@/lib/db';
import { useEngine, useProjects, useNotes, type Reference } from '@/lib/hooks';
import { NoteItem } from '@/components/NoteList';
import { ReferenceEditor } from '@/components/ReferenceEditor';
import {
  Message, Hint, Empty, Badge, CitationPreview,
  authorLabel, yearLabel, type MessageKind,
} from '@/components/ui';
import { DEFAULT_STYLE_ID } from '@/lib/citation';
import { normalizeAll, validateItem } from '@lib/citation/index.js';

export default function ReferencePage() {
  // 静的書き出しでは useSearchParams に Suspense 境界が要る
  return (
    <Suspense fallback={<section><Empty>読み込んでいます…</Empty></section>}>
      <ReferenceDetail />
    </Suspense>
  );
}

function ReferenceDetail() {
  const id = useSearchParams().get('id');
  const { engine } = useEngine();
  const { current } = useProjects();
  const { notes, reload: reloadNotes } = useNotes(id);

  const [reference, setReference] = useState<Reference | null>(null);


  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const reload = useCallback(async () => {
    if (!id) { setLoading(false); return; }
    setReference((await getRepo().getReference(id)) ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

  if (loading) return <section><Empty>読み込んでいます…</Empty></section>;

  if (!reference) {
    return (
      <section>
        <Empty>
          この文献は見つかりません（削除された可能性があります）。{' '}
          <Link href="/">書架に戻る</Link>
        </Empty>
      </section>
    );
  }

  const c = reference.csl;
  const quotes = notes.filter((n) => n.type === 'direct');
  const memos = notes.filter((n) => n.type !== 'direct');
  const issues = validateItem(c, { hasDirectQuote: quotes.length > 0 });

  const styleId = current?.styleId ?? DEFAULT_STYLE_ID;
  let preview = '';
  if (engine) {
    try {
      // 最終形が手直しされていればそれを見せる（出力と一致させる）
      preview = reference.citationOverride?.trim()
        ? reference.citationOverride
        : engine.renderOne(normalizeAll([c])[0], styleId);
    } catch { preview = ''; }
  }

  const refresh = () => { reload(); reloadNotes(); };

  return (
    <>
      <section>
        <div className="row" style={{ marginBottom: '.6rem' }}>
          <Link href="/"><button className="ghost sm">← 書架に戻る</button></Link>
        </div>

        <h2>書誌情報</h2>
        <div className="ref-title">{c.title ?? '(タイトルなし)'}</div>
        <div className="ref-meta">
          {authorLabel(c)} — {yearLabel(c)}
          {c.publisher && ` / ${c.publisher}`}
          {c['container-title'] && ` / ${c['container-title']}`}
          <Badge>{reference.source?.fetchedFrom ?? '手入力'}</Badge>
        </div>

        {preview && <CitationPreview html={preview} />}

        {issues.length > 0 && (
          <Message kind="warn">
            {issues.map((i: { message: string }, k: number) => (
              <div key={k}>{i.message}</div>
            ))}
          </Message>
        )}

        {!editing ? (
          <div className="row" style={{ marginTop: '.7rem' }}>
            <button className="ghost sm" onClick={() => setEditing(true)}>書誌を編集</button>
          </div>
        ) : (
          <ReferenceEditor
            reference={reference}
            onSaved={() => { setEditing(false); refresh(); }}
            onCancel={() => setEditing(false)}
          />
        )}
      </section>

      <QuoteForm referenceId={reference.id} projectId={current?.id} onAdded={refresh} />

      <section>
        <h2>抜き書き（直接引用）{quotes.length > 0 && <span className="n"> {quotes.length}件</span>}</h2>
        {quotes.length
          ? quotes.map((n) => <NoteItem key={n.id} note={n} onChanged={refresh} />)
          : <Empty>まだ抜き書きがありません。</Empty>}
      </section>

      <MemoForm referenceId={reference.id} projectId={current?.id} onAdded={refresh} />

      <section>
        <h2>所感メモ{memos.length > 0 && <span className="n"> {memos.length}件</span>}</h2>
        {memos.length
          ? memos.map((n) => <NoteItem key={n.id} note={n} onChanged={refresh} />)
          : <Empty>まだメモがありません。</Empty>}
      </section>
    </>
  );
}

/** 抜き書きの入力。ページ数は引用に必須（APU マニュアル 2.1） */
function QuoteForm({ referenceId, projectId, onAdded }: {
  referenceId: string; projectId?: string; onAdded: () => void;
}) {
  const [body, setBody] = useState('');
  const [comment, setComment] = useState('');
  const [page, setPage] = useState('');
  const [msg, setMsg] = useState<{ text: string; kind: MessageKind } | null>(null);

  async function add() {
    if (!body.trim()) { setMsg({ text: '引用文を入力してください', kind: 'err' }); return; }
    if (!page.trim()) {
      setMsg({ text: 'ページ数は必須です（例: 45 / 52-54）', kind: 'err' });
      return;
    }
    await getRepo().saveNote({
      referenceId, type: 'direct', body: body.trim(),
      comment: comment.trim() || undefined,
      locator: { page: page.trim() },
      projectIds: projectId ? [projectId] : [],
    });
    setBody(''); setComment(''); setPage(''); setMsg(null);
    onAdded();
  }

  return (
    <section>
      <h2>抜き書きを追加</h2>
      <Hint>原文を一字一句変えずに書き写します。ページ数は引用に必須です。</Hint>

      <label>引用文 <span className="req">*</span></label>
      <textarea value={body} onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') add(); }}
                placeholder="原文をそのまま書き写す" />

      <label>この引用へのコメント（任意）</label>
      <textarea value={comment} onChange={(e) => setComment(e.target.value)}
                style={{ minHeight: '3.2em' }}
                placeholder="なぜ引いたか、どう使うか、疑問に思ったこと" />

      <label>ページ <span className="req">*</span></label>
      <div className="row">
        <input value={page} onChange={(e) => setPage(e.target.value)}
               placeholder="45  /  52-54" style={{ maxWidth: '12rem' }} />
        <button onClick={add}>抜き書きを追加</button>
      </div>
      {msg && <Message kind={msg.kind}>{msg.text}</Message>}
    </section>
  );
}

/** 所感メモの入力。ページは任意 */
function MemoForm({ referenceId, projectId, onAdded }: {
  referenceId: string; projectId?: string; onAdded: () => void;
}) {
  const [body, setBody] = useState('');
  const [page, setPage] = useState('');
  const [msg, setMsg] = useState<{ text: string; kind: MessageKind } | null>(null);

  async function add() {
    if (!body.trim()) { setMsg({ text: 'メモを入力してください', kind: 'err' }); return; }
    await getRepo().saveNote({
      referenceId, type: 'indirect', body: body.trim(),
      locator: page.trim() ? { page: page.trim() } : undefined,
      projectIds: projectId ? [projectId] : [],
    });
    setBody(''); setPage(''); setMsg(null);
    onAdded();
  }

  return (
    <section>
      <h2>メモを追加</h2>
      <Hint>自分の言葉での要約・考察・疑問。ページ数は任意です。</Hint>

      <label>メモ</label>
      <textarea value={body} onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') add(); }}
                placeholder="この議論をどう受け止めたか、何が引っかかるか" />

      <label>ページ（任意）</label>
      <div className="row">
        <input value={page} onChange={(e) => setPage(e.target.value)}
               placeholder="45" style={{ maxWidth: '12rem' }} />
        <button onClick={add}>メモを追加</button>
      </div>
      {msg && <Message kind={msg.kind}>{msg.text}</Message>}
    </section>
  );
}
