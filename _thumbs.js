// 缩略图生成器：用 CDP 逐场景真实渲染截图 → web/js/data/thumbs.js（JPEG data URI）
// 用法：node _thumbs.js
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9334;
const W = 640, H = 360;           // 缩略图尺寸（16:9）
const WAIT = 7000;                // 每场景渲染等待（ms）
const QUALITY = 58;               // JPEG 质量

// 每个场景的标志性画面（URL 参数 + 场景 id）
const SHOTS = [
  { id: 'solar', q: '' },
  { id: 'periodic', q: '?chamber=1&Z=26' },
  { id: 'neural', q: '' },
  { id: 'math', q: '' },
  { id: 'interference', q: '' },
  { id: 'molecule', q: '' },
  { id: 'fourier', q: '' },
  { id: 'emwave', q: '' },
  { id: 'photosynthesis', q: '?level=mol' },
  { id: 'maxwell', q: '' },
  { id: 'massenergy', q: '?act=balance' },
  { id: 'spacetime', q: '?m=light' },
  { id: 'gravity', q: '?g=escape' }
];

function httpReq(url, method) {
  return new Promise((res, rej) => {
    const req = http.request(url, { method: method || 'GET' }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res(d));
    });
    req.on('error', rej);
    req.end();
  });
}

async function main() {
  const child = execFile(EDGE, [
    '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=swiftshader',
    '--no-first-run', '--disable-features=msEdgeNewTabPage',
    '--user-data-dir=' + ROOT + '/_edge_tmp2',
    '--window-size=1280,760', '--hide-scrollbars',
    '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, 'about:blank'
  ], () => {});
  child.stderr.on('data', () => {});

  let tabs = null;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    try {
      tabs = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/list'));
      if (tabs && tabs.length) break;
    } catch (e) { /* not ready */ }
  }
  if (!tabs || !tabs.length) { console.log('ERR: CDP not ready'); child.kill(); process.exit(1); }

  const out = {};
  for (const s of SHOTS) {
    const url = 'file:///' + ROOT + '/web/index.html' + s.q + '#' + s.id;
    const t = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(url), 'PUT'));
    const ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise(r => { ws.onopen = r; });

    let mid = 0;
    const pend = {};
    const errors = [];
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pend[m.id]) { pend[m.id](m.result); delete pend[m.id]; return; }
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        errors.push((d.exception && (d.exception.description || d.exception.value)) || d.text);
      }
    };
    const send = (method, params) => new Promise(res => {
      const i = ++mid;
      pend[i] = res;
      ws.send(JSON.stringify({ id: i, method, params: params || {} }));
    });

    await send('Page.enable');
    await send('Runtime.enable');
    // 强制画布区域为 640×360（缩略图取景）
    await send('Emulation.setDeviceMetricsOverride',
      { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await new Promise(r => setTimeout(r, WAIT));

    // 隐藏 UI 遮层，取 canvas 实际矩形
    const rect = await send('Runtime.evaluate', {
      expression: `(function(){
        var st=document.createElement('style');
        st.textContent='#panel,#titlebar,#hint,#tooltip,#gravHud{display:none !important}';
        document.head.appendChild(st);
        var r=document.getElementById('gl').getBoundingClientRect();
        return JSON.stringify({x:r.left,y:r.top,w:r.width,h:r.height});
      })()`, returnByValue: true
    });
    const r = JSON.parse(rect.result.value);

    // 裁到 canvas 区域，按目标宽高缩放
    const clip = { x: r.x, y: r.y, width: r.w, height: r.h, scale: W / r.w };
    const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: QUALITY, clip: clip });
    if (shot && shot.data) {
      const b64 = shot.data;
      out[s.id] = 'data:image/jpeg;base64,' + b64;
      console.log(s.id.padEnd(15), (b64.length / 1024).toFixed(1) + ' KB',
        '| errors:', errors.length ? errors[0].slice(0, 90) : 'none');
    } else {
      console.log(s.id.padEnd(15), 'NO_SHOT');
    }
    try { ws.close(); } catch (e) {}
    await httpReq('http://127.0.0.1:' + PORT + '/json/close/' + t.id).catch(() => {});
  }

  const body = '// 自动生成：场景缩略图（CDP 真实渲染截图，JPEG data URI）\n' +
    '// 重新生成：node _thumbs.js\n' +
    '(function (global) {\n  var HL = global.HL = global.HL || {};\n  HL.THUMBS = ' +
    JSON.stringify(out, null, 2) + ';\n})(window);\n';
  const target = path.join(ROOT, 'web/js/data/thumbs.js');
  fs.writeFileSync(target, body, 'utf8');
  console.log('WROTE ' + target + '  ' + (fs.statSync(target).size / 1024).toFixed(1) + ' KB');

  try { child.kill(); } catch (e) {}
  process.exit(0);
}

main().catch(e => { console.log('FATAL ' + e.message); process.exit(1); });
