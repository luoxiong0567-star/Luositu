/**
 * ① 时空织物：质量把一张网格压成井，小球沿井壁滚动（测地线的橡胶膜类比）
 *
 * 高度取软化牛顿势  z = −D / sqrt(r² + b²)，远场像 −1/r。
 * 这不是严格的弗拉姆嵌入面，只把「质量让几何弯曲」画成能摸到的形状。
 */
(function (global) {
  'use strict';

  var ST = global.HL.ST;
  var GRAV = global.HL.GRAV;
  var PFX = 'well_';
  function C(o) { o.key = PFX + o.key; return o; }

  var RG = 14;
  var N = 34;

  ST.registerSub({
    id: 'well',
    name: '时空织物',
    tab: '① 织物',
    desc: '质量把时空网格压成一口井，小球沿井壁滚动',
    view: [[13, 6.2, 15], [0, -3.6, 0]],
    defaults: { M: 1.2, v: 1.0, damp: 0.08, speed: 1, grid: true, newton: false },
    controls: [
      C({ type: 'range', key: 'M', label: '质量 M', min: 0.3, max: 4.5, step: 0.1, value: 1.2, unit: ' M☉' }),
      C({ type: 'range', key: 'v', label: '抛入速度', min: 0.35, max: 1.7, step: 0.05, value: 1, unit: '×' }),
      C({ type: 'range', key: 'damp', label: '耗散（螺旋坠入）', min: 0, max: 0.45, step: 0.01, value: 0.08 }),
      C({ type: 'range', key: 'speed', label: '时间流速', min: 0, max: 2.2, step: 0.05, value: 1, unit: '×' }),
      C({ type: 'button', key: 'launch', label: '⟳ 重新抛入' }),
      C({ type: 'check', key: 'grid', label: '半透明织物', value: true }),
      C({ type: 'check', key: 'newton', label: '牛顿对照：拉力箭头', value: false }),
      {
        type: 'legend', items: [
          ['时空网格（越深越紫）', '#b98cff'],
          ['质量', '#ffcf6b'],
          ['测地线小球', '#4de2ff'],
          ['牛顿拉力', '#ff5b7f']
        ]
      }
    ],

    init: function (api) {
      var THREE = api.THREE, G = api.group, P = api.P, hud = api.hud;
      G.add(api.stars(1400, 820, 1.55));

      function shape() {
        // 视觉上故意挖深，侧面才看得出「一口井」，不是科研嵌入面的比例
        return { depth: 7.4 * Math.pow(P.M, 0.82) + 0.6, b: 3.15 };
      }
      function h(x, z) {
        var s = shape();
        var r2 = x * x + z * z;
        return -s.depth * s.b / Math.sqrt(r2 + s.b * s.b);
      }

      /* ---------- 半透明织物 ---------- */
      var plane = new THREE.PlaneGeometry(RG * 2, RG * 2, 52, 52);
      var sheet = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({
        color: 0x1a3c62, transparent: true, opacity: 0.42, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending
      }));
      sheet.rotation.x = -Math.PI / 2;
      G.add(sheet);

      /* ---------- 网格线 ---------- */
      var segPerLine = N;
      var lineVerts = 2 * (N + 1) * segPerLine * 2;
      var lp = new Float32Array(lineVerts * 3);
      var lc = new Float32Array(lineVerts * 3);
      var lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
      lineGeo.setAttribute('color', new THREE.BufferAttribute(lc, 3));
      var gridLines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.78,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      gridLines.frustumCulled = false;
      G.add(gridLines);

      var cShallow = new THREE.Color(0x4de2ff);
      var cDeep = new THREE.Color(0xb98cff);
      var tmpC = new THREE.Color();

      var mass = GRAV.body(THREE, {
        r: 0.72, color: 0x3a2414, rim: 0xffcf6b, opacity: 0.96,
        wireOpacity: 0.28, haloScale: 5.4, power: 2.4
      });
      G.add(mass);

      var ball = GRAV.orb(THREE, 0.42, 0x7cf0d0, 5.4);
      G.add(ball);
      var tr = GRAV.trail(THREE, 280, 0x4de2ff, 0.16);
      G.add(tr.obj);

      var arrow = GRAV.arrow(THREE, 0xff5b7f, 0.045, 0.36);
      G.add(arrow.group);
      var newtonTag = api.label('牛顿  F = GMm/r²', { color: '#ffb3c4', scale: 0.85, size: 42 });
      newtonTag.visible = false;
      G.add(newtonTag);

      var x = 9, z = 1.2, vx = 0, vz = 1.6;

      function placeBall() {
        var y = h(x, z) + 0.26;
        ball.position.set(x, y, z);
        return y;
      }

      function launch() {
        var ang = Math.random() * Math.PI * 2;
        var r0 = 5.4 + Math.random() * 1.6;
        x = Math.cos(ang) * r0;
        z = Math.sin(ang) * r0;
        var sp = (1.55 + 0.35 * P.M) * P.v;
        vx = -Math.sin(ang) * sp;
        vz = Math.cos(ang) * sp;
        var y = placeBall();
        tr.reset(x, y, z);
      }

      function rebuild() {
        var pos = plane.attributes.position.array;
        var i, n = pos.length;
        for (i = 0; i < n; i += 3) {
          var wx = pos[i], wz = -pos[i + 1];
          pos[i + 2] = h(wx, wz);
        }
        plane.attributes.position.needsUpdate = true;
        plane.computeBoundingSphere();

        var depth = Math.abs(h(0, 0));
        var k = 0;
        function put(px, py, pz) {
          lp[k * 3] = px; lp[k * 3 + 1] = py; lp[k * 3 + 2] = pz;
          var f = Math.min(1, Math.abs(py) / Math.max(depth, 0.001));
          tmpC.copy(cShallow).lerp(cDeep, Math.pow(f, 0.72));
          lc[k * 3] = tmpC.r; lc[k * 3 + 1] = tmpC.g; lc[k * 3 + 2] = tmpC.b;
          k++;
        }
        var a, b, t1, t2, c1, c2;
        for (a = 0; a <= N; a++) {
          var gx = -RG + (2 * RG) * a / N;
          for (b = 0; b < N; b++) {
            t1 = -RG + (2 * RG) * b / N;
            t2 = -RG + (2 * RG) * (b + 1) / N;
            put(gx, h(gx, t1), t1);
            put(gx, h(gx, t2), t2);
          }
        }
        for (b = 0; b <= N; b++) {
          var gz = -RG + (2 * RG) * b / N;
          for (a = 0; a < N; a++) {
            c1 = -RG + (2 * RG) * a / N;
            c2 = -RG + (2 * RG) * (a + 1) / N;
            put(c1, h(c1, gz), gz);
            put(c2, h(c2, gz), gz);
          }
        }
        lineGeo.attributes.position.needsUpdate = true;
        lineGeo.attributes.color.needsUpdate = true;
        lineGeo.computeBoundingSphere();

        var s = 0.62 + 0.12 * Math.pow(P.M, 0.45);
        mass.scale.setScalar(s);
        mass.position.set(0, h(0, 0) + s * 0.35, 0);
      }

      var card = hud.card({
        title: '爱因斯坦场方程',
        accent: GRAV.CSS.violet,
        badge: '几何',
        tex: 'G_{\\mu\\nu}=\\dfrac{8\\pi G}{c^{4}}T_{\\mu\\nu}',
        note: '左边是时空怎么弯，右边是质量与能量。下面的橡胶膜是软化势 z = −D / √(r²+b²)，帮你看见井，不是严格的史瓦西嵌入。',
        rows: [['质量 M', '—'], ['井深', '—'], ['史瓦西半径', '—'], ['小球距质量', '—']]
      });
      var profile = hud.card({
        title: '这口井的剖面',
        accent: GRAV.CSS.cyan,
        badge: '类比',
        tex: 'z(r)=-\\dfrac{D}{\\sqrt{r^{2}+b^{2}}}',
        note: '远看像 −1/r。勾选牛顿对照时，玫红箭头只标出拉力的方向：弱场、慢速下，它和测地线是同一条轨道。',
        plot: {
          w: 300, h: 112,
          draw: function (ctx, w, hgt) {
            ctx.fillStyle = 'rgba(6,10,18,0.2)';
            ctx.fillRect(0, 0, w, hgt);
            var s = shape();
            ctx.beginPath();
            var i2, steps = 72, midY = 0;
            for (i2 = 0; i2 <= steps; i2++) {
              var t = i2 / steps;
              var rr = (t - 0.5) * 2 * RG;
              var zz = -s.depth * s.b / Math.sqrt(rr * rr + s.b * s.b);
              var norm = (zz + s.depth) / Math.max(s.depth, 0.001);
              var px = 16 + (w - 32) * t;
              var py = 14 + (1 - norm) * (hgt - 30);
              if (i2 === steps / 2) midY = py;
              if (i2 === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.strokeStyle = '#b98cff';
            ctx.lineWidth = 1.6;
            ctx.stroke();
            ctx.fillStyle = '#ffcf6b';
            ctx.beginPath();
            ctx.arc(w / 2, midY, 4.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });

      rebuild();
      launch();
      if (api.setNote) api.setNote('拖动质量看织物下陷。勾选「牛顿对照」，玫红箭头是 F = GMm/r² 的方向。');

      var rsSunKm = 2 * GRAV.K.G * GRAV.K.MSUN / (299792458 * 299792458) / 1000;

      return {
        update: function (dt) {
          var raw = dt;
          if (!(raw > 0 && raw < 0.5)) raw = 0.016;
          var step = Math.min(0.05, raw) * (P.speed > 0 ? P.speed : 0);
          if (step > 0) {
            var sub = Math.max(1, Math.ceil(step / 0.016));
            var hdt = step / sub;
            var s;
            for (s = 0; s < sub; s++) {
              var e = 0.18;
              var ax = -(h(x + e, z) - h(x - e, z)) / (2 * e);
              var az = -(h(x, z + e) - h(x, z - e)) / (2 * e);
              var k = 3.5;
              vx += k * ax * hdt;
              vz += k * az * hdt;
              var damp = Math.exp(-P.damp * 1.4 * hdt);
              vx *= damp; vz *= damp;
              x += vx * hdt; z += vz * hdt;
              var r = Math.sqrt(x * x + z * z) || 0.001;
              if (r < 0.95) { launch(); break; }
              if (r > RG - 0.6) {
                var ux = x / r, uz = z / r;
                var vr = vx * ux + vz * uz;
                if (vr > 0) { vx -= ux * vr * 1.4; vz -= uz * vr * 1.4; }
                x = ux * (RG - 0.65); z = uz * (RG - 0.65);
              }
            }
          }
          var y = placeBall();
          tr.push(x, y, z);
          sheet.visible = P.grid !== false;
          gridLines.visible = P.grid !== false;

          var rnow = Math.sqrt(x * x + z * z) || 0.001;
          if (P.newton) {
            var len = Math.min(4.2, 7.2 / rnow);
            arrow.set(x, y + 0.35, z, -x / rnow, -0.15, -z / rnow, len);
            newtonTag.visible = true;
            newtonTag.position.set(x - x / rnow * (len + 0.8), y + 1.15, z - z / rnow * (len + 0.8));
          } else {
            arrow.setVisible(false);
            newtonTag.visible = false;
          }

          card.setRows([
            ['质量 M', GRAV.fix(P.M, 1) + ' M☉'],
            ['井心深度', GRAV.fix(Math.abs(h(0, 0)), 2) + ' 格'],
            ['史瓦西半径', GRAV.fix(rsSunKm * P.M, 2) + ' km'],
            ['小球距质量', GRAV.fix(rnow, 2) + ' 格']
          ]);
          if (profile.plot) profile.plot.redraw();
        },
        setParam: function (key) {
          if (key === 'M' || key === 'grid') rebuild();
          if (key === 'launch') launch();
          if (key === 'v') {
            var r = Math.sqrt(x * x + z * z) || 1;
            var tx = -z / r, tz = x / r;
            var sp = (1.55 + 0.35 * P.M) * P.v;
            vx = tx * sp;
            vz = tz * sp;
          }
        }
      };
    }
  });

})(window);
