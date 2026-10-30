/**
 * 场景：硅基芯片 —— NVIDIA GB300 计算托盘（写实外观 + 点击拆解）
 *
 * 建模依据：GB300 NVL72 compute tray 上半区实拍（用户提供参考图）
 *   顶部：2 × NVLink 连接器（黑色壳体 + 金手指）
 *   上部：2 × Blackwell Ultra GPU 封装（金色金属框 + 双 die + 8 组 HBM3e）
 *   中部：1 × Grace CPU（绿色基板 + 银色 IHS，激光刻字）
 *   下部：2 × ConnectX-8 SuperNIC（金色边框 + 中央 die）
 *   全域：VRM 电感阵列、去耦电容、螺丝、板边加固件、底部金手指
 *
 * 交互：
 *   · 点击任意部件 → 该部件沿 +Z 分层升起（封装框 / die / 基板分离）
 *   · 选中部件发光高亮，其余画面压暗，相机缓动聚焦
 *   · 再点一次或点空白处 → 收回、复位机位
 *   · 左键拖动旋转、滚轮 / 双指缩放（OrbitControls）
 *
 * 全部几何与贴图由代码生成，不依赖任何外部模型 / 图片。
 */
HL.registerScene({
  id: 'chip',
  name: '硅基芯片',
  short: 'GB300 计算托盘：点击部件逐层拆解',
  icon: '⬢',
  fov: 38,
  minDistance: 4.2,
  maxDistance: 46,
  desc: 'GB300 计算托盘复刻 · 点击部件逐层拆解，查看规格与作用。',

  controls: [
    { type: 'button', key: 'tour', label: '📖 讲解模式' },
    { type: 'button', key: 'explodeAll', label: '⧉ 全部拆解' },
    { type: 'button', key: 'resetView', label: '↺ 复位视角' },
    { type: 'check', key: 'spin', label: '缓慢旋转', value: false },
    { type: 'check', key: 'labels', label: '部件标注', value: true },
    { type: 'check', key: 'glow', label: '发光高亮', value: true }
  ],

  create: function (ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera;
    var controls = ctx.controls, renderer = ctx.renderer;
    var stage = document.getElementById('stage');

    var LOW = (window.innerWidth < 900) || ((navigator.hardwareConcurrency || 8) <= 4);
    var ANISO = (renderer.capabilities && renderer.capabilities.getMaxAnisotropy) ?
      renderer.capabilities.getMaxAnisotropy() : 4;

    /* 板级尺寸（世界单位，1 ≈ 50 mm） */
    var BW = 8.8, BH = 11.4, BT = 0.16;

    var root = new THREE.Group();
    root.rotation.set(0.025, -0.075, 0);
    scene.add(root);

    var boardG = new THREE.Group();     // 载板与静态装饰
    var partsG = new THREE.Group();     // 可拆解部件
    root.add(boardG); root.add(partsG);

    var clock = 0;

    /* ============================================================
       一、贴图（全部 canvas 程序化生成）
       ============================================================ */
    function srgb(tex) {
      if ('colorSpace' in tex && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      else if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
      return tex;
    }
    function cv(w, h) {
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      return c;
    }
    function rnd(seed) {
      var s = seed >>> 0;
      return function () {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      };
    }

    /* --- PCB：走线、过孔、焊盘、丝印 --- */
    function makePcb() {
      var W = 2048, H = Math.round(2048 * BH / BW);
      var c = cv(W, H), g = c.getContext('2d');
      function px(x) { return (x + BW / 2) / BW * W; }
      function py(y) { return (1 - (y + BH / 2) / BH) * H; }
      function sx(v) { return v / BW * W; }

      g.fillStyle = '#0a1210';
      g.fillRect(0, 0, W, H);
      // 大块覆铜区域
      var rg = g.createLinearGradient(0, 0, W, H);
      rg.addColorStop(0, 'rgba(18,38,30,.55)');
      rg.addColorStop(.5, 'rgba(10,22,18,.35)');
      rg.addColorStop(1, 'rgba(20,40,32,.5)');
      g.fillStyle = rg; g.fillRect(0, 0, W, H);

      var R = rnd(20261030);
      // 底层随机布线
      g.lineCap = 'round';
      for (var i = 0; i < 260; i++) {
        var x0 = R() * W, y0 = R() * H;
        var len = 60 + R() * 300, ang = (R() < .5 ? 0 : Math.PI / 2) + (R() - .5) * .18;
        var x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
        g.strokeStyle = 'rgba(28,66,54,' + (0.18 + R() * 0.3).toFixed(2) + ')';
        g.lineWidth = R() < .82 ? 1.15 : 2.4;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        if (R() < .3) {
          var x2 = x1 + Math.cos(ang + Math.PI / 2) * (20 + R() * 60);
          var y2 = y1 + Math.sin(ang + Math.PI / 2) * (20 + R() * 60);
          g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
        }
      }
      // 从封装向板边发散的差分对（45° 折线束）
      function bundle(cx, cy, n, step, dir) {
        for (var k = 0; k < n; k++) {
          var y = py(cy) + (k - n / 2) * step;
          var x0 = px(cx), x1 = dir > 0 ? W - 30 - R() * 120 : 30 + R() * 120;
          var mid = x0 + (x1 - x0) * 0.42;
          g.strokeStyle = 'rgba(34,80,64,' + (0.22 + R() * 0.22).toFixed(2) + ')';
          g.lineWidth = 1.1;
          g.beginPath();
          g.moveTo(x0, y); g.lineTo(mid, y);
          g.lineTo(mid + (x1 - mid) * .5, y + (dir > 0 ? -1 : 1) * 26);
          g.lineTo(x1, y + (dir > 0 ? -1 : 1) * 26);
          g.stroke();
        }
      }
      bundle(-3.3, 2.35, 16, 13, -1);
      bundle(3.3, 2.35, 16, 13, 1);
      bundle(0, -0.55, 12, 12, -1);
      bundle(0, -0.55, 12, 12, 1);
      bundle(-2.2, -3.6, 8, 12, -1);
      bundle(2.2, -3.6, 8, 12, 1);

      // 过孔
      for (var v = 0; v < 1500; v++) {
        var vx = R() * W, vy = R() * H, rr = 1.3 + R() * 1.6;
        g.beginPath(); g.arc(vx, vy, rr, 0, 6.2832);
        g.fillStyle = R() < .18 ? 'rgba(120,104,64,.55)' : 'rgba(30,58,48,.7)';
        g.fill();
        g.beginPath(); g.arc(vx, vy, rr * .42, 0, 6.2832);
        g.fillStyle = 'rgba(4,8,7,.85)'; g.fill();
      }
      // 焊盘（金）
      for (var p = 0; p < 220; p++) {
        var qx = R() * W, qy = R() * H;
        g.fillStyle = 'rgba(120,101,60,' + (0.22 + R() * 0.22).toFixed(2) + ')';
        g.fillRect(qx, qy, 5 + R() * 7, 3 + R() * 4);
      }

      // 丝印
      function silk(txt, x, y, size, align, alpha) {
        g.save();
        g.font = '700 ' + size + 'px Consolas, "Courier New", monospace';
        g.fillStyle = 'rgba(190,202,196,' + (alpha === undefined ? .46 : alpha) + ')';
        g.textAlign = align || 'left';
        g.fillText(txt, x, y);
        g.restore();
      }
      function frame(x, y, w, h, label, alpha) {
        g.strokeStyle = 'rgba(200,212,204,' + (alpha === undefined ? .28 : alpha) + ')';
        g.lineWidth = 1.6;
        g.strokeRect(px(x - w / 2), py(y + h / 2), sx(w), sx(h));
        if (label) silk(label, px(x - w / 2) + 6, py(y + h / 2) + 22, 19, 'left', .5);
      }
      frame(-2.2, 2.35, 3.5, 3.75, 'GPU0 · B300');
      frame(2.2, 2.35, 3.5, 3.75, 'GPU1 · B300');
      frame(0, -0.55, 2.6, 2.6, 'CPU · GRACE');
      frame(-1.55, -3.6, 1.45, 1.45, 'CX8_0', .22);
      frame(1.55, -3.6, 1.45, 1.45, 'CX8_1', .22);
      silk('NVIDIA  GB300  NVL72  COMPUTE TRAY', px(-3.9), py(-5.02), 26, 'left', .5);
      silk('P4242  ASSY  REV.A2', px(0.4), py(-5.02), 20, 'left', .36);
      silk('48V  ·  VRM  ·  DO NOT TOUCH', px(-3.9), py(-2.35), 17, 'left', .3);
      silk('NVLink-C2C', px(-0.95), py(5.28), 18, 'left', .42);
      silk('HBM3e  8-HI', px(-3.35), py(4.35), 15, 'left', .3);
      // 条码
      for (var b = 0; b < 34; b++) {
        var bx = px(2.2) + b * 6;
        g.fillStyle = 'rgba(200,210,204,' + (R() * .4 + .2).toFixed(2) + ')';
        g.fillRect(bx, py(-4.72), R() < .5 ? 2 : 4, 34);
      }
      // 板边测试点
      g.fillStyle = 'rgba(170,146,86,.5)';
      for (var e = 0; e < 22; e++) {
        g.fillRect(px(-4.15) + 0, py(-4.2 + e * .38), 8, 8);
        g.fillRect(px(4.1), py(-4.2 + e * .38), 8, 8);
      }

      var tex = new THREE.CanvasTexture(c);
      tex.anisotropy = ANISO;
      return srgb(tex);
    }

    /* --- 裸片：衍射虹彩 --- */
    function makeDie(seed, warm) {
      var c = cv(512, 512), g = c.getContext('2d');
      g.fillStyle = '#05060b'; g.fillRect(0, 0, 512, 512);
      var R = rnd(seed);
      var cols = warm
        ? ['rgba(120,88,32,.30)', 'rgba(74,56,132,.26)', 'rgba(34,96,112,.22)', 'rgba(150,116,60,.18)']
        : ['rgba(78,58,140,.32)', 'rgba(42,96,146,.28)', 'rgba(36,120,112,.22)', 'rgba(120,96,48,.17)'];
      for (var i = 0; i < 9; i++) {
        var lg = g.createLinearGradient(R() * 512, 0, R() * 512, 512);
        lg.addColorStop(0, 'rgba(0,0,0,0)');
        lg.addColorStop(.35 + R() * .3, cols[i % cols.length]);
        lg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = lg; g.fillRect(0, 0, 512, 512);
      }
      // 逻辑块
      for (var b = 0; b < 90; b++) {
        var x = R() * 470, y = R() * 470, w = 12 + R() * 46, h = 10 + R() * 40;
        g.fillStyle = 'rgba(140,160,190,' + (0.03 + R() * 0.05).toFixed(2) + ')';
        g.fillRect(x, y, w, h);
        g.strokeStyle = 'rgba(160,185,210,.05)';
        g.strokeRect(x, y, w, h);
      }
      // 细密网格（金属层）
      g.strokeStyle = 'rgba(120,150,180,.10)';
      g.lineWidth = 1;
      for (var k = 0; k < 64; k++) {
        g.beginPath(); g.moveTo(0, k * 8 + .5); g.lineTo(512, k * 8 + .5); g.stroke();
        g.beginPath(); g.moveTo(k * 8 + .5, 0); g.lineTo(k * 8 + .5, 512); g.stroke();
      }
      // 边缘收边
      g.strokeStyle = 'rgba(220,230,240,.18)';
      g.lineWidth = 3; g.strokeRect(3, 3, 506, 506);
      var tex = new THREE.CanvasTexture(c);
      tex.anisotropy = ANISO;
      return srgb(tex);
    }

    /* --- Grace CPU 顶盖：拉丝金属 + 激光刻字 --- */
    function makeIhs() {
      var c = cv(512, 512), g = c.getContext('2d');
      var lg = g.createLinearGradient(0, 0, 512, 512);
      lg.addColorStop(0, '#b6bec7');
      lg.addColorStop(.35, '#8b949e');
      lg.addColorStop(.6, '#a8b1ba');
      lg.addColorStop(1, '#6f7882');
      g.fillStyle = lg; g.fillRect(0, 0, 512, 512);
      // 拉丝
      var R = rnd(77);
      for (var i = 0; i < 900; i++) {
        g.strokeStyle = 'rgba(255,255,255,' + (R() * .07).toFixed(3) + ')';
        g.lineWidth = 1;
        var y = R() * 512;
        g.beginPath(); g.moveTo(0, y); g.lineTo(512, y + (R() - .5) * 3); g.stroke();
      }
      // 激光刻字
      g.fillStyle = 'rgba(24,29,35,.92)';
      g.font = '700 92px "Segoe UI", Arial, sans-serif';
      g.fillText('GRACE', 74, 226);
      g.font = '600 30px Consolas, monospace';
      g.fillStyle = 'rgba(30,36,44,.86)';
      g.fillText('NVIDIA', 76, 276);
      g.fillText('72-CORE  ARM  NEOVERSE  V2', 76, 318);
      g.font = '500 24px Consolas, monospace';
      g.fillStyle = 'rgba(42,50,60,.7)';
      g.fillText('2026  ·  TSMC 4N  ·  LPDDR5X', 76, 356);
      g.fillText('P4242-0001', 76, 392);
      // 边缘倒角高光
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 5;
      g.strokeRect(2.5, 2.5, 507, 507);
      var tex = new THREE.CanvasTexture(c);
      tex.anisotropy = ANISO;
      return srgb(tex);
    }

    var TEX = { pcb: makePcb(), dieA: makeDie(11, false), dieB: makeDie(23, true), ihs: makeIhs() };

    /* ============================================================
       二、材质与几何工具
       ============================================================ */
    function mkMat(kind) {
      var m;
      switch (kind) {
        case 'gold':
          m = new THREE.MeshStandardMaterial({ color: 0x6b5226, metalness: 0.62, roughness: 0.56, emissive: 0x0c0802, emissiveIntensity: 0.05 });
          break;
        case 'goldD':
          m = new THREE.MeshStandardMaterial({ color: 0x4e3c1c, metalness: 0.6, roughness: 0.6, emissive: 0x080502, emissiveIntensity: 0.04 });
          break;
        case 'silver':
          m = new THREE.MeshStandardMaterial({ color: 0x6d747e, metalness: 0.70, roughness: 0.55, emissive: 0x080c10, emissiveIntensity: 0.06 });
          break;
        case 'ihs':
          m = new THREE.MeshStandardMaterial({ map: TEX.ihs, color: 0x7d858f, metalness: 0.52, roughness: 0.52, emissive: 0x070a0e, emissiveIntensity: 0.03 });
          break;
        case 'sub':
          m = new THREE.MeshStandardMaterial({ color: 0x091510, metalness: 0.14, roughness: 0.82, emissive: 0x020704, emissiveIntensity: 0.04 });
          break;
        case 'die':
          m = new THREE.MeshStandardMaterial({ map: TEX.dieA, color: 0x7a8296, metalness: 0.26, roughness: 0.40, emissive: 0x090a14, emissiveIntensity: 0.16 });
          break;
        case 'die2':
          m = new THREE.MeshStandardMaterial({ map: TEX.dieB, color: 0x7a8296, metalness: 0.26, roughness: 0.42, emissive: 0x0c0812, emissiveIntensity: 0.16 });
          break;
        case 'black':
          m = new THREE.MeshStandardMaterial({ color: 0x0c0e11, metalness: 0.40, roughness: 0.62, emissive: 0x030405, emissiveIntensity: 0.10 });
          break;
        case 'plastic':
          m = new THREE.MeshStandardMaterial({ color: 0x101317, metalness: 0.18, roughness: 0.86, emissive: 0x030405, emissiveIntensity: 0.08 });
          break;
        case 'copper':
          m = new THREE.MeshStandardMaterial({ color: 0xa96f42, metalness: 0.92, roughness: 0.34, emissive: 0x1c0e05, emissiveIntensity: 0.2 });
          break;
        case 'ceramic':
          m = new THREE.MeshStandardMaterial({ color: 0x262420, metalness: 0.06, roughness: 0.94, emissive: 0x060503, emissiveIntensity: 0.03 });
          break;
        default:
          m = new THREE.MeshStandardMaterial({ color: 0x2a2e34, metalness: 0.7, roughness: 0.45 });
      }
      m.envMapIntensity = 0.50;
      m.userData.baseEmissive = m.emissiveIntensity;
      return m;
    }

    function box(w, h, d, mat, x, y, z, parent) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x || 0, y || 0, z || 0);
      if (parent) parent.add(m);
      return m;
    }
    function roundedPlate(w, h, r, depth, mat, parent) {
      var s = new THREE.Shape();
      var x = -w / 2, y = -h / 2;
      s.moveTo(x + r, y);
      s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
      s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
      s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
      var g = new THREE.ExtrudeGeometry(s, { depth: depth, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.015, bevelSegments: 1 });
      var m = new THREE.Mesh(g, mat);
      if (parent) parent.add(m);
      return m;
    }
    function framePlate(w, h, iw, ih, depth, mat, parent) {
      var s = new THREE.Shape();
      var r = 0.05, x = -w / 2, y = -h / 2;
      s.moveTo(x + r, y);
      s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
      s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
      s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
      var hole = new THREE.Path();
      var hx = -iw / 2, hy = -ih / 2;
      hole.moveTo(hx, hy); hole.lineTo(hx + iw, hy);
      hole.lineTo(hx + iw, hy + ih); hole.lineTo(hx, hy + ih);
      hole.lineTo(hx, hy);
      s.holes.push(hole);
      var g = new THREE.ExtrudeGeometry(s, { depth: depth, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.02, bevelSegments: 1 });
      var m = new THREE.Mesh(g, mat);
      if (parent) parent.add(m);
      return m;
    }

    /* ============================================================
       三、载板与静态元件
       ============================================================ */
    var pcbMat = new THREE.MeshStandardMaterial({ map: TEX.pcb, color: 0x8b938c, metalness: 0.26, roughness: 0.76 });
    pcbMat.envMapIntensity = 0.45;
    var pcbSide = new THREE.MeshStandardMaterial({ color: 0x08110f, metalness: 0.25, roughness: 0.80 });
    var pcb = new THREE.Mesh(new THREE.BoxGeometry(BW, BH, BT), [pcbSide, pcbSide, pcbSide, pcbSide, pcbMat, pcbSide]);
    boardG.add(pcb);

    /* 板边金属包边 */
    var edgeMat = mkMat('goldD');
    [[0, BH / 2 - 0.03, BW, 0.06], [0, -BH / 2 + 0.03, BW, 0.06],
     [-BW / 2 + 0.03, 0, 0.06, BH], [BW / 2 - 0.03, 0, 0.06, BH]].forEach(function (e) {
      box(e[2], e[3], 0.05, edgeMat, e[0], e[1], BT / 2 + 0.01, boardG);
    });

    /* 底部金手指连接器 */
    var fingerMat = mkMat('gold');
    var housing = box(BW - 0.5, 0.42, 0.26, mkMat('plastic'), 0, -BH / 2 + 0.34, BT / 2 + 0.11, boardG);
    var fingers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.055, 0.30, 0.02), fingerMat, 96);
    var dummy = new THREE.Object3D();
    for (var fi = 0; fi < 96; fi++) {
      dummy.position.set(-BW / 2 + 0.52 + fi * 0.0802, -BH / 2 + 0.34, BT / 2 + 0.245);
      dummy.updateMatrix(); fingers.setMatrixAt(fi, dummy.matrix);
    }
    boardG.add(fingers);

    /* 螺丝 */
    var screwGeo = new THREE.CylinderGeometry(0.115, 0.115, 0.05, 16);
    var screwMat = mkMat('silver');
    var screwPos = [[-3.95, 5.2], [3.95, 5.2], [-3.95, -5.25], [3.95, -5.25],
                    [-3.95, 1.15], [3.95, 1.15], [-3.95, -2.3], [3.95, -2.3],
                    [-0.85, 5.2], [0.85, 5.2]];
    screwPos.forEach(function (p) {
      var s = new THREE.Mesh(screwGeo, screwMat);
      s.rotation.x = Math.PI / 2;
      s.position.set(p[0], p[1], BT / 2 + 0.03);
      boardG.add(s);
      var hole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.055, 12), mkMat('black'));
      hole.rotation.x = Math.PI / 2;
      hole.position.set(p[0], p[1], BT / 2 + 0.045);
      boardG.add(hole);
    });

    /* 电容阵列（一次性实例化，静态） */
    (function caps() {
      var n = LOW ? 150 : 240;
      var geo = new THREE.BoxGeometry(0.07, 0.05, 0.045);
      var mat = mkMat('ceramic');
      var inst = new THREE.InstancedMesh(geo, mat, n);
      var R = rnd(99);
      var zones = [
        [-3.9, -3.1, 2.7, 3.1], [2.7, 3.9, -3.1, 3.1],
        [-3.9, -1.0, -4.9, -2.6], [1.0, 3.9, -4.9, -2.6],
        [-2.9, 2.9, 4.1, 4.9], [-2.9, 2.9, -0.95, 0.35]
      ];
      for (var i = 0; i < n; i++) {
        var z = zones[i % zones.length];
        var x = z[0] + R() * (z[1] - z[0]);
        var y = z[2] + R() * (z[3] - z[2]);
        dummy.position.set(x, y, BT / 2 + 0.035);
        dummy.rotation.set(0, 0, R() < .5 ? 0 : Math.PI / 2);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix(); inst.setMatrixAt(i, dummy.matrix);
      }
      boardG.add(inst);
    })();

    /* 电源 / 管理接口与加固件（对应实拍里几处黑色大连接器） */
    (function connectors() {
      var pm = mkMat('plastic');
      var sm = mkMat('silver');
      // 左下：电源输入
      box(1.18, 0.92, 0.34, pm, -3.18, -4.28, 0.20, boardG);
      box(0.86, 0.10, 0.06, mkMat('goldD'), -3.18, -4.02, 0.38, boardG);
      // 右下：两组信号连接器
      box(0.56, 0.86, 0.30, pm, 3.06, -4.30, 0.18, boardG);
      box(0.56, 0.46, 0.30, pm, 3.06, -3.55, 0.18, boardG);
      // 顶部左侧：管理接口
      box(0.72, 0.40, 0.26, pm, -3.12, 5.14, 0.17, boardG);
      // 板边 L 形加固片
      box(0.10, 1.5, 0.30, sm, -4.42, -0.4, 0.16, boardG);
      box(0.10, 1.5, 0.30, sm, 4.42, -0.4, 0.16, boardG);
    })();

    /* SMD 小件：贴着封装外围成排布置，撑起板面密度 */
    (function smd() {
      var n = LOW ? 130 : 230;
      var inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.095, 0.05, 0.032),
        new THREE.MeshStandardMaterial({ color: 0x1b1d21, metalness: 0.25, roughness: 0.8 }), n);
      var R = rnd(43);
      var zones = [
        [-3.35, -2.95, 0.5, 4.25], [2.95, 3.35, 0.5, 4.25],
        [-2.85, 2.85, -2.15, -1.55], [-2.85, 2.85, -4.55, -3.05],
        [-3.35, -2.35, -2.1, -1.3], [2.35, 3.35, -2.1, -1.3],
        [-1.95, 1.95, 4.45, 4.85]
      ];
      for (var i = 0; i < n; i++) {
        var z = zones[i % zones.length];
        dummy.position.set(z[0] + R() * (z[1] - z[0]), z[2] + R() * (z[3] - z[2]), BT / 2 + 0.03);
        dummy.rotation.set(0, 0, R() < .55 ? 0 : Math.PI / 2);
        dummy.scale.set(0.7 + R() * 0.8, 1, 1);
        dummy.updateMatrix(); inst.setMatrixAt(i, dummy.matrix);
      }
      boardG.add(inst);
    })();

    /* 侧边加固导轨 */
    var railMat = mkMat('black');
    [-1, 1].forEach(function (s) {
      box(0.16, BH - 1.2, 0.34, railMat, s * (BW / 2 + 0.06), 0.1, 0.12, boardG);
      box(0.24, 0.5, 0.5, mkMat('silver'), s * (BW / 2 + 0.06), BH / 2 - 0.75, 0.16, boardG);
      box(0.24, 0.5, 0.5, mkMat('silver'), s * (BW / 2 + 0.06), -BH / 2 + 0.95, 0.16, boardG);
    });

    /* ============================================================
       四、可拆解部件
       ============================================================ */
    var parts = {};      // id -> part
    var partList = [];

    function addPart(id, group, info, opt) {
      opt = opt || {};
      group.userData.part = id;
      partsG.add(group);
      var mats = [];
      group.traverse(function (o) {
        if (o.material) {
          var ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach(function (m) {
            if (mats.indexOf(m) < 0) mats.push(m);
            m.userData.baseEmissive = m.userData.baseEmissive === undefined ? (m.emissiveIntensity || 0) : m.userData.baseEmissive;
            if (m.emissive && m.userData.baseEmissiveColor === undefined) m.userData.baseEmissiveColor = m.emissive.getHex();
          });
        }
      });
      var p = {
        id: id, group: group, info: info, mats: mats,
        layers: opt.layers || [], anchor: opt.anchor || [0, 0, 0],
        glowColor: opt.glowColor === undefined ? 0x2fd8ff : opt.glowColor,
        t: 0, target: 0, delay: opt.delay || 0,
        tag: null, dot: null, line: null, glow: null
      };
      var gm = ctx.glowSprite('rgba(92,225,240,0.55)');
      var sp = new THREE.Sprite(gm);
      sp.scale.set((opt.glowSize || 3.4) * 0.62, (opt.glowSize || 3.4) * 0.62, 1);
      sp.position.set(opt.anchor ? opt.anchor[0] : 0, opt.anchor ? opt.anchor[1] : 0, 0.12);
      sp.material.opacity = 0;
      group.add(sp);
      p.glow = sp;
      parts[id] = p;
      partList.push(p);
      return p;
    }

    /* ---------- GPU 封装 ---------- */
    function buildGpu(x, y, id, name, dieTex, anchorSide) {
      var g = new THREE.Group();
      g.position.set(x, y, 0.02);
      g.scale.set(0.9, 0.9, 0.9);

      var subMat = mkMat('sub');
      var sub = box(3.5, 3.72, 0.09, subMat, 0, 0, 0.045, g);
      // 基板侧边焊盘
      var padMat = mkMat('goldD');
      for (var s = 0; s < 10; s++) {
        box(0.16, 0.05, 0.05, padMat, -1.55 + s * 0.34, -1.83, 0.06, g);
        box(0.16, 0.05, 0.05, padMat, -1.55 + s * 0.34, 1.83, 0.06, g);
      }

      // 8 组 HBM3e：左右各 4
      var hbmG = new THREE.Group(); g.add(hbmG);
      var hbmMat = new THREE.MeshStandardMaterial({ color: 0x2c3138, metalness: 0.38, roughness: 0.72, emissive: 0x030405, emissiveIntensity: 0.03 });
      hbmMat.envMapIntensity = 0.28;
      var hbmTop = mkMat('black');
      [-1.30, 1.30].forEach(function (hx) {
        for (var i = 0; i < 4; i++) {
          var hy = -1.32 + i * 0.88;
          box(0.40, 0.66, 0.10, hbmMat, hx, hy, 0.135, hbmG);
          box(0.34, 0.58, 0.015, hbmTop, hx, hy, 0.192, hbmG);
          box(0.34, 0.010, 0.015, mkMat('goldD'), hx, hy + 0.29, 0.199, hbmG);
        }
      });

      // 双 die
      var dieG = new THREE.Group(); g.add(dieG);
      [-0.53, 0.53].forEach(function (dx, i) {
        box(1.02, 2.52, 0.10, mkMat('die'), dx, 0, 0.145, dieG);
        var top = box(0.98, 2.46, 0.012, i === 0 ? mkMat('die') : mkMat('die2'), dx, 0, 0.202, dieG);
        top.material.map = TEX.dieA;
        top.material.color.setHex(i === 0 ? 0x7a8296 : 0x747c90);
        top.material.needsUpdate = true;
        // 裸片四周封边（seal ring），让暗色硅片有清晰轮廓
        var sealMat = new THREE.MeshStandardMaterial({ color: 0x8d8574, metalness: 0.6, roughness: 0.45, emissive: 0x0a0906, emissiveIntensity: 0.1 });
        box(1.02, 0.022, 0.012, sealMat, dx, 1.26, 0.203, dieG);
        box(1.02, 0.022, 0.012, sealMat, dx, -1.26, 0.203, dieG);
        box(0.022, 2.54, 0.012, sealMat, dx - 0.51, 0, 0.203, dieG);
        box(0.022, 2.54, 0.012, sealMat, dx + 0.51, 0, 0.203, dieG);
      });
      // die 间缝隙的填充胶
      box(0.06, 2.4, 0.03, mkMat('black'), 0, 0, 0.155, dieG);

      // 金色封装框
      var frame = framePlate(3.56, 3.78, 3.12, 3.38, 0.13, mkMat('gold'), g);
      frame.position.set(0, 0, 0.20);

      // 封装四角定位标记
      [[-1.62, -1.76], [1.62, -1.76], [-1.62, 1.76], [1.62, 1.76]].forEach(function (c) {
        box(0.12, 0.12, 0.02, mkMat('goldD'), c[0], c[1], 0.33, g);
      });

      var info = {
        name: name, en: 'BLACKWELL ULTRA GPU',
        params: [['制程', 'TSMC 4NP'], ['晶体管', '2080 亿'], ['显存', '288 GB HBM3e'], ['带宽', '8 TB/s']],
        desc: 'GB300 的计算核心。一个封装内含两颗光罩极限尺寸的裸片，通过 NV-HBI 以 10 TB/s 互连成一颗逻辑 GPU；四周 8 组 HBM3e 堆叠提供 288 GB 显存。'
      };
      var p = addPart(id, g, info, {
        layers: [
          { obj: frame, dz: 0.62, dy: 0.10, delay: 0.00 },
          { obj: hbmG, dz: 0.30, dy: 0.02, delay: 0.10 },
          { obj: dieG, dz: 0.20, dy: 0.02, delay: 0.16 }
        ],
        anchor: [0, 2.12, 0.3], glowColor: 0x6fe6ff, glowSize: 4.6
      });
      p.dieTex = dieTex;
      return p;
    }

    buildGpu(-2.18, 2.35, 'ga', 'Blackwell Ultra GPU · 0');
    buildGpu(2.18, 2.35, 'gb', 'Blackwell Ultra GPU · 1');

    /* ---------- Grace CPU ---------- */
    (function buildCpu() {
      var g = new THREE.Group();
      g.position.set(0, -0.55, 0.02);
      g.scale.set(0.92, 0.92, 0.92);

      var sub = box(2.62, 2.62, 0.08, mkMat('sub'), 0, 0, 0.04, g);
      // 基板上的小元件
      for (var i = 0; i < 8; i++) {
        box(0.10, 0.06, 0.035, mkMat('ceramic'), -1.2 + i * 0.34, -1.22, 0.09, g);
        box(0.10, 0.06, 0.035, mkMat('ceramic'), -1.2 + i * 0.34, 1.22, 0.09, g);
      }

      // 裸片（IHS 揭开后可见）
      var die = box(1.82, 1.82, 0.035, mkMat('die2'), 0, 0, 0.10, g);

      // IHS 顶盖
      var ihsG = new THREE.Group(); g.add(ihsG);
      var ihs = roundedPlate(2.06, 2.06, 0.10, 0.13, mkMat('silver'), ihsG);
      ihs.position.set(0, 0, 0.115);
      var ihsTop = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.0),
        new THREE.MeshStandardMaterial({ map: TEX.ihs, color: 0x7d858f, metalness: 0.52, roughness: 0.52, envMapIntensity: 0.4 }));
      ihsTop.position.set(0, 0, 0.272);
      ihsG.add(ihsTop);
      // 顶盖边框压痕
      box(2.10, 0.035, 0.02, mkMat('silver'), 0, 0.98, 0.25, ihsG);
      box(2.10, 0.035, 0.02, mkMat('silver'), 0, -0.98, 0.25, ihsG);

      // 四周去耦电容
      for (var k = 0; k < 7; k++) {
        box(0.09, 0.05, 0.04, mkMat('ceramic'), -0.9 + k * 0.3, -1.36, 0.09, g);
        box(0.09, 0.05, 0.04, mkMat('ceramic'), -0.9 + k * 0.3, 1.36, 0.09, g);
      }

      addPart('cpu', g, {
        name: 'Grace CPU', en: 'ARM NEOVERSE V2 · 72 CORES',
        params: [['核心', '72 × Neoverse V2'], ['内存', '480 GB LPDDR5X'], ['带宽', '512 GB/s'], ['互连', 'NVLink-C2C 900 GB/s']],
        desc: '托盘里的主控 CPU。72 个 Arm Neoverse V2 核心通过 NVLink-C2C 与两颗 GPU 共享统一内存地址空间，让 CPU 与 GPU 之间不必来回拷贝数据。'
      }, {
        layers: [
          { obj: ihsG, dz: 0.58, dy: 0.06, delay: 0.00 },
          { obj: die, dz: 0.16, dy: 0.0, delay: 0.12 }
        ],
        anchor: [0, 1.55, 0.3], glowColor: 0x9fe8ff, glowSize: 3.4
      });
    })();

    /* ---------- ConnectX-8 SuperNIC ---------- */
    function buildNic(x, id, name) {
      var g = new THREE.Group();
      g.position.set(x, -3.62, 0.02);
      g.scale.set(0.95, 0.95, 0.95);

      var sub = box(1.34, 1.34, 0.07, mkMat('sub'), 0, 0, 0.035, g);
      // 金手指（朝下的板边连接）
      for (var i = 0; i < 18; i++) {
        box(0.045, 0.10, 0.02, mkMat('gold'), -0.55 + i * 0.064, -0.72, 0.06, g);
      }
      // 中央 die
      var die = box(0.62, 0.62, 0.08, mkMat('die2'), 0, 0.05, 0.09, g);
      var dieTop = box(0.58, 0.58, 0.01, mkMat('die'), 0, 0.05, 0.135, g);

      // 金色边框
      var frame = framePlate(1.30, 1.30, 0.78, 0.78, 0.09, mkMat('gold'), g);
      frame.position.set(0, 0, 0.10);

      // 周边小元件
      for (var k = 0; k < 4; k++) {
        box(0.08, 0.06, 0.04, mkMat('ceramic'), -0.5 + k * 0.33, 0.54, 0.08, g);
      }
      // 侧边连接器
      box(0.22, 0.5, 0.14, mkMat('plastic'), -0.78, -0.2, 0.10, g);

      addPart(id, g, {
        name: name, en: 'CONNECTX-8 SUPERNIC',
        params: [['速率', '800 Gb/s'], ['总线', 'PCIe Gen 6'], ['网络', 'Spectrum-X Ethernet'], ['功能', 'RDMA / 多租户隔离']],
        desc: '负责把托盘接进集群网络。每颗提供 800 Gb/s 吞吐，GPU 的集合通信（All-Reduce、All-to-All）经由它走以太网，而不占用 CPU。'
      }, {
        layers: [
          { obj: frame, dz: 0.36, dy: 0.05, delay: 0.00 },
          { obj: die, dz: 0.18, dy: 0.0, delay: 0.10 },
          { obj: dieTop, dz: 0.18, dy: 0.0, delay: 0.10 }
        ],
        anchor: [0, 0.9, 0.25], glowColor: 0x6fe6ff, glowSize: 2.2
      });
    }
    buildNic(-1.58, 'na', 'ConnectX-8 · 0');
    buildNic(1.58, 'nb', 'ConnectX-8 · 1');

    /* ---------- NVLink 连接器 ---------- */
    (function buildNvlink() {
      var g = new THREE.Group();
      g.position.set(0, 5.02, 0.02);
      [-1.42, 1.42].forEach(function (x) {
        var c = new THREE.Group(); c.position.x = x; g.add(c);
        // 黑色壳体
        box(1.86, 0.72, 0.46, mkMat('plastic'), 0, 0, 0.24, c);
        // 顶部斜切盖
        box(1.86, 0.09, 0.50, mkMat('black'), 0, 0.38, 0.25, c);
        // 金手指槽
        box(1.62, 0.085, 0.03, mkMat('gold'), 0, 0.13, 0.475, c);
        box(1.62, 0.04, 0.03, mkMat('goldD'), 0, -0.05, 0.475, c);
        // 卡扣
        box(0.10, 0.30, 0.30, mkMat('silver'), 0.86, -0.05, 0.18, c);
        // 两侧导向柱
        box(0.08, 0.52, 0.08, mkMat('silver'), -0.82, -0.02, 0.34, c);
      });

      addPart('nvl', g, {
        name: 'NVLink 连接器', en: 'NVLink 5 · TRAY INTERCONNECT',
        params: [['代际', 'NVLink 5'], ['单 GPU 带宽', '1.8 TB/s'], ['托盘内', '2 个连接器'], ['拓扑', '全连接 NVLink 域']],
        desc: '托盘与 midplane 的神经接口。两颗 GPU 通过它与机柜内其余 70 颗 GPU 组成一个 72 卡的全连接 NVLink 域，跨 GPU 通信不必经过 PCIe 或网络。'
      }, {
        layers: [],
        anchor: [0, 0.45, 0.3], glowColor: 0x8fe0ff, glowSize: 3.0
      });
    })();

    /* ---------- VRM 供电阵列（实例化 + 逐颗错峰升起） ---------- */
    (function buildVrm() {
      var g = new THREE.Group();
      // 用一块不可见的拾取体覆盖供电区，方便点击
      var pick = box(1.1, 4.2, 0.30, new THREE.MeshBasicMaterial({ visible: false }), -3.95, 0.0, 0.15, g);
      var pick2 = box(1.1, 4.2, 0.30, new THREE.MeshBasicMaterial({ visible: false }), 3.95, 0.0, 0.15, g);
      pick.userData.pick = true; pick2.userData.pick = true;

      var geo = new THREE.BoxGeometry(0.26, 0.26, 0.22);
      var mat = mkMat('ceramic');
      mat.color.setHex(0x24282d);
      mat.metalness = 0.55; mat.roughness = 0.55;
      var list = [];
      [-1, 1].forEach(function (s) {
        for (var i = 0; i < 9; i++) {
          list.push([s * 3.92, 2.4 - i * 0.55]);
          if (i < 8) list.push([s * 3.52, 2.2 - i * 0.55]);
        }
      });
      // 板下沿一排
      for (var k = 0; k < 9; k++) list.push([-2.4 + k * 0.6, -4.72]);

      var inst = new THREE.InstancedMesh(geo, mat, list.length);
      var R = rnd(7);
      list.forEach(function (p, i) {
        dummy.position.set(p[0], p[1], 0.19);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 0.9 + R() * 0.3);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      });
      inst.userData.base = list.map(function (p, i) {
        return { x: p[0], y: p[1], z: 0.19, s: 0.9 + ((i * 37) % 10) / 33 };
      });
      g.add(inst);

      var p = addPart('vrm', g, {
        name: 'VRM 供电阵列', en: 'VOLTAGE REGULATOR MODULES',
        params: [['输入', '48 V 直流'], ['相数', '多相 Buck'], ['负载', '≈ 1.4 kW / GPU'], ['作用', '1.0 V 级精准稳压']],
        desc: '把 48 V 母线降到 0.8–1.0 V 的 GPU 核心电压。数十颗电感与数百颗电容紧贴封装布置，缩短供电路径以压低瞬态压降——这是 1.4 kW 级芯片能稳定运行的前提。'
      }, {
        layers: [], anchor: [-3.55, 1.15, 0.3], glowColor: 0xffc06a, glowSize: 2.6
      });
      p.inst = inst;
      p.instBase = inst.userData.base;
      p.instDirty = true;
    })();

    /* 部件级索引（供 HUD / 讲解引用） */
    var ALL_IDS = ['ga', 'gb', 'cpu', 'na', 'nb', 'nvl', 'vrm'];

    /* ============================================================
       五、环境、灯光、粒子
       ============================================================ */
    (function env() {
      var c = cv(1024, 512), g = c.getContext('2d');
      var lg = g.createLinearGradient(0, 0, 0, 512);
      lg.addColorStop(0, '#060d12');
      lg.addColorStop(.42, '#0a161c');
      lg.addColorStop(.52, '#18272f');
      lg.addColorStop(.62, '#081116');
      lg.addColorStop(1, '#03060a');
      g.fillStyle = lg; g.fillRect(0, 0, 1024, 512);
      // 柔光箱：给金属一条高光
      [[220, 120, 300, 90], [700, 150, 220, 70], [500, 60, 160, 50]].forEach(function (b) {
        var rg = g.createRadialGradient(b[0], b[1], 0, b[0], b[1], b[2]);
        rg.addColorStop(0, 'rgba(190,220,240,.45)');
        rg.addColorStop(.4, 'rgba(120,170,200,.10)');
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rg;
        g.fillRect(b[0] - b[2], b[1] - b[3], b[2] * 2, b[3] * 2);
      });
      var tex = new THREE.CanvasTexture(c);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      try {
        var pm = new THREE.PMREMGenerator(renderer);
        pm.compileEquirectangularShader();
        var rt = pm.fromEquirectangular(tex);
        scene.environment = rt.texture;
        tex.dispose(); pm.dispose();
      } catch (e) {
        scene.environment = tex;
      }
    })();

    scene.add(new THREE.AmbientLight(0x2c3f4a, 0.55));
    var key = new THREE.DirectionalLight(0xf2f8ff, 1.35); key.position.set(5, 8, 11); scene.add(key);
    var fill = new THREE.DirectionalLight(0x7fc8ff, 0.50); fill.position.set(-8, 2, 6); scene.add(fill);
    var rim = new THREE.DirectionalLight(0x2f7f9c, 0.65); rim.position.set(0, -6, -7); scene.add(rim);
    var warm = new THREE.PointLight(0xffbf7a, 4.5, 26, 2); warm.position.set(0, 3.2, 7); scene.add(warm);

    /* 背景网格与尘埃 */
    var dust;
    (function bg() {
      var N = LOW ? 130 : 240;
      var pos = new Float32Array(N * 3);
      var R = rnd(5);
      for (var i = 0; i < N; i++) {
        pos[i * 3] = (R() - .5) * 26;
        pos[i * 3 + 1] = (R() - .5) * 18;
        pos[i * 3 + 2] = -3 - R() * 12;
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      var mat = new THREE.PointsMaterial({ color: 0x5f9fb8, size: 0.035, transparent: true, opacity: 0.5, depthWrite: false });
      dust = new THREE.Points(geo, mat);
      scene.add(dust);
    })();

    /* ============================================================
       六、HUD
       ============================================================ */
    var hud = document.createElement('div');
    hud.className = 'chip-hud';
    hud.innerHTML =
      '<div class="ck-grid"></div><div class="ck-vig"></div>' +
      '<div class="ck-top"><span class="ck-logo">GB300<em>·</em>TRAY</span>' +
      '<span class="ck-sub" id="ckSub">NVIDIA GB300 NVL72 · COMPUTE TRAY</span></div>' +

      '<div class="ck-hint" id="ckHint">拖动旋转 · 滚轮缩放 · 点击部件拆解</div>' +
      '<div class="ck-list" id="ckList"></div>' +
      '<div class="ck-card" id="ckCard"></div>' +
      '<div class="ck-labels" id="ckLabels"></div>' +
      '<div class="ck-flash" id="ckFlash"></div>';
    stage.appendChild(hud);

    var elList = hud.querySelector('#ckList');
    var elCard = hud.querySelector('#ckCard');
    var elLabels = hud.querySelector('#ckLabels');
    var elFlash = hud.querySelector('#ckFlash');
    var elHint = hud.querySelector('#ckHint');
    var elSub = hud.querySelector('#ckSub');

    /* 部件清单 */
    elList.innerHTML = '<h5>部件清单<b>PARTS · ' + ALL_IDS.length + '</b></h5>' +
      ALL_IDS.map(function (id, i) {
        var p = parts[id];
        return '<button class="ck-row" data-id="' + id + '">' +
          '<span class="ck-no">' + (i < 9 ? '0' : '') + (i + 1) + '</span>' +
          '<span class="ck-nm">' + p.info.name + '</span>' +
          '<span class="ck-en">' + p.info.en.split(' · ')[0] + '</span>' +
          '<i class="ck-dot"></i></button>';
      }).join('');

    /* 标注 */
    var LABEL_IDS = ['ga', 'gb', 'cpu', 'na', 'nb', 'nvl'];
    var TAG_SIDE = { ga: 'l', gb: 'r', cpu: 'l', na: 'l', nb: 'r', nvl: 'r' };
    LABEL_IDS.forEach(function (id, i) {
      var p = parts[id];
      var tag = document.createElement('div');
      tag.className = 'ck-tag ' + (TAG_SIDE[id] || (i % 2 === 0 ? 'l' : 'r'));
      tag.innerHTML = '<b>' + p.info.name + '</b><span>' + p.info.params[0][1] + ' · ' + p.info.params[2][1] + '</span>';
      elLabels.appendChild(tag);
      var dot = document.createElement('i');
      dot.className = 'ck-pt';
      elLabels.appendChild(dot);
      p.tag = tag; p.dot = dot;
    });

    var selId = null;
    var P = { spin: false, labels: true, glow: true, explodeAll: false };

    function partState(id) {
      if (id === selId) return 1;
      if (P.explodeAll) return 1;
      return 0;
    }

    function applySelection(id, fly) {
      if (id === selId) id = null;           // 再次点击同一部件 = 收起
      selId = id;
      P.explodeAll = false;
      ALL_IDS.forEach(function (k) {
        parts[k].target = partState(k);
      });
      Array.prototype.forEach.call(elList.querySelectorAll('.ck-row'), function (r) {
        r.classList.toggle('on', r.dataset.id === selId);
      });
      renderCard();
      elFlash.classList.remove('on');
      void elFlash.offsetWidth;
      elFlash.classList.add('on');
      if (fly && id) focusPart(parts[id]);
      else if (!id) flyHome();
      elCard.classList.toggle('show', !!id);
      hud.classList.toggle('inspect', !!id);
    }

    function focusPart(p) {
      var bb = new THREE.Box3().setFromObject(p.group);
      if (!bb.isEmpty()) {
        var c = bb.getCenter(new THREE.Vector3());
        var size = bb.getSize(new THREE.Vector3());
        var rad = Math.max(size.x, size.y) * 0.5;
        var dist = Math.min(15, Math.max(4.6, rad / Math.tan(camera.fov * Math.PI / 360) * 1.55));
        var n = new THREE.Vector3(0, 0, 1).applyQuaternion(root.quaternion).normalize();
        var pos = c.clone().add(n.multiplyScalar(dist));
        // 保留一点现有视角方向，避免完全正对
        pos.x += (camera.position.x - c.x) * 0.10;
        pos.y += (camera.position.y - c.y) * 0.10;
        flyTo(pos, c, 0.95);
      }
    }

    function homeFor(aspect) {
      var vFov = camera.fov * Math.PI / 180;
      var dV = (BH * 1.22) / 2 / Math.tan(vFov / 2);
      var dH = (BW * 1.34) / 2 / Math.tan(vFov / 2) / Math.max(0.35, aspect);
      var d = Math.max(dV, dH);
      var wide = aspect >= 1.2;
      return {
        pos: new THREE.Vector3(wide ? d * 0.144 : d * 0.015, d * 0.038, d),
        tgt: new THREE.Vector3(wide ? 0.95 : 0, 0.10, 0)
      };
    }
    var _h0 = homeFor(camera.aspect || 1.6);
    var homePos = _h0.pos.clone();
    var homeTgt = _h0.tgt.clone();
    var lastAspect = camera.aspect;
    camera.position.copy(homePos);
    controls.target.copy(homeTgt);
    camera.updateProjectionMatrix();
    controls.syncFromCamera();

    var fly = null;
    function flyTo(pos, tgt, dur) {
      fly = {
        p0: camera.position.clone(), p1: pos.clone(),
        t0: controls.target.clone(), t1: tgt.clone(),
        t: 0, dur: dur || 1.0
      };
    }
    function flyHome() { flyTo(homePos, homeTgt, 0.95); }

    /* 详情卡 */
    function renderCard() {
      var p = selId ? parts[selId] : null;
      if (!p) {
        elCard.innerHTML =
          '<h5>概览<b>OVERVIEW</b></h5>' +
          '<div class="ck-ov">' +
          '<div class="ck-ovrow"><span>计算</span><b>2 × B300 · 1 × Grace</b></div>' +
          '<div class="ck-ovrow"><span>显存</span><b>288 GB HBM3e / GPU</b></div>' +
          '<div class="ck-ovrow"><span>网络</span><b>2 × CX-8 · 800 Gb/s</b></div>' +
          '<div class="ck-ovrow"><span>整机</span><b>72 GPU / 36 CPU</b></div>' +
          '</div>' +
          '<div class="ck-desc">这是 GB300 NVL72 的一个计算托盘上半区：两颗 Blackwell Ultra GPU、一颗 Grace CPU 与两颗 ConnectX-8 SuperNIC 共用一块高密度载板。点击任意部件可拆解查看。</div>' +
          '<div class="ck-tips"><b>操作</b>拖动旋转 · 滚轮缩放 · 点击部件拆解 · 点空白处复位</div>';
        return;
      }
      var rows = p.info.params.map(function (kv) {
        return '<div class="ck-pr"><span>' + kv[0] + '</span><b>' + kv[1] + '</b></div>';
      }).join('');
      elCard.innerHTML =
        '<h5>' + p.info.en + '<b>DETAIL</b></h5>' +
        '<div class="ck-name">' + p.info.name + '</div>' +
        '<div class="ck-prs">' + rows + '</div>' +
        '<div class="ck-desc">' + p.info.desc + '</div>' +
        '<button class="ck-btn" id="ckToggle">' + (p.target > 0.5 ? '↑ 收起部件' : '⧉ 拆解该部件') + '</button>';
      var btn = elCard.querySelector('#ckToggle');
      if (btn) {
        btn.addEventListener('click', function () {
          if (selId) { parts[selId].target = parts[selId].target > 0.5 ? 0 : 1; }
        });
      }
    }
    renderCard();

    /* 列表 / 按钮事件 */
    elList.addEventListener('click', function (e) {
      var row = e.target.closest ? e.target.closest('.ck-row') : null;
      if (!row) return;
      applySelection(row.dataset.id, true);
    });
    function toggleExplodeAll() {
      selId = null;
      P.explodeAll = !P.explodeAll;
      ALL_IDS.forEach(function (k) { parts[k].target = partState(k); });
      Array.prototype.forEach.call(elList.querySelectorAll('.ck-row'), function (r) { r.classList.remove('on'); });
      renderCard();
      elCard.classList.remove('show');
      hud.classList.remove('inspect');
      if (P.explodeAll) flyHome();
      elHint.textContent = P.explodeAll ? '全部部件已拆解 · 再点一次合拢' : '拖动旋转 · 滚轮缩放 · 点击部件拆解';
    }
    function resetAll() {
      selId = null; P.explodeAll = false;
      ALL_IDS.forEach(function (k) { parts[k].target = 0; });
      Array.prototype.forEach.call(elList.querySelectorAll('.ck-row'), function (r) { r.classList.remove('on'); });
      renderCard(); flyHome(); elCard.classList.remove('show');
      hud.classList.remove('inspect');
      elHint.textContent = '拖动旋转 · 滚轮缩放 · 点击部件拆解';
    }

    /* ============================================================
       七、拾取
       ============================================================ */
    var ray = new THREE.Raycaster();
    var ndc = new THREE.Vector2();

    function pick(px, py) {
      ndc.set(px, py);
      ray.setFromCamera(ndc, camera);
      var hits = ray.intersectObjects(partsG.children, true);
      for (var i = 0; i < hits.length; i++) {
        var o = hits[i].object;
        while (o) {
          if (o.userData && o.userData.part) return o.userData.part;
          o = o.parent;
        }
      }
      return null;
    }

    /* ============================================================
       八、逐帧
       ============================================================ */
    var _wp = new THREE.Vector3();
    var _proj = new THREE.Vector3();

    function easeOut(k) { return 1 - Math.pow(1 - k, 3); }
    function easeInOut(k) { return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }

    function updateTags(w, h) {
      var show = P.labels && w >= 900;
      LABEL_IDS.forEach(function (id) {
        var p = parts[id];
        if (!show) { p.tag.style.display = 'none'; p.dot.style.display = 'none'; return; }
        _wp.set(p.anchor[0], p.anchor[1], p.anchor[2] || 0.3);
        p.group.localToWorld(_wp);
        _proj.copy(_wp).project(camera);
        if (_proj.z > 1 || _proj.z < -1) { p.tag.style.display = 'none'; p.dot.style.display = 'none'; return; }
        var sx = (_proj.x * .5 + .5) * w, sy = (-_proj.y * .5 + .5) * h;
        if (sx < 40 || sx > w - 40 || sy < 80 || sy > h - 40) { p.tag.style.display = 'none'; p.dot.style.display = 'none'; return; }
        p.dot.style.display = 'block';
        p.dot.style.transform = 'translate(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px)';
        p.tag.style.display = 'block';
        p.tag.style.left = sx.toFixed(1) + 'px';
        p.tag.style.top = sy.toFixed(1) + 'px';
        p.tag.classList.toggle('on', selId === id);
      });
    }

    function updateParts(dt) {
      ALL_IDS.forEach(function (id) {
        var p = parts[id];
        var kk = 1 - Math.exp(-dt * 7.5);      // 与帧率无关的缓动逼近
        p.t += (p.target - p.t) * kk;
        if (Math.abs(p.target - p.t) < 0.002) p.t = p.target;
        var e = easeOut(p.t);

        // 整体微微离开板面（VRM 靠逐颗电感升起，不再整体抬）
        var lift = p.inst ? 0 : e * 0.28;
        p.group.position.z = (p.baseZ === undefined ? (p.inst ? 0 : 0.02) : p.baseZ) + lift;

        // 子层分离
        p.layers.forEach(function (L) {
          var lt = Math.max(0, Math.min(1, (e - L.delay) / Math.max(0.25, 1 - L.delay)));
          var ee = easeOut(lt);
          if (L.obj === p.group) { /* 整个 group 已处理 */ }
          else {
            if (L.obj.userData.bz === undefined) L.obj.userData.bz = L.obj.position.z;
            L.obj.position.z = L.obj.userData.bz + ee * L.dz;
            if (L.dy) {
              if (L.obj.userData.by === undefined) L.obj.userData.by = L.obj.position.y;
              L.obj.position.y = L.obj.userData.by + ee * L.dy;
            }
          }
        });

        // 发光 / 压暗
        var on = (selId === id) || P.explodeAll;
        var inten = (P.glow ? (on ? 0.20 + 0.07 * Math.sin(clock * 2.4) : 0) : 0);
        if (p.lastGlow !== inten) {
          p.mats.forEach(function (m) {
            if (!m.emissive) return;
            m.emissiveIntensity = (m.userData.baseEmissive || 0) + inten;
            // 带贴图的裸片 / 顶盖不染发光色，避免整块过曝成白板
            if (m.userData.baseEmissiveColor !== undefined) m.emissive.setHex(m.userData.baseEmissiveColor);
          });
          p.lastGlow = inten;
        }
        if (p.glow) p.glow.material.opacity = P.glow && on ? 0.07 + 0.03 * Math.sin(clock * 2.2) : 0;

        // VRM 逐颗错峰升起
        if (p.inst && p.instBase) {
          var need = Math.abs(p.t - (p.lastInst || 0)) > 0.001;
          if (need) {
            for (var i = 0; i < p.instBase.length; i++) {
              var b = p.instBase[i];
              var stag = Math.max(0, Math.min(1, (e - (i % 11) * 0.035) / 0.7));
              dummy.position.set(b.x, b.y, b.z + easeOut(stag) * 0.30);
              dummy.rotation.set(0, 0, 0);
              dummy.scale.set(1, 1, b.s);
              dummy.updateMatrix();
              p.inst.setMatrixAt(i, dummy.matrix);
            }
            p.inst.instanceMatrix.needsUpdate = true;
            p.lastInst = p.t;
          }
        }
      });
    }

    /* ============================================================
       九、讲解模式
       ============================================================ */
    var tour = HL.Tour(ctx, { accent: 0x5ce1f0 });
    tour.load([
      {
        t: '一块托盘，四类芯片',
        d: '这是 GB300 NVL72 的一个计算托盘上半区。78 块这样的托盘叠进一个机柜，组成 72 颗 GPU、36 颗 CPU 的全连接计算机。先看整体：两颗 GPU 在上，Grace CPU 居中，两颗网络芯片在下。',
        exp: '拖动旋转，看看这块板有多厚；滚轮放大到两颗 GPU 的封装框。',
        cam: [[3.6, 0.95, 25.0], [0.95, 0.10, 0]],
        apply: function () { setSel(null); }
      },
      {
        t: 'Blackwell Ultra：两颗裸片，一颗 GPU',
        d: '每颗 GPU 封装里是两颗逼近光罩极限的裸片，中间用 NV-HBI 以 10 TB/s 缝合，逻辑上仍是一颗 GPU。四周八组 HBM3e 堆叠，合计 288 GB、8 TB/s。',
        exp: '点击左侧 GPU，看封装框、裸片与基板如何分层升起。',
        cam: [[-1.4, 2.9, 8.2], [-2.18, 2.35, 0.3]],
        apply: function () { setSel('ga'); }
      },
      {
        t: 'Grace：托盘里的主控',
        d: '72 个 Arm Neoverse V2 核心，用 NVLink-C2C 与两颗 GPU 共享统一内存。CPU 不再是配角——它负责调度、数据预处理和整个托盘的管理。',
        exp: '点击 CPU，IHS 顶盖抬起后能看到下面的裸片。',
        cam: [[0.2, 0.1, 7.0], [0, -0.55, 0.2]],
        apply: function () { setSel('cpu'); }
      },
      {
        t: 'ConnectX-8：把算力接进网络',
        d: '每颗 800 Gb/s。GPU 之间的集合通信走 NVLink，跨机柜则走这两颗网卡；它们让 72 卡域之外的扩展仍然保持高带宽、低延迟。',
        exp: '点击任意一颗网卡，注意金色边框下的中央 die。',
        cam: [[0.4, -3.2, 6.2], [0, -3.6, 0.2]],
        apply: function () { setSel('na'); }
      },
      {
        t: 'NVLink 连接器：托盘的神经束',
        d: '顶部两个黑色连接器直接插进 midplane。每个 GPU 在这里获得 1.8 TB/s 的双向带宽，整柜 72 颗 GPU 因此像一个巨大的加速器一样协同。',
        exp: '点击连接器，壳体升起，露出里面的金手指。',
        cam: [[0.3, 5.6, 6.4], [0, 5.0, 0.2]],
        apply: function () { setSel('nvl'); }
      },
      {
        t: '供电与载板：看不见的工程',
        d: '1.4 kW 的 GPU 需要的不是一根电源线，而是数十相 VRM 紧贴封装布置，把 48 V 降到 1 V 级；数百颗去耦电容压住瞬态波动。载板本身是二十多层的高密度互连板。',
        exp: '点击左侧供电阵列，看电感逐颗升起；再点空白处合拢。',
        cam: [[-2.6, 0.9, 9.2], [-3.4, 0.9, 0.2]],
        apply: function () { setSel('vrm'); }
      }
    ]);

    function setSel(id) {
      selId = id;
      P.explodeAll = false;
      ALL_IDS.forEach(function (k) { parts[k].target = partState(k); });
      Array.prototype.forEach.call(elList.querySelectorAll('.ck-row'), function (r) {
        r.classList.toggle('on', r.dataset.id === id);
      });
      renderCard();
      elCard.classList.toggle('show', !!id);
      hud.classList.toggle('inspect', !!id);
    }

    var tourOn = false;

    /* ============================================================
       十、对外接口
       ============================================================ */
    var api = {
      update: function (dt, tt) {
        clock += dt;
        if (P.spin) root.rotation.y += dt * 0.10;

        if (Math.abs((camera.aspect || 1) - lastAspect) > 0.01) {
          lastAspect = camera.aspect;
          if (!fly && !selId) {
            var hh = homeFor(lastAspect);
            homePos.copy(hh.pos); homeTgt.copy(hh.tgt);
            camera.position.copy(homePos);
            controls.target.copy(homeTgt);
            if (controls.syncFromCamera) controls.syncFromCamera();
          }
        }

        if (fly) {
          fly.t += dt / fly.dur;
          var k = Math.min(1, fly.t);
          var e = easeInOut(k);
          camera.position.lerpVectors(fly.p0, fly.p1, e);
          controls.target.lerpVectors(fly.t0, fly.t1, e);
          if (controls.syncFromCamera) controls.syncFromCamera();
          if (k >= 1) fly = null;
        }

        updateParts(dt);

        var w = renderer.domElement.clientWidth || window.innerWidth;
        var h = renderer.domElement.clientHeight || window.innerHeight;
        updateTags(w, h);

        if (dust) {
          dust.rotation.z += dt * 0.008;
          dust.position.y = Math.sin(clock * 0.18) * 0.25;
        }

        tour.update(dt, tt || 0, function () {});
        var ton = tour.active();
        if (ton !== tourOn) { tourOn = ton; hud.classList.toggle('tour-on', ton); }
      },

      setParam: function (key, v) {
        if (key === 'tour') { tour.toggle(); return; }
        if (key === 'explodeAll') { toggleExplodeAll(); return; }
        if (key === 'resetView') { resetAll(); return; }
        if (key === 'focus') { applySelection(v, true); return; }
        P[key] = v;
        if (key === 'labels') {
          elLabels.style.display = v ? '' : 'none';
        }
        if (key === 'glow') {
          ALL_IDS.forEach(function (id) { parts[id].lastGlow = null; });
        }
        if (key === 'spin' && !v) { /* 保持当前角度 */ }
      },

      onClick: function (nd) {
        var id = pick(nd.x, nd.y);
        if (id) applySelection(id, true);
        else if (selId || P.explodeAll) {
          selId = null; P.explodeAll = false;
          ALL_IDS.forEach(function (k) { parts[k].target = 0; });
          Array.prototype.forEach.call(elList.querySelectorAll('.ck-row'), function (r) { r.classList.remove('on'); });
          renderCard(); elCard.classList.remove('show'); flyHome();
        }
      },

      dispose: function () {
        if (hud.parentNode) hud.parentNode.removeChild(hud);
        tour.dispose();
        scene.remove(root);
        if (dust) { scene.remove(dust); dust.geometry.dispose(); dust.material.dispose(); }
        root.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            var ms = Array.isArray(o.material) ? o.material : [o.material];
            ms.forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); });
          }
        });
      },

      _chipState: function () {
        return {
          sel: selId, explodeAll: P.explodeAll,
          parts: ALL_IDS.length,
          tags: LABEL_IDS.filter(function (id) { return parts[id].tag && parts[id].tag.style.display !== 'none'; }).length,
          t: ALL_IDS.map(function (id) { return +parts[id].t.toFixed(2); }),
          calls: renderer.info.render.calls,
          tris: renderer.info.render.triangles,
          camY: +camera.position.y.toFixed(2),
          nan: !(isFinite(camera.position.x) && isFinite(camera.position.y) && isFinite(camera.position.z))
        };
      }
    };
    return api;
  }
});
