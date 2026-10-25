/**
 * 场景：DNA 与蛋白质（科研插画版 · v3）
 *
 * 视觉基调取自三张参考图，合起来就是这一版的规则：
 *   1) 暗场科普照片 —— 绯红/酒红的颗粒状双螺旋，冷灰蓝的碎块混在里头，边缘一圈亮玫红；
 *   2) 教科书插画 —— 青蓝 DNA 缠着琥珀色组蛋白，白色细引线 + 小字标注；
 *   3) 荧光蛋白彩带图 —— 品红/绿/黄/青/橙的缎带螺旋，氢键画成冷白闪电，背后一团紫雾。
 * 共同点：底色压到近黑（微紫），主体饱和度高，靠菲涅耳轮廓光勾边，靠冷白闪电提亮。
 *
 * 科学参数一律不变：
 *   B-DNA 直径 2.0 nm、螺距 3.4 nm、10.5 bp/圈、大小沟 138.6°；
 *   α 螺旋 3.6 残基/圈、螺距 0.54 nm、i→i+4 氢键；
 *   β 折叠反平行片层、残基间距 0.35 nm；
 *   核小体：147 bp 绕组蛋白八聚体 1.65 圈。
 *
 * 渲染要点（全部为「构建期算好、运行期只画」）：
 *   · 管体按顶点色做绯红渐变 + 噪声色斑，再用噪声径向位移制造颗粒起伏（crumpled 质感）；
 *   · 表面撒一层合并的碎块（icosahedron），一次 draw call，近看是"结石/珊瑚"质感；
 *   · 氢键不是直线，而是带随机折转的细管——两层（白芯 + 青色辉光壳），像放电；
 *   · 缎带用四边形条带（ribbon）而不是圆管，宽度沿螺旋轴方向，才是教科书里的带状螺旋；
 *   · 标注是 DOM + SVG 引线，每帧把 3D 锚点投影到屏幕，跟随旋转不掉队。
 */
HL.registerScene({
  id: 'molecule',
  name: 'DNA 与蛋白质',
  short: '双螺旋 · 二级结构 · 核小体',
  icon: '🧬',
  fov: 42,
  minDistance: 2.2,
  maxDistance: 200,
  desc: 'B-DNA：直径 2.0 nm、螺距 3.4 nm、每圈 10.5 个碱基对，两条骨架反向平行，大沟与小沟宽度不等；α 螺旋：每圈 3.6 个残基、螺距 0.54 nm，由 i→i+4 氢键稳定；β 折叠：四条链两两反向平行，靠链间氢键缝合；核小体：147 bp 的 DNA 绕组蛋白八聚体 1.65 圈，是染色质的基本单位。',

  controls: [
    { type: 'button', key: 'tour', label: '📖 讲解模式' },
    {
      type: 'buttons', key: 'mode', label: '分子对象', value: 'dna', options: [
        { label: 'DNA 双螺旋', value: 'dna' },
        { label: 'α 螺旋', value: 'alpha' },
        { label: 'β 折叠', value: 'beta' },
        { label: '核小体', value: 'nucleosome' }
      ]
    },
    { type: 'range', key: 'n', label: '单元数量', min: 12, max: 60, step: 2, value: 36 },
    { type: 'range', key: 'unwind', label: '解旋程度（DNA）', min: 0, max: 1, step: 0.01, value: 0 },
    { type: 'check', key: 'hbond', label: '显示氢键', value: true },
    { type: 'check', key: 'side', label: '显示侧链 / 碱基', value: true },
    { type: 'check', key: 'labels', label: '显示引线标注', value: true },
    { type: 'check', key: 'glow', label: '体积光与景深光斑', value: true },
    { type: 'check', key: 'spin', label: '自动旋转', value: true }
  ],

  create: function (ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera;
    var stage = document.getElementById('stage');

    var P = {
      mode: 'dna', n: 36, unwind: 0,
      hbond: true, side: true, labels: true, glow: true, spin: true
    };

    /* ================================================================
     *  一、色彩：三张参考图取的交集
     * ================================================================ */

    // 绯红骨架（参考图 1 的主体）
    var ROSE = [
      [0.00, 0x33091a], [0.30, 0x6d1730], [0.55, 0x9c2340],
      [0.76, 0xc23856], [0.90, 0xdc5a74], [1.00, 0xf492a6]
    ];
    // 第二条链偏冷一档（紫梅），仍留在同一色family里——反向平行才看得出来
    var PLUM = [
      [0.00, 0x2b0a22], [0.30, 0x5d1240], [0.55, 0x8b1f5c],
      [0.76, 0xb63a7a], [0.90, 0xd65f97], [1.00, 0xef9abc]
    ];
    // 参考图 1 里混着的冷灰蓝碎块
    var SLATE = [
      [0.00, 0x1b2129], [0.45, 0x2b3440], [0.75, 0x3d4857], [1.00, 0x5a6878]
    ];
    // 琥珀：组蛋白（参考图 2）、碱基板
    var AMBER = [
      [0.00, 0x3a1706], [0.28, 0x6d3010], [0.55, 0x96481b],
      [0.78, 0xb9662e], [1.00, 0xd4955c]
    ];
    // 青：核小体上的 DNA（参考图 2）、氢键辉光
    var TEAL = [
      [0.00, 0x06272f], [0.30, 0x0c4754], [0.55, 0x146b78],
      [0.78, 0x2a96a2], [1.00, 0x6cc8c6]
    ];
    // 彩带（参考图 3 的四个亚基）
    var MAGENTA = [
      [0.00, 0x360a24], [0.30, 0x6e1346], [0.58, 0xa12066],
      [0.80, 0xc74585], [1.00, 0xe88ab4]
    ];
    var GREEN = [
      [0.00, 0x15420f], [0.32, 0x2e7320], [0.60, 0x4ba32f],
      [0.82, 0x77c94b], [1.00, 0xb6e88c]
    ];
    var YELLOW = [
      [0.00, 0x4a3a06], [0.32, 0x8a6b10], [0.60, 0xc7a11c],
      [0.82, 0xe6cb44], [1.00, 0xf6ec9a]
    ];
    var ORANGE = [
      [0.00, 0x4d1a05], [0.32, 0x8c340c], [0.60, 0xc65a19],
      [0.82, 0xe58a3c], [1.00, 0xf6bd80]
    ];

    function rampRGB(stops, t, out) {
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      var k = 0, n = stops.length;
      while (k < n - 2 && t > stops[k + 1][0]) k++;
      var t0 = stops[k][0], t1 = stops[k + 1][0];
      var f = (t - t0) / ((t1 - t0) || 1);
      f = f < 0 ? 0 : (f > 1 ? 1 : f);
      var c0 = stops[k][1], c1 = stops[k + 1][1];
      var r0 = (c0 >> 16 & 255) / 255, g0 = (c0 >> 8 & 255) / 255, b0 = (c0 & 255) / 255;
      var r1 = (c1 >> 16 & 255) / 255, g1 = (c1 >> 8 & 255) / 255, b1 = (c1 & 255) / 255;
      out[0] = r0 + (r1 - r0) * f;
      out[1] = g0 + (g1 - g0) * f;
      out[2] = b0 + (b1 - b0) * f;
      return out;
    }

    /* ================================================================
     *  二、噪声与几何工具
     * ================================================================ */

    var seed = 20261025;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    function rr(a, b) { return a + rnd() * (b - a); }

    function hash3(i, j, k) {
      var v = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
      return v - Math.floor(v);
    }
    function fade(t) { return t * t * (3 - 2 * t); }
    function vnoise3(x, y, z) {
      var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
      var xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
      var c000 = hash3(xi, yi, zi), c100 = hash3(xi + 1, yi, zi);
      var c010 = hash3(xi, yi + 1, zi), c110 = hash3(xi + 1, yi + 1, zi);
      var c001 = hash3(xi, yi, zi + 1), c101 = hash3(xi + 1, yi, zi + 1);
      var c011 = hash3(xi, yi + 1, zi + 1), c111 = hash3(xi + 1, yi + 1, zi + 1);
      var x00 = c000 + (c100 - c000) * xf, x10 = c010 + (c110 - c010) * xf;
      var x01 = c001 + (c101 - c001) * xf, x11 = c011 + (c111 - c011) * xf;
      var y0 = x00 + (x10 - x00) * yf, y1 = x01 + (x11 - x01) * yf;
      return y0 + (y1 - y0) * zf;
    }

    // 合并若干 {geom, mat, color|rgb} → 单个带顶点色的 BufferGeometry（一次 draw call）
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
        var pr = 1, pg = 1, pb = 1;
        if (p.rgb) { pr = p.rgb[0]; pg = p.rgb[1]; pb = p.rgb[2]; }
        else { cc.set(p.color === undefined ? 0xffffff : p.color); pr = cc.r; pg = cc.g; pb = cc.b; }
        var pa = gg.attributes.position, na = gg.attributes.normal;
        for (j = 0; j < pa.count; j++) {
          v.fromBufferAttribute(pa, j).applyMatrix4(m);
          pos[(vo + j) * 3] = v.x; pos[(vo + j) * 3 + 1] = v.y; pos[(vo + j) * 3 + 2] = v.z;
          if (na) v.fromBufferAttribute(na, j).applyMatrix3(nmat).normalize();
          else v.set(0, 1, 0);
          nor[(vo + j) * 3] = v.x; nor[(vo + j) * 3 + 1] = v.y; nor[(vo + j) * 3 + 2] = v.z;
          col[(vo + j) * 3] = pr; col[(vo + j) * 3 + 1] = pg; col[(vo + j) * 3 + 2] = pb;
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

    var G = {
      sphere: new THREE.SphereGeometry(1, 12, 9),
      blob: new THREE.IcosahedronGeometry(1, 0),
      box: new THREE.BoxGeometry(1, 1, 1),
      cyl: (function () { var g = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true); g.translate(0, 0.5, 0); return g; })()
    };

    var _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
    var QID = new THREE.Quaternion(), ONE = new THREE.Vector3(1, 1, 1);
    var ZAX = new THREE.Vector3(0, 0, 1), YAX = new THREE.Vector3(0, 1, 0);

    function m4(pos, quat, scl) {
      return new THREE.Matrix4().compose(pos, quat || QID, scl || ONE);
    }
    function pushBond(parts, a, b, r, color) {
      _v2.subVectors(b, a);
      var len = _v2.length();
      if (len < 1e-6) return;
      var q = new THREE.Quaternion().setFromUnitVectors(YAX, _v2.normalize());
      parts.push({ geom: G.cyl, mat: m4(a, q, new THREE.Vector3(r, len, r)), color: color });
    }
    function pushBall(parts, p, r, color) {
      parts.push({ geom: G.sphere, mat: m4(p, QID, new THREE.Vector3(r, r, r)), color: color });
    }
    function pushBlob(parts, p, sx, sy, sz, rgb) {
      var q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(rnd() * 6.283, rnd() * 6.283, rnd() * 6.283));
      parts.push({ geom: G.blob, mat: m4(p, q, new THREE.Vector3(sx, sy, sz)), rgb: rgb });
    }

    // 菲涅耳边缘光壳：叠加混合，制造玻璃 / 半透物质的轮廓辉光
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
      if (typeof cur !== 'undefined' && cur) cur.mats.push(m);
      return m;
    }

    function texCanvas(size) {
      var cv = document.createElement('canvas');
      cv.width = cv.height = size;
      return cv;
    }

    // 柔焦光斑（bokeh：中心略透、边缘一圈更亮）
    function bokehTexture(rgb) {
      var cv = texCanvas(128), c = cv.getContext('2d');
      var g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(' + rgb + ',0.42)');
      g.addColorStop(0.55, 'rgba(' + rgb + ',0.26)');
      g.addColorStop(0.82, 'rgba(' + rgb + ',0.60)');
      g.addColorStop(0.94, 'rgba(' + rgb + ',0.24)');
      g.addColorStop(1, 'rgba(' + rgb + ',0)');
      c.fillStyle = g; c.beginPath(); c.arc(64, 64, 64, 0, Math.PI * 2); c.fill();
      var t = new THREE.CanvasTexture(cv);
      t.minFilter = THREE.LinearFilter;
      return t;
    }

    // 柔边圆点（尘埃 / 绒毛边）
    function dotTexture(rgb) {
      var cv = texCanvas(64), c = cv.getContext('2d');
      var g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(' + rgb + ',0.95)');
      g.addColorStop(0.35, 'rgba(' + rgb + ',0.45)');
      g.addColorStop(1, 'rgba(' + rgb + ',0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
      var t = new THREE.CanvasTexture(cv);
      t.minFilter = THREE.LinearFilter;
      return t;
    }

    // 背景：近黑 → 紫雾 → 青角（参考图 3 的底）
    function bgTexture() {
      var cv = texCanvas(512), c = cv.getContext('2d');
      var g = c.createRadialGradient(210, 175, 10, 256, 256, 430);
      g.addColorStop(0, '#1b1230');
      g.addColorStop(0.38, '#0e0a1c');
      g.addColorStop(0.72, '#07050f');
      g.addColorStop(1, '#030208');
      c.fillStyle = g; c.fillRect(0, 0, 512, 512);

      var g2 = c.createRadialGradient(268, 286, 8, 268, 286, 250);
      g2.addColorStop(0, 'rgba(120,48,180,0.36)');
      g2.addColorStop(0.55, 'rgba(84,32,132,0.16)');
      g2.addColorStop(1, 'rgba(84,32,132,0)');
      c.fillStyle = g2; c.fillRect(0, 0, 512, 512);

      var g3 = c.createRadialGradient(392, 208, 6, 392, 208, 190);
      g3.addColorStop(0, 'rgba(168,44,116,0.20)');
      g3.addColorStop(1, 'rgba(168,44,116,0)');
      c.fillStyle = g3; c.fillRect(0, 0, 512, 512);

      var g4 = c.createRadialGradient(78, 448, 6, 78, 448, 210);
      g4.addColorStop(0, 'rgba(20,86,104,0.22)');
      g4.addColorStop(1, 'rgba(20,86,104,0)');
      c.fillStyle = g4; c.fillRect(0, 0, 512, 512);

      var t = new THREE.CanvasTexture(cv);
      return t;
    }

    // 分子背后那团紫雾（参考图 3 的等高线云影）
    function hazeTexture() {
      var cv = texCanvas(256), c = cv.getContext('2d');
      c.globalCompositeOperation = 'lighter';
      for (var i = 0; i < 7; i++) {
        var a = i / 7 * Math.PI * 2;
        var x = 128 + Math.cos(a) * (18 + i * 3.2);
        var y = 128 + Math.sin(a * 1.7) * (10 + i * 2.6);
        var rad = 52 + i * 7;
        var g = c.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, 'rgba(128,58,190,0.30)');
        g.addColorStop(0.45, 'rgba(96,40,158,0.16)');
        g.addColorStop(1, 'rgba(70,28,120,0)');
        c.fillStyle = g; c.fillRect(0, 0, 256, 256);
      }
      var t = new THREE.CanvasTexture(cv);
      t.minFilter = THREE.LinearFilter;
      return t;
    }

    /* ================================================================
     *  三、管体 / 碎块 / 闪电 / 缎带
     * ================================================================ */

    // 带顶点色 + 噪声起伏的管体。colFn(u, v, out) 里 u 沿链、v 绕圈。
    function tubeMesh(curve, segs, radial, radius, colFn, opt) {
      opt = opt || {};
      var geo = new THREE.TubeGeometry(curve, segs, radius, radial, false);
      var pos = geo.attributes.position;
      var cols = new Float32Array(pos.count * 3);
      var c = new THREE.Vector3(), cen = new THREE.Vector3();
      var amp = opt.crinkle || 0, freq = opt.freq || 9, fz = opt.freqZ || 16;
      var out = [0, 0, 0];
      for (var i = 0; i <= segs; i++) {
        var u = i / segs;
        curve.getPointAt(u, cen);
        for (var j = 0; j <= radial; j++) {
          var id = i * (radial + 1) + j;
          c.fromBufferAttribute(pos, id);
          var dx = c.x - cen.x, dy = c.y - cen.y, dz = c.z - cen.z;
          var dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
          dx /= dl; dy /= dl; dz /= dl;
          if (amp) {
            var th = (j / radial) * Math.PI * 2;
            var nv = vnoise3(Math.cos(th) * 1.9, Math.sin(th) * 1.9, u * fz) - 0.5;
            var rr2 = dl + amp * nv * 2.0;
            c.set(cen.x + dx * rr2, cen.y + dy * rr2, cen.z + dz * rr2);
            pos.setXYZ(id, c.x, c.y, c.z);
          }
          colFn(u, j / radial, out);
          cols[id * 3] = out[0]; cols[id * 3 + 1] = out[1]; cols[id * 3 + 2] = out[2];
        }
      }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      if (amp) geo.computeVertexNormals();
      var mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: opt.rough === undefined ? 0.46 : opt.rough,
        metalness: opt.metal === undefined ? 0.12 : opt.metal,
        emissive: opt.emissive === undefined ? 0x0b0610 : opt.emissive,
        emissiveIntensity: opt.ei === undefined ? 0.55 : opt.ei
      });
      var mesh = new THREE.Mesh(geo, mat);
      cur.group.add(mesh);
      cur.geoms.push(geo); cur.mats.push(mat);
      return { mesh: mesh, geo: geo };
    }

    // 表面碎块层：沿曲线撒不规则 icosahedron，做出参考图 1 那种"结石/珊瑚"的颗粒面
    function crustLayer(curve, count, baseR, stops, opt) {
      opt = opt || {};
      var parts = [], p = new THREE.Vector3(), tg = new THREE.Vector3();
      var u = new THREE.Vector3(), rgb = [0, 0, 0];
      for (var i = 0; i < count; i++) {
        var t = (i + rnd() * 0.85) / count;
        curve.getPointAt(t < 0 ? 0 : (t > 1 ? 1 : t), p);
        curve.getTangentAt(t < 0 ? 0 : (t > 1 ? 1 : t), tg);
        u.set(rr(-1, 1), rr(-1, 1), rr(-1, 1));
        if (u.lengthSq() < 1e-4) u.set(0, 1, 0);
        u.normalize();
        u.addScaledVector(tg, -u.dot(tg));
        if (u.lengthSq() < 1e-5) u.set(1, 0, 0);
        u.normalize();

        var lumps = 1 + (rnd() < 0.45 ? 1 : 0);
        for (var k = 0; k < lumps; k++) {
          var off = baseR * (0.66 + rnd() * 0.34);
          var pos = p.clone().addScaledVector(u, off);
          if (k) pos.x += rr(-0.16, 0.16), pos.y += rr(-0.16, 0.16), pos.z += rr(-0.16, 0.16);
          var s = opt.size ? opt.size : 0.2;
          var sz = s * (0.62 + rnd() * 0.75);
          var ct = 0.04 + rnd() * 0.60 + t * 0.14;
          rampRGB(rnd() < (opt.slateP || 0.1) ? SLATE : stops, ct, rgb);
          var dim = 0.90 + rnd() * 0.26;
          pushBlob(parts, pos, sz * dim * 1.05, sz * dim * 0.88, sz * dim,
            [rgb[0] * dim, rgb[1] * dim, rgb[2] * dim]);
        }
      }
      return parts;
    }

    // 折转的细管 = 闪电。probe 段随机横偏，两遍：白芯 + 青色辉光壳
    function bolt(core, halo, a, b, segs, amp, rad, color) {
      var d = new THREE.Vector3().subVectors(b, a);
      var len = d.length();
      if (len < 1e-5) return null;
      var dir = d.clone().normalize();
      var up = Math.abs(dir.y) < 0.9 ? YAX : new THREE.Vector3(1, 0, 0);
      var n1 = new THREE.Vector3().crossVectors(dir, up).normalize();
      var n2 = new THREE.Vector3().crossVectors(dir, n1).normalize();
      var prev = a.clone();
      for (var i = 1; i <= segs; i++) {
        var t = i / segs;
        var p = a.clone().addScaledVector(d, t);
        if (i < segs) {
          var m = amp * (0.45 + rnd() * 0.9) * (i % 2 ? 1 : -1);
          p.addScaledVector(n1, m).addScaledVector(n2, m * 0.55 * rr(-1, 1));
        }
        pushBond(core, prev, p, rad * (0.72 + rnd() * 0.5), color);
        if (halo) pushBond(halo, prev, p, rad * 3.4, color);
        prev = p;
      }
      return prev;
    }

    /* 缎带：给「一条有厚度的扁带」而不是一张零厚度的纸。
     * 零厚度面片在螺旋里一片片平面相交，渲染出来就是折纸/搓衣板；改成椭圆截面（宽 hw、厚 T）
     * 的闭环管之后，边缘有圆角、法线连续，才是教科书插画里那种光滑的彩带螺旋。
     * 法线用解析式算（w·cos/hw + n·sin/T），接缝处不会出现一道硬边。 */
    function ribbonGeo(pts, widthFn, colorAt, upAxis) {
      var RING = 10, T = 0.115;
      var pos = [], nor = [], cols = [], idx = [];
      var tg = new THREE.Vector3(), w = new THREE.Vector3(), up = new THREE.Vector3(), nn = new THREE.Vector3();
      var rgb = [0, 0, 0], last = pts.length - 1;
      for (var i = 0; i <= last; i++) {
        var p = pts[i];
        var a = pts[Math.max(0, i - 1)], b = pts[Math.min(last, i + 1)];
        tg.subVectors(b, a).normalize();
        up.copy(typeof upAxis === 'function' ? upAxis(i) : upAxis);
        w.copy(up).addScaledVector(tg, -up.dot(tg));
        if (w.lengthSq() < 1e-6) w.set(1, 0, 0);
        w.normalize();
        nn.crossVectors(tg, w).normalize();
        var hw = widthFn(i / last);
        colorAt(i / last, rgb);
        for (var j = 0; j < RING; j++) {
          var ang = j / RING * Math.PI * 2;
          var ca = Math.cos(ang), sa = Math.sin(ang);
          pos.push(p.x + w.x * ca * hw + nn.x * sa * T,
            p.y + w.y * ca * hw + nn.y * sa * T,
            p.z + w.z * ca * hw + nn.z * sa * T);
          var nx = w.x * ca / hw + nn.x * sa / T;
          var ny = w.y * ca / hw + nn.y * sa / T;
          var nz = w.z * ca / hw + nn.z * sa / T;
          var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
          nor.push(nx / nl, ny / nl, nz / nl);
          var shade = 0.80 + 0.22 * (sa * 0.5 + 0.5);
          cols.push(rgb[0] * shade, rgb[1] * shade, rgb[2] * shade);
        }
        if (i > 0) {
          var q0 = (i - 1) * RING, q1 = i * RING;
          for (var k = 0; k < RING; k++) {
            var k2 = (k + 1) % RING;
            idx.push(q0 + k, q1 + k, q0 + k2, q0 + k2, q1 + k, q1 + k2);
          }
        }
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      g.setIndex(idx);
      return g;
    }

    function ribbonMesh(pts, widthFn, colorAt, upAxis, opt) {
      opt = opt || {};
      var geo = ribbonGeo(pts, widthFn, colorAt, upAxis);
      var mat = new THREE.MeshStandardMaterial({
        vertexColors: true, side: THREE.DoubleSide,
        roughness: opt.rough === undefined ? 0.42 : opt.rough,
        metalness: opt.metal === undefined ? 0.10 : opt.metal,
        emissive: opt.emissive === undefined ? 0x120512 : opt.emissive,
        emissiveIntensity: opt.ei === undefined ? 0.6 : opt.ei
      });
      cur.group.add(new THREE.Mesh(geo, mat));
      cur.geoms.push(geo); cur.mats.push(mat);
      return geo;
    }

    // 平面箭头（β 链的方向指示）
    function arrowHead(core, tip, dir, up, halfW, len, color) {
      var base = tip.clone().addScaledVector(dir, -len);
      var w = new THREE.Vector3().crossVectors(dir, up).normalize();
      var g = new THREE.BufferGeometry();
      var p = [
        base.x - w.x * halfW, base.y - w.y * halfW, base.z - w.z * halfW,
        base.x + w.x * halfW, base.y + w.y * halfW, base.z + w.z * halfW,
        tip.x, tip.y, tip.z
      ];
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.setIndex([0, 1, 2]);
      g.computeVertexNormals();
      core.push({ geom: g, color: color, mat: new THREE.Matrix4() });
    }

    function addMerged(parts, opt) {
      if (!parts.length) return null;
      var g = mergeParts(parts);
      var m = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: opt && opt.roughness !== undefined ? opt.roughness : 0.40,
        metalness: opt && opt.metalness !== undefined ? opt.metalness : 0.08,
        emissive: opt && opt.emissive !== undefined ? opt.emissive : 0x0d0712,
        emissiveIntensity: opt && opt.ei !== undefined ? opt.ei : 0.55,
        transparent: !!(opt && opt.opacity !== undefined && opt.opacity < 1),
        opacity: opt && opt.opacity !== undefined ? opt.opacity : 1,
        side: opt && opt.side !== undefined ? opt.side : THREE.FrontSide,
        depthWrite: opt && opt.depthWrite !== undefined ? opt.depthWrite : true
      });
      var mesh = new THREE.Mesh(g, m);
      cur.group.add(mesh);
      cur.geoms.push(g);
      cur.mats.push(m);
      return mesh;
    }

    // 氢键辉光壳：一次 draw call，比逐个 sprite 省得多
    function addHalo(parts, color, opacity) {
      if (!parts.length) return null;
      var g = mergeParts(parts);
      var m = new THREE.MeshBasicMaterial({
        vertexColors: true, transparent: true, opacity: opacity === undefined ? 0.20 : opacity,
        blending: THREE.AdditiveBlending, depthWrite: false
      });
      var mesh = new THREE.Mesh(g, m);
      cur.group.add(mesh);
      cur.geoms.push(g); cur.mats.push(m);
      return mesh;
    }

    /* ================================================================
     *  四、舞台：背景、雾、灯光、光斑
     * ================================================================ */

    scene.background = bgTexture();
    scene.fog = new THREE.FogExp2(0x0a0614, 0.0145);

    var vig = document.createElement('div');
    vig.className = 'hl-vig hl-vig-mol';
    if (stage) stage.appendChild(vig);

    scene.add(new THREE.AmbientLight(0x6f7fb8, 0.42));
    var keyL = new THREE.DirectionalLight(0xffe9f2, 1.10); keyL.position.set(13, 10, 16); scene.add(keyL);
    var rimL = new THREE.DirectionalLight(0xff4d86, 0.95); rimL.position.set(-14, 2, -15); scene.add(rimL);
    var fillL = new THREE.DirectionalLight(0x35d6e8, 0.55); fillL.position.set(-9, -8, 9); scene.add(fillL);
    var topL = new THREE.DirectionalLight(0xa86bff, 0.45); topL.position.set(0, 18, -6); scene.add(topL);
    var coreL = new THREE.PointLight(0xffb066, 1.15, 40, 1.8); coreL.position.set(0, 0, 0); scene.add(coreL);

    var atmo = new THREE.Group();
    scene.add(atmo);

    // 背后紫雾
    var hazeTex = hazeTexture();
    var haze = new THREE.Sprite(new THREE.SpriteMaterial({
      map: hazeTex, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: 0.62, color: 0xb07cff
    }));
    haze.position.set(0, 2, -26);
    haze.scale.set(78, 56, 1);
    atmo.add(haze);

    var haze2 = new THREE.Sprite(new THREE.SpriteMaterial({
      map: hazeTex, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: 0.40, color: 0xff4f8c
    }));
    haze2.position.set(14, -8, -18);
    haze2.scale.set(52, 38, 1);
    atmo.add(haze2);

    var bokehTex = [
      bokehTexture('255,120,160'),
      bokehTexture('170,120,255'),
      bokehTexture('120,235,245'),
      bokehTexture('255,210,170')
    ];
    var bokehMats = bokehTex.map(function (t) {
      return new THREE.SpriteMaterial({
        map: t, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, opacity: 0.1
      });
    });
    for (var bi = 0; bi < 78; bi++) {
      var sp = new THREE.Sprite(bokehMats[bi % 4].clone());
      var rad = 24 + rnd() * 48;
      var ang = rnd() * Math.PI * 2;
      sp.position.set(Math.cos(ang) * rad, (rnd() - 0.5) * 54, Math.sin(ang) * rad - 6);
      var sz = 2.5 + Math.pow(rnd(), 2.1) * 17;
      sp.scale.set(sz, sz, 1);
      sp.material.opacity = 0.04 + rnd() * 0.10;
      sp.material.rotation = rnd() * 6.28;
      sp.userData.base = sp.material.opacity;
      sp.userData.ph = rnd() * 6.28;
      atmo.add(sp);
    }

    // 体积光柱：斜插在分子后方
    var shaftTex = (function () {
      var cv = texCanvas(64), c = cv.getContext('2d');
      var g = c.createLinearGradient(0, 0, 64, 0);
      g.addColorStop(0, 'rgba(170,90,220,0)');
      g.addColorStop(0.5, 'rgba(210,130,255,0.55)');
      g.addColorStop(1, 'rgba(170,90,220,0)');
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
        depthWrite: false, opacity: 0.13, rotation: (si - 1) * 0.55 + 0.32
      }));
      sh.position.set(-15 + si * 14, 5 - si * 7, -24 - si * 5);
      sh.scale.set(30, 84, 1);
      atmo.add(sh);
    }

    // 悬浮尘埃
    var DUST = 760;
    var dustPos = new Float32Array(DUST * 3);
    var dustSpd = new Float32Array(DUST);
    for (var di = 0; di < DUST; di++) {
      dustPos[di * 3] = (rnd() - 0.5) * 48;
      dustPos[di * 3 + 1] = (rnd() - 0.5) * 42;
      dustPos[di * 3 + 2] = (rnd() - 0.5) * 42;
      dustSpd[di] = 0.10 + rnd() * 0.32;
    }
    var dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    var dustTex = dotTexture('255,214,226');
    var dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      size: 0.24, map: dustTex, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    }));
    atmo.add(dust);

    /* ================================================================
     *  五、分子构建
     * ================================================================ */

    var root = new THREE.Group();
    scene.add(root);
    var pickables = [];
    var cur = null;
    var pending = true;
    var refit = false;

    /* ---------------- DNA ---------------- */

    function buildDNA() {
      var n = P.n;
      var R = 4.4, RISE = 0.62, TWIST = Math.PI * 2 / 10.5, OFF = 2.42, SUB = 8;
      var i, s, th, y;

      function openAmt(fi) {
        if (P.unwind <= 0) return 0;
        var front = (n - 1) * P.unwind;
        var d = (n - 1) - fi;
        return Math.max(0, Math.min(1, front - d + 1));
      }

      var bp = [];
      for (i = 0; i < n; i++) {
        th = i * TWIST;
        y = (i - (n - 1) / 2) * RISE;
        var amt = openAmt(i);
        bp.push({
          a: new THREE.Vector3(Math.cos(th) * R, y + amt * 1.9, Math.sin(th) * R),
          b: new THREE.Vector3(Math.cos(th + OFF) * R, y - amt * 1.9, Math.sin(th + OFF) * R),
          amt: amt, th: th, y: y
        });
      }

      var ptA = [], ptB = [];
      for (i = 0; i < n - 1; i++) {
        for (s = 0; s < SUB; s++) {
          var t = s / SUB;
          ptA.push(new THREE.Vector3().lerpVectors(bp[i].a, bp[i + 1].a, t));
          ptB.push(new THREE.Vector3().lerpVectors(bp[i].b, bp[i + 1].b, t));
        }
      }
      ptA.push(bp[n - 1].a.clone());
      ptB.push(bp[n - 1].b.clone());

      var curveA = new THREE.CatmullRomCurve3(ptA);
      var curveB = new THREE.CatmullRomCurve3(ptB);
      var seg = Math.max(24, Math.round(Math.min(420, n * SUB * 1.4)));
      var RAD = 0.60;

      var rgb = [0, 0, 0], rgb2 = [0, 0, 0];

      // 主链：绯红 / 紫梅，噪声混入冷灰蓝碎斑
      function colA(u, v, out) {
        var th2 = v * Math.PI * 2;
        var nz = vnoise3(Math.cos(th2) * 2.1, Math.sin(th2) * 2.1, u * 15);
        var patch = vnoise3(Math.cos(th2) * 0.9 + 5, Math.sin(th2) * 0.9, u * 5.5);
        if (patch > 0.70) rampRGB(SLATE, 0.30 + nz * 0.5, out);
        else rampRGB(ROSE, 0.08 + 0.34 * nz + 0.22 * u, out);
        var warm = 0.86 + 0.28 * vnoise3(u * 40, v * 9, 3.1);
        out[0] = Math.min(1, out[0] * warm);
        out[1] = Math.min(1, out[1] * warm);
        out[2] = Math.min(1, out[2] * warm);
      }
      function colB(u, v, out) {
        var th2 = v * Math.PI * 2;
        var nz = vnoise3(Math.cos(th2) * 2.1 + 9, Math.sin(th2) * 2.1, u * 15);
        var patch = vnoise3(Math.cos(th2) * 0.9 + 12, Math.sin(th2) * 0.9, u * 5.5);
        if (patch > 0.73) rampRGB(SLATE, 0.28 + nz * 0.5, out);
        else rampRGB(PLUM, 0.08 + 0.34 * nz + 0.22 * u, out);
      }

      var tA = tubeMesh(curveA, seg, 14, RAD, colA, { crinkle: 0.095, freqZ: 20, rough: 0.72, metal: 0.03 });
      var tB = tubeMesh(curveB, seg, 14, RAD, colB, { crinkle: 0.095, freqZ: 20, rough: 0.72, metal: 0.03 });

      // 表面碎块（参考图 1 的关键质感）
      addMerged(crustLayer(curveA, Math.round(n * 11), RAD, ROSE, { size: 0.195, slateP: 0.11 }),
        { roughness: 0.62, metalness: 0.04, emissive: 0x1a0510, ei: 0.42 });
      addMerged(crustLayer(curveB, Math.round(n * 11), RAD, PLUM, { size: 0.195, slateP: 0.11 }),
        { roughness: 0.62, metalness: 0.04, emissive: 0x15040f, ei: 0.42 });

      // 轮廓光：亮玫红细边 + 深红宽晕
      cur.group.add(new THREE.Mesh(tA.geo, fresnel(0xff9ab4, 3.4, 0.88)));
      cur.group.add(new THREE.Mesh(tB.geo, fresnel(0xffa8d0, 3.4, 0.80)));
      cur.group.add(new THREE.Mesh(tA.geo, fresnel(0x9c1438, 1.5, 0.26)));

      /* 磷酸节点：骨架外侧的亮点（参考图 1 的高光颗粒） */
      var beads = [];
      for (i = 0; i < n; i++) {
        pushBall(beads, bp[i].a, 0.30, 0xff9db6);
        pushBall(beads, bp[i].b, 0.30, 0xffb2d4);
      }
      addMerged(beads, { roughness: 0.22, metalness: 0.15, emissive: 0x8c1a34, ei: 1.5 });

      /* 碱基对：琥珀色板 + 冷白闪电氢键 */
      var baseParts = [], coreParts = [], haloParts = [];
      var seq = 'TTAGGG', COMP = { A: 'T', T: 'A', G: 'C', C: 'G' };
      var AT_COL = 0xcdb694, GC_COL = 0xc2907a;
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
        var gc = (bname === 'G' || bname === 'C');
        var openFade = 1 - bp[i].amt;

        var plateA = new THREE.Matrix4().compose(
          new THREE.Vector3().copy(mid).addScaledVector(dir, -len * 0.235),
          q.clone(),
          new THREE.Vector3(0.40, 0.095, len * 0.44)
        );
        baseParts.push({ geom: G.box, mat: plateA, color: AT_COL });
        var plateB = new THREE.Matrix4().compose(
          new THREE.Vector3().copy(mid).addScaledVector(dir, len * 0.235),
          q.clone(),
          new THREE.Vector3(0.40, 0.095, len * 0.44)
        );
        baseParts.push({ geom: G.box, mat: plateB, color: gc ? GC_COL : AT_COL });

        var cnt = gc ? 3 : 2;
        var up = new THREE.Vector3().crossVectors(dir, YAX).normalize();
        if (up.lengthSq() < 0.01) up.set(1, 0, 0);
        for (var k = 0; k < cnt; k++) {
          var off = (k - (cnt - 1) / 2) * 0.15;
          var p1 = new THREE.Vector3().copy(mid).addScaledVector(dir, -len * 0.115).addScaledVector(up, off);
          var p2 = new THREE.Vector3().copy(mid).addScaledVector(dir, len * 0.115).addScaledVector(up, off);
          bolt(coreParts, haloParts, p1, p2, 4, 0.040, 0.011 * openFade + 0.004, 0xc8ecff);
        }
        pushBall(coreParts, mid, 0.06, 0xffffff);
        baseSites.push({ p: mid, name: bname + '—' + cname, idx: i, cnt: cnt, amt: bp[i].amt });
      }

      // 碱基堆积（π-π）：相邻碱基对中心一条极细的连线
      for (i = 0; i < baseSites.length - 1; i++) {
        pushBond(coreParts, baseSites[i].p, baseSites[i + 1].p, 0.011, 0xbfeaff);
      }

      var baseMesh = addMerged(baseParts, {
        roughness: 0.52, metalness: 0.06, emissive: 0x7a4620, ei: 0.42
      });
      var hbCore = addMerged(coreParts, {
        roughness: 0.2, metalness: 0.0, emissive: 0xbdf0ff, ei: 2.6
      });
      var hbHalo = addHalo(haloParts, 0x6fd8ff, 0.16);

      baseMesh.visible = P.side;
      hbCore.visible = P.hbond;
      if (hbHalo) hbHalo.visible = P.hbond;
      cur.parts.baseMesh = baseMesh;
      cur.parts.hbMesh = hbCore;
      cur.parts.hbHalo = hbHalo;

      /* 拾取体 */
      var pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
      cur.mats.push(pickMat);
      var step = Math.max(1, Math.round(n / 10));
      for (i = 0; i < n; i += step) {
        var site = baseSites[i];
        var pm = new THREE.Mesh(G.sphere, pickMat);
        pm.position.copy(site.p);
        pm.scale.setScalar(0.95);
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

      /* 标注锚点 */
      var lab = [];
      var an1 = new THREE.Object3D(); an1.position.copy(bp[Math.floor(n * 0.28)].a); cur.group.add(an1);
      lab.push({ name: '糖—磷酸骨架', sub: '5′→3′', obj: an1, ox: -338, oy: -46 });
      if (baseSites.length > Math.floor(n * 0.55)) {
        var an2 = new THREE.Object3D();
        an2.position.copy(baseSites[Math.floor(n * 0.55)].p);
        cur.group.add(an2);
        lab.push({ name: '碱基对', sub: 'A—T / G—C', obj: an2, ox: 240, oy: 54 });
      }
      cur.labels = lab;

      cur.kind = 'dna';
      cur.stats = { bp: n, bases: baseSites.length, curveA: ptA.length };
      // fit = 机位距离。旧版 home 约 34，这里沿用同一量级，速览里 zoom 1.85 的取景才不会变
      return { span: (n - 1) * RISE * 0.5 + 1.5, radius: R * 1.42, fit: 42 };
    }

    /* ---------------- α 螺旋 ---------------- */

    function buildAlpha() {
      var n = P.n;
      var R = 1.60, RISE = 0.50, TWIST = Math.PI * 2 / 3.6, SUB = 14;
      var i, M = (n - 1) * SUB;

      var ca = [];
      for (i = 0; i < n; i++) {
        th = i * TWIST;
        ca.push(new THREE.Vector3(Math.cos(th) * R, (i - (n - 1) / 2) * RISE, Math.sin(th) * R));
      }

      // 平滑采样（缎带要够密才不折）
      var pts = [];
      for (i = 0; i < n - 1; i++) {
        for (var s = 0; s < SUB; s++) {
          pts.push(new THREE.Vector3().lerpVectors(ca[i], ca[i + 1], s / SUB));
        }
      }
      pts.push(ca[n - 1].clone());

      var rgb = [0, 0, 0];
      var geo = ribbonMesh(pts, function () { return 0.44; }, function (f, out) {
        var nz = vnoise3(f * 7, 1.7, 0.4);
        rampRGB(MAGENTA, 0.40 + 0.20 * nz + 0.16 * (1 - f), out);
      }, YAX, { rough: 0.56, metal: 0.05, emissive: 0x7a1748, ei: 0.55 });

      cur.group.add(new THREE.Mesh(geo, fresnel(0xff9ed2, 2.4, 0.52,
        THREE.DoubleSide)));

      /* 侧链 + 主链节点 + i→i+4 氢键 */
      var sideParts = [], coreParts = [], haloParts = [];
      var HYDR = [1, 0, 0, 1, 1, 0, 1, 0, 0, 1];
      for (i = 0; i < n; i++) {
        var p = ca[i];
        var dir = new THREE.Vector3(p.x, 0, p.z).normalize();
        var sp = p.clone().addScaledVector(dir, 0.70);
        pushBall(sideParts, sp, 0.155, HYDR[i % 10] ? 0xb9386c : 0x43aec0);
        pushBond(sideParts, p, sp, 0.048, 0x8e2a5e);

        if (i >= 4) {
          var q1 = new THREE.Vector3(ca[i - 4].x * 0.42, ca[i - 4].y, ca[i - 4].z * 0.42);
          var q2 = new THREE.Vector3(p.x * 0.42, p.y, p.z * 0.42);
          bolt(coreParts, haloParts, q1, q2, 5, 0.10, 0.021, 0xd8f7ff);
        }
      }
      var sideMesh = addMerged(sideParts, { roughness: 0.38, metalness: 0.08, emissive: 0x2a0a1a, ei: 0.5 });
      var hbCore = addMerged(coreParts, { roughness: 0.2, metalness: 0, emissive: 0xbdf0ff, ei: 2.8 });
      var hbHalo = addHalo(haloParts, 0x6fd8ff, 0.20);

      sideMesh.visible = P.side;
      hbCore.visible = P.hbond;
      if (hbHalo) hbHalo.visible = P.hbond;
      cur.parts.sideMesh = sideMesh;
      cur.parts.hbMesh = hbCore;
      cur.parts.hbHalo = hbHalo;

      /* 拾取 */
      var pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
      cur.mats.push(pickMat);
      var stepA = Math.max(1, Math.round(n / 9));
      for (i = 0; i < n; i += stepA) {
        var pm = new THREE.Mesh(G.sphere, pickMat);
        pm.position.copy(ca[i]); pm.scale.setScalar(0.8);
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

      var lab = [];
      var an1 = new THREE.Object3D();
      an1.position.copy(pts[Math.floor(pts.length * 0.30)]);
      cur.group.add(an1);
      lab.push({ name: '主链缎带', sub: 'α-helix', obj: an1, ox: -262, oy: -52 });
      if (ca.length > 12) {
        var an2 = new THREE.Object3D();
        an2.position.set(ca[12].x * 0.42, ca[12].y, ca[12].z * 0.42);
        cur.group.add(an2);
        lab.push({ name: 'i → i+4 氢键', sub: '每圈 3.6 残基', obj: an2, ox: 218, oy: 58 });
      }
      cur.labels = lab;

      cur.kind = 'alpha';
      cur.stats = { residues: n, samples: pts.length };
      return { span: (n - 1) * RISE * 0.5 + 1.4, radius: R + 2.4, fit: 27 };
    }

    /* ---------------- β 折叠 ---------------- */

    function buildBeta() {
      var n = P.n;
      var SPACING = 0.60, PLEAT = 0.105, SEP = 1.95, HW = 0.40;
      var COLS = [GREEN, YELLOW, ORANGE, TEAL];
      // 自发光单独给定：直接取 stops[1] 的暗黄（0x8a6b10）在粉白主光下会被染成橙红，黄链认不出来
      var EMIS = [0x2e7320, 0xc39c18, 0x9a3d0e, 0x146b78];
      var i, k;
      var strands = [];

      for (k = 0; k < 4; k++) {
        var y0 = (k - 1.5) * SEP;
        var sgn = k % 2 === 0 ? 1 : -1;
        var arr = [];
        for (i = 0; i < n; i++) {
          var xx = (i - (n - 1) / 2) * SPACING * sgn;
          var yy = y0 + (i % 2 === 0 ? PLEAT : -PLEAT) * 0.5;
          // 片层有轻微扭转（真实的 β 片层是右手拧的），纯平面看着像木条
          var zz = Math.sin(xx * 0.10 + k * 0.6) * 0.22;
          arr.push(new THREE.Vector3(xx, yy, zz));
        }
        strands.push(arr);
      }

      var coreParts = [], haloParts = [], sideParts = [], arrowParts = [];
      var rgb = [0, 0, 0];

      for (k = 0; k < 4; k++) {
        var stops = COLS[k];
        // 缎带宽度方向 = 片层平面内的 Y 向（upAxis 用 Y），带面才正对镜头；
        // 之前用 Z 会让带子侧立成一条线，整张片层看不到面。
        var geo = ribbonMesh(strands[k], function () { return HW; }, function (f, out) {
          var nz = vnoise3(f * 7, k * 3.1, 0.6);
          rampRGB(stops, 0.42 + 0.24 * f + 0.10 * nz, out);
        }, YAX, { rough: 0.56, metal: 0.05, emissive: EMIS[k], ei: 0.62 });

        cur.group.add(new THREE.Mesh(geo, fresnel(
          k === 0 ? 0x9fe07a : k === 1 ? 0xf6e58a : k === 2 ? 0xf6b07a : 0x9fe6ee,
          2.4, 0.55, THREE.DoubleSide)));

        // 方向箭头：链尾一个三角，指向该链的 N→C
        var lastP = strands[k][n - 1], prevP = strands[k][n - 2];
        var dv = new THREE.Vector3().subVectors(lastP, prevP).normalize();
        var tip = lastP.clone().addScaledVector(dv, 0.95);
        arrowHead(arrowParts, tip, dv, ZAX, 0.70, 1.15, stops[3][1]);

        // 侧链：隔一个残基一颗，交替伸向片层前后（太多会变成糖豆）
        for (i = 0; i < n; i += 2) {
          var zs = (i % 2 === 0 ? 1 : -1) * 0.46;
          var spt = strands[k][i].clone().add(new THREE.Vector3(0, 0, zs));
          pushBall(sideParts, spt, 0.128, k % 2 === 0 ? 0xd8558c : 0x53bcd0);
          pushBond(sideParts, strands[k][i], spt, 0.026, 0x8c2456);
        }

        // 链间氢键：相邻链同一条链上的对应残基（两条链方向相反，索引要镜像，否则会连出整片放射状长线）
        if (k < 3) {
          for (i = 1; i < n - 1; i += 3) {
            bolt(coreParts, haloParts, strands[k][i], strands[k + 1][n - 1 - i], 3, 0.054, 0.019, 0xd8f7ff);
          }
        }
      }

      var sideMesh = addMerged(sideParts, { roughness: 0.4, metalness: 0.08, emissive: 0x2a0a1a, ei: 0.5 });
      addMerged(arrowParts, { roughness: 0.42, metalness: 0.12, emissive: 0x3a2a08, ei: 0.9, side: THREE.DoubleSide });
      var hbCore = addMerged(coreParts, { roughness: 0.2, metalness: 0, emissive: 0xbdf0ff, ei: 2.6 });
      var hbHalo = addHalo(haloParts, 0x6fd8ff, 0.18);

      sideMesh.visible = P.side;
      hbCore.visible = P.hbond;
      if (hbHalo) hbHalo.visible = P.hbond;
      cur.parts.sideMesh = sideMesh;
      cur.parts.hbMesh = hbCore;
      cur.parts.hbHalo = hbHalo;

      /* 拾取 */
      var pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
      cur.mats.push(pickMat);
      var stepB = Math.max(1, Math.round(n / 8));
      for (i = 0; i < n; i += stepB) {
        var pm = new THREE.Mesh(G.sphere, pickMat);
        pm.position.copy(strands[0][i]); pm.scale.setScalar(0.62);
        pm.userData.info = {
          title: '残基 ' + (i + 1),
          rows: [
            ['二级结构', 'β 折叠（反平行）'],
            ['链方向', '相邻链方向相反：→ ← → ←'],
            ['氢键', '与相邻链对应残基形成链间氢键'],
            ['残基间距', '0.35 nm（伸展构象）']
          ]
        };
        cur.group.add(pm);
        pickables.push(pm);
      }

      var lab = [];
      var an1 = new THREE.Object3D();
      // 片层几乎占满画面宽度，标签只能落在上下两条窄空带里，锚点要选最近的那条链
      an1.position.copy(strands[3][Math.floor(n * 0.35)]);
      cur.group.add(an1);
      lab.push({ name: '反向平行的链', sub: 'β-strand', obj: an1, ox: -150, oy: -52 });
      var an2 = new THREE.Object3D();
      an2.position.copy(strands[0][Math.floor(n * 0.55)]);
      cur.group.add(an2);
      lab.push({ name: '链间氢键', sub: '缝合片层', obj: an2, ox: 132, oy: 46 });
      cur.labels = lab;

      cur.kind = 'beta';
      cur.stats = { residues: n, strands: 4 };
      return { span: (n - 1) * SPACING * 0.5 + 1.6, radius: (n - 1) * SPACING * 0.32 + 2.4, fit: 28 };
    }

    /* ---------------- 核小体（参考图 2） ---------------- */

    function buildNucleosome() {
      var beads = 3;
      var rw = 1.62;           // DNA 缠绕半径（贴着组蛋白盘侧面）
      var beadsArr = [];
      var i, k;

      var linkCore = [], linkHalo = [];

      var BEAD_AT = [
        [-4.6, -1.15, 1.3, 0.86],
        [0, 0, 0, 1.18],
        [4.8, 1.30, -2.0, 0.80]
      ];
      for (k = 0; k < beads; k++) {
        var bp0 = BEAD_AT[k];
        var g = new THREE.Group();
        g.position.set(bp0[0], bp0[1], bp0[2]);
        g.scale.setScalar(bp0[3]);
        g.rotation.y = k * 0.85;
        g.rotation.z = (k % 2 ? 1 : -1) * 0.06;
        cur.group.add(g);

        /* 组蛋白八聚体：接近光滑的椭球，表面只有很轻的起伏（参考图 2 是光滑的橙色卵形） */
        var coreGeo = new THREE.SphereGeometry(1, 34, 24);
        var pos = coreGeo.attributes.position;
        var cols = new Float32Array(pos.count * 3);
        var v = new THREE.Vector3(), rgb = [0, 0, 0];
        for (i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i);
          var nz = vnoise3(v.x * 2.7 + 2, v.y * 2.7, v.z * 2.7);
          var lump = 1 + (nz - 0.5) * 0.17;
          // 超椭球（|y|^4）：侧面接近直筒、顶底收成圆角 —— 组蛋白八聚体就是这个扁盘形，
          // 用普通球体时 DNA 会在顶底"悬空"，看着像套了个圈
          var y2 = 1 - v.y * v.y;
          var prof = y2 < 0.02 ? 1 : Math.pow(Math.max(0, 1 - Math.pow(Math.abs(v.y), 4)), 0.25) / Math.sqrt(y2);
          var rr2 = 1.50 * lump;
          var nx = v.x * rr2 * prof, ny = v.y * lump * 0.86, nz2 = v.z * rr2 * prof * 0.96;
          pos.setXYZ(i, nx, ny, nz2);
          var t = 0.50 + 0.26 * (v.y * 0.5 + 0.5) + 0.18 * (nz - 0.5);
          rampRGB(AMBER, t, rgb);
          var shade = 0.72 + 0.44 * nz;
          cols[i * 3] = rgb[0] * shade; cols[i * 3 + 1] = rgb[1] * shade; cols[i * 3 + 2] = rgb[2] * shade;
        }
        coreGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        coreGeo.computeVertexNormals();
        var coreMat = new THREE.MeshStandardMaterial({
          vertexColors: true, roughness: 0.70, metalness: 0.04,
          emissive: 0x6b2408, emissiveIntensity: 0.42
        });
        var core = new THREE.Mesh(coreGeo, coreMat);
        g.add(core);
        cur.geoms.push(coreGeo); cur.mats.push(coreMat);

        // 组蛋白轮廓的暖光边
        var shell = new THREE.Mesh(coreGeo, fresnel(0xffb067, 3.0, 0.30));
        shell.scale.setScalar(1.02);
        g.add(shell);

        /* DNA 缠绕 1.65 圈：单根绳状双螺旋（表面用螺旋亮纹表现两条链的沟），横档是碱基对 */
        var a0 = -Math.PI * 0.62;
        var turns = 1.5;
        var centerPts = [];
        var SUBW = 132;
        for (i = 0; i <= SUBW; i++) {
          var t = i / SUBW;
          var ang = a0 + t * turns * Math.PI * 2;
          // 缠绕半径随高度内收：组蛋白是扁盘，等半径绕会让首末两圈在顶底悬空
          var wy = -0.80 + t * 1.60;
          var vy = Math.max(-1, Math.min(1, wy / 0.86));
          var rr = 1.50 * Math.pow(Math.max(0.05, 1 - Math.pow(Math.abs(vy), 4)), 0.25) + 0.14;
          centerPts.push(new THREE.Vector3(
            Math.cos(ang) * rr,
            wy,
            Math.sin(ang) * rr
          ));
        }

        var wcurve = new THREE.CatmullRomCurve3(centerPts);
        var TSEG = 300, TRAD = 14, TR = 0.250;
        var wgeo = new THREE.TubeGeometry(wcurve, TSEG, TR, TRAD, false);
        var wcols = new Float32Array(wgeo.attributes.position.count * 3);
        var wp = wgeo.attributes.position, wc = new THREE.Vector3(), wcen = new THREE.Vector3();
        for (i = 0; i <= TSEG; i++) {
          var uu = i / TSEG;
          wcurve.getPointAt(uu, wcen);
          for (var jj = 0; jj <= TRAD; jj++) {
            var id = i * (TRAD + 1) + jj;
            wc.fromBufferAttribute(wp, id);
            var dx = wc.x - wcen.x, dy = wc.y - wcen.y, dz = wc.z - wcen.z;
            var dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
            var angR = Math.atan2(dz, dx);
            // 两条链异色（参考图 2 是一青一品红的双螺旋）：
            // 相位在 0..1 间连续摆动，脊线处一侧纯青、另一侧纯品红，中间过渡成暗沟
            var w1 = 0.5 + 0.5 * Math.sin(angR * 2 + uu * 44);
            var c1r, c1g, c1b, c2r, c2g, c2b;
            rampRGB(TEAL, 0.08 + 0.34 * w1, rgb);
            c1r = rgb[0]; c1g = rgb[1]; c1b = rgb[2];
            rampRGB(MAGENTA, 0.08 + 0.38 * (1 - w1), rgb);
            c2r = rgb[0]; c2g = rgb[1]; c2b = rgb[2];
            var aw = (w1 * w1) / (w1 * w1 + (1 - w1) * (1 - w1) + 1e-4);
            rgb[0] = c1r * aw + c2r * (1 - aw);
            rgb[1] = c1g * aw + c2g * (1 - aw);
            rgb[2] = c1b * aw + c2b * (1 - aw);
            wcols[id * 3] = rgb[0]; wcols[id * 3 + 1] = rgb[1]; wcols[id * 3 + 2] = rgb[2];
          }
        }
        wgeo.setAttribute('color', new THREE.BufferAttribute(wcols, 3));
        var wmat = new THREE.MeshStandardMaterial({
          vertexColors: true, roughness: 0.58, metalness: 0.08,
          emissive: 0x073c48, emissiveIntensity: 0.5
        });
        g.add(new THREE.Mesh(wgeo, wmat));
        cur.geoms.push(wgeo); cur.mats.push(wmat);
        g.add(new THREE.Mesh(wgeo, fresnel(0x8ceff2, 2.9, 0.38)));

        // 碱基对横档：沿绳每隔一段一根，短而细
        var rungParts = [];
        for (i = 4; i < SUBW - 4; i += 6) {
          var pc = centerPts[i];
          var dirOut = new THREE.Vector3(pc.x, 0, pc.z).normalize();
          pushBond(rungParts, pc.clone().addScaledVector(dirOut, -TR * 1.10),
            pc.clone().addScaledVector(dirOut, TR * 1.10), 0.045, 0xc8f4ee);
        }
        var rgeo = mergeParts(rungParts);
        var rmat = new THREE.MeshStandardMaterial({
          vertexColors: true, roughness: 0.34, metalness: 0.1,
          emissive: 0x74d8d8, emissiveIntensity: 1.0
        });
        g.add(new THREE.Mesh(rgeo, rmat));
        cur.geoms.push(rgeo); cur.mats.push(rmat);

        beadsArr.push({ group: g, wrap: centerPts, rw: rw });
      }

      /* 连接 DNA：从一个核小体的出口接到下一个的入口 */
      for (k = 0; k < beads - 1; k++) {
        var A = beadsArr[k], B = beadsArr[k + 1];
        var pOut = A.wrap[A.wrap.length - 1].clone();
        A.group.localToWorld(pOut);
        var pIn = B.wrap[0].clone();
        B.group.localToWorld(pIn);
        var mid = new THREE.Vector3().addVectors(pOut, pIn).multiplyScalar(0.5);
        mid.y += 0.9 + k * 0.15;
        var lcurve = new THREE.CatmullRomCurve3([pOut, mid, pIn]);
        var lgeo = new THREE.TubeGeometry(lcurve, 60, 0.15, 9, false);
        var lcols = new Float32Array(lgeo.attributes.position.count * 3);
        var lp = lgeo.attributes.position, lc = new THREE.Vector3();
        for (i = 0; i < lp.count; i++) {
          lc.fromBufferAttribute(lp, i);
          rampRGB(TEAL, 0.44 + 0.3 * vnoise3(lc.x * 0.8, lc.y, 2.2), rgb);
          lcols[i * 3] = rgb[0]; lcols[i * 3 + 1] = rgb[1]; lcols[i * 3 + 2] = rgb[2];
        }
        lgeo.setAttribute('color', new THREE.BufferAttribute(lcols, 3));
        var lmat = new THREE.MeshStandardMaterial({
          vertexColors: true, roughness: 0.38, metalness: 0.14,
          emissive: 0x0a5566, emissiveIntensity: 0.8
        });
        cur.group.add(new THREE.Mesh(lgeo, lmat));
        cur.geoms.push(lgeo); cur.mats.push(lmat);
        cur.group.add(new THREE.Mesh(lgeo, fresnel(0x8ceff2, 2.8, 0.5)));
      }

      /* 拾取：每个核小体一个 */
      var pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
      cur.mats.push(pickMat);
      for (k = 0; k < beads; k++) {
        var pm = new THREE.Mesh(G.sphere, pickMat);
        pm.position.copy(beadsArr[k].group.position);
        pm.scale.setScalar(2.1 * beadsArr[k].group.scale.x);
        pm.userData.info = {
          title: '核小体 ' + (k + 1),
          rows: [
            ['组蛋白', '八聚体（H2A·H2B·H3·H4 各两份）'],
            ['DNA 长度', '约 147 bp'],
            ['缠绕圈数', '1.65 圈（左手超螺旋）'],
            ['作用', '把 2 m 的 DNA 装进 6 μm 的细胞核']
          ]
        };
        cur.group.add(pm);
        pickables.push(pm);
      }

      /* 标注：参考图 2 的白色引线 */
      var feat = beadsArr[1] || beadsArr[0];
      var lab = [];
      var a1 = new THREE.Object3D();
      a1.position.set(0.9, 0.55, 1.0);
      feat.group.add(a1);
      lab.push({ name: '组蛋白八聚体', sub: 'Histone octamer', obj: a1, ox: -156, oy: -96 });
      var a2 = new THREE.Object3D();
      a2.position.copy(feat.wrap[Math.floor(feat.wrap.length * 0.42)]);
      feat.group.add(a2);
      lab.push({ name: 'DNA', sub: '147 bp · 1.65 圈', obj: a2, ox: 168, oy: 16 });
      cur.labels = lab;

      cur.group.rotation.z = -0.20;
      cur.group.rotation.x = 0.10;

      cur.kind = 'nucleosome';
      cur.stats = { nucleosomes: beads, bp: beads * 147 };
      return { span: (beads - 1) * 6.2 * 0.5 + 2.6, radius: 6.4, fit: 15.5 };
    }

    /* ================================================================
     *  六、构建 / 重建
     * ================================================================ */

    function clearCur() {
      if (!cur) return;
      root.remove(cur.group);
      cur.geoms.forEach(function (g) { if (g !== G.sphere && g !== G.box && g !== G.cyl && g !== G.blob) g.dispose(); });
      cur.mats.forEach(function (m) { m.dispose(); });
      pickables = [];
      cur = null;
    }

    var spinT = 0;

    function rebuild() {
      clearCur();
      root.rotation.y = 0; spinT = 0;
      cur = { group: new THREE.Group(), geoms: [], mats: [], parts: {}, kind: 'dna', labels: [] };
      root.add(cur.group);
      var info;
      if (P.mode === 'alpha') info = buildAlpha();
      else if (P.mode === 'beta') info = buildBeta();
      else if (P.mode === 'nucleosome') info = buildNucleosome();
      else info = buildDNA();
      updateNote();
      syncLabels();
      cur.fit = info.fit || Math.max(info.span * 2.0, info.radius * 3.2, 12);
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
          '<div class="note-row"><span>侧链取向</span><b>片层上下交替</b></div>',
        nucleosome: '<div class="note-row"><span>DNA 长度</span><b>147 bp</b></div>' +
          '<div class="note-row"><span>缠绕圈数</span><b>1.65</b></div>' +
          '<div class="note-row"><span>组蛋白</span><b>八聚体</b></div>' +
          '<div class="note-row"><span>压缩比</span><b>约 7 倍</b></div>'
      };
      ctx.setNote(t[P.mode] || t.dna);
    }

    /* ================================================================
     *  七、引线标注（DOM + SVG，跟随 3D 锚点）
     * ================================================================ */

    var NS = 'http://www.w3.org/2000/svg';
    var labRoot = null, labSvg = null, labItems = [];
    var _lp = new THREE.Vector3(), _lp2 = new THREE.Vector3();

    function ensureLabelsDom() {
      if (labRoot || !stage) return;
      labRoot = document.createElement('div');
      labRoot.className = 'mol-labels';
      labSvg = document.createElementNS(NS, 'svg');
      labSvg.setAttribute('class', 'mol-leaders');
      labRoot.appendChild(labSvg);
      stage.appendChild(labRoot);
    }

    function syncLabels() {
      ensureLabelsDom();
      if (!labRoot) return;
      while (labSvg.firstChild) labSvg.removeChild(labSvg.firstChild);
      labItems.forEach(function (it) { if (it.el && it.el.parentNode) it.el.parentNode.removeChild(it.el); });
      labItems = (cur && cur.labels) ? cur.labels.slice() : [];
      labItems.forEach(function (it) {
        var el = document.createElement('div');
        el.className = 'mol-label';
        el.innerHTML = '<b>' + it.name + '</b>' + (it.sub ? '<i>' + it.sub + '</i>' : '');
        labRoot.appendChild(el);
        it.el = el;
        it.line = document.createElementNS(NS, 'line');
        it.line.setAttribute('class', 'ml-line');
        labSvg.appendChild(it.line);
        it.dot = document.createElementNS(NS, 'circle');
        it.dot.setAttribute('r', '2.4');
        it.dot.setAttribute('class', 'ml-dot');
        labSvg.appendChild(it.dot);
      });
    }

    function busy() {
      // 速览里其余镜头交给底部字幕卡讲，引线标注隐去；但「核小体」那镜是插图式构图，
      // 白引线正是主角（和讲解模式第 6 步同一套处理）
      if (HL.journey && HL.journey.active && HL.journey.active()) return P.mode !== 'nucleosome';
      // 讲解模式默认隐去标注，避免和底部字幕卡抢版面；
      // 但「核小体」那一步是插图式构图，白色引线标注正是主角，破例保留
      if (tour && tour.active && tour.active()) {
        if (P.mode === 'nucleosome' && tour.idx && tour.idx() === 5) return false;
        return true;
      }
      return false;
    }

    function updateLabels() {
      if (!labRoot) return;
      var on = P.labels && labItems.length > 0 && !busy();
      labRoot.style.display = on ? 'block' : 'none';
      if (!on) return;
      var W = stage.clientWidth, H = stage.clientHeight;
      for (var i = 0; i < labItems.length; i++) {
        var it = labItems[i];
        it.obj.getWorldPosition(_lp);
        _lp2.copy(_lp).project(camera);
        if (_lp2.z > 1 || _lp2.z < -1) { it.el.style.display = 'none'; it.line.style.display = 'none'; it.dot.style.display = 'none'; continue; }
        it.el.style.display = 'block'; it.line.style.display = 'block'; it.dot.style.display = 'block';
        var ax = (_lp2.x * 0.5 + 0.5) * W;
        var ay = (-_lp2.y * 0.5 + 0.5) * H;
        var lx = Math.max(74, Math.min(W - 74, ax + it.ox));
        var ly = Math.max(46, Math.min(H - 92, ay + it.oy));
        it.el.style.transform = 'translate(' + lx.toFixed(1) + 'px,' + ly.toFixed(1) + 'px)';
        it.line.setAttribute('x1', ax.toFixed(1));
        it.line.setAttribute('y1', ay.toFixed(1));
        it.line.setAttribute('x2', (lx + (it.ox > 0 ? -8 : 8)).toFixed(1));
        it.line.setAttribute('y2', ly.toFixed(1));
        it.dot.setAttribute('cx', ax.toFixed(1));
        it.dot.setAttribute('cy', ay.toFixed(1));
      }
    }

    rebuild();
    var f0 = cur.fit;
    camera.position.set(f0 * 0.26, f0 * 0.17, f0 * 0.95);
    camera.lookAt(0, 0, 0);

    var ray = new THREE.Raycaster();

    /* ================================================================
     *  八、讲解模式
     * ================================================================ */

    var tour = HL.Tour(ctx);
    tour.load([
      {
        t: '一、双螺旋：生命的图纸',
        d: '这就是 B-DNA：两条骨架反向平行地缠绕成右手双螺旋，直径 2.0 nm、螺距 3.4 nm、每圈 10.5 个碱基对。把你一个细胞里的 DNA 接起来约长 2 米，而它装在直径仅 6 μm 的细胞核中。1953 年沃森与克里克提出该结构，关键的 X 射线衍射数据来自罗莎琳德·富兰克林。',
        exp: '把「单元数量」拉到 60，看一条更长的双螺旋。',
        cam: [[7, 9, 38], [0, 1.2, 0]],
        pulse: null
      },
      {
        t: '二、碱基互补配对',
        d: '暖色薄片是骨架内侧的碱基：A 只与 T 配对（2 条氢键），G 只与 C 配对（3 条氢键，中间的冷白闪电更多、更牢固）。这种严格的互补性就是复制的钥匙——任何一条单链，都唯一确定了另一条链的全部信息。',
        exp: '点击任意碱基对，看它的配对关系与氢键数。',
        cam: [[6.0, 11.0, 25.0], [0, 7.2, 0]],
        pulse: [0, 8.5, 0], r: 3.6,
        apply: function () { P.unwind = 0.20; pending = true; }
      },
      {
        t: '三、解旋：复制的开始',
        d: '细胞分裂前，DNA 从一端开始解开氢键、像拉链一样分开，两条单链各自作为模板合成新链——这叫半保留复制。滑杆「解旋程度」可以亲手拉开这条拉链：已打开的部分两条骨架上下分离，碱基之间的氢键随之断开。',
        exp: '已为你拉开一半。退出讲解后拖动「解旋程度」滑杆可以合上或全开。',
        cam: [[12, 10, 31], [0, 0.8, 0]],
        pulse: [0, 4.5, 0], r: 3.0,
        apply: function () { P.unwind = 0.55; pending = true; }
      },
      {
        t: '四、α 螺旋：蛋白质的弹簧',
        d: '换一类分子。α 螺旋是蛋白质最常见的二级结构：每 3.6 个残基绕一圈、螺距 0.54 nm，由第 i 个残基与第 i+4 个之间的氢键像弹簧一样固定——屏幕上那些横穿螺旋内部的冷白闪电就是它们。头发的角蛋白、肌肉里的肌红蛋白，都是它撑起来的。',
        exp: '点击残基看它的氢键伙伴与侧链性质（疏水 / 极性）。',
        cam: [[5.2, 8.8, 17.6], [0, 0, 0]],
        pulse: [0, 0, 0], r: 2.4,
        apply: function () { P.unwind = 0; P.mode = 'alpha'; pending = true; }
      },
      {
        t: '五、β 折叠：蛋白质的片层',
        d: 'β 折叠把肽链拉成锯齿状并排成片，相邻两条链之间用氢键缝合。这里四条链的方向是 → ← → ←，两两反向平行（反平行片层）。丝纤维与蛛丝的高强度正来自这种结构；两端箭头指示的正是每条链的 N→C 方向。',
        exp: '勾选 / 取消「显示侧链」，看侧链如何交替伸向片层上下两侧。',
        cam: [[8.0, 6.4, 25.5], [0, 0, 0]],
        pulse: [0, 0, 0], r: 2.8,
        apply: function () { P.mode = 'beta'; pending = true; }
      },
      {
        t: '六、核小体：把 2 米装进 6 微米',
        d: 'DNA 并不是裸奔的。147 个碱基对绕组蛋白八聚体（H2A、H2B、H3、H4 各两份）缠绕 1.65 圈，形成核小体——这是染色质的基本单位，也是把 2 米长的基因组塞进细胞核的第一级压缩。串珠状的核小体再折叠，最终成为分裂中期看到的染色体。',
        exp: '点击任意核小体，看它的组蛋白组成与缠绕参数。',
        cam: [[4.6, 4.2, 17.2], [0, 0, 0]],
        pulse: null,
        apply: function () { P.mode = 'nucleosome'; pending = true; }
      },
      {
        t: '七、中心法则',
        d: 'DNA 携带指令，蛋白质执行生命——从 DNA 到 RNA 再到蛋白质的「中心法则」，是这两类分子在所有细胞中的分工。四种字母（A T G C）写下 30 亿碱基对的人类基因组，编码约两万个基因，最终构成你身体里的每一个细胞。',
        exp: '按 R 复位视角，回看整个分子家族。',
        cam: [[8, 10, 40], [0, 1.5, 0]],
        pulse: null,
        apply: function () { P.mode = 'dna'; P.unwind = 0; pending = true; }
      }
    ]);

    /* ================================================================
     *  九、每帧 / 参数 / 销毁
     * ================================================================ */

    var clock = 0;

    window.__MOLECULE = {
      state: function () {
        return {
          mode: P.mode, n: P.n, unwind: P.unwind, spin: P.spin, glow: P.glow,
          kind: cur && cur.kind, stats: cur && cur.stats, picks: pickables.length,
          labels: labItems.length,
          calls: ctx.renderer.info.render.calls, tris: ctx.renderer.info.render.triangles,
          box: (function () {
            if (!cur) return null;
            var bb = new THREE.Box3().setFromObject(cur.group);
            return {
              min: bb.min.toArray().map(function (v) { return +v.toFixed(2); }),
              max: bb.max.toArray().map(function (v) { return +v.toFixed(2); })
            };
          })()
        };
      },
      set: function (k, v) {
        P[k] = v;
        if (k === 'mode' || k === 'n' || k === 'unwind') pending = true;
        if (k === 'hbond' && cur && cur.parts.hbMesh) {
          cur.parts.hbMesh.visible = v;
          if (cur.parts.hbHalo) cur.parts.hbHalo.visible = v;
        }
        if (k === 'side' && cur) {
          if (cur.parts.baseMesh) cur.parts.baseMesh.visible = v;
          if (cur.parts.sideMesh) cur.parts.sideMesh.visible = v;
        }
      },
      steps: function () { return tour.count(); }
    };

    return {
      update: function (dt, tt) {
        if (pending) {
          rebuild();
          if (refit) {
            if (!busy() && ctx.controls) ctx.controls.setDistance(cur.fit);
            refit = false;
          }
        }
        clock += dt;
        spinT += dt;
        if (P.spin) {
          // β 片层是扁的，整圈自转会转到侧面变成一条线；核小体同理会被压成侧影。
          // 这两种模式改成“小幅摆动”，始终给观众一个能读的正面。
          if (P.mode === 'beta') root.rotation.y = Math.sin(spinT * 0.26) * 0.50;
          else if (P.mode === 'nucleosome') root.rotation.y = Math.sin(spinT * 0.22) * 0.26;
          else root.rotation.y += dt * 0.16;
        }

        if (P.glow) {
          var arr = atmo.children;
          for (var i = 0; i < arr.length; i++) {
            var o = arr[i];
            if (o.isSprite && o.userData.base !== undefined) {
              o.material.opacity = o.userData.base * (0.72 + 0.28 * Math.sin(clock * 0.9 + o.userData.ph));
            }
          }
          haze.material.opacity = 0.52 + 0.12 * Math.sin(clock * 0.55);
          haze2.material.opacity = 0.34 + 0.10 * Math.sin(clock * 0.42 + 1.7);
          var dp = dustGeo.attributes.position.array;
          for (var d = 0; d < DUST; d++) {
            dp[d * 3 + 1] += dustSpd[d] * dt * 0.55;
            if (dp[d * 3 + 1] > 21) dp[d * 3 + 1] = -21;
          }
          dustGeo.attributes.position.needsUpdate = true;
        }
        atmo.visible = P.glow;
        vig.style.opacity = P.glow ? '1' : '0.3';

        updateLabels();
        tour.update(dt, tt || 0, function () { });
      },

      setParam: function (key, v) {
        if (key === 'tour') { tour.toggle(); return; }
        P[key] = v;
        if (key === 'mode' || key === 'n' || key === 'unwind') {
          pending = true;
          if (key === 'mode') refit = true;
        } else if (key === 'hbond') {
          if (cur && cur.parts.hbMesh) {
            cur.parts.hbMesh.visible = v;
            if (cur.parts.hbHalo) cur.parts.hbHalo.visible = v;
          }
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
        if (labRoot && labRoot.parentNode) labRoot.parentNode.removeChild(labRoot);
        labRoot = null; labSvg = null; labItems = [];
        clearCur();
        G.sphere.dispose(); G.box.dispose(); G.cyl.dispose(); G.blob.dispose();
        fresnelMats.forEach(function (m) { m.dispose(); });
        bokehMats.forEach(function (m) { m.dispose(); });
        bokehTex.forEach(function (t) { t.dispose(); });
        shaftTex.dispose(); dustTex.dispose(); dustGeo.dispose();
        hazeTex.dispose();
        if (scene.background && scene.background.dispose) scene.background.dispose();
        scene.background = null;
        scene.fog = null;
      }
    };
  }
});
