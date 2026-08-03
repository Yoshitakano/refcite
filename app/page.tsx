'use client';

/**
 * 書架ページ
 *
 * 役割は「文献を貯める」ことに絞る。引用リストの生成は執筆ページの仕事。
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getRepo } from '@/lib/db';
import { useEngine, useProjects, type Reference } from '@/lib/hooks';
import { ImportPanel } from '@/components/ImportPanel';
import { ProjectBar } from '@/components/ProjectBar';
import {
  Message, Hint, Empty, Badge, CitationPreview,
  authorLabel, yearLabel, FIELD_LABELS, type MessageKind,
} from '@/components/ui';
import { DEFAULT_STYLE_ID } from '@/lib/citation';
import { normalizeAll, validateItem } from '@lib/citation/index.js';

export default function ShelfPage() {
  const { engine } = useEngine();
  const { projects, current, loading, select, update, create } = useProjects();

  const [refs, setRefs] = useState<Reference[]>([]);
  const [noteCounts, setNoteCounts] = useState<Map<string, number>>(new Map());
  const [filter, setFilter] = useState('');
  const [scope, setScope] = useState<'project' | 'all'>('project');
  const [backupMsg, setBackupMsg] = useState<{ text: string; kind: MessageKind } | null>(null);


  const reload = useCallback(async () => {
    if (!current) return;
    const repo = getRepo();
    const all = scope === 'all'
      ? await repo.listReferences()
      : await repo.listProjectReferences(current.id);

    const f = filter.toLowerCase().replace(/\s/g, '');
    const filtered = f
      ? all.filter((r: Reference) => {
          const hay = [
            r.csl.title, r.csl.publisher, authorLabel(r.csl),
            ...(r.transcription?.authorsRaw ?? []),
            ...(r.transcription?.displayNames ?? []),
          ].filter(Boolean).join('').toLowerCase().replace(/\s/g, '');
          return hay.includes(f);
        })
      : all;

    setRefs(filtered);

    const counts = new Map<string, number>();
    await Promise.all(filtered.map(async (r: Reference) => {
      counts.set(r.id, (await repo.listNotes(r.id)).length);
    }));
    setNoteCounts(counts);
  }, [current, scope, filter]);

  useEffect(() => { reload(); }, [reload]);

  if (loading || !current) {
    return <section><Empty>読み込んでいます…</Empty></section>;
  }

  return (
    <>
      <ImportPanel projectId={current.id} projectName={current.name} onImported={reload} />

      <ProjectBar
        projects={projects} current={current}
        onSelect={select}
        onCreate={(name) => create(name)}
        onRename={(name) => update({ name })}
      />

      <section>
        <h2>書架 <span className="n">{refs.length}件</span></h2>
        <div className="row" style={{ marginBottom: '.8rem' }}>
          <input value={filter} onChange={(e) => setFilter(e.target.value)}
                 placeholder="書名・著者で絞り込み" />
          <select value={scope} onChange={(e) => setScope(e.target.value as 'project' | 'all')}
                  style={{ flex: '0 0 auto', width: 'auto' }}>
            <option value="project">このプロジェクトのみ</option>
            <option value="all">すべての文献</option>
          </select>
        </div>

        {!refs.length ? (
          <Empty>
            {filter ? '該当する文献がありません。'
                    : 'まだ文献がありません。上の欄から探して取り込んでください。'}
          </Empty>
        ) : refs.map((ref) => (
          <ShelfItem
            key={ref.id} reference={ref} engine={engine}
            styleId={current.styleId ?? DEFAULT_STYLE_ID}
            noteCount={noteCounts.get(ref.id) ?? 0}
            inProject={(ref.projectIds ?? []).includes(current.id)}
            showProjectBadge={scope === 'all'}
            onAdd={async () => {
              await getRepo().assignToProject('reference', ref.id, current.id);
              reload();
            }}
            onDelete={async () => {
              if (!confirm('この文献と、紐づく抜き書き・メモをすべて削除します。よろしいですか？')) return;
              await getRepo().deleteReference(ref.id);
              reload();
            }}
          />
        ))}
      </section>

      <section>
        <h2>バックアップ</h2>
        <div className="row">
          <button className="ghost" onClick={async () => {
            const data = await getRepo().exportJson();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `refcite-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
            setBackupMsg({ text: `書き出しました（文献 ${data.references.length} 件）`, kind: 'ok' });
          }}>書き出す（JSON）</button>

          <label style={{
            display: 'inline-block', padding: '.5rem 1rem', border: '1px solid var(--line)',
            borderRadius: 7, cursor: 'pointer', background: '#fff', margin: 0,
            color: 'var(--text)', fontSize: '1rem',
          }}>
            読み込む
            <input type="file" accept="application/json" hidden onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const res = await getRepo().importJson(JSON.parse(await file.text()));
                setBackupMsg({
                  text: `読み込みました（文献 ${res.references} / 抜き書き ${res.notes}）`, kind: 'ok',
                });
                reload();
              } catch (err) {
                setBackupMsg({
                  text: '読み込みに失敗しました: ' + (err as Error).message, kind: 'err',
                });
              }
              e.target.value = '';
            }} />
          </label>
        </div>
        <Hint>
          データはこの端末のブラウザ内にのみ保存されます。別の端末へ移すときはこの JSON を使ってください。
        </Hint>
        {backupMsg && <Message kind={backupMsg.kind}>{backupMsg.text}</Message>}
      </section>
    </>
  );
}

function ShelfItem({
  reference, engine, styleId, noteCount, inProject, showProjectBadge, onAdd, onDelete,
}: {
  reference: Reference; engine: any; styleId: string; noteCount: number;
  inProject: boolean; showProjectBadge: boolean;
  onAdd: () => void; onDelete: () => void;
}) {
  const c = reference.csl;
  const issues = validateItem(c);
  const missing = issues
    .filter((i: any) => i.level === 'error')
    .map((i: any) => FIELD_LABELS[i.field] ?? i.field);

  let preview = '';
  if (engine) {
    try {
      // 最終形が手直しされていればそれを見せる（出力と一致させる）
      preview = reference.citationOverride?.trim()
        ? reference.citationOverride
        : engine.renderOne(normalizeAll([c])[0], styleId);
    } catch {
      preview = '';
    }
  }

  const href = `/reference/?id=${encodeURIComponent(reference.id)}`;

  return (
    <div className="ref">
      <div className="ref-title">
        <Link href={href}>{c.title ?? '(タイトルなし)'}</Link>
        {issues.length > 0 && <Badge kind="err">要確認</Badge>}
        {noteCount > 0 && <Badge kind="ok">抜き書き {noteCount}</Badge>}
        {showProjectBadge && !inProject && <Badge>別プロジェクト</Badge>}
      </div>
      <div className="ref-meta">
        {authorLabel(c)} — {yearLabel(c)}
        {c.publisher && ` / ${c.publisher}`}
      </div>
      {preview
        ? <CitationPreview html={preview} missing={missing} />
        : <div className="preview">プレビューを準備しています…</div>}
      <div className="row" style={{ marginTop: '.5rem' }}>
        <Link href={href}><button className="sm ghost">開く（抜き書き・メモ）</button></Link>
        {showProjectBadge && !inProject && (
          <button className="sm ghost" onClick={onAdd}>このプロジェクトに追加</button>
        )}
        <button className="sm danger" onClick={onDelete}>削除</button>
      </div>
    </div>
  );
}
