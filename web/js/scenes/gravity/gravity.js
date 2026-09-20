/**
 * 万有引力 · 模块框架
 *
 * 提供：
 *   1. 六个子场景的注册与路由（HL.GRAV.registerSub）
 *   2. 公共视觉素材：玻璃质感天体、霓虹线框、发光轨道管、粒子拖尾、力矢量箭头
 *   3. KaTeX HUD 公式卡片（DOM 覆盖层，含可实时刷新的读数行与 2D 小图）
 *
 * 子场景约定：
 *   HL.GRAV.registerSub({
 *     id, name, tab, desc, view:[[x,y,z],[tx,ty,tz]],
 *     defaults: {...},              // 参数默认值（键不含前缀）
 *     controls: [...],              // 键必须带 PFX 前缀，见各文件内 C() 辅助函数
 *     init: function (api) -> { update(dt,t), setParam(k,v), onClick(ndc), dispose() }
 *   })
 */
(function (global) {
  'use strict';

  var HL = global.HL = global.HL || {};
  var GRAV = HL.GRAV = HL.GRAV || {};

  /* ================= 常量与配色 ================= */

  GRAV.K = {
    G: 6.67430e-11,        // 万有引力常数
    MSUN: 1.98892e30,      // 太阳质量 kg
    RSUN: 6.957e8,         // 太阳半径 m
    AU: 1.495978707e11,    // 天文单位 m
    YR: 3.15576e7,         // 儒略年 s
    DAY: 86400,
    MEARTH: 5.9722e24,
    REARTH: 6.371e6,
    MMOON: 7.3477e22,
    RMOON: 1.7374e6
  };

  GRAV.C = {
    cyan: 0x4de2ff, gold: 0xffcf6b, mint: 0x7cf0d0, rose: 0xff5b7f,
    violet: 0xb98cff, amber: 0xffa64d, blue: 0x5aa9ff, ice: 0xbfe9ff,
    white: 0xe8f2ff, lime: 0xa8ff6b
  };
  GRAV.CSS = {
    cyan: '#4de2ff', gold: '#ffcf6b', mint: '#7cf0d0', rose: '#ff5b7f',
    violet: '#b98cff', amber: '#ffa64d', blue: '#5aa9ff', ice: '#bfe9ff',
    white: '#e8f2ff', muted: '#8fa3bd', lime: '#a8ff6b'
  };

  /* ================= 数值格式化 ================= */

  var SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  function supNum(n) {
    var s = String(n), o = '';
    for (var i = 0; i < s.length; i++) o += SUP[s[i]] || s[i];
    return o;
  }
  /** 科学计数法：1.18×10²⁸ */
  GRAV.sci = function (x, d) {
    d = d == null ? 2 : d;
    if (!isFinite(x)) return '—';
    if (x === 0) return '0';
    var s = x < 0 ? '−' : '';
    x = Math.abs(x);
    if (x >= 1e-3 && x < 1e5) return s + GRAV.fix(x, d);
    var e = Math.floor(Math.log10(x));
    var m = x / Math.pow(10, e);
    return s + m.toFixed(d) + '×10' + supNum(e);
  };
  /** 定点：自动去掉多余小数 */
  GRAV.fix = function (x, d) {
    d = d == null ? 2 : d;
    if (!isFinite(x)) return '—';
    var v = Math.abs(x) >= 1000 ? x.toFixed(Math.max(0, d - 2)) : x.toFixed(d);
    return v.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  };
  /** 时间：自动 s / d / yr */
  GRAV.dur = function (sec) {
    if (!isFinite(sec)) return '—';
    var a = Math.abs(sec);
    if (a < 180) return GRAV.fix(sec, 1) + ' s';
    if (a < 86400 * 2) return GRAV.fix(sec / 3600, 2) + ' h';
    if (a < GRAV.K.YR * 2) return GRAV.fix(sec / 86400, 2) + ' d';
    return GRAV.fix(sec / GRAV.K.YR, 3) + ' yr';
  };

  /* ================= 基础纹理 ================= */

  function dotTexture(THREE) {
    var cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    var c = cv.getContext('2d');
    var g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.30, 'rgba(255,255,255,0.65)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    var t = new THREE.CanvasTexture(cv);
    t.needsUpdate = true;
    return t;
  }

  function glowTexture(THREE, css) {
    var cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    var c = cv.getContext('2d');
    var g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.22, css);
    g.addColorStop(0.55, 'rgba(255,255,255,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    var t = new THREE.CanvasTexture(cv);
    t.needsUpdate = true;
    return t;
  }
  GRAV.dotTexture = dotTexture;
  GRAV.glowTexture = glowTexture;

  /** 六位十六进制 → rgba 字符串 */
  function rgba(hex, a) {
    return 'rgba(' + ((hex >> 16) & 255) + ',' + ((hex >> 8) & 255) + ',' + (hex & 255) + ',' + a + ')';
  }
  GRAV.rgba = rgba;

  /* ================= 星空 ================= */

  GRAV.starfield = function (THREE, count, radius, size) {
    count = count || 1800; radius = radius || 900;
    var pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
    for (var i = 0; i < count; i++) {
      var r = radius * (0.5 + Math.random() * 0.5);
      var th = Math.random() * Math.PI * 2;
      var ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph) * 0.75;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      var b = 0.35 + Math.random() * 0.65, tn = Math.random();
      col[i * 3] = b * (tn > 0.8 ? 1 : 0.78);
      col[i * 3 + 1] = b * 0.88;
      col[i * 3 + 2] = b;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({
      size: size || 1.7, sizeAttenuation: false, vertexColors: true,
      transparent: true, opacity: 0.95, depthWrite: false, map: dotTexture(THREE)
    }));
  };

  /* ================= 玻璃质感天体 ================= */

  var GLASS_VS = [
    'varying vec3 vN; varying vec3 vV;',
    'void main(){',
    '  vec4 mv = modelViewMatrix * vec4(position,1.0);',
    '  vN = normalize(normalMatrix * normal);',
    '  vV = normalize(-mv.xyz);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');

  var GLASS_FS = [
    'uniform vec3 uCore; uniform vec3 uRim; uniform float uOpacity; uniform float uPower; uniform float uGlow;',
    'varying vec3 vN; varying vec3 vV;',
    'void main(){',
    '  float f = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), uPower);',
    '  vec3 col = mix(uCore * 0.30, uRim, f) + uRim * f * uGlow;',
    '  float a = uOpacity * (0.30 + 0.70 * f);',
    '  gl_FragColor = vec4(col, a);',
    '}'
  ].join('\n');

  /**
   * 玻璃天体：菲涅尔玻璃壳 + 霓虹线框 + 光晕
   * opt: { r, color(hex), rim(hex) opacity, power, glow, wire, halo, detail }
   */
  GRAV.body = function (THREE, opt) {
    opt = opt || {};
    var r = opt.r || 1;
    var color = opt.color == null ? GRAV.C.blue : opt.color;
    var rim = opt.rim == null ? GRAV.C.cyan : opt.rim;
    var g = new THREE.Group();

    var mat = new THREE.ShaderMaterial({
      uniforms: {
        uCore: { value: new THREE.Color(color) },
        uRim: { value: new THREE.Color(rim) },
        uOpacity: { value: opt.opacity == null ? 0.92 : opt.opacity },
        uPower: { value: opt.power == null ? 2.1 : opt.power },
        uGlow: { value: opt.glow == null ? 0.85 : opt.glow }
      },
      vertexShader: GLASS_VS, fragmentShader: GLASS_FS,
      transparent: true, depthWrite: true, side: THREE.FrontSide
    });
    var core = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 28), mat);
    g.add(core);

    var wire = null;
    if (opt.wire !== false) {
      wire = new THREE.Mesh(
        new THREE.IcosahedronGeometry(r * 1.015, opt.detail || 2),
        new THREE.MeshBasicMaterial({
          color: rim, wireframe: true, transparent: true,
          opacity: opt.wireOpacity == null ? 0.22 : opt.wireOpacity,
          blending: THREE.AdditiveBlending, depthWrite: false
        })
      );
      g.add(wire);
    }

    var halo = null;
    if (opt.halo !== false) {
      var m = new THREE.SpriteMaterial({
        map: glowTexture(THREE, rgba(rim, 0.55)), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
      });
      halo = new THREE.Sprite(m);
      halo.scale.set(r * (opt.haloScale || 6), r * (opt.haloScale || 6), 1);
      g.add(halo);
    }

    g.userData = { core: core, wire: wire, halo: halo, mat: mat, r: r };
    /** 让天体随半径缩放（用于潮汐形变等） */
    g.setScale = function (sx, sy, sz) {
      core.scale.set(sx, sy, sz == null ? sy : sz);
      if (wire) wire.scale.set(sx, sy, sz == null ? sy : sz);
    };
    return g;
  };

  /** 纯发光球（恒星核心 / 亮点） */
  GRAV.orb = function (THREE, r, color, haloScale) {
    var g = new THREE.Group();
    var m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16),
      new THREE.MeshBasicMaterial({ color: color }));
    g.add(m);
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(THREE, rgba(color, 0.62)), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
    }));
    var s = r * (haloScale || 7);
    sp.scale.set(s, s, 1);
    g.add(sp);
    g.userData = { core: m, halo: sp };
    return g;
  };

  /* ================= 发光轨道 / 线框 ================= */

  /** 圆环（XZ 平面） */
  GRAV.ring = function (THREE, radius, color, tube, opacity) {
    var m = new THREE.Mesh(
      new THREE.TorusGeometry(radius, tube || 0.035, 8, 180),
      new THREE.MeshBasicMaterial({
        color: color, transparent: true, opacity: opacity == null ? 0.75 : opacity,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    m.rotation.x = -Math.PI / 2;
    return m;
  };

  /** 任意闭合路径的发光管（points: [Vector3...]） */
  GRAV.tube = function (THREE, pts, color, tubeR, opacity, closed, seg) {
    var curve = new THREE.CatmullRomCurve3(pts, !!closed);
    var n = seg || Math.max(60, pts.length * 2);
    var m = new THREE.Mesh(
      new THREE.TubeGeometry(curve, n, tubeR || 0.04, 6, !!closed),
      new THREE.MeshBasicMaterial({
        color: color, transparent: true, opacity: opacity == null ? 0.8 : opacity,
        blending: THREE.AdditiveBlending, depthWrite: false
      })
    );
    m.userData.rebuild = function (np) {
      var c2 = new THREE.CatmullRomCurve3(np, !!closed);
      var ng = new THREE.TubeGeometry(c2, n, tubeR || 0.04, 6, !!closed);
      m.geometry.dispose();
      m.geometry = ng;
    };
    return m;
  };

  /** 折线（细，配合 additive 也可发光） */
  GRAV.line = function (THREE, pts, color, opacity) {
    var g = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.Line(g, new THREE.LineBasicMaterial({
      color: color, transparent: true, opacity: opacity == null ? 0.8 : opacity,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
  };

  /** 极坐标网格环（引力井 / 轨道地面用） */
  GRAV.polarGrid = function (THREE, rMax, rings, spokes, color, opacity) {
    var pts = [], i, j;
    for (i = 1; i <= rings; i++) {
      var rr = rMax * i / rings;
      for (j = 0; j < 96; j++) {
        var a1 = j / 96 * Math.PI * 2, a2 = (j + 1) / 96 * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a1) * rr, 0, Math.sin(a1) * rr));
        pts.push(new THREE.Vector3(Math.cos(a2) * rr, 0, Math.sin(a2) * rr));
      }
    }
    for (i = 0; i < spokes; i++) {
      var a = i / spokes * Math.PI * 2;
      pts.push(new THREE.Vector3(0, 0, 0));
      pts.push(new THREE.Vector3(Math.cos(a) * rMax, 0, Math.sin(a) * rMax));
    }
    var g = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({
      color: color, transparent: true, opacity: opacity == null ? 0.16 : opacity,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
  };

  /* ================= 粒子拖尾 ================= */

  /**
   * 拖尾：n 个点，最新点在 index 0，颜色按年龄衰减
   * 返回 { obj, push(x,y,z), reset(x,y,z), setColor(hex), setSize(s) }
   */
  GRAV.trail = function (THREE, n, color, size) {
    n = n || 220;
    var pos = new Float32Array(n * 3);
    var col = new Float32Array(n * 3);
    var c = new THREE.Color(color == null ? GRAV.C.cyan : color);
    for (var i = 0; i < n; i++) {
      var f = Math.pow(1 - i / n, 1.7);
      col[i * 3] = c.r * f; col[i * 3 + 1] = c.g * f; col[i * 3 + 2] = c.b * f;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var mat = new THREE.PointsMaterial({
      size: size || 0.16, sizeAttenuation: true, vertexColors: true,
      map: dotTexture(THREE), transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    var pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;

    return {
      obj: pts,
      push: function (x, y, z) {
        var p = g.attributes.position.array, q = g.attributes.color.array;
        p.copyWithin(3, 0, (n - 1) * 3);
        p[0] = x; p[1] = y; p[2] = z;
        g.attributes.position.needsUpdate = true;
        void q;
      },
      reset: function (x, y, z) {
        var p = g.attributes.position.array;
        for (var k = 0; k < n; k++) { p[k * 3] = x; p[k * 3 + 1] = y; p[k * 3 + 2] = z; }
        g.attributes.position.needsUpdate = true;
      },
      setColor: function (hex) {
        var cc = new THREE.Color(hex);
        var q = g.attributes.color.array;
        for (var k = 0; k < n; k++) {
          var f = Math.pow(1 - k / n, 1.7);
          q[k * 3] = cc.r * f; q[k * 3 + 1] = cc.g * f; q[k * 3 + 2] = cc.b * f;
        }
        g.attributes.color.needsUpdate = true;
      },
      setSize: function (s) { mat.size = s; },
      setOpacity: function (o) { mat.opacity = o; }
    };
  };

  /* ================= 力矢量箭头 ================= */

  var UP = null;
  /** 返回 { group, set(origin, dir, len), setVisible(v) } */
  GRAV.arrow = function (THREE, color, shaftR, headLen) {
    if (!UP) UP = new THREE.Vector3(0, 1, 0);
    color = color == null ? GRAV.C.rose : color;
    shaftR = shaftR || 0.055;
    var hl = headLen || 0.42;
    var g = new THREE.Group();

    var sg = new THREE.CylinderGeometry(shaftR, shaftR, 1, 10, 1, true);
    sg.translate(0, 0.5, 0);
    var shaft = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    g.add(shaft);

    var hg = new THREE.ConeGeometry(shaftR * 2.6, hl, 12);
    hg.translate(0, hl / 2, 0);
    var head = new THREE.Mesh(hg, new THREE.MeshBasicMaterial({
      color: color, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    g.add(head);

    var dir = new THREE.Vector3();
    return {
      group: g,
      set: function (ox, oy, oz, dx, dy, dz, len) {
        g.position.set(ox, oy, oz);
        dir.set(dx, dy, dz);
        var L = dir.length();
        if (L < 1e-9 || !(len > 0.001)) { g.visible = false; return; }
        g.visible = true;
        dir.multiplyScalar(1 / L);
        g.quaternion.setFromUnitVectors(UP, dir);
        var body = Math.max(0.02, len - hl);
        shaft.scale.y = body;
        head.position.y = body;
      },
      setVisible: function (v) { g.visible = !!v; }
    };
  };

  /* ================= 文字标签 ================= */

  GRAV.label = function (THREE, text, opt) {
    opt = opt || {};
    var size = opt.size || 56;
    var font = (opt.weight || '600') + ' ' + size + 'px "Microsoft YaHei","Segoe UI",sans-serif';
    var mm = document.createElement('canvas').getContext('2d');
    mm.font = font;
    var w = Math.ceil(mm.measureText(text).width) + 28;
    var h = Math.ceil(size * 1.5);
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var c = cv.getContext('2d');
    c.font = font; c.textBaseline = 'middle'; c.textAlign = 'center';
    c.shadowColor = 'rgba(0,0,0,0.95)'; c.shadowBlur = 12;
    c.fillStyle = opt.color || '#dce7f5';
    c.fillText(text, w / 2, h / 2);
    var tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false
    }));
    var s = (opt.scale || 1) * 0.0115;
    sp.scale.set(w * s, h * s, 1);
    sp.renderOrder = 998;
    return sp;
  };

  /* ================= KaTeX HUD ================= */

  GRAV.hasKatex = typeof global.katex !== 'undefined';

  /** 把 LaTeX 渲染进 DOM 元素；无 KaTeX 时降级为纯文本 */
  GRAV.katex = function (el, tex) {
    if (!el) return;
    if (GRAV.hasKatex && global.katex.renderToString) {
      try {
        el.innerHTML = global.katex.renderToString(tex, {
          displayMode: true, throwOnError: false, output: 'html', strict: false
        });
        return;
      } catch (e) { /* 落到纯文本 */ }
    }
    el.textContent = tex;
  };

  function Hud(stage) {
    this.stage = stage;
    this.root = document.createElement('div');
    this.root.id = 'gravHud';
    this.root.className = 'grav-hud';
    stage.appendChild(this.root);
    this.cards = [];
  }

  Hud.prototype.clear = function () {
    this.root.innerHTML = '';
    this.cards.length = 0;
  };

  /**
   * def: { title, accent, badge, tex, note, rows:[[k,v,color]], plot:{w,h,draw(ctx,w,h)} }
   */
  Hud.prototype.card = function (def) {
    var self = this;
    var el = document.createElement('div');
    el.className = 'gc-card';
    var acc = def.accent || GRAV.CSS.cyan;

    var head = document.createElement('div');
    head.className = 'gc-head';
    var bar = document.createElement('i');
    bar.className = 'gc-bar';
    bar.style.background = acc;
    head.appendChild(bar);
    var ttl = document.createElement('span');
    ttl.className = 'gc-t';
    ttl.textContent = def.title || '';
    head.appendChild(ttl);
    var badge = document.createElement('em');
    badge.className = 'gc-badge';
    badge.style.color = acc;
    badge.style.borderColor = acc;
    badge.textContent = def.badge || '';
    badge.style.display = def.badge ? '' : 'none';
    head.appendChild(badge);
    el.appendChild(head);

    var texEl = null, noteEl = null, rowsEl = null, plot = null;

    if (def.tex) {
      texEl = document.createElement('div');
      texEl.className = 'gc-tex';
      GRAV.katex(texEl, def.tex);
      el.appendChild(texEl);
    }
    if (def.note) {
      noteEl = document.createElement('div');
      noteEl.className = 'gc-note';
      noteEl.textContent = def.note;
      el.appendChild(noteEl);
    }
    if (def.rows) {
      rowsEl = document.createElement('div');
      rowsEl.className = 'gc-rows';
      el.appendChild(rowsEl);
    }
    if (def.plot) {
      var pw = def.plot.w || 300, ph = def.plot.h || 118;
      var dpr = Math.min(global.devicePixelRatio || 1, 2);
      var cv = document.createElement('canvas');
      cv.className = 'gc-plot';
      cv.width = Math.round(pw * dpr);
      cv.height = Math.round(ph * dpr);
      cv.style.width = pw + 'px';
      cv.style.height = ph + 'px';
      el.appendChild(cv);
      var c2 = cv.getContext('2d');
      plot = {
        canvas: cv, w: pw, h: ph,
        redraw: function () {
          c2.setTransform(dpr, 0, 0, dpr, 0, 0);
          c2.clearRect(0, 0, pw, ph);
          try { def.plot.draw(c2, pw, ph); } catch (e) { /* 忽略绘制异常 */ }
        }
      };
      plot.redraw();
    }

    this.root.appendChild(el);

    var card = {
      el: el,
      setRows: function (rows) {
        if (!rowsEl) return;
        var html = '';
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i];
          html += '<div class="gc-row"><span>' + r[0] + '</span><b' +
            (r[2] ? ' style="color:' + r[2] + '"' : '') + '>' + r[1] + '</b></div>';
        }
        rowsEl.innerHTML = html;
      },
      setNote: function (t) { if (noteEl) noteEl.textContent = t || ''; },
      setTitle: function (t) { if (ttl) ttl.textContent = t || ''; },
      setBadge: function (t, color) {
        badge.textContent = t || '';
        badge.style.display = t ? '' : 'none';
        if (color) { badge.style.color = color; badge.style.borderColor = color; }
      },
      setTex: function (t) { if (texEl) GRAV.katex(texEl, t); },
      plot: plot,
      remove: function () {
        if (el.parentNode) el.parentNode.removeChild(el);
        var i = self.cards.indexOf(card);
        if (i >= 0) self.cards.splice(i, 1);
      }
    };
    card.setRows(def.rows || []);
    this.cards.push(card);
    return card;
  };

  Hud.prototype.dispose = function () {
    if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    this.cards.length = 0;
  };

  GRAV.Hud = Hud;

  /* ================= 子场景注册表 ================= */

  GRAV.subs = {};
  GRAV.order = [];
  GRAV.registerSub = function (def) {
    if (!def || !def.id) throw new Error('子场景缺少 id');
    GRAV.subs[def.id] = def;
    GRAV.order.push(def.id);
  };

  /* ================= 场景注册 ================= */

  var CUR = { sub: 'well', hud: null };

  function subOptions() {
    return GRAV.order.map(function (id, i) {
      var d = GRAV.subs[id];
      return { label: d.tab || (i + 1) + ' ' + d.name, value: id };
    });
  }

  HL.registerScene({
    id: 'gravity',
    name: '万有引力',
    short: '质量如何弯曲时空',
    icon: '🪐',
    desc: '引力井 · 双星互绕 · 开普勒三定律 · 三体混沌 · 潮汐力 · 逃逸速度',
    fov: 46,
    minDistance: 1.5,
    maxDistance: 6000,

    // 动态控制面板：随子场景变化
    controls: function () {
      var list = [{
        type: 'buttons', key: 'sub', label: '子场景', value: CUR.sub, options: subOptions()
      }];
      var d = GRAV.subs[CUR.sub];
      if (d && d.controls) list = list.concat(d.controls);
      return list;
    },

    create: function (ctx) {
      var THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera, controls = ctx.controls;
      var stage = document.getElementById('stage');
      var hud = new Hud(stage);
      CUR.hud = hud;

      var P = {};            // 当前子场景参数（去前缀）
      var store = {};        // 全量参数记忆（带前缀）
      var inst = null, group = null, curId = null;

      function setView(pos, tgt) {
        camera.position.set(pos[0], pos[1], pos[2]);
        controls.target.set(tgt ? tgt[0] : 0, tgt ? tgt[1] : 0, tgt ? tgt[2] : 0);
        controls.syncFromCamera();
        controls.saveHome();
        camera.updateProjectionMatrix();
      }

      function setSub(id, rebuild) {
        if (!GRAV.subs[id] || id === curId) return;
        if (inst && inst.dispose) { try { inst.dispose(); } catch (e) { /* 忽略 */ } }
        if (group) { scene.remove(group); HL.disposeObject(group); }
        hud.clear();
        P = {};

        curId = id;
        CUR.sub = id;
        var def = GRAV.subs[id];

        // 参数：默认值 → 覆盖历史记忆
        var kk;
        if (def.defaults) for (kk in def.defaults) P[kk] = def.defaults[kk];
        for (var sk in store) {
          if (sk.indexOf(id + '_') === 0) P[sk.slice(id.length + 1)] = store[sk];
        }

        group = new THREE.Group();
        scene.add(group);

        var api = {
          THREE: THREE, scene: scene, camera: camera, controls: controls,
          group: group, hud: hud, P: P, G: GRAV, ctx: ctx,
          canvas: ctx.canvas, setNote: ctx.setNote, setView: setView,
          label: function (txt, opt) { return GRAV.label(THREE, txt, opt); },
          stars: function (n, r, s) { return GRAV.starfield(THREE, n, r, s); }
        };
        inst = def.init(api) || {};
        if (def.view) setView(def.view[0], def.view[1]);
        if (HL.setDesc) HL.setDesc(def.desc || '');
        // 首次挂载时由 main.js 随后统一建面板，这里只在实际切换时重建
        if (rebuild && HL.rebuildPanel) {
          try { HL.rebuildPanel(); } catch (e) { /* 忽略 */ }
        }
      }

      // 初始子场景：URL ?g=xxx 优先（首次挂载不重建面板，交给 main.js）
      var want = 'well';
      if (typeof URLSearchParams !== 'undefined' && location.search.length > 1) {
        var q = new URLSearchParams(location.search).get('g');
        if (q && GRAV.subs[q]) want = q;
      }
      setSub(want, false);

      return {
        update: function (dt, t) {
          if (inst && inst.update) inst.update(dt, t);
        },
        setParam: function (key, value) {
          if (key === 'sub') { setSub(value, true); return; }
          store[key] = value;
          var id = curId;
          if (id && key.indexOf(id + '_') === 0) {
            P[key.slice(id.length + 1)] = value;
          }
          if (inst && inst.setParam) {
            var short = (id && key.indexOf(id + '_') === 0) ? key.slice(id.length + 1) : key;
            try { inst.setParam(short, value); } catch (e) { /* 忽略 */ }
          }
        },
        onClick: function (ndc) {
          if (inst && inst.onClick) inst.onClick(ndc);
        },
        dispose: function () {
          if (inst && inst.dispose) { try { inst.dispose(); } catch (e) { /* 忽略 */ } }
          hud.dispose();
          CUR.hud = null;
          inst = null; group = null;
        }
      };
    }
  });

})(window);
