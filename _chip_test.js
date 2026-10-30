// 「硅基芯片 · GB300 托盘」专项验证：渲染 / 点击拆解 / 详情 / 复位 / 讲解 / 移动端
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9511 + Math.floor(Math.random() * 60);
const BASE = 'file:///C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light/web/index.html';

function httpReq(url, method) {
  return new Promise((res, rej) => {
    const req = http.request(url, { method: method || 'GET' }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(d));
    });
    req.on('error', rej); req.end();
  });
}
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = execFile(EDGE, [
    '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=swiftshader',
    '--no-first-run', '--disable-features=msEdgeNewTabPage',
    '--user-data-dir=' + path.join(ROOT, '_edge_chip2'),
    '--window-size=1440,900', '--hide-scrollbars', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, 'about:blank'
  ], () => {});
  child.stderr.on('data', () => {});

  let tabs = null;
  for (let i = 0; i < 60; i++) {
    await wait(250);
    try { tabs = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/list')); if (tabs && tabs.length) break; } catch (e) {}
  }
  if (!tabs || !tabs.length) { console.log('ERR: CDP not ready'); child.kill(); process.exit(1); }

  let bad = 0;
  function mkTab(t) {
    let mid = 0; const pend = {}; const errors = [];
    const ws = new WebSocket(t.webSocketDebuggerUrl);
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
    return {
      errors, send,
      async open(url, waitMs) {
        await new Promise(r => { if (ws.readyState === 1) r(); else ws.onopen = r; });
        await send('Page.enable'); await send('Runtime.enable');
        await send('Page.navigate', { url });
        await wait(waitMs || 5000);
      },
      async evalx(expr) {
        const ev = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
        let v = null;
        if (ev && ev.result && typeof ev.result.value === 'string') { try { v = JSON.parse(ev.result.value); } catch (e) {} }
        return v;
      },
      async shot(file) {
        const s = await send('Page.captureScreenshot', { format: 'png' });
        if (s && s.data) fs.writeFileSync(path.join(ROOT, 'docs', file), Buffer.from(s.data, 'base64'));
        return !!(s && s.data);
      },
      close: async () => { try { ws.close(); } catch (e) {} await httpReq('http://127.0.0.1:' + PORT + '/json/close/' + t.id).catch(() => {}); }
    };
  }

  const PROBE = `(function(){
    var m = HL.manager, inst = m && m.inst, s = inst && inst._chipState ? inst._chipState() : null;
    var card = document.getElementById('ckCard');
    return JSON.stringify({
      hud: !!document.querySelector('.chip-hud'),
      rows: document.querySelectorAll('.ck-row').length,
      kpi: document.querySelectorAll('.ck-k').length,
      tags: document.querySelectorAll('.ck-tag').length,
      cardName: card ? ((card.querySelector('.ck-name')||{}).textContent || '') : '',
      cardText: card ? card.textContent.replace(/\\s+/g,' ').slice(0,120) : '',
      selected: s ? s.sel : null,
      explodeAll: s ? s.explodeAll : null,
      t: s ? s.t : [],
      calls: s ? s.calls : -1, tris: s ? s.tris : -1,
      nan: s ? s.nan : true,
      inspect: !!(document.querySelector('.chip-hud')||{}).classList &&
               document.querySelector('.chip-hud').classList.contains('inspect')
    });
  })()`;

  async function newTab(url) {
    const t = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(url), 'PUT'));
    return { tab: t, r: mkTab(t) };
  }

  /* ============ A. 桌面 ============ */
  {
    const nt = await newTab('about:blank');
    const r = nt.r;
    await r.open(BASE + '?_t=' + Date.now() + '#chip', 5600);

    const v = await r.evalx(PROBE) || {};
    const ok = v.hud && v.rows === 7 && v.tags === 6 &&
      v.calls > 20 && v.tris > 3000 && !v.nan && !r.errors.length;
    if (!ok) bad++;
    console.log('── 默认整机        ' + (ok ? 'PASS' : 'FAIL') +
      '  清单=' + v.rows + ' 标注=' + v.tags +
      ' draw=' + v.calls + ' tri=' + v.tris + (r.errors.length ? '  !! ' + r.errors[0] : ''));
    await r.shot('chip2-default.png');

    /* 点击左侧 GPU（清单第 1 行） */
    await r.evalx('document.querySelectorAll(".ck-row")[0].click()');
    await wait(1800);
    const v1 = await r.evalx(PROBE) || {};
    const ok1 = v1.selected === 'ga' && v1.t[0] > 0.55 && v1.t[1] < 0.2 &&
      /Blackwell/.test(v1.cardName) && v1.inspect && !r.errors.length;
    if (!ok1) bad++;
    console.log('── 点击 GPU 拆解   ' + (ok1 ? 'PASS' : 'FAIL') +
      '  sel=' + v1.selected + ' t0=' + v1.t[0] + ' t1=' + v1.t[1] +
      ' 卡="' + v1.cardName + '" draw=' + v1.calls);
    await r.shot('chip2-gpu.png');

    /* 点击 CPU */
    await r.evalx('document.querySelectorAll(".ck-row")[2].click()');
    await wait(1900);
    const v2 = await r.evalx(PROBE) || {};
    const ok2 = v2.selected === 'cpu' && v2.t[2] > 0.5 && v2.t[0] < 0.15 &&
      /Grace/.test(v2.cardName) && v2.cardText.length > 40 && !r.errors.length;
    if (!ok2) bad++;
    console.log('── 点击 CPU 拆解   ' + (ok2 ? 'PASS' : 'FAIL') +
      '  t_cpu=' + v2.t[2] + ' t_gpu=' + v2.t[0] + ' 卡文本=' + v2.cardText.length + '字');
    await r.shot('chip2-cpu.png');

    /* 全部拆解 */
    await r.evalx('HL.manager.inst.setParam("explodeAll")');
    await wait(3200);
    const v3 = await r.evalx(PROBE) || {};
    const ok3 = v3.explodeAll === true && v3.t.every(x => x > 0.6) && !r.errors.length;
    if (!ok3) bad++;
    console.log('── 全部拆解        ' + (ok3 ? 'PASS' : 'FAIL') + '  t=' + JSON.stringify(v3.t));
    await r.shot('chip2-all.png');

    /* 复位 */
    await r.evalx('HL.manager.inst.setParam("resetView")');
    await wait(1700);
    const v4 = await r.evalx(PROBE) || {};
    const ok4 = v4.explodeAll === false && v4.selected === null && v4.t.every(x => x < 0.15) &&
      !v4.inspect && !r.errors.length;
    if (!ok4) bad++;
    console.log('── 复位            ' + (ok4 ? 'PASS' : 'FAIL') + '  t=' + JSON.stringify(v4.t));

    /* 讲解模式走 3 步 */
    const tv = await r.evalx(`(function(){
      HL.manager.inst.setParam('tour');
      var ui = document.getElementById('hlTour');
      var out = { shown: !!(ui && ui.classList.contains('show')),
        t1: ui ? (ui.querySelector('.gt-title')||{}).textContent : '',
        s1: ui ? (ui.querySelector('.gt-step')||{}).textContent : '' };
      var nx = ui && ui.querySelector('.gt-next');
      for (var i = 0; i < 2 && nx; i++) nx.click();
      out.t2 = ui ? (ui.querySelector('.gt-title')||{}).textContent : '';
      out.step = ui ? (ui.querySelector('.gt-step')||{}).textContent : '';
      var ex = ui && ui.querySelector('.gt-exit'); if (ex) ex.click();
      out.after = !!(ui && ui.classList.contains('show'));
      return JSON.stringify(out);
    })()`) || {};
    const okt = tv.shown && tv.t2 !== tv.t1 && tv.step && !tv.after && !r.errors.length;
    if (!okt) bad++;
    console.log('── 讲解模式        ' + (okt ? 'PASS' : 'FAIL') +
      '  1st="' + (tv.t1 || '').slice(0, 20) + '" → "' + (tv.t2 || '').slice(0, 20) + '" ' + (tv.step || ''));

    const fps = await r.evalx(`(function(){ return new Promise(function(res){
      var n = 0, t0 = performance.now();
      function f(){ n++; if (performance.now() - t0 < 1800) requestAnimationFrame(f); else res('' + Math.round(n / ((performance.now()-t0)/1000))); }
      requestAnimationFrame(f); }); })()`) || '0';
    console.log('   软渲染帧率        ' + fps + ' fps（SwiftShader 参考值）');

    if (r.errors.length) { bad++; console.log('   !! JS 错误：' + r.errors.join(' | ')); }
    else console.log('   NO JS ERRORS');
    await r.close();
  }

  /* ============ B. 移动端 ============ */
  {
    const t = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent('about:blank'), 'PUT'));
    const r = mkTab(t);
    await r.open(BASE + '?_m=' + Date.now() + '#chip', 5400);
    await r.send('Emulation.setDeviceMetricsOverride', { width: 420, height: 860, deviceScaleFactor: 2, mobile: true });
    await wait(1400);

    const vis = await r.evalx(`(function(){ return JSON.stringify({
      inner: window.innerWidth,
      tags: getComputedStyle(document.querySelector('.ck-labels')).display,
      list: getComputedStyle(document.getElementById('ckList')).display,
      rowH: (document.querySelector('.ck-row')||{}).offsetHeight || 0,
      listW: document.getElementById('ckList').scrollWidth
    }); })()`) || {};
    const st = await r.evalx(PROBE) || {};
    const okm = vis.tags === 'none' && vis.list === 'flex' &&
      vis.rowH > 24 && vis.listW > vis.inner &&
      st.calls > 20 && !st.nan && !r.errors.length;
    if (!okm) bad++;
    console.log('── 移动端 420px    ' + (okm ? 'PASS' : 'FAIL') +
      '  行高=' + vis.rowH + ' 清单宽=' + vis.listW + ' draw=' + st.calls);
    await r.shot('chip2-mobile.png');

    /* 移动端点击清单 → 出详情卡 */
    await r.evalx('document.querySelectorAll(".ck-row")[0].click()');
    await wait(1700);
    const cardDisp = await r.evalx(`(function(){ return JSON.stringify(getComputedStyle(document.getElementById('ckCard')).display); })()`);
    const st2 = await r.evalx(PROBE) || {};
    const okm2 = cardDisp === 'block' && st2.selected === 'ga' && st2.t[0] > 0.5 && !r.errors.length;
    if (!okm2) bad++;
    console.log('   移动端拆解        ' + (okm2 ? 'PASS' : 'FAIL') + '  卡片=' + cardDisp + ' t0=' + st2.t[0]);
    await r.shot('chip2-mobile-gpu.png');

    if (r.errors.length) { bad++; console.log('   !! JS 错误：' + r.errors.join(' | ')); }
    await r.close();
  }


  child.kill();
  console.log(bad === 0 ? '\nALL PASS' : '\nFAILED: ' + bad);
  process.exit(bad === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
