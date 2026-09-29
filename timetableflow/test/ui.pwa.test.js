/**
 * Phase 7 add-on — installability, offline shell and the PWA wiring.
 *
 * A phone is the main device students will use, so the app must be installable
 * (manifest + icons), openable offline (service worker) and the worker must be
 * served from the scope root — all of it enforced here rather than assumed.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFileSync(path.join(ROOT, relativePath), 'utf8');
const exists = (relativePath) => existsSync(path.join(ROOT, relativePath));

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngSize(relativePath) {
  const buffer = readFileSync(path.join(ROOT, relativePath));
  assert.ok(buffer.subarray(0, 8).equals(PNG_SIGNATURE), `${relativePath} is a real PNG`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('the manifest describes an installable standalone app', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));

  assert.ok(manifest.name.includes('TimetableFlow'));
  assert.ok(manifest.short_name.length > 0, 'home screens need a short name');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);

  assert.ok(manifest.icons.length >= 2, 'install needs 192px and 512px icons');
  const purposes = manifest.icons.map((icon) => icon.purpose ?? 'any');
  assert.ok(purposes.includes('any') && purposes.includes('maskable'), 'both normal and maskable icons');

  for (const icon of manifest.icons) {
    const relative = icon.src.replace(/^\//, '');
    assert.ok(exists(relative), `${icon.src} exists`);
    const { width, height } = pngSize(relative);
    const [declaredWidth, declaredHeight] = icon.sizes.split('x').map(Number);
    assert.equal(width, declaredWidth, `${icon.src} width matches its declaration`);
    assert.equal(height, declaredHeight, `${icon.src} height matches its declaration`);
  }
});

test('the page wires up the PWA bits', () => {
  const html = read('public/index.html');
  assert.ok(html.includes('rel="manifest" href="/public/manifest.webmanifest"'));
  assert.ok(html.includes('rel="apple-touch-icon" href="/public/icons/apple-touch-icon.png"'));
  assert.ok(html.includes('<meta name="theme-color"'));
  assert.ok(exists('public/icons/apple-touch-icon.png'));
  assert.equal(pngSize('public/icons/apple-touch-icon.png').width, 180);
});

test('the app registers a service worker from the scope root', () => {
  const glue = read('public/app.js');
  assert.ok(glue.includes("navigator.serviceWorker.register('/sw.js')"), 'registers /sw.js');
  assert.ok(glue.includes("'serviceWorker' in navigator"), 'guarded for older browsers');
  assert.ok(glue.includes('isSecureContext'), 'only registers on a secure context');
});

test('the service worker is browser-only and caches no user data', () => {
  const sw = read('public/sw.js');
  for (const forbidden of ['node:', 'Buffer.', 'process.', 'require(', 'fs.', 'localStorage', 'indexedDB']) {
    assert.ok(!sw.includes(forbidden), `service worker must not use ${forbidden}`);
  }
  assert.ok(sw.includes('caches.open'), 'caches the shell');
  assert.ok(sw.includes("request.method !== 'GET'"), 'only caches GET');
  assert.ok(sw.includes('self.location.origin'), 'never fetches cross-origin');
  assert.ok(!/xlsx|File\.|arrayBuffer/.test(sw), 'workbooks never travel through the cache');
});

test('every precached URL resolves to a file the server actually serves', () => {
  const sw = read('public/sw.js');
  const listMatch = sw.match(/const SHELL = \[([\s\S]*?)\];/);
  assert.ok(listMatch, 'the shell list is declared');
  const urls = [...listMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.ok(urls.length >= 5, 'the shell list is populated');

  // mirrors the routes in scripts/serve-ui.js
  const routes = {
    '/': 'public/index.html',
    '/public/vendor/exceljs.min.js': 'public/vendor/exceljs.min.js',
    '/sw.js': 'public/sw.js',
  };
  for (const url of urls) {
    const target = routes[url] ?? url.replace(/^\//, '');
    assert.ok(exists(target), `${url} -> ${target} exists`);
  }
  assert.ok(urls.includes('/public/vendor/exceljs.min.js'), 'the Excel bundle is available offline');
});

test('the dev server serves the worker, the manifest and the icons', () => {
  const server = read('scripts/serve-ui.js');
  assert.ok(server.includes("clean === '/sw.js'"), 'the worker is served from the scope root');
  assert.ok(server.includes('public'), 'public assets are served');
  assert.ok(server.includes('.webmanifest'), 'the manifest gets its own MIME type');
  assert.ok(server.includes('.png'), 'icons get image/png');
});
