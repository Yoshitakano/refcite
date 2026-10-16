import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Nav } from '@/components/Nav';
import { ServiceWorker } from '@/components/ServiceWorker';
import { BASE_PATH } from '@/lib/base';

export const metadata: Metadata = {
  title: 'refcite — 文献管理・引用リスト作成',
  description: '文献を貯め、抜き書きを残し、レポートの引用文献リストを作る',
  manifest: `${BASE_PATH}/manifest.webmanifest`,
  icons: { icon: `${BASE_PATH}/icon.svg`, apple: `${BASE_PATH}/icon-192.png` },
  appleWebApp: { capable: true, title: 'refcite' },
};

export const viewport: Viewport = {
  themeColor: '#2d6a4f',
  width: 'device-width',
  initialScale: 1,
};

/**
 * 書誌 API 以外への接続を禁じる。書誌データは利用者の端末にしか
 * 無いため、万一のスクリプト混入でも外部へ持ち出せないようにする。
 *
 * GitHub Pages は応答ヘッダを設定できないので meta で指定する。
 * meta では frame-ancestors が効かないが、それ以外は同じ効果がある。
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://ndlsearch.ndl.go.jp https://api.crossref.org https://openlibrary.org",
  "worker-src 'self' blob:",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      {/* 本番のみ。開発サーバは HMR に eval を使うため */}
      {process.env.NODE_ENV === 'production' && (
        <head>
          <meta httpEquiv="Content-Security-Policy" content={CSP} />
        </head>
      )}
      <body>
        <Nav />
        <main>{children}</main>
        <ServiceWorker />
      </body>
    </html>
  );
}
