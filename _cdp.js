// CDP 截图工具：spawn Edge headless(new) + DevTools 协议，截图并收集页面异常
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9333;

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
  const url = process.argv[2];
  const out = process.argv[3];
  const waitMs = parseInt(process.argv[4] || '8000', 10);

  const child = execFile(EDGE, [
    '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=swiftshader',
    '--no-first-run', '--disable-features=msEdgeNewTabPage',
    '--user-data-dir=' + ROOT + '/_edge_tmp2',
    '--window-size=1200,700', '--hide-scrollbars', '--allow-file-access-from-files',
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

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: url });          // 显式导航：/json/new 的 url 参数未必生效
  await new Promise(r => setTimeout(r, waitMs));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot && shot.data) {
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    console.log('SAVED ' + out + ' ' + fs.statSync(out).size);
  } else {
    console.log('NO_SHOT');
  }

  // 页面诊断
  const diag = await send('Runtime.evaluate', { expression: 'JSON.stringify({title:document.title, note:(document.getElementById("panelNote")||{}).innerHTML||"", fp: (document.querySelector("#fps")||{}).textContent||""})' });
  console.log('DIAG ' + (diag && diag.result ? diag.result.value : '(none)'));

  if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 8).join('\n---\n'));
  else console.log('ERRORS: none');

  try { child.kill(); } catch (e) {}
  process.exit(0);
}

main().catch(e => { console.log('FATAL ' + e.message); process.exit(1); });
