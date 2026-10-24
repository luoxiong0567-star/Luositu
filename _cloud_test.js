/**
 * 观展回声（云服务）验证脚本
 * 用法：node _cloud_test.js <url> <offline|live> [截图路径]
 *   offline —— file:// 单文件版：应降级为「离线」说明，场景不受影响
 *   live    —— 线上 HTTPS：应读通云端留言，并能提交一条新留言后读回
 */
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9344;

function req(url, method) {
  return new Promise((res, rej) => {
    const r = http.request(url, { method: method || 'GET' }, resp => {
      let d = '';
      resp.on('data', c => d += c);
      resp.on('end', () => res(d));
    });
    r.on('error', rej);
    r.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const url = process.argv[2];
  const mode = process.argv[3] || 'offline';
  const shot = process.argv[4];

  const child = execFile(EDGE, [
    '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=swiftshader',
    '--no-first-run', '--disable-features=msEdgeNewTabPage',
    '--user-data-dir=' + ROOT + '/_edge_cloud',
    '--window-size=1400,900', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, 'about:blank'
  ], () => {});
  child.stderr.on('data', () => {});

  let tabs = null;
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    try {
      tabs = JSON.parse(await req('http://127.0.0.1:' + PORT + '/json/list'));
      if (tabs && tabs.length) break;
    } catch (e) { /* not ready */ }
  }
  if (!tabs || !tabs.length) { console.log('ERR CDP 未就绪'); child.kill(); process.exit(1); }

  const t = JSON.parse(await req('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(url), 'PUT'));
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
    const r = await send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await sleep(mode === 'live' ? 7000 : 3500);

  const results = [];
  const probe = `(function(){
    var w = document.getElementById('hlWall');
    var st = (window.HL && HL.Cloud) ? HL.Cloud.status() : 'no-module';
    var s = w ? w.querySelector('.hl-wall-state') : null;
    var send = w ? w.querySelector('.hl-wall-send') : null;
    return {
      scenes: HL.allScenes().length,
      cards: document.querySelectorAll('.gal-card').length,
      wall: !!w,
      status: st,
      stateText: s ? s.textContent : null,
      notes: document.querySelectorAll('.hl-note').length,
      locked: send ? send.disabled : null
    };
  })()`;

  const a = await evalJs(probe);
  results.push(['场景数量 14', a.scenes === 14, 'scenes=' + a.scenes]);
  results.push(['目录卡片 14', a.cards === 14, 'cards=' + a.cards]);
  results.push(['留言板已挂载', a.wall === true, 'wall=' + a.wall]);

  if (mode === 'offline') {
    results.push(['离线降级状态', a.status === 'offline', 'status=' + a.status]);
    results.push(['离线说明文案', /离线/.test(a.stateText || ''), 'text=' + a.stateText]);
    results.push(['离线时禁用提交', a.locked === true, 'locked=' + a.locked]);
  } else {
    results.push(['云服务就绪', a.status === 'ready', 'status=' + a.status + ' text=' + a.stateText]);
    results.push(['读到云端留言', a.notes >= 1, 'notes=' + a.notes]);

    const text = '自动化验证 ' + new Date().toISOString().slice(11, 19) + ' 观展回声往返测试';
    const sent = await evalJs(`(function(){
      var w = document.getElementById('hlWall');
      var ta = w.querySelector('.hl-wall-text');
      var nk = w.querySelector('.hl-wall-nick');
      ta.value = ${JSON.stringify(text)};
      ta.dispatchEvent(new Event('input', {bubbles:true}));
      nk.value = '验证机器人';
      w.querySelector('.hl-wall-send').click();
      return ta.value;
    })()`);
    results.push(['表单已填充', sent === text, 'value.len=' + (sent || '').length]);
    await sleep(3500);

    const b = await evalJs(`(function(){
      var w = document.getElementById('hlWall');
      var notes = HL.Cloud.notes();
      var first = w.querySelector('.hl-note p');
      var ta = w.querySelector('.hl-wall-text');
      return {
        status: HL.Cloud.status(),
        count: notes.length,
        first: first ? first.textContent : null,
        cleared: ta.value === '',
        stateText: w.querySelector('.hl-wall-state').textContent
      };
    })()`);
    results.push(['提交后清空输入框', b.cleared === true, 'cleared=' + b.cleared]);
    results.push(['新留言出现在列表首位', b.first === text, 'first=' + (b.first || '').slice(0, 40)]);
    results.push(['无错误提示', !b.stateText, 'state=' + b.stateText]);
  }

  if (shot) {
    await evalJs(`(function(){
      var w = document.getElementById('hlWall');
      if (w) w.scrollIntoView({block:'center'});
      return true;
    })()`);
    await sleep(700);
    const png = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(shot, Buffer.from(png.data, 'base64'));
    results.push(['截图已保存', true, shot]);
  }

  let pass = 0;
  const lines = results.map(r => {
    if (r[1]) pass++;
    return (r[1] ? 'PASS  ' : 'FAIL  ') + r[0] + '  (' + r[2] + ')';
  });
  const report = lines.join('\n') + '\n---\n' + pass + '/' + results.length + ' 通过' +
    (errors.length ? '\n页面异常:\n' + errors.slice(0, 6).join('\n') : '\n页面异常: 无');
  fs.writeFileSync(ROOT + '/_cloud_out.txt', report, 'utf8');
  console.log(report);
  ws.close();
  child.kill();
  process.exit(pass === results.length && !errors.length ? 0 : 1);
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
