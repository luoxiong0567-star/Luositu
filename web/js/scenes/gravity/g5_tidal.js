/**
 * ⑤ 潮汐力：地球–月球的双侧水壳隆起 / 黑洞把恒星拉成面条
 *
 * 潮汐加速度 a_t ≈ 2GMR/r³ —— 它不是引力本身，而是引力的「差」，
 * 所以按 1/r³ 衰减。判据 χ = a_t / g_self ≥ 1 即越过洛希极限被撕裂。
 */
(function (global) {
  'use strict';

  var GRAV = global.HL.GRAV;
  var K = GRAV.K;
  var PFX = 'tid_';
  function C(o) { o.key = PFX + o.key; return o; }

  var TIDE_VS = [
    'uniform vec3 uDir; uniform float uAmp;',
    'varying vec3 vN; varying vec3 vV; varying float vP2;',
    'void main(){',
    '  vec3 n = normalize(position);',
    '  float c = dot(n, uDir);',
    '  float p2 = 0.5 * (3.0 * c * c - 1.0);',
    '  vP2 = p2;',
    '  vec3 p = position * (1.0 + uAmp * p2);',
    '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
    '  vN = normalize(normalMatrix * n);',
    '  vV = normalize(-mv.xyz);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var TIDE_FS = [
    'uniform vec3 uCore; uniform vec3 uRim; uniform float uOpacity;',
    'varying vec3 vN; varying vec3 vV; varying float vP2;',
    'void main(){',
    '  float f = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.0);',
    '  vec3 col = mix(uCore * 0.35, uRim, f) + uRim * f * 0.55;',
    '  col += vec3(0.10, 0.42, 0.62) * max(vP2, 0.0) * 0.85;',
    '  gl_FragColor = vec4(col, uOpacity * (0.30 + 0.70 * f));',
    '}'
  ].join('\n');

  GRAV.registerSub({
    id: 'tidal',
    name: '潮汐力',
    tab: '⑤ 潮汐力',
    desc: '双侧隆起的水壳，以及被拉成面条的恒星',
    tour: [
      {
        t: '为什么每天有两次潮汐',
        d: '月球引力把海水拉向月球，但"差分效应"让背月面也鼓起一个包——所以地球上同时存在近月、远月两个潮峰，一天约两次高潮。',
        exp: '看地球两侧的水壳隆起如何始终指向/背向月球。',
        pulse: [0, 0, 0],
        cam: [[0, 8, 13], [0, 0, 0]]
      },
      {
        t: '潮汐力 ∝ 1/r³',
        d: '潮汐是"引力之差"：a_t = 2GM·R/d³，比引力本身多衰减两次方。月球质量虽只有太阳 1/2700 万，却因足够近而主导地球潮汐。',
        exp: '读 HUD 的 a_t / g ≈ 3.3×10⁻⁵——这正是平衡潮只有半米量级的原因。'
      },
      {
        t: '潮汐摩擦与月球远离',
        d: '地球自转把潮峰带偏约 12°（滞后角）。这个偏角的引力扭矩一面让地球自转变慢（每世纪约 +1.8 ms），一面把月球每年推远 3.8 厘米。',
        exp: '想象 3 亿年前的地球：一天只有约 22 小时。'
      },
      {
        t: '黑洞的"面条化"',
        d: '切换到黑洞视图：落向黑洞的恒星近端受力远大于远端，潮汐差把它像面条一样拉长（spaghettification）。',
        exp: '已为你切换到黑洞模型：开启「自由下落」，看恒星越过洛希极限（红环）后被撕成碎块链。',
        apply: function () { P.mode = 'blackhole'; if (inst && inst.setParam) inst.setParam('mode', 'blackhole'); },
        cam: [[0, 10, 17], [1.5, 0, 0]]
      },
      {
        t: '洛希极限：生死线',
        d: '距离小于约 2.4 倍主星半径（对流体天体）时，潮汐力超过天体自引力，任何天体都会解体——红色圆环就是这条生死线，土星环就在土星的洛希极限内。',
        exp: '把「距离 d / 落点」拉到极限附近，观察碎块环的形成。',
        cam: [[0, 10, 17], [1.5, 0, 0]]
      }
    ],
    view: [[0, 12, 26], [-1.5, 0, 0]],
    defaults: {
      mode: 'earth', d: 3.84, lag: 12, field: true,
      lm: 6.0, rr: 2.4, fall: false, speed: 1.0
    },
    controls: [
      C({
        type: 'buttons', key: 'mode', label: '模型', value: 'earth', options: [
          { label: '地球–月球', value: 'earth' },
          { label: '黑洞面条化', value: 'blackhole' }
        ]
      }),
      C({ type: 'range', key: 'd', label: '地月距离 d', min: 1.5, max: 12, step: 0.05, value: 3.84, unit: ' ×10⁵ km' }),
      C({ type: 'range', key: 'lag', label: '隆起滞后角 α', min: 0, max: 45, step: 1, value: 12, unit: '°' }),
      C({ type: 'range', key: 'lm', label: '黑洞质量 log₁₀(M/M☉)', min: 1, max: 8, step: 0.1, value: 6 }),
      C({ type: 'range', key: 'rr', label: '恒星距离 r / r_t', min: 0.30, max: 5.0, step: 0.05, value: 2.4 }),
      C({ type: 'check', key: 'fall', label: '恒星自由下落', value: false }),
      C({ type: 'check', key: 'field', label: '潮汐力场箭头', value: true }),
      C({ type: 'range', key: 'speed', label: '时间流速', min: 0, max: 2.5, step: 0.05, value: 1, unit: '×' }),
      {
        type: 'legend', items: [
          ['地球 / 水壳', '#5aa9ff'],
          ['月球', '#ffcf6b'],
          ['潮汐力场', '#ff5b7f'],
          ['黑洞 / 视界', '#b98cff'],
          ['恒星', '#ffd98a']
        ]
      }
    ],

    init: function (api) {
      var THREE = api.THREE, G = api.group, P = api.P, hud = api.hud;

      G.add(api.stars(1700, 900, 1.6));

      /* ================= 地球–月球 ================= */
      var eg = new THREE.Group();
      G.add(eg);

      var earth = GRAV.body(THREE, { r: 0.92, color: 0x1d4f8a, rim: 0x6fc0ff, halo: false, opacity: 0.95 });
      eg.add(earth);

      var oceanMat = new THREE.ShaderMaterial({
        uniforms: {
          uDir: { value: new THREE.Vector3(1, 0, 0) },
          uAmp: { value: 0.10 },
          uCore: { value: new THREE.Color(0x0d3f6b) },
          uRim: { value: new THREE.Color(0x7fe0ff) },
          uOpacity: { value: 0.85 }
        },
        vertexShader: TIDE_VS, fragmentShader: TIDE_FS,
        transparent: true, depthWrite: false, side: THREE.DoubleSide
      });
      var ocean = new THREE.Mesh(new THREE.SphereGeometry(1.0, 64, 40), oceanMat);
      eg.add(ocean);

      var moon = GRAV.body(THREE, { r: 0.30, color: 0x8a8f9c, rim: 0xffcf6b, haloScale: 4.6 });
      eg.add(moon);
      var moonLb = GRAV.label(THREE, '月球', { color: '#ffe0a8', scale: 0.72, size: 42 });
      eg.add(moonLb);
      var earthLb = GRAV.label(THREE, '地球', { color: '#9fd8ff', scale: 0.72, size: 42 });
      earthLb.position.set(0, -1.5, 0);
      eg.add(earthLb);

      var moonOrbit = GRAV.ring(THREE, 8, 0xffcf6b, 0.018, 0.30);
      eg.add(moonOrbit);

      // 双侧隆起标记
      var bulgeA = GRAV.ring(THREE, 0.16, 0x7cf0d0, 0.016, 0.95);
      var bulgeB = GRAV.ring(THREE, 0.16, 0x7cf0d0, 0.016, 0.95);
      eg.add(bulgeA); eg.add(bulgeB);
      var lbA = GRAV.label(THREE, '朝月隆起', { color: '#a8ffe0', scale: 0.6, size: 36 });
      var lbB = GRAV.label(THREE, '背月隆起', { color: '#a8ffe0', scale: 0.6, size: 36 });
      eg.add(lbA); eg.add(lbB);

      // 潮汐力场：8 个箭头
      var fieldArrows = [];
      for (var i = 0; i < 8; i++) {
        var ar = GRAV.arrow(THREE, 0xff5b7f, 0.038, 0.30);
        eg.add(ar.group);
        fieldArrows.push(ar);
      }

      /* ================= 黑洞 ================= */
      var bg = new THREE.Group();
      G.add(bg);

      var bhCore = new THREE.Mesh(new THREE.SphereGeometry(0.95, 36, 24),
        new THREE.MeshBasicMaterial({ color: 0x000000 }));
      bg.add(bhCore);
      var photon = GRAV.ring(THREE, 1.16, 0xffd0a0, 0.030, 0.95);
      bg.add(photon);
      var bhGlow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: GRAV.glowTexture(THREE, 'rgba(185,140,255,0.42)'),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
      }));
      bhGlow.scale.set(9, 9, 1);
      bg.add(bhGlow);
      var bhLb = GRAV.label(THREE, '黑洞', { color: '#d9c2ff', scale: 0.75, size: 42 });
      bhLb.position.set(0, -1.9, 0);
      bg.add(bhLb);

      var rocheRing = GRAV.ring(THREE, 4.0 + (1 - 0.30) * 2.6, 0xff5b7f, 0.022, 0.55);
      bg.add(rocheRing);
      var rocheLb = GRAV.label(THREE, '潮汐半径 r_t', { color: '#ff9db1', scale: 0.62, size: 38 });
      bg.add(rocheLb);

      var star = GRAV.body(THREE, { r: 0.85, color: 0xff8a2b, rim: 0xffd98a, haloScale: 5.0 });
      bg.add(star);
      var starLb = GRAV.label(THREE, '恒星', { color: '#ffe6b0', scale: 0.66, size: 40 });
      bg.add(starLb);

      // 面条化尾迹
      var noodle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.06, 1, 16, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xffa64d, transparent: true, opacity: 0.55,
          blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
        })
      );
      noodle.rotation.z = Math.PI / 2;    // 沿 X 轴
      bg.add(noodle);

      var dgA = GRAV.arrow(THREE, 0xff5b7f, 0.042, 0.32);
      var dgB = GRAV.arrow(THREE, 0xff5b7f, 0.042, 0.32);
      bg.add(dgA.group); bg.add(dgB.group);

      /* ================= HUD ================= */
      var curAt = 0, curRatio = 0, curState = '';
      var c1 = hud.card({
        title: '潮汐加速度', accent: GRAV.CSS.rose,
        tex: 'a_{\\rm tide}\\simeq\\frac{2GMR}{r^{3}}',
        note: '潮汐力是引力的「差」，所以按 1/r³ 衰减，比引力本身（1/r²）掉得快得多。',
        rows: [['潮汐加速度 a_t', '—'], ['中心引力 g', '—'], ['a_t / g', '—']]
      });
      var c2 = hud.card({
        title: '平衡潮 · 双侧隆起', accent: GRAV.CSS.cyan, badge: '',
        tex: '\\zeta(\\theta)=\\frac{M_m}{M_E}\\frac{R_E^{4}}{d^{3}}\\,P_2(\\cos\\theta),\\quad P_2=\\tfrac12(3\\cos^2\\theta-1)',
        note: 'P₂ 在朝月、背月方向同为 +1，所以两侧同时隆起 —— 一天两次高潮的原因。',
        rows: [['潮高 ζ（平衡潮）', '—'], ['地月距离 d', '—'], ['滞后角 α', '—']]
      });
      var c3 = hud.card({
        title: '潮汐力 – 距离', accent: GRAV.CSS.gold,
        note: '双对数坐标下斜率恒为 −3：距离减半，潮汐力变 8 倍。',
        rows: [['斜率', '−3 (∝ r⁻³)'], ['当前 a_t', '—']],
        plot: {
          w: 300, h: 116, draw: function (c, w, h) {
            var x0 = 32, x1 = w - 8, y0 = h - 18, y1 = 8;
            c.strokeStyle = 'rgba(120,180,255,.28)'; c.lineWidth = 1;
            c.beginPath(); c.moveTo(x0, y1); c.lineTo(x0, y0); c.lineTo(x1, y0); c.stroke();
            c.font = '9px "Microsoft YaHei",sans-serif'; c.fillStyle = 'rgba(143,163,189,.9)';
            c.textAlign = 'center'; c.fillText('log₁₀ r', (x0 + x1) / 2, h - 4);
            c.save(); c.translate(10, (y0 + y1) / 2); c.rotate(-Math.PI / 2);
            c.textAlign = 'center'; c.fillText('log₁₀ a_t', 0, 0); c.restore();

            var lo = -3, hi = 3;
            function X(v) { return x0 + (x1 - x0) * (v - lo) / (hi - lo); }
            function Y(v) { return y0 - (y0 - y1) * (v - lo) / (hi - lo); }
            c.strokeStyle = 'rgba(120,180,255,.14)';
            for (var g = lo; g <= hi; g++) {
              c.beginPath(); c.moveTo(X(g), y1); c.lineTo(X(g), y0); c.stroke();
            }
            // 参考曲线：a_t ∝ r^-3，锚定在当前工作点
            if (curAt > 0) {
              var lgA = Math.log10(curAt), lgR = curLogR;
              c.strokeStyle = '#ffcf6b'; c.lineWidth = 1.6; c.beginPath();
              for (var i = 0; i <= 60; i++) {
                var lr = lo + (hi - lo) * i / 60;
                var la = lgA - 3 * (lr - lgR);
                var px = X(lr), py = Y(Math.max(lo - 1, Math.min(hi + 1, la)));
                if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
              }
              c.stroke();
              c.fillStyle = '#ff5b7f';
              c.beginPath(); c.arc(X(lgR), Y(lgA), 4, 0, Math.PI * 2); c.fill();
            }
          }
        }
      });

      /* ================= 状态 ================= */
      var ang = 0, curLogR = 0, tick = 0, rrNow = P.rr;
      var moonDir = new THREE.Vector3(1, 0, 0);
      var bulgeDir = new THREE.Vector3(1, 0, 0);

      function sceneMoonDist() { return 2.2 + (P.d / 3.84) * 6.0; }

      function rebuildMoonOrbit() {
        var dm = sceneMoonDist();
        moonOrbit.geometry.dispose();
        moonOrbit.geometry = new THREE.TorusGeometry(dm, 0.018, 6, 160);
      }
      rebuildMoonOrbit();

      function applyMode() {
        var isEarth = (P.mode === 'earth');
        eg.visible = isEarth;
        bg.visible = !isEarth;
        if (isEarth) {
          c2.setTitle('平衡潮 · 双侧隆起');
          c2.setTex('\\zeta(\\theta)=\\frac{M_m}{M_E}\\frac{R_E^{4}}{d^{3}}\\,P_2(\\cos\\theta),\\quad P_2=\\tfrac12(3\\cos^2\\theta-1)');
          c2.setNote('P₂ 在朝月、背月方向同为 +1，所以两侧同时隆起 —— 一天两次高潮的原因。');
        } else {
          c2.setTitle('洛希极限 · 面条化');
          c2.setTex('r_t=R_*\\left(\\frac{M_{\\rm BH}}{M_*}\\right)^{1/3},\\qquad \\chi=\\frac{a_t}{g_*}\\ge1\\ \\Rightarrow\\ \\text{瓦解}');
          c2.setNote('越过 r_t 后潮汐差超过恒星自身引力，恒星被拉成细长的物质流。');
        }
      }
      applyMode();

      return {
        update: function (dt, t) {
          var dts = Math.min(dt, 0.05) * P.speed;
          var isEarth = (P.mode === 'earth');

          if (isEarth) {
            /* ---------- 地球–月球 ---------- */
            var dReal = P.d * 1e8;                     // m
            var dm = sceneMoonDist();
            ang += dts * (Math.PI * 2 / 14) * Math.pow(P.d / 3.84, -1.5);
            moon.position.set(Math.cos(ang) * dm, 0, Math.sin(ang) * dm);
            moonLb.position.set(moon.position.x, moon.position.y + 0.85, moon.position.z);

            moonDir.set(moon.position.x, 0, moon.position.z).normalize();
            var a2 = P.lag * Math.PI / 180;
            var cs = Math.cos(-a2), sn = Math.sin(-a2);
            bulgeDir.set(moonDir.x * cs - moonDir.z * sn, 0, moonDir.x * sn + moonDir.z * cs);

            // 水壳形变幅度：∝ 1/d³，以真实地月距离为 1
            var amp = Math.max(0.005, Math.min(0.42, 0.075 * Math.pow(3.84 / P.d, 3)));
            oceanMat.uniforms.uAmp.value = amp;
            oceanMat.uniforms.uDir.value.copy(bulgeDir);

            // 隆起标记
            var bR = 1.0 + amp * 1.0;
            bulgeA.position.copy(bulgeDir).multiplyScalar(bR);
            bulgeB.position.copy(bulgeDir).multiplyScalar(-bR);
            lbA.position.set(bulgeDir.x * (bR + 0.75), 0.35, bulgeDir.z * (bR + 0.75));
            lbB.position.set(-bulgeDir.x * (bR + 0.75), 0.35, -bulgeDir.z * (bR + 0.75));

            // 潮汐力场箭头：径向 ∝ P₂(cosθ)
            var L0 = Math.max(0.35, Math.min(3.2, 1.5 * Math.pow(3.84 / P.d, 3) * 0.35));
            for (var i = 0; i < 8; i++) {
              var th = i / 8 * Math.PI * 2;
              var rx = bulgeDir.x * Math.cos(th) - bulgeDir.z * Math.sin(th);
              var rz = bulgeDir.x * Math.sin(th) + bulgeDir.z * Math.cos(th);
              var cc = rx * bulgeDir.x + rz * bulgeDir.z;
              var p2 = 0.5 * (3 * cc * cc - 1);
              var len = Math.abs(p2) * L0;
              if (!P.field || len < 0.03) { fieldArrows[i].setVisible(false); continue; }
              var sg = p2 >= 0 ? 1 : -1;
              fieldArrows[i].set(rx * 1.02, 0, rz * 1.02,
                sg * rx, 0, sg * rz, Math.max(0.18, len));
            }

            earth.userData.wire.rotation.y += dt * 0.25;

            // 真实读数
            var at = 2 * K.G * K.MMOON * K.REARTH / Math.pow(dReal, 3);
            var gc = K.G * K.MMOON / (dReal * dReal);
            curAt = at;
            curLogR = Math.log10(dReal);
            curRatio = at / gc;
            var zeta = (K.MMOON / K.MEARTH) * Math.pow(K.REARTH, 4) / Math.pow(dReal, 3);
            curState = '固体潮 + 海洋共振';

            if (tick % 6 === 0) {
              c2.setBadge('地球–月球', GRAV.CSS.cyan);
              c2.setRows([
                ['潮高 ζ（平衡潮）', GRAV.fix(zeta, 3) + ' m'],
                ['地月距离 d', GRAV.fix(P.d, 2) + '×10⁵ km'],
                ['滞后角 α', GRAV.fix(P.lag, 0) + '°']
              ]);
            }
          } else {
            /* ---------- 黑洞面条化 ---------- */
            var Mb = Math.pow(10, P.lm) * K.MSUN;
            var Ms = K.MSUN, Rs = K.RSUN;
            var rt = Rs * Math.pow(Mb / Ms, 1 / 3);
            var rReal = rrNow * rt;
            if (P.fall) {
              // 自由下落：dr/dt = −√(2GM/r)
              var vFall = Math.sqrt(2 * K.G * Mb / rReal);
              rrNow -= (vFall / rt) * dts * 0.02;
              if (rrNow < 0.28) rrNow = 5.0;
            }
            curLogR = Math.log10(rReal);

            var at2 = 2 * K.G * Mb * Rs / Math.pow(rReal, 3);
            var gs = K.G * Ms / (Rs * Rs);
            curAt = at2;
            curRatio = at2 / gs;

            var chi = Math.min(6, curRatio);
            var elong = 1 + chi * 0.95;
            var comp = 1 / Math.sqrt(1 + chi * 0.95);
            var dSc = 4.0 + (rrNow - 0.30) * 2.6;
            star.position.set(dSc, 0, 0);
            star.setScale(elong, comp, comp);
            star.userData.halo.scale.set(0.85 * 5.0 * (1 + chi * 0.2), 0.85 * 5.0 * comp, 1);
            starLb.position.set(dSc, 1.5 + comp, 0);

            // 尾迹
            var nlen = Math.max(0.001, chi * 2.6);
            noodle.visible = chi > 0.25;
            noodle.scale.set(1, nlen, 1);
            noodle.position.set(dSc + nlen / 2, 0, 0);   // cylinder 已旋转为沿 X
            noodle.material.opacity = Math.min(0.65, 0.12 + chi * 0.16);

            // 潮汐拉伸箭头（恒星近端 / 远端）
            var dl = Math.max(0.2, Math.min(2.6, chi * 0.6));
            if (P.field) {
              dgA.set(dSc + elong * 0.85, 0, 0, 1, 0, 0, dl);
              dgB.set(dSc - elong * 0.85, 0, 0, -1, 0, 0, dl);
            } else { dgA.setVisible(false); dgB.setVisible(false); }

            // 潮汐半径环（固定）
            rocheLb.position.set(0, 0.5, -(4.0 + (1 - 0.30) * 2.6) - 0.9);

            var rsSch = 2 * K.G * Mb / 8.9875517873681764e16;
            curState = curRatio >= 1 ? '已越过洛希极限 · 面条化' : '尚完好';

            if (tick % 6 === 0) {
              c2.setBadge(curRatio >= 1 ? '面条化' : '完好', curRatio >= 1 ? GRAV.CSS.rose : GRAV.CSS.mint);
              c2.setRows([
                ['潮汐半径 r_t', GRAV.sci(rt, 2) + ' m (' + GRAV.fix(rt / K.RSUN, 0) + ' R☉)'],
                ['史瓦西半径 r_s', GRAV.sci(rsSch, 2) + ' m'],
                ['χ = a_t / g_*', GRAV.fix(curRatio, 3)]
              ]);
            }
          }

          tick++;
          if (tick % 6 === 0) {
            c1.setRows([
              ['潮汐加速度 a_t', GRAV.sci(curAt, 3) + ' m/s²'],
              [P.mode === 'earth' ? '中心处月球引力' : '恒星表面引力',
                GRAV.sci(curAt / curRatio, 3) + ' m/s²'],
              ['a_t / g', GRAV.sci(curRatio, 3)]
            ]);
            c3.setRows([
              ['斜率', '−3  (a_t ∝ r⁻³)'],
              ['当前 a_t', GRAV.sci(curAt, 3) + ' m/s²'],
              ['状态', curState]
            ]);
            if (c3.plot) c3.plot.redraw();
          }
        },
        setParam: function (key, value) {
          if (key === 'd') rebuildMoonOrbit();
          else if (key === 'rr') rrNow = value;
          else if (key === 'mode') applyMode();
        },
        dispose: function () { }
      };
    }
  });

})(window);
