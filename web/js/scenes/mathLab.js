/**
 * 场景：数学模型（重做 · 数学的语言）
 *
 * 原来的参数曲面 / 洛伦兹吸引子整体替换为「四模型展示页」：
 *   01 贝叶斯定理   自然频率点阵 → 后验概率
 *   02 正态分布     密度曲线 + 68-95-99.7 + 样本直方图
 *   03 欧几里得几何 勾股 / 内角和 / 圆周角（可拖动）
 *   04 香农信息熵   H(p) 曲线 + 等概率信源编码树
 *
 * 为什么用 DOM 展示层而不是 3D：
 *   这一页的主体是「定义 + 公式 + 图示」，需要排版、KaTeX、可滚动层级，
 *   3D 相机与轨道控制器在这里只会帮倒忙。因此场景不改注册方式（仍是
 *   HL.registerScene 的普通场景：侧栏、目录卡、快捷键、#math 直达全部照旧），
 *   只是把 3D 画布让给一层覆盖整个 #stage 的页面。
 *
 * 与构建脚本的约定：源文件里不能出现 script 闭合标签、HTML 注释起始符、
 * style 开闭标签这几个字符序列（会破坏单文件内联）—— 本文件刻意避开。
 */
(function (global) {
  'use strict';

  var HL = global.HL;
  if (!HL) return;
  var doc = global.document;

  /* ================= 基础工具 ================= */

  function h(tag, cls, html) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined && html !== null) e.innerHTML = html;
    return e;
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function mix(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function fixed(v, n) { return (+v).toFixed(n === undefined ? 1 : n); }

  /** KaTeX 渲染；无 katex（极端降级）时退回纯文本 */
  function tex(host, src) {
    if (global.katex && global.katex.render) {
      try {
        global.katex.render(src, host, {
          displayMode: true, throwOnError: false, strict: false, output: 'html'
        });
        return;
      } catch (e) { /* 落到纯文本 */ }
    }
    host.textContent = src;
  }

  /** 画布盒：自适应宽度 + DPR，返回 { wrap, cv, g, w, h, fit() } */
  function canvasBox(parent, hFn) {
    var wrap = h('div', 'ml-cv');
    var cv = doc.createElement('canvas');
    wrap.appendChild(cv);
    parent.appendChild(wrap);
    var g = cv.getContext('2d');
    var o = { wrap: wrap, cv: cv, g: g, w: 0, h: 0, dpr: 1, ready: false, hFn: hFn };
    o.fit = function () {
      var w = Math.max(140, wrap.clientWidth || 300);
      var hh = clamp(typeof o.hFn === 'function' ? o.hFn(w) : o.hFn, 120, 460);
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      if (w === o.w && hh === o.h && dpr === o.dpr) return false;
      o.w = w; o.h = hh; o.dpr = dpr;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(hh * dpr);
      cv.style.width = w + 'px';
      cv.style.height = hh + 'px';
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      o.ready = true;
      return true;
    };
    // 容器宽度可能在首帧之后才定下来（网格 / flex / 字体回流），
    // 只靠一次 fit 会把画布永久锁在旧尺寸上 —— 用 ResizeObserver 兜住。
    if (global.ResizeObserver) {
      o.ro = new global.ResizeObserver(function () {
        if (o.fit() && o.redraw) o.redraw();
      });
      o.ro.observe(wrap);
    }
    o.dispose = function () { if (o.ro) o.ro.disconnect(); };
    return o;
  }

  /** 范围滑杆：返回 { row, set(v) } */
  function rangeRow(host, label, min, max, step, val, unit, onInput) {
    var row = h('div', 'ml-ctl');
    var head = h('div', 'ml-ctlhead', '<span>' + label + '</span><b></b>');
    var input = doc.createElement('input');
    input.type = 'range';
    input.min = min; input.max = max; input.step = step; input.value = val;
    var out = head.querySelector('b');
    function show() {
      var v = +input.value;
      var dec = step >= 1 ? 0 : (step >= 0.1 ? 1 : 2);
      out.textContent = (typeof unit === 'function') ? unit(v)
        : (v.toFixed(dec) + (unit || ''));
    }
    show();
    input.addEventListener('input', function () { show(); onInput(+input.value); });
    row.appendChild(head);
    row.appendChild(input);
    host.appendChild(row);
    return {
      row: row,
      set: function (v) { input.value = v; show(); },
      get: function () { return +input.value; }
    };
  }

  /** 数值读出：只有内容变化时才写 DOM */
  function outGrid(host) {
    var box = h('div', 'ml-out');
    host.appendChild(box);
    var cells = {};
    return {
      el: box,
      cell: function (key, label, opts) {
        var c = h('div', 'ml-stat' + (opts && opts.hl ? ' hl' : ''));
        var k = h('span', null, label);
        var v = h('b', null, '—');
        if (opts && opts.color) v.style.color = opts.color;
        c.appendChild(k); c.appendChild(v);
        box.appendChild(c);
        cells[key] = { box: c, val: v, last: null };
        return cells[key];
      },
      set: function (key, text) {
        var c = cells[key];
        if (!c || c.last === text) return;
        c.last = text;
        c.val.textContent = text;
      }
    };
  }

  /* ================= 01 贝叶斯定理 ================= */

  function BayesModel(acc) {
    var TOTAL = 10000, ROW = 100;
    var st = { pD: 1, sens: 90, fpr: 5 };
    var reveal = 1;

    var el = h('div', 'ml-card ml-viz');
    el.style.setProperty('--a', acc);
    el.appendChild(h('div', 'ml-vhead',
      '<b>自然频率点阵</b><span>一个点 = 1 个人 · 共 10 000 人</span>'));

    var box = canvasBox(el, function (w) {
      return (w >= 430) ? Math.max(286, Math.min(w * 0.60, 336))
        : Math.min(w + 134, 470);
    });

    var legend = h('div', 'ml-legend',
      '<span><i style="background:#4de2ff"></i>真阳性（有病且查出）</span>' +
      '<span><i style="background:#ff6ec7"></i>假阳性（无病却报警）</span>' +
      '<span><i style="background:rgba(77,226,255,.26)"></i>漏诊</span>' +
      '<span><i style="background:rgba(110,160,220,.20)"></i>真阴性</span>');
    el.appendChild(legend);

    var ctls = h('div', 'ml-ctls');
    el.appendChild(ctls);
    var rP = rangeRow(ctls, '患病率（先验）', 0.1, 20, 0.1, st.pD, '%', function (v) { st.pD = v; changed(); });
    var rS = rangeRow(ctls, '检测灵敏度', 50, 99.9, 0.1, st.sens, '%', function (v) { st.sens = v; changed(); });
    var rF = rangeRow(ctls, '假阳性率', 0.1, 20, 0.1, st.fpr, '%', function (v) { st.fpr = v; changed(); });

    var out = outGrid(el);
    out.cell('tp', '真阳性', { color: '#7fe9ff' });
    out.cell('fp', '假阳性', { color: '#ff9ad4' });
    out.cell('pos', '全部阳性', { hl: true });

    var lift = h('div', 'ml-lift');
    el.appendChild(lift);

    /* ---- 统计 ---- */
    function stats() {
      var pD = st.pD / 100, sens = st.sens / 100, fpr = st.fpr / 100;
      var sick = Math.round(TOTAL * pD);
      var tp = Math.round(sick * sens);
      var fp = Math.round((TOTAL - sick) * fpr);
      var pos = tp + fp;
      return {
        sick: sick, tp: tp, fp: fp,
        post: pos > 0 ? tp / pos : 0,
        prior: pD,
        lift: pos > 0 && tp > 0 ? (tp / pos) / pD : 0
      };
    }

    /* ---- 点阵离屏绘制：只在参数 / 揭示进度变化时重画 ---- */
    var oc = doc.createElement('canvas'), og = oc.getContext('2d');
    var geom = { size: 0, ox: 0, oy: 0, cs: 0 };

    function paint() {
      if (!box.ready) return;
      var w = box.w, hh = box.h, dpr = box.dpr;
      var W = Math.round(w * dpr), H = Math.round(hh * dpr);
      if (oc.width !== W || oc.height !== H) { oc.width = W; oc.height = H; }
      og.setTransform(dpr, 0, 0, dpr, 0, 0);
      og.clearRect(0, 0, w, hh);

      // 宽屏：左点阵 + 右结论；窄屏：上点阵 + 下方结论
      var side = w >= 430;
      var pad = 6;
      var size, ox, oy;
      if (side) {
        size = Math.min(hh - pad * 2, w * 0.58);
        ox = pad;
        oy = (hh - size) / 2;
      } else {
        size = Math.min(w - pad * 2, hh - 134);
        ox = (w - size) / 2;
        oy = pad;
      }
      var cs = size / ROW;
      geom.size = size; geom.ox = ox; geom.oy = oy; geom.cs = cs;

      og.fillStyle = 'rgba(4,8,16,.55)';
      og.fillRect(ox, oy, size, size);

      var s = stats();
      var shown = Math.floor(TOTAL * reveal);
      var gap = cs > 3.2 ? 0.85 : (cs > 2 ? 0.5 : 0.2);
      var fpEnd = s.sick + s.fp;

      for (var i = 0; i < shown; i++) {
        var col;
        if (i < s.tp) col = '#4de2ff';
        else if (i < s.sick) col = 'rgba(77,226,255,.34)';
        else if (i < fpEnd) col = '#ff6ec7';
        else col = 'rgba(108,158,220,.26)';
        og.fillStyle = col;
        og.fillRect(ox + (i % ROW) * cs, oy + Math.floor(i / ROW) * cs, cs - gap, cs - gap);
      }

      og.strokeStyle = 'rgba(120,180,255,.16)';
      og.lineWidth = 1;
      og.strokeRect(ox + 0.5, oy + 0.5, size - 1, size - 1);

      // 角标
      og.font = '9px ui-monospace, Consolas, monospace';
      og.fillStyle = 'rgba(120,180,255,.45)';
      og.textAlign = 'left';
      og.textBaseline = 'bottom';
      og.fillText('100 × 100', ox + 2, oy - 3);

      conclusion(s, side, ox, oy, size, w, hh);
    }

    /** 结论面板：把最关键的那个数字放大 —— 这是整张图真正要说的话 */
    function conclusion(s, side, ox, oy, size, w, hh) {
      var px, py, pw;
      if (side) {
        px = ox + size + 20;
        py = oy + 2;
        pw = w - px - 6;
      } else {
        px = ox;
        py = oy + size + 10;
        pw = size;
      }
      var num = fixed(s.post * 100, 1) + '%';
      var fs = side ? Math.min(38, Math.max(26, pw * 0.23)) : 30;

      og.textAlign = 'left';
      og.textBaseline = 'top';
      og.font = '10px "Microsoft YaHei", sans-serif';
      og.fillStyle = 'rgba(140,165,195,.8)';
      og.fillText(side ? '后验概率' : '后验概率 P(患病 | 阳性)', px, py);

      og.font = '600 ' + fs + 'px ui-monospace, Consolas, monospace';
      og.shadowColor = 'rgba(77,226,255,.6)';
      og.shadowBlur = 16;
      og.fillStyle = '#7fe9ff';
      og.fillText(num, px - 1, py + 14);
      og.shadowBlur = 0;

      var ny = py + 14 + fs + 4;
      og.font = '10.5px "Microsoft YaHei", sans-serif';
      og.fillStyle = 'rgba(160,185,215,.9)';
      og.fillText('P(患病 | 阳性)', px, ny);

      // 两行计数
      var ry = ny + 22;
      var rows = [
        ['真阳性', String(s.tp), '#7fe9ff'],
        ['假阳性', String(s.fp), '#ff9ad4']
      ];
      og.font = '10.5px "Microsoft YaHei", sans-serif';
      for (var i = 0; i < rows.length; i++) {
        var y = ry + i * 17;
        og.fillStyle = rows[i][2];
        og.beginPath(); og.arc(px + 3, y + 5, 3, 0, Math.PI * 2); og.fill();
        og.fillStyle = 'rgba(150,175,205,.9)';
        og.textAlign = 'left';
        og.fillText(rows[i][0], px + 12, y);
        og.textAlign = 'right';
        og.fillStyle = '#dbe8f7';
        og.fillText(rows[i][1], px + pw, y);
      }

      // 提升倍数
      var ly = ry + rows.length * 17 + 6;
      if (ly + 14 < hh) {
        og.strokeStyle = 'rgba(120,180,255,.16)';
        og.beginPath(); og.moveTo(px, ly - 2.5); og.lineTo(px + pw, ly - 2.5); og.stroke();
        og.textAlign = 'left';
        og.font = '10px "Microsoft YaHei", sans-serif';
        og.fillStyle = 'rgba(120,145,180,.75)';
        og.fillText('先验 → 后验', px, ly + 6);
        og.textAlign = 'right';
        og.fillStyle = '#7fe9ff';
        og.fillText('×' + fixed(s.lift, 1), px + pw, ly + 6);
      }
    }

    function changed() {
      var s = stats();
      out.set('tp', String(s.tp));
      out.set('fp', String(s.fp));
      out.set('pos', String(s.tp + s.fp));
      lift.innerHTML = '<span>先验 ' + fixed(s.prior * 100, 1) + '%</span><i>→</i>' +
        '<span>后验 ' + fixed(s.post * 100, 1) + '%</span>' +
        '<b>证据把风险放大约 ' + fixed(s.lift, 1) + ' 倍</b>';
      reveal = 0;
      paint();
    }

    function draw(dt, t) {
      if (!box.ready) return;
      if (reveal < 1) {
        reveal = Math.min(1, reveal + dt * 3.6);
        paint();
      }
      var g = box.g, w = box.w, hh = box.h;
      g.clearRect(0, 0, w, hh);
      g.drawImage(oc, 0, 0, w, hh);

      // 扫描光带（纯装饰，代价极低）
      var ph = (t * 0.13) % 1.6;
      if (ph < 1 && geom.size) {
        var y = geom.oy + ph * geom.size;
        var grd = g.createLinearGradient(0, y - 26, 0, y + 26);
        grd.addColorStop(0, 'rgba(120,230,255,0)');
        grd.addColorStop(0.5, 'rgba(120,230,255,.10)');
        grd.addColorStop(1, 'rgba(120,230,255,0)');
        g.fillStyle = grd;
        g.fillRect(geom.ox, y - 26, geom.size, 52);
      }
    }

    box.redraw = function () { paint(); };
    box.fit();
    changed();

    return {
      el: el,
      box: box,
      setMode: function () { /* 贝叶斯只有一套图 */ },
      layout: function () { if (box.fit()) { paint(); } },
      tick: draw,
      dispose: function () { box.dispose(); }
    };
  }

  /* ================= 02 正态分布 ================= */

  function NormalModel(acc) {
    var st = { mu: 0, sig: 1.9, marker: null };
    var XMIN = -10, XMAX = 10, YMAX = 0.72;
    var NB = 56;
    var zs = new Float64Array(2400);
    var bins = new Float64Array(NB);
    var P = { x0: 0, y0: 0, x1: 0, y1: 0, w: 0, h: 0 };

    var el = h('div', 'ml-card ml-viz');
    el.style.setProperty('--a', acc);
    var vhead = h('div', 'ml-vhead', '<b>概率密度与经验法则</b><span>在图上移动指针可读出任意点的 z 与累计概率</span>');
    el.appendChild(vhead);
    var box = canvasBox(el, function (w) { return clamp(w * 0.64, 210, 320); });
    box.cv.style.touchAction = 'none';

    var ctls = h('div', 'ml-ctls');
    el.appendChild(ctls);
    rangeRow(ctls, '均值 μ', -2.5, 2.5, 0.05, st.mu, '', function (v) { st.mu = v; });
    rangeRow(ctls, '标准差 σ', 0.6, 2.5, 0.05, st.sig, '', function (v) { st.sig = v; });
    var resampleBtn = h('button', 'ml-mini', '↻ 重新采样 2 400 个');
    ctls.appendChild(resampleBtn);

    var out = outGrid(el);
    out.cell('mu', 'μ', { color: '#e8f2ff' });
    out.cell('sg', 'σ', { color: '#e8f2ff' });
    out.cell('z', '指针处 z', { color: acc });
    out.cell('phi', '累计 Φ(z)', { hl: true });

    /* ---- 采样：12 个均匀分布求和 → 标准正态（CLT 现场演示） ---- */
    function resample() {
      for (var i = 0; i < zs.length; i++) {
        var s = 0;
        for (var k = 0; k < 12; k++) s += Math.random();
        zs[i] = s - 6;
      }
      rebuild();
    }
    function rebuild() {
      bins.fill(0);
      var bw = (XMAX - XMIN) / NB;
      for (var i = 0; i < zs.length; i++) {
        var x = st.mu + st.sig * zs[i];
        var b = Math.floor((x - XMIN) / bw);
        if (b >= 0 && b < NB) bins[b]++;
      }
      for (var j = 0; j < NB; j++) bins[j] = bins[j] / (zs.length * bw);
    }
    resampleBtn.addEventListener('click', resample);

    function pdf(x) {
      var d = (x - st.mu) / st.sig;
      return Math.exp(-0.5 * d * d) / (st.sig * Math.sqrt(2 * Math.PI));
    }
    function erf(x) {
      var s = x < 0 ? -1 : 1;
      x = Math.abs(x);
      var t = 1 / (1 + 0.3275911 * x);
      var y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
      return s * y;
    }
    function cdf(z) { return 0.5 * (1 + erf(z / Math.SQRT2)); }

    function layoutPlot() {
      P.x0 = 40;
      P.y0 = 14;
      P.x1 = box.w - 14;
      P.y1 = box.h - 76;
      P.w = P.x1 - P.x0;
      P.h = P.y1 - P.y0;
    }
    function sx(x) { return P.x0 + (x - XMIN) / (XMAX - XMIN) * P.w; }
    function sy(y) { return P.y1 - y / YMAX * P.h; }

    function draw(dt, t) {
      if (!box.ready) return;
      layoutPlot();
      var g = box.g, w = box.w, hh = box.h;
      g.clearRect(0, 0, w, hh);

      // 底图网格
      g.strokeStyle = 'rgba(120,180,255,.07)';
      g.lineWidth = 1;
      for (var gx = -10; gx <= 10; gx += 2) {
        var X = Math.round(sx(gx)) + 0.5;
        g.beginPath(); g.moveTo(X, P.y0); g.lineTo(X, P.y1); g.stroke();
      }
      for (var gy = 0; gy <= 0.6; gy += 0.2) {
        var Y = Math.round(sy(gy)) + 0.5;
        g.beginPath(); g.moveTo(P.x0, Y); g.lineTo(P.x1, Y); g.stroke();
      }

      // 样本直方图（经验分布压着理论曲线）
      var bw = (XMAX - XMIN) / NB;
      for (var b = 0; b < NB; b++) {
        if (bins[b] <= 0) continue;
        var bx = sx(XMIN + b * bw), bx2 = sx(XMIN + (b + 1) * bw);
        var by = sy(Math.min(bins[b], YMAX));
        g.fillStyle = 'rgba(139,123,255,.22)';
        g.fillRect(bx + 0.6, by, Math.max(1, bx2 - bx - 1.2), P.y1 - by);
      }

      // ±kσ 面积
      var ks = [3, 2, 1], alphas = [0.05, 0.08, 0.13];
      for (var i = 0; i < ks.length; i++) {
        var k = ks[i];
        var lo = clamp(st.mu - k * st.sig, XMIN, XMAX);
        var hi = clamp(st.mu + k * st.sig, XMIN, XMAX);
        if (hi <= lo) continue;
        g.beginPath();
        g.moveTo(sx(lo), P.y1);
        for (var x = lo; x <= hi; x += 0.08) g.lineTo(sx(x), sy(pdf(x)));
        g.lineTo(sx(hi), sy(pdf(hi)));
        g.lineTo(sx(hi), P.y1);
        g.closePath();
        g.fillStyle = hexA(acc, alphas[i]);
        g.fill();
      }

      // 曲线：外发光 + 主线
      g.beginPath();
      for (var xx = XMIN; xx <= XMAX; xx += 0.06) {
        var yy = sy(pdf(xx));
        if (xx === XMIN) g.moveTo(sx(xx), yy); else g.lineTo(sx(xx), yy);
      }
      g.strokeStyle = hexA(acc, 0.18);
      g.lineWidth = 7;
      g.stroke();
      g.strokeStyle = hexA(acc, 0.55);
      g.lineWidth = 3.4;
      g.stroke();
      g.strokeStyle = '#eaf6ff';
      g.lineWidth = 1.35;
      g.stroke();

      // 指针读数区域
      if (st.marker !== null && st.marker > XMIN && st.marker < XMAX) {
        var mx = sx(st.marker);
        g.beginPath();
        g.moveTo(mx, P.y1);
        for (var vx = XMIN; vx <= st.marker; vx += 0.08) g.lineTo(sx(vx), sy(pdf(vx)));
        g.lineTo(mx, P.y1);
        g.closePath();
        g.fillStyle = hexA(acc, 0.16);
        g.fill();

        g.strokeStyle = hexA(acc, 0.75);
        g.lineWidth = 1;
        g.setLineDash([4, 4]);
        g.beginPath(); g.moveTo(mx, sy(pdf(st.marker))); g.lineTo(mx, P.y1); g.stroke();
        g.setLineDash([]);

        var my = sy(pdf(st.marker));
        g.beginPath(); g.arc(mx, my, 4.4, 0, Math.PI * 2);
        g.fillStyle = '#eaf6ff'; g.fill();
        g.beginPath(); g.arc(mx, my, 8.5, 0, Math.PI * 2);
        g.strokeStyle = hexA(acc, 0.55); g.lineWidth = 1.6; g.stroke();

        var z = (st.marker - st.mu) / st.sig;
        out.set('z', (z >= 0 ? '+' : '') + fixed(z, 2));
        out.set('phi', fixed(cdf(z) * 100, 1) + '%');
      } else {
        out.set('z', '—');
        out.set('phi', '—');
      }
      out.set('mu', fixed(st.mu, 2));
      out.set('sg', fixed(st.sig, 2));

      // 坐标轴
      g.strokeStyle = 'rgba(120,180,255,.28)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(P.x0, P.y1 + 0.5); g.lineTo(P.x1, P.y1 + 0.5); g.stroke();
      g.fillStyle = 'rgba(140,165,195,.8)';
      g.font = '9.5px ui-monospace, Consolas, monospace';
      g.textAlign = 'center';
      g.textBaseline = 'top';
      for (var tx = -10; tx <= 10; tx += 5) {
        g.fillText(String(tx), sx(tx), P.y1 + 4);
      }
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      for (var ty = 0.2; ty <= 0.6; ty += 0.2) {
        g.fillStyle = 'rgba(120,145,180,.55)';
        g.fillText(fixed(ty, 1), P.x0 - 6, sy(ty));
      }

      // μ / σ 标注
      var muX = sx(st.mu);
      g.strokeStyle = 'rgba(230,245,255,.35)';
      g.setLineDash([3, 5]);
      g.beginPath(); g.moveTo(muX, P.y0); g.lineTo(muX, P.y1); g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(220,240,255,.75)';
      g.font = '11px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      g.fillText('μ', muX, P.y1 - 2);

      var sgX = sx(st.mu + st.sig);
      if (sgX < P.x1 - 10) {
        var arrowY = P.y1 - 16;
        g.strokeStyle = hexA(acc, 0.8);
        g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(muX + 3, arrowY); g.lineTo(sgX - 3, arrowY); g.stroke();
        g.beginPath(); g.moveTo(sgX - 8, arrowY - 4); g.lineTo(sgX - 2, arrowY); g.lineTo(sgX - 8, arrowY + 4); g.stroke();
        g.fillStyle = hexA(acc, 0.95);
        g.textAlign = 'center';
        g.textBaseline = 'bottom';
        g.fillText('σ', (muX + sgX) / 2, arrowY - 3);
      }

      // 68 / 95 / 99.7 括号
      var labels = ['68.27%', '95.45%', '99.73%'];
      for (var ki = 0; ki < 3; ki++) {
        var kk = ki + 1;
        var a1 = sx(clamp(st.mu - kk * st.sig, XMIN, XMAX));
        var a2 = sx(clamp(st.mu + kk * st.sig, XMIN, XMAX));
        var by2 = P.y1 + 26 + ki * 15;
        var al = 0.75 - ki * 0.2;
        g.strokeStyle = hexA(acc, al);
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(a1, by2 - 4); g.lineTo(a1, by2); g.lineTo(a2, by2); g.lineTo(a2, by2 - 4);
        g.stroke();
        g.fillStyle = hexA(acc, al + 0.15);
        g.font = '10px ui-monospace, Consolas, monospace';
        g.textAlign = 'center';
        g.textBaseline = 'top';
        g.fillText(labels[ki], (a1 + a2) / 2, by2 + 2.5);
      }
    }

    function markerFromEvent(e) {
      if (!box.ready) return;
      var r = box.cv.getBoundingClientRect();
      var px = e.clientX - r.left;
      if (px < P.x0 - 4 || px > P.x1 + 4) { st.marker = null; return; }
      var x = XMIN + (px - P.x0) / P.w * (XMAX - XMIN);
      st.marker = clamp(x, XMIN + 0.05, XMAX - 0.05);
    }
    box.cv.addEventListener('pointermove', markerFromEvent);
    box.cv.addEventListener('pointerdown', markerFromEvent);

    box.fit();
    return {
      el: el,
      box: box,
      setMode: function () {},
      layout: function () { box.fit(); },
      tick: draw,
      dispose: function () { box.dispose(); }
    };
  }

  /* ================= 03 欧几里得几何 ================= */

  function EuclidModel(acc) {
    var st = { mode: 0, a: 2.4, b: 1.6, cX: 0.35, cY: 2.05, pAng: 100, drag: null, move: 1, cell: 0 };
    var view = { sc: 46, cx: 0, cy: 0, init: false };
    var SX = function (x) { return 0; }, SY = function (y) { return 0; };

    var el = h('div', 'ml-card ml-viz');
    el.style.setProperty('--a', acc);
    var vhead = h('div', 'ml-vhead', '<b>形的真理</b><span>拖动图中顶点，关系始终成立</span>');
    el.appendChild(vhead);
    var box = canvasBox(el, function (w) { return clamp(w * 0.72, 220, 360); });
    box.wrap.classList.add('grab');
    box.cv.style.touchAction = 'none';

    var ctls = h('div', 'ml-ctls');
    el.appendChild(ctls);
    var rowMove = h('div', 'ml-ctl');
    var moveBtn = h('button', 'ml-mini', '▶ 面积搬运：a² 与 b² 流进 c²');
    rowMove.appendChild(moveBtn);
    ctls.appendChild(rowMove);

    var out = outGrid(el);

    function setupOut() {
      out.el.innerHTML = '';
      if (st.mode === 0) {
        out.cell('a', 'a²（直角边）', { color: '#ffd98a' });
        out.cell('b', 'b²（直角边）', { color: '#ffd98a' });
        out.cell('sum', 'a² + b²', { color: '#9fe8ff' });
        out.cell('c', 'c²（斜边）', { hl: true });
      } else if (st.mode === 1) {
        out.cell('A', 'α', { color: '#7fe9ff' });
        out.cell('B', 'β', { color: '#ffcf6b' });
        out.cell('C', 'γ', { color: '#ff9ad4' });
        out.cell('sum', 'α + β + γ', { hl: true });
      } else {
        out.cell('ins', '圆周角 ∠APB', { color: '#7fe9ff' });
        out.cell('cen', '圆心角 ∠AOB', { color: '#c4b5ff' });
        out.cell('ratio', '比值', { hl: true });
      }
    }

    /* ---- 视图自适应 ---- */
    function fitView(b) {
      var bw = Math.max(0.2, b.x1 - b.x0), bh = Math.max(0.2, b.y1 - b.y0);
      var sc = Math.min((box.w - 34) / bw, (box.h - 30) / bh);
      var cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      if (!view.init) { view.sc = sc; view.cx = cx; view.cy = cy; view.init = true; }
      else {
        view.sc += (sc - view.sc) * 0.2;
        view.cx += (cx - view.cx) * 0.2;
        view.cy += (cy - view.cy) * 0.2;
      }
      SX = function (x) { return box.w / 2 + (x - view.cx) * view.sc; };
      SY = function (y) { return box.h / 2 - (y - view.cy) * view.sc; };
    }

    function poly(pts, close) {
      var g = box.g;
      g.beginPath();
      for (var i = 0; i < pts.length; i++) {
        if (i === 0) g.moveTo(SX(pts[i][0]), SY(pts[i][1]));
        else g.lineTo(SX(pts[i][0]), SY(pts[i][1]));
      }
      if (close !== false) g.closePath();
    }

    function label(x, y, txt, color, font, pill) {
      var g = box.g;
      g.font = font || '600 12px ui-monospace, Consolas, monospace';
      if (pill) {
        var tw = g.measureText(txt).width;
        var px = SX(x) - tw / 2 - 6, py = SY(y) - 10;
        roundRect(g, px, py, tw + 12, 20, 5);
        g.fillStyle = 'rgba(5,10,18,.72)';
        g.fill();
        g.strokeStyle = 'rgba(120,180,255,.16)';
        g.lineWidth = 1;
        g.stroke();
      }
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = color;
      g.fillText(txt, SX(x), SY(y));
    }

    function roundRect(g, x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.lineTo(x + w - r, y);
      g.quadraticCurveTo(x + w, y, x + w, y + r);
      g.lineTo(x + w, y + h - r);
      g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      g.lineTo(x + r, y + h);
      g.quadraticCurveTo(x, y + h, x, y + h - r);
      g.lineTo(x, y + r);
      g.quadraticCurveTo(x, y, x + r, y);
      g.closePath();
    }

    /* ---- 勾股 ---- */
    function drawPyth(t) {
      var a = st.a, b = st.b;
      fitView({ x0: -b - 0.25, x1: a + b + 0.25, y0: -a - 0.25, y1: a + b + 0.25 });
      var g = box.g;

      var SA = [[0, 0], [a, 0], [a, -a], [0, -a]];
      var SB = [[0, 0], [0, b], [-b, b], [-b, 0]];
      var SC = [[a, 0], [0, b], [b, a + b], [a + b, a]];

      // 三块面积：小方块随搬运变暗，大方块被填满
      var dim = 1 - st.move * 0.55;
      poly(SA); g.fillStyle = 'rgba(255,207,107,' + (0.13 * dim) + ')'; g.fill();
      poly(SB); g.fillStyle = 'rgba(255,207,107,' + (0.13 * dim) + ')'; g.fill();

      // 大方块：clip 后做自下而上的扫过
      g.save();
      poly(SC); g.clip();
      g.fillStyle = 'rgba(77,226,255,.06)';
      g.fillRect(0, 0, box.w, box.h);
      var prog = ease(st.move);
      var top = SY(a + b + 0.05), bot = SY(-0.05);
      var edge = bot + (top - bot) * prog;
      var grd = g.createLinearGradient(0, bot, 0, top);
      grd.addColorStop(0, 'rgba(77,226,255,.05)');
      grd.addColorStop(0.55, 'rgba(77,226,255,.34)');
      grd.addColorStop(1, 'rgba(160,245,255,.52)');
      g.fillStyle = grd;
      g.fillRect(0, edge, box.w, bot - edge);
      g.restore();

      // 边线
      var edges = [SA, SB, SC];
      for (var i = 0; i < edges.length; i++) {
        poly(edges[i]);
        g.strokeStyle = i === 2 ? 'rgba(150,238,255,.85)' : 'rgba(255,215,130,.7)';
        g.lineWidth = i === 2 ? 1.6 : 1.2;
        g.stroke();
      }

      // 三角形本体
      poly([[0, 0], [a, 0], [0, b]]);
      g.fillStyle = 'rgba(77,226,255,.10)';
      g.fill();
      g.strokeStyle = 'rgba(230,248,255,.9)';
      g.lineWidth = 1.6;
      g.stroke();

      // 直角标记
      var m = Math.min(0.34, a * 0.28, b * 0.28);
      poly([[0, 0], [m, 0], [m, m], [0, m]], false);
      g.strokeStyle = 'rgba(220,240,255,.6)';
      g.lineWidth = 1;
      g.stroke();

      // 面积数字
      label(a / 2, -a / 2, 'a² = ' + fixed(a * a, 2), 'rgba(255,214,130,.95)', null, true);
      label(-b / 2, b / 2, 'b² = ' + fixed(b * b, 2), 'rgba(255,214,130,.95)', null, true);
      label((a + b) / 2, (a + b) / 2, 'c² = ' + fixed(a * a + b * b, 2), 'rgba(190,246,255,.98)', null, true);

      // 边长
      label(a / 2, 0.18, 'a', 'rgba(230,248,255,.85)', 'italic 600 12px Georgia, serif');
      label(-0.16, b / 2, 'b', 'rgba(230,248,255,.85)', 'italic 600 12px Georgia, serif');
      label(a * 0.55 + 0.08, b * 0.55 + 0.1, 'c', 'rgba(190,246,255,.9)', 'italic 600 12px Georgia, serif');

      // 手柄
      handles([[a, 0], [0, b]]);

      out.set('a', fixed(a * a, 2));
      out.set('b', fixed(b * b, 2));
      out.set('sum', fixed(a * a + b * b, 2));
      out.set('c', fixed(a * a + b * b, 2) + ' ✓');
    }

    function handles(pts) {
      var g = box.g;
      for (var i = 0; i < pts.length; i++) {
        var x = SX(pts[i][0]), y = SY(pts[i][1]);
        g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2);
        g.fillStyle = 'rgba(6,12,22,.9)'; g.fill();
        g.strokeStyle = acc; g.lineWidth = 1.8; g.stroke();
        g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2);
        g.fillStyle = acc; g.fill();
      }
    }

    /* ---- 内角和 ---- */
    function drawAngles() {
      var A = [-2.55, -1.3], B = [2.55, -1.3], C = [st.cX, st.cY];
      fitView({
        x0: Math.min(A[0], B[0], C[0]) - 0.55,
        x1: Math.max(A[0], B[0], C[0]) + 0.55,
        y0: Math.min(A[1], B[1], C[1]) - 0.5,
        y1: Math.max(A[1], B[1], C[1]) + 0.5
      });
      var g = box.g;

      poly([A, B, C]);
      g.fillStyle = 'rgba(77,226,255,.075)';
      g.fill();
      g.strokeStyle = 'rgba(225,242,255,.75)';
      g.lineWidth = 1.5;
      g.stroke();

      var aA = angleAt(A, B, C), aB = angleAt(B, A, C), aC = angleAt(C, A, B);
      drawArc(A, B, C, '#7fe9ff', 'α ' + fixed(aA, 0) + '°');
      drawArc(B, A, C, '#ffcf6b', 'β ' + fixed(aB, 0) + '°');
      drawArc(C, A, B, '#ff9ad4', 'γ ' + fixed(aC, 0) + '°');

      handles([C]);
      label(C[0], C[1] + 0.28, 'C', 'rgba(230,248,255,.9)', 'italic 600 12px Georgia, serif');
      label(A[0] - 0.22, A[1] - 0.26, 'A', 'rgba(230,248,255,.55)', 'italic 600 12px Georgia, serif');
      label(B[0] + 0.22, B[1] - 0.26, 'B', 'rgba(230,248,255,.55)', 'italic 600 12px Georgia, serif');

      // 180° 直尺：三段严丝合缝
      var bx0 = 46, bx1 = box.w - 46, by = box.h - 18, bh = 9;
      var total = aA + aB + aC;
      var segs = [['#7fe9ff', aA], ['#ffcf6b', aB], ['#ff9ad4', aC]];
      var cx = bx0;
      g.font = '9.5px ui-monospace, Consolas, monospace';
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      for (var i = 0; i < segs.length; i++) {
        var wSeg = (segs[i][1] / total) * (bx1 - bx0);
        g.fillStyle = segs[i][0];
        g.globalAlpha = 0.55;
        g.fillRect(cx, by, Math.max(1, wSeg - 1.5), bh);
        g.globalAlpha = 1;
        if (wSeg > 30) {
          g.fillStyle = 'rgba(220,240,255,.8)';
          g.fillText(fixed(segs[i][1], 0) + '°', cx + wSeg / 2, by - 2);
        }
        cx += wSeg;
      }
      g.strokeStyle = 'rgba(120,180,255,.25)';
      g.strokeRect(bx0 - 0.5, by - 0.5, bx1 - bx0 + 1, bh + 1);

      out.set('A', fixed(aA, 1) + '°');
      out.set('B', fixed(aB, 1) + '°');
      out.set('C', fixed(aC, 1) + '°');
      out.set('sum', fixed(total, 1) + '° ✓');
    }

    function angleAt(P, Q, R) {
      var v1x = Q[0] - P[0], v1y = Q[1] - P[1];
      var v2x = R[0] - P[0], v2y = R[1] - P[1];
      var d = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y));
      return Math.acos(clamp(d, -1, 1)) * 180 / Math.PI;
    }

    function drawArc(P, Q, R, color, txt) {
      var g = box.g;
      var px = SX(P[0]), py = SY(P[1]);
      var a1 = Math.atan2(SY(Q[1]) - py, SX(Q[0]) - px);
      var a2 = Math.atan2(SY(R[1]) - py, SX(R[0]) - px);
      var d = a2 - a1;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      var r = 27;
      g.beginPath();
      g.arc(px, py, r, a1, a1 + d, d < 0);
      g.strokeStyle = color;
      g.lineWidth = 2.2;
      g.stroke();
      g.fillStyle = color;
      g.font = '600 11px ui-monospace, Consolas, monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      var mid = a1 + d / 2;
      g.fillText(txt, px + Math.cos(mid) * (r + 17), py + Math.sin(mid) * (r + 17));
    }

    /* ---- 圆周角 ---- */
    var DEG = Math.PI / 180;
    function drawInscribed() {
      fitView({ x0: -3.15, x1: 3.15, y0: -3.0, y1: 3.0 });
      var g = box.g;
      var R = 2.6;
      var Aa = 205 * DEG, Ba = -25 * DEG, Pa = st.pAng * DEG;
      var A = [Math.cos(Aa) * R, Math.sin(Aa) * R];
      var B = [Math.cos(Ba) * R, Math.sin(Ba) * R];
      var Pv = [Math.cos(Pa) * R, Math.sin(Pa) * R];

      // 圆
      g.beginPath();
      g.arc(SX(0), SY(0), R * view.sc, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(120,180,255,.3)';
      g.lineWidth = 1.2;
      g.stroke();

      // 被截的弧 AB（不含 P 的那段）
      g.beginPath();
      g.arc(SX(0), SY(0), R * view.sc, -25 * DEG, 205 * DEG, true);
      g.strokeStyle = hexA(acc, 0.9);
      g.lineWidth = 3;
      g.stroke();

      // 弦与两条射线
      g.strokeStyle = 'rgba(150,180,220,.28)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(SX(A[0]), SY(A[1])); g.lineTo(SX(B[0]), SY(B[1])); g.stroke();

      g.strokeStyle = 'rgba(225,242,255,.72)';
      g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(SX(Pv[0]), SY(Pv[1])); g.lineTo(SX(A[0]), SY(A[1])); g.stroke();
      g.beginPath(); g.moveTo(SX(Pv[0]), SY(Pv[1])); g.lineTo(SX(B[0]), SY(B[1])); g.stroke();

      // 圆心与半径
      g.fillStyle = 'rgba(200,220,245,.5)';
      g.beginPath(); g.arc(SX(0), SY(0), 2.4, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(196,181,255,.45)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(SX(0), SY(0)); g.lineTo(SX(A[0]), SY(A[1])); g.stroke();
      g.beginPath(); g.moveTo(SX(0), SY(0)); g.lineTo(SX(B[0]), SY(B[1])); g.stroke();

      // 两个角弧
      var ins = angleAt(Pv, A, B);
      var cen = angleBetween(A, B);   // 圆心角（截弧那侧）
      drawArc(Pv, A, B, '#7fe9ff', '∠APB');
      drawArc([0, 0], A, B, '#c4b5ff', '');

      // 点
      var pts = [[A, '#c4b5ff', 'A'], [B, '#c4b5ff', 'B'], [Pv, '#7fe9ff', 'P']];
      for (var i = 0; i < pts.length; i++) {
        var q = pts[i][0];
        g.beginPath(); g.arc(SX(q[0]), SY(q[1]), 4.2, 0, Math.PI * 2);
        g.fillStyle = pts[i][1]; g.fill();
        g.beginPath(); g.arc(SX(q[0]), SY(q[1]), 8, 0, Math.PI * 2);
        g.strokeStyle = hexA('#ffffff', 0.25); g.lineWidth = 1; g.stroke();
        g.fillStyle = pts[i][1];
        g.font = '600 12px ui-monospace, Consolas, monospace';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        var lx = q[0] * 1.14, ly = q[1] * 1.14;
        g.fillText(pts[i][2], SX(lx), SY(ly));
      }
      handles([Pv]);

      out.set('ins', fixed(ins, 1) + '°');
      out.set('cen', fixed(cen, 1) + '°');
      out.set('ratio', '1 : ' + fixed(cen / Math.max(ins, 0.001), 2));
    }

    /** 圆心角：取 A→B 逆时针（-25°→205°）之外的小弧，即 130° */
    function angleBetween(A, B) {
      var a1 = Math.atan2(A[1], A[0]), a2 = Math.atan2(B[1], B[0]);
      var d = a2 - a1;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return Math.abs(d) * 180 / Math.PI;
    }

    /* ---- 交互 ---- */
    var downPos = null;
    function toMath(e) {
      var r = box.cv.getBoundingClientRect();
      var px = e.clientX - r.left, py = e.clientY - r.top;
      return { x: view.cx + (px - box.w / 2) / view.sc, y: view.cy - (py - box.h / 2) / view.sc, px: px, py: py };
    }

    function pick(e) {
      var m = toMath(e);
      if (st.mode === 0) {
        var dA = Math.hypot(m.px - SX(st.a), m.py - SY(0));
        var dB = Math.hypot(m.px - SX(0), m.py - SY(st.b));
        if (dA < 30 && dA <= dB) return 'a';
        if (dB < 30) return 'b';
      } else if (st.mode === 1) {
        var dC = Math.hypot(m.px - SX(st.cX), m.py - SY(st.cY));
        if (dC < 32) return 'c';
      } else {
        var ang = Math.atan2(m.y, m.x) / DEG;
        if (ang < -25) ang += 360;
        if (Math.abs(m.x) < 3.4 && Math.abs(m.y) < 3.4) return 'p';
      }
      return null;
    }

    box.cv.addEventListener('pointerdown', function (e) {
      st.drag = pick(e);
      downPos = toMath(e);
      if (st.drag) {
        box.cv.setPointerCapture(e.pointerId);
        box.cv.style.cursor = 'grabbing';
      }
    });
    box.cv.addEventListener('pointermove', function (e) {
      if (!st.drag) {
        box.cv.style.cursor = pick(e) ? 'grab' : 'default';
        return;
      }
      var m = toMath(e);
      if (st.drag === 'a') st.a = clamp(m.x, 0.9, 3.1);
      else if (st.drag === 'b') st.b = clamp(m.y, 0.9, 3.1);
      else if (st.drag === 'c') { st.cX = clamp(m.x, -2.2, 2.2); st.cY = clamp(m.y, 0.2, 2.6); }
      else if (st.drag === 'p') {
        var ang = Math.atan2(m.y, m.x) / DEG;
        if (ang < 0) ang += 360;
        st.pAng = clamp(ang, -20 + 360 * 0, 200);
        if (ang > 200 && ang < 335) st.pAng = ang < 270 ? 200 : -20;
      }
    });
    function endDrag(e) {
      if (!st.drag) return;
      st.drag = null;
      try { box.cv.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      box.cv.style.cursor = 'grab';
    }
    box.cv.addEventListener('pointerup', endDrag);
    box.cv.addEventListener('pointercancel', endDrag);

    /* 面积搬运：重置进度后由 tick 推进 */
    var moving = false;
    moveBtn.addEventListener('click', function () {
      if (st.mode !== 0) return;
      st.move = 0;
      moving = true;
    });

    function tick(dt, t) {
      if (!box.ready) return;
      // 模式与视图尺寸变化时清屏重绘
      box.g.clearRect(0, 0, box.w, box.h);
      if (moving) {
        st.move = Math.min(1, st.move + dt * 0.85);
        if (st.move >= 1) moving = false;
      }
      if (st.mode === 0) drawPyth(t);
      else if (st.mode === 1) drawAngles();
      else drawInscribed();
    }

    box.fit();
    setupOut();
    return {
      el: el,
      box: box,
      setMode: function (i) {
        if (i === st.mode) return;
        st.mode = i;
        st.drag = null;
        view.init = false;
        if (i === 0) st.move = 1;
        rowMove.style.display = (i === 0) ? '' : 'none';
        setupOut();
      },
      layout: function () { box.fit(); },
      tick: tick,
      dispose: function () { box.dispose(); }
    };
  }

  /* ================= 04 香农信息熵 ================= */

  function EntropyModel(acc) {
    var st = { mode: 0, p: 0.72, n: 8, leaf: 5 };
    var el = h('div', 'ml-card ml-viz');
    el.style.setProperty('--a', acc);
    var vhead = h('div', 'ml-vhead', '<b>不确定性的度量</b><span>比特：一次二分回答所消除的不确定性</span>');
    el.appendChild(vhead);
    var box = canvasBox(el, function (w) { return clamp(w * 0.6, 200, 300); });

    var ctls = h('div', 'ml-ctls');
    el.appendChild(ctls);
    var rowP = rangeRow(ctls, '正面的概率 p', 0.02, 0.98, 0.01, st.p, '', function (v) {
      st.p = v;
    });
    var rowN = rangeRow(ctls, '符号数 n（等概率）', 0, 4, 1, 2,
      function (v) { return String([2, 4, 8, 16, 32][v] || 8); },
      function (v) { st.n = [2, 4, 8, 16, 32][v] || 8; });
    rowN.set(2);
    rowN.row.style.display = 'none';

    var out = outGrid(el);

    function setupOut() {
      out.el.innerHTML = '';
      if (st.mode === 0) {
        out.cell('H', '熵 H(p)', { hl: true });
        out.cell('i1', 'I(正面)', { color: '#ff9ad4' });
        out.cell('i0', 'I(反面)', { color: '#ff9ad4' });
        out.cell('red', '冗余度', { color: '#e8f2ff' });
      } else {
        out.cell('n', '符号数 n', { color: '#e8f2ff' });
        out.cell('H', 'H = log₂n', { hl: true });
        out.cell('len', '定长编码', { color: '#ff9ad4' });
      }
    }

    function ent(p) {
      if (p <= 0 || p >= 1) return 0;
      return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
    }

    function drawCurve(t) {
      var g = box.g, w = box.w, hh = box.h;
      var x0 = 44, y0 = 16, x1 = w - 16, y1 = hh - 42;
      var pw = x1 - x0, ph = y1 - y0;
      var PX = function (p) { return x0 + p * pw; };
      var PY = function (v) { return y1 - v / 1.06 * ph; };

      // 网格
      g.strokeStyle = 'rgba(120,180,255,.07)';
      g.lineWidth = 1;
      for (var gv = 0; gv <= 1.0001; gv += 0.25) {
        var yy = Math.round(PY(gv)) + 0.5;
        g.beginPath(); g.moveTo(x0, yy); g.lineTo(x1, yy); g.stroke();
      }

      // 最大熵参考线
      g.setLineDash([4, 5]);
      g.strokeStyle = 'rgba(255,255,255,.22)';
      g.beginPath(); g.moveTo(x0, PY(1)); g.lineTo(x1, PY(1)); g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(200,220,245,.5)';
      g.font = '9.5px ui-monospace, Consolas, monospace';
      g.textAlign = 'right';
      g.textBaseline = 'bottom';
      g.fillText('1 bit · 最大熵', x1 - 2, PY(1) - 3);

      // 曲线下面积
      var p = st.p;
      g.beginPath();
      g.moveTo(PX(0.0001), PY(ent(0.0001)));
      for (var u = 0.0001; u <= p; u += 0.004) g.lineTo(PX(u), PY(ent(u)));
      g.lineTo(PX(p), y1);
      g.lineTo(PX(0), y1);
      g.closePath();
      var grd = g.createLinearGradient(0, y0, 0, y1);
      grd.addColorStop(0, hexA(acc, 0.30));
      grd.addColorStop(1, hexA(acc, 0.02));
      g.fillStyle = grd;
      g.fill();

      // 曲线
      g.beginPath();
      for (var v = 0.0005; v <= 0.9995; v += 0.003) {
        var X = PX(v), Y = PY(ent(v));
        if (v === 0.0005) g.moveTo(X, Y); else g.lineTo(X, Y);
      }
      g.strokeStyle = hexA(acc, 0.22);
      g.lineWidth = 7;
      g.stroke();
      g.strokeStyle = hexA(acc, 0.6);
      g.lineWidth = 3;
      g.stroke();
      g.strokeStyle = '#f0f8ff';
      g.lineWidth = 1.3;
      g.stroke();

      // 标记点
      var mx = PX(p), my = PY(ent(p));
      g.strokeStyle = hexA(acc, 0.6);
      g.lineWidth = 1;
      g.setLineDash([3, 4]);
      g.beginPath(); g.moveTo(mx, my); g.lineTo(mx, y1); g.stroke();
      g.beginPath(); g.moveTo(x0, my); g.lineTo(mx, my); g.stroke();
      g.setLineDash([]);
      g.beginPath(); g.arc(mx, my, 5, 0, Math.PI * 2);
      g.fillStyle = '#f0f8ff'; g.fill();
      g.beginPath(); g.arc(mx, my, 11, 0, Math.PI * 2);
      g.strokeStyle = hexA(acc, 0.5); g.lineWidth = 1.6; g.stroke();

      g.fillStyle = '#f0f8ff';
      g.font = '600 12px ui-monospace, Consolas, monospace';
      g.textAlign = p > 0.72 ? 'right' : 'left';
      g.textBaseline = 'bottom';
      g.fillText('H = ' + fixed(ent(p), 3), mx + (p > 0.72 ? -14 : 14), my - 8);

      // 坐标轴
      g.strokeStyle = 'rgba(120,180,255,.28)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x0, y1 + 0.5); g.lineTo(x1, y1 + 0.5); g.stroke();
      g.fillStyle = 'rgba(140,165,195,.8)';
      g.font = '9.5px ui-monospace, Consolas, monospace';
      g.textAlign = 'center';
      g.textBaseline = 'top';
      g.fillText('0', x0, y1 + 5);
      g.fillText('0.5', PX(0.5), y1 + 5);
      g.fillText('1', x1, y1 + 5);
      g.textAlign = 'left';
      g.fillStyle = 'rgba(120,145,180,.7)';
      g.fillText('p', x1 + 2, y1 + 5);

      g.save();
      g.translate(12, (y0 + y1) / 2);
      g.rotate(-Math.PI / 2);
      g.textAlign = 'center';
      g.fillStyle = 'rgba(120,145,180,.75)';
      g.fillText('H (bit)', 0, 0);
      g.restore();
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      var TL = ['0', '0.25', '0.5', '0.75', ''];
      for (var ti = 0; ti < 5; ti++) {
        g.fillStyle = 'rgba(120,145,180,.55)';
        if (TL[ti]) g.fillText(TL[ti], x0 - 7, PY(ti * 0.25));
      }

      out.set('H', fixed(ent(p), 3) + ' bit');
      out.set('i1', fixed(-Math.log2(p), 2));
      out.set('i0', fixed(-Math.log2(1 - p), 2));
      out.set('red', fixed((1 - ent(p)) * 100, 1) + '%');
    }

    function drawTree() {
      var g = box.g, w = box.w, hh = box.h;
      var n = st.n;
      var d = Math.round(Math.log2(n));
      var leaf = st.leaf % n;
      var x0 = 66, x1 = w - 30, y0 = 30, y1 = hh - 34;
      var dy = (y1 - y0) / d;
      var pos = function (k, i) {
        var cnt = 1 << k;
        return { x: x0 + (i + 0.5) * (x1 - x0) / cnt, y: y0 + k * dy };
      };
      var onPath = function (k, i) {
        return i === Math.floor(leaf / Math.pow(2, d - k));
      };

      // 连线：高亮路径先铺一层宽的低透明度光晕，再压一条细亮线
      for (var k = 1; k <= d; k++) {
        var cnt = 1 << k;
        for (var i = 0; i < cnt; i++) {
          var a = pos(k, i), b = pos(k - 1, i >> 1);
          var on = onPath(k, i);
          g.beginPath();
          g.moveTo(b.x, b.y); g.lineTo(a.x, a.y);
          if (on) {
            g.strokeStyle = hexA(acc, 0.16);
            g.lineWidth = 5;
            g.stroke();
            g.strokeStyle = hexA(acc, 0.9);
            g.lineWidth = 1.7;
          } else {
            g.strokeStyle = 'rgba(120,180,255,.12)';
            g.lineWidth = 1;
          }
          g.stroke();
        }
      }

      // 根节点两条分支的 0 / 1
      var l0 = pos(1, 0), r0 = pos(1, 1), rt = pos(0, 0);
      g.font = '10px ui-monospace, Consolas, monospace';
      g.textBaseline = 'middle';
      g.textAlign = 'right';
      g.fillStyle = 'rgba(140,165,195,.7)';
      g.fillText('0', (rt.x + l0.x) / 2 - 4, (rt.y + l0.y) / 2);
      g.textAlign = 'left';
      g.fillText('1', (rt.x + r0.x) / 2 + 4, (rt.y + r0.y) / 2);

      // 节点
      for (var k2 = 0; k2 <= d; k2++) {
        var cnt2 = 1 << k2;
        for (var j = 0; j < cnt2; j++) {
          var p = pos(k2, j);
          var on2 = onPath(k2, j);
          var rr = (k2 === d ? (n > 16 ? 2.6 : 3.4) : 3.4) + (on2 ? 1.1 : 0);
          if (on2) {
            g.beginPath();
            g.arc(p.x, p.y, rr + 5, 0, Math.PI * 2);
            g.strokeStyle = hexA(acc, 0.3);
            g.lineWidth = 1;
            g.stroke();
          }
          g.beginPath();
          g.arc(p.x, p.y, rr, 0, Math.PI * 2);
          g.fillStyle = on2 ? acc : 'rgba(120,180,255,.3)';
          g.fill();
        }
        g.fillStyle = 'rgba(120,145,180,.55)';
        g.font = '9px ui-monospace, Consolas, monospace';
        g.textAlign = 'right';
        g.textBaseline = 'middle';
        g.fillText(k2 === 0 ? '开始' : k2 + ' bit', x0 - 14, y0 + k2 * dy);
      }

      // 选中叶子：底衬 + 文字
      var lf = pos(d, leaf);
      var txt = '符号 #' + (leaf + 1);
      g.font = '600 10.5px ui-monospace, Consolas, monospace';
      var tw = g.measureText(txt).width;
      var bx = Math.min(Math.max(lf.x, x0 + tw / 2 + 8), x1 - tw / 2 - 4);
      var by = Math.max(lf.y - 12, 14);
      g.beginPath();
      var rr2 = 4, bw = tw + 12, bhh = 17;
      var lx = bx - bw / 2, ly = by - bhh;
      g.moveTo(lx + rr2, ly);
      g.lineTo(lx + bw - rr2, ly);
      g.quadraticCurveTo(lx + bw, ly, lx + bw, ly + rr2);
      g.lineTo(lx + bw, ly + bhh - rr2);
      g.quadraticCurveTo(lx + bw, ly + bhh, lx + bw - rr2, ly + bhh);
      g.lineTo(lx + rr2, ly + bhh);
      g.quadraticCurveTo(lx, ly + bhh, lx, ly + bhh - rr2);
      g.lineTo(lx, ly + rr2);
      g.quadraticCurveTo(lx, ly, lx + rr2, ly);
      g.closePath();
      g.fillStyle = 'rgba(8,13,24,.92)';
      g.fill();
      g.strokeStyle = hexA(acc, 0.55);
      g.lineWidth = 1;
      g.stroke();
      g.fillStyle = '#f0f8ff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(txt, bx, ly + bhh / 2 + 0.5);

      out.set('n', String(n));
      out.set('H', d + ' bit');
      out.set('len', d + ' 位二进制');
    }

    function tick(dt, t) {
      if (!box.ready) return;
      box.g.clearRect(0, 0, box.w, box.h);
      if (st.mode === 0) drawCurve(t);
      else drawTree();
    }

    box.fit();
    setupOut();
    return {
      el: el,
      box: box,
      setMode: function (i) {
        st.mode = i;
        rowP.row.style.display = i === 0 ? '' : 'none';
        rowN.row.style.display = i === 1 ? '' : 'none';
        setupOut();
      },
      layout: function () { box.fit(); },
      tick: tick,
      dispose: function () { box.dispose(); }
    };
  }

  /* ================= 颜色工具 ================= */

  function hexA(hex, a) {
    var c = hex.replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    var r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /* ================= 模型文案 ================= */

  var MODELS = [
    {
      no: '01', name: '贝叶斯定理', en: "BAYES' THEOREM", acc: '#4de2ff',
      tag: '概率推断', defTag: '用证据修正信念',
      lead: '看到结果之后，如何反过来推断原因。',
      def: '贝叶斯定理回答的是一个「反问题」：<b>已知证据 B 发生，某个假设 A 成立的概率是多少？</b>' +
        '它把主观的先验信念与客观的证据强度相乘，再用「无论何种原因、证据出现的总概率」归一化。' +
        '于是每一次观测，都成为对信念的一次小幅校正 —— 这正是现代机器学习、医学诊断与司法推断共同的底层逻辑。',
      terms: [['先验', 'P(A)'], ['似然', 'P(B|A)'], ['后验', 'P(A|B)'], ['证据', 'P(B)']],
      texList: [
        {
          tab: '后验公式',
          tex: '\\begin{gathered}P(A\\mid B)=\\frac{P(B\\mid A)\\,P(A)}{P(B)}\\\\[3pt]P(B)=\\sum_{i}P(B\\mid A_i)\\,P(A_i)\\end{gathered}',
          note: '分母只是归一化常数：它把「在所有可能原因下证据出现的概率」加总，使后验概率之和回到 1。'
        },
        {
          tab: '赔率形式',
          tex: '\\frac{P(A\\mid B)}{P(\\lnot A\\mid B)}=\\frac{P(B\\mid A)}{P(B\\mid\\lnot A)}\\times\\frac{P(A)}{P(\\lnot A)}',
          note: '从左到右依次是：后验赔率 = 似然比 × 先验赔率。换个写法就变清楚了——证据的作用，就是把先验赔率乘上一个固定倍数。'
        }
      ],
      insight: '准确率 95% 的检测，在患病率 1% 的人群里，一次阳性只意味着 15% 的把握。' +
        '因为健康人太多，5% 的假阳性被基数放大成了绝对多数 —— 这也是筛查结果必须复检的原因。',
      build: BayesModel
    },
    {
      no: '02', name: '正态分布', en: 'NORMAL DISTRIBUTION', acc: '#8b7bff',
      tag: '随机之形', defTag: '误差的普适形状',
      lead: '大量微小扰动叠加之后，世界总会收敛到这条钟形曲线。',
      def: '若一个连续随机变量的取值围绕中心 <b>μ</b> 对称聚集、偏离越远越稀有，且聚集程度由 <b>σ</b> 统一刻画，' +
        '它的密度就是正态分布。它既是二项分布在 n→∞ 时的极限，也是<b>大量独立微小扰动叠加后的必然形状</b>——' +
        '这正是中心极限定理的全部内容。身高、测量误差、血压、股票日收益率，都被它近似描述。',
      terms: [['均值', 'μ'], ['标准差', 'σ'], ['标准化', 'z = (x−μ)/σ'], ['经验法则', '68 · 95 · 99.7']],
      texList: [
        {
          tab: '密度函数',
          tex: 'f(x)=\\frac{1}{\\sigma\\sqrt{2\\pi}}\\,\\exp\\!\\left(-\\frac{(x-\\mu)^{2}}{2\\sigma^{2}}\\right)',
          note: 'σ 越小曲线越尖、越集中；无论 σ 取何值，曲线下的总面积恒为 1 —— 它是一条概率密度，不是概率本身。'
        },
        {
          tab: '标准化',
          tex: '\\begin{gathered}Z=\\frac{X-\\mu}{\\sigma}\\\\[3pt]P(\\mu-k\\sigma\\le X\\le\\mu+k\\sigma)=\\operatorname{erf}\\!\\left(\\frac{k}{\\sqrt{2}}\\right)\\end{gathered}',
          note: '任何正态变量减去 μ、再除以 σ 都变成标准正态 N(0,1)。这一步「标准化」让所有正态问题共用一个查表。'
        }
      ],
      insight: '±1σ 内落着 68.3% 的样本，±2σ 内 95.4%，±3σ 内 99.7%。' +
        '「六西格玛」之所以苛刻，是因为 6σ 之外只剩十亿分之二。但真实金融数据的尾部远比正态更厚——黑天鹅正是正态假设最危险的边界。',
      build: NormalModel
    },
    {
      no: '03', name: '欧几里得几何', en: 'EUCLIDEAN GEOMETRY', acc: '#ffcf6b',
      tag: '公理演绎', defTag: '从五条公设推出整个世界',
      lead: '不测量，只证明 —— 人类第一次把「必然」写成可检验的链条。',
      def: '欧几里得在《几何原本》里只用了 <b>五条公设与五条公理</b>，演绎出 465 个命题。' +
        '他拒绝依赖测量，只承认「由已知推出未知」：每一步都必须能追溯到前面某一步。' +
        '这是人类第一次把「证明」写成可检查的形式，也奠定了此后两千三百年科学推理的范式。' +
        '直到非欧几何出现，人们才意识到：<b>第五公设并非唯一选择</b>，换掉它，就是另一个宇宙。',
      terms: [['公设', 'postulate'], ['演绎', 'deduction'], ['全等', 'congruent'], ['相似', 'similar']],
      texList: [
        {
          tab: '勾股定理',
          tex: 'a^{2}+b^{2}=c^{2}',
          note: '直角三角形两条直角边的平方和等于斜边的平方。它是《原本》第一卷命题 47，也被认为是连接代数与几何的第一座桥。'
        },
        {
          tab: '内角和',
          tex: '\\alpha+\\beta+\\gamma=\\pi=180^{\\circ}',
          note: '三角形内角和恒为 180°。这个结论只在欧氏几何成立：球面上大于 180°，马鞍面上小于 180°。'
        },
        {
          tab: '圆周角',
          tex: '\\angle APB=\\tfrac{1}{2}\\,\\angle AOB',
          note: '同一条弧所对的圆周角，恒为圆心角的一半。当弦 AB 恰好是直径时，圆心角 180°，圆周角就是直角（泰勒斯定理）。'
        }
      ],
      insight: '勾股定理有 400 多种证明，最直观的一种是面积：两个小正方形里的每一块，都能恰好搬进斜边上的大正方形 —— 不多不少。' +
        '这种「把证明变成可看见的面积搬运」的思路，正是欧几里得式演绎最迷人的地方。',
      build: EuclidModel
    },
    {
      no: '04', name: '香农信息熵', en: 'SHANNON ENTROPY', acc: '#ff7ab8',
      tag: '信息度量', defTag: '把不确定性变成比特',
      lead: '一条消息里究竟含有多少信息？1948 年，香农给出了可计算的答案。',
      def: '香农问了一个此前没人量化过的问题：<b>一条消息里究竟含有多少信息？</b>' +
        '他的答案是把「不确定性」变成可计算的量：若一个结果出现的概率是 p，它带来的信息量是 −log₂p；' +
        '对所有结果按概率加权平均，就得到熵 H。<b>它同时是「平均惊讶程度」与「无损压缩的极限」</b>——' +
        '任何编码的平均长度都不可能低于熵。',
      terms: [['比特', 'bit'], ['惊讶度', '−log₂p'], ['最大熵', 'log₂n'], ['压缩极限', 'H']],
      texList: [
        {
          tab: '香农熵',
          tex: '\\begin{gathered}H(X)=-\\sum_{i=1}^{n}p_{i}\\log_{2}p_{i}\\\\[3pt]I(x_i)=-\\log_2 p_i\\end{gathered}',
          note: '概率越小的结果，出现时带来的「惊讶」越大；熵是按概率加权的平均惊讶度。约定 0·log0 = 0。'
        },
        {
          tab: '等概率信源',
          tex: '0\\le H(X)\\le \\log_{2}n',
          note: 'n 个等概率符号时熵取最大值 log₂n，恰好等于用二进制编码表示它们所需的最少位数：8 个符号 = 3 bit。'
        }
      ],
      insight: '熵是压缩的物理下限：英文的熵约 1.1 bit/字母，所以文本总能被压到原体积的 20% 左右；' +
        '而加密后的数据熵接近 8 bit/字节，几乎不可压缩——这正是「加密与压缩不可兼得」的信息论解释。',
      build: EntropyModel
    }
  ];

  /* ================= 场景注册 ================= */

  HL.registerScene({
    id: 'math',
    name: '数学模型',
    short: '贝叶斯 · 正态 · 欧几里得 · 信息熵',
    icon: '∑',
    fov: 48,
    minDistance: 2,
    maxDistance: 200,
    desc: '四个塑造了现代世界的模型：用证据修正信念的贝叶斯定理、描述随机与误差的正态分布、' +
      '从公理推出确定性的欧几里得几何，以及把「不确定性」变成可计算比特的香农信息熵。',

    controls: [
      { type: 'button', key: 'tour', label: '📖 讲解模式' },
      { type: 'button', key: 'top', label: '↑ 回到页首' }
    ],

    create: function (ctx) {
      var stage = doc.getElementById('stage') || ctx.canvas.parentElement;

      var root = h('div', 'mlab');
      var bg = h('div', 'ml-bg',
        '<span class="grid"></span><span class="g g1"></span><span class="g g2"></span><span class="scan"></span>');
      root.appendChild(bg);

      /* ---------- 顶栏 ---------- */
      var top = h('header', 'ml-top');
      var brand = h('div', 'ml-brand',
        '<span class="ml-sig">∑</span><div><b>数学的语言</b><em>THE LANGUAGE OF MATHEMATICS</em></div>');
      top.appendChild(brand);

      var nav = h('nav', 'ml-nav');
      var tabs = [];
      MODELS.forEach(function (m, i) {
        var b = h('button', 'ml-tab' + (i === 0 ? ' on' : ''), '<i>' + m.no + '</i>' + m.name);
        b.style.setProperty('--a', m.acc);
        b.addEventListener('click', function () { goSec(i); });
        nav.appendChild(b);
        tabs.push(b);
      });
      top.appendChild(nav);

      var tools = h('div', 'ml-tools');
      var tourBtn = h('button', 'ml-btn', '📖 讲解');
      tools.appendChild(tourBtn);
      top.appendChild(tools);
      root.appendChild(top);

      var prog = h('div', 'ml-prog', '<i></i>');
      root.appendChild(prog);

      /* ---------- 滚动区 ---------- */
      var scroll = h('div', 'ml-scroll');
      var inner = h('div', 'ml-in');
      scroll.appendChild(inner);
      root.appendChild(scroll);

      // 开篇
      var hero = h('div', 'ml-hero');
      hero.appendChild(h('div', 'ml-kick', '<i>CHAPTER Ⅲ · 规律的抽象</i><span>MATHEMATICAL MODELS</span>'));
      hero.appendChild(h('h1', null, '数学的语言<em>FOUR MODELS THAT SHAPE THE WORLD</em>'));
      hero.appendChild(h('p', 'lead',
        '人类没有直接看见引力、没有摸到电子，却能写出它们的方程。数学是那门「用符号描述看不见之物」的语言：' +
        '它把世界压缩成几个变量，再让推导替我们走完剩下的路。下面四个模型，分别处理四类问题——' +
        '<b>如何修正信念</b>、<b>如何描述随机</b>、<b>如何确定必然</b>、<b>如何度量未知</b>。'));
      var chips = h('div', 'chips');
      MODELS.forEach(function (m, i) {
        var c = h('span', 'ml-chip', '<b style="color:' + m.acc + '">' + m.no + '</b> ' + m.name + ' · ' + m.tag);
        c.style.cursor = 'pointer';
        c.addEventListener('click', function () { goSec(i); });
        chips.appendChild(c);
      });
      hero.appendChild(chips);
      inner.appendChild(hero);

      /* ---------- 四个模型 ---------- */
      var vizzes = [], secEls = [];

      function buildFormulaCard(m, onTab) {
        var card = h('div', 'ml-card ml-fml');
        var chh = h('div', 'ml-ch', '<i></i><b>公式</b>');
        var tabsEl = h('div', 'ml-ftabs');
        chh.appendChild(tabsEl);
        card.appendChild(chh);
        var texBox = h('div', 'ml-tex');
        card.appendChild(texBox);
        var note = h('p', 'ml-note');
        card.appendChild(note);

        var cur = 0;
        function pick(i) {
          cur = i;
          Array.prototype.forEach.call(tabsEl.children, function (x, j) {
            x.classList.toggle('on', i === j);
          });
          tex(texBox, m.texList[i].tex);
          note.textContent = m.texList[i].note;
        }
        m.texList.forEach(function (tt, i) {
          var b = h('button', 'ml-ftab', tt.tab);
          b.addEventListener('click', function () {
            pick(i);
            if (onTab) onTab(i);
          });
          tabsEl.appendChild(b);
        });
        pick(0);
        card.pick = pick;
        card.index = function () { return cur; };
        return card;
      }

      MODELS.forEach(function (m, i) {
        var sec = h('section', 'ml-sec');
        sec.style.setProperty('--a', m.acc);
        sec.appendChild(h('span', 'ml-num', m.no));

        var shead = h('div', 'ml-shead');
        shead.appendChild(h('div', 'ml-kick', '<i>MODEL ' + m.no + '</i><span>' + m.tag + '</span>'));
        shead.appendChild(h('h2', null, m.name + '<em>' + m.en + '</em>'));
        shead.appendChild(h('p', null, m.lead));
        sec.appendChild(shead);

        var grid = h('div', 'ml-grid');
        var left = h('div', 'ml-col');
        var right = h('div', 'ml-col');

        var def = h('div', 'ml-card ml-def');
        def.appendChild(h('div', 'ml-ch', '<i></i><b>定义</b><span>' + m.defTag + '</span>'));
        def.appendChild(h('p', null, m.def));
        var terms = h('div', 'ml-terms');
        m.terms.forEach(function (t) {
          terms.appendChild(h('span', null, '<em>' + t[0] + '</em>' + t[1]));
        });
        def.appendChild(terms);
        left.appendChild(def);

        var viz = m.build(m.acc);
        var fml = buildFormulaCard(m, viz.setMode);
        left.appendChild(fml);
        right.appendChild(viz.el);
        grid.appendChild(left);
        grid.appendChild(right);
        sec.appendChild(grid);

        var ins = h('div', 'ml-insight');
        ins.appendChild(h('b', null, '◈ 直觉'));
        ins.appendChild(h('p', null, m.insight));
        sec.appendChild(ins);

        inner.appendChild(sec);
        secEls.push(sec);
        vizzes.push(viz);
      });

      var tail = h('div', 'ml-tail',
        '四个模型，四种把世界变成可计算对象的方式 · 人类之光 · 罗司徒');
      inner.appendChild(tail);

      stage.appendChild(root);
      stage.classList.add('lab-mode');

      /* ---------- 导航 / 进度 / 入场 ---------- */
      var cur = -1;
      function setActive(i) {
        if (i === cur) return;
        cur = i;
        tabs.forEach(function (b, j) { b.classList.toggle('on', i === j); });
      }

      function goSec(i) {
        var el = secEls[i];
        if (!el) return;
        scroll.scrollTo({ top: el.offsetTop - 6, behavior: 'smooth' });
      }

      var onScroll = function () {
        var sr = scroll.getBoundingClientRect();
        var probe = sr.top + 90;
        var idx = 0;
        for (var i = 0; i < secEls.length; i++) {
          var r = secEls[i].getBoundingClientRect();
          if (r.top <= probe) idx = i;
        }
        setActive(idx);
        var max = scroll.scrollHeight - scroll.clientHeight;
        prog.firstChild.style.transform = 'scaleX(' + (max > 8 ? scroll.scrollTop / max : 0) + ')';
      };
      scroll.addEventListener('scroll', onScroll, { passive: true });

      // 入场：可见即淡入；首屏立即显示，避免观察器延迟造成空白
      var revealAll = function () {
        secEls.forEach(function (s) { s.classList.add('in'); });
      };
      var io = null;
      if (global.IntersectionObserver) {
        io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) en.target.classList.add('in');
          });
        }, { root: scroll, rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
        secEls.forEach(function (s) { io.observe(s); });
      } else {
        revealAll();
      }
      secEls[0].classList.add('in');

      /* ---------- 画布可见性：离屏不画 ---------- */
      var vis = vizzes.map(function () { return true; });
      var vio = null;
      if (global.IntersectionObserver) {
        vio = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            var i = secEls.indexOf(en.target);
            if (i >= 0) vis[i] = en.isIntersecting;
          });
        }, { root: scroll, rootMargin: '120px 0px 120px 0px', threshold: 0 });
        secEls.forEach(function (s) { vio.observe(s); });
      }

      /* ---------- 讲解模式 ---------- */
      var tour = HL.Tour(ctx, { accent: 0x4de2ff });
      tour.load([
        {
          t: '一、用证据修正信念',
          d: '贝叶斯定理把「先验」与「证据」相乘，得到「后验」。医学筛查是它最容易被误解的舞台：准确率 95% 的检测，在罕见病面前可能只给出 15% 的把握。',
          exp: '把「患病率」拖到 0.2%，再看后验数字怎么塌下去。',
          cam: [[0, 2, 26], [0, 0, 0]], pulse: null,
          apply: function () { goSec(0); }
        },
        {
          t: '二、误差的普适形状',
          d: '大量独立微小扰动叠加，分布必然收敛到正态——这不是巧合，是中心极限定理。所以身高、测量误差、血压都长成同一条钟形曲线。',
          exp: '拖动 σ，观察曲线变尖变宽；再在曲线上移动指针，读出 z 值与累计概率。',
          cam: [[0, 2, 26], [0, 0, 0]], pulse: null,
          apply: function () { goSec(1); }
        },
        {
          t: '三、只靠推演就能知道',
          d: '欧几里得不用尺子，只用五条公设。勾股定理、内角和、圆周角，都是「必然」——它们不依赖测量，因此永远不会被更好的仪器推翻。',
          exp: '拖动三角形的顶点，看三个角怎么变、总和为什么始终是 180°。',
          cam: [[0, 2, 26], [0, 0, 0]], pulse: null,
          apply: function () { goSec(2); }
        },
        {
          t: '四、把未知变成比特',
          d: '香农用 −log₂p 度量「惊讶」，加权平均得到熵。它既是平均惊讶度，也是无损压缩的物理下限——任何编码都不可能比熵更短。',
          exp: '把 p 拖到 0.5，熵取到最大值 1 bit；再切到「等概率信源」，看 log₂n 与编码位数的对应。',
          cam: [[0, 2, 26], [0, 0, 0]], pulse: null,
          apply: function () { goSec(3); }
        }
      ]);

      tourBtn.addEventListener('click', function () {
        tour.toggle();
        tourBtn.classList.toggle('on', tour.active());
      });

      var onResize = function () {
        vizzes.forEach(function (v) { if (v.layout) v.layout(); });
        onScroll();
      };
      global.addEventListener('resize', onResize);

      // 首次布局：容器宽度要等一帧才稳定
      global.requestAnimationFrame(function () {
        vizzes.forEach(function (v) { if (v.layout) v.layout(); });
        onScroll();
      });

      // 测试钩子（截图脚本 / 回归用）：不改变任何默认行为
      global.__MATH = {
        go: function (i) { goSec(i); },
        top: function () { scroll.scrollTo({ top: 0 }); },
        tab: function (mi, ti) {
          var card = secEls[mi] && secEls[mi].querySelector('.ml-fml');
          var btns = card ? card.querySelectorAll('.ml-ftab') : [];
          if (btns[ti]) btns[ti].click();
        },
        state: function () {
          return {
            secs: secEls.length,
            active: cur,
            vis: vis.slice(),
            height: scroll.scrollHeight,
            cards: root.querySelectorAll('.ml-card').length,
            katex: root.querySelectorAll('.katex').length,
            canvases: root.querySelectorAll('canvas').length
          };
        }
      };

      return {
        update: function (dt, t) {
          var d = tour.active() ? 0 : dt;
          tour.update(dt, t, function () { /* 无 3D 模拟 */ });
          tourBtn.classList.toggle('on', tour.active());
          for (var i = 0; i < vizzes.length; i++) {
            if (!vis[i]) continue;
            vizzes[i].tick(d, t);
          }
        },

        setParam: function (key, v) {
          if (key === 'tour') { tour.toggle(); return; }
          if (key === 'top') { scroll.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        },

        dispose: function () {
          tour.dispose();
          global.removeEventListener('resize', onResize);
          scroll.removeEventListener('scroll', onScroll);
          if (io) io.disconnect();
          if (vio) vio.disconnect();
          vizzes.forEach(function (v) { if (v.dispose) v.dispose(); });
          if (global.__MATH) { try { delete global.__MATH; } catch (e) { global.__MATH = null; } }
          stage.classList.remove('lab-mode');
          if (root.parentNode) root.parentNode.removeChild(root);
        }
      };
    }
  });
})(window);
