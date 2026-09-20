/**
 * ① 引力井：质量把时空压出凹陷，小球沿测地线螺旋坠入
 *
 * 网格曲面高度取软化后的牛顿势   z(r) = − A·M / (r + b)   （远场 ∝ −1/r，与严格
 * Flamm 嵌入面 z = 2√(r_s(r−r_s)) 同构；b 为软化半径，避免中心奇点）。
 * 读数全部用真实 SI：1 场景单位 = 5×10⁸ m。
 */
(function (global) {
  'use strict';

  var GRAV = global.HL.GRAV;
  var K = GRAV.K;
  var PFX = 'well_';
  function C(o) { o.key = PFX + o.key; return o; }

  var U = 5e8;              // 1 场景单位 = 5×10⁸ m
  var RG = 18;              // 网格半径（场景单位）
  var C_LIGHT = 2.99792458e8;
  var MU0 = 1600;           // 场景引力参数 μ = MU0·M（单位³/s²）

  // 由 μ 反推时间尺度：1 场景秒 = S 真实秒，1 场景单位/s = VF m/s
  var SCENE_T = Math.sqrt(MU0 * U * U * U / (K.G * K.MSUN));
  var VF = U / SCENE_T;

  GRAV.registerSub({
    id: 'well',
    name: '引力井',
    tab: '① 引力井',
    desc: '质量压弯时空，滚动的小球就是「测地线」',
    view: [[0, 19, 33], [0, -3.2, 0]],
    defaults: {
      M: 1.0, v: 0.85, rad: 0.15, damp: 0.12,
      speed: 1.0, grid: true, trail: true
    },
    controls: [
      C({ type: 'range', key: 'M', label: '恒星质量 M', min: 0.2, max: 8, step: 0.1, value: 1, unit: ' M☉' }),
      C({ type: 'range', key: 'v', label: '初速度 / 圆轨道速度', min: 0.30, max: 1.50, step: 0.05, value: 0.85, unit: '×' }),
      C({ type: 'range', key: 'rad', label: '径向抛射（向内）', min: 0, max: 0.60, step: 0.05, value: 0.15, unit: ' v_c' }),
      C({ type: 'range', key: 'damp', label: '耗散 → 螺旋坠入', min: 0, max: 0.60, step: 0.02, value: 0.12 }),
      C({ type: 'range', key: 'speed', label: '时间流速', min: 0, max: 2.5, step: 0.05, value: 1, unit: '×' }),
      C({ type: 'button', key: 'launch', label: '⟳ 重新发射小球' }),
      C({ type: 'check', key: 'grid', label: '半透明网格曲面', value: true }),
      C({ type: 'check', key: 'trail', label: '粒子拖尾', value: true }),
      {
        type: 'legend', items: [
          ['时空网格（越深越紫）', '#b98cff'],
          ['恒星', '#ffa64d'],
          ['测地线小球', '#4de2ff'],
          ['粒子拖尾', '#7cf0d0']
        ]
      }
    ],

    init: function (api) {
      var THREE = api.THREE, G = api.group, P = api.P, hud = api.hud;

      /* ---------- 星空 ---------- */
      G.add(api.stars(1600, 900, 1.6));

      /* ---------- 曲面参数 ---------- */
      var Rs = 1.5, B = 2.5, A = 6.5;
      function refreshShape() {
        Rs = 1.5 * Math.pow(P.M, 1 / 3);
        B = 1.0 + Rs;
        A = 6.5 * P.M;
      }
      function sheetY(r) { return -A / (r + B); }
      refreshShape();

      /* ---------- 半透明曲面 ---------- */
      var SEG = 72;
      var planeGeo = new THREE.PlaneGeometry(RG * 2, RG * 2, SEG, SEG);
      var sheet = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({
        color: 0x1b3f66, transparent: true, opacity: 0.34, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending
      }));
      sheet.rotation.x = -Math.PI / 2;
      G.add(sheet);

      /* ---------- 网格线（按深度着色） ---------- */
      var RN = 26, RS_SEG = 120, SPOKES = 48;
      var lineCount = RN * RS_SEG * 2 + SPOKES * 2;
      var lp = new Float32Array(lineCount * 3);
      var lc = new Float32Array(lineCount * 3);
      var lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
      lineGeo.setAttribute('color', new THREE.BufferAttribute(lc, 3));
      var gridLines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.72,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      G.add(gridLines);

      var cShallow = new THREE.Color(0x4de2ff);
      var cDeep = new THREE.Color(0xb98cff);
      var tmpC = new THREE.Color();

      function colorAt(y, depth, out) {
        var f = Math.min(1, Math.max(0, Math.abs(y) / Math.max(depth, 0.001)));
        out.copy(cShallow).lerp(cDeep, Math.pow(f, 0.75));
      }

      function rebuild() {
        refreshShape();
        // 曲面
        var pos = planeGeo.attributes.position.array;
        for (var i = 0; i < pos.length; i += 3) {
          var x = pos[i], y = pos[i + 1];
          pos[i + 2] = sheetY(Math.sqrt(x * x + y * y));
        }
        planeGeo.attributes.position.needsUpdate = true;
        planeGeo.computeBoundingSphere();

        // 网格
        var depth = Math.abs(sheetY(0));
        var k = 0;
        function put(x, y, z) {
          lp[k * 3] = x; lp[k * 3 + 1] = y; lp[k * 3 + 2] = z;
          colorAt(y, depth, tmpC);
          lc[k * 3] = tmpC.r; lc[k * 3 + 1] = tmpC.g; lc[k * 3 + 2] = tmpC.b;
          k++;
        }
        var i2, j2;
        for (i2 = 1; i2 <= RN; i2++) {
          var rr = RG * i2 / RN;
          for (j2 = 0; j2 < RS_SEG; j2++) {
            var a1 = j2 / RS_SEG * Math.PI * 2, a2 = (j2 + 1) / RS_SEG * Math.PI * 2;
            var yy = sheetY(rr);
            put(Math.cos(a1) * rr, yy, Math.sin(a1) * rr);
            put(Math.cos(a2) * rr, yy, Math.sin(a2) * rr);
          }
        }
        for (i2 = 0; i2 < SPOKES; i2++) {
          var a = i2 / SPOKES * Math.PI * 2;
          var ca = Math.cos(a), sa = Math.sin(a);
          for (j2 = 0; j2 < 40; j2++) {
            var r1 = RG * j2 / 40, r2 = RG * (j2 + 1) / 40;
            put(ca * r1, sheetY(r1), sa * r1);
            put(ca * r2, sheetY(r2), sa * r2);
          }
        }
        lineGeo.attributes.position.needsUpdate = true;
        lineGeo.attributes.color.needsUpdate = true;
        lineGeo.computeBoundingSphere();

        star.scale.setScalar(Rs);   // 光晕是子物体，随 group 一起缩放
      }

      /* ---------- 恒星 ---------- */
      var star = GRAV.body(THREE, { r: 1, color: 0xff7a2f, rim: 0xffcf6b, opacity: 0.95, haloScale: 6.2 });
      G.add(star);
      var starCore = GRAV.orb(THREE, 0.52, 0xfff0c0, 4.2);
      star.add(starCore);

      // 地平圈
      G.add(GRAV.ring(THREE, RG, 0x4de2ff, 0.045, 0.35));

      /* ---------- 小球 + 拖尾 ---------- */
      var ball = GRAV.orb(THREE, 0.36, 0x8ff5ff, 5.0);
      G.add(ball);
      var tr = GRAV.trail(THREE, 260, 0x4de2ff, 0.20);
      G.add(tr.obj);

      var bx = 15, bz = 0, bvx = 0, bvz = 0, hitT = 0;

      function launch() {
        var mu = MU0 * P.M;
        var r0 = 14 + Math.random() * 3;
        var th = Math.random() * Math.PI * 2;
        bx = Math.cos(th) * r0; bz = Math.sin(th) * r0;
        var vc = Math.sqrt(mu / (r0 + B));
        var vt = P.v * vc;
        var vr = -P.rad * vc;
        bvx = -Math.sin(th) * vt + Math.cos(th) * vr;
        bvz = Math.cos(th) * vt + Math.sin(th) * vr;
        tr.reset(bx, sheetY(r0) + 0.4, bz);
        hitT = 0;
      }
      launch();

      /* ---------- HUD ---------- */
      var c1 = hud.card({
        title: '牛顿万有引力', accent: GRAV.CSS.cyan,
        tex: 'F = G\\,\\frac{m_1 m_2}{r^{2}},\\qquad \\vec g(r)=-\\frac{GM}{r^{2}}\\hat r',
        note: '平方反比：距离翻倍，引力只剩四分之一。网格凹陷画的是势阱 Φ = −GM/r。',
        rows: [['恒星质量 M', '—'], ['当前距离 r', '—'], ['引力加速度 g', '—'], ['势能 Φ', '—']]
      });
      var c2 = hud.card({
        title: '时空嵌入图', accent: GRAV.CSS.violet,
        tex: 'z(r)=-\\frac{A\\,M}{r+b}\\;\\propto\\;-\\frac{1}{r},\\qquad r_s=\\frac{2GM}{c^{2}}',
        note: '严格解是 Flamm 抛物面 z = 2√(r_s(r−r_s))；这里用软化牛顿势，远场形状一致。',
        rows: [['史瓦西半径 r_s', '—'], ['井深（示意）', '—'], ['小球比能 ε', '—']]
      });
      var c3 = hud.card({
        title: '圆轨道与逃逸', accent: GRAV.CSS.gold,
        tex: 'v_c=\\sqrt{\\frac{GM}{r}},\\qquad v_{\\rm esc}=\\sqrt{\\frac{2GM}{r}}=\\sqrt2\\,v_c',
        note: '耗散让 ε 变负得更深，轨道一圈圈缩小 —— 这就是吸积盘的雏形。',
        rows: [['环绕速度 v_c', '—'], ['逃逸速度 v_esc', '—'], ['小球速度 v', '—']]
      });

      /* ---------- 循环 ---------- */
      var acc = 0, tick = 0;

      return {
        update: function (dt, t) {
          var sp = P.speed;
          var total = Math.min(dt, 0.05) * sp;
          var mu = MU0 * P.M;

          if (total > 0) {
            var n = Math.max(1, Math.min(8, Math.ceil(total / 0.008)));
            var h = total / n;
            for (var s = 0; s < n; s++) {
              var r = Math.max(0.15, Math.sqrt(bx * bx + bz * bz));
              var a = -mu / ((r + B) * (r + B));
              var ux = bx / r, uz = bz / r;
              bvx += a * ux * h; bvz += a * uz * h;
              if (P.damp > 0) {
                var f = Math.max(0, 1 - P.damp * h);
                bvx *= f; bvz *= f;
              }
              bx += bvx * h; bz += bvz * h;

              if (r < Rs * 1.06) { hitT = 0.9; launch(); break; }
              if (r > RG * 1.35) { launch(); break; }
            }
          }

          var rr = Math.max(0.15, Math.sqrt(bx * bx + bz * bz));
          var y = sheetY(rr) + 0.42;
          ball.position.set(bx, y, bz);
          if (hitT > 0) hitT -= dt;
          ball.userData.halo.material.opacity = hitT > 0 ? 1 : 0.75;
          tr.push(bx, y, bz);

          tr.obj.visible = !!P.trail;
          sheet.visible = !!P.grid;
          gridLines.visible = !!P.grid;
          star.userData.wire.rotation.y += dt * 0.12;
          star.userData.wire.rotation.x += dt * 0.05;

          // 读数：10 Hz
          acc += dt; tick++;
          if (acc >= 0.1) {
            acc = 0;
            var Mreal = P.M * K.MSUN;
            var rreal = rr * U;
            var g = K.G * Mreal / (rreal * rreal);
            var phi = -K.G * Mreal / rreal;
            var rs = 2 * K.G * Mreal / (C_LIGHT * C_LIGHT);
            var vc = Math.sqrt(K.G * Mreal / rreal);
            var vesc = Math.SQRT2 * vc;
            var v2 = bvx * bvx + bvz * bvz;
            var vreal = Math.sqrt(v2) * VF;                // 场景单位/s → m/s
            var eps = vreal * vreal / 2 - K.G * Mreal / rreal;

            c1.setRows([
              ['恒星质量 M', GRAV.fix(P.M, 2) + ' M☉'],
              ['当前距离 r', GRAV.sci(rreal, 2) + ' m'],
              ['引力加速度 g', GRAV.sci(g, 2) + ' m/s²'],
              ['势能 Φ', GRAV.sci(phi, 2) + ' J/kg']
            ]);
            c2.setRows([
              ['史瓦西半径 r_s', GRAV.fix(rs / 1000, 2) + ' km'],
              ['井深（示意）', GRAV.fix(Math.abs(sheetY(0)), 2) + ' 单位'],
              ['小球比能 ε', GRAV.sci(eps, 2) + ' J/kg', eps < 0 ? GRAV.CSS.cyan : GRAV.CSS.rose]
            ]);
            c3.setRows([
              ['环绕速度 v_c', GRAV.fix(vc / 1000, 1) + ' km/s'],
              ['逃逸速度 v_esc', GRAV.fix(vesc / 1000, 1) + ' km/s'],
              ['小球速度 v', GRAV.fix(vreal / 1000, 1) + ' km/s',
                vreal > vesc ? GRAV.CSS.rose : GRAV.CSS.mint]
            ]);
          }
        },
        setParam: function (key, value) {
          if (key === 'M') rebuild();
          else if (key === 'launch') launch();
        },
        dispose: function () { /* 资源随 group 统一回收 */ }
      };
    }
  });

})(window);
