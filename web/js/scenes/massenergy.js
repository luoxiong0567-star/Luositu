/**
 * 场景：质能方程 E = mc²（三幕 · 尼尔风格线框 + BLOOM 后处理 + HUD 公式卡片）
 *
 *   ① 天平  balance : 质量—能量转换天平，滑杆控质量，实时换算 TNT / 生活用电
 *   ② 微观  micro   : 正负电子湮灭 · 核裂变 · 核聚变，质量亏损 → 光子能量
 *   ③ 宏观  macro   : 太阳 vs 煤球，恒星每秒 426 万吨质量亏损的尺度对比
 *
 * 视觉规范：深空暗底 + 米白细线框 + 霓虹辉光 + 自实现 BLOOM
 *
 * 后处理说明：three r149 的 UMD 版不含 EffectComposer / UnrealBloomPass，
 * 故自实现轻量 Bloom：场景 → HDR RT → 亮度提取 → 3 级降采样双向高斯 → 合成（暗角 + 扫描线）。
 * 通过 SceneManager 的 inst.render(renderer, scene, camera) 钩子接管默认渲染。
 */
(function (global) {
  'use strict';

  /* ==================================================================
     一、物理常量（SI / CODATA 2018）
     ================================================================== */
  var C_LIGHT = 299792458;                  // 光速 m/s
  var C2 = C_LIGHT * C_LIGHT;               // 8.98755e16 J/kg
  var TNT_T = 4.184e9;                      // 1 吨 TNT 当量 = 4.184 GJ
  var HIROSHIMA = 6.3e13;                   // “小男孩” ≈ 15 kt TNT ≈ 63 TJ
  var KWH = 3.6e6;                          // 1 kWh
  var HOME_YEAR = 3000 * KWH;               // 城镇家庭年均用电 ≈ 3000 kWh = 10.8 GJ
  var COAL_J = 2.9307e7;                    // 标准煤热值 7000 kcal/kg = 29.307 MJ/kg
  var COAL_RHO = 850;                       // 煤堆堆积密度 kg/m³
  var L_SUN = 3.828e26;                     // 太阳光度 W
  var R_EARTH = 6.371e6;                    // 地球半径 m
  var D_AU = 1.495978707e11;                // 日地距离 m
  var U_KG = 1.66053906660e-27;             // 原子质量单位 kg
  var MEV = 1.602176634e-13;                // 1 MeV = 1.602e-13 J
  var U_MEV = 931.49410242;                // 1 u = 931.494 MeV/c²

  /** 反应数据：静止质量（u）、释放能量 Q（MeV） */
  var RXN = {
    annih: {
      eq: [
        { s: 'e', c: '#4db4ff' }, { s: '⁻', sup: true, c: '#4db4ff' },
        { s: '  +  ' },
        { s: 'e', c: '#ff6b8a' }, { s: '⁺', sup: true, c: '#ff6b8a' },
        { s: '  →  2' }, { s: 'γ', c: '#ffdc3c' }
      ],
      mIn: 2 * 0.00054857990907,
      mOut: 0,
      Q: 1.0219979,
      note: '唯一已知的 100% 质能转换过程，静质量全部变为光子能量'
    },
    fission: {
      eq: [
        { s: '²³⁵', sz: 0.68 }, { s: 'U', c: '#7ef2a8' }, { s: '  +  ' }, { s: 'n', c: '#dfe8f2' },
        { s: '  →  ' },
        { s: '¹⁴¹', sz: 0.68 }, { s: 'Ba', c: '#ffa04d' }, { s: '  +  ' },
        { s: '⁹²', sz: 0.68 }, { s: 'Kr', c: '#6ea8ff' }, { s: '  +  3' }, { s: 'n', c: '#dfe8f2' }
      ],
      mIn: 235.0439299 + 1.00866491588,
      mOut: 140.914411 + 91.926156 + 3 * 1.00866491588,
      Q: 173.3,
      note: '瞬发约 173 MeV，计入碎片 β⁻ 衰变后单次裂变共约 202 MeV'
    },
    fusion: {
      eq: [
        { s: '²', sz: 0.68 }, { s: 'H', c: '#6ea8ff' }, { s: '  +  ' },
        { s: '³', sz: 0.68 }, { s: 'H', c: '#c9a6ff' },
        { s: '  →  ' },
        { s: '⁴', sz: 0.68 }, { s: 'He', c: '#ffd166' }, { s: '  +  ' }, { s: 'n', c: '#dfe8f2' }
      ],
      mIn: 2.0141017781 + 3.0160492819,
      mOut: 4.002603254 + 1.00866491588,
      Q: 17.589,
      note: '恒星与氢弹的能量来源，转换率是裂变的 4 倍余'
    }
  };

  /* ==================================================================
     二、配色（深空暗底 + 尼尔米白线框 + 霓虹强调）
     ================================================================== */
  var C = {
    ink: 0xd9d3c7, steel: 0x9fb3c8, cyan: 0x6fe3ff, gold: 0xffc94d,
    amber: 0xff8a3d, magenta: 0xff5fd0, violet: 0xc9a6ff, green: 0x7ef2a8,
    blue: 0x4db4ff, white: 0xeaf2ff, red: 0xff4d6d, ember: 0xff5a1f
  };

  var VIEW = {
    balance: { pos: [0, 4.8, 27.0], tgt: [1.2, 2.6, 0] },
    micro: { pos: [0, 3.2, 25.0], tgt: [1.2, 2.4, 0] },
    macro: { pos: [0, 3.2, 31.0], tgt: [2.8, 1.4, 0] }
  };

  /* ==================================================================
     三、通用小工具
     ================================================================== */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function smooth(k) { return k * k * (3 - 2 * k); }
  function easeOut(k) { return 1 - (1 - k) * (1 - k); }
  function easeIn(k) { return k * k; }

  var SUPMAP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
  function supNum(n) {
    return String(n).split('').map(function (ch) { return SUPMAP[ch] || ch; }).join('');
  }
  function fixed(x, d) {
    if (!isFinite(x)) return '—';
    var p = Math.pow(10, d === undefined ? 2 : d);
    return (Math.round(x * p) / p).toString();
  }
  /** 科学计数：8.99×10¹³ */
  function sci(x, d) {
    d = d === undefined ? 3 : d;
    if (x === 0) return '0';
    if (!isFinite(x)) return '—';
    var sg = x < 0 ? '-' : '';
    x = Math.abs(x);
    var e = Math.floor(Math.log10(x));
    if (e >= -1 && e <= 4) return sg + fixed(x, Math.max(0, d - 1 - e));
    var m = x / Math.pow(10, e);
    return sg + fixed(m, d - 1) + '×10' + supNum(e);
  }
  function humanMass(kg) {
    if (kg < 1e-6) return sci(kg * 1e9, 3) + ' ng';
    if (kg < 1e-3) return sci(kg * 1e6, 3) + ' mg';
    if (kg < 1) return sci(kg * 1e3, 3) + ' g';
    if (kg < 1e3) return sci(kg, 4) + ' kg';
    if (kg < 1e6) return sci(kg / 1e3, 4) + ' t';
    return sci(kg, 3) + ' kg';
  }
  function humanEnergy(j) {
    if (j < 1e6) return sci(j, 3) + ' J';
    if (j < 1e9) return sci(j / KWH, 3) + ' kWh';
    if (j < 1e15) return sci(j / 1e12, 3) + ' TJ';
    if (j < 1e18) return sci(j / 1e15, 3) + ' PJ';
    if (j < 1e21) return sci(j / 1e18, 3) + ' EJ';
    return sci(j, 3) + ' J';
  }
  function humanTNT(t) {
    if (t < 1e-3) return sci(t * 1e6, 3) + ' g';
    if (t < 1) return sci(t * 1e3, 3) + ' kg';
    if (t < 1e3) return sci(t, 4) + ' t';
    if (t < 1e6) return sci(t / 1e3, 3) + ' kt';
    if (t < 1e9) return sci(t / 1e6, 3) + ' Mt';
    return sci(t / 1e9, 3) + ' Gt';
  }
  function humanLen(m) {
    if (m < 1e3) return sci(m, 3) + ' m';
    if (m < 1e6) return sci(m / 1e3, 3) + ' km';
    return sci(m / 1e6, 3) + ' 千 km';
  }
  function humanTime(s) {
    if (s < 60) return sci(s, 3) + ' s';
    if (s < 3600) return sci(s / 60, 3) + ' min';
    if (s < 86400) return sci(s / 3600, 3) + ' h';
    if (s < 2.63e6) return sci(s / 86400, 3) + ' 天';
    if (s < 3.16e7) return sci(s / 2.63e6, 3) + ' 月';
    return sci(s / 3.15576e7, 3) + ' 年';
  }
  function fibSphere(n) {
    var out = [], ga = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < n; i++) {
      var y = 1 - (2 * i + 1) / n;
      var r = Math.sqrt(Math.max(0, 1 - y * y));
      var th = ga * i;
      out.push([r * Math.cos(th), y, r * Math.sin(th)]);
    }
    return out;
  }

  /* ==================================================================
     四、Canvas 绘制辅助
     ================================================================== */
  /** token: {s, c, sz, sub, sup, b, i} */
  function drawTokens(c, tokens, cx, baseY, baseSize, mono) {
    if (!tokens || !tokens.length) return;
    var fam = mono ? '"Consolas","DejaVu Sans Mono",monospace'
      : '"Cambria Math","Georgia","Microsoft YaHei",serif';
    var items = [], total = 0, i;
    for (i = 0; i < tokens.length; i++) {
      var tk = tokens[i];
      var size = baseSize * (tk.sz || 1);
      c.font = (tk.i ? 'italic ' : '') + (tk.b ? '700 ' : '400 ') + size + 'px ' + fam;
      var w = c.measureText(tk.s).width;
      items.push({ tk: tk, w: w, size: size });
      total += w;
    }
    var x = cx - total / 2;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      var y = baseY + (it.tk.sub ? it.size * 0.30 : (it.tk.sup ? -it.size * 0.42 : 0));
      c.font = (it.tk.i ? 'italic ' : '') + (it.tk.b ? '700 ' : '400 ') + it.size + 'px ' + fam;
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

  /** 尼尔风点线引导：key ……… value */
  function dottedLeader(c, x0, x1, y) {
    c.save();
    c.fillStyle = 'rgba(140,162,190,0.30)';
    for (var x = x0; x < x1 - 2; x += 10) c.fillRect(x, y, 2, 2);
    c.restore();
  }

  /** HUD 公式卡片 1024×700 */
  function mkCard(THREE, parent, w, h, def) {
    var W = 1024, H = 700;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    var tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;

    var mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
    );
    mesh.renderOrder = 900;
    parent.add(mesh);

    var card = {
      title: def.title, accent: def.accent, formula: def.formula || [],
      sub: def.sub || [], note: def.note || '', rows: def.rows || [], foot: def.foot || ''
    };

    function redraw() {
      c.clearRect(0, 0, W, H);
      c.save();
      roundRect(c, 8, 8, W - 16, H - 16, 4);
      var g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(11,15,22,0.90)');
      g.addColorStop(1, 'rgba(5,7,12,0.94)');
      c.fillStyle = g; c.fill();
      c.lineWidth = 2; c.strokeStyle = 'rgba(196,214,232,0.30)'; c.stroke();
      c.restore();

      c.save();
      roundRect(c, 8, 8, W - 16, H - 16, 4); c.clip();
      var lg = c.createLinearGradient(0, 0, W, 0);
      lg.addColorStop(0, card.accent);
      lg.addColorStop(0.45, 'rgba(255,255,255,0.05)');
      lg.addColorStop(1, card.accent);
      c.fillStyle = lg; c.globalAlpha = 0.9;
      c.fillRect(8, 8, W - 16, 4);
      c.restore();

      c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillStyle = card.accent;
      c.fillRect(46, 50, 5, 30);
      c.font = '700 31px "Georgia","Microsoft YaHei",serif';
      c.fillStyle = '#dfe7f2';
      c.fillText(card.title, 66, 66);

      c.strokeStyle = 'rgba(150,170,195,0.35)'; c.lineWidth = 2;
      for (var i = 0; i < 6; i++) {
        c.beginPath();
        c.moveTo(W - 52 - i * 13, 46);
        c.lineTo(W - 52 - i * 13, 46 + (i % 2 ? 9 : 16));
        c.stroke();
      }

      drawTokens(c, card.formula, W / 2, 172, 82, false);
      if (card.sub.length) drawTokens(c, card.sub, W / 2, 252, 33, false);

      c.textAlign = 'center';
      c.font = '400 26px "Microsoft YaHei","Segoe UI",sans-serif';
      c.fillStyle = 'rgba(152,170,192,0.95)';
      c.fillText(card.note, W / 2, 306, W - 120);

      c.strokeStyle = 'rgba(150,175,205,0.20)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(52, 340); c.lineTo(W - 52, 340); c.stroke();

      var y0 = 386, dy = 52;
      for (var r = 0; r < card.rows.length; r++) {
        var row = card.rows[r], y = y0 + r * dy;
        c.textAlign = 'left';
        c.font = '400 26px "Microsoft YaHei","Segoe UI",sans-serif';
        c.fillStyle = 'rgba(146,166,192,0.95)';
        c.fillText(row.k, 54, y);
        var kw = c.measureText(row.k).width;
        c.textAlign = 'right';
        c.font = '600 29px "Consolas","DejaVu Sans Mono",monospace';
        c.fillStyle = row.c || '#e8f2ff';
        c.fillText(row.v, W - 54, y);
        var vw = c.measureText(row.v).width;
        dottedLeader(c, 54 + kw + 14, W - 54 - vw - 14, y);
      }

      if (card.foot) {
        c.textAlign = 'center';
        c.font = 'italic 400 23px "Georgia","Microsoft YaHei",serif';
        c.fillStyle = 'rgba(126,144,168,0.92)';
        c.fillText(card.foot, W / 2, H - 44, W - 110);
      }
      tex.needsUpdate = true;
    }
    redraw();
    return { mesh: mesh, card: card, redraw: redraw };
  }

  /** 静态文字标签（自适应宽度） */
  function mkTag(THREE, parent, text, color, scale, opt) {
    opt = opt || {};
    var css = color || '#d9d3c7';
    var font = '600 62px "Microsoft YaHei","Segoe UI",sans-serif';
    var mc = document.createElement('canvas').getContext('2d');
    mc.font = font;
    var W = Math.max(128, Math.ceil(mc.measureText(text).width) + 72), H = 132;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    if (opt.rule) { c.fillStyle = 'rgba(190,210,232,0.55)'; c.fillRect(10, H - 18, W - 20, 2); }
    c.font = font;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = css; c.shadowBlur = 22;
    c.fillStyle = css; c.fillText(text, W / 2, H / 2 - 4);
    c.shadowBlur = 8; c.globalAlpha = 0.5; c.fillStyle = '#ffffff';
    c.fillText(text, W / 2, H / 2 - 4);
    var tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: opt.opacity === undefined ? 1 : opt.opacity
    }));
    var s = scale || 1;
    sp.scale.set(W / H * 1.45 * s, 1.45 * s, 1);
    sp.renderOrder = 998;
    parent.add(sp);
    return sp;
  }

  /** 可动态改文字的标签（固定画布，避免反复建纹理） */
  function mkTagDyn(THREE, parent, scale, opt) {
    opt = opt || {};
    var W = 900, H = 180;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    var tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    var s = scale || 0.6;
    sp.scale.set(W / H * 1.45 * s, 1.45 * s, 1);
    sp.renderOrder = 998;
    parent.add(sp);
    return {
      sprite: sp,
      set: function (text, css) {
        c.clearRect(0, 0, W, H);
        if (opt.rule) { c.fillStyle = 'rgba(190,210,232,0.55)'; c.fillRect(24, H - 34, W - 48, 3); }
        c.font = '600 84px "Microsoft YaHei","Segoe UI",sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.shadowColor = css || '#eaf2ff'; c.shadowBlur = 26;
        c.fillStyle = css || '#eaf2ff';
        c.fillText(text, W / 2, H / 2 - 8);
        c.shadowBlur = 9; c.globalAlpha = 0.5; c.fillStyle = '#ffffff';
        c.fillText(text, W / 2, H / 2 - 8);
        tex.needsUpdate = true;
      }
    };
  }

  /* ==================================================================
     五、几何辅助
     ================================================================== */
  function Segments(THREE, parent, maxSeg, opt) {
    opt = opt || {};
    var g = new THREE.BufferGeometry();
    var pos = new Float32Array(maxSeg * 6);
    var col = new Float32Array(maxSeg * 6);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var m = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true,
      opacity: opt.opacity === undefined ? 0.9 : opt.opacity,
      blending: opt.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
      depthWrite: false
    });
    var obj = new THREE.LineSegments(g, m);
    obj.frustumCulled = false;
    obj.renderOrder = opt.order || 5;
    parent.add(obj);
    var _c = new THREE.Color();
    return {
      obj: obj, max: maxSeg,
      set: function (i, x1, y1, z1, x2, y2, z2, c1, c2) {
        if (i < 0 || i >= maxSeg) return this;
        var o = i * 6;
        pos[o] = x1; pos[o + 1] = y1; pos[o + 2] = z1;
        pos[o + 3] = x2; pos[o + 4] = y2; pos[o + 5] = z2;
        if (c1 !== undefined) {
          _c.setHex(c1); col[o] = _c.r; col[o + 1] = _c.g; col[o + 2] = _c.b;
          _c.setHex(c2 === undefined ? c1 : c2); col[o + 3] = _c.r; col[o + 4] = _c.g; col[o + 5] = _c.b;
        }
        return this;
      },
      count: function (n) {
        g.setDrawRange(0, Math.min(n, maxSeg) * 2);
        g.attributes.position.needsUpdate = true;
        g.attributes.color.needsUpdate = true;
        return this;
      }
    };
  }

  function Cloud(THREE, parent, n, size, tex, opt) {
    opt = opt || {};
    var g = new THREE.BufferGeometry();
    var pos = new Float32Array(n * 3);
    var col = new Float32Array(n * 3);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var m = new THREE.PointsMaterial({
      size: size, sizeAttenuation: true, vertexColors: true,
      map: tex || null, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: opt.opacity === undefined ? 1 : opt.opacity
    });
    var obj = new THREE.Points(g, m);
    obj.frustumCulled = false;
    obj.renderOrder = opt.order || 6;
    parent.add(obj);
    var _c = new THREE.Color();
    return {
      obj: obj, n: n,
      set: function (i, x, y, z, c, k) {
        if (i < 0 || i >= n) return;
        var o = i * 3;
        pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
        _c.setHex(c === undefined ? 0xffffff : c);
        var f = k === undefined ? 1 : clamp(k, 0, 1);
        col[o] = _c.r * f; col[o + 1] = _c.g * f; col[o + 2] = _c.b * f;
      },
      flush: function () {
        g.attributes.position.needsUpdate = true;
        g.attributes.color.needsUpdate = true;
      }
    };
  }

  function wireOf(THREE, geo, color, opacity, thr) {
    return new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, thr === undefined ? 18 : thr),
      new THREE.LineBasicMaterial({
        color: color === undefined ? C.ink : color, transparent: true,
        opacity: opacity === undefined ? 0.55 : opacity, depthWrite: false
      })
    );
  }

  function wireFull(THREE, geo, color, opacity) {
    return new THREE.LineSegments(
      new THREE.WireframeGeometry(geo),
      new THREE.LineBasicMaterial({
        color: color, transparent: true,
        opacity: opacity === undefined ? 0.25 : opacity, depthWrite: false
      })
    );
  }

  function glassMat(THREE, color, opacity, power) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity === undefined ? 0.16 : opacity },
        uPower: { value: power === undefined ? 2.4 : power }
      },
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
        'uniform vec3 uColor; uniform float uOpacity; uniform float uPower;',
        'varying vec3 vN; varying vec3 vV;',
        'void main(){',
        '  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower);',
        '  gl_FragColor = vec4(uColor, uOpacity + f * 0.55);',
        '}'
      ].join('\n'),
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
  }

  /* ==================================================================
     六、BLOOM 后处理
     ================================================================== */
  function makeBloom(THREE, renderer) {
    var isGL2 = !!(renderer.capabilities && renderer.capabilities.isWebGL2);
    var type = isGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
    var rtOpt = {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type: type, depthBuffer: true, stencilBuffer: false
    };
    function mkRT(w, h, depth) {
      var o = {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat, type: type,
        depthBuffer: !!depth, stencilBuffer: false
      };
      var rt = new THREE.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), o);
      if (isGL2 && depth) rt.samples = 4;
      return rt;
    }

    var size = new THREE.Vector2();
    renderer.getDrawingBufferSize(size);
    var W = Math.max(2, Math.floor(size.x)), H = Math.max(2, Math.floor(size.y));

    var rtScene = mkRT(W, H, true);
    var levels = [];
    for (var i = 0; i < 3; i++) {
      var d = Math.pow(2, i + 1);
      levels.push({
        a: mkRT(Math.floor(W / d), Math.floor(H / d), false),
        b: mkRT(Math.floor(W / d), Math.floor(H / d), false),
        w: Math.floor(W / d), h: Math.floor(H / d)
      });
    }

    var quadScene = new THREE.Scene();
    var quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    var quadGeo = new THREE.PlaneGeometry(2, 2);
    var quad = new THREE.Mesh(quadGeo, null);
    quad.frustumCulled = false;
    quadScene.add(quad);

    var VS = 'varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

    var matBright = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uThresh: { value: 0.60 }, uSoft: { value: 0.35 } },
      vertexShader: VS,
      fragmentShader: [
        'uniform sampler2D tSrc; uniform float uThresh; uniform float uSoft;',
        'varying vec2 vUv;',
        'void main(){',
        '  vec3 c = texture2D(tSrc, vUv).rgb;',
        '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
        '  float k = smoothstep(uThresh, uThresh + uSoft, l);',
        '  gl_FragColor = vec4(c * k, 1.0);',
        '}'
      ].join('\n'),
      depthTest: false, depthWrite: false
    });

    var matBlur = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2(1, 0) } },
      vertexShader: VS,
      fragmentShader: [
        'uniform sampler2D tSrc; uniform vec2 uDir;',
        'varying vec2 vUv;',
        'void main(){',
        '  vec4 s = texture2D(tSrc, vUv) * 0.227027;',
        '  s += (texture2D(tSrc, vUv + uDir * 1.3846153846) + texture2D(tSrc, vUv - uDir * 1.3846153846)) * 0.3162162162;',
        '  s += (texture2D(tSrc, vUv + uDir * 3.2307692308) + texture2D(tSrc, vUv - uDir * 3.2307692308)) * 0.0702702703;',
        '  gl_FragColor = s;',
        '}'
      ].join('\n'),
      depthTest: false, depthWrite: false
    });

    var matComp = new THREE.ShaderMaterial({
      uniforms: {
        tBase: { value: null }, tB0: { value: null }, tB1: { value: null }, tB2: { value: null },
        uStrength: { value: 1.0 }, uVignette: { value: 0.55 }, uScan: { value: 0.030 }
      },
      vertexShader: VS,
      fragmentShader: [
        'uniform sampler2D tBase, tB0, tB1, tB2;',
        'uniform float uStrength, uVignette, uScan;',
        'varying vec2 vUv;',
        'void main(){',
        '  vec3 b = texture2D(tBase, vUv).rgb;',
        '  vec3 g = texture2D(tB0, vUv).rgb * 0.50',
        '          + texture2D(tB1, vUv).rgb * 0.32',
        '          + texture2D(tB2, vUv).rgb * 0.18;',
        '  vec3 o = b + g * uStrength;',
        '  vec2 d = vUv - 0.5;',
        '  o *= 1.0 - dot(d, d) * uVignette;',
        '  o *= 1.0 - uScan * step(0.5, fract(gl_FragCoord.y * 0.5));',
        '  gl_FragColor = vec4(o, 1.0);',
        '}'
      ].join('\n'),
      depthTest: false, depthWrite: false
    });

    function pass(mat, target) {
      quad.material = mat;
      renderer.setRenderTarget(target || null);
      renderer.render(quadScene, quadCam);
    }

    var curW = W, curH = H;
    function resize() {
      renderer.getDrawingBufferSize(size);
      var w = Math.max(2, Math.floor(size.x)), h = Math.max(2, Math.floor(size.y));
      if (w === curW && h === curH) return;
      curW = w; curH = h;
      rtScene.setSize(w, h);
      for (var i = 0; i < levels.length; i++) {
        var d = Math.pow(2, i + 1);
        var lw = Math.max(2, Math.floor(w / d)), lh = Math.max(2, Math.floor(h / d));
        levels[i].a.setSize(lw, lh);
        levels[i].b.setSize(lw, lh);
        levels[i].w = lw; levels[i].h = lh;
      }
    }

    return {
      strength: 1.0, threshold: 0.60, enabled: true, scan: true,
      resize: resize,
      render: function (r, scene, camera) {
        resize();
        if (!this.enabled || this.strength <= 0.001) {
          renderer.setRenderTarget(null);
          renderer.render(scene, camera);
          return;
        }
        renderer.setRenderTarget(rtScene);
        renderer.clear();
        renderer.render(scene, camera);

        matBright.uniforms.tSrc.value = rtScene.texture;
        matBright.uniforms.uThresh.value = this.threshold;
        pass(matBright, levels[0].a);

        for (var i = 0; i < levels.length; i++) {
          var L = levels[i];
          if (i > 0) {
            matBright.uniforms.tSrc.value = levels[i - 1].a.texture;
            matBright.uniforms.uThresh.value = 0.0;
            pass(matBright, L.a);
          }
          matBlur.uniforms.tSrc.value = L.a.texture;
          matBlur.uniforms.uDir.value.set(1 / L.w, 0);
          pass(matBlur, L.b);
          matBlur.uniforms.tSrc.value = L.b.texture;
          matBlur.uniforms.uDir.value.set(0, 1 / L.h);
          pass(matBlur, L.a);
        }

        matComp.uniforms.tBase.value = rtScene.texture;
        matComp.uniforms.tB0.value = levels[0].a.texture;
        matComp.uniforms.tB1.value = levels[1].a.texture;
        matComp.uniforms.tB2.value = levels[2].a.texture;
        matComp.uniforms.uStrength.value = this.strength;
        matComp.uniforms.uVignette.value = this.scan ? 0.55 : 0.0;
        matComp.uniforms.uScan.value = this.scan ? 0.030 : 0.0;
        pass(matComp, null);
      },
      dispose: function () {
        rtScene.dispose();
        levels.forEach(function (L) { L.a.dispose(); L.b.dispose(); });
        quadGeo.dispose();
        matBright.dispose(); matBlur.dispose(); matComp.dispose();
      }
    };
  }

  /* ==================================================================
     七、主场景
     ================================================================== */
  HL.registerScene({
    id: 'massenergy',
    name: '质能方程',
    short: 'E = mc² 的一万亿倍',
    icon: '⚛',
    desc: '质量—能量天平 · 湮灭/裂变/聚变质量亏损 · 太阳与煤球的尺度对决',
    fov: 45,
    minDistance: 2,
    maxDistance: 400,

    controls: [
      { type: 'button', key: 'tour', label: '📖 讲解模式' },
      {
        type: 'buttons', key: 'act', label: '模块',
        options: [
          { label: '① 天平', value: 'balance' },
          { label: '② 微观', value: 'micro' },
          { label: '③ 宏观', value: 'macro' }
        ],
        value: 'balance'
      },
      { type: 'range', key: 'mexp', label: '质量 log₁₀(m / kg)', min: -9, max: 3, step: 0.01, value: -3 },
      {
        type: 'buttons', key: 'rxn', label: '反应类型',
        options: [
          { label: '湮灭', value: 'annih' },
          { label: '裂变', value: 'fission' },
          { label: '聚变', value: 'fusion' }
        ],
        value: 'annih'
      },
      { type: 'range', key: 'speed', label: '反应时间流速', min: 0.15, max: 2.5, step: 0.05, value: 1.0, unit: '×' },
      { type: 'range', key: 'tsec', label: '时间尺度 log₁₀(t / s)', min: 0, max: 7.5, step: 0.01, value: 0 },
      { type: 'range', key: 'rate', label: '全局时间流速', min: 0, max: 2, step: 0.05, value: 1.0, unit: '×' },
      { type: 'range', key: 'bloom', label: 'BLOOM 强度', min: 0, max: 2.5, step: 0.05, value: 1.0 },
      { type: 'check', key: 'grid', label: '显示网格地面', value: true },
      { type: 'check', key: 'scan', label: '暗角与扫描线', value: true },
      { type: 'button', key: 'reset', label: '重置视角' },
      {
        type: 'legend',
        items: [
          ['质量 m（可见物质）', '#d9d3c7'],
          ['能量 E（辐射 / 光子）', '#ffc94d'],
          ['中子 n', '#dfe8f2'],
          ['电子 e⁻ / 正电子 e⁺', '#4db4ff'],
          ['质量亏损 Δm', '#ff4d6d']
        ]
      }
    ],

    create: function (ctx) {
      var THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera;
      var controls = ctx.controls, renderer = ctx.renderer;

      var P = {
        act: 'balance', mexp: -3, rxn: 'annih', speed: 1.0, tsec: 0,
        rate: 1.0, bloom: 1.0, grid: true, scan: true, reset: false
      };

      var T = 0, mT = 0, cardAcc = 0;

      /* ---------- 背景 ---------- */
      var bg = new THREE.Mesh(
        new THREE.SphereGeometry(600, 32, 24),
        new THREE.ShaderMaterial({
          vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
          fragmentShader: [
            'varying vec3 vP;',
            'void main(){',
            '  float h = normalize(vP).y * 0.5 + 0.5;',
            '  vec3 top = vec3(0.016, 0.024, 0.043);',
            '  vec3 mid = vec3(0.043, 0.055, 0.078);',
            '  vec3 bot = vec3(0.008, 0.011, 0.020);',
            '  vec3 c = mix(bot, mid, smoothstep(0.0, 0.55, h));',
            '  c = mix(c, top, smoothstep(0.55, 1.0, h));',
            '  gl_FragColor = vec4(c, 1.0);',
            '}'
          ].join('\n'),
          side: THREE.BackSide, depthWrite: false
        })
      );
      bg.renderOrder = -100;
      scene.add(bg);
      var stars = ctx.makeStars(2400, 480);
      scene.add(stars);

      scene.add(new THREE.AmbientLight(0x2a3442, 1.0));
      var keyLight = new THREE.PointLight(0xffb060, 2.2, 220);
      keyLight.position.set(-9, 4, 6);
      scene.add(keyLight);
      var fillLight = new THREE.DirectionalLight(0x8fa8c8, 0.5);
      fillLight.position.set(6, 10, 12);
      scene.add(fillLight);

      var floorY = -4.2;
      var grid3 = new THREE.GridHelper(160, 80, 0x2c3d4e, 0x18242f);
      grid3.position.y = floorY;
      grid3.material.transparent = true;
      grid3.material.opacity = 0.42;
      grid3.material.depthWrite = false;
      scene.add(grid3);

      var dotTexture = (function () {
        var cv = document.createElement('canvas');
        cv.width = cv.height = 64;
        var c = cv.getContext('2d');
        var g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.32, 'rgba(255,255,255,0.5)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(cv);
      })();

      var DUST_N = 520;
      var dust = Cloud(THREE, scene, DUST_N, 0.075, dotTexture, { opacity: 0.85, order: 3 });
      var dustP = [];
      for (var di = 0; di < DUST_N; di++) {
        dustP.push({
          x: (Math.random() - 0.5) * 90, y: floorY + Math.random() * 22,
          z: (Math.random() - 0.5) * 70, v: 0.10 + Math.random() * 0.30,
          ph: Math.random() * 6.28
        });
      }

      var bloom = makeBloom(THREE, renderer);
      bloom.strength = P.bloom;

      var gBal = new THREE.Group(); scene.add(gBal);
      var gMic = new THREE.Group(); scene.add(gMic);
      var gMac = new THREE.Group(); scene.add(gMac);

      /* ==============================================================
         模块 ① 天平
         ============================================================== */
      var Bal = {};
      (function buildBalance() {
        var g = gBal;

        var base = new THREE.Mesh(
          new THREE.CylinderGeometry(2.6, 3.2, 0.42, 48),
          new THREE.MeshStandardMaterial({ color: 0x141a24, roughness: 0.75, metalness: 0.35 })
        );
        base.position.set(0, floorY + 0.21, 0);
        g.add(base);
        var baseW = wireOf(THREE, new THREE.CylinderGeometry(2.6, 3.2, 0.42, 48), C.steel, 0.45);
        baseW.position.copy(base.position); g.add(baseW);

        var col = new THREE.Mesh(
          new THREE.CylinderGeometry(0.20, 0.30, 7.6, 24),
          new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.6, metalness: 0.5 })
        );
        col.position.set(0, floorY + 4.1, 0);
        g.add(col);
        var colW = wireFull(THREE, new THREE.CylinderGeometry(0.20, 0.30, 7.6, 10), C.steel, 0.30);
        colW.position.copy(col.position); g.add(colW);

        Bal.beam = new THREE.Group();
        Bal.beam.position.set(0, floorY + 7.6, 0);
        g.add(Bal.beam);

        Bal.beam.add(new THREE.Mesh(
          new THREE.BoxGeometry(16.4, 0.24, 0.46),
          new THREE.MeshStandardMaterial({ color: 0x1c2432, roughness: 0.5, metalness: 0.6 })
        ));
        Bal.beam.add(wireOf(THREE, new THREE.BoxGeometry(16.4, 0.24, 0.46), C.ink, 0.65));

        var pivGeo = new THREE.ConeGeometry(0.5, 0.9, 4);
        var piv = new THREE.Mesh(pivGeo, new THREE.MeshStandardMaterial({
          color: 0x2a3442, roughness: 0.4, metalness: 0.7
        }));
        piv.rotation.y = Math.PI / 4; piv.position.set(0, 0.5, 0);
        Bal.beam.add(piv);
        var pivW = wireOf(THREE, pivGeo, C.gold, 0.55);
        pivW.rotation.y = Math.PI / 4; pivW.position.set(0, 0.5, 0);
        Bal.beam.add(pivW);

        Bal.ropes = Segments(THREE, Bal.beam, 12, { opacity: 0.55, additive: false });

        /* 吊盘挂在梁端下方 local y = -2.6 */
        var PAN_Y = -2.6;
        function mkPan(x) {
          var grp = new THREE.Group();
          grp.position.set(x, PAN_Y, 0);
          grp.add(new THREE.Mesh(
            new THREE.CylinderGeometry(2.35, 2.35, 0.09, 56),
            glassMat(THREE, C.steel, 0.10, 2.0)
          ));
          var rim = new THREE.Mesh(
            new THREE.TorusGeometry(2.35, 0.055, 8, 72),
            new THREE.MeshBasicMaterial({ color: C.ink, transparent: true, opacity: 0.7 })
          );
          rim.rotation.x = Math.PI / 2;
          grp.add(rim);
          Bal.beam.add(grp);
          return grp;
        }
        Bal.panL = mkPan(-7.0);
        Bal.panR = mkPan(7.0);

        /* 左：质量体（放在左盘上） */
        Bal.massGrp = new THREE.Group();
        Bal.massGrp.position.set(-7.0, PAN_Y + 0.9, 0);
        Bal.beam.add(Bal.massGrp);
        Bal.massBox = new THREE.Mesh(
          new THREE.BoxGeometry(1.6, 1.6, 1.6),
          new THREE.MeshStandardMaterial({
            color: 0x20262f, roughness: 0.55, metalness: 0.55,
            emissive: 0x39434f, emissiveIntensity: 0.55
          })
        );
        Bal.massGrp.add(Bal.massBox);
        Bal.massGrp.add(wireOf(THREE, new THREE.BoxGeometry(1.6, 1.6, 1.6), C.ink, 0.95));
        Bal.massGrp.add(new THREE.Mesh(
          new THREE.SphereGeometry(0.30, 20, 16),
          new THREE.MeshBasicMaterial({ color: C.ink })
        ));

        /* 右：能量球（放在右盘上） */
        Bal.engGrp = new THREE.Group();
        Bal.engGrp.position.set(7.0, PAN_Y + 1.5, 0);
        Bal.beam.add(Bal.engGrp);
        Bal.engCore = new THREE.Mesh(
          new THREE.SphereGeometry(0.72, 32, 24),
          new THREE.MeshBasicMaterial({ color: C.gold })
        );
        Bal.engGrp.add(Bal.engCore);
        Bal.engWire = wireFull(THREE, new THREE.SphereGeometry(1.05, 20, 14), C.gold, 0.42);
        Bal.engGrp.add(Bal.engWire);
        Bal.engGrp.add(new THREE.Mesh(
          new THREE.SphereGeometry(1.45, 32, 24),
          glassMat(THREE, C.amber, 0.06, 2.2)
        ));
        Bal.engGlow = new THREE.Sprite(ctx.glowSprite('#ffc94d'));
        Bal.engGlow.scale.set(7.5, 7.5, 1);
        Bal.engGrp.add(Bal.engGlow);
        Bal.engDust = Cloud(THREE, Bal.engGrp, 90, 0.14, dotTexture, { opacity: 1, order: 7 });
        Bal.engSeed = fibSphere(90);

        Bal.flow = Cloud(THREE, Bal.beam, 48, 0.16, dotTexture, { opacity: 1, order: 7 });

        Bal.tagM = mkTag(THREE, Bal.beam, 'm', '#d9d3c7', 0.8, { rule: true });
        Bal.tagM.position.set(-7.0, PAN_Y - 1.5, 0);
        Bal.tagE = mkTag(THREE, Bal.beam, 'E / c²', '#ffc94d', 0.8, { rule: true });
        Bal.tagE.position.set(7.0, PAN_Y - 1.5, 0);
        Bal.tagEq = mkTag(THREE, Bal.beam, '≡', '#6fe3ff', 1.30, {});
        Bal.tagEq.position.set(0, 1.30, 0);

        /* 换算筒 */
        Bal.tubes = [];
        [{
          x: -6.8, name: 'TNT 当量', color: C.amber, css: '#ff8a3d', lo: -2.2, hi: 11.2
        }, {
          x: 0.0, name: '家庭年用电', color: C.cyan, css: '#6fe3ff', lo: -2.8, hi: 10.6
        }, {
          x: 6.8, name: '广岛当量', color: C.red, css: '#ff4d6d', lo: -6.2, hi: 6.6
        }].forEach(function (td) {
          var grp = new THREE.Group();
          grp.position.set(td.x, floorY + 2.45, 6.5);
          g.add(grp);
          var H = 4.4, R = 0.98;

          grp.add(new THREE.Mesh(
            new THREE.CylinderGeometry(R, R, H, 40, 1, true),
            glassMat(THREE, td.color, 0.05, 2.6)
          ));
          grp.add(wireFull(THREE, new THREE.CylinderGeometry(R, R, H, 24, 3), td.color, 0.20));

          var rimTop = new THREE.Mesh(
            new THREE.TorusGeometry(R, 0.035, 6, 48),
            new THREE.MeshBasicMaterial({ color: td.color, transparent: true, opacity: 0.75 })
          );
          rimTop.rotation.x = Math.PI / 2; rimTop.position.y = H / 2; grp.add(rimTop);
          var rimBot = new THREE.Mesh(
            new THREE.TorusGeometry(R, 0.035, 6, 48),
            new THREE.MeshBasicMaterial({ color: td.color, transparent: true, opacity: 0.5 })
          );
          rimBot.rotation.x = Math.PI / 2; rimBot.position.y = -H / 2; grp.add(rimBot);

          var liquid = new THREE.Mesh(
            new THREE.CylinderGeometry(R * 0.92, R * 0.92, H, 32),
            new THREE.MeshBasicMaterial({
              color: td.color, transparent: true, opacity: 0.42,
              blending: THREE.AdditiveBlending, depthWrite: false
            })
          );
          grp.add(liquid);

          var nameTag = mkTag(THREE, grp, td.name, td.css, 0.55, { rule: true });
          nameTag.position.set(0, -H / 2 - 0.85, 0);
          var valTag = mkTagDyn(THREE, grp, 0.60, {});
          valTag.sprite.position.set(0, H / 2 + 0.78, 0);

          Bal.tubes.push({ grp: grp, liquid: liquid, H: H, val: valTag, lo: td.lo, hi: td.hi });
        });

        Bal.card = mkCard(THREE, g, 8.2, 5.63, {
          title: '质能当量 · MASS–ENERGY EQUIVALENCE',
          accent: '#6fe3ff',
          formula: [
            { s: 'E', b: true, c: '#ffc94d' }, { s: ' = ' },
            { s: 'm', b: true, c: '#d9d3c7' },
            { s: 'c', b: true, c: '#6fe3ff' }, { s: '2', sup: true, c: '#6fe3ff' }
          ],
          sub: [{ s: 'c = 2.997 924 58 × 10⁸ m/s   ⟹   c² = 8.987 55 × 10¹⁶ J/kg' }],
          note: '质量与能量是同一物理量的两种度量',
          rows: [],
          foot: '1 kg 物质完全转化 ≈ 2 148 万吨 TNT ≈ 1 427 颗广岛原子弹'
        });
        Bal.card.mesh.position.set(0, 9.2, 4);
      })();

      /* ==============================================================
         模块 ② 微观
         ============================================================== */
      var Mic = { CY: 2.4 };
      (function buildMicro() {
        var g = gMic;

        var cage = wireFull(THREE, new THREE.IcosahedronGeometry(5.8, 2), C.steel, 0.10);
        cage.position.y = Mic.CY; g.add(cage);
        var shell = new THREE.Mesh(
          new THREE.IcosahedronGeometry(5.6, 3), glassMat(THREE, C.cyan, 0.035, 3.0)
        );
        shell.position.y = Mic.CY; g.add(shell);

        Mic.rings = [];
        [[6.0, 0.20], [5.0, 0.14], [6.8, 0.10]].forEach(function (rr, i) {
          var ring = new THREE.Mesh(
            new THREE.TorusGeometry(rr[0], 0.028, 6, 128),
            new THREE.MeshBasicMaterial({
              color: i === 0 ? C.cyan : C.steel, transparent: true, opacity: rr[1],
              blending: THREE.AdditiveBlending, depthWrite: false
            })
          );
          ring.rotation.x = Math.PI / 2 + i * 0.42;
          ring.rotation.z = i * 0.5;
          ring.position.y = Mic.CY;
          g.add(ring);
          Mic.rings.push(ring);
        });

        Mic.parts = [];
        for (var i = 0; i < 10; i++) {
          var m = new THREE.Mesh(
            new THREE.SphereGeometry(0.44, 24, 18),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 })
          );
          var w = wireFull(THREE, new THREE.SphereGeometry(0.52, 12, 8), 0xffffff, 0.35);
          m.add(w);
          var glow = new THREE.Sprite(ctx.glowSprite('#ffffff'));
          glow.scale.set(3.4, 3.4, 1);
          m.add(glow);
          m.visible = false;
          g.add(m);
          Mic.parts.push({ mesh: m, wire: w, glow: glow });
        }

        Mic.TRAIL_N = 480;
        Mic.trail = Cloud(THREE, g, Mic.TRAIL_N, 0.115, dotTexture, { opacity: 1, order: 7 });
        Mic.trailBuf = [];
        for (var k = 0; k < Mic.TRAIL_N; k++) Mic.trailBuf.push({ x: 0, y: -9999, z: 0, c: 0xffffff, a: 0 });
        Mic.trailHead = 0;

        Mic.flash = new THREE.Sprite(ctx.glowSprite('#ffffff'));
        Mic.flash.scale.set(0.1, 0.1, 1);
        Mic.flash.position.set(0, Mic.CY, 0);
        g.add(Mic.flash);

        Mic.shock = [];
        for (var s = 0; s < 3; s++) {
          var ring2 = new THREE.Mesh(
            new THREE.TorusGeometry(1, 0.06, 6, 96),
            new THREE.MeshBasicMaterial({
              color: C.gold, transparent: true, opacity: 0,
              blending: THREE.AdditiveBlending, depthWrite: false
            })
          );
          ring2.position.set(0, Mic.CY, 0);
          g.add(ring2);
          Mic.shock.push(ring2);
        }

        Mic.barrier = new THREE.LineSegments(
          new THREE.WireframeGeometry(new THREE.SphereGeometry(2.5, 18, 12)),
          new THREE.LineBasicMaterial({
            color: C.magenta, transparent: true, opacity: 0.3,
            blending: THREE.AdditiveBlending, depthWrite: false
          })
        );
        Mic.barrier.position.set(0, Mic.CY, 0);
        g.add(Mic.barrier);

        /* 质量亏损对比条 */
        Mic.barGrp = new THREE.Group();
        Mic.barGrp.position.set(0, floorY + 2.1, 5.0);
        g.add(Mic.barGrp);
        var BW = 7.6;
        Mic.barIn = new THREE.Mesh(
          new THREE.BoxGeometry(BW, 0.62, 0.30),
          new THREE.MeshBasicMaterial({ color: C.steel, transparent: true, opacity: 0.42 })
        );
        Mic.barGrp.add(Mic.barIn);
        Mic.barGrp.add(wireOf(THREE, new THREE.BoxGeometry(BW, 0.62, 0.30), C.ink, 0.75));
        Mic.barOut = new THREE.Mesh(
          new THREE.BoxGeometry(BW, 0.62, 0.32),
          new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.42 })
        );
        Mic.barOut.position.z = 0.01;
        Mic.barGrp.add(Mic.barOut);
        Mic.barOutW = wireOf(THREE, new THREE.BoxGeometry(BW, 0.62, 0.32), C.cyan, 0.8);
        Mic.barOutW.position.z = 0.01;
        Mic.barGrp.add(Mic.barOutW);
        Mic.barGap = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, 0.74, 0.42),
          new THREE.MeshBasicMaterial({ color: C.red, transparent: true, opacity: 0.9 })
        );
        Mic.barGrp.add(Mic.barGap);
        Mic.barTagL = mkTag(THREE, Mic.barGrp, '反应前静质量', '#9fb3c8', 0.48, { rule: true });
        Mic.barTagL.position.set(-BW / 2 + 2.0, -1.0, 0);
        Mic.barTagG = mkTag(THREE, Mic.barGrp, 'Δm（放大显示）', '#ff4d6d', 0.48, {});
        Mic.barTagG.position.set(BW / 2 - 1.6, 1.05, 0);
        Mic.barWidth = BW;

        Mic.tagL = mkTagDyn(THREE, g, 0.62, {});
        Mic.tagR = mkTagDyn(THREE, g, 0.62, {});

        Mic.card = mkCard(THREE, g, 7.6, 5.22, {
          title: '质量亏损 · MASS DEFECT',
          accent: '#ffc94d',
          formula: [
            { s: 'Δ', c: '#ff4d6d' }, { s: 'E', b: true, c: '#ffc94d' }, { s: ' = Δ' },
            { s: 'm', b: true, c: '#ff4d6d' },
            { s: 'c', c: '#6fe3ff' }, { s: '2', sup: true, c: '#6fe3ff' }
          ],
          sub: [], note: '', rows: [], foot: ''
        });
        Mic.card.mesh.position.set(0, 8.35, 4);
      })();

      /* ==============================================================
         模块 ③ 宏观
         ============================================================== */
      var Mac = {};
      (function buildMacro() {
        var g = gMac;

        Mac.sunGrp = new THREE.Group();
        Mac.sunGrp.position.set(-9.4, 1.6, 0);
        g.add(Mac.sunGrp);

        Mac.sunMat = new THREE.ShaderMaterial({
          uniforms: { uTime: { value: 0 }, uPulse: { value: 0 } },
          vertexShader: [
            'varying vec3 vP; varying vec3 vN; varying vec3 vV;',
            'void main(){',
            '  vP = position;',
            '  vN = normalize(normalMatrix * normal);',
            '  vec4 mv = modelViewMatrix * vec4(position,1.0);',
            '  vV = normalize(-mv.xyz);',
            '  gl_Position = projectionMatrix * mv;',
            '}'
          ].join('\n'),
          fragmentShader: [
            'uniform float uTime; uniform float uPulse;',
            'varying vec3 vP; varying vec3 vN; varying vec3 vV;',
            'float h(vec3 p){',
            '  return sin(p.x*3.1+uTime*0.55)*sin(p.y*2.7-uTime*0.42)*sin(p.z*3.3+uTime*0.38);',
            '}',
            'void main(){',
            '  vec3 p = normalize(vP);',
            '  float n = h(p)*0.5 + h(p*2.3)*0.28 + h(p*4.7)*0.16;',
            '  float g = 0.5 + 0.5*n;',
            '  vec3 c1 = vec3(0.55, 0.13, 0.02);',
            '  vec3 c2 = vec3(1.00, 0.48, 0.10);',
            '  vec3 c3 = vec3(1.00, 0.94, 0.72);',
            '  vec3 col = mix(c1, c2, smoothstep(0.15, 0.72, g));',
            '  col = mix(col, c3, smoothstep(0.72, 1.0, g));',
            '  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);',
            '  col += vec3(1.0, 0.62, 0.24) * f * 0.85;',
            '  col *= 1.0 + uPulse * 0.25;',
            '  gl_FragColor = vec4(col, 1.0);',
            '}'
          ].join('\n')
        });
        Mac.sun = new THREE.Mesh(new THREE.SphereGeometry(3.5, 64, 48), Mac.sunMat);
        Mac.sunGrp.add(Mac.sun);
        Mac.corona = wireFull(THREE, new THREE.SphereGeometry(4.15, 26, 18), C.amber, 0.16);
        Mac.sunGrp.add(Mac.corona);
        Mac.halo = new THREE.Sprite(ctx.glowSprite('#ffb050'));
        Mac.halo.scale.set(13, 13, 1);
        Mac.sunGrp.add(Mac.halo);

        Mac.rays = Segments(THREE, Mac.sunGrp, 64, { opacity: 0.55 });
        Mac.rayDirs = fibSphere(64);

        Mac.waves = [];
        for (var wi = 0; wi < 3; wi++) {
          var wv = new THREE.LineSegments(
            new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 20, 14)),
            new THREE.LineBasicMaterial({
              color: C.gold, transparent: true, opacity: 0,
              blending: THREE.AdditiveBlending, depthWrite: false
            })
          );
          wv.position.copy(Mac.sunGrp.position);
          g.add(wv);
          Mac.waves.push({ mesh: wv, t: wi / 3 });
        }

        Mac.sunDust = Cloud(THREE, Mac.sunGrp, 220, 0.14, dotTexture, { opacity: 1, order: 7 });
        Mac.sunSeed = fibSphere(220);

        /* 煤堆 */
        Mac.coalGrp = new THREE.Group();
        Mac.coalGrp.position.set(9.4, floorY + 3.2, 0);
        g.add(Mac.coalGrp);
        Mac.coalCube = new THREE.Mesh(
          new THREE.BoxGeometry(3.2, 3.2, 3.2),
          new THREE.MeshStandardMaterial({
            color: 0x14161c, roughness: 0.92, metalness: 0.12,
            emissive: 0xff4a12, emissiveIntensity: 0.30
          })
        );
        Mac.coalGrp.add(Mac.coalCube);
        Mac.coalWire = wireOf(THREE, new THREE.BoxGeometry(3.2, 3.2, 3.2), C.ember, 0.85);
        Mac.coalGrp.add(Mac.coalWire);

        Mac.chunks = [];
        for (var ci = 0; ci < 14; ci++) {
          var sz = 0.30 + Math.random() * 0.34;
          var ch = new THREE.Mesh(
            new THREE.IcosahedronGeometry(sz, 0),
            new THREE.MeshStandardMaterial({
              color: 0x0f1116, roughness: 0.95, metalness: 0.05,
              emissive: 0xff3a08, emissiveIntensity: 0.22
            })
          );
          var ang = Math.random() * 6.283, rad = 1.9 + Math.random() * 1.7;
          ch.position.set(Math.cos(ang) * rad, -1.7 + Math.random() * 0.5, Math.sin(ang) * rad * 0.7);
          ch.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
          ch.add(wireOf(THREE, new THREE.IcosahedronGeometry(sz, 0), 0x6a4a3a, 0.55, 1));
          Mac.coalGrp.add(ch);
          Mac.chunks.push(ch);
        }

        Mac.smoke = Cloud(THREE, Mac.coalGrp, 160, 0.30, dotTexture, { opacity: 1, order: 6 });
        Mac.smokeP = [];
        for (var si = 0; si < 160; si++) {
          Mac.smokeP.push({
            x: (Math.random() - 0.5) * 4.2, y: -1.9 + Math.random() * 0.6,
            z: (Math.random() - 0.5) * 3.4, v: 0.7 + Math.random() * 1.5, ph: Math.random() * 6.28
          });
        }
        Mac.ember = new THREE.Sprite(ctx.glowSprite('#ff5a1f'));
        Mac.ember.scale.set(9, 9, 1);
        Mac.ember.position.y = -1.9;
        Mac.coalGrp.add(Mac.ember);

        Mac.bridge = Cloud(THREE, g, 120, 0.15, dotTexture, { opacity: 1, order: 7 });
        Mac.bridgeSeed = [];
        for (var bi = 0; bi < 120; bi++) Mac.bridgeSeed.push(Math.random());

        Mac.earth = new THREE.Mesh(
          new THREE.SphereGeometry(0.42, 24, 18),
          new THREE.MeshBasicMaterial({ color: 0x2f7fd0, transparent: true, opacity: 0.85 })
        );
        Mac.earth.position.set(-4.0, -2.6, 8.6);
        g.add(Mac.earth);
        Mac.earthW = wireFull(THREE, new THREE.SphereGeometry(0.48, 12, 8), C.cyan, 0.35);
        Mac.earthW.position.copy(Mac.earth.position);
        g.add(Mac.earthW);
        Mac.earthTag = mkTag(THREE, g, '地球', '#6fe3ff', 0.45, { rule: true });
        Mac.earthTag.position.set(-4.0, -3.4, 8.6);

        Mac.tagSun = mkTag(THREE, g, '太阳 · 每秒 426 万吨 → 光', '#ffc94d', 0.72, { rule: true });
        Mac.tagSun.position.set(-9.4, 5.8, 0);
        Mac.tagCoal = mkTag(THREE, g, '标准煤 · 化学燃烧', '#ff8a3d', 0.72, { rule: true });
        Mac.tagCoal.position.set(9.4, floorY + 0.2, 0);
        Mac.tagCoalVal = mkTagDyn(THREE, g, 0.60, {});
        Mac.tagCoalVal.sprite.position.set(9.4, floorY + 6.8, 0);

        Mac.card = mkCard(THREE, g, 8.6, 5.9, {
          title: '恒星熔炉 · STELLAR FUSION',
          accent: '#ff8a3d',
          formula: [
            { s: 'Δm', c: '#ff4d6d' }, { s: ' / Δ' }, { s: 't', c: '#9fb3c8' }, { s: ' = ' },
            { s: 'L', b: true, c: '#ffc94d' }, { s: '☉', sub: true, c: '#ffc94d' },
            { s: ' / c', c: '#6fe3ff' }, { s: '2', sup: true, c: '#6fe3ff' }
          ],
          sub: [{ s: '4¹₁H  →  ⁴₂He + 2e⁺ + 2ν + 26.73 MeV' }],
          note: '太阳每秒把约 426 万吨物质转化为辐射能',
          rows: [],
          foot: '太阳 1 秒的辐射 ≈ 燃尽边长 249 km 的煤立方体'
        });
        Mac.card.mesh.position.set(0, 9.1, 4);
      })();

      /* ==============================================================
         相机飞行
         ============================================================== */
      var fly = {
        active: false, t: 0, dur: 1.05,
        fromP: new THREE.Vector3(), fromT: new THREE.Vector3(),
        toP: new THREE.Vector3(), toT: new THREE.Vector3()
      };

      function applyView(name) {
        var v = VIEW[name] || VIEW.balance;
        fly.toP.set(v.pos[0], v.pos[1], v.pos[2]);
        fly.toT.set(v.tgt[0], v.tgt[1], v.tgt[2]);
        if (T < 0.001) {                       // 首帧（含 URL 直达）瞬时落位
          camera.position.copy(fly.toP);
          controls.target.copy(fly.toT);
          controls.syncFromCamera();
          controls.saveHome();
          fly.active = false;
        } else {
          fly.fromP.copy(camera.position);
          fly.fromT.copy(controls.target);
          fly.t = 0; fly.active = true;
        }
      }

      function setAct(a) {
        P.act = a;
        gBal.visible = (a === 'balance');
        gMic.visible = (a === 'micro');
        gMac.visible = (a === 'macro');
        applyView(a);
      }

      /* ==============================================================
         模块 ① 更新
         ============================================================== */
      var stBal = { m: 0, E: 0, tnt: 0, home: 0, hiro: 0 };

      function updateBalance(dt) {
        var m = Math.pow(10, P.mexp);
        var E = m * C2;
        stBal.m = m; stBal.E = E;
        stBal.tnt = E / TNT_T;
        stBal.home = E / HOME_YEAR;
        stBal.hiro = E / HIROSHIMA;

        var f = (P.mexp + 9) / 12;                 // 0..1
        var s = 0.55 + 1.35 * f;

        Bal.massGrp.scale.setScalar(s);
        Bal.massGrp.position.y = -2.5 + 0.86 * s;
        Bal.massGrp.rotation.y += dt * 0.32;
        Bal.massGrp.rotation.x = Math.sin(T * 0.5) * 0.09;

        Bal.engGrp.scale.setScalar(s);
        Bal.engGrp.position.y = -2.5 + 1.50 * s;
        Bal.engCore.scale.setScalar(1 + 0.055 * Math.sin(T * 4.2));
        Bal.engWire.rotation.y -= dt * 0.55;
        Bal.engWire.rotation.x += dt * 0.22;
        Bal.engGlow.material.opacity = 0.55 + 0.22 * Math.sin(T * 3.1);

        for (var i = 0; i < 90; i++) {
          var d = Bal.engSeed[i];
          var k = ((T * 0.42 + i * 0.0111) % 1);
          var rr = 1.5 + k * 2.6;
          Bal.engDust.set(i, d[0] * rr, d[1] * rr, d[2] * rr,
            i % 3 === 0 ? C.white : C.gold, (1 - k) * 0.9);
        }
        Bal.engDust.flush();

        for (var j = 0; j < 48; j++) {
          var u = ((T * 0.34 + j / 48) % 1);
          Bal.flow.set(j, lerp(-7.0, 7.0, u),
            -1.55 + Math.sin(u * Math.PI) * 1.55, 0,
            u < 0.5 ? C.ink : C.gold, Math.sin(u * Math.PI) * 0.95);
        }
        Bal.flow.flush();

        Bal.beam.rotation.z = 0.016 * Math.sin(T * 0.85);

        var r = 0;
        [-7.0, 7.0].forEach(function (px) {
          Bal.ropes.set(r++, px, 0.05, 0, px - 0.95, -2.55, 0.95, C.steel);
          Bal.ropes.set(r++, px, 0.05, 0, px + 0.95, -2.55, 0.95, C.steel);
          Bal.ropes.set(r++, px, 0.05, 0, px - 0.95, -2.55, -0.95, C.steel);
          Bal.ropes.set(r++, px, 0.05, 0, px + 0.95, -2.55, -0.95, C.steel);
        });
        Bal.ropes.count(r);

        Bal.tagEq.material.opacity = 0.75 + 0.25 * Math.sin(T * 2.0);

        var vals = [
          Math.log10(Math.max(stBal.tnt, 1e-12)),
          Math.log10(Math.max(stBal.home, 1e-12)),
          Math.log10(Math.max(stBal.hiro, 1e-12))
        ];
        for (var t2 = 0; t2 < Bal.tubes.length; t2++) {
          var tb = Bal.tubes[t2];
          var kk = clamp((vals[t2] - tb.lo) / (tb.hi - tb.lo), 0.02, 1);
          tb.liquid.scale.y = kk;
          tb.liquid.position.y = -tb.H / 2 + tb.H * kk / 2;
          tb.liquid.material.opacity = 0.30 + 0.22 * Math.sin(T * 2.4 + t2);
        }

        Bal.card.card.rows = [
          { k: '质量 m', v: humanMass(m), c: '#d9d3c7' },
          { k: '能量 E = mc²', v: humanEnergy(E), c: '#ffc94d' },
          { k: 'TNT 当量', v: humanTNT(stBal.tnt), c: '#ff8a3d' },
          { k: '家庭年用电', v: sci(stBal.home, 3) + ' 年', c: '#6fe3ff' },
          { k: '广岛原子弹当量', v: sci(stBal.hiro, 3) + ' 颗', c: '#ff4d6d' }
        ];
        Bal.card.card.note = '当前质量 ' + humanMass(m) + '（' + sci(m, 3) + ' kg）完全转化所得能量';
      }

      function syncBalanceTags() {
        Bal.tubes[0].val.set(humanTNT(stBal.tnt), '#ff8a3d');
        Bal.tubes[1].val.set(sci(stBal.home, 3) + ' 年', '#6fe3ff');
        Bal.tubes[2].val.set(sci(stBal.hiro, 3) + ' 颗', '#ff4d6d');
      }

      /* ==============================================================
         模块 ② 更新
         ============================================================== */
      function partCfg(rxn) {
        if (rxn === 'annih') {
          return {
            inC: [C.blue, 0xff6b8a], inR: [0.42, 0.42],
            outC: [C.gold, C.gold], outR: [0.34, 0.34]
          };
        }
        if (rxn === 'fission') {
          return {
            inC: [0xffffff, C.green], inR: [0.30, 1.35],
            outC: [0xffa04d, 0x6ea8ff, 0xffffff, 0xffffff, 0xffffff, C.gold],
            outR: [0.98, 0.74, 0.30, 0.30, 0.30, 0.34]
          };
        }
        return {
          inC: [0x6ea8ff, C.violet], inR: [0.55, 0.68],
          outC: [C.gold, 0xffffff], outR: [0.86, 0.32]
        };
      }

      var stMic = { phase: '' };
      var lastTagL = '', lastTagR = '';

      function putPart(idx, x, y, z, color, r) {
        if (idx >= Mic.parts.length) return;
        var p = Mic.parts[idx];
        p.mesh.visible = true;
        p.mesh.position.set(x, y, z);
        p.mesh.scale.setScalar(r / 0.44);
        p.mesh.material.color.setHex(color);
        p.wire.material.color.setHex(color);
        p.glow.material.color.setHex(color);
        p.glow.material.opacity = 0.85;
      }

      function updateMicro(dt) {
        var rx = RXN[P.rxn];
        var cfg = partCfg(P.rxn);
        var CY = Mic.CY;
        var u = (mT % 1);
        var tHit = P.rxn === 'fusion' ? 0.46 : (P.rxn === 'fission' ? 0.36 : 0.40);

        Mic.parts.forEach(function (p) { p.mesh.visible = false; });

        var flashK = 0, shockK = 0;

        if (u < tHit) {
          var ae = easeIn(clamp(u / tHit, 0, 1));
          var xa = lerp(-6.6, 0, ae), xb = lerp(6.6, 0, ae);
          if (P.rxn === 'fission') {
            putPart(0, xa, CY + 0.15, 0, cfg.inC[0], cfg.inR[0]);
            putPart(1, 0.4, CY, 0, cfg.inC[1], cfg.inR[1] * (1 + 0.10 * Math.sin(T * 9)));
            Mic.tagL.sprite.position.set(xa, CY + 1.4, 0);
            Mic.tagR.sprite.position.set(0.4, CY + 2.5, 0);
          } else if (P.rxn === 'fusion') {
            putPart(0, xa, CY + 0.2, 0.25, cfg.inC[0], cfg.inR[0]);
            putPart(1, xb, CY - 0.2, -0.25, cfg.inC[1], cfg.inR[1]);
            Mic.tagL.sprite.position.set(xa, CY + 1.5, 0.25);
            Mic.tagR.sprite.position.set(xb, CY + 1.7, -0.25);
          } else {
            putPart(0, xa, CY, 0, cfg.inC[0], cfg.inR[0]);
            putPart(1, xb, CY, 0, cfg.inC[1], cfg.inR[1]);
            Mic.tagL.sprite.position.set(xa, CY + 1.3, 0);
            Mic.tagR.sprite.position.set(xb, CY + 1.3, 0);
          }
          stMic.phase = '入射接近中 …';
        } else {
          var since = (u - tHit) / (1 - tHit);
          flashK = clamp(1 - since / 0.10, 0, 1);
          shockK = clamp(since / 0.85, 0, 1);
          var flyK = easeOut(clamp(since / 0.75, 0, 1));

          if (P.rxn === 'annih') {
            putPart(0, 0, CY + flyK * 3.6, 0, cfg.outC[0], cfg.outR[0]);
            putPart(1, 0, CY - flyK * 3.6, 0, cfg.outC[1], cfg.outR[1]);
            stMic.phase = '湮灭完成 · 两个 0.511 MeV γ 光子背向逃逸';
          } else if (P.rxn === 'fission') {
            var sep = 1.0 + flyK * 4.2;
            putPart(0, 0, CY + sep * 0.62, 0.2, cfg.outC[0], cfg.outR[0]);
            putPart(1, 0, CY - sep * 0.85, -0.2, cfg.outC[1], cfg.outR[1]);
            for (var n3 = 0; n3 < 3; n3++) {
              var an = 2.1 + n3 * 2.09 + T * 0.25;
              var rr = 1.2 + flyK * 3.2;
              putPart(2 + n3, Math.cos(an) * rr, CY + Math.sin(an) * rr * 0.8,
                Math.sin(an * 0.6) * rr * 0.5, cfg.outC[2], cfg.outR[2]);
            }
            putPart(5, 0, CY + 0.2, 2.4 + flyK * 1.4, cfg.outC[5], cfg.outR[5]);
            stMic.phase = '裂变完成 · 碎片动能 ≈ 168 MeV（占 97%）';
          } else {
            var sp2 = 1.0 + flyK * 4.0;
            putPart(0, 0, CY + sp2 * 0.55, 0.1, cfg.outC[0], cfg.outR[0]);
            putPart(1, 0, CY - sp2 * 0.95, -0.1, cfg.outC[1], cfg.outR[1]);
            stMic.phase = '聚变完成 · 17.6 MeV（He 3.5 / n 14.1）';
          }
          Mic.tagL.sprite.position.set(0, CY + 8.6, 0);
          Mic.tagR.sprite.position.set(0, CY - 8.6, 0);
        }

        var tl = P.rxn === 'annih' ? ['e⁻', '#4db4ff']
          : (P.rxn === 'fission' ? ['n', '#dfe8f2'] : ['²H', '#6ea8ff']);
        var tr = P.rxn === 'annih' ? ['e⁺', '#ff6b8a']
          : (P.rxn === 'fission' ? ['²³⁵U', '#7ef2a8'] : ['³H', '#c9a6ff']);
        if (tl[0] !== lastTagL) { lastTagL = tl[0]; Mic.tagL.set(tl[0], tl[1]); }
        if (tr[0] !== lastTagR) { lastTagR = tr[0]; Mic.tagR.set(tr[0], tr[1]); }
        Mic.tagL.sprite.visible = Mic.tagR.sprite.visible = (u < tHit);

        /* 拖尾环形缓冲 */
        for (var pi = 0; pi < Mic.parts.length; pi++) {
          if (!Mic.parts[pi].mesh.visible) continue;
          var pp = Mic.parts[pi].mesh.position;
          var pc = Mic.parts[pi].mesh.material.color.getHex();
          var b = Mic.trailBuf[Mic.trailHead];
          b.x = pp.x; b.y = pp.y; b.z = pp.z; b.c = pc; b.a = 1;
          Mic.trailHead = (Mic.trailHead + 1) % Mic.TRAIL_N;
        }
        var decay = dt * 1.9;
        for (var tI = 0; tI < Mic.TRAIL_N; tI++) {
          var tb2 = Mic.trailBuf[tI];
          if (tb2.a > 0) tb2.a -= decay;
          Mic.trail.set(tI, tb2.x, tb2.a > 0 ? tb2.y : -9999, tb2.z, tb2.c, tb2.a * 0.6);
        }
        Mic.trail.flush();

        Mic.flash.material.opacity = flashK;
        Mic.flash.scale.setScalar(0.5 + flashK * 13);

        for (var sI = 0; sI < Mic.shock.length; sI++) {
          var sk = clamp(shockK * 1.25 - sI * 0.22, 0, 1);
          Mic.shock[sI].scale.setScalar(0.6 + sk * 7.4);
          Mic.shock[sI].material.opacity = (u < tHit) ? 0 : (1 - sk) * 0.75;
          Mic.shock[sI].rotation.x = Math.PI / 2 + sI * 0.5;
          Mic.shock[sI].rotation.z = sI * 0.7;
        }

        Mic.barrier.visible = (P.rxn === 'fusion' && u < tHit);
        if (Mic.barrier.visible) {
          var ae2 = clamp(u / tHit, 0, 1);
          Mic.barrier.scale.setScalar((2.9 - 1.1 * ae2) / 2.5);
          Mic.barrier.material.opacity = 0.12 + 0.28 * ae2;
          Mic.barrier.rotation.y += dt * 0.5;
        }

        Mic.rings.forEach(function (rg, i) {
          rg.rotation.z += dt * (0.08 + i * 0.05);
          rg.material.opacity = (i === 0 ? 0.16 : 0.10) + 0.08 * Math.abs(Math.sin(T * 0.8 + i));
        });

        /* 质量亏损条 */
        var dmU = rx.mIn - rx.mOut;
        var Qmev = dmU * U_MEV;
        var eta = dmU / rx.mIn;
        var BW = Mic.barWidth;
        var outFrac = 1 - eta;
        Mic.barOut.scale.x = outFrac;
        Mic.barOut.position.x = -BW * (1 - outFrac) / 2;
        Mic.barOutW.scale.x = outFrac;
        Mic.barOutW.position.x = Mic.barOut.position.x;
        var gapW = clamp(BW * eta * 12, 0.14, BW * 0.34);
        Mic.barGap.scale.x = gapW / 0.6;
        Mic.barGap.position.x = BW / 2 - gapW / 2;
        Mic.barGap.material.opacity = 0.55 + 0.4 * Math.abs(Math.sin(T * 3.4));

        Mic.card.card.sub = rx.eq;
        Mic.card.card.note = stMic.phase;
        Mic.card.card.rows = [
          { k: '反应前静止质量', v: sci(rx.mIn, 6) + ' u', c: '#9fb3c8' },
          { k: '反应后静止质量', v: sci(rx.mOut, 6) + ' u', c: '#6fe3ff' },
          { k: '质量亏损 Δm', v: sci(dmU, 4) + ' u  (' + sci(dmU * U_KG, 3) + ' kg)', c: '#ff4d6d' },
          { k: '释放能量 Q = Δm·c²', v: sci(Qmev, 4) + ' MeV = ' + humanEnergy(Qmev * MEV), c: '#ffc94d' },
          { k: '质能转换率 η', v: sci(eta * 100, 3) + ' %', c: '#7ef2a8' }
        ];
        Mic.card.card.foot = rx.note;
      }

      /* ==============================================================
         模块 ③ 更新
         ============================================================== */
      function updateMacro(dt) {
        var ts = Math.pow(10, P.tsec);
        var dmRate = L_SUN / C2;
        var dm = dmRate * ts;
        var coal = L_SUN * ts / COAL_J;
        var edge = Math.pow(coal / COAL_RHO, 1 / 3);
        var earthPow = L_SUN * (R_EARTH * R_EARTH) / (4 * D_AU * D_AU);

        Mac.sunMat.uniforms.uTime.value = T;
        Mac.sunMat.uniforms.uPulse.value = 0.5 + 0.5 * Math.sin(T * 1.6);
        Mac.sun.rotation.y += dt * 0.055;
        Mac.corona.rotation.y -= dt * 0.10;
        Mac.corona.rotation.x += dt * 0.035;
        Mac.halo.material.opacity = 0.42 + 0.14 * Math.sin(T * 1.9);

        for (var i = 0; i < 64; i++) {
          var d = Mac.rayDirs[i];
          var len = 3.6 + 1.5 * (0.5 + 0.5 * Math.sin(T * 2.2 + i));
          Mac.rays.set(i, d[0] * 3.5, d[1] * 3.5, d[2] * 3.5,
            d[0] * (3.5 + len), d[1] * (3.5 + len), d[2] * (3.5 + len),
            i % 4 === 0 ? C.white : C.amber);
        }
        Mac.rays.count(64);

        for (var j = 0; j < 220; j++) {
          var s2 = Mac.sunSeed[j];
          var k2 = ((T * 0.30 + j * 0.00454) % 1);
          var rr = 3.6 + k2 * 5.4;
          Mac.sunDust.set(j, s2[0] * rr, s2[1] * rr, s2[2] * rr,
            j % 3 === 0 ? C.white : C.amber, (1 - k2) * 0.85);
        }
        Mac.sunDust.flush();

        for (var w = 0; w < Mac.waves.length; w++) {
          var wv = Mac.waves[w];
          wv.t += dt * 0.22;
          if (wv.t > 1) wv.t -= 1;
          wv.mesh.scale.setScalar(3.5 + wv.t * 10.5);
          wv.mesh.material.opacity = (1 - wv.t) * 0.30;
          wv.mesh.rotation.y += dt * 0.12;
        }

        var cf = clamp(P.tsec / 7.5, 0, 1);
        var cs = 1.9 + 2.3 * cf;
        Mac.coalCube.scale.setScalar(cs / 3.2);
        Mac.coalWire.scale.setScalar(cs / 3.2);
        Mac.coalGrp.rotation.y += dt * 0.10;
        Mac.coalCube.material.emissiveIntensity = 0.22 + 0.14 * Math.abs(Math.sin(T * 2.6));

        for (var s3 = 0; s3 < 160; s3++) {
          var p3 = Mac.smokeP[s3];
          p3.y += p3.v * dt * (0.55 + cf * 0.9);
          if (p3.y > 7.0) { p3.y = -2.2; p3.x = (Math.random() - 0.5) * 4.2; p3.z = (Math.random() - 0.5) * 3.4; }
          var fade = clamp(1 - (p3.y + 2.2) / 9.2, 0, 1);
          Mac.smoke.set(s3, p3.x + Math.sin(T * 0.8 + p3.ph) * 0.35, p3.y, p3.z,
            s3 % 5 === 0 ? C.ember : 0x39424e, fade * 0.5);
        }
        Mac.smoke.flush();
        Mac.ember.material.opacity = 0.30 + 0.20 * Math.abs(Math.sin(T * 3.0));
        Mac.ember.scale.setScalar(6 + 4 * cf);

        for (var b2 = 0; b2 < 120; b2++) {
          var u2 = ((T * 0.26 + Mac.bridgeSeed[b2]) % 1);
          Mac.bridge.set(b2, lerp(-9.4, 9.4, u2),
            lerp(1.6, floorY + 3.2, u2) + Math.sin(u2 * Math.PI) * 3.4,
            Math.sin(u2 * 6.28) * 0.6,
            u2 < 0.5 ? C.amber : C.gold, Math.sin(u2 * Math.PI) * 0.85);
        }
        Mac.bridge.flush();

        Mac.earth.rotation.y += dt * 0.4;
        Mac.earthW.rotation.y -= dt * 0.25;

        Mac.card.card.note = '时间尺度 t = ' + humanTime(ts) + '（' + sci(ts, 3) + ' s）内太阳的账本';
        Mac.card.card.rows = [
          { k: '辐射功率 L☉', v: sci(L_SUN, 4) + ' W', c: '#ffc94d' },
          { k: '质量亏损 Δm', v: humanMass(dm) + '（' + sci(dm, 3) + ' kg）', c: '#ff4d6d' },
          { k: '等效标准煤', v: sci(coal, 3) + ' kg', c: '#ff8a3d' },
          { k: '煤立方边长', v: humanLen(edge) + ' ≈ ' + fixed(edge / (2 * R_EARTH) * 1000, 0) + ' 地球直径', c: '#d9d3c7' },
          { k: '地球截获功率', v: sci(earthPow, 3) + ' W', c: '#6fe3ff' }
        ];
        Mac.tagCoalVal.set('≡ ' + humanLen(edge) + ' 立方体', '#ff8a3d');
      }

      /* ==============================================================
         HUD 刷新
         ============================================================== */
      function refreshCard() {
        if (P.act === 'balance') { syncBalanceTags(); Bal.card.redraw(); }
        else if (P.act === 'micro') Mic.card.redraw();
        else Mac.card.redraw();
      }

      /* ==============================================================
         API
         ============================================================== */
      var api = {
        update: function (dt) {
          T += dt * P.rate;
          mT += dt * P.rate * P.speed * 0.28;

          if (fly.active) {
            fly.t += dt / fly.dur;
            var k = smooth(clamp(fly.t, 0, 1));
            camera.position.lerpVectors(fly.fromP, fly.toP, k);
            controls.target.lerpVectors(fly.fromT, fly.toT, k);
            controls.syncFromCamera();
            if (fly.t >= 1) { fly.active = false; controls.saveHome(); }
          }

          for (var i = 0; i < DUST_N; i++) {
            var d = dustP[i];
            d.y += d.v * dt * P.rate;
            if (d.y > floorY + 24) d.y = floorY;
            dust.set(i, d.x + Math.sin(T * 0.25 + d.ph) * 0.6, d.y, d.z, C.ink, 0.32);
          }
          dust.flush();
          grid3.visible = P.grid;
          stars.rotation.y += dt * 0.004 * P.rate;

          if (P.act === 'balance') updateBalance(dt);
          else if (P.act === 'micro') updateMicro(dt);
          else updateMacro(dt);

          cardAcc += dt;
          if (cardAcc >= 0.13) { cardAcc = 0; refreshCard(); }

          bloom.strength = P.bloom;
          bloom.enabled = P.bloom > 0.001;
          bloom.scan = P.scan;
        },

        render: function (r, sc, cam) { bloom.render(r, sc, cam); },

        setParam: function (key, v) {
          if (key === 'reset' && v) { controls.reset(); return; }
          P[key] = v;
          if (key === 'act') setAct(v);
          else if (key === 'rxn') { mT = 0; refreshCard(); }
          else if (key === 'grid') grid3.visible = !!v;
          refreshCard();
        },

        onClick: function () { if (P.act === 'micro') mT = 0; },

        dispose: function () {
          bloom.dispose();
          api.render = null;
        }
      };

      /* ==============================================================
         讲解模式（HL.Tour 框架引擎）
         ============================================================== */
      var tour = HL.Tour(ctx);
      tour.load([
        {
          t: '一、E = mc²：质量的价签',
          d: '这台天平左边是质量、右边是能量。爱因斯坦 1905 年的狭义相对论告诉我们：质量与能量是同一件事的两种度量，兑换汇率是 c² ≈ 9×10¹⁶。哪怕 1 克物质，也相当于 89.9 太焦耳——约 2.1 万吨 TNT，或一座城市一天的用电。',
          exp: '退出讲解后拖「质量 log₁₀(m/kg)」滑杆，看右侧换算数字飙升。',
          cam: [[0, 4.8, 27.0], [1.2, 2.6, 0]],
          pulse: null
        },
        {
          t: '二、湮灭：100% 的质能转换',
          d: '微观展区。正电子与电子相遇，静质量全部消失，变成两颗反向飞出的光子——1.022 MeV，一分不差。这是已知唯一的 100% 质能转换过程；反物质是宇宙中最贵的「燃料」，人工制成 1 克需要的天文数字能源远超其释放的能量。',
          exp: '已为你切到「微观 · 湮灭」。点击画面可重播反应。',
          cam: [[0, 3.2, 25.0], [1.2, 2.4, 0]],
          pulse: [1.2, 2.4, 0], r: 3,
          apply: function () { setAct('micro'); P.rxn = 'annih'; mT = 0; fly.active = false; refreshCard(); }
        },
        {
          t: '三、裂变：拆开原子核',
          d: '一颗中子撞进铀-235，核振荡成哑铃状、断裂成钡与氪，释放 3 颗新中子与约 173 MeV（瞬发）。产物的静质量加起来比反应前少了约 0.19%——这 0.19% 就是核电站与原子弹的全部能量来源。1 千克铀-235 完全裂变 ≈ 2700 吨标准煤。',
          exp: '已为你切到「裂变」。注意红色标记的质量亏损 Δm 与释放的 Q 值。',
          cam: [[0, 3.2, 25.0], [1.2, 2.4, 0]],
          pulse: [1.2, 2.4, 0], r: 3,
          apply: function () { setAct('micro'); P.rxn = 'fission'; mT = 0; fly.active = false; refreshCard(); }
        },
        {
          t: '四、聚变：恒星的心跳',
          d: '氘与氚聚合成氦-4，甩出一颗中子，释放 17.6 MeV——按质量占比算，是裂变的 4 倍多。聚变需要上千万度克服库仑斥力，所以它只能在恒星 core 里持续燃烧，也是氢弹与「人造太阳」托卡马克的原理。海水中的氘足够人类用上亿年。',
          exp: '已为你切到「聚变」。对比裂变：单位质量的能量更高。',
          cam: [[0, 3.2, 25.0], [1.2, 2.4, 0]],
          pulse: [1.2, 2.4, 0], r: 3,
          apply: function () { setAct('micro'); P.rxn = 'fusion'; mT = 0; fly.active = false; refreshCard(); }
        },
        {
          t: '五、太阳：一场烧了 46 亿年的燃烧',
          d: '宏观展区。太阳每秒把 426 万吨质量变成光——相当于每秒引爆约 6×10⁷ 颗广岛原子弹，而你感受到的只是温暖的 1/22 亿（剩下的都撒向了空旷的太阳系）。堆成太阳同等能量需要烧掉 1.5×10¹⁸ 吨标准煤：按它的质量，太阳还能再烧 50 亿年。',
          exp: '已为你切到「宏观」。拖「时间尺度」滑杆压缩 46 亿年。',
          cam: [[0, 3.2, 31.0], [2.8, 1.4, 0]],
          pulse: [2.8, 1.4, 0], r: 3,
          apply: function () { setAct('macro'); fly.active = false; }
        }
      ]);

      var _upd = api.update;
      // 讲解时场景不冻结（反应动画继续播放更有表现力），相机由讲解引擎接管（fly 已禁用）
      api.update = function (dt, tt) {
        tour.update(dt, tt || 0, function (ddt) { _upd(tour.active() ? dt : ddt); });
      };
      var _spd = api.setParam;
      api.setParam = function (key, v) {
        if (key === 'tour') { tour.toggle(); return; }
        _spd(key, v);
      };
      var _sdp = api.dispose;
      api.dispose = function () { tour.dispose(); _sdp(); };

      camera.position.set(0, 5.4, 25.5);
      controls.target.set(0, 3.2, 0);
      setAct('balance');
      refreshCard();
      ctx.setNote(
        '<b>① 天平</b>　拖动「质量」滑杆，看 1 g 物质 = 89.9 TJ。<br>' +
        '<b>② 微观</b>　湮灭 / 裂变 / 聚变的质量亏损动画。<br>' +
        '<b>③ 宏观</b>　太阳每秒 426 万吨 vs 标准煤。<br>' +
        '<span style="opacity:.7">点击画面可重播微观反应；BLOOM 滑杆调辉光强度。</span>'
      );

      return api;
    }
  });

})(window);
