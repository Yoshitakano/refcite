'use client';

/**
 * 使い方ページ
 *
 * 初めて使う学生が、文献を貯めるところから Word へ貼るところまで
 * 迷わず辿れるようにする。読み物ではなく作業の手引きなので、
 * 画面のボタン名をそのまま出し、どこを押すかが分かる書き方にしてある。
 *
 * 引用の出力例は文字列で持たず、引用エンジンに実際に作らせている。
 * 直書きすると書式を直したときに例だけ古くなり、
 * 「説明と実物が違う」という最もたちの悪い状態になる。
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useEngine } from '@/lib/hooks';
import { DEFAULT_STYLE_ID } from '@/lib/citation';
import { normalizeAll, htmlToPlain, intextPatterns, buildInText } from '@lib/citation/index.js';
import { refTypesOf } from '@lib/citation/reftypes.js';

/** 説明用の見本文献（訳書。原著者名・訳者の出方も同時に示せる） */
const SAMPLE_BOOK = {
  id: 'sample-book',
  type: 'book',
  language: 'ja',
  title: '信頼 : 社会的な複雑性の縮減メカニズム',
  author: [{ family: 'ルーマン', given: 'N.' }],
  translator: [{ family: '大庭', given: '健' }, { family: '正村', given: '俊之' }],
  issued: { 'date-parts': [[1990]] },
  publisher: '勁草書房',
};

const SAMPLE_NEWS = {
  id: 'sample-news',
  type: 'article-newspaper',
  language: 'ja',
  title: '地方創生、次の一手は',
  author: [{ family: '岡本', given: '淳' }],
  issued: { 'date-parts': [[2022, 8, 2]] },
  'container-title': '読売新聞',
  URL: 'https://www.example.co.jp/article',
  accessed: { 'date-parts': [[2023, 1, 15]] },
};

export default function HelpPage() {
  const { engine } = useEngine();

  // 出力例は実際に引用エンジンへ通す。説明と実物がずれないようにする
  const examples = useMemo(() => {
    if (!engine) return null;
    try {
      const items = normalizeAll([SAMPLE_BOOK, SAMPLE_NEWS]);
      const { entries } = engine.renderBibliography(items, DEFAULT_STYLE_ID,
        { preserveOrder: true });
      const cite = engine.renderCitation(
        normalizeAll([SAMPLE_BOOK]), [{ id: SAMPLE_BOOK.id, locator: '40' }],
        DEFAULT_STYLE_ID);

      const body = '信頼は不確定性を反省し、希望は不確定性を消去するのである';
      const intext = intextPatterns(DEFAULT_STYLE_ID)
        .filter((p: { id: string }) => p.id !== 'block')
        .map((p: { id: string; label: string }) => ({
          label: p.label,
          text: buildInText({
            patternId: p.id, body, citation: cite, styleId: DEFAULT_STYLE_ID,
          }).text,
        }));

      return {
        book: htmlToPlain(entries[0]),
        news: htmlToPlain(entries[1]),
        intext,
      };
    } catch {
      return null;
    }
  }, [engine]);

  const types = refTypesOf(DEFAULT_STYLE_ID);

  return (
    <>
      <section>
        <h2>使い方</h2>
        <p className="lead">
          読んだ本を書架に貯めておき、レポートを書くときに
          APU ライティング・マニュアルどおりの引用文献リストを取り出します。
        </p>
        <Hint2>
          画面は「書架」と「執筆」の2つだけです。この違いが分かれば迷いません。
        </Hint2>

        <div className="duo">
          <div className="mini">
            <h3>書架</h3>
            <p>
              読んだ本を貯める場所。文献を取り込み、引用したい箇所を書き写します。
              レポートを書く前の、日々の読書で使います。
            </p>
          </div>
          <div className="mini">
            <h3>執筆</h3>
            <p>
              レポートを書くときに開く場所。使う文献を選び、
              本文に貼る引用と、末尾の文献リストを取り出します。
            </p>
          </div>
        </div>
      </section>

      <Step n={1} title="レポートごとの入れ物を作る">
        <p>
          画面上部のプロジェクト欄で、レポートごとに入れ物を作ります。
          <b>「2026年前期_社会学レポート」</b>のように、
          後から見て分かる名前にしてください。
        </p>
        <p>
          入れ物を分けておくと、レポートごとに文献リストが独立します。
          同じ本を複数のレポートで使うこともできます。
        </p>
      </Step>

      <Step n={2} title="文献を取り込む" where="書架">
        <p>方法は3つあります。上から順に試すのが確実です。</p>

        <h3>A. 著者名・タイトルで探す（ふだんはこれ）</h3>
        <p>
          <Ui>タイトル</Ui> と <Ui>著者名</Ui> に、分かるほうだけ入れて
          <Ui>さがす</Ui> を押します。<b>両方埋める必要はありません。</b>
          和書は国立国会図書館、洋書は Open Library から探します。
        </p>
        <p>
          候補から選ぶと書架に入ります。出版社や出版年も自動で入るので、
          入力し直す必要はありません。
        </p>

        <h3>B. ISBN・DOI を入れる（本が手元にある／論文を見ている）</h3>
        <p>
          本の裏表紙の数字（ISBN）か、論文の DOI を入れて <Ui>取り込む</Ui> を押します。
          <b>スマートフォンならカメラでバーコードを読み取れます。</b>
          確実なので、本が手元にあるならこちらが早いです。
        </p>
        <Warn>
          日本の本は2段バーコードです。<b>上段が ISBN</b> で、
          下段（価格）を読んでも認識しません。
        </Warn>

        <h3>C. 手で入力する（見つからないとき）</h3>
        <p>
          <Ui>検索で見つからない場合は手入力で登録</Ui> を開きます。
          <b>最初に文献の種類を選ぶと、その種類に必要な項目だけが出ます。</b>
          入力しながら下に完成形が表示されるので、書式をその場で確認できます。
        </p>
        <div className="chips">
          {types.map((t: { id: string; label: string }) => (
            <span className="chip" key={t.id}>{t.label}</span>
          ))}
        </div>
      </Step>

      <Step n={3} title="引用したい箇所を書き写す" where="書架 → 文献を開く">
        <p>
          文献の <Ui>開く（抜き書き・メモ）</Ui> を押すと詳細ページに移ります。
          ここには2種類の記録ができます。
        </p>

        <div className="duo">
          <div className="mini">
            <h3>抜き書き（直接引用）</h3>
            <p>
              原文を<b>一字一句変えずに</b>書き写します。ページ数は必須です。
              カギカッコで囲んで引用するときに使います。
            </p>
          </div>
          <div className="mini">
            <h3>所感メモ</h3>
            <p>
              自分の言葉での要約・考察・疑問。ページ数は任意です。
              構想を練るときのための記録です。
            </p>
          </div>
        </div>

        <p>
          抜き書きには <Ui>この引用へのコメント</Ui> を添えられます。
          「なぜ引いたか」「どう使うか」を書いておくと、
          数週間後に自分の意図を思い出せます。
        </p>
        <Warn>
          直接引用にはページ番号が必要です（マニュアル 2.1）。
          後から本を探し直すのは大変なので、書き写すときに一緒に入れてください。
        </Warn>

        <h3>抜き書きを並べ替える</h3>
        <p>
          抜き書きが2件以上あると <Ui>並べ替え</Ui> が出ます。
          読み返すときは<b>登録順</b>、本文を頭から追うときは<b>ページ順</b>が
          便利です。コメントを付けた順にも並べられます。
        </p>
        <p>
          ページ数のない抜き書きは、並べ替えても<b>常に最後</b>にまとまります。
        </p>

        <h3>溜めた抜き書きをまとめて出す</h3>
        <p>
          抜き書きの一覧の下に <Ui>すべて直接引用の形で書き出す</Ui> があります。
          その文献の抜き書きを<b>すべて「〜〜」（著者, 年, p.数）の形に揃えて</b>
          まとめてコピーできます。1件ずつ拾うより、
          下書きへ流し込んでから削るほうが早いです。
        </p>
        <p>
          <Ui>自分のコメントも添える</Ui> にチェックを入れると、
          引用の下に［メモ］として自分の言葉が付きます。
          <b>引用と自分の言葉は色を分けてあります。</b>
          混ざったまま本文に転記すると剽窃になりかねないためです。
        </p>
        <Warn>
          ページ数のない抜き書きは書き出しに<b>含まれません</b>。
          件数が知らされるので、必要なら書き足してください。
        </Warn>
      </Step>

      <Step n={4} title="本文に貼る引用を作る" where="執筆">
        <p>
          抜き書きから、本文にそのまま貼れる形を作ります。
          型を選ぶと下のような文が組み上がるので、コピーして貼るだけです。
          著者名・年・ページの書き方や、同じ著者の同年の文献に付く a / b の区別は
          自動で処理されます。
        </p>

        {examples ? (
          <div className="exs">
            {examples.intext.map((e: { label: string; text: string }) => (
              <div className="ex" key={e.label}>
                <div className="ex-cap">{e.label}</div>
                <div className="ex-body">{e.text}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">例を読み込んでいます…</div>
        )}

        <p>
          <b>長い引用（4〜5行以上）は自動でブロック引用になります。</b>
          カギカッコを使わず2字下げる形式です（マニュアル 2.2）。
          書式が付いたままコピーされるので、Word に貼れば下げ幅も再現されます。
        </p>
      </Step>

      <Step n={5} title="引用文献リストを出す" where="執筆">
        <p>
          <Ui>文献をさがす</Ui> で書架から検索し、このレポートで使う文献に
          チェックを入れます。<b>抜き書きやメモの中身も検索対象</b>なので、
          「あの引用、どの本だったか」からでも辿れます。
        </p>
        <p>
          <Ui>引用文献リスト</Ui> に完成形が出ます。
          和文は50音順、欧文はアルファベット順に自動で並びます。
        </p>

        {examples && (
          <div className="exs">
            <div className="ex">
              <div className="ex-cap">書籍</div>
              <div className="ex-body mono">{examples.book}</div>
            </div>
            <div className="ex">
              <div className="ex-cap">新聞記事（オンライン）　2行目は全角4字下げ</div>
              <div className="ex-body mono pre">{examples.news}</div>
            </div>
          </div>
        )}

        <p>
          <b><Ui>リッチテキストでコピー</Ui> を使ってください。</b>
          2行目以降の字下げが保たれます。
          <Ui>プレーンテキスト</Ui> は書式が付きません。
        </p>
        <Warn>
          読み仮名がない文献があると注意が出ます。漢字の並び順は50音順と
          一致しないため、読み仮名がないと正しく並びません。手入力で補ってください。
        </Warn>
      </Step>

      <section>
        <h2>困ったとき</h2>
        <div className="qa">
          {TROUBLES.map((t) => (
            <div className="qa-row" key={t.q}>
              <div className="qa-q">{t.q}</div>
              <div className="qa-a">{t.a}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>覚えておきたいこと</h2>
        <ul className="pts">
          <li>
            引用文献リストは<b>提出前に必ず自分の目で確認</b>してください。
            取り込んだデータが不完全なことがあります。
          </li>
          <li>
            Wikipedia など執筆者が特定できないサイトは、
            学術的な引用文献として原則不適切です。
          </li>
          <li>ページ数のない直接引用は、引用として成立しません。</li>
          <li>
            データはこの端末の中だけに保存されます。別の端末では空です。
            書架の <Ui>書き出す（JSON）</Ui> でファイルとして保存できます。
          </li>
        </ul>
        <div className="row" style={{ marginTop: '1rem' }}>
          <Link href="/"><button>書架をひらく</button></Link>
          <Link href="/write"><button className="ghost">執筆をひらく</button></Link>
        </div>
      </section>
    </>
  );
}

const TROUBLES = [
  {
    q: '検索しても出てこない',
    a: 'タイトルを短くする（副題を省く）、著者名を姓だけにする。それでも出なければ手入力で登録してください。',
  },
  {
    q: '「応答がありません」と出る',
    a: '図書館のデータベースが混雑しています。時間をおくか、手入力で登録してください。文献が存在しないという意味ではありません。',
  },
  {
    q: 'バーコードが読めない',
    a: '上段（ISBN）を写しているか確認してください。明るい場所で、バーコード全体が画面に入るようにします。',
  },
  {
    q: '著者と訳者が混ざっている',
    a: '文献詳細の「書誌を編集」から直せます。訳者名の欄も編集できます。',
  },
  {
    q: 'どうしても書式が合わない',
    a: '「書誌を編集」の最終形の欄に、完成した引用文をそのまま書けます。その文献だけ手書きの形が使われます。',
  },
  {
    q: 'Word に貼ると字下げが崩れる',
    a: '「リッチテキストでコピー」を使っているか確認してください。',
  },
  {
    q: '別の端末で開いたら空だった',
    a: '仕様です。データは端末ごとに保存されます。「書き出す（JSON）」で移せます。',
  },
];

/** 手順のまとまり。番号と、どの画面での作業かを示す */
function Step({ n, title, where, children }: {
  n: number; title: string; where?: string; children: React.ReactNode;
}) {
  return (
    <section className="step">
      <h2>
        <span className="step-n">{n}</span>
        {title}
        {where && <span className="step-where">{where}</span>}
      </h2>
      {children}
    </section>
  );
}

/** 画面上のボタン名・項目名 */
function Ui({ children }: { children: React.ReactNode }) {
  return <span className="uikey">{children}</span>;
}

function Warn({ children }: { children: React.ReactNode }) {
  return <div className="warnbox">{children}</div>;
}

function Hint2({ children }: { children: React.ReactNode }) {
  return <div className="hint">{children}</div>;
}
