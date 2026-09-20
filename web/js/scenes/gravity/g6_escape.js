/**
 * ⑥ 逃逸速度：从星球表面发射，实时看到椭圆 / 抛物线 / 双曲线
 *
 * 真实 SI 单位积分（速度 Verlet），再按每颗天体的特征时间统一加速到「观感一致」；
 * 同时解析算出圆锥曲线 r(ν) = p/(1+e cos ν) 作为预测轨道画出来。
 */
(function (global) {
  'use strict';

  var GRAV = global.HL.GRAV;
  var K = GRAV.K;
  var PFX = 'esc_';
  function C(o) { o.key = PFX + o.key; return o; }

  var BODIES = {
    moon: { name: '月球', M: 7.3477e22, R: 1.7374e6, col: 0x9aa7b5, rim: 0xdfe8f5 },
    mars: { name: '火星', M: 6.4171e23, R: 3.3895e6, col: 0xc1552e, rim: 0xff9a6b },
    earth: { name: '地球', M: 5.9722e24, R: 6.3710e6, col: 0x1d4f8a, rim: 0x6fc0ff },
    jupiter: { name: '木星', M: 1.8982e27, R: 6.9911e7, col: 0xc79a5b, rim: 0xffe0a8 },
    sun: { name: '太阳', M: 1.98892e30, R: 6.9570e8, col: 0xff7a2f, rim: 0xffd98a }
  };

  GRAV.registerSub({
    id: 'escape',
    name: '逃逸速度',
    tab: '⑥ 逃逸速度',
    desc: '一脚油门下去，轨道是椭圆、抛物线还是双曲线',
    tour: [
      {
        t: '椭圆：被地球留住',
        d: 'v₀ < v_esc 时火箭被束缚：比能 ε < 0，沿椭圆飞行。仰角较陡时椭圆近端已深入地球内部，所以火箭升空后终将落回地面——这就是"亚轨道弹道"。',
        exp: '看 HUD 的近点标注「入地 · 弹道」与状态「落回地表 · 亚轨道」。',
        pulse: [2, 0, 0],
        cam: [[0, 9, 18], [0.5, 0, 0]]
      },
      {
        t: '抛物线：逃逸的临界',
        d: 'v₀ 恰好等于 v_esc = √(2GM/R) 时，ε = 0，轨道是抛物线——火箭刚好"用完最后一口气"离开地球，到无穷远速度恰好归零。',
        exp: '已为你把 v₀ 调到 1.00 v_esc：观察轨迹张开的临界形状。',
        apply: function () { P.v0 = 1.0; if (inst && inst.setParam) inst.setParam('v0', 1.0); },
        cam: [[0, 10, 20], [0.5, 0, 0]]
      },
      {
        t: '双曲线：一去不返',
        d: 'v₀ > v_esc 时 ε > 0，轨道是双曲线的一支；到达无穷远仍带剩余速度 v∞ = √(2ε)——这正是深空探测器离开地球时的"出发速度"。',
        exp: '已为你把 v₀ 调到 1.20 v_esc：火箭将不再回头。',
        apply: function () { P.v0 = 1.2; if (inst && inst.setParam) inst.setParam('v0', 1.2); },
        cam: [[0, 11, 22], [1, 0, 0]]
      },
      {
        t: '仰角改变椭圆的胖瘦',
        d: '同样的 v₀，仰角越低、水平动量越大，轨道越饱满；水平发射（0°）时发射点本身就是近点，能量全部用于轨道速度——这是入轨的基本原理。',
        exp: '把「仰角」从 30° 拉到 75°，看椭圆如何从饱满变得细长（并坠回地面）。',
        apply: function () { P.v0 = 0.95; P.ang = 30; if (inst && inst.setParam) { inst.setParam('v0', 0.95); inst.setParam('ang', 30); } },
        cam: [[0, 9, 18], [0.5, 0, 0]]
      },
      {
        t: '别的星球更难逃',
        d: '太阳表面的逃逸速度高达 617.5 km/s（地球的 55 倍）；中子星可达光速的 40%；黑洞的 v_esc 正好等于光速——所以光也出不来。',
        exp: '在「天体」里切换 火星 / 木星 / 太阳，比较 HUD 的 v_esc 读数。',
        cam: [[0, 12, 24], [0, 0, 0]]
      }
    ],
    view: [[0, 16, 34], [0, 0, 0]],
    defaults: {
      body: 'earth', v0: 0.95, ang: 30, speed: 1.0, pred: true, trail: true
    },
    controls: [
      C({
        type: 'buttons', key: 'body', label: '天体', value: 'earth', options: [
          { label: '月球', value: 'moon' },
          { label: '火星', value: 'mars' },
          { label: '地球', value: 'earth' },
          { label: '木星', value: 'jupiter' },
          { label: '太阳', value: 'sun' }
        ]
      }),
      C({ type: 'range', key: 'v0', label: '初速度 v₀', min: 0.30, max: 1.60, step: 0.02, value: 0.95, unit: ' v_esc' }),
      C({ type: 'range', key: 'ang', label: '仰角（90° = 垂直）', min: 0, max: 90, step: 1, value: 30, unit: '°' }),
      C({ type: 'range', key: 'speed', label: '时间流速', min: 0, max: 3, step: 0.05, value: 1, unit: '×' }),
      C({ type: 'button', key: 'fire', label: '⟳ 重新发射' }),
      C({ type: 'check', key: 'pred', label: '预测轨道（解析圆锥曲线）', value: true }),
      C({ type: 'check', key: 'trail', label: '粒子拖尾', value: true }),
      {
        type: 'legend', items: [
          ['星球', '#6fc0ff'],
          ['火箭', '#a8ff6b'],
          ['预测轨道', '#ffcf6b'],
          ['椭圆（束缚）', '#4de2ff'],
          ['双曲线（逃逸）', '#ff5b7f']
        ]
      }
    ],

    init: function (api) {
      var THREE = api.THREE, G = api.group, P = api.P, hud = api.hud;

      G.add(api.stars(1700, 900, 1.6));

      /* ---------- 星球 ---------- */
      var planet = GRAV.body(THREE, { r: 1, color: 0x1d4f8a, rim: 0x6fc0ff, haloScale: 3.2 });
      G.add(planet);
      var planetLb = GRAV.label(THREE, '地球', { color: '#9fd8ff', scale: 0.8, size: 46 });
      G.add(planetLb);
      var pad = GRAV.ring(THREE, 0.30, 0xa8ff6b, 0.020, 0.9);
      pad.rotation.set(0, Math.PI / 2, 0);          // 让小环正对 +X（发射点）
      G.add(pad);

      // 近旁空间参考网格
      var grid = GRAV.polarGrid(THREE, 14, 6, 12, 0x4de2ff, 0.13);
      G.add(grid);

      /* ---------- 火箭 ---------- */
      var rocket = GRAV.orb(THREE, 0.17, 0xd8ffb0, 5.0);
      G.add(rocket);
      var tr = GRAV.trail(THREE, 320, 0xa8ff6b, 0.14);
      G.add(tr.obj);
      var predLine = null;

      /* ---------- HUD ---------- */
      var c1 = hud.card({
        title: '逃逸速度', accent: GRAV.CSS.cyan,
        tex: 'v_{\\rm esc}=\\sqrt{\\frac{2GM}{R}}=\\sqrt{2}\\,v_c',
        note: '第一宇宙速度 v_c 让人绕着转，第二宇宙速度 v_esc = √2·v_c 让人一去不回。',
        rows: [['天体', '—'], ['质量 M', '—'], ['半径 R', '—'], ['v_esc / v_c', '—']]
      });
      var c2 = hud.card({
        title: '轨道能量与形状', accent: GRAV.CSS.gold, badge: '',
        tex: '\\varepsilon=\\frac{v^{2}}{2}-\\frac{GM}{r},\\qquad e=\\sqrt{1+\\frac{2\\varepsilon h^{2}}{\\mu^{2}}}',
        note: 'ε<0 椭圆（束缚），ε=0 抛物线，ε>0 双曲线（逃逸）。',
        rows: [['初速度 v₀', '—'], ['比能 ε', '—'], ['离心率 e', '—'], ['状态', '—']]
      });
      var c3 = hud.card({
        title: '轨道小窗（轨道平面）', accent: GRAV.CSS.mint,
        note: '灰盘为星球，黄线为解析预测的圆锥曲线，绿点为火箭。',
        rows: [['远点 / 近点', '—']],
        plot: {
          w: 300, h: 132, draw: function (c, w, h) {
            c.clearRect(0, 0, w, h);
            var cx = w * 0.42, cy = h * 0.5;
            var view = curView;
            if (!(view > 0)) return;
            var sc = Math.min(w * 0.42, h * 0.44) / view;

            // 星球
            c.fillStyle = 'rgba(90,150,220,.20)';
            c.strokeStyle = 'rgba(140,200,255,.55)'; c.lineWidth = 1;
            c.beginPath(); c.arc(cx, cy, Math.max(2, Rp * sc), 0, Math.PI * 2);
            c.fill(); c.stroke();

            // 预测轨道
            if (predPts && predPts.length > 1) {
              c.strokeStyle = eNow >= 1 ? 'rgba(255,91,127,.85)' : 'rgba(255,207,107,.9)';
              c.lineWidth = 1.4; c.beginPath();
              for (var i = 0; i < predPts.length; i++) {
                var px = cx + predPts[i][0] * sc, py = cy + predPts[i][1] * sc;
                if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
              }
              c.stroke();
            }
            // 火箭
            var rx = cx + (rxNow) * sc, ry = cy + (rzNow) * sc;
            c.fillStyle = '#a8ff6b';
            c.beginPath(); c.arc(rx, ry, 3.4, 0, Math.PI * 2); c.fill();
            c.fillStyle = 'rgba(168,255,107,.35)';
            c.beginPath(); c.arc(rx, ry, 7, 0, Math.PI * 2); c.fill();

            c.font = '9px "Microsoft YaHei",sans-serif';
            c.fillStyle = 'rgba(143,163,189,.9)'; c.textAlign = 'left';
            c.fillText('视场半径 ' + GRAV.fix(view / Rp, 1) + ' R', 8, h - 6);
          }
        }
      });

      /* ---------- 状态 ---------- */
      var Rp = 2.0;             // 星球视觉半径（场景单位）
      var L = 1;                // 1 场景单位 = L 米
      var mu = 0, vesc = 0, vcirc = 0, ACC = 1;
      var px = 0, pz = 0, pvx = 0, pvz = 0;      // 真实单位（m, m/s）
      var rxNow = 0, rzNow = 0;                  // 场景单位
      var eNow = 0, epsNow = 0, hNow = 0, pNow = 0;
      var stateTxt = '';
      var predPts = null, curView = 1;
      var alive = true;

      function setupBody() {
        var b = BODIES[P.body] || BODIES.earth;
        Rp = Math.max(1.3, Math.min(6.5, 2.0 * Math.pow(b.R / 6.371e6, 0.28)));
        L = b.R / Rp;
        mu = K.G * b.M;
        vesc = Math.sqrt(2 * mu / b.R);
        vcirc = Math.sqrt(mu / b.R);
        ACC = (b.R / vesc) / 8;                  // 让不同天体的观感速度一致
        planet.scale.setScalar(Rp);
        planet.userData.mat.uniforms.uCore.value.setHex(b.col);
        planet.userData.mat.uniforms.uRim.value.setHex(b.rim);
        planet.userData.wire.material.color.setHex(b.rim);
        planet.userData.halo.material.map = GRAV.glowTexture(THREE, GRAV.rgba(b.rim, 0.5));
        planet.userData.halo.material.needsUpdate = true;
        planetLb.position.set(0, -Rp - 0.9, 0);
        planetLb.visible = true;
        pad.position.set(Rp, 0, 0);
        pad.scale.setScalar(1);
        grid.scale.setScalar(Math.max(1, Math.min(1.6, Rp / 2)));
        fire();
      }

      function fire() {
        var b = BODIES[P.body] || BODIES.earth;
        var a = P.ang * Math.PI / 180;
        var v = P.v0 * vesc;
        px = b.R; pz = 0;
        pvx = Math.sin(a) * v; pvz = Math.cos(a) * v;
        alive = true;
        stateTxt = '';
        tr.reset(Rp, 0, 0);
        buildPrediction();
      }

      function buildPrediction() {
        var b = BODIES[P.body] || BODIES.earth;
        var r = Math.hypot(px, pz);
        var v2 = pvx * pvx + pvz * pvz;
        epsNow = v2 / 2 - mu / r;
        hNow = px * pvz - pz * pvx;
        pNow = hNow * hNow / mu;
        // 偏心率矢量
        var rv = px * pvx + pz * pvz;
        var ex = ((v2 - mu / r) * px - rv * pvx) / mu;
        var ez = ((v2 - mu / r) * pz - rv * pvz) / mu;
        eNow = Math.hypot(ex, ez);

        var pts = [];
        var nMax, nu;
        if (eNow < 1) nMax = Math.PI;
        else if (eNow < 1.0001) nMax = Math.PI - 0.06;
        else nMax = Math.acos(-1 / eNow) - 0.04;
        var ux = eNow > 1e-8 ? ex / eNow : 1, uz = eNow > 1e-8 ? ez / eNow : 0;
        var N = 220;
        for (var i = 0; i <= N; i++) {
          nu = -nMax + 2 * nMax * i / N;
          var rr = pNow / (1 + eNow * Math.cos(nu));
          if (!isFinite(rr) || rr <= 0) continue;
          if (rr > b.R * 60) continue;
          if (rr < b.R * 0.999) continue;      // 弹道段：轨道止于地表，不画入星球内部
          var cn = Math.cos(nu), sn = Math.sin(nu);
          pts.push([(rr * (ux * cn - uz * sn)) / L, (rr * (ux * sn + uz * cn)) / L]);
        }
        predPts = pts;
        if (predLine) { G.remove(predLine); predLine.geometry.dispose(); predLine.material.dispose(); }
        var v3 = [];
        for (var q = 0; q < pts.length; q++) v3.push(new THREE.Vector3(pts[q][0], 0, pts[q][1]));
        if (v3.length > 1) {
          predLine = GRAV.line(THREE, v3, eNow >= 1 ? 0xff5b7f : 0xffcf6b, 0.55);
          G.add(predLine);
        } else predLine = null;
      }
      setupBody();

      /* ---------- 积分 ---------- */
      function step(h) {
        var r = Math.max(1e-6, Math.hypot(px, pz));
        var a = -mu / (r * r);
        pvx += a * (px / r) * h * 0.5; pvz += a * (pz / r) * h * 0.5;
        px += pvx * h; pz += pvz * h;
        var r2 = Math.max(1e-6, Math.hypot(px, pz));
        var a2 = -mu / (r2 * r2);
        pvx += a2 * (px / r2) * h * 0.5; pvz += a2 * (pz / r2) * h * 0.5;
      }

      var tick = 0;
      return {
        update: function (dt, t) {
          var b = BODIES[P.body] || BODIES.earth;
          var dts = Math.min(dt, 0.05) * P.speed;
          if (alive && dts > 0) {
            var simDt = dts * ACC;
            var hmax = (b.R / vesc) / 3000;
            var n = Math.min(120, Math.max(1, Math.ceil(simDt / hmax)));
            var hh = simDt / n;
            for (var i = 0; i < n; i++) {
              step(hh);
              var r = Math.hypot(px, pz);
              if (r < b.R * 1.0005 && (px * pvx + pz * pvz) < 0) {
                // 落回地表
                px = px / r * b.R; pz = pz / r * b.R;
                pvx = 0; pvz = 0;
                alive = false; stateTxt = '落回地表 · 亚轨道';
                break;
              }
              if (r > b.R * 40) { alive = false; stateTxt = '已逃逸'; break; }
            }
          }

          rxNow = px / L; rzNow = pz / L;
          rocket.position.set(rxNow, 0, rzNow);
          if (P.trail && alive) tr.push(rxNow, 0, rzNow);
          tr.obj.visible = !!P.trail;
          if (predLine) predLine.visible = !!P.pred;
          planet.userData.wire.rotation.y += dt * 0.12;

          // 视场：始终包含火箭，尽量包含远点
          var rr = Math.hypot(px, pz);
          var ra = eNow < 1 ? pNow / (1 - eNow) : b.R * 6;
          var target = Math.max(rr * 1.3, Math.min(ra, b.R * 25));
          curView = Math.max(Rp * 2.6, Math.min(Rp * 30, target));
          if (!isFinite(curView) || curView <= 0) curView = Rp * 4;

          tick++;
          if (tick % 6 === 0) {
            var v2 = pvx * pvx + pvz * pvz;
            var eps = v2 / 2 - mu / Math.max(1e-6, rr);
            var type = eps < -1e-6 ? '椭圆（束缚）' : (eps > 1e-6 ? '双曲线（逃逸）' : '抛物线（临界）');
            var st = alive ? type : stateTxt;
            c1.setRows([
              ['天体', b.name],
              ['质量 M', GRAV.sci(b.M, 3) + ' kg'],
              ['半径 R', GRAV.fix(b.R / 1000, 0) + ' km'],
              ['v_esc / v_c', GRAV.fix(vesc / 1000, 2) + ' / ' + GRAV.fix(vcirc / 1000, 2) + ' km/s']
            ]);
            c2.setBadge(alive ? type : stateTxt,
              eps > 1e-6 ? GRAV.CSS.rose : (eps < -1e-6 ? GRAV.CSS.cyan : GRAV.CSS.gold));
            c2.setRows([
              ['初速度 v₀', GRAV.fix(P.v0 * vesc / 1000, 2) + ' km/s（' + GRAV.fix(P.v0, 2) + ' v_esc）'],
              ['比能 ε', GRAV.sci(eps, 3) + ' J/kg'],
              ['离心率 e', GRAV.fix(eNow, 4)],
              ['状态', st]
            ]);
            var rp = pNow / (1 + eNow);
            var rpTxt = rp < b.R ? GRAV.fix(rp / b.R, 2) + ' R（入地 · 弹道）'
              : GRAV.fix(rp / b.R, 2) + ' R  /  ' + (eNow < 1 ? GRAV.fix(ra / b.R, 2) + ' R' : '∞');
            c3.setRows([
              ['近点 / 远点', rpTxt]
            ]);
            if (c3.plot) c3.plot.redraw();
          }
        },
        setParam: function (key) {
          if (key === 'body') setupBody();
          else if (key === 'v0' || key === 'ang' || key === 'fire') fire();
        },
        dispose: function () { }
      };
    }
  });

})(window);
