// 动物细胞 / DNA 场景多机位截图
// 用法：node _cell_shots.js [animalcell|molecule]
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9377;

function httpReq(url, method) {
  return new Promise((res, rej) => {
    const req = http.request(url, { method: method || 'GET' }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(d));
    });
    req.on('error', rej); req.end();
  });
}

const SHOTS = {
  animalcell: [
    ['overview', '', 'cell-overview.png'],
    ['nucleus', '', 'cell-nucleus.png'],
    ['membrane', '', 'cell-membrane.png'],
    ['mito', '', 'cell-mito.png']
  ],
  molecule: [
    ['dna', '', 'dna-helix.png'],
    ['alpha', '', 'dna-alpha.png'],
    ['beta', '', 'dna-beta.png'],
    ['dna2', 'close', 'dna-close.png']
  ]
};

(async () => {
  const scene = process.argv[2] || 'animalcell';
  const child = execFile(EDGE, [
    '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=swiftshader',
    '--no-first-run', '--disable-features=msEdgeNewTabPage',
    '--user-data-dir=' + path.join(ROOT, '_edge_shots2'),
    '--window-size=1440,860', '--hide-scrollbars', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, 'about:blank'
  ], () => {});
  child.stderr.on('data', () => {});

  let tabs = null;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { tabs = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/list')); if (tabs && tabs.length) break; } catch (e) {}
  }
  if (!tabs || !tabs.length) { console.log('ERR: CDP not ready'); child.kill(); process.exit(1); }

  const url = 'file:///' + ROOT + '/web/index.html#' + scene;
  const t = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(url), 'PUT'));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });
  let mid = 0; const pend = {}; const errors = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend[m.id]) { pend[m.id](m.result); delete pend[m.id]; return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push(((d.exception && (d.exception.description || d.exception.value)) || d.text || '').split('\n')[0]);
    }
  };
  const send = (method, params) => new Promise(res => {
    const i = ++mid; pend[i] = res;
    ws.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r && r.result ? r.result.value : null;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await new Promise(r => setTimeout(r, 6000));
  // 关闭自转并复位姿态：β 片层侧对镜头时会看成一根针，截图必须固定朝向
  await ev('(function(){ HL.manager.inst.setParam("spin", false); HL.manager.inst.setParam("mode", "dna"); return 1 })()');
  await new Promise(r => setTimeout(r, 400));

  async function shot(file) {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    if (s && s.data) {
      fs.writeFileSync(path.join(ROOT, 'docs', file), Buffer.from(s.data, 'base64'));
      console.log('SAVED docs/' + file + '  ' + (fs.statSync(path.join(ROOT, 'docs', file)).size / 1024).toFixed(0) + ' KB');
    }
  }

  for (const [key, mode, file] of SHOTS[scene]) {
    if (scene === 'animalcell') {
      await ev(`window.__CELL.set('view','${key}')`);
    } else {
      await ev(`HL.manager.inst.setParam('mode','${key === 'dna2' ? 'dna' : key}')`);
      if (mode === 'close') {
        await ev(`(function(){var c=HL.manager.camera,ct=HL.manager.controls;
          c.position.set(2.5,2.2,10.5); ct.target.set(0,1.2,0); ct.syncFromCamera(); return 1})()`);
      }
    }
    await new Promise(r => setTimeout(r, 2200));
    await shot(file);
  }

  // 手机竖屏 + 平板竖屏：窄屏下必须在画面里「读得出来」，不能被栏板挤成一条缝
  if (scene === 'animalcell') {
    const CASES = [
      [414, 896, 2, true, 'overview', 'cell-mobile.png'],
      [414, 896, 2, true, 'membrane', 'cell-mobile-membrane.png'],
      [768, 1024, 2, true, 'overview', 'cell-tablet.png']
    ];
    for (const [w, h, dpr, mob, view, file] of CASES) {
      await send('Emulation.setDeviceMetricsOverride', {
        width: w, height: h, deviceScaleFactor: dpr, mobile: mob
      });
      await new Promise(r => setTimeout(r, 400));
      await ev(`window.__CELL.set('view','${view}')`);
      await new Promise(r => setTimeout(r, 2400));
      await shot(file);
    }
    await send('Emulation.clearDeviceMetricsOverride');
  }
  const st = await ev(scene === 'animalcell' ? 'JSON.stringify(window.__CELL.state())' : 'JSON.stringify({fps:document.querySelector("#fps").textContent})');
  console.log('STATE ' + st);
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 5).join('\n') : 'ERRORS: none');

  try { ws.close(); } catch (e) {}
  await httpReq('http://127.0.0.1:' + PORT + '/json/close/' + t.id).catch(() => {});
  try { child.kill(); } catch (e) {}
  process.exit(0);
})().catch(e => { console.log('FATAL ' + e.message); process.exit(1); });
