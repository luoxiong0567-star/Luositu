// 手机端（390×844）开篇页与速览：版式与字幕卡检查
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9397;

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
    '--user-data-dir=' + path.join(ROOT, '_edge_mob2'),
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=390,844', '--hide-scrollbars', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, 'about:blank'
  ], () => {});
  child.stderr.on('data', () => {});

  let tabs = null;
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    try { tabs = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/list')); if (tabs && tabs.length) break; } catch (e) {}
  }
  if (!tabs || !tabs.length) { console.log('ERR CDP'); child.kill(); process.exit(1); }

  const url = 'file:///' + ROOT + '/web/index.html';
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
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(2200);
  await shot('m-home-1.png');
  await ev('HL.home.goto(1)');
  await sleep(2200);
  await shot('m-home-2.png');
  await ev('HL.home.goto(4)');
  await sleep(2200);
  await shot('m-home-3.png');

  await ev('HL.startJourney()');
  await sleep(2500);
  await shot('m-jr-open.png');

  // 跳段：先到第 2 段（银河），再到第 5 段（DNA）
  await ev('HL.journey.start(HL.JOURNEY, 1)');
  await sleep(5200);
  await shot('m-jr-galaxy.png');

  await ev('HL.journey.start(HL.JOURNEY, 4)');
  await sleep(5200);
  await shot('m-jr-dna.png');

  await ev('HL.journey.start(HL.JOURNEY, 6)');
  await sleep(5200);
  await shot('m-jr-math.png');

  console.log('CARD ' + await ev(`(function(){
    var c = document.querySelector('.jr-card').getBoundingClientRect();
    return JSON.stringify({w: Math.round(c.width), h: Math.round(c.height),
      left: Math.round(c.left), top: Math.round(c.top), vw: innerWidth, vh: innerHeight});
  })()`));

  console.log(errors.length ? 'ERRORS: ' + errors.slice(0, 5).join(' | ') : 'NO JS ERRORS');
  try { ws.close(); } catch (e) {}
  try { child.kill(); } catch (e) {}
  process.exit(0);
})();
