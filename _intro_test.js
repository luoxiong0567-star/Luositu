// 作品介绍页渲染验证：断言结构 + 分段截图
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9351;
const TARGET = path.join(ROOT, 'release', '人类之光-作品介绍.html');

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

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const child = execFile(EDGE, [
    '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=swiftshader',
    '--no-first-run', '--hide-scrollbars',
    '--user-data-dir=' + ROOT + '/_edge_intro',
    '--window-size=1440,900',
    '--remote-debugging-port=' + PORT, 'about:blank'
  ], () => {});
  child.stderr.on('data', () => {});

  let tabs = null;
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    try {
      tabs = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/list'));
      if (tabs && tabs.length) break;
    } catch (e) {}
  }
  if (!tabs || !tabs.length) { console.log('ERR: CDP not ready'); child.kill(); process.exit(1); }

  const t = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/new?about:blank', 'PUT'));
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
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push(m.params.args.map(a => a.value || a.description || '').join(' '));
    }
  };
  function send(method, params) {
    return new Promise(res => {
      const i = ++mid;
      pend[i] = res;
      ws.send(JSON.stringify({ id: i, method, params: params || {} }));
    });
  }
  async function evalJs(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r && r.exceptionDetails) return { __err: r.exceptionDetails.text };
    return r && r.result ? r.result.value : undefined;
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false
  });

  const url = 'file:///' + encodeURI(TARGET.replace(/\\/g, '/')).replace(/^file:\/\/\//, '');
  await send('Page.navigate', { url: url });
  await sleep(2000);

  // ---- 结构断言 ----
  const probe = await evalJs(`(function(){
    var q = function(s){ return document.querySelectorAll(s); };
    var rows = q('#index tbody tr').length;
    var cards = q('.gal-card').length;
    return JSON.stringify({
      title: document.title,
      ready: document.readyState,
      rows: rows,
      chapters: q('.chap').length,
      highlights: q('.hlcard').length,
      screens: q('.screen').length,
      minis: q('.mc').length,
      reveals: q('.reveal').length,
      revealsIn: q('.reveal.in').length,
      opsNodes: (document.getElementById('opsNodes')||{childNodes:{length:-1}}).childNodes.length,
      nnNodes: (document.getElementById('nnNodes')||{childNodes:{length:-1}}).childNodes.length,
      nnLinks: (document.getElementById('nnLinks')||{childNodes:{length:-1}}).childNodes.length,
      height: document.documentElement.scrollHeight,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      progW: (document.getElementById('prog')||{}).style ? document.getElementById('prog').style.width : '?',
      font: getComputedStyle(document.body).fontFamily,
      h1size: getComputedStyle(document.querySelector('h1')).fontSize
    });
  })()`);
  console.log('PROBE ' + probe);

  // ---- 分段截图 ----
  const shots = [
    { name: 'intro-01-hero.png', y: 0 },
    { name: 'intro-02-chapters.png', y: 1180 },
    { name: 'intro-03-highlights.png', y: 2600 },
    { name: 'intro-04-screens.png', y: 4050 },
    { name: 'intro-05-index.png', y: 6150 }
  ];
  for (const s of shots) {
    await evalJs('window.scrollTo(0,' + s.y + ')');
    await sleep(1700);
    const diag = await evalJs(`(function(){
      var c = document.querySelectorAll('.chap')[0];
      var r = c ? c.getBoundingClientRect() : null;
      return JSON.stringify({
        y: Math.round(window.scrollY),
        inCnt: document.querySelectorAll('.reveal.in').length,
        chapTop: r ? Math.round(r.top) : null,
        chapOp: c ? getComputedStyle(c).opacity : null
      });
    })()`);
    console.log('  @' + s.name + ' ' + diag);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    if (shot && shot.data) {
      const out = path.join(ROOT, 'docs', s.name);
      fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
      console.log('SAVED ' + s.name + ' ' + fs.statSync(out).size);
    }
  }

  // 进度条随滚动
  const p2 = await evalJs('document.getElementById("prog").style.width');
  console.log('PROG_AT_END ' + p2);

  // ---- 手机端（390 × 844）----
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 2, mobile: true
  });
  await evalJs('window.scrollTo(0,0)');
  await sleep(900);
  const mobiles = [
    { name: 'intro-m1-hero.png', target: null },
    { name: 'intro-m2-chapters.png', target: '#chapters' },
    { name: 'intro-m3-screens.png', target: '#screens' }
  ];
  for (const m of mobiles) {
    if (m.target) await evalJs('document.querySelector("' + m.target + '").scrollIntoView({block:"start"})');
    else await evalJs('window.scrollTo(0,0)');
    await sleep(1400);
    const ms = await send('Page.captureScreenshot', { format: 'png' });
    if (ms && ms.data) {
      const out = path.join(ROOT, 'docs', m.name);
      fs.writeFileSync(out, Buffer.from(ms.data, 'base64'));
      console.log('SAVED ' + m.name + ' ' + fs.statSync(out).size);
    }
  }
  const mchk = await evalJs(`JSON.stringify({
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    docW: document.documentElement.scrollWidth,
    cliW: document.documentElement.clientWidth,
    h1: getComputedStyle(document.querySelector('h1')).fontSize,
    statCols: getComputedStyle(document.querySelector('.stat')).flexBasis
  })`);
  console.log('MOBILE ' + mchk);

  if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 6).join('\n---\n'));
  else console.log('ERRORS: none');

  try { child.kill(); } catch (e) {}
  process.exit(0);
}

main().catch(e => { console.log('FATAL ' + e.message); process.exit(1); });
