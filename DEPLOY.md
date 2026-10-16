# 公開手順（GitHub Pages）

静的サイトとして配信する。サーバ側の処理は無く、データは各利用者の
端末（IndexedDB）にのみ保存される。GitHub Pages が配るのは画面の
ファイルだけで、文献や抜き書きがそこへ送られることはない。

**リポジトリ: https://github.com/Yoshitakano/refcite**
**公開先: https://yoshitakano.github.io/refcite/**

> 以前は Netlify で配信していたが、使用をやめた。

---

# 第1部: GitHub Pages を有効にする（初回のみ・約2分）

ブラウザでの操作だけで済む。

1. https://github.com/Yoshitakano/refcite/settings/pages を開く
2. **「Build and deployment」→「Source」** を **「GitHub Actions」** にする
   （「Deploy from a branch」ではない）
3. 保存ボタンは無い。選んだ時点で反映される

これで、main ブランチに push するたびに自動で公開される
（`.github/workflows/pages.yml`）。

初回の公開を走らせるには、main に push するか、
**Actions タブ →「Pages」→「Run workflow」** を押す。
2〜3分で上の公開先が開けるようになる。

> テスト（`npm test`）が落ちると公開されない。壊れた書式や保存処理を
> 配信しないための歯止め。Actions タブで赤くなっていたらログを見る。

---

# 第2部: Android にアプリとして入れる

1. Android の **Chrome** で https://yoshitakano.github.io/refcite/ を開く
2. 右上の **︙ メニュー →「アプリをインストール」**
   （出ないときは「ホーム画面に追加」→「インストール」）
3. ホーム画面に refcite のアイコンができる。以後はそこから開く

ブラウザのバーが無い、普通のアプリと同じ見た目で起動する。

- **一度開けば、機内モードでも起動する。** 書架・抜き書き・引用リストの
  作成はオフラインで使える。書誌の検索（NDL など）だけはネット接続が要る
- **データはこのスマホの中だけにある。** アプリを削除する・Chrome の
  サイトデータを消すと一緒に消える。機種変更や故障に備えて、ときどき
  書架の「バックアップ → 書き出す（JSON）」で控えを取っておく

## 公開後の確認

- [ ] Android で開ける
- [ ] アプリとしてインストールできる（アイコンが緑の本の絵になる）
- [ ] **バーコード読取**（カメラ許可 → 本の ISBN バーコードを読む）
- [ ] 機内モードにしても起動し、書架の引用プレビューが出る

うまくいかない項目があれば、**どの端末・どのブラウザか**を控えておくと
原因を特定しやすい。

---

# 第3部: 更新のしかた

コードを直して main に push すると、**自動で再公開**される。

```sh
npm test                      # 通ってから進む
git add -A
git commit -m "修正した内容を書く"
git push
```

push から**2〜3分**で反映される。インストール済みのアプリは、
次に開いたときに新しい版を取りに行く（反映は開き直した後）。

## 引用書式（CSL）を直したときの注意

`public/sw.js` の `VERSION` を**必ず上げる**こと。

```js
const VERSION = 'refcite-next-v5';   // → v6 にする
```

上げ忘れると、**一度アプリを開いた端末には修正が届かない**。
気づかないまま古い書式で提出することになる。

---

# 補足: 設定について

## リポジトリ名の下で動かす

GitHub Pages ではアプリが `/refcite/` の下に置かれる。ビルド時に
`NEXT_PUBLIC_BASE_PATH=/refcite` を渡しており（workflow が自動で設定）、
`lib/base.ts` がその値を持つ。

- `<Link>` や画面遷移は Next.js が自動で `/refcite` を付ける
- `fetch` や Service Worker の登録など、**自前で URL を組む箇所は
  `BASE_PATH` を付けること**。付け忘れると GitHub Pages でだけ 404 になる
- `public/sw.js` と `manifest.webmanifest` の中のパスは**相対**で書く

ローカル（`npm run dev` / `npm start`）では空なので、従来どおりルートで動く。
公開と同じ形で試したいときは:

```sh
NEXT_PUBLIC_BASE_PATH=/refcite npm run build
```

## セキュリティ設定

GitHub Pages は応答ヘッダを設定できないため、CSP は
`app/layout.tsx` の `<meta>` で指定している（本番ビルドのみ）。

`connect-src` は NDL・Crossref・Open Library の3つだけを許可している。
**取込先 API を増やすときは `app/layout.tsx` の `CSP` にも足すこと。**
忘れると、その API だけ無言で失敗する（ブラウザのコンソールにのみ出る）。

Netlify 時代にあった `frame-ancestors`（他サイトへの埋め込み禁止）と
`Permissions-Policy` は meta では指定できず、外れている。

## キャッシュ

GitHub Pages は全ファイルを 10 分キャッシュさせる。

- `sw.js` はブラウザが更新確認のたびにキャッシュを迂回するので問題ない
- 引用書式（`/csl/`）は、修正の公開後**最大 10 分**は古い版が返りうる

## 現在の想定利用者

**APU 内の学生のみ**。学外へ広げるときは、NDL・Crossref の
利用規約とアクセス頻度を確認すること。

## ローカルで動かす

```sh
npm run dev     # 開発サーバ
npm start       # ビルドして HTTPS で配信（バーコード確認用）
```
