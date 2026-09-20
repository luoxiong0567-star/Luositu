/**
 * 场景：DNA 与蛋白质
 * 球棍模型（Ball-and-stick）呈现 B-DNA 双螺旋、α 螺旋与 β 折叠
 * 结构参数取自真实晶体学数据，几何尺寸为可视化放大值
 */
HL.registerScene({
  id: 'molecule',
  name: 'DNA 与蛋白质',
  short: '双螺旋与二级结构',
  icon: '🧬',
  fov: 46,
  minDistance: 3,
  maxDistance: 240,
  desc: 'B-DNA：直径 2.0 nm、螺距 3.4 nm、每圈 10.5 个碱基对；α 螺旋：每圈 3.6 个残基、螺距 0.54 nm，由 i→i+4 氢键稳定；β 折叠：链间氢键维系片层。滑动「解旋程度」观察碱基对的打开过程。',

  controls: [
    { type: 'button', key: 'tour', label: '📖 讲解模式' },
    { type: 'buttons', key: 'mode', label: '分子对象', value: 'dna', options: [
      { label: 'DNA 双螺旋', value: 'dna' },
      { label: 'α 螺旋', value: 'alpha' },
      { label: 'β 折叠', value: 'beta' }
    ] },
    { type: 'range', key: 'n', label: '单元数量', min: 12, max: 60, step: 2, value: 36 },
    { type: 'range', key: 'unwind', label: '解旋程度', min: 0, max: 1, step: 0.01, value: 0, unit: '' },
    { type: 'check', key: 'hbond', label: '显示氢键', value: true },
    { type: 'check', key: 'side', label: '显示侧链 / 碱基', value: true },
    { type: 'check', key: 'spin', label: '自动旋转', value: true }
  ],

  create: function (ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera;
    scene.add(ctx.makeStars(1500, 300));

    var P = { mode: 'dna', n: 36, unwind: 0, hbond: true, side: true, spin: true };

    var root = new THREE.Group();
    scene.add(root);

    scene.add(new THREE.AmbientLight(0xffffff, 0.62));
    var d1 = new THREE.DirectionalLight(0xffffff, 1.0); d1.position.set(8, 14, 18); scene.add(d1);
    var d2 = new THREE.DirectionalLight(0x6fa8ff, 0.5); d2.position.set(-10, -6, -12); scene.add(d2);

    /* ---------- 资源池（共享 geometry，按颜色缓存材质） ---------- */
    var G = {
      sphere: new THREE.SphereGeometry(1, 14, 10),
      cyl: (function () { var g = new THREE.CylinderGeometry(1, 1, 1, 8); g.translate(0, 0.5, 0); return g; })(),
      cone: (function () { var g = new THREE.ConeGeometry(1, 1, 12); g.translate(0, 0.5, 0); return g; })()
    };
    var MATS = {};
    var meshes = [];
    var seq = 'TTAGGG';                    // 人类端粒重复序列
    var COMP = { A: 'T', T: 'A', G: 'C', C: 'G' };
    var BCOL = { A: 0xff6b6b, T: 0x4de2ff, G: 0x7fe3a0, C: 0xffcf6b };

    function mat(color, opts) {
      opts = opts || {};
      var key = color + '|' + (opts.opacity || 1) + '|' + (opts.emissive || 0);
      if (!MATS[key]) {
        MATS[key] = new THREE.MeshStandardMaterial({
          color: color,
          roughness: opts.roughness === undefined ? 0.38 : opts.roughness,
          metalness: opts.metalness === undefined ? 0.25 : opts.metalness,
          emissive: opts.emissive || 0x000000,
          transparent: opts.opacity !== undefined && opts.opacity < 1,
          opacity: opts.opacity === undefined ? 1 : opts.opacity
        });
      }
      return MATS[key];
    }

    function sphere(color, r, opts) {
      var m = new THREE.Mesh(G.sphere, mat(color, opts));
      m.scale.setScalar(r);
      root.add(m); meshes.push(m);
      return m;
    }

    var UP = new THREE.Vector3(0, 1, 0);
    var _d = new THREE.Vector3();

    function bond(color, r, opts) {
      var m = new THREE.Mesh(G.cyl, mat(color, opts));
      m.scale.set(r, 1, r);
      root.add(m); meshes.push(m);
      m.setEnds = function (a, b) {
        _d.subVectors(b, a);
        var len = _d.length();
        m.position.copy(a);
        m.scale.set(r, len, r);
        m.quaternion.setFromUnitVectors(UP, _d.normalize());
      };
      return m;
    }

    function clearMeshes() {
      meshes.forEach(function (m) { root.remove(m); });
      meshes = [];
      Object.keys(MATS).forEach(function (k) { MATS[k].dispose(); });
      MATS = {};
    }

    /* ---------- 构建 ---------- */
    var parts = null;

    function build() {
      clearMeshes();
      if (P.mode === 'dna') parts = buildDNA();
      else if (P.mode === 'alpha') parts = buildAlpha();
      else parts = buildBeta();
      updateNote();
    }

    /* ---- DNA 双螺旋 ---- */
    function buildDNA() {
      var n = P.n;
      var R = 4.4, RISE = 0.62, TWIST = Math.PI * 2 / 10.5, OFFSET = 2.35;
      var o = { kind: 'dna', n: n, p1: [], p2: [], bases: [], hbonds: [], backbone: [], dna: [] };

      for (var i = 0; i < n; i++) {
        var th = i * TWIST;
        var y = (i - n / 2) * RISE;
        var a = new THREE.Vector3(Math.cos(th) * R, y, Math.sin(th) * R);
        var b = new THREE.Vector3(Math.cos(th + OFFSET) * R, y, Math.sin(th + OFFSET) * R);
        o.p1.push(a); o.p2.push(b);

        var s1 = sphere(0xc8a2e0, 0.42, {});
        var s2 = sphere(0x8fb8d8, 0.42, {});
        o.backbone.push(s1, s2);

        if (i > 0) {
          o.dna.push(bond(0xa88fd0, 0.16));
          o.dna.push(bond(0x6f9ec4, 0.16));
        }

        var base = seq[i % seq.length];
        var comp = COMP[base];
        var bA = sphere(BCOL[base], 0.34, { emissive: 0x221111 });
        var bB = sphere(BCOL[comp], 0.34, { emissive: 0x112222 });
        // 仅一侧碱基参与拾取
        bA.userData.info = {
          title: '碱基对 ' + (i + 1),
          rows: [['配对', base + ' — ' + comp],
          ['氢键数', (base === 'G' || base === 'C') ? '3 条（G·C 更稳定）' : '2 条'],
          ['序列位置', '第 ' + (i + 1) + ' / ' + n + ' 位'],
          ['来源', '人类端粒重复序列 TTAGGG']]
        };
        bB.userData.info = bA.userData.info;
        o.bases.push(bA, bB);

        var cnt = (base === 'G' || base === 'C') ? 3 : 2;
        var arr = [];
        for (var k = 0; k < cnt; k++) arr.push(bond(0xdfe8f5, 0.055, { opacity: 0.75 }));
        o.hbonds.push(arr);
      }
      return o;
    }

    /* ---- α 螺旋 ---- */
    function buildAlpha() {
      var n = P.n;
      var R = 2.0, RISE = 0.62, TWIST = Math.PI * 2 / 3.6;
      var o = { kind: 'alpha', n: n, ca: [], caMesh: [], bonds: [], hbonds: [], side: [], sideBonds: [] };
      var HYDRO = [1, 0, 0, 1, 1, 0, 1, 0, 0, 1];

      for (var i = 0; i < n; i++) {
        var th = i * TWIST;
        var y = (i - n / 2) * RISE * 0.62;
        var p = new THREE.Vector3(Math.cos(th) * R, y, Math.sin(th) * R);
        o.ca.push(p);

        var m = sphere(0x9fb4d0, 0.36);
        o.caMesh.push(m);
        m.userData.info = {
          title: '残基 ' + (i + 1),
          rows: [['二级结构', 'α 螺旋'],
          ['氢键伙伴', '残基 ' + (i + 5) + '（i → i+4）'],
          ['侧链性质', HYDRO[i % 10] ? '疏水' : '极性'],
          ['每圈残基数', '3.6']]
        };

        if (i > 0) o.bonds.push(bond(0x8fa8c4, 0.17));
        if (i >= 4) o.hbonds.push(bond(0x4de2ff, 0.06, { opacity: 0.6 }));

        var dir = new THREE.Vector3(Math.cos(th), 0, Math.sin(th));
        var sp = sphere(HYDRO[i % 10] ? 0xffcf6b : 0x7fe3a0, 0.26);
        o.side.push({ mesh: sp, dir: dir.clone(), base: p.clone() });
        o.sideBonds.push(bond(0x7f8fa6, 0.08));
      }
      return o;
    }

    /* ---- β 折叠 ---- */
    function buildBeta() {
      var n = P.n;
      var o = { kind: 'beta', n: n, a: [], b: [], meshA: [], meshB: [], bondsA: [], bondsB: [], hbonds: [], arrows: [] };
      var SPACING = 0.95, PLEAT = 0.55, SEP = 3.4;

      for (var i = 0; i < n; i++) {
        var x = (i - n / 2) * SPACING;
        var ya = (i % 2 === 0 ? PLEAT : -PLEAT);
        var yb = (i % 2 === 0 ? -PLEAT : PLEAT);          // 反平行排列
        o.a.push(new THREE.Vector3(x, ya, -SEP / 2));
        o.b.push(new THREE.Vector3(-x, yb, SEP / 2));

        var ma = sphere(0x9fb4d0, 0.34);
        o.meshA.push(ma);
        ma.userData.info = {
          title: '残基 ' + (i + 1),
          rows: [['二级结构', 'β 折叠（反平行）'],
          ['链方向', '链 A：N→C　链 B：C→N'],
          ['氢键', '与相邻链对应残基形成'],
          ['残基间距', '0.35 nm（伸展构象）']]
        };
        var mb = sphere(0x9fb4d0, 0.34);
        o.meshB.push(mb);
        mb.userData.info = ma.userData.info;

        if (i > 0) { o.bondsA.push(bond(0x8fa8c4, 0.16)); o.bondsB.push(bond(0x8fa8c4, 0.16)); }
        if (i % 2 === 0) o.hbonds.push(bond(0x4de2ff, 0.06, { opacity: 0.55 }));

        if (i === n - 1) {
          var ar1 = new THREE.Mesh(G.cone, mat(0xffcf6b, {}));
          ar1.scale.set(0.45, 0.9, 0.45); root.add(ar1); meshes.push(ar1);
          var ar2 = new THREE.Mesh(G.cone, mat(0xffcf6b, {}));
          ar2.scale.set(0.45, 0.9, 0.45); root.add(ar2); meshes.push(ar2);
          o.arrows.push(ar1, ar2);
        }
      }
      return o;
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

    /* ---------- 每帧位置更新 ---------- */
    var _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Vector3();
    var _hb1 = new THREE.Vector3(), _hb2 = new THREE.Vector3();

    function refresh() {
      var i;
      if (parts.kind === 'dna') {
        var n = parts.n, u = P.unwind;
        var openCount = u * n;
        for (i = 0; i < n; i++) {
          var p1 = parts.p1[i], p2 = parts.p2[i];
          // 从顶端开始解旋
          var prog = Math.max(0, Math.min(1, (openCount - (n - 1 - i)) ));
          var sep = prog * 3.2;
          _a.copy(p1); _b.copy(p2);
          if (sep > 0) {
            _a.x += _a.x / 4.4 * sep * 0.5; _a.z += _a.z / 4.4 * sep * 0.5;
            _b.x += _b.x / 4.4 * sep * 0.5; _b.z += _b.z / 4.4 * sep * 0.5;
            _a.y += sep * 0.35 * (i % 2 ? 1 : -1);
            _b.y -= sep * 0.35 * (i % 2 ? 1 : -1);
          }
          parts.backbone[i * 2].position.copy(_a);
          parts.backbone[i * 2 + 1].position.copy(_b);

          if (i > 0) {
            parts.dna[(i - 1) * 2].setEnds(parts.backbone[(i - 1) * 2].position, _a);
            parts.dna[(i - 1) * 2 + 1].setEnds(parts.backbone[(i - 1) * 2 + 1].position, _b);
          }

          _m.addVectors(_a, _b).multiplyScalar(0.5);
          var bA = parts.bases[i * 2], bB = parts.bases[i * 2 + 1];
          bA.position.copy(_a).lerp(_m, 0.34);
          bB.position.copy(_b).lerp(_m, 0.34);
          bA.visible = bB.visible = P.side;

          var hb = parts.hbonds[i];
          for (var k = 0; k < hb.length; k++) {
            var vis = P.hbond && prog < 0.05;
            hb[k].visible = vis;
            if (vis) {
              var off = (k - (hb.length - 1) / 2) * 0.32;
              _hb1.copy(bA.position); _hb1.y += off;
              _hb2.copy(bB.position); _hb2.y += off;
              hb[k].setEnds(_hb1, _hb2);
            }
          }
        }
      } else if (parts.kind === 'alpha') {
        var na = parts.n;
        for (i = 0; i < na; i++) {
          var p = parts.ca[i];
          parts.caMesh[i].position.copy(p);
          if (i > 0) parts.bonds[i - 1].setEnds(parts.ca[i - 1], p);
          if (i >= 4) {
            parts.hbonds[i - 4].visible = P.hbond;
            if (P.hbond) parts.hbonds[i - 4].setEnds(parts.ca[i - 4], p);
          }
          var s = parts.side[i];
          s.mesh.visible = P.side;
          parts.sideBonds[i].visible = P.side;
          if (P.side) {
            var sp = p.clone().addScaledVector(s.dir, 1.15);
            s.mesh.position.copy(sp);
            parts.sideBonds[i].setEnds(p, sp);
          }
        }
      } else {
        var nb = parts.n;
        for (i = 0; i < nb; i++) {
          var pa = parts.a[i], pb = parts.b[i];
          if (i > 0) {
            parts.bondsA[i - 1].setEnds(parts.a[i - 1], pa);
            parts.bondsB[i - 1].setEnds(parts.b[i - 1], pb);
          }
          if (i % 2 === 0) {
            var h = parts.hbonds[Math.floor(i / 2)];
            h.visible = P.hbond;
            if (P.hbond) h.setEnds(pa, pb);
          }
        }
        // 残基球位置（反平行：链 B 沿 −x 方向延伸）
        for (i = 0; i < nb; i++) {
          parts.meshA[i].position.copy(parts.a[i]);
          parts.meshB[i].position.copy(parts.b[i]);
        }
        if (parts.arrows.length === 2) {
          parts.arrows[0].position.copy(parts.a[nb - 1]);
          parts.arrows[0].quaternion.setFromUnitVectors(UP, new THREE.Vector3(1, 0, 0));
          parts.arrows[1].position.copy(parts.b[nb - 1]);
          parts.arrows[1].quaternion.setFromUnitVectors(UP, new THREE.Vector3(-1, 0, 0));
        }
      }
    }

    build();
    camera.position.set(0, 4, 26);
    camera.lookAt(0, 0, 0);

    var ray = new THREE.Raycaster();

    /* ---------- 讲解模式（HL.Tour 框架引擎） ---------- */
    var tour = HL.Tour(ctx);
    tour.load([
      {
        t: '一、双螺旋：生命的图纸',
        d: '这就是 B-DNA：两条骨架反向平行地缠绕成右手双螺旋，直径 2.0 nm、螺距 3.4 nm、每圈 10.5 个碱基对。把你一个细胞里的 DNA 接起来约长 2 米，而它装在直径仅 6 μm 的细胞核中。1953 年沃森与克里克提出该结构，关键的 X 射线衍射数据来自罗莎琳德·富兰克林。',
        exp: '把「单元数量」拉到 60，看一条更长的双螺旋。',
        cam: [[0, 6, 22], [0, 0, 0]],
        pulse: null
      },
      {
        t: '二、碱基互补配对',
        d: '彩色小球是骨架上的碱基：A 只与 T 配对（2 条氢键），G 只与 C 配对（3 条氢键，白色细棒条数更多、更牢固）。这种严格的互补性就是复制的钥匙——任何一条单链，都唯一确定了另一条链的全部信息。',
        exp: '点击任意碱基，看它的配对关系与氢键数。',
        cam: [[0, 2, 13], [0, 1, 0]],
        pulse: [0, 1, 0], r: 2
      },
      {
        t: '三、解旋：复制的开始',
        d: '细胞分裂前，DNA 从一端开始解开氢键、像拉链一样分开，两条单链各自作为模板合成新链——这叫半保留复制。滑杆「解旋程度」可以亲手拉开这条拉链：上面打开的部分氢键已经断开。',
        exp: '已为你拉开一半。退出讲解后拖动「解旋程度」滑杆可以合上或全开。',
        cam: [[6, 4, 14], [0, 2, 0]],
        pulse: [0, 3.5, 0], r: 2,
        apply: function () { P.unwind = 0.55; }
      },
      {
        t: '四、α 螺旋：蛋白质的弹簧',
        d: '换一类分子。α 螺旋是蛋白质最常见的二级结构：每 3.6 个残基绕一圈、螺距 0.54 nm，由第 i 个残基与第 i+4 个之间的氢键（青色细棒）像弹簧一样固定。头发的角蛋白、肌肉里的肌红蛋白，都是它撑起来的。',
        exp: '点击残基看它的氢键伙伴与侧链性质（疏水 / 极性）。',
        cam: [[0, 4, 12], [0, 0, 0]],
        pulse: [0, 0, 0], r: 1.8,
        apply: function () { P.unwind = 0; P.mode = 'alpha'; build(); }
      },
      {
        t: '五、β 折叠：蛋白质的片层',
        d: 'β 折叠把肽链拉成锯齿状并排成片，相邻两条链之间用氢键缝合（此处为反平行排列）。丝纤维与蛛丝的高强度正来自这种结构。两端金色箭头指示链的方向：一条 N→C，另一条 C→N，正好相反。',
        exp: '勾选 / 取消「显示侧链」，看侧链如何交替伸向片层上下两侧。',
        cam: [[0, 5, 13], [0, 0, 0]],
        pulse: [0, 0, 0], r: 2,
        apply: function () { P.mode = 'beta'; build(); }
      },
      {
        t: '六、中心法则',
        d: 'DNA 携带指令，蛋白质执行生命——从 DNA 到 RNA 再到蛋白质的「中心法则」，是这两类分子在所有细胞中的分工。四种字母（A T G C）写下 30 亿碱基对的人类基因组，编码约两万个基因，最终构成你身体里的每一个细胞。',
        exp: '按 R 复位视角，回看整个分子家族。',
        cam: [[0, 8, 24], [0, 0, 0]],
        pulse: null,
        apply: function () { P.mode = 'dna'; P.unwind = 0; build(); }
      }
    ]);

    return {
      update: function (dt, tt) {
        tour.update(dt, tt || 0, function (ddt) {
          if (P.spin) root.rotation.y += ddt * 0.28;
          refresh();
        });
      },

      setParam: function (key, v) {
        if (key === 'tour') { tour.toggle(); return; }
        P[key] = v;
        if (key === 'mode' || key === 'n') build();
      },

      onClick: function (ndc) {
        ray.setFromCamera({ x: ndc.x, y: ndc.y }, camera);
        var hit = ray.intersectObjects(meshes, false);
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
        G.sphere.dispose(); G.cyl.dispose(); G.cone.dispose();
        Object.keys(MATS).forEach(function (k) { MATS[k].dispose(); });
      }
    };
  }
});
