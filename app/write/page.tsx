'use client';

/**
 * 執筆ページ
 *
 * レポートを書く場面のためのページ。書架に貯めた文献から使うものを選び、
 * 引用文献リストを出力する。ここでは新規取込を行わない（それは書架の仕事）。
 *
 * 「使う文献」は projectIds で表現する。書架での振り分けと同じ仕組みなので、
 * 書架で入れた文献はここに最初から並ぶ。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getRepo } from '@/lib/db';
import { useEngine, useProjects, type Reference, type Note, type CSL } from '@/lib/hooks';
import { PRESET_STYLES, DEFAULT_STYLE_ID, styleOf, type SortOrder } from '@/lib/citation';
import {
  Message, Hint, Empty, Badge, authorLabel, yearLabel, escapeHtml,
  type MessageKind,
} from '@/components/ui';
import {
  normalizeAll, sortReferences, findMissingReadings,
  toRichHtml, toPlainText, copyToClipboard, downloadText, blockQuoteHtml,
  intextPatterns, buildInText, isLongQuote,
} from '@lib/citation/index.js';

export default function WritePage() {
  const { engine } = useEngine();
  const { projects, current, loading, select, update } = useProjects();

  const [used, setUsed] = useState<Reference[]>([]);
  const [quotes, setQuotes] = useState<{ ref: Reference; notes: Note[] }[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ ref: Reference; hits: Note[] }[]>([]);
  const [searchMsg, setSearchMsg] = useState('');
  const [outMsg, setOutMsg] = useState<{ text: string; kind: MessageKind } | null>(null);


  const styleId = current?.styleId ?? DEFAULT_STYLE_ID;
  // 既定の並び順は方式ごとの規定。利用者が選び直していればそちらが勝つ
  const order: SortOrder =
    (current?.sortOrder as SortOrder) ?? styleOf(styleId).sort.defaultOrder;

  const reload = useCallback(async () => {
    if (!current) return;
    const repo = getRepo();
    const list = await repo.listProjectReferences(current.id);
    setUsed(list);

    // 選んだ文献に紐づく直接引用を集める
    const blocks: { ref: Reference; notes: Note[] }[] = [];
    for (const ref of sortReferences(list, { order })) {
      const ns = (await repo.listNotes(ref.id)).filter((n: Note) => n.type === 'direct');
      if (ns.length) blocks.push({ ref, notes: ns });
    }
    setQuotes(blocks);
  }, [current, order]);

  useEffect(() => { reload(); }, [reload]);

  // 検索は入力のたびに走るので少し待つ
  useEffect(() => {
    if (!query.trim()) { setResults([]); setSearchMsg(''); return; }
    const timer = setTimeout(async () => {
      const repo = getRepo();
      // 書架全体から探す。まだこのレポートに入れていない文献を
      // 見つけるのがこの検索の目的なので、プロジェクトで絞らない。
      const res = await repo.search(query);

      const byId = new Map<string, { ref: Reference; hits: Note[] }>();
      for (const r of res.references) byId.set(r.id, { ref: r, hits: [] });
      for (const n of res.notes) {
        if (!byId.has(n.referenceId)) {
          const r = await repo.getReference(n.referenceId);
          if (r) byId.set(r.id, { ref: r, hits: [] });
        }
        byId.get(n.referenceId)?.hits.push(n);
      }
      const list = [...byId.values()];
      setResults(list);
      setSearchMsg(list.length
        ? `${list.length} 件の文献が該当（抜き書き・メモのヒット ${res.notes.length} 件）`
        : '該当する文献がありません。書架で取り込んでください。');
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  // 引用文献リスト。並び順はアプリ側で決め、citeproc の再ソートを抑止する
  const bibliography = useMemo(() => {
    if (!engine || !used.length) return { html: '', plain: '' };
    const sorted = sortReferences(used, { order });
    const items = normalizeAll(sorted.map((r: Reference) => r.csl));

    // 最終形が手直しされている文献は、その文字列をそのまま出す。
    // 規則で表せない書式への逃げ道（設計書 §4.3）。
    //
    // 手直しした文献は citeproc に渡さない。渡すと同一著者の横棒（――――）や
    // 同年の a/b が、手直しした側を数に入れて付いてしまい、
    // 「――――（2020b）」のような噛み合わない出力になる（実測で確認）。
    const autoIndexes: number[] = [];
    const autoItems: CSL[] = [];
    sorted.forEach((r: Reference, i: number) => {
      if (r.citationOverride?.trim()) return;
      autoIndexes.push(i);
      autoItems.push(items[i]);
    });

    const auto = autoItems.length
      ? engine.renderBibliography(autoItems, styleId, { preserveOrder: true }).entries
      : [];

    const merged: string[] = sorted.map((r: Reference) =>
      r.citationOverride?.trim()
        ? `<div class="csl-entry">${escapeHtml(r.citationOverride.trim())}</div>`
        : '');
    autoIndexes.forEach((idx, k) => { merged[idx] = auto[k]; });

    return {
      html: toRichHtml(merged, { styleId }),
      plain: toPlainText(merged, { styleId }),
    };
  }, [engine, used, styleId, order]);

  const missingReadings = useMemo(() => findMissingReadings(used), [used]);

  if (loading || !current) {
    return <section><Empty>読み込んでいます…</Empty></section>;
  }

  const usedIds = new Set(used.map((r) => r.id));

  /**
   * 本文中の出典表記を作る。
   *
   * 文字列連結ではなく citeproc に作らせる。pp. の使い分けや、
   * 同一著者・同年の a/b/c は引用文献一覧と揃っている必要がある
   * （マニュアル 2.1 / 5章）。判別には一覧の全書誌が要るので used を渡す。
   */
  function citationOf(ref: Reference, note: Note): string {
    if (!engine) return '';
    try {
      return engine.renderCitation(
        normalizeAll(used.map((r: Reference) => r.csl)),
        [{ id: ref.csl.id, locator: note.locator?.page }],
        styleId);
    } catch {
      return '';
    }
  }

  return (
    <>
      <section>
        <h2>執筆中のレポート</h2>
        <div className="row">
          <select value={current.id} onChange={(e) => select(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {PRESET_STYLES.length > 1 && (
            <select value={styleId} onChange={(e) => update({ styleId: e.target.value })}
                    style={{ flex: '0 0 auto', width: 'auto' }}>
              {PRESET_STYLES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          )}
          <select value={order} onChange={(e) => update({ sortOrder: e.target.value as SortOrder })}
                  style={{ flex: '0 0 auto', width: 'auto' }}>
            <option value="ja-first">和文 → 欧文の順</option>
            <option value="en-first">欧文 → 和文の順</option>
          </select>
        </div>
        <Hint>
          引用形式は APU ライティング・マニュアル準拠です。
          和文は50音順、欧文はアルファベット順に整列します。
        </Hint>
      </section>

      <section>
        <h2>文献をさがす</h2>
        <div className="row">
          <input value={query} onChange={(e) => setQuery(e.target.value)}
                 placeholder="書名・著者・抜き書き・メモの本文を横断検索" />
          <button className="ghost" onClick={() => setQuery('')}>クリア</button>
        </div>
        <Hint>書架に貯めた文献から探します。抜き書きやメモの中身も検索対象です。</Hint>
        {searchMsg && <div className="hint">{searchMsg}</div>}

        <div style={{ marginTop: '.8rem' }}>
          {results.map(({ ref, hits }) => (
            <SearchResult
              key={ref.id} reference={ref} hits={hits} query={query}
              inUse={usedIds.has(ref.id)}
              onToggle={async (checked) => {
                const repo = getRepo();
                if (checked) await repo.assignToProject('reference', ref.id, current.id);
                else await repo.removeFromProject('reference', ref.id, current.id);
                reload();
              }}
            />
          ))}
        </div>
      </section>

      <section>
        <h2>このレポートで使う文献 <span className="n">{used.length}件</span></h2>
        {!used.length ? (
          <Empty>まだ文献を選んでいません。上の検索から追加してください。</Empty>
        ) : sortReferences(used, { order }).map((ref: Reference) => (
          <div className="pick" key={ref.id}>
            <div className="pick-body">
              <div className="ref-title">
                <Link href={`/reference/?id=${encodeURIComponent(ref.id)}`}>
                  {ref.csl.title ?? '(タイトルなし)'}
                </Link>
              </div>
              <div className="ref-meta">{authorLabel(ref.csl)} — {yearLabel(ref.csl)}</div>
            </div>
            <button className="sm ghost" onClick={async () => {
              await getRepo().removeFromProject('reference', ref.id, current.id);
              reload();
            }}>外す</button>
          </div>
        ))}
      </section>

      <section>
        <h2>引用文献リスト</h2>
        {bibliography.html ? (
          <div className="out" dangerouslySetInnerHTML={{ __html: bibliography.html }} />
        ) : (
          <div className="out"><Empty>文献を選ぶとここにリストが出ます。</Empty></div>
        )}

        <div className="row" style={{ marginTop: '.8rem' }}>
          <button onClick={() => {
            // Safari は clipboard.write() に await を挟むと失敗するため、
            // ハンドラ内で同期的に Blob を作る（copyToClipboard がその形）
            copyToClipboard(bibliography.html, bibliography.plain)
              .then(() => setOutMsg({
                text: 'コピーしました。Word や Google ドキュメントに貼り付けてください', kind: 'ok',
              }))
              .catch((e: Error) => setOutMsg({ text: 'コピーに失敗しました: ' + e.message, kind: 'err' }));
          }}>リッチテキストでコピー</button>

          <button className="ghost" onClick={() => {
            navigator.clipboard.writeText(bibliography.plain)
              .then(() => setOutMsg({ text: 'コピーしました（書式なし）', kind: 'ok' }))
              .catch((e: Error) => setOutMsg({ text: 'コピーに失敗しました: ' + e.message, kind: 'err' }));
          }}>プレーンテキスト</button>

          <button className="ghost" onClick={() =>
            downloadText(bibliography.plain, `${current.name}_引用文献.txt`)
          }>.txt で保存</button>
        </div>

        <Hint>
          「リッチテキストでコピー」なら、斜体やぶら下げインデントを保ったまま
          Word や Google ドキュメントに貼り付けられます。
        </Hint>

        {missingReadings.length > 0 && (
          <Message kind="warn">
            読み仮名が未入力の和文文献が {missingReadings.length} 件あります。
            50音順が正しく並ばない可能性があるため、文献の詳細画面で読みを補ってください。
          </Message>
        )}
        {outMsg && <Message kind={outMsg.kind}>{outMsg.text}</Message>}
      </section>

      <section>
        <h2>引用に使える抜き書き</h2>
        <Hint>
          このレポートで使う文献に紐づく抜き書きです。本文に引用する際にそのまま使えます。
        </Hint>
        {!quotes.length ? (
          <Empty>選んだ文献に抜き書きがありません。書架の文献詳細から追加できます。</Empty>
        ) : quotes.map(({ ref, notes }) => (
          <div key={ref.id} style={{ marginBottom: '1rem' }}>
            <div className="ref-meta" style={{ marginBottom: '.4rem' }}>{ref.csl.title}</div>
            {notes.map((n) => (
              <QuoteCard key={n.id} note={n} reference={ref}
                         styleId={styleId}
                         citation={citationOf(ref, n)} />
            ))}
          </div>
        ))}
      </section>
    </>
  );
}

function SearchResult({ reference, hits, query, inUse, onToggle }: {
  reference: Reference; hits: Note[]; query: string;
  inUse: boolean; onToggle: (checked: boolean) => void;
}) {
  const c = reference.csl;
  const needle = query.toLowerCase().replace(/\s/g, '');

  return (
    <div className="pick">
      <input type="checkbox" checked={inUse} onChange={(e) => onToggle(e.target.checked)} />
      <div className="pick-body">
        <div className="ref-title">
          <Link href={`/reference/?id=${encodeURIComponent(reference.id)}`}>
            {c.title ?? '(タイトルなし)'}
          </Link>
          {inUse && <Badge kind="ok">このレポートで使用中</Badge>}
        </div>
        <div className="ref-meta">{authorLabel(c)} — {yearLabel(c)}</div>

        {hits.slice(0, 3).map((n) => {
          // 引用文とコメントのどちらが当たったのかが分かるようにする
          const inBody = String(n.body ?? '').toLowerCase().replace(/\s/g, '').includes(needle);
          const target = inBody ? n.body : (n.comment ?? n.body);
          const label = inBody ? (n.type === 'direct' ? '引用' : 'メモ') : 'コメント';
          return (
            <div className="hit" key={n.id}>
              <span className="page-tag">
                {label}{n.locator?.page ? ` p.${n.locator.page}` : ''}
              </span>
              {' '}
              <Highlight text={target} query={query} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 検索語の該当部分を強調する（前後を切り詰めて読みやすくする） */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text.length > 120 ? text.slice(0, 120) + '…' : text}</>;

  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text.length > 120 ? text.slice(0, 120) + '…' : text}</>;

  const start = Math.max(0, i - 30);
  const end = i + q.length + 60;
  return (
    <>
      {start > 0 && '…'}
      {text.slice(start, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length, end)}
      {text.length > end && '…'}
    </>
  );
}

/**
 * 引用文のカード。
 *
 * マニュアル 7章の早見表にある型を選んで、本文へそのまま貼れる形でコピーする。
 * 出典表記は citeproc に作らせる（文字列連結だと pp. の使い分けや
 * 同一著者・同年の a/b/c が落ちる）。
 */
function QuoteCard({ note, reference, citation, styleId }: {
  note: Note; reference: Reference; citation: string; styleId: string;
}) {
  const [copied, setCopied] = useState('');

  const patterns = intextPatterns(styleId).filter(
    (p: { kind: string }) => p.kind === (note.type === 'direct' ? 'direct' : 'indirect')
  );
  // 長い引用は既定でブロック引用にする（マニュアル 2.2）。
  // 型の id は方式ごとに違うので、block を持つ方式だけそちらへ倒す。
  const long = isLongQuote(note.body, styleId);
  const blockPattern = patterns.find((p: { id: string }) => p.id === 'block');
  const [patternId, setPatternId] = useState(
    long && blockPattern ? blockPattern.id : patterns[0]?.id ?? '');

  const built = buildInText({ patternId, body: note.body, citation, styleId });

  function copy() {
    const done = (label: string) => {
      setCopied(label);
      setTimeout(() => setCopied(''), 1500);
    };
    if (built.block) {
      // ブロック引用は 2 字下げを保つため書式付きで渡す
      copyToClipboard(blockQuoteHtml(note.body, citation, { styleId }), built.text)
        .then(() => done('コピーしました')).catch(() => {});
    } else {
      navigator.clipboard.writeText(built.text)
        .then(() => done('コピーしました')).catch(() => {});
    }
  }

  return (
    <div className="note direct">
      <div className="note-head">
        <span className="page-tag">p.{note.locator?.page ?? '?'}</span>
        {long && <Badge>長い引用</Badge>}
        <span style={{ marginLeft: 'auto' }}>
          <button className="sm ghost" onClick={copy}>
            {copied || '本文用にコピー'}
          </button>
        </span>
      </div>

      <div className="note-body">{note.body}</div>
      {note.comment && (
        <div className="note-comment">
          <span className="lbl">自分のコメント</span>
          {note.comment}
        </div>
      )}

      <label style={{ marginTop: '.6rem' }}>引用の型（マニュアル 7章）</label>
      <select value={patternId} onChange={(e) => setPatternId(e.target.value)}>
        {patterns.map((p: { id: string; label: string }) => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>

      <div className="preview" style={{ marginTop: '.5rem' }}>
        {built.block && <div className="hint" style={{ marginTop: 0 }}>
          2字下げ・前後1行空けで貼り付けます
        </div>}
        {built.text}
      </div>
    </div>
  );
}
