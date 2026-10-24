const { execFile } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9483;
const sleep = ms => new Promise(r => setTimeout(r, ms));
function httpReq(url, method) {
  return new Promise((res, rej) => {
    const req = http.request(url, { method: method || 'GET' }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); });
    req.on('error', rej); req.end();
  });
}
(async () => {
  const child = execFile(EDGE, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader','--use-gl=swiftshader',
    '--no-first-run','--user-data-dir=' + path.join(ROOT, '_edge_atomf'),
    '--window-size=1440,880','--hide-scrollbars','--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT,'about:blank'], () => {});
  child.stderr.on('data', () => {});
  let tabs = null;
  for (let i = 0; i < 60; i++) { await sleep(250); try { tabs = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/list')); if (tabs && tabs.length) break; } catch (e) {} }
  const url = 'file:///' + ROOT + '/web/index.html?home=0#periodic';
  const t = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(url), 'PUT'));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });
  let mid = 0; const pend = {};
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pend[m.id]) { pend[m.id](m.result); delete pend[m.id]; } };
  const send = (method, params) => new Promise(res => { const i = ++mid; pend[i] = res; ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result && r.result.value; };
  await sleep(4500);
  console.log('inst ', await ev(`!!(HL.manager.inst && HL.manager.inst.setParam)`));
  await ev(`(function(){
    document.getElementById('panel').style.display='none';
    document.getElementById('titlebar').style.display='none';
    document.getElementById('sidebar').style.display='none';
    HL.manager.inst.setParam('solo', true);
    var c = HL.manager.controls;
    c.camera.position.set(0, 1.2, 10.5);
    c.target.set(0, -0.58, 0);
    c.syncFromCamera(); c.saveHome();
    return 1; })()`);
  const marks = [[1200, 'atom-h'], [4500, 'atom-c'], [7900, 'atom-o'], [11300, 'atom-fe']];
  let prev = 0;
  for (const [ms, name] of marks) {
    await sleep(ms - prev); prev = ms;
    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ROOT, 'docs', name + '.png'), Buffer.from(s.data, 'base64'));
    console.log('SAVED docs/' + name + '.png');
  }
  try { child.kill(); } catch (e) {}
  process.exit(0);
})().catch(e => { console.log('FATAL ' + e.message); process.exit(1); });
