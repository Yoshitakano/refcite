/**
 * 文献詳細ページ（A-2）
 *
 * 書架のサブページ。1冊の文献に対して抜き書きと所感メモを溜める。
 *
 * 抜き書き（直接引用）とメモ（間接引用・考察）を画面上で分けているのは、
 * 引用作法上まったく別物だから。直接引用はページ数が無いと引用として
 * 成立しないため必須にし、メモは任意にしている。
 */

import {
  repo, getEngine, $, msg, escapeHtml, authorLabel, yearLabel,
  currentProject, markNav, registerServiceWorker,
} from '../shared.js';
import { normalizeAll, validateItem } from '../../src/citation/index.js';

let engine;
let ref = null;
let notes = [];
// プレビューに使う引用スタイル。現在のプロジェクトの設定に従う
let currentStyleId = 'apu';

const refId = new URLSearchParams(location.search).get('id');

async function boot() {
  markNav('shelf');
  if (!refId) { location.href = './index.html'; return; }
  $('status').textContent = '読み込み中…';
  engine = await getEngine();
  const { project } = await currentProject();
  currentStyleId = project.styleId ?? 'apu';
  await reload();
  bind();
  $('status').textContent = '';
}

async function reload() {
  ref = await repo.getReference(refId);
  if (!ref) {
    document.querySelector('main').innerHTML =
      '<section><div class="empty">この文献は見つかりません（削除された可能性があります）。' +
      '<a href="./index.html">書架に戻る</a></div></section>';
    return;
  }
  notes = await repo.listNotes(refId);
  render();
}

function render() {
  const c = ref.csl;
  document.title = `${c.title ?? '文献'} — refcite`;

  $('refHead').innerHTML = `
    <div class="ref-title">${escapeHtml(c.title ?? '(タイトルなし)')}</div>
    <div class="ref-meta">
      ${escapeHtml(authorLabel(c))} — ${yearLabel(c)}
      ${c.publisher ? ' / ' + escapeHtml(c.publisher) : ''}
      ${c['container-title'] ? ' / ' + escapeHtml(c['container-title']) : ''}
      <span class="badge">${ref.source?.fetchedFrom ?? '手入力'}</span>
    </div>`;

  const styleId = currentStyleId;
  let preview;
  try {
    preview = engine.renderOne(normalizeAll([c])[0], styleId);
  } catch (e) {
    preview = '<span class="miss">プレビューを作れません</span>';
  }
  $('refPreview').innerHTML = `<div class="preview">${preview}</div>`;

  const hasQuote = notes.some((n) => n.type === 'direct');
  const issues = validateItem(c, { hasDirectQuote: hasQuote });
  $('refIssues').innerHTML = issues.length
    ? `<div class="msg warn">${issues.map((i) => escapeHtml(i.message)).join('<br>')}</div>`
    : '';

  const quotes = notes.filter((n) => n.type === 'direct');
  const memos = notes.filter((n) => n.type !== 'direct');
  $('quoteCount').textContent = quotes.length ? ` ${quotes.length}件` : '';
  $('memoCount').textContent = memos.length ? ` ${memos.length}件` : '';

  $('quoteList').innerHTML = quotes.length
    ? quotes.map((n) => noteHtml(n, 'direct')).join('')
    : '<div class="empty">まだ抜き書きがありません。</div>';
  $('memoList').innerHTML = memos.length
    ? memos.map((n) => noteHtml(n, 'memo')).join('')
    : '<div class="empty">まだメモがありません。</div>';

  document.querySelectorAll('[data-delnote]').forEach((b) => b.onclick = async () => {
    if (!confirm('削除します。よろしいですか？')) return;
    await repo.deleteNote(b.dataset.delnote);
    await reload();
  });

  // コメントの編集はその場で開閉する。別画面に飛ばすと、引用文を見ながら
  // 書くという本来の使い方ができなくなるため。
  document.querySelectorAll('[data-editc]').forEach((b) => b.onclick = () => {
    const box = $(`ce-${b.dataset.editc}`);
    box.hidden = false;
    $(`ct-${b.dataset.editc}`).focus();
  });
  document.querySelectorAll('[data-cancelc]').forEach((b) => b.onclick = () => {
    $(`ce-${b.dataset.cancelc}`).hidden = true;
  });
  document.querySelectorAll('[data-savec]').forEach((b) => b.onclick = async () => {
    await saveComment(b.dataset.savec);
  });
  document.querySelectorAll('.comment-edit textarea').forEach((t) => {
    t.onkeydown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') saveComment(t.id.slice(3));
    };
  });
}

/** 既存の抜き書きにコメントを保存する */
async function saveComment(noteId) {
  const note = notes.find((n) => n.id === noteId);
  if (!note) return;
  const text = $(`ct-${noteId}`).value.trim();
  await repo.saveNote({ ...note, comment: text || undefined });
  await reload();
}

function noteHtml(n, kind) {
  const page = n.locator?.page;
  // 引用文と自分のコメントは視覚的にはっきり分ける。
  // 混ざったまま本文に転記されると剽窃になりかねないため。
  const comment = n.comment
    ? `<div class="note-comment"><span class="lbl">自分のコメント</span>${escapeHtml(n.comment)}</div>`
    : '';
  return `
    <div class="note ${kind}">
      <div class="note-head">
        <span>${kind === 'direct' ? '直接引用' : '所感メモ'}</span>
        ${page ? `<span class="page-tag">p.${escapeHtml(page)}</span>`
               : (kind === 'direct' ? '<span style="color:var(--err)">ページ未記入</span>' : '')}
        <span style="margin-left:auto">
          ${kind === 'direct'
            ? `<button class="sm ghost" data-editc="${n.id}">${n.comment ? 'コメントを編集' : 'コメントを付ける'}</button>`
            : ''}
          <button class="sm ghost" data-delnote="${n.id}">削除</button>
        </span>
      </div>
      <div class="note-body">${escapeHtml(n.body)}</div>
      ${comment}
      <div class="comment-edit" id="ce-${n.id}" hidden>
        <textarea id="ct-${n.id}" style="min-height:3.2em"
          placeholder="なぜ引いたか、どう使うか、疑問に思ったこと">${escapeHtml(n.comment ?? '')}</textarea>
        <div class="row" style="margin-top:.4rem">
          <button class="sm" data-savec="${n.id}">保存</button>
          <button class="sm ghost" data-cancelc="${n.id}">キャンセル</button>
        </div>
      </div>
    </div>`;
}

// ---------- 追加 ----------

async function addQuote() {
  const body = $('quoteBody').value.trim();
  const page = $('quotePage').value.trim();
  if (!body) { msg('quoteMsg', '引用文を入力してください', 'err'); return; }
  // 直接引用はページ数が無いと引用として成立しない（APU マニュアル 2.1）
  if (!page) { msg('quoteMsg', 'ページ数は必須です（例: 45 / 52-54）', 'err'); return; }

  const { project } = await currentProject();
  await repo.saveNote({
    referenceId: refId, type: 'direct', body,
    comment: $('quoteComment').value.trim() || undefined,
    locator: { page }, projectIds: [project.id],
  });
  $('quoteBody').value = ''; $('quotePage').value = ''; $('quoteComment').value = '';
  msg('quoteMsg', '');
  await reload();
}

async function addMemo() {
  const body = $('memoBody').value.trim();
  if (!body) { msg('memoMsg', 'メモを入力してください', 'err'); return; }
  const page = $('memoPage').value.trim();

  const { project } = await currentProject();
  await repo.saveNote({
    referenceId: refId, type: 'indirect', body,
    locator: page ? { page } : undefined, projectIds: [project.id],
  });
  $('memoBody').value = ''; $('memoPage').value = '';
  msg('memoMsg', '');
  await reload();
}

// ---------- 書誌編集 ----------

function openEdit() {
  const c = ref.csl;
  $('fTitle').value = c.title ?? '';
  $('fAuthors').value = (c.author ?? [])
    .map((a) => a.literal ?? `${a.family ?? ''}, ${a.given ?? ''}`.replace(/,\s*$/, ''))
    .join('\n');
  $('fReadings').value = (ref.transcription?.authors ?? ref.transcription?.authorsRaw ?? []).join('\n');
  $('fYear').value = c.issued?.['date-parts']?.[0]?.[0] ?? '';
  $('fPublisher').value = c.publisher ?? '';
  $('fContainer').value = c['container-title'] ?? '';
  $('fVolume').value = c.volume ?? '';
  $('fIssue').value = c.issue ?? '';
  $('fPage').value = c.page ?? '';
  $('editDlg').showModal();
}

async function saveEdit() {
  const lines = (v) => v.split('\n').map((s) => s.trim()).filter(Boolean);

  const authors = lines($('fAuthors').value).map((s) => {
    const parts = s.split(/,\s*/);
    return parts.length >= 2 && parts[1]
      ? { family: parts[0], given: parts.slice(1).join(' ') }
      : { literal: s };
  });
  const readings = lines($('fReadings').value);
  const year = Number(String($('fYear').value).match(/\d{4}/)?.[0]);

  const csl = { ...ref.csl };
  csl.title = $('fTitle').value.trim() || undefined;
  csl.author = authors.length ? authors : undefined;
  csl.issued = year ? { 'date-parts': [[year]] } : undefined;
  csl.publisher = $('fPublisher').value.trim() || undefined;
  csl['container-title'] = $('fContainer').value.trim() || undefined;
  csl.volume = $('fVolume').value.trim() || undefined;
  csl.issue = $('fIssue').value.trim() || undefined;
  csl.page = $('fPage').value.trim() || undefined;
  for (const k of Object.keys(csl)) if (csl[k] === undefined) delete csl[k];

  await repo.saveReference({
    ...ref,
    csl,
    transcription: {
      ...ref.transcription,
      // 読みを手入力したら、件数が著者と揃ったものだけ 50音順に使う
      authors: readings.length && readings.length === authors.length ? readings : undefined,
      authorsRaw: readings.length ? readings : ref.transcription?.authorsRaw,
    },
  });
  $('editDlg').close();
  await reload();
}

function bind() {
  $('addQuote').onclick = addQuote;
  $('addMemo').onclick = addMemo;
  $('editBtn').onclick = openEdit;
  $('editSave').onclick = saveEdit;
  $('editCancel').onclick = () => $('editDlg').close();

  // Ctrl/Cmd + Enter で追加できるようにする（書き写しは連続作業になるため）
  $('quoteBody').onkeydown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') addQuote();
  };
  $('memoBody').onkeydown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') addMemo();
  };
}

boot().catch((e) => {
  $('status').textContent = '起動に失敗';
  console.error(e);
});

registerServiceWorker();
