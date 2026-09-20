// 引导浮层验证：首访显示 / 二次不显示 / ?guide=1 强制 + 截图
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9421;
const URL_BASE = 'file:///C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light/web/index.html';

function httpReq(url, method) {
  return new Promise((res, rej) => {
    const req = http.request(url, { method: method || 'GET' }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(d));
    });
    req.on('error', rej); req.end();
  });
}

const EXPR = `(function(){
  var g = document.getElementById('guide');
  return JSON.stringify({
    show: !!(g && g.classList.contains('show')),
    text: g ? g.textContent.replace(/\\s+/g, ' ') : '',
    hintFlash: (document.getElementById('hint')||{}).className || ''
  });
})()`;

(async () => {
  const child = execFile(EDGE, [
    '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=swiftshader',
    '--no-first-run', '--disable-features=msEdgeNewTabPage',
    '--user-data-dir=' + path.join(ROOT, '_edge_guide'),
    '--window-size=1280,760', '--hide-scrollbars', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, 'about:blank'
  ], () => {});
  child.stderr.on('data', () => {});

  let tabs = null;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { tabs = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/list')); if (tabs && tabs.length) break; } catch (e) {}
  }
  if (!tabs || !tabs.length) { console.log('ERR: CDP not ready'); child.kill(); process.exit(1); }

  const LOG = [];
  const log = s => { LOG.push(s); console.log(s); };

  async function open(fragment, waitMs, reset) {
    const t = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent('about:blank'), 'PUT'));
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
    await send('Page.enable'); await send('Runtime.enable');
    // 加时间戳避免「仅 hash 变化不触发页面重载」
    var preUrl = URL_BASE + '?_t=' + Date.now();
    await send('Page.navigate', { url: preUrl });
    await new Promise(r => setTimeout(r, 1200));
    if (reset === 'clear') {
      await send('Runtime.evaluate', { expression: 'try{localStorage.clear()}catch(e){}', returnByValue: true });
    } else if (reset === 'solar-seen') {
      await send('Runtime.evaluate', { expression: 'try{localStorage.setItem("hl.guide.v1","{\\"solar\\":true}")}catch(e){}', returnByValue: true });
    } else if (reset === 'gravity-seen') {
      await send('Runtime.evaluate', { expression: 'try{localStorage.setItem("hl.guide.v1","{\\"gravity\\":true}")}catch(e){}', returnByValue: true });
    }
    var ts = Date.now();
    var full;
    if (fragment.charAt(0) === '#') {
      full = URL_BASE + '?_t=' + ts + fragment;
    } else if (fragment.charAt(0) === '?') {
      var qi = fragment.indexOf('#');
      if (qi >= 0) full = URL_BASE + fragment.slice(0, qi) + '&_t=' + ts + fragment.slice(qi);
      else full = URL_BASE + fragment + '&_t=' + ts;
    } else {
      full = URL_BASE + '?_t=' + ts;
    }
    await send('Page.navigate', { url: full });
    await new Promise(r => setTimeout(r, waitMs || 4500));
    const ev0 = await send('Runtime.evaluate', { expression: EXPR, returnByValue: true });
    let before = null;
    if (ev0.result && typeof ev0.result.value === 'string') { try { before = JSON.parse(ev0.result.value); } catch (e) {} }
    let escShow = null;
    if (reset === 'esc' || reset === 'gravity-seen') {
      await send('Runtime.evaluate', {
        expression: "window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))",
        returnByValue: true
      });
      await new Promise(r => setTimeout(r, 800));
      const evE = await send('Runtime.evaluate', { expression: EXPR, returnByValue: true });
      if (evE.result && typeof evE.result.value === 'string') { try { escShow = JSON.parse(evE.result.value); } catch (e) {} }
    }
    let shot = null;
    if (fragment.indexOf('guide=1') >= 0) {
      const s = await send('Page.captureScreenshot', { format: 'png' });
      if (s && s.data) {
        fs.writeFileSync(path.join(ROOT, 'docs', 'guide-浮层.png'), Buffer.from(s.data, 'base64'));
        shot = 'saved';
      }
    }
    let val = null;
    if (ev0.result && typeof ev0.result.value === 'string') { try { val = JSON.parse(ev0.result.value); } catch (e) {} }
    try { ws.close(); } catch (e) {}
    await httpReq('http://127.0.0.1:' + PORT + '/json/close/' + t.id).catch(() => {});
    return { val, before, escShow, errors, shot };
  }

  let bad = 0;
  // 1. hash 直达（跳过目录）→ 浮层立即显示
  {
    const r = await open('#solar', 3000, 'clear');
    const v = r.val || {};
    const ok = v.show && /左键拖动/.test(v.text) && /右键拖动/.test(v.text) && /滚轮/.test(v.text) && /Esc/.test(v.text) && !r.errors.length;
    if (!ok) bad++;
    log('── 1 直达首访显示    ' + (ok ? 'PASS' : 'FAIL') + '  show=' + v.show + (r.errors.length ? ' !! ' + r.errors[0] : ''));
  }
  // 2. 换一个场景（gravity 首访）
  {
    const r = await open('#gravity', 3000, 'solar-seen');
    const v = r.val || {};
    const ok = v.show && /万有引力/.test(v.text);
    if (!ok) bad++;
    log('── 2 新场景首访显示  ' + (ok ? 'PASS' : 'FAIL') + '  show=' + v.show);
  }
  // 3. 回到 solar（已看过 → 不显示）
  {
    const r = await open('#solar', 3000, 'solar-seen');
    const v = r.val || {};
    const ok = !v.show;
    if (!ok) bad++;
    log('── 3 二次访问不显示  ' + (ok ? 'PASS' : 'FAIL') + '  show=' + v.show);
  }
  // 4. ?guide=1 强制显示 + 截图
  {
    const r = await open('?guide=1#solar', 3000, 'solar-seen');
    const v = r.val || {};
    const ok = v.show && r.shot === 'saved';
    if (!ok) bad++;
    log('── 4 guide=1 强制    ' + (ok ? 'PASS' : 'FAIL') + '  show=' + v.show + ' shot=' + r.shot);
  }
  // 5. 无 hash 启动（目录页开着）→ 不弹；Esc 关目录后补弹
  {
    const r = await open('', 2600, 'gravity-seen');   // solar 未看过 → 关目录后应补弹
    const okA = r.before ? !r.before.show : false;
    const okB = r.escShow ? r.escShow.show === true : false;
    const ok = okA && okB;
    if (!ok) bad++;
    log('── 5 目录启动延迟补弹 ' + (ok ? 'PASS' : 'FAIL') + '  目录页时show=' + (r.before ? r.before.show : '?') + ' 关目录后show=' + (r.escShow ? r.escShow.show : '?'));
  }

  log(bad ? '\n❌ ' + bad + ' 项失败' : '\n✅ 引导浮层 5/5 通过');
  fs.writeFileSync(path.join(ROOT, '_guide_out.txt'), LOG.join('\n'), 'utf8');
  try { child.kill(); } catch (e) {}
  process.exit(0);
})().catch(e => { console.log('FATAL ' + e.message); process.exit(1); });
