// 讲解模式验证：6 子场景进入/步进/退出 + well 场景截图
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9433;
const URL_BASE = 'file:///C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light/web/index.html';
const SUBS = ['well', 'binary', 'kepler', 'threebody', 'tidal', 'escape'];

function httpReq(url, method) {
  return new Promise((res, rej) => {
    const req = http.request(url, { method: method || 'GET' }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(d));
    });
    req.on('error', rej); req.end();
  });
}

/* 进入讲解 → 步进 2 次 → 退出，收集每步标题 */
const EXPR = `(function(){
  var out = { steps: [] };
  var inst = window.HL && HL.manager && HL.manager.inst;
  if (!inst) return JSON.stringify({ err: 'no inst' });
  inst.setParam('tour');
  var ui = document.getElementById('hlTour');
  out.shown1 = !!(ui && ui.classList.contains('show'));
  out.title1 = ui ? (ui.querySelector('.gt-title')||{}).textContent : '';
  out.step1 = ui ? (ui.querySelector('.gt-step')||{}).textContent : '';
  out.exp1 = ui ? (ui.querySelector('.gt-exp')||{}).textContent.slice(0, 40) : '';
  var next = ui ? ui.querySelector('.gt-next') : null;
  if (next) { next.click(); next.click(); }
  out.step3 = ui ? (ui.querySelector('.gt-step')||{}).textContent : '';
  var prev = ui ? ui.querySelector('.gt-prev') : null;
  if (prev) prev.click();
  out.stepBack = ui ? (ui.querySelector('.gt-step')||{}).textContent : '';
  var exit = ui ? ui.querySelector('.gt-exit') : null;
  if (exit) exit.click();
  out.shownAfterExit = !!(ui && ui.classList.contains('show'));
  return JSON.stringify(out);
})()`;

(async () => {
  const child = execFile(EDGE, [
    '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=swiftshader',
    '--no-first-run', '--disable-features=msEdgeNewTabPage',
    '--user-data-dir=' + path.join(ROOT, '_edge_tour'),
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

  async function run(sub, waitMs) {
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
    await send('Page.navigate', { url: URL_BASE + '?g=' + sub + '&_t=' + Date.now() + '#gravity' });
    await new Promise(r => setTimeout(r, waitMs || 4500));
    const ev = await send('Runtime.evaluate', { expression: EXPR, returnByValue: true });
    let val = null;
    if (ev.result && typeof ev.result.value === 'string') { try { val = JSON.parse(ev.result.value); } catch (e) {} }
    if (sub === 'well') {
      // 重新进入第 1 步并截图（含讲解卡片 + 脉冲光环 + 相机已飞行）
      await send('Runtime.evaluate', { expression: 'HL.manager.inst.setParam("tour")', returnByValue: true });
      await new Promise(r => setTimeout(r, 1800));
      const s = await send('Page.captureScreenshot', { format: 'png' });
      if (s && s.data) {
        fs.writeFileSync(path.join(ROOT, 'docs', 'grav-讲解模式.png'), Buffer.from(s.data, 'base64'));
      }
    }
    try { ws.close(); } catch (e) {}
    await httpReq('http://127.0.0.1:' + PORT + '/json/close/' + t.id).catch(() => {});
    return { val, errors };
  }

  for (const sub of SUBS) {
    const r = await run(sub, sub === 'escape' ? 5500 : 4500);
    const v = r.val || {};
    const ok = v.shown1 && /^1 \//.test(v.step1 || '') && v.step3 && v.step3 !== v.step1 &&
      v.stepBack && v.stepBack !== v.step3 && !v.shownAfterExit && !r.errors.length;
    if (!ok) bad++;
    log('── ' + sub.padEnd(10) + (ok ? 'PASS' : 'FAIL') +
      '  enter=' + v.shown1 + ' step="' + (v.step1 || '') + '" →3rd="' + (v.step3 || '') + '" back="' + (v.stepBack || '') + '"' +
      ' exit=' + (!v.shownAfterExit) + (r.errors.length ? '  !! ' + r.errors[0] : ''));
    log('    首步:「' + (v.title1 || '') + '」 exp: ' + (v.exp1 || '(无)'));
  }

  log(bad ? '\n❌ ' + bad + ' 项失败' : '\n✅ 讲解模式 6/6 通过');
  fs.writeFileSync(path.join(ROOT, '_tour_out.txt'), LOG.join('\n'), 'utf8');
  try { child.kill(); } catch (e) {}
  process.exit(0);
})().catch(e => { console.log('FATAL ' + e.message); process.exit(1); });
