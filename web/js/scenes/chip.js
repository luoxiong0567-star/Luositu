/**
 * 场景：硅基芯片 v2 —— 立体剖面台
 *
 * 设计语言（参考手绘工程图纸的"轴向剖解图"）：
 *   宏观 = 封装自下而上的堆叠剖面 —— 引脚阵列 → 封装基板 → 硅中介层 / RDL →
 *          微凸块 → 裸片功能区块（GPU：双 die + 8 组 HBM3e；CPU：IOD + 12 CCD）
 *   微观 = 单个计算单元的 BEOL 剖面 —— 硅基底 FinFET 阵列 → M1 → M2 → M3 → 单元分区
 *
 * 视觉要素：
 *   · 程序化生成的密布走线纹理（电源干线 / 总线束 / 随机布线 / 过孔焊盘）
 *   · 过孔与微凸块是真实的 3D 柱状连接，随"层间距"拉伸
 *   · 信号脉冲沿走线路径与过孔缓慢流动（加色发光点 + 拖尾）
 *   · 区块自发光随全局呼吸缓变，带相位差的微光掠过整片裸片
 *   · 右侧实时侧视剖面小图，左下可点击的层叠结构清单
 *
 * 交互：宏观 / 微观切换、GPU / CPU 切换、点击层叠结构聚焦单层、
 *       点击功能区块下钻单元；讲解模式自下而上走完整条堆叠。
 *
 * 数据来源：厂商标称规格 + 公开架构资料（GPC→SM→处理块、CCD→Core）。
 * 区块位置为按公开版图重建的示意排布，非真实掩膜比例。
 */
HL.registerScene({
  id: 'chip',
  name: '硅基芯片',
  short: '封装 → 裸片 → 单元的立体剖面台',
  icon: '⬢',
  fov: 40,
  minDistance: 0.8,
  maxDistance: 120,
  desc: '一颗现代芯片是一座十几层的立体城市。宏观沿封装自下而上剖开：引脚阵列、基板走线、硅中介层、微凸块、裸片功能区块与 HBM 堆叠；微观下钻到单个计算单元，看 FinFET 鳍阵列与三层金属布线。信号脉冲沿走线与过孔缓慢流动，微光在整片裸片上呼吸。',

  controls: [
    { type: 'button', key: 'tour', label: '📖 讲解模式' },
    { type: 'buttons', key: 'view', label: '视角', value: 'macro', options: [
      { label: '宏观 · 封装堆叠', value: 'macro' },
      { label: '微观 · 单元内部', value: 'micro' }
    ] },
    { type: 'buttons', key: 'chip', label: '芯片', value: 'gpu', options: [
      { label: 'GPU · B200', value: 'gpu' },
      { label: 'CPU · EPYC', value: 'cpu' }
    ] },
    { type: 'range', key: 'explode', label: '层间距', min: 0, max: 1, step: 0.01, value: 0.62 },
    { type: 'check', key: 'flow', label: '信号脉冲', value: true },
    { type: 'check', key: 'pins', label: '引脚 / 凸块', value: true },
    { type: 'check', key: 'labels', label: '结构标注', value: true },
    { type: 'check', key: 'spin', label: '缓慢旋转', value: false }
  ],

  create: function (ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera;
    var controls = ctx.controls, renderer = ctx.renderer, canvas = ctx.canvas;
    var stageEl = document.getElementById('stage');
    var raycaster = new THREE.Raycaster();
    var ANISO = (renderer.capabilities && renderer.capabilities.getMaxAnisotropy) ?
      renderer.capabilities.getMaxAnisotropy() : 4;
    var LOW = (window.innerWidth < 860) || ((navigator.hardwareConcurrency || 8) <= 4);

    /* ============================================================
       一、通用工具与配色
       ============================================================ */
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
    function easeIO(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function mulberry32(a) {
      return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        var t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }

    var PAL = {
      plate: 0x0c1a26, si: 0x122a3a, fin: 0x2e6076, gate: 0x74a6bc,
      dram: 0x2c4f70, dramBase: 0x1f3d57, dieslab: 0x14354a,
      gpc: 0x1e7f9c, l2: 0x2d5fc0, phy: 0x3f9bd6, io: 0x2b7a9e,
      iod: 0x27506b, ccd: 0x1e93ad, core: 0x35d6e6,
      smsp: 0x1e7f9c, lane: 0x56d8ee, reg: 0x2d63c8, l1: 0x2a4d86,
      fe: 0x1e7f9c, alu: 0x35d6e6, fpu: 0x2d63c8, agu: 0x56d8ee, l1d: 0x3f9bd6,
      warm: 0xffb454, ball: 0x93a8b5
    };

    /* ============================================================
       二、程序化纹理：密布走线 + 过孔
       ============================================================ */
    function mkGlowTex() {
      var cv = document.createElement('canvas'); cv.width = cv.height = 64;
      var c = cv.getContext('2d');
      var g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(200,246,255,1)');
      g.addColorStop(0.35, 'rgba(110,220,248,0.5)');
      g.addColorStop(1, 'rgba(110,220,248,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(cv);
    }
    function mkFloorTex() {
      var cv = document.createElement('canvas'); cv.width = cv.height = 256;
      var c = cv.getContext('2d');
      var g = c.createRadialGradient(128, 128, 8, 128, 128, 176);
      g.addColorStop(0, 'rgba(70,190,230,0.5)');
      g.addColorStop(0.5, 'rgba(45,120,170,0.14)');
      g.addColorStop(1, 'rgba(45,120,170,0)');
      c.fillStyle = g; c.fillRect(0, 0, 256, 256);
      return new THREE.CanvasTexture(cv);
    }

    /**
     * 走线纹理：电源干线 + 总线束 + 随机布线 + 过孔 + 焊盘阵列。
     * 返回 { tex, paths }；paths 元素为 [起点x, 起点y, 折线点数组]，画布坐标系。
     */
    function mkTraceTex(opt) {
      var S = opt.size || 1024;
      var rnd = mulberry32(opt.seed || 7);
      var cv = document.createElement('canvas'); cv.width = cv.height = S;
      var c = cv.getContext('2d');
      var bg = opt.bg || '#0a141d';
      c.fillStyle = bg; c.fillRect(0, 0, S, S);
      var cell = S / (opt.grid || 64);
      var line = opt.line || '#2e6f8e', hi = opt.hi || '#67d8f2';
      var viaC = opt.via || '#9feaff', warm = opt.warm || '#c98a4b';
      var dens = opt.density === undefined ? 1 : opt.density;
      var paths = [];
      function snap(v) { return Math.round(v / cell) * cell; }

      // 细网格
      c.globalAlpha = 0.05; c.strokeStyle = line; c.lineWidth = 1;
      c.beginPath();
      for (var g = 0; g <= 64; g++) {
        var p = g * cell;
        c.moveTo(p, 0); c.lineTo(p, S); c.moveTo(0, p); c.lineTo(S, p);
      }
      c.stroke();

      // 电源干线
      c.globalAlpha = 0.13; c.lineWidth = 3; c.strokeStyle = line;
      for (var b = 1; b < 8; b++) {
        var q = b * S / 8;
        c.beginPath(); c.moveTo(0, q); c.lineTo(S, q); c.stroke();
        c.beginPath(); c.moveTo(q, 0); c.lineTo(q, S); c.stroke();
      }

      // 总线束：成组平行走线 + 45° 拐角
      var bundles = Math.round(13 * dens);
      for (var i = 0; i < bundles; i++) {
        var horiz = rnd() < 0.5;
        var n = 4 + Math.floor(rnd() * 8), pitch = 3 + rnd() * 3;
        var start = snap(rnd() * S);
        var len = S * (0.3 + rnd() * 0.6);
        var from = rnd() * (S - len);
        var jogA = (0.05 + rnd() * 0.18) * S * (rnd() < 0.5 ? 1 : -1);
        var jogAt = from + len * (0.3 + rnd() * 0.4);
        c.globalAlpha = 0.28 + rnd() * 0.3;
        c.strokeStyle = rnd() < 0.14 ? hi : line;
        c.lineWidth = 1.4;
        c.beginPath();
        for (var k = 0; k < n; k++) {
          var off = start + k * pitch, path = [];
          if (horiz) {
            var y0 = off;
            c.moveTo(from, y0); path.push([from, y0]);
            c.lineTo(jogAt, y0); path.push([jogAt, y0]);
            c.lineTo(jogAt + Math.abs(jogA), y0 + jogA); path.push([jogAt + Math.abs(jogA), y0 + jogA]);
            c.lineTo(from + len + Math.abs(jogA), y0 + jogA); path.push([from + len + Math.abs(jogA), y0 + jogA]);
          } else {
            var x0 = off;
            c.moveTo(x0, from); path.push([x0, from]);
            c.lineTo(x0, jogAt); path.push([x0, jogAt]);
            c.lineTo(x0 + jogA, jogAt + Math.abs(jogA)); path.push([x0 + jogA, jogAt + Math.abs(jogA)]);
            c.lineTo(x0 + jogA, from + len + Math.abs(jogA)); path.push([x0 + jogA, from + len + Math.abs(jogA)]);
          }
          paths.push([path[0][0], path[0][1], path]);
        }
        c.stroke();
      }

      // 随机布线（曼哈顿走向）
      var routes = Math.round(230 * dens);
      for (i = 0; i < routes; i++) {
        var x = snap(rnd() * S), y = snap(rnd() * S);
        var segs = 2 + Math.floor(rnd() * 4);
        c.globalAlpha = 0.16 + rnd() * 0.42;
        c.strokeStyle = rnd() < 0.09 ? hi : line;
        c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(x, y);
        var rp = [[x, y]];
        for (var s2 = 0; s2 < segs; s2++) {
          var L2 = (0.03 + rnd() * 0.22) * S;
          var dir = Math.floor(rnd() * 4);
          var dx = (dir === 0 ? L2 : dir === 1 ? -L2 : 0);
          var dy = (dir === 2 ? L2 : dir === 3 ? -L2 : 0);
          x = clamp(x + dx, 4, S - 4); y = clamp(y + dy, 4, S - 4);
          c.lineTo(x, y); rp.push([x, y]);
        }
        c.stroke();
        if (rp.length > 2 && rnd() < 0.4) paths.push([rp[0][0], rp[0][1], rp]);
      }

      // 暖色专用走线（die 间互连 / 长距离干轨，少量）
      var wp = Math.round(5 * dens);
      for (i = 0; i < wp; i++) {
        var wy = snap(rnd() * S);
        c.globalAlpha = 0.45; c.strokeStyle = warm; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(0, wy);
        var wpath = [[0, wy]];
        var mx = snap(S * (0.3 + rnd() * 0.4));
        c.lineTo(mx, wy); wpath.push([mx, wy]);
        var wy2 = clamp(wy + (rnd() < 0.5 ? 1 : -1) * S * 0.12, 8, S - 8);
        c.lineTo(mx + S * 0.06, wy2); wpath.push([mx + S * 0.06, wy2]);
        c.lineTo(S, wy2); wpath.push([S, wy2]);
        c.stroke();
        paths.push([0, wy, wpath]);
      }

      // 过孔
      var vias = Math.round(360 * dens);
      for (i = 0; i < vias; i++) {
        var vx = snap(rnd() * S), vy = snap(rnd() * S);
        c.globalAlpha = 1; c.fillStyle = bg;
        c.beginPath(); c.arc(vx, vy, 3, 0, 6.29); c.fill();
        c.strokeStyle = line; c.lineWidth = 1.2; c.globalAlpha = 0.85; c.stroke();
        c.fillStyle = viaC; c.globalAlpha = 0.7;
        c.beginPath(); c.arc(vx, vy, 1.25, 0, 6.29); c.fill();
      }

      // 焊盘阵列块
      if (opt.pads) {
        for (i = 0; i < 3; i++) {
          var bx = snap(S * (0.1 + rnd() * 0.7)), by = snap(S * (0.1 + rnd() * 0.7));
          for (var r2 = 0; r2 < 5; r2++) for (var c2 = 0; c2 < 7; c2++) {
            var px2 = bx + c2 * 10, py2 = by + r2 * 10;
            if (px2 > S - 12 || py2 > S - 12) continue;
            c.globalAlpha = 0.8; c.strokeStyle = hi; c.lineWidth = 1;
            c.beginPath(); c.arc(px2, py2, 3, 0, 6.29); c.stroke();
            c.globalAlpha = 0.3; c.fillStyle = hi;
            c.beginPath(); c.arc(px2, py2, 1.2, 0, 6.29); c.fill();
          }
        }
      }

      // 四角基准标记
      c.globalAlpha = 0.9; c.strokeStyle = hi; c.lineWidth = 1.4;
      [[14, 14], [S - 14, 14], [14, S - 14], [S - 14, S - 14]].forEach(function (f) {
        c.beginPath(); c.arc(f[0], f[1], 6, 0, 6.29); c.stroke();
        c.beginPath(); c.moveTo(f[0] - 10, f[1]); c.lineTo(f[0] + 10, f[1]);
        c.moveTo(f[0], f[1] - 10); c.lineTo(f[0], f[1] + 10); c.stroke();
      });
      c.globalAlpha = 1;

      var tex = new THREE.CanvasTexture(cv);
      tex.anisotropy = ANISO;
      return { tex: tex, paths: paths };
    }

    var glowTex = mkGlowTex();

    /* ============================================================
       三、材质与几何工具
       ============================================================ */
    var boxGeo = new THREE.BoxGeometry(1, 1, 1);
    var cylGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    var ballGeo = new THREE.SphereGeometry(1, 6, 5);

    function plateMat(col, rough) {
      return new THREE.MeshStandardMaterial({
        color: col, roughness: rough === undefined ? 0.82 : rough, metalness: 0.38
      });
    }
    function blockMat() {
      return new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.5, metalness: 0.32,
        emissive: 0x0a2230, emissiveIntensity: 0.55
      });
    }
    function edgeLineMat(col, op) {
      return new THREE.LineBasicMaterial({
        color: col, transparent: true, opacity: op === undefined ? 0.25 : op,
        blending: THREE.AdditiveBlending, depthWrite: false
      });
    }
    function traceMat(tex) {
      return new THREE.MeshStandardMaterial({
        map: tex, color: 0x9db8c6, roughness: 0.85, metalness: 0.3,
        emissive: 0x2e7d9c, emissiveMap: tex, emissiveIntensity: 0.42
      });
    }
    var _m4 = new THREE.Matrix4(), _q0 = new THREE.Quaternion();
    var _p = new THREE.Vector3(), _s = new THREE.Vector3(), _col = new THREE.Color();

    function pushBoxEdges(arr, b) {
      var x0 = b.x - b.w / 2, x1 = b.x + b.w / 2;
      var z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
      var y0 = b.y, y1 = b.y + b.h;
      var cn = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
                [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
      var E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4],
               [0, 4], [1, 5], [2, 6], [3, 7]];
      for (var i = 0; i < E.length; i++) {
        var a = cn[E[i][0]], bb = cn[E[i][1]];
        arr.push(a[0], a[1], a[2], bb[0], bb[1], bb[2]);
      }
    }

    /* ============================================================
       四、芯片数据
       ============================================================ */
    var CHIPS = {
      gpu: {
        key: 'gpu', name: 'Blackwell B200', vendor: 'NVIDIA · GB100', node: 'TSMC 4NP',
        pkg: 'CoWoS-L 2.5D · 硅中介层', unit: 'SM',
        kpi: [['2080', '亿', '晶体管'], ['2', 'die', '裸片'], ['192', 'GB', 'HBM3e'],
              ['8', 'TB/s', '显存带宽'], ['1000', 'W', '整卡功耗']],
        legend: [['#1e7f9c', 'GPC 图形处理簇', '16 组'], ['#2d5fc0', 'L2 缓存切片', '32 片'],
                 ['#3f9bd6', 'HBM PHY', '8 组'], ['#ffb454', 'NV-HBI die 间互连', '10 TB/s'],
                 ['#2c4f70', 'HBM3e 存储堆叠', '8 × 24 GB']],
        legendMicro: [['#1e7f9c', 'SMSP 处理块', '4 个'], ['#56d8ee', 'FP32 通道', '128'],
                 ['#ffb454', '张量核', '4 个'], ['#2d63c8', '寄存器堆 bank', '8 组'],
                 ['#2a4d86', 'L1 / 共享内存', '256 KB']],
        scale: '≈ 65 × 65 mm 封装', area: '≈ 1.3 mm² / SM',
        note: '双裸片以 10 TB/s 的 NV-HBI 互连合成一颗逻辑 GPU；HBM3e 以 3D 堆叠贴装在硅中介层两侧。'
      },
      cpu: {
        key: 'cpu', name: 'EPYC 9965', vendor: 'AMD · Turin Dense', node: 'TSMC 3nm',
        pkg: 'SHP 有机基板 · 13 chiplet', unit: 'Core',
        kpi: [['192', '核', 'Zen 5c'], ['384', '线程', 'SMT'], ['384', 'MB', 'L3 缓存'],
              ['12', 'ch', 'DDR5-6000'], ['500', 'W', '功耗上限']],
        legend: [['#27506b', 'IOD 输入输出裸片', '1 颗 · 12nm'], ['#1e93ad', 'CCD 计算裸片', '12 颗 · 3nm'],
                 ['#35d6e6', 'Zen 5c 核心', '192 个'], ['#3f9bd6', 'DDR5 PHY', '12 通道'],
                 ['#ffb454', 'PCIe 5.0 控制器', '128 lane']],
        legendMicro: [['#1e7f9c', '前端 · 8-wide 解码', '1 组'], ['#35d6e6', '整数 ALU', '6 个'],
                 ['#2d63c8', 'FMA 512-bit', '2 条'], ['#56d8ee', 'AGU 存取单元', '2 个'],
                 ['#3f9bd6', 'L1D / L2', '48 KB / 1 MB']],
        scale: '≈ 70 × 78 mm 封装', area: '≈ 2.8 mm² / 核',
        note: '13 颗 chiplet 以有机基板互连：中央 IOD 挂 12 通道 DDR5 与 PCIe，两侧 12 颗 CCD 各含 16 核。'
      }
    };

    /* ============================================================
       五、装配
       ============================================================ */
    var world = new THREE.Group();
    scene.add(world);
    var macroRoot = new THREE.Group(), microRoot = new THREE.Group();
    macroRoot.visible = true; microRoot.visible = false;
    world.add(macroRoot); world.add(microRoot);

    var links = [];                                  // 随层间距拉伸的连接柱
    var flows = [];                                  // 信号脉冲系统
    var breathMats = [];                             // 呼吸的走线材质
    var allLayers = { gpu: null, cpu: null };
    var microLayers = { gpu: null, cpu: null };
    var pickSets = { macro: {}, micro: {} };
    var TEXS = [];

    function newLayer(def, parent) {
      var L = {
        id: def.id, name: def.name, en: def.en, note: def.note || '',
        y0: def.y0, dy: def.dy, curY: def.y0, W: def.xw || 9.0,
        group: new THREE.Group()
      };
      L.group.position.y = L.y0;
      parent.add(L.group);
      return L;
    }

    /** 走线面板：薄板 + 顶面走线纹理 + 蓝图描边 */
    function addPlate(L, w, d, thick, slabY, texInfo, opt) {
      opt = opt || {};
      var slab = new THREE.Mesh(new THREE.BoxGeometry(w, thick, d), plateMat(opt.col || PAL.plate));
      slab.position.y = slabY;
      L.group.add(slab);
      var eg = new THREE.EdgesGeometry(slab.geometry);
      var edge = new THREE.LineSegments(eg, edgeLineMat(0x4db6d8, 0.3));
      edge.position.y = slabY;
      L.group.add(edge);
      if (texInfo) {
        var tm = traceMat(texInfo.tex);
        breathMats.push({ mat: tm, base: 0.42, amp: opt.glow === undefined ? 0.2 : opt.glow });
        var plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), tm);
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = slabY + thick / 2 + 0.002;
        L.group.add(plane);
      }
      return slab;
    }

    /** 功能区块阵列 */
    function addBlocks(L, list, opt) {
      opt = opt || {};
      var mesh = new THREE.InstancedMesh(boxGeo, blockMat(), list.length);
      mesh.frustumCulled = false;
      list.forEach(function (b, i) {
        _p.set(b.x, b.y + b.h / 2, b.z);
        _s.set(b.w, b.h, b.d);
        _m4.compose(_p, _q0, _s);
        mesh.setMatrixAt(i, _m4);
        b.baseCol = b.col;
        mesh.setColorAt(i, _col.setHex(b.col));
        b.ph = (b.x + b.z) * 0.55;
        b.idx = i;
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      L.group.add(mesh);
      var pos = [];
      if (!opt.noEdge) list.forEach(function (b) { pushBoxEdges(pos, b); });
      var eg = new THREE.BufferGeometry();
      eg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      var lines = new THREE.LineSegments(eg, edgeLineMat(0x67d8f2, opt.edgeOp === undefined ? 0.2 : opt.edgeOp));
      lines.frustumCulled = false;
      L.group.add(lines);
      L.blocks = list; L.blockMesh = mesh; L.blockLines = lines;
      if (opt.pick) pickSets[opt.pick.view][opt.pick.chip] = { mesh: mesh, list: list };
      return mesh;
    }

    /** 点阵实例（引脚 / 触点，不随层间距变化） */
    function addPads(L, items, geo, mat, scl) {
      var mesh = new THREE.InstancedMesh(geo, mat, items.length);
      mesh.frustumCulled = false;
      for (var i = 0; i < items.length; i++) {
        _p.set(items[i][0], 0, items[i][1]);
        _s.set(scl[0], scl[1], scl[2]);
        _m4.compose(_p, _q0, _s);
        mesh.setMatrixAt(i, _m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
      L.group.add(mesh);
      return mesh;
    }

    /** 连接柱（TSV / 微凸块 / 过孔）：随层间距拉伸 */
    function addLinks(view, owner, a, b, items, opt) {
      opt = opt || {};
      var mesh = new THREE.InstancedMesh(cylGeo, new THREE.MeshStandardMaterial({
        color: opt.col || 0x3d7e99, roughness: 0.45, metalness: 0.6,
        emissive: opt.warm ? 0x5a3a12 : 0x0a2430, emissiveIntensity: 0.5
      }), items.length);
      mesh.frustumCulled = false;
      var lk = {
        a: a, b: b, oa: opt.oa || 0, ob: opt.ob || 0, items: items,
        mesh: mesh, r: opt.r || 0.03, owner: owner
      };
      links.push(lk);
      (view === 'macro' ? macroRoot : microRoot).add(mesh);
      return lk;
    }
    function rebuildLink(lk) {
      var y1 = lk.a.curY + lk.oa, y2 = lk.b.curY + lk.ob;
      var h = Math.max(0.015, y2 - y1);
      var mid = (y1 + y2) / 2;
      for (var i = 0; i < lk.items.length; i++) {
        var it = lk.items[i];
        _p.set(it[0], mid, it[1]);
        _s.set(lk.r, h, lk.r);
        _m4.compose(_p, _q0, _s);
        lk.mesh.setMatrixAt(i, _m4);
      }
      lk.mesh.instanceMatrix.needsUpdate = true;
    }

    /* ---- 信号脉冲 ---- */
    function makeFlow(items, parent, owner) {
      var n = items.length * 2;
      var pos = new Float32Array(n * 3);
      var col = new Float32Array(n * 3);
      for (var i = 0; i < items.length; i++) {
        var c = items[i].warm ? 1.0 : 0.72;
        col[i * 6] = 0.62 * c; col[i * 6 + 1] = 0.92 * c; col[i * 6 + 2] = 1.0 * c;
        col[i * 6 + 3] = 0.16 * c; col[i * 6 + 4] = 0.34 * c; col[i * 6 + 5] = 0.44 * c;
      }
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      var mat = new THREE.PointsMaterial({
        map: glowTex, size: 0.16, sizeAttenuation: true, vertexColors: true,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
      });
      var pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      parent.add(pts);
      var f = { items: items, pts: pts, geo: geo, owner: owner };
      flows.push(f);
      return f;
    }
    function prepPath(pts) {
      var seg = [0], total = 0;
      for (var i = 1; i < pts.length; i++) {
        total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        seg.push(total);
      }
      return { pts: pts, seg: seg, total: total || 1 };
    }
    function samplePath(pp, u, out) {
      var d = (((u % 1) + 1) % 1) * pp.total;
      var i = 1;
      while (i < pp.seg.length - 1 && pp.seg[i] < d) i++;
      var t = (d - pp.seg[i - 1]) / ((pp.seg[i] - pp.seg[i - 1]) || 1);
      var a = pp.pts[i - 1], b = pp.pts[i];
      out.x = a[0] + (b[0] - a[0]) * t;
      out.z = a[1] + (b[1] - a[1]) * t;
    }
    var _fo = { x: 0, z: 0 };
    function updateFlow(f, dt) {
      var pos = f.geo.attributes.position.array;
      for (var i = 0; i < f.items.length; i++) {
        var it = f.items[i];
        it.u = (it.u + dt * it.speed) % 1;
        var head = i * 6, tail = i * 6 + 3;
        if (it.v) {
          var y1 = it.a.curY + it.oa, y2 = it.b.curY + it.ob;
          var v = Math.max(0, it.u - 0.05);
          pos[head] = it.x; pos[head + 1] = y1 + (y2 - y1) * it.u; pos[head + 2] = it.z;
          pos[tail] = it.x; pos[tail + 1] = y1 + (y2 - y1) * v; pos[tail + 2] = it.z;
        } else {
          samplePath(it.pp, it.u, _fo);
          pos[head] = _fo.x; pos[head + 1] = it.getY() + it.dy; pos[head + 2] = _fo.z;
          samplePath(it.pp, it.u - 0.02, _fo);
          pos[tail] = _fo.x; pos[tail + 1] = it.getY() + it.dy; pos[tail + 2] = _fo.z;
        }
      }
      f.geo.attributes.position.needsUpdate = true;
    }
    /** 把纹理路径抽样成脉冲项 */
    function pushPathItems(items, paths, texSize, W, D, count, getY, dy, warm) {
      var step = Math.max(1, Math.floor(paths.length / count));
      var got = 0;
      for (var i = 0; i < paths.length && got < count; i += step) {
        var p = paths[i];
        if (!p[2] || p[2].length < 3) continue;
        var pts = p[2].map(function (q) {
          return [(q[0] / texSize - 0.5) * W, (q[1] / texSize - 0.5) * D];
        });
        items.push({
          pp: prepPath(pts), u: Math.random(), speed: 0.05 + Math.random() * 0.07,
          getY: getY, dy: dy, warm: warm
        });
        got++;
      }
      return items;
    }

    /* ---- 宏观：GPU（B200，CoWoS-L 双 die + 8 HBM） ---- */
    function buildMacroGPU() {
      var layers = [];
      var SUB_W = 10.6, SUB_D = 7.8;
      var DIE_W = 3.3, DIE_D = 4.6, DIE_CX = 1.7;

      var Lpins = newLayer({ id: 'pins', name: 'BGA 锡球', en: 'BALL GRID ARRAY', y0: -0.315, dy: -1.5, xw: 10.6,
        note: '近千颗锡球把整颗芯片焊装到主板上，同时承担全部供电与对外信号。' }, macroRoot);
      layers.push(Lpins);
      (function () {
        var pitch = LOW ? 0.5 : 0.3, items = [];
        for (var ix = -5.1; ix <= 5.08; ix += pitch) for (var iz = -3.6; iz <= 3.58; iz += pitch) items.push([ix, iz]);
        addPads(Lpins, items, ballGeo, new THREE.MeshStandardMaterial({
          color: PAL.ball, roughness: 0.32, metalness: 0.85
        }), [0.09, 0.08, 0.09]);
        Lpins.count = items.length;
      })();

      var Lsub = newLayer({ id: 'sub', name: '封装基板', en: 'ABF SUBSTRATE', y0: 0, dy: 0, xw: 10.6,
        note: 'ABF 积层基板把锡球阵列扇出转换到裸片间距，走线宽径已做到 2 µm 级。' }, macroRoot);
      layers.push(Lsub);
      var subTex = mkTraceTex({ seed: 11, density: 0.8, pads: true, grid: 64 });
      TEXS.push(subTex.tex);
      addPlate(Lsub, SUB_W, SUB_D, 0.22, -0.11, subTex, { glow: 0.16 });

      var Lintp = newLayer({ id: 'intp', name: '硅中介层', en: 'CoWoS-L INTERPOSER', y0: 0, dy: 1.25, xw: 9.7,
        note: '一整片晶圆级硅中介层：裸片之间 10 TB/s 的互连在它上面走线，硅通孔垂直穿过。' }, macroRoot);
      layers.push(Lintp);
      var intpTex = mkTraceTex({ seed: 23, density: 1.35, grid: 80, bg: '#0a1723' });
      TEXS.push(intpTex.tex);
      addPlate(Lintp, 9.7, 6.4, 0.10, 0.05, intpTex, { col: PAL.si, glow: 0.24 });

      var Ldie = newLayer({ id: 'die', name: '裸片 · 功能区块', en: 'DIE · GPC / L2 / PHY', y0: 0.12, dy: 2.5, xw: 7.4,
        note: '两颗计算裸片各含 8 组 GPC 与 L2 缓存切片；内侧是 NV-HBI，外侧面向 HBM PHY。' }, macroRoot);
      layers.push(Ldie);
      (function () {
        var list = [];
        for (var di = 0; di < 2; di++) {
          var cx = di === 0 ? -DIE_CX : DIE_CX;
          list.push({ x: cx, z: 0, w: DIE_W, d: DIE_D, h: 0.10, col: PAL.dieslab, kind: 'slab', y: 0, noPick: true });
          for (var r = 0; r < 2; r++) for (var c = 0; c < 4; c++) {
            list.push({
              x: cx + (c - 1.5) * 0.82, z: -1.08 + r * 2.16, w: 0.76, d: 1.58, h: 0.12,
              col: PAL.gpc, kind: 'gpc', y: 0.10,
              name: 'GPC ' + pad2(di * 8 + r * 4 + c), sub: '8 SM · ' + (di === 0 ? 'die A' : 'die B'),
              info: '图形处理簇：每组含 8 个 SM，128 个 FP32 通道与 4 个张量核。'
            });
          }
          for (var s2 = 0; s2 < 8; s2++) {
            list.push({
              x: cx + (s2 - 3.5) * 0.40, z: 2.06, w: 0.36, d: 0.30, h: 0.07,
              col: PAL.l2, kind: 'l2', y: 0.10,
              name: 'L2 切片 ' + pad2(di * 8 + s2), sub: '共享缓存 · 分片寻址',
              info: 'L2 缓存按切片分布，全部切片组成统一地址空间。'
            });
          }
          for (var k = 0; k < 4; k++) {
            list.push({
              x: cx + (di === 0 ? -1.70 : 1.70), z: (k - 1.5) * 0.92, w: 0.12, d: 0.58, h: 0.06,
              col: PAL.phy, kind: 'phy', y: 0.10,
              name: 'HBM PHY ' + pad2(di * 4 + k), sub: '2048-bit 接口',
              info: '显存物理层：每组 PHY 以 2048-bit 总线对接一侧的 HBM3e 堆叠。'
            });
          }
          list.push({
            x: cx + (di === 0 ? 1.70 : -1.70), z: 0, w: 0.14, d: 4.30, h: 0.06,
            col: PAL.warm, kind: 'hbi', y: 0.10,
            name: 'NV-HBI', sub: 'die 间互连 · 10 TB/s',
            info: '两颗裸片之间的高速互连总线，让双 die 对外呈现为一颗逻辑 GPU。'
          });
          list.push({
            x: cx, z: -2.12, w: 2.6, d: 0.24, h: 0.05, col: PAL.io, kind: 'io', y: 0.10,
            name: 'PCIe 6.0 PHY', sub: '主机接口', info: '对外的 PCIe 6.0 与 NVLink 边带接口。'
          });
        }
        addBlocks(Ldie, list, { pick: { view: 'macro', chip: 'gpu' } });
      })();

      var Lhbm = newLayer({ id: 'hbm', name: 'HBM3e 堆叠', en: '3D DRAM STACK', y0: 0.12, dy: 2.5, xw: 9.6,
        note: '8 组 HBM3e：每层 DRAM 以微凸块垂直堆叠，经 TSV 引到基逻辑裸片。' }, macroRoot);
      layers.push(Lhbm);
      (function () {
        var list = [];
        for (var sd = 0; sd < 8; sd++) {
          var hx = (sd < 4 ? -4.1 : 4.1), hz = (sd % 4 - 1.5) * 1.45;
          list.push({ x: hx, z: hz, w: 1.30, d: 1.30, h: 0.08, col: PAL.dramBase, kind: 'drambase', y: 0, noPick: true });
          for (var ly = 0; ly < 8; ly++) {
            var first = (sd === 0 && ly === 0);
            list.push({
              x: hx, z: hz, w: 1.22 - ly * 0.012, d: 1.22 - ly * 0.012, h: 0.055,
              col: PAL.dram, kind: 'dram', y: 0.08 + ly * 0.078,
              name: first ? 'HBM3e 堆叠' : '', noPick: !first, sub: '12-hi · 24 GB',
              info: '8 层 DRAM 堆叠 + 1 层基逻辑裸片，层间以微凸块与 TSV 垂直互连，单组 24 GB。'
            });
          }
        }
        addBlocks(Lhbm, list, { edgeOp: 0.14 });
      })();

      /* TSV：基板 → 中介层 */
      (function () {
        var pitch = LOW ? 0.62 : 0.42, items = [];
        for (var ix = -4.4; ix <= 4.4; ix += pitch) for (var iz = -2.9; iz <= 2.9; iz += pitch) items.push([ix, iz]);
        addLinks('macro', 'gpumacro', Lsub, Lintp, items, { r: 0.03, col: 0x3a7d99 });
      })();
      /* 微凸块：中介层 → 裸片 / HBM */
      (function () {
        var pitch = LOW ? 0.34 : 0.2, items = [], hitems = [];
        for (var di = 0; di < 2; di++) {
          var cx = di === 0 ? -DIE_CX : DIE_CX;
          for (var ix = -DIE_W / 2 + 0.1; ix < DIE_W / 2 - 0.05; ix += pitch)
            for (var iz = -DIE_D / 2 + 0.1; iz < DIE_D / 2 - 0.05; iz += pitch) items.push([cx + ix, iz]);
        }
        for (var sd = 0; sd < 8; sd++) {
          var hx = (sd < 4 ? -4.1 : 4.1), hz = (sd % 4 - 1.5) * 1.45;
          for (var bx = -0.5; bx <= 0.5; bx += 0.25) for (var bz = -0.5; bz <= 0.5; bz += 0.25) hitems.push([hx + bx, hz + bz]);
        }
        addLinks('macro', 'gpumacro', Lintp, Ldie, items, { r: 0.035, col: 0x56b8d4 });
        addLinks('macro', 'gpumacro', Lintp, Lhbm, hitems, { r: 0.035, col: 0x56b8d4 });
      })();

      /* 脉冲 */
      (function () {
        var items = [];
        pushPathItems(items, subTex.paths, 1024, SUB_W, SUB_D, LOW ? 26 : 46,
          function () { return Lsub.curY; }, 0.01);
        pushPathItems(items, intpTex.paths, 1024, 9.7, 6.4, LOW ? 30 : 54,
          function () { return Lintp.curY; }, 0.11);
        for (var i = 0; i < (LOW ? 16 : 34); i++) {
          items.push({ v: true, x: (Math.random() - 0.5) * 8.6, z: (Math.random() - 0.5) * 5.6,
            a: Lsub, b: Lintp, oa: 0, ob: 0, u: Math.random(), speed: 0.25 + Math.random() * 0.3 });
        }
        makeFlow(items, macroRoot, 'gpumacro');
      })();

      allLayers.gpu = layers;
    }

    /* ---- 宏观：CPU（IOD + 12 CCD chiplet） ---- */
    function buildMacroCPU() {
      var layers = [];
      var SUB_W = 9.8, SUB_D = 8.6;

      var Lpins = newLayer({ id: 'pins', name: 'LGA 触点', en: 'LAND GRID ARRAY', y0: -0.245, dy: -1.5, xw: 9.8,
        note: 'LGA 平面触点阵列：插座弹簧针压在焊盘上完成连接，耐插拔次数远高于针脚式封装。' }, macroRoot);
      layers.push(Lpins);
      (function () {
        var pitch = LOW ? 0.44 : 0.26, items = [];
        for (var ix = -4.6; ix <= 4.58; ix += pitch) for (var iz = -4.0; iz <= 3.98; iz += pitch) items.push([ix, iz]);
        addPads(Lpins, items, boxGeo, new THREE.MeshStandardMaterial({
          color: 0xb9c4cc, roughness: 0.3, metalness: 0.9
        }), [0.14, 0.026, 0.14]);
        Lpins.count = items.length;
      })();

      var Lsub = newLayer({ id: 'sub', name: '封装基板', en: 'ABF SUBSTRATE', y0: 0, dy: 0, xw: 9.8,
        note: '有机基板承担 13 颗 chiplet 之间的全部扇出布线，是芯片上走线最长的一层。' }, macroRoot);
      layers.push(Lsub);
      var subTex = mkTraceTex({ seed: 37, density: 0.85, pads: true, grid: 64 });
      TEXS.push(subTex.tex);
      addPlate(Lsub, SUB_W, SUB_D, 0.22, -0.11, subTex, { glow: 0.16 });

      var Lrdl = newLayer({ id: 'rdl', name: 'RDL 布线层', en: 'REDISTRIBUTION LAYER', y0: 0, dy: 1.15, xw: 9.2,
        note: '再分布层把基板焊盘映射到 chiplet 焊区，相当于封装内的最后一层"主板"。' }, macroRoot);
      layers.push(Lrdl);
      var rdlTex = mkTraceTex({ seed: 51, density: 1.25, grid: 76, bg: '#0a1622' });
      TEXS.push(rdlTex.tex);
      addPlate(Lrdl, 9.2, 8.0, 0.055, 0.028, rdlTex, { col: 0x0f2334, glow: 0.24 });

      var Ldie = newLayer({ id: 'die', name: 'chiplet 阵列', en: 'IOD + 12 CCD', y0: 0.14, dy: 2.4, xw: 8.6,
        note: '中央 IOD 负责 12 通道 DDR5 与 PCIe；两侧 12 颗 CCD 各含 16 个 Zen 5c 核心。' }, macroRoot);
      layers.push(Ldie);
      (function () {
        var list = [];
        list.push({ x: 0, z: 0, w: 1.9, d: 6.6, h: 0.10, col: PAL.iod, kind: 'iod', y: 0,
          name: 'IOD', sub: '12nm · 内存 / PCIe 控制器',
          info: '输入输出裸片：12 通道 DDR5-6000、128 条 PCIe 5.0 lane 与 Infinity Fabric 互连。' });
        for (var m = 0; m < 6; m++) {
          list.push({ x: -0.55, z: -2.4 + m * 0.96, w: 0.62, d: 0.24, h: 0.05, col: PAL.phy, kind: 'phy', y: 0.10,
            name: m === 0 ? 'DDR5 PHY' : '', noPick: m > 0, sub: '每颗带 2 通道',
            info: 'DDR5 物理接口：两侧对称布置，共 12 通道内存控制器。' });
          list.push({ x: 0.55, z: -2.4 + m * 0.96, w: 0.62, d: 0.24, h: 0.05, col: PAL.phy, kind: 'phy', y: 0.10, noPick: true });
        }
        list.push({ x: 0, z: 2.92, w: 0.9, d: 0.5, h: 0.07, col: PAL.warm, kind: 'pcie', y: 0.10,
          name: 'PCIe 5.0', sub: '128 lane', info: 'PCIe 5.0 控制器簇，128 条 lane 直出插槽。' });
        for (var col = 0; col < 2; col++) {
          for (var row = 0; row < 6; row++) {
            var cx = col === 0 ? -2.05 : 2.05, cz = (row - 2.5) * 1.06;
            var firstCcd = (col === 0 && row === 0);
            list.push({ x: cx, z: cz, w: 1.62, d: 0.94, h: 0.12, col: PAL.ccd, kind: 'ccd', y: 0,
              name: firstCcd ? 'CCD 计算裸片' : '', noPick: !firstCcd, sub: '3nm · 16 核 · 32 MB L3',
              info: '每颗 CCD 含 2 个 CCX、16 个 Zen 5c 核心与 32 MB L3 缓存。' });
            for (var c2 = 0; c2 < 8; c2++) for (var r2 = 0; r2 < 2; r2++) {
              var firstCore = firstCcd && c2 === 0 && r2 === 0;
              list.push({
                x: cx + (c2 - 3.5) * 0.18, z: cz + (r2 - 0.5) * 0.40, w: 0.15, d: 0.32, h: 0.07,
                col: PAL.core, kind: 'core', y: 0.12,
                name: firstCore ? 'Zen 5c 核心' : '', noPick: !firstCore,
                sub: '共 192 核 · 384 线程',
                info: 'Zen 5c 密集核心：与标准 Zen 5 同 IPC，牺牲部分缓存容量换取密度。'
              });
            }
          }
        }
        addBlocks(Ldie, list, { pick: { view: 'macro', chip: 'cpu' } });
      })();

      /* 微凸块：RDL → chiplet；基板垂直过孔：基板 → RDL */
      (function () {
        var pitch = LOW ? 0.3 : 0.2, items = [];
        for (var ix = -0.85; ix <= 0.85; ix += pitch) for (var iz = -3.2; iz <= 3.2; iz += pitch) items.push([ix, iz]);
        for (var col = 0; col < 2; col++) for (var row = 0; row < 6; row++) {
          var cx = col === 0 ? -2.05 : 2.05, cz = (row - 2.5) * 1.06;
          for (var bx = -0.68; bx <= 0.68; bx += pitch) for (var bz = -0.36; bz <= 0.36; bz += pitch) items.push([cx + bx, cz + bz]);
        }
        addLinks('macro', 'cpumacro', Lrdl, Ldie, items, { r: 0.032, col: 0x56b8d4 });
        var p2 = LOW ? 0.6 : 0.42, it2 = [];
        for (ix = -4.2; ix <= 4.2; ix += p2) for (var iz = -3.6; iz <= 3.6; iz += p2) it2.push([ix, iz]);
        addLinks('macro', 'cpumacro', Lsub, Lrdl, it2, { r: 0.026, col: 0x3a7d99 });
      })();

      /* 脉冲 */
      (function () {
        var items = [];
        pushPathItems(items, subTex.paths, 1024, SUB_W, SUB_D, LOW ? 28 : 48,
          function () { return Lsub.curY; }, 0.01);
        pushPathItems(items, rdlTex.paths, 1024, 9.2, 8.0, LOW ? 24 : 42,
          function () { return Lrdl.curY; }, 0.06);
        for (var i = 0; i < (LOW ? 14 : 30); i++) {
          items.push({ v: true, x: (Math.random() - 0.5) * 8.4, z: (Math.random() - 0.5) * 6.8,
            a: Lsub, b: Lrdl, oa: 0, ob: 0, u: Math.random(), speed: 0.25 + Math.random() * 0.3 });
        }
        makeFlow(items, macroRoot, 'cpumacro');
      })();

      allLayers.cpu = layers;
    }

    /* ---- 微观：单元 BEOL 剖面 ---- */
    function buildMicro(chipKey) {
      var layers = [];
      var U = 3.1;
      var isGpu = chipKey === 'gpu';
      var tag = chipKey + 'micro';

      var Lfin = newLayer({ id: 'fin', name: '硅基底 · FinFET', en: 'FINFET ARRAY', y0: 0, dy: -0.55, xw: 3.1,
        note: '晶体管层：电流沿竖直的鳍流动，栅极包住鳍的三面，把漏电压到最低。' }, microRoot);
      layers.push(Lfin);
      (function () {
        var slab = new THREE.Mesh(new THREE.BoxGeometry(U, 0.10, U), plateMat(PAL.si, 0.7));
        slab.position.y = 0.05;
        Lfin.group.add(slab);
        var finList = [], nFin = LOW ? 44 : 64;
        for (var i = 0; i < nFin; i++) {
          finList.push({ x: 0, z: (i - (nFin - 1) / 2) * (2.9 / nFin), w: 2.9, d: 0.024, h: 0.055, col: PAL.fin, y: 0.10, noPick: true });
        }
        addBlocks(Lfin, finList, { noEdge: true });
        var gateList = [], nGate = 22;
        for (var g = 0; g < nGate; g++) {
          gateList.push({ x: (g - (nGate - 1) / 2) * 0.132, z: 0, w: 0.045, d: U - 0.08, h: 0.075, col: PAL.gate, y: 0.12, noPick: true });
        }
        var gm = new THREE.InstancedMesh(boxGeo, new THREE.MeshStandardMaterial({
          color: PAL.gate, roughness: 0.4, metalness: 0.5, emissive: 0x0e2c3c, emissiveIntensity: 0.4
        }), gateList.length);
        gm.frustumCulled = false;
        gateList.forEach(function (b, i) {
          _p.set(b.x, b.y + b.h / 2, b.z); _s.set(b.w, b.h, b.d);
          _m4.compose(_p, _q0, _s); gm.setMatrixAt(i, _m4);
        });
        gm.instanceMatrix.needsUpdate = true;
        Lfin.group.add(gm);
      })();

      function metalLayer(id, name, en, note, y0, dy, texOpt) {
        var L = newLayer({ id: id, name: name, en: en, note: note, y0: y0, dy: dy, xw: U }, microRoot);
        layers.push(L);
        var tex = mkTraceTex(texOpt);
        TEXS.push(tex.tex);
        addPlate(L, U, U, 0.03, 0.015, tex, { col: 0x12283a, glow: id === 'm1' ? 0.3 : 0.22 });
        L.flowPaths = tex.paths;
        L.texSize = texOpt.size || 1024;
        return L;
      }
      var Lm1 = metalLayer('m1', '金属层 M1', 'M1 · LOCAL INTERCONNECT',
        '最细的一层金属：节距几十纳米，单元内部的局部互连全在这一层完成。', 0.20, 0.5,
        { seed: isGpu ? 61 : 63, density: 1.6, grid: 90, size: 768, bg: '#0a1622' });
      var Lm2 = metalLayer('m2', '金属层 M2', 'M2 · INTERMEDIATE',
        '中间层：线宽放宽一档，承担单元与单元之间的信号传输。', 0.30, 1.05,
        { seed: isGpu ? 71 : 73, density: 1.0, grid: 64, size: 768, bg: '#0a1520' });
      var Lm3 = metalLayer('m3', '金属层 M3', 'M3 · GLOBAL ROUTING',
        '全局布线层：最宽的金属线，时钟与电源主干从这里横穿整个单元。', 0.40, 1.6,
        { seed: isGpu ? 81 : 83, density: 0.55, grid: 44, size: 768, bg: '#091420' });

      var Lblk = newLayer({
        id: 'blk', name: isGpu ? '单元分区 · SM' : '单元分区 · Zen 5c', en: 'UNIT FLOORPLAN',
        y0: 0.52, dy: 2.2, xw: U,
        note: isGpu ? '一个 SM 拆成 4 个 SMSP 处理块，中间是 256 KB 的 L1 / 共享内存。'
                    : '一个 Zen 5c 核心自上而下：前端解码 → 整数 / 存取 → 浮点 FMA → 1 MB L2。'
      }, microRoot);
      layers.push(Lblk);
      (function () {
        var list = [];
        if (isGpu) {
          for (var qx = 0; qx < 2; qx++) for (var qz = 0; qz < 2; qz++) {
            var cx = qx === 0 ? -0.80 : 0.80, cz = qz === 0 ? -0.80 : 0.80, f = (qx === 0 && qz === 0);
            list.push({ x: cx, z: cz, w: 1.34, d: 1.34, h: 0.07, col: PAL.smsp, kind: 'smsp', y: 0,
              name: f ? 'SMSP 处理块' : '', noPick: !f, sub: '32 FP32 + 1 张量核',
              info: 'SM 的四分之一：32 个 FP32 通道、1 个张量核、warp 调度器与寄存器堆 bank。' });
            for (var l = 0; l < 16; l++) {
              list.push({ x: cx - 0.56 + l * 0.075, z: cz - 0.40, w: 0.05, d: 0.16, h: 0.05, col: PAL.lane, y: 0.07, noPick: true });
              list.push({ x: cx - 0.56 + l * 0.075, z: cz + 0.40, w: 0.05, d: 0.16, h: 0.05, col: PAL.lane, y: 0.07, noPick: true });
            }
            list.push({ x: cx, z: cz, w: 0.26, d: 0.26, h: 0.09, col: PAL.warm, kind: 'tensor', y: 0.07,
              name: f ? '张量核' : '', noPick: !f, sub: '第 5 代 · FP4 / FP8',
              info: '张量核执行矩阵乘加，是神经网络训练与推理的主力单元。' });
            [-0.30, 0.30].forEach(function (ox) {
              [-0.60, 0.60].forEach(function (oz) {
                list.push({ x: cx + ox, z: cz + oz, w: 0.5, d: 0.10, h: 0.05, col: PAL.reg, y: 0.07, noPick: true });
              });
            });
          }
          list.push({ x: 0, z: 0, w: 2.0, d: 0.60, h: 0.06, col: PAL.l1, kind: 'l1', y: 0,
            name: 'L1 / 共享内存', sub: '256 KB',
            info: '四个 SMSP 共享的 L1 数据缓存与可编程共享内存，SM 内通信延迟极低。' });
        } else {
          list.push({ x: -1.05, z: -1.18, w: 0.78, d: 0.50, h: 0.07, col: PAL.fe, kind: 'fe', y: 0,
            name: '取指 / L1I', sub: '32 KB', info: '指令缓存与取指单元，每周期取 32 字节。' });
          list.push({ x: 0.15, z: -1.18, w: 1.30, d: 0.50, h: 0.07, col: PAL.fe, kind: 'fe2', y: 0,
            name: '解码 · 8-wide', sub: '每周期 8 条指令', info: '8 宽解码前端，把 x86 指令译码为微操作。' });
          list.push({ x: 1.20, z: -1.18, w: 0.60, d: 0.50, h: 0.07, col: PAL.fe, kind: 'fe3', y: 0,
            name: '分支预测', sub: 'TAGE 预测器', info: 'TAGE 结构的分支预测，错误预测的代价高达十几个周期。' });
          list.push({ x: -0.42, z: -0.35, w: 1.9, d: 0.75, h: 0.07, col: PAL.alu, kind: 'alu', y: 0,
            name: '整数执行', sub: '6 × ALU', info: '6 个整数 ALU，每周期最多执行 6 条整数运算。' });
          for (var a = 0; a < 6; a++) list.push({ x: -1.22 + a * 0.32, z: -0.35, w: 0.24, d: 0.5, h: 0.10, col: 0x6fe2f2, y: 0.07, noPick: true });
          list.push({ x: 1.05, z: -0.35, w: 0.85, d: 0.75, h: 0.07, col: PAL.agu, kind: 'agu', y: 0,
            name: 'AGU 存取', sub: '2 × load / store', info: '地址生成单元：计算访存地址并发射加载 / 存储。' });
          list.push({ x: -0.60, z: 0.45, w: 1.55, d: 0.75, h: 0.07, col: PAL.fpu, kind: 'fpu', y: 0,
            name: '浮点 FMA', sub: '2 × 512-bit', info: '两条 512-bit FMA 流水线，AVX-512 全宽执行。' });
          for (var f2 = 0; f2 < 2; f2++) list.push({ x: -1.2 + f2 * 1.2, z: 0.45, w: 0.9, d: 0.5, h: 0.10, col: 0x6fa8f2, y: 0.07, noPick: true });
          list.push({ x: 0.95, z: 0.45, w: 1.10, d: 0.75, h: 0.07, col: PAL.l1d, kind: 'l1d', y: 0,
            name: 'L1D 数据缓存', sub: '48 KB', info: '48 KB 的 L1 数据缓存，读取延迟约 4 个周期。' });
          list.push({ x: 0, z: 1.22, w: 2.9, d: 0.42, h: 0.06, col: PAL.l1, kind: 'l2', y: 0,
            name: 'L2 缓存', sub: '1 MB · 17 周期', info: '每核心私有 1 MB L2，是核内最后一级私有缓存。' });
        }
        addBlocks(Lblk, list, { pick: { view: 'micro', chip: chipKey } });
      })();

      /* 层间过孔 */
      (function () {
        var p1 = LOW ? 0.22 : 0.115, items1 = [];
        for (var ix = -1.4; ix <= 1.4; ix += p1) for (var iz = -1.4; iz <= 1.4; iz += p1) items1.push([ix, iz]);
        addLinks('micro', tag, Lfin, Lm1, items1, { r: 0.014, oa: 0.155, col: 0x4a8aa6 });
        var p2 = LOW ? 0.3 : 0.165, items2 = [];
        for (ix = -1.35; ix <= 1.35; ix += p2) for (iz = -1.35; iz <= 1.35; iz += p2) items2.push([ix, iz]);
        addLinks('micro', tag, Lm1, Lm2, items2, { r: 0.02, oa: 0.03, col: 0x4a8aa6 });
        var p3 = LOW ? 0.5 : 0.3, items3 = [];
        for (ix = -1.3; ix <= 1.3; ix += p3) for (iz = -1.3; iz <= 1.3; iz += p3) items3.push([ix, iz]);
        addLinks('micro', tag, Lm2, Lm3, items3, { r: 0.028, oa: 0.03, col: 0x4a8aa6 });
      })();

      /* 脉冲 */
      (function () {
        var items = [];
        pushPathItems(items, Lm1.flowPaths, Lm1.texSize, U, U, LOW ? 22 : 40, function () { return Lm1.curY; }, 0.04);
        pushPathItems(items, Lm2.flowPaths, Lm2.texSize, U, U, LOW ? 16 : 30, function () { return Lm2.curY; }, 0.04);
        pushPathItems(items, Lm3.flowPaths, Lm3.texSize, U, U, LOW ? 10 : 18, function () { return Lm3.curY; }, 0.04);
        for (var i = 0; i < (LOW ? 10 : 22); i++) {
          items.push({ v: true, x: (Math.random() - 0.5) * 2.6, z: (Math.random() - 0.5) * 2.6,
            a: Lm1, b: Lm2, oa: 0.03, ob: 0, u: Math.random(), speed: 0.3 + Math.random() * 0.35 });
        }
        makeFlow(items, microRoot, tag);
      })();

      microLayers[chipKey] = layers;
    }

    buildMacroGPU();
    buildMacroCPU();
    buildMicro('gpu');
    buildMicro('cpu');

    /* 裸片底部的呼吸辉光 */
    var floorGlows = {};
    ['gpu', 'cpu'].forEach(function (k) {
      var m = new THREE.MeshBasicMaterial({
        map: mkFloorTex(), transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false, color: 0x66d8f0
      });
      TEXS.push(m.map);
      var mesh = new THREE.Mesh(new THREE.PlaneGeometry(11.5, 9.5), m);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = -0.02;
      var dieLayer = (k === 'gpu' ? allLayers.gpu : allLayers.cpu)[3];
      dieLayer.group.add(mesh);
      floorGlows[k] = m;
    });

    /* ============================================================
       六、HUD
       ============================================================ */
    var hud = document.createElement('div');
    hud.className = 'chip-hud';
    hud.innerHTML =
      '<div class="cp-grid"></div>' +
      '<div class="cp-top"><span class="cp-logo">SILICON<em>·</em>STACK</span>' +
      '<span class="cp-sub" id="cpSub"></span></div>' +
      '<div class="cp-kpi" id="cpKpi"></div>' +
      '<div class="cp-hint" id="cpHint"></div>' +
      '<div class="cp-stack" id="cpStack"></div>' +
      '<div class="cp-xsec"><h4>侧视剖面<b>SECTION</b></h4><canvas id="cpXsec" width="304" height="280"></canvas></div>' +
      '<div class="cp-toggle" id="cpToggle">' +
      '<button data-v="macro">宏观 · 封装堆叠</button><button data-v="micro">微观 · 单元内部</button></div>' +
      '<div class="cp-card" id="cpCard"></div>' +
      '<div class="cp-labels" id="cpLabels"></div>' +
      '<div class="cp-flash" id="cpFlash"></div>';
    stageEl.appendChild(hud);

    var elKpi = hud.querySelector('#cpKpi'), elStack = hud.querySelector('#cpStack');
    var elCard = hud.querySelector('#cpCard'), elSub = hud.querySelector('#cpSub');
    var elHint = hud.querySelector('#cpHint'), elFlash = hud.querySelector('#cpFlash');
    var elLabels = hud.querySelector('#cpLabels');
    var elToggle = hud.querySelector('#cpToggle');
    var btnToggle = elToggle.querySelectorAll('button');
    var xsecCv = hud.querySelector('#cpXsec');

    /* 3D 标注 */
    var labelDefs = [];
    (function () {
      function anchor(group, x, y, z) {
        var o = new THREE.Object3D(); o.position.set(x, y, z); group.add(o); return o;
      }
      function add(view, chip, obj, text, sub) {
        var el = document.createElement('div');
        el.className = 'cp-ld';
        el.innerHTML = '<svg width="60" height="60"><line x1="0" y1="0" x2="34" y2="-30"/>' +
          '<circle cx="0" cy="0" r="2.2"/></svg>' +
          '<span class="cp-lb">' + text + (sub ? ' <b>' + sub + '</b>' : '') + '</span>';
        elLabels.appendChild(el);
        labelDefs.push({ view: view, chip: chip, obj: obj, el: el });
      }
      var gl = allLayers.gpu, cl = allLayers.cpu;
      add('macro', 'gpu', anchor(gl[3].group, 0, 0.35, -2.32), '裸片 · GPC × 16', '2 die');
      add('macro', 'gpu', anchor(gl[4].group, -4.1, 0.85, 1.45), 'HBM3e', '8 × 24 GB');
      add('macro', 'gpu', anchor(gl[2].group, -4.6, 0.12, 0), '硅中介层', 'CoWoS-L');
      add('macro', 'gpu', anchor(gl[0].group, 5.0, 0, 3.4), 'BGA 锡球', '×' + gl[0].count);
      add('macro', 'gpu', anchor(gl[3].group, 2.9, 0.28, 0), 'NV-HBI', '10 TB/s');
      add('macro', 'cpu', anchor(cl[3].group, 0, 0.2, 0), 'IOD', '12nm');
      add('macro', 'cpu', anchor(cl[3].group, 2.05, 0.28, -2.6), 'CCD × 12', 'Zen 5c');
      add('macro', 'cpu', anchor(cl[0].group, 4.4, 0, 3.8), 'LGA 触点', '×' + cl[0].count);
      add('macro', 'cpu', anchor(cl[2].group, 4.3, 0.08, -3.8), 'RDL 布线层', '');
      var mg = microLayers.gpu, mc = microLayers.cpu;
      add('micro', 'gpu', anchor(mg[0].group, -1.2, 0.2, 1.2), 'FinFET 阵列', '鳍式晶体管');
      add('micro', 'gpu', anchor(mg[1].group, 1.3, 0.05, -1.3), 'M1', '局部互连');
      add('micro', 'gpu', anchor(mg[3].group, -1.3, 0.05, 1.3), 'M3', '全局布线');
      add('micro', 'gpu', anchor(mg[4].group, 0, 0.18, 0), 'SM · 单元分区', '4 SMSP');
      add('micro', 'cpu', anchor(mc[0].group, -1.2, 0.2, 1.2), 'FinFET 阵列', '');
      add('micro', 'cpu', anchor(mc[3].group, -1.3, 0.05, 1.3), 'M3', '全局布线');
      add('micro', 'cpu', anchor(mc[4].group, 0, 0.18, 0), 'Zen 5c · 单元分区', '6 ALU');
    })();

    var _pv = new THREE.Vector3();
    function updateLabels(w, h) {
      var show = P.labels && w >= 900;
      for (var i = 0; i < labelDefs.length; i++) {
        var L = labelDefs[i];
        if (!show || P.view !== L.view || P.chip !== L.chip) { L.el.style.display = 'none'; continue; }
        L.obj.getWorldPosition(_pv);
        _pv.project(camera);
        if (_pv.z > 1 || _pv.z < -1) { L.el.style.display = 'none'; continue; }
        var sx = (_pv.x * 0.5 + 0.5) * w, sy = (-_pv.y * 0.5 + 0.5) * h;
        if (sx < 60 || sx > w - 60 || sy < 60 || sy > h - 60) { L.el.style.display = 'none'; continue; }
        L.el.style.display = 'block';
        L.el.style.transform = 'translate(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px)';
      }
    }

    /* 侧视剖面小图 */
    var xsecKey = '';
    function drawXsec() {
      var layers = P.view === 'macro' ? allLayers[P.chip] : microLayers[P.chip];
      var key = P.view + P.chip + curE.toFixed(3);
      if (key === xsecKey) return;
      xsecKey = key;
      var c = xsecCv.getContext('2d');
      c.setTransform(2, 0, 0, 2, 0, 0);
      c.clearRect(0, 0, 152, 140);
      var yMin = P.view === 'macro' ? -1.7 : -0.7;
      var yMax = P.view === 'macro' ? 2.8 : 2.5;
      function mapY(y) { return 128 - (y - yMin) / (yMax - yMin) * 112; }
      c.strokeStyle = 'rgba(90,180,220,.22)'; c.setLineDash([3, 3]); c.lineWidth = 1;
      c.beginPath(); c.moveTo(76, 8); c.lineTo(76, 132); c.stroke();
      c.setLineDash([]);
      layers.forEach(function (L, i) {
        var w = Math.min(132, (L.W || 9) / 11 * 126);
        var y = mapY(L.curY);
        var isDie = (L.id === 'die' || L.id === 'hbm' || L.id === 'blk');
        var hh = Math.max(2.5, Math.min(8, isDie ? 7 : 5));
        c.fillStyle = isDie ? 'rgba(255,180,84,.16)' : 'rgba(82,232,247,.09)';
        c.strokeStyle = isDie ? 'rgba(255,180,84,.75)' : 'rgba(82,232,247,.55)';
        c.lineWidth = 1;
        c.fillRect(76 - w / 2, y - hh / 2, w, hh);
        c.strokeRect(76 - w / 2, y - hh / 2, w, hh);
        c.fillStyle = isDie ? 'rgba(255,190,110,.9)' : 'rgba(140,220,240,.72)';
        c.font = '7px Consolas, monospace';
        c.fillText('' + i, 3, y + 2.5);
        var tagS = L.id.toUpperCase();
        c.fillText(tagS, 149 - c.measureText(tagS).width, y + 2.5);
      });
      c.fillStyle = 'rgba(140,220,240,.5)';
      c.font = '6.5px Consolas, monospace';
      c.fillText('层间距 ' + Math.round(curE * 100) + '%', 3, 137);
    }

    function renderKpi() {
      var c = CHIPS[P.chip];
      elKpi.innerHTML = c.kpi.map(function (k, i) {
        return '<span class="cp-k' + (i === 0 ? ' hot' : '') + '"><b>' + k[0] +
          '<i>' + k[1] + '</i></b><span>' + k[2] + '</span></span>';
      }).join('');
      elSub.textContent = c.vendor + ' · ' + c.node + ' · ' +
        (P.view === 'macro' ? '封装堆叠剖面' : c.unit + ' 单元剖面');
    }
    function renderStack() {
      var layers = P.view === 'macro' ? allLayers[P.chip] : microLayers[P.chip];
      elStack.innerHTML = '<h5>层叠结构<b>STACK · ' + layers.length + ' LAYERS</b></h5>' +
        layers.map(function (L, i) {
          return '<button class="cp-l' + (i === focusIdx ? ' on' : '') + '" data-i="' + i + '">' +
            '<span class="cp-li">' + pad2(i) + '</span>' +
            '<span class="cp-ln">' + L.name + '</span>' +
            '<span class="cp-le">' + L.en + '</span></button>';
        }).join('');
      Array.prototype.forEach.call(elStack.querySelectorAll('.cp-l'), function (b) {
        b.addEventListener('click', function () { toggleFocus(parseInt(b.dataset.i, 10)); });
      });
    }
    function renderCard() {
      var c = CHIPS[P.chip], micro = P.view === 'micro';
      var legend = micro ? c.legendMicro : c.legend;
      var html = '<h5>' + (micro ? '单元构成 · ' + c.unit : '功能区块 · BLOCKS') + '</h5>';
      html += legend.map(function (l) {
        return '<div class="cp-lg"><i style="background:' + l[0] + '"></i>' +
          '<span>' + l[1] + '</span><b>' + l[2] + '</b></div>';
      }).join('');
      html += '<div class="cp-desc">' + c.note + '</div>';
      var layers = P.view === 'macro' ? allLayers[P.chip] : microLayers[P.chip];
      if (focusIdx >= 0 && layers[focusIdx]) {
        html += '<div class="cp-focus"><b>' + layers[focusIdx].name + '</b>' +
          '<span>' + layers[focusIdx].note + '</span></div>';
      }
      if (micro) html += '<button class="cp-back">← 返回宏观</button>';
      elCard.innerHTML = html;
      var back = elCard.querySelector('.cp-back');
      if (back) back.addEventListener('click', function () { goView('macro'); });
    }
    function renderHud() {
      renderKpi(); renderStack(); renderCard();
      btnToggle[0].classList.toggle('on', P.view === 'macro');
      btnToggle[1].classList.toggle('on', P.view === 'micro');
      elHint.textContent = P.view === 'macro'
        ? '点击功能区块下钻单元 · 点击左侧层叠结构聚焦剖面 · 拖动旋转 / 滚轮缩放'
        : 'M1 → M3 是同一套逻辑的三层金属剖面 · 点击分区查看说明';
      xsecKey = '';
      drawXsec();
    }

    /* ============================================================
       七、参数、视角、聚焦
       ============================================================ */
    var P = { view: 'macro', chip: 'gpu', explode: 0.62, flow: true, pins: true, labels: true, spin: false };
    var curE = 0, introK = 0, focusIdx = -1;
    var trans = null, flyFocus = null;
    var _v3 = new THREE.Vector3();

    function homePose(view) {
      var aspect = camera.aspect || 1.6;
      var k = aspect < 1.15 ? Math.min(1.95, Math.pow(1.15 / aspect, 0.85)) : 1;
      if (view === 'macro') return { el: 0.62, az: 0.42, dist: 15.5 * k, tgt: [0, 0.85, 0] };
      return { el: 0.55, az: 0.35, dist: 6.6 * k, tgt: [0, 0.85, 0] };
    }
    function poseToPos(pose) {
      return [
        pose.tgt[0] + pose.dist * Math.cos(pose.el) * Math.sin(pose.az),
        pose.tgt[1] + pose.dist * Math.sin(pose.el),
        pose.tgt[2] + pose.dist * Math.cos(pose.el) * Math.cos(pose.az)
      ];
    }

    function layout(e) {
      curE = e;
      [allLayers.gpu, allLayers.cpu, microLayers.gpu, microLayers.cpu].forEach(function (ls) {
        if (!ls) return;
        ls.forEach(function (L) {
          L.curY = L.y0 + L.dy * e;
          L.group.position.y = L.curY;
        });
      });
      links.forEach(rebuildLink);
      xsecKey = '';
      drawXsec();
    }
    layout(0);

    function toggleFocus(i) {
      focusIdx = (focusIdx === i) ? -1 : i;
      var layers = P.view === 'macro' ? allLayers[P.chip] : microLayers[P.chip];
      var pose = null;
      if (focusIdx >= 0) {
        var L = layers[focusIdx];
        var aspect = camera.aspect || 1.6;
        var k = aspect < 1.15 ? 1.45 : 1;
        pose = { el: 0.34, az: 0.55, dist: (P.view === 'macro' ? 8.6 : 4.8) * k,
                 tgt: [0, clamp(L.curY + 0.15, -0.6, 4.2), 0] };
      } else {
        pose = homePose(P.view);
      }
      flyFocus = {
        t: 0, dur: 0.9,
        p0: camera.position.clone(), t0: controls.target.clone(),
        tgt: pose.tgt, el: pose.el, az: pose.az, dist: pose.dist
      };
      renderStack(); renderCard();
    }

    function goView(v) {
      if (v === P.view || trans) return;
      var pose = homePose(v);
      var pp = poseToPos(pose);
      trans = {
        t: 0, dur: 0.95, from: P.view, to: v,
        p0: camera.position.clone(), t0: controls.target.clone(),
        p1: new THREE.Vector3(pp[0], pp[1], pp[2]),
        t1: new THREE.Vector3(pose.tgt[0], pose.tgt[1], pose.tgt[2])
      };
      focusIdx = -1;
      elFlash.classList.remove('on');
      void elFlash.offsetWidth;
      elFlash.classList.add('on');
      hud.classList.add('zoom');
      setTimeout(function () { hud.classList.remove('zoom'); }, 900);
      if (HL.ui && HL.ui.sync) HL.ui.sync('view', v);
    }

    function switchChip(k) {
      if (k === P.chip) return;
      P.chip = k;
      applyVisibility();
      introK = 0;                                  // 重新装配一次
      if (HL.ui && HL.ui.sync) HL.ui.sync('chip', k);
      renderHud();
      tour.load(buildSteps());
    }

    function applyVisibility() {
      allLayers.gpu.forEach(function (L) { L.group.visible = (P.chip === 'gpu'); });
      allLayers.cpu.forEach(function (L) { L.group.visible = (P.chip === 'cpu'); });
      microLayers.gpu.forEach(function (L) { L.group.visible = (P.chip === 'gpu'); });
      microLayers.cpu.forEach(function (L) { L.group.visible = (P.chip === 'cpu'); });
      var key = P.chip + P.view;
      links.forEach(function (lk) { lk.mesh.visible = (lk.owner === key); });
      flows.forEach(function (f) { f.pts.visible = (f.owner === key) && P.flow; });
    }

    /* ============================================================
       八、讲解模式
       ============================================================ */
    function buildSteps() {
      var c = CHIPS[P.chip];
      var isGpu = P.chip === 'gpu';
      var layers = allLayers[P.chip], ml = microLayers[P.chip];
      function layerPose(L) {
        var aspect = camera.aspect || 1.6;
        var k = aspect < 1.15 ? 1.45 : 1;
        return [[6.4 * k, L.curY + 2.7, 7.6 * k], [0, L.curY, 0]];
      }
      var steps = [
        { t: c.name + ' · 立体剖面台',
          d: '一颗现代芯片不是一块硅，而是一座十几层的立体城市：引脚、基板、中介层、微凸块、裸片、存储堆叠层层叠合。' + c.note,
          exp: '拖动右侧「层间距」，把封装像抽屉一样拉开；点击左下的层叠结构可单独聚焦每一层。',
          cam: function () { var p = homePose('macro'); return [poseToPos(p), p.tgt]; },
          pulse: [0, 1.6, 0], r: 4.2 },
        { t: '01 · ' + layers[0].name,
          d: layers[0].note + (isGpu ? ' GPU 用 BGA 锡球；CPU 用 LGA 平面触点，靠插座的弹簧针完成接触。' : ''),
          exp: '用右键把视角压低，看引脚阵列的规整网格。',
          cam: function () { return layerPose(layers[0]); } },
        { t: '02 · ' + layers[1].name,
          d: layers[1].note + ' 信号脉冲正沿着这些走线缓慢流动。',
          exp: '放大看基板表面的走线与过孔焊盘。',
          cam: function () { return layerPose(layers[1]); } },
        { t: '03 · ' + layers[2].name,
          d: layers[2].note,
          exp: isGpu ? '注意穿过中介层的硅通孔：拉开层间距后，它们是连接上下层的细柱。'
                     : 'RDL 层的走线密度介于基板与裸片之间。',
          cam: function () { return layerPose(layers[2]); } },
        { t: '04 · ' + layers[3].name,
          d: layers[3].note,
          exp: isGpu ? '点击任意 GPC，直接下钻到 SM 内部。' : '点击任意 CCD，下钻到 Zen 5c 核心内部。',
          cam: function () { return layerPose(layers[3]); },
          pulse: function () { return new THREE.Vector3(0, layers[3].curY + 0.3, 0); }, r: 3.4 },
        { t: '05 · 微凸块 · μBUMP',
          d: '微凸块是裸片与下方各层之间唯一的垂直通道，间距约 40 µm，一颗芯片上有数万个。',
          exp: '把「层间距」拉到 100%，看凸块阵列被拉成一片柱林。',
          cam: function () {
            var mid = (layers[2].curY + layers[3].curY) / 2;
            return [[5.6, mid + 2.4, 6.6], [0, mid, 0]];
          } }
      ];
      if (isGpu) {
        steps.push({ t: '06 · HBM3e 3D 堆叠',
          d: layers[4].note + ' 8 组堆叠贴在裸片两侧，合计带宽 8 TB/s——是整卡功耗与面积的另一个大头。',
          exp: '把视角转到侧面，看 DRAM 层的堆叠节奏。',
          cam: function () { return layerPose(layers[4]); } });
      }
      steps = steps.concat([
        { t: (isGpu ? '07' : '06') + ' · 下钻：' + c.unit + ' 单元内部',
          apply: function () { if (P.view !== 'micro') goView('micro'); },
          d: '从封装到单元差了五个数量级。现在进入单个 ' + c.unit + ' 的 BEOL 剖面：硅基底、FinFET 与三层金属布线。',
          exp: '用「层间距」把晶体管层与金属层拉开。',
          cam: function () { var p = homePose('micro'); return [poseToPos(p), p.tgt]; },
          pulse: [0, 1.2, 0], r: 1.8 },
        { t: (isGpu ? '08' : '07') + ' · 晶体管层与金属层',
          d: ml[0].note + ' ' + ml[1].note,
          exp: '对比 M1 / M2 / M3 的线宽与密度：越往上越宽、越稀。',
          cam: function () { return layerPose(ml[1]); } },
        { t: (isGpu ? '09' : '08') + ' · ' + ml[4].name,
          d: ml[4].note + ' 这就是"分区功能模块"在微观尺度上的样子。',
          exp: '点击任意分区，查看它负责什么。',
          cam: function () { return layerPose(ml[4]); },
          pulse: function () { return new THREE.Vector3(0, ml[4].curY + 0.2, 0); }, r: 1.6 }
      ]);
      return steps;
    }
    var tour = HL.Tour(ctx);

    /* ============================================================
       九、拾取
       ============================================================ */
    var hoverId = -1, lastMove = null;
    function onMove(e) {
      var r = canvas.getBoundingClientRect();
      lastMove = {
        x: ((e.clientX - r.left) / r.width) * 2 - 1,
        y: -((e.clientY - r.top) / r.height) * 2 + 1,
        cx: e.clientX, cy: e.clientY
      };
    }
    canvas.addEventListener('pointermove', onMove);

    function activePick() {
      return pickSets[P.view] ? (pickSets[P.view][P.chip] || null) : null;
    }
    function updateHover() {
      if (!lastMove || trans) { if (hoverId >= 0) restoreHover(); return; }
      var set = activePick();
      if (!set) { if (hoverId >= 0) restoreHover(); return; }
      raycaster.setFromCamera({ x: lastMove.x, y: lastMove.y }, camera);
      var hit = raycaster.intersectObject(set.mesh, false);
      var id = hit.length ? hit[0].instanceId : -1;
      if (id >= 0 && set.list[id] && set.list[id].noPick) id = -1;
      if (id !== hoverId) {
        restoreHover();
        hoverId = id;
        if (id >= 0) {
          set.list[id].hover = true;
          canvas.style.cursor = 'pointer';
          if (HL.tooltip) HL.tooltip.show('<b>' + (set.list[id].name || '区块') + '</b>' +
            (set.list[id].sub ? '<br>' + set.list[id].sub : ''), lastMove.cx, lastMove.cy);
        } else {
          canvas.style.cursor = '';
          if (HL.tooltip) HL.tooltip.hide();
        }
      }
    }
    function restoreHover() {
      var set = activePick();
      hoverId = -1;
      canvas.style.cursor = '';
      if (HL.tooltip) HL.tooltip.hide();
      if (set) set.list.forEach(function (b) { b.hover = false; });
    }

    function onClick(ndc) {
      if (trans || !ndc) return;
      var set = activePick();
      if (!set) return;
      raycaster.setFromCamera({ x: ndc.x, y: ndc.y }, camera);
      var hit = raycaster.intersectObject(set.mesh, false);
      if (!hit.length) return;
      var b = set.list[hit[0].instanceId];
      if (!b || b.noPick) return;
      if (P.view === 'macro') {
        goView('micro');
        elHint.textContent = '已下钻：' + (b.name || '区块') + (b.sub ? ' · ' + b.sub : '');
      } else if (b.info) {
        elHint.textContent = b.name + ' · ' + b.info;
      }
    }

    /* ============================================================
       十、主循环
       ============================================================ */
    var breathPhase = 0, lastE = -1;

    function stepSim(dt) {
      /* 装配动画 + 层间距 */
      var target = P.explode;
      if (introK < 1) {
        introK = Math.min(1, introK + dt / 1.5);
        target = P.explode * easeOut(introK);
      }
      if (Math.abs(target - lastE) > 0.0005 || lastE < 0) { layout(target); lastE = target; }

      /* 呼吸：区块自发光 + 走线材质 + 底面辉光 */
      breathPhase += dt * 0.55;
      var breath = 0.5 + 0.5 * Math.sin(breathPhase);
      [allLayers.gpu, allLayers.cpu, microLayers.gpu, microLayers.cpu].forEach(function (ls) {
        if (!ls) return;
        ls.forEach(function (L) {
          if (!L.group.visible) return;
          if (L.blockMesh && L.blockMesh.instanceColor) {
            var changed = false;
            for (var i = 0; i < L.blocks.length; i++) {
              var b = L.blocks[i];
              if (b.noPick && !b.kind) continue;
              var f = 0.78 + 0.24 * (0.5 + 0.5 * Math.sin(breathPhase * 0.9 + b.ph)) + (b.hover ? 0.5 : 0);
              _col.setHex(b.baseCol).multiplyScalar(f);
              L.blockMesh.setColorAt(i, _col);
              changed = true;
            }
            if (changed) L.blockMesh.instanceColor.needsUpdate = true;
          }
          if (L.blockLines) L.blockLines.material.opacity = 0.13 + 0.12 * breath;
        });
      });
      breathMats.forEach(function (bm) {
        bm.mat.emissiveIntensity = bm.base + bm.amp * (0.5 + 0.5 * Math.sin(breathPhase * 0.7 + 1.3));
      });
      if (floorGlows.gpu) floorGlows.gpu.opacity = 0.10 + 0.08 * breath;
      if (floorGlows.cpu) floorGlows.cpu.opacity = 0.10 + 0.08 * breath;

      /* 信号脉冲 */
      if (P.flow) flows.forEach(function (f) { if (f.pts.visible) updateFlow(f, dt); });

      /* 视角切换 */
      if (trans) {
        trans.t += dt / trans.dur;
        var e2 = easeIO(clamp(trans.t, 0, 1));
        camera.position.lerpVectors(trans.p0, trans.p1, e2);
        controls.target.lerpVectors(trans.t0, trans.t1, e2);
        if (controls.syncFromCamera) controls.syncFromCamera();
        if (trans.t >= 0.5 && P.view !== trans.to) {
          macroRoot.visible = (trans.to === 'macro');
          microRoot.visible = (trans.to === 'micro');
          P.view = trans.to;
          applyVisibility();
          renderHud();
        }
        if (trans.t >= 1) { P.view = trans.to; trans = null; }
      }

      /* 层聚焦飞行 */
      if (flyFocus) {
        flyFocus.t += dt / flyFocus.dur;
        var e3 = easeIO(clamp(flyFocus.t, 0, 1));
        _p.set(
          flyFocus.tgt[0] + flyFocus.dist * Math.cos(flyFocus.el) * Math.sin(flyFocus.az),
          flyFocus.tgt[1] + flyFocus.dist * Math.sin(flyFocus.el),
          flyFocus.tgt[2] + flyFocus.dist * Math.cos(flyFocus.el) * Math.cos(flyFocus.az)
        );
        _v3.set(flyFocus.tgt[0], flyFocus.tgt[1], flyFocus.tgt[2]);
        camera.position.lerpVectors(flyFocus.p0, _p, e3);
        controls.target.lerpVectors(flyFocus.t0, _v3, e3);
        if (controls.syncFromCamera) controls.syncFromCamera();
        if (flyFocus.t >= 1) flyFocus = null;
      }

      /* 慢速旋转（聚焦 / 讲解时暂停，避免打断阅读） */
      if (P.spin && !flyFocus && !tour.active()) world.rotation.y += dt * 0.05;

      updateHover();
      updateLabels(canvas.clientWidth, canvas.clientHeight);
    }

    applyVisibility();
    renderHud();
    tour.load(buildSteps());

    return {
      update: function (dt, tt) {
        tour.update(dt, tt || 0, stepSim);
      },
      setParam: function (key, v) {
        if (key === 'tour') { tour.toggle(); return; }
        if (key === 'view') { if (v !== P.view) goView(v); return; }
        if (key === 'chip') { switchChip(v); return; }
        if (key === 'explode') { P.explode = v; introK = 1; layout(v); return; }
        P[key] = v;
        if (key === 'flow' || key === 'pins') applyVisibility();
      },
      onClick: onClick,
      dispose: function () {
        tour.dispose();
        canvas.removeEventListener('pointermove', onMove);
        if (HL.tooltip) HL.tooltip.hide();
        if (hud.parentNode) hud.parentNode.removeChild(hud);
        TEXS.forEach(function (t) { t.dispose(); });
        glowTex.dispose();
        world.traverse(function (o) {
          if (o.geometry && o.geometry !== boxGeo && o.geometry !== cylGeo && o.geometry !== ballGeo) {
            o.geometry.dispose();
          }
          var m = o.material;
          if (m) (Array.isArray(m) ? m : [m]).forEach(function (mm) {
            if (mm.map && mm.map !== glowTex) mm.map.dispose();
            mm.dispose();
          });
        });
        scene.remove(world);
      }
    };
  }
});
