/**
 * ② 双星互绕：两颗恒星绕共同质心沿椭圆运行
 *
 * 用真实二体开普勒解（解开普勒方程得 E → r,ν），力箭头长度 ∝ F = Gm₁m₂/r²，
 * 右下小窗给出 F–r 曲线与当前工作点。时间加速 5.6×10⁶ 倍（1 场景秒 ≈ 65 天）。
 */
(function (global) {
  'use strict';

  var GRAV = global.HL.GRAV;
  var K = GRAV.K;
  var PFX = 'bin_';
  function C(o) { o.key = PFX + o.key; return o; }

  var UPA = 2.0;            // 1 AU = 2 场景单位
  var ACC = 5.6e6;          // 时间加速倍数

  function solveKepler(M, e) {
    var E = M, i;
    for (i = 0; i < 8; i++) {
      var d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= d;
      if (Math.abs(d) < 1e-10) break;
    }
    return E;
  }

  GRAV.registerSub({
    id: 'binary',
    name: '双星互绕',
    tab: '② 双星互绕',
    desc: '两颗恒星绕共同质心跳一支引力之舞',
    tour: [
      {
        t: '绕着"共同质心"跳舞',
        d: '双星系统里没有谁绕着谁——两颗星各自绕同一个质心旋转，质量相等时两条轨道互为镜像。青色十字标记的就是质心。',
        exp: '注意两颗星永远处于质心两侧的对角位置。',
        pulse: [0, 0, 0],
        cam: [[0, 6.5, 11], [0, 0, 0]]
      },
      {
        t: 'F = Gm₁m₂ / r²',
        d: '两星间的引力与间距平方成反比：靠得最近的时刻受力最大，白色箭头的长度就是它的实时大小——方向沿连线、作用力与反作用力等大反向。',
        exp: '留意力箭头的长度随轨道周期呼吸式伸缩。',
        cam: [[4, 4, 7], [0, 0, 0]]
      },
      {
        t: 'F–r 曲线小窗',
        d: 'HUD 下方的小窗画出 1/r² 曲线，游标是当前状态。双星每转一圈，受力就沿曲线往返扫过一次。',
        exp: '把离心率 e 调大，看游标在曲线上的扫动范围明显变宽。'
      },
      {
        t: '轨道周期与总质量',
        d: 'T² = 4π²a³ / G(m₁+m₂)：总质量翻倍，周期缩为 1/√2。本例 a=1 AU、两星各 1 M☉，T ≈ 258 天。',
        exp: '把 m₂ 拉到 3 M☉，观察周期变短、m₁ 的轨道半径变大。'
      },
      {
        t: '质心偏移实验',
        d: 'm₁ : m₂ = 2 : 1 时质心不再居中——质量大的星走小圈、质量小的星走大圈，但两者始终分居质心两侧。',
        exp: '把 m₁ 拉到 3，观察橙色轨道膨胀、蓝色轨道收缩。',
        cam: [[0, 6.5, 11], [0, 0, 0]]
      }
    ],
    view: [[0, 7.5, 12], [-1.6, 0, 0]],
    defaults: {
      m1: 1.0, m2: 1.0, a: 1.0, e: 0.25,
      speed: 1.0, force: true, trail: true, bary: true
    },
    controls: [
      C({ type: 'range', key: 'm1', label: '主星质量 m₁', min: 0.2, max: 8, step: 0.1, value: 1, unit: ' M☉' }),
      C({ type: 'range', key: 'm2', label: '伴星质量 m₂', min: 0.2, max: 8, step: 0.1, value: 1, unit: ' M☉' }),
      C({ type: 'range', key: 'a', label: '半长轴 a', min: 0.4, max: 4.0, step: 0.05, value: 1, unit: ' AU' }),
      C({ type: 'range', key: 'e', label: '离心率 e', min: 0, max: 0.70, step: 0.01, value: 0.25 }),
      C({ type: 'range', key: 'speed', label: '时间流速', min: 0, max: 3, step: 0.05, value: 1, unit: '×' }),
      C({ type: 'check', key: 'force', label: '实时受力箭头', value: true }),
      C({ type: 'check', key: 'trail', label: '粒子拖尾', value: true }),
      C({ type: 'check', key: 'bary', label: '质心标记', value: true }),
      {
        type: 'legend', items: [
          ['主星 m₁', '#5aa9ff'],
          ['伴星 m₂', '#ffa64d'],
          ['万有引力 F', '#ff5b7f'],
          ['质心', '#7cf0d0']
        ]
      }
    ],

    init: function (api) {
      var THREE = api.THREE, G = api.group, P = api.P, hud = api.hud;

      G.add(api.stars(1700, 900, 1.6));

      /* ---------- 天体 ---------- */
      var b1 = GRAV.body(THREE, { r: 1, color: 0x2f6fd0, rim: 0x7fc4ff, haloScale: 5.4 });
      var b2 = GRAV.body(THREE, { r: 1, color: 0xd06a1f, rim: 0xffc06b, haloScale: 5.4 });
      G.add(b1); G.add(b2);

      var l1 = GRAV.label(THREE, 'm₁', { color: '#9fd8ff', scale: 0.95, size: 52 });
      var l2 = GRAV.label(THREE, 'm₂', { color: '#ffd79a', scale: 0.95, size: 52 });
      G.add(l1); G.add(l2);

      var tr1 = GRAV.trail(THREE, 210, 0x5aa9ff, 0.17);
      var tr2 = GRAV.trail(THREE, 210, 0xffa64d, 0.17);
      G.add(tr1.obj); G.add(tr2.obj);

      /* ---------- 轨道 ---------- */
      var o1 = null, o2 = null;
      function buildOrbits() {
        var Mt = P.m1 + P.m2;
        var a1 = P.a * (P.m2 / Mt) * UPA;
        var a2 = P.a * (P.m1 / Mt) * UPA;
        var b1s = a1 * Math.sqrt(1 - P.e * P.e);
        var b2s = a2 * Math.sqrt(1 - P.e * P.e);
        var pts1 = [], pts2 = [], i, N = 140;
        for (i = 0; i <= N; i++) {
          var E = i / N * Math.PI * 2;
          var ce = Math.cos(E), se = Math.sin(E);
          pts1.push(new THREE.Vector3(a1 * (ce - P.e), 0, b1s * se));
          pts2.push(new THREE.Vector3(-a2 * (ce - P.e), 0, -b2s * se));
        }
        if (o1) { G.remove(o1); o1.geometry.dispose(); o1.material.dispose(); }
        if (o2) { G.remove(o2); o2.geometry.dispose(); o2.material.dispose(); }
        o1 = GRAV.tube(THREE, pts1, 0x5aa9ff, 0.030, 0.55, true, 200);
        o2 = GRAV.tube(THREE, pts2, 0xffa64d, 0.030, 0.55, true, 200);
        G.add(o1); G.add(o2);

        b1.scale.setScalar(0.55 * Math.pow(P.m1, 1 / 3));
        b2.scale.setScalar(0.55 * Math.pow(P.m2, 1 / 3));
      }
      buildOrbits();

      /* ---------- 质心标记 ---------- */
      var bary = new THREE.Group();
      var cross = [];
      for (var ci = 0; ci < 2; ci++) {
        var g2 = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(ci ? -0.55 : 0, 0, ci ? 0 : -0.55),
          new THREE.Vector3(ci ? 0.55 : 0, 0, ci ? 0 : 0.55)
        ]);
        var ln = new THREE.Line(g2, new THREE.LineBasicMaterial({
          color: 0x7cf0d0, transparent: true, opacity: 0.85,
          blending: THREE.AdditiveBlending, depthWrite: false
        }));
        cross.push(ln); bary.add(ln);
      }
      bary.add(GRAV.ring(THREE, 0.34, 0x7cf0d0, 0.020, 0.6));
      bary.rotation.x = 0;
      G.add(bary);
      var baryLabel = GRAV.label(THREE, '质心', { color: '#7cf0d0', scale: 0.8, size: 44 });
      baryLabel.position.set(0, -0.85, 0);
      G.add(baryLabel);

      /* ---------- 力箭头 ---------- */
      var fa1 = GRAV.arrow(THREE, 0xff5b7f, 0.05, 0.40);
      var fa2 = GRAV.arrow(THREE, 0xff5b7f, 0.05, 0.40);
      G.add(fa1.group); G.add(fa2.group);

      /* ---------- HUD ---------- */
      var c1 = hud.card({
        title: '万有引力', accent: GRAV.CSS.rose,
        tex: 'F = G\\,\\frac{m_1 m_2}{r^{2}}',
        note: '箭头长度正比于 F（超出显示范围会截断）。m₁、m₂ 受到的力大小相等、方向相反。',
        rows: [['当前间距 r', '—'], ['引力 F', '—'], ['相对速度', '—']]
      });
      var c2 = hud.card({
        title: '二体运动', accent: GRAV.CSS.cyan,
        tex: '\\omega^{2}=\\frac{G(m_1+m_2)}{a^{3}},\\qquad T=2\\pi\\sqrt{\\frac{a^{3}}{G(m_1+m_2)}}',
        note: '时间已加速 5.6×10⁶ 倍（1 秒 ≈ 65 天）。两星周期相同，始终位于质心两侧。',
        rows: [['轨道周期 T', '—'], ['轨道半径 r₁ / r₂', '—'], ['速率 v₁ / v₂', '—']]
      });
      var c3 = hud.card({
        title: 'F – r 曲线', accent: GRAV.CSS.gold,
        note: '平方反比：r 翻倍，F 掉到 1/4。红点为当前工作点。',
        plot: {
          w: 300, h: 116, draw: function (c, w, h) {
            var pad = 26, x0 = pad, x1 = w - 10, y0 = h - 18, y1 = 8;
            var rMin = 0.30, rMax = 4.20;
            var Fref = K.G * (P.m1 * K.MSUN) * (P.m2 * K.MSUN) / Math.pow(rMin * K.AU, 2);
            var FrefTxt = GRAV.sci(Fref, 2);
            // 坐标轴
            c.strokeStyle = 'rgba(120,180,255,.28)'; c.lineWidth = 1;
            c.beginPath(); c.moveTo(x0, y1); c.lineTo(x0, y0); c.lineTo(x1, y0); c.stroke();
            c.fillStyle = 'rgba(143,163,189,.9)'; c.font = '9px "Microsoft YaHei",sans-serif';
            c.textAlign = 'center';
            c.fillText('r (AU)', (x0 + x1) / 2, h - 4);
            c.textAlign = 'right';
            c.fillText('0', x0 - 3, y0 + 3);
            c.save(); c.translate(9, (y0 + y1) / 2); c.rotate(-Math.PI / 2);
            c.textAlign = 'center'; c.fillText('F (N)', 0, 0); c.restore();
            c.textAlign = 'left'; c.fillText(FrefTxt, x0 + 3, y1 + 9);

            // 曲线
            c.strokeStyle = '#ffcf6b'; c.lineWidth = 1.6; c.beginPath();
            for (var i = 0; i <= 120; i++) {
              var r = rMin + (rMax - rMin) * i / 120;
              var f = Math.pow(rMin / r, 2);
              var px = x0 + (x1 - x0) * (r - rMin) / (rMax - rMin);
              var py = y0 - (y0 - y1) * f;
              if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
            }
            c.stroke();

            // 当前点
            var rc = curR;
            if (rc > rMin && rc < rMax) {
              var f2 = Math.pow(rMin / rc, 2);
              var cx = x0 + (x1 - x0) * (rc - rMin) / (rMax - rMin);
              var cy = y0 - (y0 - y1) * f2;
              c.strokeStyle = 'rgba(255,91,127,.55)'; c.setLineDash([3, 3]); c.lineWidth = 1;
              c.beginPath(); c.moveTo(cx, y0); c.lineTo(cx, cy); c.lineTo(x0, cy); c.stroke();
              c.setLineDash([]);
              c.fillStyle = '#ff5b7f';
              c.beginPath(); c.arc(cx, cy, 3.6, 0, Math.PI * 2); c.fill();
              c.fillStyle = '#ffd0da'; c.textAlign = 'center';
              c.fillText(GRAV.fix(rc, 2) + ' AU', cx, y0 + 11);
            }
          }
        }
      });

      /* ---------- 状态 ---------- */
      var Mt = 0, omega = 0, tAcc = 0, curR = 1, curF = 0, curV = 0, tick = 0;
      var p1 = new THREE.Vector3(), p2 = new THREE.Vector3();

      function refreshOrbit() {
        Mt = P.m1 + P.m2;
        var aReal = P.a * K.AU;
        omega = Math.sqrt(K.G * Mt * K.MSUN / (aReal * aReal * aReal)) * ACC;
        buildOrbits();
      }
      refreshOrbit();

      return {
        update: function (dt, t) {
          tAcc += Math.min(dt, 0.05) * P.speed;
          var Me = omega * tAcc;
          var E = solveKepler(Me % (Math.PI * 2), P.e);
          var ce = Math.cos(E), se = Math.sin(E);
          var a1u = P.a * (P.m2 / Mt) * UPA;
          var a2u = P.a * (P.m1 / Mt) * UPA;
          var b1u = a1u * Math.sqrt(1 - P.e * P.e);
          var b2u = a2u * Math.sqrt(1 - P.e * P.e);

          p1.set(a1u * (ce - P.e), 0, b1u * se);
          p2.set(-a2u * (ce - P.e), 0, -b2u * se);
          b1.position.copy(p1);
          b2.position.copy(p2);
          l1.position.set(p1.x, p1.y + 0.95 * 0.55 * Math.pow(P.m1, 1 / 3) + 0.5, p1.z);
          l2.position.set(p2.x, p2.y + 0.95 * 0.55 * Math.pow(P.m2, 1 / 3) + 0.5, p2.z);
          tr1.push(p1.x, p1.y, p1.z);
          tr2.push(p2.x, p2.y, p2.z);
          tr1.obj.visible = tr2.obj.visible = !!P.trail;

          b1.userData.wire.rotation.y += dt * 0.2;
          b2.userData.wire.rotation.y -= dt * 0.2;

          // 真实物理量
          curR = P.a * (1 - P.e * ce);                       // AU
          var rReal = curR * K.AU;
          curF = K.G * (P.m1 * K.MSUN) * (P.m2 * K.MSUN) / (rReal * rReal);
          var mu = K.G * Mt * K.MSUN;
          curV = Math.sqrt(mu * (2 / rReal - 1 / (P.a * K.AU)));

          // 箭头：长度 ∝ F，以「当前质量在 1 AU 处的力」为基准
          var Fbase = K.G * (P.m1 * K.MSUN) * (P.m2 * K.MSUN) / (K.AU * K.AU);
          var len = Math.max(0.35, Math.min(6.5, 2.2 * curF / Fbase));
          var dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
          var L = Math.max(1e-6, Math.hypot(dx, dy, dz));
          if (P.force) {
            fa1.set(p1.x, p1.y, p1.z, dx / L, dy / L, dz / L, len);
            fa2.set(p2.x, p2.y, p2.z, -dx / L, -dy / L, -dz / L, len);
          } else {
            fa1.setVisible(false); fa2.setVisible(false);
          }

          bary.visible = !!P.bary;
          baryLabel.visible = !!P.bary;

          tick++;
          if (tick % 6 === 0) {
            var Treal = 2 * Math.PI * Math.sqrt(Math.pow(P.a * K.AU, 3) / (K.G * Mt * K.MSUN));
            var v1 = curV * (P.m2 / Mt), v2 = curV * (P.m1 / Mt);
            c1.setRows([
              ['当前间距 r', GRAV.fix(curR, 3) + ' AU'],
              ['引力 F', GRAV.sci(curF, 2) + ' N'],
              ['相对速度', GRAV.fix(curV / 1000, 1) + ' km/s']
            ]);
            c2.setRows([
              ['轨道周期 T', GRAV.dur(Treal)],
              ['轨道半径 r₁ / r₂', GRAV.fix(P.a * P.m2 / Mt, 2) + ' / ' + GRAV.fix(P.a * P.m1 / Mt, 2) + ' AU'],
              ['速率 v₁ / v₂', GRAV.fix(v1 / 1000, 1) + ' / ' + GRAV.fix(v2 / 1000, 1) + ' km/s']
            ]);
            if (c3.plot) c3.plot.redraw();
          }
        },
        setParam: function (key) {
          if (key === 'm1' || key === 'm2' || key === 'a' || key === 'e') refreshOrbit();
        },
        dispose: function () { }
      };
    }
  });

})(window);
