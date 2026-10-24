/* 太阳系真实轨道版 · 数值回归
 * 断言：轨道根数、开普勒第一/第二/第三定律、双尺度、时间调速/暂停、拾取提示、讲解模式、帧率
 */
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333 + Math.floor(Math.random() * 400);
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const URL = ROOT ? 'file:///' + ROOT + '/web/index.html#solar' : '';

const get = p => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: PORT, path: p }, r => {
    let b = ''; r.on('data', d => b += d); r.on('end', () => res(b));
  }).on('error', rej);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-solartest-'));
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
    '--use-gl=swiftshader', '--no-first-run', '--window-size=1280,760',
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
  await sleep(9000);

  const tabs = JSON.parse(await get('/json/list'));
  const page = tabs.find(t => t.type === 'page' && t.webSocketDebuggerUrl) || tabs[0];
  const u = new (require('url').URL)(page.webSocketDebuggerUrl);
  const sock = require('net').connect({ host: u.hostname, port: u.port });
  const crypto = require('crypto');
  let buf = Buffer.alloc(0), shake = false, id = 0;
  const waiters = new Map();

  function frame(str) {
    const data = Buffer.from(str), mask = crypto.randomBytes(4);
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
      const payload = buf.slice(off, off + len).toString(); buf = buf.slice(off + len);
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
  await send('Log.enable', {});
  const logs = [];
  // 收集 console / 异常
  sock.on('data', () => {});
  await send('Runtime.evaluate', { expression: "window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(String(e.message))});" });

  async function run(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + expr.slice(0, 80));
    return r.result && r.result.value;
  }

  const results = [];
  const ok = (name, cond, detail) => results.push([name, !!cond, detail === undefined ? '' : String(detail)]);

  /* 1. 数据与场景挂载 */
  const meta = JSON.parse(await run("JSON.stringify(window.__SOLAR ? __SOLAR.meta() : null)"));
  ok('场景已挂载 · 8 颗行星', meta && meta.length === 8, meta && meta.length);
  const merc = meta[0], nep = meta[7];
  ok('水星 a=0.38710 AU / e=0.20563', Math.abs(merc.a - 0.387098) < 1e-5 && Math.abs(merc.e - 0.20563) < 1e-5, 'a=' + merc.a + ' e=' + merc.e);
  ok('海王星 a=30.06992 AU', Math.abs(nep.a - 30.06992) < 1e-5, nep.a);
  ok('倾角: 水星 7.005° / 天王星 0.7726°', Math.abs(merc.inc - 7.005) < 1e-4 && Math.abs(meta[6].inc - 0.7726) < 1e-4, merc.inc + ' / ' + meta[6].inc);

  /* 2. 开普勒第一定律：近日点 / 远日点 = (1-e)/(1+e) */
  const rp = JSON.parse(await run('JSON.stringify(__SOLAR.orbitAtMean(0, 0))'));            // M=0 → 近日点
  const ra = JSON.parse(await run('JSON.stringify(__SOLAR.orbitAtMean(0, Math.PI))'));    // M=π → 远日点
  const d = v => Math.hypot(v[0], v[1], v[2]);
  const aU = 9.2 * Math.pow(merc.a, 0.60);
  ok('近日距 = a(1-e)', Math.abs(d(rp) - aU * (1 - merc.e)) < 1e-3, d(rp).toFixed(4) + ' vs ' + (aU * (1 - merc.e)).toFixed(4));
  ok('远日距 = a(1+e)', Math.abs(d(ra) - aU * (1 + merc.e)) < 1e-3, d(ra).toFixed(4) + ' vs ' + (aU * (1 + merc.e)).toFixed(4));

  /* 3. 开普勒第二定律：近日点角速度 / 远日点角速度 = ((1+e)/(1-e))² */
  const angSpeed = async (M0) => {
    const p1 = JSON.parse(await run('JSON.stringify(__SOLAR.orbitAtMean(0, ' + M0 + '))'));
    const p2 = JSON.parse(await run('JSON.stringify(__SOLAR.orbitAtMean(0, ' + (M0 + 0.001) + '))'));
    const a1 = Math.atan2(p1[2], p1[0]), a2 = Math.atan2(p2[2], p2[0]);
    let da = a2 - a1; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    return Math.abs(da);
  };
  const wPeri = await angSpeed(0.0);
  const wAph = await angSpeed(Math.PI);
  const ratio = wPeri / wAph;
  const expect = Math.pow((1 + merc.e) / (1 - merc.e), 2);
  ok('近日/远日 角速度比 = ((1+e)/(1-e))²', Math.abs(ratio - expect) / expect < 0.02, ratio.toFixed(3) + ' vs ' + expect.toFixed(3));

  /* 4. 开普勒第三定律：T² ∝ a³（年 / AU） */
  const k3 = meta.map(p => Math.pow(p.period / 365.25, 2) / Math.pow(p.a, 3));
  const kMin = Math.min.apply(null, k3), kMax = Math.max.apply(null, k3);
  ok('T²/a³ 恒定（1±1%）', kMin > 0.99 && kMax < 1.01, kMin.toFixed(4) + '–' + kMax.toFixed(4));

  /* 5. 双尺度 */
  const viz = JSON.parse(await run("JSON.stringify(__SOLAR.state())"));
  ok('可视化模式 地球半径 0.34', Math.abs(viz.earthR - 0.34) < 1e-6, viz.earthR);
  ok('可视化模式 海王星轨道 ≈70.9', Math.abs(viz.neptuneA - 70.9) < 0.2, viz.neptuneA.toFixed(2));
  await run("HL.manager.inst.setParam('scale','real')");
  await sleep(900);
  const real = JSON.parse(await run("JSON.stringify(__SOLAR.state())"));
  ok('真实比例 地球半径 = 6371·180/AU', Math.abs(real.earthR - 6371 * 180 / 149597870.7) < 1e-9, real.earthR.toFixed(6));
  ok('真实比例 海王星轨道 = 30.07·180', Math.abs(real.neptuneA - 30.06992 * 180) < 0.5, real.neptuneA.toFixed(1));
  ok('真实比例 太阳半径 ≈0.837', Math.abs(real.sunR - 696000 * 180 / 149597870.7) < 1e-3, real.sunR.toFixed(3));
  await run("HL.manager.inst.setParam('scale','viz')");
  await sleep(900);

  /* 6. 时间加速 / 暂停 */
  await run("HL.manager.inst.setParam('speed',365)");
  const s1 = JSON.parse(await run("JSON.stringify(__SOLAR.state())"));
  await sleep(1000);
  const s2 = JSON.parse(await run("JSON.stringify(__SOLAR.state())"));
  const adv = s2.simDays - s1.simDays;
  ok('365 天/秒：1 秒推进约 365 天', Math.abs(adv - 365) / 365 < 0.25, adv.toFixed(1) + ' 天');

  await run("HL.manager.inst.setParam('pause',true)");
  const p1 = JSON.parse(await run("JSON.stringify(__SOLAR.state())"));
  await sleep(700);
  const p2 = JSON.parse(await run("JSON.stringify(__SOLAR.state())"));
  ok('暂停后时间冻结', Math.abs(p2.simDays - p1.simDays) < 1e-6, (p2.simDays - p1.simDays).toExponential(2));
  await run("HL.manager.inst.setParam('pause',false)");
  await run("HL.manager.inst.setParam('speed',3)");

  /* 7. 时间推进后行星确实移动（水星 10 天应转约 41°） */
  const pos1 = JSON.parse(await run("JSON.stringify(__SOLAR.planets[0].holder.position.toArray())"));
  await sleep(1200);
  const pos2 = JSON.parse(await run("JSON.stringify(__SOLAR.planets[0].holder.position.toArray())"));
  const moved = Math.hypot(pos2[0] - pos1[0], pos2[2] - pos1[2]);
  ok('行星随时间移动', moved > 0.05, 'Δ=' + moved.toFixed(3));

  /* 8. 拾取：点击太阳弹出参数卡 */
  const tip = await run(`(function(){
    var c = HL.manager.camera, v = new THREE.Vector3(0,0,0).project(c);
    HL.manager.inst.onClick({x:v.x, y:v.y, clientX:400, clientY:300});
    var t = document.getElementById('tooltip');
    return JSON.stringify({show:t.classList.contains('show'), title:(t.querySelector('.tt-title')||{}).textContent});
  })()`);
  const tipO = JSON.parse(tip);
  ok('点击太阳弹出参数卡', tipO.show && /太阳/.test(tipO.title || ''), tipO.title);

  /* 9. 讲解模式 9 步 */
  await run("HL.manager.inst.setParam('tour', true)");
  await sleep(1200);
  const tour = JSON.parse(await run(`JSON.stringify({
    show: document.getElementById('hlTour').classList.contains('show'),
    step: (document.querySelector('#hlTour .gt-step')||{}).textContent,
    title: (document.querySelector('#hlTour .gt-title')||{}).textContent
  })`));
  ok('讲解模式可启动', tour.show && /1 \/ 9/.test(tour.step || ''), tour.step + ' ' + tour.title);
  await run("document.querySelector('#hlTour .gt-next').click()");
  await sleep(700);
  const tour2 = JSON.parse(await run("JSON.stringify({step:(document.querySelector('#hlTour .gt-step')||{}).textContent})"));
  ok('讲解可翻页', /2 \/ 9/.test(tour2.step || ''), tour2.step);
  await run("document.querySelector('#hlTour .gt-exit').click()");
  await run('HL.manager.resetView()');
  await sleep(2200);

  /* 10. 帧率与错误 */
  await sleep(1500);
  const fps = parseInt(await run("document.getElementById('fps').textContent"), 10);
  ok('帧率 ≥ 15（headless 软件渲染）', fps >= 15, fps + ' FPS');
  const errs = JSON.parse(await run('JSON.stringify(window.__errs||[])'));
  ok('无运行时报错', errs.length === 0, errs.join(' | '));

  let pass = 0;
  results.forEach(r => {
    if (r[1]) pass++;
    console.log((r[1] ? '✅' : '❌') + ' ' + r[0] + '  ' + r[2]);
  });
  console.log('\n' + (pass === results.length ? '✅ 太阳系 ' : '❌ ') + pass + '/' + results.length + ' 通过');

  /* 截图：宽景 */
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ROOT, 'docs', 'solar-v2-check.png'), Buffer.from(shot.data, 'base64'));

  sock.destroy(); edge.kill();
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
