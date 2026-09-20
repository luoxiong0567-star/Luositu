// 校验缩略图 thumbs.js：键完整性 + 每张 data URI 的 JPEG 头
const fs = require('fs');
const path = require('path');
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const src = fs.readFileSync(path.join(ROOT, 'web/js/data/thumbs.js'), 'utf8');
const keys = ['solar','periodic','neural','math','interference','molecule','fourier','emwave','photosynthesis','maxwell','massenergy','gravity'];
const lines = [];
for (const k of keys) {
  const i = src.indexOf('"' + k + '"');
  if (i < 0) { lines.push(k + ' MISSING'); continue; }
  const j = src.indexOf('base64,', i) + 7;
  const e = src.indexOf('"', j);
  const buf = Buffer.from(src.slice(j, e), 'base64');
  const soi = buf[0] === 0xFF && buf[1] === 0xD8;
  const eoi = buf[buf.length - 2] === 0xFF && buf[buf.length - 1] === 0xD9;
  lines.push(k.padEnd(15) + (soi && eoi ? 'JPEG-OK ' : 'BAD-HEAD') + ' ' + (buf.length / 1024).toFixed(1) + ' KB');
}
fs.writeFileSync(path.join(ROOT, 'docs/_chk.txt'), lines.join('\n'), 'utf8');
console.log(lines.join('\n'));
