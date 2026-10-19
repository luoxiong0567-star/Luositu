// 全量验证：12 个 3D 场景讲解模式 + 四章目录页（内嵌页面场景 aiagent 无讲解模式，由 _agent_test.js 单独覆盖）
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9451;
const URL_BASE = 'file:///C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light/web/index.html';

// 12 个 3D 场景（registration 顺序；aiagent 为内嵌页面，不参与讲解模式回归）
const SCENES = ['solar', 'periodic', 'neural', 'math', 'interference', 'molecule',
  'fourier', 'emwave', 'photosynthesis', 'maxwell', 'massenergy', 'gravity'];

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
    '--user-data-dir=' + path.join(ROOT, '_edge_t1'),
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
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.navigate', { url });
    await new Promise(r => setTimeout(r, waitMs || 4200));
    async function evalx(expr) {
      const ev = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      let v = null;
      if (ev.result && typeof ev.result.value === 'string') { try { v = JSON.parse(ev.result.value); } catch (e) {} }
      return v;
    }
    async function shot(file) {
      const s = await send('Page.captureScreenshot', { format: 'png' });
      if (s && s.data) fs.writeFileSync(path.join(ROOT, 'docs', file), Buffer.from(s.data, 'base64'));
      return s && s.data ? 'saved' : 'none';
    }
    return { evalx, shot, close: async () => { try { ws.close(); } catch (e) {} await httpReq('http://127.0.0.1:' + PORT + '/json/close/' + t.id).catch(() => {}); }, errors };
  }

  /* ---------- A. 13 场景讲解模式 ---------- */
  for (const sc of SCENES) {
    const r = await open(URL_BASE + '?_t=' + Date.now() + '#' + sc, sc === 'photosynthesis' || sc === 'massenergy' ? 5000 : 4200);
    const v = await r.evalx(`(function(){
      var out = {};
      var inst = window.HL && HL.manager && HL.manager.inst;
      if (!inst) return JSON.stringify({ err: 'no inst' });
      // 面板上必须有讲解按钮
      var btns = Array.prototype.slice.call(document.querySelectorAll('#panel .btn, #panel button'));
      out.tourBtn = btns.some(function(b){ return /讲解模式/.test(b.textContent || ''); });
      inst.setParam('tour');
      var ui = document.getElementById('hlTour');
      out.shown1 = !!(ui && ui.classList.contains('show'));
      out.title1 = ui ? (ui.querySelector('.gt-title')||{}).textContent : '';
      out.step1 = ui ? (ui.querySelector('.gt-step')||{}).textContent : '';
      var next = ui ? ui.querySelector('.gt-next') : null;
      if (next) next.click();
      out.title2 = ui ? (ui.querySelector('.gt-title')||{}).textContent : '';
      out.step2 = ui ? (ui.querySelector('.gt-step')||{}).textContent : '';
      var exit = ui ? ui.querySelector('.gt-exit') : null;
      if (exit) exit.click();
      out.shownAfterExit = !!(ui && ui.classList.contains('show'));
      out.katex = document.querySelectorAll('#gravHud .katex').length + document.querySelectorAll('#hlTour .katex').length;
      return JSON.stringify(out);
    })()`) || {};
    const ok = v.tourBtn && v.shown1 && /^1 \//.test(v.step1 || '') && v.step2 && v.step2 !== v.step1 &&
      !v.shownAfterExit && !r.errors.length;
    if (!ok) bad++;
    log('── ' + sc.padEnd(14) + (ok ? 'PASS' : 'FAIL') +
      '  btn=' + v.tourBtn + ' enter=' + v.shown1 + ' 1st="' + (v.title1 || '').slice(0, 18) + '" 2nd="' + (v.title2 || '').slice(0, 18) + '"' +
      ' exit=' + (!v.shownAfterExit) + (r.errors.length ? '  !! ' + r.errors[0] : ''));
    if (sc === 'maxwell' || sc === 'photosynthesis') {
      // 重进讲解并截图
      await r.evalx('HL.manager.inst.setParam("tour")');
      await new Promise(rr => setTimeout(rr, 2000));
      const f = sc === 'maxwell' ? 'tour-maxwell.png' : 'tour-photosynthesis.png';
      await r.shot(f);
    }
    await r.close();
  }

  /* ---------- B. 目录页（卡片平铺 + 13 场景） ---------- */
  {
    const r = await open(URL_BASE + '?_t=' + Date.now(), 3500);
    const v = await r.evalx(`(function(){
      var g = document.getElementById('gallery');
      return JSON.stringify({
        show: !!(g && g.classList.contains('show')),
        chapters: g ? g.querySelectorAll('.gal-chapter').length : -1,
        chNames: g ? Array.prototype.map.call(g.querySelectorAll('.gal-ch-name'), function(e){return e.textContent;}) : [],
        cards: g ? g.querySelectorAll('.gal-card').length : -1,
        imgs: g ? Array.prototype.filter.call(g.querySelectorAll('.gal-img img'), function(i){return i.complete && i.naturalWidth>0;}).length : -1,
        foot: g ? (g.querySelector('.gal-foot')||{}).textContent || '' : ''
      });
    })()`) || {};
    const ok = v.show && v.chapters === 0 && v.cards === 13 && v.imgs >= 13 && /宇宙用数学写就/.test(v.foot || '') && !r.errors.length;
    if (!ok) bad++;
    log('── 目录页平铺       ' + (ok ? 'PASS' : 'FAIL') + '  分组标题=' + v.chapters + ' cards=' + v.cards + ' imgs=' + v.imgs +
      ' [' + (v.chNames || []).join(' | ') + ']' + (r.errors.length ? ' !! ' + r.errors[0] : ''));
    await r.close();
  }

  log(bad ? '\n❌ ' + bad + ' 项失败' : '\n✅ 全量回归 13/13 通过');
  fs.writeFileSync(path.join(ROOT, '_t1_out.txt'), LOG.join('\n'), 'utf8');
  try { child.kill(); } catch (e) {}
  process.exit(0);
})().catch(e => { console.log('FATAL ' + e.message); process.exit(1); });
