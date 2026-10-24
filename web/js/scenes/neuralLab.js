/**
 * 场景：神经网络推理
 * 内嵌「神经网络推理 · NEURAL INFERENCE」独立页面（iframe srcdoc）
 *
 * 集成方式说明：
 *   页面源文件 D:/agent-display-main/neural-lab.html 是一个自包含单文件
 *   （纯 canvas + DOM，无外部资源）。Chrome / Edge 默认禁止 file:// 页面
 *   iframe 直连本地文件，因此由 _build_neuralpage.js 把整页 base64 内联到
 *   web/js/data/neuralpage.js，运行时解码写入 iframe.srcdoc。
 *
 * 与其它场景的一致性：
 *   HL.registerScene 普通场景 —— 侧栏条目、目录卡片、快捷键、Esc 回目录、
 *   URL #neuralnet 直达全部复用同一套机制。
 */
HL.registerScene({
  id: 'neuralnet',
  name: '神经网络推理',
  short: '28 项训练参数 → 多层全连接 → 8 类训练诊断',
  icon: '◈',
  fov: 46,
  minDistance: 4,
  maxDistance: 200,
  desc: '把一次大模型训练诊断完整摊开：左侧 28 项真实训练参数（学习率、损失、梯度范数、批大小、序列长度、显存占用、MFU、KV Cache、KL 散度…）经多层全连接网络逐层点亮，信号光点沿权重流动，最终由 softmax 输出 8 类训练诊断（收敛正常 / 学习率过高 / 梯度尖峰 / 显存风险 / 平台期…）。顶栏「宽度」控件可在 S / M / L / XL 之间切换，各层节点按比例扩展（单层上限 28 个）。',

  controls: [
    { type: 'button', key: 'reload', label: '↻ 重新载入推理大屏' }
  ],

  create: function (ctx) {
    var stage = document.getElementById('stage') || ctx.canvas.parentElement;
    var data = HL.NEURAL_PAGE;
    var html = data ? data.html() : '';

    var wrap = document.createElement('div');
    wrap.className = 'embed-wrap';

    var frame = document.createElement('iframe');
    frame.className = 'embed-frame';
    frame.title = '神经网络推理 · NEURAL INFERENCE';
    frame.setAttribute('frameborder', '0');
    frame.setAttribute('allow', 'fullscreen');

    var loading = document.createElement('div');
    loading.className = 'embed-loading';
    loading.innerHTML = '<i></i><b>正在载入神经网络推理大屏</b><span>28 params → dense layers → 8 diagnoses</span>';

    wrap.appendChild(frame);
    wrap.appendChild(loading);
    stage.appendChild(wrap);
    stage.classList.add('embed-mode');

    var disposed = false;
    frame.addEventListener('load', function () {
      if (disposed) return;
      setTimeout(function () { loading.classList.add('hide'); }, 120);
    });

    if (html) frame.srcdoc = html;
    else loading.innerHTML = '<b>页面数据缺失</b><span>请执行 node _build_neuralpage.js</span>';

    function loadPage() {
      if (!html) return;
      loading.classList.remove('hide');
      frame.srcdoc = '';
      requestAnimationFrame(function () { if (!disposed) frame.srcdoc = html; });
    }

    ctx.setNote &&
      ctx.setNote('推理大屏为独立页面，已内联嵌入。' +
        '按 <b>Esc</b> 返回场景目录；页面内可暂停、调速与重置权重。');

    return {
      update: function () { /* 内嵌页面自行驱动 */ },

      setParam: function (key) {
        if (key === 'reload') loadPage();
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
