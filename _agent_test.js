// AI-Agent思维模型 场景验证（CDP）
// 覆盖：注册 / 侧栏与目录 / iframe 真正渲染 / 内容抽样 / Esc 回目录 / 切场景清理
const { execFile } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9491;
const ISO = process.argv[2] === 'iso';
const URL_BASE = ISO
  ? require('url').pathToFileURL(path.join(ROOT, 'release', '人类之光.html')).href
  : 'file:///' + ROOT.replace(/\\/g, '/') + '/web/index.html';
const OUT = ISO ? '_agent_iso_out.txt' : '_agent_out.txt';

function httpReq(u, m) {
  return new Promise((res, rej) => {
    const r = http.request(u, { method: m || 'GET' }, x => {
      let d = ''; x.on('data', c => d += c); x.on('end', () => res(d));
    });
    r.on('error', rej); r.end();
  });
}

(async () => {
  const child = execFile(EDGE, ['--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
    '--use-gl=swiftshader', '--no-first-run', '--user-data-dir=' + path.join(ROOT, ISO ? '_edge_agent_iso' : '_edge_agent'),
    '--window-size=1600,900', '--hide-scrollbars', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, 'about:blank'], () => {});
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
      errors.push((((d.exception && d.exception.description) || d.text || '')).split('\n')[0]);
    }
  };
  const send = (method, params) => new Promise(res => {
    const i = ++mid; pend[i] = res; ws.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
  const evalx = async expr => {
    const ev = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    let v = null;
    if (ev.result && typeof ev.result.value === 'string') {
      try { v = JSON.parse(ev.result.value); } catch (e) { v = ev.result.value; }
    }
    return v;
  };
  const shot = async name => {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    if (s && s.data) fs.writeFileSync(path.join(ROOT, 'docs', name), Buffer.from(s.data, 'base64'));
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const LOG = []; const log = s => LOG.push(s);
  let bad = 0;

  await send('Page.enable'); await send('Runtime.enable');

  /* ---------- A. 直达 #aiagent ---------- */
  await send('Page.navigate', { url: URL_BASE + '?debug=1&_t=' + Date.now() + '#aiagent' });
  await sleep(7000);

  const a = await evalx(`JSON.stringify((function(){
    var wrap = document.querySelector('.embed-wrap');
    var f = document.querySelector('.embed-frame');
    var d = null, shadow = -1, title = '', nodes = -1, canvas = -1, txt = '';
    var slim = {};
    try {
      d = f ? f.contentDocument : null;
      if (d) {
        nodes = d.querySelectorAll('*').length;
        canvas = d.querySelectorAll('canvas').length;
        title = d.title || '';
        var host = d.getElementById('host-ops');
        if (host && host.shadowRoot) {
          var sr = host.shadowRoot;
          shadow = sr.querySelectorAll('*').length;
          var app = sr.querySelector('.app');
          var h1 = sr.querySelector('.title h1');
          txt = h1 ? h1.textContent.replace(/\\s+/g, ' ').trim() : '';
          slim = {
            appW: app ? Math.round(app.getBoundingClientRect().width) : 0,
            appH: app ? Math.round(app.getBoundingClientRect().height) : 0,
            agents: sr.querySelectorAll('.agents li').length,
            feed: sr.querySelectorAll('.feed li').length,
            cells: sr.querySelectorAll('.cell').length,
            canvases: sr.querySelectorAll('canvas').length
          };
        }
      }
    } catch (e) { txt = 'ERR:' + e.message; }
    var sb = document.getElementById('sidebar');
    return {
      hasWrap: !!wrap,
      iframeCount: document.querySelectorAll('.embed-frame').length,
      srcdocLen: f ? (f.getAttribute('srcdoc') || '').length : -1,
      docNodes: nodes,
      shadowNodes: shadow,
      title: title,
      canvas: canvas,
      txtHead: txt.slice(0, 120),
      slim: slim,
      hasOps: txt.indexOf('神经网络思维调用展示') >= 0 && txt.indexOf('AI-Agent') >= 0,
      hasAgents: txt.indexOf('AGENT') >= 0 || txt.indexOf('Agent') >= 0,
      /* 单主题化：不应再有任何主题切换入口 */
      noSpiderHost: !(d && d.getElementById('host-spider')),
      noPicker: !(d && d.getElementById('picker')),
      seriesBtns: (function(){
        try { return (d && d.getElementById('host-ops').shadowRoot)
          ? d.getElementById('host-ops').shadowRoot.querySelectorAll('[data-series-pick]').length : -1; }
        catch(e) { return -1; }
      })(),
      spiderTpl: !!(d && d.getElementById('tpl-spider')),
      stageEmbed: document.getElementById('stage').classList.contains('embed-mode'),
      activeItem: (function(){var e=document.querySelector('#sceneList .scene-item.active');return e?e.dataset.id:'';})(),
      sidebarItems: document.querySelectorAll('#sceneList .scene-item').length,
      chapterIV: (function(){
        var chs=document.querySelectorAll('#sceneList .scene-chapter');
        var last=chs[chs.length-1]; if(!last) return [];
        var ids=[], n=last.nextElementSibling;
        while(n && !n.classList.contains('scene-chapter')){ if(n.classList.contains('scene-item')) ids.push(n.dataset.id); n=n.nextElementSibling; }
        return ids;
      })(),
      sbW: sb ? Math.round(sb.getBoundingClientRect().width) : -1
    };
  })())`) || {};

  const s2 = a.slim || {};
  const okA = a.hasWrap && a.iframeCount === 1 && a.srcdocLen > 40000 &&
    a.docNodes >= 10 && a.shadowNodes > 100 && a.title.indexOf('Agent') >= 0 &&
    a.hasOps && s2.appW > 600 && s2.appH > 400 &&
    s2.agents >= 10 && s2.feed >= 5 && s2.cells >= 5 &&
    a.noSpiderHost && a.noPicker && a.seriesBtns === 0 && a.spiderTpl === false &&
    a.stageEmbed === true && a.activeItem === 'aiagent' && a.sidebarItems === 14;
  log('── 直达 #aiagent    ' + (okA ? 'PASS' : 'FAIL') +
    '  srcdoc=' + Math.round((a.srcdocLen || 0) / 1024) + 'KB' +
    ' shadowNodes=' + a.shadowNodes + ' app=' + s2.appW + '×' + s2.appH +
    ' agents=' + s2.agents + ' feed=' + s2.feed + ' cells=' + s2.cells +
    ' canvas=' + s2.canvases);
  log('   页面标题: ' + (a.txtHead || '').slice(0, 60) + '  docNodes=' + a.docNodes + ' hasWrap=' + a.hasWrap);
  log('   单主题化: spiderHost=' + !a.noSpiderHost + ' picker=' + !a.noPicker +
    ' seriesBtn=' + a.seriesBtns + ' spiderTpl=' + a.spiderTpl);
  if (!okA) bad++;

  /* ---------- B. 第四章归属 ---------- */
  const okB = JSON.stringify(a.chapterIV) === JSON.stringify(['neural', 'aiagent', 'neuralnet']);
  log('── 第四章归属      ' + (okB ? 'PASS' : 'FAIL') + '  ' + JSON.stringify(a.chapterIV));
  if (!okB) bad++;

  await shot('aiagent-场景.png');

  /* ---------- C. iframe 内真实 Esc → 回目录（验证注入的转发脚本） ---------- */
  await evalx(`(function(){
    var f=document.querySelector('.embed-frame');
    try {
      var w=f.contentWindow, d=w.document;
      d.dispatchEvent(new w.KeyboardEvent('keydown', { key:'Escape', bubbles:true }));
    } catch(e) {}
    return '1';
  })()`);
  await sleep(900);
  const c = await evalx(`JSON.stringify({
    gal: document.getElementById('gallery').classList.contains('show'),
    cards: document.querySelectorAll('#gallery .gal-card').length
  })`) || {};
  const okC = c.gal === true && c.cards === 14;
  log('── Esc 回目录      ' + (okC ? 'PASS' : 'FAIL') + '  目录显示=' + c.gal + ' cards=' + c.cards);
  if (!okC) bad++;

  /* ---------- D. 切到其它场景后 iframe 被清理 ---------- */
  await evalx(`(function(){ HL.main ? 0 : 0; var b=document.querySelector('#sceneList .scene-item[data-id="neural"]'); if(b) b.click(); return '1'; })()`);
  await sleep(2500);
  const d = await evalx(`JSON.stringify({
    frames: document.querySelectorAll('.embed-frame').length,
    embedMode: document.getElementById('stage').classList.contains('embed-mode'),
    active: (function(){var e=document.querySelector('#sceneList .scene-item.active');return e?e.dataset.id:'';})()
  })`) || {};
  const okD = d.frames === 0 && d.embedMode === false && d.active === 'neural';
  log('── 切场景清理      ' + (okD ? 'PASS' : 'FAIL') + '  frames=' + d.frames +
    ' embedMode=' + d.embedMode + ' active=' + d.active);
  if (!okD) bad++;

  /* ---------- E. 侧栏点击进入（与其它条目同一路径） ---------- */
  await evalx(`(function(){ var e=document.querySelector('#sceneList .scene-item[data-id="aiagent"]'); if(e) e.click(); return '1'; })()`);
  await sleep(6000);
  const e = await evalx(`JSON.stringify({
    frames: document.querySelectorAll('.embed-frame').length,
    active: (function(){var x=document.querySelector('#sceneList .scene-item.active');return x?x.dataset.id:'';})(),
    gal: document.getElementById('gallery').classList.contains('show')
  })`) || {};
  const okE = e.frames === 1 && e.active === 'aiagent' && e.gal === false;
  log('── 侧栏点击进入    ' + (okE ? 'PASS' : 'FAIL') + '  frames=' + e.frames +
    ' active=' + e.active + ' 目录=' + e.gal);
  if (!okE) bad++;

  const errOk = errors.length === 0;
  log(errOk && bad === 0 ? '\n✅ AI-Agent 场景 5/5 通过' : '\n❌ ' + bad + ' 项失败' +
    (errors.length ? '  err=' + errors[0] : ''));

  fs.writeFileSync(path.join(ROOT, OUT), LOG.join('\n'), 'utf8');
  try { child.kill(); } catch (e) {}
  process.exit(0);
})().catch(e => {
  console.log('FATAL ' + e.message);
  process.exit(1);
});
