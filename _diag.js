// 诊断：隔离副本页面加载状态
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9399;

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
    '--user-data-dir=' + path.join(ROOT, '_edge_diag'),
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

  const url = 'file:///C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light/_iso/HumanLight.html';
  const t = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent('about:blank'), 'PUT'));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });
  let mid = 0; const pend = {}; const errors = []; const consoleMsgs = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend[m.id]) { pend[m.id](m.result); delete pend[m.id]; return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push(((d.exception && (d.exception.description || d.exception.value)) || d.text || '').slice(0, 300));
    }
    if (m.method === 'Runtime.consoleAPICalled') {
      consoleMsgs.push(m.params.type + ': ' + (m.params.args || []).map(a => a.value || a.description || '').join(' ').slice(0, 200));
    }
    if (m.method === 'Page.loadEventFired') consoleMsgs.push('EVENT Page.loadEventFired');
  };
  const send = (method, params) => new Promise(res => {
    const i = ++mid; pend[i] = res;
    ws.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
  await send('Page.enable'); await send('Runtime.enable');
  const nav = await send('Page.navigate', { url });
  const out = [];
  out.push('navigate resp: ' + JSON.stringify(nav));
  await new Promise(r => setTimeout(r, 8000));
  const ev = await send('Runtime.evaluate', {
    expression: 'JSON.stringify({href:location.href.slice(0,120), ready:document.readyState, title:document.title, hasHL:!!window.HL, hasThree:!!window.THREE, bodyLen:(document.body?document.body.innerHTML.length:-1)})',
    returnByValue: true
  });
  out.push('eval: ' + (ev.result ? JSON.stringify(ev.result.value || ev.result.description || ev.result) : 'none'));
  out.push('--- exceptions ---'); errors.slice(0, 10).forEach(e => out.push(e));
  out.push('--- console ---'); consoleMsgs.slice(0, 20).forEach(c => out.push(c));
  fs.writeFileSync(path.join(ROOT, '_diag_out.txt'), out.join('\n'), 'utf8');
  try { child.kill(); } catch (e) {}
  process.exit(0);
})().catch(e => { console.log('FATAL ' + e.message); process.exit(1); });
