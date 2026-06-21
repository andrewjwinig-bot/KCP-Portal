// Dependency-free PNG icon generator. Draws the app icon (blue tile w/ a coral
// dot + green bar) at the sizes a PWA needs. Run: `npm run icons`.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'public', 'icons');

// ---- tiny RGBA canvas -----------------------------------------------------
function canvas(size) {
  return { size, data: new Uint8Array(size * size * 4) };
}
function px(c, x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= c.size || y >= c.size) return;
  const i = (y * c.size + x) * 4;
  const ia = a / 255;
  c.data[i] = c.data[i] * (1 - ia) + r * ia;
  c.data[i + 1] = c.data[i + 1] * (1 - ia) + g * ia;
  c.data[i + 2] = c.data[i + 2] * (1 - ia) + b * ia;
  c.data[i + 3] = Math.max(c.data[i + 3], a);
}
function fillRect(c, x0, y0, w, h, col) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px(c, x, y, col);
}
function roundRect(c, x0, y0, w, h, r, col) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const dx = Math.min(x - x0, x0 + w - 1 - x);
      const dy = Math.min(y - y0, y0 + h - 1 - y);
      if (dx < r && dy < r) {
        const d = Math.hypot(r - dx, r - dy);
        if (d > r) continue;
        const a = d > r - 1 ? (r - d) * col[3] : col[3]; // AA edge
        px(c, x, y, [col[0], col[1], col[2], Math.max(0, Math.min(255, a))]);
      } else px(c, x, y, col);
    }
  }
}
function circle(c, cx, cy, r, col) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r) continue;
      const a = d > r - 1 ? (r - d) * col[3] : col[3];
      px(c, x, y, [col[0], col[1], col[2], Math.max(0, Math.min(255, a))]);
    }
  }
}

const BLUE = [47, 107, 255, 255];
const WHITE = [255, 255, 255, 255];
const CORAL = [255, 107, 92, 255];
const GREEN = [22, 192, 152, 255];

function draw(size, { maskable }) {
  const c = canvas(size);
  fillRect(c, 0, 0, size, size, BLUE); // full-bleed background
  const inset = maskable ? size * 0.2 : size * 0.17; // tile padding
  const tx = inset;
  const ty = inset;
  const tw = size - inset * 2;
  roundRect(c, Math.round(tx), Math.round(ty), Math.round(tw), Math.round(tw), tw * 0.22, WHITE);
  // coral "dot"
  circle(c, Math.round(size / 2), Math.round(ty + tw * 0.34), Math.round(tw * 0.16), CORAL);
  // green "bar"
  roundRect(
    c,
    Math.round(tx + tw * 0.2),
    Math.round(ty + tw * 0.6),
    Math.round(tw * 0.6),
    Math.round(tw * 0.16),
    tw * 0.08,
    GREEN,
  );
  return c;
}

// ---- PNG encoding ---------------------------------------------------------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(c) {
  const { size, data } = c;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // raw scanlines with filter byte 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    data.subarray(y * size * 4, (y + 1) * size * 4).forEach((v, i) => {
      raw[y * (size * 4 + 1) + 1 + i] = v;
    });
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---- emit -----------------------------------------------------------------
fs.mkdirSync(OUT, { recursive: true });
const targets = [
  ['icon-192.png', 192, { maskable: false }],
  ['icon-512.png', 512, { maskable: false }],
  ['icon-512-maskable.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, { maskable: false }],
];
for (const [name, size, opts] of targets) {
  fs.writeFileSync(path.join(OUT, name), encodePNG(draw(size, opts)));
  console.log('wrote', name);
}
