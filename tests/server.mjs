import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.cwd(), 'src');
const port = Number(process.env.PORT || 8123);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  let filePath = join(root, decodeURIComponent(url.pathname));
  if (url.pathname === '/' || url.pathname === '') filePath = join(root, 'newtab.html');
  const normalized = normalize(filePath);
  if (!normalized.startsWith(root)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (!existsSync(normalized) || statSync(normalized).isDirectory()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
    return;
  }
  res.writeHead(200, {
    'content-type': MIME[extname(normalized).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(normalized).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[serein] serving ${root} at http://127.0.0.1:${port}/newtab.html`);
});
