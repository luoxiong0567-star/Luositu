// 万有引力模块自测：逐个子场景真实渲染，抓运行时异常 + 抽 HUD 读数
// 用法：node _grav_test.js
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

/* 控制台在 Windows 下易乱码，同时以 UTF-8 落盘一份 */
var LOG = [];
var _log = console.log;
console.log = function () {
  var s = Array.prototype.map.call(arguments, function (a) { return String(a); }).join(' ');
  LOG.push(s); _log(s);
};
function flushLog() {
  try { fs.writeFileSync(path.join(ROOT, '_grav_out.txt'), LOG.join('\n'), 'utf8'); } catch (e) {}
}

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9350 + Math.floor(Math.random() * 200);
const WAIT = 5000;

const SUBS = ['well', 'binary', 'kepler', 'threebody', 'tidal', 'escape'];

const EXPR = `(function(){
  var hud = document.getElementById('gravHud');
  var out = {
    subs: (window.HL && HL.GRAV) ? HL.GRAV.order : [],
    cards: hud ? hud.querySelectorAll('.gc-card').length : -1,
    katex: hud ? hud.querySelectorAll('.katex').length : -1,
    plots: hud ? hud.querySelectorAll('.gc-plot').length : -1,
    rows: [],
    panel: document.querySelectorAll('#panel .ctl').length,
    title: (document.getElementById('sceneTitle')||{}).textContent,
    fps: (document.getElementById('fps')||{}).textContent
  };
  if (hud) {
    var rs = hud.querySelectorAll('.gc-row');
    for (var i = 0; i < rs.length; i++) out.rows.push(rs[i].textContent.replace(/\\s+/g, ' ').trim());
  }
  return JSON.stringify(out);
})()`;

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
    '--user-data-dir=' + ROOT + '/_edge_grav',
    '--window-size=1280,760', '--hide-scrollbars', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, 'about:blank'
  ], () => {});
  child.stderr.on('data', () => {});

  let tabs = null;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { tabs = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/list')); if (tabs && tabs.length) break; } catch (e) {}
  }
  if (!tabs || !tabs.length) { console.log('ERR: CDP not ready'); child.kill(); process.exit(1); }

  let bad = 0;
  for (const sub of SUBS) {
    const url = 'file:///' + ROOT + '/web/index.html?g=' + sub + '#gravity';
    const t = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(url), 'PUT'));
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise(r => { ws.onopen = r; });

    let mid = 0;
    const pend = {};
    const errors = [];
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pend[m.id]) { pend[m.id](m.result); delete pend[m.id]; return; }
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        errors.push(((d.exception && (d.exception.description || d.exception.value)) || d.text || '').split('\n')[0]);
      }
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        errors.push('console: ' + (m.params.args || []).map(a => a.value || a.description || '').join(' ').split('\n')[0]);
      }
    };
    const send = (method, params) => new Promise(res => {
      const i = ++mid; pend[i] = res;
      ws.send(JSON.stringify({ id: i, method, params: params || {} }));
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await new Promise(r => setTimeout(r, WAIT));
    const ev = await send('Runtime.evaluate', { expression: EXPR, returnByValue: true });

    if (process.env.GRAV_SHOT === '1') {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      if (shot && shot.data) {
        const p = path.join(ROOT, 'docs', 'grav-' + sub + '.png');
        fs.writeFileSync(p, Buffer.from(shot.data, 'base64'));
        console.log('   shot ' + p + ' ' + fs.statSync(p).size);
      }
    }

    let info = null;
    try { info = JSON.parse(ev.result.value); } catch (e) { /* noop */ }

    const ok = !errors.length && info && info.cards >= 2 && info.katex >= 2;
    if (!ok) bad++;
    console.log('── ' + sub.padEnd(10) + (ok ? 'PASS' : 'FAIL') +
      '  cards=' + (info ? info.cards : '?') +
      '  katex=' + (info ? info.katex : '?') +
      '  plots=' + (info ? info.plots : '?') +
      '  ctl=' + (info ? info.panel : '?') +
      '  ' + (info ? info.fps : ''));
    if (info) console.log('   ' + info.rows.slice(0, 12).join(' | '));
    if (errors.length) errors.slice(0, 4).forEach(e => console.log('   !! ' + e.slice(0, 160)));

    try { ws.close(); } catch (e) {}
    await httpReq('http://127.0.0.1:' + PORT + '/json/close/' + t.id).catch(() => {});
  }

  flushLog();
  console.log(bad ? '\n❌ ' + bad + ' 个子场景有问题' : '\n✅ 全部 6 个子场景通过');
  flushLog();
  try { child.kill(); } catch (e) {}
  process.exit(0);
})().catch(e => { flushLog(); console.log('FATAL ' + e.message); process.exit(1); });
