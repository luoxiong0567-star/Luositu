// 时空弯曲冒烟：三个子视图真实渲染 + 讲解步数 + 侧栏顺序 + 互见
// 用法：node _spacetime_test.js
// 可选：ST_SHOT=1 把三张画面写到 docs/spacetime-*.png
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = 9470 + Math.floor(Math.random() * 200);
const WAIT = 2800;
const CHROME = process.env.CHROME || (fs.existsSync('/usr/bin/google-chrome')
  ? '/usr/bin/google-chrome' : 'google-chrome');

const SUBS = ['well', 'lens', 'time'];

function httpReq(url, method) {
  return new Promise((res, rej) => {
    const req = http.request(url, { method: method || 'GET' }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(d));
    });
    req.on('error', rej); req.end();
  });
}

const EXPR = `(function(){
  var hud = document.getElementById('gravHud');
  var ids = [];
  document.querySelectorAll('#sceneList .scene-item').forEach(function (el) { ids.push(el.dataset.id); });
  var xrefs = hud ? hud.querySelectorAll('.gc-xref-row button') : [];
  var out = {
    id: (location.hash || '').replace('#',''),
    order: (window.HL && HL.ST) ? HL.ST.order.slice() : [],
    registered: !!(window.HL && HL.getScene && HL.getScene('spacetime')),
    title: (document.getElementById('sceneTitle') || {}).textContent || '',
    desc: (document.getElementById('sceneDesc') || {}).textContent || '',
    cards: hud ? hud.querySelectorAll('.gc-card').length : -1,
    katex: hud ? hud.querySelectorAll('.katex').length : -1,
    xrefs: xrefs.length,
    xrefText: [],
    sidebar: ids.indexOf('gravity') >= 0 && ids.indexOf('gravity') < ids.indexOf('spacetime')
      && ids.indexOf('spacetime') < ids.indexOf('massenergy'),
    panel: document.querySelectorAll('#panel .ctl').length,
    draws: (window.HL && HL.manager && HL.manager.renderer && HL.manager.renderer.info)
      ? HL.manager.renderer.info.render.triangles : -1
  };
  for (var i = 0; i < xrefs.length; i++) out.xrefText.push(xrefs[i].textContent);
  return JSON.stringify(out);
})()`;

(async () => {
  const userDir = path.join('/tmp', 'hl-spacetime-chrome');
  const child = execFile(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-first-run', '--hide-scrollbars', '--allow-file-access-from-files',
    '--window-size=1280,800',
    '--user-data-dir=' + userDir,
    '--remote-debugging-port=' + PORT, 'about:blank'
  ], () => {});
  child.stderr.on('data', () => {});
  child.stdout.on('data', () => {});

  let tabs = null;
  for (let i = 0; i < 50; i++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      tabs = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/list'));
      if (tabs && tabs.length) break;
    } catch (e) { /* not ready */ }
  }
  if (!tabs || !tabs.length) {
    console.log('ERR: CDP not ready');
    try { child.kill(); } catch (e) {}
    process.exit(1);
  }

  let bad = 0;
  for (const sub of SUBS) {
    const url = 'file://' + ROOT + '/web/index.html?home=0&st=' + sub + '#spacetime';
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
    await send('Page.navigate', { url: url });
    await new Promise(r => setTimeout(r, WAIT));
    await send('Runtime.evaluate', { expression: `var g=document.getElementById('guide'); if(g) g.classList.remove('show');` });

    if (process.env.ST_SHOT === '1') {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      if (shot && shot.data) {
        const p = path.join(ROOT, 'docs', 'spacetime-' + sub + '.png');
        fs.writeFileSync(p, Buffer.from(shot.data, 'base64'));
        console.log('   shot ' + p);
      }
    }

    let tour = '';
    if (sub === 'well') {
      const clicked = await send('Runtime.evaluate', {
        expression: `(function(){
          var bs = document.querySelectorAll('#panel button');
          for (var i = 0; i < bs.length; i++) {
            if (bs[i].textContent.indexOf('讲解') >= 0) { bs[i].click(); return 'clicked'; }
          }
          return 'missing';
        })()`,
        returnByValue: true
      });
      await new Promise(r => setTimeout(r, 400));
      const step = await send('Runtime.evaluate', {
        expression: `(document.querySelector('#hlTour .gt-step')||{}).textContent || ''`,
        returnByValue: true
      });
      tour = (clicked.result && clicked.result.value) + ' ' + ((step.result && step.result.value) || '');
    }

    const ev = await send('Runtime.evaluate', { expression: EXPR, returnByValue: true });
    let info = null;
    try { info = JSON.parse(ev.result.value); } catch (e) { /* noop */ }

    const ok = !errors.length && info && info.registered && info.id === 'spacetime'
      && info.order.join(',') === 'well,lens,time'
      && info.title === '时空弯曲'
      && info.cards >= 3 && info.katex >= 2 && info.xrefs === 2
      && info.sidebar && info.draws > 100
      && (sub !== 'well' || tour.indexOf('1 / 6') >= 0);
    if (!ok) bad++;
    console.log((ok ? 'PASS ' : 'FAIL ') + sub
      + '  cards=' + (info ? info.cards : '?')
      + ' katex=' + (info ? info.katex : '?')
      + ' xref=' + (info ? info.xrefs : '?')
      + ' side=' + (info ? info.sidebar : '?')
      + (tour ? ' tour=' + tour : '')
      + (errors.length ? ' ERR ' + errors[0] : ''));
    if (!ok && info) console.log('   ' + JSON.stringify(info));

    try { ws.close(); } catch (e) {}
    await httpReq('http://127.0.0.1:' + PORT + '/json/close/' + t.id).catch(() => {});
  }

  try { child.kill(); } catch (e) {}
  process.exit(bad ? 1 : 0);
})().catch(e => { console.log('FATAL ' + e.stack); process.exit(1); });
