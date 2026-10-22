// 神经网络推理（neuralnet）场景验证（CDP）
// 覆盖：注册与目录归属 / iframe 真渲染 / 推理推进 / Esc 回目录 / 切场景清理 / 侧栏进入 / 快捷键 w
const { execFile } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9499;
const ISO = process.argv[2] === 'iso';
const URL_BASE = ISO
  ? require('url').pathToFileURL(path.join(ROOT, 'release', '人类之光.html')).href
  : 'file:///' + ROOT.replace(/\\/g, '/') + '/web/index.html';
const OUT = ISO ? '_nn_iso_out.txt' : '_nn_out.txt';

function httpReq(u, m) {
  return new Promise((res, rej) => {
    const r = http.request(u, { method: m || 'GET' }, x => { let d = ''; x.on('data', c => d += c); x.on('end', () => res(d)); });
    r.on('error', rej); r.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = execFile(EDGE, ['--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader',
    '--use-gl=swiftshader', '--no-first-run', '--allow-file-access-from-files',
    '--user-data-dir=' + path.join(ROOT, ISO ? '_edge_nn_iso' : '_edge_nn'),
    '--window-size=1600,900', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, 'about:blank'], () => {});
  child.stderr.on('data', () => {});
  let tabs = null;
  for (let i = 0; i < 60; i++) { await sleep(250); try { tabs = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/list')); if (tabs && tabs.length) break; } catch (e) {} }
  const t = JSON.parse(await httpReq('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent('about:blank'), 'PUT'));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });
  let mid = 0; const pend = {}; const errors = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend[m.id]) { pend[m.id](m.result); delete pend[m.id]; return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push((((d.exception && d.exception.description) || d.text || '')).split('\n')[0]);
    }
  };
  const send = (method, params) => new Promise(res => { const i = ++mid; pend[i] = res; ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const evalx = async expr => {
    const ev = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    let v = null;
    if (ev.result && typeof ev.result.value === 'string') { try { v = JSON.parse(ev.result.value); } catch (e) { v = ev.result.value; } }
    return v;
  };
  const shot = async name => {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    if (s && s.data) fs.writeFileSync(path.join(ROOT, 'docs', name), Buffer.from(s.data, 'base64'));
  };
  const LOG = []; const log = s => LOG.push(s);
  let bad = 0;
  await send('Page.enable'); await send('Runtime.enable');

  /* A. 直达 #neuralnet */
  await send('Page.navigate', { url: URL_BASE + '?debug=1&_t=' + Date.now() + '#neuralnet' });
  await sleep(9000);

  const a = await evalx(`JSON.stringify((function(){
    var f = document.querySelector('.embed-frame');
    var d = f ? f.contentDocument : null;
    var st = null, feat = -1, tags = -1, logn = -1, canvas = -1, tr = -1;
    try {
      if (d) {
        st = d.defaultView.__NN ? d.defaultView.__NN.state : null;
        feat = d.querySelectorAll('.feat').length;
        tags = d.querySelectorAll('.tag').length;
        logn = d.querySelectorAll('#log .ln').length;
        canvas = d.querySelectorAll('canvas').length;
        tr = d.querySelector('#trace') ? Math.round(d.querySelector('#trace').getBoundingClientRect().width) : -1;
      }
    } catch (e) {}
    return {
      hasFrame: !!f,
      frames: document.querySelectorAll('.embed-frame').length,
      srcdocKB: f ? Math.round((f.getAttribute('srcdoc') || '').length / 1024) : -1,
      title: d ? d.title : '',
      state: st, feats: feat, tags: tags, logLines: logn, canvas: canvas, traceW: tr,
      active: (function(){var e=document.querySelector('#sceneList .scene-item.active');return e?e.dataset.id:'';})(),
      items: document.querySelectorAll('#sceneList .scene-item').length,
      stageEmbed: document.getElementById('stage').classList.contains('embed-mode'),
      chapterIV: (function(){
        var chs=document.querySelectorAll('#sceneList .scene-chapter');
        var last=chs[chs.length-1]; if(!last) return [];
        var ids=[], n=last.nextElementSibling;
        while(n && !n.classList.contains('scene-chapter')){ if(n.classList.contains('scene-item')) ids.push(n.dataset.id); n=n.nextElementSibling; }
        return ids;
      })()
    };
  })())`) || {};

  const s = a.state || {};
  const okA = a.hasFrame && a.frames === 1 && a.srcdocKB > 30 && a.title.indexOf('神经网络推理') >= 0 &&
    s.step >= 1 && s.parts > 0 && a.feats === 9 && a.tags === 4 && a.logLines >= 10 &&
    a.canvas >= 1 && a.traceW > 200 && a.stageEmbed && a.active === 'neuralnet';
  log('── 直达 #neuralnet ' + (okA ? 'PASS' : 'FAIL') +
    '  srcdoc=' + a.srcdocKB + 'KB step=' + s.step + ' parts=' + s.parts +
    ' out=' + s.out + ' feats=' + a.feats + ' tags=' + a.tags + ' log=' + a.logLines + ' trace=' + a.traceW);
  if (!okA) bad++;

  /* B. 目录归属 */
  const okB = JSON.stringify(a.chapterIV) === JSON.stringify(['neural', 'aiagent', 'neuralnet']) && a.items === 14;
  log('── 章节归属        ' + (okB ? 'PASS' : 'FAIL') + '  ' + JSON.stringify(a.chapterIV) + ' items=' + a.items);
  if (!okB) bad++;

  await shot('neuralnet-场景.png');

  /* C. Esc 回目录 */
  await evalx(`(function(){
    var f=document.querySelector('.embed-frame');
    try { var w=f.contentWindow; w.document.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true})); } catch(e) {}
    return '1';
  })()`);
  await sleep(900);
  const c = await evalx(`JSON.stringify({gal:document.getElementById('gallery').classList.contains('show'),cards:document.querySelectorAll('#gallery .gal-card').length})`) || {};
  const okC = c.gal === true && c.cards === 14;
  log('── Esc 回目录      ' + (okC ? 'PASS' : 'FAIL') + '  目录=' + c.gal + ' cards=' + c.cards);
  if (!okC) bad++;

  /* D. 切场景清理 */
  await evalx(`(function(){ var b=document.querySelector('#sceneList .scene-item[data-id="neural"]'); if(b) b.click(); return '1'; })()`);
  await sleep(2500);
  const d = await evalx(`JSON.stringify({frames:document.querySelectorAll('.embed-frame').length,embed:document.getElementById('stage').classList.contains('embed-mode'),active:(function(){var e=document.querySelector('#sceneList .scene-item.active');return e?e.dataset.id:'';})()})`) || {};
  const okD = d.frames === 0 && d.embed === false && d.active === 'neural';
  log('── 切场景清理      ' + (okD ? 'PASS' : 'FAIL') + '  frames=' + d.frames + ' embed=' + d.embed);
  if (!okD) bad++;

  /* E. 快捷键 w 进入 */
  await send('Page.navigate', { url: URL_BASE + '?debug=1&_t=' + Date.now() });
  await sleep(4500);
  await evalx(`(function(){
    var e=new KeyboardEvent('keydown',{key:'w',bubbles:true});
    document.body.dispatchEvent(e); return '1';
  })()`);
  await sleep(6500);
  const e2 = await evalx(`JSON.stringify({frames:document.querySelectorAll('.embed-frame').length,active:(function(){var x=document.querySelector('#sceneList .scene-item.active');return x?x.dataset.id:'';})()})`) || {};
  const okE = e2.frames === 1 && e2.active === 'neuralnet';
  log('── 快捷键 w 进入   ' + (okE ? 'PASS' : 'FAIL') + '  frames=' + e2.frames + ' active=' + e2.active);
  if (!okE) bad++;

  const errOk = errors.length === 0;
  log(errOk && bad === 0 ? '\n✅ 神经网络推理 5/5 通过' : '\n❌ ' + bad + ' 项失败' + (errors.length ? '  err=' + errors[0] : ''));

  fs.writeFileSync(path.join(ROOT, OUT), LOG.join('\n'), 'utf8');
  try { child.kill(); } catch (e) {}
  process.exit(0);
})().catch(e => { console.log('FATAL ' + e.message); process.exit(1); });
