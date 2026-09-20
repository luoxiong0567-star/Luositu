/* CDP 求值器：在页面里执行 JS 并打印结果，用于无图像环境下的数值校验 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333 + Math.floor(Math.random() * 400);
const url = process.argv[2];
const expr = process.argv[3];
const wait = parseInt(process.argv[4] || '6000', 10);

function get(p) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: PORT, path: p }, r => {
      let b = ''; r.on('data', d => b += d); r.on('end', () => res(b));
    }).on('error', rej);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-eval-'));
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
    '--use-gl=swiftshader', '--no-first-run', '--user-data-dir=' + dir,
    '--remote-debugging-port=' + PORT, 'about:blank'], { stdio: 'ignore' });

  let list = null;
  for (let i = 0; i < 60; i++) {
    try { list = JSON.parse(await get('/json/list')); break; } catch (e) { await sleep(250); }
  }
  if (!list) { console.log('EDGE_START_FAIL'); edge.kill(); process.exit(1); }

  // 新版 Edge 要求 PUT /json/new
  await new Promise((res, rej) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/json/new?' + encodeURIComponent(url), method: 'PUT' }, r => {
      let b = ''; r.on('data', d => b += d); r.on('end', res);
    });
    req.on('error', rej); req.end();
  }).catch(() => {});

  await sleep(wait);

  const tabs = JSON.parse(await get('/json/list'));
  const page = tabs.find(t => t.type === 'page' && t.webSocketDebuggerUrl) || tabs[0];
  const WS = require('net');
  const crypto = require('crypto');
  const wsUrl = page.webSocketDebuggerUrl;

  // 极简 WS 客户端
  const u = new URL(wsUrl);
  const sock = WS.connect({ host: u.hostname, port: u.port });
  let handshake = false, buf = Buffer.alloc(0), id = 0;
  const waiting = new Map();

  function send(method, params) {
    return new Promise((res, rej) => {
      const myId = ++id;
      waiting.set(myId, { res, rej });
      frame(JSON.stringify({ id: myId, method, params: params || {} }));
    });
  }
  function frame(str) {
    const data = Buffer.from(str);
    const mask = crypto.randomBytes(4);
    const len = data.length;
    let head;
    if (len < 126) head = Buffer.from([0x81, 0x80 | len]);
    else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 0xFE; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 0xFF; head.writeBigUInt64BE(BigInt(len), 2); }
    const masked = Buffer.alloc(len);
    for (let i = 0; i < len; i++) masked[i] = data[i] ^ mask[i % 4];
    sock.write(Buffer.concat([head, mask, masked]));
  }

  sock.on('connect', () => {
    const key = crypto.randomBytes(16).toString('base64');
    sock.write(`GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
  });

  sock.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    if (!handshake) {
      const i = buf.indexOf('\r\n\r\n');
      if (i < 0) return;
      buf = buf.slice(i + 4); handshake = true;
    }
    while (buf.length >= 2) {
      const len0 = buf[1] & 0x7f;
      let off = 2, len = len0;
      if (len0 === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len0 === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (buf.length < off + len) return;
      const payload = buf.slice(off, off + len).toString();
      buf = buf.slice(off + len);
      let msg; try { msg = JSON.parse(payload); } catch (e) { continue; }
      if (msg.id && waiting.has(msg.id)) {
        const w = waiting.get(msg.id); waiting.delete(msg.id);
        msg.error ? w.rej(new Error(JSON.stringify(msg.error))) : w.res(msg.result);
      }
    }
  });

  await new Promise(r => sock.once('connect', r).once('error', r));
  await sleep(400);
  await send('Runtime.enable', {});
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  console.log(JSON.stringify(r.result && r.result.value, null, 1));
  if (r.exceptionDetails) console.log('EXC', JSON.stringify(r.exceptionDetails));
  sock.destroy(); edge.kill();
  process.exit(0);
})().catch(e => { console.log('EVAL_FAIL', e.message); process.exit(1); });
