// HL.safeArea 画布安全区 + HUD 折叠验证
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9451;
const URL_BASE = 'file:///C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light/web/index.html';

function httpReq(url, method) {
  return new Promise((res, rej) => {
    const req = http.request(url, { method: method || 'GET' }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(d));
    });
    req.on('error', rej); req.end();
  });
}

/* safeArea 数值 + 相机偏移 + target 投影 */
const EXPR = `(function(){
  var out = {};
  var a = HL.safeArea.calc();
  out.area = [Math.round(a.L), Math.round(a.R), Math.round(a.T)];
  var cam = HL.manager.camera;
  out.viewEnabled = !!(cam.view && cam.view.enabled);
  out.offset = cam.view && cam.view.enabled ? [Math.round(cam.view.offsetX), Math.round(cam.view.offsetY)] : null;
  var ct = HL.manager.controls.target;
  var v = new THREE.Vector3().copy(ct).project(cam);
  var cv = document.getElementById('gl');
  var W = cv.clientWidth, H = cv.clientHeight;
  out.W = W; out.H = H;
  out.screen = [Math.round((v.x + 1) / 2 * W), Math.round((1 - v.y) / 2 * H)];
  var hud = document.getElementById('gravHud');
  out.hudCards = hud ? hud.querySelectorAll('.gc-card').length : 0;
  out.hudFolded = hud ? hud.classList.contains('folded') : null;
  out.foldBtn = hud ? !!hud.querySelector('.gh-fold') : false;
  return JSON.stringify(out);
})()`;

(async () => {
  const child = execFile(EDGE, [
    '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=swiftshader',
    '--no-first-run', '--disable-features=msEdgeNewTabPage',
    '--user-data-dir=' + path.join(ROOT, '_edge_safe'),
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
  let bad = 0;

  async function open(url, waitMs) {
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
    const evalx = async (expr) => {
      const ev = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      try { return JSON.parse(ev.result.value); } catch (e) { return null; }
    };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.navigate', { url });
    await new Promise(r => setTimeout(r, waitMs || 4200));
    return { evalx, send, errors, close: async () => {
      try { ws.close(); } catch (e) {}
      await httpReq('http://127.0.0.1:' + PORT + '/json/close/' + t.id).catch(() => {});
    } };
  }

  /* ── 1. gravity binary：HUD 展开 ── */
  {
    const p = await open(URL_BASE + '?g=binary&_t=' + Date.now() + '#gravity', 5000);
    const v = await p.evalx(EXPR);
    const center = (v.area[0] + v.W - v.area[1]) / 2;
    const ok = v.area[0] > 300 && v.area[1] > 180 && v.area[2] > 40 &&
      v.viewEnabled && Math.abs(v.offset[0] - (v.area[1] - v.area[0]) / 2) < 3 &&
      Math.abs(v.screen[0] - center) < 60 && v.screen[1] < v.H / 2 &&
      v.hudCards === 3 && v.foldBtn;
    if (!ok) bad++;
    log('── 1 binary·展开   ' + (ok ? 'PASS' : 'FAIL') +
      '  L/R/T=' + v.area + ' offset=' + v.offset + ' target屏幕x=' + v.screen[0] +
      '（安全区中心=' + Math.round(center) + '） y=' + v.screen[1] + '/H2=' + v.H / 2 + ' 卡片=' + v.hudCards);

    // 截图：HUD 展开状态
    let s = await p.send('Page.captureScreenshot', { format: 'png' });
    if (s && s.data) fs.writeFileSync(path.join(ROOT, 'docs', 'safe-展开.png'), Buffer.from(s.data, 'base64'));

    /* ── 2. 折叠 ── */
    await p.evalx(`document.getElementById('gravHud').querySelector('.gh-fold').click(); 'ok'`);
    await new Promise(r => setTimeout(r, 900));
    const v2 = await p.evalx(EXPR);
    const foldedOk = v2.hudFolded === true && v2.area[0] < 200 &&
      v2.screen[0] < v.screen[0] - 60 && v2.hudCards === 3;
    if (!foldedOk) bad++;
    log('── 2 HUD·折叠     ' + (foldedOk ? 'PASS' : 'FAIL') +
      '  folded=' + v2.hudFolded + ' L=' + v2.area[0] + ' target屏幕x=' + v2.screen[0] +
      '（左移 ' + (v.screen[0] - v2.screen[0]) + 'px）');

    s = await p.send('Page.captureScreenshot', { format: 'png' });
    if (s && s.data) fs.writeFileSync(path.join(ROOT, 'docs', 'safe-折叠.png'), Buffer.from(s.data, 'base64'));

    /* ── 3. 再展开恢复 ── */
    await p.evalx(`document.getElementById('gravHud').querySelector('.gh-fold').click(); 'ok'`);
    await new Promise(r => setTimeout(r, 900));
    const v3 = await p.evalx(EXPR);
    const reOk = v3.hudFolded === false && v3.area[0] > 300;
    if (!reOk) bad++;
    log('── 3 HUD·再展开   ' + (reOk ? 'PASS' : 'FAIL') + '  folded=' + v3.hudFolded + ' L=' + v3.area[0]);

    if (p.errors.length) { bad++; log('   !! 异常: ' + p.errors[0]); }
    await p.close();
  }

  /* ── 4. solar：无 HUD，仅右侧面板避让 ── */
  {
    const p = await open(URL_BASE + '?_t=' + Date.now() + '#solar', 4500);
    const v = await p.evalx(EXPR);
    const ok = v.area[0] === 0 && v.area[1] > 180 && v.viewEnabled &&
      v.screen[0] < v.W / 2 - 40;
    if (!ok) bad++;
    log('── 4 solar·仅面板 ' + (ok ? 'PASS' : 'FAIL') +
      '  L/R/T=' + v.area + ' target屏幕x=' + v.screen[0] + '（< W/2=' + v.W / 2 + '）');
    if (p.errors.length) { bad++; log('   !! 异常: ' + p.errors[0]); }
    await p.close();
  }

  /* ── 5. 目录页：不偏移 ── */
  {
    const p = await open(URL_BASE + '?_t=' + Date.now(), 3800);
    const v = await p.evalx(EXPR);
    const ok = v.area[0] === 0 && v.area[1] === 0 && !v.viewEnabled;
    if (!ok) bad++;
    log('── 5 目录页·不偏移 ' + (ok ? 'PASS' : 'FAIL') + '  L/R=' + v.area[0] + '/' + v.area[1] +
      ' viewEnabled=' + v.viewEnabled);
    if (p.errors.length) { bad++; log('   !! 异常: ' + p.errors[0]); }
    await p.close();
  }

  log(bad ? '\n❌ ' + bad + ' 项失败' : '\n✅ safeArea + HUD 折叠 5/5 通过');
  fs.writeFileSync(path.join(ROOT, '_safe_out.txt'), LOG.join('\n'), 'utf8');
  try { child.kill(); } catch (e) {}
  process.exit(0);
})().catch(e => {
  fs.writeFileSync(path.join(ROOT, '_safe_out.txt'), 'FATAL ' + e.message, 'utf8');
  process.exit(1);
});
