/**
 * 把 D:/agent-display-main/neural-lab.html 打包成可内联的数据源
 * 输出：web/js/data/neuralpage.js  (HL.NEURAL_PAGE)
 *
 * 与 agentpage.js 同样的原因：Chrome/Edge 默认禁止 file:// 页面 iframe 直连本地文件，
 * 因此整页 base64 内联，运行时解码写入 iframe.srcdoc。
 *
 * 改造：仅追加 Esc 转发（页面本身已是单文件、无外链资源）。
 */
const fs = require('fs');
const path = require('path');

const SRC = 'D:/agent-display-main/neural-lab.html';
const OUT = path.join(__dirname, 'web/js/data/neuralpage.js');

let html = fs.readFileSync(SRC, 'utf8');
const before = html.length;

/* 自检：不应有任何外部资源引用，否则单文件离线会缺资源 */
const ext = html.match(/<(?:script|link|img)[^>]+(?:src|href)="(?!data:|#)[^"]+"/gi) || [];
if (ext.length) {
  console.error('!! 仍有外部引用：\n' + ext.slice(0, 5).join('\n'));
  process.exit(1);
}

const escHook = [
  '<script>',
  '(function(){',
  '  document.addEventListener("keydown", function(e){',
  '    if (e.key !== "Escape") return;',
  '    try { parent.postMessage({ hlEmbed: "esc" }, "*"); } catch (err) {}',
  '  }, true);',
  '})();',
  '<\/script>'
].join('\n');
if (html.indexOf('</body>') < 0) { console.error('!! 未找到 </body>'); process.exit(1); }
html = html.replace('</body>', escHook + '\n</body>');

const b64 = Buffer.from(html, 'utf8').toString('base64');

const head = [
  '/**',
  ' * 神经网络推理 · 内联页面数据（自动生成，勿手改）',
  ' * 源：D:/agent-display-main/neural-lab.html （' + before + ' 字节）',
  ' * 生成：node _build_neuralpage.js',
  ' * 嵌入方式：iframe.srcdoc',
  ' */',
  'window.HL = window.HL || {};',
  '(function (global) {',
  '  var B64 = \''
].join('\n');

const tail = [
  "';",
  '  var cache = null;',
  '  function decode() {',
  '    if (cache) return cache;',
  '    var bin = atob(B64);',
  '    var bytes = new Uint8Array(bin.length);',
  '    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);',
  '    cache = (typeof TextDecoder !== "undefined")',
  '      ? new TextDecoder("utf-8").decode(bytes)',
  '      : decodeURIComponent(escape(bin));',
  '    return cache;',
  '  }',
  '  global.HL.NEURAL_PAGE = {',
  '    html: decode,',
  '    bytes: ' + before,
  '  };',
  '})(window);',
  ''
].join('\n');

fs.writeFileSync(OUT, head + b64 + tail, 'utf8');
const kb = n => (n / 1024).toFixed(1) + ' KB';
console.log('源文件      ' + kb(before));
console.log('处理后      ' + kb(html.length));
console.log('base64      ' + kb(b64.length));
console.log('输出        ' + OUT);
