const { execFile } = require('child_process');
const http = require('http');
const path = require('path');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const PORT = 9388;
const scene = process.argv[2], expr = process.argv[3];
function rq(url, m) { return new Promise((res, rej) => { const r = http.request(url, { method: m || 'GET' }, x => { let d=''; x.on('data',c=>d+=c); x.on('end',()=>res(d)); }); r.on('error', rej); r.end(); }); }
(async () => {
  const child = execFile(EDGE, ['--headless=new','--disable-gpu','--enable-unsafe-swiftshader','--use-gl=swiftshader','--no-first-run','--user-data-dir='+path.join(ROOT,'_edge_q'),'--window-size=1280,760','--allow-file-access-from-files','--remote-debugging-port='+PORT,'about:blank'], () => {});
  child.stderr.on('data', () => {});
  let tabs = null;
  for (let i=0;i<60;i++){ await new Promise(r=>setTimeout(r,250)); try{ tabs=JSON.parse(await rq('http://127.0.0.1:'+PORT+'/json/list')); if(tabs&&tabs.length) break; }catch(e){} }
  const url = 'file:///'+ROOT+'/web/index.html#'+scene;
  const t = JSON.parse(await rq('http://127.0.0.1:'+PORT+'/json/new?'+encodeURIComponent(url),'PUT'));
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>{ws.onopen=r;});
  let mid=0; const pend={};
  ws.onmessage = ev => { const m=JSON.parse(ev.data); if(m.id&&pend[m.id]){pend[m.id](m.result);delete pend[m.id];} };
  const send=(method,params)=>new Promise(res=>{const i=++mid;pend[i]=res;ws.send(JSON.stringify({id:i,method,params:params||{}}));});
  await send('Runtime.enable');
  await new Promise(r=>setTimeout(r,5500));
  const r1 = await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});
  console.log('RESULT', JSON.stringify(r1.result && r1.result.value));
  try{ws.close();}catch(e){}
  try{child.kill();}catch(e){}
  process.exit(0);
})();
