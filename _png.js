// 极简 PNG 分析器（纯 Node，无依赖）：解码 + 内容包围盒/贴边/居中度量
// 用法：node _png.js <file.png> [阈值=55]
// 输出 JSON：{w,h,bbox:[l,t,r,b],edge:{top,right,bottom,left},cover%,cx%,cy%}
const fs = require('fs'), zlib = require('zlib');

function decode(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not png');
  let off = 8, w = 0, h = 0, depth = 0, ct = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || (ct !== 6 && ct !== 2)) throw new Error('unsupported depth/ct: ' + depth + '/' + ct);
  const ch = ct === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++]; const row = y * stride; const prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const rb = raw[p++];
      const a = x >= ch ? out[row + x - ch] : 0;
      const b = y > 0 ? out[prev + x] : 0;
      const c = (x >= ch && y > 0) ? out[prev + x - ch] : 0;
      let v;
      if (f === 0) v = rb;
      else if (f === 1) v = rb + a;
      else if (f === 2) v = rb + b;
      else if (f === 3) v = rb + ((a + b) >> 1);
      else { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v = rb + (pa <= pb && pa <= pc ? a : (pb <= pc ? b : c)); }
      out[row + x] = v & 255;
    }
  }
  return { w, h, ch, data: out };
}

function analyze(file, thr) {
  thr = thr == null ? 55 : thr;
  const img = decode(file);
  const { w, h, ch, data } = img;
  let l = w, t = h, r = -1, b = -1, ink = 0;
  const bandN = 10;
  const bands = new Array(bandN).fill(0);
  for (let y = 0; y < h; y++) {
    const bi = Math.min(bandN - 1, (y / h * bandN) | 0);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      const B = Math.max(data[i], data[i + 1], data[i + 2]);
      if (B > thr) { ink++; bands[bi]++; if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
    }
  }
  if (r < 0) return JSON.stringify({ w, h, empty: true });
  const near = v => v <= 2;
  const res = {
    w, h, thr,
    bbox: [l, t, r, b],
    edge: { top: near(t), right: near(w - 1 - r), bottom: near(h - 1 - b), left: near(l) },
    cover: +(100 * ink / (w * h)).toFixed(2),
    bands: bands.map(v => +(100 * v / (w * h / bandN)).toFixed(1)),
    cx: +(((l + r) / 2 / w - 0.5) * 100).toFixed(1),
    cy: +(((t + b) / 2 / h - 0.5) * 100).toFixed(1)
  };
  return JSON.stringify(res);
}

console.log(analyze(process.argv[2], process.argv[3] ? +process.argv[3] : undefined));
