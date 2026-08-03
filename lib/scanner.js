/**
 * ISBN バーコード読取（仕様 3.1-1）
 *
 * 二段構えにする理由:
 *   BarcodeDetector はブラウザ内蔵で高速・軽量だが iOS Safari が未対応。
 *   日本の学生の iPhone 比率を踏まえると、ZXing (WASM/JS) のフォールバックが
 *   実質の本線になる。ただし 440KB あるため、対応ブラウザでは読み込まない。
 *
 * カメラは HTTPS（または localhost）でしか起動しない。
 */

import { isIsbnBarcode, isPriceBarcode, barcodeToIsbn } from '@lib/import/barcode.js';

// ZXing は public/ から配信する（440KB あるため必要になるまで読み込まない）
const ZXING_SRC = '/vendor/zxing-browser.min.js';

/** カメラが使える環境か */
export function cameraAvailable() {
  return !!navigator.mediaDevices?.getUserMedia
    && (location.protocol === 'https:' || location.hostname === 'localhost'
        || location.hostname === '127.0.0.1');
}

/** ネイティブの BarcodeDetector が EAN-13 を扱えるか */
async function nativeDetector() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const formats = await window.BarcodeDetector.getSupportedFormats();
    if (!formats.includes('ean_13')) return null;
    return new window.BarcodeDetector({ formats: ['ean_13'] });
  } catch {
    return null;
  }
}

let zxingPromise = null;
/** ZXing を遅延ロードする（BarcodeDetector 非対応時のみ） */
function loadZxing() {
  if (window.ZXingBrowser) return Promise.resolve(window.ZXingBrowser);
  if (!zxingPromise) {
    zxingPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = ZXING_SRC;
      s.onload = () => resolve(window.ZXingBrowser);
      s.onerror = () => reject(new Error('バーコード読取ライブラリを読み込めませんでした'));
      document.head.appendChild(s);
    });
  }
  return zxingPromise;
}

/**
 * バーコードスキャナ。
 *
 * @param {HTMLVideoElement} video  プレビュー用の <video>
 * @param {Object} handlers
 * @param {(isbn:string)=>void} handlers.onDetect  ISBN を読み取ったとき
 * @param {(msg:string)=>void} [handlers.onStatus] 状態の通知
 */
export class BarcodeScanner {
  constructor(video, handlers = {}) {
    this.video = video;
    this.onDetect = handlers.onDetect ?? (() => {});
    this.onStatus = handlers.onStatus ?? (() => {});
    this.stream = null;
    this.running = false;
    this.controls = null;    // ZXing 側の停止ハンドル
    this.rafId = null;
    this.lastHit = 0;
  }

  async start() {
    if (this.running) return;
    if (!cameraAvailable()) {
      throw new Error(
        location.protocol === 'https:' || location.hostname === 'localhost'
          ? 'この端末ではカメラを利用できません'
          : 'カメラを使うには HTTPS でアクセスする必要があります'
      );
    }

    this.running = true;
    const detector = await nativeDetector();
    if (detector) {
      this.onStatus('カメラを起動しています…');
      await this.startNative(detector);
    } else {
      this.onStatus('読取ライブラリを準備しています…');
      await this.startZxing();
    }
  }

  /** BarcodeDetector 経路（Chrome / Android など） */
  async startNative(detector) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });
    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', '');   // iOS で全画面化させない
    await this.video.play();
    this.onStatus('バーコードを枠内に写してください');

    const tick = async () => {
      if (!this.running) return;
      try {
        const codes = await detector.detect(this.video);
        for (const c of codes) this.handleCode(c.rawValue);
      } catch {
        // 1フレームの失敗は無視して次へ
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  /** ZXing 経路（iOS Safari など） */
  async startZxing() {
    const ZX = await loadZxing();
    const reader = new ZX.BrowserMultiFormatReader();
    this.onStatus('バーコードを枠内に写してください');

    this.controls = await reader.decodeFromVideoDevice(
      undefined, this.video,
      (result) => { if (result) this.handleCode(result.getText()); }
    );
  }

  /**
   * 読み取った値を判定する。
   * 同じコードを連続で拾うため、一定時間の重複は無視する。
   */
  handleCode(raw) {
    const now = Date.now();
    if (now - this.lastHit < 1200) return;

    if (isPriceBarcode(raw)) {
      this.onStatus('価格のバーコードです。上段（978… で始まる方）を写してください');
      return;
    }
    if (!isIsbnBarcode(raw)) return;

    this.lastHit = now;
    this.onDetect(barcodeToIsbn(raw));
  }

  stop() {
    this.running = false;
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    try { this.controls?.stop(); } catch { /* 停止済み */ }
    this.controls = null;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.video) this.video.srcObject = null;
  }
}
