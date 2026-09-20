/**
 * ③ 开普勒三定律
 *
 * 同一屏幕上同时演示：椭圆轨道定律（可调 e）、等面积速度定律（等时扇形依次高亮）、
 * 和谐定律（双对数 T²–a³ 散点：八大行星 + 当前配置的工作点）。
 */
(function (global) {
  'use strict';

  var GRAV = global.HL.GRAV;
  var K = GRAV.K;
  var PFX = 'kep_';
  function C(o) { o.key = PFX + o.key; return o; }

  var UPA = 5.0;            // 1 AU = 5 场景单位
  var T0 = 12;              // a = 1 AU 时的场景周期（秒）

  function solveKepler(M, e) {
    var E = M, i;
    for (i = 0; i < 8; i++) {
      var d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= d;
      if (Math.abs(d) < 1e-10) break;
    }
    return E;
  }

  var PLANETS = [
    ['水星', 0.387, 0.2409, 0x9aa7b5],
    ['金星', 0.723, 0.6152, 0xffc06b],
    ['地球', 1.000, 1.0000, 0x5aa9ff],
    ['火星', 1.524, 1.8808, 0xff7a5b],
    ['木星', 5.203, 11.862, 0xffd9a0],
    ['土星', 9.537, 29.457, 0xffe9b0],
    ['天王星', 19.191, 84.011, 0x9fe8ff],
    ['海王星', 30.07, 164.79, 0x7f9dff]
  ];

  GRAV.registerSub({
    id: 'kepler',
    name: '开普勒三定律',
    tab: '③ 开普勒三定律',
    desc: '椭圆轨道 · 等面积速度 · T² ∝ a³',
    tour: [
      {
        t: '第一定律：椭圆与焦点',
        d: '行星沿椭圆运动，太阳位于焦点而非中心——这是开普勒用第谷的火星观测数据"算"出来的革命，也是牛顿引力平方反比律的前身。',
        exp: '拖动「离心率 e」从 0 → 0.9，看椭圆被逐渐拉长。',
        pulse: [0, 0, 0],
        cam: [[0, 13, 24], [0, 0, 0]]
      },
      {
        t: '第二定律：等时等面积',
        d: '行星与太阳的连线在相等时间内扫过相等面积：近日点跑得快、远日点走得慢。金色扇形就是"单位时间扫过的面积"，永远相等。',
        exp: '对比 e=0.2 与 e=0.8 时 HUD「当前速率」的变化幅度。',
        cam: [[3, 9, 16], [1, 0, 0]]
      },
      {
        t: '第三定律：T² ∝ a³',
        d: '周期平方与半长轴立方成正比。散点图里多颗行星精确落在斜率为 1 的直线上——这是牛顿万有引力定律最早的历史证据。',
        exp: '读取 HUD 的 T²/a³ ≈ 1.000：对任何绕太阳的天体都成立。'
      },
      {
        t: '彗星型极端轨道',
        d: 'e → 1 时轨道变成长扁的"彗星道"：绝大部分时间在远日点附近慢行，掠过近日点只有一瞬。',
        exp: '把 e 拉到 0.93，看行星在近日点被明显"甩快"。',
        cam: [[0, 15, 27], [0, 0, 0]]
      }
    ],
    view: [[0, 15, 28], [-2.5, 0, 0]],
    defaults: {
      e: 0.55, a: 1.0, speed: 1.0, sector: true, vec: true, multi: false
    },
    controls: [
      C({ type: 'range', key: 'e', label: '离心率 e', min: 0, max: 0.85, step: 0.01, value: 0.55 }),
      C({ type: 'range', key: 'a', label: '半长轴 a', min: 0.3, max: 3.5, step: 0.05, value: 1, unit: ' AU' }),
      C({ type: 'range', key: 'speed', label: '时间流速', min: 0, max: 3, step: 0.05, value: 1, unit: '×' }),
      C({ type: 'check', key: 'sector', label: '等时扇形（面积定律）', value: true }),
      C({ type: 'check', key: 'vec', label: '速度矢量', value: true }),
      C({ type: 'check', key: 'multi', label: '多行星对比（内行星）', value: false }),
      {
        type: 'legend', items: [
          ['恒星（焦点）', '#ffcf6b'],
          ['行星', '#5aa9ff'],
          ['等时扇形', '#7cf0d0'],
          ['速度矢量 v', '#a8ff6b'],
          ['对比行星', '#b98cff']
        ]
      }
    ],

    init: function (api) {
      var THREE = api.THREE, G = api.group, P = api.P, hud = api.hud;

      G.add(api.stars(1700, 900, 1.6));

      /* ---------- 恒星（位于焦点） ---------- */
      var sun = GRAV.orb(THREE, 0.62, 0xffd98a, 8.0);
      G.add(sun);
      var sunBody = GRAV.body(THREE, { r: 0.62, color: 0xff8a2b, rim: 0xffcf6b, halo: false, wireOpacity: 0.3 });
      G.add(sunBody);
      var sunLabel = GRAV.label(THREE, '恒星 M', { color: '#ffd98a', scale: 0.85, size: 46 });
      sunLabel.position.set(0, -1.25, 0);
      G.add(sunLabel);

      /* ---------- 行星 ---------- */
      var planet = GRAV.body(THREE, { r: 0.36, color: 0x2f6fd0, rim: 0x8fd4ff, haloScale: 5.0 });
      G.add(planet);
      var tr = GRAV.trail(THREE, 200, 0x5aa9ff, 0.15);
      G.add(tr.obj);
      var vArrow = GRAV.arrow(THREE, 0xa8ff6b, 0.045, 0.36);
      G.add(vArrow.group);
      var rLine = GRAV.line(THREE, [new THREE.Vector3(), new THREE.Vector3()], 0x4de2ff, 0.55);
      G.add(rLine);

      /* ---------- 椭圆轨道 + 等时扇形 ---------- */
      var orbitTube = null;
      var sectorGroup = new THREE.Group();
      G.add(sectorGroup);
      var KSEG = 12;
      var sectors = [];

      var periMark = GRAV.ring(THREE, 0.20, 0xff5b7f, 0.022, 0.9);
      var apoMark = GRAV.ring(THREE, 0.20, 0x4de2ff, 0.022, 0.9);
      G.add(periMark); G.add(apoMark);
      var periLb = GRAV.label(THREE, '近日点', { color: '#ff9db1', scale: 0.7, size: 40 });
      var apoLb = GRAV.label(THREE, '远日点', { color: '#9fe0ff', scale: 0.7, size: 40 });
      G.add(periLb); G.add(apoLb);

      var cHi = new THREE.Color(0x7cf0d0);
      var cLo = new THREE.Color(0x3a7fd0);

      function ellipsePoint(E, out) {
        var a = P.a * UPA;
        var b = a * Math.sqrt(1 - P.e * P.e);
        out.set(a * (Math.cos(E) - P.e), 0, b * Math.sin(E));
        return out;
      }

      var _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

      function buildShape() {
        var a = P.a * UPA;
        var b = a * Math.sqrt(1 - P.e * P.e);
        var i;

        // 轨道管
        var pts = [];
        for (i = 0; i <= 160; i++) {
          pts.push(ellipsePoint(i / 160 * Math.PI * 2, new THREE.Vector3()));
        }
        if (orbitTube) { G.remove(orbitTube); orbitTube.geometry.dispose(); orbitTube.material.dispose(); }
        orbitTube = GRAV.tube(THREE, pts, 0x4de2ff, 0.032, 0.62, true, 220);
        G.add(orbitTube);

        // 等时扇形
        while (sectorGroup.children.length) {
          var ch = sectorGroup.children[0];
          sectorGroup.remove(ch);
          if (ch.geometry) ch.geometry.dispose();
          if (ch.material) ch.material.dispose();
        }
        sectors.length = 0;
        var SUB = 10;
        for (var s = 0; s < KSEG; s++) {
          var verts = [0, -0.03, 0];
          for (i = 0; i <= SUB; i++) {
            var E = solveKepler((s + i / SUB) / KSEG * Math.PI * 2, P.e);
            var p = ellipsePoint(E, new THREE.Vector3());
            verts.push(p.x, -0.03, p.z);
          }
          var geo = new THREE.BufferGeometry();
          var arr = new Float32Array(verts);
          geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
          var idx = [];
          for (i = 1; i <= SUB; i++) idx.push(0, i, i + 1);
          geo.setIndex(idx);
          var col = new THREE.Color().copy(cLo).lerp(cHi, s / (KSEG - 1));
          var mat = new THREE.MeshBasicMaterial({
            color: col, transparent: true, opacity: 0.10, side: THREE.DoubleSide,
            depthWrite: false, blending: THREE.AdditiveBlending
          });
          var mesh = new THREE.Mesh(geo, mat);
          sectorGroup.add(mesh);
          sectors.push(mesh);
        }

        periMark.position.set(a * (1 - P.e), 0, 0);
        apoMark.position.set(-a * (1 + P.e), 0, 0);
        periLb.position.set(a * (1 - P.e) + 0.9, 0.45, 0);
        apoLb.position.set(-a * (1 + P.e) - 0.9, 0.45, 0);
        tr.reset(a * (1 - P.e), 0, 0);
      }
      buildShape();

      /* ---------- 多行星对比 ---------- */
      var multi = new THREE.Group();
      G.add(multi);
      var multiItems = [];
      (function () {
        var list = [PLANETS[0], PLANETS[1], PLANETS[3]];
        for (var i = 0; i < list.length; i++) {
          var a = list[i][1] * UPA;
          var ring = GRAV.ring(THREE, a, 0xb98cff, 0.018, 0.32);
          var dot = GRAV.orb(THREE, 0.16, list[i][3], 4.0);
          var lb = GRAV.label(THREE, list[i][0], { color: '#cbb6ff', scale: 0.62, size: 38 });
          multi.add(ring); multi.add(dot); multi.add(lb);
          multiItems.push({ a: a, rate: Math.pow(list[i][1], -1.5), dot: dot, lb: lb });
        }
      })();

      /* ---------- HUD ---------- */
      var curR = 1, curV = 0, curNu = 0, dAdt = 0, areaFrac = 0;

      var c1 = hud.card({
        title: '第一定律 · 椭圆轨道', accent: GRAV.CSS.cyan,
        tex: 'r(\\nu)=\\frac{a(1-e^{2})}{1+e\\cos\\nu}',
        note: '恒星不在椭圆中心，而在其中一个焦点上。',
        rows: [['半长轴 a', '—'], ['离心率 e', '—'], ['近日距 / 远日距', '—']]
      });
      var c2 = hud.card({
        title: '第二定律 · 等面积速度', accent: GRAV.CSS.mint,
        tex: '\\frac{dA}{dt}=\\frac{1}{2}r^{2}\\dot\\nu=\\frac{L}{2m}=\\text{const}',
        note: '12 个扇形用时相同、面积相同：近日点跑得快，远日点跑得慢。',
        rows: [['当前矢径 r', '—'], ['当前速率 v', '—'], ['dA/dt = πab/T', '—']]
      });
      var c3 = hud.card({
        title: '第三定律 · 和谐定律', accent: GRAV.CSS.gold,
        tex: 'T^{2}=\\frac{4\\pi^{2}}{GM_{\\odot}}\\,a^{3}\\;\\Rightarrow\\;\\frac{T^{2}}{a^{3}}=\\text{const}',
        note: '双对数坐标：八大行星（灰点）与当前配置（金点）应落在同一条斜率为 1 的直线上。',
        rows: [['当前 T', '—'], ['T² / a³', '—']],
        plot: {
          w: 300, h: 132, draw: function (c, w, h) {
            var x0 = 34, x1 = w - 8, y0 = h - 20, y1 = 10;
            var lo = -2.2, hi = 4.8;                    // log10(a³) 与 log10(T²) 范围
            function X(v) { return x0 + (x1 - x0) * (v - lo) / (hi - lo); }
            function Y(v) { return y0 - (y0 - y1) * (v - lo) / (hi - lo); }

            c.strokeStyle = 'rgba(120,180,255,.20)'; c.lineWidth = 1;
            for (var g = Math.ceil(lo); g <= hi; g++) {
              c.beginPath(); c.moveTo(X(g), y1); c.lineTo(X(g), y0); c.stroke();
              c.beginPath(); c.moveTo(x0, Y(g)); c.lineTo(x1, Y(g)); c.stroke();
            }
            c.strokeStyle = 'rgba(120,180,255,.42)';
            c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
            c.strokeStyle = 'rgba(120,180,255,.5)'; c.lineWidth = 1.2;
            c.beginPath(); c.moveTo(x0, y1); c.lineTo(x0, y0); c.lineTo(x1, y0); c.stroke();

            c.font = '9px "Microsoft YaHei",sans-serif'; c.fillStyle = 'rgba(143,163,189,.9)';
            c.textAlign = 'center'; c.fillText('log₁₀ a³  (AU³)', (x0 + x1) / 2, h - 5);
            c.save(); c.translate(11, (y0 + y1) / 2); c.rotate(-Math.PI / 2);
            c.textAlign = 'center'; c.fillText('log₁₀ T²', 0, 0); c.restore();
            c.textAlign = 'left'; c.fillText('T² = a³', x0 + 6, y1 + 10);

            // 理论直线 T² = a³
            c.strokeStyle = 'rgba(255,207,107,.75)'; c.setLineDash([4, 3]); c.lineWidth = 1;
            c.beginPath(); c.moveTo(X(lo), Y(lo)); c.lineTo(X(hi), Y(hi)); c.stroke();
            c.setLineDash([]);

            // 八大行星
            c.font = '10px "Microsoft YaHei",sans-serif';
            for (var i = 0; i < PLANETS.length; i++) {
              var a3 = Math.pow(PLANETS[i][1], 3), t2 = Math.pow(PLANETS[i][2], 2);
              var px = X(Math.log10(a3)), py = Y(Math.log10(t2));
              c.fillStyle = '#9fb4cf';
              c.beginPath(); c.arc(px, py, 2.6, 0, Math.PI * 2); c.fill();
              c.fillStyle = 'rgba(159,180,207,.85)'; c.textAlign = 'left';
              c.fillText(PLANETS[i][0][0], px + 4, py + 3);
            }
            // 当前配置
            var ca3 = Math.pow(P.a, 3), ct2 = Math.pow(P.a, 3);   // T² = a³（年/AU 单位）
            var cx = X(Math.log10(ca3)), cy = Y(Math.log10(ct2));
            c.fillStyle = '#ffcf6b';
            c.beginPath(); c.arc(cx, cy, 4.2, 0, Math.PI * 2); c.fill();
            c.strokeStyle = 'rgba(255,207,107,.5)'; c.beginPath();
            c.arc(cx, cy, 7.5, 0, Math.PI * 2); c.stroke();
            c.fillStyle = '#ffe6a8'; c.textAlign = 'left';
            c.fillText('当前', cx + 9, cy - 6);
          }
        }
      });

      /* ---------- 状态 ---------- */
      var M = 0, tick = 0, lastTrail = 0;

      return {
        update: function (dt, t) {
          var dts = Math.min(dt, 0.05) * P.speed;
          var aU = P.a * UPA;
          var bU = aU * Math.sqrt(1 - P.e * P.e);
          // 场景角速度：a = 1 AU 时周期 T0 秒
          var omega = (Math.PI * 2 / T0) * Math.pow(P.a, -1.5);
          M += omega * dts;

          var Mm = M % (Math.PI * 2);
          var E = solveKepler(Mm, P.e);
          var ce = Math.cos(E), se = Math.sin(E);
          var px = aU * (ce - P.e), pz = bU * se;
          planet.position.set(px, 0, pz);
          planet.userData.wire.rotation.y += dt * 0.5;

          // 真实量（以 a、1 太阳质量计）
          var aReal = P.a * K.AU;
          var mu = K.G * K.MSUN;
          var rAU = P.a * (1 - P.e * ce);
          curR = rAU;
          var rReal = rAU * K.AU;
          curV = Math.sqrt(mu * (2 / rReal - 1 / aReal));
          var Treal = 2 * Math.PI * Math.sqrt(Math.pow(aReal, 3) / mu);
          var area = Math.PI * P.a * (P.a * Math.sqrt(1 - P.e * P.e));   // AU²
          dAdt = area / (Treal / K.YR);                                   // AU²/yr
          areaFrac = Mm / (Math.PI * 2);
          curNu = Math.atan2(Math.sqrt(1 - P.e * P.e) * se, ce - P.e);

          // 速度方向（椭圆切线）
          var denom = 1 - P.e * ce;
          var dEx = -aU * se, dEz = bU * ce;                 // dP/dE
          var dEdt = omega / denom;
          var vx = dEx * dEdt, vz = dEz * dEdt;
          var vlen = Math.max(1e-6, Math.hypot(vx, vz));
          var vcirc = aU * (Math.PI * 2 / T0) * Math.pow(P.a, -1.5);   // 同 a 圆轨道的场景速率
          if (P.vec) {
            vArrow.set(px, 0.06, pz, vx / vlen, 0, vz / vlen,
              Math.max(0.5, Math.min(5.0, 2.0 * vlen / vcirc)));
          } else vArrow.setVisible(false);

          // 矢径
          var rp = rLine.geometry.attributes.position.array;
          rp[0] = 0; rp[1] = 0.02; rp[2] = 0;
          rp[3] = px; rp[4] = 0.02; rp[5] = pz;
          rLine.geometry.attributes.position.needsUpdate = true;

          // 扇形高亮
          sectorGroup.visible = !!P.sector;
          if (P.sector) {
            var act = Math.floor(Mm / (Math.PI * 2 / KSEG)) % KSEG;
            for (var s = 0; s < sectors.length; s++) {
              sectors[s].material.opacity = (s === act) ? 0.34 : 0.09;
            }
          }

          // 拖尾
          lastTrail += dt;
          if (lastTrail > 0.02) { lastTrail = 0; tr.push(px, 0, pz); }

          // 多行星
          multi.visible = !!P.multi;
          if (P.multi) {
            for (var i = 0; i < multiItems.length; i++) {
              var it = multiItems[i];
              var ang = M * it.rate;
              it.dot.position.set(Math.cos(ang) * it.a, 0, Math.sin(ang) * it.a);
              it.lb.position.set(Math.cos(ang) * it.a, 0.55, Math.sin(ang) * it.a);
            }
          }

          tick++;
          if (tick % 6 === 0) {
            c1.setRows([
              ['半长轴 a', GRAV.fix(P.a, 2) + ' AU'],
              ['离心率 e', GRAV.fix(P.e, 2)],
              ['近日距 / 远日距', GRAV.fix(P.a * (1 - P.e), 2) + ' / ' + GRAV.fix(P.a * (1 + P.e), 2) + ' AU']
            ]);
            c2.setRows([
              ['当前矢径 r', GRAV.fix(curR, 3) + ' AU'],
              ['当前速率 v', GRAV.fix(curV / 1000, 2) + ' km/s'],
              ['dA/dt = πab/T', GRAV.fix(dAdt, 3) + ' AU²/yr']
            ]);
            c3.setRows([
              ['当前周期 T', GRAV.dur(Treal)],
              ['T² / a³', GRAV.fix(Math.pow(Treal / K.YR, 2) / Math.pow(P.a, 3), 4) + ' yr²/AU³']
            ]);
            if (c3.plot) c3.plot.redraw();
          }
        },
        setParam: function (key) {
          if (key === 'e' || key === 'a') buildShape();
        },
        dispose: function () { }
      };
    }
  });

})(window);
