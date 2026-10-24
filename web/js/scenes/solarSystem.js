/**
 * 场景：太阳系 · 真实轨道版
 *
 * 与旧版的区别：
 *   1) 轨道根数用 J2000 真实数据（半长轴 a、偏心率 e、倾角 i、升交点 Ω、近日点幅角 ω、平黄经 L₀），
 *      每帧解「开普勒方程」求偏近点角 E，因此近日点快、远日点慢（开普勒第二定律）是算出来的，不是匀速转圈。
 *   2) 天体半径、轨道半径同源于真实公里数，按两种尺度呈现：
 *        可视化压缩 —— 轨道 a^0.6、天体半径 R^0.52 压缩，便于一屏看全（太阳额外缩小，HUD 会标注）
 *        真实比例   —— 1 AU = 180 单位，距离与半径严格同比例（地球在整景里只有 0.008 单位）
 *   3) 时间可加速/减速到 0.1–365 天/秒，HUD 同步显示模拟日期。
 *   4) 背景为系外星场：银河带、旋涡星系、星云、两个远方恒星系；前景有小行星带、柯伊伯带、流星与陨石。
 *
 * 尺度说明：真实太阳系的比例无法同时满足「看得见行星」与「看得见轨道」，
 * 物理量本身全部真实，压缩只发生在显示这一层，且可一键切回真实比例。
 */
(function () {
  'use strict';

  var AU_KM = 149597870.7;          // 1 天文单位 = 149,597,870.7 km
  var D2R = Math.PI / 180;

  /* ================= 真实天体数据（J2000 历元） ================= */
  var PLANETS = [
    {
      id: 'mercury', name: '水星', en: 'Mercury', tex: 'rocky', seed: 11,
      pal: ['#7c736b', '#4a433d', '#a79c90'],
      radiusKm: 2439.7, a: 0.387098, e: 0.205630, inc: 7.005, node: 48.331, peri: 29.124,
      L0: 252.2508, period: 87.9691, rotH: 1407.6, tilt: 0.034,
      temp: '-173 ~ 427 ℃', moons: 0
    },
    {
      id: 'venus', name: '金星', en: 'Venus', tex: 'venus', seed: 23,
      pal: ['#d8b878', '#f2ddab', '#a8834b'],
      radiusKm: 6051.8, a: 0.723332, e: 0.006772, inc: 3.3946, node: 76.680, peri: 54.853,
      L0: 181.9797, period: 224.701, rotH: -5832.5, tilt: 177.36,
      temp: '约 464 ℃', moons: 0
    },
    {
      id: 'earth', name: '地球', en: 'Earth', tex: 'earth', seed: 37,
      pal: ['#0b3f7a', '#2f6b34', '#a89160'],
      radiusKm: 6371.0, a: 1.000000, e: 0.016709, inc: 0.0, node: 0.0, peri: 114.208,
      L0: 100.4644, period: 365.256, rotH: 23.9345, tilt: 23.44,
      temp: '-89 ~ 58 ℃', moons: 1
    },
    {
      id: 'mars', name: '火星', en: 'Mars', tex: 'mars', seed: 53,
      pal: ['#a8502f', '#6d2f1c', '#d08a5f'],
      radiusKm: 3389.5, a: 1.523679, e: 0.093400, inc: 1.8506, node: 49.558, peri: 286.502,
      L0: 355.4533, period: 686.980, rotH: 24.6229, tilt: 25.19,
      temp: '-143 ~ 35 ℃', moons: 2
    },
    {
      id: 'jupiter', name: '木星', en: 'Jupiter', tex: 'gas', seed: 71,
      pal: ['#c9a87f', '#e6d0ab', '#a1734f', '#f0e4cc'],
      radiusKm: 69911, a: 5.202887, e: 0.048386, inc: 1.3044, node: 100.464, peri: 273.867,
      L0: 34.3964, period: 4332.59, rotH: 9.925, tilt: 3.13,
      temp: '约 -108 ℃', moons: 95, bands: 22, spot: true
    },
    {
      id: 'saturn', name: '土星', en: 'Saturn', tex: 'gas', seed: 89,
      pal: ['#d8c093', '#efe0bd', '#b7986a'],
      radiusKm: 58232, a: 9.536676, e: 0.053862, inc: 2.4857, node: 113.666, peri: 339.392,
      L0: 49.9545, period: 10759.22, rotH: 10.656, tilt: 26.73,
      temp: '约 -139 ℃', moons: 146, bands: 16, ring: true
    },
    {
      id: 'uranus', name: '天王星', en: 'Uranus', tex: 'ice', seed: 101,
      pal: ['#a9dbe4', '#c7eaef', '#8fbcc6'],
      radiusKm: 25362, a: 19.18916, e: 0.047257, inc: 0.7726, node: 74.006, peri: 96.999,
      L0: 313.2322, period: 30688.5, rotH: -17.24, tilt: 97.77,
      temp: '约 -197 ℃', moons: 28, bands: 8
    },
    {
      id: 'neptune', name: '海王星', en: 'Neptune', tex: 'ice', seed: 113,
      pal: ['#33569e', '#4a74c4', '#1f3a6d'],
      radiusKm: 24622, a: 30.06992, e: 0.008590, inc: 1.7700, node: 131.784, peri: 273.187,
      L0: 304.8800, period: 60182, rotH: 16.11, tilt: 28.32,
      temp: '约 -201 ℃', moons: 16, bands: 10
    }
  ];

  var SUN = { radiusKm: 696000, rotH: 25.38, temp: '表面约 5,772 K' };

  /* ================= 两种尺度 ================= */
  var SCALES = {
    viz: {
      name: '可视化压缩',
      dist: function (au) { return 9.2 * Math.pow(au, 0.60); },
      size: function (km) { return 0.34 * Math.pow(km / 6371, 0.52); },
      sun: 2.45,
      unit: 'AU',
      note: '轨道按 a^0.60、半径按 R^0.52 压缩；太阳半径另行收紧'
    },
    real: {
      name: '真实比例',
      dist: function (au) { return au * 180; },
      size: function (km) { return km * 180 / AU_KM; },
      sun: null,
      unit: 'AU',
      note: '1 AU = 180 单位，距离与半径严格同比例'
    }
  };

  /* ================= 注册场景 ================= */
  HL.registerScene({
    id: 'solar',
    name: '太阳系',
    short: '真实轨道根数 · 开普勒定律 · 时间加速',
    icon: '☉',
    fov: 50,
    minDistance: 0.02,
    maxDistance: 26000,
    desc: '八大行星按 J2000 真实轨道根数运行：逐帧解开普勒方程，近日点加速、远日点减速由引力算出。可切换「可视化压缩 / 真实比例」，时间流速覆盖 0.1–365 天/秒。',

    controls: [
      { type: 'button', key: 'tour', label: '📖 讲解模式' },
      { type: 'range', key: 'speed', label: '时间流速', min: 0.1, max: 365, step: 0.1, value: 3, unit: ' 天/秒' },
      { type: 'check', key: 'pause', label: '暂停（Space）', value: false },
      { type: 'buttons', key: 'scale', label: '尺度模式', value: 'viz', options: [
        { label: '可视化压缩', value: 'viz' }, { label: '真实比例', value: 'real' }] },
      { type: 'check', key: 'orbit', label: '显示轨道线', value: true },
      { type: 'check', key: 'label', label: '天体名称', value: true },
      { type: 'check', key: 'belt', label: '小行星带 / 柯伊伯带', value: true },
      { type: 'check', key: 'meteor', label: '流星与陨石', value: true },
      { type: 'check', key: 'autoRotate', label: '相机环绕', value: false }
    ],

    create: function (ctx) {
      var THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera, controls = ctx.controls;
      var stage = document.getElementById('stage');

      /* 近裁剪面要压得很小：真实比例模式下地球半径只有 0.0077 单位 */
      camera.near = 0.01; camera.far = 60000; camera.updateProjectionMatrix();

      var params = { speed: 3, pause: false, scale: 'viz', orbit: true, label: true, belt: true, meteor: true, autoRotate: false };
      var mode = 'viz';
      var J2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
      var simDays0 = (Date.now() - J2000) / 86400000;   // 今天距 J2000 的天数
      var simDays = simDays0;                            // 累计模拟天数（初值=真实今天）
      var startMs = Date.now();                          // 模拟起点 = 打开场景的时刻
      var sc = SCALES.viz;

      /* ---------------- 噪声与纹理 ---------------- */
      function hash2(x, y, s) {
        var n = (Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041)) | 0;
        n = Math.imul(n ^ (n >>> 13), 1274126177);
        return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
      }
      function vn(x, y, s) {
        var xi = Math.floor(x), yi = Math.floor(y);
        var xf = x - xi, yf = y - yi;
        var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
        var a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s);
        var c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
        return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
      }
      function fbm(x, y, s, oct) {
        var sum = 0, amp = 0.5, f = 1;
        for (var i = 0; i < oct; i++) { sum += amp * vn(x * f, y * f, s + i * 17); f *= 2; amp *= 0.5; }
        return sum;
      }
      function mixHex(a, b, t) {
        var A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
        var ar = A >> 16 & 255, ag = A >> 8 & 255, ab = A & 255;
        var br = B >> 16 & 255, bg = B >> 8 & 255, bb = B & 255;
        return [ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t];
      }

      /* 行星表面纹理：逐像素噪声，512×256 */
      function planetTexture(p) {
        var W = 384, H = 192;
        var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        var c = cv.getContext('2d');
        var img = c.createImageData(W, H), d = img.data;
        var seed = p.seed, pal = p.pal;

        for (var y = 0; y < H; y++) {
          var v = y / H;
          var lat = (v - 0.5) * Math.PI;
          for (var x = 0; x < W; x++) {
            var u = x / W;
            var col;
            if (p.tex === 'gas' || p.tex === 'ice') {
              // 条带：纬向正弦 + 湍流扰动
              var tur = fbm(u * 7, v * 14, seed, 3) - 0.5;
              var band = 0.5 + 0.5 * Math.sin(lat * (p.bands || 14) * 1.8 + tur * 5.0);
              col = mixHex(pal[0], pal[1], band);
              var dk = fbm(u * 11 + 4, v * 9 + 2, seed + 5, 2) - 0.5;
              col = [col[0] + dk * 26, col[1] + dk * 22, col[2] + dk * 18];
              if (p.spot) {
                var du = (u - 0.62) * 15.0, dv = (v - 0.60) * 30.0;
                var rr = du * du + dv * dv;
                if (rr < 1) col = mixHex('#b4553c', '#d97a52', fbm(u * 9, v * 9, seed + 9, 2));
              }
              if (p.tex === 'ice') {
                col = mixHex('#' + toHex(col), pal[2], 0.18 + 0.22 * Math.abs(Math.sin(lat * 3)));
              }
            } else if (p.tex === 'earth') {
              var land = fbm(u * 4.2 + 3, v * 4.2 + 1, seed, 4);
              var ice = Math.abs(lat) > 1.28 - (land - 0.5) * 0.22;
              if (ice) col = [226, 238, 247];
              else if (land > 0.545) {
                var alt = fbm(u * 11, v * 11, seed + 3, 3);
                col = mixHex('#2f6b34', '#a89160', Math.min(1, (alt - 0.35) * 2.4));
                if (land > 0.66) col = mixHex('#' + toHex(col), '#8a7a55', 0.4);
              } else {
                col = mixHex('#072f5e', '#1c5c93', Math.min(1, (land - 0.2) * 2.2));
              }
            } else {
              // 岩石：基色 + 分形斑驳 + 两极略暗
              var n = fbm(u * 6, v * 6, seed, 4);
              col = mixHex(pal[1], pal[0], n);
              var g = fbm(u * 22 + 7, v * 22 + 5, seed + 11, 2) - 0.5;
              col = [col[0] + g * 34, col[1] + g * 30, col[2] + g * 26];
              if (p.tex === 'mars') {
                var iceM = Math.abs(lat) > 1.36;
                if (iceM) col = [232, 238, 240];
              }
              if (p.tex === 'venus') {
                var swirl = fbm(u * 3 + 1, v * 5 + 9, seed + 21, 4);
                col = mixHex(pal[2], pal[1], swirl);
              }
            }
            var i4 = (y * W + x) * 4;
            d[i4] = Math.max(0, Math.min(255, col[0]));
            d[i4 + 1] = Math.max(0, Math.min(255, col[1]));
            d[i4 + 2] = Math.max(0, Math.min(255, col[2]));
            d[i4 + 3] = 255;
          }
        }
        c.putImageData(img, 0, 0);

        // 撞击坑（水星 / 火星）：亮环 + 暗心
        if (p.tex === 'rocky' || p.tex === 'mars') {
          var rnd = mulberry(p.seed * 7 + 3);
          var n = p.tex === 'rocky' ? 150 : 80;
          for (var k = 0; k < n; k++) {
            var cx = rnd() * W, cy = 12 + rnd() * (H - 24), r = 1.5 + Math.pow(rnd(), 2.2) * 16;
            var gg = c.createRadialGradient(cx, cy, 0, cx, cy, r);
            gg.addColorStop(0, 'rgba(0,0,0,0.30)');
            gg.addColorStop(0.62, 'rgba(0,0,0,0.12)');
            gg.addColorStop(0.86, 'rgba(255,255,255,0.16)');
            gg.addColorStop(1, 'rgba(255,255,255,0)');
            c.fillStyle = gg; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
          }
        }
        var tex = new THREE.CanvasTexture(cv);
        tex.wrapS = THREE.RepeatWrapping;
        tex.anisotropy = 4;
        return tex;
      }
      function toHex(col) {
        return ((1 << 24) + (Math.round(col[0]) << 16) + (Math.round(col[1]) << 8) + Math.round(col[2])).toString(16).slice(1);
      }
      function mulberry(a) {
        return function () {
          a |= 0; a = a + 0x6D2B79F5 | 0;
          var t = Math.imul(a ^ a >>> 15, 1 | a);
          t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
          return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
      }

      /* 云层（地球）：白色 + 透明度噪声 */
      function cloudTexture(seed) {
        var W = 320, H = 160, cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        var c = cv.getContext('2d'), img = c.createImageData(W, H), d = img.data;
        for (var y = 0; y < H; y++) {
          for (var x = 0; x < W; x++) {
            var u = x / W, v = y / H;
            var n = fbm(u * 6 + 2, v * 7 + 5, seed, 4);
            var band = 0.5 + 0.5 * Math.sin((v - 0.5) * Math.PI * 5.5);
            var a = Math.max(0, (n - 0.44) * 2.6) * (0.35 + 0.65 * band);
            var i4 = (y * W + x) * 4;
            d[i4] = 255; d[i4 + 1] = 255; d[i4 + 2] = 255;
            d[i4 + 3] = Math.min(255, a * 255);
          }
        }
        c.putImageData(img, 0, 0);
        var t = new THREE.CanvasTexture(cv);
        t.wrapS = THREE.RepeatWrapping;
        return t;
      }

      /* 土星环：一维径向条纹 + 卡西尼缝 */
      function ringTexture() {
        var W = 1024, cv = document.createElement('canvas');
        cv.width = W; cv.height = 1;
        var c = cv.getContext('2d');
        for (var x = 0; x < W; x++) {
          var t = x / W;
          var n = fbm(t * 64, 0.5, 77, 4);
          var a = 0.18 + n * 0.62;
          // 主要缝隙
          if (t > 0.40 && t < 0.445) a *= 0.10;      // 卡西尼缝
          if (t > 0.70 && t < 0.712) a *= 0.30;
          if (t > 0.27 && t < 0.276) a *= 0.45;
          if (t < 0.045 || t > 0.985) a *= 0.2;
          var shade = 0.72 + n * 0.35;
          var col = mixHex('#8f7f66', '#d9cdb4', shade);
          c.fillStyle = 'rgba(' + Math.round(col[0]) + ',' + Math.round(col[1]) + ',' + Math.round(col[2]) + ',' + a.toFixed(3) + ')';
          c.fillRect(x, 0, 1, 1);
        }
        var tex = new THREE.CanvasTexture(cv);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.minFilter = THREE.LinearFilter;
        return tex;
      }

      /* 太阳表面：颗粒组织 */
      function sunTexture() {
        var W = 320, H = 160, cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        var c = cv.getContext('2d'), img = c.createImageData(W, H), d = img.data;
        for (var y = 0; y < H; y++) {
          for (var x = 0; x < W; x++) {
            var u = x / W, v = y / H;
            var g = fbm(u * 30, v * 30, 5, 3);
            var m = fbm(u * 8, v * 8, 19, 4);
            var b = 0.72 + g * 0.5;
            var i4 = (y * W + x) * 4;
            d[i4] = Math.min(255, 255 * b);
            d[i4 + 1] = Math.min(255, 219 * b * (0.92 + m * 0.16));
            d[i4 + 2] = Math.min(255, 138 * b * (0.85 + m * 0.3));
            d[i4 + 3] = 255;
          }
        }
        c.putImageData(img, 0, 0);
        var tex = new THREE.CanvasTexture(cv);
        tex.wrapS = THREE.RepeatWrapping;
        return tex;
      }

      /* 径向渐变贴图（光晕 / 星云） */
      function glowTexture(rgb, soft) {
        var cv = document.createElement('canvas'); cv.width = cv.height = 128;
        var c = cv.getContext('2d');
        var g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, 'rgba(' + rgb + ',1)');
        g.addColorStop(soft ? 0.22 : 0.30, 'rgba(' + rgb + ',0.55)');
        g.addColorStop(0.62, 'rgba(' + rgb + ',0.14)');
        g.addColorStop(1, 'rgba(' + rgb + ',0)');
        c.fillStyle = g; c.fillRect(0, 0, 128, 128);
        return new THREE.CanvasTexture(cv);
      }

      /* 旋涡星系（程序化撒点） */
      function galaxyTexture(tint) {
        var S = 256, cv = document.createElement('canvas');
        cv.width = cv.height = S;
        var c = cv.getContext('2d');
        var rnd = mulberry(4242);
        c.fillStyle = 'rgba(0,0,0,0)'; c.fillRect(0, 0, S, S);
        for (var i = 0; i < 2600; i++) {
          var arm = Math.floor(rnd() * 3);
          var t = Math.pow(rnd(), 0.65);
          var ang = t * 5.4 + arm * (Math.PI * 2 / 3) + (rnd() - 0.5) * 0.5;
          var rad = 8 + t * (S * 0.44);
          var x = S / 2 + Math.cos(ang) * rad + (rnd() - 0.5) * 12;
          var y = S / 2 + Math.sin(ang) * rad * 0.62 + (rnd() - 0.5) * 12;
          var a = (1 - t) * 0.4 * rnd() + 0.05;
          c.fillStyle = 'rgba(' + tint + ',' + a.toFixed(3) + ')';
          c.fillRect(x, y, 1.4, 1.4);
        }
        // 核球
        var g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.2);
        g.addColorStop(0, 'rgba(255,244,222,0.85)');
        g.addColorStop(0.4, 'rgba(255,226,180,0.28)');
        g.addColorStop(1, 'rgba(255,220,170,0)');
        c.fillStyle = g; c.fillRect(0, 0, S, S);
        return new THREE.CanvasTexture(cv);
      }

      /* ---------------- 星空 / 系外星体 ---------------- */
      scene.add(ctx.makeStars(1800, 9000));

      // 银河带：沿一个大圆集中分布
      (function milkyWay() {
        var N = 2200, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
        var R = 9600;
        var v = new THREE.Vector3();
        for (var i = 0; i < N; i++) {
          var a = Math.random() * Math.PI * 2;
          var spread = (Math.random() + Math.random() + Math.random() - 1.5) * 0.16;
          v.set(Math.cos(a), 0, Math.sin(a)).applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.42);
          // 沿轴向扰动形成带宽
          pos[i * 3] = v.x * R * (1 + (Math.random() - 0.5) * 0.06);
          pos[i * 3 + 1] = v.y * R + spread * R * 0.22;
          pos[i * 3 + 2] = v.z * R * (1 + (Math.random() - 0.5) * 0.06);
          var b = 0.20 + Math.random() * 0.42;
          col[i * 3] = b * (0.9 + Math.random() * 0.1);
          col[i * 3 + 1] = b * 0.95;
          col[i * 3 + 2] = b * (1.0 + Math.random() * 0.06);
        }
        var g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        var m = new THREE.PointsMaterial({
          size: 1.5, sizeAttenuation: false, vertexColors: true,
          transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending
        });
        scene.add(new THREE.Points(g, m));
      })();

      // 旋涡星系 ×3、星云 ×3、远方恒星系 ×2
      (function deepSky() {
        var rnd = mulberry(90210);
        var galTex = galaxyTexture('190,214,255');
        var galTint = [0x9fc4ff, 0xb9a8ff];
        for (var i = 0; i < 2; i++) {
          var s = new THREE.Sprite(new THREE.SpriteMaterial({
            map: galTex, color: galTint[i], transparent: true,
            opacity: 0.52, depthWrite: false, blending: THREE.AdditiveBlending
          }));
          var dist = 7000 + rnd() * 2200;
          var th = rnd() * Math.PI * 2, ph = Math.acos(rnd() * 1.4 - 0.5);
          s.position.set(
            Math.sin(ph) * Math.cos(th) * dist,
            Math.cos(ph) * dist * 0.75,
            Math.sin(ph) * Math.sin(th) * dist
          );
          var size = 700 + rnd() * 900;
          s.scale.set(size, size * (0.4 + rnd() * 0.35), 1);
          s.material.rotation = rnd() * Math.PI;
          scene.add(s);
        }
        var neb = [['86,150,255', 0.10], ['160,110,255', 0.085], ['80,220,220', 0.07]];
        neb.forEach(function (cfg, k) {
          var sp = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glowTexture(cfg[0], true), transparent: true,
            opacity: cfg[1] * 3.2, depthWrite: false, blending: THREE.AdditiveBlending
          }));
          var dist = 6500 + k * 900;
          sp.position.set(Math.cos(k * 2.1) * dist, 900 - k * 700, Math.sin(k * 2.1) * dist);
          var sz = 1500 + k * 400;
          sp.scale.set(sz, sz * 0.65, 1);
          scene.add(sp);
        });
        // 远方恒星系：一对互相绕转的亮点 + 光晕，暗示「系外」
        var sysTex = glowTexture('255,236,200');
        [[-4200, 1800, -5200], [5200, -1500, -3600]].forEach(function (p, idx) {
          var g = new THREE.Group();
          var core = new THREE.Sprite(new THREE.SpriteMaterial({
            map: sysTex, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending
          }));
          core.scale.set(120, 120, 1);
          g.add(core);
          for (var j = 0; j < 2; j++) {
            var dot = new THREE.Sprite(new THREE.SpriteMaterial({
              map: glowTexture('255,255,255'), transparent: true, opacity: 0.95,
              depthWrite: false, blending: THREE.AdditiveBlending
            }));
            dot.scale.set(16 + j * 6, 16 + j * 6, 1);
            dot.position.set((j ? 1 : -1) * (26 + idx * 10), (j ? -1 : 1) * 12, 0);
            g.add(dot);
          }
          g.position.set(p[0], p[1], p[2]);
          scene.add(g);
        });
      })();

      /* ---------------- 太阳 ---------------- */
      var sunMesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 64, 48),
        new THREE.MeshBasicMaterial({ map: sunTexture() })
      );
      scene.add(sunMesh);

      var corona = [];
      [[2.1, '255,214,140', 0.50], [4.4, '255,172,84', 0.22], [8.5, '255,144,64', 0.09]].forEach(function (cfg) {
        var sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTexture(cfg[1]), transparent: true, opacity: cfg[2],
          depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending
        }));
        sp.userData.f = cfg[0];
        scene.add(sp);
        corona.push(sp);
      });

      scene.add(new THREE.AmbientLight(0xffffff, 0.055));
      var sunLight = new THREE.PointLight(0xfff2dc, 1.45, 0, 1.0);
      scene.add(sunLight);

      /* ---------------- 行星 ---------------- */
      var planets = [];

      PLANETS.forEach(function (p) {
        var holder = new THREE.Group();        // 轨道位置
        var tiltG = new THREE.Group();         // 自转轴倾角
        tiltG.rotation.z = p.tilt * D2R;
        holder.add(tiltG);
        scene.add(holder);

        var mat = new THREE.MeshStandardMaterial({
          map: planetTexture(p),
          roughness: p.tex === 'gas' || p.tex === 'ice' ? 0.95 : 0.88,
          metalness: 0.02
        });
        var mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 26), mat);
        tiltG.add(mesh);

        // 地球：云层 + 大气薄雾
        var clouds = null, atmo = null;
        if (p.id === 'earth') {
          clouds = new THREE.Mesh(
            new THREE.SphereGeometry(1.012, 32, 22),
            new THREE.MeshStandardMaterial({
              map: cloudTexture(9), transparent: true, opacity: 0.9,
              depthWrite: false, roughness: 1, metalness: 0
            })
          );
          tiltG.add(clouds);

          atmo = new THREE.Mesh(
            new THREE.SphereGeometry(1.055, 32, 22),
            new THREE.ShaderMaterial({
              uniforms: { uColor: { value: new THREE.Color(0x63b8ff) } },
              vertexShader: [
                'varying vec3 vN; varying vec3 vP;',
                'void main(){',
                '  vN = normalize(normalMatrix * normal);',
                '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
                '  vP = normalize(-mv.xyz);',
                '  gl_Position = projectionMatrix * mv;',
                '}'
              ].join('\n'),
              fragmentShader: [
                'uniform vec3 uColor; varying vec3 vN; varying vec3 vP;',
                'void main(){',
                '  float f = pow(1.0 - abs(dot(vN, vP)), 2.6);',
                '  gl_FragColor = vec4(uColor * f, f * 0.55);',
                '}'
              ].join('\n'),
              transparent: true, blending: THREE.AdditiveBlending,
              depthWrite: false, side: THREE.FrontSide
            })
          );
          tiltG.add(atmo);
        }

        // 土星环：真实内外半径 74,500 / 140,220 km ≈ 1.28 / 2.41 R
        var ring = null;
        if (p.ring) {
          var ringMat = new THREE.ShaderMaterial({
            uniforms: {
              uMap: { value: ringTexture() },
              uInner: { value: 1.24 }, uOuter: { value: 2.42 }, uOpacity: { value: 0.86 }
            },
            vertexShader: [
              'varying float vR;',
              'void main(){ vR = length(position.xy); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }'
            ].join('\n'),
            fragmentShader: [
              'uniform sampler2D uMap; uniform float uInner; uniform float uOuter; uniform float uOpacity;',
              'varying float vR;',
              'void main(){',
              '  float t = clamp((vR - uInner) / (uOuter - uInner), 0.0, 1.0);',
              '  vec4 c = texture2D(uMap, vec2(t, 0.5));',
              '  if (c.a < 0.012) discard;',
              '  gl_FragColor = vec4(c.rgb, c.a * uOpacity);',
              '}'
            ].join('\n'),
            transparent: true, side: THREE.DoubleSide, depthWrite: false
          });
          ring = new THREE.Mesh(new THREE.RingGeometry(1.24, 2.42, 128, 1), ringMat);
          ring.rotation.x = -Math.PI / 2;
          tiltG.add(ring);
        }

        // 名称标签（屏幕空间恒定大小，远近都清楚）
        var label = makeLabel(p.name);
        holder.add(label);

        // 真实比例模式下的定位环
        var marker = makeMarker();
        marker.visible = false;
        holder.add(marker);

        // 拾取用的不可见球（按相机距离放大，保证小目标可点）
        var pick = new THREE.Mesh(
          new THREE.SphereGeometry(1, 12, 8),
          new THREE.MeshBasicMaterial({ visible: false })
        );
        holder.add(pick);

        planets.push({
          data: p, holder: holder, tiltG: tiltG, mesh: mesh, clouds: clouds,
          ring: ring, label: label, marker: marker, pick: pick,
          spinRate: (Math.PI * 2) / (Math.abs(p.rotH) / 24) * (p.rotH < 0 ? -1 : 1)
        });
      });

      /* 标签与标记：sprite 尺寸固定为屏幕比例 */
      function makeLabel(text) {
        var pad = 12, fs = 34;
        var mc = document.createElement('canvas').getContext('2d');
        mc.font = '600 ' + fs + 'px "Microsoft YaHei","Segoe UI",sans-serif';
        var w = Math.ceil(mc.measureText(text).width) + pad * 2;
        var h = fs + pad * 1.4;
        var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        var c = cv.getContext('2d');
        c.font = '600 ' + fs + 'px "Microsoft YaHei","Segoe UI",sans-serif';
        c.textBaseline = 'middle'; c.textAlign = 'center';
        c.shadowColor = 'rgba(0,0,0,.95)'; c.shadowBlur = 8;
        c.fillStyle = '#cfe6ff';
        c.fillText(text, w / 2, h / 2);
        var tex = new THREE.CanvasTexture(cv);
        tex.minFilter = THREE.LinearFilter;
        var sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false
        }));
        var k = 0.028;                              // 屏高比例（相对屏高）
        sp.scale.set(k * (w / h), k, 1);
        sp.center.set(0.5, -0.12);                  // 轻微上移，配合世界坐标偏移
        sp.renderOrder = 998;
        return sp;
      }
      function makeMarker() {
        var cv = document.createElement('canvas'); cv.width = cv.height = 64;
        var c = cv.getContext('2d');
        c.strokeStyle = 'rgba(120,226,255,.85)'; c.lineWidth = 3;
        c.beginPath(); c.arc(32, 32, 20, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.arc(32, 32, 3, 0, Math.PI * 2);
        c.fillStyle = 'rgba(180,240,255,.95)'; c.fill();
        var sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: new THREE.CanvasTexture(cv), transparent: true,
          depthTest: false, depthWrite: false, sizeAttenuation: false, opacity: 0.85
        }));
        sp.scale.set(0.016, 0.016, 1);
        sp.renderOrder = 997;
        return sp;
      }

      /* ---------------- 轨道线 ---------------- */
      var orbitLines = [];
      planets.forEach(function (it) {
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(257 * 3), 3));
        var line = new THREE.Line(geo, new THREE.LineBasicMaterial({
          color: 0x4de2ff, transparent: true, opacity: 0.26, depthWrite: false
        }));
        scene.add(line);
        orbitLines.push(line);
      });

      /* ---------------- 开普勒求解 ---------------- */
      var Z = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
      function quatFor(p) {
        var qY1 = new THREE.Quaternion().setFromAxisAngle(Y, p.node * D2R);
        var qX = new THREE.Quaternion().setFromAxisAngle(X, p.inc * D2R);
        var qY2 = new THREE.Quaternion().setFromAxisAngle(Y, p.peri * D2R);
        return qY1.multiply(qX).multiply(qY2);
      }
      // 由平近点角 M 解偏近点角 E（牛顿迭代），再求真近点角 ν 与向径 r
      function trueAnomaly(M, e) {
        M = ((M + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        var E = M + e * Math.sin(M);
        for (var i = 0; i < 6; i++) {
          E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
        }
        var cosE = Math.cos(E), sinE = Math.sin(E);
        var nu = Math.atan2(Math.sqrt(1 - e * e) * sinE, cosE - e);
        return { nu: nu, E: E };
      }
      var _v = new THREE.Vector3();
      function orbitPoint(p, M, aUnits, e) {
        var t = trueAnomaly(M, e);
        var r = aUnits * (1 - e * Math.cos(t.E));
        _v.set(r * Math.cos(t.nu), 0, -r * Math.sin(t.nu));
        return _v.applyQuaternion(quatFor(p));
      }

      /* 每个行星的状态（按当前尺度算好的常量） */
      var geoState = [];
      function computeGeo() {
        geoState = planets.map(function (it) {
          var p = it.data;
          return {
            a: sc.dist(p.a),
            r: sc.size(p.radiusKm),
            M0: (p.L0 - p.peri) * D2R,
            n: (Math.PI * 2) / p.period,
            q: quatFor(p)
          };
        });
      }

      function rebuildOrbits() {
        planets.forEach(function (it, i) {
          var g = geoState[i], p = it.data;
          var arr = orbitLines[i].geometry.attributes.position.array;
          for (var s = 0; s <= 256; s++) {
            var nu = s / 256 * Math.PI * 2;
            var r = g.a * (1 - p.e * p.e) / (1 + p.e * Math.cos(nu));
            _v.set(r * Math.cos(nu), 0, -r * Math.sin(nu)).applyQuaternion(g.q);
            arr[s * 3] = _v.x; arr[s * 3 + 1] = _v.y; arr[s * 3 + 2] = _v.z;
          }
          orbitLines[i].geometry.attributes.position.needsUpdate = true;
          orbitLines[i].geometry.computeBoundingSphere();
        });
      }

      /* ---------------- 小行星带 / 柯伊伯带 ---------------- */
      var beltGroup = new THREE.Group();
      scene.add(beltGroup);
      var beltRings = [];

      function buildBelt() {
        // 清空
        while (beltGroup.children.length) {
          var c = beltGroup.children[0];
          beltGroup.remove(c);
          HL.disposeObject(c);
        }
        beltRings = [];
        // 岩石贴图：不规则多边形，用于点云精灵（比实例化网格省一个数量级以上）
        var rockTex = (function () {
          var cv = document.createElement('canvas'); cv.width = cv.height = 32;
          var c = cv.getContext('2d');
          var rnd = mulberry(31), pts = [], k;
          for (k = 0; k < 7; k++) {
            var an = k / 7 * Math.PI * 2;
            var rr = 9 + rnd() * 5;
            pts.push([16 + Math.cos(an) * rr, 16 + Math.sin(an) * rr]);
          }
          c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
          for (k = 1; k < pts.length; k++) c.lineTo(pts[k][0], pts[k][1]);
          c.closePath();
          c.fillStyle = '#b9ad9b'; c.fill();
          c.strokeStyle = 'rgba(60,50,40,.55)'; c.lineWidth = 1; c.stroke();
          var t = new THREE.CanvasTexture(cv);
          t.minFilter = THREE.LinearFilter;
          return t;
        })();

        // 主带：2.06–3.27 AU，分 5 层，各自转速由真实周期 T=365.25·a^1.5 决定
        var bands = [
          { a0: 2.06, a1: 2.35, n: 420 },
          { a0: 2.28, a1: 2.58, n: 470 },
          { a0: 2.52, a1: 2.80, n: 420 },
          { a0: 2.74, a1: 3.02, n: 310 },
          { a0: 2.96, a1: 3.27, n: 210 }
        ];
        bands.forEach(function (b) {
          var pos = new Float32Array(b.n * 3), col = new Float32Array(b.n * 3);
          var rnd = mulberry(Math.round(b.a0 * 1000));
          var aMid = (b.a0 + b.a1) / 2;
          for (var i = 0; i < b.n; i++) {
            var a = b.a0 + rnd() * (b.a1 - b.a0);
            var e = rnd() * 0.14;
            var nu2 = rnd() * Math.PI * 2;
            var r = sc.dist(a) * (1 - e * e) / (1 + e * Math.cos(nu2));
            var inc = (rnd() - 0.5) * 0.09;
            pos[i * 3] = Math.cos(nu2) * r;
            pos[i * 3 + 1] = Math.sin(inc) * r;
            pos[i * 3 + 2] = -Math.sin(nu2) * r;
            var sh = 0.32 + rnd() * 0.34;
            col[i * 3] = sh;
            col[i * 3 + 1] = sh * 0.92;
            col[i * 3 + 2] = sh * 0.82;
          }
          var g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          g.setAttribute('color', new THREE.BufferAttribute(col, 3));
          var pts = new THREE.Points(g, new THREE.PointsMaterial({
            size: mode === 'real' ? 1.6 : 1.9, sizeAttenuation: false,
            map: rockTex, alphaTest: 0.35, vertexColors: true,
            transparent: true, opacity: 0.72, depthWrite: false
          }));
          pts.frustumCulled = false;
          beltGroup.add(pts);
          beltRings.push({ mesh: pts, period: 365.25 * Math.pow(aMid, 1.5) });
        });
        // 柯伊伯带：30–50 AU 的稀疏点云
        var N = 800, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
        for (var i = 0; i < N; i++) {
          var a = 30 + Math.random() * 20;
          var r = sc.dist(a);
          var th = Math.random() * Math.PI * 2;
          var y = (Math.random() - 0.5) * r * 0.10;
          pos[i * 3] = Math.cos(th) * r;
          pos[i * 3 + 1] = y;
          pos[i * 3 + 2] = -Math.sin(th) * r;
          var b = 0.35 + Math.random() * 0.45;
          col[i * 3] = b * 0.75; col[i * 3 + 1] = b * 0.85; col[i * 3 + 2] = b;
        }
        var kg = new THREE.BufferGeometry();
        kg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        kg.setAttribute('color', new THREE.BufferAttribute(col, 3));
        var kp = new THREE.Points(kg, new THREE.PointsMaterial({
          size: 1.2, sizeAttenuation: false, vertexColors: true,
          transparent: true, opacity: 0.55, depthWrite: false
        }));
        kp.userData.isKuiper = true;
        beltGroup.add(kp);
      }

      /* ---------------- 陨石（大块岩石，偏心率高） ---------------- */
      var meteorites = [];
      (function buildMeteorites() {
        var rnd = mulberry(2026);
        var geo = new THREE.IcosahedronGeometry(1, 1);
        var mat = new THREE.MeshStandardMaterial({ color: 0x7a6f63, roughness: 1, metalness: 0.05, flatShading: true });
        for (var i = 0; i < 7; i++) {
          var mesh = new THREE.Mesh(geo, mat);
          var a = 1.1 + rnd() * 2.6, e = 0.25 + rnd() * 0.45;
          var g = {
            el: { a: a, e: e, inc: (rnd() - 0.5) * 26, node: rnd() * 360, peri: rnd() * 360, L0: rnd() * 360, period: 365.25 * Math.pow(a, 1.5) },
            mesh: mesh, spin: (rnd() - 0.5) * 1.6, phase: rnd() * Math.PI * 2
          };
          scene.add(mesh);
          g.q = quatFor(g.el);
          meteorites.push(g);
        }
      })();

      /* ---------------- 流星 ---------------- */
      var meteors = [];
      (function buildMeteors() {
        for (var i = 0; i < 18; i++) {
          var N = 10;
          var geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
          geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
          var mat = new THREE.LineBasicMaterial({
            vertexColors: true, transparent: true, opacity: 0.9,
            blending: THREE.AdditiveBlending, depthWrite: false
          });
          var line = new THREE.Line(geo, mat);
          line.frustumCulled = false;
          line.visible = false;
          scene.add(line);
          meteors.push({ line: line, geo: geo, t: 0, life: 0, head: new THREE.Vector3(), dir: new THREE.Vector3(), speed: 0, len: 0, trail: [] });
        }
      })();

      function skyScale() { return mode === 'real' ? 26 : 1; }

      function spawnMeteor(m) {
        var R = 115 * skyScale();
        var th = Math.random() * Math.PI * 2;
        var ph = Math.acos(Math.random() * 1.6 - 0.6);
        m.head.set(
          Math.sin(ph) * Math.cos(th) * R,
          Math.cos(ph) * R * 0.75,
          Math.sin(ph) * Math.sin(th) * R
        );
        m.dir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        m.speed = (34 + Math.random() * 60) * skyScale();
        m.len = (16 + Math.random() * 34) * skyScale();
        m.life = 1.1 + Math.random() * 1.6;
        m.t = 0;
        m.trail.length = 0;
        m.line.visible = true;
      }

      function updateMeteors(dt) {
        if (!params.meteor) return;
        var N = 10;
        meteors.forEach(function (m) {
          if (!m.line.visible) {
            if (Math.random() < dt * 0.16) spawnMeteor(m);
            return;
          }
          m.t += dt;
          m.head.addScaledVector(m.dir, m.speed * dt);
          var k = m.t / m.life;
          if (k >= 1) { m.line.visible = false; return; }
          var pos = m.geo.attributes.position.array;
          var col = m.geo.attributes.color.array;
          for (var i = 0; i < N; i++) {
            var f = i / (N - 1);
            var d = m.len * f;
            pos[i * 3] = m.head.x - m.dir.x * d;
            pos[i * 3 + 1] = m.head.y - m.dir.y * d;
            pos[i * 3 + 2] = m.head.z - m.dir.z * d;
            var a = (1 - f) * (1 - k) * 0.95;
            col[i * 3] = a * 1.0;
            col[i * 3 + 1] = a * 0.92;
            col[i * 3 + 2] = a * 0.78;
          }
          m.geo.attributes.position.needsUpdate = true;
          m.geo.attributes.color.needsUpdate = true;
        });
      }

      /* ---------------- 布局：按当前尺度落地 ---------------- */
      function applyScale() {
        sc = SCALES[mode];
        computeGeo();

        sunMesh.scale.setScalar(sc.sun === null ? sc.size(SUN.radiusKm) : sc.sun);
        var sunR = sunMesh.scale.x;
        corona.forEach(function (sp) { sp.scale.setScalar(sunR * sp.userData.f * 2); });
        sunLabel.position.set(0, sunR * 1.5, 0);
        sunMarker.scale.setScalar(mode === 'real' ? 0.019 : 0.013);
        sunLabel.visible = !!params.label;
        sunMarker.visible = mode === 'real';

        planets.forEach(function (it, i) {
          var g = geoState[i];
          it.tiltG.scale.setScalar(g.r);
          it.label.position.set(0, g.r * 1.45, 0);
          it.label.visible = !!params.label;
          it.marker.visible = mode === 'real';
          it.marker.scale.setScalar(mode === 'real' ? 0.019 : 0.012);
          if (it.ring) it.ring.visible = true;
        });

        buildBelt();
        rebuildOrbits();
        placeAll(0);
        setHomeCamera();
        btnScaleNote();
      }

      function btnScaleNote() {
        if (ctx.setNote) {
          ctx.setNote(
            '<div class="note-row"><span>尺度</span><b>' + sc.name + '</b></div>' +
            '<div class="note-row"><span>1 AU</span><b>' + (mode === 'real' ? '180 单位' : '9.2–70.8 单位（压缩）') + '</b></div>' +
            '<div class="note-row"><span>说明</span><b style="max-width:120px">' + sc.note + '</b></div>'
          );
        }
      }

      function placeAll(dDays) {
        planets.forEach(function (it, i) {
          var p = it.data, g = geoState[i];
          var M = g.M0 + g.n * simDays;
          var pos = orbitPoint(p, M, g.a, p.e);
          it.holder.position.copy(pos);
          // 自转
          it.mesh.rotation.y += it.spinRate * dDays;
          if (it.clouds) it.clouds.rotation.y += it.spinRate * dDays * 1.08;
        });
        sunMesh.rotation.y += dDays * (Math.PI * 2) / SUN.rotH;
      }

      /* ---------------- 相机 ---------------- */
      function homePos() {
        if (mode === 'real') return new THREE.Vector3(0, 2000, 4600);
        return new THREE.Vector3(0, 62, 118);
      }
      function setHomeCamera() {
        var hp = homePos();
        camera.position.copy(hp);
        controls.target.set(0, 0, 0);
        controls.syncFromCamera();
        controls.saveHome();
      }

      /* ---------------- HUD ---------------- */
      var sunLabel = makeLabel('太阳');
      sunLabel.center.set(0.5, 0.78);          // 锚点下移 → 文字落在太阳下方
      scene.add(sunLabel);
      var sunMarker = makeMarker();
      scene.add(sunMarker);

      var hud = document.createElement('div');
      hud.className = 'solar-hud';
      hud.innerHTML =
        '<div class="sh-date"></div>' +
        '<div class="sh-speed"></div>' +
        '<div class="sh-scale"></div>' +
        '<div class="sh-key">← → 调速 · Space 暂停 · 点击天体看参数 · R 复位</div>';
      stage.appendChild(hud);
      var hudDate = hud.querySelector('.sh-date');
      var hudSpeed = hud.querySelector('.sh-speed');
      var hudScale = hud.querySelector('.sh-scale');

      function fmtDate(ms) {
        var d = new Date(ms);
        var p = function (n) { return (n < 10 ? '0' : '') + n; };
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
      }
      var hudAcc = 0;
      function updateHud() {
        hudDate.textContent = fmtDate(startMs + (simDays - simDays0) * 86400000);
        var sp = params.pause ? 0 : params.speed;
        hudSpeed.innerHTML = (params.pause ? '已暂停' : '时间流速 <b>' + (sp < 10 ? sp.toFixed(1) : Math.round(sp)) + '</b> 天/秒');
        hudScale.textContent = sc.name + ' · ' + (mode === 'real' ? '1 AU = 180 单位' : '轨道/半径已压缩');
      }

      /* 标签避让：内行星在远景里挨得很近，按屏幕距离做贪心剔除，避免文字叠在一起 */
      var _pv = new THREE.Vector3(), declutAcc = 0;
      function declutterLabels() {
        var w = stage.clientWidth || 1, h = stage.clientHeight || 1;
        var kept = [];
        var order = planets.slice().sort(function (a, b) {
          return camera.position.distanceTo(a.holder.position) - camera.position.distanceTo(b.holder.position);
        });
        order.forEach(function (it) {
          if (!params.label) { it.label.visible = false; return; }
          _pv.copy(it.holder.position).project(camera);
          var x = (_pv.x * 0.5 + 0.5) * w, y = (-_pv.y * 0.5 + 0.5) * h;
          var vis = _pv.z < 1 && _pv.z > -1;
          if (vis) {
            for (var i = 0; i < kept.length; i++) {
              var dx = x - kept[i][0], dy = y - kept[i][1];
              if ((dx * dx) / (44 * 44) + (dy * dy) / (19 * 19) < 1) { vis = false; break; }
            }
          }
          it.label.visible = vis;
          if (vis) kept.push([x, y]);
        });
      }

      /* ---------------- 讲解模式 ---------------- */
      var tour = HL.Tour(ctx);
      tour.load(buildTourSteps(function () { return planets; }));

      /* ---------------- 交互 ---------------- */
      var ray = new THREE.Raycaster();
      var infoOf = {};
      planets.forEach(function (it) { infoOf[it.mesh.uuid] = it; });
      planets.forEach(function (it) { infoOf[it.pick.uuid] = it; });

      function planetInfo(it) {
        var p = it.data;
        var aKm = p.a * AU_KM;
        var perKm = aKm * (1 - p.e), aphKm = aKm * (1 + p.e);
        var au = function (x) { return (x / AU_KM).toFixed(4) + ' AU'; };
        return {
          title: p.name + ' · ' + p.en,
          rows: [
            ['轨道半长轴', p.a.toFixed(4) + ' AU'],
            ['偏心率', p.e.toFixed(4)],
            ['轨道倾角', p.inc.toFixed(2) + '°'],
            ['公转周期', p.period < 400 ? p.period.toFixed(1) + ' 天' : (p.period / 365.25).toFixed(2) + ' 年'],
            ['自转周期', Math.abs(p.rotH) < 48 ? Math.abs(p.rotH).toFixed(2) + ' 小时' : Math.abs(p.rotH / 24).toFixed(1) + ' 天' + (p.rotH < 0 ? '（逆行）' : '')],
            ['赤道半径', p.radiusKm.toLocaleString('en-US') + ' km'],
            ['轴倾角', p.tilt.toFixed(2) + '°'],
            ['近日 / 远日', au(perKm) + ' / ' + au(aphKm)],
            ['表面温度', p.temp]
          ]
        };
      }
      var infoSun = {
        title: '太阳 · Sun',
        rows: [
          ['类型', 'G2V 主序星'],
          ['赤道半径', '696,000 km（109 个地球）'],
          ['质量占比', '太阳系的 99.86%'],
          ['表面温度', '约 5,772 K'],
          ['自转周期', '25.38 天（赤道）'],
          ['每秒消耗', '约 6 亿吨氢']
        ]
      };

      /* ---------------- 事件 ---------------- */
      function onKey(e) {
        if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();
          setSpeed(Math.min(365, params.speed * (params.speed < 10 ? 1.5 : 1.3)));
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();
          setSpeed(Math.max(0.1, params.speed / (params.speed <= 10 ? 1.5 : 1.3)));
        } else if (e.code === 'Space') {
          if (e.target === document.body) { e.preventDefault(); setPause(!params.pause); }
        }
      }
      window.addEventListener('keydown', onKey);

      function setSpeed(v) {
        params.speed = Math.round(v * 10) / 10;
        var inp = document.querySelector('#panel input[type=range]');
        var valEl = document.querySelector('#panel .ctl-head .val');
        if (inp) inp.value = params.speed;
        if (valEl) valEl.textContent = params.speed + ' 天/秒';
        updateHud();
      }
      function setPause(v) {
        params.pause = v;
        var cbs = document.querySelectorAll('#panel .ctl-check input');
        if (cbs[0]) cbs[0].checked = v;
        updateHud();
      }

      /* ---------------- 初始化 ---------------- */
      applyScale();
      updateHud();

      // 测试钩子：暴露少量内部状态用于自动化断言（不参与界面逻辑）
      window.__SOLAR = {
        planets: planets,
        params: params,
        state: function () {
          return {
            mode: mode, simDays: simDays, simDays0: simDays0, speed: params.speed, pause: params.pause,
            earthR: geoState[2].r, earthA: geoState[2].a, neptuneA: geoState[7].a,
            sunR: sunMesh.scale.x, camDist: camera.position.length(),
            belt: beltGroup.children.length,
            meteorites: meteorites.length,
            planets: planets.map(function (it) { return it.holder.position.toArray(); })
          };
        },
        // 按平近点角 M（弧度，0 = 近日点）取轨道点，供数值验证
        orbitAtMean: function (i, M) {
          var it = planets[i], g = geoState[i];
          var v = orbitPoint(it.data, M, g.a, it.data.e);
          return [v.x, v.y, v.z];
        },
        orbitPoint: function (i, days) {
          var it = planets[i], g = geoState[i];
          var v = orbitPoint(it.data, g.M0 + g.n * days, g.a, it.data.e);
          return [v.x, v.y, v.z];
        },
        meta: function () {
          return PLANETS.map(function (p) {
            return { id: p.id, a: p.a, e: p.e, inc: p.inc, period: p.period, rotH: p.rotH, radiusKm: p.radiusKm };
          });
        }
      };

      var shown = false;
      return {
        update: function (dt, t) {
          tour.update(dt, t, function (ddt) {
            var dDays = params.pause ? 0 : ddt * params.speed;
            simDays += dDays;
            placeAll(dDays);

            // 小行星带：按各自轨道周期随模拟时间推进
            beltRings.forEach(function (b) {
              b.mesh.rotation.y += dDays * (Math.PI * 2) / b.period;
            });

            // 陨石：高偏心轨道，同样解开普勒方程
            meteorites.forEach(function (m) {
              if (!params.belt) { m.mesh.visible = false; return; }
              m.mesh.visible = true;
              var el = m.el;
              var aU = sc.dist(el.a);
              var M = ((el.L0 - el.peri) * D2R) + (Math.PI * 2) / el.period * simDays;
              var pt = orbitPoint(el, M, aU, el.e);
              m.mesh.position.copy(pt);
              var s = mode === 'real' ? 0.0026 : 0.11 + (el.e - 0.2) * 0.26;
              m.mesh.scale.setScalar(s);
              m.mesh.rotation.x += ddt * m.spin;
              m.mesh.rotation.y += ddt * m.spin * 0.7;
            });

            controls.autoRotate = tour.active() ? false : !!params.autoRotate;
          });

          // 流星按真实时间走，不受时间倍率影响（它是背景氛围）
          updateMeteors(dt);

          // 拾取球随相机距离放大
          planets.forEach(function (it, i) {
            var d = camera.position.distanceTo(it.holder.position);
            var rr = Math.max(geoState[i].r * 2.4, d * 0.008);
            it.pick.scale.setScalar(rr);
          });

          hudAcc += dt;
          if (hudAcc > 0.2) { hudAcc = 0; updateHud(); }

          declutAcc += dt;
          if (declutAcc > 0.18) { declutAcc = 0; declutterLabels(); }
        },

        setParam: function (key, v) {
          if (key === 'tour') { tour.toggle(); return; }
          if (key === 'speed') { params.speed = v; updateHud(); return; }
          if (key === 'pause') { params.pause = !!v; updateHud(); return; }
          if (key === 'scale') {
            if (v === mode) { btnScaleNote(); return; }
            mode = v;
            params.scale = v;
            applyScale();
            return;
          }
          if (key === 'orbit') { orbitLines.forEach(function (l) { l.visible = !!v; }); return; }
          if (key === 'label') { sunLabel.visible = !!v; declutterLabels(); return; }
          if (key === 'belt') {
            beltGroup.visible = !!v;
            return;
          }
          if (key === 'meteor') {
            meteors.forEach(function (m) { if (!v) m.line.visible = false; });
            return;
          }
          if (key === 'autoRotate') { controls.autoRotate = !!v; return; }
        },

        onClick: function (ndc) {
          ray.setFromCamera({ x: ndc.x, y: ndc.y }, camera);
          var list = [sunMesh].concat(planets.map(function (it) { return it.pick; }));
          var hit = ray.intersectObjects(list, false);
          if (!hit.length) { HL.tooltip.hide(); return; }
          var obj = hit[0].object;
          var info;
          if (obj === sunMesh) info = infoSun;
          else if (infoOf[obj.uuid]) info = planetInfo(infoOf[obj.uuid]);
          else { HL.tooltip.hide(); return; }
          var html = '<div class="tt-title">' + info.title + '</div>';
          info.rows.forEach(function (r) { html += '<div class="tt-row">' + r[0] + '：<b>' + r[1] + '</b></div>'; });
          HL.tooltip.show(html, ndc.clientX, ndc.clientY);
        },

        dispose: function () {
          window.removeEventListener('keydown', onKey);
          tour.dispose();
          if (hud && hud.parentNode) hud.parentNode.removeChild(hud);
          if (ctx.setNote) ctx.setNote('');
        }
      };
    }
  });

  /* ================= 讲解步骤 ================= */
  function buildTourSteps(getPlanets) {
    function P(i) { return getPlanets()[i]; }
    function near(i, dist, height) {
      return function () {
        var p = P(i).holder.position;
        var len = Math.sqrt(p.x * p.x + p.z * p.z) || 1;
        var ux = p.x / len, uz = p.z / len;
        var a = dist * 0.68, b = dist * 0.95;
        return [[p.x + ux * a - uz * b, height, p.z + uz * a + ux * b], [p.x, 0, p.z]];
      };
    }
    function at(i) { return function () { return P(i).holder.position; }; }
    function rOf(i) { return function () { return P(i).tiltG.scale.x; } }

    return [
      {
        t: '一、这一刻的太阳系',
        d: '画面里的位置不是随机摆的：八颗行星按 J2000 历元的真实轨道根数（半长轴、偏心率、倾角、升交点、近日点幅角、平黄经）逐帧解开普勒方程得到。左下角的日期是模拟出来的——它会随时间流速往前走。默认「可视化压缩」把轨道与半径分别压缩，只为看清；右侧可一键切到「真实比例」，那时海王星在 5,400 单位之外，地球半径只有 0.0077。',
        exp: '把时间流速拉到 30 天/秒，盯住水星与海王星：一个 88 天一圈，一个 165 年才一圈。',
        cam: [[0, 62, 118], [0, 0, 0]],
        pulse: null
      },
      {
        t: '二、太阳：99.86% 的质量在这里',
        d: '太阳半径 696,000 km，是地球的 109 倍；它独占太阳系 99.86% 的质量。行星之所以被拴在轨道上，靠的就是这份质量。核心每秒把约 6 亿吨氢聚变成氦，其中约 400 万吨质量直接变成光——按 E=mc²，这就是整张画面里所有亮度的来源。',
        exp: '点击太阳，查看它的真实参数卡。',
        cam: [[0, 9, 22], [0, 0, 0]],
        pulse: function () { return { x: 0, y: 0, z: 0 }; },
        r: function () { return 3.4; }
      },
      {
        t: '三、水星：偏心率把速度写进轨道',
        d: '水星的偏心率高达 0.206，是八大行星中最「扁」的轨道：近日点 0.307 AU，远日点 0.467 AU，相差 52%。按开普勒第二定律，它在近日点跑得最快（约 58.98 km/s），远日点最慢（约 38.86 km/s）——这个速度差不是手动调出来的，而是解方程解出来的。把时间调慢，能看出它在近日点明显加速。',
        exp: '把时间流速调到 0.5 天/秒，观察水星在轨道最扁一端明显加速。',
        cam: near(0, 9, 3.2),
        pulse: at(0),
        r: function () { return Math.max(rOf(0)() * 3.2, 0.4); }
      },
      {
        t: '四、金星与地球：0.72 与 1.00 AU',
        d: '金星轨道倾角 3.39°、偏心率只有 0.0068，几乎是正圆。它自转周期 243 天且方向与公转相反（逆行），一天比一年还长。地球轨道倾角定义为 0°——黄道面就是以地球公转面为基准的；偏心率 0.0167，近日点与远日点只差 3.4%，所以「地球离太阳近时才热」是个常见误解。',
        exp: '切到「真实比例」，两颗行星都会缩成几乎看不见的点——这才是真实的空旷。',
        cam: [[0, 22, 40], [0, 0, 0]],
        pulse: at(2),
        r: function () { return Math.max(rOf(2)() * 3.4, 0.3); }
      },
      {
        t: '五、火星与小行星带',
        d: '火星偏心率 0.0934、倾角 1.85°，公转 687 天。火星之外 2.06–3.27 AU 是小行星带：画面里 2,700 多块岩石分五层，每层的转速按 T=365.25·a^1.5 计算，所以内侧确实比外侧快。真实的带内物质总质量不到月球的 4%，探测器穿过时几乎什么也碰不到——画面里的密集只是示意。',
        exp: '关掉「小行星带」对比：它只占轨道之间很窄的一条。',
        cam: [[0, 16, 34], [0, 0, 0]],
        pulse: at(3),
        r: function () { return Math.max(rOf(3)() * 3.4, 0.3); }
      },
      {
        t: '六、木星：9.9 小时转一圈',
        d: '木星半径 69,911 km，是地球的 11 倍，质量是其余七颗行星总和的 2.5 倍。它的自转周期只有 9 小时 55 分——一个直径 14 万公里的球，用不到 10 小时转完一圈，赤道线速度约 12.6 km/s。大红斑是一场持续了至少 300 年的反气旋风暴，直径曾经能装下三个地球。',
        exp: '时间流速调到 1 天/秒，木星表面会飞快掠过；土星环在同一倍率下几乎不动。',
        cam: near(4, 16, 7),
        pulse: at(4),
        r: function () { return Math.max(rOf(4)() * 3.0, 0.6); }
      },
      {
        t: '七、土星环：28 万公里宽，几十米厚',
        d: '土星环内缘 74,500 km、外缘 140,220 km，宽约 6.57 万公里（直径 28 万公里），但平均厚度只有约 10–100 米。按比例做成一整张纸，比保鲜膜还薄得多。环的主要成分是水冰颗粒，被土星 26.73° 的轴倾角带着一起倾斜——所以从地球上看，它的开合周期约 29.5 年。',
        exp: '点选土星，看「轴倾角 26.73°」；再拖动视角压到环平面，能看出它有多薄。',
        cam: near(5, 20, 9),
        pulse: at(5),
        r: function () { return Math.max(rOf(5)() * 2.6, 0.7); }
      },
      {
        t: '八、天王星与海王星：躺着与狂奔',
        d: '天王星轴倾角 97.77°——它几乎是躺着绕太阳滚，两极各有 42 年极昼与 42 年极夜。海王星倾角 28.32°，公转 164.8 年：1846 年靠数学预测被发现，到 2011 年才刚绕完第一圈。它们的轨道半径 19.19 与 30.07 AU，正是开普勒第三定律的最佳标尺。',
        exp: '把「相机环绕」打开，从天球北极俯视，轨道倾角会变得非常直观。',
        cam: [[0, 78, 128], [0, 0, 0]],
        pulse: at(6),
        r: function () { return Math.max(rOf(6)() * 2.8, 0.5); }
      },
      {
        t: '九、T² ∝ a³：一条定律统一整张盘',
        d: '把半长轴 a（AU）与周期 T（年）代进开普勒第三定律：水星 0.387³=0.058，T=0.241 年，平方 0.058；地球 1³=1，T=1；海王星 30.07³=27,190，T=164.8，平方 27,160。四百年过去，这条 1619 年从观测数据里总结出的经验规律，仍然是今天计算轨道的第一把尺子——而它只是牛顿万有引力定律的一个推论。',
        exp: '把时间流速拉到 365 天/秒：地球一秒一圈，水星一秒四圈，海王星两年才走完一圈。',
        cam: [[0, 62, 116], [0, 0, 0]],
        pulse: null
      }
    ];
  }

})();
