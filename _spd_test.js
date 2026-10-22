// 速度控件验证（CDP）：滑块 / 预设菜单 / 记忆 / 不影响暂停与主题
const { execFile } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9495;
const URL_BASE = 'file:///' + ROOT.replace(/\\/g, '/') + '/web/index.html';

function httpReq(u, m) {
  return new Promise((res, rej) => {
    const r = http.request(u, { method: m || 'GET' }, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res(d)); });
    r.on('error', rej); r.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = execFile(EDGE, ['--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
    '--use-gl=swiftshader', '--no-first-run', '--allow-file-access-from-files',
    '--user-data-dir=' + path.join(ROOT, '_edge_spd'),
    '--window-size=1600,900', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, 'about:blank'], () => {});
  child.stderr.on('data', () => {});
  let tabs = null;
  for (let i = 0; i < 60; i++) { await sleep(250); try { tabs = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/list')); if (tabs && tabs.length) break; } catch (e) {} }
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
  const send = (method, params) => new Promise(res => { const i = ++mid; pend[i] = res; ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const evalx = async expr => {
    const ev = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (ev && ev.exceptionDetails) return 'EXC:' + (ev.exceptionDetails.text || '');
    let v = null;
    if (ev.result && typeof ev.result.value === 'string') { try { v = JSON.parse(ev.result.value); } catch (e) { v = ev.result.value; } }
    return v;
  };
  const shot = async name => {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    if (s && s.data) fs.writeFileSync(path.join(ROOT, 'docs', name), Buffer.from(s.data, 'base64'));
  };
  const LOG = []; const log = s => LOG.push(s);
  let bad = 0;
  await send('Page.enable'); await send('Runtime.enable');

  await send('Page.navigate', { url: URL_BASE + '?debug=1&_t=' + Date.now() + '#aiagent' });
  await sleep(6500);

  /* 在 iframe 内操作（同源，可直接访问 contentDocument） */
  const probe = `(function(){
    var d = document.querySelector('.embed-frame').contentDocument;
    var sr = d.getElementById('host-ops').shadowRoot;
    var spd = sr.getElementById('spd'), v = sr.getElementById('spdV');
    var m = sr.getElementById('spdQ');
    return JSON.stringify({
      hasSpd: !!spd, hasV: !!v,
      value: spd ? spd.value : null,
      label: v ? v.textContent : '',
      max: spd ? spd.max : null,
      menuItems: (function(){ var ms = m.querySelectorAll('button'); var out=[]; for (var i=0;i<ms.length;i++) out.push(ms[i].textContent.trim()); return out; })(),
      menuHidden: m ? m.hidden : null,
      paused: sr.getElementById('pause').getAttribute('aria-pressed'),
      themeLabel: sr.getElementById('theme').textContent,
      ctlW: (function(){ var c=sr.querySelector('.ctls'); return Math.round(c.getBoundingClientRect().width);})()
    });
  })()`;

  const a = await evalx(probe) || {};
  const okA = a.hasSpd && /^\d+(\.\d)?×$/.test(a.label) && a.max === '4' && a.menuItems.length === 5 && a.menuHidden === true;
  log('── 控件存在        ' + (okA ? 'PASS' : 'FAIL') + '  value=' + a.value + ' label=' + a.label +
    ' 档位=' + JSON.stringify(a.menuItems) + ' 菜单隐藏=' + a.menuHidden + ' ctls宽=' + a.ctlW);
  if (!okA) bad++;

  /* 滑块拖到最快档 */
  const b = await evalx(`(function(){
    var d=document.querySelector('.embed-frame').contentDocument, sr=d.getElementById('host-ops').shadowRoot;
    var spd=sr.getElementById('spd');
    spd.value='4'; spd.dispatchEvent(new Event('input',{bubbles:true}));
    return JSON.stringify({ label: sr.getElementById('spdV').textContent,
      stored: d.defaultView ? '' : '',
      ls: (function(){ try { return localStorage.getItem('agent-motion'); } catch(e){ return 'ERR'; } })() });
  })()`) || {};
  const okB = b.label === '4.2×';
  log('── 滑块调速        ' + (okB ? 'PASS' : 'FAIL') + '  显示=' + b.label + ' 记忆=' + b.ls);
  if (!okB) bad++;

  /* 预设菜单展开 + 选 1× */
  await evalx(`(function(){
    var d=document.querySelector('.embed-frame').contentDocument, sr=d.getElementById('host-ops').shadowRoot;
    sr.getElementById('spdq').click();
    return 1;
  })()`);
  await sleep(300);
  const c1 = await evalx(`(function(){
    var d=document.querySelector('.embed-frame').contentDocument, sr=d.getElementById('host-ops').shadowRoot;
    var m=sr.getElementById('spdQ');
    return JSON.stringify({hidden:m.hidden, rect: (function(){var r=m.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),top:Math.round(r.top),right:Math.round(r.right)};})()});
  })()`) || {};
  await shot('aiagent-调速控件.png');
  const c2 = await evalx(`(function(){
    var d=document.querySelector('.embed-frame').contentDocument, sr=d.getElementById('host-ops').shadowRoot;
    var m=sr.getElementById('spdQ'); m.querySelector('button[data-i="0"]').click();
    return JSON.stringify({ label: sr.getElementById('spdV').textContent, hidden: m.hidden,
      on: (function(){var b=m.querySelector('button.on');return b?b.textContent.trim():'';})() });
  })()`) || {};
  const okC = c1.hidden === false && c1.rect.w > 80 && c2.label === '1×' && c2.hidden === true && c2.on === '1×';
  log('── 预设菜单        ' + (okC ? 'PASS' : 'FAIL') + '  展开=' + JSON.stringify(c1.rect) +
    ' 选中后=' + c2.label + ' 收起=' + c2.hidden + ' 高亮=' + c2.on);
  if (!okC) bad++;

  /* 不影响暂停 / 主题 / 稳定性 */
  const d = await evalx(`(function(){
    var f=document.querySelector('.embed-frame'), doc=f.contentDocument, sr=doc.getElementById('host-ops').shadowRoot;
    sr.getElementById('pause').click();
    var p1 = sr.getElementById('pause').getAttribute('aria-pressed');
    sr.getElementById('pause').click();
    var p2 = sr.getElementById('pause').getAttribute('aria-pressed');
    sr.getElementById('theme').click();
    var th = sr.host.dataset.theme || 'auto';
    sr.getElementById('theme').click();
    var cfl = sr.getElementById('cfl').textContent, st = sr.getElementById('cflst').textContent;
    return JSON.stringify({p1:p1,p2:p2,th:th,cfl:cfl,st:st});
  })()`) || {};
  const okD = d.p1 === 'true' && d.p2 === 'false' && (d.th === 'light' || d.th === 'dark') && d.st === 'OK';
  log('── 不影响其它功能  ' + (okD ? 'PASS' : 'FAIL') + '  暂停=' + d.p1 + '/' + d.p2 +
    ' 主题切换=' + d.th + ' CFL=' + d.cfl + ' ' + d.st);
  if (!okD) bad++;

  const errOk = errors.length === 0;
  log(errOk && bad === 0 ? '\n✅ 速度控件 4/4 通过' : '\n❌ ' + bad + ' 项失败' + (errors.length ? '  err=' + errors[0] : ''));
  fs.writeFileSync(path.join(ROOT, '_spd_out.txt'), LOG.join('\n'), 'utf8');
  try { child.kill(); } catch (e) {}
  process.exit(0);
})().catch(e => { console.log('FATAL ' + e.message); process.exit(1); });
