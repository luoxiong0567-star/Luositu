// 诊断 gravHud 盒模型
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9453;

function httpReq(url, method) {
  return new Promise((res, rej) => {
    const req = http.request(url, { method: method || 'GET' }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(d));
    });
    req.on('error', rej); req.end();
  });
}

(async () => {
  const child = execFile(EDGE, [
    '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=swiftshader',
    '--no-first-run', '--disable-features=msEdgeNewTabPage',
    '--user-data-dir=' + path.join(ROOT, '_edge_diag2'),
    '--window-size=1280,760', '--hide-scrollbars', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, 'about:blank'
  ], () => {});
  child.stderr.on('data', () => {});
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { const t = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/list')); if (t && t.length) break; } catch (e) {}
  }
  const t = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent('about:blank'), 'PUT'));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });
  let mid = 0; const pend = {};
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend[m.id]) { pend[m.id](m.result); delete pend[m.id]; } };
  const send = (method, params) => new Promise(res => { const i = ++mid; pend[i] = res; ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const evalx = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result.value;

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'file:///C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light/web/index.html?g=binary&_t=' + Date.now() + '#gravity' });
  await new Promise(r => setTimeout(r, 5000));

  const out = await evalx(`(function(){
    var r = document.getElementById('gravHud');
    var cs = getComputedStyle(r);
    var rect = r.getBoundingClientRect();
    var kids = [];
    for (var i = 0; i < r.children.length; i++) {
      var c = r.children[i];
      kids.push(c.className + ' w=' + Math.round(c.getBoundingClientRect().width));
    }
    var s = 'root: width=' + cs.width + ' rect.w=' + Math.round(rect.width) + ' right=' + Math.round(rect.right) +
      ' inlineW=' + (r.style.width || '-') + '\\nchildren:\\n' + kids.join('\\n');
    return s;
  })()`);
  fs.writeFileSync(path.join(ROOT, '_diag2.txt'), out, 'utf8');
  console.log('done');
  try { ws.close(); } catch (e) {}
  try { child.kill(); } catch (e) {}
  process.exit(0);
})().catch(e => { fs.writeFileSync(path.join(ROOT, '_diag2.txt'), 'FATAL ' + e.message); process.exit(1); });
