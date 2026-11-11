// Generates the extension icons (public/icon/*.png) without external dependencies.
// Usage: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const GLYPHS = {
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
};
const TEXT = 'GIF';
const SS = 6; // supersampling factor

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function inRoundedRect(x, y, s, r) {
  const cx = Math.min(Math.max(x, r), s - r);
  const cy = Math.min(Math.max(y, r), s - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function render(size) {
  const units = TEXT.length * 5 + (TEXT.length - 1); // glyph grid width
  const unit = (size * 0.74) / units;
  const textW = units * unit;
  const textH = 7 * unit;
  const ox = (size - textW) / 2;
  const oy = (size - textH) / 2;
  const radius = size * 0.22;
  const out = Buffer.alloc(size * size * 4);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bg = 0, fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = px + (sx + 0.5) / SS;
          const y = py + (sy + 0.5) / SS;
          if (!inRoundedRect(x, y, size, radius)) continue;
          bg++;
          const gx = Math.floor((x - ox) / unit);
          const gy = Math.floor((y - oy) / unit);
          if (gy < 0 || gy >= 7 || gx < 0 || gx >= units) continue;
          const li = Math.floor(gx / 6);
          const col = gx % 6;
          if (col === 5) continue;
          if (GLYPHS[TEXT[li]][gy][col] === '1') fg++;
        }
      }
      const n = SS * SS;
      const t = (px + py) / (2 * size); // diagonal gradient
      const r0 = Math.round(29 + (124 - 29) * t);
      const g0 = Math.round(155 + (58 - 155) * t);
      const b0 = Math.round(240 + (237 - 240) * t);
      const f = bg ? fg / bg : 0;
      const i = (py * size + px) * 4;
      out[i] = Math.round(r0 + (255 - r0) * f);
      out[i + 1] = Math.round(g0 + (255 - g0) * f);
      out[i + 2] = Math.round(b0 + (255 - b0) * f);
      out[i + 3] = Math.round((bg / n) * 255);
    }
  }
  return out;
}

mkdirSync('public/icon', { recursive: true });
for (const size of [16, 32, 48, 96, 128]) {
  writeFileSync(`public/icon/${size}.png`, png(size, render(size)));
}
console.log('icons written to public/icon/');
