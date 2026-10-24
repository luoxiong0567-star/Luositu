// 速览构图检查：每镜停留 7 秒、飞入 1.4 秒，等镜头落位后再截图
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9395;

function httpReq(url, method) {
  return new Promise((res, rej) => {
    const req = http.request(url, { method: method || 'GET' }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(d));
    });
    req.on('error', rej); req.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = execFile(EDGE, [
    '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=swiftshader',
    '--no-first-run', '--disable-features=msEdgeNewTabPage',
    '--user-data-dir=' + path.join(ROOT, '_edge_frames'),
    '--window-size=1440,880', '--hide-scrollbars', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, 'about:blank'
  ], () => {});
  child.stderr.on('data', () => {});

  let tabs = null;
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    try { tabs = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/list')); if (tabs && tabs.length) break; } catch (e) {}
  }
  if (!tabs || !tabs.length) { console.log('ERR CDP'); child.kill(); process.exit(1); }

  const url = 'file:///' + ROOT + '/web/index.html?home=0';
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
    if (r && r.exceptionDetails) return 'ERR ' + r.exceptionDetails.text;
    return r && r.result ? r.result.value : null;
  };
  async function shot(file) {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    if (s && s.data) {
      fs.writeFileSync(path.join(ROOT, 'docs', file), Buffer.from(s.data, 'base64'));
      console.log('SAVED docs/' + file);
    }
  }

  await send('Page.enable'); await send('Runtime.enable');
  await sleep(4000);

  // 只跑指定段（第 2 个参数，1 起）
  const only = process.argv[2] ? parseInt(process.argv[2], 10) : 0;

  await ev(`(function(){
    document.getElementById('gallery').classList.remove('show');
    HL.JOURNEY.forEach(function(s){
      if (s.kind === 'open') s.dur = 1500;
      (s.beats||[]).forEach(function(b){ b.ms = 7000; b.fly = 1400; });
    });
  })()`);

  await ev('HL.startJourney()');
  if (only) { await sleep(300); await ev('HL.journey.start(HL.JOURNEY, ' + (only - 1) + ')'); }

  let last = '', n = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 160000) {
    const st = await ev('JSON.stringify(HL.journey ? HL.journey.state() : null)');
    if (!st || st === 'null') break;
    const s = JSON.parse(st);
    const key = s.idx + ':' + s.bi;
    if (key !== last) {
      last = key;
      await sleep(3600);                       // 飞行 + 场景自建入场动画都走完
      n++;
      const name = 'frame-' + String(n).padStart(2, '0') + '-' +
        (s.mode === 'end' ? 'end' : (s.idx + 1) + '-' + (s.bi + 1) + '-' + (s.scene || 'art')) + '.png';
      console.log('FRAME ' + JSON.stringify(s));
      await shot(name);
      if (s.mode === 'end' || (only && n >= 6)) break;
    }
    await sleep(300);
  }

  console.log(errors.length ? 'ERRORS: ' + errors.slice(0, 5).join(' | ') : 'NO JS ERRORS');
  try { ws.close(); } catch (e) {}
  try { child.kill(); } catch (e) {}
  process.exit(0);
})();
