/**
 * HL.Home —— 开篇页（首页）
 *
 * 这一版的核心：动画不再是"字幕淡入"，而是**一团粒子自组织出四种形态**，
 * 每句文案对应一次变形，字幕与画面同时发生：
 *
 *   Ⅰ 宇宙用数学写就   → 星云坍缩成行星轨道（ω ∝ a^-1.5，内圈明显更快）
 *   Ⅱ 物质有自己的语法 → 轨道收拢成玻尔原子（三层斜壳 + 核）
 *   Ⅲ 规律可以被抽象   → 原子铺展成钟形分布（曲线下方的面积就是概率）
 *   Ⅳ 思维本身也能被观察 → 分布连成神经网络（脉冲沿边跑）
 *
 * 为什么是粒子而不是视频：整个作品是一个离线单文件 HTML，装不进任何素材。
 * 六百个点 + 五张目标图形表，比一帧预告片都轻，而且跟着窗口实时重算。
 *
 * 运动的正确姿势（踩过坑）：椭圆轨道不能靠"旋转坐标"来转 —— y 一旦被压扁，
 * 旋转就把点甩出椭圆。正确做法是让**角参数沿椭圆滑动**：
 *   x = cos(θ+ωt)·rr      y = sin(θ+ωt)·rr·ky      （ky 是压扁比，rot 是固定倾角）
 * 这样行星真的沿椭圆跑，内圈快外圈慢，开普勒第三定律自己浮现出来。
 *
 * 时间轴以音乐的"小节"为单位推进（见 HL.Piano），文案落点因此在拍上。
 */
(function (global) {
  'use strict';

  var HL = global.HL;
  if (!HL) return;

  var P = null;   // HL.Piano（脚本若未加载则为 null，全程静默降级）

  var CHAPTERS = [
    {
      n: 'Ⅰ', t: '宇宙用数学写就', form: 'orbit',
      d: '从托勒玫的本轮到开普勒的椭圆，天空第一次可以被写成一个方程。'
    },
    {
      n: 'Ⅱ', t: '物质有自己的语法', form: 'atom',
      d: '一百一十八种元素排进同一张表，用同样的几条规则拼出岩石、海水与细胞壁。'
    },
    {
      n: 'Ⅲ', t: '规律可以被抽象', form: 'wave',
      d: '同一个符号体系，既能描述误差的形状，也能描述线段的长度与信息的多少。'
    },
    {
      n: 'Ⅳ', t: '思维本身也能被观察', form: 'net',
      d: '神经元的放电、权重的连接 —— 思考第一次有了可以看见的形状。'
    }
  ];

  var COLORS = [
    'rgba(156, 196, 242, ',   // 0 常规星尘
    'rgba(124, 220, 255, ',   // 1 冷色高亮
    'rgba(255, 205, 140, ',   // 2 暖色高亮
    'rgba(127, 240, 207, '    // 3 薄荷
  ];

  /* ==================================================================
     形态生成
     每个目标点：{ rr, ang, ky, rot, om }  椭圆运动参数（om=0 则静止）
                或 { fx, fy }             固定局部坐标（om=0 时使用）
                + { role, r, a }          颜色档 / 半径 / 透明度
     返回值还可带 rings / core / curve / links，画在粒子之下
     ================================================================== */
  function ptsNebula(n, R) {
    var pts = [], i, arms = 3;
    for (i = 0; i < n; i++) {
      var arm = i % arms;
      var u = Math.pow(Math.random(), 0.78);
      var rr = R * (0.08 + u * 0.98) + (Math.random() - 0.5) * R * 0.12;
      var ang = arm * (6.28318 / arms) + (rr / R) * 2.45 + (Math.random() - 0.5) * (0.62 - u * 0.34);
      pts.push({
        rr: rr, ang: ang, ky: 0.46, rot: 0,
        om: 0.34 + 0.4 / (0.35 + u),
        role: u > 0.86 ? 1 : 0, r: 0.5 + Math.random() * 1.0, a: 0.42 + Math.random() * 0.5
      });
    }
    return { pts: pts, core: 0.5 };
  }

  function ptsOrbit(n, R) {
    var pts = [], i;
    var orbits = [0.30, 0.48, 0.68, 0.88, 1.06];
    var focus = [];
    for (i = 0; i < orbits.length; i++) focus.push(Math.random() * 6.28318);

    // 开普勒第三定律：T ∝ a^1.5 → ω ∝ a^-1.5
    function omOf(a) { return 0.46 * Math.pow(a, -1.5); }

    var sun = Math.max(10, Math.round(n * 0.12));
    for (i = 0; i < sun; i++) {
      var a0 = Math.random() * 6.28318, r0 = Math.random() * R * 0.085;
      pts.push({ rr: r0, ang: a0, ky: 0.85, om: 0.25, role: 2, r: 0.9 + Math.random() * 1.0, a: 0.9 });
    }
    var rest = n - sun;
    for (var o = 0; o < orbits.length; o++) {
      var rr = R * orbits[o], omv = omOf(orbits[o]);
      var per = (o === orbits.length - 1) ? (rest - Math.floor(rest / orbits.length) * (orbits.length - 1))
        : Math.floor(rest / orbits.length);
      for (i = 0; i < per; i++) {
        var isBody = i < per * 0.62;
        var ang = isBody ? focus[o] + (Math.random() - 0.5) * 0.3 : Math.random() * 6.28318;
        pts.push({
          rr: rr, ang: ang, ky: 0.42, om: omv,
          role: isBody ? (o === 2 ? 1 : 2) : 0,
          r: isBody ? 1.25 + Math.random() * 0.9 : 0.45,
          a: isBody ? 1.0 : 0.2 + Math.random() * 0.14
        });
      }
    }
    while (pts.length < n) {
      pts.push({ fx: Math.random() * R * 1.6, fy: Math.random() * R * 0.9, om: 0.05, ky: 0.5, role: 0, r: 0.4, a: 0.16 });
    }

    var rings = [];
    for (i = 0; i < orbits.length; i++) rings.push([R * orbits[i], R * orbits[i] * 0.42, 0, 0.15]);
    return { pts: pts, rings: rings, core: 1.0 };
  }

  function ptsAtom(n, R) {
    var pts = [], i;
    var shells = [0.42, 0.66, 0.92];
    var rot = [0.34, -0.28, 0.62];
    var elec = [0.9, 2.1, 4.4];
    var omShell = [1.05, 0.62, 0.40];

    var nuc = Math.max(12, Math.round(n * 0.18));
    for (i = 0; i < nuc; i++) {
      var a0 = Math.random() * 6.28318, r0 = Math.pow(Math.random(), 0.6) * R * 0.14;
      pts.push({ rr: r0, ang: a0, ky: 0.9, om: 0.18, role: i % 5 === 0 ? 2 : 1, r: 1.0 + Math.random() * 1.1, a: 0.95 });
    }
    var rest = n - nuc;
    for (var s = 0; s < shells.length; s++) {
      var rr = R * shells[s], rt = rot[s];
      var per = (s === shells.length - 1) ? (rest - Math.floor(rest / shells.length) * (shells.length - 1))
        : Math.floor(rest / shells.length);
      for (i = 0; i < per; i++) {
        var isE = i < per * 0.14;
        var ang = isE ? elec[s] + (Math.random() - 0.5) * 0.14 : Math.random() * 6.28318;
        pts.push({
          rr: rr, ang: ang, ky: 0.46, rot: rt, om: omShell[s],
          role: isE ? 1 : 0, r: isE ? 1.8 + Math.random() * 0.5 : 0.45,
          a: isE ? 1.0 : 0.2 + Math.random() * 0.14
        });
      }
    }
    while (pts.length < n) {
      pts.push({ fx: Math.random() * R * 1.4, fy: Math.random() * R * 1.0, om: 0.04, ky: 0.7, role: 0, r: 0.4, a: 0.15 });
    }

    var rings = [];
    for (i = 0; i < shells.length; i++) rings.push([R * shells[i], R * shells[i] * 0.46, rot[i], 0.14]);
    return { pts: pts, rings: rings, core: 0.85 };
  }

  function ptsWave(n, R) {
    var pts = [], i;
    var X0 = -R * 1.45, X1 = R * 1.45, SD = R * 0.52, BASE = -R * 0.30;
    function dens(x) { var z = x / SD; return Math.exp(-0.5 * z * z); }
    for (i = 0; i < n; i++) {
      var x = X0 + Math.random() * (X1 - X0);
      var h = dens(x) * R * 0.82;
      var onEdge = Math.random() < 0.26;
      // canvas 的 y 向下：钟形要"向上拱"，必须取负
      var y = onEdge ? BASE - h * (0.94 + Math.random() * 0.06) : BASE - Math.random() * h;
      pts.push({ fx: x, fy: y, om: 0, role: Math.random() < 0.06 ? 3 : 0,
        r: onEdge ? 1.0 : 0.72, a: onEdge ? 1.0 : 0.5 + Math.random() * 0.28 });
    }
    var curve = [];
    for (i = 0; i <= 90; i++) {
      var cx2 = X0 + (X1 - X0) * (i / 90);
      curve.push([cx2, BASE - dens(cx2) * R * 0.82]);
    }
    var bars = [];
    for (i = 1; i <= 3; i++) {
      var v = SD * i;
      bars.push([v, BASE - dens(v) * R * 0.82], [-v, BASE - dens(-v) * R * 0.82]);
    }
    return { pts: pts, curve: curve, base: BASE, half: R * 1.45, bars: bars };
  }

  function ptsNet(n, R) {
    var pts = [], i, j;
    var layers = [4, 7, 7, 4];
    var NW = R * 1.12, NH = R * 0.86;
    var nodes = [], role = [];
    for (var L = 0; L < layers.length; L++) {
      var lx = -NW + (NW * 2) * (L / (layers.length - 1));
      for (i = 0; i < layers[L]; i++) {
        var ly = -NH + (NH * 2) * (i / (layers[L] - 1));
        nodes.push([lx, ly]);
        role.push(L === 0 ? 3 : L === layers.length - 1 ? 2 : 1);
      }
    }
    var nn = nodes.length;
    var perNode = Math.max(3, Math.floor(n * 0.46 / nn));
    for (i = 0; i < nn; i++) {
      for (j = 0; j < perNode; j++) {
        var a = Math.random() * 6.28318, rr = Math.pow(Math.random(), 0.6) * R * 0.07;
        pts.push({ fx: nodes[i][0] + Math.cos(a) * rr, fy: nodes[i][1] + Math.sin(a) * rr, om: 0,
          role: role[i], r: 1.0 + Math.random() * 0.8, a: 0.9 + Math.random() * 0.1 });
      }
    }
    while (pts.length < n) {
      var pk = nodes[Math.floor(Math.random() * nn)];
      pts.push({ fx: pk[0] + (Math.random() - 0.5) * R * 0.8, fy: pk[1] + (Math.random() - 0.5) * R * 0.55,
        om: 0, role: 0, r: 0.4, a: 0.1 });
    }
    var links = [], base = 0;
    for (var L2 = 0; L2 < layers.length - 1; L2++) {
      var ac = layers[L2], bc = layers[L2 + 1];
      for (i = 0; i < ac; i++) {
        for (j = 0; j < bc; j++) links.push([(base + i) * perNode, (base + ac + j) * perNode, i, j]);
      }
      base += ac;
    }
    return { pts: pts, links: links };
  }

  var GEN = { nebula: ptsNebula, orbit: ptsOrbit, atom: ptsAtom, wave: ptsWave, net: ptsNet };

  /* ==================================================================
     Home
     ================================================================== */
  HL.createHome = function (api) {
    var onEnter = api.onEnter || function () { };
    var onJourney = api.onJourney || function () { };

    var root = null, cv = null, ctx = null;
    var parts = [], geo = null, form = 'nebula', n = 0;
    var W = 0, H = 0, cx = 0, cy = 0, RAD = 0;
    var raf = 0, open = false, t0 = 0, last = 0, spin = 0, seen = -1, finished = false;
    var barMs = 2857;
    var autoTimer = 0, tickTimer = 0, AUTO_SEC = 9;
    var slideEls = [], dotEls = [];

    /* ---------------- DOM ---------------- */
    function build() {
      root = document.createElement('div');
      root.id = 'home';
      var total = (HL.allScenes && HL.allScenes().length) || 16;

      var slides = CHAPTERS.map(function (c) {
        return '<div class="hm-slide">' +
          '<div class="hm-srow"><span class="hm-sn">' + c.n + '</span>' +
          '<span class="hm-st">' + c.t + '</span></div>' +
          '<div class="hm-sd">' + c.d + '</div>' +
          '<div class="hm-sbar"><i></i></div>' +
          '</div>';
      }).join('');
      var dots = CHAPTERS.map(function () { return '<b></b>'; }).join('');

      root.innerHTML =
        '<canvas class="hm-sky"></canvas>' +
        '<div class="hm-vig"></div>' +
        '<div class="hm-top">' +
        '<div class="hm-logo">✦</div>' +
        '<div class="hm-brand"><b>人类之光</b><span>HUMAN LIGHT</span></div>' +
        '<div class="hm-tools">' +
        '<div class="hm-meta">' + total + ' 个可交互的三维现场</div>' +
        '<button class="hm-sound" title="开关背景配乐"><i>♫</i><span>钢琴配乐</span></button>' +
        '</div>' +
        '</div>' +
        '<div class="hm-open">' +
        '<div class="hm-open-b">人类之光</div>' +
        '<div class="hm-open-s">一部关于「人类如何读懂世界」的可交互作品</div>' +
        '</div>' +
        '<div class="hm-copy">' +
        '<div class="hm-kicker">四句话，是这部作品的骨架</div>' +
        '<div class="hm-slides">' + slides + '</div>' +
        '<div class="hm-dots">' + dots + '</div>' +
        '</div>' +
        '<div class="hm-outro">' +
        '<h1>从一粒星尘，<br>到一次思考。</h1>' +
        '<div class="hm-btns">' +
        '<button class="hm-enter">进入场景目录 <i>→</i></button>' +
        '<button class="hm-journey"><i>▶</i> 两分钟速览</button>' +
        '</div>' +
        '<div class="hm-auto"><i></i><span></span></div>' +
        '</div>' +
        '<button class="hm-skip">跳过动画</button>' +
        '<div class="hm-foot"><span>罗司徒 · 作品</span><span>离线可用 · 不需要联网</span></div>' +
        '<div class="hm-tip"><i>♫</i>配乐由 Web Audio 现场合成 · F# 小调 · 84 BPM</div>';

      document.getElementById('app').appendChild(root);

      cv = root.querySelector('.hm-sky');
      ctx = cv.getContext('2d');
      slideEls = Array.prototype.slice.call(root.querySelectorAll('.hm-slide'));
      dotEls = Array.prototype.slice.call(root.querySelectorAll('.hm-dots b'));

      root.querySelector('.hm-enter').addEventListener('click', function (e) { e.stopPropagation(); enter(); });
      root.querySelector('.hm-journey').addEventListener('click', function (e) { e.stopPropagation(); journey(); });
      root.querySelector('.hm-skip').addEventListener('click', function (e) { e.stopPropagation(); skip(); });
      root.querySelector('.hm-sound').addEventListener('click', function (e) {
        e.stopPropagation();
        if (!P) return;
        paintSound(P.toggleMute());
      });
      // 终态时点空白处 = 进目录；动画还在跑时不响应，免得误触中断
      root.addEventListener('click', function (e) {
        if (!finished) return;
        if (e.target.closest && e.target.closest('button')) return;
        enter();
      });
      return root;
    }

    function paintSound(m) {
      var b = root && root.querySelector('.hm-sound');
      if (!b) return;
      b.classList.toggle('off', !!m);
      b.querySelector('i').textContent = m ? '♪' : '♫';
      b.querySelector('span').textContent = m ? '配乐已关' : '钢琴配乐';
    }

    /* ---------------- 尺寸与粒子 ---------------- */
    function size() {
      if (!cv || !root) return;
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      W = root.clientWidth || global.innerWidth;
      H = root.clientHeight || global.innerHeight;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.width = W + 'px';
      cv.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (W >= 1000) {
        // 舞台偏右，把左半屏留给文案
        cx = W * 0.735; cy = H * 0.48;
        RAD = Math.min(W * 0.215, H * 0.37);
      } else {
        cx = W * 0.5; cy = H * 0.30;
        RAD = Math.min(W * 0.30, H * 0.19);
      }

      var want = Math.round(Math.min(600, Math.max(240, (W * H) / 2700)));
      if (want !== n) {
        n = want;
        parts = [];
        for (var i = 0; i < n; i++) {
          parts.push({
            x: cx, y: cy, vx: 0, vy: 0,
            rr: 0, ang: 0, ky: 1, rot: 0, fx: 0, fy: 0, om: 0,
            role: 0, r: 1, a: 1, b: Math.random() * 6.28318
          });
        }
      }
    }

    function setForm(name, boom) {
      form = name;
      var g = GEN[name] || GEN.nebula;
      geo = g(n, RAD);
      var pts = geo.pts, L = pts.length;
      for (var i = 0; i < n; i++) {
        var p = parts[i], q = pts[i % L];
        p.rr = q.rr || 0; p.ang = q.ang || 0;
        p.ky = (q.ky != null) ? q.ky : 1;
        p.rot = q.rot || 0;
        p.fx = q.fx || 0; p.fy = q.fy || 0;
        p.om = q.om || 0;
        p.role = q.role; p.r = q.r; p.a = q.a;
        if (boom) {
          var ang = Math.random() * 6.28318;
          var f = 1.1 + Math.random() * 2.2;
          p.vx += Math.cos(ang) * f;
          p.vy += Math.sin(ang) * f;
        }
      }
    }

    /* ---------------- 绘制 ---------------- */
    function drawDeco(now) {
      if (!geo) return;
      var i;

      if (geo.rings) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.lineWidth = 1;
        for (i = 0; i < geo.rings.length; i++) {
          var rg = geo.rings[i];
          ctx.beginPath();
          ctx.ellipse(0, 0, rg[0], rg[1], rg[2], 0, 6.28318);
          ctx.strokeStyle = 'rgba(120, 180, 255,' + rg[3].toFixed(3) + ')';
          ctx.stroke();
        }
        ctx.restore();
      }

      if (geo.core) {
        var gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, RAD * 0.44);
        gr.addColorStop(0, 'rgba(255, 214, 160,' + (0.30 * geo.core).toFixed(3) + ')');
        gr.addColorStop(0.42, 'rgba(255, 190, 130,' + (0.085 * geo.core).toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(255, 190, 130, 0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(cx, cy, RAD * 0.44, 0, 6.28318);
        ctx.fill();
      }

      if (geo.curve) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.beginPath();
        for (i = 0; i < geo.curve.length; i++) {
          var pt = geo.curve[i];
          if (i === 0) ctx.moveTo(pt[0], pt[1]); else ctx.lineTo(pt[0], pt[1]);
        }
        ctx.strokeStyle = 'rgba(127, 240, 207, .62)';
        ctx.lineWidth = 1.4;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-geo.half, geo.base);
        ctx.lineTo(geo.half, geo.base);
        ctx.strokeStyle = 'rgba(120, 180, 255, .22)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = 'rgba(120, 180, 255, .17)';
        for (i = 0; i < geo.bars.length; i++) {
          ctx.beginPath();
          ctx.moveTo(geo.bars[i][0], geo.base);
          ctx.lineTo(geo.bars[i][0], geo.bars[i][1]);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();
      }

      if (geo.links) {
        var i2, li;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.strokeStyle = 'rgba(120, 180, 255, .06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (i2 = 0; i2 < geo.links.length; i2++) {
          li = geo.links[i2];
          var A = parts[li[0]], B = parts[li[1]];
          if (!A || !B) continue;
          ctx.moveTo(A.x - cx, A.y - cy);
          ctx.lineTo(B.x - cx, B.y - cy);
        }
        ctx.stroke();

        // 脉冲沿边跑，网络才"活"
        var pulse = (now * 0.00040) % 1;
        for (i2 = 0; i2 < geo.links.length; i2++) {
          li = geo.links[i2];
          var A2 = parts[li[0]], B2 = parts[li[1]];
          if (!A2 || !B2) continue;
          var t = (pulse + li[2] * 0.13 + li[3] * 0.061) % 1;
          var fade = Math.sin(t * Math.PI);
          if (fade < 0.06) continue;
          ctx.fillStyle = 'rgba(150, 235, 255,' + (fade * 0.8).toFixed(3) + ')';
          ctx.beginPath();
          ctx.arc(A2.x - cx + (B2.x - A2.x) * t, A2.y - cy + (B2.y - A2.y) * t, 1.5, 0, 6.28318);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    function targetOf(p) {
      if (!p.om) return [cx + p.fx, cy + p.fy];
      var a = p.ang + spin * p.om;
      var ex = Math.cos(a) * p.rr, ey = Math.sin(a) * p.rr * p.ky;
      if (p.rot) {
        var c2 = Math.cos(p.rot), s2 = Math.sin(p.rot);
        var nx = ex * c2 - ey * s2;
        ey = ex * s2 + ey * c2;
        ex = nx;
      }
      return [cx + ex, cy + ey];
    }

    function draw(now) {
      if (!open) return;
      raf = requestAnimationFrame(draw);
      // rAF 时间戳偶尔会倒退或跳跃（headless / 后台标签都见过）：
      // 负 dt 会让 damp = 0.82^负 > 1 每帧放大、k 变负变排斥力 —— 指数爆炸。
      // 所以异常值（负数 / NaN / 长挂起）一律当一帧 16.7ms 算。
      var raw = now - last;
      if (!(raw > 0 && raw < 4000)) raw = 16.667;
      var dt = Math.min(64, raw);
      last = now;
      // 半隐式欧拉在长帧（低帧率/掉帧）下也会数值发散 —— 步长封顶 2（≈33ms）
      var hv = Math.min(2.2, dt / 16.667);

      if (!finished) {
        var b = Math.floor((now - t0) / barMs);
        if (b !== seen) beat(b);
      }
      spin += dt * 0.00026;

      ctx.clearRect(0, 0, W, H);
      drawDeco(now);

      var k = 0.085 * hv, damp = Math.pow(0.82, hv);
      for (var i = 0; i < n; i++) {
        var p = parts[i];
        var tg = targetOf(p);
        p.vx += (tg[0] - p.x) * k;
        p.vy += (tg[1] - p.y) * k;
        p.vx *= damp; p.vy *= damp;
        p.x += p.vx * hv; p.y += p.vy * hv;

        var tw = 0.72 + 0.28 * Math.sin(now * 0.0011 + p.b);
        var col = COLORS[p.role] || COLORS[0];
        ctx.fillStyle = col + (p.a * tw).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.28318);
        ctx.fill();
        if (p.r > 1.05) {
          ctx.fillStyle = col + (p.a * tw * 0.1).toFixed(3) + ')';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 3.4, 0, 6.28318);
          ctx.fill();
        }
      }
    }

    /* ---------------- 时间轴（以音乐的 bar 为单位） ---------------- */
    // 0 bar：开场      1–4 bar：四句      5 bar 及之后：结语与出口
    function beat(b) {
      seen = b;
      if (b <= 0) { setForm('nebula', false); setSlide(-1); return; }
      if (b >= 1 && b <= 4) {
        var c = CHAPTERS[b - 1];
        setForm(c.form, true);
        setSlide(b - 1);
        return;
      }
      finish();
    }

    function setSlide(i) {
      for (var j = 0; j < slideEls.length; j++) {
        slideEls[j].classList.toggle('on', j === i);
        if (j < i) slideEls[j].classList.add('up');
      }
      for (var d = 0; d < dotEls.length; d++) {
        dotEls[d].classList.toggle('on', d === i);
        dotEls[d].classList.toggle('done', d < i);
      }
      root.classList.toggle('into', i >= 0);
      if (i >= 0 && slideEls[i]) {
        var bar = slideEls[i].querySelector('.hm-sbar i');
        if (bar) {
          bar.style.transition = 'none';
          bar.style.width = '0%';
          void bar.offsetWidth;          // 强制回流，否则两次赋值会被合并
          bar.style.transition = 'width ' + Math.round(barMs * 0.96) + 'ms linear';
          bar.style.width = '100%';
        }
      }
    }

    function finish() {
      if (finished) return;
      finished = true;
      setForm('nebula', true);
      for (var j = 0; j < slideEls.length; j++) slideEls[j].classList.add('up');
      for (var d = 0; d < dotEls.length; d++) { dotEls[d].classList.remove('on'); dotEls[d].classList.add('done'); }
      root.classList.add('fin', 'into');
      var sk = root.querySelector('.hm-skip');
      if (sk) sk.style.display = 'none';
      startAuto(500);
    }

    /* ---------------- 自动进入 ---------------- */
    function clearAuto() {
      if (autoTimer) { clearTimeout(autoTimer); autoTimer = 0; }
      if (tickTimer) { clearInterval(tickTimer); tickTimer = 0; }
    }

    function startAuto(delay) {
      clearAuto();
      var box = root.querySelector('.hm-auto');
      if (!box) return;
      var txt = box.querySelector('span');
      var left = AUTO_SEC;
      box.classList.remove('go');
      function paint() { txt.textContent = left + ' 秒后自动进入场景目录'; }
      paint();
      autoTimer = setTimeout(function () {
        autoTimer = 0;
        tickTimer = setInterval(function () {
          left--;
          if (left <= 0) { clearAuto(); enter(); return; }
          paint();
        }, 1000);
      }, delay || 0);
    }

    /* ---------------- 进出 ---------------- */
    function reduced() {
      try { return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches; }
      catch (e) { return false; }
    }

    function show(fast) {
      P = HL.Piano || null;
      barMs = ((P && P.barSec ? P.barSec() : 2.857) * 1000) | 0;
      if (!root) build();
      open = true;
      finished = false; seen = -1; spin = 0;
      root.classList.add('show');
      document.getElementById('app').classList.add('home-mode');
      root.classList.remove('fin', 'into', 'out', 'vis');
      var sk0 = root.querySelector('.hm-skip');
      if (sk0) sk0.style.display = '';

      size();
      for (var i = 0; i < n; i++) {
        var p = parts[i];
        p.x = cx + (Math.random() - 0.5) * 10;
        p.y = cy + (Math.random() - 0.5) * 10;
        p.vx = (Math.random() - 0.5) * 3.6;
        p.vy = (Math.random() - 0.5) * 3.6;
      }
      setForm('nebula', false);

      t0 = performance.now(); last = t0;
      if (!raf) raf = requestAnimationFrame(draw);

      // 下一帧再加 .vis：让 display 先落定，transition 才会真的播放
      // （headless / 低端机的首帧 rAF 可能来得晚，晚到也只是"没有淡入"，不会黑屏）
      requestAnimationFrame(function () { if (open) root.classList.add('vis'); });

      if (fast || reduced()) setTimeout(function () { if (open) finish(); }, 80);

      if (P) {
        try { P.start(); } catch (e) { }
        paintSound(P.isMuted());
      }
    }

    function hide(cb, keepMusic) {
      clearAuto();
      if (!root) { if (cb) cb(); return; }
      root.classList.add('out');
      root.classList.remove('vis');
      open = false;
      document.getElementById('app').classList.remove('home-mode');
      // 进速览时音乐要接着走，不在这里掐掉
      if (!keepMusic && P && P.playing) { try { P.stop(1.4); } catch (e) { } }
      setTimeout(function () {
        root.classList.remove('show', 'out');
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        if (cb) cb();
      }, 460);
    }

    function skip() { if (open) { clearAuto(); finish(); } }
    function enter() { hide(function () { onEnter(); }); }
    // 去速览时保留音乐：同一段配乐接着走，就是一条完整的片子
    function journey() { hide(function () { onJourney(); }, true); }

    global.addEventListener('resize', function () {
      if (!open || !root) return;
      size();
      setForm(form, false);
    });

    global.addEventListener('keydown', function (e) {
      if (!open) return;
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === 'Enter') { e.preventDefault(); enter(); }
      else if (e.key && e.key.toLowerCase() === 'j') { e.preventDefault(); journey(); }
      else if (e.key === 'Escape') { e.preventDefault(); skip(); }
    });

    return {
      show: show, hide: hide, enter: enter, journey: journey, skip: skip,
      isOpen: function () { return open; },
      isMounted: function () { return !!root; },
      /** 调试：粒子目标的半径分布与抽样 */
      probe: function () {
        var mn = 1e9, mx = 0, sum = 0, cnt = 0;
        for (var i = 0; i < n; i++) {
          var p = parts[i], t = targetOf(p);
          var d = Math.sqrt((t[0] - cx) * (t[0] - cx) + (t[1] - cy) * (t[1] - cy));
          if (d < mn) mn = d;
          if (d > mx) mx = d;
          sum += d; cnt++;
        }
        var off = 0, spd = 0;
        for (var i2 = 0; i2 < n; i2++) {
          var q = parts[i2];
          if (q.x < -60 || q.x > W + 60 || q.y < -60 || q.y > H + 60) off++;
          spd += Math.abs(q.vx) + Math.abs(q.vy);
        }
        return {
          form: form, n: n, cx: Math.round(cx), cy: Math.round(cy), rad: Math.round(RAD),
          rmin: Math.round(mn), rmax: Math.round(mx), ravg: Math.round(sum / cnt),
          offscreen: off, speed: Math.round(spd / n * 100) / 100,
          spin: +spin.toFixed(3),
          sample: parts.slice(0, 4).map(function (p) {
            var t = targetOf(p);
            return { rr: Math.round(p.rr), ang: +p.ang.toFixed(2), om: +p.om.toFixed(2), ky: p.ky, tx: Math.round(t[0]), ty: Math.round(t[1]), x: Math.round(p.x), y: Math.round(p.y) };
          })
        };
      },
      /** 自动化测试 / 调试：把时间原点拨回第 i 个 bar，让下一帧自然落到目标形态 */
      goto: function (i) {
        if (!open || !root) return;
        clearAuto();
        root.classList.remove('fin', 'into');
        for (var j = 0; j < slideEls.length; j++) slideEls[j].classList.remove('on', 'up');
        for (var d = 0; d < dotEls.length; d++) dotEls[d].classList.remove('on', 'done');
        var sk = root.querySelector('.hm-skip');
        if (sk) sk.style.display = '';
        finished = false;
        seen = -1;
        t0 = performance.now() - i * barMs - 30;
      }
    };
  };

})(window);
