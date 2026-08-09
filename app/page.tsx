'use client';

/**
 * 書架ページ
 *
 * 役割は「文献を貯める」ことに絞る。引用リストの生成は執筆ページの仕事。
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getRepo } from '@/lib/db';
import { autoBackupInfo, autoBackupData } from '@lib/db/safety.js';
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
            <option value="project">「{current.name}」の文献</option>
            <option value="all">すべての文献</option>
          </select>
        </div>

        {scope === 'all' && (
          <Hint>
            書架にあるすべての文献です。ここでは特定のレポートから外す操作はできません。
            外すときは「{current.name}」の文献に切り替えてください。
          </Hint>
        )}

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
            allScope={scope === 'all'}
            projectName={current.name}
            onAdd={async () => {
              await getRepo().assignToProject('reference', ref.id, current.id);
              reload();
            }}
            onRemove={async () => {
              await getRepo().removeFromProject('reference', ref.id, current.id);
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
        <AutoBackupNotice onRestored={reload} />
        {backupMsg && <Message kind={backupMsg.kind}>{backupMsg.text}</Message>}
      </section>
    </>
  );
}

function ShelfItem({
  reference, engine, styleId, noteCount, inProject, showProjectBadge,
  allScope, projectName, onAdd, onRemove, onDelete,
}: {
  reference: Reference; engine: any; styleId: string; noteCount: number;
  inProject: boolean; showProjectBadge: boolean; allScope: boolean;
  projectName: string;
  onAdd: () => void; onRemove: () => void; onDelete: () => void;
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
        {!inProject && (
          <button className="sm ghost" onClick={onAdd}>
            「{projectName}」に追加
          </button>
        )}
        {inProject && !allScope && (
          // 外すだけ。文献は書架に残り、抜き書きも消えない。
          // 「削除」と紛らわしいので、何が起きるかを文言で示す。
          //
          // 「すべての文献」を見ているときは出さない。この一覧は
          // プロジェクトに関係なく全件を並べるので、外しても表示が
          // 変わらず、押した結果が見えない（何が起きたか分からない）
          <button className="sm ghost" onClick={onRemove}>
            「{projectName}」から外す
          </button>
        )}
        <button className="sm danger" onClick={onDelete}>削除</button>
      </div>
    </div>
  );
}


/**
 * 自動で取った控えの案内。
 *
 * スキーマの版が上がるときに中身を localStorage へ逃がしている。
 * 万一そこで取りこぼしがあっても、利用者が自力で書き戻せるようにする。
 * 控えが無いときは何も出さない（ふだんは目に入らないほうがよい）。
 */
function AutoBackupNotice({ onRestored }: { onRestored: () => void }) {
  const [info, setInfo] = useState<{
    at: string; counts: { references: number; notes: number; projects: number };
  } | null>(null);
  const [msg, setMsg] = useState<{ text: string; kind: MessageKind } | null>(null);

  useEffect(() => { setInfo(autoBackupInfo()); }, []);

  if (!info) return null;

  const when = info.at.slice(0, 10);
  const { references, notes } = info.counts ?? { references: 0, notes: 0 };

  return (
    <div className="autobk">
      <div>
        <b>自動の控え</b>（{when} 時点：文献 {references} 件 / 抜き書き {notes} 件）
        <div className="hint" style={{ marginTop: '.15rem' }}>
          アプリの更新前に自動で取ったものです。ふだん使う必要はありません。
        </div>
      </div>
      <div className="row" style={{ marginTop: '.5rem' }}>
        <button className="ghost sm" onClick={() => {
          const data = autoBackupData();
          if (!data) return;
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `refcite-自動控え-${when}.json`;
          a.click();
          URL.revokeObjectURL(a.href);
        }}>控えを書き出す</button>

        <button className="ghost sm" onClick={async () => {
          const data = autoBackupData();
          if (!data) return;
          if (!confirm(
            '自動の控えを取り込みます。\n\n'
            + '今あるデータは消えません（同じ id のものは控えの内容で上書きされます）。\n'
            + 'よろしいですか？'
          )) return;
          try {
            const res = await getRepo().importJson(data, { mode: 'merge' });
            setMsg({ text: `書き戻しました（文献 ${res.references} / 抜き書き ${res.notes}）`, kind: 'ok' });
            onRestored();
          } catch (err) {
            setMsg({ text: '書き戻せませんでした: ' + (err as Error).message, kind: 'err' });
          }
        }}>控えから戻す</button>
      </div>
      {msg && <Message kind={msg.kind}>{msg.text}</Message>}
    </div>
  );
}
