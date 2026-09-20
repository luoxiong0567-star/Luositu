// 验证 git commit message 实际存储字节是否为正确 UTF-8
const { execFileSync } = require('child_process');
const fs = require('fs');
const GIT = 'C:/Users/CMCC/.workbuddy/binaries/PortableGit/versions/1.2.0/cmd/git.exe';
const H = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const out = execFileSync(GIT, ['-C', H, 'log', '-1', '--format=%s'], { encoding: 'buffer' });
fs.writeFileSync(H + '/_git_verify.txt',
  'bytes-as-utf8: ' + out.toString('utf8') + '\nstrlen: ' + out.length + '\n', 'utf8');
console.log('ok');
