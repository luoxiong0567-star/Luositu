// 周期表卡片翻面验证：电子排布全覆盖 + 翻转动画 + 正反面渲染 + 功能兼容
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9453;
const URL_BASE = 'file:///C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light/web/index.html';

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
    '--user-data-dir=' + path.join(ROOT, '_edge_flip'),
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
  let bad = 0;

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
  const evalx = async expr => {
    const ev = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    let v = null;
    if (ev.result && typeof ev.result.value === 'string') { try { v = JSON.parse(ev.result.value); } catch (e) {} }
    return v;
  };
  const shot = async file => {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    if (s && s.data) fs.writeFileSync(path.join(ROOT, 'docs', file), Buffer.from(s.data, 'base64'));
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  await send('Page.navigate', { url: URL_BASE + '?debug=1&_t=' + Date.now() + '#periodic' });
  await sleep(4500);

  /* ---------- A. 电子排布全覆盖（对照 SHELL_HINT 参考值 + 例外元素） ---------- */
  {
    const v = await evalx(`(function(){
      var P = window.__PT; if (!P) return JSON.stringify({err:'no debug'});
      var ref = HL.SHELL_HINT || {};
      var match = 0, total = 0;
      for (var z in ref) { total++; if (P.cfg(+z) === ref[z]) match++; }
      return JSON.stringify({
        cfgAll: [1,2,6,26,29,46,57,79,92,103,118].map(function(z){ return z + '=' + P.cfg(z); }),
        hintMatch: match + '/' + total,
        exc24: P.cfg(24), exc79: P.cfg(79), u92: P.cfg(92), og118: P.cfg(118)
      });
    })()`) || {};
    const okCfg = (v.hintMatch || '').indexOf('/') >= 0 && v.hintMatch.split('/')[0] === v.hintMatch.split('/')[1] &&
      v.exc24 === '[Ar]3d⁵4s¹' && v.exc79 === '[Xe]4f¹⁴5d¹⁰6s¹' &&
      v.u92 === '[Rn]5f³6d¹7s²' && v.og118 === '[Rn]5f¹⁴6d¹⁰7s²7p⁶';
    if (!okCfg) bad++;
    log('── 电子排布          ' + (okCfg ? 'PASS' : 'FAIL') + '  SHELL_HINT 对照 ' + v.hintMatch +
      (v.exc24 ? '  Cr=' + v.exc24 + ' Au=' + v.exc79 : '') + (okCfg ? '' : '  ' + JSON.stringify(v)));
  }

  /* ---------- B. 点击翻面：翻转动画 + 背面信息卡 ---------- */
  {
    const v0 = await evalx(`(function(){
      var P = window.__PT;
      var b = P.blocks.filter(function(x){return x.Z===26;})[0];   // Fe
      var front = b.mesh.children[0];
      return JSON.stringify({
        child0: front ? front.position.z : null,
        frontTex: front && front.material.map ? front.material.map.image.width : 0,
        rotBefore: +b.mesh.rotation.y.toFixed(3), hasBackBefore: !!b.back
      });
    })()`) || {};
    const v1 = await evalx(`(function(){
      var P = window.__PT;
      var b = P.blocks.filter(function(x){return x.Z===26;})[0];
      var v = new P.THREE.Vector3().copy(b.mesh.position).project(P.camera);
      P.api.onClick({ x: v.x, y: v.y, clientX: 640, clientY: 380 });
      return JSON.stringify({ flipped: b.ft, started: !!b.anim, backCreated: !!b.back });
    })()`) || {};
    await sleep(180);   // 翻转中（应有中间角度）
    const v2 = await evalx(`(function(){
      var P = window.__PT;
      var b = P.blocks.filter(function(x){return x.Z===26;})[0];
      var back = b.back;
      return JSON.stringify({
        rotMid: +b.mesh.rotation.y.toFixed(3),
        backTex: back && back.material.map ? back.material.map.image.width : 0,
        backZ: back ? back.position.z : null
      });
    })()`) || {};
    await sleep(700);   // 翻转完成
    const v3 = await evalx(`(function(){
      var P = window.__PT;
      var b = P.blocks.filter(function(x){return x.Z===26;})[0];
      return JSON.stringify({
        rotDone: +b.mesh.rotation.y.toFixed(3),
        animNull: !b.anim,
        chamberVis: P.chamber.isVisible(),
        atomLabel: (P.atomRoot.children.length > 0)
      });
    })()`) || {};

    // 飞近 Fe 拍背面截图（同时写 camera 与 controls.target，避免 OrbitControls 回弹）
    await evalx(`(function(){
      var P = window.__PT;
      var b = P.blocks.filter(function(x){return x.Z===26;})[0];
      var p = b.mesh.position;
      P.controls.target.set(p.x, p.y, p.z);
      P.camera.position.set(p.x + 0.3, p.y + 1.2, p.z + 4.6);
      P.camera.lookAt(p.x, p.y, p.z);
      P.controls.syncFromCamera();          // 控制器内部球坐标同步，否则下一帧弹回原距离
      return '1';
    })()`);
    await sleep(600);
    await shot('periodic-翻面-Fe背面.png');

    const okFlip = v0.frontTex === 160 && v0.child0 === 0.12 && v0.hasBackBefore === false &&
      v1.flipped === 1 && v1.backCreated === true &&
      v2.rotMid >= 0 && v2.rotMid < Math.PI - 0.02 && v2.backTex === 256 && v2.backZ === -0.12 &&
      Math.abs(v3.rotDone - Math.PI) < 0.02 && v3.animNull === true &&
      v3.chamberVis === true && v3.atomLabel === true;
    if (!okFlip) bad++;
    log('── 点击翻面          ' + (okFlip ? 'PASS' : 'FAIL') +
      '  起始 rot=' + v0.rotBefore + ' back=' + v0.hasBackBefore +
      ' → 中途 rot=' + v2.rotMid + ' 背面贴图=' + v2.backTex + 'px' +
      ' → 完成 rot=' + v3.rotDone + ' 玻璃舱=' + v3.chamberVis + ' 壳层=' + v3.atomLabel +
      (okFlip ? '' : '  ' + JSON.stringify({ v0, v1, v2, v3 })));
  }

  /* ---------- C. 再点翻回 / 互斥 / 开关关闭 ---------- */
  {
    const v = await evalx(`(function(){
      var P = window.__PT;
      function clickZ(z){
        var b = P.blocks.filter(function(x){return x.Z===z;})[0];
        var v = new P.THREE.Vector3().copy(b.mesh.position).project(P.camera);
        P.api.onClick({ x: v.x, y: v.y, clientX: 640, clientY: 380 });
      }
      var Fe = P.blocks.filter(function(x){return x.Z===26;})[0];
      var O = P.blocks.filter(function(x){return x.Z===8;})[0];
      clickZ(26);                                  // 再点 Fe → 翻回正面
      var flipBackStarted = (Fe.ft === 0);
      clickZ(8);                                   // 点 O → Fe 应保持翻回、O 翻开
      var oFlipped = (O.ft === 1);
      P.api.setParam('flip', false);               // 关闭翻面 → 全部复原
      var feTarget = Fe.ft, oTarget = O.ft;
      return JSON.stringify({ flipBackStarted: flipBackStarted, oFlipped: oFlipped, afterOff: [feTarget, oTarget] });
    })()`) || {};
    await sleep(800);
    const v2 = await evalx(`(function(){
      var P = window.__PT;
      var Fe = P.blocks.filter(function(x){return x.Z===26;})[0];
      var O = P.blocks.filter(function(x){return x.Z===8;})[0];
      return JSON.stringify({ fe: +Fe.mesh.rotation.y.toFixed(3), o: +O.mesh.rotation.y.toFixed(3) });
    })()`) || {};
    const ok = v.flipBackStarted === true && v.oFlipped === true &&
      JSON.stringify(v.afterOff) === '[0,0]' && v2.fe === 0 && v2.o === 0;
    if (!ok) bad++;
    log('── 翻回/互斥/开关    ' + (ok ? 'PASS' : 'FAIL') +
      '  再点翻回=' + v.flipBackStarted + ' 换点互斥=' + v.oFlipped +
      ' 关闭后 ft=' + JSON.stringify(v.afterOff) + ' 终态 rot=[' + v2.fe + ',' + v2.o + ']' +
      (ok ? '' : '  ' + JSON.stringify(v)));
  }

  /* ---------- D. 传统浮层模式仍可用 ---------- */
  {
    const v = await evalx(`(function(){
      var P = window.__PT;
      var b = P.blocks.filter(function(x){return x.Z===6;})[0];
      var v2 = new P.THREE.Vector3().copy(b.mesh.position).project(P.camera);
      P.api.onClick({ x: v2.x, y: v2.y, clientX: 640, clientY: 380 });
      var tt = document.getElementById('tooltip');
      var shown = !!(tt && tt.classList.contains('show') && tt.innerHTML.indexOf('电子排布') >= 0);
      return JSON.stringify({ tooltip: shown, cfgInside: shown ? (tt.innerHTML.indexOf('[He]2s²2p²') >= 0) : false });
    })()`) || {};
    const ok = v.tooltip === true && v.cfgInside === true;
    if (!ok) bad++;
    log('── 浮层兜底模式      ' + (ok ? 'PASS' : 'FAIL') + '  tooltip=' + v.tooltip + ' 全量排布=' + v.cfgInside +
      (ok ? '' : '  ' + JSON.stringify(v)));
  }

  /* ---------- E. 讲解模式兼容 ---------- */
  {
    const v = await evalx(`(function(){
      var inst = HL.manager.inst;
      inst.setParam('tour');
      var ui = document.getElementById('hlTour');
      var shown = !!(ui && ui.classList.contains('show'));
      var exit = ui ? ui.querySelector('.gt-exit') : null;
      if (exit) exit.click();
      return JSON.stringify({ shown: shown, closed: !(ui && ui.classList.contains('show')) });
    })()`) || {};
    const ok = v.shown === true && v.closed === true;
    if (!ok) bad++;
    log('── 讲解模式兼容      ' + (ok ? 'PASS' : 'FAIL') + '  进入=' + v.shown + ' 退出=' + v.closed);
  }

  const errOk = errors.length === 0;
  if (!errOk) bad++;
  log('── 运行时异常        ' + (errOk ? 'PASS' : 'FAIL') + (errOk ? '' : '  ' + errors.join(' | ')));
  log(errOk && bad === 0 ? '\n✅ 周期表翻面全量 ' + (6 - bad) + '/6 通过' : '\n❌ ' + bad + ' 项失败');

  try { ws.close(); } catch (e) {}
  await httpReq('http://127.0.0.1:' + PORT + '/json/close/' + t.id).catch(() => {});
  child.kill();
  process.exit(bad ? 1 : 0);
})();
