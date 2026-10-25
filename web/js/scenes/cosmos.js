/**
 * 场景：星系与宇宙（新增 · 第 1 章的「家门口的宇宙」）
 *
 * 一个模型三种看法，用 setParam('view', ...) 切换：
 *   sky     站在银盘内侧仰望 —— 银河带横过天顶
 *   galaxy  退到 12 万光年外 —— 四条旋臂与银心
 *   deep    再退到星系群 —— 深空里的星系与纤维状结构
 *
 * 为什么要它：脚本从「甲骨 — 观星 — 太阳系 — 银河 — 微观」一路走下来，
 * 太阳系之外需要一层尺度更大的落点；15 个旧场景里没有星系尺度。
 *
 * 尺度约定：1 单位 = 1 万光年。银盘半径 12、厚 0.3；太阳在 r=8.2 的猎户臂上。
 * 三组点云按 view 显隐，互不同时在场，弱设备也只画一组。
 */
(function (global) {
  'use strict';

  var HL = global.HL;
  if (!HL) return;

  global.HL.registerScene({
    id: 'cosmos',
    name: '星系与宇宙',
    short: '从银河内侧仰望，再退到星系之外',
    icon: '🌌',
    fov: 55,
    minDistance: 0.6,
    maxDistance: 520,
    desc: '十万颗恒星组成的旋涡星系：盘面内侧仰望银河带，退到十二万光年外看四条旋臂，再远到星系群的纤维结构',
    controls: [
      {
        type: 'buttons', key: 'view', label: '观察位置', value: 'sky', options: [
          { label: '仰望银河', value: 'sky' },
          { label: '星系全貌', value: 'galaxy' },
          { label: '深空', value: 'deep' }
        ]
      },
      { type: 'check', key: 'spin', label: '星系自转', value: true },
      { type: 'check', key: 'labels', label: '结构标注', value: true },
      { type: 'check', key: 'dust', label: '暗尘带', value: true },
      { type: 'range', key: 'glow', label: '银心强度', min: 0, max: 2, step: 0.05, value: 1 }
    ],

    create: function (ctx) {
      var THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera, controls = ctx.controls;
      var P = { view: 'sky', spin: true, labels: true, dust: true, glow: 1 };

      /* ---------------- 通用工具 ---------------- */
      function gauss() {
        var u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      }

      var COL = {
        core: [1.0, 0.83, 0.55],
        mid: [0.92, 0.96, 1.0],
        outer: [0.58, 0.76, 1.0],
        hii: [1.0, 0.56, 0.82],
        red: [1.0, 0.72, 0.62]
      };

      function mix(a, b, k) {
        return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
      }

      /* 柔边圆点贴图：THREE 无贴图的 Points 渲染成实心方块——银河俯瞰时点很小
       * 看不出来，但速览的俯冲镜头冲到 1.5 单位时满屏马赛克，必须给柔边纹理 */
      var dotTex = (function () {
        var cv = document.createElement('canvas');
        cv.width = cv.height = 64;
        var c = cv.getContext('2d');
        var g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(cv);
      })();

      function pointsFrom(arr, opt) {
        var g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr.pos), 3));
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(arr.col), 3));
        var m = new THREE.PointsMaterial({
          size: opt.size, sizeAttenuation: opt.att !== false,
          map: dotTex, vertexColors: true, transparent: true,
          opacity: opt.op === undefined ? 0.95 : opt.op,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });
        return new THREE.Points(g, m);
      }

      /* ---------------- 1. 银盘（旋涡星系） ---------------- */
      var ARMS = 4;
      var R_DISK = 11.6;

      function buildDisk(count, opt) {
        opt = opt || {};
        var pos = [], col = [], i, r, th, y, arm, c, t, spread;
        for (i = 0; i < count; i++) {
          // 半径：向内密集（幂次 < 1）
          r = 0.9 + Math.pow(Math.random(), 0.62) * (R_DISK - 0.9);
          arm = (Math.random() * ARMS) | 0;
          // 旋臂：对数螺线 + 随半径变宽的散布
          spread = 0.10 + r * 0.052;
          th = arm * (Math.PI * 2 / ARMS) + Math.log(1 + r * 0.42) * 2.4 + gauss() * spread;
          // 盘厚：中心厚、外缘薄
          y = gauss() * (0.10 + 0.30 * Math.exp(-r / 4.5));
          r += gauss() * 0.18;
          pos.push(Math.cos(th) * r, y, Math.sin(th) * r);

          // 颜色：内暖外冷，少量电离氢区（粉）
          t = Math.min(1, r / R_DISK);
          c = t < 0.34 ? mix(COL.core, COL.mid, t / 0.34) : mix(COL.mid, COL.outer, (t - 0.34) / 0.66);
          if (Math.random() < 0.022) c = COL.hii;
          var b = 0.55 + Math.random() * 0.45;
          col.push(c[0] * b, c[1] * b, c[2] * b);
        }
        return pointsFrom({ pos: pos, col: col }, { size: opt.size || 0.085 });
      }

      function buildBulge(count) {
        var pos = [], col = [], i, r, c, b;
        for (i = 0; i < count; i++) {
          r = Math.abs(gauss()) * 1.35;
          if (r > 2.8) r = 2.8 - Math.random() * 0.4;
          var th = Math.random() * Math.PI * 2;
          var ph = Math.acos(2 * Math.random() - 1);
          pos.push(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.72, r * Math.sin(ph) * Math.sin(th));
          c = mix(COL.core, COL.mid, Math.random() * 0.55);
          b = 0.6 + Math.random() * 0.4;
          col.push(c[0] * b, c[1] * b, c[2] * b);
        }
        return pointsFrom({ pos: pos, col: col }, { size: 0.11, op: 0.92 });
      }

      function buildHalo(count) {
        var pos = [], col = [], i, r, c, b;
        for (i = 0; i < count; i++) {
          r = 3 + Math.pow(Math.random(), 0.55) * 24;
          var th = Math.random() * Math.PI * 2;
          var ph = Math.acos(2 * Math.random() - 1);
          pos.push(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.6, r * Math.sin(ph) * Math.sin(th));
          c = mix(COL.mid, COL.outer, 0.5);
          b = 0.22 + Math.random() * 0.3;
          col.push(c[0] * b, c[1] * b, c[2] * b);
        }
        return pointsFrom({ pos: pos, col: col }, { size: 0.09, op: 0.5 });
      }

      var galaxy = new THREE.Group();
      var disk = buildDisk(26000);
      var bulge = buildBulge(7000);
      var halo = buildHalo(3600);
      galaxy.add(disk); galaxy.add(bulge); galaxy.add(halo);

      // 暗尘带：沿旋臂的短弧，用低透明度深色线段压出层次（additive 场景里"减"不明显，
      // 因此改用极暗的蓝紫色加一层——观感上是把亮带切出缝隙）
      var dustGroup = new THREE.Group();
      (function () {
        var pos = [], i;
        for (i = 0; i < 900; i++) {
          var r = 2 + Math.pow(Math.random(), 0.7) * 9.2;
          var arm = (Math.random() * ARMS) | 0;
          var th = arm * (Math.PI * 2 / ARMS) + Math.log(1 + r * 0.42) * 2.4 + gauss() * 0.16;
          var th2 = th + 0.06 + Math.random() * 0.10;
          var y = gauss() * 0.055;
          pos.push(Math.cos(th) * r, y, Math.sin(th) * r);
          pos.push(Math.cos(th2) * (r + 0.22), y, Math.sin(th2) * (r + 0.22));
        }
        var g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
        var m = new THREE.LineBasicMaterial({
          color: 0x0a0f1e, transparent: true, opacity: 0.55, depthWrite: false
        });
        dustGroup.add(new THREE.LineSegments(g, m));
      })();
      galaxy.add(dustGroup);

      // 银心辉光
      var coreGlow = new THREE.Sprite(ctx.glowSprite('rgba(255,206,140,0.85)'));
      coreGlow.scale.setScalar(7.5);
      coreGlow.material.opacity = 0.85;
      galaxy.add(coreGlow);
      var coreGlow2 = new THREE.Sprite(ctx.glowSprite('rgba(255,255,255,0.9)'));
      coreGlow2.scale.setScalar(2.4);
      galaxy.add(coreGlow2);

      // 太阳位置标记（猎户臂，距银心 8.2 单位 ≈ 2.6 万光年）
      var SUN_R = 8.2;
      var SUN_TH = Math.log(1 + SUN_R * 0.42) * 2.4;
      var sunPos = new THREE.Vector3(Math.cos(SUN_TH) * SUN_R, 0, Math.sin(SUN_TH) * SUN_R);
      var sunRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.42, 0.022, 6, 48),
        new THREE.MeshBasicMaterial({ color: 0x4de2ff, transparent: true, opacity: 0.9, depthWrite: false })
      );
      sunRing.rotation.x = Math.PI / 2;
      sunRing.position.copy(sunPos);
      galaxy.add(sunRing);
      var sunGlow = new THREE.Sprite(ctx.glowSprite('rgba(77,226,255,0.9)'));
      sunGlow.scale.setScalar(1.1);
      sunGlow.position.copy(sunPos);
      galaxy.add(sunGlow);

      galaxy.rotation.z = 0.10;
      scene.add(galaxy);

      /* ---------------- 2. 仰望银河（天球） ---------------- */
      var skyGroup = new THREE.Group();
      var SKY_R = 70;

      function buildBand(count) {
        var pos = [], col = [], i, th, lat, r, c, b;
        for (i = 0; i < count; i++) {
          th = Math.random() * Math.PI * 2;
          // 银纬：高斯薄带 + 10% 的厚晕，形成"星云感"
          lat = (Math.random() < 0.86 ? gauss() * 3.4 : gauss() * 13);
          r = SKY_R * (0.92 + Math.random() * 0.12);
          var y = Math.tan(lat * Math.PI / 180) * r;
          pos.push(Math.cos(th) * r, y, Math.sin(th) * r);
          // 沿带方向的密度调制：几段更亮的星云
          var cloud = 0.45 + 0.55 * Math.pow(Math.max(0, Math.sin(th * 3.1 + 1.2)), 2);
          b = (0.35 + Math.random() * 0.65) * cloud;
          c = Math.random() < 0.06 ? COL.core : (Math.random() < 0.1 ? COL.outer : COL.mid);
          col.push(c[0] * b, c[1] * b, c[2] * b);
        }
        return pointsFrom({ pos: pos, col: col }, { size: 1.5, att: false, op: 0.9 });
      }

      function buildSkyStars(count) {
        var pos = [], col = [], i;
        for (i = 0; i < count; i++) {
          var th = Math.random() * Math.PI * 2;
          var ph = Math.acos(2 * Math.random() - 1);
          var r = SKY_R * 1.04;
          pos.push(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th));
          var b = 0.25 + Math.random() * 0.75;
          var tint = Math.random();
          col.push(b * (tint > 0.82 ? 1 : 0.86), b * 0.93, b * (tint < 0.2 ? 1 : 0.9));
        }
        return pointsFrom({ pos: pos, col: col }, { size: 1.05, att: false, op: 0.85 });
      }

      skyGroup.add(buildBand(9000));
      skyGroup.add(buildSkyStars(3200));
      // 天顶银河带的一条极淡辉光，补足"亮带"的整体亮度
      var bandGlow = new THREE.Sprite(ctx.glowSprite('rgba(150,190,255,0.30)'));
      bandGlow.position.set(-24, 6, -54);
      bandGlow.scale.set(74, 26, 1);
      bandGlow.material.opacity = 0.32;
      skyGroup.add(bandGlow);
      scene.add(skyGroup);

      /* ---------------- 3. 深空（星系群 + 纤维） ---------------- */
      var deepGroup = new THREE.Group();

      function buildDeep(count, size, op) {
        var pos = [], col = [], i;
        for (i = 0; i < count; i++) {
          // 沿三条主纤维分布：一条直线 + 高斯横向抖动
          var fil = (Math.random() * 3) | 0;
          var t = (Math.random() - 0.5) * 2;
          var bx, by, bz;
          if (fil === 0) { bx = t * 150; by = t * 26 + gauss() * 12; bz = t * 40 + gauss() * 14; }
          else if (fil === 1) { bx = -t * 40 + gauss() * 14; by = t * 120 + gauss() * 16; bz = t * 30 + gauss() * 16; }
          else { bx = t * 60 + gauss() * 16; by = -t * 70 + gauss() * 14; bz = -t * 110 + gauss() * 20; }
          pos.push(bx, by, bz);
          var c = Math.random() < 0.3 ? COL.core : (Math.random() < 0.5 ? COL.mid : COL.outer);
          var b = 0.4 + Math.random() * 0.6;
          col.push(c[0] * b, c[1] * b, c[2] * b);
        }
        return pointsFrom({ pos: pos, col: col }, { size: size, att: false, op: op });
      }

      deepGroup.add(buildDeep(1400, 1.1, 0.55));
      deepGroup.add(buildDeep(700, 2.2, 0.8));
      deepGroup.add(buildDeep(220, 3.8, 1));

      // 纤维连线：把同一条链上的星系连起来（极淡）
      (function () {
        var pos = [], i;
        for (i = 0; i < 220; i++) {
          var t = (Math.random() - 0.5) * 2;
          var t2 = Math.min(1, t + 0.06);
          var ax = t * 150, ay = t * 26 + gauss() * 6, az = t * 40 + gauss() * 6;
          var bx2 = t2 * 150, by2 = t2 * 26 + gauss() * 6, bz2 = t2 * 40 + gauss() * 6;
          pos.push(ax, ay, az, bx2, by2, bz2);
        }
        var g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
        deepGroup.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({
          color: 0x2a4b7a, transparent: true, opacity: 0.32, depthWrite: false
        })));
      })();

      // 远去的自家星系（放在深空视野侧后方，提醒尺度连续性）
      var homeGalaxy = new THREE.Sprite(ctx.glowSprite('rgba(200,220,255,0.75)'));
      homeGalaxy.position.set(-64, 18, -86);
      homeGalaxy.scale.set(9, 3.2, 1);
      homeGalaxy.material.opacity = 0.6;
      deepGroup.add(homeGalaxy);
      scene.add(deepGroup);

      /* ---------------- 标注 ---------------- */
      var labels = new THREE.Group();
      function label(text, pos, color, scale) {
        var sp = ctx.makeText(text, { color: color || '#cfe4ff', size: 40, scale: scale || 0.9 });
        sp.position.copy(pos);
        labels.add(sp);
        return sp;
      }
      label('银心 · 人马座 A*', new THREE.Vector3(0, 1.5, 0), 'rgba(255,220,160,0.95)', 1.05);
      label('太阳系 · 距银心 2.6 万光年', new THREE.Vector3(sunPos.x, 0.9, sunPos.z), 'rgba(120,230,255,0.95)', 0.92);
      label('银河系 · 四条旋臂', new THREE.Vector3(0, 2.2, -11.4), 'rgba(180,210,255,0.8)', 0.95);
      var deepLabel = label('星系群 · 宇宙网', new THREE.Vector3(0, 34, -70), 'rgba(180,210,255,0.8)', 1.1);
      scene.add(labels);

      /* ---------------- 视角 ---------------- */
      function setView(v) {
        if (v !== 'sky' && v !== 'galaxy' && v !== 'deep') return;
        P.view = v;
        skyGroup.visible = (v === 'sky');
        galaxy.visible = (v === 'galaxy');
        deepGroup.visible = (v === 'deep');
        labels.visible = P.labels && (v !== 'deep');
        deepLabel.visible = P.labels && (v === 'deep');
        dustGroup.visible = P.dust && (v === 'galaxy');

        if (v === 'sky') {
          camera.position.set(0, 0.4, 0);
          controls.target.set(-18, 7.5, -34);
          camera.fov = 62;
        } else if (v === 'galaxy') {
          camera.position.set(0, 15.5, 21);
          controls.target.set(0, 0, 0);
          camera.fov = 52;
        } else {
          camera.position.set(0, 74, 168);
          controls.target.set(0, 6, -6);
          camera.fov = 58;
        }
        camera.updateProjectionMatrix();
        controls.syncFromCamera();
        controls.saveHome();
      }

      setView('sky');

      return {
        update: function (dt, t) {
          if (P.spin) {
            galaxy.rotation.y += dt * 0.016;
            skyGroup.rotation.y += dt * 0.0035;
          }
          // 银心呼吸 + 太阳标记脉动
          var k = 1 + Math.sin(t * 1.1) * 0.03;
          coreGlow.scale.setScalar(7.5 * k * (0.7 + P.glow * 0.3));
          coreGlow.material.opacity = Math.min(1, 0.55 + P.glow * 0.35);
          var pr = 1 + Math.sin(t * 2.0) * 0.16;
          sunGlow.scale.setScalar(1.1 * pr);
          sunRing.scale.setScalar(pr);
        },
        /* 供「两分钟速览」使用：星系在自转，太阳标记的世界坐标每帧都在变，
         * 俯冲镜头必须现取当前位置，写死坐标会冲偏（自转 1°/s 量级）。 */
        focus: function (name) {
          if (name !== 'sun' || galaxy.visible === false) return null;
          var v = new THREE.Vector3();
          sunGlow.getWorldPosition(v);
          return v;
        },
        setParam: function (key, v) {
          if (key === 'view') { setView(v); return; }
          if (key === 'spin') { P.spin = !!v; return; }
          if (key === 'labels') { P.labels = !!v; labels.visible = P.labels && P.view !== 'deep'; deepLabel.visible = P.labels && P.view === 'deep'; return; }
          if (key === 'dust') { P.dust = !!v; dustGroup.visible = P.dust && P.view === 'galaxy'; return; }
          if (key === 'glow') { P.glow = +v; return; }
        },
        dispose: function () {
          [galaxy, skyGroup, deepGroup, labels].forEach(function (g) {
            if (g.parent) g.parent.remove(g);
          });
          HL.disposeObject(galaxy);
          HL.disposeObject(skyGroup);
          HL.disposeObject(deepGroup);
          HL.disposeObject(labels);
        }
      };
    }
  });

})(window);
