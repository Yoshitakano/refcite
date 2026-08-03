'use client';

import type { Project } from '@/lib/hooks';
import { Hint } from './ui';

/**
 * プロジェクトの選択と作成。
 *
 * スタイルをプロジェクト単位で持つのは、学生が同時期に複数の授業を取り、
 * 授業ごとに指定形式が違うため（設計書 §3.3）。
 */
export function ProjectBar({ projects, current, onSelect, onCreate, onRename }: {
  projects: Project[];
  current: Project;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (name: string) => void;
}) {
  return (
    <section>
      <h2>プロジェクト</h2>
      <div className="row">
        <select value={current.id} onChange={(e) => onSelect(e.target.value)}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button className="ghost" onClick={() => {
          const name = prompt('プロジェクト名（例: 2026年前期_社会学レポート）');
          if (name?.trim()) onCreate(name.trim());
        }}>新規</button>
        <button className="ghost sm" onClick={() => {
          const name = prompt('新しい名前', current.name);
          if (name?.trim()) onRename(name.trim());
        }}>名前変更</button>
      </div>
      <Hint>
        取り込んだ文献はここで選んだプロジェクトに入ります。授業ごとに分けておくと執筆時に楽になります。
      </Hint>
    </section>
  );
}
