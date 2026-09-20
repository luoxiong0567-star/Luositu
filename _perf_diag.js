// 诊断：周期表真实点击是否翻面 + 各阶段 FPS 对比（定位卡顿源）
const { execFile } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9456;
const URL_BASE = 'file:///C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light/web/index.html';
const W = 1280, H = 760;

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
    '--user-data-dir=' + path.join(ROOT, '_edge_perf'),
    '--window-size=' + W + ',' + H, '--hide-scrollbars', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, 'about:blank'
  ], () => {});
  child.stderr.on('data', () => {});
  let tabs = null;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
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
      errors.push(((d.exception && (d.exception.description || d.exception.value)) || d.text || '').split('\n')[0]);
    }
  };
  const send = (method, params) => new Promise(res => {
    const i = ++mid; pend[i] = res;
    ws.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
  await send('Page.enable'); await send('Runtime.enable');
  const evalx = async expr => {
    const ev = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    let v = null;
    if (ev.result && typeof ev.result.value === 'string') { try { v = JSON.parse(ev.result.value); } catch (e) {} }
    return v;
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function fps(ms) {
    await evalx('window.__fps={n:0};window.__fpsStop=false;(function loop(){if(window.__fpsStop)return;window.__fps.n++;requestAnimationFrame(loop);})();JSON.stringify({ok:1})');
    await sleep(ms || 2000);
    const v = await evalx('window.__fpsStop=true;JSON.stringify({n:window.__fps.n})');
    await evalx('JSON.stringify({})');
    return v ? Math.round(v.n / ((ms || 2000) / 1000) * 10) / 10 : -1;
  }

  async function clickAt(x, y) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x, y: y, button: 'none', buttons: 0 });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x, y: y, button: 'left', buttons: 1, clickCount: 1 });
    await new Promise(r => setTimeout(r, 60));
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x, y: y, button: 'left', buttons: 0, clickCount: 1 });
  }

  const out = [];
  const log = s => { out.push(s); console.log(s); };

  /* ---------- 1. 基线：周期表初始 ---------- */
  await send('Page.navigate', { url: URL_BASE + '?debug=1&_t=' + Date.now() + '#periodic' });
  await sleep(4500);
  const base = await fps(2000);
  log('周期表 初始基线       : ' + base + ' fps');

  /* Fe 卡片屏幕坐标 */
  const pt = await evalx(`(function(){
    var P = window.__PT;
    var b = P.blocks.filter(function(x){return x.Z===26;})[0];
    var v = new P.THREE.Vector3().copy(b.mesh.position).project(P.camera);
    return JSON.stringify({ x: Math.round((v.x+1)/2*${W}), y: Math.round((1-v.y)/2*${H}), ndc:[+v.x.toFixed(3), +v.y.toFixed(3)] });
  })()`);
  log('Fe 卡片屏幕坐标       : ' + JSON.stringify(pt));

  /* ---------- 2. 真实鼠标点击 → 是否翻面 ---------- */
  await clickAt(pt.x, pt.y);
  await sleep(900);
  const afterClick = await evalx(`(function(){
    var P = window.__PT;
    var b = P.blocks.filter(function(x){return x.Z===26;})[0];
    return JSON.stringify({ ft: b.ft, rot: +b.mesh.rotation.y.toFixed(3), back: !!b.back, chamber: P.chamber.isVisible() });
  })()`);
  log('真实点击后            : ' + JSON.stringify(afterClick));
  /* 点击后先等 2.5s，给帧率守卫留出降级判定时间，再测稳定帧率 */
  await sleep(2500);
  const fpsAfterClick = await fps(2000);
  log('点击后（翻面+玻璃舱） : ' + fpsAfterClick + ' fps');
  const st1 = await evalx(`JSON.stringify({ refract: window.__PT.chamber.refractOn() })`);
  log('  玻璃舱折射状态       : ' + JSON.stringify(st1));

  /* ---------- 3. 关闭玻璃舱再测（判断 transmission 材质成本） ---------- */
  await evalx('HL.manager.inst.setParam("chamber", false);JSON.stringify({ok:1})');
  await sleep(1200);
  const fpsNoChamber = await fps(2000);
  log('关闭玻璃舱后          : ' + fpsNoChamber + ' fps');

  /* ---------- 4. 关闭玻璃折射 ---------- */
  await evalx('HL.manager.inst.setParam("chamber", true);HL.manager.inst.setParam("refract", false);JSON.stringify({ok:1})');
  await sleep(1500);
  const fpsNoRefract = await fps(2000);
  log('玻璃舱无折射(transmission 关): ' + fpsNoRefract + ' fps');

  /* ---------- 5. 其它场景基线对照 ---------- */
  await send('Page.navigate', { url: URL_BASE + '?_t=' + Date.now() + '#solar' });
  await sleep(4200);
  const solarFps = await fps(2000);
  log('太阳系 对照基线       : ' + solarFps + ' fps');

  await send('Page.navigate', { url: URL_BASE + '?_t=' + Date.now() + '#maxwell' });
  await sleep(4200);
  const maxwellFps = await fps(2000);
  log('麦克斯韦 对照基线     : ' + maxwellFps + ' fps');

  log('运行时异常            : ' + (errors.join(' | ') || 'none'));
  try { ws.close(); } catch (e) {}
  await httpReq('http://127.0.0.1:' + PORT + '/json/close/' + t.id).catch(() => {});
  child.kill();
})();
