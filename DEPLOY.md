# Netlify への公開手順

静的サイトとして配信する。サーバ側の処理は無く、データは各利用者の
端末（IndexedDB）にのみ保存される。

---

## 方法A: ドラッグ&ドロップ（最短・お試し向き）

ビルド済みの `out/` フォルダを置くだけで公開できる。

1. `npm run build` を実行する（`out/` ができる）
2. https://app.netlify.com/drop を開く
3. **`out/` フォルダごと**ドラッグ&ドロップする

数十秒で `https://<ランダム名>.netlify.app` が発行される。

> **注意.** この方法では `netlify.toml` が読まれないため、
> セキュリティヘッダとキャッシュ制御が効かない。
> 試用はできるが、**学生に配るなら方法B**にすること。
> 理由は下の「なぜ方法Bが必要か」を参照。

---

## 方法B: Git 連携（推奨・継続運用向き）

修正を push するたびに自動で再公開される。`netlify.toml` も反映される。

### 1. リポジトリを作る

```sh
cd /Users/nomadonoikechan/Projects/refcite
git init
git add -A
git commit -m "refcite: 初回公開"
```

GitHub に空のリポジトリを作り（**Private で可**）、

```sh
git remote add origin https://github.com/<あなた>/refcite.git
git branch -M main
git push -u origin main
```

### 2. Netlify に繋ぐ

1. https://app.netlify.com → **Add new site → Import an existing project**
2. GitHub を選び、`refcite` を選ぶ
3. ビルド設定は `netlify.toml` から自動で読まれる。
   画面に出る値が下と一致していることだけ確認する。

   | 項目 | 値 |
   |---|---|
   | Build command | `npm run build` |
   | Publish directory | `out` |

4. **Deploy** を押す

以後、`git push` するたびに自動で再公開される。

### 3. 公開名を決める

**Site configuration → Change site name** で
`refcite-apu` のような名前にすると
`https://refcite-apu.netlify.app` になる。学生に伝えるのはこの URL。

---

## なぜ方法Bが必要か

`netlify.toml` に以下を入れてある。方法Aでは**いずれも効かない**。

| 設定 | 効かないと何が起きるか |
|---|---|
| `/sw.js` を無キャッシュ | 引用書式を直しても、**一度開いた端末は古い書式を使い続ける**。学生は気づかないまま誤った文献リストを提出しうる |
| `/csl/*` を無キャッシュ | 同上 |
| CSP | 万一スクリプトが混入した場合に、書誌データを外部へ送信できてしまう |
| `Permissions-Policy` | カメラ以外の権限が開いたままになる |

`connect-src` は NDL・Crossref・Open Library の3つだけを許可している。
**取込先 API を増やすときは `netlify.toml` の `connect-src` にも足すこと。**
忘れると、その API だけ無言で失敗する（ブラウザのコンソールにのみ出る）。

---

## 公開後に確認すること

HTTPS でしか動かない機能があるため、**公開後に実機で確認する**。
特に iPhone は Safari が `BarcodeDetector` 非対応で、
ZXing フォールバックが実質の本線になる。

- [ ] iPhone でバーコード読取（カメラ許可 → ISBN 読取）
- [ ] Android でバーコード読取
- [ ] 引用文献リストを Word に貼り、**2行目が全角4字下がる**こと
- [ ] URL が `＜…＞`（全角）で、アクセス日の後に改行されること
- [ ] 機内モードで開き、オフラインでも起動すること（PWA）
- [ ] ホーム画面に追加できること

## 更新のしかた

```sh
npm test          # 175件。通ってから push する
git add -A
git commit -m "修正内容"
git push
```

引用書式（CSL）を直したときは、`public/sw.js` の `VERSION` を
必ず上げること。上げ忘れると既存の端末に修正が届かない。

## 注意

- `out/` `public/csl/` `node_modules/` は `.gitignore` 済み。
  `public/csl/` はビルドで生成されるので、コミットしない。
- 現在の想定利用者は **APU 内の学生のみ**。
  学外へ広げるときは、NDL・Crossref の利用規約とアクセス頻度を確認すること。
