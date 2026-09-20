/**
 * 场景：时空弯曲（广义相对论可视化）
 *
 * 三个实验：
 *   ① 光线偏折  light    —— 无引力 / 牛顿 / 广义相对论 三条光线对比（爱丁顿 1919）
 *   ② 时间膨胀  clock    —— 两只光钟在不同引力势下计时快慢（GPS 修正）
 *   ③ 引力红移  redshift  —— 光子爬出引力井时波长被拉长（白矮星 / 中子星 / 黑洞）
 *
 * 视觉规范：暗色深空 + 玻璃质感天体 + 霓虹网格 + KaTeX HUD 公式卡（复用 GRAV 素材库）
 *
 * URL 直达：?m=light|clock|redshift&body=neutron&M=12#spacetime
 */
HL.registerScene({
  id: 'spacetime',
  name: '时空弯曲',
  short: '从牛顿走到爱因斯坦',
  icon: '◎',
  fov: 46,
  minDistance: 4,
  maxDistance: 260,
  desc: '广义相对论三实验：光线引力偏折（牛顿 2× vs 相对论 4×）、光钟时间膨胀（GPS 每天修正 38.6 μs）、引力红移（光子爬出引力井波长变长）。质量越大，时空网格的井越深。',

  controls: function () {
    var list = [
      { type: 'button', key: 'tour', label: '📖 讲解模式' },
      {
        type: 'buttons', key: 'm', label: '实验', value: P.m, options: [
          { label: '光线偏折', value: 'light' },
          { label: '时间膨胀', value: 'clock' },
          { label: '引力红移', value: 'redshift' }
        ]
      }
    ];
    if (P.m === 'light') {
      list.push({ type: 'range', key: 'M', label: '天体质量 M', min: 1, max: 40, step: 0.5, value: P.M, unit: ' M☉' });
      list.push({ type: 'range', key: 'b', label: '瞄准距离 b', min: 2, max: 10, step: 0.1, value: P.b, unit: ' R☉' });
      list.push({ type: 'button', key: 'fire', label: '✦ 发射光子' });
      list.push({ type: 'check', key: 'straight', label: '显示无引力直线', value: true });
      list.push({ type: 'check', key: 'newton', label: '显示牛顿预言', value: true });
    } else {
      list.push({
        type: 'buttons', key: 'body', label: '天体', value: P.body, options: [
          { label: '太阳', value: 'sun' },
          { label: '白矮星', value: 'wd' },
          { label: '中子星', value: 'ns' },
          { label: '黑洞', value: 'bh' }
        ]
      });
      if (P.m === 'clock') {
        list.push({ type: 'range', key: 'r1', label: '近钟半径', min: 1.6, max: 8, step: 0.1, value: P.r1, unit: ' R★' });
        list.push({ type: 'range', key: 'r2', label: '远钟半径', min: 8, max: 20, step: 0.5, value: P.r2, unit: ' R★' });
      } else {
        list.push({ type: 'range', key: 'wl0', label: '发射波长 λ₀', min: 380, max: 680, step: 5, value: P.wl0, unit: ' nm' });
        list.push({ type: 'range', key: 'emit', label: '发射速率', min: 0, max: 3, step: 0.1, value: 1.0, unit: '×' });
      }
    }
    list.push({ type: 'check', key: 'grid', label: '时空网格', value: true });
    return list;
  },

  create: function (ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera;
    var G = HL.GRAV;                 // 万有引力模块的公共素材库（后加载，create 时可用）
    var K = G.K, C = G.C;

    scene.add(G.starfield(THREE, 1800, 300));

    var STAR_R = 1.7;                 // 天体可视半径（场景单位）＝ 1 R★
    var stageEl = document.getElementById('stage');

    /* ---------- 天体参数表 ---------- */
    // rs/R★：史瓦西半径与天体半径之比（真实数值）
    var BODIES = {
      sun:  { name: '太阳',   M: 1,   rsR: 4.26e-6, color: 0xffd166, rim: 0xffc36b, Rkm: 696000, Mkm: 2.953 },
      wd:   { name: '白矮星', M: 1.0, rsR: 4.6e-4,  color: 0xdfe8ff, rim: 0xa8c4ff, Rkm: 5850,   Mkm: 2.953 },
      ns:   { name: '中子星', M: 1.4, rsR: 0.344,   color: 0xc9a6ff, rim: 0xb28aff, Rkm: 12,     Mkm: 4.13 },
      bh:   { name: '黑洞',   M: 10,  rsR: 0.85,    color: 0x0a0e18, rim: 0x4de2ff, Rkm: 29.5,   Mkm: 29.53 }
    };

    /* ---------- 中央天体 ---------- */
    var bd = BODIES[P.body] || BODIES.sun;
    var star = G.body(THREE, { r: STAR_R, color: bd.color, rim: bd.rim, halo: true, haloScale: 4.6 });
    scene.add(star);

    /* ---------- 弯曲时空网格（被质量压出凹陷的平面） ---------- */
    var grid = null;
    function dip(r) {
      // 凹陷深度 ∝ 质量压缩参数（视觉夸张，物理上井深应 ∝ 势能）
      var w = P.m === 'light' ? Math.min(1, Math.log10(P.M) / 1.7) : 0.55;
      return 5.2 * w / (1 + Math.pow(r / 7.5, 2));
    }
    function buildGrid() {
      if (grid) { scene.remove(grid); G && HL.disposeObject(grid); }
      var pts = [], i, j;
      for (i = 1; i <= 12; i++) {
        var rr = 2.6 * i;
        var y = -4.6 - dip(rr);
        for (j = 0; j < 72; j++) {
          var a1 = j / 72 * Math.PI * 2, a2 = (j + 1) / 72 * Math.PI * 2;
          pts.push(new THREE.Vector3(Math.cos(a1) * rr, y, Math.sin(a1) * rr));
          pts.push(new THREE.Vector3(Math.cos(a2) * rr, y, Math.sin(a2) * rr));
        }
      }
      for (i = 0; i < 18; i++) {
        var a = i / 18 * Math.PI * 2;
        for (j = 0; j < 40; j++) {
          var r1 = 2.6 + j / 40 * (31.2 - 2.6), r2 = 2.6 + (j + 1) / 40 * (31.2 - 2.6);
          pts.push(new THREE.Vector3(Math.cos(a) * r1, -4.6 - dip(r1), Math.sin(a) * r1));
          pts.push(new THREE.Vector3(Math.cos(a) * r2, -4.6 - dip(r2), Math.sin(a) * r2));
        }
      }
      var geo = new THREE.BufferGeometry().setFromPoints(pts);
      grid = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
        color: 0x2b6f8f, transparent: true, opacity: 0.4
      }));
      scene.add(grid);
    }
    buildGrid();

    /* ================================================================
       实验① 光线偏折
       ================================================================ */
    var lightGroup = new THREE.Group();
    scene.add(lightGroup);
    var rayLines = [];                // {obj, theory}
    var heads = [];                    // 光子头 {spr, path, t}
    var C_LIGHT_VIS = 26;              // 视觉光速（场景单位/秒）

    // 视觉引力参数：让 M=1、b≈4 时弯曲清晰可见；GR = 2 × 牛顿
    function muVis() { return 220 * (P.m === 'light' ? P.M : 10); }

    /** 数值积分一条光线：factor=0 直线 / 1 牛顿 / 2 广义相对论 */
    function traceRay(b, factor) {
      var mu = muVis() * factor;
      var pts = [];
      var x = -30, y = b, vx = C_LIGHT_VIS, vy = 0;
      var dt = 0.028, n = 460;
      for (var i = 0; i < n; i++) {
        pts.push(new THREE.Vector3(x, y, 0));
        var r2 = x * x + y * y, r = Math.sqrt(r2);
        if (r < STAR_R * 0.98) break;                    // 打进天体
        if (mu > 0 && r > 0.01) {
          var a = -mu / r2;
          vx += a * (x / r) * dt;
          vy += a * (y / r) * dt;
        }
        x += vx * dt; y += vy * dt;
        if (x > 34) break;
      }
      pts.push(new THREE.Vector3(x, y, 0));
      // 末段延长，便于看清偏折角
      var len = Math.sqrt(vx * vx + vy * vy) || 1;
      pts.push(new THREE.Vector3(x + vx / len * 14, y + vy / len * 14, 0));
      return { pts: pts, ang: Math.atan2(vy, vx) };
    }

    function clearLight() {
      while (lightGroup.children.length) {
        var ch = lightGroup.children.pop();
        HL.disposeObject(ch);
        lightGroup.remove(ch);
      }
      rayLines = [];
      heads = [];
    }

    var defl = { newton: 0, gr: 0 };

    function fireRays() {
      clearLight();
      var b0 = P.b * STAR_R / 1.0;          // 瞄准距离（场景单位）
      var theories = [
        { key: 'straight', color: 0x5b6b80, factor: 0, on: P.straight },
        { key: 'newton', color: 0x4d9bff, factor: 1, on: P.newton },
        { key: 'gr', color: 0xffd166, factor: 2, on: true }
      ];
      var results = {};
      theories.forEach(function (th) {
        if (!th.on) return;
        // 三条不同 b 的光线束，主光线 b0 高亮、伴线暗一些
        [[b0, 0.85], [b0 + 2.6, 0.32], [b0 + 5.2, 0.22]].forEach(function (cfg) {
          var res = traceRay(cfg[0], th.factor);
          results[th.key] = res;
          var line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(res.pts),
            new THREE.LineBasicMaterial({
              color: th.color, transparent: true, opacity: cfg[1]
            })
          );
          lightGroup.add(line);
          rayLines.push({ obj: line, theory: th.key });
        });
      });
      // 光子头（沿主光线运动）
      theories.forEach(function (th) {
        if (!th.on || !results[th.key]) return;
        var spr = new THREE.Sprite(new THREE.SpriteMaterial({
          map: G.glowTexture(THREE, G.rgba(th.color, 0.9)),
          transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
        }));
        spr.scale.setScalar(th.key === 'gr' ? 1.5 : 1.1);
        lightGroup.add(spr);
        heads.push({ spr: spr, path: results[th.key].pts, u: 0, speed: 0.16 + (th.key === 'gr' ? 0.03 : 0) });
      });
      // 数值偏折角（视觉弧度，按主光线）
      if (results.newton) defl.newton = results.newton.ang;
      if (results.gr) defl.gr = results.gr.ang;
      updateLightHud();
    }

    /* ================================================================
       实验② 时间膨胀（光钟）
       ================================================================ */
    var clockGroup = new THREE.Group();
    scene.add(clockGroup);
    var clocks = [];                   // {grp, photon, y, dir, r, phase}

    function makeLightClock(r, accent) {
      var grp = new THREE.Group();
      // 平台
      var plat = G.ring(THREE, 0.9, accent, 0.05, 0.5);
      grp.add(plat);
      // 两面"镜子"
      var mg = new THREE.BoxGeometry(1.4, 0.09, 0.09);
      var mm = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.9 });
      var m1 = new THREE.Mesh(mg, mm); m1.position.set(0, 1.15, 0);
      var m2 = new THREE.Mesh(mg, mm); m2.position.set(0, -1.15, 0);
      grp.add(m1, m2);
      // 光子
      var ph = new THREE.Sprite(new THREE.SpriteMaterial({
        map: G.glowTexture(THREE, G.rgba(0xffffff, 0.95)),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      ph.scale.setScalar(0.55);
      grp.add(ph);
      // 轨道环
      var orb = G.ring(THREE, r, accent, 0.02, 0.3);
      clockGroup.add(orb);
      grp.position.set(r, 0, 0);
      clockGroup.add(grp);
      return { grp: grp, photon: ph, orb: orb, y: 1.1, dir: -1, r: r, phase: 0, ticks: 0 };
    }

    function rebuildClocks() {
      while (clockGroup.children.length) {
        var ch = clockGroup.children.pop();
        HL.disposeObject(ch);
        clockGroup.remove(ch);
      }
      clocks = [
        makeLightClock(P.r1 * STAR_R, 0xffd166),
        makeLightClock(P.r2 * STAR_R, 0x6ef7c8)
      ];
    }

    /* ================================================================
       实验③ 引力红移
       ================================================================ */
    var rsGroup = new THREE.Group();
    scene.add(rsGroup);
    var photons = [];                  // {spr, x, z, ux, uz, dist}

    function spawnPhoton() {
      var th = (Math.random() - 0.5) * 1.1;
      var spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: G.glowTexture(THREE, G.rgba(0xffffff, 0.95)),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      spr.scale.setScalar(0.8);
      rsGroup.add(spr);
      photons.push({
        spr: spr,
        x: Math.cos(th) * STAR_R, z: Math.sin(th) * STAR_R,
        ux: Math.cos(th), uz: Math.sin(th),
        dist: STAR_R
      });
    }

    /** 波长 → 近似 RGB（380–700nm 区段） */
    function wl2rgb(nm) {
      var r = 0, g = 0, b = 0;
      if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
      else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
      else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
      else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
      else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
      else { r = 1; }
      var f = nm > 700 ? 0.3 + 0.7 * (750 - nm) / 50 : (nm < 420 ? 0.3 + 0.7 * (nm - 380) / 40 : 1);
      return [Math.max(0, r * f), Math.max(0, g * f), Math.max(0, b * f)];
    }

    /* ================================================================
       HUD（KaTeX 公式卡，复用 GRAV.Hud → 同时接入 safeArea 安全区）
       ================================================================ */
    var hud = new G.Hud(stageEl);

    var RS_KM_PER_MSUN = 2.953;       // 1 M☉ 的史瓦西半径（km）
    var R_SUN_KM = 696000;

    function fmt(x, d) { return x.toFixed(d === undefined ? 3 : d); }

    function updateLightHud() {
      if (P.m !== 'light') return;
      hud.clear();
      var M = P.M, bRsun = P.b;                       // b 直接以 R☉ 计
      var aN = 1.7511 * M / bRsun;                    // 牛顿 2GM/(c²b)，角秒
      var aGR = 2 * aN;
      hud.card({
        title: '光线引力偏折', badge: '1919 爱丁顿',
        accent: C.gold,
        tex: '\\alpha_{\\mathrm{GR}} = \\dfrac{4GM}{c^{2}b} = 2\\,\\alpha_{\\mathrm{N}}',
        note: '广义相对论的偏折是牛顿预言的两倍 —— 1919 年日全食观测证实',
        rows: [
          ['天体质量 M', fmt(M, 1) + ' M☉'],
          ['瞄准距离 b', fmt(bRsun, 1) + ' R☉'],
          ['牛顿预言 α_N', fmt(aN, 2) + ' ″'],
          ['相对论 α_GR', fmt(aGR, 2) + ' ″（2×）']
        ]
      });
      hud.card({
        title: '史瓦西半径', accent: C.cyan,
        tex: 'r_s = \\dfrac{2GM}{c^{2}}',
        note: '逃逸速度达到光速的临界半径',
        rows: [
          ['r_s', fmt(RS_KM_PER_MSUN * M, 1) + ' km'],
          ['与太阳半径之比', fmt(RS_KM_PER_MSUN * M / R_SUN_KM * 100, 4) + ' %']
        ]
      });
    }

    function updateClockHud() {
      if (P.m !== 'clock') return;
      hud.clear();
      var b = BODIES[P.body];
      var rsR = b.rsR;
      var f1 = Math.sqrt(Math.max(0, 1 - rsR / P.r1));
      var f2 = Math.sqrt(Math.max(0, 1 - rsR / P.r2));
      var diffDay = (1 - f1 / f2) * 86400;
      hud.card({
        title: '引力时间膨胀', badge: 'GPS 每天修正 38.6 μs',
        accent: C.gold,
        tex: '\\dfrac{d\\tau}{dt} = \\sqrt{1-\\dfrac{r_s}{r}}',
        note: '越靠近引力源，钟走得越慢 —— 引力势越深，固有时越慢',
        rows: [
          ['天体', b.name],
          ['近钟 r₁ = ' + fmt(P.r1, 1) + ' R★', '速率 ' + fmt(f1, 5)],
          ['远钟 r₂ = ' + fmt(P.r2, 1) + ' R★', '速率 ' + fmt(f2, 5)],
          ['近钟每天慢', diffDay >= 1 ? fmt(diffDay, 1) + ' 秒' : fmt(diffDay * 1e6, 1) + ' 微秒']
        ]
      });
      hud.card({
        title: 'GPS 与相对论', accent: C.rose,
        tex: '\\Delta t = 38.6\\ \\mu s / \\mathrm{day}',
        note: '狭义相对论（速度）使卫星钟每天慢 7.2 μs，广义相对论（引力更弱）使它每天快 45.9 μs',
        rows: [
          ['若不修正', '每天累计 38.6 μs'],
          ['定位漂移', '约 10 km / 天'],
          ['相对论', '不是哲学，是工程']
        ]
      });
    }

    function updateRsHud() {
      if (P.m !== 'redshift') return;
      hud.clear();
      var b = BODIES[P.body];
      var f0 = Math.sqrt(Math.max(0.02, 1 - b.rsR));
      var z = 1 / f0 - 1;
      var wlInf = P.wl0 / f0;
      hud.card({
        title: '引力红移', badge: '天狼星 B：z ≈ 2.6×10⁻⁴',
        accent: C.violet,
        tex: '1+z = \\left(1-\\dfrac{r_s}{r_0}\\right)^{-1/2}',
        note: '光子爬出引力井要「付出」能量 —— 波长被拉长、颜色变红',
        rows: [
          ['天体', b.name],
          ['r_s / R★', b.rsR >= 1e-3 ? fmt(b.rsR, 3) : b.rsR.toExponential(1)],
          ['红移量 z', z >= 1e-3 ? fmt(z, 4) : z.toExponential(2)],
          ['发射 ' + P.wl0 + ' nm', '∞ 处观测 ' + fmt(wlInf, 0) + ' nm']
        ]
      });
      hud.card({
        title: '光谱线的移动', accent: C.cyan,
        tex: '\\dfrac{\\lambda_{\\infty}}{\\lambda_0} = \\dfrac{1}{\\sqrt{1-r_s/r_0}}',
        note: '天文学家正是靠测量谱线红移，称出了白矮星与中子星的质量',
        rows: [
          ['白矮星', 'z ≈ 10⁻⁴ 量级'],
          ['中子星', 'z ≈ 0.2 – 0.35'],
          ['黑洞视界', 'z → ∞（光被无限拉长）']
        ]
      });
    }

    /* ---------- 模式切换 ---------- */
    var clockAcc = 0, rsAcc = 0;

    function setMode(m, rebuild) {
      P.m = m;
      lightGroup.visible = (m === 'light');
      clockGroup.visible = (m === 'clock');
      rsGroup.visible = (m === 'redshift');
      if (m === 'light' && (rebuild || !rayLines.length)) fireRays();
      if (m === 'clock') { rebuildClocks(); updateClockHud(); }
      if (m === 'redshift') { photons = []; updateRsHud(); }
      if (rebuild && HL.rebuildPanel) { try { HL.rebuildPanel(); } catch (e) { /* 忽略 */ } }
    }

    /* ---------- 讲解模式（HL.Tour 框架引擎） ---------- */
    var tour = HL.Tour(ctx);
    tour.load([
      {
        t: '一、从牛顿到爱因斯坦',
        d: '牛顿说引力是两个质量之间的「拉力」；爱因斯坦 1915 年说：不，根本没有什么拉力——质量告诉时空怎样弯曲，弯曲的时空告诉光和物质怎样运动。脚下这张发光的网格就是「时空」本身：中央天体把它压出一口井，井越深，引力越强。拖动质量滑杆，看井变深。',
        exp: '右键拖动旋转视角，从侧面看这口「井」的形状。',
        cam: [[0, 9, 34], [0, 1, 0]],
        pulse: null,
        apply: function () { setMode('light', true); }
      },
      {
        t: '二、光线偏折：一场赌上荣誉的观测',
        d: '一束光经过大质量天体旁边时会被掰弯。牛顿力学用「光子受引力」算出的偏折是 α_N = 2GM/(c²b)；广义相对论算出的却是它的整整两倍：α_GR = 4GM/(c²b)——因为弯曲的不只是轨迹，还有空间本身。1919 年爱丁顿远征普林西比岛，在日全食的黑暗里拍下移位的恒星，报纸头条宣告「牛顿让位于爱因斯坦」。',
        exp: '金色是相对论轨迹、蓝色是牛顿预言、灰色是无引力直线——已为你发射光子。',
        cam: [[-4, 7, 26], [0, 4, 0]],
        pulse: [0, P.b * STAR_R, 0], r: 2.4,
        apply: function () { setMode('light', true); }
      },
      {
        t: '三、瞄准距离 b：越近弯得越狠',
        d: '拖动「瞄准距离 b」：光线贴得越近，偏折越大——这正是「引力透镜」的原理。远方星系的光经过前景星系时被弯成弧、甚至完整的环（爱因斯坦环）；哈勃深空里那些诡异的弧形，全是一块块巨大的天然透镜。',
        exp: '把 b 从 10 拖到 2，看金色轨迹怎样从轻微倾斜变成明显拐弯。',
        cam: [[0, 12, 30], [0, 3, 0]],
        pulse: null,
        apply: function () { setMode('light', true); }
      },
      {
        t: '四、时间膨胀：楼下的钟更慢',
        d: '换到时间实验：两只一模一样的光钟（光子在两镜面间往返，一次往返=一秒）。金色的近钟处在更深的引力势里，光钟走得明显更慢——不是钟坏了，是那里的时间本身更慢。GPS 卫星上的原子钟因此每天比地面快 38.6 微秒，不修正的话定位每天漂移 10 公里——相对论是导航系统的日常工程。',
        exp: '已为你切到时间膨胀实验。拖「近钟半径」到 1.6 R★ 贴近天体，对比两只钟。',
        cam: [[0, 6, 24], [4, 0, 0]],
        pulse: null,
        apply: function () { setMode('clock', true); }
      },
      {
        t: '五、引力红移：光子爬山会累',
        d: '光子爬出引力井要付出能量——不是变慢（光速不变），而是频率降低、波长拉长：颜色变红。太阳表面发出 500 nm 的绿光，到你眼中已是 500.001 nm。天文学家靠测量白矮星光谱的红移称出它们的质量——引力红移是把「相对论」变成「测量工具」的第一个实验（庞德-雷布卡 1959 在 22.6 米高的塔上验证）。',
        exp: '已为你切到红移实验。切到「中子星」，看发出的蓝光爬出来时红成什么颜色。',
        cam: [[0, 5, 24], [0, 2, 0]],
        pulse: null,
        apply: function () { setMode('redshift', true); }
      },
      {
        t: '六、时空的极限',
        d: '把天体切到「黑洞」：rs/R★ = 0.85，井深到光都爬不出来——视界之内，时间与空间互换角色。2015 年 LIGO 听到 13 亿年前两个黑洞并合的时空涟漪；2019 年事件视界望远镜拍下 M87* 的剪影。从 1915 年一支笔写下的方程，到引力波与黑洞照片，只隔了一百年。',
        exp: '退出讲解后切「黑洞」天体，右键旋转到井的边缘看看。',
        cam: [[0, 14, 36], [0, 0, 0]],
        pulse: null,
        apply: function () { setMode('redshift', true); P.body = 'bh'; setBody('bh'); }
      }
    ]);

    function setBody(id) {
      P.body = id;
      bd = BODIES[id] || BODIES.sun;
      // 换天体外观：重设材质颜色
      star.traverse(function (o) {
        if (o.material && o.material.uniforms) {
          if (o.material.uniforms.uCore) o.material.uniforms.uCore.value = new THREE.Color(bd.color);
          if (o.material.uniforms.uRim) o.material.uniforms.uRim.value = new THREE.Color(bd.rim);
        } else if (o.material && o.material.color && o.isMesh) {
          o.material.color.setHex(bd.rim);
        } else if (o.material && o.material.color && o.isSprite) {
          o.material.color.setHex(bd.rim);
        }
      });
      if (P.m === 'clock') { rebuildClocks(); updateClockHud(); }
      if (P.m === 'redshift') { photons = []; updateRsHud(); }
      buildGrid();
    }

    /* ---------- 相机 ---------- */
    camera.position.set(0, 9, 34);
    camera.lookAt(0, 1, 0);
    ctx.controls.target.set(0, 1, 0);

    // 初始实验：URL ?m=xxx 优先
    var wantM = 'light';
    if (typeof URLSearchParams !== 'undefined' && location.search.length > 1) {
      var q = new URLSearchParams(location.search).get('m');
      if (q === 'clock' || q === 'redshift' || q === 'light') wantM = q;
    }
    setMode(wantM, true);

    /* ---------- 调试口 ---------- */
    if (location.search.indexOf('debug=1') >= 0) {
      window.__ST = {
        P: P, defl: defl, BODIES: BODIES,
        rate1: function () {
          var rsR = BODIES[P.body].rsR;
          return Math.sqrt(Math.max(0, 1 - rsR / P.r1));
        },
        alphaArcsec: function () { return 1.7511 * P.M / P.b; }
      };
    }

    /* ---------- 主循环 ---------- */
    return {
      update: function (dt, t) {
        tour.update(dt, t || 0, function (ddt, tt) {
          star.rotation.y += ddt * 0.05;

          if (P.m === 'light') {
            // 光子头沿路径推进 + 环绕微转
            lightGroup.rotation.y = 0;
            heads.forEach(function (h) {
              h.u += ddt * h.speed;
              if (h.u > 1) h.u -= 1;
              var n = Math.max(1, Math.floor(h.path.length * Math.min(1, h.u)) );
              var p = h.path[Math.min(h.path.length - 1, n)];
              h.spr.position.copy(p);
            });
          } else if (P.m === 'clock') {
            var rsR = BODIES[P.body].rsR;
            clocks.forEach(function (ck, i) {
              var rStar = (i === 0 ? P.r1 : P.r2);
              var f = Math.sqrt(Math.max(0.05, 1 - rsR / rStar));
              var v = 4.2 * f;                      // 光钟速率（视觉）
              ck.y += ck.dir * v * ddt;
              if (ck.y > 1.08) { ck.y = 1.08; ck.dir = -1; ck.ticks++; }
              if (ck.y < -1.08) { ck.y = -1.08; ck.dir = 1; ck.ticks++; }
              ck.photon.position.set(0, ck.y, 0);
              // 半径联动（滑杆）
              var rr = rStar * STAR_R;
              ck.grp.position.set(Math.cos(tt * 0.1 + i * Math.PI) * rr, 0, Math.sin(tt * 0.1 + i * Math.PI) * rr);
            });
            clockAcc += ddt;
            if (clockAcc > 0.4) { clockAcc = 0; updateClockHud(); }
          } else {
            // 引力红移：发射 + 爬坡变色
            rsAcc += ddt * P.emit;
            while (rsAcc > 0.28) { rsAcc -= 0.28; spawnPhoton(); }
            var b = BODIES[P.body];
            var rs0 = b.rsR;
            for (var i = photons.length - 1; i >= 0; i--) {
              var ph = photons[i];
              ph.dist += 8.5 * ddt;
              if (ph.dist > 34) {
                HL.disposeObject(ph.spr);
                rsGroup.remove(ph.spr);
                photons.splice(i, 1);
                continue;
              }
              ph.spr.position.set(ph.ux * ph.dist, Math.sin(ph.dist * 0.6) * 0.4 + ph.uz * 0.5, ph.uz * ph.dist);
              // 波长随"高度"拉伸：λ(r) = λ0 · √(1-rs/r) / √(1-rs/r0)，越远越红
              var fr = Math.sqrt(Math.max(0.01, 1 - rs0 / (ph.dist / STAR_R)));
              var f0 = Math.sqrt(Math.max(0.01, 1 - rs0));
              var wl = P.wl0 * fr / Math.max(0.05, f0);
              ph.spr.material.color.setRGB.apply(ph.spr.material.color, wl2rgb(Math.min(760, wl)));
            }
          }

          if (grid) grid.visible = P.grid;
        });
      },

      setParam: function (key, v) {
        if (key === 'tour') { tour.toggle(); return; }
        P[key] = v;
        if (key === 'm') { setMode(v, true); return; }
        if (key === 'body') { setBody(v); return; }
        if (key === 'M') { buildGrid(); if (P.m === 'light') fireRays(); return; }
        if (key === 'b' || key === 'fire') { if (P.m === 'light') fireRays(); return; }
        if (key === 'straight' || key === 'newton') { if (P.m === 'light') fireRays(); return; }
        if (key === 'r1' || key === 'r2') { if (P.m === 'clock') { rebuildClocks(); updateClockHud(); } return; }
        if (key === 'wl0') { updateRsHud(); return; }
      },

      onClick: function () {
        if (P.m === 'light') fireRays();
      },

      dispose: function () {
        tour.dispose();
        if (hud && hud.root && hud.root.parentNode) hud.root.parentNode.removeChild(hud.root);
      }
    };
  }
});

/* 场景参数（模块级，供 controls 函数读取） */
var P = {
  m: 'light', M: 1, b: 4.5, straight: true, newton: true,
  body: 'sun', r1: 2.0, r2: 12, wl0: 440, emit: 1.0, grid: true
};
