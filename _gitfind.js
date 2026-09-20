const fs = require('fs');
const out = [];
const cands = [
  'C:/Users/CMCC/.workbuddy/binaries/PortableGit/versions/1.2.0/bin/git.exe',
  'C:/Program Files/Git/bin/git.exe',
  'C:/Program Files/Git/cmd/git.exe',
  'C:/Program Files (x86)/Git/bin/git.exe',
  'C:/Users/CMCC/AppData/Local/Programs/Git/bin/git.exe'
];
for (const c of cands) out.push((fs.existsSync(c) ? 'FOUND ' : 'no    ') + c);
try {
  out.push('--- PortableGit/1.2.0 root ---');
  for (const f of fs.readdirSync('C:/Users/CMCC/.workbuddy/binaries/PortableGit/versions/1.2.0')) out.push('  ' + f);
} catch (e) { out.push('readdir fail: ' + e.message); }
fs.writeFileSync('C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light/_gitfind.txt', out.join('\n'), 'utf8');
console.log('ok');
