/**
 * Generates the PWA icons (no dependencies, no image tooling required).
 *
 *   node scripts/generate-icons.js
 *
 * The same artwork is rendered large and box-downsampled, so the edges stay
 * clean at every size. Outputs:
 *   public/icons/icon-192.png        (PWA install)
 *   public/icons/icon-512.png        (PWA install / maskable)
 *   public/icons/apple-touch-icon.png (iOS home screen)
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'icons');

const BLUE = [0x25, 0x63, 0xeb, 255];
const BLUE_DARK = [0x1d, 0x4e, 0xd8, 255];
const WHITE = [0xff, 0xff, 0xff, 255];
const RED = [0xef, 0x44, 0x44, 255];
const GREY = [0xcb, 0xd5, 0xe1, 255];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- artwork, drawn in a 1x1 coordinate space -------------------------------

function makeCanvas(size) {
  return { size, data: new Uint8Array(size * size * 4) };
}

function blend(canvas, x, y, color) {
  if (x < 0 || y < 0 || x >= canvas.size || y >= canvas.size) return;
  const index = (y * canvas.size + x) * 4;
  canvas.data[index] = color[0];
  canvas.data[index + 1] = color[1];
  canvas.data[index + 2] = color[2];
  canvas.data[index + 3] = color[3];
}

function fillRect(canvas, x0, y0, w, h, color) {
  const startX = Math.round(x0 * canvas.size);
  const startY = Math.round(y0 * canvas.size);
  const endX = Math.round((x0 + w) * canvas.size);
  const endY = Math.round((y0 + h) * canvas.size);
  for (let y = startY; y < endY; y += 1) for (let x = startX; x < endX; x += 1) blend(canvas, x, y, color);
}

function fillRoundedRect(canvas, x0, y0, w, h, r, color) {
  const steps = canvas.size * 2;
  for (let py = 0; py < canvas.size; py += 1) {
    const y = (py + 0.5) / canvas.size;
    for (let px = 0; px < canvas.size; px += 1) {
      const x = (px + 0.5) / canvas.size;
      if (x < x0 || x > x0 + w || y < y0 || y > y0 + h) continue;
      const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
      const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
      const inside = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
      if (inside || (r === 0 && steps)) blend(canvas, px, py, color);
    }
  }
}

function drawMaster(size) {
  const canvas = makeCanvas(size);

  fillRect(canvas, 0, 0, 1, 1, BLUE); // full-bleed background (maskable safe)
  fillRoundedRect(canvas, 0.13, 0.2, 0.74, 0.66, 0.09, WHITE); // calendar card
  fillRect(canvas, 0.13, 0.2, 0.74, 0.17, RED); // header band
  fillRect(canvas, 0.13, 0.34, 0.74, 0.03, RED);

  // hangers
  fillRoundedRect(canvas, 0.3, 0.11, 0.05, 0.16, 0.025, WHITE);
  fillRoundedRect(canvas, 0.65, 0.11, 0.05, 0.16, 0.025, WHITE);

  // day cells
  const cols = [0.2, 0.4, 0.6];
  const rows = [0.44, 0.57, 0.7];
  for (const y of rows) for (const x of cols) fillRoundedRect(canvas, x, y, 0.13, 0.09, 0.025, GREY);
  fillRoundedRect(canvas, 0.6, 0.44, 0.13, 0.09, 0.025, BLUE_DARK); // "today"

  return canvas;
}

function downsample(canvas, target) {
  const scale = canvas.size / target;
  const out = new Uint8Array(target * target * 4);
  for (let y = 0; y < target; y += 1) {
    for (let x = 0; x < target; x += 1) {
      const sx = Math.floor(x * scale);
      const sy = Math.floor(y * scale);
      const index = (sy * canvas.size + sx) * 4;
      const outIndex = (y * target + x) * 4;
      out[outIndex] = canvas.data[index];
      out[outIndex + 1] = canvas.data[index + 1];
      out[outIndex + 2] = canvas.data[index + 2];
      out[outIndex + 3] = canvas.data[index + 3];
    }
  }
  return out;
}

const MASTER = drawMaster(2048);

const outputs = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
];

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, size] of outputs) {
  const png = encodePng(size, size, downsample(MASTER, size));
  writeFileSync(path.join(OUT_DIR, name), png);
  console.log(`wrote public/icons/${name} (${png.length} bytes)`);
}
