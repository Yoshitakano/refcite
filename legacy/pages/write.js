/**
 * 執筆ページ（B）
 *
 * レポートを書く場面のためのページ。書架に貯めた文献から使うものを選び、
 * 引用文献リストを出力する。ここでは新規取込を行わない（それは書架の仕事）。
 *
 * 「使う文献」は projectIds で表現する。書架での振り分けと同じ仕組みなので、
 * 書架で入れた文献はここに最初から並ぶ。
 */

import {
  repo, getEngine, $, msg, escapeHtml, authorLabel, yearLabel,
  currentProject, setCurrentProject, markNav, registerServiceWorker,
} from '../shared.js';
import {
  normalizeAll, sortReferences, findMissingReadings,
  toRichHtml, toPlainText, copyToClipboard, downloadText, htmlToPlain,
  blockQuoteHtml,
} from '../../src/citation/index.js';

let engine;
let state = { project: null, projects: [], used: [], results: null, query: '' };

async function boot() {
  markNav('write');
  $('status').textContent = '読み込み中…';
  engine = await getEngine();
  const { project, projects } = await currentProject();
  state.project = project;
  state.projects = projects;
  bind();
  await refresh();
  $('status').textContent = '';
}

async function refresh() {
  $('projectSel').innerHTML = state.projects
    .map((p) => `<option value="${p.id}"${p.id === state.project.id ? ' selected' : ''}>${escapeHtml(p.name)}</option>`)
    .join('');
  $('styleSel').value = state.project.styleId ?? 'apu';
  $('orderSel').value = state.project.sortOrder ?? 'ja-first';

  state.used = await repo.listProjectReferences(state.project.id);
  $('usedCount').textContent = `${state.used.length}件`;

  renderUsed();
  renderBibliography();
  await renderQuotes();
  if (state.query) await runSearch();
}

// ---------- 検索（書架内） ----------

async function runSearch() {
  const q = state.query;
  if (!q) { $('results').innerHTML = ''; $('searchMsg').textContent = ''; return; }

  // 書架全体から探す。プロジェクトで絞らないのは、まだこのレポートに
  // 入れていない文献を見つけるのがこの検索の目的だから。
  const res = await repo.search(q);

  // ノートだけが当たった文献も候補に含める
  const byId = new Map(res.references.map((r) => [r.id, { ref: r, hits: [] }]));
  for (const n of res.notes) {
    if (!byId.has(n.referenceId)) {
      const r = await repo.getReference(n.referenceId);
      if (r) byId.set(r.id, { ref: r, hits: [] });
    }
    byId.get(n.referenceId)?.hits.push(n);
  }

  const list = [...byId.values()];
  $('searchMsg').textContent =
    list.length ? `${list.length} 件の文献が該当（抜き書き・メモのヒット ${res.notes.length} 件）`
                : '該当する文献がありません。書架で取り込んでください。';

  const usedIds = new Set(state.used.map((r) => r.id));
  $('results').innerHTML = list.map(({ ref, hits }) => {
    const c = ref.csl;
    const inUse = usedIds.has(ref.id);
    // 引用文とコメントのどちらが当たったのかが分かるよう、
    // ヒットした側を表示する（コメントで探すことも多いため）
    const hitHtml = hits.slice(0, 3).map((n) => {
      const q = state.query.toLowerCase().replace(/\s/g, '');
      const inBody = String(n.body ?? '').toLowerCase().replace(/\s/g, '').includes(q);
      const target = inBody ? n.body : (n.comment ?? n.body);
      const label = inBody
        ? (n.type === 'direct' ? '引用' : 'メモ')
        : 'コメント';
      return `
      <div class="hit">
        <span class="page-tag">${label}${n.locator?.page ? ` p.${escapeHtml(n.locator.page)}` : ''}</span>
        ${highlight(target, state.query)}
      </div>`;
    }).join('');

    return `
      <div class="pick">
        <input type="checkbox" data-use="${ref.id}" ${inUse ? 'checked' : ''}>
        <div class="pick-body">
          <div class="ref-title">
            <a href="./detail.html?id=${encodeURIComponent(ref.id)}">${escapeHtml(c.title ?? '(タイトルなし)')}</a>
            ${inUse ? '<span class="badge ok">このレポートで使用中</span>' : ''}
          </div>
          <div class="ref-meta">${escapeHtml(authorLabel(c))} — ${yearLabel(c)}</div>
          ${hitHtml}
        </div>
      </div>`;
  }).join('');

  $('results').querySelectorAll('[data-use]').forEach((box) => {
    box.onchange = async () => {
      if (box.checked) {
        await repo.assignToProject('reference', box.dataset.use, state.project.id);
      } else {
        await repo.removeFromProject('reference', box.dataset.use, state.project.id);
      }
      await refresh();
    };
  });
}

/** 検索語をハイライトする（表示用。検索自体は repository が行う） */
function highlight(text, query) {
  const t = escapeHtml(text);
  const q = escapeHtml(query.trim());
  if (!q) return t;
  const i = t.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return t.length > 120 ? t.slice(0, 120) + '…' : t;
  const start = Math.max(0, i - 30);
  const head = start > 0 ? '…' : '';
  const seg = t.slice(start, i + q.length + 60);
  return head + seg.replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'),
    (m) => `<mark>${m}</mark>`) + (t.length > i + q.length + 60 ? '…' : '');
}

// ---------- 使用中の文献 ----------

function renderUsed() {
  const el = $('used');
  if (!state.used.length) {
    el.innerHTML = '<div class="empty">まだ文献を選んでいません。上の検索から追加してください。</div>';
    return;
  }
  const sorted = sortReferences(state.used, { order: state.project.sortOrder ?? 'ja-first' });
  el.innerHTML = sorted.map((ref) => {
    const c = ref.csl;
    return `
      <div class="pick">
        <div class="pick-body">
          <div class="ref-title">
            <a href="./detail.html?id=${encodeURIComponent(ref.id)}">${escapeHtml(c.title ?? '(タイトルなし)')}</a>
          </div>
          <div class="ref-meta">${escapeHtml(authorLabel(c))} — ${yearLabel(c)}</div>
        </div>
        <button class="sm ghost" data-drop="${ref.id}">外す</button>
      </div>`;
  }).join('');

  el.querySelectorAll('[data-drop]').forEach((b) => b.onclick = async () => {
    await repo.removeFromProject('reference', b.dataset.drop, state.project.id);
    await refresh();
  });
}

// ---------- 引用文献リスト ----------

function renderBibliography() {
  const el = $('bibOut');
  if (!state.used.length) {
    el.innerHTML = '<div class="empty">文献を選ぶとここにリストが出ます。</div>';
    el.dataset.plain = '';
    return;
  }
  const styleId = state.project.styleId ?? 'apu';
  const sorted = sortReferences(state.used, { order: state.project.sortOrder ?? 'ja-first' });
  const items = normalizeAll(sorted.map((r) => r.csl));
  const { entries } = engine.renderBibliography(items, styleId, { preserveOrder: true });

  el.innerHTML = toRichHtml(entries);
  el.dataset.plain = toPlainText(entries);

  const missing = findMissingReadings(state.used);
  msg('outMsg',
    missing.length
      ? `読み仮名が未入力の和文文献が ${missing.length} 件あります。50音順が正しく並ばない可能性があるため、文献の詳細画面で読みを補ってください。`
      : '',
    'warn');
}

// ---------- 抜き書き一覧 ----------

async function renderQuotes() {
  const el = $('quotes');
  if (!state.used.length) { el.innerHTML = '<div class="empty">—</div>'; return; }

  const blocks = [];
  for (const ref of sortReferences(state.used, { order: state.project.sortOrder ?? 'ja-first' })) {
    const notes = (await repo.listNotes(ref.id)).filter((n) => n.type === 'direct');
    if (!notes.length) continue;
    const c = ref.csl;
    // 本文中の出典表記（APU マニュアル 7章の早見表に対応）
    const family = c.author?.[0]?.family ?? c.author?.[0]?.literal ?? '著者不明';
    const year = yearLabel(c);
    blocks.push(`
      <div style="margin-bottom:1rem">
        <div class="ref-meta" style="margin-bottom:.4rem">${escapeHtml(c.title ?? '')}</div>
        ${notes.map((n) => `
          <div class="note direct">
            <div class="note-head">
              <span class="page-tag">p.${escapeHtml(n.locator?.page ?? '?')}</span>
              <span style="margin-left:auto">
                <button class="sm ghost" data-copyq="${n.id}"
                        data-src="（${escapeHtml(family)}, ${year}, p.${escapeHtml(n.locator?.page ?? '?')}）">引用文をコピー</button>
              </span>
            </div>
            <div class="note-body" id="q-${n.id}">${escapeHtml(n.body)}</div>
            ${n.comment
              ? `<div class="note-comment"><span class="lbl">自分のコメント</span>${escapeHtml(n.comment)}</div>`
              : ''}
            <div class="hint" style="margin-top:.35rem">
              出典表記: （${escapeHtml(family)}, ${year}, p.${escapeHtml(n.locator?.page ?? '?')}）
              ${isLongQuote(n.body)
                ? '<span class="badge">長い引用: ブロック引用（2字下げ）にします</span>'
                : ''}
            </div>
          </div>`).join('')}
      </div>`);
  }

  el.innerHTML = blocks.length ? blocks.join('')
    : '<div class="empty">選んだ文献に抜き書きがありません。書架の文献詳細から追加できます。</div>';

  // 引用文のコピー。長い引用は Word 側でブロック引用（2字下げ）になるよう
  // 書式付きで渡す（APU マニュアル 2.2）。短い引用はカギカッコ付きの
  // プレーンテキストにして、地の文にそのまま差し込めるようにする。
  el.querySelectorAll('[data-copyq]').forEach((b) => b.onclick = () => {
    const id = b.dataset.copyq;
    const body = $(`q-${id}`)?.textContent ?? '';
    const src = b.dataset.src ?? '';
    const done = () => {
      b.textContent = 'コピーしました';
      setTimeout(() => { b.textContent = '引用文をコピー'; }, 1500);
    };

    if (isLongQuote(body)) {
      const html = blockQuoteHtml(body, src);
      copyToClipboard(html, `${body}\n${src}`).then(done).catch(() => {});
    } else {
      navigator.clipboard.writeText(`「${body}」${src}`).then(done).catch(() => {});
    }
  });
}

/**
 * ブロック引用にすべき長さか（APU マニュアル 2.2: 目安 4〜5行）。
 * 行数は貼り付け先の幅で変わるため、文字数で近似する。
 * 和文 40 字 × 4 行 ≒ 160 字を境目にする。
 */
function isLongQuote(text) {
  return String(text ?? '').length >= 160;
}

// ---------- イベント ----------

function bind() {
  $('projectSel').onchange = async (e) => {
    state.project = state.projects.find((p) => p.id === e.target.value);
    await setCurrentProject(state.project.id);
    await refresh();
  };

  $('styleSel').onchange = async (e) => {
    await repo.saveProject({ ...state.project, styleId: e.target.value });
    state.projects = await repo.listProjects();
    state.project = state.projects.find((p) => p.id === state.project.id);
    renderBibliography();
  };

  $('orderSel').onchange = async (e) => {
    await repo.saveProject({ ...state.project, sortOrder: e.target.value });
    state.projects = await repo.listProjects();
    state.project = state.projects.find((p) => p.id === state.project.id);
    renderUsed();
    renderBibliography();
  };

  let timer;
  $('searchInput').oninput = (e) => {
    clearTimeout(timer);
    timer = setTimeout(async () => { state.query = e.target.value.trim(); await runSearch(); }, 200);
  };
  $('clearBtn').onclick = async () => {
    $('searchInput').value = ''; state.query = ''; await runSearch();
  };

  // Safari は clipboard.write() を非同期処理越しに呼ぶと失敗するため、
  // ハンドラ内で同期的に Blob を作る（copyToClipboard がその形になっている）
  $('copyRich').onclick = () => {
    copyToClipboard($('bibOut').innerHTML, $('bibOut').dataset.plain ?? '')
      .then(() => msg('outMsg', 'コピーしました。Word や Google ドキュメントに貼り付けてください'))
      .catch((e) => msg('outMsg', 'コピーに失敗しました: ' + e.message, 'err'));
  };
  $('copyPlain').onclick = () => {
    navigator.clipboard.writeText($('bibOut').dataset.plain ?? '')
      .then(() => msg('outMsg', 'コピーしました（書式なし）'))
      .catch((e) => msg('outMsg', 'コピーに失敗しました: ' + e.message, 'err'));
  };
  $('dlTxt').onclick = () => {
    downloadText($('bibOut').dataset.plain ?? '', `${state.project.name}_引用文献.txt`);
  };
}

boot().catch((e) => {
  $('status').textContent = '起動に失敗';
  console.error(e);
});

registerServiceWorker();
