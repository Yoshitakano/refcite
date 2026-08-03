/**
 * 書架ページ（A）
 *
 * 役割は「文献を貯める」ことに絞る。日常的に本を読んで登録する場面で使う。
 * 引用リストの生成は執筆ページ（B）の仕事なので、ここには置かない。
 */

import {
  repo, getEngine, $, msg, escapeHtml, authorLabel, yearLabel,
  currentProject, setCurrentProject, markNav, registerServiceWorker,
} from '../shared.js';
import {
  importByIdentifier, searchBibliography, importFromCandidate, importManual,
} from '../../src/import/index.js';
import { normalizeAll, validateItem } from '../../src/citation/index.js';

let engine;
let state = { project: null, projects: [], refs: [], filter: '', scope: 'project' };

async function boot() {
  markNav('shelf');
  $('status').textContent = '読み込み中…';
  engine = await getEngine();
  const { project, projects } = await currentProject();
  state.project = project;
  state.projects = projects;
  bind();
  await refresh();
  $('status').textContent = '';
}

// ---------- 検索して取り込む（主動線） ----------

let candidates = [];

async function doSearch() {
  const title = $('qTitle').value.trim();
  const author = $('qAuthor').value.trim();
  if (!title && !author) {
    msg('searchStatus', 'タイトルか著者名のどちらかを入力してください', 'err');
    return;
  }

  msg('searchStatus', 'さがしています…');
  $('candidates').innerHTML = '';

  const r = await searchBibliography({ title, author });
  if (!r.ok) { msg('searchStatus', r.error, 'err'); return; }

  candidates = r.candidates ?? [];
  if (!candidates.length) {
    msg('searchStatus',
      '見つかりませんでした。表記を変えて試すか、手入力で登録してください', 'warn');
    $('manualPanel').open = true;
    $('mTitle').value = title;
    if (author) $('mAuthors').value = author;
    return;
  }

  msg('searchStatus', `${candidates.length} 件見つかりました。登録するものを選んでください`);
  renderCandidates();
}

function renderCandidates() {
  const saved = new Set(state.refs.map((r) => r.source?.identifier).filter(Boolean));
  $('candidates').innerHTML = `
    <div style="margin-top:.8rem">
      ${candidates.slice(0, 12).map((c, i) => {
        const already = c.isbn && saved.has(c.isbn);
        return `
        <div class="pick">
          <div class="pick-body">
            <div class="ref-title">${escapeHtml(c.title ?? '')}
              ${c.kind === 'article' ? '<span class="badge">記事</span>' : ''}
              ${already ? '<span class="badge ok">登録済み</span>' : ''}
            </div>
            <div class="ref-meta">
              ${escapeHtml(c.authors.slice(0, 4).join('・') || '著者不明')}
              ${c.year ? ' — ' + escapeHtml(c.year) : ''}
              ${c.publisher ? ' / ' + escapeHtml(c.publisher) : ''}
              ${c.isbn ? ` <span class="badge">ISBN</span>` : ''}
            </div>
          </div>
          <button class="sm${already ? ' ghost' : ''}" data-pick="${i}">
            ${already ? '再登録' : 'この文献を登録'}</button>
        </div>`;
      }).join('')}
    </div>`;

  $('candidates').querySelectorAll('[data-pick]').forEach((b) => {
    b.onclick = () => pickCandidate(Number(b.dataset.pick), b);
  });
}

async function pickCandidate(index, btn) {
  const c = candidates[index];
  if (!c) return;
  btn.disabled = true;
  btn.textContent = '登録中…';

  const r = await importFromCandidate(c);
  if (!r.ok) {
    msg('searchStatus', r.error, 'err');
    btn.disabled = false; btn.textContent = 'この文献を登録';
    return;
  }

  const dup = r.reference.source.identifier
    ? await repo.findByIdentifier(r.reference.source.identifier)
    : null;
  if (dup) {
    if (!(dup.projectIds ?? []).includes(state.project.id)) {
      await repo.assignToProject('reference', dup.id, state.project.id);
      msg('searchStatus', `登録済みの文献を「${state.project.name}」に追加しました`, 'warn');
    } else {
      msg('searchStatus', 'すでにこのプロジェクトにあります', 'warn');
    }
  } else if (await confirmSimilar(r.reference)) {
    // 似た書誌がある場合はユーザーに確認する（別版・別の本の可能性がある）
    btn.disabled = false; btn.textContent = 'この文献を登録';
    return;
  } else {
    await repo.saveReference({ ...r.reference, projectIds: [state.project.id] });
    const errs = r.issues.filter((i) => i.level === 'error');
    msg('searchStatus',
      errs.length
        ? `登録しました。ただし ${errs.map((e) => e.message.replace(/。.*/, '')).join('、')}`
        : `登録しました: ${r.reference.csl.title ?? ''}`,
      errs.length ? 'warn' : 'ok');
  }

  await refresh();
  renderCandidates();
}

/**
 * 識別子は違うが書誌の内容が一致する文献があれば確認を求める。
 *
 * 同じ本を ISBN と DOI の双方から取り込む、版違いの ISBN を持つ、
 * といった場合に識別子だけでは重複を防げない。ただし改訂版や同名の
 * 別書という可能性もあるため、自動では統合せずユーザーに判断させる。
 *
 * @returns {Promise<boolean>} true なら登録を中止する
 */
async function confirmSimilar(reference) {
  const similar = await repo.findSimilar(reference.csl, reference.id);
  if (!similar.length) return false;

  const s = similar[0];
  const year = s.csl.issued?.['date-parts']?.[0]?.[0] ?? '年不明';
  const proceed = confirm(
    `同じ書誌の文献がすでに登録されています。\n\n` +
    `  ${s.csl.title ?? ''}\n  ${authorLabel(s.csl)} — ${year}\n\n` +
    `別の版であれば「OK」で登録できます。\n` +
    `同じ本なら「キャンセル」を押してください（既存の文献を使います）。`
  );

  if (!proceed) {
    if (!(s.projectIds ?? []).includes(state.project.id)) {
      await repo.assignToProject('reference', s.id, state.project.id);
      msg('searchStatus', `既存の文献を「${state.project.name}」に追加しました`, 'warn');
    } else {
      msg('searchStatus', 'すでにこのプロジェクトにあります', 'warn');
    }
    await refresh();
    return true;
  }
  return false;
}

// ---------- 手入力 ----------

async function doManual() {
  const title = $('mTitle').value.trim();
  if (!title) { msg('manualMsg', 'タイトルは必須です', 'err'); return; }

  const lines = (v) => v.split('\n').map((s) => s.trim()).filter(Boolean);
  const r = importManual({
    title,
    authors: lines($('mAuthors').value),
    readings: lines($('mReadings').value),
    year: $('mYear').value,
    publisher: $('mPublisher').value,
    containerTitle: $('mContainer').value,
    volume: $('mVolume').value,
    issue: $('mIssue').value,
    page: $('mPage').value,
    type: $('mType').value,
  });
  if (!r.ok) { msg('manualMsg', r.error ?? '登録できませんでした', 'err'); return; }

  await repo.saveReference({ ...r.reference, projectIds: [state.project.id] });
  ['mTitle','mAuthors','mReadings','mYear','mPublisher','mContainer','mVolume','mIssue','mPage']
    .forEach((id) => { $(id).value = ''; });
  msg('manualMsg', `登録しました: ${title}`);
  await refresh();
}

// ---------- バーコード読取（仕様 3.1-1） ----------

let scanner = null;

async function startScan() {
  const { BarcodeScanner, cameraAvailable } = await import('../scanner.js');
  if (!cameraAvailable()) {
    msg('importMsg',
      location.protocol === 'https:' || location.hostname === 'localhost'
        ? 'この端末ではカメラを利用できません。ISBN を手入力してください'
        : 'カメラを使うには HTTPS でアクセスしてください', 'warn');
    return;
  }

  $('scanArea').hidden = false;
  $('scanBtn').disabled = true;

  scanner = new BarcodeScanner($('scanVideo'), {
    onStatus: (t) => { $('scanStatus').textContent = t; },
    onDetect: async (isbn) => {
      // 読み取れたら即座に止める。連続取込を避けるため
      stopScan();
      $('idInput').value = isbn;
      msg('importMsg', `読み取りました: ${isbn}`);
      await doImport();
    },
  });

  try {
    await scanner.start();
  } catch (e) {
    stopScan();
    msg('importMsg', e.message, 'err');
  }
}

function stopScan() {
  scanner?.stop();
  scanner = null;
  $('scanArea').hidden = true;
  $('scanBtn').disabled = false;
  $('scanStatus').textContent = '';
}

// ---------- コード入力（サブ） ----------

async function doImport() {
  const input = $('idInput').value.trim();
  if (!input) return;

  msg('importMsg', '取得しています…');
  const r = await importByIdentifier(input);
  if (!r.ok) { msg('importMsg', r.error, 'err'); return; }

  const dup = await repo.findByIdentifier(r.reference.source.identifier);
  if (dup) {
    // 既にある文献なら、現在のプロジェクトへの追加だけ行う
    if (!(dup.projectIds ?? []).includes(state.project.id)) {
      await repo.assignToProject('reference', dup.id, state.project.id);
      msg('importMsg', `登録済みの文献を「${state.project.name}」に追加しました`, 'warn');
    } else {
      msg('importMsg', `すでにこのプロジェクトにあります: ${dup.csl.title ?? ''}`, 'warn');
    }
    $('idInput').value = '';
    await refresh();
    return;
  }

  const saved = await repo.saveReference({
    ...r.reference,
    projectIds: [state.project.id],
  });

  const errs = r.issues.filter((i) => i.level === 'error');
  msg('importMsg',
    errs.length
      ? `取り込みました。ただし ${errs.map((e) => e.message.replace(/。.*/, '')).join('、')}`
      : `取り込みました: ${saved.csl.title ?? ''}`,
    errs.length ? 'warn' : 'ok');

  $('idInput').value = '';
  await refresh();
}

// ---------- 表示 ----------

async function refresh() {
  const sel = $('projectSel');
  sel.innerHTML = state.projects
    .map((p) => `<option value="${p.id}"${p.id === state.project.id ? ' selected' : ''}>${escapeHtml(p.name)}</option>`)
    .join('');

  const all = state.scope === 'all'
    ? await repo.listReferences()
    : await repo.listProjectReferences(state.project.id);

  const f = state.filter.toLowerCase().replace(/\s/g, '');
  state.refs = f
    ? all.filter((r) => {
        const c = r.csl;
        const hay = [c.title, c.publisher, authorLabel(c),
                     ...(r.transcription?.authorsRaw ?? []),
                     ...(r.transcription?.displayNames ?? [])]
          .filter(Boolean).join('').toLowerCase().replace(/\s/g, '');
        return hay.includes(f);
      })
    : all;

  $('refCount').textContent = `${state.refs.length}件`;
  await renderShelf();
}

async function renderShelf() {
  const el = $('shelf');
  if (!state.refs.length) {
    el.innerHTML = `<div class="empty">${
      state.filter ? '該当する文献がありません。'
        : 'まだ文献がありません。上の欄から ISBN か DOI を取り込んでください。'
    }</div>`;
    return;
  }

  // 抜き書き件数をまとめて取る
  const counts = new Map();
  await Promise.all(state.refs.map(async (r) => {
    counts.set(r.id, (await repo.listNotes(r.id)).length);
  }));

  const styleId = state.project.styleId ?? 'apu';

  el.innerHTML = state.refs.map((ref) => {
    const c = ref.csl;
    const issues = validateItem(c);
    let preview;
    try {
      preview = engine.renderOne(normalizeAll([c])[0], styleId);
    } catch (e) {
      preview = `<span class="miss">プレビューを作れません</span>`;
    }
    for (const i of issues.filter((x) => x.level === 'error')) {
      const label = { author: '著者', issued: '出版年', publisher: '出版社',
                      title: 'タイトル', 'container-title': '収録誌' }[i.field] ?? i.field;
      preview += ` <span class="miss">[${label}なし]</span>`;
    }

    const n = counts.get(ref.id) ?? 0;
    const inProj = (ref.projectIds ?? []).includes(state.project.id);

    return `
      <div class="ref">
        <div class="ref-title">
          <a href="./detail.html?id=${encodeURIComponent(ref.id)}">${escapeHtml(c.title ?? '(タイトルなし)')}</a>
          ${issues.length ? `<span class="badge err">要確認</span>` : ''}
          ${n ? `<span class="badge ok">抜き書き ${n}</span>` : ''}
          ${state.scope === 'all' && !inProj ? '<span class="badge">別プロジェクト</span>' : ''}
        </div>
        <div class="ref-meta">${escapeHtml(authorLabel(c))} — ${yearLabel(c)}${c.publisher ? ' / ' + escapeHtml(c.publisher) : ''}</div>
        <div class="preview">${preview}</div>
        <div class="row" style="margin-top:.5rem">
          <a href="./detail.html?id=${encodeURIComponent(ref.id)}">
            <button class="sm ghost">開く（抜き書き・メモ）</button></a>
          ${state.scope === 'all' && !inProj
            ? `<button class="sm ghost" data-add="${ref.id}">このプロジェクトに追加</button>` : ''}
          <button class="sm danger" data-del="${ref.id}">削除</button>
        </div>
      </div>`;
  }).join('');

  el.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    if (!confirm('この文献と、紐づく抜き書き・メモをすべて削除します。よろしいですか？')) return;
    await repo.deleteReference(b.dataset.del);
    await refresh();
  });
  el.querySelectorAll('[data-add]').forEach((b) => b.onclick = async () => {
    await repo.assignToProject('reference', b.dataset.add, state.project.id);
    await refresh();
  });
}

// ---------- イベント ----------

function bind() {
  $('searchBtn').onclick = doSearch;
  for (const id of ['qTitle', 'qAuthor']) {
    $(id).onkeydown = (e) => { if (e.key === 'Enter') doSearch(); };
  }
  $('manualBtn').onclick = doManual;

  $('importBtn').onclick = doImport;
  $('idInput').onkeydown = (e) => { if (e.key === 'Enter') doImport(); };

  // カメラが使える環境でのみスキャンボタンを出す
  import('../scanner.js').then(({ cameraAvailable }) => {
    if (cameraAvailable()) $('scanBtn').hidden = false;
  });
  $('scanBtn').onclick = startScan;
  $('scanStop').onclick = stopScan;
  // ページを離れるときにカメラを確実に解放する
  window.addEventListener('pagehide', stopScan);

  $('projectSel').onchange = async (e) => {
    state.project = state.projects.find((p) => p.id === e.target.value);
    await setCurrentProject(state.project.id);
    await refresh();
  };

  $('newProjBtn').onclick = async () => {
    const name = prompt('プロジェクト名（例: 2026年前期_社会学レポート）');
    if (!name?.trim()) return;
    const p = await repo.saveProject({ name: name.trim(), styleId: 'apu' });
    state.projects = await repo.listProjects();
    state.project = p;
    await setCurrentProject(p.id);
    await refresh();
  };

  $('renameProjBtn').onclick = async () => {
    const name = prompt('新しい名前', state.project.name);
    if (!name?.trim()) return;
    await repo.saveProject({ ...state.project, name: name.trim() });
    state.projects = await repo.listProjects();
    state.project = state.projects.find((p) => p.id === state.project.id);
    await refresh();
  };

  let timer;
  $('filterInput').oninput = (e) => {
    clearTimeout(timer);
    timer = setTimeout(async () => { state.filter = e.target.value.trim(); await refresh(); }, 150);
  };

  $('scopeSel').onchange = async (e) => { state.scope = e.target.value; await refresh(); };

  $('dlJson').onclick = async () => {
    const data = await repo.exportJson();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `refcite-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    msg('backupMsg', `書き出しました（文献 ${data.references.length} 件）`);
  };
  $('upJson').onclick = () => $('jsonFile').click();
  $('jsonFile').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await repo.importJson(JSON.parse(await file.text()));
      const { project, projects } = await currentProject();
      state.project = project; state.projects = projects;
      msg('backupMsg', `読み込みました（文献 ${res.references} / 抜き書き ${res.notes}）`);
      await refresh();
    } catch (err) {
      msg('backupMsg', '読み込みに失敗しました: ' + err.message, 'err');
    }
    e.target.value = '';
  };
}

boot().catch((e) => {
  $('status').textContent = '起動に失敗';
  msg('importMsg', e.message, 'err');
  console.error(e);
});

registerServiceWorker();
