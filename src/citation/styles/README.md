# 引用方式の追加手順

1 つの方式に必要なものは 1 ディレクトリに収めてある。追加のとき
アプリ側（`app/` `components/` `lib/`）を触る必要はない。

## 構成

```
styles/
  types.js        パッケージの取り決め（JSDoc 型のみ）
  index.js        登録簿。← 追加のとき触るのはここだけ
  apu/
    style.csl     書式（CSL）
    intext.js     本文中の引用の型
    reftypes.js   文献種別と入力欄
    index.js      上をまとめた定義
```

## 手順

**1. `apu/` を複製する。**

```sh
cp -r src/citation/styles/apu src/citation/styles/<id>
```

**2. 中身を差し替える。**

| ファイル | 直すもの |
|---|---|
| `style.csl` | 引用文献一覧と出典表記の書式 |
| `intext.js` | 本文中の引用の型（地の文との組み方） |
| `reftypes.js` | 手入力の種別と入力欄、CSL-JSON への組み立て |
| `index.js` | `id` / `label` / `asset` / `layout` / `sort` |

`layout` と `sort` は CSL では表せない規定を持つ。

| 値 | 意味 |
|---|---|
| `hangingIndent` | 一覧の 2 行目以降の下げ幅（全角字数） |
| `blockQuoteIndent` | ブロック引用の下げ幅（全角字数） |
| `longQuoteChars` | ブロック引用へ切り替える文字数の目安 |
| `sort.defaultOrder` | `ja-first` / `en-first` |

**3. 登録簿へ足す。**

```js
import foo from './foo/index.js';
export const STYLES = [apu, foo];
```

これだけで、CSL の配信・Service Worker の先読み・画面のスタイル選択
（2 種以上で表示）が追随する。

**4. 確認する。**

```sh
npm test && npx next build
```

## 注意

- **`id` は後から変えない。** 保存済みのプロジェクトが参照している。
  提供をやめた方式の `id` を指すデータは `styleOf` が既定へ倒すので、
  画面は落ちないが引用形式は変わる。
- **CSL は改行を出力できない。** URL 直前の改行などは目印（U+000B）を
  CSL に置き、出力層（`export.js` / `engine.js`）が変換する。
- **山括弧は全角（＜＞）を使う。** 半角だと HTML のタグと紛れる。
- `layout` の数値をアプリ側に直書きしないこと。方式ごとに違う。
