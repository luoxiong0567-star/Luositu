/**
 * 场景：DNA 与蛋白质（写实渲染版 · v2）
 *
 * 视觉目标：显微摄影质感 —— 深蓝青底色、玻璃质感的半透明骨架、体积光与景深虚化。
 * 科学目标不变：B-DNA 双螺旋、α 螺旋、β 折叠三种分子形态，参数与真实晶体学数据一致，
 *   解旋 / 氢键 / 侧链 / 碱基配对等原有教学功能全部保留。
 *
 * 实现要点：
 *  - 骨架不再是「球棍」拼装，而是沿螺旋曲线生成的连续管体（TubeGeometry），
 *    再加一层菲涅耳壳（fresnel shell）制造玻璃边缘光，一次绘制、无需逐帧重建。
 *  - 碱基对 / 氢键 / 侧链用自写的 mergeParts 合并成单一 BufferGeometry，
 *    几十个零件压成 1 次 draw call，代价是参数变化时需重建（按帧节流）。
 *  - 景深靠三层伪造：远处 bokeh 光斑精灵 + 前景柔光 + 屏幕四周暗角（CSS 叠加层）。
 */
HL.registerScene({
  id: 'molecule',
  name: 'DNA 与蛋白质',
  short: '双螺旋与二级结构（写实渲染）',
  icon: '🧬',
  fov: 42,
  minDistance: 2.2,
  maxDistance: 180,
  desc: 'B-DNA：直径 2.0 nm、螺距 3.4 nm、每圈 10.5 个碱基对，两条骨架反向平行，大沟与小沟宽度不等；α 螺旋：每圈 3.6 个残基、螺距 0.54 nm，由 i→i+4 氢键稳定；β 折叠：链间氢键维系片层。滑动「解旋程度」观察碱基对的打开过程。',

  controls: [
    { type: 'button', key: 'tour', label: '📖 讲解模式' },
    {
      type: 'buttons', key: 'mode', label: '分子对象', value: 'dna', options: [
        { label: 'DNA 双螺旋', value: 'dna' },
        { label: 'α 螺旋', value: 'alpha' },
        { label: 'β 折叠', value: 'beta' }
      ]
    },
    { type: 'range', key: 'n', label: '单元数量', min: 12, max: 60, step: 2, value: 36 },
    { type: 'range', key: 'unwind', label: '解旋程度', min: 0, max: 1, step: 0.01, value: 0, unit: '' },
    { type: 'check', key: 'hbond', label: '显示氢键', value: true },
    { type: 'check', key: 'side', label: '显示侧链 / 碱基', value: true },
    { type: 'check', key: 'glow', label: '体积光与景深光斑', value: true },
    { type: 'check', key: 'spin', label: '自动旋转', value: true }
  ],

  create: function (ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera;

    var P = { mode: 'dna', n: 36, unwind: 0, hbond: true, side: true, spin: true, glow: true };

    /* ================= 通用工具 ================= */

    // 合并若干 {geom, mat, color} 为一个带顶点色的 BufferGeometry（几何复用 → 单次 draw call）
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

    // 沿折线的扁平缎带（β 折叠箭头片层用）
    function flatStrip(pts, width, axis) {
      var pos = [], idx = [], half = width / 2, i;
      for (i = 0; i < pts.length; i++) {
        var p = pts[i];
        pos.push(p.x + axis.x * half, p.y + axis.y * half, p.z + axis.z * half);
        pos.push(p.x - axis.x * half, p.y - axis.y * half, p.z - axis.z * half);
        if (i > 0) {
          var a = (i - 1) * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    }

    // 菲涅耳边缘光壳：叠加混合，制造玻璃 / 半透物质的轮廓辉光（软件渲染下也几乎零成本）
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
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: side === undefined ? THREE.FrontSide : side
      });
      fresnelMats.push(m);
      // 随当前分子一起回收：解旋滑杆每动一次都会重建，不登记就会累积着色器程序
      if (typeof cur !== 'undefined' && cur) cur.mats.push(m);
      return m;
    }

    function texCanvas(size) {
      var cv = document.createElement('canvas');
      cv.width = cv.height = size;
      return cv;
    }

    // 柔焦光斑（真实 bokeh 的特征：中心略透、边缘有一圈更亮的环）
    function bokehTexture(rgb) {
      var cv = texCanvas(128), c = cv.getContext('2d');
      var g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(' + rgb + ',0.42)');
      g.addColorStop(0.55, 'rgba(' + rgb + ',0.30)');
      g.addColorStop(0.82, 'rgba(' + rgb + ',0.62)');
      g.addColorStop(0.94, 'rgba(' + rgb + ',0.28)');
      g.addColorStop(1, 'rgba(' + rgb + ',0)');
      c.fillStyle = g; c.beginPath(); c.arc(64, 64, 64, 0, Math.PI * 2); c.fill();
      var t = new THREE.CanvasTexture(cv);
      t.minFilter = THREE.LinearFilter;
      return t;
    }

    // 背景：深蓝青渐变 + 两团弥散光雾（替代纯黑，才有"液体里"的层次）
    function bgTexture() {
      var cv = texCanvas(512), c = cv.getContext('2d');
      var g = c.createRadialGradient(230, 190, 20, 256, 256, 400);
      g.addColorStop(0, '#0d3f5c');
      g.addColorStop(0.42, '#082437');
      g.addColorStop(1, '#030b14');
      c.fillStyle = g; c.fillRect(0, 0, 512, 512);
      var g2 = c.createRadialGradient(390, 400, 10, 390, 400, 220);
      g2.addColorStop(0, 'rgba(96,52,140,0.35)');
      g2.addColorStop(1, 'rgba(96,52,140,0)');
      c.fillStyle = g2; c.fillRect(0, 0, 512, 512);
      var t = new THREE.CanvasTexture(cv);
      return t;
    }

    /* ================= 舞台氛围 ================= */

    scene.background = bgTexture();
    scene.fog = new THREE.FogExp2(0x061321, 0.011);

    // 屏幕暗角：伪造景深压边（DOM 叠加层，随场景销毁）
    var vig = document.createElement('div');
    vig.className = 'hl-vig';
    var stageEl = document.getElementById('stage');
    if (stageEl) stageEl.appendChild(vig);

    /* ================= 光照 ================= */

    scene.add(new THREE.AmbientLight(0x8fd8ff, 0.30));
    var key = new THREE.DirectionalLight(0xd8f4ff, 1.15); key.position.set(9, 14, 16); scene.add(key);
    var rim = new THREE.DirectionalLight(0x7a5cff, 0.85); rim.position.set(-12, -4, -14); scene.add(rim);
    var fill = new THREE.DirectionalLight(0x2fd4ff, 0.45); fill.position.set(-6, 10, -10); scene.add(fill);
    var inner = new THREE.PointLight(0x9fe9ff, 0.9, 60, 1.6); inner.position.set(0, 0, 0); scene.add(inner);

    /* ================= 氛围层：bokeh / 尘埃 / 光柱 ================= */

    var atmo = new THREE.Group();
    scene.add(atmo);

    var bokehTex = [
      bokehTexture('150,240,255'),
      bokehTexture('190,160,255'),
      bokehTexture('235,250,255')
    ];
    var bokehMats = bokehTex.map(function (t) {
      return new THREE.SpriteMaterial({
        map: t, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, opacity: 0.1
      });
    });

    var rnd = (function () { var s = 20240521; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();

    for (var bi = 0; bi < 84; bi++) {
      var sp = new THREE.Sprite(bokehMats[bi % 3].clone());
      var rad = 26 + rnd() * 46;
      var ang = rnd() * Math.PI * 2;
      var hgt = (rnd() - 0.5) * 62;
      sp.position.set(Math.cos(ang) * rad, hgt, Math.sin(ang) * rad);
      var sz = 4 + Math.pow(rnd(), 2) * 20;
      sp.scale.set(sz, sz, 1);
      sp.material.opacity = 0.045 + rnd() * 0.11;
      sp.material.rotation = rnd() * 6.28;
      sp.userData.base = sp.material.opacity;
      sp.userData.ph = rnd() * 6.28;
      atmo.add(sp);
    }

    // 体积光柱：三片超柔的长条精灵，斜插在分子后方
    var shaftTex = (function () {
      var cv = texCanvas(64), c = cv.getContext('2d');
      var g = c.createLinearGradient(0, 0, 64, 0);
      g.addColorStop(0, 'rgba(90,200,255,0)');
      g.addColorStop(0.5, 'rgba(140,225,255,0.55)');
      g.addColorStop(1, 'rgba(90,200,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
      var g2 = c.createLinearGradient(0, 0, 0, 64);
      g2.addColorStop(0, 'rgba(0,0,0,0)');
      g2.addColorStop(0.5, 'rgba(255,255,255,1)');
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalCompositeOperation = 'destination-in';
      c.fillStyle = g2; c.fillRect(0, 0, 64, 64);
      var t = new THREE.CanvasTexture(cv);
      t.minFilter = THREE.LinearFilter;
      return t;
    })();
    for (var si = 0; si < 3; si++) {
      var sh = new THREE.Sprite(new THREE.SpriteMaterial({
        map: shaftTex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, opacity: 0.16, rotation: (si - 1) * 0.5 + 0.35
      }));
      sh.position.set(-14 + si * 13, 4 - si * 6, -22 - si * 5);
      sh.scale.set(26, 78, 1);
      atmo.add(sh);
    }

    // 悬浮尘埃：近处慢慢漂移的微粒（照片里的"空气感"）
    var DUST = 900;
    var dustPos = new Float32Array(DUST * 3);
    var dustSpd = new Float32Array(DUST);
    for (var di = 0; di < DUST; di++) {
      dustPos[di * 3] = (rnd() - 0.5) * 46;
      dustPos[di * 3 + 1] = (rnd() - 0.5) * 40;
      dustPos[di * 3 + 2] = (rnd() - 0.5) * 40;
      dustSpd[di] = 0.10 + rnd() * 0.35;
    }
    var dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    var dustTex = bokehTexture('210,245,255');
    var dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      size: 0.30, map: dustTex, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    }));
    atmo.add(dust);

    /* ================= 分子几何 ================= */

    var root = new THREE.Group();
    scene.add(root);
    var pickables = [];
    var cur = null;          // 当前分子的构建结果
    var pending = true;      // 需要重建

    var G = {
      sphere: new THREE.SphereGeometry(1, 12, 9),
      box: new THREE.BoxGeometry(1, 1, 1),
      cyl: (function () { var g = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true); g.translate(0, 0.5, 0); return g; })()
    };

    var _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
    var QID = new THREE.Quaternion(), ONE = new THREE.Vector3(1, 1, 1);
    var ZAX = new THREE.Vector3(0, 0, 1), YAX = new THREE.Vector3(0, 1, 0);

    function m4(pos, quat, scl) {
      return new THREE.Matrix4().compose(pos, quat || QID, scl || ONE);
    }
    // 把 a→b 的圆柱塞进 parts（bond 的通用构件）
    function pushBond(parts, a, b, r, color) {
      _v2.subVectors(b, a);
      var len = _v2.length();
      if (len < 1e-6) return;
      var q = new THREE.Quaternion().setFromUnitVectors(YAX, _v2.normalize());
      parts.push({
        geom: G.cyl, mat: m4(a, q, new THREE.Vector3(r, len, r)), color: color
      });
    }
    // 把球塞进 parts
    function pushBall(parts, p, r, color) {
      parts.push({ geom: G.sphere, mat: m4(p, QID, new THREE.Vector3(r, r, r)), color: color });
    }

    function addMerged(parts, matOpts) {
      if (!parts.length) return null;
      var g = mergeParts(parts);
      var m = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: matOpts && matOpts.roughness !== undefined ? matOpts.roughness : 0.30,
        metalness: matOpts && matOpts.metalness !== undefined ? matOpts.metalness : 0.10,
        emissive: matOpts && matOpts.emissive !== undefined ? matOpts.emissive : 0x071a26,
        emissiveIntensity: matOpts && matOpts.ei !== undefined ? matOpts.ei : 0.6,
        transparent: matOpts && matOpts.opacity !== undefined && matOpts.opacity < 1,
        opacity: matOpts && matOpts.opacity !== undefined ? matOpts.opacity : 1,
        side: matOpts && matOpts.side !== undefined ? matOpts.side : THREE.FrontSide,
        depthWrite: matOpts && matOpts.depthWrite !== undefined ? matOpts.depthWrite : true
      });
      var mesh = new THREE.Mesh(g, m);
      cur.group.add(mesh);
      cur.geoms.push(g);
      cur.mats.push(m);
      return mesh;
    }

    /* ---------- 程序化细节贴图：骨架表面的凹凸颗粒（代替 bumpMap，软渲染友好） ---------- */
    // 说明：不使用 bumpMap / normalMap，软件渲染下多一遍光照代价过高，改用顶点色与菲涅耳表现质感。

    /* ================= DNA ================= */

    function buildDNA() {
      var n = P.n;
      var R = 4.4, RISE = 0.62, TWIST = Math.PI * 2 / 10.5, OFF = 2.42;   // 2.42 rad ≈ 138.6°，大小沟不对称
      var SUB = 6;
      var strandA = [], strandB = [];
      var i, f, th, y;

      // 解旋：从顶端开始「拉开拉链」，越靠上分离越大（前沿随滑杆向下推进）
      function openAmt(fi) {
        if (P.unwind <= 0) return 0;
        var front = (n - 1) * P.unwind;
        var d = (n - 1) - fi;
        return Math.max(0, Math.min(1, front - d + 1));
      }

      var bp = [];   // 每个碱基对的两端
      for (i = 0; i < n; i++) {
        th = i * TWIST;
        y = (i - (n - 1) / 2) * RISE;
        var amt = openAmt(i);
        var p1 = new THREE.Vector3(Math.cos(th) * R, y + amt * 1.9, Math.sin(th) * R);
        var p2 = new THREE.Vector3(Math.cos(th + OFF) * R, y - amt * 1.9, Math.sin(th + OFF) * R);
        bp.push({ a: p1, b: p2, amt: amt, th: th, y: y });
      }

      // 采样连续骨架曲线
      for (i = 0; i < n - 1; i++) {
        for (var s = 0; s < SUB; s++) {
          var t = s / SUB;
          strandA.push(new THREE.Vector3().lerpVectors(bp[i].a, bp[i + 1].a, t));
          strandB.push(new THREE.Vector3().lerpVectors(bp[i].b, bp[i + 1].b, t));
        }
      }
      strandA.push(bp[n - 1].a.clone());
      strandB.push(bp[n - 1].b.clone());

      var curveA = new THREE.CatmullRomCurve3(strandA);
      var curveB = new THREE.CatmullRomCurve3(strandB);
      // 注意：tubularSegments 必须是整数，小数会让 Frenet 帧数组少一格，构造时读 undefined
      var seg = Math.max(16, Math.round(Math.min(420, n * SUB * 1.4)));
      var tubeA = new THREE.TubeGeometry(curveA, seg, 0.44, 12, false);
      var tubeB = new THREE.TubeGeometry(curveB, seg, 0.44, 12, false);

      var coreMatA = new THREE.MeshStandardMaterial({
        color: 0x1d7f9e, roughness: 0.22, metalness: 0.30,
        emissive: 0x0a3b52, emissiveIntensity: 1.0,
        transparent: true, opacity: 0.62
      });
      var coreMatB = new THREE.MeshStandardMaterial({
        color: 0x6a55b5, roughness: 0.24, metalness: 0.30,
        emissive: 0x241a55, emissiveIntensity: 1.0,
        transparent: true, opacity: 0.62
      });
      var mA = new THREE.Mesh(tubeA, coreMatA); cur.group.add(mA);
      var mB = new THREE.Mesh(tubeB, coreMatB); cur.group.add(mB);
      cur.geoms.push(tubeA, tubeB);
      cur.mats.push(coreMatA, coreMatB);

      // 玻璃壳（同一几何 + 菲涅耳叠加）
      var shellA = fresnel(0x8ff2ff, 2.6, 0.95, THREE.FrontSide);
      var shellB = fresnel(0xc9a8ff, 2.6, 0.85, THREE.FrontSide);
      var sA = new THREE.Mesh(tubeA, shellA); cur.group.add(sA);
      var sB = new THREE.Mesh(tubeB, shellB); cur.group.add(sB);

      /* ---- 骨架上的磷酸珠（发光节点，参考图的"串珠"质感） ---- */
      var beads = [];
      for (i = 0; i < n; i++) {
        pushBall(beads, bp[i].a, 0.42, 0x9ff0ff);
        pushBall(beads, bp[i].b, 0.42, 0xd4b8ff);
      }
      var beadMesh = addMerged(beads, {
        roughness: 0.18, metalness: 0.1, emissive: 0x1d5f78, ei: 1.5,
        opacity: 0.95, transparent: true
      });

      /* ---- 碱基对：两块扁平碱基板 + 中心氢键 ---- */
      var baseParts = [];
      var hbondParts = [];
      var BCOL = { A: 0x9fe6ff, T: 0x6fc6ff, G: 0xc7b0ff, C: 0x9d9dff };
      var seq = 'TTAGGG', COMP = { A: 'T', T: 'A', G: 'C', C: 'G' };
      var baseSites = [];

      for (i = 0; i < n; i++) {
        var A = bp[i].a, B = bp[i].b;
        var mid = new THREE.Vector3().addVectors(A, B).multiplyScalar(0.5);
        var dir = new THREE.Vector3().subVectors(B, A);
        var len = dir.length();
        if (len < 1e-4) continue;
        dir.normalize();
        var q = new THREE.Quaternion().setFromUnitVectors(ZAX, dir);
        var bname = seq[i % seq.length], cname = COMP[bname];
        var openFade = 1 - bp[i].amt;

        // 两片碱基板（各占一半，略倾斜才有"堆叠"感）
        var plateA = new THREE.Matrix4().compose(
          new THREE.Vector3().copy(mid).addScaledVector(dir, -len * 0.24),
          q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(YAX, 0.0)),
          new THREE.Vector3(0.62, 0.16, len * 0.46)
        );
        baseParts.push({ geom: G.box, mat: plateA, color: BCOL[bname] });
        var plateB = new THREE.Matrix4().compose(
          new THREE.Vector3().copy(mid).addScaledVector(dir, len * 0.24),
          q.clone(),
          new THREE.Vector3(0.62, 0.16, len * 0.46)
        );
        baseParts.push({ geom: G.box, mat: plateB, color: BCOL[cname] });

        // 氢键：2 或 3 条发光细线，靠近中心
        var cnt = (bname === 'G' || bname === 'C') ? 3 : 2;
        var up = new THREE.Vector3().crossVectors(dir, YAX).normalize();
        if (up.lengthSq() < 0.01) up.set(1, 0, 0);
        for (var k = 0; k < cnt; k++) {
          var off = (k - (cnt - 1) / 2) * 0.16;
          var p1 = new THREE.Vector3().copy(mid).addScaledVector(dir, -len * 0.10).addScaledVector(up, off);
          var p2 = new THREE.Vector3().copy(mid).addScaledVector(dir, len * 0.10).addScaledVector(up, off);
          pushBond(hbondParts, p1, p2, 0.028 * openFade + 0.008, 0xe8fbff);
        }
        // 中心节点
        pushBall(hbondParts, mid, 0.085, 0xffffff);

        baseSites.push({ p: mid, name: bname + '—' + cname, idx: i, cnt: cnt, amt: bp[i].amt });
      }

      // 碱基堆积：相邻碱基对中心之间一条极细的连线（真实的 π-π 堆积相互作用，同时给出参考图那种"节点连线"的细腻质感）
      for (i = 0; i < baseSites.length - 1; i++) {
        pushBond(hbondParts, baseSites[i].p, baseSites[i + 1].p, 0.014, 0xbfe8ff);
      }

      var baseMesh = addMerged(baseParts, {
        roughness: 0.35, metalness: 0.05, emissive: 0x123044, ei: 0.5,
        opacity: 0.92, transparent: true
      });
      var hbMesh = addMerged(hbondParts, {
        roughness: 0.2, metalness: 0.0, emissive: 0x8fdcff, ei: 2.4,
        opacity: 0.95, transparent: true
      });

      baseMesh.visible = P.side;
      hbMesh.visible = P.hbond;
      cur.parts.baseMesh = baseMesh;
      cur.parts.hbMesh = hbMesh;

      /* ---- 拾取体（透明不可见，只用于射线） ---- */
      var pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
      cur.mats.push(pickMat);
      var step = Math.max(1, Math.round(n / 10));
      for (i = 0; i < n; i += step) {
        var site = baseSites[i];
        var pm = new THREE.Mesh(G.sphere, pickMat);
        pm.position.copy(site.p);
        pm.scale.setScalar(0.9);
        pm.userData.info = {
          title: '碱基对 ' + (i + 1),
          rows: [
            ['配对', site.name + '（' + (site.cnt === 3 ? '3 条氢键，更稳定' : '2 条氢键') + '）'],
            ['序列位置', '第 ' + (i + 1) + ' / ' + n + ' 位'],
            ['来源', '人类端粒重复序列 TTAGGG'],
            ['当前状态', site.amt > 0.05 ? '已解旋，氢键断开' : '闭合']
          ]
        };
        cur.group.add(pm);
        pickables.push(pm);
      }

      cur.kind = 'dna';
      cur.stats = { bp: n, bases: baseSites.length, samples: strandA.length };
      return { span: (n - 1) * RISE * 0.5 + 1.4, radius: R * 1.45 };
    }

    /* ================= α 螺旋 ================= */

    function buildAlpha() {
      var n = P.n;
      var R = 1.35, RISE = 0.44, TWIST = Math.PI * 2 / 3.6;
      var ca = [], i;
      for (i = 0; i < n; i++) {
        var th = i * TWIST;
        ca.push(new THREE.Vector3(Math.cos(th) * R, (i - (n - 1) / 2) * RISE, Math.sin(th) * R));
      }

      var curve = new THREE.CatmullRomCurve3(ca);
      var tube = new THREE.TubeGeometry(curve, Math.min(400, n * 5), 0.40, 10, false);
      var mat = new THREE.MeshStandardMaterial({
        color: 0x2b8fae, roughness: 0.22, metalness: 0.28,
        emissive: 0x0a3b52, emissiveIntensity: 1.0,
        transparent: true, opacity: 0.60
      });
      cur.group.add(new THREE.Mesh(tube, mat));
      cur.geoms.push(tube); cur.mats.push(mat);
      cur.group.add(new THREE.Mesh(tube, fresnel(0x9df2ff, 2.5, 1.0)));

      /* 侧链：沿半径向外的小球（疏水 / 极性两色） */
      var sideParts = [], hbParts = [], caParts = [];
      var HYDR = [1, 0, 0, 1, 1, 0, 1, 0, 0, 1];
      for (i = 0; i < n; i++) {
        var p = ca[i];
        var dir = new THREE.Vector3(p.x, 0, p.z).normalize();
        var sp = p.clone().addScaledVector(dir, 1.12);
        pushBall(sideParts, sp, 0.30, HYDR[i % 10] ? 0xf0e6b8 : 0x8fd8ff);
        pushBond(sideParts, p, sp, 0.075, 0x7fa8c0);
        pushBall(caParts, p, 0.34, 0xa8ecff);

        // α 螺旋特有的 i → i+4 氢键：从螺旋内部横穿一格
        if (i >= 4) {
          var q1 = ca[i - 4].clone().multiplyScalar(0.55);
          var q2 = p.clone().multiplyScalar(0.55);
          q1.y = ca[i - 4].y; q2.y = p.y;
          pushBond(hbParts, q1, q2, 0.032, 0x9fe8ff);
        }
      }
      var caMesh = addMerged(caParts, { roughness: 0.2, metalness: 0.15, emissive: 0x1d5f78, ei: 1.4, opacity: 0.96, transparent: true });
      var sideMesh = addMerged(sideParts, { roughness: 0.35, metalness: 0.05, emissive: 0x123044, ei: 0.4 });
      var hbMesh = addMerged(hbParts, { roughness: 0.2, metalness: 0, emissive: 0x8fdcff, ei: 2.2, opacity: 0.9, transparent: true });

      sideMesh.visible = P.side;
      hbMesh.visible = P.hbond;
      cur.parts.sideMesh = sideMesh;
      cur.parts.hbMesh = hbMesh;
      void caMesh;

      /* 拾取：每 6 个残基取一个球 */
      var pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
      cur.mats.push(pickMat);
      var stepA = Math.max(1, Math.round(n / 8));
      for (i = 0; i < n; i += stepA) {
        var pm = new THREE.Mesh(G.sphere, pickMat);
        pm.position.copy(ca[i]); pm.scale.setScalar(0.75);
        pm.userData.info = {
          title: '残基 ' + (i + 1),
          rows: [
            ['二级结构', 'α 螺旋'],
            ['氢键伙伴', i >= 4 ? '残基 ' + (i - 3) + '（i → i+4）' : '残基 ' + (i + 5) + '（i → i+4）'],
            ['侧链性质', HYDR[i % 10] ? '疏水' : '极性'],
            ['每圈残基数', '3.6']
          ]
        };
        cur.group.add(pm);
        pickables.push(pm);
      }

      cur.kind = 'alpha';
      cur.stats = { residues: n, ca: ca.length };
      return { span: (n - 1) * RISE * 0.5 + 1.2, radius: R + 1.6 };
    }

    /* ================= β 折叠 ================= */

    function buildBeta() {
      var n = P.n;
      // 片层平面 = XY 平面（正对默认机位）。两条链沿 X 延伸、在 Y 方向相邻，
      // 锯齿（褶皱）沿 X-Y 轻微起伏，侧链交替伸向片层前后（±Z）—— 这才是教科书里的 β 缎带。
      var SPACING = 0.62, PLEAT = 0.26, SEP = 2.35, W = 1.25;
      var a = [], b = [], i, x, yA, yB;
      for (i = 0; i < n; i++) {
        x = (i - (n - 1) / 2) * SPACING;
        yA = -SEP / 2 + (i % 2 === 0 ? PLEAT : -PLEAT);
        yB = SEP / 2 + (i % 2 === 0 ? -PLEAT : PLEAT);   // 反平行：B 链对应残基的凹凸相反
        a.push(new THREE.Vector3(x, yA, 0));
        b.push(new THREE.Vector3(-x, yB, 0));
      }

      var Yw = new THREE.Vector3(0, 1, 0);
      var stripA = flatStrip(a, W, Yw);
      var stripB = flatStrip(b, W, Yw);
      var matRib = new THREE.MeshStandardMaterial({
        color: 0x2b8fae, roughness: 0.24, metalness: 0.28,
        emissive: 0x0a3b52, emissiveIntensity: 1.1,
        transparent: true, opacity: 0.80, side: THREE.DoubleSide
      });
      cur.geoms.push(stripA, stripB); cur.mats.push(matRib);
      var mB2 = new THREE.Mesh(stripB, matRib.clone()); cur.mats.push(mB2.material);
      cur.group.add(new THREE.Mesh(stripA, matRib));
      cur.group.add(mB2);

      // 缎带边缘光：同一几何叠一层菲涅耳，片层的轮廓才亮得起来
      var edgeMat = fresnel(0x9df2ff, 2.6, 0.85, THREE.DoubleSide);
      cur.group.add(new THREE.Mesh(stripA, edgeMat));

      /* 侧链：交替伸向片层前后两侧 */
      var sideParts = [], hbParts = [], caParts = [];
      for (i = 0; i < n; i++) {
        var zs = (i % 2 === 0 ? 1 : -1) * 0.62;
        pushBall(sideParts, a[i].clone().add(new THREE.Vector3(0, 0, zs)), 0.20, 0xe8dca8);
        pushBall(sideParts, b[i].clone().add(new THREE.Vector3(0, 0, -zs)), 0.20, 0x9fd8ff);
        pushBall(caParts, a[i], 0.13, 0xcfeeff);
        pushBall(caParts, b[i], 0.13, 0xcfeeff);
        // 链间氢键：正对的两个残基之间（反平行片层的骨架氢键）
        if (i % 2 === 0 && i < n - 1) {
          pushBond(hbParts, a[i], b[n - 1 - i], 0.024, 0x9fe8ff);
        }
      }
      var sideMesh = addMerged(sideParts, { roughness: 0.35, metalness: 0.05, emissive: 0x1a3a4a, ei: 0.6, opacity: 0.95, transparent: true });
      var caMeshB = addMerged(caParts, { roughness: 0.2, metalness: 0.15, emissive: 0x2a6b8c, ei: 1.2, opacity: 0.95, transparent: true });
      var hbMesh = addMerged(hbParts, { roughness: 0.2, metalness: 0, emissive: 0x8fdcff, ei: 2.2, opacity: 0.9, transparent: true });
      sideMesh.visible = P.side;
      hbMesh.visible = P.hbond;
      void caMeshB;
      cur.parts.sideMesh = sideMesh;
      cur.parts.hbMesh = hbMesh;

      /* 方向箭头：A 链指向 +X，B 链指向 −X */
      var arrowGeo = new THREE.ConeGeometry(0.30, 0.85, 12);
      var arrowMat = new THREE.MeshStandardMaterial({
        color: 0xf0d48a, roughness: 0.32, metalness: 0.2, emissive: 0x4a3308, emissiveIntensity: 1.2
      });
      cur.geoms.push(arrowGeo); cur.mats.push(arrowMat);
      var ar1 = new THREE.Mesh(arrowGeo, arrowMat);
      ar1.position.copy(a[n - 1]).add(new THREE.Vector3(0.55, 0, 0));
      ar1.quaternion.setFromUnitVectors(YAX, new THREE.Vector3(1, 0, 0));
      var ar2 = new THREE.Mesh(arrowGeo, arrowMat);
      ar2.position.copy(b[n - 1]).add(new THREE.Vector3(-0.55, 0, 0));
      ar2.quaternion.setFromUnitVectors(YAX, new THREE.Vector3(-1, 0, 0));
      cur.group.add(ar1); cur.group.add(ar2);

      /* 拾取 */
      var pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
      cur.mats.push(pickMat);
      var stepB = Math.max(1, Math.round(n / 8));
      for (i = 0; i < n; i += stepB) {
        var pm = new THREE.Mesh(G.sphere, pickMat);
        pm.position.copy(a[i]); pm.scale.setScalar(0.6);
        pm.userData.info = {
          title: '残基 ' + (i + 1),
          rows: [
            ['二级结构', 'β 折叠（反平行）'],
            ['链方向', '链 A：N→C　链 B：C→N'],
            ['氢键', '与对侧链对应残基形成链间氢键'],
            ['残基间距', '0.35 nm（伸展构象）']
          ]
        };
        cur.group.add(pm);
        pickables.push(pm);
      }

      cur.kind = 'beta';
      cur.stats = { residues: n, strands: 2 };
      return { span: (n - 1) * SPACING * 0.5 + 1.2, radius: 3.2 };
    }

    /* ================= 构建 / 重建 ================= */

    function clearCur() {
      if (!cur) return;
      root.remove(cur.group);
      // 只释放自己登记的几何与材质，公用的 G.sphere / G.box / G.cyl 不能动
      cur.geoms.forEach(function (g) { g.dispose(); });
      cur.mats.forEach(function (m) { m.dispose(); });
      pickables = [];
      cur = null;
    }

    function rebuild() {
      clearCur();
      cur = { group: new THREE.Group(), geoms: [], mats: [], parts: {}, kind: 'dna' };
      root.add(cur.group);
      var info = P.mode === 'alpha' ? buildAlpha() : (P.mode === 'beta' ? buildBeta() : buildDNA());
      updateNote();
      // 视距自适应：长分子自动拉远，保证整条链落在画面内
      var dist = Math.max(info.span * 2.0, info.radius * 3.2, 14);
      cur.fit = dist;
      pending = false;
      return info;
    }

    function updateNote() {
      if (!ctx.setNote) return;
      var t = {
        dna: '<div class="note-row"><span>螺旋直径</span><b>2.0 nm</b></div>' +
          '<div class="note-row"><span>螺距</span><b>3.4 nm</b></div>' +
          '<div class="note-row"><span>每圈碱基对</span><b>10.5</b></div>' +
          '<div class="note-row"><span>碱基堆积间距</span><b>0.34 nm</b></div>',
        alpha: '<div class="note-row"><span>每圈残基</span><b>3.6</b></div>' +
          '<div class="note-row"><span>螺距</span><b>0.54 nm</b></div>' +
          '<div class="note-row"><span>稳定氢键</span><b>i → i+4</b></div>' +
          '<div class="note-row"><span>残基轴向间距</span><b>0.15 nm</b></div>',
        beta: '<div class="note-row"><span>排布方式</span><b>反平行</b></div>' +
          '<div class="note-row"><span>残基间距</span><b>0.35 nm</b></div>' +
          '<div class="note-row"><span>维系作用</span><b>链间氢键</b></div>' +
          '<div class="note-row"><span>侧链取向</span><b>片层上下交替</b></div>'
      };
      ctx.setNote(t[P.mode]);
    }

    rebuild();
    camera.position.set(9, 4, 33);
    camera.lookAt(0, 0, 0);

    var ray = new THREE.Raycaster();

    /* ================= 讲解模式 ================= */

    var tour = HL.Tour(ctx);
    tour.load([
      {
        t: '一、双螺旋：生命的图纸',
        d: '这就是 B-DNA：两条骨架反向平行地缠绕成右手双螺旋，直径 2.0 nm、螺距 3.4 nm、每圈 10.5 个碱基对。把你一个细胞里的 DNA 接起来约长 2 米，而它装在直径仅 6 μm 的细胞核中。1953 年沃森与克里克提出该结构，关键的 X 射线衍射数据来自罗莎琳德·富兰克林。',
        exp: '把「单元数量」拉到 60，看一条更长的双螺旋。',
        cam: [[6, 7, 23], [0, 0, 0]],
        pulse: null
      },
      {
        t: '二、碱基互补配对',
        d: '彩色薄片是骨架内侧的碱基：A 只与 T 配对（2 条氢键），G 只与 C 配对（3 条氢键，中心发光的细线更多、更牢固）。这种严格的互补性就是复制的钥匙——任何一条单链，都唯一确定了另一条链的全部信息。',
        exp: '点击任意碱基对，看它的配对关系与氢键数。',
        cam: [[2.5, 2.2, 10], [0, 1.2, 0]],
        pulse: [0, 1.2, 0], r: 2.2
      },
      {
        t: '三、解旋：复制的开始',
        d: '细胞分裂前，DNA 从一端开始解开氢键、像拉链一样分开，两条单链各自作为模板合成新链——这叫半保留复制。滑杆「解旋程度」可以亲手拉开这条拉链：已打开的部分两条骨架上下分离，碱基之间的氢键随之断开。',
        exp: '已为你拉开一半。退出讲解后拖动「解旋程度」滑杆可以合上或全开。',
        cam: [[7, 5, 14], [0, 3, 0]],
        pulse: [0, 4.5, 0], r: 2.2,
        apply: function () { P.unwind = 0.55; pending = true; }
      },
      {
        t: '四、α 螺旋：蛋白质的弹簧',
        d: '换一类分子。α 螺旋是蛋白质最常见的二级结构：每 3.6 个残基绕一圈、螺距 0.54 nm，由第 i 个残基与第 i+4 个之间的氢键像弹簧一样固定——屏幕上那些横穿螺旋内部的细亮线就是它们。头发的角蛋白、肌肉里的肌红蛋白，都是它撑起来的。',
        exp: '点击残基看它的氢键伙伴与侧链性质（疏水 / 极性）。',
        cam: [[0, 3, 12], [0, 0, 0]],
        pulse: [0, 0, 0], r: 1.6,
        apply: function () { P.unwind = 0; P.mode = 'alpha'; pending = true; }
      },
      {
        t: '五、β 折叠：蛋白质的片层',
        d: 'β 折叠把肽链拉成锯齿状并排成片，相邻两条链之间用氢键缝合（此处为反平行排列）。丝纤维与蛛丝的高强度正来自这种结构。两端金色箭头指示链的方向：一条 N→C，另一条 C→N，正好相反。',
        exp: '勾选 / 取消「显示侧链」，看侧链如何交替伸向片层上下两侧。',
        cam: [[0, 4, 12], [0, 0, 0]],
        pulse: [0, 0, 0], r: 2.0,
        apply: function () { P.mode = 'beta'; pending = true; }
      },
      {
        t: '六、中心法则',
        d: 'DNA 携带指令，蛋白质执行生命——从 DNA 到 RNA 再到蛋白质的「中心法则」，是这两类分子在所有细胞中的分工。四种字母（A T G C）写下 30 亿碱基对的人类基因组，编码约两万个基因，最终构成你身体里的每一个细胞。',
        exp: '按 R 复位视角，回看整个分子家族。',
        cam: [[6, 8, 24], [0, 0, 0]],
        pulse: null,
        apply: function () { P.mode = 'dna'; P.unwind = 0; pending = true; }
      }
    ]);

    /* ================= 每帧 ================= */

    var clock = 0;

    window.__MOLECULE = {
      state: function () {
        return {
          mode: P.mode, n: P.n, unwind: P.unwind, spin: P.spin, glow: P.glow,
          kind: cur && cur.kind, stats: cur && cur.stats, picks: pickables.length,
          calls: ctx.renderer.info.render.calls, tris: ctx.renderer.info.render.triangles,
          box: (function () {
            if (!cur) return null;
            var bb = new THREE.Box3().setFromObject(cur.group);
            return { min: bb.min.toArray().map(function (v) { return +v.toFixed(2); }), max: bb.max.toArray().map(function (v) { return +v.toFixed(2); }) };
          })()
        };
      },
      set: function (k, v) {
        P[k] = v;
        if (k === 'mode' || k === 'n' || k === 'unwind') pending = true;
        if (k === 'hbond' && cur && cur.parts.hbMesh) cur.parts.hbMesh.visible = v;
        if (k === 'side' && cur) {
          if (cur.parts.baseMesh) cur.parts.baseMesh.visible = v;
          if (cur.parts.sideMesh) cur.parts.sideMesh.visible = v;
        }
      },
      steps: function () { return tour.count(); }
    };

    return {
      update: function (dt, tt) {
        if (pending) rebuild();
        clock += dt;
        if (P.spin) root.rotation.y += dt * 0.22;

        // 光斑呼吸：让静止的画面有"拍摄中的微动"
        if (P.glow) {
          var arr = atmo.children;
          for (var i = 0; i < arr.length; i++) {
            var o = arr[i];
            if (o.isSprite && o.userData.base !== undefined) {
              o.material.opacity = o.userData.base * (0.72 + 0.28 * Math.sin(clock * 0.9 + o.userData.ph));
            }
          }
          // 尘埃缓慢上浮
          var dp = dustGeo.attributes.position.array;
          for (var d = 0; d < DUST; d++) {
            dp[d * 3 + 1] += dustSpd[d] * dt * 0.6;
            if (dp[d * 3 + 1] > 20) dp[d * 3 + 1] = -20;
          }
          dustGeo.attributes.position.needsUpdate = true;
        }
        atmo.visible = P.glow;
        vig.style.opacity = P.glow ? '1' : '0.25';

        tour.update(dt, tt || 0, function () { });
      },

      setParam: function (key, v) {
        if (key === 'tour') { tour.toggle(); return; }
        P[key] = v;
        if (key === 'mode' || key === 'n' || key === 'unwind') {
          pending = true;
        } else if (key === 'hbond') {
          if (cur && cur.parts.hbMesh) cur.parts.hbMesh.visible = v;
        } else if (key === 'side') {
          if (cur) {
            if (cur.parts.baseMesh) cur.parts.baseMesh.visible = v;
            if (cur.parts.sideMesh) cur.parts.sideMesh.visible = v;
          }
        }
      },

      onClick: function (ndc) {
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
        if (vig.parentNode) vig.parentNode.removeChild(vig);
        clearCur();
        G.sphere.dispose(); G.box.dispose(); G.cyl.dispose();
        fresnelMats.forEach(function (m) { m.dispose(); });
        bokehMats.forEach(function (m) { m.dispose(); });
        bokehTex.forEach(function (t) { t.dispose(); });
        shaftTex.dispose(); dustTex.dispose(); dustGeo.dispose();
        if (scene.background && scene.background.dispose) scene.background.dispose();
        scene.background = null;
        scene.fog = null;
      }
    };
  }
});
