// 「硅基芯片」立体剖面台 v2 专项验证：宏观堆叠 / 微观下钻 / 芯片切换 / 聚焦 / 讲解模式 / 移动端
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9471 + Math.floor(Math.random() * 60);
const BASE = 'file:///C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light/web/index.html';

function httpReq(url, method) {
  return new Promise((res, rej) => {
    const req = http.request(url, { method: method || 'GET' }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(d));
    });
    req.on('error', rej); req.end();
  });
}

(async () => {
  const child = execFile(EDGE, [
    '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=swiftshader',
    '--no-first-run', '--disable-features=msEdgeNewTabPage',
    '--user-data-dir=' + path.join(ROOT, '_edge_chip'),
    '--window-size=1440,900', '--hide-scrollbars', '--allow-file-access-from-files',
    '--remote-debugging-port=' + PORT, 'about:blank'
  ], () => {});
  child.stderr.on('data', () => {});

  let tabs = null;
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { tabs = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/list')); if (tabs && tabs.length) break; } catch (e) {}
  }
  if (!tabs || !tabs.length) { console.log('ERR: CDP not ready'); child.kill(); process.exit(1); }

  let bad = 0;
  const wait = ms => new Promise(r => setTimeout(r, ms));

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
      errors,
      send,
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

  async function newTab() {
    const t = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent('about:blank'), 'PUT'));
    return mkTab(t);
  }

  const PROBE = `(function(){
    var m = window.HL && HL.manager, inst = m && m.inst, r = m && m.renderer;
    var out = { hud: !!document.querySelector('.chip-hud'),
      stack: document.querySelectorAll('.cp-stack .cp-l').length,
      kpi: document.querySelectorAll('.cp-kpi .cp-k').length,
      legend: document.querySelectorAll('.cp-card .cp-lg').length,
      xsec: !!document.getElementById('cpXsec'),
      toggle: document.querySelectorAll('.cp-toggle button').length,
      labels: Array.prototype.filter.call(document.querySelectorAll('.cp-ld'), function(e){return e.style.display!=='none';}).length,
      calls: r ? r.info.render.calls : -1, tris: r ? r.info.render.triangles : -1,
      nan: m && m.camera ? !(isFinite(m.camera.position.x)&&isFinite(m.camera.position.y)&&isFinite(m.camera.position.z)) : true,
      hint: (document.getElementById('cpHint')||{}).textContent||'' };
    return JSON.stringify(out);
  })()`;

  /* ============ A. 桌面 1440x900 ============ */
  {
    const r = await newTab();
    await r.open(BASE + '?_t=' + Date.now() + '#chip', 5200);

    /* A1. 宏观 GPU 默认态 */
    const v = await r.evalx(PROBE) || {};
    const okA = v.hud && v.stack === 5 && v.kpi === 5 && v.legend === 5 && v.toggle === 2 &&
      v.xsec && v.calls > 0 && v.tris > 1000 && !v.nan && !r.errors.length;
    if (!okA) bad++;
    console.log('── 宏观 GPU 默认    ' + (okA ? 'PASS' : 'FAIL') +
      '  层=' + v.stack + ' KPI=' + v.kpi + ' 图例=' + v.legend + ' 快切=' + v.toggle +
      ' draw=' + v.calls + ' tri=' + v.tris + ' 标注=' + v.labels +
      (r.errors.length ? '  !! ' + r.errors[0] : ''));

    /* A2. 层间距拉满 */
    await r.evalx('HL.manager.inst.setParam("explode", 1)'); await wait(1300);
    const v2 = await r.evalx(PROBE) || {};
    if (!v2.calls || v2.nan || r.errors.length) bad++;
    console.log('   层间距 100%      draw=' + v2.calls + ' tri=' + v2.tris +
      (r.errors.length ? ' !! ' + r.errors[0] : ' PASS'));
    await r.shot('chip-macro-gpu.png');

    /* A3. 点击层叠结构第 3 行（硅中介层）聚焦 */
    await r.evalx('document.querySelectorAll(".cp-stack .cp-l")[2].click()'); await wait(1500);
    const vf = await r.evalx(PROBE) || {};
    const vfOn = await r.evalx(`(function(){ return JSON.stringify({
      on: !!document.querySelector('.cp-stack .cp-l.on'),
      focus: !!document.querySelector('.cp-focus') }); })()`) || {};
    const okF = vf.calls > 0 && !vf.nan && !r.errors.length && vfOn.on && vfOn.focus;
    if (!okF) bad++;
    console.log('   聚焦中介层       ' + (okF ? 'PASS' : 'FAIL') + '  draw=' + vf.calls);
    await r.shot('chip-focus-interposer.png');
    await r.evalx('document.querySelectorAll(".cp-stack .cp-l")[2].click()'); await wait(1200);

    /* A4. 切微观 GPU（SM 单元） */
    await r.evalx('HL.manager.inst.setParam("view","micro")'); await wait(1700);
    const v4 = await r.evalx(PROBE) || {};
    const okM = v4.stack === 5 && v4.legend === 5 && !v4.nan && !r.errors.length;
    if (!okM) bad++;
    console.log('── 微观 SM 单元     ' + (okM ? 'PASS' : 'FAIL') + '  层=' + v4.stack +
      ' 图例=' + v4.legend + ' draw=' + v4.calls + ' tri=' + v4.tris);
    await r.shot('chip-micro-sm.png');

    /* A5. 回宏观 → 切 CPU */
    await r.evalx('HL.manager.inst.setParam("view","macro")'); await wait(1500);
    await r.evalx('HL.manager.inst.setParam("chip","cpu")'); await wait(1900);
    const v5 = await r.evalx(PROBE) || {};
    const okC = v5.stack === 4 && v5.kpi === 5 && !v5.nan && !r.errors.length;
    if (!okC) bad++;
    console.log('── CPU chiplet 宏观 ' + (okC ? 'PASS' : 'FAIL') + '  层=' + v5.stack +
      ' KPI=' + v5.kpi + ' draw=' + v5.calls + ' tri=' + v5.tris);
    await r.shot('chip-macro-cpu.png');

    /* A6. CPU 微观（Zen 5c） */
    await r.evalx('HL.manager.inst.setParam("view","micro")'); await wait(1700);
    const v6 = await r.evalx(PROBE) || {};
    const okC2 = v6.stack === 5 && !v6.nan && !r.errors.length;
    if (!okC2) bad++;
    console.log('── CPU Zen5c 微观   ' + (okC2 ? 'PASS' : 'FAIL') + '  层=' + v6.stack + ' draw=' + v6.calls);
    await r.shot('chip-micro-core.png');

    /* A7. 讲解模式走 3 步 */
    await r.evalx('HL.manager.inst.setParam("view","macro")'); await wait(1500);
    const tv = await r.evalx(`(function(){
      var inst = HL.manager.inst; inst.setParam('tour');
      var ui = document.getElementById('hlTour');
      var out = { shown: !!(ui && ui.classList.contains('show')),
        t1: ui ? (ui.querySelector('.gt-title')||{}).textContent : '',
        s1: ui ? (ui.querySelector('.gt-step')||{}).textContent : '' };
      var nx = ui && ui.querySelector('.gt-next');
      for (var i = 0; i < 3 && nx; i++) nx.click();
      out.t2 = ui ? (ui.querySelector('.gt-title')||{}).textContent : '';
      var ex = ui && ui.querySelector('.gt-exit'); if (ex) ex.click();
      out.after = !!(ui && ui.classList.contains('show'));
      return JSON.stringify(out);
    })()`) || {};
    const okT = tv.shown && tv.s1 && tv.t2 !== tv.t1 && !tv.after && !r.errors.length;
    if (!okT) bad++;
    console.log('── 讲解模式         ' + (okT ? 'PASS' : 'FAIL') +
      '  1st="' + (tv.t1 || '').slice(0, 24) + '" → "' + (tv.t2 || '').slice(0, 24) + '"' +
      ' exit=' + (!tv.after) + (r.errors.length ? ' !! ' + r.errors[0] : ''));

    /* A8. 帧率（软渲染参考值） */
    const fps = await r.evalx(`(function(){ return new Promise(function(res){
      var n = 0, t0 = performance.now();
      function f(){ n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res('' + Math.round(n / ((performance.now()-t0)/1000))); }
      requestAnimationFrame(f); }); })()`) || '0';
    console.log('   软件渲染帧率     ' + fps + ' fps（SwiftShader 软渲染，真机远高于此）');

    if (r.errors.length) { bad++; console.log('   !! JS 错误：' + r.errors.join(' | ')); }
    else console.log('   NO JS ERRORS');
    await r.close();
  }

  /* ============ B. 窄屏 420x860（移动端） ============ */
  {
    const t = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent('about:blank'), 'PUT'));
    const r = mkTab(t);
    await r.open(BASE + '?_m=' + Date.now() + '#chip', 5200);
    await r.send('Emulation.setDeviceMetricsOverride',
      { width: 420, height: 860, deviceScaleFactor: 2, mobile: true });
    await wait(1500);

    const mv = await r.evalx(PROBE) || {};
    const mvVis = await r.evalx(`(function(){ return JSON.stringify({
      kpi: getComputedStyle(document.getElementById('cpKpi')).display,
      card: getComputedStyle(document.getElementById('cpCard')).display,
      stack: getComputedStyle(document.getElementById('cpStack')).display,
      inner: window.innerWidth, toggleH: (document.querySelector('.cp-toggle button')||{}).offsetHeight || 0 }); })()`) || {};
    /* 窄屏 CSS 隐藏：KPI / 图例卡 / 层叠清单；保留：顶栏 + 快切按钮（拇指可点） */
    const okMob = mv.hud && mv.toggle === 2 && mv.calls > 0 && !mv.nan && !r.errors.length &&
      mvVis.kpi === 'none' && mvVis.card === 'none' && mvVis.stack === 'none' &&
      mvVis.inner <= 900 && mvVis.toggleH > 0;
    if (!okMob) bad++;
    console.log('── 移动端 420px     ' + (okMob ? 'PASS' : 'FAIL') +
      '  viewport=' + mvVis.inner + ' KPI=' + mvVis.kpi + ' 图例=' + mvVis.card +
      ' 清单=' + mvVis.stack + ' 快切高=' + mvVis.toggleH + ' draw=' + mv.calls +
      (r.errors.length ? ' !! ' + r.errors[0] : ''));
    await r.shot('chip-mobile.png');

    /* 移动端也能切微观 */
    await r.evalx('HL.manager.inst.setParam("view","micro")'); await wait(1700);
    const mv2 = await r.evalx(PROBE) || {};
    if (!mv2.calls || mv2.nan || r.errors.length) bad++;
    console.log('   移动端微观       draw=' + mv2.calls + ' tri=' + mv2.tris +
      (r.errors.length ? ' !! ' + r.errors[0] : ' PASS'));
    await r.shot('chip-mobile-micro.png');

    if (r.errors.length) { bad++; console.log('   !! JS 错误：' + r.errors.join(' | ')); }
    await r.close();
  }

  try { await httpReq('http://127.0.0.1:' + PORT + '/json/close/' + tabs[0].id); } catch (e) {}
  child.kill();
  console.log(bad === 0 ? '\nALL PASS' : '\nFAILED: ' + bad);
  process.exit(bad === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
