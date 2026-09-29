/**
 * Static dev server for the TimetableFlow browser UI (no dependencies).
 *
 *   node scripts/serve-ui.js [--port 4173]
 *
 * Routes (project root is the document root so the browser can import the very
 * same ES modules the tests use — no bundler, no duplicated engine):
 *   /                          -> public/index.html
 *   /public/**                 -> public assets
 *   /src/**                    -> engine + UI modules (ESM)
 *   /public/vendor/exceljs.min.js -> ExcelJS browser bundle (classic script, committed)
 *   /sw.js                     -> public/sw.js (service worker, scope "/")
 */

import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

function resolveRoute(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  if (clean === '/' || clean === '/index.html') return path.join(ROOT, 'public', 'index.html');
  if (clean === '/public/vendor/exceljs.min.js') return path.join(ROOT, 'public', 'vendor', 'exceljs.min.js');
  // a service worker must be served from the scope root to control the app
  if (clean === '/sw.js') return path.join(ROOT, 'public', 'sw.js');

  const allowed = ['/public/', '/src/'];
  if (!allowed.some((prefix) => clean.startsWith(prefix))) return null;

  const target = path.normalize(path.join(ROOT, clean));
  if (!target.startsWith(ROOT + path.sep)) return null; // no path traversal
  return target;
}

function serve(req, res) {
  const target = resolveRoute(req.url ?? '/');
  if (!target) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  let stats;
  try {
    stats = statSync(target);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  if (stats.isDirectory()) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  const type = MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': stats.size,
    // no-cache: always revalidated (fresh code while developing) but still
    // storable by the service worker for offline use
    'Cache-Control': 'no-cache',
  });
  createReadStream(target).pipe(res);
}

function parsePort(argv) {
  const index = argv.indexOf('--port');
  if (index !== -1 && argv[index + 1]) return Number(argv[index + 1]);
  if (process.env.PORT) return Number(process.env.PORT);
  return 4173;
}

const port = parsePort(process.argv.slice(2));
const server = http.createServer(serve);
server.listen(port, () => {
  console.log(`TimetableFlow UI  ->  http://localhost:${port}/`);
  console.log('(Ctrl+C to stop)');
});
