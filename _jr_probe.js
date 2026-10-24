// 速览浮层探针：开篇倒计时、嵌入页上的字层关系、收尾卡压暗
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9393;

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
    '--user-data-dir=' + path.join(ROOT, '_edge_probe'),
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
  await sleep(5000);

  console.log('HOME-AUTO ' + await ev(`JSON.stringify({
    open: HL.home.isOpen(),
    auto: !!document.querySelector('.hm-auto'),
    txt: (document.querySelector('.hm-auto span')||{}).textContent,
    meta: (document.querySelector('.hm-meta')||{}).textContent,
    cta: getComputedStyle(document.querySelector('.hm-tail')).opacity
  })`));
  await shot('home-probe.png');

  // 关掉开篇，直接跳到第 8 段（AI 智能体）
  await ev('HL.home.hide()');
  await sleep(600);
  await ev('HL.startJourney()');
  await sleep(500);
  await ev('HL.journey.stop(false)');
  await sleep(400);
  await ev('HL.journey.start(HL.JOURNEY, 7)');
  await sleep(5000);
  console.log('AIA ' + await ev(`(function(){
    var b = document.querySelector('.jr-brand');
    var r = b.getBoundingClientRect();
    var el = document.elementFromPoint(r.left + 40, r.top + 8);
    return JSON.stringify({
      idx: HL.journey.idx(),
      brand: [Math.round(r.left), Math.round(r.top), Math.round(r.width)],
      opacity: getComputedStyle(b).opacity,
      color: getComputedStyle(b).color,
      topAt: el ? (el.tagName + '.' + el.className) : null,
      z: getComputedStyle(document.getElementById('hlJourney')).zIndex
    });
  })()`));
  await shot('jr-aia-probe.png');

  // 收尾卡
  await ev('HL.journey.next()');
  await sleep(1600);
  console.log('ENDCARD ' + await ev(`JSON.stringify({
    end: document.querySelector('.jr-endcard').classList.contains('show'),
    dim: getComputedStyle(document.getElementById('hlJourney'), '::before').background.slice(0, 40)
  })`));
  await shot('jr-end-probe.png');

  // 回到开篇
  await ev('document.querySelector(".jr-toHome").click()');
  await sleep(1800);
  console.log('TOHOME ' + await ev('JSON.stringify({home: HL.home.isOpen(), journey: HL.journey.active(), cls: document.getElementById("app").className})'));
  await shot('jr-tohome-probe.png');

  console.log(errors.length ? 'ERRORS: ' + errors.slice(0, 5).join(' | ') : 'NO JS ERRORS');
  try { ws.close(); } catch (e) {}
  try { child.kill(); } catch (e) {}
  process.exit(0);
})();
