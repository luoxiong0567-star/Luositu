/**
 * 应用入口：场景列表、参数面板、悬浮提示、快捷键
 */
(function (global) {
  'use strict';

  var HL = global.HL;
  var manager, canvas, stageEl, panelEl, tooltipEl;
  var currentId = null;
  var state = {};               // 每个场景的参数记忆
  var urlApplied = {};          // URL 查询参数只注入一次

  function init() {
    canvas = document.getElementById('gl');
    stageEl = document.getElementById('stage');
    panelEl = document.getElementById('panel');
    tooltipEl = document.getElementById('tooltip');

    manager = new HL.Manager(canvas);
    manager.onFps = function (f) {
      document.getElementById('fps').textContent = f + ' FPS';
    };

    HL.tooltip = { show: showTooltip, hide: hideTooltip };
    HL.toast = showToast;
    HL.manager = manager;
    // 供场景在子场景切换后重建参数面板 / 改写副标题
    HL.rebuildPanel = rebuildPanel;
    HL.setDesc = function (t) {
      var el = document.getElementById('sceneDesc');
      if (el) el.textContent = t || '';
    };

    buildList();
    buildGallery();
    document.getElementById('galleryBtn').addEventListener('click', showGallery);

    window.addEventListener('keydown', function (e) {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      var k = e.key.toLowerCase();
      if (k === 'r') { manager.resetView(); return; }
      if (k === 'f') { toggleFullscreen(); return; }
      if (k === 'escape') { toggleGallery(); return; }
      var n = parseInt(k, 10);
      var idx = -1;
      if (n >= 1 && n <= 9) idx = n - 1;   // 1–9 → 第 1~9 个
      else if (k === '0') idx = 9;          // 0 → 第 10 个
      else if (k === '-') idx = 10;         // - → 第 11 个
      else if (k === '=') idx = 11;         // = → 第 12 个（预留）
      if (idx >= 0) {
        var list = HL.allScenes();
        if (list[idx]) load(list[idx].id);
      }
    });

    // 点击空白处收起提示
    canvas.addEventListener('pointerdown', function () { hideTooltip(); });

    var hash = (location.hash || '').replace('#', '');
    var list = HL.allScenes();
    var start = hash && HL.getScene(hash) ? hash : list[0].id;
    load(start);
    // 无直达链接时启动进目录页；带 #场景id 则直接进入场景
    if (!(hash && HL.getScene(hash))) showGallery();
  }

  /* ---------------- 侧栏 ---------------- */
  function buildList() {
    var wrap = document.getElementById('sceneList');
    wrap.innerHTML = '';
    HL.allScenes().forEach(function (def, i) {
      var item = document.createElement('div');
      item.className = 'scene-item';
      item.dataset.id = def.id;
      item.innerHTML =
        '<div class="ico">' + def.icon + '</div>' +
        '<div class="txt"><b>' + def.name + '</b><span>' + def.short + '</span></div>';
      item.addEventListener('click', function () { load(def.id); });
      wrap.appendChild(item);
    });
  }

  function load(id) {
    if (!id || id === currentId) {
      if (id === currentId) manager.resetView();
      return;
    }
    hideTooltip();
    if (!manager.load(id)) return;
    currentId = id;

    var def = HL.getScene(id);
    document.getElementById('sceneTitle').textContent = def.name;
    document.getElementById('sceneDesc').textContent = def.desc || '';
    location.hash = id;

    Array.prototype.forEach.call(document.querySelectorAll('.scene-item'), function (el) {
      el.classList.toggle('active', el.dataset.id === id);
    });

    buildPanel(def);
  }

  /* ---------------- 场景目录页 ---------------- */
  var CATALOG = {
    solar: '八大行星实时轨道运行，土星环与太阳光照',
    periodic: '118 种元素三维排布，点击元素升起玻璃样品舱观察气 / 液 / 固三态',
    neural: '前向传播逐层点亮，连线粗细即权重强度',
    math: '参数曲面家族与洛伦兹混沌吸引子',
    interference: '杨氏双缝波动光学，光子模式下看概率如何堆出条纹',
    molecule: 'DNA 双螺旋与蛋白质二级结构',
    fourier: '方波由谐波现场叠加合成，傅里叶级数可视化',
    emwave: 'E⊥B 正交振荡的平面电磁波',
    photosynthesis: '叶片 → 叶绿体 → 分子三级缩放，光反应与卡尔文循环',
    maxwell: '四区全景：高斯电 / 磁通量、法拉第感应与位移电流',
    massenergy: '质量—能量天平、湮灭 / 裂变 / 聚变微观动画、太阳 vs 煤球',
    gravity: '引力井 · 双星 · 开普勒三定律 · 三体混沌 · 潮汐力 · 逃逸速度'
  };
  var galleryEl;

  function buildGallery() {
    galleryEl = document.getElementById('gallery');
    var thumbs = HL.THUMBS || {};
    var total = HL.allScenes().length;
    var cn = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
      '十一', '十二', '十三', '十四', '十五', '十六'][total] || ('' + total);
    var html = '<div class="gal-head"><h2>✦ 人类之光 · 场景目录</h2>' +
      '<p>' + cn + '个三维科学可视化场景 · 点击卡片进入 · Esc 返回目录 · 作者 罗司徒</p></div><div class="gal-grid">';
    var cards = [];
    HL.allScenes().forEach(function (def, i) {
      var n = (i + 1) < 10 ? '0' + (i + 1) : '' + (i + 1);
      var key = i < 9 ? String(i + 1) : (['0', '-', '='][i - 9] || '');
      html += '<div class="gal-card" data-id="' + def.id + '" title="快捷键 ' + key + '">' +
        '<div class="gal-img"></div>' +
        '<div class="gal-meta"><div class="gal-name"><span class="gal-ico">' + def.icon + '</span>' + def.name + '</div>' +
        '<p>' + (CATALOG[def.id] || def.short || '') + '</p></div></div>';
      cards.push({ id: def.id, thumb: thumbs[def.id] });
    });
    html += '</div>';
    galleryEl.innerHTML = html;
    // 缩略图用 DOM API 注入（避免 innerHTML 拼接 src 触发构建脚本的内联校验误报）
    Array.prototype.forEach.call(galleryEl.querySelectorAll('.gal-card'), function (card, i) {
      if (cards[i].thumb) {
        var im = document.createElement('img');
        im.alt = cards[i].id;
        im.setAttribute('src', cards[i].thumb);
        card.querySelector('.gal-img').appendChild(im);
      }
      card.addEventListener('click', function () {
        hideGallery();
        load(card.dataset.id);
      });
    });
  }

  function showGallery() {
    if (!galleryEl) return;
    galleryEl.classList.add('show');
    // 清掉 hash，刷新后仍停留在目录页
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* 个别环境受限 */ }
  }

  function hideGallery() {
    if (galleryEl) galleryEl.classList.remove('show');
  }

  function toggleGallery() {
    if (!galleryEl) return;
    if (galleryEl.classList.contains('show')) hideGallery();
    else showGallery();
  }

  function panelControls(def) {
    if (!def) return [];
    // controls 允许写成函数：子场景切换后返回不同的参数集合
    var cs = (typeof def.controls === 'function') ? def.controls() : def.controls;
    return cs || [];
  }

  function rebuildPanel() {
    if (!currentId) return;
    buildPanel(HL.getScene(currentId));
  }

  /* ---------------- 参数面板 ---------------- */
  function buildPanel(def) {
    panelEl.innerHTML = '';
    var cs = panelControls(def);
    if (!cs.length) { panelEl.classList.remove('show'); return; }
    panelEl.classList.add('show');

    var st = state[def.id] || (state[def.id] = {});

    // URL 查询参数优先级最高（在默认值写入前注入），例如 ?mode=photon&wl=633
    if (!urlApplied[def.id] && typeof URLSearchParams !== 'undefined' && location.search.length > 1) {
      urlApplied[def.id] = true;
      var qs = new URLSearchParams(location.search);
      cs.forEach(function (c) {
        if (c.type === 'button') return;
        var v = qs.get(c.key);
        if (v === null) return;
        st[c.key] = (c.type === 'check') ? (v !== '0' && v !== 'false')
          : (v !== '' && !isNaN(+v) ? +v : v);
      });
    }

    var title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = '参数控制';
    panelEl.appendChild(title);

    panelControls(def).forEach(function (c) {
      if (typeof st[c.key] === 'undefined' && typeof c.value !== 'undefined') st[c.key] = c.value;

      if (c.type === 'range') {
        panelEl.appendChild(makeRange(def, c, st));
      } else if (c.type === 'check') {
        panelEl.appendChild(makeCheck(def, c, st));
      } else if (c.type === 'buttons') {
        panelEl.appendChild(makeButtons(def, c, st));
      } else if (c.type === 'button') {
        panelEl.appendChild(makeButton(def, c));
      } else if (c.type === 'legend') {
        panelEl.appendChild(makeLegend(c));
      }
    });

    var note = document.createElement('div');
    note.id = 'panelNote';
    note.className = 'note';
    panelEl.appendChild(note);

    // 应用记忆参数
    var keys = panelControls(def);
    Object.keys(st).forEach(function (k) {
      if (keys.some(function (c) { return c.key === k && c.type !== 'button'; })) {
        apply(def, k, st[k]);
      }
    });
  }

  function apply(def, key, value) {
    if (manager.inst && manager.inst.setParam) {
      try { manager.inst.setParam(key, value); } catch (e) { console.error(e); }
    }
  }

  function makeRange(def, c, st) {
    var box = document.createElement('div');
    box.className = 'ctl';
    var val = (typeof st[c.key] !== 'undefined') ? st[c.key] : c.value;
    box.innerHTML = '<div class="ctl-head"><span>' + c.label + '</span>' +
      '<span class="val">' + fmt(val) + (c.unit || '') + '</span></div>';
    var input = document.createElement('input');
    input.type = 'range';
    input.min = c.min; input.max = c.max; input.step = c.step; input.value = val;
    input.addEventListener('input', function () {
      var v = parseFloat(input.value);
      st[c.key] = v;
      box.querySelector('.val').textContent = fmt(v) + (c.unit || '');
      apply(def, c.key, v);
    });
    box.appendChild(input);
    return box;
  }

  function makeCheck(def, c, st) {
    var lab = document.createElement('label');
    lab.className = 'ctl ctl-check';
    var val = (typeof st[c.key] !== 'undefined') ? st[c.key] : c.value;
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!val;
    cb.addEventListener('change', function () {
      st[c.key] = cb.checked;
      apply(def, c.key, cb.checked);
    });
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(c.label));
    return lab;
  }

  function makeButtons(def, c, st) {
    var box = document.createElement('div');
    box.className = 'ctl';
    var head = document.createElement('div');
    head.className = 'ctl-head';
    head.innerHTML = '<span>' + c.label + '</span>';
    box.appendChild(head);
    var row = document.createElement('div');
    row.className = 'btn-row';
    var cur = (typeof st[c.key] !== 'undefined') ? st[c.key] : c.value;
    c.options.forEach(function (o) {
      var b = document.createElement('button');
      b.className = 'btn' + (o.value === cur ? ' on' : '');
      b.textContent = o.label;
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(row.children, function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        st[c.key] = o.value;
        apply(def, c.key, o.value);
      });
      row.appendChild(b);
    });
    box.appendChild(row);
    return box;
  }

  function makeButton(def, c) {
    var box = document.createElement('div');
    box.className = 'ctl';
    var b = document.createElement('button');
    b.className = 'btn';
    b.style.width = '100%';
    b.textContent = c.label;
    b.addEventListener('click', function () { apply(def, c.key, true); });
    box.appendChild(b);
    return box;
  }

  function makeLegend(c) {
    var box = document.createElement('div');
    box.className = 'legend';
    (c.items || []).forEach(function (it) {
      var row = document.createElement('div');
      row.className = 'legend-item';
      row.innerHTML = '<span class="legend-dot" style="background:' + it[1] + '"></span><span>' + it[0] + '</span>';
      box.appendChild(row);
    });
    return box;
  }

  function fmt(v) {
    return (Math.round(v * 100) / 100).toString();
  }

  /* ---------------- 提示 ---------------- */
  function showTooltip(html, clientX, clientY) {
    var r = stageEl.getBoundingClientRect();
    tooltipEl.innerHTML = html;
    tooltipEl.classList.add('show');
    var x = clientX - r.left + 16;
    var y = clientY - r.top + 16;
    var tw = tooltipEl.offsetWidth, th = tooltipEl.offsetHeight;
    if (x + tw > r.width - 10) x = clientX - r.left - tw - 16;
    if (y + th > r.height - 10) y = r.height - th - 10;
    tooltipEl.style.left = Math.max(8, x) + 'px';
    tooltipEl.style.top = Math.max(8, y) + 'px';
  }

  function hideTooltip() {
    tooltipEl.classList.remove('show');
  }

  var toastTimer = null;
  function showToast(msg) {
    if (!msg) return;
    var el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.style.cssText = 'position:absolute;left:50%;bottom:64px;transform:translateX(-50%);' +
        'padding:10px 20px;max-width:70%;background:rgba(8,13,26,.94);border:1px solid rgba(77,226,255,.35);' +
        'border-radius:10px;font-size:12px;line-height:1.7;color:#dce7f5;z-index:7;opacity:0;' +
        'transition:opacity .2s;pointer-events:none;box-shadow:0 10px 30px rgba(0,0,0,.6);text-align:center;';
      stageEl.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.style.opacity = '0'; }, 4200);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen && document.exitFullscreen();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);
