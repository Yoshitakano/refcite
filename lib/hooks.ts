'use client';

/**
 * 画面共通のフック。
 *
 * データ取得はすべてクライアント側（IndexedDB）で行う。サーバを持たない
 * 設計のため、SSR で先に取ることはできない。初回は必ず読み込み中の状態を経る。
 */

import { useCallback, useEffect, useState } from 'react';
import { getRepo } from './db';
import { getEngine } from './citation';
import type { CitationEngine } from '@lib/citation/index.js';

export type Project = {
  id: string;
  name: string;
  styleId?: string;
  sortOrder?: 'ja-first' | 'en-first';
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

/**
 * 書誌（CSL-JSON）。
 * src/citation/types.js の CSLItem に対応する。id と type は必須で、
 * 残りは任意。引用エンジンへそのまま渡せる形を保つ。
 */
export type CSL = {
  id: string;
  type: string;
  title?: string;
  author?: { family?: string; given?: string; literal?: string }[];
  editor?: { family?: string; given?: string; literal?: string }[];
  translator?: { family?: string; given?: string; literal?: string }[];
  issued?: { 'date-parts'?: number[][]; literal?: string };
  publisher?: string;
  'container-title'?: string;
  volume?: string;
  issue?: string;
  page?: string;
  DOI?: string;
  ISBN?: string;
  URL?: string;
  language?: string;
  [key: string]: unknown;
};

export type Reference = {
  id: string;
  csl: CSL;
  transcription?: { title?: string; authors?: string[]; authorsRaw?: string[]; displayNames?: string[] };
  source?: { kind: string; identifier?: string; fetchedFrom?: string; fetchedAt?: string };
  /** 引用文の最終形。入っていればこれをそのまま出す */
  citationOverride?: string;
  projectIds?: string[];
  tags?: string[];
  createdAt: string;
  updatedAt: string;
};

export type Note = {
  id: string;
  referenceId: string;
  type: 'direct' | 'indirect';
  body: string;
  comment?: string;
  locator?: { page?: string; chapter?: string };
  projectIds?: string[];
  createdAt: string;
  updatedAt: string;
};

/** 引用エンジンを読み込む */
export function useEngine() {
  const [engine, setEngine] = useState<CitationEngine | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getEngine()
      .then((e) => { if (alive) setEngine(e); })
      .catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, []);

  return { engine, error };
}

/**
 * プロジェクト一覧と選択状態。
 * 選択はページをまたいで保つ必要があるので settings に持たせる。
 */
export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [current, setCurrent] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const repo = getRepo();
    let list = await repo.listProjects();
    if (!list.length) {
      // 初回は既定のプロジェクトを作る。無いと取込先が決まらない
      await repo.saveProject({ name: '未分類', styleId: 'apu' });
      list = await repo.listProjects();
    }
    const savedId = await repo.getSetting('currentProject', list[0].id);
    const found = list.find((p: Project) => p.id === savedId) ?? list[0];
    setProjects(list);
    setCurrent(found);
    setLoading(false);
    return found;
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const select = useCallback(async (id: string) => {
    const repo = getRepo();
    await repo.setSetting('currentProject', id);
    await reload();
  }, [reload]);

  const update = useCallback(async (patch: Partial<Project>) => {
    if (!current) return;
    const repo = getRepo();
    await repo.saveProject({ ...current, ...patch });
    await reload();
  }, [current, reload]);

  const create = useCallback(async (name: string) => {
    const repo = getRepo();
    const p = await repo.saveProject({ name, styleId: 'apu' });
    await repo.setSetting('currentProject', p.id);
    await reload();
    return p;
  }, [reload]);

  return { projects, current, loading, reload, select, update, create };
}

/** ある文献に紐づくノート */
export function useNotes(referenceId: string | null) {
  const [notes, setNotes] = useState<Note[]>([]);

  const reload = useCallback(async () => {
    if (!referenceId) { setNotes([]); return; }
    setNotes(await getRepo().listNotes(referenceId));
  }, [referenceId]);

  useEffect(() => { reload(); }, [reload]);

  return { notes, reload };
}
