'use client';

/**
 * バーコード読取ボタン（仕様 3.1-1）
 *
 * カメラ制御は scanner モジュールに委ね、ここは開閉と後始末だけを持つ。
 * scanner は BarcodeDetector / ZXing のどちらを使うか自動で選ぶ。
 */

import { useEffect, useRef, useState } from 'react';

export function BarcodeButton({ onDetect }: { onDetect: (isbn: string) => void }) {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<any>(null);

  // カメラが使える環境かを確かめてからボタンを出す
  useEffect(() => {
    import('@/lib/scanner').then(({ cameraAvailable }) => setAvailable(cameraAvailable()));
  }, []);

  const stop = () => {
    scannerRef.current?.stop();
    scannerRef.current = null;
    setOpen(false);
    setStatus('');
  };

  // 画面を離れるときにカメラを確実に解放する
  useEffect(() => () => { scannerRef.current?.stop(); }, []);

  async function start() {
    setOpen(true);
    const { BarcodeScanner } = await import('@/lib/scanner');
    // open による再描画で <video> が生成されるのを待つ
    await new Promise((r) => requestAnimationFrame(r));
    if (!videoRef.current) return;

    const s = new BarcodeScanner(videoRef.current, {
      onStatus: setStatus,
      onDetect: (isbn: string) => { stop(); onDetect(isbn); },
    });
    scannerRef.current = s;
    try {
      await s.start();
    } catch (e: any) {
      setStatus(e.message);
    }
  }

  if (!available) return null;

  return (
    <>
      <button className="ghost" onClick={start} disabled={open}>
        バーコードを読む
      </button>
      {open && (
        <div style={{ width: '100%' }}>
          <div className="scanner">
            <video ref={videoRef} muted playsInline />
            <div className="scan-frame" />
          </div>
          <div className="row" style={{ marginTop: '.5rem' }}>
            <span className="hint" style={{ margin: 0, flex: 1 }}>{status}</span>
            <button className="ghost sm" onClick={stop}>閉じる</button>
          </div>
        </div>
      )}
    </>
  );
}
