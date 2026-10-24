/**
 * 场景：动物细胞（三维剖面 · 显微摄影质感）
 *
 * 视觉目标：高精度剖面渲染 —— 细胞核与核仁、内质网、高尔基体、线粒体、溶酶体、核糖体
 *   按真实细胞的相对位置与尺度分布；细胞膜用磷脂双分子层特写单独呈现；
 *   细胞质是半透明胶质，配合菲涅耳边缘光伪造次表面散射，柔和体积光 + 景深虚化。
 *
 * 实现要点：
 *  - 剖面用「裁剪平面」实现（renderer.localClippingEnabled），切面补一张
 *    中间通透、边缘发亮的胶质圆盘 + 双层膜的切边圆环，才读得出"切开"而不是"破了个洞"。
 *  - 所有小零件（核孔、嵴、溶酶体、细胞骨架、磷脂分子）都用 mergeParts 合并成单次 draw call。
 *  - 景深同样靠三层伪造：远 bokeh 光斑 + 屏幕暗角 + 近处柔光。
 */
HL.registerScene({
  id: 'animalcell',
  name: '动物细胞',
  short: '三维剖面 · 细胞器与膜结构',
  icon: '🔬',
  fov: 42,
  minDistance: 2.0,
  maxDistance: 90,
  desc: '真核细胞的三维剖面：直径约 20 μm 的细胞里，细胞核（约 6 μm）占据中央，核仁在其中；内质网从核膜向外铺开，附着核糖体负责合成蛋白质；高尔基体分拣打包；线粒体供能；溶酶体负责降解。切面边缘与「细胞膜特写」视图可看清磷脂双分子层。',

  controls: [
    { type: 'button', key: 'tour', label: '📖 讲解模式' },
    {
      type: 'buttons', key: 'view', label: '观察位置', value: 'overview', options: [
        { label: '全景剖面', value: 'overview' },
        { label: '细胞核', value: 'nucleus' },
        { label: '细胞膜', value: 'membrane' },
        { label: '线粒体', value: 'mito' }
      ]
    },
    { type: 'range', key: 'cut', label: '剖切角度', min: 0, max: 1, step: 0.01, value: 0, unit: '' },
    { type: 'check', key: 'labels', label: '结构标注', value: true },
    { type: 'check', key: 'light', label: '体积光与景深', value: true },
    { type: 'check', key: 'spin', label: '自动旋转', value: false }
  ],

  create: function (ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera, controls = ctx.controls;

    var P = { view: 'overview', cut: 0, labels: true, light: true, spin: false };

    var R = 10;                    // 细胞半径（世界单位）
    var NUCL = new THREE.Vector3(-1.3, 1.1, -2.2);   // 细胞核中心
    var NUCL_R = 3.15;

    /* ================= 通用工具 ================= */

    function mergeParts(parts) {
      var i, j, nV = 0, nI = 0;
      for (i = 0; i < parts.length; i++) {
        var g0 = parts[i].geom;
        nV += g0.attributes.position.count;
        nI += g0.index ? g0.index.count : g0.attributes.position.count;
      }
      var pos = new Float32Array(nV * 3), nor = new Float32Array(nV * 3), col = new Float32Array(nV * 3);
      var idx = new Uint32Array(nI);
      var vo = 0, io = 0, v = new THREE.Vector3(), cc = new THREE.Color();
      var nmat = new THREE.Matrix3();
      for (i = 0; i < parts.length; i++) {
        var p = parts[i], gg = p.geom, m = p.mat;
        nmat.getNormalMatrix(m);
        cc.set(p.color === undefined ? 0xffffff : p.color);
        var pa = gg.attributes.position, na = gg.attributes.normal;
        for (j = 0; j < pa.count; j++) {
          v.fromBufferAttribute(pa, j).applyMatrix4(m);
          pos[(vo + j) * 3] = v.x; pos[(vo + j) * 3 + 1] = v.y; pos[(vo + j) * 3 + 2] = v.z;
          if (na) v.fromBufferAttribute(na, j).applyMatrix3(nmat).normalize();
          else v.set(0, 1, 0);
          nor[(vo + j) * 3] = v.x; nor[(vo + j) * 3 + 1] = v.y; nor[(vo + j) * 3 + 2] = v.z;
          col[(vo + j) * 3] = cc.r; col[(vo + j) * 3 + 1] = cc.g; col[(vo + j) * 3 + 2] = cc.b;
        }
        if (gg.index) {
          for (j = 0; j < gg.index.count; j++) idx[io + j] = gg.index.getX(j) + vo;
          io += gg.index.count;
        } else {
          for (j = 0; j < pa.count; j++) idx[io + j] = vo + j;
          io += pa.count;
        }
        vo += pa.count;
      }
      var out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      out.setAttribute('color', new THREE.BufferAttribute(col, 3));
      out.setIndex(new THREE.BufferAttribute(idx, 1));
      return out;
    }

    var fresnelMats = [];
    function fresnel(color, power, intensity, side) {
      var m = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uPower: { value: power === undefined ? 2.2 : power },
          uInt: { value: intensity === undefined ? 0.9 : intensity }
        },
        vertexShader: [
          'varying vec3 vN; varying vec3 vV;',
          'void main(){',
          '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
          '  vN = normalize(normalMatrix * normal);',
          '  vV = normalize(-mv.xyz);',
          '  gl_Position = projectionMatrix * mv;',
          '}'
        ].join('\n'),
        fragmentShader: [
          'uniform vec3 uColor; uniform float uPower; uniform float uInt;',
          'varying vec3 vN; varying vec3 vV;',
          'void main(){',
          '  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower);',
          '  gl_FragColor = vec4(uColor * f * uInt, f * uInt);',
          '}'
        ].join('\n'),
        transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: side === undefined ? THREE.FrontSide : side
      });
      fresnelMats.push(m);
      return m;
    }

    function texCanvas(size) {
      var cv = document.createElement('canvas');
      cv.width = cv.height = size;
      return cv;
    }

    function bokehTexture(rgb) {
      var cv = texCanvas(128), c = cv.getContext('2d');
      var g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(' + rgb + ',0.40)');
      g.addColorStop(0.55, 'rgba(' + rgb + ',0.28)');
      g.addColorStop(0.82, 'rgba(' + rgb + ',0.60)');
      g.addColorStop(0.94, 'rgba(' + rgb + ',0.26)');
      g.addColorStop(1, 'rgba(' + rgb + ',0)');
      c.fillStyle = g; c.beginPath(); c.arc(64, 64, 64, 0, Math.PI * 2); c.fill();
      var t = new THREE.CanvasTexture(cv);
      t.minFilter = THREE.LinearFilter;
      return t;
    }

    // 实心柔边圆点：核糖体 / 尘埃这类「小颗粒」必须用这个，
    // bokehTexture 中心是透的（亮环），拿它当核糖体会渲成一堆小圆环
    function dotTexture(rgb) {
      var cv = texCanvas(64), c = cv.getContext('2d');
      var g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.30, 'rgba(' + rgb + ',0.95)');
      g.addColorStop(0.72, 'rgba(' + rgb + ',0.42)');
      g.addColorStop(1, 'rgba(' + rgb + ',0)');
      c.fillStyle = g; c.beginPath(); c.arc(32, 32, 32, 0, Math.PI * 2); c.fill();
      var t = new THREE.CanvasTexture(cv);
      t.minFilter = THREE.LinearFilter;
      return t;
    }

    // 背景：淡淡的细胞质基质（青蓝底 + 弥散光雾），不是纯黑
    function bgTexture() {
      var cv = texCanvas(512), c = cv.getContext('2d');
      var g = c.createRadialGradient(250, 200, 30, 256, 256, 420);
      g.addColorStop(0, '#0b3346');
      g.addColorStop(0.40, '#07202f');
      g.addColorStop(1, '#020a12');
      c.fillStyle = g; c.fillRect(0, 0, 512, 512);
      var g2 = c.createRadialGradient(150, 400, 20, 150, 400, 240);
      g2.addColorStop(0, 'rgba(150,60,140,0.22)');
      g2.addColorStop(1, 'rgba(150,60,140,0)');
      c.fillStyle = g2; c.fillRect(0, 0, 512, 512);
      var g3 = c.createRadialGradient(410, 120, 10, 410, 120, 200);
      g3.addColorStop(0, 'rgba(50,170,210,0.20)');
      g3.addColorStop(1, 'rgba(50,170,210,0)');
      c.fillStyle = g3; c.fillRect(0, 0, 512, 512);
      return new THREE.CanvasTexture(cv);
    }

    // 斑驳噪声贴图：给致密结构一点表面细节（软渲染下比 bumpMap 便宜得多）
    function mottleTexture(baseCss, spotCss) {
      var cv = texCanvas(256), c = cv.getContext('2d');
      c.fillStyle = baseCss; c.fillRect(0, 0, 256, 256);
      for (var i = 0; i < 1500; i++) {
        var x = Math.random() * 256, y = Math.random() * 256, r = 1.5 + Math.random() * 9;
        c.globalAlpha = 0.05 + Math.random() * 0.13;
        c.fillStyle = Math.random() > 0.45 ? spotCss : 'rgba(255,255,255,0.9)';
        c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      }
      c.globalAlpha = 1;
      var t = new THREE.CanvasTexture(cv);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    }

    // 切面胶质：中心几乎通透、边缘发亮 —— 读起来是「切开的细胞质」而不是一块不透明的板
    function cutFaceTexture() {
      var cv = texCanvas(512), c = cv.getContext('2d');
      var g = c.createRadialGradient(256, 256, 0, 256, 256, 256);
      g.addColorStop(0, 'rgba(90,190,220,0.03)');
      g.addColorStop(0.55, 'rgba(88,190,225,0.07)');
      g.addColorStop(0.86, 'rgba(120,225,255,0.22)');
      g.addColorStop(0.96, 'rgba(170,240,255,0.52)');
      g.addColorStop(1, 'rgba(190,245,255,0.0)');
      c.fillStyle = g; c.beginPath(); c.arc(256, 256, 256, 0, Math.PI * 2); c.fill();
      // 极淡的同心纹，暗示细胞质的层理
      c.strokeStyle = 'rgba(160,235,255,0.05)';
      for (var i = 1; i < 9; i++) {
        c.beginPath(); c.arc(256, 256, 24 + i * 26, 0, Math.PI * 2); c.stroke();
      }
      return new THREE.CanvasTexture(cv);
    }

    /* ================= 舞台 ================= */

    scene.background = bgTexture();
    scene.fog = new THREE.FogExp2(0x04101a, 0.0055);
    ctx.renderer.localClippingEnabled = true;

    var vig = document.createElement('div');
    vig.className = 'hl-vig';
    var stageEl = document.getElementById('stage');
    if (stageEl) stageEl.appendChild(vig);

    scene.add(new THREE.AmbientLight(0x9fd8ee, 0.24));
    var keyL = new THREE.DirectionalLight(0xe6f8ff, 1.45); keyL.position.set(12, 16, 14); scene.add(keyL);
    var rimL = new THREE.DirectionalLight(0xff8fd8, 0.75); rimL.position.set(-14, -3, -12); scene.add(rimL);
    var fillL = new THREE.DirectionalLight(0x3fd2ff, 0.55); fillL.position.set(-10, 8, 12); scene.add(fillL);
    var inside = new THREE.PointLight(0xa8f0ff, 1.9, 46, 1.7); inside.position.set(NUCL.x, NUCL.y, NUCL.z); scene.add(inside);

    /* ================= 裁剪平面（剖面） ================= */

    var clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
    var clipList = [clipPlane];

    function setCut(a) {
      // 绕 Y 轴旋转切面：a=0 时切面正对默认机位
      var ca = Math.cos(a * Math.PI * 2), sa = Math.sin(a * Math.PI * 2);
      clipPlane.normal.set(-sa, 0, -ca);
      clipPlane.constant = 0;
    }
    setCut(0);

    /* ================= 细胞主体 ================= */

    var cellGroup = new THREE.Group();
    scene.add(cellGroup);

    var G = {
      sphere: new THREE.SphereGeometry(1, 16, 12),
      cyl: (function () { var g = new THREE.CylinderGeometry(1, 1, 1, 8, 1, false); return g; })(),
      torus: new THREE.TorusGeometry(1, 0.14, 6, 18)
    };
    var QID = new THREE.Quaternion(), ONE = new THREE.Vector3(1, 1, 1);
    var YAX = new THREE.Vector3(0, 1, 0), ZAX = new THREE.Vector3(0, 0, 1);
    var _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

    function m4(pos, quat, scl) {
      return new THREE.Matrix4().compose(pos, quat || QID, scl || ONE);
    }
    function pushBall(parts, p, r, color, scl) {
      var s = scl || new THREE.Vector3(1, 1, 1);
      parts.push({ geom: G.sphere, mat: m4(p, QID, new THREE.Vector3(r * s.x, r * s.y, r * s.z)), color: color });
    }
    function pushCyl(parts, a, b, r, color) {
      _v2.subVectors(b, a);
      var len = _v2.length();
      if (len < 1e-6) return;
      var q = new THREE.Quaternion().setFromUnitVectors(YAX, _v2.clone().normalize());
      parts.push({ geom: G.cyl, mat: m4(a, q, new THREE.Vector3(r, len, r)), color: color });
    }

    var cellMats = [];
    var cellGeoms = [];

    function cellMesh(geom, mats) {
      var mesh = new THREE.Mesh(geom, mats);
      cellGroup.add(mesh);
      return mesh;
    }

    /* ---------- 1. 细胞膜（半透玻璃壳）与细胞质胶体 ---------- */

    // 玻璃 / 胶质材质：单趟绘制同时给出本体色、边缘光与透明度。
    // 比「Standard 透明壳 + 菲涅耳叠加壳」少一整屏混合填充 —— 软渲染下这是最关键的一步优化，
    // 同时支持 clippingPlanes（自定义着色器必须手动 include 裁剪片段才会被剖开）。
    function glassMat(base, rim, density, power, inten, side) {
      var m = new THREE.ShaderMaterial({
        uniforms: {
          uBase: { value: new THREE.Color(base) },
          uRim: { value: new THREE.Color(rim) },
          uDen: { value: density },
          uPow: { value: power },
          uInt: { value: inten }
        },
        vertexShader: [
          '#include <clipping_planes_pars_vertex>',
          'varying vec3 vN; varying vec3 vV;',
          'void main(){',
          '  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
          '  vN = normalize(normalMatrix * normal);',
          '  vV = normalize(-mvPosition.xyz);',
          '  gl_Position = projectionMatrix * mvPosition;',
          '  #include <clipping_planes_vertex>',
          '}'
        ].join('\n'),
        fragmentShader: [
          '#include <clipping_planes_pars_fragment>',
          'uniform vec3 uBase; uniform vec3 uRim;',
          'uniform float uDen; uniform float uPow; uniform float uInt;',
          'varying vec3 vN; varying vec3 vV;',
          'void main(){',
          '  #include <clipping_planes_fragment>',
          '  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPow);',
          '  vec3 col = uBase * (0.45 + 0.55 * f) + uRim * f * uInt;',
          '  float a = uDen * (0.30 + 0.70 * f);',
          '  gl_FragColor = vec4(col, a);',
          '}'
        ].join('\n'),
        transparent: true,
        depthWrite: false,
        side: side === undefined ? THREE.DoubleSide : side,
        clipping: true,
        clippingPlanes: clipList
      });
      fresnelMats.push(m);     // 统一在 dispose 里回收
      return m;
    }

    var memMat = glassMat(0x1d6f92, 0x9ff2ff, 0.42, 2.6, 1.10, THREE.DoubleSide);
    var gMemA = new THREE.SphereGeometry(R, 96, 64);
    cellGeoms.push(gMemA);
    cellMesh(gMemA, memMat);

    // 细胞质胶体：从内部看的一层薄雾（BackSide），给整个胞质一点体积感
    var gCyto = new THREE.SphereGeometry(R - 0.30, 40, 26);
    cellGeoms.push(gCyto);
    var cytoGlow = new THREE.Mesh(gCyto, glassMat(0x1f5c78, 0x86dcff, 0.30, 2.4, 0.80, THREE.BackSide));
    cellGroup.add(cytoGlow);

    /* ---------- 2. 切面：胶质圆盘 + 双层膜切边 ---------- */
    var cutGroup = new THREE.Group();
    scene.add(cutGroup);
    var cutTex = cutFaceTexture();
    var gCut = new THREE.CircleGeometry(R - 0.05, 96);
    var cutMat = new THREE.MeshBasicMaterial({
      map: cutTex, transparent: true, opacity: 0.72,
      depthWrite: false, side: THREE.DoubleSide
    });
    void gCut; void cutMat;   // 不再铺整片切面：开口应当是敞开的，切面的厚度由下面两圈膜切边表示

    var cutParts = [];
    // 切边：两圈细环表示膜的上下两层
    cutParts.push({
      geom: new THREE.TorusGeometry(R - 0.06, 0.075, 6, 120),
      mat: m4(new THREE.Vector3(0, 0, 0), QID, ONE), color: 0x9fd8f0
    });
    cutParts.push({
      geom: new THREE.TorusGeometry(R - 0.34, 0.055, 6, 120),
      mat: m4(new THREE.Vector3(0, 0, 0), QID, ONE), color: 0x8fd8ff
    });
    var gCutRing = mergeParts(cutParts);
    var cutRingMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.2, metalness: 0.1,
      emissive: 0x2f86a8, emissiveIntensity: 0.85, transparent: true, opacity: 0.55
    });
    cutGroup.add(new THREE.Mesh(gCutRing, cutRingMat));

    function orientCut() {
      // 切面法线朝向摄像机一侧（与裁剪法线相反）
      var n = clipPlane.normal.clone().negate();
      cutGroup.quaternion.setFromUnitVectors(ZAX, n);
    }
    orientCut();

    /* ---------- 3. 细胞核：双层核膜 + 核孔 + 核仁 + 染色质 ---------- */

    var nucGroup = new THREE.Group();
    nucGroup.position.copy(NUCL);
    cellGroup.add(nucGroup);

    // 核膜：双层核膜用两片玻璃壳表示（外层偏蓝紫，内层偏青）
    var gNucA = new THREE.SphereGeometry(NUCL_R, 56, 40);
    var gNucB = new THREE.SphereGeometry(NUCL_R - 0.26, 48, 34);
    cellGeoms.push(gNucA, gNucB);
    nucGroup.add(new THREE.Mesh(gNucA, glassMat(0x2b4fa8, 0xa8bcff, 0.52, 2.4, 1.15, THREE.DoubleSide)));
    nucGroup.add(new THREE.Mesh(gNucB, glassMat(0x1d6f92, 0x8fe8ff, 0.30, 2.8, 0.75, THREE.DoubleSide)));

    // 核孔：一圈小环嵌在核膜上（合并为单次绘制）
    var poreParts = [];
    var PORES = 96;
    for (var pi = 0; pi < PORES; pi++) {
      var ph = Math.acos(1 - 2 * (pi + 0.5) / PORES);
      var th = pi * 2.399963;                       // 黄金角 → 球面均匀分布
      var px = Math.sin(ph) * Math.cos(th), py = Math.cos(ph), pz = Math.sin(ph) * Math.sin(th);
      var pos = new THREE.Vector3(px, py, pz).multiplyScalar(NUCL_R + 0.02);
      var q = new THREE.Quaternion().setFromUnitVectors(ZAX, new THREE.Vector3(px, py, pz));
      poreParts.push({ geom: G.torus, mat: m4(pos, q, new THREE.Vector3(0.050, 0.050, 0.30)), color: 0x77a9c9 });
    }
    var gPores = mergeParts(poreParts);
    cellGeoms.push(gPores);
    var poreMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.35, metalness: 0.1,
      emissive: 0x14384c, emissiveIntensity: 0.6,
      transparent: true, opacity: 0.34, clippingPlanes: clipList
    });
    cellMats.push(poreMat);
    nucGroup.add(new THREE.Mesh(gPores, poreMat));

    // 核仁：致密小体，偏在核的一侧
    var nucleolusTex = mottleTexture("#c255a6", "#7a1f5e");
    var nucleolus = new THREE.Mesh(
      new THREE.SphereGeometry(1.05, 40, 28),
      new THREE.MeshStandardMaterial({
        color: 0xffd2ea, map: nucleolusTex, roughness: 0.62, metalness: 0.0,
        emissive: 0x2c0a20, emissiveIntensity: 0.45, transparent: true, opacity: 0.90, clippingPlanes: clipList
      })
    );
    nucleolus.position.set(0.55, 0.35, 0.32);
    nucGroup.add(nucleolus);

    // 染色质：核内一团纠缠的细线
    var chromatinMat = new THREE.MeshStandardMaterial({
      color: 0x9d84f0, roughness: 0.45, metalness: 0.05,
      emissive: 0x2f1c62, emissiveIntensity: 0.95,
      transparent: true, opacity: 0.52, depthWrite: false, clippingPlanes: clipList
    });
    cellMats.push(chromatinMat);
    var chromParts = [];
    var rndC = (function () { var s = 77771; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    for (var ci = 0; ci < 13; ci++) {
      var pts = [];
      var base = new THREE.Vector3(
        (rndC() - 0.5) * 2.6, (rndC() - 0.5) * 2.6, (rndC() - 0.5) * 2.6
      ).clampLength(0, 2.1);
      for (var si2 = 0; si2 < 11; si2++) {
        base.add(new THREE.Vector3((rndC() - 0.5) * 0.95, (rndC() - 0.5) * 0.95, (rndC() - 0.5) * 0.95));
        base.clampLength(0, 2.35);
        pts.push(base.clone());
      }
      var curve = new THREE.CatmullRomCurve3(pts);
      var tg = new THREE.TubeGeometry(curve, 44, 0.036, 5, false);
      // 染色质直接以自身几何合并（TubeGeometry 已带 index）
      chromParts.push({ geom: tg, mat: m4(new THREE.Vector3(), QID, ONE), color: 0xb9a2ff });
    }
    var gChrom = mergeParts(chromParts);
    cellGeoms.push(gChrom);
    nucGroup.add(new THREE.Mesh(gChrom, chromatinMat));

    /* ---------- 4. 内质网：核外铺开的波褶片层 + 附着核糖体 ---------- */

    var erGroup = new THREE.Group();
    cellGroup.add(erGroup);

    // 一片「扁平囊」（cisterna）：绕核的一段弧形板，径向与切向都带轻微起伏
    // 返回 { geom, matrix }，核糖体撒点复用同一个矩阵，保证贴在膜面上
    function cisterna(rIn, rOut, u0, uSpan, amp, waves, phase, rotX, rotZ, tiltY) {
      var NU = 56, NV = 7, pos = [], idx = [];
      var mx = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rotX, tiltY || 0, rotZ));
      function pt(uu, vv) {
        var rr = rIn + (rOut - rIn) * vv;
        var ripple = Math.sin(vv * 5.2 + phase) * 0.26;            // 径向起伏 → 褶皱感
        var wave = Math.sin(uu * waves + phase) * amp * (0.45 + 0.55 * vv);
        return new THREE.Vector3(Math.cos(uu) * (rr + ripple), wave, Math.sin(uu) * (rr + ripple));
      }
      for (var j2 = 0; j2 <= NV; j2++) {
        for (var i2 = 0; i2 <= NU; i2++) {
          var p2 = pt(u0 + uSpan * (i2 / NU), j2 / NV);
          pos.push(p2.x, p2.y, p2.z);
        }
      }
      for (var jj = 0; jj < NV; jj++) {
        for (var ii = 0; ii < NU; ii++) {
          var a = jj * (NU + 1) + ii, b = a + 1, c = a + NU + 1, d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      g.applyMatrix4(mx);
      g.translate(NUCL.x, NUCL.y, NUCL.z);
      return { geom: g, matrix: mx };
    }

    // 内质网是薄片状结构：用「边缘发光」的玻璃着色器反而更像膜，且省掉 6 个大面积 PBR 填充
    var erMat = glassMat(0x2f9cbc, 0x8fe6ff, 0.44, 1.8, 0.95, THREE.DoubleSide);

    var erRibo = [];
    // 六片粗面内质网扁囊：绕核分层铺开，彼此错开角度、倾角与起伏相位
    var ER_SPECS = [
      // rIn, rOut, u0,  uSpan, amp, waves, phase, rotX,  rotZ,  tiltY
      [3.35, 6.20, 0.15, 3.40, 0.42, 3.0, 0.0, 0.18, 0.10, 0.40],
      [3.45, 6.40, 3.30, 3.20, 0.40, 2.6, 1.2, -0.22, -0.15, -0.50],
      [3.80, 6.90, 1.10, 2.80, 0.36, 3.4, 2.1, 0.55, 0.30, 0.20],
      [4.10, 7.30, 4.05, 3.00, 0.34, 2.8, 3.4, -0.42, 0.22, 0.60],
      [4.35, 7.60, 2.30, 2.40, 0.30, 3.8, 4.6, 0.28, -0.45, -0.30],
      [3.60, 6.60, 5.40, 2.60, 0.38, 3.2, 5.5, -0.15, 0.40, -0.60],
      [3.20, 5.70, 0.95, 2.20, 0.34, 3.6, 0.8, 0.34, 0.25, 0.75],
      [3.30, 5.90, 2.05, 2.10, 0.32, 3.0, 2.6, -0.30, -0.28, -0.65],
      [3.55, 6.05, 3.85, 2.30, 0.30, 3.4, 4.1, 0.62, 0.18, 0.30],
      [3.95, 6.80, 5.05, 2.00, 0.28, 3.7, 5.9, -0.55, -0.20, -0.45]
    ];
    ER_SPECS.forEach(function (sp) {
      var c = cisterna(sp[0], sp[1], sp[2], sp[3], sp[4], sp[5], sp[6], sp[7], sp[8], sp[9]);
      cellGeoms.push(c.geom);
      erGroup.add(new THREE.Mesh(c.geom, erMat));

      // 附着核糖体：落在同一张参数面上（同一矩阵），看起来才是长在膜上
      for (var k = 0; k < 90; k++) {
        var uu = sp[2] + Math.random() * sp[3];
        var vv = 0.12 + Math.random() * 0.85;
        var rr = sp[0] + (sp[1] - sp[0]) * vv;
        var ripple = Math.sin(vv * 5.2 + sp[6]) * 0.26;
        var wave = Math.sin(uu * sp[5] + sp[6]) * sp[4] * (0.45 + 0.55 * vv);
        var lp = new THREE.Vector3(Math.cos(uu) * (rr + ripple), wave, Math.sin(uu) * (rr + ripple));
        lp.applyMatrix4(c.matrix);
        lp.x += NUCL.x; lp.y += NUCL.y; lp.z += NUCL.z;
        erRibo.push(lp);
      }
    });

    // 光面内质网：几根相连的细管
    var serMat = new THREE.MeshStandardMaterial({
      color: 0x2f9fc4, roughness: 0.4, metalness: 0.05,
      emissive: 0x083444, emissiveIntensity: 0.9,
      transparent: true, opacity: 0.30, clippingPlanes: clipList
    });
    cellMats.push(serMat);
    var rndS = (function () { var s = 13579; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    for (var si3 = 0; si3 < 5; si3++) {
      var sp = [], cur0 = new THREE.Vector3(
        NUCL.x + (rndS() - 0.5) * 6, NUCL.y + (rndS() - 0.5) * 5 + 1, NUCL.z + (rndS() - 0.5) * 5
      );
      for (var q2 = 0; q2 < 6; q2++) {
        cur0 = cur0.clone().add(new THREE.Vector3((rndS() - 0.5) * 2.4, (rndS() - 0.3) * 1.6, (rndS() - 0.5) * 2.4));
        sp.push(cur0);
      }
      var tgeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sp), 28, 0.075, 5, false);
      cellGeoms.push(tgeo);
      erGroup.add(new THREE.Mesh(tgeo, serMat));
    }

    /* ---------- 5. 高尔基体：叠层扁囊 + 出芽小泡 ---------- */

    var golgi = new THREE.Group();
    golgi.position.set(3.7, -1.4, -2.5);
    golgi.rotation.set(0.35, -0.5, 0.22);
    cellGroup.add(golgi);

    var golgiMat = new THREE.MeshStandardMaterial({
      color: 0xd06ac0, roughness: 0.30, metalness: 0.12,
      emissive: 0x5a1a52, emissiveIntensity: 1.5,
      transparent: true, opacity: 0.58, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: clipList
    });
    cellMats.push(golgiMat);
    var golgiGlowMat = new THREE.MeshStandardMaterial({
      color: 0x7fe0ff, roughness: 0.28, metalness: 0.1,
      emissive: 0x1d6a86, emissiveIntensity: 1.4,
      transparent: true, opacity: 0.6, clippingPlanes: clipList
    });
    cellMats.push(golgiGlowMat);

    for (var gi = 0; gi < 6; gi++) {
      var rr2 = 1.15 + gi * 0.13;
      var tg2 = new THREE.TorusGeometry(rr2, 0.115, 7, 44, Math.PI * 1.18);
      tg2.rotateX(Math.PI / 2);
      tg2.scale(1, 0.42, 1);
      tg2.translate(0, (gi - 2.5) * 0.35, 0);
      cellGeoms.push(tg2);
      golgi.add(new THREE.Mesh(tg2, gi % 2 ? golgiGlowMat : golgiMat));
    }
    // 出芽小泡
    var vesParts = [];
    for (var vi = 0; vi < 14; vi++) {
      var ang2 = rndS() * Math.PI * 2, rad2 = 1.3 + rndS() * 0.9;
      pushBall(vesParts, new THREE.Vector3(Math.cos(ang2) * rad2, (rndS() - 0.5) * 2.0, Math.sin(ang2) * rad2),
        0.08 + rndS() * 0.10, 0xffc2f0);
    }
    var gVes = mergeParts(vesParts);
    cellGeoms.push(gVes);
    var vesMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.3, metalness: 0.05,
      emissive: 0x6a2a5a, emissiveIntensity: 1.2, transparent: true, opacity: 0.85, clippingPlanes: clipList
    });
    cellMats.push(vesMat);
    golgi.add(new THREE.Mesh(gVes, vesMat));

    /* ---------- 6. 线粒体：外膜 + 内膜 + 板层状嵴 ---------- */

    var mitoGroup = new THREE.Group();
    cellGroup.add(mitoGroup);

    var mitoOuterMat = new THREE.MeshStandardMaterial({
      color: 0x37c8c0, roughness: 0.26, metalness: 0.14,
      emissive: 0x0e5a56, emissiveIntensity: 1.45,
      transparent: true, opacity: 0.34, depthWrite: false, clippingPlanes: clipList
    });
    var mitoInnerMat = new THREE.MeshStandardMaterial({
      color: 0xff9ad8, roughness: 0.34, metalness: 0.06,
      emissive: 0x7a245e, emissiveIntensity: 1.5,
      transparent: true, opacity: 0.40, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: clipList
    });
    // 嵴单独一份材质：比内膜更亮、更实 —— 否则透过外膜只看到一团粉色雾，读不出「板层」
    var cristaeMat = new THREE.MeshStandardMaterial({
      color: 0xba5f92, roughness: 0.55, metalness: 0.0,
      emissive: 0x3d1230, emissiveIntensity: 0.30,
      transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: clipList
    });
    cellMats.push(mitoOuterMat, mitoInnerMat, cristaeMat);

    var MITOS = [
      { p: new THREE.Vector3(4.9, 3.4, -3.2), len: 1.5, r: 0.62, rot: [0.4, 0.6, 0.9] },
      { p: new THREE.Vector3(-4.6, -3.6, -1.7), len: 1.9, r: 0.58, rot: [0.9, -0.3, 0.2] },
      { p: new THREE.Vector3(1.8, -4.9, -4.4), len: 1.3, r: 0.55, rot: [0.2, 1.2, -0.6] },
      { p: new THREE.Vector3(-5.4, 1.4, -4.6), len: 1.1, r: 0.5, rot: [1.2, 0.2, 0.4] },
      { p: new THREE.Vector3(5.6, -1.9, -4.9), len: 1.4, r: 0.56, rot: [0.5, -1.0, 0.3] },
      { p: new THREE.Vector3(-2.4, 4.6, -5.6), len: 1.2, r: 0.52, rot: [0.7, 0.4, -0.9] },
      { p: new THREE.Vector3(0.2, 2.6, -6.8), len: 1.1, r: 0.48, rot: [1.0, -0.7, 0.5] }
    ];
    var mitoAnchors = [];

    MITOS.forEach(function (mi) {
      var g2 = new THREE.Group();
      g2.position.copy(mi.p);
      g2.rotation.set(mi.rot[0], mi.rot[1], mi.rot[2]);
      mitoGroup.add(g2);

      var cap = new THREE.CapsuleGeometry(mi.r, mi.len, 6, 20);
      cellGeoms.push(cap);
      var mOuter = new THREE.Mesh(cap, mitoOuterMat);
      mOuter.renderOrder = 3;
      g2.add(mOuter);
      // 注：这里不加菲涅耳外壳 —— 自定义着色器不支持裁剪平面，剖切时会在切面前浮出一圈鬼影

      var capIn = new THREE.CapsuleGeometry(mi.r - 0.26, mi.len - 0.26, 6, 16);
      cellGeoms.push(capIn);
      var mInner = new THREE.Mesh(capIn, mitoInnerMat);
      mInner.renderOrder = 4;
      g2.add(mInner);

      // 嵴：沿轴排列的板层
      var cristae = [];
      var cc = 9;
      for (var k2 = 0; k2 < cc; k2++) {
        var ty = (k2 / (cc - 1) - 0.5) * mi.len * 0.92;
        var dg = new THREE.CylinderGeometry(mi.r - 0.32, mi.r - 0.32, 0.035, 18);
        cristae.push({
          geom: dg,
          mat: m4(new THREE.Vector3(0, ty, 0),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (k2 % 2 ? 0.34 : -0.34)),
            new THREE.Vector3(1, 1, 0.74)),
          color: k2 % 2 ? 0xffc2e8 : 0xf08fc8
        });
        cellGeoms.push(dg);
      }
      var gCri = mergeParts(cristae);
      cellGeoms.push(gCri);
      var mCri = new THREE.Mesh(gCri, cristaeMat);
      mCri.renderOrder = 5;      // 嵴永远最后画，保证透过两层膜也读得出来
      g2.add(mCri);
      mitoAnchors.push(mi.p.clone());
    });

    /* ---------- 7. 溶酶体 + 过氧化物酶体 ---------- */

    var lysoParts = [];
    var LYSO = [
      [new THREE.Vector3(2.4, 4.4, -2.6), 0.46],
      [new THREE.Vector3(-3.2, -2.0, -3.6), 0.38],
      [new THREE.Vector3(6.2, 1.2, -1.7), 0.42],
      [new THREE.Vector3(-2.2, 4.2, -4.2), 0.34],
      [new THREE.Vector3(0.6, -6.2, -2.4), 0.40],
      [new THREE.Vector3(-6.4, 0.2, -2.2), 0.36],
      [new THREE.Vector3(4.2, 2.6, -5.2), 0.32],
      [new THREE.Vector3(-1.4, -4.2, -5.6), 0.30]
    ];
    LYSO.forEach(function (l) {
      pushBall(lysoParts, l[0], l[1], 0xc46ae8);
      pushBall(lysoParts, l[0].clone().add(new THREE.Vector3(0.06, 0.05, 0.04)), l[1] * 0.62, 0xffa8f0);
    });
    var gLyso = mergeParts(lysoParts);
    cellGeoms.push(gLyso);
    var lysoMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.38, metalness: 0.06,
      emissive: 0x5a207e, emissiveIntensity: 1.55,
      transparent: true, opacity: 0.80, clippingPlanes: clipList
    });
    cellMats.push(lysoMat);
    cellGroup.add(new THREE.Mesh(gLyso, lysoMat));

    /* ---------- 8. 核糖体（游离）+ 细胞骨架 ---------- */

    var RIBO = 1100;
    var rPos = [], rCol = [];
    var rndR = (function () { var s = 24680; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    var guard = 0;
    while (rPos.length < RIBO * 3 && guard++ < RIBO * 12) {
      var rr3 = 2.2 + Math.pow(rndR(), 0.55) * (R - 1.4);
      var u2 = rndR() * Math.PI * 2, v2 = Math.acos(2 * rndR() - 1);
      var p3 = new THREE.Vector3(
        rr3 * Math.sin(v2) * Math.cos(u2),
        rr3 * Math.cos(v2) * 0.86,
        rr3 * Math.sin(v2) * Math.sin(u2)
      );
      if (p3.distanceTo(NUCL) < NUCL_R + 0.45) continue;
      if (p3.z > -0.6) continue;      // 切面前方不撒点，否则像悬在开口里
      rPos.push(p3.x, p3.y, p3.z);
      var t2 = rndR();
      rCol.push(0.72 + t2 * 0.28, 0.90 + t2 * 0.10, 1.0);
    }
    // 附着在粗面内质网上的核糖体（偏品红）
    erRibo.forEach(function (p) {
      rPos.push(p.x, p.y, p.z);
      rCol.push(1.0, 0.62, 0.86);
    });
    var gRibo = new THREE.BufferGeometry();
    gRibo.setAttribute('position', new THREE.Float32BufferAttribute(rPos, 3));
    gRibo.setAttribute('color', new THREE.Float32BufferAttribute(rCol, 3));
    cellGeoms.push(gRibo);
    var riboTex = dotTexture('215,245,255');
    var riboMat = new THREE.PointsMaterial({
      size: 0.115, map: riboTex, vertexColors: true,
      transparent: true, opacity: 0.88, depthWrite: false,
      sizeAttenuation: true, alphaTest: 0.02, clippingPlanes: clipList
    });
    cellMats.push(riboMat);
    cellGroup.add(new THREE.Points(gRibo, riboMat));

    // 细胞骨架：贴着皮层分布的短纤维
    // 注意：早期版本用「一条弦贯穿全胞」（pA 到 -pA），在细胞核特写里就成了一整张铁丝网，
    // 又假又抢戏；真实应力纤维是外周一小段一小段的，且不会穿过细胞核。
    var cytoMats = new THREE.MeshStandardMaterial({
      color: 0x49c0e0, roughness: 0.5, metalness: 0.0,
      emissive: 0x0a3f52, emissiveIntensity: 0.7,
      transparent: true, opacity: 0.15, clippingPlanes: clipList
    });
    cellMats.push(cytoMats);
    var fibParts = [];
    var rndF = (function () { var s = 9182; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    function outsideNucleus(p) { return p.distanceTo(NUCL) > NUCL_R + 0.55; }
    for (var fi = 0; fi < 34; fi++) {
      var tries = 0, ok = false, fibCurve = null;
      while (!ok && tries++ < 8) {
        var u3 = rndF() * Math.PI * 2, v3 = Math.acos(2 * rndF() - 1);
        var dir3 = new THREE.Vector3(Math.sin(v3) * Math.cos(u3), Math.cos(v3) * 0.88, Math.sin(v3) * Math.sin(u3)).normalize();
        var r0 = 4.4 + rndF() * 3.9;
        var pA = dir3.clone().multiplyScalar(r0);
        var pB = dir3.clone().multiplyScalar(Math.min(9.3, r0 + 1.4 + rndF() * 2.4))
          .add(new THREE.Vector3((rndF() - 0.5) * 1.5, (rndF() - 0.5) * 1.5, (rndF() - 0.5) * 1.5));
        var pM = pA.clone().lerp(pB, 0.5)
          .add(new THREE.Vector3((rndF() - 0.5) * 1.1, (rndF() - 0.5) * 1.1, (rndF() - 0.5) * 1.1));
        if (!outsideNucleus(pA) || !outsideNucleus(pM) || !outsideNucleus(pB)) continue;
        fibCurve = new THREE.CatmullRomCurve3([pA, pM, pB]);
        ok = true;
      }
      if (!fibCurve) continue;
      var fibGeo = new THREE.TubeGeometry(fibCurve, 18, 0.026, 4, false);
      fibParts.push({ geom: fibGeo, mat: m4(new THREE.Vector3(), QID, ONE), color: 0x5fd8ff });
    }
    var gFib = mergeParts(fibParts);
    cellGeoms.push(gFib);
    cellGroup.add(new THREE.Mesh(gFib, cytoMats));

    /* ---------- 9. 细胞膜特写：磷脂双分子层 ---------- */

    var memGroup = new THREE.Group();
    memGroup.visible = false;
    scene.add(memGroup);

    var lipidParts = [];
    var NX = 13, NZ = 6, SP = 0.52, GAP = 1.02;
    var rndL = (function () { var s = 41421; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    for (var leaf = 0; leaf < 2; leaf++) {
      var sign = leaf === 0 ? 1 : -1;
      for (var ix = 0; ix < NX; ix++) {
        for (var iz = 0; iz < NZ; iz++) {
          var ox = (ix - (NX - 1) / 2) * SP + (rndL() - 0.5) * 0.07;
          var oz = (iz - (NZ - 1) / 2) * SP + (rndL() - 0.5) * 0.07;
          var hy = sign * GAP;
          // 磷脂头部
          pushBall(lipidParts, new THREE.Vector3(ox, hy, oz), 0.10,
            sign > 0 ? 0x6fd0ee : 0xe07ad0);
          // 两条疏水尾（略外撇）
          for (var tl = 0; tl < 2; tl++) {
            var splay = (tl ? 1 : -1) * 0.055;
            pushCyl(lipidParts,
              new THREE.Vector3(ox + splay * 0.2, hy - sign * 0.12, oz),
              new THREE.Vector3(ox + splay, sign * 0.015, oz + splay * 0.5),
              0.030, sign > 0 ? 0x4aa0c4 : 0xb8629e);
          }
        }
      }
    }
    var gLipid = mergeParts(lipidParts);
    var lipidMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.30, metalness: 0.10,
      emissive: 0x0e3448, emissiveIntensity: 0.9,
      transparent: true, opacity: 0.94
    });
    memGroup.add(new THREE.Mesh(gLipid, lipidMat));

    // 跨膜通道蛋白：贯穿双层的一根桶状结构 + 两端亲水环 + 中央发光的孔道
    var channelMat = new THREE.MeshStandardMaterial({
      color: 0x3fc4b8, roughness: 0.26, metalness: 0.20,
      emissive: 0x0d5a52, emissiveIntensity: 1.3,
      transparent: true, opacity: 0.78
    });
    var chanParts = [];
    var CHX = 0.95, CHZ = 0.25;
    // 蛋白桶壁：用 8 根竖柱围成一周（中空，才看得见孔道）
    for (var ci2 = 0; ci2 < 8; ci2++) {
      var ang3 = ci2 / 8 * Math.PI * 2;
      chanParts.push({
        geom: new THREE.CylinderGeometry(0.085, 0.085, 2.45, 8),
        mat: m4(new THREE.Vector3(CHX + Math.cos(ang3) * 0.36, 0, CHZ + Math.sin(ang3) * 0.36), QID, ONE),
        color: 0x4fd0c2
      });
    }
    // 两端亲水环
    [1.16, -1.16].forEach(function (yy) {
      chanParts.push({
        geom: G.torus,
        mat: m4(new THREE.Vector3(CHX, yy, CHZ),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
          new THREE.Vector3(0.40, 0.40, 0.55)),
        color: 0x9ff0e2
      });
    });
    var gChan = mergeParts(chanParts);
    memGroup.add(new THREE.Mesh(gChan, channelMat));

    // 孔道：一根内发光细芯
    var poreMat = new THREE.MeshBasicMaterial({
      color: 0xcaf7ff, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    var gPore = new THREE.CylinderGeometry(0.13, 0.13, 2.3, 10, 1, true);
    var pore = new THREE.Mesh(gPore, poreMat);
    pore.position.set(CHX, 0, CHZ);
    memGroup.add(pore);

    // 特写用的柔光背板，避免磷脂孤零零浮在空气里
    var mGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: bokehTexture('120,220,245'), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5
    }));
    mGlow.scale.set(16, 10, 1);
    mGlow.position.set(0, 0, -3.2);
    memGroup.add(mGlow);

    /* ---------- 10. 标注 ---------- */

    var labels = [];
    // views: 只在这些视图里出现 —— 特写时保留本结构相关的一两个标注，
    // 否则全景里的七八个名字会一起糊到特写画面上，既挡住细节也读不出重点
    function addLabel(text, pos, opt, views) {
      var sp = ctx.makeText(text, opt);
      sp.position.copy(pos);
      // 默认精灵不吃深度测试（永远浮在最上层），这里改成吃深度：被细胞器挡住的结构名应该消失
      sp.material.depthTest = true;
      sp.renderOrder = 800;
      sp.userData.baseScale = sp.scale.clone();
      cellGroup.add(sp);
      labels.push({ sp: sp, base: pos.clone(), text: text, views: views || ['overview'],
        prio: (opt && opt.prio) || 1 });
      return sp;
    }
    addLabel('细胞核', NUCL.clone().add(new THREE.Vector3(2.55, 2.30, 0.55)),
      { color: '#cfe6ff', scale: 0.86, prio: 3 }, ['overview', 'nucleus']);
    addLabel('核仁', NUCL.clone().add(new THREE.Vector3(1.05, -0.95, 0.50)),
      { color: '#ffc8ea', scale: 0.60, prio: 4 }, ['overview', 'nucleus']);
    addLabel('染色质', NUCL.clone().add(new THREE.Vector3(-1.45, -1.30, 0.85)),
      { color: '#cfc0ff', scale: 0.55, prio: 2 }, ['nucleus']);
    addLabel('内质网', NUCL.clone().add(new THREE.Vector3(4.10, 1.20, 1.40)),
      { color: '#a8f2ff', scale: 0.72, prio: 3 }, ['overview', 'nucleus']);
    addLabel('高尔基体', new THREE.Vector3(3.5, -0.55, -2.5), { color: '#ffbdee', scale: 0.8, prio: 2 }, ['overview']);
    addLabel('线粒体', MITOS[0].p.clone().add(new THREE.Vector3(-0.15, 1.05, 0.55)), { color: '#9ff5ea', scale: 0.8, prio: 3 }, ['overview', 'mito']);
    addLabel('溶酶体', LYSO[0][0].clone().add(new THREE.Vector3(1.85, -2.55, 0.30)), { color: '#e6b3ff', scale: 0.72, prio: 2 }, ['overview']);
    addLabel('核糖体', new THREE.Vector3(-5.2, -3.6, -3.8), { color: '#dff4ff', scale: 0.68, prio: 1 }, ['overview']);
    addLabel('细胞膜', new THREE.Vector3(4.9, -4.6, -1.6), { color: '#c8f2ff', scale: 0.8, prio: 2 }, ['overview']);

    var memLabels = [];
    var ml1 = ctx.makeText('磷脂双分子层', { color: '#d8f6ff', scale: 0.34 });
    ml1.position.set(-0.35, 1.62, 0.3);
    memGroup.add(ml1); memLabels.push(ml1);
    var ml2 = ctx.makeText('疏水尾部（脂肪酸链）', { color: '#ffc8ee', scale: 0.27 });
    ml2.position.set(-1.55, -0.02, 1.1);
    memGroup.add(ml2); memLabels.push(ml2);
    var ml3 = ctx.makeText('亲水头部（磷酸基团）', { color: '#a8e8ff', scale: 0.27 });
    ml3.position.set(1.65, 1.15, 1.1);
    memGroup.add(ml3); memLabels.push(ml3);

    /* ---------- 11. 背景氛围：bokeh / 尘埃 / 体积光 ---------- */

    var atmo = new THREE.Group();
    scene.add(atmo);
    var bokehTex = [bokehTexture('130,225,250'), bokehTexture('235,150,220'), bokehTexture('225,245,255')];
    var rndB = (function () { var s = 5150; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    for (var bi2 = 0; bi2 < 16; bi2++) {
      var sp2 = new THREE.Sprite(new THREE.SpriteMaterial({
        map: bokehTex[bi2 % 3], transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      var rad4 = 22 + rndB() * 40, ang4 = rndB() * Math.PI * 2;
      sp2.position.set(Math.cos(ang4) * rad4, (rndB() - 0.5) * 36, Math.sin(ang4) * rad4);
      var sz2 = 3 + Math.pow(rndB(), 2) * 11;
      sp2.scale.set(sz2, sz2, 1);
      sp2.material.opacity = 0.04 + rndB() * 0.10;
      sp2.userData.base = sp2.material.opacity;
      sp2.userData.ph = rndB() * 6.28;
      atmo.add(sp2);
    }

    // 体积光：从左上斜切进来的两道光柱
    var shaftTex = (function () {
      var cv = texCanvas(64), c = cv.getContext('2d');
      var g = c.createLinearGradient(0, 0, 64, 0);
      g.addColorStop(0, 'rgba(90,210,255,0)');
      g.addColorStop(0.5, 'rgba(150,235,255,0.6)');
      g.addColorStop(1, 'rgba(90,210,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
      var g2 = c.createLinearGradient(0, 0, 0, 64);
      g2.addColorStop(0, 'rgba(0,0,0,0)');
      g2.addColorStop(0.5, 'rgba(255,255,255,1)');
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalCompositeOperation = 'destination-in';
      c.fillStyle = g2; c.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(cv);
    })();
    for (var sh2 = 0; sh2 < 2; sh2++) {
      var s2 = new THREE.Sprite(new THREE.SpriteMaterial({
        map: shaftTex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, opacity: 0.14, rotation: 0.55 + sh2 * 0.12
      }));
      s2.position.set(-12 + sh2 * 20, 6, -20 - sh2 * 6);
      s2.scale.set(20, 62, 1);
      atmo.add(s2);
    }

    // 胞质里的悬浮微粒
    var DUST = 380;
    var dPos = new Float32Array(DUST * 3), dSpd = new Float32Array(DUST);
    for (var di2 = 0; di2 < DUST; di2++) {
      dPos[di2 * 3] = (rndB() - 0.5) * 40;
      dPos[di2 * 3 + 1] = (rndB() - 0.5) * 32;
      dPos[di2 * 3 + 2] = (rndB() - 0.5) * 34;
      dSpd[di2] = 0.08 + rndB() * 0.3;
    }
    var gDust = new THREE.BufferGeometry();
    gDust.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    var dustTex = dotTexture('200,240,255');
    var dust = new THREE.Points(gDust, new THREE.PointsMaterial({
      size: 0.20, map: dustTex, transparent: true, opacity: 0.40,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    atmo.add(dust);

    /* ================= 机位 ================= */

    var VIEWS = {
      overview: { p: new THREE.Vector3(15, 10.5, 18), t: new THREE.Vector3(0, 0, 0) },
      nucleus: { p: NUCL.clone().add(new THREE.Vector3(3.4, 2.5, 6.9)), t: NUCL.clone().add(new THREE.Vector3(0, 0.1, 0)) },
      membrane: { p: new THREE.Vector3(0.55, 2.15, 7.6), t: new THREE.Vector3(0.35, -0.05, 0) },
      mito: { p: MITOS[0].p.clone().add(new THREE.Vector3(4.3, 3.0, 7.4)), t: MITOS[0].p.clone() }
    };

    var fly = null;    // 相机补间

    // 竖屏 / 窄屏：水平视角被压得很小（aspect 0.46 时 hFov 只剩 20°），
    // 沿用桌面机位会把细胞裁掉大半，所以按 aspect 把机位往外推，并把主体上移避开贴底的面板
    function aspectK() {
      var a = (ctx.canvas.clientWidth || 1) / (ctx.canvas.clientHeight || 1);
      return a < 0.95 ? Math.min(2.9, 0.95 / Math.max(0.34, a)) : 1;
    }
    function fitView(v) {
      var k = aspectK();
      // 只负责「退远一点」，让开底部 / 右侧面板交给框架的视锥偏移（HL.safeArea）
      var p2 = v.p.clone().sub(v.t).multiplyScalar(k).add(v.t);
      return { p: p2, t: v.t.clone() };
    }

    // 只切换「视图状态」（显隐 / 标注 / 副标题），不动相机 —— 讲解模式由 HL.Tour 负责运镜
    function applyView(view) {
      P.view = view;
      var isMem = view === 'membrane';
      cellGroup.visible = !isMem;
      memGroup.visible = isMem;
      // 线粒体特写：内质网扁囊正好横在镜头与线粒体之间，会糊掉整个主体，
      // 这一视图只保留线粒体 + 核糖体 / 溶酶体，内质网暂时收起
      erGroup.visible = view !== 'mito';
      atmo.visible = P.light;
      labels.forEach(function (l) { l.sp.visible = P.labels && !isMem; });
      memLabels.forEach(function (l) { l.visible = P.labels && isMem; });
      orientCut();
      if (ctx.setNote) {
        ctx.setNote(isMem
          ? '<div class="note-row"><span>膜厚</span><b>≈ 7–8 nm</b></div>' +
            '<div class="note-row"><span>结构</span><b>磷脂双分子层</b></div>' +
            '<div class="note-row"><span>头部</span><b>亲水（朝内 / 朝外）</b></div>' +
            '<div class="note-row"><span>尾部</span><b>疏水（相向排列）</b></div>'
          : '<div class="note-row"><span>细胞直径</span><b>≈ 20 μm</b></div>' +
            '<div class="note-row"><span>细胞核</span><b>≈ 6 μm</b></div>' +
            '<div class="note-row"><span>线粒体</span><b>0.5–1 μm × 2–3 μm</b></div>' +
            '<div class="note-row"><span>核糖体</span><b>≈ 25 nm</b></div>');
      }
    }

    // 面板切换：状态 + 相机补间
    function flyTo(view) {
      applyView(view);
      var v = fitView(VIEWS[view] || VIEWS.overview);
      fly = {
        t: 0, dur: 0.95,
        p0: camera.position.clone(), p1: v.p.clone(),
        q0: controls.target.clone(), q1: v.t.clone()
      };
    }

    var v0 = fitView(VIEWS.overview);
    camera.position.copy(v0.p);
    controls.target.copy(v0.t);
    controls.syncFromCamera();
    flyTo('overview');

    // 转屏 / 拉伸窗口后重新取景（用户手动拖过也不怕，重取景后仍可自由操作）
    var rzTimer = 0;
    function onResize() {
      clearTimeout(rzTimer);
      rzTimer = setTimeout(function () {
        if (P.tour) return;
        flyTo(P.view);
      }, 220);
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    /* ================= 标签避让 ================= */

    var _proj = new THREE.Vector3();
    var safe = { x0: 8, y0: 8, x1: 99999, y1: 99999, tb: null };
    var safeTick = 999;
    // 视图上有三块 DOM 压着画布（左侧栏、顶部标题、右侧参数面板）：
    // 投影落进去的标注会被文字压住或直接被裁掉，按安全区把它们隐藏
    function measureSafe() {
      var w = ctx.canvas.clientWidth || 1280, h = ctx.canvas.clientHeight || 720;
      var x0 = 8, y0 = 8, x1 = w - 10, y1 = h - 10;
      function rect(id) {
        var e = document.getElementById(id);
        if (!e) return null;
        var r = e.getBoundingClientRect();
        return (r.width > 1 && r.height > 1) ? r : null;
      }
      // 窄屏下侧栏是抽屉：收起时 rect 依然是 276 宽（只是被 translate 到屏幕外），
      // 拿它的 right 当左边界会把半个画面的标注全部误杀，所以要判断它是否真的在屏内
      var sb = rect('sidebar');
      if (sb && sb.left > -2 && sb.right < w * 0.42) x0 = Math.max(x0, sb.right + 10);
      var pn = rect('panel');
      if (pn && pn.left > w * 0.5) x1 = Math.min(x1, pn.left - 10);
      var hn = rect('hint');
      if (hn) y1 = Math.min(y1, hn.top - 6);
      var tb = rect('titlebar');
      safe.x0 = x0; safe.y0 = y0; safe.x1 = x1; safe.y1 = y1;
      safe.tb = tb ? { r: tb.right + 8, b: tb.bottom + 4 } : null;
    }

    function declutter() {
      var show = P.labels && cellGroup.visible;
      if (!show) { labels.forEach(function (l) { l.sp.visible = false; }); return; }
      if (safeTick++ > 24) { safeTick = 0; measureSafe(); }
      var list = [];
      var w = ctx.canvas.clientWidth || 1280, h = ctx.canvas.clientHeight || 720;
      labels.forEach(function (l) {
        if (l.views.indexOf(P.view) < 0) { l.sp.visible = false; return; }
        _proj.copy(l.sp.position).project(camera);
        if (_proj.z > 1) { l.sp.visible = false; return; }
        l.x = (_proj.x * 0.5 + 0.5) * w;
        l.y = (-_proj.y * 0.5 + 0.5) * h;
        var bs0 = l.sp.userData.baseScale;
        var halfW = (bs0 ? bs0.x : 1) * 46, halfH = (bs0 ? bs0.y : 1) * 26;
        if (l.x < safe.x0 + halfW * 0.5 || l.x > safe.x1 - halfW * 0.5 ||
            l.y < safe.y0 + halfH || l.y > safe.y1) { l.sp.visible = false; return; }
        if (safe.tb && l.x < safe.tb.r && l.y < safe.tb.b + halfH) { l.sp.visible = false; return; }
        l.d = camera.position.distanceTo(l.sp.position);
        // 标注是世界尺寸的精灵：贴近时按距离收缩，避免特写里字比细胞器还大
        var k = Math.min(1.0, Math.max(0.34, l.d / 30));
        if (bs0) l.sp.scale.set(bs0.x * k, bs0.y * k, 1);
        list.push(l);
      });
      // 先按重要度、再按远近：抢位置时「细胞核」必须赢过「核仁」的偏移量
      list.sort(function (a, b) { return (b.prio - a.prio) || (a.d - b.d); });
      var kept = [];
      list.forEach(function (l) {
        for (var i = 0; i < kept.length; i++) {
          var dx = kept[i].x - l.x, dy = kept[i].y - l.y;
          if (dx * dx / (104 * 104) + dy * dy / (44 * 44) < 1) { l.sp.visible = false; return; }
        }
        l.sp.visible = true;
        kept.push(l);
      });
    }

    var ray = new THREE.Raycaster();
    var pickables = [];
    // 拾取体：细胞器中心各放一个不可见球
    (function () {
      var pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
      cellMats.push(pickMat);
      function put(p, r, info) {
        var m = new THREE.Mesh(G.sphere, pickMat);
        m.position.copy(p); m.scale.setScalar(r);
        m.userData.info = info;
        cellGroup.add(m); pickables.push(m);
      }
      put(NUCL, 2.4, {
        title: '细胞核', rows: [['直径', '约 6 μm'], ['结构', '双层核膜 + 核孔'], ['内含', '染色质与核仁'], ['作用', '储存遗传信息，转录 mRNA']]
      });
      put(NUCL.clone().add(new THREE.Vector3(0.55, 0.35, 0.32)), 0.9, {
        title: '核仁', rows: [['直径', '约 1–2 μm'], ['组成', 'rRNA + 核糖体蛋白'], ['作用', '组装核糖体亚基'], ['特点', '代谢旺盛时增大']]
      });
      put(new THREE.Vector3(3.7, -1.4, -2.5), 1.5, {
        title: '高尔基体', rows: [['结构', '4–8 层扁平囊泡'], ['功能', '加工、分拣、打包'], ['方向', '顺面接收 / 反面发货'], ['产物', '分泌蛋白与溶酶体']]
      });
      put(MITOS[0].p, 1.1, {
        title: '线粒体', rows: [['尺寸', '0.5–1 × 2–3 μm'], ['外膜 / 内膜', '内膜向内折叠成嵴'], ['功能', '氧化磷酸化生成 ATP'], ['特点', '含自身 DNA，母系遗传']]
      });
      put(LYSO[0][0], 0.7, {
        title: '溶酶体', rows: [['直径', '0.1–1 μm'], ['内含', '60 余种水解酶'], ['作用', '降解废物与衰老细胞器'], ['pH', '内部约 4.5（酸性）']]
      });
      put(NUCL.clone().add(new THREE.Vector3(5.0, 1.4, 2.0)), 1.6, {
        title: '内质网', rows: [['粗面', '附着核糖体，合成蛋白'], ['光面', '合成脂质、解毒'], ['形态', '与核膜相连的片层网络'], ['占比', '可占细胞膜系统一半以上']]
      });
      put(new THREE.Vector3(0.4, R - 0.9, -1.2), 1.2, {
        title: '细胞膜', rows: [['厚度', '约 7–8 nm'], ['结构', '磷脂双分子层'], ['蛋白', '通道 / 受体 / 泵'], ['性质', '选择透过性']]
      });
      put(new THREE.Vector3(-6.4, 5.0, 2.4), 1.2, {
        title: '核糖体', rows: [['直径', '约 25 nm'], ['组成', 'rRNA + 蛋白质'], ['功能', '把 mRNA 翻译成多肽链'], ['数量', '一个细胞可达数百万个']]
      });
    })();

    /* ================= 讲解模式 ================= */

    var tour = HL.Tour(ctx);
    tour.load([
      {
        t: '一、细胞：生命的最小单位',
        d: '这是一个动物细胞，直径约 20 μm，肉眼看不见。画面把它沿中轴剖开：外面是细胞膜，里面是半流动的细胞质，各种细胞器悬浮其中。真核细胞与细菌最大的差别，就是把这些功能分区装进了膜围成的小隔间——分工，才让复杂成为可能。',
        exp: '拖动「剖切角度」，从不同方向切开细胞看内部。',
        cam: [[15, 10.5, 18], [0, 0, 0]],
        pulse: null
      },
      {
        t: '二、细胞核与核仁',
        d: '细胞核直径约 6 μm，占细胞体积的十分之一，由双层核膜包被，膜上分布着核孔——蛋白质与 RNA 进出的关卡。核内染色质携带全部遗传信息；图中那个更致密的球体是核仁，它专门组装核糖体的亚基。',
        exp: '点击细胞核或核仁，看具体数据。',
        cam: [NUCL.clone().add(new THREE.Vector3(4.6, 3.4, 9.4)).toArray(), NUCL.toArray()],
        pulse: NUCL.toArray(), r: 3.4,
        apply: function () { applyView('nucleus'); }
      },
      {
        t: '三、内质网：蛋白质的流水线',
        d: '从核膜向外铺开的褶皱片层就是内质网。粗面内质网表面附着大量核糖体，新合成的多肽链直接送进它的腔内折叠、加糖基；光面内质网没有核糖体，负责合成脂质与解毒。它把细胞内的膜系统连成了一张网。',
        exp: '看片层上那些细小亮点——那就是附着核糖体。',
        cam: [[9, 7, 12], [0, 1, 0]],
        pulse: NUCL.clone().add(new THREE.Vector3(4.6, 1.2, 2.0)).toArray(), r: 3.2,
        apply: function () { applyView('overview'); }
      },
      {
        t: '四、高尔基体：分拣与发货',
        d: '这几层叠起来的弯曲扁囊是高尔基体。内质网送来的蛋白质从「顺面」进入，逐层被修剪、标记，再从「反面」装进出芽小泡，发往细胞膜、溶酶体或细胞外——它就是细胞里的邮政分拣中心。',
        exp: '看它周围散落的小泡，那正是刚发出去的包裹。',
        cam: [[8.0, 2.4, 5.6], [3.7, -1.0, -2.5]],
        pulse: [3.7, -1.4, -2.5], r: 2.2,
        apply: function () { applyView('overview'); }
      },
      {
        t: '五、线粒体：能量的兑换处',
        d: '胶囊状的是线粒体，外膜光滑、内膜向里折叠成「嵴」，把有限的体积撑出巨大的反应面积。丙酮酸在这里被彻底氧化，产生的质子梯度驱动 ATP 合酶——你此刻呼吸的每一口氧气，最终都在这里被用掉。',
        exp: '换到「线粒体」观察位置，看内膜的板层状嵴。',
        cam: MITOS[0].p.clone().add(new THREE.Vector3(3.0, 2.2, 5.4)).toArray(),
        pulse: MITOS[0].p.toArray(), r: 1.6,
        apply: function () { applyView('mito'); }
      },
      {
        t: '六、细胞膜：磷脂双分子层',
        d: '放大到膜的尺度：两层磷脂分子头朝外、尾相对，自发排成稳定的双层，厚约 7–8 nm。亲水头部朝向细胞内外的水环境，疏水尾部藏在中间——正是这种「怕水」的排布，让细胞有了边界。膜上还嵌着通道蛋白，控制什么能进出。',
        exp: '这个特写是独立视图；点「全景剖面」回到细胞整体。',
        cam: [[0.5, 1.5, 5.9], [0, -0.05, 0]],
        pulse: [0, 0, 0], r: 2.2,
        apply: function () { applyView('membrane'); }
      }
    ]);

    /* ================= 每帧 ================= */

    var clock = 0;
    var cutCur = 0;

    // 测试钩子（回归脚本用；不影响交互）
    window.__CELL = {
      state: function () {
        return {
          view: P.view, cut: P.cut, labels: P.labels, light: P.light,
          cellVisible: cellGroup.visible, memVisible: memGroup.visible,
          ribosomes: rPos.length / 3,
          lipids: NX * NZ * 2,
          mitos: MITOS.length,
          lysosomes: LYSO.length,
          labelsShown: labels.filter(function (l) { return l.sp.visible; }).length,
          calls: ctx.renderer.info.render.calls,
          tris: ctx.renderer.info.render.triangles
        };
      },
      set: function (k, v) {
        P[k] = v;
        if (k === 'view') flyTo(v);
        if (k === 'cut') { cutCur = v; setCut(v); orientCut(); }
        if (k === 'labels') applyView(P.view);
      },
      groups: function () { return { cell: cellGroup, mem: memGroup, atmo: atmo, cut: cutGroup }; },
      // 调试：每个标注投影到屏幕后的位置 / 是否可见（排查「名字凭空消失」用）
      labels: function () {
        return labels.map(function (l) {
          return { t: l.text, x: Math.round(l.x || 0), y: Math.round(l.y || 0), v: l.sp.visible };
        });
      },
      centers: function () {
        return { nucl: NUCL.toArray(), nuclR: NUCL_R, golgi: golgi.position.toArray(), mitos: mitoAnchors.map(function (v) { return v.toArray(); }) };
      },
      steps: function () { return tour.count(); }
    };

    return {
      update: function (dt, tt) {
        clock += dt;

        // 相机补间
        if (fly) {
          fly.t += dt / fly.dur;
          var k = Math.min(1, fly.t);
          var e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;   // easeInOutQuad
          camera.position.lerpVectors(fly.p0, fly.p1, e);
          controls.target.lerpVectors(fly.q0, fly.q1, e);
          controls.syncFromCamera();
          if (k >= 1) fly = null;
        }

        // 剖切角度补间，避免滑杆拖动时切面跳动
        if (Math.abs(cutCur - P.cut) > 0.0005) {
          cutCur += (P.cut - cutCur) * Math.min(1, dt * 12);
          setCut(cutCur);
          orientCut();
        }

        if (P.spin && cellGroup.visible) cellGroup.rotation.y += dt * 0.10;

        if (P.light) {
          for (var i = 0; i < atmo.children.length; i++) {
            var o = atmo.children[i];
            if (o.isSprite && o.userData.base !== undefined) {
              o.material.opacity = o.userData.base * (0.72 + 0.28 * Math.sin(clock * 0.8 + o.userData.ph));
            }
          }
          var dpa = gDust.attributes.position.array;
          for (var d = 0; d < DUST; d++) {
            dpa[d * 3 + 1] += dSpd[d] * dt * 0.5;
            if (dpa[d * 3 + 1] > 18) dpa[d * 3 + 1] = -18;
          }
          gDust.attributes.position.needsUpdate = true;
        }
        atmo.visible = P.light;
        vig.style.opacity = P.light ? '1' : '0.3';

        declutter();
        tour.update(dt, tt || 0, function () { });
      },

      setParam: function (key, v) {
        if (key === 'tour') { tour.toggle(); return; }
        P[key] = v;
        if (key === 'view') { flyTo(v); return; }
        if (key === 'labels') {
          labels.forEach(function (l) { l.sp.visible = v && cellGroup.visible; });
          memLabels.forEach(function (l) { l.visible = v && memGroup.visible; });
        }
        if (key === 'cut') { /* 在 update 里补间 */ }
      },

      onClick: function (ndc) {
        if (!cellGroup.visible) { HL.tooltip.hide(); return; }
        ray.setFromCamera({ x: ndc.x, y: ndc.y }, camera);
        var hit = ray.intersectObjects(pickables, false);
        if (!hit.length) { HL.tooltip.hide(); return; }
        var info = hit[0].object.userData.info;
        if (!info) { HL.tooltip.hide(); return; }
        var html = '<div class="tt-title">' + info.title + '</div>';
        info.rows.forEach(function (r) {
          html += '<div class="tt-row">' + r[0] + '：<b>' + r[1] + '</b></div>';
        });
        HL.tooltip.show(html, ndc.clientX, ndc.clientY);
      },

      dispose: function () {
        tour.dispose();
        window.removeEventListener('resize', onResize);
        window.removeEventListener('orientationchange', onResize);
        clearTimeout(rzTimer);
        if (vig.parentNode) vig.parentNode.removeChild(vig);
        cellMats.forEach(function (m) { m.dispose(); });
        cellGeoms.forEach(function (g) { g.dispose(); });
        fresnelMats.forEach(function (m) { m.dispose(); });
        G.sphere.dispose(); G.cyl.dispose(); G.torus.dispose();
        bokehTex.forEach(function (t) { t.dispose(); });
        cutTex.dispose(); dustTex.dispose(); shaftTex.dispose();
        gDust.dispose(); riboTex.dispose();
        gCut.dispose(); cutRingMat.dispose();
        lipidMat.dispose(); channelMat.dispose();
        gLipid.dispose(); gChan.dispose(); gPore.dispose(); poreMat.dispose();
        if (scene.background && scene.background.dispose) scene.background.dispose();
        scene.background = null;
        scene.fog = null;
        ctx.renderer.localClippingEnabled = false;
      }
    };
  }
});
