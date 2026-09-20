const fs = require('fs');
const base = 'C:/Users/CMCC/.workbuddy/binaries/PortableGit/versions/1.2.0';
const out = [];
for (const d of [base + '/cmd', base + '/.extracted', base + '/bin']) {
  out.push('== ' + d);
  try { for (const f of fs.readdirSync(d)) out.push('  ' + f); } catch (e) { out.push('  ' + e.message); }
}
fs.writeFileSync(base + '/../../_gitfind2.txt', out.join('\n'), 'utf8');
console.log('ok');
