const fs = require('fs');
const p = 'C:/Users/CMCC/WorkBuddy/2026-09-16-19-12-38/human-light';
const rm = ['_guide_out.txt', '_tour_out.txt', '_git_out.txt', '_git_verify.txt',
  '_edge_guide', '_edge_tour', '_guide_test.js.bak'];
for (const x of rm) {
  try { fs.rmSync(p + '/' + x, { recursive: true, force: true }); } catch (e) { console.log('ERR', x, e.message); }
}
fs.writeFileSync(p + '/_commit_msg.txt',
  'feat: P0 引导浮层 + P1 讲解模式\n' +
  '\n' +
  '- P0-1: git 仓库初始化（本提交为第二个提交；首个为评审基线 f928d71→3437333）\n' +
  '- P0-2: 场景首次引导浮层（localStorage 每场景记忆，4s 倒计时淡出，?guide=1 强制重看；目录页打开时延迟到关目录后补弹；hint 条高亮闪烁）\n' +
  '- P1:   万有引力讲解模式试点——6 子场景各 4~5 步分步旁白（暂停模拟 + 相机缓动飞行 + 脉冲光环高亮 + 💡参数实验建议 + 预设联动：拉格朗日/混沌/黑洞面条化/逃逸临界）\n' +
  '- 验证: _guide_test 5/5 PASS；_tour_test 6/6 PASS；_iso_test 单文件冒烟 10/10 PASS\n' +
  '- 发布: release/人类之光.html 1.91MB', 'utf8');
console.log('ok');
