// 数学模型页截图：开篇 + 四个模型 + 公式页签切换 + 手机 / 平板
// 用法：node _math_shots.js
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9381;

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
  await new Promise(r => setTimeout(r, 5200));

  async function shot(file) {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    if (s && s.data) {
      fs.writeFileSync(path.join(ROOT, 'docs', file), Buffer.from(s.data, 'base64'));
      console.log('SAVED docs/' + file + '  ' + (fs.statSync(path.join(ROOT, 'docs', file)).size / 1024).toFixed(0) + ' KB');
    }
  }

  console.log('STATE ' + JSON.stringify(await ev('JSON.stringify(__MATH.state())')));

  await shot('math-hero.png');

  for (let i = 0; i < 4; i++) {
    await ev(`__MATH.go(${i})`);
    await new Promise(r => setTimeout(r, 1400));
    await shot('math-' + ['bayes', 'normal', 'euclid', 'entropy'][i] + '.png');
  }

  // 欧几里得：内角和 / 圆周角
  await ev('__MATH.go(2); __MATH.tab(2, 1)');
  await new Promise(r => setTimeout(r, 1200));
  await shot('math-euclid-angle.png');
  await ev('__MATH.tab(2, 2)');
  await new Promise(r => setTimeout(r, 1200));
  await shot('math-euclid-circle.png');

  // 信息熵：等概率信源
  await ev('__MATH.go(3); __MATH.tab(3, 1)');
  await new Promise(r => setTimeout(r, 1200));
  await shot('math-entropy-tree.png');

  // 手机 / 平板
  const CASES = [
    [414, 896, 2, true, 0, 'math-mobile.png'],
    [414, 896, 2, true, 2, 'math-mobile-euclid.png'],
    [768, 1024, 2, true, 0, 'math-tablet.png']
  ];
  for (const [w, h, dpr, mob, sec, file] of CASES) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: mob });
    await new Promise(r => setTimeout(r, 600));
    await ev(`__MATH.go(${sec})`);
    await new Promise(r => setTimeout(r, 1500));
    await shot(file);
  }
  await send('Emulation.clearDeviceMetricsOverride');

  console.log(errors.length ? 'ERRORS: ' + errors.slice(0, 5).join(' | ') : 'NO JS ERRORS');
  try { ws.close(); } catch (e) {}
  try { child.kill(); } catch (e) {}
  process.exit(0);
})();
