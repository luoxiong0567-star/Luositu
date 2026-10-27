/**
 * 场景：硅基芯片
 *
 * 两级尺度：
 *   宏观 = 封装 / 裸片 / 功能区块（GPU：双 die + 8 组 HBM3e；CPU：IOD + 12 颗 CCD）
 *   微观 = 单个计算单元的内部排布（GPU：SM 的 4 个处理块；CPU：Zen 5c 核心）
 *
 * 交互：
 *   · 侧栏「视角」按钮 / 底部 HUD 胶囊 切换两档，中间用一次「扫描换帧」过渡
 *   · 宏观画面点选任意 GPC / CCD → 直接下钻到微观，并记住来源
 *   · 微观卡「← 返回宏观」原路退回
 *   · 芯片可切换 GPU / CPU，HUD 的 KPI、图例、小地图、微观版图整体跟着换
 *
 * 数据来源：厂商标称规格 + 公开架构资料（GPC→SM→处理块、CCD→Core→L1/L2）。
 * 区块位置是按公开版图重建的**示意排布**，非真实掩膜比例，界面里已明确标注。
 */
HL.registerScene({
  id: 'chip',
  name: '硅基芯片',
  short: 'GPU 与 CPU 的硅上版图',
  icon: '⬢',
  fov: 42,
  minDistance: 1.0,
  maxDistance: 90,
  desc: '从封装到晶体管：宏观看裸片、功能区块与存储堆叠，微观下钻到单个计算单元，看核心、缓存与互连排布。当前最顶尖的一颗 GPU 与一颗 CPU 并置对照。',

  controls: [
    { type: 'button', key: 'tour', label: '📖 讲解模式' },
    { type: 'buttons', key: 'view', label: '视角', value: 'macro', options: [
      { label: '宏观 · 版图', value: 'macro' },
      { label: '微观 · 单元', value: 'micro' }
    ] },
    { type: 'buttons', key: 'chip', label: '芯片', value: 'gpu', options: [
      { label: 'GPU · B200', value: 'gpu' },
      { label: 'CPU · EPYC', value: 'cpu' }
    ] },
    { type: 'check', key: 'labels', label: '区块标注', value: true },
    { type: 'check', key: 'flow', label: '数据流', value: true },
    { type: 'check', key: 'pkg', label: '封装 / 存储', value: true },
    { type: 'check', key: 'spin', label: '缓慢旋转', value: true }
  ],

  create: function (ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera, controls = ctx.controls;
    var stageEl = document.getElementById('stage');
    var raycaster = new THREE.Raycaster();

    /* ============================================================
       一、数据层：两种芯片的规格、宏观版图、微观版图
       ============================================================ */

    var CHIPS = {
      gpu: {
        key: 'gpu',
        name: 'Blackwell B200',
        vendor: 'NVIDIA · GB100',
        node: 'TSMC 4NP',
        pkg: 'CoWoS-L 2.5D · 硅中介层',
        unit: 'SM',
        kpi: [
          ['2080', '亿', '晶体管'],
          ['2', 'die', '裸片'],
          ['192', 'GB', 'HBM3e'],
          ['8', 'TB/s', '显存带宽'],
          ['1000', 'W', '整卡功耗']
        ],
        legend: [
          ['#1e93ad', 'GPC 图形处理簇', '8 × 2 die'],
          ['#2d63c8', 'L2 缓存切片', '16 片'],
          ['#3f9bd6', 'HBM PHY', '16 组'],
          ['#ffb454', 'NV-HBI die 间互连', '10 TB/s'],
          ['#2a4d86', 'HBM3e 存储堆叠', '8 组 × 24 GB']
        ],
        legendMicro: [
          ['#1b5f78', 'SMSP 处理块', '4 个'],
          ['#3fd9e8', 'FP32 通道', '32 × 4'],
          ['#ffb454', '张量核', '4 个'],
          ['#2d63c8', '寄存器堆 bank', '8 组'],
          ['#1f8ea8', 'L1 / 共享内存', '256 KB']
        ],
        scale: '65 × 65 mm 封装',
        area: '≈1.3 mm² / SM',
        anchor: { gpc: [2.78 - 1.89, 0.95, -1.72], hbm: [4.05, 0.9, 3.55], hbi: [0.2, 0.9, -0.3] }
      },
      cpu: {
        key: 'cpu',
        name: 'EPYC 9965',
        vendor: 'AMD · Turin Dense',
        node: 'TSMC 3nm',
        pkg: 'SHP 有机基板 · 13 chiplet',
        unit: 'Core',
        kpi: [
          ['192', '核', 'Zen 5c'],
          ['384', '线程', 'SMT'],
          ['384', 'MB', 'L3 缓存'],
          ['12', 'ch', 'DDR5-6000'],
          ['500', 'W', '功耗上限']
        ],
        legend: [
          ['#2a4a63', 'IOD 输入输出裸片', '1 颗 · 12nm'],
          ['#1e93ad', 'CCD 计算裸片', '12 颗 · 3nm'],
          ['#35d6e6', 'Zen 5c 核心', '192 个'],
          ['#2d63c8', 'L3 缓存', '32 MB / CCD'],
          ['#3f9bd6', 'DDR5 内存 PHY', '12 通道']
        ],
        legendMicro: [
          ['#2d63c8', 'L1I / L2 缓存', '32 KB / 1 MB'],
          ['#3fd9e8', '整数 ALU 阵列', '6 个'],
          ['#ffb454', 'FMA 512-bit', '2 条'],
          ['#1f8ea8', 'L1D 数据缓存', '48 KB'],
          ['#1e93ad', '解码 · 分支预测', '8-wide / TAGE']
        ],
        scale: '约 70 × 78 mm 封装',
        area: '≈2.8 mm² / 核',
        anchor: { ccd: [0, 0.6, -2.72], iod: [0, 0.6, 0] }
      }
    };

    /* ---- 宏观版图：GPU（双 die，CoWoS-L） ---- */
    function gpuBlocks() {
      var out = [];
      var DX = 2.78, SW = 5.2;
      [-DX, DX].forEach(function (cx, di) {
        var base = 'die ' + (di === 0 ? 'A' : 'B');
        // 8 个 GPC：4 列 × 2 行
        for (var r = 0; r < 2; r++) {
          for (var c = 0; c < 4; c++) {
            out.push({
              x: cx + (c - 1.5) * 1.26, z: -1.72 + r * 1.14,
              w: 1.14, d: 1.00, h: 0.10, col: 0x1e93ad, kind: 'gpc',
              name: 'GPC ' + pad2(di * 8 + r * 4 + c), sub: base + ' · 8 SM'
            });
          }
        }
        // L2 缓存切片：8 片
        for (var i = 0; i < 4; i++) {
          for (var j = 0; j < 2; j++) {
            out.push({
              x: cx + (i - 1.5) * 1.26, z: 0.04 + j * 0.36,
              w: 1.14, d: 0.30, h: 0.07, col: 0x2d63c8, kind: 'l2',
              name: 'L2 切片 ' + pad2(di * 8 + i + j * 4), sub: '共享缓存 · 分片寻址'
            });
          }
        }
        // HBM PHY
        for (var k = 0; k < 8; k++) {
          out.push({
            x: cx + (k - 3.5) * 0.62, z: 1.08,
            w: 0.50, d: 0.26, h: 0.06, col: 0x3f9bd6, kind: 'phy',
            name: 'HBM PHY ' + pad2(di * 8 + k), sub: 'GPU ↔ HBM3e 物理层'
          });
        }
        // NV-HBI：面向另一颗 die 的内侧长条
        out.push({
          x: cx + (di === 0 ? 2.44 : -2.44), z: -0.34,
          w: 0.20, d: 3.36, h: 0.06, col: 0xffb454, kind: 'hbi',
          name: 'NV-HBI', sub: 'die 间互连 · 10 TB/s'
        });
        // PCIe / C2C PHY
        out.push({
          x: cx, z: 1.44, w: 2.10, d: 0.22, h: 0.05, col: 0x2b7a9e, kind: 'io',
          name: 'PCIe 6.0 PHY', sub: '主机接口 · 8 条链路'
        });
      });
      return out;
    }

    /* ---- 宏观版图：CPU（IOD + 12 CCD） ---- */
    function cpuBlocks() {
      var out = [];
      out.push({
        x: 0, z: 0, w: 5.0, d: 3.6, h: 0.12, col: 0x2a4a63, kind: 'iod',
        name: 'IOD', sub: '12nm · 内存 / PCIe 控制器'
      });
      // IOD 内的小块：12 通道内存 PHY + PCIe
      for (var m = 0; m < 6; m++) {
        out.push({
          x: (m - 2.5) * 0.80, z: -1.48,
          w: 0.70, d: 0.30, h: 0.05, col: 0x3f9bd6, kind: 'phy',
          name: 'DDR5 PHY ' + pad2(m), sub: '每颗 PHY 带 2 通道'
        });
      }
      for (var q = 0; q < 4; q++) {
        out.push({
          x: (q - 1.5) * 1.10, z: 1.46,
          w: 0.94, d: 0.26, h: 0.05, col: 0x2b7a9e, kind: 'io',
          name: 'PCIe 5.0 PHY', sub: 'x16 并行四组'
        });
      }
      // 12 颗 CCD：上下各 6 颗
      for (var side = 0; side < 2; side++) {
        for (var i = 0; i < 6; i++) {
          var x = (i - 2.5) * 1.72;
          var z = side === 0 ? -2.72 : 2.72;
          var id = side * 6 + i;
          out.push({
            x: x, z: z, w: 1.56, d: 1.30, h: 0.11, col: 0x1e93ad, kind: 'ccd',
            name: 'CCD ' + pad2(id), sub: '16 核 · 32 MB L3'
          });
          for (var r = 0; r < 4; r++) {
            for (var c = 0; c < 4; c++) {
              out.push({
                x: x + (c - 1.5) * 0.35, z: z + (r - 1.5) * 0.24 - 0.14,
                w: 0.30, d: 0.20, h: 0.03, col: 0x35d6e6, kind: 'core',
                name: 'Core ' + pad2(id * 16 + r * 4 + c), sub: 'Zen 5c · SMT2'
              });
            }
          }
          out.push({
            x: x, z: z + 0.55, w: 1.44, d: 0.16, h: 0.05, col: 0x2d63c8, kind: 'l3',
            name: 'L3 32 MB', sub: 'CCD 内共享 · 16 核可见'
          });
        }
      }
      return out;
    }

    /* ---- 微观版图：GPU 的一个 SM ---- */
    function gpuMicroBlocks() {
      var out = [];
      var Y0 = 0.02;
      // Warp 调度条
      out.push({ x: 0, z: -1.02, w: 3.00, d: 0.14, h: 0.035, col: 0x3a7fa8, kind: 'sched',
        name: 'Warp 调度器', sub: '4 组 · 每周期派发 4 条 warp', info: '每个 SM 有 4 个 warp 调度器，各自服务一个处理块；每周期可各派发 1 条指令，共 4 条 / 周期。' });

      // 4 个处理块（2×2）
      var SP = [[-0.78, -0.60], [0.78, -0.60], [-0.78, 0.18], [0.78, 0.18]];
      SP.forEach(function (p, si) {
        var sx = p[0], sz = p[1];
        out.push({ x: sx, z: sz, w: 1.44, d: 0.70, h: 0.030, col: 0x1b5f78, kind: 'smsp',
          name: '处理块 ' + si, sub: '32 FP32 + 1 张量核',
          info: '每个处理块（SMSP）含 32 个 FP32 通道、1 个张量核与 4 个 SFU，独占一组寄存器堆，由自己的 warp 调度器驱动。' });
        // 32 个 FP32 通道：8 × 4
        for (var r = 0; r < 4; r++) {
          for (var c = 0; c < 8; c++) {
            out.push({
              x: sx - 0.60 + c * 0.125, z: sz - 0.20 + r * 0.115,
              w: 0.095, d: 0.085, h: 0.018, col: 0x3fd9e8, kind: 'lane',
              name: 'FP32 通道', sub: '第 ' + (si * 32 + r * 8 + c) + ' 号',
              info: '32 位浮点通道：处理块内以 32 路 SIMD 宽度成组执行，一个周期推进一条 warp 指令。'
            });
          }
        }
        // 张量核
        out.push({
          x: sx + 0.55, z: sz, w: 0.26, d: 0.46, h: 0.045, col: 0xffb454, kind: 'tensor',
          name: '张量核', sub: '矩阵乘加单元',
          info: '张量核把矩阵乘加折叠进专用数据通路：单指令完成小矩阵的整块乘累加，是深度学习算力的主要来源。'
        });
      });

      // 寄存器堆：8 组 bank
      for (var b = 0; b < 8; b++) {
        out.push({
          x: -1.50 + b * 0.175, z: 0.86, w: 0.155, d: 0.42, h: 0.03, col: 0x2d63c8, kind: 'rf',
          name: '寄存器堆 bank ' + b, sub: '共 256 KB / SM',
          info: '整个 SM 共享 256 KB 寄存器堆（65536 × 32 bit），分 bank 以支持多 warp 同时读写。'
        });
      }
      // L1 / 共享内存
      out.push({ x: 0.86, z: 0.86, w: 1.28, d: 0.42, h: 0.05, col: 0x1f8ea8, kind: 'l1',
        name: 'L1 / 共享内存', sub: '256 KB · 可配置划分',
        info: 'L1 与共享内存共用同一块 256 KB SRAM，容量划分可按内核需求配置，是块内线程交换数据的枢纽。' });
      // 与 L2 的接口
      out.push({ x: 0, z: 1.14, w: 3.00, d: 0.10, h: 0.028, col: 0x3f9bd6, kind: 'bus',
        name: 'SM ↔ L2 接口', sub: '读写请求汇聚',
        info: 'SM 的访存请求经此接口进入片上网络，按地址散列到对应的 L2 切片。' });
      // 处理块底板高 0.030，通道与张量核必须抬到它顶面之上，
      // 否则 32 条 FP32 通道全被底板盖住，微观视角只剩四块空板。
      var LIFT = { lane: Y0 + 0.030, tensor: Y0 + 0.030 };
      out.forEach(function (o) { o.y = (LIFT[o.kind] === undefined ? Y0 : LIFT[o.kind]); });
      return out;
    }

    /* ---- 微观版图：CPU 的一个 Zen 5c 核心 ---- */
    function cpuMicroBlocks() {
      var out = [];
      var Y0 = 0.02;
      // 浮点容器高 0.035，里面的 FMA / 向量单元要抬到 0.055 才露得出来
      var LIFT = { fma: Y0 + 0.035, vec: Y0 + 0.035 };
      function add(x, z, w, d, col, kind, name, sub, info, h) {
        out.push({ x: x, z: z, w: w, d: d, h: h || 0.035, col: col, kind: kind,
          name: name, sub: sub, info: info,
          y: (LIFT[kind] === undefined ? Y0 : LIFT[kind]) });
      }
      // 前端
      add(-1.15, -0.96, 0.86, 0.30, 0x2d63c8, 'l1i', 'L1 指令缓存', '32 KB',
        'L1I 存放取回的指令，配合下方 op cache 一起给前端供料。');
      add(-0.30, -0.96, 0.82, 0.30, 0x1f8ea8, 'opc', 'Op Cache', '6 K 条微指令',
        '指令解码后缓存在 op cache 里，命中时跳过解码，直接进入调度。');
      add(0.72, -0.96, 1.34, 0.30, 0x1e93ad, 'dec', '解码 · 8-wide', '双路 4 宽',
        'Zen 5 前端双解码通道，合起来每周期最多 8 条指令进后端。');
      add(1.48, -0.96, 0.30, 0.30, 0x3a7fa8, 'bpu', '分支预测', 'TAGE',
        '分支预测决定取指方向，正确率直接决定前端是否空转。');

      // 调度器
      add(0, -0.58, 2.96, 0.16, 0x3a7fa8, 'sch', '整数调度器 × 6', '乱序发射',
        '6 个整数调度队列，从重排序缓冲里取就绪指令，乱序发射到执行单元。');

      // 整数执行
      for (var i = 0; i < 6; i++) {
        add(-1.12 + i * 0.30, -0.30, 0.26, 0.26, 0x3fd9e8, 'alu', 'ALU ' + i, '整数运算',
          '6 个整数 ALU，覆盖加减、逻辑、移位与分支；整数吞吐是通用负载的基本盘。', 0.03);
      }
      for (var g = 0; g < 4; g++) {
        add(-1.12 + g * 0.30, -0.02, 0.26, 0.22, 0x7ad8e8, 'agu', 'AGU ' + g, '地址生成',
          '4 个地址生成单元负责访存地址计算，与数据缓存配合完成读写。', 0.03);
      }

      // 浮点 / 向量
      add(1.06, 0.10, 1.00, 0.92, 0x1b5f78, 'fp', '浮点 / 向量单元', '2 × 512-bit FMA',
        '两条 512 位 FMA 数据通路，AVX-512 全宽执行；浮点与向量负载在这里完成。');
      add(0.86, -0.06, 0.36, 0.36, 0xffb454, 'fma', 'FMA 0', '512-bit',
        '融合乘加单元：一次完成 a×b+c，是矩阵与卷积运算的核心。', 0.05);
      add(1.28, -0.06, 0.36, 0.36, 0xffb454, 'fma', 'FMA 1', '512-bit',
        '第二条 512 位 FMA，与 FMA 0 并行，构成双发射浮点流水线。', 0.05);
      add(1.06, 0.44, 0.80, 0.24, 0x2d63c8, 'vec', '向量 ALU / 转换', '整数 SIMD',
        '向量整数与格式转换单元，处理打包整数、类型转换与数据重排。', 0.03);

      // 数据侧
      add(-1.02, 0.52, 0.94, 0.60, 0x1f8ea8, 'l1d', 'L1 数据缓存', '48 KB · 12 路',
        'L1D 48 KB、12 路组相联，两个 512 位加载 + 两个存储端口，供整数与浮点共用。');
      add(0, 1.02, 3.00, 0.24, 0x2d63c8, 'l2', 'L2 缓存', '1 MB / 核',
        '每核独占 1 MB L2，命中延迟约十余周期，是 L1 与 CCD 共享 L3 之间的缓冲。');
      return out;
    }

    /* ============================================================
       二、场景与材质
       ============================================================ */

    scene.background = new THREE.Color(0x04080f);
    scene.fog = new THREE.FogExp2(0x04080f, 0.010);

    scene.add(new THREE.AmbientLight(0x8fb6cc, 0.55));
    var keyL = new THREE.DirectionalLight(0xdff4ff, 1.15);
    keyL.position.set(9, 18, 11);
    scene.add(keyL);
    var rimL = new THREE.DirectionalLight(0x45a8d8, 0.55);
    rimL.position.set(-12, 8, -10);
    scene.add(rimL);
    var fillL = new THREE.DirectionalLight(0x2a6fa8, 0.30);
    fillL.position.set(0, -6, 8);
    scene.add(fillL);

    // 地面参考网格：给封装一个「落位」的空间感
    var floor = new THREE.GridHelper(64, 64, 0x1b4a5e, 0x0d2630);
    floor.position.y = -0.62;
    floor.material.transparent = true;
    floor.material.opacity = 0.35;
    scene.add(floor);

    var boxGeo = new THREE.BoxGeometry(1, 1, 1);

    function blockMat() {
      // 自发光只留一点点「硅片在通电」的感觉，给多了整块版图会发白、糊成霓虹
      return new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.62, metalness: 0.35,
        emissive: 0x061a20, emissiveIntensity: 0.22
      });
    }
    function plateMat(color, rough) {
      return new THREE.MeshStandardMaterial({
        color: color, roughness: rough === undefined ? 0.72 : rough, metalness: 0.55
      });
    }

    // 硅片表面的标准单元纹理：宏观下给裸片一层「不像塑料」的细密质感
    function cellTex() {
      var cv = document.createElement('canvas');
      cv.width = cv.height = 256;
      var c = cv.getContext('2d');
      c.fillStyle = '#08151c';
      c.fillRect(0, 0, 256, 256);
      for (var y = 0; y < 256; y += 3) {
        c.fillStyle = y % 9 === 0 ? 'rgba(70,190,215,0.10)' : 'rgba(50,120,150,0.055)';
        c.fillRect(0, y, 256, 1);
      }
      for (var i = 0; i < 26; i++) {
        var x = Math.random() * 256, y2 = Math.random() * 256;
        c.fillStyle = 'rgba(80,200,225,0.07)';
        c.fillRect(x, y2, 12 + Math.random() * 40, 2 + Math.random() * 5);
      }
      var t = new THREE.CanvasTexture(cv);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(6, 6);
      return t;
    }
    var TEX_CELL = cellTex();

    function instanced(blocks, mat) {
      var mesh = new THREE.InstancedMesh(boxGeo, mat || blockMat(), blocks.length);
      var d = new THREE.Object3D(), c = new THREE.Color();
      blocks.forEach(function (b, i) {
        d.position.set(b.x, b.y + b.h / 2, b.z);
        d.scale.set(b.w, b.h, b.d);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
        c.setHex(b.col);
        mesh.setColorAt(i, c);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      return mesh;
    }

    function edgeLines(blocks, color, op) {
      var pts = [];
      blocks.forEach(function (b) {
        var x0 = b.x - b.w / 2, x1 = b.x + b.w / 2;
        var z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
        var y0 = b.y + b.h + 0.001, y1 = b.y;
        pts.push(x0, y0, z0, x1, y0, z0, x1, y0, z0, x1, y0, z1,
          x1, y0, z1, x0, y0, z1, x0, y0, z1, x0, y0, z0);
        pts.push(x0, y0, z0, x0, y1, z0, x1, y0, z0, x1, y1, z0,
          x1, y0, z1, x1, y1, z1, x0, y0, z1, x0, y1, z1);
      });
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      return new THREE.LineSegments(g, new THREE.LineBasicMaterial({
        color: color, transparent: true, opacity: op, depthWrite: false
      }));
    }

    /* ============================================================
       三、宏观构建
       ============================================================ */

    var Y_DIE_TOP = 0.26;

    function buildMacro(key) {
      var g = new THREE.Group();
      var blocks, hbmHeads = [];

      var subMat = plateMat(0x0b1b22, 0.82);
      var itpMat = plateMat(0x0f2630, 0.6);
      var dieMat = plateMat(0x0a141a, 0.88);
      var hbmMat = plateMat(0x2a4d86, 0.45);

      // 区块必须落在裸片/底板的顶面上。之前 y 缺省为 0，
      // 整个版图都被埋进盒体内部——看上去只剩一块光滑的板。
      function lift(list, map) {
        list.forEach(function (b) {
          var yy = map[b.kind];
          b.y = (yy === undefined ? 0 : yy);
        });
        return list;
      }

      if (key === 'gpu') {
        blocks = gpuBlocks();
        lift(blocks, {
          gpc: Y_DIE_TOP, l2: Y_DIE_TOP, phy: Y_DIE_TOP,
          hbi: Y_DIE_TOP, io: Y_DIE_TOP
        });
        // 基板
        var sub = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.50, 9.0), subMat);
        sub.position.y = -0.27;
        g.add(sub);
        // 硅中介层
        var itp = new THREE.Mesh(new THREE.BoxGeometry(11.0, 0.08, 8.2), itpMat);
        itp.position.y = 0.02;
        g.add(itp);
        // 两颗裸片 + 表面纹理
        [-2.78, 2.78].forEach(function (cx) {
          var die = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.20, 5.2), dieMat);
          die.position.set(cx, 0.16, 0);
          g.add(die);
          var face = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2),
            new THREE.MeshStandardMaterial({
              map: TEX_CELL, color: 0x3d7f91, roughness: 0.94, metalness: 0.08,
              emissive: 0x03202a, emissiveIntensity: 0.42
            }));
          face.rotation.x = -Math.PI / 2;
          face.position.set(cx, Y_DIE_TOP + 0.002, 0);
          g.add(face);
        });
        // 8 组 HBM3e 堆叠（每组 8 层）
        var slabs = [];
        [-3.35, 3.35].forEach(function (z) {
          [-4.05, -1.35, 1.35, 4.05].forEach(function (x) {
            for (var s = 0; s < 8; s++) {
              slabs.push({
                x: x, z: z, w: 1.02, d: 1.02, h: 0.050,
                y: 0.06 + s * 0.056, col: s % 2 ? 0x22457c : 0x2a4d86
              });
            }
            hbmHeads.push({ x: x, z: z, y: 0.60 });
          });
        });
        var hbmMesh = instanced(slabs, hbmMat);
        g.add(hbmMesh);
        g.add(edgeLines(slabs, 0x5fa8d8, 0.20));
      } else {
        blocks = cpuBlocks();
        // IOD 高 0.12、CCD 高 0.11，里面的 PHY / 核心要再抬一层
        lift(blocks, {
          iod: 0.06, ccd: 0.06,
          phy: 0.18, io: 0.18,
          core: 0.17, l3: 0.17
        });
        // 基板
        var sub2 = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.50, 8.6), subMat);
        sub2.position.y = -0.27;
        g.add(sub2);
        // 12 颗 CCD + IOD 的实体底板（略高于基板）
        var plates = [];
        plates.push({ x: 0, z: 0, w: 5.0, d: 3.6, h: 0.06, y: 0.03 });
        for (var side = 0; side < 2; side++) {
          for (var i = 0; i < 6; i++) {
            plates.push({
              x: (i - 2.5) * 1.72, z: side === 0 ? -2.72 : 2.72,
              w: 1.56, d: 1.30, h: 0.06, y: 0.03
            });
          }
        }
        var platesMesh = new THREE.InstancedMesh(boxGeo, plateMat(0x0d1c24, 0.8), plates.length);
        var d0 = new THREE.Object3D();
        plates.forEach(function (p, i) {
          d0.position.set(p.x, p.y, p.z);
          d0.scale.set(p.w, p.h, p.d);
          d0.updateMatrix();
          platesMesh.setMatrixAt(i, d0.matrix);
        });
        platesMesh.instanceMatrix.needsUpdate = true;
        g.add(platesMesh);
      }

      var mesh = instanced(blocks, blockMat());
      mesh.userData.blocks = blocks;
      g.add(mesh);
      g.add(edgeLines(blocks, 0x4fd8ea, 0.34));

      return {
        group: g,
        blocks: blocks,
        pick: mesh,
        hbm: hbmHeads,
        dispose: function () {
          g.traverse(function (o) {
            if (o.geometry && o.geometry !== boxGeo) o.geometry.dispose();
            if (o.material && o.material !== subMat && o.material !== itpMat &&
              o.material !== dieMat && o.material !== hbmMat) {
              if (o.material.map) o.material.map.dispose();
              o.material.dispose();
            }
          });
        }
      };
    }

    /* ============================================================
       四、微观构建
       ============================================================ */

    function buildMicro(key) {
      var g = new THREE.Group();
      var blocks = key === 'gpu' ? gpuMicroBlocks() : cpuMicroBlocks();

      // 单元底板
      var base = new THREE.Mesh(new THREE.BoxGeometry(3.30, 0.06, 2.44),
        new THREE.MeshStandardMaterial({
          color: 0x08161d, roughness: 0.7, metalness: 0.5,
          emissive: 0x0a2630, emissiveIntensity: 0.5
        }));
      base.position.y = -0.01;
      g.add(base);

      // 底板上的单元行纹理
      var cv = document.createElement('canvas');
      cv.width = cv.height = 256;
      var cc = cv.getContext('2d');
      cc.fillStyle = '#07131a';
      cc.fillRect(0, 0, 256, 256);
      for (var y = 0; y < 256; y += 4) {
        cc.fillStyle = 'rgba(64,180,205,0.10)';
        cc.fillRect(0, y, 256, 1);
      }
      var tex = new THREE.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(5, 4);
      var face = new THREE.Mesh(new THREE.PlaneGeometry(3.30, 2.44),
        new THREE.MeshStandardMaterial({
          map: tex, color: 0x9ad6e4, roughness: 0.85, metalness: 0.1,
          emissive: 0x0c3340, emissiveIntensity: 0.45
        }));
      face.rotation.x = -Math.PI / 2;
      face.position.y = 0.0205;
      g.add(face);

      var mesh = instanced(blocks, blockMat());
      mesh.userData.blocks = blocks;
      g.add(mesh);
      g.add(edgeLines(blocks, 0x5fe6f5, 0.40));

      return { group: g, blocks: blocks, pick: mesh };
    }

    var macroRoot = new THREE.Group();
    var microRoot = new THREE.Group();
    scene.add(macroRoot);
    scene.add(microRoot);

    var MACRO = { gpu: buildMacro('gpu'), cpu: buildMacro('cpu') };
    var MICRO = { gpu: buildMicro('gpu'), cpu: buildMicro('cpu') };

    Object.keys(MACRO).forEach(function (k) { macroRoot.add(MACRO[k].group); });
    Object.keys(MICRO).forEach(function (k) { microRoot.add(MICRO[k].group); });
    microRoot.visible = false;

    /* ---- 数据流粒子 ---- */
    var FLOW = { gpu: [], cpu: [] };
    (function () {
      // GPU：HBM → die 边缘，以及 die 之间的 NV-HBI
      for (var i = 0; i < 8; i++) {
        var hx = [-4.05, -1.35, 1.35, 4.05][i % 4];
        var hz = i < 4 ? -3.35 : 3.35;
        FLOW.gpu.push([[hx, 0.42, hz], [hx * 0.92, 0.34, hz > 0 ? 1.30 : -1.30]]);
      }
      FLOW.gpu.push([[-0.30, 0.34, -0.34], [0.30, 0.34, -0.34]]);
      FLOW.gpu.push([[0.30, 0.34, 0.30], [-0.30, 0.34, 0.30]]);
      // CPU：IOD ↔ 各 CCD
      for (var j = 0; j < 6; j++) {
        var x = (j - 2.5) * 1.72;
        FLOW.cpu.push([[x * 0.45, 0.34, -1.1], [x, 0.34, -2.35]]);
        FLOW.cpu.push([[x * 0.45, 0.34, 1.1], [x, 0.34, 2.35]]);
      }
    })();

    var FLOW_N = 110;
    var flowPos = new Float32Array(FLOW_N * 3);
    var flowState = [];
    for (var fi = 0; fi < FLOW_N; fi++) {
      flowState.push({ p: Math.random(), s: 0.28 + Math.random() * 0.5, path: 0 });
    }
    var flowGeo = new THREE.BufferGeometry();
    flowGeo.setAttribute('position', new THREE.BufferAttribute(flowPos, 3));
    var flowPts = new THREE.Points(flowGeo, new THREE.PointsMaterial({
      color: 0x9ff0ff, size: 0.055, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    macroRoot.add(flowPts);

    /* ============================================================
       五、HUD
       ============================================================ */

    var hud = document.createElement('div');
    hud.className = 'chip-hud';
    hud.innerHTML = [
      '<div class="cp-grid"></div>',
      '<div class="cp-top">',
      '<div class="cp-logo">SILICON<em>/</em>硅基芯片</div>',
      '<div class="cp-sub" id="cpSub">NVIDIA · GB100</div>',
      '</div>',
      '<div class="cp-kpi" id="cpKpi"></div>',
      '<div class="cp-map"><h4><span>FLOORPLAN</span><b id="cpMapTag">宏观</b></h4>' +
      '<canvas id="cpMapC" width="300" height="240"></canvas>' +
      '<div class="cp-map-ft"><span id="cpMapFt">封装级 · 1 : 1</span></div></div>',
      '<div class="cp-card" id="cpCard"></div>',
      '<div class="cp-legend" id="cpLegend"></div>',
      '<div class="cp-labels" id="cpLabels"></div>',
      '<div class="cp-toggle"><button data-v="macro" class="on">宏观 · 版图</button>' +
      '<button data-v="micro">微观 · 单元</button></div>',
      '<div class="cp-hint" id="cpHint">点选任意 GPC 区块 → 下钻到单 SM</div>',
      '<div class="cp-flash" id="cpFlash"></div>'
    ].join('');
    if (stageEl) stageEl.appendChild(hud);

    var elSub = hud.querySelector('#cpSub');
    var elKpi = hud.querySelector('#cpKpi');
    var elCard = hud.querySelector('#cpCard');
    var elLegend = hud.querySelector('#cpLegend');
    var elLabels = hud.querySelector('#cpLabels');
    var elMapC = hud.querySelector('#cpMapC');
    var elMapTag = hud.querySelector('#cpMapTag');
    var elMapFt = hud.querySelector('#cpMapFt');
    var elHint = hud.querySelector('#cpHint');
    var elFlash = hud.querySelector('#cpFlash');
    var btnToggle = hud.querySelectorAll('.cp-toggle button');

    /* ---- 状态 ---- */
    var P = { view: 'macro', chip: 'gpu', labels: true, flow: true, pkg: true, spin: true };
    var focus = null;          // 当前下钻来源 {name, sub}
    var hover = null;          // 悬停区块
    var tr = null;             // 视角过渡
    var tourOn = false;        // 讲解模式：底部两块面板让位给旁白卡

    var VIEWS = {
      macro: { pos: new THREE.Vector3(0, 12.2, 13.6), tgt: new THREE.Vector3(0, 0.90, 0) },
      micro: { pos: new THREE.Vector3(0.55, 4.05, 4.15), tgt: new THREE.Vector3(0, 0.10, 0.02) }
    };

    /* ---- 悬停高亮框 ---- */
    var hoverBox = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({
      color: 0x8ff4ff, wireframe: true, transparent: true, opacity: 0.9, depthWrite: false
    }));
    hoverBox.visible = false;
    scene.add(hoverBox);

    /* ============================================================
       六、HUD 渲染
       ============================================================ */

    function pad2(n) { return (n < 10 ? '0' : '') + n; }

    function renderKpi() {
      var c = CHIPS[P.chip];
      elSub.textContent = c.vendor + ' · ' + c.node;
      elKpi.innerHTML = c.kpi.map(function (k, i) {
        return '<div class="cp-k' + (i >= 3 ? ' hot' : '') + '">' +
          '<b>' + k[0] + (k[1] ? '<i>' + k[1] + '</i>' : '') + '</b>' +
          '<span>' + k[2] + '</span></div>';
      }).join('');
    }

    function renderLegend() {
      var c = CHIPS[P.chip];
      var list = (P.view === 'micro' && c.legendMicro) ? c.legendMicro : c.legend;
      elLegend.innerHTML = '<h5>' + (P.view === 'micro' ? '单元构成 / UNIT' : '功能区块 / BLOCKS') +
        '</h5>' + list.map(function (l) {
        return '<div class="cp-lg"><i style="color:' + l[0] + ';background:' + l[0] + '"></i>' +
          '<span>' + l[1] + '</span><b>' + l[2] + '</b></div>';
      }).join('') + '<div class="cp-note">' +
        (P.view === 'micro' ? '单元内部按微架构框图排布，尺寸为示意' : '区块位置按公开版图重建，为示意排布') +
        '</div>';
    }

    function renderCard() {
      var c = CHIPS[P.chip];
      var rows;
      if (P.view === 'macro') {
        rows = [
          ['视图', '宏观 · 整包版图'],
          ['尺度', c.scale],
          ['工艺', c.node],
          ['封装', c.pkg],
          ['单元', c.unit + ' 级下钻可用']
        ];
      } else {
        rows = [
          ['视图', '微观 · 单元内部'],
          ['单元', focus ? focus.name : (P.chip === 'gpu' ? 'SM 内部' : 'Zen 5c 核心')],
          ['来源', focus ? focus.sub : (P.chip === 'gpu' ? 'die A · GPC 00' : 'CCD 00')],
          ['尺度', c.area],
          ['内容', P.chip === 'gpu' ? '4 处理块 / 张量核 / RF / L1' : '前端 / 整数 / 浮点 / L1D / L2']
        ];
      }
      elCard.innerHTML = '<h5>' + (P.view === 'macro' ? 'PACKAGE' : 'UNIT') + ' / 当前视图</h5>' +
        rows.map(function (r) {
          return '<div class="cp-row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>';
        }).join('') +
        (P.view === 'micro' ? '<button class="cp-back" id="cpBack">← 返回宏观</button>' : '');
      var back = elCard.querySelector('#cpBack');
      if (back) back.addEventListener('click', function () { goView('macro'); });
    }

    /* ---- 小地图：把当前层级的区块按俯视图画一遍 ---- */
    var mapCtx = elMapC.getContext('2d');
    function drawMap() {
      var W = elMapC.width, H = elMapC.height;
      mapCtx.clearRect(0, 0, W, H);
      var isMacro = P.view === 'macro';
      var blocks = isMacro ? MACRO[P.chip].blocks : MICRO[P.chip].blocks;
      var sx = isMacro ? (P.chip === 'gpu' ? 11 : 8) : 34;
      var cx = W / 2, cy = H / 2;

      mapCtx.fillStyle = 'rgba(6,16,24,0.9)';
      mapCtx.fillRect(0, 0, W, H);
      // 参考网格
      mapCtx.strokeStyle = 'rgba(60,140,175,0.14)';
      mapCtx.lineWidth = 1;
      for (var gx = 0; gx < W; gx += 30) {
        mapCtx.beginPath(); mapCtx.moveTo(gx, 0); mapCtx.lineTo(gx, H); mapCtx.stroke();
      }
      for (var gy = 0; gy < H; gy += 30) {
        mapCtx.beginPath(); mapCtx.moveTo(0, gy); mapCtx.lineTo(W, gy); mapCtx.stroke();
      }

      blocks.forEach(function (b) {
        var x = cx + b.x * sx, y = cy + b.z * sx;
        var w = Math.max(1, b.w * sx), h = Math.max(1, b.d * sx);
        mapCtx.fillStyle = hexA(b.col, 0.55);
        mapCtx.fillRect(x - w / 2, y - h / 2, w, h);
        if (isMacro) {
          mapCtx.strokeStyle = hexA(b.col, 0.85);
          mapCtx.lineWidth = 0.8;
          mapCtx.strokeRect(x - w / 2, y - h / 2, w, h);
        }
      });

      // 下钻来源标记
      if (!isMacro) {
        mapCtx.strokeStyle = 'rgba(255,180,84,0.95)';
        mapCtx.lineWidth = 2;
        mapCtx.strokeRect(6, 6, W - 12, H - 12);
        mapCtx.fillStyle = 'rgba(255,180,84,0.12)';
        mapCtx.fillRect(6, 6, W - 12, H - 12);
      }
      elMapTag.textContent = isMacro ? '宏观' : '微观';
      elMapFt.textContent = isMacro
        ? (P.chip === 'gpu' ? '封装级 · 双 die' : '封装级 · 13 chiplet')
        : '单元级 · 约 1000 : 1';
    }

    function hexA(hex, a) {
      var r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
      return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }

    /* ---- 3D 标注 ---- */
    var LABELS = {
      gpu: [
        { t: 'die A', s: 'GPC × 8', p: [-2.78, 0.95, 0.15], ox: -60, oy: -46 },
        { t: 'die B', s: 'GPC × 8', p: [2.78, 0.95, 0.15], ox: 60, oy: -46 },
        { t: 'NV-HBI', s: '10 TB/s', p: [0, 0.60, -0.34], ox: 0, oy: 54 },
        { t: 'L2 缓存', s: '分片寻址', p: [2.78, 0.60, 0.40], ox: 78, oy: 44 },
        { t: 'HBM3e', s: '8 × 24 GB', p: [4.05, 1.05, 3.55], ox: 42, oy: 40 },
        { t: '硅中介层', s: 'CoWoS-L', p: [-5.0, 0.16, 3.55], ox: -30, oy: 34 }
      ],
      cpu: [
        { t: 'IOD', s: '12nm', p: [0, 0.75, 0], ox: 0, oy: -52 },
        { t: 'CCD × 12', s: '16 核 / 颗', p: [-4.30, 0.75, -3.30], ox: -34, oy: -40 },
        { t: 'L3 384 MB', s: '32 MB / CCD', p: [4.30, 0.45, 3.30], ox: 40, oy: 40 },
        { t: 'DDR5 12ch', s: '内存 PHY', p: [0, 0.45, -1.48], ox: 0, oy: -44 }
      ]
    };

    var LABEL_MICRO = {
      gpu: [
        { t: 'Warp 调度', s: '4 组', p: [0, 0.10, -1.02], ox: 0, oy: -42 },
        { t: '处理块 × 4', s: '32 FP32 / 块', p: [-0.78, 0.12, -0.60], ox: -56, oy: -38 },
        { t: '张量核', s: '矩阵乘加', p: [1.33, 0.12, 0.18], ox: 56, oy: 22 },
        { t: '寄存器堆', s: '256 KB', p: [-1.05, 0.12, 0.86], ox: -34, oy: 44 },
        { t: 'L1 / SMEM', s: '256 KB', p: [1.20, 0.12, 0.86], ox: 40, oy: 44 }
      ],
      cpu: [
        { t: '前端', s: '8-wide 解码', p: [0.72, 0.10, -0.96], ox: 30, oy: -44 },
        { t: '整数执行', s: '6 ALU + 4 AGU', p: [-0.80, 0.10, -0.30], ox: -46, oy: -34 },
        { t: '浮点 / 向量', s: '2 × 512-bit', p: [1.06, 0.12, 0.10], ox: 54, oy: 20 },
        { t: 'L1D', s: '48 KB', p: [-1.02, 0.10, 0.52], ox: -34, oy: 42 },
        { t: 'L2', s: '1 MB', p: [0, 0.10, 1.02], ox: 0, oy: 44 }
      ]
    };

    var marks = [];
    function buildMarks() {
      elLabels.innerHTML = '';
      marks = [];
      var isMacro = P.view === 'macro';
      var list = isMacro ? LABELS[P.chip] : LABEL_MICRO[P.chip];
      var parent = isMacro ? MACRO[P.chip].group : MICRO[P.chip].group;
      list.forEach(function (m) {
        var el = document.createElement('div');
        el.className = 'cp-ld';
        el.innerHTML = '<div class="cp-lb">' + m.t + '<b>' + m.s + '</b></div>' +
          '<svg width="1" height="1"><line x1="0" y1="0" x2="0" y2="0"/><circle cx="0" cy="0" r="2"/></svg>';
        elLabels.appendChild(el);
        var anchor = new THREE.Object3D();
        anchor.position.fromArray(m.p);
        parent.add(anchor);
        marks.push({
          def: m, el: el, anchor: anchor, line: el.querySelector('line'),
          lb: el.querySelector('.cp-lb')
        });
      });
    }

    var _v = new THREE.Vector3(), _p = new THREE.Vector3();
    function updateMarks() {
      if (!P.labels) { elLabels.style.display = 'none'; return; }
      elLabels.style.display = '';
      var W = stageEl ? stageEl.clientWidth : 1000;
      var H = stageEl ? stageEl.clientHeight : 700;
      var mapEl = hud.querySelector('.cp-map');
      var maxLx = W - 110;
      if (mapEl && mapEl.offsetParent && mapEl.offsetLeft > 0) {
        maxLx = Math.min(maxLx, mapEl.offsetLeft - (marks[0] ? marks[0].lb.offsetWidth / 2 + 12 : 70));
      }
      for (var i = 0; i < marks.length; i++) {
        var mk = marks[i];
        mk.anchor.getWorldPosition(_v);
        _p.copy(_v).project(camera);
        if (_p.z > 1) { mk.el.style.display = 'none'; continue; }
        mk.el.style.display = '';
        var ax = (_p.x * 0.5 + 0.5) * W;
        var ay = (-_p.y * 0.5 + 0.5) * H;
        var lx = clamp(ax + mk.def.ox, 100, maxLx);
        var ly = clamp(ay + mk.def.oy, 252, H - 92);   // 上边界避开 KPI 与图注

        mk.lb.style.transform = 'translate(-50%,-50%) translate(' + (lx - ax).toFixed(1) + 'px,' + (ly - ay).toFixed(1) + 'px)';
        mk.el.style.transform = 'translate(' + ax.toFixed(1) + 'px,' + ay.toFixed(1) + 'px)';
        mk.line.setAttribute('x2', (lx - ax).toFixed(1));
        mk.line.setAttribute('y2', (ly - ay).toFixed(1));
      }
    }

    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

    /* ============================================================
       七、视角切换
       ============================================================ */

    function applyView(v) {
      P.view = v;
      macroRoot.visible = (v === 'macro');
      microRoot.visible = (v === 'micro');
      MACRO.gpu.group.visible = (v === 'macro' && P.chip === 'gpu');
      MACRO.cpu.group.visible = (v === 'macro' && P.chip === 'cpu');
      MICRO.gpu.group.visible = (v === 'micro' && P.chip === 'gpu');
      MICRO.cpu.group.visible = (v === 'micro' && P.chip === 'cpu');
      hud.classList.toggle('micro', v === 'micro');
      hud.classList.remove('zoom');
      btnToggle[0].classList.toggle('on', v === 'macro');
      btnToggle[1].classList.toggle('on', v === 'micro');
      elHint.textContent = v === 'macro'
        ? (P.chip === 'gpu' ? '点选任意 GPC 区块 → 下钻到单 SM' : '点选任意 CCD 区块 → 下钻到单个 Zen 5c 核心')
        : '点选任一单元 → 查看它在芯片里的职能';
      controls.minDistance = v === 'macro' ? 5 : 1.0;
      controls.maxDistance = v === 'macro' ? 60 : 8;
      buildMarks();
      renderCard();
      renderLegend();
      elMapTag.textContent = v === 'micro' ? '单元' : '宏观';
      elMapFt.textContent = v === 'micro'
        ? (P.chip === 'gpu' ? 'SM 级 · 1 : 400' : '核心级 · 1 : 300')
        : '封装级 · 1 : 1';
      drawMap();
      if (HL.ui && HL.ui.sync) HL.ui.sync('view', v);
    }

    function goView(v, src) {
      if (v === P.view && !tr) { applyView(v); return; }
      if (tr && tr.to === v) return;
      focus = src || (v === 'micro' ? phaseFocus : null);
      tr = {
        t: 0, dur: 0.82, to: v, swapped: false,
        p0: camera.position.clone(), t0: controls.target.clone(),
        p1: VIEWS[v].pos.clone(), t1: VIEWS[v].tgt.clone()
      };
      elFlash.classList.remove('on');
      void elFlash.offsetWidth;
      elFlash.classList.add('on');
      if (v === 'micro') {
        hud.classList.add('zoom');
      }
    }

    var phaseFocus = null;

    function switchChip(k) {
      if (k === P.chip) return;
      P.chip = k;
      renderKpi();
      renderLegend();
      if (P.view === 'micro') {
        // 微观下切芯片：直接换版图，焦点信息随之作废
        focus = null;
        applyView('micro');
      } else {
        applyView('macro');
      }
    }

    /* ============================================================
       八、拾取
       ============================================================ */

    function activePick() {
      return P.view === 'macro'
        ? (P.chip === 'gpu' ? MACRO.gpu : MACRO.cpu)
        : (P.chip === 'gpu' ? MICRO.gpu : MICRO.cpu);
    }

    var pointer = { x: -2, y: -2, dirty: false };
    function onMove(e) {
      var r = ctx.canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      pointer.dirty = true;
    }
    ctx.canvas.addEventListener('pointermove', onMove);

    function pickAt(ndc) {
      raycaster.setFromCamera(ndc, camera);
      var obj = activePick();
      var hits = raycaster.intersectObject(obj.pick, false);
      if (!hits.length) return null;
      var b = obj.blocks[hits[0].instanceId];
      return b || null;
    }

    function updateHover() {
      if (!pointer.dirty) return;
      pointer.dirty = false;
      var b = pickAt(pointer);
      hover = b;
      if (b) {
        hoverBox.visible = true;
        hoverBox.position.set(b.x, b.y + b.h / 2, b.z);
        hoverBox.scale.set(b.w * 1.06, b.h * 1.6 + 0.01, b.d * 1.06);
        ctx.canvas.style.cursor = 'pointer';
      } else {
        hoverBox.visible = false;
        ctx.canvas.style.cursor = '';
      }
    }

    function onClick(ndc) {
      var b = pickAt(ndc);
      if (!b) return;
      if (P.view === 'macro' && (b.kind === 'gpc' || b.kind === 'ccd')) {
        phaseFocus = { name: b.name, sub: b.sub + ' · 已下钻' };
        goView('micro', phaseFocus);
      } else if (P.view === 'micro') {
        elCard.innerHTML = '<h5>单元详情 / ' + b.name + '</h5>' +
          '<div class="cp-row"><span>职能</span><b>' + b.sub + '</b></div>' +
          '<div class="cp-desc">' + (b.info || '') + '</div>' +
          '<button class="cp-back" id="cpBack2">← 返回宏观</button>';
        var bk = elCard.querySelector('#cpBack2');
        if (bk) bk.addEventListener('click', function () { goView('macro'); });
      } else {
        HL.toast(b.name + ' · ' + b.sub);
      }
    }

    /* ============================================================
       九、讲解
       ============================================================ */

    function tourSeq(v) { hardSwitch(v); }

    function hardSwitch(v) {
      tr = null;
      elFlash.classList.remove('on');
      applyView(v);
    }

    var tour = HL.Tour(ctx);
    tour.load([
      {
        t: '一、一颗芯片，是这样「盖」起来的',
        d: '从下往上看：最底下那层深色的有机基板负责把电和信号送进来，上面一层是硅中介层（CoWoS-L），两颗 GPU 裸片和八组 HBM3e 存储堆叠并排贴在同一块中介层上。算力不只在晶体管里，更在「怎么把它们连起来」里——这一代的关键词是先进封装。',
        exp: '拖动旋转，从侧面看裸片与 HBM 的厚度差。',
        cam: [[0, 12.4, 13.7], [0, 0.9, 0]],
        pulse: [0, 0.5, 0]
      },
      {
        t: '二、宏观版图：GPC 与 SM 阵列',
        d: '每颗裸片上排着 8 个 GPC（图形处理簇），每个 GPC 里又装着 8 个 SM。GPU 的算力来自「很多个小核心同时干活」——一万多个 FP32 通道被组织成阵列，靠并行堆出吞吐。',
        exp: '打开「区块标注」，在画面里数一数 GPC 的行列。',
        cam: [[-7.4, 9.2, 11.8], [-2.6, 0.3, 0]],
        pulse: null,
        apply: function () { tourSeq('macro'); }
      },
      {
        t: '三、L2 与 HBM PHY：算力之外的瓶颈',
        d: '裸片中间那排深蓝色是 L2 缓存切片，底部一排是 HBM 物理层。GPU 的瓶颈很少是「算不过来」，而是「喂不饱」：HBM3e 给到 8 TB/s，仍然追不上上万个通道同时取数的胃口。',
        exp: '切到 CPU 对照：CPU 的缓存层级更深、带宽小得多，两条完全不同的设计路线。',
        cam: [[5.8, 8.2, 10.6], [2.6, 0.3, 0.6]],
        pulse: null,
        apply: function () { tourSeq('macro'); }
      },
      {
        t: '四、进入微观：一个 SM 里有什么',
        d: '下钻到单个 SM。四个处理块各含 32 个 FP32 通道、一个张量核与四个 SFU；下方是 256 KB 寄存器堆和 256 KB 的 L1 / 共享内存。上面那条是 warp 调度器——它决定每个周期把哪条指令喂给哪一组通道。',
        exp: '点击视图里的任意小块，看它在 SM 里的具体职能。',
        cam: [[0.6, 4.3, 4.4], [0, 0.10, 0.02]],
        pulse: null,      // 整块 SM 就是主角，再套一圈脉冲环只会把单元裹成气泡
        apply: function () { tourSeq('micro'); }
      },
      {
        t: '五、CPU 的另一种解法：拼核心，不拼 die',
        d: '切成 CPU。AMD 用 12 颗小 CCD 围着一颗 IOD：每颗 CCD 上 16 个 Zen 5c 核共享 32 MB L3，IOD 负责 12 通道 DDR5 和 PCIe。GPU 用两颗大 die 拼算力，CPU 用十二颗小 die 拼核数——同样的先进封装，两种不同的取舍。',
        exp: '点选任意一颗 CCD，下钻看 Zen 5c 的取指、整数、浮点三段。',
        cam: [[0, 12.0, 13.3], [0, 0.9, 0]],
        pulse: null,
        apply: function () { P.chip = 'cpu'; renderKpi(); renderLegend(); tourSeq('macro'); }
      },
      {
        t: '六、硅的物理极限',
        d: '3nm、4NP 已经是量产工艺的最前沿，单个裸片的面积被光罩尺寸锁死在约 850 mm²——这才有了「双 die」「12 chiplet」这些绕路方案。再往下，是功耗墙：一颗 B200 整卡 1000 W，一半的能量花在把数据搬来搬去，而不是计算本身。',
        exp: '这一版是可交互示意：真实数字以厂商公布规格为准。',
        cam: [[0, 10.6, 12.9], [0, 0.9, 0]],
        pulse: null,
        apply: function () { tourSeq('macro'); }
      }
    ]);

    tour.onStep = function () { };

    /* ============================================================
       十、初始状态与主循环
       ============================================================ */

    camera.position.copy(VIEWS.macro.pos);
    controls.target.copy(VIEWS.macro.tgt);
    camera.updateProjectionMatrix();
    controls.syncFromCamera();
    controls.saveHome();
    controls.minDistance = 5;
    controls.maxDistance = 60;

    renderKpi();
    renderLegend();
    applyView('macro');

    // 底部胶囊按钮
    Array.prototype.forEach.call(btnToggle, function (b) {
      b.addEventListener('click', function () { goView(b.dataset.v); });
    });

    var clock = 0;
    var spinOn = true;

    updateState();

    function updateState() {
      spinOn = P.spin;
      if (P.flow) flowPts.visible = true; else flowPts.visible = false;
      flowPts.visible = P.flow && P.view === 'macro';
      hud.classList.toggle('hide-pkg', !P.pkg);
      MACRO[P.chip].group.traverse(function (o) {
        if (o.isInstancedMesh && !o.userData.blocks) o.visible = P.pkg;   // HBM / 底板
      });
      // 封装层（基板 / 中介层 / 裸片）用整体淡出表达开关
      var g = MACRO[P.chip].group;
      g.children.forEach(function (o) {
        if (o === MACRO[P.chip].pick) return;
        if (o.isInstancedMesh && o.userData.blocks) return;
      });
    }

    return {
      update: function (dt, tt) {
        tour.update(dt, tt || 0, function (ddt) {
          clock += ddt;

          // 视角过渡
          if (tr) {
            tr.t += dt;
            var k = clamp(tr.t / tr.dur, 0, 1);
            var e = easeInOut(Math.min(1, k / 0.78));
            camera.position.lerpVectors(tr.p0, tr.p1, e);
            controls.target.lerpVectors(tr.t0, tr.t1, e);
            if (controls.syncFromCamera) controls.syncFromCamera();
            if (!tr.swapped && k >= 0.42) {
              tr.swapped = true;
              applyView(tr.to);
              if (tr.to === 'micro') microRoot.scale.setScalar(0.74);
            }
            if (tr.to === 'micro' && k > 0.42) {
              var sk = clamp((k - 0.42) / 0.58, 0, 1);
              microRoot.scale.setScalar(0.74 + 0.26 * easeOut(sk));
            }
            if (k >= 1) {
              tr = null;
              microRoot.scale.setScalar(1);
              elFlash.classList.remove('on');
            }
          }

          // 缓慢旋转（宏观）
          if (spinOn && !tr && P.view === 'macro') {
            macroRoot.rotation.y += ddt * 0.10;
          } else if (P.view === 'micro') {
            macroRoot.rotation.y *= 0.96;
          }

          // 数据流粒子
          if (P.flow && P.view === 'macro') {
            var paths = FLOW[P.chip];
            for (var i = 0; i < FLOW_N; i++) {
              var st = flowState[i];
              if (st.path >= paths.length) st.path = Math.floor(Math.random() * paths.length);
              var path = paths[st.path];
              st.p += ddt * st.s * 0.55;
              if (st.p > 1) { st.p = 0; st.path = Math.floor(Math.random() * paths.length); path = paths[st.path]; }
              var a = path[0], b2 = path[1];
              flowPos[i * 3] = a[0] + (b2[0] - a[0]) * st.p;
              flowPos[i * 3 + 1] = a[1] + (b2[1] - a[1]) * st.p + Math.sin(st.p * Math.PI) * 0.05;
              flowPos[i * 3 + 2] = a[2] + (b2[2] - a[2]) * st.p;
            }
            flowGeo.attributes.position.needsUpdate = true;
          }

          updateHover();
          updateMarks();

          // 讲解旁白卡横穿底部，图例与参数卡整块淡出，画面只留旁白
          var ton = tour.active();
          if (ton !== tourOn) { tourOn = ton; hud.classList.toggle('tour-on', ton); }
        });
      },

      setParam: function (key, v) {
        if (key === 'tour') { tour.toggle(); return; }
        if (key === 'view') { goView(v); return; }
        if (key === 'chip') { switchChip(v); return; }
        P[key] = v;
        updateState();
        if (key === 'labels') updateMarks();
        if (key === 'pkg') {
          // 只影响封装与存储：基板 / 中介层 / HBM / 芯片底座
          var g2 = MACRO[P.chip].group;
          g2.children.forEach(function (o) {
            if (o.isInstancedMesh && o.userData.blocks) return;    // 功能区块始终保留
            if (o.isPoints || o.isLineSegments) {
              if (o.isLineSegments) o.visible = v;
              return;
            }
            o.visible = v;
          });
          flowPts.visible = v && P.flow && P.view === 'macro';
        }
      },

      onClick: onClick,

      dispose: function () {
        ctx.canvas.removeEventListener('pointermove', onMove);
        tour.dispose();
        if (hud.parentNode) hud.parentNode.removeChild(hud);
        scene.remove(hoverBox);
        hoverBox.material.dispose();
        scene.remove(flowPts);
        flowPts.geometry.dispose();
        flowPts.material.dispose();
        scene.remove(floor);
        floor.geometry.dispose();
        floor.material.dispose();
        scene.remove(macroRoot);
        scene.remove(microRoot);
        TEX_CELL.dispose();
      }
    };

    /* ---- 缓动 ---- */
    function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  }
});
