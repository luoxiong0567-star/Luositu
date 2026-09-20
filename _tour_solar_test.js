// 太阳系讲解模式验证：进入 / 7 步导航 / 相机飞行 / 暂停冻结 / 退出 + 截图
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9441;
const URL_BASE = 'file:///C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light/web/index.html';

function httpReq(url, method) {
  return new Promise((res, rej) => {
    const req = http.request(url, { method: method || 'GET' }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(d));
    });
    req.on('error', rej); req.end();
  });
}

/* 面板与引擎就位检查 */
const EXPR_SETUP = `(function(){
  var out = {};
  out.ctls = document.querySelectorAll('#panel .ctl').length;
  var btn = Array.prototype.filter.call(document.querySelectorAll('#panel button.btn'),
    function(b){ return /讲解/.test(b.textContent); });
  out.tourBtn = btn.length ? btn[0].textContent : '';
  out.tourLib = typeof HL.Tour === 'function';
  var inst = HL.manager && HL.manager.inst;
  out.hasSetParam = !!(inst && inst.setParam);
  return JSON.stringify(out);
})()`;

/* 进入讲解 → 收集 7 步标题 → 检查相机飞行与冻结 → 退出 */
const EXPR_TOUR = `(function(){
  var out = { titles: [] };
  var inst = HL.manager && HL.manager.inst;
  if (!inst) return JSON.stringify({ err: 'no inst' });
  var ui0 = document.getElementById('hlTour');
  out.domExists = !!ui0;

  inst.setParam('tour');
  var ui = document.getElementById('hlTour');
  out.shown = !!(ui && ui.classList.contains('show'));
  // 找地球 group 用于冻结检测
  var scene = HL.manager.scene || (HL.manager.ctx && HL.manager.ctx.scene);
  var earth = null;
  if (scene) scene.traverse(function(o){
    if (!earth && o.userData && o.userData.info && /Earth/.test(o.userData.info.title)) earth = o.parent;
  });
  out.hasEarth = !!earth;
  var next = ui.querySelector('.gt-next'), prev = ui.querySelector('.gt-prev');
  for (var i = 0; i < 7; i++) {
    out.titles.push({
      step: ui.querySelector('.gt-step').textContent,
      t: ui.querySelector('.gt-title').textContent,
      exp: (ui.querySelector('.gt-exp').textContent || '').slice(0, 18),
      expShown: ui.querySelector('.gt-exp').style.display !== 'none'
    });
    if (i < 6) next.click();
  }
  return JSON.stringify(out);
})()`;

/* 步进到第 4 步（地球）后：相机是否飞行、模拟是否冻结、脉冲是否可见 */
const EXPR_STATE = `(function(){
  var out = {};
  var ui = document.getElementById('hlTour');
  var cam = HL.manager.camera || (HL.manager.ctx && HL.manager.ctx.camera);
  var scene = HL.manager.scene || (HL.manager.ctx && HL.manager.ctx.scene);
  var earth = null, pulse = null;
  scene.traverse(function(o){
    if (!earth && o.userData && o.userData.info && /Earth/.test(o.userData.info.title)) earth = o.parent;
    if (!pulse && o.type === 'Group' && o.userData && o.userData.r1 && o.visible) pulse = o;
  });
  out.step = ui.querySelector('.gt-step').textContent;
  out.cam = cam ? [Math.round(cam.position.x*10)/10, Math.round(cam.position.y*10)/10, Math.round(cam.position.z*10)/10] : null;
  out.earth = earth ? [Math.round(earth.position.x*100)/100, Math.round(earth.position.z*100)/100] : null;
  out.pulseVisible = !!pulse;
  out.pulsePos = pulse ? [Math.round(pulse.position.x*10)/10, Math.round(pulse.position.z*10)/10] : null;
  return JSON.stringify(out);
})()`;

(async () => {
  const child = execFile(EDGE, [
    '--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-gl=swiftshader',
    '--no-first-run', '--disable-features=msEdgeNewTabPage',
    '--user-data-dir=' + path.join(ROOT, '_edge_tsolar'),
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
  const evalx = async (expr) => {
    const ev = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    try { return JSON.parse(ev.result.value); } catch (e) { return null; }
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const LOG = [];
  const log = s => { LOG.push(s); console.log(s); };
  let bad = 0;

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: URL_BASE + '?_t=' + Date.now() + '#solar' });
  await sleep(4200);

  // 1. 就位检查
  const s1 = await evalx(EXPR_SETUP);
  const ok1 = s1 && s1.tourLib && s1.hasSetParam && /讲解/.test(s1.tourBtn || '') && s1.ctls >= 5;
  if (!ok1) bad++;
  log('── 1 引擎就位        ' + (ok1 ? 'PASS' : 'FAIL') + '  HL.Tour=' + (s1 || {}).tourLib +
    ' 按钮「' + ((s1 || {}).tourBtn || '') + '」 面板控件=' + ((s1 || {}).ctls));

  // 2. 七步导航
  const s2 = await evalx(EXPR_TOUR);
  const oks = s2 && s2.shown && s2.titles.length === 7 && s2.titles[6].step === '7 / 7' &&
    s2.titles.every(x => x.t && x.expShown);
  if (!oks) bad++;
  log('── 2 七步导航        ' + (oks ? 'PASS' : 'FAIL') + '  步骤数=' + ((s2 || {}).titles || []).length +
    ' 末步=' + (((s2 || {}).titles || [])[6] || {}).step);
  ((s2 || {}).titles || []).forEach(x => log('     ' + x.step + '  ' + x.t + '   💡' + x.exp + '…'));

  // 3. 回到第 4 步（地球）：相机飞行 + 冻结 + 脉冲
  await evalx(`(function(){ var ui=document.getElementById('hlTour');
    ui.querySelector('.gt-exit').click();                 // 先退出（第2步结束时仍停在第7步）
    HL.manager.inst.setParam('tour');                     // 重新进入 → 第1步
    var n=ui.querySelector('.gt-next'); n.click(); n.click(); n.click();  // → 第4步（地球）
    return '1'; })()`);
  await sleep(2000);
  const s3 = await evalx(EXPR_STATE);
  await sleep(1500);
  const s3b = await evalx(EXPR_STATE);
  const frozen = s3 && s3b && JSON.stringify(s3.earth) === JSON.stringify(s3b.earth);
  const farFromOrigin = s3 && s3.earth && (Math.abs(s3.cam[0]) + Math.abs(s3.cam[2])) > 5;
  const pulseOnEarth = s3 && s3.pulseVisible && s3.earth && s3.pulsePos &&
    Math.abs(s3.pulsePos[0] - s3.earth[0]) < 0.3 && Math.abs(s3.pulsePos[1] - s3.earth[1]) < 0.3;
  const ok3 = frozen && farFromOrigin && pulseOnEarth;
  if (!ok3) bad++;
  log('── 3 第4步·地球      ' + (ok3 ? 'PASS' : 'FAIL') + '  step=' + (s3 || {}).step +
    ' 相机=' + JSON.stringify((s3 || {}).cam) + ' 地球=' + JSON.stringify((s3 || {}).earth));
  log('     冻结=' + frozen + ' 脉冲跟随=' + pulseOnEarth + ' 脉冲位置=' + JSON.stringify((s3 || {}).pulsePos));

  // 截图（第 4 步：地球 + 旁白卡片）
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  if (shot && shot.data) fs.writeFileSync(path.join(ROOT, 'docs', 'solar-讲解模式.png'), Buffer.from(shot.data, 'base64'));

  // 第 2 步（太阳）截图
  await evalx(`(function(){ var ui=document.getElementById('hlTour');
    ui.querySelector('.gt-prev').click(); ui.querySelector('.gt-prev').click(); return '1'; })()`);
  await sleep(1800);
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  if (shot2 && shot2.data) fs.writeFileSync(path.join(ROOT, 'docs', 'solar-讲解模式-太阳.png'), Buffer.from(shot2.data, 'base64'));

  // 4. 退出
  const s4 = await evalx(`(function(){ var ui=document.getElementById('hlTour');
    ui.querySelector('.gt-exit').click();
    return JSON.stringify({ shown: ui.classList.contains('show') }); })()`);
  const ok4 = s4 && s4.shown === false;
  if (!ok4) bad++;
  log('── 4 退出讲解        ' + (ok4 ? 'PASS' : 'FAIL') + '  show=' + (s4 || {}).shown);

  // 5. 退出后恢复运行
  const s5 = await evalx(EXPR_STATE);
  await sleep(1200);
  const s5b = await evalx(EXPR_STATE);
  const resumed = s5 && s5b && JSON.stringify(s5.earth) !== JSON.stringify(s5b.earth);
  if (!resumed) bad++;
  log('── 5 恢复公转        ' + (resumed ? 'PASS' : 'FAIL') + '  ' + JSON.stringify((s5 || {}).earth) +
    ' → ' + JSON.stringify((s5b || {}).earth));

  if (errors.length) { bad++; log('── 6 运行时异常      FAIL  ' + errors.slice(0, 3).join(' | ')); }
  else log('── 6 运行时异常      PASS  无');

  log(bad ? '\n❌ ' + bad + ' 项失败' : '\n✅ 太阳系讲解模式 6/6 通过');
  fs.writeFileSync(path.join(ROOT, '_tour_solar_out.txt'), LOG.join('\n'), 'utf8');
  try { ws.close(); } catch (e) {}
  try { child.kill(); } catch (e) {}
  process.exit(0);
})().catch(e => {
  fs.writeFileSync(path.join(ROOT, '_tour_solar_out.txt'), 'FATAL ' + e.message, 'utf8');
  process.exit(1);
});
