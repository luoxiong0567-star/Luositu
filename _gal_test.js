// 验证：首页（目录页）收起左侧栏；进入场景后侧栏恢复
const { execFile } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9461;
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
    '--user-data-dir=' + path.join(ROOT, '_edge_gal'),
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
  const LOG = []; const log = s => { LOG.push(s); };

  const probe = `JSON.stringify((function(){
    var sb=document.getElementById('sidebar'), g=document.getElementById('gallery'), st=document.getElementById('stage');
    return {
      galOpen: document.body.classList.contains('gal-open'),
      galShow: !!(g && g.classList.contains('show')),
      sbW: sb ? Math.round(sb.getBoundingClientRect().width) : -1,
      sbOpacity: sb ? getComputedStyle(sb).opacity : '',
      stageW: st ? Math.round(st.getBoundingClientRect().width) : -1,
      cards: g ? g.querySelectorAll('.gal-card').length : -1
    };
  })())`;

  // A. 首页（无 hash）
  await send('Page.navigate', { url: URL_BASE + '?_t=' + Date.now() });
  await sleep(4000);
  const a = await evalx(probe) || {};
  const okA = a.galOpen && a.galShow && a.sbW <= 2 && a.stageW >= W - 40 && a.cards === 12;
  log('── 首页收起侧栏   ' + (okA ? 'PASS' : 'FAIL') + '  galOpen=' + a.galOpen + ' sidebarW=' + a.sbW +
    ' opacity=' + a.sbOpacity + ' stageW=' + a.stageW + '(视口' + W + ') cards=' + a.cards +
    (errors.length ? '  !! ' + errors[0] : ''));
  let bad = okA ? 0 : 1;

  // B. 点击卡片进入场景 → 侧栏恢复
  await evalx(`(function(){ var c=document.querySelector('.gal-card'); if(c) c.click(); return '1'; })()`);
  await sleep(3000);
  const b = await evalx(probe) || {};
  const okB = !b.galOpen && !b.galShow && b.sbW >= 200 && b.stageW <= W - 200;
  log('── 进场景恢复侧栏 ' + (okB ? 'PASS' : 'FAIL') + '  galOpen=' + b.galOpen + ' sidebarW=' + b.sbW +
    ' stageW=' + b.stageW + (errors.length ? '  !! ' + errors[0] : ''));
  if (!okB) bad++;

  // C. Esc 回目录 → 再次收起
  await evalx(`(function(){ document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); return '1'; })()`);
  await sleep(2000);
  const c = await evalx(probe) || {};
  const okC = c.galOpen && c.galShow && c.sbW <= 2;
  log('── Esc 回目录     ' + (okC ? 'PASS' : 'FAIL') + '  galOpen=' + c.galOpen + ' sidebarW=' + c.sbW +
    ' cards=' + c.cards + (errors.length ? '  !! ' + errors[0] : ''));
  if (!okC) bad++;

  // D. 直达链接进场景时不收起
  await send('Page.navigate', { url: URL_BASE + '?_t=' + Date.now() + '#solar' });
  await sleep(4000);
  const d = await evalx(probe) || {};
  const okD = !d.galOpen && !d.galShow && d.sbW >= 200;
  log('── 直达链接       ' + (okD ? 'PASS' : 'FAIL') + '  galOpen=' + d.galOpen + ' sidebarW=' + d.sbW +
    (errors.length ? '  !! ' + errors[0] : ''));
  if (!okD) bad++;

  const errOk = errors.length === 0;
  log(errOk && bad === 0 ? '\n✅ 目录页侧栏 4/4 通过' : '\n❌ ' + bad + ' 项失败' + (errors.length ? '  err=' + errors[0] : ''));
  fs.writeFileSync(path.join(ROOT, '_gal_out.txt'), LOG.join('\n'), 'utf8');
  try { child.kill(); } catch (e) {}
  process.exit(0);
})().catch(e => { console.log('FATAL ' + e.message); process.exit(1); });
