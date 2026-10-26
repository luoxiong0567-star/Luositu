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
// math 是 DOM 展示层（没有 3D 画布）：先滚到第一章，再截 .mlab 顶部 16:9 区域
// 用法：node _thumbs.js            全部重拍
//       node _thumbs.js math       只重拍指定场景（合并进已有 thumbs.js，不清空其它）
const SHOTS = [
  { id: 'solar', q: '' },
  { id: 'cosmos', q: '', pre: 'HL.manager.inst.setParam("view","galaxy");' },
  { id: 'periodic', q: '?chamber=1&Z=26' },
  { id: 'neural', q: '' },
  {
    id: 'math', q: '', dom: '.mlab', ratio: true,
    pre: 'document.querySelector(".ml-scroll").scrollTop = document.querySelectorAll(".ml-sec")[0].offsetTop - 6;'
  },
  { id: 'interference', q: '' },
  { id: 'molecule', q: '' },
  { id: 'animalcell', q: '' },
  { id: 'brain', q: '' },
  { id: 'fourier', q: '' },
  { id: 'emwave', q: '' },
  { id: 'photosynthesis', q: '?level=mol' },
  { id: 'maxwell', q: '' },
  { id: 'massenergy', q: '?act=balance' },
  { id: 'gravity', q: '?g=escape' },
  { id: 'aiagent', q: '' },
  { id: 'neuralnet', q: '' }
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
  const ONLY = process.argv.slice(2);
  const list = ONLY.length ? SHOTS.filter(s => ONLY.indexOf(s.id) >= 0) : SHOTS;
  if (!list.length) { console.log('no such scene: ' + ONLY.join(',')); process.exit(1); }

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
  for (const s of list) {
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

    // 场景预处理（如滚到指定章节），再给画布 / 布局一点时间稳下来
    if (s.pre) {
      await send('Runtime.evaluate', { expression: s.pre });
      await new Promise(r => setTimeout(r, 1300));
    }

    // 隐藏 UI 遮层，取 canvas（或 DOM 展示层）实际矩形
    const sel = s.dom ? JSON.stringify(s.dom) : null;
    const rect = await send('Runtime.evaluate', {
      expression: `(function(){
        var st=document.createElement('style');
        st.textContent='#panel,#titlebar,#hint,#tooltip,#gravHud{display:none !important}';
        document.head.appendChild(st);
        var el=${sel ? 'document.querySelector(' + sel + ')' : "document.getElementById('gl')"};
        var r=el.getBoundingClientRect();
        var hh=${s.ratio ? 'Math.round(r.width*9/16)' : 'r.height'};
        return JSON.stringify({x:r.left,y:r.top,w:r.width,h:hh});
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

  const target = path.join(ROOT, 'web/js/data/thumbs.js');

  // 只重拍部分场景时，把结果合并进已有 thumbs.js，避免其它场景被清空
  if (ONLY.length && fs.existsSync(target)) {
    const src = fs.readFileSync(target, 'utf8');
    const m = src.match(/HL\.THUMBS = ([\s\S]*?);\s*\}\)\(window\);/);
    if (m) {
      try {
        const prev = JSON.parse(m[1]);
        Object.keys(prev).forEach(k => { if (!out[k]) out[k] = prev[k]; });
        console.log('MERGED with existing ' + Object.keys(prev).length + ' shots');
      } catch (e) { console.log('WARN: 已有 thumbs.js 解析失败，按全量写出'); }
    }
  }

  const body = '// 自动生成：场景缩略图（CDP 真实渲染截图，JPEG data URI）\n' +
    '// 重新生成：node _thumbs.js\n' +
    '(function (global) {\n  var HL = global.HL = global.HL || {};\n  HL.THUMBS = ' +
    JSON.stringify(out, null, 2) + ';\n})(window);\n';
  fs.writeFileSync(target, body, 'utf8');
  console.log('WROTE ' + target + '  ' + (fs.statSync(target).size / 1024).toFixed(1) + ' KB');

  try { child.kill(); } catch (e) {}
  process.exit(0);
}

main().catch(e => { console.log('FATAL ' + e.message); process.exit(1); });
