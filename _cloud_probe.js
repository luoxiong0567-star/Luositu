/**
 * 云服务连通性预检：在应用正式域名下，用 publicConfig + 官方 SDK 跑一次读 / 写往返。
 * 用法：node _cloud_probe.js <https 页面地址>
 */
const { execFile } = require('child_process');
const http = require('http');
const fs = require('fs');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9355;
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

const PROBE = `(async function(){
  var CFG = {
    endpoint: 'https://human-light-science.app.workbuddy.host',
    oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
    publishableKey: 'wbpk_Y66v5Zxi3Wv5gkfYo1yj1N_9quCy1cpdJpK8tjPOycBoA4K94q7eD1L'
  };
  function load(src){ return new Promise(function(res, rej){
    var s = document.createElement('script'); s.src = src;
    s.onload = res; s.onerror = function(){ rej(new Error('sdk-network')); };
    document.head.appendChild(s);
  }); }
  try {
    if (!window.WorkBuddyCloud) {
      await load('https://cdn.jsdelivr.net/npm/@tencent-ai/workbuddy-cloud-sdk@dev/lib/index.global.js');
    }
    var cloud = WorkBuddyCloud.createWorkBuddyCloud(CFG);
    var read = await cloud.database.from('hl_notes').select('id, nick, content, created_at').limit(3);
    if (read.error) return { stage: 'read', error: read.error };
    var text = '连通性预检 ' + new Date().toISOString().slice(11,19);
    var ins = await cloud.database.from('hl_notes').insert({ content: text, scene_id: 'catalog', nick: '预检' }).select('id, content');
    if (ins.error) return { stage: 'insert', error: ins.error, origin: location.origin };
    var back = await cloud.database.from('hl_notes').select('id, content').eq('content', text);
    return {
      stage: 'ok',
      origin: location.origin,
      readCount: (read.data || []).length,
      inserted: (ins.data || []).length,
      readBack: (back.data || []).length,
      rows: read.data || []
    };
  } catch (e) {
    return { stage: 'throw', message: e && e.message };
  }
})()`;

(async () => {
  const url = process.argv[2];
  const child = execFile(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run',
    '--user-data-dir=' + ROOT + '/_edge_probe',
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
  const t = JSON.parse(await req('http://127.0.0.1:' + PORT + '/json/new?' + encodeURIComponent(url), 'PUT'));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });

  let mid = 0; const pend = {};
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend[m.id]) { pend[m.id](m.result); delete pend[m.id]; }
  };
  const send = (method, params) => new Promise(res => {
    const i = ++mid; pend[i] = res;
    ws.send(JSON.stringify({ id: i, method, params: params || {} }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await sleep(4000);
  const r = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true, awaitPromise: true });
  const out = r.exceptionDetails ? { stage: 'exception', text: r.exceptionDetails.text } : r.result.value;
  const line = JSON.stringify(out, null, 2);
  fs.writeFileSync(ROOT + '/_probe_out.txt', line, 'utf8');
  console.log(line);
  ws.close(); child.kill();
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
