// 数学模型页：讲解浮层在 DOM 展示层之上的可见性校验
// 用法：node _math_tour.js
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9386;

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
    '--user-data-dir=' + path.join(ROOT, '_edge_math'),
    '--window-size=1440,880', '--hide-scrollbars', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, 'about:blank'
  ], () => {});
  child.stderr.on('data', () => {});

  let tabs = null;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { tabs = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/list')); if (tabs && tabs.length) break; } catch (e) {}
  }
  if (!tabs || !tabs.length) { console.log('ERR: CDP not ready'); child.kill(); process.exit(1); }

  const url = 'file:///' + ROOT + '/web/index.html#math';
  const t = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(url), 'PUT'));
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
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r && r.result ? r.result.value : null;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await new Promise(r => setTimeout(r, 5000));

  async function shot(file) {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    if (s && s.data) {
      fs.writeFileSync(path.join(ROOT, 'docs', file), Buffer.from(s.data, 'base64'));
      console.log('SAVED docs/' + file);
    }
  }

  // 从页面自身的「📖 讲解」按钮进入，验证浮层层级与内容
  const info = await ev(`(function(){
    var btn = document.querySelector('.ml-top .ml-btn');
    btn.click();
    var ui = document.getElementById('hlTour');
    var cs = getComputedStyle(ui);
    var r = ui.getBoundingClientRect();
    var top = document.elementFromPoint(r.left + r.width/2, r.top + 12);
    return JSON.stringify({
      clickLabel: btn.textContent,
      shown: ui.classList.contains('show'),
      z: cs.zIndex,
      pos: cs.position,
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      topEl: top ? (top.id || top.className || top.tagName) : null,
      title: (ui.querySelector('.gt-title')||{}).textContent,
      step: (ui.querySelector('.gt-step')||{}).textContent,
      exp: (ui.querySelector('.gt-exp')||{}).textContent
    });
  })()`);
  console.log('TOUR ' + info);
  await new Promise(r => setTimeout(r, 900));
  await shot('math-tour.png');

  // 第二步：确认 apply() 会把页面滚到对应章节
  const s2 = await ev(`(function(){
    var ui = document.getElementById('hlTour');
    ui.querySelector('.gt-next').click();
    return JSON.stringify({ step: (ui.querySelector('.gt-step')||{}).textContent,
      title: (ui.querySelector('.gt-title')||{}).textContent,
      active: __MATH.state().active });
  })()`);
  console.log('NEXT ' + s2);

  console.log(errors.length ? 'ERRORS: ' + errors.slice(0, 4).join(' | ') : 'NO JS ERRORS');
  try { ws.close(); } catch (e) {}
  try { child.kill(); } catch (e) {}
  process.exit(0);
})();
