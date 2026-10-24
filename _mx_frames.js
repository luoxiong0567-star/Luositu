const { execFile } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9481;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function httpReq(url, method) {
  return new Promise((res, rej) => {
    const req = http.request(url, { method: method || 'GET' }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); });
    req.on('error', rej); req.end();
  });
}
(async () => {
  const child = execFile(EDGE, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader','--use-gl=swiftshader',
    '--no-first-run','--user-data-dir=' + path.join(ROOT, '_edge_mxf'),
    '--window-size=1440,880','--hide-scrollbars','--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT,'about:blank'], () => {});
  child.stderr.on('data', () => {});
  let tabs = null;
  for (let i = 0; i < 60; i++) { await sleep(250); try { tabs = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/list')); if (tabs && tabs.length) break; } catch (e) {} }
  const url = 'file:///' + ROOT + '/web/index.html?home=0#maxwell';
  const t = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(url), 'PUT'));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });
  let mid = 0; const pend = {};
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend[m.id]) { pend[m.id](m.result); delete pend[m.id]; } };
  const send = (method, params) => new Promise(res => { const i = ++mid; pend[i] = res; ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result && r.result.value; };
  await sleep(4500);
  await ev(`(function(){ document.getElementById('panel').style.display='none'; document.getElementById('titlebar').style.display='none'; document.getElementById('sidebar').style.display='none'; HL.manager.inst.setParam('view','C'); return 1; })()`);
  const cams = [
    ['A', [12.6, 6.6, 18.5], [12.6, 4.2, 0]],
    ['B', [12.6, 7.2, 23], [12.6, 4.4, 0]],
    ['C', [12.6, 8.0, 27], [12.6, 4.2, 0]],
    ['D', [12.6, 6.2, 14.5], [12.6, 3.9, 0]]
  ];
  for (const [n, pos, tgt] of cams) {
    await ev(`(function(){
      var c = HL.manager.controls, cam = c.camera;
      cam.position.set(${pos[0]},${pos[1]},${pos[2]});
      c.target.set(${tgt[0]},${tgt[1]},${tgt[2]});
      c.syncFromCamera(); c.saveHome();
      return 1; })()`);
    await sleep(900);
    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ROOT, 'docs', 'mx-' + n + '.png'), Buffer.from(s.data, 'base64'));
    console.log('SAVED mx-' + n + '.png');
  }
  try { child.kill(); } catch (e) {}
  process.exit(0);
})().catch(e => { console.log('FATAL ' + e.message); process.exit(1); });
