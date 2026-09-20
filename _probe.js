// 探查各场景 HUD/浮层 DOM 元素
const fs = require('fs');
const b = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light/web/';
const files = fs.readdirSync(b + 'js/scenes').filter(f => f.endsWith('.js'));
files.push('js/scenes/gravity/gravity.js');
for (const f of files) {
  const s = fs.readFileSync(b + 'js/scenes/' + f, 'utf8');
  const ids = [...new Set((s.match(/id=\\?['"]([\w-]+)/g) || []).map(m => m.replace(/id=\\?['"]/, '')))];
  const cls = [...new Set((s.match(/className = '([^']+)'/g) || []).map(m => m.slice(13, -1)))];
  const style = (s.match(/style\.cssText = '([^']{0,80})/g) || []).map(m => m.slice(17));
  console.log('== ' + f);
  if (ids.length) console.log('   id: ' + ids.join(', '));
  if (cls.length) console.log('   class: ' + cls.join(' | '));
  if (style.length) console.log('   cssText: ' + style.join(' | '));
}
