/**
 * 场景：麦克斯韦方程组（四区全景 · 电影级科研可视化）
 *
 * 布局（世界坐标，Y 向上）：
 *   Ⅰ 左区  (-12.6, 3.6)  点电荷 + 高斯球    ∇·E = ρ/ε₀
 *   Ⅱ 中区  (  0  , 3.6)  条形磁体 + 磁通球  ∇·B = 0
 *   Ⅲ 右区  ( 12.6, 3.6)  平面电磁波        ∇×E = −∂B/∂t ，∇×B = μ₀ε₀∂E/∂t
 *   Ⅳ 下方  (  0  ,-5.6)  法拉第线圈 ∥ 安培电容器  —— 电子流与位移电流
 *
 * 视觉规范：暗色深空 + 霓虹线框 + 菲涅尔玻璃高斯面 + 体积光 + HUD 公式卡片
 */
(function (global) {
  'use strict';

  /* ================= 物理常量（SI / CODATA 2018） ================= */
  var EPS0 = 8.8541878128e-12;            // 真空介电常数 F/m
  var MU0 = 1.25663706212e-6;             // 真空磁导率 H/m
  var CLIGHT = 1 / Math.sqrt(EPS0 * MU0); // 299792458 m/s
  var KE = 1 / (4 * Math.PI * EPS0);      // 库仑常数 8.9875e9
  var UNIT_M = 0.01;                      // 磁区场景单位 → 米（1 单位 = 1 cm）

  /* ================= 配色 ================= */
  var C = {
    eLine: 0x35e8ff,      // 电力线 青
    fluxOut: 0x6ef7c8,    // 电通量箭头（源，向外）青绿
    fluxIn: 0xffb454,     // 电通量箭头（汇，向内）橙
    magN: 0xff4d6d,       // N 极 红
    magS: 0x4d8dff,       // S 极 蓝
    mOut: 0xffa04d,       // 磁通穿出 暖橙
    mIn: 0x6ea8ff,        // 磁通穿入 蓝
    waveE: 0x35e8ff,      // 波 E 青
    waveB: 0xff7a45,      // 波 B 橙红
    poynt: 0xffdc3c,      // 坡印廷矢量 黄
    disp: 0xc9a6ff,       // 位移电流 紫
    elec: 0x8fe0ff,       // 电子流 冷蓝
    copper: 0xc98a5a,     // 导线 铜
    plate: 0xb9c7da,      // 极板 银
    glass: 0x46e6ff,      // 高斯面 玻璃青
    gold: 0xffd166,       // 电荷 金
    text: '#dce7f5'
  };

  var POS = {
    A: [-12.6, 3.6, 0],
    B: [0, 3.6, 0],
    C: [12.6, 3.6, 0],
    D: [0, -5.6, 0]
  };

  /* ================= 小工具 ================= */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function hex2css(h) { return '#' + ('000000' + h.toString(16)).slice(-6); }

  /** 斐波那契球面分布（单位向量） */
  function fibSphere(n) {
    var out = [], ga = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < n; i++) {
      var y = 1 - (2 * i + 1) / n;
      var r = Math.sqrt(Math.max(0, 1 - y * y));
      var th = ga * i;
      out.push([Math.cos(th) * r, y, Math.sin(th) * r]);
    }
    return out;
  }

  /** 数字格式化：k/M/G/T/m/µ/n/p */
  function si(v, unit, digits) {
    var d = digits === undefined ? 2 : digits;
    var a = Math.abs(v);
    var U = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''],
    [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
    if (a === 0) return '0 ' + unit;
    for (var i = 0; i < U.length; i++) {
      if (a >= U[i][0]) return (v / U[i][0]).toFixed(d) + ' ' + U[i][1] + unit;
    }
    return v.toExponential(2) + ' ' + unit;
  }

  function sci(v, d) { return v.toExponential(d === undefined ? 3 : d); }

  /* ================= 通用构件 ================= */

  /** 动态折线集（LineSegments） */
  function mkLines(THREE, parent, segs, color, opt) {
    opt = opt || {};
    var pos = new Float32Array(segs * 6);
    var col = new Float32Array(segs * 6);
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (opt.vertexColors) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var m = new THREE.LineBasicMaterial({
      color: color, transparent: true, opacity: opt.opacity === undefined ? 0.9 : opt.opacity,
      vertexColors: !!opt.vertexColors, blending: opt.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false
    });
    var ls = new THREE.LineSegments(g, m);
    ls.frustumCulled = false;
    parent.add(ls);
    return {
      obj: ls, pos: pos, col: col, segs: segs,
      set: function (i, ax, ay, az, bx, by, bz) {
        var o = i * 6;
        pos[o] = ax; pos[o + 1] = ay; pos[o + 2] = az;
        pos[o + 3] = bx; pos[o + 4] = by; pos[o + 5] = bz;
      },
      setCol: function (i, ar, ag, ab, br, bg, bb) {
        var o = i * 6;
        col[o] = ar; col[o + 1] = ag; col[o + 2] = ab;
        col[o + 3] = br; col[o + 4] = bg; col[o + 5] = bb;
      },
      hide: function (i) { var o = i * 6; for (var k = 0; k < 6; k++) pos[o + k] = 0; },
      flush: function () {
        g.attributes.position.needsUpdate = true;
        if (opt.vertexColors) g.attributes.color.needsUpdate = true;
      }
    };
  }

  /** 动态连续折线（LineStrip） */
  function mkStrip(THREE, parent, n, color, opt) {
    opt = opt || {};
    var pos = new Float32Array(n * 3);
    var col = new Float32Array(n * 3);
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (opt.vertexColors) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var m = new THREE.LineBasicMaterial({
      color: color, transparent: true, opacity: opt.opacity === undefined ? 0.95 : opt.opacity,
      vertexColors: !!opt.vertexColors, blending: opt.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false
    });
    var l = new THREE.Line(g, m);
    l.frustumCulled = false;
    parent.add(l);
    return {
      obj: l, pos: pos, col: col, n: n,
      set: function (i, x, y, z) { var o = i * 3; pos[o] = x; pos[o + 1] = y; pos[o + 2] = z; },
      setCol: function (i, r, gg, b) { var o = i * 3; col[o] = r; col[o + 1] = gg; col[o + 2] = b; },
      flush: function () {
        g.attributes.position.needsUpdate = true;
        if (opt.vertexColors) g.attributes.color.needsUpdate = true;
      }
    };
  }

  /** 实例化箭头场（锥体沿 +Y，按方向旋转，可逐实例着色） */
  function mkArrows(THREE, parent, count, color, size, useColor) {
    var s = size || 1;
    var geo = new THREE.ConeGeometry(0.075 * s, 0.26 * s, 8);
    geo.translate(0, 0.13 * s, 0);
    var mat = new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    var im = new THREE.InstancedMesh(geo, mat, count);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;
    parent.add(im);
    var _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion();
    var _m = new THREE.Matrix4(), _sc = new THREE.Vector3(1, 1, 1);
    var _d = new THREE.Vector3(), _p = new THREE.Vector3();
    var _c = new THREE.Color();
    return {
      obj: im, count: count,
      set: function (i, px, py, pz, dx, dy, dz, scale) {
        _d.set(dx, dy, dz);
        var len = _d.length();
        if (len < 1e-9 || !scale) { _m.makeScale(0, 0, 0); im.setMatrixAt(i, _m); return; }
        _d.multiplyScalar(1 / len);
        _q.setFromUnitVectors(_up, _d);
        _sc.set(1, clamp(scale, 0.05, 6), 1);
        _p.set(px, py, pz);
        _m.compose(_p, _q, _sc);
        im.setMatrixAt(i, _m);
      },
      setColor: function (i, hex) {
        if (!useColor) return;
        _c.setHex(hex);
        im.setColorAt(i, _c);
      },
      hide: function (i) { _m.makeScale(0, 0, 0); im.setMatrixAt(i, _m); },
      flush: function () {
        im.instanceMatrix.needsUpdate = true;
        if (useColor && im.instanceColor) im.instanceColor.needsUpdate = true;
      }
    };
  }

  /** 菲涅尔玻璃材质（高斯面 / 光罩） */
  function glassMat(THREE, color, opt) {
    opt = opt || {};
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uTime: { value: 0 },
        uPower: { value: opt.power || 2.4 },
        uOpacity: { value: opt.opacity === undefined ? 0.5 : opt.opacity },
        uBand: { value: opt.band === undefined ? 1 : opt.band }
      },
      vertexShader: [
        'varying vec3 vN; varying vec3 vV; varying vec3 vP;',
        'void main(){',
        '  vec4 mv = modelViewMatrix * vec4(position,1.0);',
        '  vN = normalize(normalMatrix * normal);',
        '  vV = normalize(-mv.xyz);',
        '  vP = position;',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor; uniform float uTime; uniform float uPower;',
        'uniform float uOpacity; uniform float uBand;',
        'varying vec3 vN; varying vec3 vV; varying vec3 vP;',
        'void main(){',
        '  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));',
        '  f = pow(clamp(f,0.0,1.0), uPower);',
        '  float band = 0.5 + 0.5*sin(vP.y*3.0 - uTime*0.8);',
        '  float a = uOpacity * (0.16 + f*2.0) * (1.0 - uBand*0.35 + uBand*0.35*band);',
        '  vec3 col = uColor * (0.30 + f*1.7);',
        '  gl_FragColor = vec4(col, clamp(a,0.0,1.0));',
        '}'
      ].join('\n'),
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
  }

  /** 体积光锥（顶点在上，向下扩散） */
  function volCone(THREE, parent, radius, height, color, opacity) {
    var g = new THREE.ConeGeometry(radius, height, 40, 1, true);
    var m = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uTime: { value: 0 },
        uH: { value: height },
        uOpacity: { value: opacity === undefined ? 0.16 : opacity }
      },
      vertexShader: [
        'varying float vY; varying vec2 vUv;',
        'uniform float uH;',
        'void main(){',
        '  vY = clamp(position.y/uH + 0.5, 0.0, 1.0);',
        '  vUv = uv;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor; uniform float uTime; uniform float uOpacity;',
        'varying float vY; varying vec2 vUv;',
        'void main(){',
        '  float a = pow(vY, 2.6);',
        '  float flick = 0.86 + 0.14*sin(uTime*1.1 + vUv.x*12.56) ;',
        '  float edge = 0.55 + 0.45*sin(vUv.x*3.1416);',
        '  gl_FragColor = vec4(uColor, a*uOpacity*flick*edge);',
        '}'
      ].join('\n'),
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    var mesh = new THREE.Mesh(g, m);
    parent.add(mesh);
    return { obj: mesh, mat: m };
  }

  /** 渐变圆点贴图（Points 用） */
  function dotTexture(THREE) {
    var cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    var c = cv.getContext('2d');
    var g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    var t = new THREE.CanvasTexture(cv);
    return t;
  }

  /** 发光点集 */
  function mkPoints(THREE, parent, n, color, size, tex) {
    var pos = new Float32Array(n * 3);
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var m = new THREE.PointsMaterial({
      color: color, size: size || 0.16, map: tex || null,
      transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending,
      depthWrite: false, sizeAttenuation: true
    });
    var p = new THREE.Points(g, m);
    p.frustumCulled = false;
    parent.add(p);
    return {
      obj: p, pos: pos, n: n,
      set: function (i, x, y, z) { var o = i * 3; pos[o] = x; pos[o + 1] = y; pos[o + 2] = z; },
      hide: function (i) { var o = i * 3; pos[o] = 1e5; pos[o + 1] = 1e5; pos[o + 2] = 1e5; },
      flush: function () { g.attributes.position.needsUpdate = true; }
    };
  }

  /** 霓虹边框（EdgesGeometry） */
  function neonEdges(THREE, parent, geo, color, opacity) {
    var e = new THREE.EdgesGeometry(geo, 25);
    var m = new THREE.LineBasicMaterial({
      color: color, transparent: true, opacity: opacity === undefined ? 0.85 : opacity,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    var l = new THREE.LineSegments(e, m);
    parent.add(l);
    return l;
  }

  /** 文字标签精灵（带霓虹外发光，宽度自适应） */
  function mkTag(THREE, parent, text, color, scale, opt) {
    opt = opt || {};
    var FS = 68;
    var measure = document.createElement('canvas').getContext('2d');
    measure.font = '700 ' + FS + 'px "Microsoft YaHei","Segoe UI",sans-serif';
    var tw = Math.ceil(measure.measureText(text).width);
    var W = Math.max(128, tw + 96), H = 128;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    c.font = '700 ' + FS + 'px "Microsoft YaHei","Segoe UI",sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = color; c.shadowBlur = 26;
    c.fillStyle = color;
    c.fillText(text, W / 2, H / 2);
    c.shadowBlur = 10; c.fillStyle = '#ffffff';
    c.globalAlpha = 0.55; c.fillText(text, W / 2, H / 2);
    var tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: opt.opacity === undefined ? 1 : opt.opacity
    }));
    var s = scale || 1;
    var unit = 4.0 * s / 512;            // 保持与旧版相同的每像素世界尺寸
    sp.scale.set(W * unit, H * unit, 1);
    sp.renderOrder = 998;
    parent.add(sp);
    return sp;
  }

  /** 区域标牌（带左侧霓虹竖条） */
  function mkPlate(THREE, parent, title, sub, color, scale) {
    var W = 1024, H = 200;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    c.fillStyle = color; c.shadowColor = color; c.shadowBlur = 22;
    c.fillRect(28, 46, 10, 108);
    c.shadowBlur = 0;
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.font = '700 76px "Microsoft YaHei","Segoe UI",sans-serif';
    c.fillStyle = '#eaf3ff';
    c.fillText(title, 74, 80);
    c.font = '500 40px "Segoe UI","Microsoft YaHei",sans-serif';
    c.fillStyle = 'rgba(150,175,205,0.92)';
    c.fillText(sub, 76, 142);
    var tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    var s = scale || 1;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false
    }));
    sp.scale.set(6.2 * s, 1.21 * s, 1);
    sp.renderOrder = 997;
    parent.add(sp);
    return sp;
  }

  /* ================= HUD 公式卡片 ================= */

  /**
   * token: {s:'文本', c:'#颜色', sz:相对字号, sub:true, sup:true, b:true}
   */
  function drawTokens(c, tokens, cx, baseY, baseSize, mono) {
    var items = [], total = 0, i;
    for (i = 0; i < tokens.length; i++) {
      var tk = tokens[i];
      var size = baseSize * (tk.sz || 1);
      c.font = (tk.b ? '700 ' : '500 ') + size + 'px ' +
        (mono ? '"Consolas","DejaVu Sans Mono",monospace' : '"Cambria Math","Segoe UI Symbol","Microsoft YaHei",serif');
      var w = c.measureText(tk.s).width;
      items.push({ tk: tk, w: w, size: size });
      total += w;
    }
    var x = cx - total / 2;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      var y = baseY + (it.tk.sub ? it.size * 0.30 : (it.tk.sup ? -it.size * 0.40 : 0));
      c.font = (it.tk.b ? '700 ' : '500 ') + it.size + 'px ' +
        (mono ? '"Consolas","DejaVu Sans Mono",monospace' : '"Cambria Math","Segoe UI Symbol","Microsoft YaHei",serif');
      c.fillStyle = it.tk.c || '#e8f2ff';
      c.fillText(it.tk.s, x + it.w / 2, y);
      x += it.w;
    }
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  /**
   * 卡片：{title, accent, formula, sub, note, rows:[{k,v,c}]}
   * 3D 尺寸 w × h（世界单位），纹理分辨率固定 1024×560
   */
  function mkCard(THREE, parent, w, h, def) {
    var W = 1024, H = 560;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    var tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;

    var geo = new THREE.PlaneGeometry(w, h);
    var mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 900;
    parent.add(mesh);

    var card = { title: def.title, accent: def.accent, formula: def.formula, sub: def.sub, note: def.note, rows: def.rows || [] };

    function redraw() {
      c.clearRect(0, 0, W, H);
      // 玻璃底板
      c.save();
      roundRect(c, 10, 10, W - 20, H - 20, 26);
      var g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(10,18,34,0.90)');
      g.addColorStop(1, 'rgba(5,10,20,0.94)');
      c.fillStyle = g; c.fill();
      c.lineWidth = 3; c.strokeStyle = card.accent;
      c.globalAlpha = 0.55; c.stroke(); c.globalAlpha = 1;
      c.restore();

      // 顶部霓虹细线
      c.save();
      roundRect(c, 10, 10, W - 20, H - 20, 26);
      c.clip();
      var lg = c.createLinearGradient(0, 0, W, 0);
      lg.addColorStop(0, card.accent); lg.addColorStop(0.5, 'rgba(255,255,255,0)');
      lg.addColorStop(1, card.accent);
      c.fillStyle = lg; c.globalAlpha = 0.85;
      c.fillRect(10, 10, W - 20, 5);
      c.globalAlpha = 1;
      c.restore();

      // 标题
      c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillStyle = card.accent;
      c.fillRect(46, 52, 8, 34);
      c.font = '700 34px "Microsoft YaHei","Segoe UI",sans-serif';
      c.fillStyle = '#dbe8f7';
      c.fillText(card.title, 70, 70);

      // 主公式
      drawTokens(c, card.formula, W / 2, 168, 78, false);
      // 副公式
      if (card.sub) drawTokens(c, card.sub, W / 2, 246, 34, false);
      // 说明
      c.textAlign = 'center';
      c.font = '400 28px "Microsoft YaHei","Segoe UI",sans-serif';
      c.fillStyle = 'rgba(143,163,189,0.95)';
      c.fillText(card.note || '', W / 2, 306);

      // 分隔线
      c.strokeStyle = 'rgba(120,150,190,0.22)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(52, 344); c.lineTo(W - 52, 344); c.stroke();

      // 读数行
      var y0 = 388, dy = 62;
      for (var i = 0; i < card.rows.length; i++) {
        var r = card.rows[i];
        var y = y0 + i * dy;
        c.textAlign = 'left';
        c.font = '400 27px "Microsoft YaHei","Segoe UI",sans-serif';
        c.fillStyle = 'rgba(140,162,192,0.95)';
        c.fillText(r.k, 52, y);
        c.textAlign = 'right';
        c.font = '600 30px "Consolas","DejaVu Sans Mono",monospace';
        c.fillStyle = r.c || '#e8f2ff';
        c.fillText(r.v, W - 52, y);
      }
      tex.needsUpdate = true;
    }

    redraw();

    return {
      mesh: mesh,
      card: card,
      setRows: function (rows) { card.rows = rows; },
      redraw: redraw
    };
  }

  /* ================= 主场景 ================= */

  HL.registerScene({
    id: 'maxwell',
    name: '麦克斯韦方程组',
    short: '电磁学的四行诗',
    icon: '⚡',
    desc: '四区全景：高斯电通量 · 高斯磁通量 · 平面电磁波 · 法拉第与安培-麦克斯韦',
    fov: 42,
    minDistance: 3,
    maxDistance: 260,
    controls: [
      { type: 'button', key: 'tour', label: '📖 讲解模式' },
      {
        type: 'buttons', key: 'focus', label: '视角', value: 'overview', options: [
          { label: '全景', value: 'overview' },
          { label: 'Ⅰ 高斯', value: 'A' },
          { label: 'Ⅱ 磁', value: 'B' },
          { label: 'Ⅲ 波', value: 'C' },
          { label: 'Ⅳ 电路', value: 'D' }
        ]
      },
      { type: 'range', key: 'q', label: '电荷 q', min: 1, max: 24, step: 0.5, value: 8, unit: ' nC' },
      {
        type: 'buttons', key: 'qsign', label: '电荷极性', value: 1, options: [
          { label: '+q 源', value: 1 }, { label: '−q 汇', value: -1 }
        ]
      },
      { type: 'range', key: 'R', label: '高斯面半径 R', min: 1.6, max: 4.4, step: 0.1, value: 3.0, unit: ' m' },
      { type: 'range', key: 'lines', label: '磁力线条数', min: 8, max: 36, step: 2, value: 20 },
      { type: 'range', key: 'lambda', label: '波长 λ', min: 1.5, max: 6, step: 0.1, value: 3.0, unit: ' m' },
      { type: 'range', key: 'E0', label: '电场振幅 E₀', min: 20, max: 200, step: 5, value: 100, unit: ' V/m' },
      { type: 'range', key: 'drive', label: '电路驱动频率', min: 0.1, max: 1.2, step: 0.05, value: 0.40, unit: ' Hz' },
      { type: 'range', key: 'speed', label: '时间流速', min: 0, max: 2.5, step: 0.05, value: 1, unit: '×' },
      { type: 'check', key: 'monopole', label: '假想磁单极（反事实）', value: false },
      { type: 'check', key: 'arrows', label: '通量箭头', value: true },
      { type: 'check', key: 'volumetric', label: '体积光与网格', value: true },
      { type: 'check', key: 'cards', label: 'HUD 公式卡片', value: true },
      {
        type: 'legend', items: [
          ['电场 E / 电力线', '#35e8ff'],
          ['电通量（出 / 入）', '#6ef7c8'],
          ['磁场 N 极 / S 极', '#ff4d6d'],
          ['磁通（出 / 入）', '#ffa04d'],
          ['磁场 B（波）', '#ff7a45'],
          ['坡印廷能流 S', '#ffdc3c'],
          ['电子流', '#8fe0ff'],
          ['位移电流', '#c9a6ff']
        ]
      }
    ],

    create: function (ctx) {
      var THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera, controls = ctx.controls;

      var P = {
        focus: 'overview', q: 8, qsign: 1, R: 3.0, lines: 20, lambda: 3.0, E0: 100,
        drive: 0.40, speed: 1, monopole: false, arrows: true, volumetric: true, cards: true
      };

      var T = 0;              // 场景时间（受 speed 影响）
      var dotTex = dotTexture(THREE);

      /* ---------- 深空背景 ---------- */
      scene.fog = new THREE.FogExp2(0x04060e, 0.0075);

      var bgGeo = new THREE.SphereGeometry(600, 32, 24);
      var bgMat = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false,
        uniforms: {},
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: [
          'varying vec3 vP;',
          'void main(){',
          '  float h = clamp(vP.y*0.5+0.5, 0.0, 1.0);',
          '  vec3 top = vec3(0.016,0.027,0.055);',
          '  vec3 mid = vec3(0.035,0.055,0.105);',
          '  vec3 bot = vec3(0.008,0.012,0.028);',
          '  vec3 c = mix(bot, mid, smoothstep(0.0,0.55,h));',
          '  c = mix(c, top, smoothstep(0.55,1.0,h));',
          '  float neb = pow(max(0.0, 1.0-abs(vP.y-0.05)*2.2), 3.0);',
          '  c += vec3(0.05,0.02,0.09)*neb*0.55;',
          '  gl_FragColor = vec4(c,1.0);',
          '}'
        ].join('\n')
      });
      scene.add(new THREE.Mesh(bgGeo, bgMat));

      var stars = ctx.makeStars(3000, 900);
      stars.material.fog = false;
      scene.add(stars);

      // 星云团
      (function () {
        var cols = [0x2a4a8f, 0x6a2f8f, 0x1f6f8f];
        for (var i = 0; i < 3; i++) {
          var sp = new THREE.Sprite(ctx.glowSprite(hex2css(cols[i])));
          sp.scale.setScalar(180 + i * 60);
          sp.position.set(-260 + i * 250, 120 - i * 90, -320);
          sp.material.opacity = 0.12;
          scene.add(sp);
        }
      })();

      /* ---------- 灯光 ---------- */
      scene.add(new THREE.AmbientLight(0x8fa8c8, 0.85));
      var key1 = new THREE.DirectionalLight(0xbfe4ff, 0.85); key1.position.set(6, 14, 12); scene.add(key1);
      var key2 = new THREE.DirectionalLight(0xff9d7a, 0.35); key2.position.set(-12, -4, -8); scene.add(key2);
      var pl1 = new THREE.PointLight(0x35e8ff, 1.2, 40); pl1.position.set(POS.A[0], POS.A[1], 4); scene.add(pl1);
      var pl2 = new THREE.PointLight(0xffd166, 0.9, 30); pl2.position.set(0, POS.D[1] + 1, 6); scene.add(pl2);

      /* ---------- 网格地面 ---------- */
      var floorMat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(0x2f7fa8) } },
        vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: [
          'uniform vec3 uColor; varying vec3 vW;',
          'void main(){',
          '  vec2 p1 = vW.xz*0.5; vec2 g1 = abs(fract(p1)-0.5);',
          '  float l1 = smoothstep(0.030,0.0,min(g1.x,g1.y));',
          '  vec2 p2 = vW.xz*0.1; vec2 g2 = abs(fract(p2)-0.5);',
          '  float l2 = smoothstep(0.010,0.0,min(g2.x,g2.y));',
          '  float r = length(vW.xz);',
          '  float fade = (1.0-smoothstep(10.0,52.0,r));',
          '  float a = (l1*0.30 + l2*0.5)*fade;',
          '  gl_FragColor = vec4(uColor*(0.6+0.8*l2), a);',
          '}'
        ].join('\n'),
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
      });
      var floor = new THREE.Mesh(new THREE.PlaneGeometry(130, 110), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -13;
      scene.add(floor);

      /* ---------- 四个区域组 ---------- */
      var gA = new THREE.Group(); gA.position.set(POS.A[0], POS.A[1], POS.A[2]); scene.add(gA);
      var gB = new THREE.Group(); gB.position.set(POS.B[0], POS.B[1], POS.B[2]); scene.add(gB);
      var gC = new THREE.Group(); gC.position.set(POS.C[0], POS.C[1], POS.C[2]); scene.add(gC);
      var gD = new THREE.Group(); gD.position.set(POS.D[0], POS.D[1], POS.D[2]); scene.add(gD);

      /* ============================================================
       * Ⅰ 左区：点电荷 + 高斯球（∇·E = ρ/ε₀）
       * ========================================================== */
      var A = {};
      (function buildA() {
        // 点电荷
        A.charge = new THREE.Mesh(
          new THREE.SphereGeometry(0.42, 32, 24),
          new THREE.MeshStandardMaterial({
            color: 0xffe9a8, emissive: 0xffc94d, emissiveIntensity: 1.5,
            roughness: 0.25, metalness: 0.1
          })
        );
        gA.add(A.charge);
        A.glow = new THREE.Sprite(ctx.glowSprite('rgba(255,214,120,0.95)'));
        A.glow.scale.setScalar(3.6);
        gA.add(A.glow);

        // 电力线（dash 流动）
        A.NL = 46;                 // 电力线条数
        A.ND = 7;                  // 每条线的 dash 数
        A.lines = mkLines(THREE, gA, A.NL * A.ND, 0xffffff, { vertexColors: true, additive: true, opacity: 0.95 });
        A.dirs = fibSphere(A.NL);

        // 玻璃高斯球 + 线框
        A.glass = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), glassMat(THREE, C.glass, { opacity: 0.42, power: 2.3 }));
        gA.add(A.glass);
        A.wire = new THREE.Mesh(
          new THREE.SphereGeometry(1, 26, 18),
          new THREE.MeshBasicMaterial({
            color: C.glass, wireframe: true, transparent: true, opacity: 0.10,
            blending: THREE.AdditiveBlending, depthWrite: false
          })
        );
        gA.add(A.wire);
        // 赤道环 + 两条经线环（霓虹）
        function ring(ry, rx, color, op) {
          var g = new THREE.TorusGeometry(1, 0.006, 8, 128);
          var m = new THREE.MeshBasicMaterial({
            color: color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false
          });
          var t = new THREE.Mesh(g, m);
          t.rotation.x = rx; t.rotation.y = ry;
          return t;
        }
        A.ring1 = ring(0, Math.PI / 2, C.glass, 0.55);
        A.ring2 = ring(0, 0, C.glass, 0.30);
        A.ring3 = ring(Math.PI / 2, Math.PI / 2, C.glass, 0.30);
        gA.add(A.ring1); gA.add(A.ring2); gA.add(A.ring3);

        // 通量箭头
        A.NA = 78;
        A.arrows = mkArrows(THREE, gA, A.NA, C.fluxOut, 1.05, true);
        A.adirs = fibSphere(A.NA);

        // 通量粒子（外扩）
        A.parts = mkPoints(THREE, gA, 160, C.fluxOut, 0.14, dotTex);
        A.pdirs = fibSphere(160);

        // 体积光
        A.vol = volCone(THREE, gA, 3.4, 9.5, 0x35e8ff, 0.13);

        // 标签
        A.tagQ = mkTag(THREE, gA, '+q', '#ffd166', 0.62);
        A.tagQ.position.set(0.95, 0.85, 0);
        A.tagS = mkTag(THREE, gA, 'S', '#7ef0ff', 0.42);
        A.plate = mkPlate(THREE, gA, 'Ⅰ · 高斯定律', "GAUSS'S LAW  ·  ∇·E = ρ/ε₀", '#35e8ff', 1);
        A.plate.position.set(0, -5.2, 0);
      })();

      /* ============================================================
       * Ⅱ 中区：条形磁体 + 磁通高斯球（∇·B = 0）
       * ========================================================== */
      var B = {};
      B.pN = new THREE.Vector3(-0.85, 0, 0);
      B.pS = new THREE.Vector3(0.85, 0, 0);
      B.QM = 1.05;                 // 等效磁荷 A·m

      /** 磁场（场景单位，返回方向场，仅方向有意义） */
      function fieldB(p, mono, out) {
        var q = B.QM;
        out.set(0, 0, 0);
        var dx = p.x - B.pN.x, dy = p.y - B.pN.y, dz = p.z - B.pN.z;
        var r2 = dx * dx + dy * dy + dz * dz + 1e-4;
        var r = Math.sqrt(r2), k = q / (r2 * r);
        out.x += k * dx; out.y += k * dy; out.z += k * dz;
        if (!mono) {
          dx = p.x - B.pS.x; dy = p.y - B.pS.y; dz = p.z - B.pS.z;
          r2 = dx * dx + dy * dy + dz * dz + 1e-4;
          r = Math.sqrt(r2); k = -q / (r2 * r);
          out.x += k * dx; out.y += k * dy; out.z += k * dz;
        }
        return out;
      }

      /** 磁场 SI（p 为场景单位 → 米） */
      function fieldBSI(px, py, pz, mono, out) {
        var s = UNIT_M, k0 = MU0 / (4 * Math.PI) * B.QM;
        out.set(0, 0, 0);
        var dx = (px - B.pN.x) * s, dy = (py - B.pN.y) * s, dz = (pz - B.pN.z) * s;
        var r2 = dx * dx + dy * dy + dz * dz + 1e-9;
        var r = Math.sqrt(r2), k = k0 / (r2 * r);
        out.x += k * dx; out.y += k * dy; out.z += k * dz;
        if (!mono) {
          dx = (px - B.pS.x) * s; dy = (py - B.pS.y) * s; dz = (pz - B.pS.z) * s;
          r2 = dx * dx + dy * dy + dz * dz + 1e-9;
          r = Math.sqrt(r2); k = -k0 / (r2 * r);
          out.x += k * dx; out.y += k * dy; out.z += k * dz;
        }
        return out;
      }

      (function buildB() {
        // 磁体
        var bodyGeo = new THREE.BoxGeometry(3.2, 0.9, 0.9);
        B.bodyN = new THREE.Mesh(bodyGeo.clone(), new THREE.MeshStandardMaterial({
          color: 0x7a1f33, emissive: C.magN, emissiveIntensity: 0.30, roughness: 0.4, metalness: 0.55
        }));
        B.bodyS = new THREE.Mesh(bodyGeo.clone(), new THREE.MeshStandardMaterial({
          color: 0x1f3a7a, emissive: C.magS, emissiveIntensity: 0.30, roughness: 0.4, metalness: 0.55
        }));
        B.bodyN.position.set(-0.8, 0, 0); B.bodyS.position.set(0.8, 0, 0);
        B.bodyN.scale.x = 0.5; B.bodyS.scale.x = 0.5;
        gB.add(B.bodyN); gB.add(B.bodyS);
        neonEdges(THREE, B.bodyN, B.bodyN.geometry, C.magN, 0.9);
        neonEdges(THREE, B.bodyS, B.bodyS.geometry, C.magS, 0.9);
        B.tagN = mkTag(THREE, gB, 'N', '#ff8095', 0.5); B.tagN.position.set(-1.75, 0, 0);
        B.tagS = mkTag(THREE, gB, 'S', '#8fb4ff', 0.5); B.tagS.position.set(1.75, 0, 0);

        // 磁单极（反事实）
        B.monoBall = new THREE.Mesh(
          new THREE.SphereGeometry(0.55, 32, 24),
          new THREE.MeshStandardMaterial({ color: 0xff6b7f, emissive: C.magN, emissiveIntensity: 1.4, roughness: 0.3 })
        );
        B.monoBall.position.copy(B.pN);
        B.monoBall.visible = false;
        gB.add(B.monoBall);
        B.monoGlow = new THREE.Sprite(ctx.glowSprite('rgba(255,90,120,0.95)'));
        B.monoGlow.scale.setScalar(3.4); B.monoGlow.position.copy(B.pN);
        B.monoGlow.visible = false;
        gB.add(B.monoGlow);

        // 磁力线（预计算，动态重建）
        B.lineGroup = new THREE.Group(); gB.add(B.lineGroup);
        B.flows = null;
        B.flowPts = mkPoints(THREE, gB, 36 * 3, 0xffffff, 0.24, dotTex);

        // 磁通高斯球（带楔形切口，可看到内部）
        B.SR = 3.3;
        var sphGeo = new THREE.SphereGeometry(B.SR, 44, 26, Math.PI * 0.42, Math.PI * 1.58);
        B.glass = new THREE.Mesh(sphGeo, glassMat(THREE, 0x7fd6ff, { opacity: 0.34, power: 2.6 }));
        gB.add(B.glass);
        B.wire = new THREE.Mesh(
          new THREE.SphereGeometry(B.SR, 22, 14, Math.PI * 0.42, Math.PI * 1.58),
          new THREE.MeshBasicMaterial({
            color: 0x7fd6ff, wireframe: true, transparent: true, opacity: 0.075,
            blending: THREE.AdditiveBlending, depthWrite: false
          })
        );
        gB.add(B.wire);

        // 切口边缘霓虹弧
        function edgeArc(phi, color) {
          var pts = [], n = 64;
          for (var i = 0; i <= n; i++) {
            var th = Math.PI * i / n;
            pts.push(new THREE.Vector3(
              B.SR * Math.sin(th) * Math.cos(phi),
              B.SR * Math.cos(th),
              B.SR * Math.sin(th) * Math.sin(phi)
            ));
          }
          var g = new THREE.BufferGeometry().setFromPoints(pts);
          var m = new THREE.LineBasicMaterial({
            color: color, transparent: true, opacity: 0.8,
            blending: THREE.AdditiveBlending, depthWrite: false
          });
          return new THREE.Line(g, m);
        }
        gB.add(edgeArc(Math.PI * 0.42, 0xa8f0ff));
        gB.add(edgeArc(Math.PI * 2.0, 0xa8f0ff));

        // 磁通箭头
        B.NA = 96;
        B.arrows = mkArrows(THREE, gB, B.NA, C.mOut, 1.3, true);
        B.adirs = fibSphere(B.NA);
        B._tmpMag = new Float32Array(B.NA);

        B.vol = volCone(THREE, gB, 3.6, 9.5, 0x8f9dff, 0.11);

        B.plate = mkPlate(THREE, gB, 'Ⅱ · 高斯磁定律', "GAUSS'S LAW FOR MAGNETISM  ·  ∇·B = 0", '#ff9a5c', 1);
        B.plate.position.set(0, -5.2, 0);
      })();

      /** 重建磁力线 */
      function rebuildFieldLines() {
        while (B.lineGroup.children.length) {
          var ch = B.lineGroup.children.pop();
          if (ch.geometry) ch.geometry.dispose();
          if (ch.material) ch.material.dispose();
          B.lineGroup.remove(ch);
        }
        var M = P.lines, mono = P.monopole;
        B.flows = [];
        var seeds = fibSphere(M);
        var p = new THREE.Vector3(), bv = new THREE.Vector3();
        var h = mono ? 0.13 : 0.062;
        var maxSteps = mono ? 90 : 620;
        var colN = new THREE.Color(C.magN), colS = new THREE.Color(C.magS), tmp = new THREE.Color();

        for (var s = 0; s < M; s++) {
          var d = seeds[s];
          // 种子：从 N 极表面外 0.2 处出发
          p.set(B.pN.x + d[0] * 0.28, B.pN.y + d[1] * 0.28, B.pN.z + d[2] * 0.28);
          var pts = [p.clone()];
          for (var i = 0; i < maxSteps; i++) {
            fieldB(p, mono, bv);
            var len = bv.length();
            if (len < 1e-6) break;
            bv.multiplyScalar(h / len);
            p.add(bv);
            pts.push(p.clone());
            var r = p.length();
            if (r > 8.5) break;
            if (!mono) {
              // 到达 S 极附近即终止（场线闭合进入磁体）
              if (p.distanceTo(B.pS) < 0.30) break;
              if (p.distanceTo(B.pN) < 0.26 && i > 12) break;
            }
          }
          if (pts.length < 3) continue;

          // 顶点色：按 x 位置从 N 红渐变到 S 蓝
          var g = new THREE.BufferGeometry();
          var posArr = new Float32Array(pts.length * 3);
          var colArr = new Float32Array(pts.length * 3);
          for (var j = 0; j < pts.length; j++) {
            posArr[j * 3] = pts[j].x; posArr[j * 3 + 1] = pts[j].y; posArr[j * 3 + 2] = pts[j].z;
            if (mono) {
              var fade = 1 - j / pts.length;
              colArr[j * 3] = 1.0 * fade; colArr[j * 3 + 1] = 0.32 * fade; colArr[j * 3 + 2] = 0.42 * fade;
            } else {
              var k = clamp((pts[j].x + 2.6) / 5.2, 0, 1);   // 0 → N 红，1 → S 蓝
              tmp.copy(colN).lerp(colS, k);
              var boost = 0.72 + 0.28 * Math.sin(Math.PI * clamp(j / pts.length, 0, 1));
              colArr[j * 3] = tmp.r * boost; colArr[j * 3 + 1] = tmp.g * boost; colArr[j * 3 + 2] = tmp.b * boost;
            }
          }
          g.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
          g.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
          var m = new THREE.LineBasicMaterial({
            vertexColors: true, transparent: true, opacity: 1.0,
            blending: THREE.AdditiveBlending, depthWrite: false
          });
          var line = new THREE.Line(g, m);
          line.frustumCulled = false;
          B.lineGroup.add(line);
          B.flows.push(pts);
        }
      }

      /* ============================================================
       * Ⅲ 右区：平面电磁波（E ⊥ B ⊥ k，S = E×B/μ₀）
       * ========================================================== */
      var Wv = {};
      (function buildC() {
        Wv.NS = 49;               // 采样点
        Wv.HALF = 6.0;            // x 半长
        Wv.AE = 2.25;             // E 视觉振幅
        Wv.AB = 1.55;             // B 视觉振幅

        // 传播轴
        Wv.axis = mkLines(THREE, gC, 1, 0x6b7a95, { opacity: 0.55 });
        Wv.axisDash = mkLines(THREE, gC, 44, 0x5f7290, { opacity: 0.35 });
        Wv.axisArrow = mkArrows(THREE, gC, 1, 0x9fb3cc, 1.6, false);

        // E / B 正弦曲线
        Wv.curveE = mkStrip(THREE, gC, Wv.NS, C.waveE, { additive: true, opacity: 0.95 });
        Wv.curveB = mkStrip(THREE, gC, Wv.NS, C.waveB, { additive: true, opacity: 0.95 });

        // 箭头场
        Wv.arrE = mkArrows(THREE, gC, Wv.NS, C.waveE, 1.15, false);
        Wv.arrB = mkArrows(THREE, gC, Wv.NS, C.waveB, 1.05, false);
        Wv.NS_S = 15;
        Wv.arrS = mkArrows(THREE, gC, Wv.NS_S, C.poynt, 1.5, false);
        Wv.energy = mkPoints(THREE, gC, 90, C.poynt, 0.13, dotTex);

        Wv.vol = volCone(THREE, gC, 3.6, 9.5, 0xffdc3c, 0.10);

        Wv.tagE = mkTag(THREE, gC, 'E', '#7ff2ff', 0.55);
        Wv.tagB = mkTag(THREE, gC, 'B', '#ff9a70', 0.55);
        Wv.tagS = mkTag(THREE, gC, 'S', '#ffe066', 0.5);
        Wv.tagK = mkTag(THREE, gC, 'k', '#9fb3cc', 0.45);

        Wv.lambdaLine = mkLines(THREE, gC, 3, 0x8fa3bd, { opacity: 0.7 });
        Wv.tagLam = mkTag(THREE, gC, 'λ', '#cfe0f5', 0.45);

        Wv.plate = mkPlate(THREE, gC, 'Ⅲ · 电磁波', 'ELECTROMAGNETIC WAVE  ·  c = 1/√(μ₀ε₀)', '#ffdc3c', 1);
        Wv.plate.position.set(0, -5.2, 0);
      })();

      /* ============================================================
       * Ⅳ 下方：法拉第线圈 ∥ 安培电容器
       * ========================================================== */
      var D = {};
      var DCONST = {
        N: 1200,          // 线圈匝数
        R: 12,            // 电阻 Ω
        PHI0: 1.2e-4,     // 最大磁通 Wb
        W: 0.09,          // 特征宽度 m
        AMP: 0.045,       // 磁铁行程幅值 m
        UMAX: 12,         // 交流源幅值 V
        GAP: 0.004,       // 极板间距 m
        AR: 0.12          // 极板半径 m
      };
      DCONST.AREA = Math.PI * DCONST.AR * DCONST.AR;
      DCONST.CAP = EPS0 * DCONST.AREA / DCONST.GAP;   // ≈ 100 pF

      function mkTube(THREE, parent, pts, radius, color, emissive) {
        var curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.02);
        var g = new THREE.TubeGeometry(curve, Math.max(80, pts.length * 8), radius, 8, false);
        var m = new THREE.MeshStandardMaterial({
          color: color, emissive: emissive || 0x2a1608, emissiveIntensity: 0.6,
          roughness: 0.35, metalness: 0.75
        });
        var mesh = new THREE.Mesh(g, m);
        parent.add(mesh);
        return { mesh: mesh, curve: curve, mat: m };
      }

      (function buildD() {
        var cu = C.copper;

        /* --- 左环：法拉第线圈 --- */
        // 环路径：上边（含线圈）、右边（灯泡）、下边、左边
        var L = [];
        L.push(new THREE.Vector3(-9.6, 2.2, 0));
        L.push(new THREE.Vector3(-8.6, 2.2, 0));
        // 线圈螺旋（轴沿 X，中心 (-7.2, 2.2, 0)）
        var coilPts = [], NC = 8, turns = 8;
        for (var i = 0; i <= NC * turns; i++) {
          var u = i / (NC * turns);
          var ang = u * turns * Math.PI * 2;
          coilPts.push(new THREE.Vector3(-8.5 + u * 2.6, 2.2 + Math.cos(ang) * 0.62, Math.sin(ang) * 0.62));
        }
        L = L.concat(coilPts);
        L.push(new THREE.Vector3(-5.9, 2.2, 0));
        L.push(new THREE.Vector3(-4.6, 2.2, 0));
        L.push(new THREE.Vector3(-4.4, 1.8, 0));
        L.push(new THREE.Vector3(-4.4, -1.8, 0));
        L.push(new THREE.Vector3(-4.6, -2.2, 0));
        L.push(new THREE.Vector3(-9.4, -2.2, 0));
        L.push(new THREE.Vector3(-9.6, -1.8, 0));
        L.push(new THREE.Vector3(-9.6, 1.8, 0));
        L.push(new THREE.Vector3(-9.6, 2.2, 0));
        D.tubeL = mkTube(THREE, gD, L, 0.075, cu, 0x3a1e0a);
        D.pathL = D.tubeL.curve.getSpacedPoints(360);

        // 灯泡（左环右边中点）
        D.bulb = new THREE.Mesh(
          new THREE.SphereGeometry(0.34, 24, 18),
          new THREE.MeshStandardMaterial({
            color: 0xfff0c0, emissive: 0xffd166, emissiveIntensity: 0.2,
            roughness: 0.15, metalness: 0.0, transparent: true, opacity: 0.9
          })
        );
        D.bulb.position.set(-4.4, 0, 0);
        gD.add(D.bulb);
        D.bulbGlow = new THREE.Sprite(ctx.glowSprite('rgba(255,214,120,0.95)'));
        D.bulbGlow.scale.setScalar(2.2); D.bulbGlow.position.set(-4.4, 0, 0);
        gD.add(D.bulbGlow);
        var socket = new THREE.Mesh(
          new THREE.CylinderGeometry(0.20, 0.24, 0.34, 20),
          new THREE.MeshStandardMaterial({ color: 0x8a93a5, roughness: 0.4, metalness: 0.8 })
        );
        socket.position.set(-4.4, -0.52, 0); gD.add(socket);
        neonEdges(THREE, socket, socket.geometry, 0xa8b6cc, 0.4);

        // 条形磁铁（沿 X 往返）
        var mg = new THREE.BoxGeometry(1.5, 0.34, 0.34);
        D.magN = new THREE.Mesh(mg.clone(), new THREE.MeshStandardMaterial({
          color: 0x7a1f33, emissive: C.magN, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.6
        }));
        D.magS = new THREE.Mesh(mg.clone(), new THREE.MeshStandardMaterial({
          color: 0x1f3a7a, emissive: C.magS, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.6
        }));
        D.magN.scale.x = 0.5; D.magS.scale.x = 0.5;
        gD.add(D.magN); gD.add(D.magS);
        D.magGlow = new THREE.Sprite(ctx.glowSprite('rgba(180,200,255,0.7)'));
        D.magGlow.scale.setScalar(2.6); gD.add(D.magGlow);
        D.magArrow = mkArrows(THREE, gD, 1, 0xa8c4ff, 1.2, false);

        // 磁通标注（线圈内）
        D.phiTag = mkTag(THREE, gD, 'Φ(t)', '#8ff0b8', 0.42);
        D.phiTag.position.set(-7.2, 3.15, 0);

        /* --- 右环：AC 源 + 电容器 --- */
        var Rp = [];
        Rp.push(new THREE.Vector3(3.2, -2.2, 0));
        Rp.push(new THREE.Vector3(3.2, 2.2, 0));
        Rp.push(new THREE.Vector3(5.0, 2.2, 0));
        // AC 源（圆环）
        Rp.push(new THREE.Vector3(5.2, 2.2, 0));
        Rp.push(new THREE.Vector3(5.6, 2.2, 0));
        Rp.push(new THREE.Vector3(8.4, 2.2, 0));
        Rp.push(new THREE.Vector3(8.4, 1.3, 0));
        Rp.push(new THREE.Vector3(8.4, 0.95, 0));   // 接上极板
        D.tubeR1 = mkTube(THREE, gD, Rp, 0.075, cu, 0x3a1e0a);
        var Rp2 = [];
        Rp2.push(new THREE.Vector3(8.4, -0.95, 0));
        Rp2.push(new THREE.Vector3(8.4, -1.3, 0));
        Rp2.push(new THREE.Vector3(8.4, -2.2, 0));
        Rp2.push(new THREE.Vector3(3.2, -2.2, 0));
        D.tubeR2 = mkTube(THREE, gD, Rp2, 0.075, cu, 0x3a1e0a);
        D.pathR = D.tubeR1.curve.getSpacedPoints(200).concat(D.tubeR2.curve.getSpacedPoints(200));

        // AC 源符号
        D.acRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.40, 0.055, 10, 40),
          new THREE.MeshStandardMaterial({ color: 0xd8e2f0, emissive: 0x6ea8ff, emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.7 })
        );
        D.acRing.position.set(5.4, 2.2, 0);
        D.acRing.rotation.y = Math.PI / 2;
        gD.add(D.acRing);
        D.acWave = mkStrip(THREE, gD, 33, 0x8fd4ff, { additive: true, opacity: 0.95 });

        // 电容器极板（法线沿 Y）
        var plateGeo = new THREE.CylinderGeometry(1.30, 1.30, 0.10, 56);
        D.pTop = new THREE.Mesh(plateGeo, new THREE.MeshStandardMaterial({
          color: 0x8f9db2, emissive: 0x2a3a52, emissiveIntensity: 0.6, roughness: 0.28, metalness: 0.85
        }));
        D.pBot = new THREE.Mesh(plateGeo.clone(), new THREE.MeshStandardMaterial({
          color: 0x8f9db2, emissive: 0x2a3a52, emissiveIntensity: 0.6, roughness: 0.28, metalness: 0.85
        }));
        D.pTop.position.set(8.4, 0.95, 0); D.pBot.position.set(8.4, -0.95, 0);
        gD.add(D.pTop); gD.add(D.pBot);
        neonEdges(THREE, D.pTop, plateGeo, 0xa8f0ff, 0.5);
        neonEdges(THREE, D.pBot, plateGeo, 0xa8f0ff, 0.5);

        // 板间电场箭头（青）+ 位移电流箭头（紫）
        D.arrE = mkArrows(THREE, gD, 9, C.waveE, 1.0, false);
        D.arrD = mkArrows(THREE, gD, 3, C.disp, 1.3, false);
        // 位移电流光带
        D.beamMat = new THREE.ShaderMaterial({
          uniforms: { uColor: { value: new THREE.Color(C.disp) }, uTime: { value: 0 }, uOpacity: { value: 0.4 }, uDir: { value: 1 } },
          vertexShader: 'varying vec2 vUv; varying vec3 vP; void main(){ vUv=uv; vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
          fragmentShader: [
            'uniform vec3 uColor; uniform float uTime; uniform float uOpacity; uniform float uDir;',
            'varying vec2 vUv; varying vec3 vP;',
            'void main(){',
            '  float band = 0.5 + 0.5*sin((vP.y*7.0 - uTime*uDir*3.4));',
            '  band = pow(band, 2.0);',
            '  float edge = 0.35 + 0.65*sin(vUv.x*3.1416);',
            '  gl_FragColor = vec4(uColor, (0.22+0.78*band)*uOpacity*edge);',
            '}'
          ].join('\n'),
          transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
        });
        D.beam = new THREE.Mesh(new THREE.CylinderGeometry(1.22, 1.22, 1.8, 48, 1, true), D.beamMat);
        D.beam.position.set(8.4, 0, 0);
        gD.add(D.beam);

        D.qTagTop = mkTag(THREE, gD, '+Q', '#ff9a9a', 0.4);
        D.qTagTop.position.set(8.4, 1.55, 0);
        D.qTagBot = mkTag(THREE, gD, '−Q', '#9ac4ff', 0.4);
        D.qTagBot.position.set(8.4, -1.55, 0);

        // 电子流粒子
        D.eL = mkPoints(THREE, gD, 90, C.elec, 0.13, dotTex);
        D.eR = mkPoints(THREE, gD, 80, C.elec, 0.13, dotTex);

        D.volL = volCone(THREE, gD, 3.0, 7.5, 0x8fb4ff, 0.10);
        D.volL.obj.position.set(-7.0, 3.6, 0);
        D.volR = volCone(THREE, gD, 3.0, 7.5, C.disp, 0.10);
        D.volR.obj.position.set(6.6, 3.6, 0);

        D.tagCoil = mkTag(THREE, gD, '法拉第 · 感应电动势', '#8ff0b8', 0.62);
        D.tagCoil.position.set(-7.0, -3.0, 0);
        D.tagCap = mkTag(THREE, gD, '安培-麦克斯韦 · 位移电流', '#c9a6ff', 0.62);
        D.tagCap.position.set(6.4, -3.0, 0);

        D.plate = mkPlate(THREE, gD, 'Ⅳ · 法拉第 & 安培-麦克斯韦', 'FARADAY  ∥  AMPÈRE-MAXWELL', '#c9a6ff', 1);
        D.plate.position.set(-0.4, -2.95, 0);
      })();

      /* ============================================================
       * HUD 公式卡片
       * ========================================================== */
      var cardRoot = new THREE.Group();
      scene.add(cardRoot);

      var CW = 5.0, CH = 2.73;
      var cardA = mkCard(THREE, cardRoot, CW, CH, {
        title: '方程 Ⅰ · 高斯定律', accent: '#35e8ff',
        formula: [{ s: '∇·', c: '#cfe3ff' }, { s: 'E', c: '#35e8ff', b: 1 }, { s: ' = ' },
        { s: 'ρ', c: '#ffd166', b: 1 }, { s: '/ε', c: '#cfe3ff' }, { s: '0', c: '#cfe3ff', sub: 1 }],
        sub: [{ s: '∮', c: '#9fd8ff' }, { s: 'E·d', c: '#9fd8ff' }, { s: 'A', c: '#9fd8ff', b: 1 },
        { s: ' = q', c: '#9fd8ff' }, { s: 'enc', c: '#9fd8ff', sub: 1 }, { s: '/ε', c: '#9fd8ff' }, { s: '0', c: '#9fd8ff', sub: 1 }],
        note: '穿出闭合曲面的电通量，只由面内电荷决定',
        rows: []
      });
      cardA.mesh.position.set(POS.A[0], 10.2, 0);

      var cardB = mkCard(THREE, cardRoot, CW, CH, {
        title: '方程 Ⅱ · 高斯磁定律', accent: '#ffa04d',
        formula: [{ s: '∇·', c: '#cfe3ff' }, { s: 'B', c: '#ff9a5c', b: 1 }, { s: ' = 0', c: '#cfe3ff' }],
        sub: [{ s: '∮', c: '#ffc9a0' }, { s: 'B·d', c: '#ffc9a0' }, { s: 'A', c: '#ffc9a0', b: 1 }, { s: ' = 0   —— 无磁单极', c: '#ffc9a0' }],
        note: '磁力线无头无尾：穿出多少，必穿回多少',
        rows: []
      });
      cardB.mesh.position.set(POS.B[0], 10.2, 0);

      var cardC = mkCard(THREE, cardRoot, CW, CH, {
        title: '方程 Ⅲ&Ⅳ · 波动解', accent: '#ffdc3c',
        formula: [{ s: 'c', c: '#ffe066', b: 1 }, { s: ' = 1/√(' }, { s: 'μ' }, { s: '0', sub: 1 },
        { s: 'ε' }, { s: '0', sub: 1 }, { s: ')' }],
        sub: [{ s: '∇×E = −∂B/∂t   ·   ∇×B = μ', c: '#ffe9a8' }, { s: '0', c: '#ffe9a8', sub: 1 }, { s: 'ε', c: '#ffe9a8' }, { s: '0', c: '#ffe9a8', sub: 1 }, { s: ' ∂E/∂t', c: '#ffe9a8' }],
        note: '变化的磁场生电场，变化的电场生磁场 → 自持传播',
        rows: []
      });
      cardC.mesh.position.set(POS.C[0], 10.2, 0);

      var cardD = mkCard(THREE, cardRoot, CW, CH, {
        title: '方程 Ⅲ&Ⅳ · 源与流', accent: '#c9a6ff',
        formula: [{ s: '∇×', c: '#cfe3ff' }, { s: 'E', c: '#35e8ff', b: 1 }, { s: ' = −∂' },
        { s: 'B', c: '#ff9a5c', b: 1 }, { s: '/∂t' }],
        sub: [{ s: '∇×B = μ', c: '#d9c2ff' }, { s: '0', c: '#d9c2ff', sub: 1 }, { s: '( J + ε', c: '#d9c2ff' },
        { s: '0', c: '#d9c2ff', sub: 1 }, { s: '∂E/∂t )', c: '#d9c2ff' }],
        note: '左边感应电动势，右边位移电流接续传导电流',
        rows: []
      });
      cardD.mesh.position.set(POS.D[0], -11.1, 0);

      var cards = [cardA, cardB, cardC, cardD];
      // 统一放大卡片（全景下更清晰）
      cards.forEach(function (cd) { cd.mesh.scale.setScalar(1.22); });

      /* ============================================================
       * 视角飞行
       * ========================================================== */
      var VIEWS = {
        overview: { pos: [0, 3.5, 45], tgt: [0, 0.2, 0] },
        A: { pos: [-12.6, 6.4, 17.5], tgt: [-12.6, 4.4, 0] },
        B: { pos: [1.2, 6.4, 17.5], tgt: [0, 4.4, 0] },
        C: { pos: [12.6, 6.6, 18.5], tgt: [12.6, 4.2, 0] },
        D: { pos: [1.2, -2.2, 24], tgt: [1.2, -5.6, 0] }
      };
      var fly = { active: false, t: 0, dur: 1.05 };
      var flyFrom = { sph: new THREE.Spherical(), tgt: new THREE.Vector3() };
      var flyTo = { sph: new THREE.Spherical(), tgt: new THREE.Vector3() };
      var _tmpV = new THREE.Vector3();

      function flyToView(name, instant) {
        var v = VIEWS[name] || VIEWS.overview;
        flyFrom.tgt.copy(controls.target);
        _tmpV.copy(camera.position).sub(controls.target);
        flyFrom.sph.setFromVector3(_tmpV);

        flyTo.tgt.set(v.tgt[0], v.tgt[1], v.tgt[2]);
        _tmpV.set(v.pos[0], v.pos[1], v.pos[2]).sub(flyTo.tgt);
        flyTo.sph.setFromVector3(_tmpV);

        // theta 走最短路径
        var dth = flyTo.sph.theta - flyFrom.sph.theta;
        while (dth > Math.PI) dth -= Math.PI * 2;
        while (dth < -Math.PI) dth += Math.PI * 2;
        flyTo.sph.theta = flyFrom.sph.theta + dth;

        if (instant) {
          // 初始参数注入（URL / 面板首帧）时直接落位，不做动画
          controls.target.copy(flyTo.tgt);
          camera.position.setFromSpherical(flyTo.sph).add(controls.target);
          controls.syncFromCamera();
          controls.saveHome();
          fly.active = false;
          return;
        }
        fly.active = true; fly.t = 0;
      }

      function updateFly(dt) {
        if (!fly.active) return;
        fly.t += dt / fly.dur;
        var k = clamp(fly.t, 0, 1);
        k = k < 0.5 ? (2 * k * k) : (1 - Math.pow(-2 * k + 2, 2) / 2);
        var s = new THREE.Spherical(
          lerp(flyFrom.sph.radius, flyTo.sph.radius, k),
          lerp(flyFrom.sph.phi, flyTo.sph.phi, k),
          lerp(flyFrom.sph.theta, flyTo.sph.theta, k)
        );
        controls.target.lerpVectors(flyFrom.tgt, flyTo.tgt, k);
        camera.position.setFromSpherical(s).add(controls.target);
        controls.syncFromCamera();
        if (fly.t >= 1) { fly.active = false; controls.saveHome(); }
      }

      /* ============================================================
       * 热区拾取（点击分区聚焦）
       * ========================================================== */
      var hitMat = new THREE.MeshBasicMaterial({ visible: false });
      var hits = [];
      function addHit(cx, cy, w, h, id) {
        var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 6), hitMat);
        m.position.set(cx, cy, 0);
        m.userData.hitId = id;
        scene.add(m); hits.push(m);
      }
      addHit(POS.A[0], POS.A[1], 11, 9, 'A');
      addHit(POS.B[0], POS.B[1], 11, 9, 'B');
      addHit(POS.C[0], POS.C[1], 11, 9, 'C');
      addHit(POS.D[0], POS.D[1], 21, 7, 'D');

      var ray = new THREE.Raycaster();
      function onClick(ndc) {
        ray.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
        var it = ray.intersectObjects(hits, false);
        if (it.length) {
          var id = it[0].object.userData.hitId;
          P.focus = id;
          flyToView(id);
          syncFocusButtons(id);
          return;
        }
        P.focus = 'overview';
        flyToView('overview');
        syncFocusButtons('overview');
      }
      function syncFocusButtons(v) {
        var rows = document.querySelectorAll('#panel .btn-row');
        if (!rows.length) return;
        Array.prototype.forEach.call(rows[0].children, function (b, i) {
          var vals = ['overview', 'A', 'B', 'C', 'D'];
          b.classList.toggle('on', vals[i] === v);
        });
      }

      /* ============================================================
       * 更新：Ⅰ 左区
       * ========================================================== */
      var _c1 = new THREE.Color(), _c2 = new THREE.Color();
      var stA = { phi: 0, E: 0 };

      function updateA(dt) {
        var R = P.R;
        var q = P.q * 1e-9 * P.qsign;
        var phi = q / EPS0;
        var E = Math.abs(KE * q / (R * R));
        stA.phi = phi; stA.E = E;

        A.glass.scale.setScalar(R);
        A.wire.scale.setScalar(R);
        A.ring1.scale.setScalar(R); A.ring2.scale.setScalar(R); A.ring3.scale.setScalar(R);

        // 电荷颜色随极性
        var positive = P.qsign > 0;
        A.charge.material.emissive.setHex(positive ? 0xffc94d : 0x6ea8ff);
        A.glow.material.map = A.glow.material.map; // 保持
        A.charge.scale.setScalar(0.8 + 0.35 * (P.q / 24));
        A.glow.scale.setScalar(3.0 + 1.8 * (P.q / 24));
        A.tagQ.visible = true;

        // 电力线 dash 流动
        var u = (T * 0.42) % 1;
        var inner = 0.5, outer = R + 2.6;
        var seg = 0;
        var cIn = new THREE.Color(positive ? 0xdcfdff : 0xfff0d8);
        var cOut = new THREE.Color(positive ? 0x1a7fa8 : 0x8a5a20);
        for (var i = 0; i < A.NL; i++) {
          var d = A.dirs[i];
          for (var j = 0; j < A.ND; j++) {
            var f = (j + (positive ? u : 1 - u)) / A.ND;
            var r0 = inner + f * (outer - inner);
            var r1 = Math.min(r0 + 0.42, outer);
            if (r0 >= outer - 0.02) { A.lines.hide(seg); seg++; continue; }
            A.lines.set(seg,
              d[0] * r0, d[1] * r0, d[2] * r0,
              d[0] * r1, d[1] * r1, d[2] * r1);
            var k = clamp((r0 - inner) / (outer - inner), 0, 1);
            _c1.copy(cIn).lerp(cOut, k);
            A.lines.setCol(seg, _c1.r, _c1.g, _c1.b, _c1.r * 0.35, _c1.g * 0.35, _c1.b * 0.35);
            seg++;
          }
        }
        A.lines.flush();

        // 通量箭头
        var showA = P.arrows;
        A.arrows.obj.visible = showA;
        if (showA) {
          var amp = clamp(0.55 + 0.85 * (P.q / 12), 0.35, 2.2);
          for (var a = 0; a < A.NA; a++) {
            var dd = A.adirs[a];
            var px = dd[0] * R, py = dd[1] * R, pz = dd[2] * R;
            var sgn = P.qsign;
            A.arrows.set(a, px - dd[0] * 0.22 * sgn, py - dd[1] * 0.22 * sgn, pz - dd[2] * 0.22 * sgn,
              dd[0] * sgn, dd[1] * sgn, dd[2] * sgn, amp);
            A.arrows.setColor(a, positive ? C.fluxOut : C.fluxIn);
          }
          A.arrows.flush();
        }

        // 通量粒子
        var pn = A.parts.n;
        for (var p = 0; p < pn; p++) {
          var pd = A.pdirs[p];
          var ph = (p / pn + T * 0.16) % 1;
          var rr = R + (positive ? ph : (1 - ph)) * 3.0;
          A.parts.set(p, pd[0] * rr, pd[1] * rr, pd[2] * rr);
        }
        A.parts.flush();
        A.parts.obj.material.color.setHex(positive ? C.fluxOut : C.fluxIn);

        A.glass.material.uniforms.uTime.value = T;
        A.vol.obj.visible = P.volumetric;
        A.vol.mat.uniforms.uTime.value = T;

        A.tagQ.position.set(0.95, 0.85 + 0.35 * (P.q / 24), 0);
        var txt = (positive ? '+' : '−') + 'q = ' + P.q.toFixed(1) + ' nC';
        if (A.tagQ.userData.txt !== txt) {
          A.tagQ.userData.txt = txt;
          // 重建标签（内容变化不频繁）
          gA.remove(A.tagQ);
          if (A.tagQ.material.map) A.tagQ.material.map.dispose();
          A.tagQ.material.dispose();
          A.tagQ = mkTag(THREE, gA, txt, positive ? '#ffd166' : '#8fc4ff', 0.55);
          A.tagQ.userData.txt = txt;
        }
        A.tagQ.position.set(0, R + 0.55, 0);
      }

      /* ============================================================
       * 更新：Ⅱ 中区
       * ========================================================== */
      var _bv = new THREE.Vector3();
      var stB = { out: 0, inn: 0, net: 0 };

      function updateB(dt) {
        var mono = P.monopole;
        B.bodyN.visible = !mono; B.bodyS.visible = !mono;
        B.tagN.visible = !mono; B.tagS.visible = !mono;
        B.monoBall.visible = mono; B.monoGlow.visible = mono;

        // 流动粒子沿磁力线
        var showFlow = B.flows && B.flows.length;
        B.flowPts.obj.visible = !!showFlow;
        if (showFlow) {
          var idx = 0, maxP = B.flowPts.n;
          var _c = new THREE.Color();
          for (var i = 0; i < B.flows.length && idx < maxP - 2; i++) {
            var pts = B.flows[i], n = pts.length;
            for (var j = 0; j < 3; j++) {
              var u = ((T * 0.22) + i / B.flows.length + j / 3) % 1;
              var fi = u * (n - 1);
              var i0 = Math.floor(fi), fr = fi - i0;
              var p0 = pts[i0], p1 = pts[Math.min(i0 + 1, n - 1)];
              var x = lerp(p0.x, p1.x, fr), y = lerp(p0.y, p1.y, fr), z = lerp(p0.z, p1.z, fr);
              B.flowPts.set(idx, x, y, z);
              idx++;
            }
          }
          for (; idx < maxP; idx++) B.flowPts.hide(idx);
          B.flowPts.flush();
          B.flowPts.obj.material.color.setHex(mono ? C.magN : 0xffb0a0);
        }

        // 磁通箭头 + 通量积分
        var R = B.SR;
        var dA = 4 * Math.PI * (R * UNIT_M) * (R * UNIT_M) / B.NA;
        var fo = 0, fi = 0;
        B.arrows.obj.visible = P.arrows;
        if (P.arrows) {
          var maxAbs = 1e-12;
          for (var m = 0; m < B.NA; m++) {
            var dm = B.adirs[m];
            fieldBSI(dm[0] * R, dm[1] * R, dm[2] * R, mono, _bv);
            var bm = Math.abs(_bv.x * dm[0] + _bv.y * dm[1] + _bv.z * dm[2]);
            B._tmpMag[m] = _bv.x * dm[0] + _bv.y * dm[1] + _bv.z * dm[2];
            if (bm > maxAbs) maxAbs = bm;
          }
          for (var a = 0; a < B.NA; a++) {
            var d = B.adirs[a];
            var px = d[0] * R, py = d[1] * R, pz = d[2] * R;
            var bn = B._tmpMag[a];
            if (bn > 0) fo += bn * dA; else fi += bn * dA;
            var sc = 0.16 + 2.3 * Math.pow(Math.abs(bn) / maxAbs, 0.75);
            var sgn = bn > 0 ? 1 : -1;
            B.arrows.set(a, px - d[0] * 0.2 * sgn, py - d[1] * 0.2 * sgn, pz - d[2] * 0.2 * sgn,
              d[0] * sgn, d[1] * sgn, d[2] * sgn, sc);
            B.arrows.setColor(a, bn > 0 ? C.mOut : C.mIn);
          }
          B.arrows.flush();
        }
        stB.out = fo; stB.inn = fi; stB.net = fo + fi;

        B.glass.material.uniforms.uTime.value = T;
        B.vol.obj.visible = P.volumetric;
        B.vol.mat.uniforms.uTime.value = T;
      }

      /* ============================================================
       * 更新：Ⅲ 右区
       * ========================================================== */
      var stC = { lam: 3, freq: 0, E0: 100, B0: 0, S: 0 };

      function updateC(dt) {
        var N = Wv.NS, half = Wv.HALF;
        var lam = P.lambda;
        var k = 2 * Math.PI / lam;
        var omega = 2 * Math.PI * 0.30;        // 视觉角频率（时间已放慢）
        var AE = Wv.AE * (P.E0 / 100);
        var AB = Wv.AB * (P.E0 / 100);

        // 轴
        Wv.axis.set(0, -half, 0, 0, half, 0, 0); Wv.axis.flush();
        var nDash = 44;
        for (var i = 0; i < nDash; i++) {
          var x0 = -half + (2 * half) * (i / nDash);
          Wv.axisDash.set(i, x0, 0, 0, x0 + 0.11, 0, 0);
        }
        Wv.axisDash.flush();
        Wv.axisArrow.set(0, half - 0.55, 0, 0, 1, 0, 0, 1.5); Wv.axisArrow.flush();

        // 曲线与箭头（箭头隔点绘制，避免过密）
        for (var j = 0; j < N; j++) {
          var x = -half + (2 * half) * (j / (N - 1));
          var ph = k * x - omega * T;
          var ey = AE * Math.sin(ph);
          var bz = AB * Math.sin(ph);
          Wv.curveE.set(j, x, ey, 0);
          Wv.curveB.set(j, x, 0, bz);
          if (j % 2) {          // 奇数索引隐藏箭头
            Wv.arrE.hide(j); Wv.arrB.hide(j);
            continue;
          }
          // E 箭头（沿 ±Y）
          var sE = Math.abs(ey) * 0.95 + 0.06;
          Wv.arrE.set(j, x, ey * 0.5, 0, 0, Math.sign(ey) || 1, 0, sE);
          // B 箭头（沿 ±Z）
          var sB = Math.abs(bz) * 1.15 + 0.06;
          Wv.arrB.set(j, x, 0, bz * 0.5, 0, 0, Math.sign(bz) || 1, sB);
        }
        Wv.curveE.flush(); Wv.curveB.flush();
        Wv.arrE.flush(); Wv.arrB.flush();

        // 坡印廷箭头 S ∝ sin²
        var sIdx = 0;
        for (var s = 0; s < Wv.NS_S; s++) {
          var xs = -half + 0.4 + (2 * half - 1.2) * (s / (Wv.NS_S - 1));
          var phs = k * xs - omega * T;
          var sn = Math.sin(phs);
          var mag = sn * sn;
          Wv.arrS.set(s, xs - 0.22, 0, 0, 1, 0, 0, 0.35 + mag * 1.75);
        }
        Wv.arrS.flush();

        // 能量流粒子
        var en = Wv.energy.n;
        for (var e = 0; e < en; e++) {
          var u = ((e / en) + T * 0.12) % 1;
          var xe = -half + u * 2 * half;
          var off = (Math.sin(e * 12.9898) * 0.5 - 0.25) * 0.9;
          var ph2 = k * xe - omega * T;
          var amp = Math.sin(ph2);
          Wv.energy.set(e, xe, AE * amp * 0.35 + off * 0.3, AB * amp * 0.35);
        }
        Wv.energy.flush();

        // 波长标尺：相邻两波峰
        var xPeak1 = ((omega * T / k) + lam * 0.25) % lam;
        var xp1 = -half + ((xPeak1 % lam) + lam) % lam + lam * 0; // 起点
        var x1 = ((Math.PI / 2 + omega * T) / k) % lam; if (x1 < 0) x1 += lam;
        var xa = -half + x1;
        var xb = xa + lam;
        if (xb > half - 0.2) { xa -= lam; xb -= lam; }
        var yL = -Wv.AE - 0.95;
        Wv.lambdaLine.set(0, xa, yL, 0, xb, yL, 0);
        Wv.lambdaLine.set(1, xa, yL - 0.18, 0, xa, yL + 0.18, 0);
        Wv.lambdaLine.set(2, xb, yL - 0.18, 0, xb, yL + 0.18, 0);
        Wv.lambdaLine.flush();
        Wv.tagLam.position.set((xa + xb) / 2, yL - 0.45, 0);

        // 标签位置跟随波峰
        Wv.tagE.position.set(-half + 0.9, AE + 0.75, 0);
        Wv.tagB.position.set(-half + 0.9, 0, AB + 1.0);
        Wv.tagS.position.set(half - 1.0, 1.15, 0);
        Wv.tagK.position.set(half + 0.75, 0.35, 0);

        Wv.vol.obj.visible = P.volumetric;
        Wv.vol.mat.uniforms.uTime.value = T;

        // 读数
        var E0 = P.E0;
        stC.lam = lam;
        stC.freq = CLIGHT / lam;
        stC.E0 = E0;
        stC.B0 = E0 / CLIGHT;
        stC.S = 0.5 * EPS0 * CLIGHT * E0 * E0;
      }

      /* ============================================================
       * 更新：Ⅳ 下方电路
       * ========================================================== */
      var stD = { phi: 0, emf: 0, iL: 0, u: 0, E: 0, Q: 0, iC: 0, Id: 0, P: 0 };

      function updateD(dt) {
        var f = P.drive;
        var th = 2 * Math.PI * f * T;
        var w = 2 * Math.PI * f;

        /* --- 左支路：法拉第 --- */
        var xm = DCONST.AMP * Math.sin(th);
        var v = DCONST.AMP * w * Math.cos(th);
        var uu = xm / DCONST.W;
        var phi = DCONST.PHI0 * Math.pow(1 + uu * uu, -1.5);
        var dPhidx = -3 * DCONST.PHI0 * uu / DCONST.W * Math.pow(1 + uu * uu, -2.5);
        var dPhidt = dPhidx * v;
        var emf = -DCONST.N * dPhidt;
        var iL = emf / DCONST.R;

        // 磁铁位置（场景单位：1 单位 = 3 cm）
        var mx = -7.2 + (xm / 0.03) * 1.0;
        D.magN.position.set(mx - 0.375, 2.2, 0);
        D.magS.position.set(mx + 0.375, 2.2, 0);
        D.magGlow.position.set(mx, 2.2, 0);
        var dirV = Math.sign(v) || 1;
        D.magArrow.set(0, mx + 1.35 * dirV, 2.2, 0, dirV, 0, 0, 1.0 + Math.abs(v) * 2.2);
        D.magArrow.flush();
        D.magArrow.obj.visible = Math.abs(v) > 1e-4;

        // 灯泡亮度
        var ib = clamp(Math.abs(iL) / 0.020, 0, 1);
        D.bulb.material.emissiveIntensity = 0.15 + ib * 2.6;
        D.bulbGlow.material.opacity = 0.12 + ib * 0.85;
        D.bulbGlow.scale.setScalar(1.6 + ib * 2.4);

        // 电子流（左环）
        var nL = D.eL.n;
        var dirL = iL >= 0 ? 1 : -1;
        var uL = (T * (0.06 + Math.abs(iL) * 6.0) * dirL) % 1;
        if (uL < 0) uL += 1;
        for (var i = 0; i < nL; i++) {
          var t2 = (((i / nL) + uL) % 1 + 1) % 1;
          var pi = D.pathL[Math.floor(t2 * (D.pathL.length - 1))];
          D.eL.set(i, pi.x, pi.y, pi.z);
        }
        D.eL.flush();
        D.eL.obj.material.opacity = 0.35 + 0.65 * clamp(Math.abs(iL) / 0.016, 0, 1);

        /* --- 右支路：安培-麦克斯韦 --- */
        var uac = DCONST.UMAX * Math.sin(th);
        var dudt = DCONST.UMAX * w * Math.cos(th);
        var Ef = uac / DCONST.GAP;
        var Qc = DCONST.CAP * uac;
        var iC = DCONST.CAP * dudt;
        var Id = EPS0 * DCONST.AREA * (dudt / DCONST.GAP);

        stD.phi = phi; stD.emf = emf; stD.iL = iL;
        stD.u = uac; stD.E = Ef; stD.Q = Qc; stD.iC = iC; stD.Id = Id;
        stD.P = iL * iL * DCONST.R;

        // 板间电场箭头（沿 Y）
        var eN = 9, k2 = 0;
        var esc = clamp(Math.abs(Ef) / 3000, 0.05, 1.2);
        for (var a = 0; a < 3; a++) {
          for (var b = 0; b < 3; b++) {
            var ox = (a - 1) * 0.62, oz = (b - 1) * 0.62;
            if (ox * ox + oz * oz > 0.78) { D.arrE.hide(k2); k2++; continue; }
            var sgn = Ef >= 0 ? -1 : 1;   // 电场由上板指向下板（上板为正时）
            D.arrE.set(k2, 8.4 + ox, 0, oz, 0, sgn, 0, esc * 1.05);
            k2++;
          }
        }
        D.arrE.flush();

        // 位移电流箭头（与传导电流同向，沿导线电流方向）
        var dSgn = iC >= 0 ? 1 : -1;
        var dsc = clamp(Math.abs(iC) / 3.2e-9, 0.08, 1.5);
        for (var q = 0; q < 3; q++) {
          D.arrD.set(q, 8.4 + (q - 1) * 0.7, 0, 0, 0, dSgn, 0, dsc * 1.1);
        }
        D.arrD.flush();

        // 光带
        D.beamMat.uniforms.uTime.value = T;
        D.beamMat.uniforms.uDir.value = dSgn;
        D.beamMat.uniforms.uOpacity.value = 0.12 + 0.55 * clamp(Math.abs(iC) / 3.2e-9, 0, 1);

        // 电子流（右环）
        var nR = D.eR.n;
        var dirR = iC >= 0 ? 1 : -1;
        var uR = (T * (0.05 + Math.abs(iC) * 1.4e8) * dirR) % 1;
        if (uR < 0) uR += 1;
        for (var r = 0; r < nR; r++) {
          var t3 = (((r / nR) + uR) % 1 + 1) % 1;
          var pr = D.pathR[Math.floor(t3 * (D.pathR.length - 1))];
          D.eR.set(r, pr.x, pr.y, pr.z);
        }
        D.eR.flush();
        D.eR.obj.material.opacity = 0.35 + 0.65 * clamp(Math.abs(iC) / 3.0e-9, 0, 1);

        // AC 源正弦符号
        for (var s2 = 0; s2 < 33; s2++) {
          var tt = s2 / 32;
          var xx = 5.06 + tt * 0.68;
          var yy = 2.2 + Math.sin(tt * Math.PI * 2) * 0.20;
          D.acWave.set(s2, xx, yy, 0);
        }
        D.acWave.flush();

        // 电荷标签
        D.qTagTop.visible = Math.abs(Qc) > 1e-12;
        D.qTagBot.visible = Math.abs(Qc) > 1e-12;

        D.volL.obj.visible = P.volumetric;
        D.volR.obj.visible = P.volumetric;
        D.volL.mat.uniforms.uTime.value = T;
        D.volR.mat.uniforms.uTime.value = T;
      }

      /* ============================================================
       * HUD 刷新
       * ========================================================== */
      function rowsA() {
        var q = P.q * P.qsign;
        return [
          { k: '电荷 q', v: (q > 0 ? '+' : '') + q.toFixed(1) + ' nC', c: '#ffd166' },
          { k: '通量 Φ_E = q/ε₀', v: si(stA.phi, 'Wb', 2).replace('Wb', 'N·m²/C'), c: '#6ef7c8' },
          { k: '表面场强 E(R) = kq/R²', v: stA.E.toFixed(2) + ' V/m', c: '#7ff2ff' }
        ];
      }
      function rowsB() {
        if (P.monopole) {
          return [
            { k: '状态', v: '假想磁单极', c: '#ff6b6b' },
            { k: '净通量 ∮B·dA', v: si(stB.net, 'Wb', 3), c: '#ff6b6b' },
            { k: '结论', v: '∇·B ≠ 0（现实中未发现）', c: '#ff6b6b' }
          ];
        }
        return [
          { k: '穿出通量 Φ₊', v: '+' + si(Math.abs(stB.out), 'Wb', 3), c: '#ffa04d' },
          { k: '穿入通量 Φ₋', v: '−' + si(Math.abs(stB.inn), 'Wb', 3), c: '#6ea8ff' },
          { k: '净通量 ∮B·dA', v: sci(stB.net, 2) + ' Wb ≈ 0', c: '#7ef2a8' }
        ];
      }
      function rowsC() {
        return [
          { k: '波长 λ  /  频率 f = c/λ', v: stC.lam.toFixed(2) + ' m  ·  ' + si(stC.freq, 'Hz', 2), c: '#ffe066' },
          { k: 'E₀  /  B₀ = E₀/c', v: stC.E0.toFixed(0) + ' V/m  ·  ' + si(stC.B0, 'T', 2), c: '#7ff2ff' },
          { k: '平均能流 ⟨S⟩ = ½ε₀cE₀²', v: stC.S.toFixed(2) + ' W/m²', c: '#ffdc3c' }
        ];
      }
      function rowsD() {
        return [
          { k: '磁通 Φ(t) → 感应 ε = −NdΦ/dt', v: si(stD.phi, 'Wb', 2) + ' → ' + si(stD.emf, 'V', 2), c: '#8ff0b8' },
          { k: '板间场 E(t) → 电荷 Q', v: si(stD.E, 'V/m', 2) + ' → ' + si(stD.Q, 'C', 2), c: '#7ff2ff' },
          { k: '位移电流 I_d = ε₀A ∂E/∂t', v: si(stD.Id, 'A', 2) + '  ≡ i = ' + si(stD.iC, 'A', 2), c: '#c9a6ff' }
        ];
      }

      var cardIdx = 0, cardAcc = 0;
      function refreshCards(dt) {
        // 每帧重绘一张，4 帧一轮
        cardAcc += dt;
        if (cardAcc < 0.12) return;
        cardAcc = 0;
        var c = cards[cardIdx % cards.length];
        if (cardIdx % cards.length === 0) c.setRows(rowsA());
        else if (cardIdx % cards.length === 1) c.setRows(rowsB());
        else if (cardIdx % cards.length === 2) c.setRows(rowsC());
        else c.setRows(rowsD());
        c.redraw();
        cardIdx++;
      }

      var noteAcc = 0;
      function refreshNote() {
        var h = '';
        function row(k, v, c) {
          h += '<div class="note-row"><span>' + k + '</span><b style="color:' + (c || '#dce7f5') + '">' + v + '</b></div>';
        }
        if (P.focus === 'A') {
          row('电荷 q', (P.qsign > 0 ? '+' : '−') + P.q.toFixed(1) + ' nC', '#ffd166');
          row('高斯面半径 R', P.R.toFixed(2) + ' m');
          row('电通量 Φ_E', si(stA.phi, 'N·m²/C', 2), '#6ef7c8');
          row('校验 q/ε₀', si(P.q * 1e-9 * P.qsign / EPS0, 'N·m²/C', 2), '#6ef7c8');
          row('表面场强 E(R)', stA.E.toFixed(3) + ' V/m', '#7ff2ff');
          h += '<div class="note-hint">无论高斯面怎么变形、电荷在面内如何移动，只要包住的电荷总量不变，穿过曲面的电通量就不变 —— 这就是「通量只取决于源」。</div>';
        } else if (P.focus === 'B') {
          if (P.monopole) {
            row('状态', '假想磁单极（反事实）', '#ff6b6b');
            row('净通量', si(stB.net, 'Wb', 3), '#ff6b6b');
            h += '<div class="note-hint">若真存在磁单极，∇·B = ρ_m ≠ 0，磁力线将不再是闭合回路。至今所有实验（包括 LHC、MoEDAL）都未发现磁单极。</div>';
          } else {
            row('穿出通量', '+' + si(Math.abs(stB.out), 'Wb', 3), '#ffa04d');
            row('穿入通量', '−' + si(Math.abs(stB.inn), 'Wb', 3), '#6ea8ff');
            row('净通量', sci(stB.net, 2) + ' Wb', '#7ef2a8');
            h += '<div class="note-hint">磁力线没有起点也没有终点：从 N 极出去多少，就一定从 S 极回来多少。切断磁体只会得到两个更小的磁偶极子，永远得不到孤立的 N 或 S。</div>';
          }
        } else if (P.focus === 'C') {
          row('波长 λ', stC.lam.toFixed(2) + ' m');
          row('频率 f = c/λ', si(stC.freq, 'Hz', 2), '#ffe066');
          row('B₀ = E₀/c', si(stC.B0, 'T', 3), '#ff9a70');
          row('平均能流 ⟨S⟩', stC.S.toFixed(2) + ' W/m²', '#ffdc3c');
          row('真空光速 c', (CLIGHT / 1e8).toFixed(4) + '×10⁸ m/s', '#7ef2a8');
          h += '<div class="note-hint">E 与 B 同相位、互相垂直，且都垂直于传播方向 k。S = E×B/μ₀ 指向传播方向。图中 B 的振幅已按比例放大以便观察（实际 B₀ = E₀/c）。</div>';
        } else if (P.focus === 'D') {
          row('磁通 Φ(t)', si(stD.phi, 'Wb', 2), '#8ff0b8');
          row('感应电动势 ε', si(stD.emf, 'V', 2), '#8ff0b8');
          row('回路电流 i', si(stD.iL, 'A', 2), '#8fe0ff');
          row('板间场强 E', si(stD.E, 'V/m', 2), '#7ff2ff');
          row('极板电荷 Q', si(stD.Q, 'C', 2), '#ffd166');
          row('位移电流 I_d', si(stD.Id, 'A', 2), '#c9a6ff');
          h += '<div class="note-hint">电容器极板之间没有电荷流过，但麦克斯韦补上的 ε₀∂E/∂t 让电流「接上了」：I_d 在数值上严格等于导线中的传导电流 i，安培环路定律因此处处自洽，电磁波也由此诞生。</div>';
        } else {
          row('电荷 q', (P.qsign > 0 ? '+' : '−') + P.q.toFixed(1) + ' nC', '#ffd166');
          row('电通量 Φ_E', si(stA.phi, 'N·m²/C', 2), '#6ef7c8');
          row('磁净通量', P.monopole ? si(stB.net, 'Wb', 2) : sci(stB.net, 1) + ' Wb', '#7ef2a8');
          row('波长 λ / 频率', stC.lam.toFixed(2) + ' m / ' + si(stC.freq, 'Hz', 1), '#ffe066');
          row('感应 ε / 位移电流', si(stD.emf, 'V', 1) + ' / ' + si(stD.Id, 'A', 1), '#c9a6ff');
          h += '<div class="note-hint">点击任一区域可飞入聚焦，点击空白处回到全景。四条方程合起来只有一个结论：光就是电磁波。</div>';
        }
        ctx.setNote(h);
      }

      /* ============================================================
       * 主循环
       * ========================================================== */
      function update(dt, t) {
        T += dt * P.speed;

        updateFly(dt);
        updateA(dt);
        updateB(dt);
        updateC(dt);
        updateD(dt);

        // 卡片朝向相机
        for (var i = 0; i < cards.length; i++) {
          cards[i].mesh.quaternion.copy(camera.quaternion);
        }
        cardRoot.visible = P.cards;
        if (P.cards) refreshCards(dt);

        floor.visible = P.volumetric;
        stars.rotation.y += dt * 0.004;

        noteAcc += dt;
        if (noteAcc > 0.35) { noteAcc = 0; refreshNote(); }
      }

      /* ============================================================
       * 参数
       * ========================================================== */
      function setParam(k, v) {
        P[k] = v;
        if (k === 'focus') { flyToView(v, T < 0.001); return; }
        if (k === 'lines' || k === 'monopole') { rebuildFieldLines(); return; }
      }

      /* ---------- 初始化 ---------- */
      rebuildFieldLines();
      camera.position.set(0, 3.0, 39);
      controls.target.set(0, 0.2, 0);
      controls.syncFromCamera();
      refreshNote();

      /* ============================================================
       * 讲解模式（HL.Tour 框架引擎）
       * ========================================================== */
      var tour = HL.Tour(ctx, { defaultR: 3.4 });
      tour.load([
        {
          t: '一、全景：四行诗',
          d: '麦克斯韦方程组——四条方程写尽全部经典电磁现象。这间展厅把它摆成四个展区：Ⅰ 高斯电通量、Ⅱ 高斯磁通量、Ⅲ 电磁波、Ⅳ 感应与位移电流。1873 年《电磁通论》出版时，电磁学第一次拥有了统一的语言。',
          exp: '面板里的「视角」按钮也可直接跳到各区。',
          cam: [[0, 10, 44], [0, 1, 0]],
          pulse: null
        },
        {
          t: '二、Ⅰ 高斯定律：∇·E = ρ/ε₀',
          d: '青色电力线从点电荷发出，穿过玻璃高斯球面。高斯定律说：穿出闭合面的电通量只取决于内部电荷总量 Φ = q/ε₀——与球面半径无关。拖动「高斯面半径 R」，青绿箭头的密度在变，总通量不变。换成 −q，箭头全部反向：汇。',
          exp: '退出讲解后拖「高斯面半径 R」验证通量不变。',
          cam: [[-12.6, 7, 11], [-12.6, 3.6, 0]],
          pulse: [-12.6, 3.6, 0], r: 3.4
        },
        {
          t: '三、Ⅱ 磁的高斯定律：∇·B = 0',
          d: '条形磁体的磁力线永远闭合：从 N 极出来、绕回 S 极。楔形切口球显示：从切口「楔块」穿出的磁通量，恰好等于穿回去的——闭合面上磁通量的代数和恒为零，因为不存在磁单极子。面板里的「假想磁单极」开关是反事实实验：一旦打开，磁力线会被切断。',
          exp: '退出讲解后勾选「假想磁单极（反事实）」看磁力线被切断。',
          cam: [[0, 7, 11], [0, 3.6, 0]],
          pulse: [0, 3.6, 0], r: 3.4
        },
        {
          t: '四、Ⅲ 电磁波：E⊥B 同行',
          d: '右区的平面电磁波沿 X 方向传播：青色 E、橙红 B、黄色坡印廷箭头。E 与 B 同相位、相互垂直，共同指向传播方向。法拉第定律（磁变生电）与安培-麦克斯韦定律（电变生磁）在此握手——一个扰动自己维持自己，一路跑成波。',
          exp: '拖「波长 λ」与「电场振幅 E₀」，观察波形与坡印廷箭头的变化。',
          cam: [[12.6, 6, 11], [12.6, 3.6, 0]],
          pulse: [12.6, 3.6, 0], r: 3.4
        },
        {
          t: '五、Ⅳ 电路：两条对称的定律',
          d: '下方的展区并排放着一台发电机与一台「电容器电路」。左边：磁通量变化在线圈中驱动电子流——法拉第 1831 年发现的感应，今天全世界发电机的原理。右边：极板之间并没有导线，但变化的电场同样产生磁场（紫色光带）——麦克斯韦补上的「位移电流」，纯粹为了方程自洽，却预言了电磁波的存在。',
          exp: '拖「电路驱动频率」，看两侧电流与位移电流一起加快。',
          cam: [[5, -1, 11], [0, -5.6, 0]],
          pulse: [0, -5.6, 0], r: 3.4
        },
        {
          t: '六、光是电磁波',
          d: '把四条方程放在一起，麦克斯韦 1865 年推出波动方程，波速为 1/√(ε₀μ₀)——与实测光速一致。他写道：「我们几乎无法避免这个推断：光本身就是电磁扰动。」1887 年赫兹用火花隙实验造出并接收了电磁波；1901 年马可尼用它发出越洋电报。你此刻看到的一切光、用的一切无线通信，都写在这四行方程里。',
          exp: '按 Esc 回目录，或用「视角 → 全景」自由漫游。',
          cam: [[0, 12, 48], [0, 0, 0]],
          pulse: null
        }
      ]);

      return {
        update: function (dt, t) {
          tour.update(dt, t || 0, function (ddt, tt) {
            update(ddt, tt);
          });
        },
        setParam: function (k, v) {
          if (k === 'tour') { tour.toggle(); return; }
          setParam(k, v);
        },
        onClick: onClick,
        dispose: function () { tour.dispose(); }
      };
    }
  });

})(window);
