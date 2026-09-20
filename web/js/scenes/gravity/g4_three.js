/**
 * ④ 三体混沌：拉格朗日点 / 8 字轨道 / 混沌
 *
 * 无量纲单位 G = m = 1。8 字轨道用 Chenciner–Montgomery 精确初值；
 * 混沌模式同时积分「扰动解」与「未扰动参考解」，实时显示分离距离 Δ(t) 并拟合
 * 李雅普诺夫指数 λ —— 轨迹差随时间指数增长，这就是混沌的定义。
 */
(function (global) {
  'use strict';

  var GRAV = global.HL.GRAV;
  var PFX = 'tri_';
  function C(o) { o.key = PFX + o.key; return o; }

  var EPS2 = 1e-5;
  var S8 = 5.0;             // 8 字轨道的场景缩放
  var SL = 8.0;             // 拉格朗日构型的场景缩放
  var RATE8 = 0.70;         // 场景时间 / 真实秒（8 字）
  var RATEL = 0.60;         // 拉格朗日

  // Chenciner–Montgomery 8 字轨道初值（G = m = 1，周期 T ≈ 6.3259）
  var F8 = {
    x: [0.97000436, -0.97000436, 0],
    z: [-0.24308753, 0.24308753, 0],
    vx: [0.4662036850, 0.4662036850, -0.9324073700],
    vz: [0.4323657300, 0.4323657300, -0.8647314600]
  };

  function solveCollinear(mu) {
    // 旋转坐标系：主星 1-μ 位于 x=-μ，主星 μ 位于 x=1-μ，ω=1
    function f(x) {
      var a = x + mu, b = x - 1 + mu;
      var ra = Math.abs(a), rb = Math.abs(b);
      return x - (1 - mu) * a / (ra * ra * ra) - mu * b / (rb * rb * rb);
    }
    var out = [], prev = null, x;
    for (x = -3; x <= 3.0001; x += 0.002) {
      var v = f(x);
      if (Math.abs(v) > 60) { prev = null; continue; }
      if (prev && ((prev.v < 0 && v >= 0) || (prev.v > 0 && v <= 0)) && Math.abs(prev.x - x) < 0.9) {
        var lo = prev.x, hi = x, flo = prev.v;
        for (var k = 0; k < 60; k++) {
          var mid = (lo + hi) / 2, fm = f(mid);
          if ((flo < 0) === (fm < 0)) { lo = mid; flo = fm; } else hi = mid;
        }
        out.push((lo + hi) / 2);
      }
      prev = { x: x, v: v };
    }
    // 排序：L3(最左) < L1(两主星之间) < L2(最右)
    out.sort(function (p, q) { return p - q; });
    return { L3: out[0], L1: out[1], L2: out[2] };
  }

  GRAV.registerSub({
    id: 'threebody',
    name: '三体混沌',
    tab: '④ 三体混沌',
    desc: '拉格朗日点 · 8 字轨道 · 微小扰动引发的混沌',
    tour: [
      {
        t: '八字舞：稀有的周期三体解',
        d: '三个等质量天体沿同一条"8"字形跑道相互追逐，是 1993/2000 年才被发现的周期解（Chenciner–Montgomery）。能量 E = −1.287 时轨道严格闭合。',
        exp: '看 HUD 的能量漂移 ~10⁻⁸：数值积分几乎不漏能量。',
        cam: [[0, 9, 15], [0, 0, 0]]
      },
      {
        t: '拉格朗日：5 个引力平衡点',
        d: '「拉格朗日」预设里，两个主星之外存在 5 个平动点（L1–L5）。其中 L4/L5 与两主星构成等边三角形，是稳定的"引力停车场"——木星的特洛伊小行星就聚在那里。',
        exp: '已为你切换到拉格朗日预设：观察试验粒子在 L4/L5 附近画出的花瓣轨迹。',
        apply: function () { P.preset = 'lagrange'; if (inst && inst.setParam) inst.setParam('preset', 'lagrange'); },
        cam: [[0, 11, 18], [0, 0, 0]]
      },
      {
        t: '混沌：对初始条件的敏感',
        d: '「混沌」预设中，给某个天体加上 10⁻⁶ 量级的微小扰动，两条本来完全重合的轨迹会指数式分离——Lyapunov 指数 λ > 0 就是混沌的判据。',
        exp: '已为你切换到混沌预设：把「扰动 δ」从 10⁻⁴ 拉到 10⁻⁶，盯着「分离距离 Δ」爆炸式增长。',
        apply: function () { P.preset = 'chaos'; if (inst && inst.setParam) inst.setParam('preset', 'chaos'); }
      },
      {
        t: '确定性混沌 ≠ 随机',
        d: '三体系统完全遵守牛顿定律、完全确定，却长期不可预测——这正是"蝴蝶效应"的数学原型（庞加莱，1890）。而 8 字解恰好位于混沌海洋中的稳定小岛。',
        exp: '回到「8 字轨道」预设，确认它对微小扰动居然有韧性——周期解的"走廊"。',
        apply: function () { P.preset = 'figure8'; if (inst && inst.setParam) inst.setParam('preset', 'figure8'); },
        cam: [[0, 9, 15], [0, 0, 0]]
      }
    ],
    view: [[0, 15, 24], [0, 0, 0]],
    defaults: {
      preset: 'figure8', logd: 4, speed: 1.0, trail: true, ghost: true
    },
    controls: [
      C({
        type: 'buttons', key: 'preset', label: '预设', value: 'figure8', options: [
          { label: '拉格朗日点', value: 'lagrange' },
          { label: '8 字轨道', value: 'figure8' },
          { label: '混沌', value: 'chaos' }
        ]
      }),
      C({ type: 'range', key: 'logd', label: '扰动 δ = 10⁻ⁿ', min: 2, max: 6, step: 0.5, value: 4, unit: '' }),
      C({ type: 'range', key: 'speed', label: '时间流速', min: 0, max: 2.5, step: 0.05, value: 1, unit: '×' }),
      C({ type: 'button', key: 'reset', label: '⟳ 回到初始条件' }),
      C({ type: 'check', key: 'trail', label: '粒子拖尾', value: true }),
      C({ type: 'check', key: 'ghost', label: '参考解（未扰动）', value: true }),
      {
        type: 'legend', items: [
          ['天体 1', '#4de2ff'],
          ['天体 2', '#ff5b7f'],
          ['天体 3', '#ffcf6b'],
          ['参考解（混沌模式）', '#8fa3bd'],
          ['拉格朗日点 L1–L5', '#a8ff6b']
        ]
      }
    ],

    init: function (api) {
      var THREE = api.THREE, G = api.group, P = api.P, hud = api.hud;

      G.add(api.stars(1700, 900, 1.6));

      /* ---------- 天体 ---------- */
      var COL = [0x4de2ff, 0xff5b7f, 0xffcf6b];
      var orbs = [], trails = [];
      for (var i = 0; i < 3; i++) {
        var o = GRAV.orb(THREE, 0.28, COL[i], 5.2);
        G.add(o); orbs.push(o);
        var t = GRAV.trail(THREE, 520, COL[i], 0.13);
        G.add(t.obj); trails.push(t);
      }
      // 参考解（仅混沌模式可见）
      var ghosts = [], gtrails = [];
      for (var j = 0; j < 3; j++) {
        var go = GRAV.orb(THREE, 0.16, 0x8fa3bd, 3.2);
        go.visible = false;
        G.add(go); ghosts.push(go);
        var gt = GRAV.trail(THREE, 400, 0x8fa3bd, 0.09);
        gt.setOpacity(0.45);
        gt.obj.visible = false;
        G.add(gt.obj); gtrails.push(gt);
      }

      /* ---------- 拉格朗日点标记 ---------- */
      var lagGroup = new THREE.Group();
      G.add(lagGroup);
      var lMarks = [], lLabels = [];
      (function () {
        var names = ['L1', 'L2', 'L3', 'L4', 'L5'];
        for (var k = 0; k < 5; k++) {
          var ring = GRAV.ring(THREE, 0.20, 0xa8ff6b, 0.018, 0.85);
          var lb = GRAV.label(THREE, names[k], { color: '#c6ff9b', scale: 0.6, size: 38 });
          lagGroup.add(ring); lagGroup.add(lb);
          lMarks.push(ring); lLabels.push(lb);
        }
      })();
      // 主星连线 + L4 三角
      var triLine = GRAV.line(THREE, [
        new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()
      ], 0xa8ff6b, 0.30);
      lagGroup.add(triLine);

      var primOrbit = GRAV.ring(THREE, 0.5 * SL, 0x4de2ff, 0.020, 0.35);
      lagGroup.add(primOrbit);

      /* ---------- 状态 ---------- */
      var mode = 'figure8';
      var x = [0, 0, 0], z = [0, 0, 0], vx = [0, 0, 0], vz = [0, 0, 0], m = [1, 1, 1];
      var gx = [0, 0, 0], gz = [0, 0, 0], gvx = [0, 0, 0], gvz = [0, 0, 0];
      var simT = 0, E0 = 0, Ecur = 0;
      var lag = { mu: 0.5, L: null, omega: Math.SQRT2, test: null };

      var hist = [];       // [{t, lnD}]
      var lastSample = 0;
      var lam = 0, sep = 0;

      function energy() {
        var T = 0, U = 0, i, k;
        for (i = 0; i < 3; i++) if (m[i] > 0) T += 0.5 * m[i] * (vx[i] * vx[i] + vz[i] * vz[i]);
        for (i = 0; i < 3; i++) for (k = i + 1; k < 3; k++) {
          if (m[i] <= 0 || m[k] <= 0) continue;
          var dx = x[k] - x[i], dz = z[k] - z[i];
          U -= m[i] * m[k] / Math.sqrt(dx * dx + dz * dz + EPS2);
        }
        return T + U;
      }

      function acc(X, Z, M, out) {
        for (var i = 0; i < 3; i++) { out[2 * i] = 0; out[2 * i + 1] = 0; }
        for (i = 0; i < 3; i++) {
          for (var k = i + 1; k < 3; k++) {
            var dx = X[k] - X[i], dz = Z[k] - Z[i];
            var r2 = dx * dx + dz * dz + EPS2;
            var inv = 1 / (r2 * Math.sqrt(r2));
            if (M[i] !== 0) { out[2 * k] -= M[i] * dx * inv; out[2 * k + 1] -= M[i] * dz * inv; }
            if (M[k] !== 0) { out[2 * i] += M[k] * dx * inv; out[2 * i + 1] += M[k] * dz * inv; }
          }
        }
      }
      var a1 = new Float64Array(6), a2 = new Float64Array(6);
      var tmpX = [0, 0, 0], tmpZ = [0, 0, 0];

      function verlet(state, h) {
        var X = state.x, Z = state.z, VX = state.vx, VZ = state.vz, M = state.m;
        acc(X, Z, M, a1);
        for (var i = 0; i < 3; i++) {
          if (M[i] === 0) continue;
          VX[i] += a1[2 * i] * h * 0.5; VZ[i] += a1[2 * i + 1] * h * 0.5;
          X[i] += VX[i] * h; Z[i] += VZ[i] * h;
        }
        acc(X, Z, M, a2);
        for (i = 0; i < 3; i++) {
          if (M[i] === 0) continue;
          VX[i] += a2[2 * i] * h * 0.5; VZ[i] += a2[2 * i + 1] * h * 0.5;
        }
      }

      /* ---------- 初始化各预设 ---------- */
      function setup(preset) {
        mode = preset;
        simT = 0; hist.length = 0; lastSample = 0; lam = 0; sep = 0;
        for (var i = 0; i < 3; i++) { trails[i].reset(0, 0, 0); gtrails[i].reset(0, 0, 0); }

        if (preset === 'lagrange') {
          m = [1, 1, 0];                       // 第三个是 massless 试验粒子
          lag.mu = 0.5;
          lag.L = solveCollinear(0.5);
          lag.omega = Math.SQRT2;              // ω² = G(m₁+m₂)/d³ = 2
          var th = 0;
          x[0] = -0.5 * Math.cos(th); z[0] = -0.5 * Math.sin(th);
          x[1] = 0.5 * Math.cos(th); z[1] = 0.5 * Math.sin(th);
          vx[0] = 0.5 * lag.omega * Math.sin(th); vz[0] = -0.5 * lag.omega * Math.cos(th);
          vx[1] = -0.5 * lag.omega * Math.sin(th); vz[1] = 0.5 * lag.omega * Math.cos(th);
          // 试验粒子放在 L4
          x[2] = 0; z[2] = Math.sqrt(3) / 2;
          vx[2] = -lag.omega * z[2]; vz[2] = lag.omega * x[2];
          E0 = NaN; Ecur = NaN;
        } else {
          m = [1, 1, 1];
          for (i = 0; i < 3; i++) {
            x[i] = F8.x[i]; z[i] = F8.z[i]; vx[i] = F8.vx[i]; vz[i] = F8.vz[i];
          }
          E0 = energy();
          if (preset === 'chaos') {
            var d = Math.pow(10, -P.logd);
            vx[2] += d; vz[2] += d * 0.37;
            for (i = 0; i < 3; i++) {
              gx[i] = F8.x[i]; gz[i] = F8.z[i]; gvx[i] = F8.vx[i]; gvz[i] = F8.vz[i];
            }
          }
        }
      }
      setup(P.preset);

      /* ---------- HUD ---------- */
      var c1 = hud.card({
        title: '牛顿运动方程', accent: GRAV.CSS.cyan,
        tex: 'm_i\\ddot{\\vec r}_i=\\sum_{j\\neq i}G\\,\\frac{m_i m_j}{r_{ij}^{3}}\\left(\\vec r_j-\\vec r_i\\right)',
        note: '三体问题没有通解：初值的任意微小差别都会被指数放大。',
        rows: [['总能量 E', '—'], ['能量漂移 |ΔE/E|', '—'], ['积分时长', '—']]
      });
      var c2 = hud.card({
        title: '8 字轨道 · 精确解', accent: GRAV.CSS.gold,
        tex: 'T\\approx 6.3259,\\qquad E\\approx-1.2871\\quad (G=m=1)',
        note: 'Chenciner–Montgomery 1993：三颗等质量天体沿同一条 8 字曲线首尾相接。',
        rows: [['预设', '—'], ['周期进度', '—'], ['天体 3 速率', '—']]
      });
      var c3 = hud.card({
        title: '混沌 · 李雅普诺夫指数', accent: GRAV.CSS.rose, badge: '',
        tex: '\\Delta(t)\\simeq\\Delta_0\\,e^{\\lambda t}',
        note: '扰动解与参考解的距离按指数分离；λ > 0 即混沌。',
        rows: [['扰动 δ', '—'], ['分离距离 Δ', '—'], ['λ 估计', '—']],
        plot: {
          w: 300, h: 118, draw: function (c, w, h) {
            var x0 = 32, x1 = w - 8, y0 = h - 18, y1 = 8;
            c.strokeStyle = 'rgba(120,180,255,.28)'; c.lineWidth = 1;
            c.beginPath(); c.moveTo(x0, y1); c.lineTo(x0, y0); c.lineTo(x1, y0); c.stroke();
            c.font = '9px "Microsoft YaHei",sans-serif'; c.fillStyle = 'rgba(143,163,189,.9)';
            c.textAlign = 'center'; c.fillText('t (s)', (x0 + x1) / 2, h - 4);
            c.save(); c.translate(10, (y0 + y1) / 2); c.rotate(-Math.PI / 2);
            c.textAlign = 'center'; c.fillText('log₁₀ Δ', 0, 0); c.restore();

            if (mode !== 'chaos' || !hist.length) {
              c.fillStyle = 'rgba(143,163,189,.55)'; c.textAlign = 'center';
              c.fillText(mode === 'chaos' ? '积分中…' : '仅在「混沌」预设下有效', (x0 + x1) / 2, (y0 + y1) / 2);
              return;
            }
            var lo = -8, hi = 1;
            var tMax = Math.max(8, hist[hist.length - 1].t);
            function X(t) { return x0 + (x1 - x0) * t / tMax; }
            function Y(v) { return y0 - (y0 - y1) * (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo); }
            c.strokeStyle = 'rgba(120,180,255,.16)';
            for (var g = -8; g <= 1; g += 2) {
              c.beginPath(); c.moveTo(x0, Y(g)); c.lineTo(x1, Y(g)); c.stroke();
              c.textAlign = 'right'; c.fillStyle = 'rgba(143,163,189,.7)';
              c.fillText(String(g), x0 - 3, Y(g) + 3);
            }
            c.strokeStyle = '#ff5b7f'; c.lineWidth = 1.6; c.beginPath();
            for (var i = 0; i < hist.length; i++) {
              var px = X(hist[i].t), py = Y(hist[i].lnD / Math.LN10);
              if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
            }
            c.stroke();
            // λ 拟合直线
            if (lam > 0) {
              var p0 = hist[0], p1s = hist[hist.length - 1];
              c.strokeStyle = 'rgba(255,207,107,.7)'; c.setLineDash([4, 3]); c.beginPath();
              c.moveTo(X(p0.t), Y(p0.lnD / Math.LN10));
              c.lineTo(X(p1s.t), Y((p0.lnD + lam * (p1s.t - p0.t)) / Math.LN10));
              c.stroke(); c.setLineDash([]);
            }
          }
        }
      });

      /* ---------- 主循环 ---------- */
      var tick = 0;

      return {
        update: function (dt, t) {
          var dts = Math.min(dt, 0.05) * P.speed;
          var rate = (mode === 'lagrange') ? RATEL : RATE8;
          var simDt = dts * rate;

          if (simDt > 0) {
            var h = 0.0008;
            var n = Math.min(80, Math.max(1, Math.ceil(simDt / h)));
            var hh = simDt / n;
            var i;
            for (i = 0; i < n; i++) {
              if (mode === 'lagrange') {
                // 两颗主星走解析圆轨道，试验粒子按真实引力做速度 Verlet 积分
                simT += hh;
                var th = lag.omega * simT;
                x[0] = -0.5 * Math.cos(th); z[0] = -0.5 * Math.sin(th);
                x[1] = 0.5 * Math.cos(th); z[1] = 0.5 * Math.sin(th);
                acc(x, z, m, a1);
                vx[2] += a1[4] * hh * 0.5; vz[2] += a1[5] * hh * 0.5;
                x[2] += vx[2] * hh; z[2] += vz[2] * hh;
                acc(x, z, m, a2);
                vx[2] += a2[4] * hh * 0.5; vz[2] += a2[5] * hh * 0.5;
              } else {
                var s1 = { x: x, z: z, vx: vx, vz: vz, m: m };
                verlet(s1, hh);
                simT += hh;
                if (mode === 'chaos') {
                  var s2 = { x: gx, z: gz, vx: gvx, vz: gvz, m: m };
                  verlet(s2, hh);
                }
              }
            }

            if (mode === 'chaos') {
              sep = 0;
              var k;
              for (k = 0; k < 3; k++) {
                var ddx = x[k] - gx[k], ddz = z[k] - gz[k];
                sep += ddx * ddx + ddz * ddz;
              }
              sep = Math.sqrt(sep);
              if (simT - lastSample >= 0.25) {
                lastSample = simT;
                hist.push({ t: simT, lnD: Math.log(Math.max(sep, 1e-12)) });
                if (hist.length > 600) hist.shift();
                // λ 估计：取 Δ 在 [1e-6, 0.3] 区间的样本做最小二乘
                var sx = 0, sy = 0, sxx = 0, sxy = 0, cnt = 0;
                for (k = 0; k < hist.length; k++) {
                  var D = Math.exp(hist[k].lnD);
                  if (D < 1e-6 || D > 0.3) continue;
                  sx += hist[k].t; sy += hist[k].lnD;
                  sxx += hist[k].t * hist[k].t; sxy += hist[k].t * hist[k].lnD;
                  cnt++;
                }
                if (cnt > 3) {
                  var den = cnt * sxx - sx * sx;
                  lam = Math.abs(den) > 1e-9 ? (cnt * sxy - sx * sy) / den : 0;
                }
              }
            }
          }

          /* --- 渲染 --- */
          var S = (mode === 'lagrange') ? SL : S8;
          var i2;
          orbs[2].scale.setScalar(mode === 'lagrange' ? 0.7 : 1);
          for (i2 = 0; i2 < 3; i2++) {
            orbs[i2].position.set(x[i2] * S, 0, z[i2] * S);
            orbs[i2].visible = true;
            if (P.trail) trails[i2].push(x[i2] * S, 0, z[i2] * S);
            trails[i2].obj.visible = !!P.trail;
            if (mode === 'chaos') {
              ghosts[i2].position.set(gx[i2] * S, 0, gz[i2] * S);
              ghosts[i2].visible = !!P.ghost;
              if (P.ghost) gtrails[i2].push(gx[i2] * S, 0, gz[i2] * S);
              gtrails[i2].obj.visible = !!P.ghost;
            } else {
              ghosts[i2].visible = false;
              gtrails[i2].obj.visible = false;
            }
          }

          // 拉格朗日点
          lagGroup.visible = (mode === 'lagrange');
          if (mode === 'lagrange' && lag.L) {
            var th2 = lag.omega * simT;
            var cs = Math.cos(th2), sn = Math.sin(th2);
            function place(idx, u, v) {
              var wx = (u * cs - v * sn) * SL, wz = (u * sn + v * cs) * SL;
              lMarks[idx].position.set(wx, 0, wz);
              lLabels[idx].position.set(wx, 0.42, wz);
            }
            place(0, lag.L.L1, 0);
            place(1, lag.L.L2, 0);
            place(2, lag.L.L3, 0);
            place(3, 0, Math.sqrt(3) / 2);
            place(4, 0, -Math.sqrt(3) / 2);
            var p1x = (-0.5 * cs) * SL, p1z = (-0.5 * sn) * SL;
            var p2x = (0.5 * cs) * SL, p2z = (0.5 * sn) * SL;
            var l4x = (-Math.sqrt(3) / 2 * sn) * SL, l4z = (Math.sqrt(3) / 2 * cs) * SL;
            var lp = triLine.geometry.attributes.position.array;
            lp[0] = p1x; lp[1] = 0; lp[2] = p1z;
            lp[3] = p2x; lp[4] = 0; lp[5] = p2z;
            lp[6] = l4x; lp[7] = 0; lp[8] = l4z;
            lp[9] = p1x; lp[10] = 0; lp[11] = p1z;
            triLine.geometry.attributes.position.needsUpdate = true;
          }

          Ecur = (mode === 'lagrange') ? NaN : energy();

          tick++;
          if (tick % 6 === 0) {
            var names = { lagrange: '拉格朗日点', figure8: '8 字轨道', chaos: '混沌' };
            var drift = (isFinite(Ecur) && isFinite(E0) && E0 !== 0)
              ? Math.abs((Ecur - E0) / E0) : NaN;
            c1.setRows([
              ['总能量 E', isFinite(Ecur) ? GRAV.fix(Ecur, 5) : '试验粒子模式'],
              ['能量漂移 |ΔE/E|', isFinite(drift) ? GRAV.sci(drift, 2) : '—'],
              ['积分时长', GRAV.fix(simT, 2) + ' (G=m=1)']
            ]);
            var per = (mode === 'lagrange') ? (2 * Math.PI / lag.omega) : 6.32591398;
            var v3 = Math.hypot(vx[2], vz[2]);
            c2.setRows([
              ['预设', names[mode]],
              ['周期进度', GRAV.fix((simT % per) / per * 100, 1) + ' %  (T=' + GRAV.fix(per, 3) + ')'],
              ['天体 3 速率', GRAV.fix(v3, 4)]
            ]);
            c3.setBadge(mode === 'chaos' ? '混沌中' : (mode === 'figure8' ? '周期解' : '特解'),
              mode === 'chaos' ? GRAV.CSS.rose : GRAV.CSS.mint);
            c3.setRows([
              ['扰动 δ', mode === 'chaos' ? '10⁻' + GRAV.fix(P.logd, 1) : '—'],
              ['分离距离 Δ', mode === 'chaos' ? GRAV.sci(sep, 3) : '—'],
              ['λ 估计', mode === 'chaos' ? GRAV.fix(lam, 3) : '—']
            ]);
            if (c3.plot) c3.plot.redraw();
          }
        },
        setParam: function (key) {
          if (key === 'preset' || key === 'logd' || key === 'reset') setup(P.preset);
        },
        dispose: function () { }
      };
    }
  });

})(window);
