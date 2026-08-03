/**
 * データアクセス層（設計書 §3、仕様 3.3）
 *
 * 検索インデックスの更新漏れは検索結果の欠落として現れ、しかも
 * 気づきにくい。そのため保存経路をここに集約し、bigram の再構築を
 * 保存処理の内側で必ず行う。呼び出し側が索引を意識する必要はない。
 */

import {
  createDb, newId, nowIso,
  referenceBigrams, noteBigrams, queryBigrams, duplicateKey,
} from './schema.js';

/** @typedef {import('../citation/types.js').CSLItem} CSLItem */

/**
 * 保存される文献レコード。
 * @typedef {Object} StoredReference
 * @property {string} id
 * @property {CSLItem} csl
 * @property {{title?:string, authors?:string[], authorsRaw?:string[], displayNames?:string[]}} [transcription]
 * @property {{kind:string, identifier?:string, fetchedFrom?:string, fetchedAt?:string}} [source]
 * @property {string} [citationOverride]  引用文の最終形。規則で表せない書式のための逃げ道
 * @property {string[]} projectIds
 * @property {string[]} [tags]
 * @property {string[]} [searchIndex]
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string} [deletedAt]
 */

/**
 * 抜き書き・所感メモ。
 * @typedef {Object} StoredNote
 * @property {string} id
 * @property {string} referenceId
 * @property {'direct'|'indirect'} type
 * @property {string} body
 * @property {string} [comment]
 * @property {{page?:string, chapter?:string}} [locator]
 * @property {string[]} projectIds
 * @property {string[]} [searchIndex]
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string} [deletedAt]
 */

/**
 * プロジェクト（レポート単位）。
 * @typedef {Object} StoredProject
 * @property {string} id
 * @property {string} name
 * @property {string} [styleId]
 * @property {'ja-first'|'en-first'} [sortOrder]
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string} [deletedAt]
 */

export class Repository {
  /** @param {import('dexie').Dexie} [db] */
  constructor(db) {
    this.db = db ?? createDb();
  }

  // ---------- 文献 ----------

  /**
   * 文献を保存する（新規・更新の両方）。
   * @param {Partial<StoredReference> & {csl: CSLItem}} ref
   * @returns {Promise<StoredReference>} 保存後のレコード
   */
  async saveReference(ref) {
    const now = nowIso();
    const rec = {
      projectIds: [],
      tags: [],
      ...ref,
      id: ref.id ?? newId(),
      createdAt: ref.createdAt ?? now,
      updatedAt: now,
    };
    rec.searchIndex = referenceBigrams(rec);
    await this.db.references.put(rec);
    return rec;
  }

  /**
   * 未削除の文献を1件取得
   * @returns {Promise<StoredReference|undefined>}
   */
  async getReference(id) {
    const r = await this.db.references.get(id);
    return r && !r.deletedAt ? r : undefined;
  }

  /**
   * 未削除の文献を全件取得（新しい順）
   * @returns {Promise<StoredReference[]>}
   */
  async listReferences() {
    const all = await this.db.references
      .filter((r) => !r.deletedAt)
      .toArray();
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /**
   * 同じ識別子の文献が既にあるか調べる（重複登録の防止）。
   * 同じ本を二度スキャンするのは日常的に起こるため必要。
   * @param {string} identifier ISBN / DOI
   * @returns {Promise<StoredReference|undefined>}
   */
  async findByIdentifier(identifier) {
    if (!identifier) return undefined;
    const all = await this.db.references
      .filter((r) => !r.deletedAt && r.source?.identifier === identifier)
      .toArray();
    return all[0];
  }

  /**
   * 書誌の内容が重複していそうな文献を探す。
   *
   * 識別子（ISBN / DOI）だけでは、同じ本を ISBN と DOI の双方から
   * 取り込んだ場合や、版違いの ISBN を持つ場合に重複を見逃す。
   *
   * ただし自動で統合してはいけない。同姓同名の著者、改訂版、
   * 同一著者の続編などを誤って同一視すると、ユーザーが気づかないまま
   * 別の文献が消える。ここでは候補を返すだけにして、統合の判断は
   * ユーザーに委ねる。
   *
   * @param {Object} csl  判定したい書誌
   * @param {string} [excludeId]  自分自身を除外する
   * @returns {Promise<StoredReference[]>} 重複の可能性がある文献
   */
  async findSimilar(csl, excludeId) {
    const key = duplicateKey(csl);
    if (!key) return [];

    const all = await this.db.references
      .filter((r) => !r.deletedAt && r.id !== excludeId)
      .toArray();

    return all.filter((r) => duplicateKey(r.csl) === key);
  }

  /** 論理削除。紐づくノートも同時に落とす */
  async deleteReference(id) {
    const now = nowIso();
    await this.db.transaction('rw', this.db.references, this.db.notes, async () => {
      await this.db.references.update(id, { deletedAt: now, updatedAt: now });
      const notes = await this.db.notes.where('referenceId').equals(id).toArray();
      await Promise.all(
        notes.map((n) => this.db.notes.update(n.id, { deletedAt: now, updatedAt: now }))
      );
    });
  }

  // ---------- ノート（抜き書き・考察） ----------

  /**
   * ノートを保存する。
   *
   * `body` は引用文または自分の考察そのもの。`comment` は直接引用に対して
   * 付ける自分のコメント（なぜ引いたか、どう使うか）。両者を分けているのは、
   * 引用文に自分の言葉が混ざると剽窃の温床になるため。表示・出力の両方で
   * 混同しない形にしてある。
   *
   * @param {Object} note
   *   { referenceId, type:'direct'|'indirect', body, comment?, locator }
   * @returns {Promise<StoredNote>}
   */
  async saveNote(note) {
    const now = nowIso();
    const rec = {
      projectIds: [],
      ...note,
      id: note.id ?? newId(),
      createdAt: note.createdAt ?? now,
      updatedAt: now,
    };
    rec.searchIndex = noteBigrams(rec);
    await this.db.notes.put(rec);
    return rec;
  }

  /**
   * ある文献に紐づくノート一覧
   * @returns {Promise<StoredNote[]>}
   */
  async listNotes(referenceId) {
    const all = await this.db.notes
      .where('referenceId').equals(referenceId)
      .filter((n) => !n.deletedAt)
      .toArray();
    return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async deleteNote(id) {
    const now = nowIso();
    await this.db.notes.update(id, { deletedAt: now, updatedAt: now });
  }

  // ---------- プロジェクト ----------

  /**
   * @param {Partial<StoredProject> & {name:string}} project
   * @returns {Promise<StoredProject>}
   */
  async saveProject(project) {
    const now = nowIso();
    const rec = {
      styleId: 'apu',
      ...project,
      id: project.id ?? newId(),
      createdAt: project.createdAt ?? now,
      updatedAt: now,
    };
    await this.db.projects.put(rec);
    return rec;
  }

  /** @returns {Promise<StoredProject[]>} */
  async listProjects() {
    const all = await this.db.projects.filter((p) => !p.deletedAt).toArray();
    return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async deleteProject(id) {
    const now = nowIso();
    await this.db.transaction('rw', this.db.projects, this.db.references, this.db.notes, async () => {
      await this.db.projects.update(id, { deletedAt: now, updatedAt: now });
      // プロジェクトを消しても文献自体は残す。振り分けだけ解除する
      for (const table of [this.db.references, this.db.notes]) {
        const hit = await table.where('projectIds').equals(id).toArray();
        await Promise.all(
          hit.map((r) =>
            table.update(r.id, {
              projectIds: r.projectIds.filter((p) => p !== id),
              updatedAt: now,
            })
          )
        );
      }
    });
  }

  /**
   * 文献・ノートをプロジェクトへ振り分ける（仕様 3.3-3）。
   * @param {'reference'|'note'} kind
   */
  async assignToProject(kind, id, projectId) {
    const table = kind === 'note' ? this.db.notes : this.db.references;
    const rec = await table.get(id);
    if (!rec) return;
    const ids = new Set(rec.projectIds ?? []);
    ids.add(projectId);
    await table.update(id, { projectIds: [...ids], updatedAt: nowIso() });
  }

  async removeFromProject(kind, id, projectId) {
    const table = kind === 'note' ? this.db.notes : this.db.references;
    const rec = await table.get(id);
    if (!rec) return;
    await table.update(id, {
      projectIds: (rec.projectIds ?? []).filter((p) => p !== projectId),
      updatedAt: nowIso(),
    });
  }

  /**
   * プロジェクトに属する文献一覧
   * @returns {Promise<StoredReference[]>}
   */
  async listProjectReferences(projectId) {
    const all = await this.db.references
      .where('projectIds').equals(projectId)
      .filter((r) => !r.deletedAt)
      .toArray();
    return all;
  }

  // ---------- 横断検索（仕様 3.3-2） ----------

  /**
   * 書誌とノート本文を横断検索する。
   *
   * bigram インデックスは「その2文字を含む」候補を返すだけで、語順までは
   * 保証しない（例: 「社会学」で「学会社」が候補に入りうる）。そのため
   * 候補を絞り込んだあと、元テキストに対する部分一致で必ず検証する。
   * この二段構えを省くと誤ヒットが混ざる。
   *
   * @param {string} query
   * @param {Object} [opts]
   * @param {string} [opts.projectId]  プロジェクトで絞る
   * @returns {Promise<{references:StoredReference[], notes:StoredNote[]}>}
   */
  async search(query, opts = {}) {
    const grams = queryBigrams(query);
    if (!grams.length) {
      return { references: [], notes: [] };
    }

    // bigram は「いずれかを含む」(OR) で引くと、語が長いほど候補が増えて遅くなる。
    // 実測では 2000 件すべてが該当する語で 78 秒かかった（anyOf は重複走査を
    // 繰り返すため）。検索語のすべての bigram を含む候補だけが答えになりうるので、
    // 最も候補数の少ない bigram 1 つで絞り込み、残りは JS 側で検証する。
    const [refHits, noteHits] = await Promise.all([
      this.narrowBy(this.db.references, grams),
      this.narrowBy(this.db.notes, grams),
    ]);

    const needle = String(query).toLowerCase().replace(/[\s　]/g, '');
    const matches = (text) =>
      String(text ?? '').toLowerCase().replace(/[\s　]/g, '').includes(needle);

    const refText = (r) => {
      const c = r.csl ?? {};
      const names = [...(c.author ?? []), ...(c.editor ?? []), ...(c.translator ?? [])]
        .map((a) => `${a.family ?? ''}${a.given ?? ''}${a.literal ?? ''}`).join('');
      // 索引（referenceBigrams）と同じ対象を並べること。片方だけに
      // フィールドを足すと、索引には当たるのに検証で落ちる／その逆が起きる。
      return [c.title, c['container-title'], c.publisher, names,
              r.transcription?.title, ...(r.transcription?.authors ?? []),
              ...(r.transcription?.authorsRaw ?? []),
              ...(r.transcription?.displayNames ?? []),
              ...(r.tags ?? [])].filter(Boolean).join(' ');
    };

    const inProject = (r) =>
      !opts.projectId || (r.projectIds ?? []).includes(opts.projectId);

    return {
      references: refHits
        .filter((r) => !r.deletedAt && inProject(r) && matches(refText(r))),
      // noteBigrams と同じ対象を見ること（索引と検証の不一致を避ける）
      notes: noteHits
        .filter((n) => !n.deletedAt && inProject(n)
          && (matches(n.body) || matches(n.comment))),
    };
  }

  /**
   * 検索語の bigram のうち、最も候補の少ないもので絞り込む。
   *
   * 検索語のすべての bigram を含むレコードだけが答えになりうるため、
   * どの bigram で絞っても正しい候補集合の上位集合が得られる。
   * ならば最も件数の少ないものを選ぶのが最速になる。
   *
   * count() は索引だけを見るので、実データの取得より桁違いに速い。
   *
   * @param {import('dexie').Table} table
   * @param {string[]} grams
   */
  async narrowBy(table, grams) {
    if (!grams.length) return [];

    // 候補数を数えて最小の bigram を選ぶ。
    // bigram が多すぎるときは先頭数個に限る（count 自体の往復を抑える）
    const probes = grams.slice(0, 8);
    const counts = await Promise.all(
      probes.map(async (g) => ({
        g,
        n: await table.where('searchIndex').equals(g).count(),
      }))
    );
    counts.sort((a, b) => a.n - b.n);

    // どれか 1 つでも 0 件なら、全 bigram を含むレコードは存在しない
    if (counts[0].n === 0) return [];

    return table.where('searchIndex').equals(counts[0].g).toArray();
  }

  // ---------- 設定 ----------

  async getSetting(key, fallback) {
    const r = await this.db.settings.get(key);
    return r ? r.value : fallback;
  }

  async setSetting(key, value) {
    await this.db.settings.put({ key, value });
  }

  // ---------- バックアップ（設計書 §7.3） ----------

  /**
   * 全データを JSON で書き出す。
   * サーバを持たない構成のため、端末間の移動はこれが唯一の手段になる。
   */
  async exportJson() {
    const [references, notes, projects, settings] = await Promise.all([
      this.db.references.toArray(),
      this.db.notes.toArray(),
      this.db.projects.toArray(),
      this.db.settings.toArray(),
    ]);
    return {
      format: 'refcite-backup',
      version: 1,
      exportedAt: nowIso(),
      references, notes, projects, settings,
    };
  }

  /**
   * JSON を取り込む。
   * @param {Object} data
   * @param {Object} [opts]
   * @param {'merge'|'replace'} [opts.mode='merge']
   */
  async importJson(data, opts = {}) {
    if (data?.format !== 'refcite-backup') {
      throw new Error('このファイルは refcite のバックアップではありません');
    }
    const mode = opts.mode ?? 'merge';

    await this.db.transaction('rw',
      this.db.references, this.db.notes, this.db.projects, this.db.settings,
      async () => {
        if (mode === 'replace') {
          await Promise.all([
            this.db.references.clear(), this.db.notes.clear(),
            this.db.projects.clear(), this.db.settings.clear(),
          ]);
        }
        // 索引はエクスポート元の実装に依存しうるので、取り込み時に必ず作り直す
        await this.db.references.bulkPut(
          (data.references ?? []).map((r) => ({ ...r, searchIndex: referenceBigrams(r) }))
        );
        await this.db.notes.bulkPut(
          (data.notes ?? []).map((n) => ({ ...n, searchIndex: noteBigrams(n) }))
        );
        await this.db.projects.bulkPut(data.projects ?? []);
        await this.db.settings.bulkPut(data.settings ?? []);
      });

    return {
      references: data.references?.length ?? 0,
      notes: data.notes?.length ?? 0,
      projects: data.projects?.length ?? 0,
    };
  }
}
