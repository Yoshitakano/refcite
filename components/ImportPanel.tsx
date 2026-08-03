'use client';

/**
 * 文献の取込（仕様 3.1）
 *
 * 主動線は著者名・タイトルによる検索。ISBN / DOI は手元に現物がある
 * 場合しか使えないため、折りたたみに置く。手入力は最終手段。
 */

import { useState } from 'react';
import { getRepo } from '@/lib/db';
import { Message, Hint, Badge, authorLabel, yearLabel, type MessageKind } from './ui';
import { BarcodeButton } from './BarcodeButton';
import { ManualEntry } from './ManualEntry';
import {
  searchBibliography, importFromCandidate, importByIdentifier,
} from '@lib/import/index.js';

/** src/import/search.js の SearchCandidate に対応する */
type Candidate = {
  source: 'ndl' | 'open_library';
  title?: string;
  authors: string[];
  publisher?: string;
  year?: string;
  isbn?: string;
  kind: 'book' | 'article' | 'other';
  raw?: unknown;
  _score?: number;
};

export function ImportPanel({ projectId, projectName, onImported }: {
  projectId: string; projectName: string; onImported: () => void;
}) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [status, setStatus] = useState<{ text: string; kind: MessageKind } | null>(null);
  const [busy, setBusy] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  const say = (text: string, kind: MessageKind = 'ok') => setStatus({ text, kind });

  async function doSearch() {
    if (!title.trim() && !author.trim()) {
      say('タイトルか著者名のどちらかを入力してください', 'err');
      return;
    }
    setBusy(true);
    setCandidates([]);
    say('さがしています…');

    const r = await searchBibliography({ title, author });
    setBusy(false);

    if (!r.ok) { say(r.error ?? '検索に失敗しました', 'err'); return; }
    const list = r.candidates ?? [];
    if (!list.length) {
      say('見つかりませんでした。表記を変えて試すか、手入力で登録してください', 'warn');
      setManualOpen(true);
      return;
    }
    setCandidates(list);
    say(`${list.length} 件見つかりました。登録するものを選んでください`);
  }

  /** 候補を登録する。重複していれば確認を挟む */
  async function pick(c: Candidate) {
    setBusy(true);
    const r = await importFromCandidate(c);
    if (!r.ok || !r.reference) {
      say(r.error ?? '取得に失敗しました', 'err'); setBusy(false); return;
    }

    const repo = getRepo();
    const dup = r.reference.source.identifier
      ? await repo.findByIdentifier(r.reference.source.identifier)
      : null;

    if (dup) {
      await attachExisting(dup);
    } else if (!(await confirmSimilar(r.reference))) {
      await repo.saveReference({ ...r.reference, projectIds: [projectId] });
      const errs = (r.issues ?? []).filter((i) => i.level === 'error');
      say(errs.length
        ? `登録しました。ただし ${errs.map((e) => e.message.replace(/。.*/, '')).join('、')}`
        : `登録しました: ${r.reference.csl.title ?? ''}`,
        errs.length ? 'warn' : 'ok');
      onImported();
    }
    setBusy(false);
  }

  /** 既にある文献を現在のプロジェクトへ入れる */
  async function attachExisting(existing: any) {
    const repo = getRepo();
    if (!(existing.projectIds ?? []).includes(projectId)) {
      await repo.assignToProject('reference', existing.id, projectId);
      say(`登録済みの文献を「${projectName}」に追加しました`, 'warn');
    } else {
      say('すでにこのプロジェクトにあります', 'warn');
    }
    onImported();
  }

  /**
   * 識別子は違うが書誌が一致する文献があれば確認する。
   * 改訂版や同名の別書の可能性があるため自動統合はしない。
   * @returns true なら登録を中止した
   */
  async function confirmSimilar(reference: any): Promise<boolean> {
    const similar = await getRepo().findSimilar(reference.csl, reference.id);
    if (!similar.length) return false;

    const s = similar[0];
    const proceed = confirm(
      `同じ書誌の文献がすでに登録されています。\n\n` +
      `  ${s.csl.title ?? ''}\n  ${authorLabel(s.csl)} — ${yearLabel(s.csl)}\n\n` +
      `別の版であれば「OK」で登録できます。\n` +
      `同じ本なら「キャンセル」を押してください（既存の文献を使います）。`
    );
    if (!proceed) { await attachExisting(s); return true; }
    return false;
  }

  /** ISBN / DOI から直接取り込む */
  async function importByCode(code: string) {
    if (!code.trim()) return;
    setBusy(true);
    say('取得しています…');
    const r = await importByIdentifier(code);
    if (!r.ok || !r.reference) {
      say(r.error ?? '取得に失敗しました', 'err'); setBusy(false); return;
    }

    const repo = getRepo();
    const dup = r.reference.source.identifier
      ? await repo.findByIdentifier(r.reference.source.identifier)
      : null;
    if (dup) {
      await attachExisting(dup);
    } else if (!(await confirmSimilar(r.reference))) {
      await repo.saveReference({ ...r.reference, projectIds: [projectId] });
      say(`取り込みました: ${r.reference.csl.title ?? ''}`);
      onImported();
    }
    setBusy(false);
  }

  return (
    <section>
      <h2>文献を取り込む</h2>

      <div className="row">
        <div style={{ flex: 2, minWidth: '14rem' }}>
          <label style={{ marginTop: 0 }}>タイトル</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && doSearch()}
                 placeholder="地方創生を超えて" />
        </div>
        <div style={{ flex: 1, minWidth: '9rem' }}>
          <label style={{ marginTop: 0 }}>著者名</label>
          <input value={author} onChange={(e) => setAuthor(e.target.value)}
                 onKeyDown={(e) => e.key === 'Enter' && doSearch()}
                 placeholder="小磯" />
        </div>
        <button onClick={doSearch} disabled={busy} style={{ marginTop: '1.2rem' }}>
          {busy ? 'さがしています…' : 'さがす'}
        </button>
      </div>
      <Hint>
        どちらか一方だけでも検索できます。和書は国立国会図書館、洋書は Open Library から探します。
      </Hint>
      {status && <Message kind={status.kind}>{status.text}</Message>}

      {candidates.length > 0 && (
        <div style={{ marginTop: '.8rem' }}>
          {candidates.slice(0, 12).map((c, i) => (
            <div className="pick" key={`${c.isbn ?? c.title}-${i}`}>
              <div className="pick-body">
                <div className="ref-title">
                  {c.title}
                  {c.kind === 'article' && <Badge>記事</Badge>}
                </div>
                <div className="ref-meta">
                  {c.authors.slice(0, 4).join('・') || '著者不明'}
                  {c.year && ` — ${c.year}`}
                  {c.publisher && ` / ${c.publisher}`}
                  {c.isbn && <Badge>ISBN</Badge>}
                </div>
              </div>
              <button className="sm" onClick={() => pick(c)} disabled={busy}>
                この文献を登録
              </button>
            </div>
          ))}
        </div>
      )}

      <CodePanel onImport={importByCode} busy={busy} />
      <details open={manualOpen}
               onToggle={(e) => setManualOpen((e.target as HTMLDetailsElement).open)}
               style={{ marginTop: '.6rem' }}>
        <summary style={{ cursor: 'pointer', color: 'var(--muted)', fontSize: '.88rem' }}>
          検索で見つからない場合は手入力で登録
        </summary>
        <ManualEntry projectId={projectId}
                     defaultTitle={title} defaultAuthor={author}
                     onDone={onImported} />
      </details>
    </section>
  );
}

/** ISBN・DOI とバーコード（サブの導線） */
function CodePanel({ onImport, busy }: { onImport: (v: string) => void; busy: boolean }) {
  const [code, setCode] = useState('');
  return (
    <details style={{ marginTop: '1rem' }}>
      <summary style={{ cursor: 'pointer', color: 'var(--muted)', fontSize: '.88rem' }}>
        ISBN・DOI で直接取り込む
      </summary>
      <div className="row" style={{ marginTop: '.7rem' }}>
        <input value={code} onChange={(e) => setCode(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter') { onImport(code); setCode(''); } }}
               placeholder="978-4-00-023895-3 / 10.1086/227049" />
        <button className="ghost" disabled={busy}
                onClick={() => { onImport(code); setCode(''); }}>
          {busy ? '取り込んでいます…' : '取り込む'}
        </button>
        <BarcodeButton onDetect={(isbn) => { setCode(isbn); onImport(isbn); }} />
      </div>
      <Hint>本が手元にある場合や、論文の DOI が分かっている場合はこちらが確実です。</Hint>
    </details>
  );
}
