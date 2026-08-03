/**
 * バーコード値の判定（仕様 3.1-1）
 *
 * カメラ制御は DOM に依存するため app/scanner.js に置くが、
 * 値の判定はここに切り出してテスト可能にする。誤判定は
 * 「無関係な本が登録される」形で表面化し、気づきにくい。
 */

/**
 * ISBN として妥当なバーコードか。
 * 書籍の EAN-13 は 978 / 979 で始まる。
 */
export function isIsbnBarcode(text) {
  const s = String(text ?? '').replace(/[^0-9X]/gi, '');
  return /^97[89]\d{10}$/.test(s);
}

/**
 * 日本の書籍にある 2 段バーコードの下段（価格コード）か。
 *
 * 上段が ISBN、下段が価格・分類を表す 192 始まりの EAN-13。
 * 下段を読んでしまうと ISBN として無効な数字が入るため、
 * 「上段を写してください」と促す必要がある。
 */
export function isPriceBarcode(text) {
  return /^192\d{10}$/.test(String(text ?? '').replace(/\D/g, ''));
}

/**
 * 読み取り値を分類する。
 * @returns {'isbn'|'price'|'unknown'}
 */
export function classifyBarcode(text) {
  if (isIsbnBarcode(text)) return 'isbn';
  if (isPriceBarcode(text)) return 'price';
  return 'unknown';
}

/** 読み取り値から ISBN を取り出す（ハイフン等を除去） */
export function barcodeToIsbn(text) {
  return isIsbnBarcode(text)
    ? String(text).replace(/[^0-9X]/gi, '')
    : null;
}
