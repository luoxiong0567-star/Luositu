// 查找 main.js 动画循环 & gravity Hud 构造 & titlebar/panel CSS
const fs = require('fs');
const p = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light/web/';
const out = [];
function dump(tag, s, i, before, after) {
  out.push('===== ' + tag + ' =====');
  out.push(s.slice(Math.max(0, i - (before || 200)), i + (after || 500)));
}
{
  const s = fs.readFileSync(p + 'js/main.js', 'utf8');
  let i = s.indexOf('function animate');
  if (i < 0) i = s.indexOf('function tick');
  if (i < 0) i = s.indexOf('render(');
  dump('main loop', s, i, 300, 900);
  const j = s.indexOf('function init()');
  out.push('===== init 尾部（找启动调用） =====');
  out.push(s.slice(j + 1400, j + 2600));
}
{
  const s = fs.readFileSync(p + 'js/scenes/gravity/gravity.js', 'utf8');
  const i = s.indexOf('function Hud');
  dump('Hud ctor', s, i, 100, 1600);
}
{
  const s = fs.readFileSync(p + 'css/main.css', 'utf8');
  const i = s.indexOf('#titlebar');
  dump('titlebar css', s, i, 0, 700);
  const k = s.indexOf('#panel {');
  dump('panel css', s, k, 0, 500);
}
fs.writeFileSync('C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light/_probe2.txt', out.join('\n'), 'utf8');
console.log('ok');
