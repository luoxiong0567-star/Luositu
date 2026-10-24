/**
 * HL.Home —— 开篇页（首页）
 *
 * 四句话按章节顺序逐句点亮，讲的是这个项目的骨架：
 *   Ⅰ 宇宙用数学写就 → Ⅱ 物质有自己的语法 → Ⅲ 规律可以被抽象 → Ⅳ 思维本身也能被观察
 * 走完动画后给两个出口：「进入场景目录」与「▶ 五分钟速览」。
 *
 * 何时出现：直接打开（没有 #场景 直达链接）时铺满全屏；?home=0 可跳过；
 * ?journey=1 直接起播。侧栏品牌可随时点回开篇。
 */
(function (global) {
  'use strict';

  var HL = global.HL;
  if (!HL) return;

  var CHAPTERS = [
    {
      n: 'Ⅰ', t: '宇宙用数学写就',
      d: '行星的轨迹可以被写成方程，于是天空第一次变得可预测。'
    },
    {
      n: 'Ⅱ', t: '物质有自己的语法',
      d: '一百一十八种元素排进同一张表，组合出岩石、水与生命。'
    },
    {
      n: 'Ⅲ', t: '规律可以被抽象',
      d: '同一套符号，能描述误差的形状，也能描述几何与信息。'
    },
    {
      n: 'Ⅳ', t: '思维本身也能被观察',
      d: '神经元的放电、权重的连接，思考第一次有了可看的形状。'
    }
  ];

  HL.createHome = function (api) {
    var onEnter = api.onEnter || function () { };
    var onJourney = api.onJourney || function () { };
    var root = null, cv = null, ctx = null, stars = [], raf = 0, running = false, t0 = 0;
    var open = false;
    var autoTimer = 0, tickTimer = 0, AUTO_SEC = 12;

    function build() {
      root = document.createElement('div');
      root.id = 'home';
      var total = (HL.allScenes && HL.allScenes().length) || 16;

      var rows = CHAPTERS.map(function (c, i) {
        return '<div class="hm-row" style="--i:' + i + '">' +
          '<span class="hm-num">' + c.n + '</span>' +
          '<div class="hm-txt"><b>' + c.t + '</b><p>' + c.d + '</p></div>' +
          '</div>';
      }).join('');

      root.innerHTML =
        '<canvas class="hm-sky"></canvas>' +
        '<div class="hm-glow hm-g1"></div><div class="hm-glow hm-g2"></div>' +
        '<div class="hm-grid"></div>' +
        '<div class="hm-top">' +
        '<div class="hm-logo">✦</div>' +
        '<div class="hm-brand"><b>人类之光</b><span>HUMAN LIGHT</span></div>' +
        '<div class="hm-meta">' + total + ' 个可交互的三维现场</div>' +
        '</div>' +
        '<div class="hm-body">' +
        '<div class="hm-kicker">— 一部关于「人类如何读懂世界」的可交互作品 —</div>' +
        '<div class="hm-chain">' + rows + '</div>' +
        '<div class="hm-tail">' +
        '<h1>从一粒星尘，<br>到一次思考。</h1>' +
        '<div class="hm-btns">' +
        '<button class="hm-enter">进入场景目录 <i>→</i></button>' +
        '<button class="hm-journey"><i>▶</i> 五分钟速览</button>' +
        '</div>' +
        '<p class="hm-note">左键平移 · 右键旋转 · 滚轮缩放 · Esc 返回目录</p>' +
        '<div class="hm-auto"><i></i><span>12 秒后自动进入场景目录 · 点按任意处立即进入</span></div>' +
        '</div>' +
        '</div>' +
        '<button class="hm-skip">跳过动画</button>' +
        '<div class="hm-foot"><span>罗司徒 · 作品</span><span>离线可用 · 不需要联网</span></div>';

      document.getElementById('app').appendChild(root);

      cv = root.querySelector('.hm-sky');
      ctx = cv.getContext('2d');
      sizeSky();
      seedStars();

      root.querySelector('.hm-enter').addEventListener('click', function (e) { e.stopPropagation(); enter(); });
      root.querySelector('.hm-journey').addEventListener('click', function (e) { e.stopPropagation(); journey(); });
      root.querySelector('.hm-skip').addEventListener('click', function (e) { e.stopPropagation(); skip(); });
      // 点按空白处 = 直接进入目录
      root.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('button')) return;
        enter();
      });
      return root;
    }

    function sizeSky() {
      if (!cv) return;
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      var w = root.clientWidth || global.innerWidth;
      var h = root.clientHeight || global.innerHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      cv.style.width = w + 'px'; cv.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cv._w = w; cv._h = h;
    }

    function seedStars() {
      stars = [];
      var w = cv._w, h = cv._h;
      var n = Math.round(Math.min(320, (w * h) / 5200));
      for (var i = 0; i < n; i++) {
        stars.push({
          x: Math.random() * w, y: Math.random() * h,
          z: 0.25 + Math.random() * 0.75,
          r: 0.4 + Math.random() * 1.15,
          a: Math.random() * 6.28,
          s: 0.010 + Math.random() * 0.026
        });
      }
    }

    function draw(now) {
      if (!open) return;
      raf = requestAnimationFrame(draw);
      var w = cv._w, h = cv._h;
      ctx.clearRect(0, 0, w, h);

      // 星尘：按 z 分层，越近走得越快（极慢的横向漂移）
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        s.x -= s.s * s.z * 14;
        if (s.x < -4) { s.x = w + 4; s.y = Math.random() * h; }
        var tw = 0.45 + 0.55 * Math.abs(Math.sin(now * 0.0007 + s.a));
        ctx.globalAlpha = tw * (0.35 + s.z * 0.5);
        ctx.fillStyle = s.z > 0.8 ? '#dceaff' : '#9fc0e8';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * s.z, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    /* 动画走完后自动进入目录：留 12 秒给「五分钟速览」，
       点按任意处可以立刻进，计时随时可被点击打断 */
    function clearAuto() {
      if (autoTimer) { clearTimeout(autoTimer); autoTimer = 0; }
      if (tickTimer) { clearInterval(tickTimer); tickTimer = 0; }
    }

    function startAuto(delay) {
      clearAuto();
      var el = root.querySelector('.hm-auto');
      if (!el) return;
      var txt = el.querySelector('span');
      el.classList.remove('go');
      var left = AUTO_SEC;
      function paint() {
        txt.textContent = left + ' 秒后自动进入场景目录 · 点按任意处立即进入';
      }
      paint();
      autoTimer = setTimeout(function () {
        autoTimer = 0;
        el.classList.add('go');
        tickTimer = setInterval(function () {
          left--;
          if (left <= 0) { clearAuto(); enter(); return; }
          paint();
        }, 1000);
      }, delay || 0);
    }

    function show(fast) {
      if (!root) build();
      open = true;
      root.classList.add('show');
      document.getElementById('app').classList.add('home-mode');
      // 每次显示都重播动画（跳过按钮同步复位）
      root.classList.remove('fin', 'skip', 'out');
      if (fast) root.classList.add('skip');
      sizeSky();
      seedStars();
      t0 = performance.now();
      if (!raf) raf = requestAnimationFrame(draw);
      startAuto(fast ? 500 : 6500);
    }

    function hide(cb) {
      clearAuto();
      if (!root) { if (cb) cb(); return; }
      root.classList.add('out');
      open = false;
      document.getElementById('app').classList.remove('home-mode');
      setTimeout(function () {
        root.classList.remove('show', 'out');
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        if (cb) cb();
      }, 460);
    }

    function skip() {
      if (!root) return;
      root.classList.add('skip');
      startAuto(600);
    }

    function enter() {
      hide(function () { onEnter(); });
    }

    function journey() {
      hide(function () { onJourney(); });
    }

    global.addEventListener('resize', function () {
      if (open) { sizeSky(); seedStars(); }
    });

    // 键盘：回车进入，J 速览
    global.addEventListener('keydown', function (e) {
      if (!open) return;
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === 'Enter') { e.preventDefault(); enter(); }
      else if (e.key && e.key.toLowerCase() === 'j') { e.preventDefault(); journey(); }
      else if (e.key === 'Escape') { skip(); }
    });

    return {
      show: show,
      hide: hide,
      enter: enter,
      journey: journey,
      skip: skip,
      isOpen: function () { return open; },
      isMounted: function () { return !!root; }
    };
  };

})(window);
