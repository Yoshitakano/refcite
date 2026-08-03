/**
 * 開発用サーバ。
 *
 * カメラ（バーコード読取）は HTTPS でしか起動しないため、
 * 自己署名証明書で HTTPS を立てる。スマホから LAN 経由で試すときは
 * 証明書の警告を「詳細 → このサイトを閲覧」で通す必要がある。
 *
 *   node serve.mjs          → https://localhost:8443
 *   node serve.mjs --http   → http://localhost:8910（カメラは使えない）
 */

import { createServer as createHttps } from 'https';
import { createServer as createHttp } from 'http';
import { readFile } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import { extname, join, normalize } from 'path';
import { networkInterfaces } from 'os';

// 既定は Next.js の静的書き出し（out/）。
// レガシー版を見たいときは --legacy を付ける。
const useLegacy = process.argv.includes('--legacy');
const PROJECT = new URL('.', import.meta.url).pathname;
const ROOT = new URL(useLegacy ? '.' : './out/', import.meta.url).pathname;
const useHttp = process.argv.includes('--http');
const PORT = useHttp ? 8910 : 8443;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.csl': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

async function handler(req, res) {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    // 静的書き出しは /write/ のようなディレクトリ形式なので index.html を補う
    if (useLegacy && path === '/') path = '/legacy/index.html';
    if (!useLegacy && path.endsWith('/')) path += 'index.html';
    // ルート外への参照を防ぐ
    const full = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ''));
    if (!full.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }

    const body = await readFile(full);
    res.writeHead(200, {
      'Content-Type': MIME[extname(full)] ?? 'application/octet-stream',
      // 開発中は常に最新を読ませる
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
}

function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const n of list ?? []) {
      if (n.family === 'IPv4' && !n.internal) return n.address;
    }
  }
  return 'localhost';
}

let server;
if (useHttp) {
  server = createHttp(handler);
} else {
  const key = join(PROJECT, '.certs/key.pem');
  const cert = join(PROJECT, '.certs/cert.pem');
  if (!existsSync(key) || !existsSync(cert)) {
    console.error('証明書がありません。次を実行してください:\n' +
      '  mkdir -p .certs && openssl req -x509 -newkey rsa:2048 ' +
      '-keyout .certs/key.pem -out .certs/cert.pem -days 365 -nodes -subj "/CN=localhost"');
    process.exit(1);
  }
  server = createHttps({ key: readFileSync(key), cert: readFileSync(cert) }, handler);
}

server.listen(PORT, '0.0.0.0', () => {
  const scheme = useHttp ? 'http' : 'https';
  const path = useLegacy ? '/legacy/index.html' : '/';
  console.log(`  ${scheme}://localhost:${PORT}${path}`);
  if (!useHttp) {
    console.log(`  ${scheme}://${lanAddress()}:${PORT}${path}  （スマホから）`);
    console.log('\n  自己署名証明書のため警告が出ます。「詳細」→「このサイトを閲覧」で進んでください。');
  }
});
