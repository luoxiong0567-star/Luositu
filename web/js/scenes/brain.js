/**
 * 场景：人类的大脑（MRI 影像工作台）
 *
 * 数据来源：本人 2026-10-10 头颅 MRI 平扫（GE 3.0T）
 *   5 个序列、87 层 —— 定位像 7 / 矢状位 T1 17 / 轴位 T2 21 / 轴位 T2-FLAIR 21 / 轴位 T1 21
 *   层厚 5.0–7.0 mm；TR/TE 见 SEQ 表；AI 读片结论：常规平扫范围内未见明确异常
 *   （原始报告：MRI影像AI审阅报告.html，数据全程本地处理）
 *
 * 视觉：参考「记忆引擎控制台」那类暗场 HUD —— 近黑底、极细网格、琥珀单色、
 *   等宽大数字；中央一颗半透明脑，扫描光带自头顶向枕部推进，内部结构以细发光管勾勒；
 *   右侧 AXIAL / CORONAL / SAGITTAL 三视图，底部三块数据面板。
 *   与场景内其他页的差别只在配色（单色琥珀 + 冷灰），交互语法完全沿用
 *   （controls 面板 / 点击拾取 / 讲解模式 / R 复位）。
 *
 * 实现要点：
 *  - 脑表面是程序化网格：椭球基底 + 纵裂凹槽 + 三频噪声位移做沟回；
 *    沟回明暗写进顶点色（凹处暗、凸处亮），不依赖任何贴图。
 *  - 扫描光带不是贴图动画，而是「一段世界坐标亮带」：复制脑几何做一层
 *    ShaderMaterial 壳，片元里按 |worldY - uScanY| 衰减，加色混合 —— 光带
 *    经过时只有它附近的一圈亮起来，与 3D 形状严丝合缝。
 *  - 三视图是 canvas 2D 合成切片（椭圆颅骨 + 脑实质渐变 + 脑沟细弧 + 脑室），
 *    随扫描层变化；T2 脑脊液亮、FLAIR 压暗、T1 反转，切换序列时三视图同步换对比。
 */
(function (global) {
  'use strict';

  var HL = global.HL;
  if (!HL) return;

  /* ---------------- 数据 ---------------- */

  // 序列表：层数、层厚、TR/TE 全部取自 DICOM 头
  var SEQ = {
    t2: {
      name: 'Ax T2 PROPELLER', short: 'T2', plane: 'AXIAL',
      n: 21, thick: '5.0', tr: '4351', te: '98.2', fov: '220 × 220',
      csb: 1.00,     // 脑脊液亮度
      wm: 0.50, gm: 0.62, csf: 0.96,   // 白质 / 灰质 / 脑脊液 的灰度
      note: '水是亮的：脑脊液、水肿、炎症都显白'
    },
    flair: {
      name: 'Ax T2 FLAIR FS', short: 'FLAIR', plane: 'AXIAL',
      n: 21, thick: '5.0', tr: '8800', te: '99.3', fov: '220 × 220',
      csb: 0.10, wm: 0.46, gm: 0.58, csf: 0.12,
      note: '自由水被压制：脑脊液变黑，白质病变最敏感'
    },
    t1: {
      name: 'Ax T1 FLAIR', short: 'T1', plane: 'AXIAL',
      n: 21, thick: '5.0', tr: '1710', te: '9.3', fov: '220 × 220',
      csb: 0.16, wm: 0.74, gm: 0.50, csf: 0.14,
      note: '解剖最清楚：白质亮、灰质暗、脑脊液黑'
    },
    sag: {
      name: 'Sag T1 FLAIR', short: 'SAG', plane: 'SAGITTAL',
      n: 17, thick: '6.0', tr: '1725', te: '27.9', fov: '220 × 220',
      csb: 0.18, wm: 0.74, gm: 0.52, csf: 0.14,
      note: '正中矢状位看胼胝体、脑干与颈髓交界'
    }
  };
  var SEQ_ORDER = ['t2', 'flair', 't1', 'sag'];

  // AI 读片所见（原文摘要，只保留结论句）
  var FINDINGS = [
    ['脑实质', '未见明确占位、出血或异常信号', '正常'],
    ['中线', '居中，左右基本对称', '正常'],
    ['脑室', '大小形态在正常范围', '正常'],
    ['后颅窝', '脑干、小脑形态信号未见异常', '正常'],
    ['鼻窦乳突', '未见黏膜增厚或积液', '正常'],
    ['鞍区', '内容物对称，非薄层评价有限', '有限']
  ];

  // 结构锚点（世界坐标，R = 7.2 时的手工标定值）
  var MARKS = [
    { id: 'cc', name: '胼胝体', en: 'CORPUS CALLOSUM', seg: '#09', p: [0, 1.55, -0.15], ox: -122, oy: -48 },
    { id: 'lv', name: '侧脑室', en: 'LATERAL VENTRICLE', seg: '#12', p: [1.75, 1.05, 0.55], ox: 112, oy: -14 },
    { id: 'cb', name: '小脑', en: 'CEREBELLUM', seg: '#17', p: [-1.35, -4.35, -3.55], ox: -98, oy: 34 },
    { id: 'bs', name: '脑干', en: 'BRAINSTEM', seg: '#15', p: [0, -3.15, -1.15], ox: 84, oy: 40 }
  ];

  var R = 7.2;                       // 脑半径基准（世界单位）

  function lerp(a, b, k) { return a + (b - a) * k; }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  HL.registerScene({
    id: 'brain',
    name: '人类的大脑',
    short: 'MRI 影像 · 扫描与结构',
    icon: '🧠',
    fov: 40,
    minDistance: 8,
    maxDistance: 70,
    desc: '本人头颅 MRI 平扫：5 个序列 87 层，层厚 5 mm。扫描带推进、三视图同步走层，切 T2 / FLAIR / T1 看同一层的加权差别。',

    controls: [
      { type: 'button', key: 'tour', label: '📖 讲解模式' },
      {
        type: 'buttons', key: 'seq', label: '序列', value: 't2', options: [
          { label: 'T2', value: 't2' },
          { label: 'FLAIR', value: 'flair' },
          { label: 'T1', value: 't1' },
          { label: '矢状位', value: 'sag' }
        ]
      },
      { type: 'range', key: 'slice', label: '层面', min: 0, max: 20, step: 1, value: 10, unit: '' },
      { type: 'check', key: 'scan', label: '扫描动画', value: true },
      { type: 'range', key: 'speed', label: '扫描速度', min: 0.2, max: 2.4, step: 0.1, value: 1, unit: '×' },
      { type: 'check', key: 'labels', label: '结构标注', value: true },
      { type: 'check', key: 'panel', label: '数据面板', value: true },
      { type: 'check', key: 'spin', label: '缓慢旋转', value: true }
    ],

    create: function (ctx) {
      var THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera, controls = ctx.controls;
      var stageEl = document.getElementById('stage');

      var P = {
        seq: 't2', slice: 10, scan: true, speed: 1,
        labels: true, panel: true, spin: true
      };

      var root = new THREE.Group();
      // 画布左侧被 HUD（标识 + 大数字 + 读片结论）占掉约 330 px，主体略右移让位
      root.position.set(1.2, 1.35, 0);
      scene.add(root);

      /* ================= 舞台 ================= */

      scene.background = new THREE.Color(0x04080f);
      scene.fog = new THREE.FogExp2(0x04080f, 0.007);

      scene.add(new THREE.AmbientLight(0x93b3c9, 0.12));
      var keyL = new THREE.DirectionalLight(0xf2f8ff, 1.34); keyL.position.set(17, 13, 7); scene.add(keyL);
      var rimL = new THREE.DirectionalLight(0xc2e0ec, 0.20); rimL.position.set(-14, 2, -8); scene.add(rimL);
      var fillL = new THREE.DirectionalLight(0x9fc4d8, 0.16); fillL.position.set(-8, -6, 8); scene.add(fillL);
      var coreL = new THREE.PointLight(0xcfe0ea, 0.18, 30, 1.8); coreL.position.set(0, 0.5, 0); scene.add(coreL);

      // 地面反光的一层极淡光斑，避免下半屏纯黑
      var halo = new THREE.Sprite(ctx.glowSprite('rgba(110,200,232,0.13)'));
      halo.scale.set(30, 30, 1);
      halo.position.set(0, -1.5, -6);
      scene.add(halo);

      /* ================= 脑表面 ================= */

      /* 沟回：值噪声 fBm + ridge 化。
       *
       * 教训：纯正弦叠加（哪怕三组不同频率）出来的是"指纹 / 布料褶皱"——
       * 因为正弦场自带方向性，叠多少层都留着一道道平行浪。真实脑沟是
       * 迷宫状的：走向随机、宽窄不一、会分叉。所以这里改成 3D 值噪声，
       * 取 |2n-1| 的反面 —— 脊线落在 n=0.5 的等值面上，天然弯曲、不成条。 */
      function hash3(i, j, k) {
        var n = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
        return n - Math.floor(n);
      }
      function vnoise(x, y, z) {
        var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
        var xf = x - xi, yf = y - yi, zf = z - zi;
        var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
        function l(a, b, t) { return a + (b - a) * t; }
        var c000 = hash3(xi, yi, zi), c100 = hash3(xi + 1, yi, zi);
        var c010 = hash3(xi, yi + 1, zi), c110 = hash3(xi + 1, yi + 1, zi);
        var c001 = hash3(xi, yi, zi + 1), c101 = hash3(xi + 1, yi, zi + 1);
        var c011 = hash3(xi, yi + 1, zi + 1), c111 = hash3(xi + 1, yi + 1, zi + 1);
        return l(l(l(c000, c100, u), l(c010, c110, u), v),
                 l(l(c001, c101, u), l(c011, c111, u), v), w);
      }
      function fbm(x, y, z) {
        var s = 0, a = 0.52, f = 1, norm = 0;
        for (var o = 0; o < 4; o++) {
          s += a * vnoise(x * f, y * f, z * f);
          norm += a; f *= 2.07; a *= 0.52;
        }
        return s / norm;
      }
      function gyri(x, y, z) {
        var n = fbm(x * 3.05 + 11.3, y * 3.05 + 5.7, z * 3.05 + 8.1);
        // ridge：0 在沟底、1 在脊顶；2.2 次幂把沟压窄、脑回加宽
        var ridge = Math.pow(1 - Math.abs(n * 2 - 1), 1.75);
        return ridge - 0.42;     // 中心归零：>0 脑回凸起，<0 脑沟凹陷
      }

      function brainGeo(scaleX, scaleY, scaleZ, base) {
        var g = new THREE.SphereGeometry(1, 132, 92);
        var pos = g.attributes.position;
        var col = new Float32Array(pos.count * 3);
        var v = new THREE.Vector3();
        var cLo = new THREE.Color(0x05080c), cHi = new THREE.Color(0x8e97a1);
        var cTmp = new THREE.Color();
        for (var i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).normalize();
          var x = v.x, y = v.y, z = v.z;

          var rr = 1;
          // 解剖轮廓：额极前突、枕极后突、颞叶在下方外侧鼓出，中间略收
          rr += 0.075 * Math.pow(Math.max(0, z), 1.4);
          rr += 0.045 * Math.pow(Math.max(0, -z), 1.6) * Math.max(0, y + 0.6);
          rr += 0.055 * Math.exp(-Math.pow((y + 0.42) / 0.34, 2)) * Math.exp(-Math.pow((z - 0.10) / 0.75, 2));
          rr -= 0.030 * Math.max(0, -z) * Math.max(0, -y);
          // 纵裂只在上半球：整球都凹会把脑压成心形（0.155 时左右像两个球）
          rr -= 0.075 * Math.exp(-(x * x) / 0.007) * Math.max(0, y + 0.15);
          rr -= 0.055 * Math.max(0, -y) * Math.max(0, 0.7 - Math.abs(z)); // 颅底内收
          var gg = gyri(x, y, z);
          rr += 0.100 * gg;                                   // 沟回起伏（ridge 噪声，沟深约 0.6 mm 当量）

          var px = x * rr * scaleX * base;
          var py = y * rr * scaleY * base;
          var pz = z * rr * scaleZ * base;
          pos.setXYZ(i, px, py, pz);

          // 沟回明暗：凹处暗（模拟沟内的阴影），凸处亮
          var tone = clamp(gg + 0.42, 0, 1);
          cTmp.copy(cLo).lerp(cHi, Math.pow(tone, 2.45));
          col[i * 3] = cTmp.r; col[i * 3 + 1] = cTmp.g; col[i * 3 + 2] = cTmp.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        g.computeVertexNormals();
        return g;
      }

      var brainGeoMain = brainGeo(1.0, 0.82, 1.15, R);

      var brainMat = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 1.0, metalness: 0.0,
        color: 0xffffff, transparent: true, opacity: 0.955,
        depthWrite: false, side: THREE.FrontSide
      });
      var brain = new THREE.Mesh(brainGeoMain, brainMat);
      brain.renderOrder = 2;
      root.add(brain);

      // 半透明外壳：只留菲涅耳边缘，让轮廓在暗场里浮出来
      var shellMat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(0xdcecf4) }, uPow: { value: 3.8 }, uInt: { value: 0.018 } },
        vertexShader: [
          'varying vec3 vN; varying vec3 vV;',
          'void main(){',
          '  vec4 wp = modelMatrix * vec4(position,1.0);',
          '  vN = normalize(mat3(modelMatrix) * normal);',
          '  vV = normalize(cameraPosition - wp.xyz);',
          '  gl_Position = projectionMatrix * viewMatrix * wp;',
          '}'
        ].join('\n'),
        fragmentShader: [
          'uniform vec3 uColor; uniform float uPow; uniform float uInt;',
          'varying vec3 vN; varying vec3 vV;',
          'void main(){',
          '  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPow);',
          '  gl_FragColor = vec4(uColor, f * uInt);',
          '}'
        ].join('\n'),
        transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.FrontSide
      });
      var shell = new THREE.Mesh(brainGeoMain, shellMat);
      shell.renderOrder = 3;
      shell.scale.setScalar(1.006);
      root.add(shell);

      /* ---- 扫描亮带：复制脑几何，只亮 |worldY - scanY| 附近 ---- */
      var scanMat = new THREE.ShaderMaterial({
        uniforms: {
          uY: { value: 0 }, uCol: { value: new THREE.Color(0xd6eefb) },
          uOp: { value: 0.26 }, uW: { value: 0.30 }
        },
        vertexShader: [
          'varying vec3 vW;',
          'void main(){',
          '  vec4 wp = modelMatrix * vec4(position,1.0);',
          '  vW = wp.xyz;',
          '  gl_Position = projectionMatrix * viewMatrix * wp;',
          '}'
        ].join('\n'),
        fragmentShader: [
          'uniform float uY; uniform vec3 uCol; uniform float uOp; uniform float uW;',
          'varying vec3 vW;',
          'void main(){',
          '  float d = abs(vW.y - uY);',
          '  float a = smoothstep(uW, 0.0, d);',
          '  a = pow(a, 1.05);',
          '  gl_FragColor = vec4(uCol * (0.6 + 0.9 * a), a * uOp);',
          '}'
        ].join('\n'),
        transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, side: THREE.DoubleSide
      });
      var scanShell = new THREE.Mesh(brainGeoMain, scanMat);
      scanShell.renderOrder = 4;
      scanShell.scale.setScalar(1.012);
      root.add(scanShell);

      // 扫描处的细亮环 + 切面盘
      var scanGroup = new THREE.Group();
      root.add(scanGroup);

      // 不再加实体圆环：它在脑外绕一圈、透视成一条金线，与 shader 亮带重复

      var discGeo = new THREE.CircleGeometry(R * 0.97, 96);
      discGeo.rotateX(-Math.PI / 2);
      var discMat = new THREE.MeshBasicMaterial({
        color: 0xa4bccb, transparent: true, opacity: 0.012,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
      });
      scanGroup.add(new THREE.Mesh(discGeo, discMat));

      /* ================= 小脑 / 脑干 ================= */

      var cbGeo = brainGeo(0.94, 0.66, 0.80, R * 0.44);
      var cerebellum = new THREE.Mesh(cbGeo, brainMat.clone());
      cerebellum.renderOrder = 2;
      cerebellum.position.set(0, -R * 0.56, -R * 0.66);
      root.add(cerebellum);

      // 脑干：自上而下渐细的管
      var bsPts = [];
      for (var bi = 0; bi <= 8; bi++) {
        var bt = bi / 8;
        bsPts.push(new THREE.Vector3(0, -R * 0.18 - bt * R * 0.78, -R * 0.34 + bt * R * 0.20));
      }
      var bsCurve = new THREE.CatmullRomCurve3(bsPts);
      var stem = new THREE.Mesh(
        new THREE.TubeGeometry(bsCurve, 26, R * 0.13, 12, false),
        new THREE.MeshStandardMaterial({ color: 0x7b838d, roughness: 0.9, metalness: 0.02 })
      );
      root.add(stem);

      /* ================= 内部结构 ================= */

      // 发光细管：琥珀 + 冷白，模拟参考图里那些“轨迹”
      function glowTube(pts, rad, color, op) {
        var curve = new THREE.CatmullRomCurve3(pts);
        function tube(r, o) {
          return new THREE.Mesh(
            new THREE.TubeGeometry(curve, 60, r, 8, false),
            new THREE.MeshBasicMaterial({
              color: color, transparent: true, opacity: o,
              blending: THREE.AdditiveBlending, depthWrite: false
            })
          );
        }
        // 芯 + 外晕两层：被脑壳蒙住之后，单层细管只剩一根"白线"，加晕才有光感
        var g = new THREE.Group();
        g.add(tube(rad, op));
        g.add(tube(rad * 2.4, op * 0.11));
        return g;
      }

      var inner = new THREE.Group();
      // renderOrder 1 = 先画内部轨迹；脑壳（2）与菲涅耳壳（3）随后叠加，
      // 相当于把轨迹"蒙"在脑壳里面 —— 比 depthTest:false 直接浮在表面真实
      inner.traverse(function (o) { o.renderOrder = 1; });
      root.add(inner);

      // 胼胝体：矢状面上的 C 形（前钳上翘、后钳下压）
      var ccPts = [];
      for (var ci = 0; ci <= 34; ci++) {
        var ct = ci / 34;
        var ang = -Math.PI * 0.86 + ct * Math.PI * 1.62;
        ccPts.push(new THREE.Vector3(
          0,
          Math.cos(ang) * R * 0.30 + R * 0.10,
          Math.sin(ang) * R * 0.40 - R * 0.04
        ));
      }
      inner.add(glowTube(ccPts, 0.042, 0xd8eaf4, 0.95));

      // 侧脑室（左右各一，前角向外上翘）
      [-1, 1].forEach(function (s) {
        var vp = [];
        for (var i = 0; i <= 20; i++) {
          var t = i / 20;
          vp.push(new THREE.Vector3(
            s * (0.42 + 0.34 * Math.sin(t * Math.PI)) * R * 0.5,
            (0.30 - 0.42 * t + 0.16 * Math.sin(t * Math.PI * 2)) * R * 0.7,
            (0.62 - 1.30 * t) * R * 0.6
          ));
        }
        inner.add(glowTube(vp, 0.036, 0xe2eef6, 0.80));
      });

      // 海马（颞叶内侧的小弧）
      [-1, 1].forEach(function (s) {
        var hp = [];
        for (var i = 0; i <= 14; i++) {
          var t = i / 14;
          var a = -0.4 + t * 1.7;
          hp.push(new THREE.Vector3(
            s * R * 0.34,
            -R * 0.06 - Math.sin(a) * R * 0.16,
            -R * 0.10 + Math.cos(a) * R * 0.22
          ));
        }
        inner.add(glowTube(hp, 0.022, 0xa8cce4, 0.55));
      });

      // 丘脑：原来是两颗 0.085R 的亮球，正面看像"眼睛"，收到几乎只是两个亮点
      [-1, 1].forEach(function (s) {
        var th = new THREE.Mesh(
          new THREE.SphereGeometry(R * 0.022, 10, 8),
          new THREE.MeshBasicMaterial({
            color: 0xb4d2e2, transparent: true, opacity: 0.28,
            blending: THREE.AdditiveBlending, depthWrite: false
          })
        );
        th.position.set(s * R * 0.12, R * 0.02, R * 0.02);
        th.renderOrder = 1;
        inner.add(th);
      });

      // 机位：fov 40、距离 33 —— 脑高约 11.8，占可见高（24.0）的一半，
      // 上下留出 HUD 的呼吸空间；默认略俯 6°，能同时看到顶面与颞叶
      camera.position.set(0.4, 5.6, 34.6);
      controls.target.set(0, 1.6, 0);
      camera.fov = 40;
      camera.updateProjectionMatrix();
      controls.syncFromCamera();

      /* ================= 尘埃 ================= */

      var DUST = 260;
      var dustGeo = new THREE.BufferGeometry();
      var dpos = new Float32Array(DUST * 3);
      var dspd = new Float32Array(DUST);
      for (var di = 0; di < DUST; di++) {
        var rad = 16 + Math.random() * 26;
        var th2 = Math.random() * Math.PI * 2;
        var ph2 = Math.acos(2 * Math.random() - 1);
        dpos[di * 3] = Math.sin(ph2) * Math.cos(th2) * rad;
        dpos[di * 3 + 1] = Math.cos(ph2) * rad * 0.6;
        dpos[di * 3 + 2] = Math.sin(ph2) * Math.sin(th2) * rad;
        dspd[di] = 0.4 + Math.random() * 1.2;
      }
      dustGeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
      var dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
        color: 0xb6c9d6, size: 0.075, transparent: true, opacity: 0.26,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      scene.add(dust);

      /* ================= HUD ================= */

      var hud = document.createElement('div');
      hud.className = 'brain-hud';
      hud.innerHTML = [
        '<div class="bh-grid"></div>',
        '<div class="bh-top">',
        '<div class="bh-logo">HUMAN<em>·</em>LIGHT</div>',
        '<div class="bh-sub">MRI WORKBENCH / 头颅平扫 · GE 3.0T</div>',
        '</div>',
        '<div class="bh-kpi">',
        '<div class="bh-k"><b id="bhKSeq">05</b><span>序列 / SERIES</span></div>',
        '<div class="bh-k"><b id="bhKLay">87</b><span>层面 / SLICES</span></div>',
        '<div class="bh-k"><b id="bhKThk">5.0<i>mm</i></b><span>层厚 / THICK</span></div>',
        '<div class="bh-k hot"><b id="bhKTr">4351</b><span>TR / ms</span></div>',
        '<div class="bh-k hot"><b id="bhKTe">98.2</b><span>TE / ms</span></div>',
        '</div>',
        '<div class="bh-slices" id="bhSlices"></div>',
        '<div class="bh-card" id="bhCard"></div>',
        '<div class="bh-findings" id="bhFind"></div>',
        '<div class="bh-labels" id="bhLabels"></div>'
      ].join('');
      if (stageEl) stageEl.appendChild(hud);

      var elSeq = hud.querySelector('#bhKSeq');
      var elLay = hud.querySelector('#bhKLay');
      var elThk = hud.querySelector('#bhKThk');
      var elTr = hud.querySelector('#bhKTr');
      var elTe = hud.querySelector('#bhKTe');
      var elSlices = hud.querySelector('#bhSlices');
      var elCard = hud.querySelector('#bhCard');
      var elFind = hud.querySelector('#bhFind');
      var elLabels = hud.querySelector('#bhLabels');

      // 三视图
      var VIEW_DEF = [
        { id: 'ax', title: 'AXIAL', sub: '横断面' },
        { id: 'co', title: 'CORONAL', sub: '冠状面' },
        { id: 'sa', title: 'SAGITTAL', sub: '矢状面' }
      ];
      var viewCanvases = {};
      elSlices.innerHTML = VIEW_DEF.map(function (d) {
        return '<div class="bh-sv">' +
          '<h4><span>' + d.title + '</span><b>' + d.sub + '</b></h4>' +
          '<canvas data-v="' + d.id + '" width="240" height="168"></canvas>' +
          '<div class="bh-meta"><span class="bh-mm" data-mm="' + d.id + '">mm +0.0</span>' +
          '<span class="bh-lay" data-lay="' + d.id + '">#00</span></div>' +
          '</div>';
      }).join('');
      VIEW_DEF.forEach(function (d) {
        viewCanvases[d.id] = elSlices.querySelector('canvas[data-v="' + d.id + '"]');
      });

      // 读片结论
      elFind.innerHTML = '<h5>AI 读片所见 / FINDINGS</h5>' + FINDINGS.map(function (f) {
        return '<div class="bh-fr"><u>' + f[0] + '</u><span>' + f[1] + '</span><i>' + f[2] + '</i></div>';
      }).join('');

      /* ---------------- 三视图绘制 ---------------- */

      // 固定种子的伪随机：脑沟纹理每次重绘一致，不会闪
      function rnd(seed) {
        var s = Math.sin(seed * 127.1) * 43758.5453;
        return s - Math.floor(s);
      }

      // 灰度取值：base 是暖灰，L 为亮度 0..1
      function tone(L, a) {
        L = clamp(L, 0, 1);
        return 'rgba(' + Math.round(222 * L) + ',' + Math.round(232 * L) + ',' + Math.round(242 * L) + ',' + a + ')';
      }

      // 脑回纹理：撒一片短弧，让切片看起来是脑而不是一个灰盘子
      function gyriTex(c, cx, cy, rx, ry, n, seed, dA, lA) {
        for (var i = 0; i < n; i++) {
          var a = rnd(seed + i * 3.71) * Math.PI * 2;
          var rr = 0.20 + 0.76 * Math.sqrt(rnd(seed + i * 5.13));
          var x = cx + Math.cos(a) * rx * rr;
          var y = cy + Math.sin(a) * ry * rr;
          var L = rx * (0.05 + rnd(seed + i * 7.37) * 0.10);
          var rot = a + Math.PI / 2 + (rnd(seed + i * 9.91) - 0.5) * 1.7;
          c.strokeStyle = rnd(seed + i * 11.37) > 0.42 ? dA : lA;
          c.lineWidth = 0.9;
          c.beginPath();
          c.moveTo(x, y);
          c.quadraticCurveTo(x + Math.cos(rot + 0.75) * L * 0.8, y + Math.sin(rot + 0.75) * L * 0.8,
            x + Math.cos(rot) * L * 1.6, y + Math.sin(rot) * L * 1.6);
          c.stroke();
        }
      }

      // 横断面轮廓：额极略窄、颞叶外凸、枕极略宽
      function axialPath(c, cx, cy, rx, ry) {
        c.beginPath();
        c.moveTo(cx, cy - ry);
        c.bezierCurveTo(cx + rx * 0.58, cy - ry * 0.99, cx + rx * 0.94, cy - ry * 0.62, cx + rx * 0.99, cy + ry * 0.02);
        c.bezierCurveTo(cx + rx * 1.00, cy + ry * 0.62, cx + rx * 0.60, cy + ry * 1.00, cx, cy + ry * 1.00);
        c.bezierCurveTo(cx - rx * 0.60, cy + ry * 1.00, cx - rx * 1.00, cy + ry * 0.62, cx - rx * 0.99, cy + ry * 0.02);
        c.bezierCurveTo(cx - rx * 0.94, cy - ry * 0.62, cx - rx * 0.58, cy - ry * 0.99, cx, cy - ry);
        c.closePath();
      }

      // 冠状面轮廓：顶部圆隆、颞叶向下收、底部平
      function coronalPath(c, cx, cy, rx, ry) {
        c.beginPath();
        c.moveTo(cx, cy - ry);
        c.bezierCurveTo(cx + rx * 0.84, cy - ry * 0.97, cx + rx * 1.00, cy - ry * 0.40, cx + rx * 0.95, cy + ry * 0.20);
        c.bezierCurveTo(cx + rx * 0.90, cy + ry * 0.60, cx + rx * 0.54, cy + ry * 0.84, cx, cy + ry * 0.82);
        c.bezierCurveTo(cx - rx * 0.54, cy + ry * 0.84, cx - rx * 0.90, cy + ry * 0.60, cx - rx * 0.95, cy + ry * 0.20);
        c.bezierCurveTo(cx - rx * 1.00, cy - ry * 0.40, cx - rx * 0.84, cy - ry * 0.97, cx, cy - ry);
        c.closePath();
      }

      function drawAxial(c, layer, t, s) {
        var W = c.canvas.width, H = c.canvas.height, cx = W / 2, cy = H * 0.5;
        c.clearRect(0, 0, W, H);
        c.fillStyle = '#070605'; c.fillRect(0, 0, W, H);

        // 层面越高，切面越小（头顶 → 颅底）
        var k = 0.50 + 0.50 * Math.sin(Math.PI * clamp(t * 0.90 + 0.08, 0, 1));
        var rx = W * 0.33 * k, ry = H * 0.37 * k;

        // 灰质整块，白质内缩一圈
        axialPath(c, cx, cy, rx, ry);
        c.fillStyle = tone(s.gm, 0.94); c.fill();
        axialPath(c, cx, cy, rx * 0.93, ry * 0.93);
        c.fillStyle = tone(s.wm, 0.96); c.fill();

        // 脑沟：从表面向内扎的短线
        c.lineWidth = 0.9;
        c.strokeStyle = tone(0.10, 0.46);
        for (var i = 0; i < 18; i++) {
          var a = (i / 18) * Math.PI * 2 + (rnd(i + 5) - 0.5) * 0.14;
          var d = 0.915 + rnd(i + 9) * 0.05;
          c.beginPath();
          c.moveTo(cx + Math.cos(a) * rx * 0.985, cy + Math.sin(a) * ry * 0.985);
          c.lineTo(cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d);
          c.stroke();
        }

        gyriTex(c, cx, cy, rx * 0.94, ry * 0.94, 46, 3, tone(0.12, 0.40), tone(0.86, 0.16));

        // 纵裂（前半段）
        c.strokeStyle = tone(0.08, 0.78); c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(cx, cy - ry * 0.99); c.lineTo(cx, cy - ry * 0.16); c.stroke();

        // 侧脑室：一对前角 + 体部
        if (t > 0.24 && t < 0.90) {
          var vk = Math.sin((t - 0.24) / 0.66 * Math.PI);
          [-1, 1].forEach(function (sg) {
            c.fillStyle = tone(s.csf, 0.30 + 0.66 * vk);
            c.beginPath();
            c.moveTo(cx + sg * rx * 0.04, cy - ry * 0.04);
            c.quadraticCurveTo(cx + sg * rx * 0.22, cy - ry * 0.34 * vk, cx + sg * rx * 0.32, cy - ry * 0.10 * vk);
            c.quadraticCurveTo(cx + sg * rx * 0.28, cy + ry * 0.16 * vk, cx + sg * rx * 0.13, cy + ry * 0.20 * vk);
            c.quadraticCurveTo(cx + sg * rx * 0.06, cy + ry * 0.06, cx + sg * rx * 0.04, cy - ry * 0.04);
            c.fill();
          });
          // 第三脑室
          c.fillStyle = tone(s.csf, 0.22 + 0.5 * vk);
          c.beginPath();
          c.ellipse(cx, cy + ry * 0.10, rx * 0.022, ry * 0.13 * vk, 0, 0, Math.PI * 2);
          c.fill();
        }

        // 皮层缘：T2 上脑沟里积的脑脊液会勾出一条亮边
        c.strokeStyle = tone(s.csf, 0.08 + 0.34 * s.csb);
        c.lineWidth = 1.2;
        axialPath(c, cx, cy, rx * 0.99, ry * 0.99); c.stroke();
      }

      function drawCoronal(c, layer, t, s) {
        var W = c.canvas.width, H = c.canvas.height, cx = W / 2, cy = H * 0.50;
        c.clearRect(0, 0, W, H);
        c.fillStyle = '#070605'; c.fillRect(0, 0, W, H);

        var k = 0.56 + 0.44 * Math.sin(Math.PI * clamp(t * 0.88 + 0.10, 0, 1));
        var rx = W * 0.30 * k, ry = H * 0.34 * k;

        coronalPath(c, cx, cy, rx, ry);
        c.fillStyle = tone(s.gm, 0.94); c.fill();
        coronalPath(c, cx, cy, rx * 0.92, ry * 0.92);
        c.fillStyle = tone(s.wm, 0.96); c.fill();

        // 脑沟：集中在顶部半球
        c.lineWidth = 0.9;
        c.strokeStyle = tone(0.10, 0.44);
        for (var i = 0; i < 15; i++) {
          var a = -Math.PI * 0.86 + (i / 14) * Math.PI * 1.72 + (rnd(i + 3) - 0.5) * 0.09;
          var d = 0.91 + rnd(i + 7) * 0.05;
          c.beginPath();
          c.moveTo(cx + Math.cos(a) * rx * 0.985, cy + Math.sin(a) * ry * 0.985);
          c.lineTo(cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d);
          c.stroke();
        }

        gyriTex(c, cx, cy, rx * 0.93, ry * 0.93, 40, 17, tone(0.12, 0.38), tone(0.86, 0.15));

        // 纵裂 + 大脑镰
        c.strokeStyle = tone(0.08, 0.76); c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(cx, cy - ry * 0.99); c.lineTo(cx, cy + ry * 0.06); c.stroke();

        // 侧脑室：一对向下的斜裂 + 第三脑室
        if (t > 0.28 && t < 0.92) {
          var vk = Math.sin((t - 0.28) / 0.64 * Math.PI);
          [-1, 1].forEach(function (sg) {
            c.fillStyle = tone(s.csf, 0.28 + 0.62 * vk);
            c.beginPath();
            c.moveTo(cx + sg * rx * 0.05, cy - ry * 0.22 * vk);
            c.quadraticCurveTo(cx + sg * rx * 0.34 * vk, cy - ry * 0.26 * vk,
              cx + sg * rx * 0.30 * vk, cy + ry * 0.06 * vk);
            c.quadraticCurveTo(cx + sg * rx * 0.18 * vk, cy + ry * 0.16 * vk,
              cx + sg * rx * 0.05, cy - ry * 0.22 * vk);
            c.fill();
          });
          c.fillStyle = tone(s.csf, 0.24 + 0.5 * vk);
          c.beginPath();
          c.ellipse(cx, cy + ry * 0.02, rx * 0.02, ry * 0.12 * vk, 0, 0, Math.PI * 2);
          c.fill();
        }

        // 颞叶内侧：海马只是两条淡弧，别画成圆点（会像眼睛）
        c.strokeStyle = tone(0.22, 0.30);
        c.lineWidth = 1.4;
        [-1, 1].forEach(function (sg) {
          c.beginPath();
          c.ellipse(cx + sg * rx * 0.50, cy + ry * 0.30, rx * 0.17, ry * 0.10, sg * 0.42, 0.4, Math.PI * 1.5);
          c.stroke();
        });

        c.strokeStyle = tone(s.csf, 0.07 + 0.30 * s.csb);
        c.lineWidth = 1.2;
        coronalPath(c, cx, cy, rx * 0.99, ry * 0.99); c.stroke();
      }

      function drawSagittal(c, layer, t, s) {
        var W = c.canvas.width, H = c.canvas.height, cx = W * 0.455, cy = H * 0.44;
        c.clearRect(0, 0, W, H);
        c.fillStyle = '#070605'; c.fillRect(0, 0, W, H);

        var rx = W * 0.315, ry = H * 0.315;
        // 越靠近中线，中线结构越清楚
        var near = 1 - Math.min(1, Math.abs(t - 0.5) * 2.2);
        if (near < 0.06) near = 0.06;

        // 大脑半球：略呈卵形，额极在左、枕极在右
        c.beginPath(); c.ellipse(cx, cy, rx, ry, -0.05, 0, Math.PI * 2);
        c.fillStyle = tone(s.gm, 0.94); c.fill();
        c.beginPath(); c.ellipse(cx, cy, rx * 0.93, ry * 0.91, -0.05, 0, Math.PI * 2);
        c.fillStyle = tone(s.wm, 0.97); c.fill();

        // 脑回纹理
        gyriTex(c, cx, cy - ry * 0.06, rx * 0.93, ry * 0.90, 42, 29, tone(0.12, 0.36), tone(0.86, 0.14));

        // 小脑幕：把小脑和枕叶分开
        c.strokeStyle = tone(0.08, 0.62); c.lineWidth = 2.2;
        c.beginPath();
        c.moveTo(cx + rx * 0.12, cy + ry * 0.64);
        c.quadraticCurveTo(cx + rx * 0.56, cy + ry * 0.48, cx + rx * 0.86, cy + ry * 0.26);
        c.stroke();

        // 小脑：半球 + 横向叶片
        var cbx = cx + rx * 0.44, cby = cy + ry * 0.80;
        c.beginPath(); c.ellipse(cbx, cby, rx * 0.40, ry * 0.27, 0.10, 0, Math.PI * 2);
        c.fillStyle = tone(s.gm * 0.95, 0.92); c.fill();
        c.strokeStyle = tone(0.12, 0.40); c.lineWidth = 0.9;
        for (var j = 1; j <= 4; j++) {
          c.beginPath();
          c.ellipse(cbx, cby, rx * 0.40 * (0.30 + j * 0.17), ry * 0.27 * (0.30 + j * 0.17),
            0.10, Math.PI * 1.08, Math.PI * 1.94);
          c.stroke();
        }

        // 脑干：中脑 → 脑桥 → 延髓，往下接颈髓
        c.fillStyle = tone(s.wm * 0.90, 0.94);
        c.beginPath();
        c.moveTo(cx + rx * 0.10, cy + ry * 0.28);
        c.bezierCurveTo(cx + rx * 0.26, cy + ry * 0.56, cx + rx * 0.24, cy + ry * 0.84, cx + rx * 0.10, cy + ry * 1.06);
        c.lineTo(cx - rx * 0.04, cy + ry * 1.02);
        c.bezierCurveTo(cx + rx * 0.02, cy + ry * 0.78, cx + rx * 0.02, cy + ry * 0.50, cx - rx * 0.05, cy + ry * 0.28);
        c.fill();

        // 胼胝体：一道 C 形亮弧（T1 上是白质，最亮）
        c.strokeStyle = tone(s.wm + 0.16, (0.28 + 0.60 * near).toFixed(3));
        c.lineWidth = 3.2;
        c.beginPath();
        c.ellipse(cx - rx * 0.01, cy - ry * 0.02, rx * 0.36, ry * 0.24, -0.05, Math.PI * 1.02, Math.PI * 1.98);
        c.stroke();

        // 侧脑室：胼胝体下方的细缝
        c.fillStyle = tone(s.csf, 0.26 + 0.48 * near);
        c.beginPath();
        c.ellipse(cx + rx * 0.17, cy - ry * 0.15, rx * 0.12, ry * 0.045, -0.1, 0, Math.PI * 2);
        c.fill();

        // 第四脑室：脑干与小脑之间
        c.beginPath();
        c.ellipse(cx + rx * 0.20, cy + ry * 0.60, rx * 0.05, ry * 0.085, 0.34, 0, Math.PI * 2);
        c.fill();
      }

      function drawAllViews(layer, t) {
        var s = SEQ[P.seq];
        drawAxial(viewCanvases.ax.getContext('2d'), layer, t, s);
        drawCoronal(viewCanvases.co.getContext('2d'), layer, t, s);
        drawSagittal(viewCanvases.sa.getContext('2d'), layer, t, s);
      }

      /* ---------------- 当前层卡片 ---------------- */

      function layerToMm(t) {
        var s = SEQ[P.seq];
        return (t - 0.5) * s.n * parseFloat(s.thick);
      }

      function renderCard(layer, t) {
        var s = SEQ[P.seq];
        elCard.innerHTML =
          '<h5>SLICE ' + String(layer).padStart(2, '0') + ' / ' + String(s.n).padStart(2, '0') + ' · ' + s.plane + '</h5>' +
          '<div class="bh-row"><span>序列 SERIES</span><b>' + s.name + '</b></div>' +
          '<div class="bh-row"><span>层位 POSITION</span><b>' + (layerToMm(t) >= 0 ? '+' : '') + layerToMm(t).toFixed(1) + ' mm</b></div>' +
          '<div class="bh-row"><span>层厚 THICK / GAP</span><b>' + s.thick + ' / 1.5 mm</b></div>' +
          '<div class="bh-row"><span>TR / TE</span><b>' + s.tr + ' / ' + s.te + ' ms</b></div>' +
          '<div class="bh-row"><span>FOV / 矩阵</span><b>' + s.fov + ' · 512²</b></div>' +
          '<div class="bh-row"><span>加权 WEIGHTING</span><b style="color:#45e6f5">' + s.short + '</b></div>';
      }

      function renderMeta(layer, t) {
        var s = SEQ[P.seq];
        VIEW_DEF.forEach(function (d) {
          var mm = elSlices.querySelector('[data-mm="' + d.id + '"]');
          var ly = elSlices.querySelector('[data-lay="' + d.id + '"]');
          if (mm) mm.textContent = 'mm ' + (layerToMm(t) >= 0 ? '+' : '') + layerToMm(t).toFixed(1);
          if (ly) ly.textContent = '#' + String(layer).padStart(2, '0');
        });
        elSeq.textContent = '05';
        elLay.textContent = '87';
        elThk.innerHTML = s.thick + '<i>mm</i>';
        elTr.textContent = s.tr;
        elTe.textContent = s.te;
      }

      /* ---------------- 3D 标注 ---------------- */

      var marks = MARKS.map(function (m) {
        var el = document.createElement('div');
        el.className = 'bh-ld';
        el.innerHTML = '<div class="bh-lb">' + m.name + '<b>' + m.en + '</b><i>' + m.seg + '</i></div>' +
          '<svg width="1" height="1"><line x1="0" y1="0" x2="0" y2="0"/><circle cx="0" cy="0" r="2.2"/></svg>';
        elLabels.appendChild(el);
        var anchor = new THREE.Object3D();
        anchor.position.fromArray(m.p);
        anchor.position.multiplyScalar(R / 7.2);
        root.add(anchor);
        return {
          def: m, el: el, anchor: anchor,
          lb: el.querySelector('.bh-lb'),
          line: el.querySelector('line'),
          dot: el.querySelector('circle')
        };
      });

      var _v = new THREE.Vector3(), _p = new THREE.Vector3();
      function updateMarks() {
        if (!P.labels) { elLabels.style.display = 'none'; return; }
        elLabels.style.display = '';
        var W = stageEl ? stageEl.clientWidth : 1000;
        var H = stageEl ? stageEl.clientHeight : 700;
        for (var i = 0; i < marks.length; i++) {
          var mk = marks[i];
          mk.anchor.getWorldPosition(_v);
          _p.copy(_v).project(camera);
          var ax = (_p.x * 0.5 + 0.5) * W;
          var ay = (-_p.y * 0.5 + 0.5) * H;
          // 右栏三视图是实体面板，标签不许钻进去（钻进去会被切一半）
          var halfW = (mk.lb.offsetWidth || 120) / 2 + 10;
          var maxLx = W - 110;
          if (elSlices && elSlices.offsetParent && elSlices.offsetLeft > 0) {
            maxLx = Math.min(maxLx, elSlices.offsetLeft - halfW);
          }
          var lx = clamp(ax + mk.def.ox, 96, maxLx);
          // 上边界 224：KPI 数字行占到 209，标注再往上会压住数字
          var ly = clamp(ay + mk.def.oy, 224, H - 96);
          mk.lb.style.transform = 'translate(-50%,-50%) translate(' + (lx - ax) + 'px,' + (ly - ay) + 'px)';
          mk.el.style.transform = 'translate(' + ax.toFixed(1) + 'px,' + ay.toFixed(1) + 'px)';
          mk.line.setAttribute('x1', 0); mk.line.setAttribute('y1', 0);
          mk.line.setAttribute('x2', (lx - ax).toFixed(1));
          mk.line.setAttribute('y2', (ly - ay).toFixed(1));
          mk.dot.setAttribute('cx', 0); mk.dot.setAttribute('cy', 0);
        }
      }

      /* ---------------- 状态与动画 ---------------- */

      var clock = 0;
      var tourOn = false;       // 讲解模式开关（用于淡出底部 HUD）
      var scanT = 0.5;          // 0..1，扫描位置
      var lastLayer = -1;
      var curSeq = P.seq;

      function applyPanel() {
        hud.classList.toggle('off', !P.panel);
      }

      function applySeq(v) {
        P.seq = v;
        curSeq = v;
        lastLayer = -1;
      }

      function refresh(force) {
        var s = SEQ[P.seq];
        var layer = clamp(Math.round(scanT * (s.n - 1)) + 1, 1, s.n);
        if (!force && layer === lastLayer) return;
        lastLayer = layer;
        drawAllViews(layer, scanT);
        renderCard(layer, scanT);
        renderMeta(layer, scanT);
      }

      applyPanel();
      setParamSeq('t2');
      refresh(true);

      function setParamSeq(v) {
        if (!SEQ[v]) return;
        applySeq(v);
        refresh(true);
      }

      /* ---------------- 讲解 ---------------- */

      function tourSeq(v) {
        setParamSeq(v);
        if (HL.ui && HL.ui.sync) HL.ui.sync('seq', v);
      }

      var tour = HL.Tour(ctx);
      tour.load([
        {
          t: '一、这台机器读的是水',
          d: '这是本人 2026 年 10 月的一次头颅 MRI 平扫：GE 3.0T，5 个序列共 87 层，层厚 5 毫米。它不拍「照片」，而是测量体内氢质子在磁场里的共振信号——不同组织里的水含量不同，信号就不同。整颗脑被切成 87 张切片，每张都是一次「听水说话」。',
          exp: '看那条从头顶缓缓下移的琥珀光带——那就是当前的扫描层。',
          cam: [[0, 3.2, 32], [0, 0.2, 0]],
          pulse: null
        },
        {
          t: '二、T2 加权：水是亮的',
          d: 'T2 序列（TR 4351 / TE 98.2 ms）里，脑脊液是亮白色的。所以侧脑室里那两片亮区最好认，脑沟里也积着亮线。含水量高的病变——水肿、炎症、脱髓鞘——同样会显白，这是它最主要的用途。',
          exp: '右侧三视图的 AXIAL 面板，就是这一层在 T2 下的样子。',
          cam: [[7.2, 3.6, 29], [0, 0.2, 0]],
          pulse: [1.6, 1.0, 0.6], r: 2.6,
          apply: function () { tourSeq('t2'); }
        },
        {
          t: '三、FLAIR：把水压下去',
          d: '自由水在 T2 上太亮，会盖住紧挨着它的白质病变。FLAIR 用 8800 ms 的长 TR 先把脑脊液信号压黑，剩下的白质就干净了——所以它是找脱髓鞘、腔隙灶最敏感的常规序列。注意三视图里脑室从白变黑了。',
          exp: '切到 FLAIR，对比 AXIAL 面板里脑室的明暗变化。',
          cam: [[-7.2, 4.2, 29], [0, 0.2, 0]],
          pulse: [0, 0.6, 0], r: 3.0,
          apply: function () { tourSeq('flair'); }
        },
        {
          t: '四、T1 与矢状位：看解剖',
          d: 'T1（TR 1710 / TE 9.3）里白质亮、灰质暗、脑脊液黑，灰白质对比最清楚，是看解剖和出血亚期的首选。再补一组矢状位 T1（17 层、层厚 6 mm），中线结构就摊开了：胼胝体、脑干、小脑与颈髓交界，一屏看完。',
          exp: '点「矢状位」，看 SAGITTAL 面板里的胼胝体弧。',
          cam: [[3.2, 1.6, 31], [0, 0.2, 0]],
          pulse: null,
          apply: function () { tourSeq('sag'); }
        },
        {
          t: '五、四个结构，四种职能',
          d: '胼胝体是一束约两亿根神经纤维，把左右半球连成一台机器；侧脑室里流动的脑脊液缓冲撞击、带走代谢废物；小脑只占体积十分之一，却装着一半以上的神经元，管平衡与熟练动作；脑干往下接着脊髓，呼吸、心跳、觉醒都写在这几厘米里。',
          exp: '拖动旋转，从侧面看胼胝体那道 C 形弧。',
          cam: [[2.6, 2.2, 30], [0, 0.2, 0]],
          pulse: [0, 1.6, -0.2], r: 3.2,
          apply: function () { tourSeq('t2'); }
        },
        {
          t: '六、读片结论：这一次是正常的',
          d: 'AI 辅助读片给出的结论是：脑实质未见明确占位、出血或异常信号；中线居中；脑室、脑沟在 37 岁年龄组的正常范围；后颅窝与鼻窦乳突均未见异常。但必须说明局限——这是 5 毫米层厚的常规平扫，没有 DWI、没有增强、没有 MRA，对超早期梗死、垂体微腺瘤、血管病变的判断有限，最终以放射科医师的正式报告为准。',
          exp: '退出讲解（✕）后，左下角的 FINDINGS 面板会列出这份报告的六条所见。',
          cam: [[0, 2.6, 31], [0, 0.2, 0]],
          pulse: null,
          apply: function () { tourSeq('t2'); }
        }
      ]);

      /* ---------------- 返回 ---------------- */

      return {
        // 只读状态（回归脚本用）
        _brainState: function () {
          return {
            seq: P.seq, layer: lastLayer, scanT: +scanT.toFixed(3),
            labels: P.labels, panel: P.panel, scan: P.scan, spin: P.spin,
            marks: marks.length,
            calls: ctx.renderer.info.render.calls,
            tris: ctx.renderer.info.render.triangles
          };
        },

        update: function (dt, tt) {
          clock += dt;

          if (P.scan) {
            scanT += dt * 0.085 * P.speed;
            if (scanT > 1) scanT -= 1;
          } else {
            // 手动层面滑杆：0..20 映射到 0..1
            var s0 = SEQ[P.seq];
            scanT = clamp(P.slice / Math.max(1, s0.n - 1), 0, 1);
          }

          var y = lerp(-R * 0.72, R * 1.02, scanT);
          scanMat.uniforms.uY.value = y;
          scanGroup.position.y = y;
          scanGroup.rotation.y = clock * 0.12;

          if (P.spin) root.rotation.y += dt * 0.045;

          // 内部结构呼吸
          inner.children.forEach(function (o, i) {
            if (o.material) o.material.opacity = 0.55 + 0.35 * Math.sin(clock * 1.4 + i * 0.7);
          });

          var dp = dust.geometry.attributes.position.array;
          for (var i = 0; i < DUST; i++) {
            dp[i * 3 + 1] += dspd[i] * dt * 0.35;
            if (dp[i * 3 + 1] > 22) dp[i * 3 + 1] = -22;
          }
          dust.geometry.attributes.position.needsUpdate = true;

          refresh(false);
          updateMarks();
          tour.update(dt, tt || 0, function () { });

          // 讲解时旁白卡会盖住左下 FINDINGS 与底部三块面板，整块淡出，画面只留旁白
          var ton = tour.active();
          if (ton !== tourOn) { tourOn = ton; hud.classList.toggle('tour-on', ton); }
        },

        setParam: function (key, v) {
          if (key === 'tour') { tour.toggle(); return; }
          P[key] = v;
          if (key === 'seq') {
            setParamSeq(v);
            if (HL.ui && HL.ui.sync) HL.ui.sync('seq', v);
            return;
          }
          if (key === 'panel') { applyPanel(); return; }
          if (key === 'scan') {
            scanMat.uniforms.uOp.value = v ? 0.26 : 0.0;
            discMat.opacity = v ? 0.012 : 0.0;
            if (!v) P.slice = Math.round(scanT * (SEQ[P.seq].n - 1));
          }
          if (key === 'slice' && v !== undefined) scanT = clamp(v / Math.max(1, SEQ[P.seq].n - 1), 0, 1);
          refresh(true);
        },

        onClick: function (ndc) {
          // 点脑表面：切到当前层参数并轻推一下扫描位置（与其它场景一致的轻交互）
          var ray = new THREE.Raycaster();
          ray.setFromCamera({ x: ndc.x, y: ndc.y }, camera);
          var hit = ray.intersectObject(brain, false);
          if (hit.length) {
            var py = hit[0].point.y;
            scanT = clamp((py + R * 0.72) / (R * 1.74), 0, 1);
            refresh(true);
          }
        },

        dispose: function () {
          if (hud.parentNode) hud.parentNode.removeChild(hud);
          root.traverse(function (o) {
            if (o.geometry) o.geometry.dispose();
            if (o.material) {
              if (Array.isArray(o.material)) o.material.forEach(function (m) { m.dispose(); });
              else o.material.dispose();
            }
          });
          scene.remove(root);
          scene.remove(dust);
        }
      };
    }
  });

  /* 测试钩子：只读状态，供回归脚本断言 */
  global.__BRAIN = {
    state: function () {
      var inst = HL.manager && HL.manager.inst;
      if (!inst || !inst._brainState) return null;
      return inst._brainState();
    }
  };
})(window);
