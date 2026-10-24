// 开篇页 + 五分钟速览：截图与状态校验
// 用法：node _home_test.js [all|home|journey]
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9391;
const MODE = process.argv[2] || 'all';

function httpReq(url, method) {
  return new Promise((res, rej) => {
    const req = http.request(url, { method: method || 'GET' }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(d));
    });
    req.on('error', rej); req.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

const CANVAS_INK = `(function(){
  var c = document.querySelector('.hm-sky');
  if (!c) return -1;
  var x = c.getContext('2d');
  var w = c.width, h = c.height;
  var d = x.getImageData(0, 0, w, h).data;
  var lit = 0;
  for (var i = 3; i < d.length; i += 4 * 37) if (d[i] > 8) lit++;
  return Math.round(lit / (d.length / (4 * 37)) * 1000) / 10;
})()`;

(async () => {
  const child = execFile(EDGE, [
    '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=swiftshader',
    '--no-first-run', '--disable-features=msEdgeNewTabPage',
    '--user-data-dir=' + path.join(ROOT, '_edge_home_b'),
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1440,880', '--hide-scrollbars', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, 'about:blank'
  ], () => {});
  child.stderr.on('data', () => { });

  let tabs = null;
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    try { tabs = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/list')); if (tabs && tabs.length) break; } catch (e) { }
  }
  if (!tabs || !tabs.length) { console.log('ERR: CDP not ready'); child.kill(); process.exit(1); }

  const url = 'file:///' + ROOT + '/web/index.html';
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
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push('console: ' + (m.params.args[0] && m.params.args[0].value));
    }
  };
  const send = (method, params) => new Promise(res => {
    const i = ++mid; pend[i] = res;
    ws.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r && r.exceptionDetails) return 'ERR ' + r.exceptionDetails.text;
    return r && r.result ? r.result.value : null;
  };
  async function shot(file) {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    if (s && s.data) {
      fs.writeFileSync(path.join(ROOT, 'docs', file), Buffer.from(s.data, 'base64'));
      console.log('SAVED docs/' + file + '  ' + (fs.statSync(path.join(ROOT, 'docs', file)).size / 1024).toFixed(0) + ' KB');
    }
  }
  const state = () => ev(`JSON.stringify({
    open: !!(HL.home && HL.home.isOpen()),
    into: document.getElementById('home').classList.contains('into'),
    fin: document.getElementById('home').classList.contains('fin'),
    slide: (function(){ var s = document.querySelector('.hm-slide.on'); return s ? s.querySelector('.hm-st').textContent : null; })(),
    done: document.querySelectorAll('.hm-dots b.done').length,
    ink: ${CANVAS_INK},
    pno: HL.Piano ? HL.Piano.debug() : null
  })`);

  await send('Page.enable'); await send('Runtime.enable');
  await sleep(2300);   // headless 里首次 rAF/合成可能晚到，等稳了再拍开篇

  if (MODE === 'all' || MODE === 'home') {
    await shot('home-1-open.png');
    console.log('OPEN  ' + await state());

    // 逐句定位（时间轴以音乐的 bar 为单位，测试直接跳拍，省去等待）
    for (let i = 1; i <= 4; i++) {
      await ev('HL.home.goto(' + i + ')');
      await sleep(1500);
      console.log('SEG' + i + ' ' + await state());
      await shot('home-2-say' + i + '.png');
    }

    // 走完 → 结语与出口
    await ev('HL.home.goto(5)');
    await sleep(1500);
    console.log('FIN   ' + await state());
    await shot('home-3-fin.png');

    await ev('document.querySelector(".hm-enter").click()');
    await sleep(1500);
    await shot('home-gallery.png');
    console.log('GAL   ' + await ev('JSON.stringify({show: document.getElementById("gallery").classList.contains("show"), cards: document.querySelectorAll(".gal-card").length, piano: HL.Piano.playing()})'));
  }

  if (MODE === 'all' || MODE === 'journey') {
    console.log('SCRIPT ' + await ev(`JSON.stringify(HL.JOURNEY.map(function(s){
      var b = s.beats || (s.scene ? [s] : []);
      return {k: s.kind || 'scene', ms: s.kind==='open'? s.dur : b.reduce(function(a,x){return a+(x.ms||0)},0),
              n: b.length, sc: b.map(function(x){return x.scene}).join('+'), t: s.title};
    }))`));

    await ev(`(function(){
      HL.JOURNEY.forEach(function(s){
        if (s.kind === 'open') s.dur = 2600;
        (s.beats||[]).forEach(function(b){ b.ms = 2200; b.fly = 900; });
      });
    })()`);

    await ev('HL.startJourney()');
    await sleep(3200);
    console.log('JR    ' + await ev('JSON.stringify({piano: HL.Piano ? HL.Piano.debug() : null})'));
    await shot('jr-01-open.png');

    let last = '', shots = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 90000 && shots < 16) {
      const st = await ev('JSON.stringify(HL.journey ? HL.journey.state() : null)');
      if (!st || st === 'null') break;
      const s = JSON.parse(st);
      const key = s.idx + ':' + s.bi + ':' + s.mode;
      if (key !== last) {
        last = key;
        await sleep(1100);
        shots++;
        const tag = s.mode === 'end' ? 'end'
          : (s.idx + 1) + '-' + (s.bi + 1) + '-' + (s.scene || 'art');
        await shot('jr-' + String(shots).padStart(2, '0') + '-' + tag + '.png');
        if (s.mode === 'end') break;
      }
      await sleep(320);
    }

    console.log('END ' + await ev('JSON.stringify({end: document.querySelector(".jr-endcard").classList.contains("show"), btns: document.querySelectorAll(".jr-end-btns button").length})'));

    await ev('document.querySelector(".jr-toHome").click()');
    await sleep(1500);
    console.log('TOHOME ' + await ev('JSON.stringify({home: HL.home.isOpen(), journey: HL.journey.active(), piano: HL.Piano.debug()})'));
    await shot('jr-tohome.png');
  }

  console.log(errors.length ? 'ERRORS: ' + errors.slice(0, 6).join(' | ') : 'NO JS ERRORS');
  try { ws.close(); } catch (e) { }
  try { child.kill(); } catch (e) { }
  process.exit(0);
})();
