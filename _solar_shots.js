/* 太阳系多机位截图：全景 / 土星 / 木星 / 地球 / 真实比例 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333 + Math.floor(Math.random() * 400);
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const URL = 'file:///' + ROOT + '/web/index.html#solar';

function get(p) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: PORT, path: p }, r => {
      let b = ''; r.on('data', d => b += d); r.on('end', () => res(b));
    }).on('error', rej);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-solar-'));
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
    '--use-gl=swiftshader', '--no-first-run', '--window-size=1440,900',
    '--user-data-dir=' + dir, '--remote-debugging-port=' + PORT, 'about:blank'], { stdio: 'ignore' });

  let list = null;
  for (let i = 0; i < 80; i++) {
    try { list = JSON.parse(await get('/json/list')); break; } catch (e) { await sleep(250); }
  }
  if (!list) { console.log('EDGE_START_FAIL'); edge.kill(); process.exit(1); }
  await new Promise(res => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/json/new?' + encodeURIComponent(URL), method: 'PUT' }, r => {
      let b = ''; r.on('data', d => b += d); r.on('end', res);
    });
    req.on('error', () => {}); req.end();
  });
  await sleep(8000);

  const tabs = JSON.parse(await get('/json/list'));
  const page = tabs.find(t => t.type === 'page' && t.webSocketDebuggerUrl) || tabs[0];
  const wsUrl = page.webSocketDebuggerUrl;

  const net = require('net');
  const crypto = require('crypto');
  const u = new (require('url').URL)(wsUrl);
  const sock = net.connect({ host: u.hostname, port: u.port });
  let buf = Buffer.alloc(0), shake = false, id = 0;
  const waiters = new Map();

  function frame(str) {
    const data = Buffer.from(str);
    const mask = crypto.randomBytes(4);
    let head;
    if (data.length < 126) head = Buffer.from([0x81, 0x80 | data.length]);
    else if (data.length < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0xFE; head.writeUInt16BE(data.length, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 0xFF; head.writeBigUInt64BE(BigInt(data.length), 2); }
    const masked = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i % 4];
    sock.write(Buffer.concat([head, mask, masked]));
  }
  function send(method, params) {
    return new Promise((res, rej) => {
      const my = ++id; waiters.set(my, { res, rej });
      frame(JSON.stringify({ id: my, method, params: params || {} }));
    });
  }
  sock.on('connect', () => {
    const key = crypto.randomBytes(16).toString('base64');
    sock.write(`GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
  });
  sock.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    if (!shake) { const i = buf.indexOf('\r\n\r\n'); if (i < 0) return; buf = buf.slice(i + 4); shake = true; }
    while (buf.length >= 2) {
      const l0 = buf[1] & 0x7f; let off = 2, len = l0;
      if (l0 === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (l0 === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (buf.length < off + len) return;
      const payload = buf.slice(off, off + len).toString();
      buf = buf.slice(off + len);
      let m; try { m = JSON.parse(payload); } catch (e) { continue; }
      if (m.id && waiters.has(m.id)) {
        const w = waiters.get(m.id); waiters.delete(m.id);
        m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result);
      }
    }
  });
  await new Promise(r => sock.once('connect', r).once('error', r));
  await sleep(400);
  await send('Runtime.enable', {});

  async function evalJs(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result && r.result.value;
  }
  async function shot(name) {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ROOT, 'docs', name), Buffer.from(r.data, 'base64'));
    console.log('SAVED', name);
  }

  // 关闭讲解浮层与首次引导
  await evalJs("document.getElementById('guide') && document.getElementById('guide').classList.remove('show')");

  // 1) 全景
  await shot('solar-v2-wide.png');

  // 2) 土星特写（含环）
  await evalJs(`(function(){
    var it = __SOLAR.planets[5], p = it.holder.position, c = HL.manager.camera, ct = HL.manager.controls;
    c.position.set(p.x + 3.2, p.y + 2.0, p.z + 3.2); ct.target.copy(p); ct.syncFromCamera();
    return 1;
  })()`);
  await sleep(1800);
  await shot('solar-v2-saturn.png');

  // 3) 木星特写
  await evalJs(`(function(){
    var it = __SOLAR.planets[4], p = it.holder.position, c = HL.manager.camera, ct = HL.manager.controls;
    c.position.set(p.x + 3.0, p.y + 1.6, p.z + 3.0); ct.target.copy(p); ct.syncFromCamera();
    return 1;
  })()`);
  await sleep(1800);
  await shot('solar-v2-jupiter.png');

  // 4) 地球特写
  await evalJs(`(function(){
    var it = __SOLAR.planets[2], p = it.holder.position, c = HL.manager.camera, ct = HL.manager.controls;
    c.position.set(p.x + 1.1, p.y + 0.6, p.z + 1.1); ct.target.copy(p); ct.syncFromCamera();
    return 1;
  })()`);
  await sleep(1800);
  await shot('solar-v2-earth.png');

  // 5) 真实比例
  await evalJs("HL.manager.inst.setParam('scale','real')");
  await sleep(2600);
  await shot('solar-v2-real.png');

  const diag = await evalJs("JSON.stringify({fps:document.getElementById('fps').textContent,state:window.__SOLAR.state()})");
  console.log('DIAG', diag);
  sock.destroy(); edge.kill(); process.exit(0);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
