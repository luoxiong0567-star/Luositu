/**
 * 场景：AI-Agent思维模型
 * 内嵌「Agent 战术大屏 · OPS 调度中心」独立页面（iframe srcdoc）
 *
 * 集成方式说明：
 *   该页面是外部单文件 HTML（D:/agent-display-main/index.html#ops），
 *   Chrome / Edge 默认禁止 file:// 页面 iframe 加载其他本地文件，
 *   直连会白屏。因此由 _build_agentpage.js 把页面转成 base64 内联
 *   （web/js/data/agentpage.js），运行时解码写入 iframe.srcdoc，
 *   既能在 file:// / 单文件版中离线运行，也不会与主页面样式冲突。
 *
 * 与其它场景的一致性：
 *   仍是 HL.registerScene 注册的普通场景 —— 侧栏条目、目录卡片、
 *   快捷键、Esc 回目录、URL #aiagent 直达全部走同一套机制。
 */
HL.registerScene({
  id: 'aiagent',
  name: 'AI-Agent思维模型',
  short: '11 个智能体 · 调度战术大屏',
  icon: '⬡',
  fov: 46,
  minDistance: 4,
  maxDistance: 200,
  desc: '把 11 个 AI 智能体的协作过程铺成一张实时战术大屏：任务流、检索与评审、工具调用、上下文窗口、模型成本与派发队列同时可见。可与「神经网络」场景对照——一个看神经元如何连成网络，一个看智能体如何分工完成一件工程任务。',

  controls: [
    { type: 'button', key: 'reload', label: '↻ 重新载入大屏' },
    { type: 'button', key: 'reset', label: '⟲ 复位到 OPS 首页' }
  ],

  create: function (ctx) {
    var stage = document.getElementById('stage') || ctx.canvas.parentElement;
    var data = HL.AGENT_PAGE;
    var html = data ? data.html() : '';

    /* ---------- 覆盖层 ---------- */
    var wrap = document.createElement('div');
    wrap.className = 'embed-wrap';

    var frame = document.createElement('iframe');
    frame.className = 'embed-frame';
    frame.title = 'AI-Agent思维模型 · Agent 战术大屏';
    frame.setAttribute('frameborder', '0');
    frame.setAttribute('allow', 'fullscreen');

    var loading = document.createElement('div');
    loading.className = 'embed-loading';
    loading.innerHTML = '<i></i><b>正在载入智能体调度大屏</b><span>11 agents · dispatch · task feed</span>';

    wrap.appendChild(frame);
    wrap.appendChild(loading);
    stage.appendChild(wrap);
    stage.classList.add('embed-mode');

    var disposed = false;
    frame.addEventListener('load', function () {
      if (disposed) return;
      // 给页面自身首帧留一点时间，避免白色闪一下
      setTimeout(function () { loading.classList.add('hide'); }, 120);
    });

    if (html) frame.srcdoc = html;
    else {
      loading.innerHTML = '<b>页面数据缺失</b><span>请执行 node _build_agentpage.js</span>';
    }

    function loadPage() {
      if (!html) return;
      loading.classList.remove('hide');
      frame.srcdoc = '';                      // 先清空，确保相同内容也会重新解析
      requestAnimationFrame(function () {
        if (!disposed) frame.srcdoc = html;
      });
    }

    ctx.setNote &&
      ctx.setNote('智能体调度大屏为独立页面，已内联嵌入。' +
        '页面内 <b>T</b> 可切换主题，<b>Esc</b> 返回场景目录。');

    return {
      update: function () { /* 内嵌页面自行驱动，无需逐帧更新 */ },

      setParam: function (key) {
        if (key === 'reload' || key === 'reset') loadPage();
      },

      dispose: function () {
        disposed = true;
        stage.classList.remove('embed-mode');
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        try { frame.srcdoc = ''; } catch (e) { /* 忽略 */ }
      }
    };
  }
});
