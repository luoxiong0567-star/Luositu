// 验证：首页侧栏常驻 + 侧栏四章分组（宏观宇宙→微观物质→生命演化→抽象之美）
const { execFile } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9462;
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
  let bad = 0;

  const probe = `JSON.stringify((function(){
    var sb=document.getElementById('sidebar'), g=document.getElementById('gallery');
    return {
      galShow: !!(g && g.classList.contains('show')),
      sbW: sb ? Math.round(sb.getBoundingClientRect().width) : -1,
      chapters: Array.prototype.map.call(document.querySelectorAll('#sceneList .scene-chapter b'), function(e){return e.textContent;}),
      subs: Array.prototype.map.call(document.querySelectorAll('#sceneList .scene-chapter span'), function(e){return e.textContent;}),
      items: document.querySelectorAll('#sceneList .scene-item').length,
      cards: g ? g.querySelectorAll('.gal-card').length : -1,
      active: (document.querySelector('#sceneList .scene-item.active')||{}).datasetId || (function(){var a=document.querySelector('#sceneList .scene-item.active');return a?a.dataset.id:'';})()
    };
  })())`;

  // A. 首页：侧栏常驻 + 四章分组 + 目录页卡片
  await send('Page.navigate', { url: URL_BASE + '?_t=' + Date.now() });
  await sleep(4000);
  const a = await evalx(probe) || {};
  const expectCh = ['Ⅰ · 宇宙的法则', 'Ⅱ · 物质的语言', 'Ⅲ · 规律的抽象', 'Ⅳ · 思维的光芒'];
  const okA = a.galShow && a.sbW >= 200 && a.cards === 12 && a.items === 12 &&
    JSON.stringify(a.chapters) === JSON.stringify(expectCh);
  log('── 首页侧栏+四章   ' + (okA ? 'PASS' : 'FAIL') + '  sidebarW=' + a.sbW + ' cards=' + a.cards +
    ' items=' + a.items + ' 章=' + JSON.stringify(a.chapters) + (errors.length ? '  !! ' + errors[0] : ''));
  if (!okA) bad++;
  log('   分组副标题: ' + JSON.stringify(a.subs));

  // B. 侧栏章节顺序与场景归属抽查（第一章 5 个、第二章 3 个…）
  const b = await evalx(`JSON.stringify((function(){
    var out=[], chs=document.querySelectorAll('#sceneList .scene-chapter');
    for (var i=0;i<chs.length;i++){
      var ids=[], n=chs[i].nextElementSibling;
      while(n && !n.classList.contains('scene-chapter')){ if(n.classList.contains('scene-item')) ids.push(n.dataset.id); n=n.nextElementSibling; }
      out.push(ids.join(','));
    }
    return out;
  })())`) || [];
  const expectGroups = ['solar,gravity,massenergy,maxwell,emwave', 'periodic,molecule,photosynthesis', 'math,fourier,interference', 'neural'];
  const okB = JSON.stringify(b) === JSON.stringify(expectGroups);
  log('── 分组归属        ' + (okB ? 'PASS' : 'FAIL') + '  ' + JSON.stringify(b));
  if (!okB) bad++;

  // C. 点侧栏项进场景 → 高亮 + 侧栏仍在
  await evalx(`(function(){ var it=document.querySelector('#sceneList .scene-item[data-id="periodic"]'); if(it) it.click(); return '1'; })()`);
  await sleep(3000);
  const c = await evalx(probe) || {};
  const okC = !c.galShow && c.sbW >= 200 && c.active === 'periodic' && c.items === 12;
  log('── 侧栏进场景      ' + (okC ? 'PASS' : 'FAIL') + '  active=' + c.active + ' sidebarW=' + c.sbW +
    ' 目录页=' + c.galShow + (errors.length ? '  !! ' + errors[0] : ''));
  if (!okC) bad++;

  // D. Esc 回目录 → 侧栏仍常驻
  await evalx(`(function(){ window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); return '1'; })()`);
  await sleep(1500);
  const d = await evalx(probe) || {};
  const okD = d.galShow && d.sbW >= 200 && d.cards === 12;
  log('── Esc 回目录      ' + (okD ? 'PASS' : 'FAIL') + '  sidebarW=' + d.sbW + ' cards=' + d.cards);
  if (!okD) bad++;

  const errOk = errors.length === 0;
  log(errOk && bad === 0 ? '\n✅ 侧栏四章分组 4/4 通过' : '\n❌ ' + bad + ' 项失败' + (errors.length ? '  err=' + errors[0] : ''));
  fs.writeFileSync(path.join(ROOT, '_gal_out.txt'), LOG.join('\n'), 'utf8');
  try { child.kill(); } catch (e) {}
  process.exit(0);
})().catch(e => { console.log('FATAL ' + e.message); process.exit(1); });
