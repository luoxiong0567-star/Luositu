/**
 * 把 D:/agent-display-main/index.html 打包成可内联的数据源
 * 输出：web/js/data/agentpage.js  (HL.AGENT_PAGE)
 *
 * 为什么内联而不是 iframe src=file://：
 *   Chrome / Edge 默认禁止 file:// 页面 iframe 加载其他本地文件
 *   （实测：默认启动参数下 contentDocument 为 null，直连必然白屏）
 *
 * 源页面现为单主题（OPS 纸面工程），本脚本只做两处最小改造：
 *   1) 移除 Google Fonts 外链 —— 保持单文件全程离线
 *   2) 末尾追加 Esc 转发 —— iframe 内按 Esc 也能回到场景目录
 */
const fs = require('fs');
const path = require('path');

const SRC = 'D:/agent-display-main/index.html';
const OUT = path.join(__dirname, 'web/js/data/agentpage.js');

let html = fs.readFileSync(SRC, 'utf8');
const before = html.length;

/* 0) 结构自检：确认已是单主题版本 */
const must = ['id="tpl-ops"', 'id="host-ops"'];
const banned = ['tpl-spider', 'host-spider', 'mountSpider', 'data-series-pick', 'id="picker"'];
must.forEach(k => { if (html.indexOf(k) < 0) { console.error('!! 缺少 ' + k); process.exit(1); } });
banned.forEach(k => { if (html.indexOf(k) >= 0) { console.error('!! 仍存在 ' + k + '，源页面未完成单主题改造'); process.exit(1); } });

/* 1) 去掉 Google Fonts 外链（保留 CSS 字体名，未命中即回退系统字体） */
html = html
  .replace(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*\n?/g, '')
  .replace(/<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com"[^>]*>\s*\n?/g, '')
  .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/[^"]*">\s*\n?/g, '');

/* 2) Esc 转发给宿主页面 */
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

/* 3) base64（UTF-8 安全） */
const b64 = Buffer.from(html, 'utf8').toString('base64');

const head = [
  '/**',
  ' * AI-Agent 神经网络思维调用展示 · 内联页面数据（自动生成，勿手改）',
  ' * 源：D:/agent-display-main/index.html （' + before + ' 字节）',
  ' * 生成：node _build_agentpage.js',
  ' * 嵌入方式：iframe.srcdoc（file:// 下唯一可靠的本地页面嵌入方式）',
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
  '  global.HL.AGENT_PAGE = {',
  '    html: decode,',
  '    bytes: ' + before,
  '  };',
  '})(window);',
  ''
].join('\n');

fs.writeFileSync(OUT, head + b64 + tail, 'utf8');
const kb = n => (n / 1024).toFixed(1) + ' KB';
console.log('源文件      ' + kb(before));
console.log('处理后      ' + kb(html.length) + '  (去 CDN 字体 / Esc 转发)');
console.log('base64      ' + kb(b64.length));
console.log('输出        ' + OUT);
