/**
 * 场景：光合作用
 *
 * 三级缩放：叶片（横截面 / 气孔 / 叶肉） → 叶绿体（被膜 / 基粒 / 基质） → 分子（PSII→b6f→PSI→ATP合酶 / Rubisco）
 * 生理内核：Farquhar–von Caemmerer–Berry (FvCB) C3 光合模型 + 光呼吸 + ATP/NADPH 计量 + 循环电子流
 * 状态机：dark / drought / heat / co2starve / photoinhib / steady，含慢变量（光抑制、热失活、气孔关闭）
 *
 * URL 直达：?ppfd=1200&wl=660&co2=420&temp=25&water=80&level=mol
 */
HL.registerScene({
  id: 'photosynthesis',
  name: '光合作用',
  short: '光反应与卡尔文循环',
  icon: '🌿',
  fov: 45,
  minDistance: 0.9,
  maxDistance: 700,
  desc: 'C3 植物叶片的三级可视化：叶片横截面 → 叶绿体 → 类囊体膜分子机器。内核为 Farquhar–von Caemmerer–Berry 光合模型，实时求解 Rubisco 羧化限制与 RuBP 再生限制的较小者，并给出 O₂、ATP、NADPH、糖的计量关系与限制因子。',

  controls: [
    { type: 'button', key: 'tour', label: '📖 讲解模式' },
    { type: 'buttons', key: 'level', label: '观察层级', value: 'leaf', options: [
      { label: '叶片', value: 'leaf' },
      { label: '叶绿体', value: 'chloro' },
      { label: '分子', value: 'mol' }
    ] },
    { type: 'range', key: 'ppfd', label: '光照强度 PPFD', min: 0, max: 2500, step: 10, value: 1200, unit: ' μmol·m⁻²·s⁻¹' },
    { type: 'range', key: 'wl', label: '光谱波长 λ', min: 400, max: 700, step: 5, value: 660, unit: ' nm' },
    { type: 'range', key: 'co2', label: 'CO₂ 浓度 Ca', min: 80, max: 1200, step: 10, value: 420, unit: ' ppm' },
    { type: 'range', key: 'temp', label: '温度 T', min: 0, max: 50, step: 0.5, value: 25, unit: ' °C' },
    { type: 'range', key: 'water', label: '水分供给', min: 0, max: 100, step: 1, value: 80, unit: ' %' },
    { type: 'check', key: 'flow', label: '显示粒子流', value: true },
    { type: 'check', key: 'labels', label: '显示结构标注', value: true },
    { type: 'check', key: 'autoLod', label: '缩放自动切换层级', value: true },
    { type: 'button', key: 'back', label: '返回上一级' },
    { type: 'button', key: 'reset', label: '复位代谢状态' },
    { type: 'legend', items: [
      ['光子 hν', '#fff3b0'], ['电子 e⁻', '#4de2ff'], ['质子 H⁺', '#ff9f1c'],
      ['O₂', '#3ddc97'], ['CO₂', '#8fa3bf'], ['H₂O', '#4aa8ff'],
      ['ATP', '#ffd166'], ['NADPH', '#ff8fab'], ['糖（G3P）', '#f4a261']
    ] }
  ],

  create: function (ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera, controls = ctx.controls;
    scene.add(ctx.makeStars(900, 1400));

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    var key = new THREE.DirectionalLight(0xffffff, 0.85); key.position.set(8, 16, 12); scene.add(key);
    var rim = new THREE.DirectionalLight(0x6fe3ff, 0.4); rim.position.set(-10, -6, -12); scene.add(rim);
    var fill = new THREE.PointLight(0x9dfbc4, 0.7, 260); fill.position.set(0, 10, 10); scene.add(fill);

    /* ============================================================
     * 0. 工具
     * ========================================================== */
    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

    var qs = (typeof URLSearchParams !== 'undefined') ? new URLSearchParams(location.search) : null;
    function q(k, d) { return qs && qs.get(k) !== null ? qs.get(k) : d; }

    var P = {
      level: q('level', 'leaf'),
      ppfd: parseFloat(q('ppfd', 1200)),
      wl: parseFloat(q('wl', 660)),
      co2: parseFloat(q('co2', 420)),
      temp: parseFloat(q('temp', 25)),
      water: parseFloat(q('water', 80)),
      flow: q('flow', '1') !== '0',
      labels: q('labels', '1') !== '0',
      autoLod: q('autoLod', '1') !== '0'
    };

    /* ============================================================
     * 1. 调色板 / 材质
     * ========================================================== */
    var C = {
      cuticle: 0xbfe6c9, epiUp: 0x2f6b3a, epiDn: 0x245a30,
      palisade: 0x3f9e56, spongy: 0x2f7d47, wall: 0x6f8f6a,
      chloro: 0x5ddc8b, guard: 0x57c98a, xylem: 0x2a6f8f, phloem: 0xd9a56b,
      outMem: 0x2a8f6b, inMem: 0x176b4d, stroma: 0x0f3b34,
      granum: 0x38c6f4, lumen: 0x06415c, lamella: 0x1e6fbf, starch: 0xdfe9f5,
      psii: 0xff7a45, pq: 0xb98cff, b6f: 0x4de2ff, pc: 0x7fd1ff,
      psi: 0xff4d6d, fd: 0xffd166, fnr: 0xffb703,
      atpase: 0x3ddc97, atpaseHead: 0x9dfbc4,
      rubL: 0xdbe4f0, rubS: 0x9aa8bd,
      photon: 0xfff3b0, electron: 0x4de2ff, proton: 0xff9f1c,
      o2: 0x3ddc97, co2: 0x8fa3bf, water: 0x4aa8ff,
      atp: 0xffd166, nadph: 0xff8fab, sugar: 0xf4a261
    };

    function M(col, o) {
      o = o || {};
      return new THREE.MeshStandardMaterial({
        color: col,
        roughness: o.rough !== undefined ? o.rough : 0.55,
        metalness: o.metal !== undefined ? o.metal : 0.06,
        emissive: o.em !== undefined ? o.em : 0x000000,
        emissiveIntensity: o.ei !== undefined ? o.ei : 1,
        transparent: !!o.op || !!o.transparent,
        opacity: o.op !== undefined ? o.op : 1,
        side: o.side || THREE.FrontSide,
        depthWrite: o.dw !== undefined ? o.dw : true
      });
    }

    function dotTex() {
      var cv = document.createElement('canvas'); cv.width = cv.height = 64;
      var c = cv.getContext('2d');
      var g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.32, 'rgba(255,255,255,0.6)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(cv);
    }
    var DOT = dotTex();

    /* ============================================================
     * 2. 粒子池（单 draw call / 类型，free-list 复用，零 GC）
     * ========================================================== */
    function Pool(n, size) {
      this.n = n;
      this.pos = new Float32Array(n * 3);
      this.col = new Float32Array(n * 3);
      this.bas = new Float32Array(n * 3);
      this.vel = new Float32Array(n * 3);
      this.life = new Float32Array(n);
      this.full = new Float32Array(n);
      this.spd = new Float32Array(n);
      this.u = new Float32Array(n);
      this.mode = new Uint8Array(n);          // 0 空闲 / 1 直线 / 2 路径
      this.path = new Array(n);
      this.free = [];
      this.acc = 0;
      for (var i = n - 1; i >= 0; i--) this.free.push(i);
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
      this.geo = g;
      this.mat = new THREE.PointsMaterial({
        size: size, sizeAttenuation: true, vertexColors: true, map: DOT,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
      });
      this.obj = new THREE.Points(g, this.mat);
      this.obj.frustumCulled = false;
    }

    Pool.prototype.emit = function (x, y, z, vx, vy, vz, life, r, g, b) {
      var i = this.free.pop(); if (i === undefined) return -1;
      var i3 = i * 3;
      this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
      this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
      this.bas[i3] = r; this.bas[i3 + 1] = g; this.bas[i3 + 2] = b;
      this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
      this.life[i] = life; this.full[i] = life;
      this.mode[i] = 1;
      return i;
    };

    Pool.prototype.emitPath = function (path, spd, life, r, g, b) {
      var i = this.free.pop(); if (i === undefined) return -1;
      var i3 = i * 3;
      this.path[i] = path; this.u[i] = 0; this.spd[i] = spd;
      this.bas[i3] = r; this.bas[i3 + 1] = g; this.bas[i3 + 2] = b;
      this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
      this.life[i] = life; this.full[i] = life;
      this.mode[i] = 2;
      this.pos[i3] = path[0]; this.pos[i3 + 1] = path[1]; this.pos[i3 + 2] = path[2];
      return i;
    };

    Pool.prototype.update = function (dt) {
      var pos = this.pos, col = this.col, bas = this.bas, vel = this.vel;
      for (var i = 0; i < this.n; i++) {
        var m = this.mode[i];
        if (!m) continue;
        var i3 = i * 3;
        var l = this.life[i] - dt;
        if (l <= 0) {
          this.mode[i] = 0; this.path[i] = null;
          col[i3] = col[i3 + 1] = col[i3 + 2] = 0;
          this.free.push(i);
          continue;
        }
        this.life[i] = l;
        if (m === 1) {
          pos[i3] += vel[i3] * dt;
          pos[i3 + 1] += vel[i3 + 1] * dt;
          pos[i3 + 2] += vel[i3 + 2] * dt;
        } else {
          var u = this.u[i] + this.spd[i] * dt;
          if (u >= 1) { u = 1; this.life[i] = Math.min(l, 0.001); }
          this.u[i] = u;
          var pa = this.path[i], seg = pa.length / 3 - 1;
          var f = u * seg, i0 = Math.floor(f); if (i0 > seg - 1) i0 = seg - 1;
          var t = f - i0, a = i0 * 3, b2 = a + 3;
          pos[i3] = pa[a] + (pa[b2] - pa[a]) * t;
          pos[i3 + 1] = pa[a + 1] + (pa[b2 + 1] - pa[a + 1]) * t;
          pos[i3 + 2] = pa[a + 2] + (pa[b2 + 2] - pa[a + 2]) * t;
        }
        var k = l / this.full[i];
        var fade = k > 0.75 ? (1 - k) * 4 : (k < 0.25 ? k * 4 : 1);
        col[i3] = bas[i3] * fade; col[i3 + 1] = bas[i3 + 1] * fade; col[i3 + 2] = bas[i3 + 2] * fade;
      }
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
    };

    function emitRate(pool, rate, dt, fn) {
      pool.acc += rate * dt;
      var guard = 0;
      while (pool.acc >= 1 && guard++ < 40) { pool.acc -= 1; fn(); }
      if (pool.acc > 8) pool.acc = 8;
    }

    function bakePath(pts, n) {
      var curve = new THREE.CatmullRomCurve3(pts.map(function (p) {
        return new THREE.Vector3(p[0], p[1], p[2]);
      }));
      var arr = new Float32Array(n * 3), v = new THREE.Vector3();
      for (var i = 0; i < n; i++) {
        curve.getPoint(i / (n - 1), v);
        arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
      }
      return arr;
    }

    function rgbOf(hex) {
      return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
    }

    /* ============================================================
     * 3. 生理模型（FvCB C3）
     * ========================================================== */
    var PH = {
      Vc25: 85, J25: 170, Rd25: 1.8, theta: 0.7, alpha: 0.30,
      Kc25: 404.9, Ko25: 278.4, G25: 42.75, O: 210,
      EaV: 65330, HdV: 149250, dSV: 485,
      EaJ: 43540, HdJ: 152040, dSJ: 495,
      EaR: 46390, EaKc: 79430, EaKo: 36380, EaG: 37830,
      HperATP: 4.67
    };
    var RGAS = 8.314;

    function arrh(Tk, Ea) { return Math.exp(Ea * (Tk - 298.15) / (298.15 * RGAS * Tk)); }
    function peaked(Tk, Ea, Hd, dS) {
      var num = 1 + Math.exp((298.15 * dS - Hd) / (298.15 * RGAS));
      var den = 1 + Math.exp((Tk * dS - Hd) / (Tk * RGAS));
      return arrh(Tk, Ea) * num / den;
    }

    var SPEC = [
      [400, 0.68], [420, 0.80], [440, 0.85], [460, 0.82], [480, 0.75], [500, 0.70],
      [520, 0.70], [540, 0.72], [560, 0.78], [580, 0.86], [600, 0.94], [620, 0.99],
      [640, 1.00], [660, 1.00], [680, 0.94], [700, 0.30]
    ];
    function specYield(nm) {
      if (nm <= 400) return SPEC[0][1];
      for (var i = 1; i < SPEC.length; i++) {
        if (nm <= SPEC[i][0]) {
          var a = SPEC[i - 1], b = SPEC[i];
          return lerp(a[1], b[1], (nm - a[0]) / (b[0] - a[0]));
        }
      }
      return SPEC[SPEC.length - 1][1];
    }
    function psiiBalance(nm) {
      if (nm <= 660) return 1;
      if (nm >= 700) return 0.34;
      return lerp(1, 0.34, (nm - 660) / 40);
    }
    function wl2rgb(nm) {
      var r = 0, g = 0, b = 0;
      if (nm < 440) { r = -(nm - 440) / 60; b = 1; }
      else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
      else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
      else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
      else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
      else { r = 1; }
      var f = 1;
      if (nm > 700) f = 0.3 + 0.7 * (780 - nm) / 80;
      else if (nm < 420) f = 0.3 + 0.7 * (nm - 380) / 40;
      return [Math.pow(Math.max(0, r) * f, 0.8), Math.pow(Math.max(0, g) * f, 0.8), Math.pow(Math.max(0, b) * f, 0.8)];
    }

    var S = {
      atp: 58, nadph: 28, act: 0.92,
      heat: 0, inhib: 0, drought: 0,
      darkT: 0, hotT: 0, hiT: 0,
      state: 'steady', stateT: 0
    };
    var CAP_ATP = 60, CAP_NADPH = 30;

    var ST = {
      dark: { name: '暗态 · 光反应停摆', col: '#7b8aa5', hint: '无有效光照，水的光解与电子传递停止；卡尔文循环因硫氧还蛋白失活而关闭，仅剩线粒体呼吸释放 CO₂。' },
      drought: { name: '水分亏缺 · 气孔关闭', col: '#4aa8ff', hint: '土壤有效水不足，脱落酸诱导气孔关闭，胞间 CO₂ 骤降，同化速率受底物供应限制。' },
      heat: { name: '高温 · 酶失活', col: '#ff7a45', hint: '超过 38 ℃，Rubisco 活化酶失活、类囊体膜稳定性下降，加氧反应占比上升，光呼吸显著增强。' },
      co2: { name: 'CO₂ 亏缺 · 光呼吸主导', col: '#8fa3bf', hint: '胞间 CO₂ 接近补偿点，Rubisco 加氧反应占比升高，净同化趋近于零甚至转负。' },
      inhib: { name: '强光 · 光抑制', col: '#ff4d6d', hint: '过剩光能超出碳同化消耗能力，PSII 的 D1 蛋白受损，非光化学淬灭启动，量子效率下降且恢复缓慢。' },
      steady: { name: '稳态光合', col: '#3ddc97', hint: '光反应与碳同化协同，ATP / NADPH 供需平衡，循环电子流补足 ATP 缺口。' }
    };

    function evalState(dt, m) {
      S.darkT = (m.Ieff < 20) ? S.darkT + dt : 0;
      S.hotT = (P.temp > 38) ? S.hotT + dt : Math.max(0, S.hotT - dt * 0.5);
      S.hiT = (m.Ieff > 1800) ? S.hiT + dt : Math.max(0, S.hiT - dt * 0.6);

      S.inhib += ((S.hiT > 4 ? 1 : 0) - S.inhib) * Math.min(1, dt * (S.hiT > 4 ? 0.10 : 0.035));
      S.heat += ((S.hotT > 3 ? 1 : 0) - S.heat) * Math.min(1, dt * (S.hotT > 3 ? 0.08 : 0.020));
      S.drought += ((P.water < 35 ? 1 : 0) - S.drought) * Math.min(1, dt * 0.5);

      if (m.Ieff < 20) return 'dark';
      if (P.water < 20) return 'drought';
      if (S.heat > 0.35) return 'heat';
      if (m.Ci < 90) return 'co2';
      if (S.inhib > 0.30) return 'inhib';
      return 'steady';
    }

    var met = {};
    function solve(dt) {
      var Tk = P.temp + 273.15;
      var Vcmax = PH.Vc25 * peaked(Tk, PH.EaV, PH.HdV, PH.dSV) * (1 - 0.50 * S.heat) * (0.80 + 0.20 * (1 - S.drought));
      var Jmax = PH.J25 * peaked(Tk, PH.EaJ, PH.HdJ, PH.dSJ) * (1 - 0.60 * S.heat) * (1 - 0.35 * S.inhib);
      var Rd = PH.Rd25 * arrh(Tk, PH.EaR);
      var Kc = PH.Kc25 * arrh(Tk, PH.EaKc);
      var Ko = PH.Ko25 * arrh(Tk, PH.EaKo);
      var Gs = PH.G25 * arrh(Tk, PH.EaG);

      var gsw = 1 / (1 + Math.exp(-(P.water - 28) / 9));
      var Ci = Math.max(4, P.co2 * 0.7 * gsw);
      var Ieff = P.ppfd * specYield(P.wl);

      var a = PH.alpha * psiiBalance(P.wl) * (1 - 0.40 * S.inhib);
      var x = a * Ieff;
      var Jpot = (x + Jmax - Math.sqrt(Math.max(0, (x + Jmax) * (x + Jmax) - 4 * PH.theta * x * Jmax))) / (2 * PH.theta);

      var Km = Kc * (1 + PH.O / Ko);
      var Ac = Vcmax * Math.max(0, Ci - Gs) / (Ci + Km);
      var Aj = Jpot * Math.max(0, Ci - Gs) / (4 * Ci + 8 * Gs);
      var limit = (Ac < Aj) ? 'Rubisco' : 'RuBP';
      var Agross = Math.min(Ac, Aj);

      var Vc = Agross * Ci / Math.max(1e-6, Ci - Gs);
      var Vo = 2 * Gs * Vc / Ci;

      var demATP0 = 3 * Vc + 3.5 * Vo;
      var demNADPH0 = 2 * (Vc + Vo);
      var linATP = Jpot * 12 / 4 / PH.HperATP;
      var cefNeed = Math.max(0, (demATP0 - linATP) / (2 / PH.HperATP));
      var Jcef = Math.min(cefNeed, 0.35 * Jpot);
      var supATP = linATP + Jcef * (2 / PH.HperATP);
      var supNADPH = 0.5 * Jpot;

      var demATP = demATP0 * S.act + S.atp / 12;
      var demNADPH = demNADPH0 * S.act + S.nadph / 12;
      S.atp = clamp(S.atp + (supATP - demATP) * dt, 0, CAP_ATP);
      S.nadph = clamp(S.nadph + (supNADPH - demNADPH) * dt, 0, CAP_NADPH);

      var lightReg = clamp((Ieff - 5) / 45, 0, 1);
      var energyReg = clamp(Math.min(S.atp / 6, S.nadph / 3), 0, 1);
      S.act += (Math.min(lightReg, energyReg) - S.act) * Math.min(1, dt * 2.2);

      var act = S.act;
      Vc *= act; Vo *= act;
      var A = Agross * act - Rd;
      var Jact = 4 * (Vc + Vo);
      var O2gross = Vc + Vo;
      var npq = Math.max(0, Jpot - Jact);
      var sugar = A / 6 * 180.16 * 3600 / 1000;
      var phi = Ieff > 1 ? (Agross * act) / Ieff : 0;

      met = {
        Tk: Tk, Vcmax: Vcmax, Jmax: Jmax, Rd: Rd, Kc: Kc, Ko: Ko, Gs: Gs,
        gsw: gsw, Ci: Ci, Ieff: Ieff, Jpot: Jpot, Jact: Jact, Jcef: Jcef,
        Ac: Ac, Aj: Aj, Agross: Agross, A: A, Vc: Vc, Vo: Vo, limit: limit,
        O2gross: O2gross, npq: npq, sugar: sugar, phi: phi,
        supATP: supATP, demATP: demATP0 * act, supNADPH: supNADPH, demNADPH: demNADPH0 * act,
        prRatio: (Vc + Vo) > 1e-6 ? Vo / (Vc + Vo) : 0
      };
      var st = evalState(dt, met);
      if (st !== S.state) { S.state = st; S.stateT = 0; } else { S.stateT += dt; }
      met.state = st;
      return met;
    }

    /* ============================================================
     * 4. 标注
     * ========================================================== */
    var labelGroups = [];
    function tag(parent, text, x, y, z, dx, dy, dz, scale, color) {
      var g = new THREE.Group();
      var sp = ctx.makeText(text, { size: 44, color: color || '#cfe3f7', scale: scale || 1 });
      sp.position.set(x + dx, y + dy, z + dz);
      var lg = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, y, z),
        new THREE.Vector3(x + dx * 0.86, y + dy * 0.86, z + dz * 0.86)
      ]);
      var ln = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0x6ea8d8, transparent: true, opacity: 0.5 }));
      g.add(ln); g.add(sp);
      parent.add(g);
      labelGroups.push(g);
      return g;
    }

    function info(o) { return o; }
    function infoHtml(o) {
      var h = '<div style="font-weight:600;color:#4de2ff;margin-bottom:6px">' + o.t + '</div>';
      (o.rows || []).forEach(function (r) {
        h += '<div style="display:flex;gap:14px;justify-content:space-between;font-size:11px;margin-bottom:3px">' +
          '<span style="color:#7b8aa5">' + r[0] + '</span>' +
          '<b style="color:#ffcf6b;font-weight:500">' + r[1] + '</b></div>';
      });
      if (o.note) {
        h += '<div style="margin-top:7px;font-size:10.5px;color:#9fb0c8;line-height:1.65;max-width:270px">' + o.note + '</div>';
      }
      return h;
    }

    /* ============================================================
     * 5. 层级一：叶片横截面
     * ========================================================== */
    function buildLeaf() {
      var g = new THREE.Group();
      var p = { pools: {} };
      var W = 24, D = 8;

      var cut = new THREE.Mesh(new THREE.BoxGeometry(W, 0.18, D), M(C.cuticle, { op: 0.55, rough: 0.25 }));
      cut.position.y = 2.76; g.add(cut);

      var eu = new THREE.Mesh(new THREE.BoxGeometry(W, 0.5, D), M(C.epiUp, { op: 0.62, rough: 0.7 }));
      eu.position.y = 2.42; g.add(eu);
      eu.userData.info = info({ t: '上表皮 + 角质层', rows: [['厚度', '20–40 μm'], ['透光率', '≈ 85 %'], ['功能', '透光 · 保水 · 防御']], note: '角质层减少非气孔失水；上表皮细胞通常不含叶绿体，主要承担透光与保护。' });

      var ed = new THREE.Mesh(new THREE.BoxGeometry(W, 0.5, D), M(C.epiDn, { op: 0.62, rough: 0.7 }));
      ed.position.y = -1.36; g.add(ed);
      ed.userData.info = info({ t: '下表皮与气孔', rows: [['气孔密度', '100–400 个/mm²'], ['开度调节', '保卫细胞膨压'], ['当前开度', '—']], note: '气孔是 CO₂ 进入与水汽散失的同一通道，构成光合—蒸腾权衡，是水分利用效率的根源。' });

      var palX = [], palZ = [];
      for (var ix = 0; ix < 11; ix++) palX.push(-10.5 + ix * 2.1);
      for (var iz = 0; iz < 3; iz++) palZ.push(-2.5 + iz * 2.5);
      var pal = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.95, 1.75, 1.7),
        M(C.palisade, { op: 0.34, rough: 0.75, dw: false }),
        palX.length * palZ.length
      );
      var mm = new THREE.Matrix4(), cc = new THREE.Color();
      var n = 0, chloroPos = [];
      for (var i = 0; i < palX.length; i++) {
        for (var j = 0; j < palZ.length; j++) {
          var px = palX[i] + (Math.random() - 0.5) * 0.25;
          var pz = palZ[j] + (Math.random() - 0.5) * 0.25;
          mm.makeTranslation(px, 1.32, pz);
          pal.setMatrixAt(n, mm);
          cc.setHSL(0.32, 0.42, 0.30 + Math.random() * 0.08);
          pal.setColorAt(n, cc);
          chloroPos.push([px + (Math.random() - 0.5) * 0.5, 1.32 + (Math.random() - 0.5) * 0.9, pz + (Math.random() - 0.5) * 0.6]);
          chloroPos.push([px + (Math.random() - 0.5) * 0.5, 1.32 + (Math.random() - 0.5) * 0.9, pz + (Math.random() - 0.5) * 0.6]);
          n++;
        }
      }
      pal.instanceMatrix.needsUpdate = true;
      if (pal.instanceColor) pal.instanceColor.needsUpdate = true;
      g.add(pal);
      pal.userData.info = info({ t: '栅栏组织', rows: [['细胞形态', '长柱形 · 紧密排列'], ['叶绿体', '30–50 个/细胞'], ['功能', '主要光捕获与碳同化']], note: '位于上表皮之下优先受光；叶绿体可沿细胞壁排列并移动，实现趋光与避光调节。' });

      var spPos = [];
      for (var k = 0; k < 200 && spPos.length < 34; k++) {
        var sx = -11 + Math.random() * 22, sy = -0.55 + Math.random() * 0.85, sz = -3.2 + Math.random() * 6.4;
        if (Math.abs(sx - 7.7) < 1.9) continue;
        var ok = true;
        for (var s = 0; s < spPos.length; s++) {
          if (Math.abs(spPos[s][0] - sx) < 1.0 && Math.abs(spPos[s][1] - sy) < 0.9 && Math.abs(spPos[s][2] - sz) < 1.0) { ok = false; break; }
        }
        if (!ok) continue;
        spPos.push([sx, sy, sz]);
        if (spPos.length % 2 === 0) chloroPos.push([sx, sy, sz]);
      }
      var spn = new THREE.InstancedMesh(new THREE.SphereGeometry(0.62, 12, 9), M(C.spongy, { op: 0.32, rough: 0.8, dw: false }), spPos.length);
      for (var s2 = 0; s2 < spPos.length; s2++) {
        mm.makeScale(1, 0.8 + Math.random() * 0.4, 1);
        mm.setPosition(spPos[s2][0], spPos[s2][1], spPos[s2][2]);
        spn.setMatrixAt(s2, mm);
        cc.setHSL(0.31, 0.35, 0.26 + Math.random() * 0.07);
        spn.setColorAt(s2, cc);
      }
      spn.instanceMatrix.needsUpdate = true;
      if (spn.instanceColor) spn.instanceColor.needsUpdate = true;
      g.add(spn);
      spn.userData.info = info({ t: '海绵组织', rows: [['细胞形态', '不规则 · 间隙大'], ['功能', '气体扩散通道'], ['胞间隙占比', '≈ 30 %']], note: '巨大的胞间隙使 CO₂ 从气孔快速扩散到叶肉细胞表面，是气相扩散阻力的主要决定因素。' });

      var chMat = M(C.chloro, { em: 0x1c7a4a, ei: 0.55, rough: 0.4 });
      var chn = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 10, 8), chMat, chloroPos.length);
      for (var c2 = 0; c2 < chloroPos.length; c2++) {
        var s3 = 0.85 + Math.random() * 0.4;
        mm.makeScale(s3 * 1.35, s3 * 0.7, s3 * 0.85);
        mm.setPosition(chloroPos[c2][0], chloroPos[c2][1], chloroPos[c2][2]);
        chn.setMatrixAt(c2, mm);
      }
      chn.instanceMatrix.needsUpdate = true;
      chn.userData.info = info({ t: '叶绿体', rows: [['尺寸', '5–10 μm × 2–4 μm'], ['数量/细胞', '30–100'], ['内部', '基粒 · 基质 · 淀粉粒']], note: '双层被膜包裹的半自主细胞器，含环状 DNA 与 70S 核糖体，源自远古蓝藻内共生。点击可进入叶绿体层级。' });
      chn.userData.drill = 'chloro';
      g.add(chn);
      p.chloro = chn;
      p.chMat = chMat;

      var xy = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, D, 18), M(C.xylem, { em: 0x123f57, ei: 0.5, rough: 0.4 }));
      xy.rotation.x = Math.PI / 2; xy.position.set(6.9, -0.15, 0); g.add(xy);
      var ph = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, D, 16), M(C.phloem, { rough: 0.6 }));
      ph.rotation.x = Math.PI / 2; ph.position.set(8.5, -0.15, 0); g.add(ph);
      var bundle = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, D, 20), M(0x2b4a3a, { op: 0.28, dw: false, side: THREE.DoubleSide }));
      bundle.rotation.x = Math.PI / 2; bundle.position.set(7.7, -0.15, 0); g.add(bundle);
      xy.userData.info = info({ t: '木质部（导管）', rows: [['输送', '水与矿质（根 → 叶）'], ['驱动力', '蒸腾拉力 · 内聚力'], ['光合角色', 'H₂O → 电子供体']], note: '水在 PSII 放氧复合体（Mn₄CaO₅）处被裂解：2H₂O → O₂ + 4H⁺ + 4e⁻，这是地球大气 O₂ 的主要来源。' });
      ph.userData.info = info({ t: '韧皮部（筛管）', rows: [['输送', '蔗糖（源 → 库）'], ['机制', '压力流动学说'], ['速度', '≈ 0.5–1 m/h']], note: '卡尔文循环产物以磷酸丙糖运出叶绿体，在细胞质合成蔗糖后经韧皮部装载运输到库器官。' });

      var stomata = [];
      [-5.0, 0.2, 5.2].forEach(function (sxx) {
        var grp = new THREE.Group();
        var gm = M(C.guard, { em: 0x1e7a4f, ei: 0.4, rough: 0.45 });
        var a1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 1.15, 4, 10), gm);
        var a2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 1.15, 4, 10), gm);
        a1.rotation.x = Math.PI / 2; a2.rotation.x = Math.PI / 2;
        a1.position.set(-0.28, -1.72, 0); a2.position.set(0.28, -1.72, 0);
        grp.add(a1); grp.add(a2);
        grp.position.x = sxx;
        g.add(grp);
        stomata.push({ g: grp, a: a1, b: a2, x: sxx });
        var gi = info({ t: '保卫细胞', rows: [['调节', 'K⁺ / 苹果酸渗透势'], ['开度驱动', '蓝光受体 · ABA'], ['当前开度', '—']], note: '保卫细胞积累 K⁺ 与苹果酸降低水势、吸水膨胀而张开；干旱时 ABA 促其关闭，CO₂ 供应随即中断。' });
        a1.userData.info = gi; a2.userData.info = gi;
      });
      p.stomata = stomata;

      p.pools.photon = new Pool(240, 0.42);
      p.pools.co2 = new Pool(110, 0.40);
      p.pools.o2 = new Pool(110, 0.40);
      p.pools.water = new Pool(70, 0.36);
      Object.keys(p.pools).forEach(function (kk) { g.add(p.pools[kk].obj); });

      tag(g, '角质层 / 上表皮', -7.5, 2.75, 0, -1.6, 3.4, 2.2, 1.0);
      tag(g, '栅栏组织', -3.0, 1.7, 2.0, -2.4, 3.2, 3.0, 1.0);
      tag(g, '海绵组织', 1.0, -0.3, 2.0, 2.0, -3.0, 3.0, 1.0);
      tag(g, '气孔（CO₂ 进 / O₂ 出）', 0.2, -1.9, 1.6, 1.0, -3.2, 2.6, 1.0);
      tag(g, '维管束（木质部 / 韧皮部）', 7.7, -0.2, 1.6, 2.6, 3.2, 2.4, 1.0);
      tag(g, '叶绿体 → 点击下钻', -9.4, 1.3, 2.0, -2.8, -2.6, 2.6, 1.0, '#7ef2a8');

      p.root = g;
      return p;
    }

    /* ============================================================
     * 6. 层级二：叶绿体
     * ========================================================== */
    function buildChloro() {
      var g = new THREE.Group();
      var p = { pools: {} };

      var outer = new THREE.Mesh(new THREE.SphereGeometry(5, 40, 28), M(C.outMem, { op: 0.16, rough: 0.35, side: THREE.DoubleSide, dw: false }));
      outer.scale.set(1.52, 0.86, 0.96); g.add(outer);
      outer.userData.info = info({ t: '叶绿体外膜', rows: [['厚度', '≈ 7 nm'], ['通透性', '含孔蛋白，较通透']], note: '源自内共生蓝藻的外膜，允许小分子相对自由地通过。' });

      var inner = new THREE.Mesh(new THREE.SphereGeometry(5, 36, 26), M(C.inMem, { op: 0.20, rough: 0.4, side: THREE.DoubleSide, dw: false }));
      inner.scale.set(1.46, 0.81, 0.91); g.add(inner);
      inner.userData.info = info({ t: '叶绿体内膜', rows: [['厚度', '≈ 6 nm'], ['通透性', '高度选择性']], note: '内膜以特定转运蛋白控制代谢物进出，是叶绿体与细胞质代谢分工的界面。' });

      var stroma = new THREE.Mesh(new THREE.SphereGeometry(5, 32, 24), M(C.stroma, { op: 0.30, rough: 0.9, dw: false }));
      stroma.scale.set(1.40, 0.76, 0.86); g.add(stroma);
      stroma.userData.info = info({ t: '基质（Stroma）', rows: [['光照时 pH', '≈ 8.0'], ['含', 'Rubisco · DNA · 核糖体'], ['发生', '卡尔文循环']], note: '光照下 H⁺ 被泵入类囊体腔，基质 pH 升至约 8、Mg²⁺ 浓度升高，共同激活 Rubisco 与卡尔文循环酶系。' });

      var stacks = [
        [-4.4, 0.05, 0.5], [-1.7, 0.42, -1.5], [0.9, -0.30, 1.25],
        [3.5, 0.18, -0.55], [-2.7, -0.52, 1.7], [2.1, 0.62, 1.45]
      ];
      var discMat = M(C.granum, { em: 0x0e5f8a, ei: 0.85, rough: 0.35 });
      var per = 7;
      var grana = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.16, 1.16, 0.12, 26), discMat, stacks.length * per);
      var mm = new THREE.Matrix4(), qt = new THREE.Quaternion(), eu2 = new THREE.Euler();
      var vv = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
      var idx = 0, centers = [];
      stacks.forEach(function (s) {
        var t1 = (Math.random() - 0.5) * 0.5, t2 = (Math.random() - 0.5) * 0.5;
        for (var d = 0; d < per; d++) {
          eu2.set(t1, 0, t2); qt.setFromEuler(eu2);
          vv.set(s[0], s[1] + (d - (per - 1) / 2) * 0.215, s[2]);
          mm.compose(vv, qt, sc);
          grana.setMatrixAt(idx++, mm);
        }
        centers.push(new THREE.Vector3(s[0], s[1], s[2]));
      });
      grana.instanceMatrix.needsUpdate = true;
      grana.userData.info = info({ t: '基粒（Granum）', rows: [['单个类囊体', '厚 15–20 nm'], ['每基粒层数', '5–25 层'], ['功能', '光反应（PSII 富集）']], note: '基粒富集 PSII 与 LHCII；PSI 与 ATP 合酶主要分布在非垛叠的基质类囊体上，这种侧向分区避免两个光系统间的激发能短路。点击可进入分子层级。' });
      grana.userData.drill = 'mol';
      g.add(grana);
      p.grana = grana; p.discMat = discMat;

      var lam = new THREE.Group();
      for (var L = 0; L < centers.length - 1; L++) {
        var a = centers[L], b = centers[L + 1];
        var mid = a.clone().add(b).multiplyScalar(0.5);
        mid.y += (Math.random() - 0.5) * 0.8;
        var curve = new THREE.CatmullRomCurve3([
          a.clone(),
          a.clone().lerp(mid, 0.5).add(new THREE.Vector3(0, 0.5, 0)),
          mid,
          b.clone().lerp(mid, 0.5).add(new THREE.Vector3(0, -0.4, 0)),
          b.clone()
        ]);
        lam.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.09, 8, false),
          M(C.lamella, { em: 0x0b3f6b, ei: 0.5, rough: 0.5 })));
      }
      g.add(lam); p.lam = lam;

      var starch = new THREE.Mesh(new THREE.SphereGeometry(1.05, 20, 16), M(C.starch, { rough: 0.85, em: 0x2a3340, ei: 0.3 }));
      starch.scale.set(1, 0.85, 0.85); starch.position.set(5.5, -1.3, -0.9); g.add(starch);
      starch.userData.info = info({ t: '淀粉粒', rows: [['成分', '直链 + 支链淀粉'], ['积累', '白天同化过剩产物'], ['动员', '夜间降解输出']], note: '当同化速率超过蔗糖合成与输出能力时，多余产物在基质内以淀粉暂存，夜间再动员输出。' });

      var pgG = new THREE.Group();
      for (var q2 = 0; q2 < 6; q2++) {
        var pg = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), M(0xffd166, { em: 0x7a5a10, ei: 0.6 }));
        pg.position.set(-5.6 + Math.random() * 1.6, -1.0 + Math.random() * 0.7, 0.6 + Math.random() * 1.4);
        pgG.add(pg);
      }
      g.add(pgG); p.pg = pgG;

      var dna = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.07, 8, 40), M(0x7fd1ff, { em: 0x1e5f8f, ei: 0.8 }));
      dna.position.set(-3.2, 1.45, -1.9); dna.rotation.set(1.1, 0.4, 0.3); g.add(dna);
      dna.userData.info = info({ t: '叶绿体 DNA（拟核）', rows: [['形态', '环状 · 多拷贝'], ['大小', '120–160 kb'], ['编码', '≈ 80–100 个基因']], note: '叶绿体保留原核式环状基因组与 70S 核糖体，是内共生起源的直接证据；多数原始基因已转移至细胞核。' });
      p.dna = dna;

      p.pools.photon = new Pool(240, 0.15);
      p.pools.atp = new Pool(80, 0.19);
      p.pools.nadph = new Pool(80, 0.19);
      p.pools.o2 = new Pool(70, 0.18);
      p.pools.co2 = new Pool(70, 0.18);
      Object.keys(p.pools).forEach(function (kk) { g.add(p.pools[kk].obj); });

      tag(g, '外膜 / 内膜（双层被膜）', -5.4, 3.0, 0, -2.6, 2.4, 1.6, 0.5);
      tag(g, '基粒（类囊体垛叠）', 0.9, 0.9, 1.2, 1.4, 3.0, 2.0, 0.5, '#7ef2a8');
      tag(g, '基质类囊体（连接片层）', -1.7, -0.9, -1.2, -3.4, -2.2, 1.8, 0.5);
      tag(g, '基质（卡尔文循环场所）', 3.6, -1.6, 1.4, 3.0, -2.6, 1.8, 0.5);
      tag(g, '淀粉粒', 5.5, -1.3, -0.9, 2.6, -1.8, 1.6, 0.5);
      tag(g, '叶绿体 DNA', -3.2, 1.45, -1.9, -2.0, 2.4, 1.4, 0.5);

      p.root = g;
      return p;
    }

    /* ============================================================
     * 7. 层级三：类囊体膜分子机器
     * ========================================================== */
    function buildMol() {
      var g = new THREE.Group();
      var p = { pools: {}, paths: {} };

      var memb = new THREE.Mesh(new THREE.BoxGeometry(26, 0.58, 8), M(0x1b3d52, { rough: 0.75 }));
      g.add(memb);
      memb.userData.info = info({ t: '类囊体膜（脂双层）', rows: [['厚度', '≈ 5 nm'], ['主要脂类', 'MGDG / DGDG 半乳糖脂'], ['蛋白占比', '≈ 70 %（质量）']], note: '类囊体膜是自然界蛋白密度最高的膜之一，半乳糖脂赋予极高流动性，支持复合体侧向扩散与 D1 蛋白修复循环。' });

      var lum = new THREE.Mesh(new THREE.BoxGeometry(26, 3.6, 8), M(C.lumen, { op: 0.30, dw: false, rough: 0.6 }));
      lum.position.y = -2.45; g.add(lum);
      lum.userData.info = info({ t: '类囊体腔（Lumen）', rows: [['光照时 pH', '≈ 5.0–5.8'], ['跨膜 ΔpH', '≈ 3 个单位'], ['功能', '质子库 · 放氧场所']], note: '水的光解在此释放 H⁺，Cyt b6f 经 Q 循环再泵入 H⁺；约 3 个 pH 单位的质子动力势驱动 ATP 合酶。' });

      var stro = new THREE.Mesh(new THREE.BoxGeometry(26, 6.0, 8), M(C.stroma, { op: 0.16, dw: false, rough: 0.9 }));
      stro.position.y = 3.9; g.add(stro);

      function complex(x, col, w, h, label, rows, note) {
        var grp = new THREE.Group();
        var body = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2.6), M(col, { em: col, ei: 0.28, rough: 0.4 }));
        grp.add(body);
        var top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.28, 2.4), M(col, { em: col, ei: 0.7, rough: 0.3 }));
        top.position.y = h / 2 + 0.14; grp.add(top);
        grp.position.set(x, 0, 0);
        grp.userData.info = info({ t: label, rows: rows, note: note });
        g.add(grp);
        return grp;
      }

      var psii = complex(-9, C.psii, 2.8, 2.7, '光系统 II（P680）',
        [['中心色素', 'P680'], ['功能', '水的光解 · 强氧化剂'], ['电子供体', 'H₂O（Mn₄CaO₅）'], ['每 O₂ 光子', '4']],
        'P680 激发后形成自然界最强的生物氧化剂（P680⁺, E ≈ +1.2 V），足以从水夺取电子：2H₂O → O₂ + 4H⁺ + 4e⁻。放氧复合体需经历 S₀–S₄ 五个状态循环才释放一分子 O₂。');
      var p680 = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), M(0xfff3b0, { em: 0xffb703, ei: 2.2 }));
      p680.position.set(-9, 0.5, 0); g.add(p680);
      p.psiiGlow = p680;

      var lhc = new THREE.Group();
      for (var a = 0; a < 7; a++) {
        var ang = -1.9 + a * 0.63;
        var sm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.9, 1.8), M(0x4fae6b, { em: 0x1c6b3a, ei: 0.6 }));
        sm.position.set(-9 + Math.sin(ang) * 2.1, 1.85 + Math.cos(ang) * 0.35, Math.sin(ang * 1.7) * 0.9);
        sm.rotation.z = -ang * 0.5;
        lhc.add(sm);
      }
      g.add(lhc); p.lhc = lhc;

      var pqS = [];
      for (var i2 = 0; i2 < 3; i2++) {
        var pq = new THREE.Mesh(new THREE.SphereGeometry(0.30, 14, 10), M(C.pq, { em: 0x5c3fa8, ei: 1.0 }));
        pq.position.set(-7.2 + i2 * 0.9, 0.1, (i2 - 1) * 0.5);
        pq.userData.baseY = 0.1;
        g.add(pq); pqS.push(pq);
        pq.userData.info = info({ t: '质体醌 PQ（可移动载体）', rows: [['携带', '2e⁻ + 2H⁺'], ['位置', '膜内疏水区扩散'], ['连接', 'PSII → Cyt b6f']], note: 'PQ 接受 PSII 的 2 个电子并从基质摄取 2 个 H⁺ 成为 PQH₂，在 b6f 处被氧化并把 H⁺ 释放到腔中——质子跨膜转运的第一步。' });
      }
      p.pq = pqS;

      complex(-3.4, C.b6f, 2.1, 2.5, '细胞色素 b6f 复合体',
        [['功能', '质子泵（Q 循环）'], ['每 2e⁻ 泵 H⁺', '4'], ['连接', 'PQH₂ → 质体蓝素']],
        '通过 Q 循环把电子从 PQH₂ 传给质体蓝素，同时把 4 个 H⁺ 从基质泵入腔。它是电子传递链的限速步骤（周转约 5 ms），决定线性电子流上限。');

      var pc = new THREE.Mesh(new THREE.SphereGeometry(0.30, 14, 10), M(C.pc, { em: 0x1f6f9f, ei: 1.0 }));
      pc.position.set(-1.5, -1.9, 0); g.add(pc); p.pc = pc;
      pc.userData.info = info({ t: '质体蓝素 PC（腔侧载体）', rows: [['携带', '1e⁻（Cu²⁺/Cu⁺）'], ['位置', '类囊体腔内'], ['连接', 'b6f → PSI']], note: '含铜的可溶性小蛋白，沿类囊体腔内表面扩散，把电子递给 P700⁺。' });

      var psi = complex(3.0, C.psi, 2.5, 2.7, '光系统 I（P700）',
        [['中心色素', 'P700'], ['功能', '二次光激发 · 强还原剂'], ['产物', '还原态铁氧还蛋白'], ['每 O₂ 光子', '4']],
        'P700 受激把电子提升到极负电位（≈ −1.3 V），经铁氧还蛋白交给 FNR 还原 NADP⁺。与 PSII 串联构成 Z 式电子传递链。');
      var p700 = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), M(0xffe0e6, { em: 0xff4d6d, ei: 2.2 }));
      p700.position.set(3.0, 0.5, 0); g.add(p700);
      p.psiGlow = p700;

      var fd = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), M(C.fd, { em: 0x8a6a10, ei: 1.2 }));
      fd.position.set(3.0, 1.75, 0); g.add(fd);
      fd.userData.info = info({ t: '铁氧还蛋白 Fd', rows: [['辅基', '2Fe–2S 簇'], ['电位', '≈ −420 mV'], ['分支', 'NADPH / 循环电子流']], note: '电子分配枢纽：交给 FNR 生成 NADPH（线性），或回流给 PQ（循环电子流）——后者只泵质子不产 NADPH，用于补足 ATP 缺口。' });
      var fnr = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 1.8), M(C.fnr, { em: 0x8a5a00, ei: 0.7 }));
      fnr.position.set(6.0, 2.35, 0); g.add(fnr);
      fnr.userData.info = info({ t: 'FNR（铁氧还蛋白-NADP⁺ 还原酶）', rows: [['催化', '2 Fd(red) + NADP⁺ → NADPH'], ['每 NADPH', '2 e⁻'], ['计量', '每 O₂ 生成 2 NADPH']], note: '线性电子传递终点：每裂解 2 个 H₂O（释放 1 个 O₂）传递 4 个电子，生成 2 个 NADPH。' });

      var atpase = new THREE.Group();
      atpase.add(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.6, 18), M(C.atpase, { em: 0x146b45, ei: 0.6, rough: 0.35 })));
      var rotor = new THREE.Group();
      var shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.58, 12), M(0xcfeee0, { rough: 0.3 }));
      shaft.position.y = 1.4; rotor.add(shaft);
      for (var h2 = 0; h2 < 6; h2++) {
        var ang2 = h2 / 6 * Math.PI * 2;
        var su = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), M(C.atpaseHead, { em: 0x2c8f60, ei: 0.8, rough: 0.35 }));
        su.position.set(Math.cos(ang2) * 0.78, 2.5, Math.sin(ang2) * 0.78);
        rotor.add(su);
      }
      atpase.add(rotor);
      atpase.position.set(10, 0, 0);
      g.add(atpase);
      atpase.userData.info = info({ t: 'ATP 合酶（CF₀–CF₁）', rows: [['c 环亚基', '14'], ['H⁺ / 整圈', '14'], ['H⁺ / ATP', '≈ 4.67'], ['转速', '≈ 100–300 r/s']], note: '质子回流驱动 c 环旋转，带动 γ 亚基引发三个催化位点的构象循环。每转生成 3 个 ATP，故 14/3 ≈ 4.67 个 H⁺ 合成 1 个 ATP。' });
      p.rotor = rotor;

      p.paths.e = bakePath([
        [-9, -1.25, 0], [-9, 0.2, 0], [-8.2, 0.55, 0], [-7.2, 0.35, 0.3], [-6.0, 0.05, 0],
        [-4.6, 0.1, -0.2], [-3.4, 0.15, 0], [-2.4, -0.8, 0.2], [-1.5, -1.85, 0],
        [-0.6, -1.6, -0.2], [1.2, -0.7, 0], [3.0, 0.1, 0], [3.0, 1.5, 0],
        [4.4, 2.1, 0.2], [6.0, 2.5, 0], [7.6, 3.0, 0.2], [8.8, 3.3, 0], [10.2, 3.5, 0]
      ], 260);
      g.add(new THREE.Line(
        new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(p.paths.e, 3)),
        new THREE.LineBasicMaterial({ color: 0x4de2ff, transparent: true, opacity: 0.28 })
      ));

      p.paths.hB6f = bakePath([[-3.4, 1.1, 0], [-3.4, -0.4, 0.3], [-3.4, -1.9, -0.2]], 40);
      p.paths.hATP = bakePath([[10, -2.7, 0], [10, -0.8, 0.2], [10, 1.5, 0]], 40);
      p.paths.atp = bakePath([[10, 3.3, 0], [9.0, 4.4, 0.4], [6.6, 5.3, 0.2], [4.1, 5.7, 0]], 60);
      p.paths.nadph = bakePath([[6.0, 2.9, 0], [5.0, 3.6, 0.3], [3.0, 4.2, 0.1], [1.5, 4.3, 0]], 60);
      p.paths.co2 = bakePath([[14.5, 11.5, 4.0], [9.0, 11.2, 2.0], [4.5, 10.6, 0.8], [1.5, 10.2, 0]], 70);
      p.paths.sugar = bakePath([[-1.1, 5.6, 0], [-5.0, 4.4, 1.0], [-9.5, 3.2, 2.0], [-14, 2.4, 3.2]], 60);
      p.paths.o2 = bakePath([[-9, -1.5, 0], [-10.5, -3.0, 0.8], [-12.5, -4.6, 1.8], [-14.5, -5.6, 2.8]], 60);
      p.paths.h2o = bakePath([[-14.5, -5.2, 2.8], [-12, -3.2, 1.6], [-10, -1.8, 0.6], [-9, -1.25, 0]], 60);

      /* ---------- 卡尔文循环 ---------- */
      var calvin = new THREE.Group();
      var CX = 1.5, CY = 7.3, CR = 3.0;
      function nodeAt(deg) {
        var a = deg * Math.PI / 180;
        return [CX + Math.cos(a) * CR, CY + Math.sin(a) * CR, 0];
      }
      var ringPts = [];
      for (var d2 = 0; d2 <= 72; d2++) {
        ringPts.push(new THREE.Vector3(CX + Math.cos(d2 / 72 * Math.PI * 2) * CR, CY + Math.sin(d2 / 72 * Math.PI * 2) * CR, 0));
      }
      calvin.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(ringPts),
        new THREE.LineBasicMaterial({ color: 0x6ef2a0, transparent: true, opacity: 0.32 })
      ));

      var nodeDef = [
        { deg: 90, col: 0xffd166, t: 'RuBP（1,5-二磷酸核酮糖）', r: [['碳数', 'C5'], ['角色', 'CO₂ 受体']], n: '每轮消耗 3 分子 RuBP 固定 3 分子 CO₂；RuBP 再生需要 5 分子 G3P 的碳骨架重排，并额外消耗 ATP。' },
        { deg: 30, col: 0xc9d1e0, t: '羧化产物 3-PGA', r: [['碳数', 'C3 × 2'], ['酶', 'Rubisco']], n: 'Rubisco 把 CO₂ 加到 RuBP 上生成不稳定的 C6 中间体，立即水解为 2 分子 3-磷酸甘油酸。' },
        { deg: -30, col: 0xff9f1c, t: '1,3-二磷酸甘油酸', r: [['消耗', 'ATP → ADP'], ['酶', 'PGA 激酶']], n: '3-PGA 被 ATP 磷酸化；连同下一步还原，每固定 1 个 CO₂ 共需 3 ATP + 2 NADPH。' },
        { deg: -90, col: 0xff8fab, t: 'G3P（磷酸丙糖）', r: [['消耗', 'NADPH → NADP⁺'], ['碳数', 'C3']], n: '1,3-BPGA 被 NADPH 还原为 G3P。每 6 个 G3P 中 5 个用于再生 RuBP，1 个输出合成蔗糖或淀粉。' },
        { deg: -150, col: 0xf4a261, t: '再生 / 输出', r: [['再生 RuBP', '5/6 G3P'], ['输出', '1/6 G3P'], ['额外消耗', 'ATP']], n: '5 分子 G3P 经 C3/C4/C5/C6/C7 糖重排再生 3 分子 RuBP，额外消耗 3 个 ATP。' }
      ];
      nodeDef.forEach(function (nd) {
        var pos = nodeAt(nd.deg);
        var m2 = new THREE.Mesh(new THREE.SphereGeometry(0.30, 14, 10), M(nd.col, { em: nd.col, ei: 0.7 }));
        m2.position.set(pos[0], pos[1], pos[2]);
        m2.userData.info = info({ t: nd.t, rows: nd.r, note: nd.n });
        calvin.add(m2);
      });

      var rub = new THREE.Group();
      var rubL = M(C.rubL, { rough: 0.35, metal: 0.15, em: 0x5a6472, ei: 0.25 });
      var rubS = M(C.rubS, { rough: 0.45, em: 0x2f3742, ei: 0.2 });
      for (var l8 = 0; l8 < 8; l8++) {
        var ang3 = l8 / 8 * Math.PI * 2;
        var L1 = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), rubL);
        L1.position.set(Math.cos(ang3) * 0.72, 0, Math.sin(ang3) * 0.72);
        rub.add(L1);
        var S1 = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), rubS);
        S1.position.set(Math.cos(ang3 + 0.39) * 0.66, 0.62, Math.sin(ang3 + 0.39) * 0.66);
        rub.add(S1);
      }
      var rp = nodeAt(150);
      rub.position.set(rp[0], rp[1], rp[2]);
      rub.userData.info = info({ t: 'Rubisco（L8S8）', rows: [['全酶', '8 大亚基 + 8 小亚基'], ['含量', '叶片可溶蛋白 30–50 %'], ['羧化 / 加氧', '受 CO₂:O₂ 与温度调控'], ['周转', '≈ 3 次/s']], note: '地球上丰度最高的酶，同时催化羧化与加氧，后者即光呼吸的起点。因其周转极慢，植物必须合成海量 Rubisco 才能达到可观同化速率。' });
      calvin.add(rub);
      p.rubisco = rub;

      var arrow = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.62, 12), M(0x6ef2a0, { em: 0x2c8f60, ei: 1.2 }));
      calvin.add(arrow);
      p.arrow = arrow; p.ring = { CX: CX, CY: CY, CR: CR };

      g.add(calvin);
      p.calvin = calvin;

      p.pools.photon = new Pool(160, 0.34);
      p.pools.e = new Pool(110, 0.30);
      p.pools.h = new Pool(130, 0.28);
      p.pools.o2 = new Pool(80, 0.32);
      p.pools.co2 = new Pool(80, 0.32);
      p.pools.h2o = new Pool(60, 0.30);
      p.pools.atp = new Pool(80, 0.33);
      p.pools.nadph = new Pool(80, 0.33);
      p.pools.sugar = new Pool(60, 0.36);
      Object.keys(p.pools).forEach(function (kk) { g.add(p.pools[kk].obj); });

      tag(g, '光系统 II（P680）', -9, 1.6, 1.4, -3.4, 2.6, 1.8, 0.68, '#ffa07a');
      tag(g, 'PQ', -6.3, 0.4, 1.4, -1.2, 2.0, 1.6, 0.58, '#c9a6ff');
      tag(g, 'Cyt b6f', -3.4, 1.4, 1.4, -0.6, 2.6, 1.8, 0.68, '#7fe9ff');
      tag(g, 'PC（腔侧）', -1.5, -1.9, 1.4, -1.0, -2.6, 1.6, 0.58, '#9fdcff');
      tag(g, '光系统 I（P700）', 3.0, 1.6, 1.4, 0.4, 3.0, 1.8, 0.68, '#ff8fa3');
      tag(g, 'Fd / FNR → NADPH', 5.2, 2.4, 1.4, 2.2, 2.2, 1.6, 0.62, '#ffd98a');
      tag(g, 'ATP 合酶', 10, 2.9, 1.4, 2.4, 1.8, 1.6, 0.68, '#8ff0b8');
      tag(g, '类囊体腔（H⁺ 富集）', -6.5, -3.2, 1.4, -1.6, -2.4, 1.6, 0.62, '#7fd1ff');
      tag(g, '基质（卡尔文循环）', -2.0, 9.6, 1.4, -2.6, 2.4, 1.6, 0.62, '#8ff0b8');
      tag(g, 'Rubisco（L8S8）', 1.5, 10.2, 0.9, 1.6, 2.4, 1.6, 0.62, '#e6eefc');

      p.root = g;
      return p;
    }

    /* ============================================================
     * 8. 层级装配与相机导航
     * ========================================================== */
    var LV = {
      leaf: { center: new THREE.Vector3(0, 0, 0), home: { th: -0.62, ph: 1.32, r: 27 }, tgt: new THREE.Vector3(0, 0.4, 0),
              enter: 11.5, exit: null, name: '叶片横截面' },
      chloro: { center: new THREE.Vector3(0, 0, -300), home: { th: 0.58, ph: 1.12, r: 15 }, tgt: new THREE.Vector3(0, 0, -300),
                enter: 5.2, exit: 30, name: '叶绿体' },
      mol: { center: new THREE.Vector3(0, 0, -600), home: { th: -0.18, ph: 1.22, r: 30 }, tgt: new THREE.Vector3(0.8, 2.8, -600),
             enter: null, exit: 44, name: '类囊体膜分子机器' }
    };
    var ORDER = ['leaf', 'chloro', 'mol'];

    var L = { leaf: buildLeaf(), chloro: buildChloro(), mol: buildMol() };
    Object.keys(L).forEach(function (k) {
      L[k].root.position.copy(LV[k].center);
      scene.add(L[k].root);
    });

    var nav = { level: 'leaf', phase: 'idle', t: 0, dir: 1, from: null, to: null };
    var DUR_OUT = 0.30, DUR_IN = 0.95;

    var stageEl = document.getElementById('stage');
    var fadeEl = document.createElement('div');
    fadeEl.style.cssText = 'position:absolute;inset:0;background:#05070f;opacity:0;pointer-events:none;z-index:5;transition:opacity .12s linear;';
    stageEl.appendChild(fadeEl);

    var badge = document.createElement('div');
    badge.className = 'hl-photo-badge';
    badge.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);top:14px;display:flex;gap:12px;' +
      'align-items:center;padding:8px 16px;border-radius:11px;background:rgba(8,13,26,.82);' +
      'border:1px solid rgba(77,226,255,.22);backdrop-filter:blur(10px);font-size:11.5px;color:#dce7f5;' +
      'z-index:6;pointer-events:none;white-space:nowrap;box-shadow:0 8px 26px rgba(0,0,0,.45);';
    stageEl.appendChild(badge);

    function showLevel(id) {
      Object.keys(L).forEach(function (k) { L[k].root.visible = (k === id); });
    }

    var _sp = new THREE.Spherical();
    function setPose(th, ph, r, tgt) {
      controls.target.copy(tgt);
      controls._theta = th; controls._phi = ph; controls._radius = r;
      // 同步相机实体位置，避免 Manager.load 的 syncFromCamera 读到旧位姿
      _sp.set(r, clamp(ph, 0.02, Math.PI - 0.02), th);
      camera.position.setFromSpherical(_sp).add(tgt);
      camera.lookAt(tgt);
      camera.updateMatrixWorld();
    }

    function gotoLevel(id, dir) {
      if (!LV[id]) return;
      if (id === nav.level) { syncLevelUI(); return; }
      if (nav.phase !== 'idle') return;
      dir = dir || (ORDER.indexOf(id) > ORDER.indexOf(nav.level) ? 1 : -1);
      nav.from = nav.level; nav.to = id; nav.dir = dir;
      nav.phase = 'out'; nav.t = 0;
      controls.enabled = false;
      applyLabels();
    }

    function syncLevelUI() {
      if (!panelButtons.length) {
        panelButtons = Array.prototype.slice.call(document.querySelectorAll('#panel .btn'));
      }
      var want = { leaf: '叶片', chloro: '叶绿体', mol: '分子' }[nav.level];
      panelButtons.forEach(function (b) {
        if (b.textContent === '叶片' || b.textContent === '叶绿体' || b.textContent === '分子') {
          b.classList.toggle('on', b.textContent === want);
        }
      });
    }
    var panelButtons = [];

    function updateNav(dt) {
      if (nav.phase === 'out') {
        nav.t += dt;
        fadeEl.style.opacity = String(Math.min(1, nav.t / DUR_OUT));
        if (nav.t >= DUR_OUT) {
          nav.level = nav.to;
          showLevel(nav.level);
          var hm = LV[nav.level].home;
          var r0 = (nav.dir > 0) ? hm.r * 2.3 : hm.r * 0.42;
          setPose(hm.th, hm.ph, r0, LV[nav.level].tgt);
          nav.phase = 'in'; nav.t = 0;
          syncLevelUI();
        }
        return;
      }
      if (nav.phase === 'in') {
        nav.t += dt;
        var k = Math.min(1, nav.t / DUR_IN), e = ease(k);
        fadeEl.style.opacity = String(Math.max(0, 1 - Math.min(1, nav.t / (DUR_IN * 0.5))));
        var hm2 = LV[nav.level].home;
        var r0 = (nav.dir > 0) ? hm2.r * 2.3 : hm2.r * 0.42;
        setPose(hm2.th, hm2.ph, lerp(r0, hm2.r, e), LV[nav.level].tgt);
        if (k >= 1) {
          nav.phase = 'idle';
          controls.enabled = true;
          controls.syncFromCamera();
          controls.saveHome();
          fadeEl.style.opacity = '0';
        }
        return;
      }
      if (P.autoLod) {
        var r = controls.getDistance(), cur = nav.level;
        if (cur === 'leaf' && r < LV.leaf.enter) gotoLevel('chloro', 1);
        else if (cur === 'chloro' && r < LV.chloro.enter) gotoLevel('mol', 1);
        else if (cur === 'chloro' && r > LV.chloro.exit) gotoLevel('leaf', -1);
        else if (cur === 'mol' && r > LV.mol.exit) gotoLevel('chloro', -1);
      }
    }

    /* ---------------- 层级内 LOD ---------------- */
    function applyLod() {
      var r = controls.getDistance();
      var lf = L.leaf, ch = L.chloro, mo = L.mol;
      lf.chloro.visible = r < 20;
      ch.lam.visible = r < 24;
      ch.pg.visible = r < 14;
      ch.dna.visible = r < 12;
      mo.calvin.visible = true;
    }

    function applyLabels() {
      labelGroups.forEach(function (g) { g.visible = P.labels; });
    }
    function applyFlow() {
      Object.keys(L).forEach(function (k) {
        Object.keys(L[k].pools).forEach(function (kk) { L[k].pools[kk].obj.visible = P.flow; });
      });
    }

    /* ============================================================
     * 9. HUD
     * ========================================================== */
    function row(k, v, col) {
      return '<div class="note-row"><span>' + k + '</span><b' +
        (col ? ' style="color:' + col + '"' : '') + '>' + v + '</b></div>';
    }
    function bar(v, col) {
      var w = Math.round(clamp(v, 0, 1) * 100);
      return '<span style="display:inline-block;width:54px;height:5px;border-radius:3px;background:rgba(120,180,255,.18);' +
        'vertical-align:middle;margin-left:6px"><span style="display:block;width:' + w + '%;height:100%;border-radius:3px;background:' + col + '"></span></span>';
    }

    function refreshHud() {
      var st = ST[S.state];
      badge.innerHTML =
        '<span style="color:#7b8aa5">层级</span><b style="color:#4de2ff;font-weight:600">' + LV[nav.level].name + '</b>' +
        '<span style="width:1px;height:14px;background:rgba(120,180,255,.2)"></span>' +
        '<span style="width:7px;height:7px;border-radius:50%;background:' + st.col + ';box-shadow:0 0 8px ' + st.col + '"></span>' +
        '<span style="color:' + st.col + '">' + st.name + '</span>' +
        '<span style="width:1px;height:14px;background:rgba(120,180,255,.2)"></span>' +
        '<span style="color:#7b8aa5">净同化 A</span><b style="color:#ffcf6b">' + met.A.toFixed(1) + '</b>' +
        '<span style="color:#7b8aa5">μmol·m⁻²·s⁻¹</span>' +
        '<span style="width:1px;height:14px;background:rgba(120,180,255,.2)"></span>' +
        '<span style="color:#7b8aa5">放氧</span><b style="color:#3ddc97">' + met.O2gross.toFixed(1) + '</b>' +
        '<span style="color:#7b8aa5">净糖</span><b style="color:#f4a261">' + (met.sugar / 1000).toFixed(2) + ' g·m⁻²·h⁻¹</b>';

      var limTxt = met.limit === 'Rubisco' ? 'Rubisco 羧化能力（Vcmax）' : 'RuBP 再生 / 电子传递（Jmax）';
      var limCol = met.limit === 'Rubisco' ? '#ff9f1c' : '#4de2ff';
      var h = '';
      h += '<div style="font-size:10px;letter-spacing:1.5px;color:' + st.col + ';margin-bottom:8px">' + st.name + '</div>';
      h += '<div style="font-size:10.5px;line-height:1.7;color:#9fb0c8;margin-bottom:10px">' + st.hint + '</div>';
      h += row('净同化 A', met.A.toFixed(2) + ' μmol CO₂·m⁻²·s⁻¹', met.A > 0 ? '#ffcf6b' : '#7b8aa5');
      h += row('限制环节', limTxt, limCol);
      h += row('胞间 CO₂ Ci', met.Ci.toFixed(0) + ' ppm');
      h += row('CO₂ 补偿点 Γ*', met.Gs.toFixed(1) + ' ppm');
      h += row('有效光强 I_eff', met.Ieff.toFixed(0) + ' μmol·m⁻²·s⁻¹');
      h += row('电子传递 J', met.Jact.toFixed(1) + ' μmol e⁻·m⁻²·s⁻¹');
      h += row('过剩光能（NPQ）', met.npq.toFixed(1) + ' (' + (met.Jpot > 0 ? (met.npq / met.Jpot * 100).toFixed(0) : 0) + ' %)');
      h += row('放氧（水光解）', met.O2gross.toFixed(2) + ' μmol O₂·m⁻²·s⁻¹', '#3ddc97');
      h += row('光呼吸占比', (met.prRatio * 100).toFixed(1) + ' %', '#ff8fab');
      h += '<div style="height:8px"></div>';
      h += row('ATP 生成 / 消耗', met.supATP.toFixed(1) + ' / ' + met.demATP.toFixed(1), '#ffd166');
      h += row('NADPH 生成 / 消耗', met.supNADPH.toFixed(1) + ' / ' + met.demNADPH.toFixed(1), '#ff8fab');
      h += row('循环电子流 CEF', met.Jcef.toFixed(1) + ' (' + (met.Jpot > 0 ? (met.Jcef / (met.Jpot + met.Jcef) * 100).toFixed(1) : 0) + ' %)', '#b98cff');
      h += row('ATP 池', (S.atp / CAP_ATP * 100).toFixed(0) + ' %' + bar(S.atp / CAP_ATP, '#ffd166'));
      h += row('NADPH 池', (S.nadph / CAP_NADPH * 100).toFixed(0) + ' %' + bar(S.nadph / CAP_NADPH, '#ff8fab'));
      h += row('卡尔文循环活跃度', (S.act * 100).toFixed(0) + ' %' + bar(S.act, '#3ddc97'));
      h += '<div style="height:8px"></div>';
      h += row('糖合成（葡萄糖）', (met.sugar / 1000).toFixed(2) + ' g·m⁻²·h⁻¹', '#f4a261');
      h += row('表观量子效率 Φ', met.phi.toFixed(4) + ' mol·mol⁻¹');
      h += row('每 CO₂ 光子数', met.phi > 1e-6 ? (1 / met.phi).toFixed(1) + '（理论下限 8）' : '—');
      h += row('光抑制 / 热失活', (S.inhib * 100).toFixed(0) + ' % / ' + (S.heat * 100).toFixed(0) + ' %',
        (S.inhib > 0.3 || S.heat > 0.3) ? '#ff4d6d' : '#7b8aa5');
      h += row('气孔相对导度', (met.gsw * 100).toFixed(0) + ' %' + bar(met.gsw, '#4aa8ff'));
      ctx.setNote(h);
    }

    /* ============================================================
     * 10. 粒子发射与场景动画
     * ========================================================== */
    var pcRGB = { photon: wl2rgb(P.wl), e: rgbOf(C.electron), h: rgbOf(C.proton), o2: rgbOf(C.o2),
                  co2: rgbOf(C.co2), h2o: rgbOf(C.water), atp: rgbOf(C.atp), nadph: rgbOf(C.nadph),
                  sugar: rgbOf(C.sugar) };

    var tAll = 0;
    function updateLeaf(dt) {
      var p = L.leaf, m = met;
      var ph = pcRGB.photon, o2 = pcRGB.o2, co2 = pcRGB.co2, h2o = pcRGB.h2o;

      // 光子雨
      var prate = 4 + 62 * clamp(m.Ieff / 1400, 0, 0.62);
      emitRate(p.pools.photon, prate, dt, function () {
        var x = -12 + Math.random() * 24, z = -3.6 + Math.random() * 7.2;
        p.pools.photon.emit(x, 9.5, z, 0.4, -7.5, 0, 1.35, ph[0], ph[1], ph[2]);
      });
      // CO₂ 经气孔进入
      emitRate(p.pools.co2, 3 + 26 * met.gsw * clamp(P.co2 / 420, 0.2, 2), dt, function () {
        var s = p.stomata[(Math.random() * p.stomata.length) | 0];
        p.pools.co2.emit(s.x + (Math.random() - 0.5) * 0.4, -6.5, -1 + Math.random() * 2,
          (Math.random() - 0.5) * 0.4, 2.2 + Math.random() * 0.8, 0, 3.4, co2[0], co2[1], co2[2]);
      });
      // O₂ 经气孔排出
      emitRate(p.pools.o2, 2 + 24 * clamp(m.O2gross / 25, 0, 2), dt, function () {
        var s = p.stomata[(Math.random() * p.stomata.length) | 0];
        p.pools.o2.emit(s.x + (Math.random() - 0.5) * 0.5, -0.4, -1 + Math.random() * 2,
          (Math.random() - 0.5) * 0.3, -(1.4 + Math.random() * 0.7), 0, 4.2, o2[0], o2[1], o2[2]);
      });
      // 木质部供水
      emitRate(p.pools.water, 2 + 14 * met.gsw, dt, function () {
        p.pools.water.emit(6.9 + (Math.random() - 0.5) * 0.8, -0.2, -3.2 + Math.random() * 6.4,
          -(1.0 + Math.random()) * 1.2, (Math.random() - 0.5) * 0.6, 0, 3.0, h2o[0], h2o[1], h2o[2]);
      });

      // 气孔开度
      var op = 0.14 + 0.46 * met.gsw;
      p.stomata.forEach(function (s) {
        s.a.position.x = -op; s.b.position.x = op;
        s.a.material.emissiveIntensity = 0.25 + 0.5 * met.gsw;
      });
      // 叶绿体随光强发光
      p.chMat.emissiveIntensity = 0.25 + 1.1 * clamp(m.Jact / 150, 0, 1);
    }

    function updateChloro(dt) {
      var p = L.chloro, m = met;
      var ph = pcRGB.photon, o2 = pcRGB.o2, co2 = pcRGB.co2;
      var atp = pcRGB.atp, nadph = pcRGB.nadph;

      emitRate(p.pools.photon, 4 + 56 * clamp(m.Ieff / 1300, 0, 0.62), dt, function () {
        var x = -6.5 + Math.random() * 13, z = -3.6 + Math.random() * 7.2;
        p.pools.photon.emit(x, 6.2, z, 0, -4.2, 0, 1.5, ph[0], ph[1], ph[2]);
      });
      emitRate(p.pools.o2, 2 + 18 * clamp(m.O2gross / 25, 0, 2), dt, function () {
        p.pools.o2.emit(-4 + Math.random() * 8, 0.5, -1 + Math.random() * 2,
          (Math.random() - 0.5) * 1.4, 1.6 + Math.random(), (Math.random() - 0.5) * 0.8, 2.4, o2[0], o2[1], o2[2]);
      });
      emitRate(p.pools.co2, 2 + 12 * met.gsw, dt, function () {
        p.pools.co2.emit(-6 + Math.random() * 12, -3.4, -1 + Math.random() * 2,
          (Math.random() - 0.5) * 0.8, 1.4 + Math.random() * 0.8, (Math.random() - 0.5) * 0.8, 2.6, co2[0], co2[1], co2[2]);
      });
      emitRate(p.pools.atp, 2 + 16 * clamp(m.supATP / 90, 0, 2), dt, function () {
        p.pools.atp.emit(-4 + Math.random() * 8, 0.4, -1 + Math.random() * 2,
          (Math.random() - 0.5) * 1.2, 1.2 + Math.random() * 0.8, (Math.random() - 0.5) * 0.8, 2.2, atp[0], atp[1], atp[2]);
      });
      emitRate(p.pools.nadph, 2 + 14 * clamp(m.supNADPH / 60, 0, 2), dt, function () {
        p.pools.nadph.emit(-4 + Math.random() * 8, 0.2, -1 + Math.random() * 2,
          (Math.random() - 0.5) * 1.2, 1.0 + Math.random() * 0.8, (Math.random() - 0.5) * 0.8, 2.2, nadph[0], nadph[1], nadph[2]);
      });

      p.discMat.emissiveIntensity = 0.35 + 1.5 * clamp(m.Jact / 150, 0, 1);
      p.grana.rotation.y = tAll * 0.05;
    }

    function updateMol(dt) {
      var p = L.mol, m = met, q2 = p.paths;
      var ph = pcRGB.photon, e = pcRGB.e, h = pcRGB.h, o2 = pcRGB.o2, co2 = pcRGB.co2;
      var h2o = pcRGB.h2o, atp = pcRGB.atp, nadph = pcRGB.nadph, sug = pcRGB.sugar;

      var lightF = clamp(m.Jact / 140, 0, 1.2);

      emitRate(p.pools.photon, 4 + 34 * clamp(m.Ieff / 1300, 0, 0.62), dt, function () {
        var tx = (Math.random() < 0.5) ? -9 : 3.0;
        p.pools.photon.emit(tx + (Math.random() - 0.5) * 4, 8.5, 1 + Math.random() * 2.5,
          (Math.random() - 0.5) * 0.6, -6.5, -0.6, 1.2, ph[0], ph[1], ph[2]);
      });
      // 电子（沿 ETC 路径）
      emitRate(p.pools.e, 4 + 40 * lightF, dt, function () {
        p.pools.e.emitPath(q2.e, 0.30 + Math.random() * 0.08, 3.4, e[0], e[1], e[2]);
      });
      // 质子：b6f 泵入 + ATP 合酶流出 + 水解放出
      emitRate(p.pools.h, 3 + 26 * lightF, dt, function () {
        if (Math.random() < 0.55) p.pools.h.emitPath(q2.hB6f, 0.55 + Math.random() * 0.15, 1.9, h[0], h[1], h[2]);
        else p.pools.h.emitPath(q2.hATP, 0.42 + Math.random() * 0.12, 2.4, h[0], h[1], h[2]);
      });
      emitRate(p.pools.h, 2 + 18 * lightF, dt, function () {
        p.pools.h.emit(-9, -1.3, 0, (Math.random() - 0.5) * 2.2, -0.8 - Math.random(), (Math.random() - 0.5) * 1.2,
          1.6, h[0], h[1], h[2]);
      });
      // 底物与产物
      emitRate(p.pools.h2o, 2 + 12 * lightF, dt, function () {
        p.pools.h2o.emitPath(q2.h2o, 0.5 + Math.random() * 0.1, 3.0, h2o[0], h2o[1], h2o[2]);
      });
      emitRate(p.pools.o2, 2 + 14 * clamp(m.O2gross / 25, 0, 2), dt, function () {
        p.pools.o2.emitPath(q2.o2, 0.42 + Math.random() * 0.1, 3.4, o2[0], o2[1], o2[2]);
      });
      emitRate(p.pools.co2, 2 + 16 * clamp(m.Vc / 22, 0, 2), dt, function () {
        p.pools.co2.emitPath(q2.co2, 0.40 + Math.random() * 0.1, 3.6, co2[0], co2[1], co2[2]);
      });
      emitRate(p.pools.atp, 2 + 18 * clamp(m.supATP / 90, 0, 2), dt, function () {
        p.pools.atp.emitPath(q2.atp, 0.42 + Math.random() * 0.1, 2.6, atp[0], atp[1], atp[2]);
      });
      emitRate(p.pools.nadph, 2 + 16 * clamp(m.supNADPH / 60, 0, 2), dt, function () {
        p.pools.nadph.emitPath(q2.nadph, 0.44 + Math.random() * 0.1, 2.6, nadph[0], nadph[1], nadph[2]);
      });
      emitRate(p.pools.sugar, 1 + 6 * clamp(m.sugar / 2000, 0, 2), dt, function () {
        p.pools.sugar.emitPath(q2.sugar, 0.34 + Math.random() * 0.08, 3.4, sug[0], sug[1], sug[2]);
      });

      // 复合体发光随电子流
      p.psiiGlow.material.emissiveIntensity = 0.6 + 2.6 * lightF;
      p.psiGlow.material.emissiveIntensity = 0.6 + 2.6 * lightF;
      // PSII 天线轻微摆动（光捕获）
      p.lhc.rotation.z = Math.sin(tAll * 0.8) * 0.03;
      // PQ / PC 载体往复运动
      p.pq.forEach(function (o, i) {
        o.position.y = o.userData.baseY + Math.sin(tAll * 1.6 + i * 1.7) * 0.18 * (0.4 + lightF);
        o.position.x = -7.2 + i * 0.9 + Math.sin(tAll * 0.9 + i) * 0.35 * (0.3 + lightF);
      });
      p.pc.position.x = -2.0 + Math.sin(tAll * 1.1) * 0.7 * (0.3 + lightF);
      p.pc.position.y = -1.9 + Math.cos(tAll * 1.4) * 0.18;
      // ATP 合酶旋转（转速 ∝ 质子流）
      p.rotor.rotation.y += (0.6 + 9 * lightF) * dt;
      // Rubisco 构象呼吸 + 卡尔文环指示
      var as = 0.4 + 2.6 * S.act;
      p.arrowAngle = (p.arrowAngle || 0) + as * dt * 0.55;
      p.arrow.position.set(
        p.ring.CX + Math.cos(p.arrowAngle) * p.ring.CR,
        p.ring.CY + Math.sin(p.arrowAngle) * p.ring.CR, 0);
      p.arrow.rotation.z = p.arrowAngle - Math.PI / 2;
      p.arrow.visible = S.act > 0.02;
      p.rubisco.rotation.y += (0.2 + 2.2 * S.act) * dt;
      var rs = 1 + Math.sin(tAll * 2.2) * 0.03 * S.act;
      p.rubisco.scale.set(rs, rs, rs);
    }

    /* ============================================================
     * 11. 主循环
     * ========================================================== */
    var hudFrame = 0;
    var startId = LV[P.level] ? P.level : 'leaf';
    nav.level = startId;
    showLevel(startId);
    setPose(LV[startId].home.th, LV[startId].home.ph, LV[startId].home.r, LV[startId].tgt);
    applyLabels();
    applyFlow();
    solve(0.016);
    refreshHud();
    syncLevelUI();

    var api = {
      update: function (dt, tt) {
        tour.update(dt, tt || 0, function (ddt) {
          tAll += ddt;
          solve(ddt);
          updateNav(ddt);
          applyLod();

          var lvl = nav.level;
          if (P.flow) {
            if (lvl === 'leaf') updateLeaf(ddt);
            else if (lvl === 'chloro') updateChloro(ddt);
            else updateMol(ddt);
          }
          Object.keys(L[lvl].pools).forEach(function (k) { L[lvl].pools[k].update(ddt); });

          if (++hudFrame % 8 === 0) refreshHud();
        });
      },

      setParam: function (k, v) {
        if (k === 'tour') { tour.toggle(); return; }
        if (k === 'level') { P.level = v; gotoLevel(v); return; }
        if (k === 'back') {
          var i = ORDER.indexOf(nav.level);
          if (i > 0) gotoLevel(ORDER[i - 1], -1);
          return;
        }
        if (k === 'reset') {
          S.atp = 45; S.nadph = 22; S.act = 0;
          S.heat = 0; S.inhib = 0; S.drought = 0;
          S.darkT = S.hotT = S.hiT = 0;
          return;
        }
        P[k] = v;
        if (k === 'labels') applyLabels();
        if (k === 'flow') applyFlow();
        if (k === 'wl') {
          var c3 = wl2rgb(P.wl);
          pcRGB.photon = c3;
        }
      },

      onClick: function (ndc) {
        var rc = new THREE.Raycaster();
        rc.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
        var hits = rc.intersectObjects(L[nav.level].root.children, true);
        for (var i = 0; i < hits.length; i++) {
          var o = hits[i].object;
          while (o && !o.userData.info && o !== L[nav.level].root) o = o.parent;
          if (o && o.userData.info) {
            if (o.userData.drill) { gotoLevel(o.userData.drill, 1); return; }
            if (o.userData.info && HL.tooltip) {
              HL.tooltip.show(infoHtml(o.userData.info), ndc.clientX, ndc.clientY);
            }
            return;
          }
        }
        if (HL.tooltip) HL.tooltip.hide();
      },

      dispose: function () {
        tour.dispose();
        if (fadeEl.parentNode) fadeEl.parentNode.removeChild(fadeEl);
        if (badge.parentNode) badge.parentNode.removeChild(badge);
      }
    };

    /* ---------- 讲解模式（HL.Tour 框架引擎） ---------- */
    /** 讲解中的层级切换：不走渐隐动画（讲解相机由引擎接管），直接显隐 */
    function gotoTour(id) {
      P.autoLod = false;
      if (nav.level !== id) {
        nav.level = id; P.level = id;
        showLevel(id); syncLevelUI(); applyLabels();
      }
    }
    function sphCam(lv) {
      var hm = LV[lv].home, tg = LV[lv].tgt;
      var v = new THREE.Vector3().setFromSpherical(new THREE.Spherical(hm.r, hm.ph, hm.th)).add(tg);
      return [[v.x, v.y, v.z], [tg.x, tg.y, tg.z]];
    }

    var tour = HL.Tour(ctx);
    tour.load([
      {
        t: '一、叶片：光合作用的工厂',
        d: '从一片叶子的横截面开始：上表皮排列着栅栏组织，下表皮布满气孔——CO₂ 从这里进入，水从导管送来。叶肉细胞里一颗颗绿色椭圆体就是叶绿体，一座座直径约 5 μm 的太阳能工厂。一片叶子里的叶绿体，数以千万计。',
        exp: '点击叶面上的结构可看它的功能说明。',
        cam: sphCam('leaf'),
        pulse: null,
        apply: function () { gotoTour('leaf'); }
      },
      {
        t: '二、叶绿体：捕获光能的细胞器',
        d: '深入一颗叶绿体：外面包着双层被膜，内部悬浮着一叠叠绿色的「基粒」——每张薄片都是一层压扁的囊泡（类囊体），膜上镶嵌着捕光蛋白。20 亿年前，一类蓝细菌被真核细胞吞入并定居下来，变成叶绿体——这次「内共生」让地球从此披上绿色。',
        exp: '已为你深入叶绿体。注意基粒像一摞摞硬币。',
        cam: sphCam('chloro'),
        pulse: null,
        apply: function () { gotoTour('chloro'); }
      },
      {
        t: '三、分子机器：类囊体膜上的流水线',
        d: '再放大一万倍，来到类囊体膜：四台巨大的分子机器排成一条流水线——PSII（光系统Ⅱ）撕开水分子放出 O₂，b6f 像泵一样搬运质子，PSI 给电子补充能量，最右侧的 ATP 合酶则利用质子洪流旋转合成 ATP——每转一圈产出 3 个 ATP。',
        exp: '已为你切到分子层。点击各机器可看分工说明。',
        cam: sphCam('mol'),
        pulse: [0.8, 2.8, -600], r: 6,
        apply: function () { gotoTour('mol'); }
      },
      {
        t: '四、光反应：水被拆开的那一刻',
        d: '光子（暖黄粒子）打在 PSII 上，拽出高能电子；电子沿传递链一路跌落，能量被用来把 H⁺ 泵进囊内，形成质子梯度——像给水坝蓄水。水被拆开补上失去的电子，同时放出 O₂：你呼吸的每一口氧气都来自这条反应。叶绿素偏爱的红光（约 660 nm）效率最高。',
        exp: '退出后把「光谱波长」从 660 调到 450，看 ATP / NADPH 产量明显下降。',
        cam: [[3, 6, -594], [0.8, 2.8, -600]],
        pulse: null
      },
      {
        t: '五、卡尔文循环：把空气变成糖',
        d: '膜外基质中进行着卡尔文循环：Rubisco——地球上含量最丰富的蛋白质——抓住 CO₂ 接到五碳糖上，用 ATP 与 NADPH 的能量一步步还原，每固定 3 个 CO₂ 产出 1 个 G3P。植物每年用这个循环固定约 1200 亿吨碳，养活几乎所有生命。',
        exp: '拖「CO₂ 浓度」从 420 降到 80 ppm，看糖产量怎样塌下去。',
        cam: [[-4, 4, -592], [0.8, 2.8, -600]],
        pulse: null
      },
      {
        t: '六、状态机：植物如何应对世界',
        d: '这个场景内嵌了真实的光合生理模型（FvCB）：黑暗中产量归零；缺水时气孔关闭、CO₂ 断供；高温让酶失活；强光下光呼吸与光抑制启动。植物没有大脑，却用一套化学反馈应对昼夜、旱涝与四季——右上角徽章显示当前状态。',
        exp: '把「光照强度 PPFD」拉到 0（黑夜）、「温度」拉到 45 ℃，看状态徽章切换。',
        cam: sphCam('leaf'),
        pulse: null,
        apply: function () { gotoTour('leaf'); P.autoLod = true; }
      }
    ]);

    return api;
  }
});
