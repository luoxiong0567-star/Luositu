// 独立页面冒烟：加载 neural-lab.html，检查错误 / 状态推进 / 截图
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9497;
const W = +(process.argv[2] || 1600), H = +(process.argv[3] || 900);
const OUT = process.argv[4] || 'docs/neural-lab.png';

function httpReq(u, m) {
  return new Promise((res, rej) => {
    const r = http.request(u, { method: m || 'GET' }, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res(d)); });
    r.on('error', rej); r.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = execFile(EDGE, ['--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
    '--use-gl=swiftshader', '--no-first-run', '--hide-scrollbars',
    '--user-data-dir=' + path.join(ROOT, '_edge_nn'),
    '--window-size=' + W + ',' + H, '--remote-debugging-port=' + PORT, 'about:blank'], () => {});
  child.stderr.on('data', () => {});
  let tabs = null;
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    try { tabs = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/list')); if (tabs && tabs.length) break; } catch (e) {}
  }
  const t = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent('about:blank'), 'PUT'));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });
  let mid = 0; const pend = {}; const errors = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend[m.id]) { pend[m.id](m.result); delete pend[m.id]; return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push((((d.exception && d.exception.description) || d.text || '')).split('\n')[0]);
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push('console: ' + m.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 120));
    }
  };
  const send = (method, params) => new Promise(res => { const i = ++mid; pend[i] = res; ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const evalx = async expr => {
    const ev = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    let v = null;
    if (ev.result && typeof ev.result.value === 'string') { try { v = JSON.parse(ev.result.value); } catch (e) { v = ev.result.value; } }
    return v;
  };
  await send('Page.enable'); await send('Runtime.enable');

  const url = 'file:///D:/agent-display-main/neural-lab.html?t=' + Date.now();
  await send('Page.navigate', { url });
  await sleep(1200);
  const a = await evalx('JSON.stringify(window.__NN ? window.__NN.state : null)') || {};
  await sleep(5200);
  const b = await evalx(`JSON.stringify((function(){
    var st = window.__NN ? window.__NN.state : null;
    var log = document.getElementById('log');
    var cv = document.getElementById('c');
    var tr = document.getElementById('trace');
    return {
      state: st,
      logLines: log ? log.children.length : -1,
      cvW: cv ? Math.round(cv.getBoundingClientRect().width) : -1,
      cvH: cv ? Math.round(cv.getBoundingClientRect().height) : -1,
      traceW: tr ? Math.round(tr.getBoundingClientRect().width) : 0,
      feats: document.querySelectorAll('.feat').length,
      tags: document.querySelectorAll('.tag').length,
      boot: document.getElementById('boot').className
    };
  })())`) || {};

  /* 宽度控件：切到 XL，检查各层节点与参数数量同步 */
  const w = await evalx(`(function(){
    var r = window.__NN.setWidth(3);
    var f = document.querySelectorAll('.feat').length;
    var info = document.getElementById('wInfo').textContent;
    var st = window.__NN.state;
    return JSON.stringify({ dims: st.dims, feats: f, info: info, params: st.params,
      pathLens: st.pathLens, wIdx: st.wIdx, rows: document.querySelectorAll('.feat').length });
  })()`) || {};
  const okW = JSON.stringify(w.dims) === JSON.stringify([28,28,24,8]) && w.feats === 28 &&
    w.info === '28·28·24·8' && w.pathLens && w.pathLens[0] === 28*28;
  console.log('width -> XL:', okW ? 'PASS' : 'FAIL', JSON.stringify(w));
  /* 切回默认档，便于后续截图 */
  await evalx('window.__NN.setWidth(0)');

  const s1 = a || {}, s2 = b.state || {};
  const ok = s2.step >= 1 && s2.parts > 0 && b.logLines >= 5 && b.feats === 12 && b.tags === 4 &&
    b.cvW > 400 && b.boot === 'gone' && errors.length === 0;
  console.log((ok ? 'PASS' : 'FAIL'),
    'step=' + s2.step, 'parts=' + s2.parts, 'phase=' + (s2.phase || 0).toFixed(2),
    'out=' + s2.out, 'log=' + b.logLines, 'feats=' + b.feats, 'tags=' + b.tags,
    'canvas=' + b.cvW + '×' + b.cvH, 'trace=' + b.traceW);
  console.log('  首帧 state:', JSON.stringify(s1));
  console.log('  errors:', errors.length ? errors.slice(0, 3) : 'none');

  const sh = await send('Page.captureScreenshot', { format: 'png' });
  if (sh && sh.data) {
    const p = path.join(ROOT, OUT);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, Buffer.from(sh.data, 'base64'));
    console.log('  截图:', p);
  }
  try { child.kill(); } catch (e) {}
  process.exit(ok ? 0 : 1);
})().catch(e => { console.log('FATAL ' + e.message); process.exit(1); });
