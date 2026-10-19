// 单文件版隔离冒烟：目录页 12 卡片/12 图 + gravity 六子场景 + KaTeX 渲染
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9380 + Math.floor(Math.random() * 100);
const WAIT = 5000;

/* 1. 隔离副本 */
const isoDir = path.join(ROOT, '_iso');
fs.mkdirSync(isoDir, { recursive: true });
const isoFile = path.join(isoDir, 'HumanLight.html');
fs.copyFileSync(path.join(ROOT, 'release/人类之光.html'), isoFile);

const SUBS = ['well', 'binary', 'kepler', 'threebody', 'tidal', 'escape'];

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
    '--user-data-dir=' + path.join(ROOT, '_edge_iso'),
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

  const LOG = [];
  const log = s => { LOG.push(s); console.log(s); };

  async function open(fragment, evalExpr, wait) {
    const url = 'file:///' + isoFile.replace(/\\/g, '/') + (fragment || '');
    const t = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent('about:blank'), 'PUT'));
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise(r => { ws.onopen = r; });
    let mid = 0; const pend = {}; const errors = [];
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pend[m.id]) { pend[m.id](m.result); delete pend[m.id]; return; }
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        errors.push(((d.exception && (d.exception.description || d.exception.value)) || d.text || '').split('\n')[0]);
      }
    };
    const send = (method, params) => new Promise(res => {
      const i = ++mid; pend[i] = res;
      ws.send(JSON.stringify({ id: i, method, params: params || {} }));
    });
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.navigate', { url });
    await new Promise(r => setTimeout(r, wait || WAIT));
    const ev = await send('Runtime.evaluate', { expression: evalExpr || '1', returnByValue: true });
    let val = null;
    if (ev.result && typeof ev.result.value === 'string') { try { val = JSON.parse(ev.result.value); } catch (e) {} }
    try { ws.close(); } catch (e) {}
    await httpReq('http://127.0.0.1:' + PORT + '/json/close/' + t.id).catch(() => {});
    return { val, errors };
  }

  let bad = 0;

  /* A. 目录页 */
  {
    const r = await open('', `(function(){
      var g = document.getElementById('gallery');
      return JSON.stringify({
        show: !!(g && g.classList.contains('show')),
        cards: g ? g.querySelectorAll('.gal-card').length : -1,
        imgs: g ? g.querySelectorAll('.gal-img img').length : -1,
        imgOk: g ? Array.prototype.filter.call(g.querySelectorAll('.gal-img img'), function(i){return i.complete && i.naturalWidth>0;}).length : -1,
        head: (g.querySelector('.gal-head p')||{}).textContent || ''
      });
    })()`);
    const v = r.val || {};
    const ok = v.show && v.cards === 13 && v.imgs === 13 && v.imgOk === 13 && /十三/.test(v.head || '') && !r.errors.length;
    if (!ok) bad++;
    log('── gallery    ' + (ok ? 'PASS' : 'FAIL') + '  cards=' + v.cards + ' imgs=' + v.imgOk + '  ' + (v.head || '') + (r.errors.length ? '  !! ' + r.errors[0] : ''));
  }

  /* B. gravity 六子场景 */
  for (const sub of SUBS) {
    const r = await open('?g=' + sub + '#gravity', `(function(){
      var hud = document.getElementById('gravHud');
      return JSON.stringify({
        title: (document.getElementById('sceneTitle')||{}).textContent,
        cards: hud ? hud.querySelectorAll('.gc-card').length : -1,
        katex: hud ? hud.querySelectorAll('.katex').length : -1,
        panel: document.querySelectorAll('#panel .ctl').length
      });
    })()`, 5000);
    const v = r.val || {};
    const ok = v.title === '万有引力' && v.cards >= 2 && v.katex >= 2 && !r.errors.length;
    if (!ok) bad++;
    log('── gravity?' + sub.padEnd(10) + (ok ? 'PASS' : 'FAIL') + '  cards=' + v.cards + ' katex=' + v.katex + ' ctl=' + v.panel + (r.errors.length ? '  !! ' + r.errors[0] : ''));
  }

  /* C. 其他场景抽查（确认未回归） */
  for (const sid of ['solar', 'periodic', 'massenergy']) {
    const r = await open('#' + sid, `(function(){
      return JSON.stringify({ title: (document.getElementById('sceneTitle')||{}).textContent,
        fps: (document.getElementById('fps')||{}).textContent });
    })()`, 4500);
    const v = r.val || {};
    const ok = v.title && !r.errors.length;
    if (!ok) bad++;
    log('── ' + sid.padEnd(12) + (ok ? 'PASS' : 'FAIL') + '  ' + (v.title || '') + (r.errors.length ? '  !! ' + r.errors[0] : ''));
  }

  log(bad ? '\n❌ ' + bad + ' 项失败' : '\n✅ 单文件隔离冒烟全部通过  (' + (fs.statSync(isoFile).size / 1048576).toFixed(2) + ' MB)');
  fs.writeFileSync(path.join(ROOT, '_iso_out.txt'), LOG.join('\n'), 'utf8');
  try { child.kill(); } catch (e) {}
  process.exit(0);
})().catch(e => { console.log('FATAL ' + e.message); process.exit(1); });
