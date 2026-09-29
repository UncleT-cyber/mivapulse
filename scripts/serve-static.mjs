/**
 * Static file server for the MivaPulse repository root (no dependencies).
 *
 *   node scripts/serve-static.mjs [--port 4174]
 *
 * This is the production-like server: it serves committed files exactly the
 * way the static host does — no TimetableFlow dev-server routes, no
 * node_modules fallbacks, no import rewriting. The Phase 9 browser
 * acceptance runs against this server to prove the integration works as a
 * plain static deployment (Vercel-style).
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
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function resolvePath(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const target = path.normalize(path.join(ROOT, clean));
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return { status: 403 }; // traversal
  // Production serves committed files only — never expose dependencies, VCS
  // internals or environment files, even on this local stand-in.
  const rel = path.relative(ROOT, target);
  const segments = rel.split(path.sep);
  if (segments.includes('node_modules') || rel.startsWith('.git/') || rel.startsWith('.env')) return { status: 404 };
  return { target };
}

const server = http.createServer((req, res) => {
  const resolved = resolvePath(req.url ?? '/');
  if (resolved.status) {
    res.writeHead(resolved.status, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(resolved.status === 403 ? 'Forbidden' : 'Not found');
    return;
  }
  const target = resolved.target;
  try {
    if (statSync(target).isDirectory()) target = path.join(target, 'index.html');
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  try {
    const stats = statSync(target);
    if (!stats.isFile()) throw new Error('not a file');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': stats.size,
      'Cache-Control': 'no-store',
    });
    createReadStream(target).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});

const port = Number(process.argv[2]?.replace(/^--port=/, '')) || 4174;
server.listen(port, () => {
  console.log(`MivaPulse static server: http://localhost:${port}/ (root: ${ROOT})`);
});
