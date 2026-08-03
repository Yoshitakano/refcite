'use client';

/**
 * 手入力での文献登録
 *
 * 文献種別を先に選ばせ、その種別に必要な項目だけを出す。
 * 全種別で同じ欄を並べると、新聞記事に「巻・号」が出たり
 * 書籍に「アクセス日」が出たりして入力しづらい。
 *
 * 項目の並びはマニュアルの書式の並びに合わせてあるので、
 * 画面を上から埋めれば書式どおりの順に情報が揃う。
 */

import { useMemo, useState } from 'react';
import { getRepo } from '@/lib/db';
import { useEngine } from '@/lib/hooks';
import { Message, Hint, type MessageKind } from './ui';
import { importManual } from '@lib/import/index.js';
import { refTypesOf, refTypeOf, buildManualFields, missingRequired } from '@lib/citation/reftypes.js';
import { normalizeAll } from '@lib/citation/index.js';
import { DEFAULT_STYLE_ID } from '@/lib/citation';

type Field = {
  key: string; label: string; type: string; required?: boolean;
  placeholder?: string; hint?: string; width?: string;
  options?: { value: string; label: string }[];
};

/** 文献種別（スタイル・パッケージが持つ定義） */
type RefTypeDef = {
  id: string; label: string; desc: string; format: string;
  section: string; fields: Field[]; note?: string;
};

export function ManualEntry({ projectId, defaultTitle, defaultAuthor, onDone }: {
  projectId: string;
  defaultTitle?: string;
  defaultAuthor?: string;
  onDone: () => void;
}) {
  const { engine } = useEngine();
  const [typeId, setTypeId] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ text: string; kind: MessageKind } | null>(null);

  const type = typeId ? refTypeOf(typeId) : null;

  // 入力に応じて出力を先に見せる。書式が合っているか自分で確かめられる
  const preview = useMemo(() => {
    if (!engine || !type) return '';
    try {
      const r = importManual(buildManualFields(typeId, values));
      if (!r.ok || !r.reference) return '';
      const html = engine.renderOne(normalizeAll([r.reference.csl])[0], DEFAULT_STYLE_ID);
      return html.replace(/<[^>]+>/g, '');
    } catch {
      return '';
    }
  }, [engine, typeId, values, type]);

  function pickType(id: string) {
    setTypeId(id);
    // 検索から引き継いだ値があれば入れておく
    setValues({
      title: defaultTitle ?? '',
      authors: defaultAuthor ?? '',
    });
    setMsg(null);
  }

  async function submit() {
    const missing = missingRequired(typeId, values);
    if (missing.length) {
      setMsg({ text: `${missing.join('、')}を入力してください`, kind: 'err' });
      return;
    }
    const r = importManual(buildManualFields(typeId, values));
    if (!r.ok || !r.reference) {
      setMsg({ text: r.error ?? '登録できませんでした', kind: 'err' });
      return;
    }
    await getRepo().saveReference({ ...r.reference, projectIds: [projectId] });
    setValues({});
    setTypeId('');
    setMsg({ text: '登録しました', kind: 'ok' });
    onDone();
  }

  // ---- 種別の選択 ----
  if (!type) {
    return (
      <>
        <Hint>まず、登録する文献の種類を選んでください。</Hint>
        <div style={{ marginTop: '.6rem' }}>
          {refTypesOf().map((t: RefTypeDef) => (
            <button key={t.id} className="ghost"
                    onClick={() => pickType(t.id)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      marginBottom: '.4rem', padding: '.6rem .8rem',
                    }}>
              <span style={{ fontWeight: 600 }}>{t.label}</span>
              <span className="hint" style={{ margin: 0, marginLeft: '.6rem' }}>
                {t.desc}
              </span>
            </button>
          ))}
        </div>
        {msg && <Message kind={msg.kind}>{msg.text}</Message>}
      </>
    );
  }

  // ---- 選んだ種別の入力欄 ----
  return (
    <>
      <div className="row" style={{ marginTop: '.6rem' }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontWeight: 600 }}>{type.label}</span>
          <span className="hint" style={{ margin: 0, marginLeft: '.6rem' }}>
            {type.section}
          </span>
        </div>
        <button className="ghost sm" onClick={() => { setTypeId(''); setValues({}); }}>
          種類を選び直す
        </button>
      </div>

      <div className="preview" style={{ marginTop: '.5rem' }}>
        <span className="hint" style={{ margin: 0, display: 'block' }}>この種類の書式</span>
        {type.format}
      </div>

      {type.note && <Message kind="warn">{type.note}</Message>}

      {type.fields.map((f: Field, i: number) => (
        <FieldInput key={`${f.key}-${i}`} field={f}
                    value={values[f.key] ?? ''}
                    onChange={(v) => setValues({ ...values, [f.key]: v })} />
      ))}

      {preview && (
        <>
          <label>出力される引用文</label>
          <div className="preview">{preview}</div>
        </>
      )}

      <div className="row" style={{ marginTop: '1rem' }}>
        <button onClick={submit}>この内容で登録</button>
      </div>
      {msg && <Message kind={msg.kind}>{msg.text}</Message>}
    </>
  );
}

function FieldInput({ field, value, onChange }: {
  field: Field; value: string; onChange: (v: string) => void;
}) {
  const label = (
    <label>
      {field.label}
      {field.required && <span className="req"> *</span>}
    </label>
  );
  const style = field.width === 'short' ? { maxWidth: '14rem' } : undefined;

  return (
    <div>
      {label}
      {field.type === 'lines' ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)}
                  placeholder={field.placeholder} style={{ minHeight: '3.2em' }} />
      ) : field.type === 'select' ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={style}>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : field.type === 'date' ? (
        <input type="date" value={value} onChange={(e) => onChange(e.target.value)}
               style={style} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)}
               placeholder={field.placeholder} style={style} />
      )}
      {field.hint && <Hint>{field.hint}</Hint>}
    </div>
  );
}
