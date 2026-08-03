# 公開手順

静的サイトとして配信する。サーバ側の処理は無く、データは各利用者の
端末（IndexedDB）にのみ保存される。

**リポジトリ: https://github.com/Yoshitakano/refcite** （公開済み・main ブランチ）

---

# 第1部: Netlify に繋ぐ（初回のみ・約5分）

GitHub への登録は完了している。あとは Netlify と繋ぐだけで公開される。
**ここから先はブラウザでの操作**で、コマンドは使わない。

## 手順1. Netlify にログインする

https://app.netlify.com を開く。

初めての場合は **「Sign up」→「GitHub」** を選ぶ。
GitHub アカウントでそのままログインでき、パスワードを新しく作る必要はない。

## 手順2. サイトを追加する

画面右上あたりの **「Add new site」** （または「Add new project」）を押し、
出てきたメニューから **「Import an existing project」** を選ぶ。

> 「Deploy manually」は選ばないこと。
> そちらは第1部の目的（自動更新と設定の反映）を満たさない。

## 手順3. GitHub を選ぶ

**「Deploy with GitHub」** を押す。

初回は GitHub の認可画面が出る。
**「Authorize Netlify」** を押して許可する。

> リポジトリの選択を求められたら、`refcite` を選ぶ。
> 「All repositories」でも「Only select repositories」でも構わない。
> 迷ったら後者を選び、`refcite` だけにチェックを入れる。

## 手順4. リポジトリを選ぶ

一覧から **`refcite`** を押す。

## 手順5. 設定を確認する

設定画面が出る。**`netlify.toml` から自動で読み込まれる**ので、
基本的に触る必要はない。下の2つが合っているかだけ確認する。

| 項目 | あるべき値 |
|---|---|
| Build command | `npm run build` |
| Publish directory | `out` |

違っていたら手で直す。合っていれば何もしない。

## 手順6. 公開する

**「Deploy refcite」**（または「Deploy site」）を押す。

ビルドが始まる。**2〜4分**かかる。
画面にログが流れるが、読まなくてよい。

**「Published」** と緑色で出たら成功。

## 手順7. URL を分かりやすくする

初期状態では `https://sparkling-pastry-a1b2c3.netlify.app` のような
ランダムな名前になっている。学生に伝えるには不便なので変える。

1. 上部メニューの **「Site configuration」** を開く
2. **「Site details」→「Change site name」** を押す
3. `refcite-apu` のように入力して保存

`https://refcite-apu.netlify.app` になる。
**この URL を学生に伝える。**

---

# 第2部: 公開後の確認（重要）

**HTTPS でしか動かない機能があるため、必ず実機で確認する。**
特に iPhone は Safari が `BarcodeDetector` に非対応で、
ZXing というフォールバック実装が実質の本線になる。
ここは開発環境では確かめられない。

## スマートフォンで

- [ ] iPhone で開ける
- [ ] **バーコード読取**（カメラ許可 → 本の ISBN バーコードを読む）
- [ ] Android で開ける
- [ ] Android でバーコード読取
- [ ] ホーム画面に追加できる（PWA）
- [ ] 機内モードにしても起動する（オフライン対応）

## パソコンで

- [ ] 文献を登録し、引用文献リストを **Word に貼り付ける**
- [ ] 2行目以降が**全角4字下がっている**
- [ ] URL が **`＜…＞`（全角）** で囲まれている
- [ ] URL が**アクセス日の後で改行**されている

うまくいかない項目があれば、**どの端末・どのブラウザか**を控えておくと
原因を特定しやすい。

---

# 第3部: 更新のしかた

コードを直したあと、以下を実行すると**自動で再公開**される。

```sh
cd /Users/nomadonoikechan/Projects/refcite
npm test                      # 175件。通ってから進む
git add -A
git commit -m "修正した内容を書く"
git push
```

`git push` から**2〜4分**で反映される。Netlify 側の操作は不要。

## 引用書式（CSL）を直したときの注意

`public/sw.js` の `VERSION` を**必ず上げる**こと。

```js
const VERSION = 'refcite-next-v3';   // → v4 にする
```

上げ忘れると、**一度アプリを開いた端末には修正が届かない**。
学生は気づかないまま古い書式で提出することになる。

---

# 補足: 設定について

`netlify.toml` に以下を入れてある。第1部の手順で自動的に反映される。

| 設定 | 無いと何が起きるか |
|---|---|
| `/sw.js` を無キャッシュ | 書式を直しても古い版が使われ続ける |
| `/csl/*` を無キャッシュ | 同上 |
| CSP | 万一スクリプトが混入した際、書誌データを外部へ送信できてしまう |
| `Permissions-Policy` | カメラ以外の権限が開いたままになる |

`connect-src` は NDL・Crossref・Open Library の3つだけを許可している。
**取込先 API を増やすときは `netlify.toml` の `connect-src` にも足すこと。**
忘れると、その API だけ無言で失敗する（ブラウザのコンソールにのみ出る）。

## 現在の想定利用者

**APU 内の学生のみ**。学外へ広げるときは、NDL・Crossref の
利用規約とアクセス頻度を確認すること。

## ローカルで動かす

```sh
npm run dev     # 開発サーバ
npm start       # ビルドして HTTPS で配信（バーコード確認用）
```
