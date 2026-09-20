/**
 * 场景：双缝干涉
 * 杨氏双缝实验：光强 I = I₀ (sinβ/β)² · cos²α
 *   其中 α = πd·sinθ/λ（双缝干涉因子），β = πa·sinθ/λ（单缝衍射包络）
 * 「光子累积」模式按光强分布做拒绝采样，逐点累积出干涉条纹——单个粒子也自我干涉
 */
HL.registerScene({
  id: 'interference',
  name: '双缝干涉',
  short: '波动光学与光子累积',
  icon: '≋',
  fov: 46,
  minDistance: 6,
  maxDistance: 120,
  desc: '杨氏双缝实验。屏上光强由双缝干涉因子与单缝衍射包络共同决定：条纹间距 Δy = λL/d，包络第一零点 y₁ = λL/a。切换到「光子累积」，可看到离散光子逐个落点、最终浮现出干涉条纹。',

  controls: [
    { type: 'button', key: 'tour', label: '📖 讲解模式' },
    { type: 'range', key: 'wl', label: '波长 λ', min: 380, max: 780, step: 5, value: 550, unit: ' nm' },
    { type: 'range', key: 'd', label: '缝间距 d', min: 0.08, max: 0.6, step: 0.01, value: 0.25, unit: ' mm' },
    { type: 'range', key: 'a', label: '缝宽 a', min: 0.01, max: 0.12, step: 0.005, value: 0.04, unit: ' mm' },
    { type: 'range', key: 'L', label: '屏距 L', min: 0.4, max: 3, step: 0.1, value: 1.2, unit: ' m' },
    { type: 'buttons', key: 'mode', label: '显示模式', value: 'wave', options: [
      { label: '波动场', value: 'wave' },
      { label: '光子累积', value: 'photon' }
    ] },
    { type: 'check', key: 'field', label: '显示空间波场', value: true },
    { type: 'check', key: 'curve', label: '显示光强曲线', value: true },
    { type: 'button', key: 'clear', label: '清除累积' }
  ],

  create: function (ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera;
    scene.add(ctx.makeStars(1200, 260));

    // 支持 URL 查询参数直达配置：?mode=photon&wl=633&d=0.3&a=0.05&L=1.5
    var qs = typeof URLSearchParams !== 'undefined' ? new URLSearchParams(location.search) : null;
    function q(key, dflt) { return qs && qs.get(key) !== null ? qs.get(key) : dflt; }

    var P = {
      wl: parseFloat(q('wl', 550)),
      d: parseFloat(q('d', 0.25)),
      a: parseFloat(q('a', 0.04)),
      L: parseFloat(q('L', 1.2)),
      mode: q('mode', 'wave'),
      field: q('field', '1') !== '0',
      curve: q('curve', '1') !== '0'
    };

    var SX = 0;            // 双缝所在平面
    var PX = 20;           // 屏所在平面
    var SLOT = 1.5;        // 缝中心间距（视觉单位）
    var SCREEN_H = 10;     // 屏高（视觉单位）
    var YHALF = 0.018;     // 屏上可视半宽（米）

    var root = new THREE.Group();
    scene.add(root);

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    var d1 = new THREE.DirectionalLight(0xffffff, 0.7); d1.position.set(-10, 12, 18); scene.add(d1);

    /* ---------- 波长 → RGB（Bruton 近似） ---------- */
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

    /* ---------- 物理：屏上光强 ---------- */
    function intensity(y) {
      var lam = P.wl * 1e-9, dd = P.d * 1e-3, aa = P.a * 1e-3, LL = P.L;
      var sinT = y / Math.sqrt(y * y + LL * LL);
      var alpha = Math.PI * dd * sinT / lam;
      var beta = Math.PI * aa * sinT / lam;
      var env = Math.abs(beta) < 1e-9 ? 1 : Math.pow(Math.sin(beta) / beta, 2);
      return env * Math.pow(Math.cos(alpha), 2);
    }

    /* ---------- 光源与入射光 ---------- */
    var rgb = wl2rgb(P.wl);
    var lightColor = new THREE.Color(rgb[0], rgb[1], rgb[2]);

    var src = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 20, 14),
      new THREE.MeshBasicMaterial({ color: lightColor })
    );
    src.position.set(-9, 0, 0);
    root.add(src);
    var srcGlow = new THREE.Sprite(ctx.glowSprite('rgba(255,255,255,0.8)'));
    srcGlow.scale.set(5, 5, 1);
    srcGlow.position.copy(src.position);
    root.add(srcGlow);

    var beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 9, 10),
      new THREE.MeshBasicMaterial({ color: lightColor, transparent: true, opacity: 0.32 })
    );
    beam.rotation.z = Math.PI / 2;
    beam.position.set(-4.5, 0, 0);
    root.add(beam);

    /* ---------- 双缝挡板 ---------- */
    var barrierMat = new THREE.MeshStandardMaterial({ color: 0x39445c, roughness: 0.85, metalness: 0.15 });
    var gapH = 0.55;                          // 缝宽（视觉）
    var segs = [
      { y: (SLOT + gapH + 8) / 2, h: 8 - (SLOT + gapH) },
      { y: 0, h: SLOT * 2 - gapH },
      { y: -(SLOT + gapH + 8) / 2, h: 8 - (SLOT + gapH) }
    ];
    segs.forEach(function (s) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.22, s.h, 11), barrierMat);
      m.position.set(SX, s.y, 0);
      root.add(m);
    });

    /* ---------- 屏 ---------- */
    var CW = 512, CH = 320;
    var cv = document.createElement('canvas');
    cv.width = CW; cv.height = CH;
    var c2d = cv.getContext('2d');
    var tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;

    var screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(16, SCREEN_H),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
    );
    screenMesh.rotation.y = -Math.PI / 2;
    screenMesh.position.set(PX, 0, 0);
    root.add(screenMesh);

    var frameGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(16, SCREEN_H));
    var frame = new THREE.LineSegments(frameGeo, new THREE.LineBasicMaterial({ color: 0x4de2ff, transparent: true, opacity: 0.4 }));
    frame.rotation.y = -Math.PI / 2;
    frame.position.set(PX, 0, 0);
    root.add(frame);

    /* ---------- 屏纹理绘制 ---------- */
    function paintScreen(reset) {
      if (P.mode === 'wave') {
        var img = c2d.createImageData(CW, CH);
        var d = img.data;
        for (var row = 0; row < CH; row++) {
          var ym = (0.5 - row / CH) * 2 * YHALF;
          var I = intensity(ym);
          var r = Math.min(255, rgb[0] * 255 * I * 1.15 + 8);
          var g = Math.min(255, rgb[1] * 255 * I * 1.15 + 8);
          var b = Math.min(255, rgb[2] * 255 * I * 1.15 + 8);
          for (var col = 0; col < CW; col++) {
            var p = (row * CW + col) * 4;
            d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255;
          }
        }
        c2d.putImageData(img, 0, 0);
      } else if (reset) {
        c2d.fillStyle = '#000000';
        c2d.fillRect(0, 0, CW, CH);
      }
      tex.needsUpdate = true;
    }

    var photonCount = 0;
    var photonFrame = 0;

    function dropPhotons(n) {
      var hit = 0, guard = 0;
      var cs = 'rgb(' + Math.round(Math.min(255, rgb[0] * 255 * 1.5 + 40)) + ',' +
        Math.round(Math.min(255, rgb[1] * 255 * 1.5 + 40)) + ',' +
        Math.round(Math.min(255, rgb[2] * 255 * 1.5 + 40)) + ')';
      c2d.fillStyle = cs;
      while (hit < n && guard < n * 60) {
        guard++;
        var ym = (Math.random() * 2 - 1) * YHALF;
        if (Math.random() < intensity(ym)) {
          var row = Math.floor((0.5 - ym / (2 * YHALF)) * CH);
          var col = Math.floor(Math.random() * CW);
          row = Math.max(0, Math.min(CH - 1, row));
          c2d.fillRect(col, row, 1.4, 1.4);
          hit++;
          photonCount++;
        }
      }
      tex.needsUpdate = true;
    }

    paintScreen(true);

    /* ---------- 空间波场（点阵） ---------- */
    var NX = 132, NY = 74;
    var fpos = new Float32Array(NX * NY * 3);
    var fcol = new Float32Array(NX * NY * 3);
    for (var ix = 0; ix < NX; ix++) {
      for (var iy = 0; iy < NY; iy++) {
        var i = ix * NY + iy;
        fpos[i * 3] = 0.6 + (PX - 1.2) * ix / (NX - 1);
        fpos[i * 3 + 1] = (iy / (NY - 1) - 0.5) * 16;
        fpos[i * 3 + 2] = 0;
      }
    }
    var fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
    fg.setAttribute('color', new THREE.BufferAttribute(fcol, 3));
    var field = new THREE.Points(fg, new THREE.PointsMaterial({
      size: 0.13, vertexColors: true, transparent: true, opacity: 0.95, sizeAttenuation: true
    }));
    root.add(field);

    /* ---------- 光强曲线（屏侧边） ---------- */
    var CN = 220;
    var cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CN * 3), 3));
    var curve = new THREE.Line(cg, new THREE.LineBasicMaterial({ color: 0xffcf6b }));
    root.add(curve);

    function updateCurve() {
      var arr = cg.attributes.position.array;
      for (var i = 0; i < CN; i++) {
        var t = i / (CN - 1);
        var ym = (t - 0.5) * 2 * YHALF;
        var I = intensity(ym);
        arr[i * 3] = PX + I * 3.2;
        arr[i * 3 + 1] = (0.5 - t) * SCREEN_H;
        arr[i * 3 + 2] = 5.9;
      }
      cg.attributes.position.needsUpdate = true;
      cg.computeBoundingSphere();
    }
    updateCurve();

    /* ---------- 标注 ---------- */
    var lbSrc = ctx.makeText('光源', { size: 30, scale: 1.0, color: '#8fb6d9' });
    lbSrc.position.set(-9, 1.6, 0); root.add(lbSrc);
    var lbSlot = ctx.makeText('双缝 d', { size: 30, scale: 1.0, color: '#8fb6d9' });
    lbSlot.position.set(SX, 5.2, 0); root.add(lbSlot);
    var lbScr = ctx.makeText('观察屏 L', { size: 30, scale: 1.0, color: '#8fb6d9' });
    lbScr.position.set(PX, 6.2, 0); root.add(lbScr);

    camera.position.set(-14, 7, 26);
    camera.lookAt(12, -1, -2);

    var t = 0;

    function refreshNote() {
      if (!ctx.setNote) return;
      var lam = P.wl * 1e-9, dd = P.d * 1e-3, aa = P.a * 1e-3;
      var dy = lam * P.L / dd * 1000;             // 条纹间距 (mm)
      var y1 = lam * P.L / aa * 1000;             // 包络第一零点 (mm)
      ctx.setNote(
        '<div class="note-row"><span>条纹间距 Δy</span><b>' + dy.toFixed(3) + ' mm</b></div>' +
        '<div class="note-row"><span>包络零点 y₁</span><b>' + y1.toFixed(2) + ' mm</b></div>' +
        '<div class="note-row"><span>包络内条纹数</span><b>约 ' + Math.round(2 * dd / aa) + ' 条</b></div>' +
        '<div class="note-row"><span>累积光子</span><b>' + photonCount.toLocaleString() + '</b></div>'
      );
    }
    refreshNote();

    /* ---------- 讲解模式（HL.Tour 框架引擎） ---------- */
    var tour = HL.Tour(ctx);
    tour.load([
      {
        t: '一、相干光：从光源到双缝',
        d: '左端是光源，它发出的光到达中间的双缝挡板——这是杨氏 1801 年的关键巧思：用同一波前分出两路光，保证它们步调一致（相干）。若是两个各自独立的手电筒，条纹永远不会出现。观察屏在右侧 20 个单位之外。',
        exp: '右键拖动旋转到侧面视角，看清「光源 → 双缝 → 观察屏」三段结构。',
        cam: [[-14, 7, 26], [8, -1, 0]],
        pulse: [-9, 0, 0], r: 1.6
      },
      {
        t: '二、光程差决定明暗',
        d: '两缝到屏上某点的距离不同，光走过的路程差 δ = d·sinθ。当 δ 等于整数个波长（mλ）时两列波同相叠加——亮纹；等于半波长的奇数倍时相消——暗纹。条纹间距 Δy = λL/d：缝距越大条纹越密，屏越远条纹越宽。',
        exp: '退出讲解后把「缝间距 d」从 0.25 调到 0.50，看条纹变密。',
        cam: [[-1, 2.5, 12], [6, 0, 0]],
        pulse: [0, 0, 0], r: 2.6
      },
      {
        t: '三、观察屏上的条纹',
        d: '黄色曲线是屏上的光强分布 I = I₀(sinβ/β)²cos²α：中央最亮，向两侧递减。条纹的颜色就是光的波长：380 nm 紫到 780 nm 红。1801 年的这条条纹，让人类第一次量出了「光有多细」。',
        exp: '把波长 λ 拉到 700 nm：条纹变红、同时变宽。',
        cam: [[26, 3, 14], [20, 0, 0]],
        pulse: [20, 0, 0], r: 3.2
      },
      {
        t: '四、单缝衍射包络',
        d: '注意亮条纹的整体亮度还有一个「大包络」：每条缝自身的宽度 a 会产生衍射，包络第一零点在 y₁ = λL/a。整幅图样其实是「双缝干涉 × 单缝衍射」的乘积——缝越窄，包络越宽、可见条纹越多。',
        exp: '把「缝宽 a」调到 0.12 mm，观察包络收窄、可见条纹变少。',
        cam: [[22, 2, 10], [20, 0, 0]],
        pulse: null
      },
      {
        t: '五、单个光子也会干涉',
        d: '切到「光子累积」模式：光子一颗一颗随机到达屏上，每个落点看似杂乱，但几万颗之后干涉条纹自己浮现出来。单个光子在出发时「同时走过两条缝」并与自己干涉；而一旦装上探测器去看它走了哪条缝，条纹立刻消失——这是量子力学最深刻的实验之一，也是「测量改变系统」的最早例证。',
        exp: '已为你切到光子累积模式。按「清除累积」可以从零再看一遍条纹浮现。',
        cam: [[24, 2, 12], [20, 0, 0]],
        pulse: [20, 0, 0], r: 3.2,
        apply: function () {
          P.mode = 'photon';
          photonCount = 0;
          paintScreen(true);
          refreshNote();
        }
      }
    ]);

    return {
      update: function (dt, tt) {
        tour.update(dt, tt || 0, function (ddt) {
          t += ddt;

          // 波场：两缝发出的柱面波叠加
          field.visible = P.field;
          if (P.field) {
            var lamVis = 0.55 + (P.wl - 380) / 400 * 0.85;
            var k = Math.PI * 2 / lamVis;
            var w = k * 2.4;
            var arr2 = fg.attributes.color.array;
            for (var i = 0; i < NX * NY; i++) {
              var x = fpos[i * 3], y = fpos[i * 3 + 1];
              var r1 = Math.sqrt(x * x + (y - SLOT) * (y - SLOT));
              var r2 = Math.sqrt(x * x + (y + SLOT) * (y + SLOT));
              var damp = 1 / (1 + r1 * 0.16);
              var A = (Math.cos(k * r1 - w * t) / (1 + r1 * 0.12) + Math.cos(k * r2 - w * t) / (1 + r2 * 0.12));
              var v = Math.min(1, Math.abs(A) * 1.5) * damp * 1.9;
              v = Math.max(0, Math.min(1, v));
              arr2[i * 3] = rgb[0] * v + 0.02;
              arr2[i * 3 + 1] = rgb[1] * v + 0.02;
              arr2[i * 3 + 2] = rgb[2] * v + 0.05;
            }
            fg.attributes.color.needsUpdate = true;
          }

          // 光子累积（note 用帧计数刷新，避免 dt 在高帧率/无头环境下失真）
          if (P.mode === 'photon') {
            dropPhotons(60);
            if (++photonFrame % 15 === 0) refreshNote();
          }

          srcGlow.material.color.copy(lightColor);
          curve.visible = P.curve;
        });
      },

      setParam: function (key, v) {
        if (key === 'tour') { tour.toggle(); return; }
        if (key === 'clear') {
          photonCount = 0;
          paintScreen(true);
          refreshNote();
          return;
        }
        P[key] = v;
        if (key === 'wl') {
          rgb = wl2rgb(P.wl);
          lightColor.setRGB(rgb[0], rgb[1], rgb[2]);
          src.material.color.copy(lightColor);
          beam.material.color.copy(lightColor);
        }
        if (key === 'wl' || key === 'd' || key === 'a' || key === 'L' || key === 'mode') {
          paintScreen(true);
          updateCurve();
          refreshNote();
        }
      },

      onClick: function () {
        HL.toast('屏上光强 I = I₀ (sinβ/β)² cos²α，β = πa·sinθ/λ，α = πd·sinθ/λ；明纹条件 d·sinθ = mλ');
      },

      dispose: function () {
        tour.dispose();
        tex.dispose();
      }
    };
  }
});
