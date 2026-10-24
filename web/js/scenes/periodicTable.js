/**
 * 场景：元素周期表（3D）
 * 三种布局：经典周期表平面 / 原子序数螺旋 / 原子量地形
 * 点击元素卡片绕 Y 轴翻转到背面：展示原子量、电子排布（Madelung 规则 + 例外修正，
 * 覆盖全部 118 号元素）、熔沸点、常温物态、晶格与典型用途；同时联动玻璃样品舱
 * 与简化壳层模型。背面贴图懒生成（首次翻转才绘制 canvas），翻转动画用真实时钟
 * 推进，讲解模式冻结场景时依然流畅。
 */
HL.registerScene({
  id: 'periodic',
  name: '元素周期表',
  short: '118 种元素 · 点击卡片翻面看详情',
  icon: '⚛',
  fov: 48,
  minDistance: 4,
  maxDistance: 200,
  desc: '118 种元素按周期与族排布，颜色区分类别。切换布局可观察原子序数的连续性与相对原子质量的增长趋势。点击任一元素：卡片翻转到背面，展示该元素的详细信息——原子量、电子排布、熔沸点、常温物态、晶格与典型用途；同时联动右侧玻璃样品舱与原子壳层模型。',

  controls: [
    { type: 'button', key: 'tour', label: '📖 讲解模式' },
    { type: 'buttons', key: 'mode', label: '布局方式', value: 'table', options: [
      { label: '周期表', value: 'table' },
      { label: '螺旋', value: 'spiral' },
      { label: '质量地形', value: 'mass' }
    ] },
    { type: 'check', key: 'atom', label: '显示原子壳层模型', value: true },
    { type: 'check', key: 'flip', label: '点击卡片 → 翻面看详情', value: true },
    { type: 'check', key: 'chamber', label: '点击元素 → 玻璃样品舱', value: true },
    { type: 'range', key: 'logT', label: '样品舱温度 log₁₀(T / K)', min: 0.7, max: 3.8, step: 0.005, value: 2.474 },
    { type: 'check', key: 'refract', label: '玻璃折射（关闭可提速）', value: true },
    { type: 'check', key: 'autoRotate', label: '自动旋转', value: false },
    { type: 'legend', items: [
      ['碱金属', '#ff9a6b'], ['碱土金属', '#ffd76e'], ['过渡金属', '#6fc7ff'],
      ['后过渡金属', '#74dcd0'], ['类金属', '#f2e17c'], ['非金属', '#7fe3a0'],
      ['卤素', '#a8e05f'], ['稀有气体', '#b39dff'], ['镧系', '#ff9ec4'], ['锕系', '#ff7a9c']
    ] }
  ],

  create: function (ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera;
    scene.add(ctx.makeStars(1800, 400));

    var params = { mode: 'table', atom: true, autoRotate: false, chamber: true, flip: true, logT: 2.474, refract: true };

    /* ---------- 独立展示：只留玻尔模型（速览"直给"用） ----------
     * setParam('solo', true) 把右侧那只小模型搬到画面中心放大，并隐藏整张
     * 周期表、样品舱与提示条；同时每 3.4 s 换一个元素（H → C → O → Fe），
     * 壳层一个个填满，比任何展开过程都直观。离开时原样恢复。
     * 注意：必须声明在 buildAtom 之前——create 阶段就会调用 buildAtom，
     * 那时若 solo 还是 undefined，读 solo.on 会抛错，整个场景就装不起来了。 */
    var ATOM_SEQ = [1, 6, 8, 26];
    var solo = { on: false, t: 0, i: 0 };
    var hintWas = true;
    var blocks = [];
    var pickables = [];
    var hovered = null;
    var SHELL_MAX = [2, 8, 18, 32, 32, 18, 8];   // 简化壳层容量（示意）

    var geo = new THREE.BoxGeometry(1.12, 1.12, 0.22);
    var faceGeo = new THREE.PlaneGeometry(1.06, 1.06);

    /* ---------- 占位块（镧系 / 锕系位置） ---------- */
    function addPlaceholder(text, group, period) {
      var x = (group - 1) * 1.25 - 10.6;
      var y = 4.2 - (period - 1) * 1.35;
      var m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0x1b2438, transparent: true, opacity: 0.55
      }));
      m.position.set(x, y, 0);
      var lb = ctx.makeText(text, { size: 30, scale: 1.0, color: '#5d6b85' });
      lb.position.set(0, 0, 0.14);
      m.add(lb);
      scene.add(m);
      blocks.push({ mesh: m, target: new THREE.Vector3(x, y, 0), isPh: true });
    }
    addPlaceholder('57-71', 3, 6);
    addPlaceholder('89-103', 3, 7);

    /* ---------- 元素块 ---------- */
    HL.ELEMENTS.forEach(function (e, idx) {
      var Z = e[0], sym = e[1], zh = e[2], mass = e[3], cat = e[4], period = e[5], group = e[6];
      var color = new THREE.Color(HL.ELEMENT_CATEGORIES[cat] || '#8899aa');

      var mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color: color, roughness: 0.42, metalness: 0.35,
        emissive: color.clone().multiplyScalar(0.16)
      }));

      var face = new THREE.Mesh(faceGeo, new THREE.MeshBasicMaterial({
        map: makeFace(e), transparent: true
      }));
      face.position.z = 0.12;
      mesh.add(face);

      var pos = layout(params.mode, Z, group, period, mass, idx);
      mesh.position.copy(pos);
      mesh.userData.el = e;
      scene.add(mesh);
      pickables.push(mesh);
      var b = { mesh: mesh, target: pos.clone(), base: color.clone(), Z: Z, fp: 0, ft: 0, anim: null, back: null };
      mesh.userData.block = b;
      blocks.push(b);
    });

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    var d1 = new THREE.DirectionalLight(0xffffff, 1.0);
    d1.position.set(6, 12, 18);
    scene.add(d1);
    var d2 = new THREE.DirectionalLight(0x6fa8ff, 0.5);
    d2.position.set(-10, -6, -12);
    scene.add(d2);

    /* ---------- 原子壳层模型 ---------- */
    var atomRoot = new THREE.Group();
    atomRoot.position.set(13.4, -6.1, 0);
    atomRoot.scale.setScalar(0.52);
    scene.add(atomRoot);
    var atomParts = [];
    var atomHolders = [];      // 只放"电子环"的容器，速览里让电子沿环滑动

    /* 共享几何/材质：电子球最多 118 个，避免每次点击反复创建销毁 GPU 资源 */
    var GEO_E = new THREE.SphereGeometry(0.085, 12, 8);
    var MAT_E = new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x1d5d7a, roughness: 0.3 });
    var GEO_N = new THREE.SphereGeometry(0.42, 28, 20);
    var MAT_N = new THREE.MeshStandardMaterial({ color: 0xffcf6b, emissive: 0x8a5a00, roughness: 0.35 });
    var GEO_RING = new THREE.TorusGeometry(1, 0.02, 8, 90);
    var MAT_RING = new THREE.MeshBasicMaterial({ color: 0x4de2ff, transparent: true, opacity: 0.4 });

    /** 只移除不销毁共享资源；own=true 的（环、文字）才释放 */
    function clearAtom() {
      atomParts.forEach(function (o) {
        atomRoot.remove(o);
        if (o.userData && o.userData.own) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
        }
      });
      atomParts = [];
      atomHolders = [];
    }

    function buildAtom(Z) {
      clearAtom();

      var rest = Z, shells = [];
      for (var s = 0; s < SHELL_MAX.length && rest > 0; s++) {
        var n = Math.min(rest, SHELL_MAX[s]);
        shells.push(n); rest -= n;
      }

      var nucleus = new THREE.Mesh(GEO_N, MAT_N);
      // 速览里原子独占画面：核缩一圈，壳层才像示意图而不是"行星+卫星"
      nucleus.scale.setScalar(solo.on ? 0.34 : 1);
      atomRoot.add(nucleus);
      atomParts.push(nucleus);

      var core = new THREE.Sprite(ctx.glowSprite('rgba(255,190,90,0.7)'));
      core.scale.set(solo.on ? 0.95 : 3, solo.on ? 0.95 : 3, 1);
      atomRoot.add(core);
      atomParts.push(core);

      shells.forEach(function (count, li) {
        var R = 0.95 + li * 0.62;
        var ring = new THREE.Mesh(GEO_RING, MAT_RING);   // 单位环按半径缩放，避免每壳层新建几何
        ring.scale.set(R, R, R);
        if (solo.on) {
          // 独立展示：环面基本正对镜头（TorusGeometry 默认躺在 XY 平面），
          // 每层只给一点倾角，看起来才是"壳层"而不是一圈侧着的扁椭圆
          ring.rotation.set(-0.22 + li * 0.12, li * 0.22, 0);
        } else {
          ring.rotation.x = Math.PI / 2 + (li % 2 ? 0.5 : -0.35);
          ring.rotation.z = li * 0.6;
        }
        atomRoot.add(ring);
        atomParts.push(ring);

        var holder = new THREE.Group();
        holder.rotation.copy(ring.rotation);
        for (var k = 0; k < count; k++) {
          var a = (k / count) * Math.PI * 2;
          var eMesh = new THREE.Mesh(GEO_E, MAT_E);
          eMesh.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
          holder.add(eMesh);
        }
        atomRoot.add(holder);
        atomParts.push(holder);
        atomHolders.push(holder);
      });

      var el = HL.ELEMENTS[Z - 1];
      var tag = (el && el[0] === Z) ? (el[2] + ' ' + el[1]) : '';
      var maxR = 0.95 + Math.max(0, shells.length - 1) * 0.62;   // 最外层壳半径
      var lb = ctx.makeText((tag ? tag + '　' : '') + 'Z = ' + Z + '　壳层 ' + shells.join('·'), { size: 34, scale: 1.1, color: '#ffcf6b' });
      lb.position.set(0, solo.on ? -(maxR + 0.55) : -2.6, 0);
      lb.userData.own = true;
      atomRoot.add(lb);
      atomParts.push(lb);

      // 速览里不再挂"玻尔简化壳层示意"这行小字：底部字幕卡会把它切掉一半
      if (!solo.on) {
        var note = ctx.makeText('玻尔简化壳层示意', { size: 26, scale: 0.9, color: '#6f7f9a' });
        note.position.set(0, -3.1, 0);
        note.userData.own = true;
        atomRoot.add(note);
        atomParts.push(note);
      }
    }
    buildAtom(6);

    /* ---------- 玻璃样品舱：点击元素后展现 ---------- */
    var chamber = HL.GlassChamber(THREE);
    chamber.group.position.set(13.1, 1.3, 0);
    chamber.group.scale.setScalar(0.46);
    chamber.group.visible = false;
    scene.add(chamber.group);
    chamber.setRefract(params.refract, 'init');
    chamber.setTemperature(Math.pow(10, params.logT));

    var chHint = ctx.makeText('点击任意元素 → 玻璃样品舱采样', { size: 30, scale: 1.0, color: '#6f7f9a' });
    chHint.position.set(13.1, 1.3, 0);
    scene.add(chHint);

    // URL 直达：?chamber=1#periodic  直接以铁样品开局
    if (location.search.indexOf('chamber') >= 0) {
      chamber.setElement(HL.ELEMENTS[25]);
      chamber.setVisible(true);
      chHint.visible = false;
    }
    hintWas = chHint.visible;

    camera.position.set(1.9, 1.6, 30);
    camera.lookAt(1.9, 0, 0);
    ctx.controls.target.set(1.9, 0, 0);

    if (location.search.indexOf('debug=1') >= 0) {
      window.__PT = { chamber: chamber, camera: camera, THREE: THREE, atomRoot: atomRoot, cfg: electronCfg, blocks: blocks, controls: ctx.controls };
    }

    /* ---------- 交互 ---------- */
    var ray = new THREE.Raycaster();

    function onMove(e) {
      if (!params.mode || solo.on) return;      // 独立展示时整张表不可拾取
      var r = ctx.canvas.getBoundingClientRect();
      ray.setFromCamera({
        x: ((e.clientX - r.left) / r.width) * 2 - 1,
        y: -((e.clientY - r.top) / r.height) * 2 + 1
      }, camera);
      var hit = ray.intersectObjects(pickables, false);
      var obj = hit.length ? hit[0].object : null;
      if (obj !== hovered) {
        if (hovered) hovered.material.emissive.copy(hovered.userData.baseEmissive || new THREE.Color(0x000000));
        hovered = obj;
        if (hovered) hovered.material.emissive = new THREE.Color(0x2f6f8f);
      }
      ctx.canvas.style.cursor = obj ? 'pointer' : 'default';
    }
    ctx.canvas.addEventListener('pointermove', onMove);

    /* ---------- 卡片翻面：背面详情 ---------- */
    /** 背面贴图懒生成——只在第一次翻转时绘制，避免 118 张 canvas 的初始化开销 */
    function ensureBack(b) {
      if (b.back) return;
      var back = new THREE.Mesh(faceGeo, new THREE.MeshBasicMaterial({
        map: makeBack(b.mesh.userData.el), transparent: true
      }));
      back.rotation.y = Math.PI;          // 贴图朝 -Z；卡片整体翻 180° 后正对观察者
      back.position.z = -0.12;
      b.mesh.add(back);
      b.back = back;
    }

    var activeFlips = [];                          // 只遍历正在动画的卡片，避免每帧扫全部 120 张

    function flipTo(b, target) {
      if (b.ft === target && !b.anim) return;
      if (target === 1) ensureBack(b);
      b.ft = target;
      b.anim = { from: b.fp, to: target, t0: performance.now(), dur: 520 };
      if (activeFlips.indexOf(b) < 0) activeFlips.push(b);
    }

    function unflipAll(except) {
      blocks.forEach(function (b) { if (b !== except && b.ft === 1) flipTo(b, 0); });
    }

    /** 用真实时钟推进翻转动画——讲解模式冻结场景(dt=0)时依然流畅 */
    function tickFlips() {
      if (!activeFlips.length) return;
      var now = performance.now();
      for (var i = activeFlips.length - 1; i >= 0; i--) {
        var b = activeFlips[i];
        var t = (now - b.anim.t0) / b.anim.dur;
        if (t >= 1) {
          b.fp = b.anim.to; b.anim = null;
          b.mesh.rotation.y = b.fp * Math.PI;
          b.mesh.scale.setScalar(1);
          activeFlips.splice(i, 1);
        } else {
          var e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;   // easeInOutCubic
          b.fp = b.anim.from + (b.anim.to - b.anim.from) * e;
          b.mesh.rotation.y = b.fp * Math.PI;
          b.mesh.scale.setScalar(1 + 0.14 * Math.sin(b.fp * Math.PI));         // 翻转中轻微放大，反馈更明显
        }
      }
    }

    var api = {
      update: function (dt, time) {
        tickFlips();
        tour.update(dt, time || 0, function (ddt, dtime) {
          var k = 1 - Math.pow(0.001, ddt);           // 与帧率无关的插值系数
          blocks.forEach(function (b) {
            b.mesh.position.lerp(b.target, k);
          });
          var spin = solo.on ? 0.02 : (params.autoRotate ? 0.22 : 0.06);
          atomRoot.rotation.y += ddt * spin;
          atomRoot.rotation.x += ddt * spin * 0.25;
          atomRoot.visible = params.atom;

          // 独立展示：电子沿各自的壳层公转（环面正对镜头，只动电子不转整体）
          if (solo.on) {
            for (var hi = 0; hi < atomHolders.length; hi++) {
              atomHolders[hi].rotation.z += ddt * (0.45 + hi * 0.14) * (hi % 2 ? -1 : 1);
            }
          }

          // 独立展示：壳层一个元素一个元素地填满（H → C → O → Fe）
          if (solo.on) {
            solo.t += ddt;
            if (solo.t >= 3.4) {
              solo.t = 0;
              solo.i = (solo.i + 1) % ATOM_SEQ.length;
              buildAtom(ATOM_SEQ[solo.i]);
            }
          }

          ctx.controls.autoRotate = params.autoRotate && params.mode !== 'table' && !tour.active();

          chamber.update(ddt, dtime);
          if (chHint.visible) chHint.material.opacity = 0.55 + 0.35 * Math.sin((dtime || 0) * 2.2);
        });
      },

      setParam: function (key, v, user) {
        if (key === 'tour') { tour.toggle(); return; }
        if (key === 'hint') { chHint.visible = !!v; return; }
        if (key === 'solo') {
          solo.on = !!v;
          params.atom = true;
          solo.t = 0; solo.i = 0;
          atomRoot.position.set(solo.on ? 0 : 13.4, solo.on ? 0 : -6.1, 0);
          atomRoot.scale.setScalar(solo.on ? 1.15 : 0.52);
          atomRoot.rotation.set(0, 0, 0);
          blocks.forEach(function (b) { b.mesh.visible = !solo.on; });
          if (solo.on) {
            hintWas = chHint.visible;
            chamber.setVisible(false);
            chHint.visible = false;
            buildAtom(ATOM_SEQ[0]);
          } else {
            chHint.visible = hintWas;
            buildAtom(6);
          }
          return;
        }
        params[key] = v;
        if (key === 'logT') chamber.setTemperature(Math.pow(10, v));
        if (key === 'refract') chamber.setRefract(v, user ? 'user' : 'init');
        if (key === 'chamber' && !v) chamber.setVisible(false);
        if (key === 'flip' && !v) unflipAll();
        if (key === 'mode') {
          blocks.forEach(function (b, i) {
            if (b.isPh) {
              var g = b === blocks[0] ? 3 : 3;
              var pz = i === 0 ? 6 : 7;
              b.target.set((g - 1) * 1.25 - 10.6, v === 'mass' ? 0.5 : 4.2 - (pz - 1) * 1.35, v === 'mass' ? 0 : 0);
              if (v !== 'table') b.target.set(0, -60, 0);   // 非表格布局隐藏占位
              return;
            }
            var e = b.mesh.userData.el;
            b.target.copy(layout(v, e[0], e[6], e[5], e[3], i - 2));
          });
        }
      },

      onClick: function (ndc) {
        if (solo.on) return;                    // 独立展示时整张表不可点
        ray.setFromCamera({ x: ndc.x, y: ndc.y }, camera);
        var hit = ray.intersectObjects(pickables, false);
        if (!hit.length) { HL.tooltip.hide(); unflipAll(); return; }
        var mesh = hit[0].object;
        var e = mesh.userData.el;
        var Z = e[0], sym = e[1], zh = e[2], mass = e[3], cat = e[4], period = e[5], group = e[6];

        if (params.flip) {
          /* 翻面模式：背面即信息卡（名称/原子量/电子排布/熔沸点/晶格/用途） */
          var b = mesh.userData.block;
          var to = b.ft === 1 ? 0 : 1;
          if (to === 1) unflipAll(b);          // 同一时间只翻一张
          flipTo(b, to);
          HL.tooltip.hide();
        } else {
          /* 传统模式：浮层信息卡 */
          var name = zh || ('第 ' + Z + ' 号元素（人工合成）');
          var html = '<div class="tt-title">' + (zh ? zh + ' · ' : '') + sym + '　' + Z + '</div>';
          html += '<div class="tt-row">中文名：<b>' + name + '</b></div>';
          html += '<div class="tt-row">相对原子质量：<b>' + mass + '</b></div>';
          html += '<div class="tt-row">类别：<b style="color:' + (HL.ELEMENT_CATEGORIES[cat] || '#fff') + '">' + cat + '</b></div>';
          html += '<div class="tt-row">位置：<b>第 ' + period + ' 周期' + (group ? '　第 ' + group + ' 族' : '　镧/锕系') + '</b></div>';
          html += '<div class="tt-row">电子排布：<b>' + electronCfg(Z) + '</b></div>';
          HL.tooltip.show(html, ndc.clientX, ndc.clientY);
        }

        if (params.atom) buildAtom(Z);
        if (params.chamber) {
          chamber.setElement(e);
          chamber.setTemperature(Math.pow(10, params.logT));
          chamber.setVisible(true);
          chHint.visible = false;
        }
      },

      dispose: function () {
        tour.dispose();
        ctx.canvas.removeEventListener('pointermove', onMove);
        clearAtom();
        [GEO_E, MAT_E, GEO_N, MAT_N, GEO_RING, MAT_RING].forEach(function (r) { r.dispose(); });
        blocks.forEach(function (b) {              // 背面贴图显式回收（正面/方块由场景管理器统一回收）
          if (b.back) {
            if (b.back.material.map) b.back.material.map.dispose();
            b.back.material.dispose();
          }
        });
        chamber.dispose();
      }
    };

    /* ---------- 讲解模式（HL.Tour 框架引擎） ---------- */
    /** 讲解中场景被冻结（dt=0），布局切换需要瞬移到位 */
    function snapBlocks() {
      blocks.forEach(function (b) { b.mesh.position.copy(b.target); });
    }

    var tour = HL.Tour(ctx);
    tour.load([
      {
        t: '一、周期表的形状',
        d: '118 种元素排成 7 行 × 18 列：行是周期（电子层数），列是族（最外层电子数）。颜色标注类别——左下方大片是金属，右上角一小块是非金属，最右一列是不与任何人反应的稀有气体。这张表挂在全世界每一间化学教室的墙上。',
        exp: '左键拖动平移、右键旋转，从斜侧方看这面「墙」。',
        cam: [[6, 2, 32], [1.9, 0, 0]],
        pulse: null
      },
      {
        t: '二、门捷列夫的预言',
        d: '1869 年门捷列夫按原子量排列当时已知的 63 种元素，发现性质周期性重现，于是大胆留出空位、预言「类铝」「类硅」的原子量与密度——后来的镓与锗，性质几乎分毫不差。周期表从此不再是经验的堆砌，而是有预言力的定律。其真正原因要到 50 年后量子力学才揭晓：周期律的本质是电子的分层排布。',
        exp: '点击第 31、32 号（镓、锗）——卡片会翻到背面，对照门捷列夫的预言看它们的原子量与性质。',
        cam: [[4, 1, 22], [4, 0.2, 0]],
        pulse: null
      },
      {
        t: '三、螺旋布局：一条连续的线',
        d: '切到「螺旋」：原子序数 1 → 118 连成一条上升的螺旋线，碱金属与稀有气体恰好落在同一相位上。这提醒你周期表的本质不是一张表格，而是原子序数 Z 这条连续不断的线——元素一个不多、一个不少。',
        exp: '已为你切到螺旋布局。右键拖动沿螺旋走一圈。',
        cam: [[0, 4, 30], [0, 0, 0]],
        pulse: null,
        apply: function () { api.setParam('mode', 'spiral'); snapBlocks(); }
      },
      {
        t: '四、质量地形',
        d: '「质量地形」把相对原子质量变成高度：前 26 号平缓爬升，随后出现同位素造成的台阶；下方两条「重元素带」是镧系（57–71）与锕系（89–103）——它们塞不进主表，被拉出来单独放两行。整个宇宙中天然存在的元素到 94 号钚为止。',
        exp: '已为你切到质量地形。注意每一「楼层」的高度就是原子量。',
        cam: [[0, 9, 26], [0, -2, 0]],
        pulse: null,
        apply: function () { api.setParam('mode', 'mass'); snapBlocks(); }
      },
      {
        t: '五、玻璃样品舱：亲手触摸元素',
        d: '回到表格布局。点击任意元素，右侧升起一只玻璃样品舱：按该元素真实的熔点与沸点呈现气（粒子布朗飞散）、液（波动液面）、固（晶格球棍）三态。拖动温度滑杆，能看它在 3000 K 熔化、5000 K 沸腾。',
        exp: '已为你放入铁（Fe）样品，当前 300 K 呈固态。退出后拖「温度 log₁₀(T/K)」滑杆：越过 1811 K 看它熔化。',
        cam: [[6, 3, 16], [9, 1, 0]],
        pulse: [13.1, 1.3, 0], r: 2.8,
        apply: function () {
          api.setParam('mode', 'table'); snapBlocks();
          chamber.setElement(HL.ELEMENTS[25]);
          chamber.setTemperature(Math.pow(10, params.logT));
          chamber.setVisible(true);
          chHint.visible = false;
        }
      },
      {
        t: '六、壳层模型：周期表的骨架',
        d: '左下角是选中元素的壳层模型：核外电子按 2、8、18……分层填充，元素的化学性质几乎完全由最外层电子决定——这正是周期表「列」的含义。到 118 号 Og 为止，其中 95 号镅之后的元素全部只能在实验室中合成，存活不过几秒到几天。',
        exp: '退出讲解后点击不同主族的元素，对比它们的壳层数与最外层电子数。',
        cam: [[10, -4.5, 13], [13.4, -6.1, 0]],
        pulse: [13.4, -6.1, 0], r: 3,
        apply: function () { if (params.atom) buildAtom(6); }
      }
    ]);

    if (location.search.indexOf('debug=1') >= 0 && window.__PT) window.__PT.api = api;
    return api;
  }
});

/* ---------- 布局计算 ---------- */
function layout(mode, Z, group, period, mass, idx) {
  var x, y, z;
  if (mode === 'spiral') {
    var a = Z * 0.36;
    x = Math.cos(a) * 7.4;
    z = Math.sin(a) * 7.4;
    y = -8.4 + Z * 0.148;
  } else if (mode === 'mass') {
    x = ((idx % 18)) * 1.25 - 10.6;
    z = (Math.floor(idx / 18) - 3) * 1.55;
    y = mass / 26 - 2.2;
  } else {
    x = (group - 1) * 1.25 - 10.6;
    z = 0;
    if (group === 0) {                                   // 镧系 / 锕系单独两行
      var i = Z >= 89 ? Z - 89 : Z - 57;
      x = i * 1.25 - 8.5;
      y = Z >= 89 ? -7.0 : -5.6;
      return new THREE.Vector3(x, y, 0);
    }
    y = 4.2 - (period - 1) * 1.35;
  }
  return new THREE.Vector3(x, y, z);
}

/* ---------- 元素块正面贴图 ---------- */
function makeFace(e) {
  var Z = e[0], sym = e[1], zh = e[2], mass = e[3], cat = e[4];
  var cv = document.createElement('canvas');
  cv.width = cv.height = 160;
  var c = cv.getContext('2d');
  var col = HL.ELEMENT_CATEGORIES[cat] || '#8899aa';

  c.fillStyle = 'rgba(6,10,20,0.82)';
  c.fillRect(0, 0, 160, 160);
  c.strokeStyle = col;
  c.lineWidth = 4;
  c.strokeRect(2, 2, 156, 156);

  c.fillStyle = 'rgba(255,255,255,0.55)';
  c.font = '500 24px "Microsoft YaHei", sans-serif';
  c.textAlign = 'left';
  c.fillText(String(Z), 11, 32);

  c.fillStyle = col;
  c.font = '700 62px "Segoe UI", "Microsoft YaHei", sans-serif';
  c.textAlign = 'center';
  c.fillText(sym, 80, 92);

  c.fillStyle = 'rgba(230,240,255,0.9)';
  c.font = '400 24px "Microsoft YaHei", sans-serif';
  c.fillText(zh || '—', 80, 132);

  c.fillStyle = 'rgba(255,255,255,0.4)';
  c.font = '400 17px "Segoe UI", sans-serif';
  c.fillText(String(mass), 80, 152);

  var tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

/* ======================================================================
   电子排布生成器：Madelung 构造规则 + 已知例外修正，覆盖全部 118 号元素
   ====================================================================== */
var _CFG_ORDER = ['1s', '2s', '2p', '3s', '3p', '4s', '3d', '4p', '5s', '4d', '5p', '6s', '4f', '5d', '6p', '7s', '5f', '6d', '7p'];
var _CFG_CAP = { s: 2, p: 6, d: 10, f: 14 };
var _CFG_NOBLE = [[2, 'He'], [10, 'Ne'], [18, 'Ar'], [36, 'Kr'], [54, 'Xe'], [86, 'Rn']];
var _CFG_SUP = { '0': '\u2070', '1': '\u00b9', '2': '\u00b2', '3': '\u00b3', '4': '\u2074', '5': '\u2075', '6': '\u2076', '7': '\u2077', '8': '\u2078', '9': '\u2079' };
/* 构造规则之外的实验排布例外（Cr、Cu、Nb、Mo、Ru、Rh、Pd、Ag、La、Ce、Gd、Pt、Au、Ac、Th、Pa、U、Np、Cm、Lr） */
var _CFG_EXC = {
  24: { '3d': 5, '4s': 1 }, 29: { '3d': 10, '4s': 1 },
  41: { '4d': 4, '5s': 1 }, 42: { '4d': 5, '5s': 1 },
  44: { '4d': 7, '5s': 1 }, 45: { '4d': 8, '5s': 1 },
  46: { '4d': 10, '5s': 0 }, 47: { '4d': 10, '5s': 1 },
  57: { '4f': 0, '5d': 1 }, 58: { '4f': 1, '5d': 1 }, 64: { '4f': 7, '5d': 1 },
  78: { '5d': 9, '6s': 1 }, 79: { '5d': 10, '6s': 1 },
  89: { '5f': 0, '6d': 1 }, 90: { '5f': 0, '6d': 2 }, 91: { '5f': 2, '6d': 1 },
  92: { '5f': 3, '6d': 1 }, 93: { '5f': 4, '6d': 1 }, 96: { '5f': 7, '6d': 1 },
  103: { '5f': 14, '6d': 0, '7p': 1 }
};
var _CFG_CACHE = {};

function electronCfg(Z) {
  if (_CFG_CACHE[Z]) return _CFG_CACHE[Z];
  var i, o, n;
  var occ = {}, left = Z;
  for (i = 0; i < _CFG_ORDER.length && left > 0; i++) {
    o = _CFG_ORDER[i];
    n = Math.min(_CFG_CAP[o.charAt(1)], left);
    occ[o] = n; left -= n;
  }
  var exc = _CFG_EXC[Z];
  if (exc) for (var k in exc) occ[k] = exc[k];

  /* 稀有气体实心简写 */
  var core = null, coreZ = 0;
  for (i = 0; i < _CFG_NOBLE.length; i++) if (_CFG_NOBLE[i][0] < Z) { core = _CFG_NOBLE[i]; coreZ = _CFG_NOBLE[i][0]; }
  var coreOcc = {};
  if (core) {
    left = coreZ;
    for (i = 0; i < _CFG_ORDER.length && left > 0; i++) {
      o = _CFG_ORDER[i];
      n = Math.min(_CFG_CAP[o.charAt(1)], left);
      coreOcc[o] = n; left -= n;
    }
  }

  /* 价层轨道按主量子数 → 角量子数排序输出（如 3d⁶4s²） */
  var parts = [];
  for (i = 0; i < _CFG_ORDER.length; i++) {
    o = _CFG_ORDER[i];
    var v = (occ[o] || 0) - (coreOcc[o] || 0);
    if (v > 0) parts.push([o, v]);
  }
  parts.sort(function (a, b) {
    var na = +a[0].charAt(0), nb = +b[0].charAt(0);
    if (na !== nb) return na - nb;
    return 'spdf'.indexOf(a[0].charAt(1)) - 'spdf'.indexOf(b[0].charAt(1));
  });
  var s = (core ? '[' + core[1] + ']' : '') + parts.map(function (p) {
    return p[0] + String(p[1]).split('').map(function (d) { return _CFG_SUP[d]; }).join('');
  }).join('');
  _CFG_CACHE[Z] = s;
  return s;
}

/* ======================================================================
   元素块背面贴图：详细信息卡（与正面同风格：深底 + 类别色描边）
   ====================================================================== */
var BACK_LATTICE = { fcc: '面心立方', bcc: '体心立方', hcp: '密排六方', dia: '金刚石型' };

function makeBack(e) {
  var Z = e[0], sym = e[1], zh = e[2], mass = e[3], cat = e[4], period = e[5], group = e[6];
  var cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  var c = cv.getContext('2d');
  var col = HL.ELEMENT_CATEGORIES[cat] || '#8899aa';

  function hexA(hex, a) {
    return 'rgba(' + parseInt(hex.slice(1, 3), 16) + ',' + parseInt(hex.slice(3, 5), 16) + ',' +
      parseInt(hex.slice(5, 7), 16) + ',' + a + ')';
  }
  function mixLabel(y, label, value, vx, vcol) {
    c.font = '400 16px "Microsoft YaHei", sans-serif';
    c.fillStyle = 'rgba(150,168,192,0.95)';
    c.fillText(label, 18, y);
    c.font = '600 16px "Microsoft YaHei", "Segoe UI", sans-serif';
    c.fillStyle = vcol || 'rgba(235,244,255,0.92)';
    c.fillText(value, vx, y);
  }

  c.fillStyle = 'rgba(6,10,20,0.94)';
  c.fillRect(0, 0, 256, 256);
  c.strokeStyle = col;
  c.lineWidth = 5;
  c.strokeRect(2.5, 2.5, 251, 251);

  /* 顶部信息带：原子序数 + 类别 */
  c.fillStyle = hexA(col, 0.14);
  c.fillRect(5, 5, 246, 32);
  c.textBaseline = 'alphabetic';
  c.fillStyle = 'rgba(255,255,255,0.62)';
  c.font = '600 19px "Segoe UI", sans-serif';
  c.textAlign = 'left';
  c.fillText(String(Z), 14, 28);
  c.fillStyle = col;
  c.font = '500 16px "Microsoft YaHei", sans-serif';
  c.textAlign = 'right';
  c.fillText(cat, 242, 28);

  /* 名称 / 符号 / 原子量 */
  c.textAlign = 'center';
  c.fillStyle = 'rgba(235,244,255,0.96)';
  c.font = '700 38px "Microsoft YaHei", "Segoe UI", sans-serif';
  c.fillText(zh ? zh + '  ' + sym : sym, 128, 77);
  c.fillStyle = 'rgba(190,205,225,0.9)';
  c.font = '400 17px "Microsoft YaHei", sans-serif';
  c.fillText('原子量 ' + mass, 128, 103);

  /* 分隔线 */
  c.strokeStyle = hexA(col, 0.42);
  c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(18, 115); c.lineTo(238, 115); c.stroke();

  var d = GC_THERMO[Z - 1] || [];
  var pos = group ? '第' + period + '周期 · 第' + group + '族'
    : (Z >= 89 ? '锕系' : '镧系') + ' · 第' + period + '周期';

  c.textAlign = 'left';
  mixLabel(138, '位置', pos, 74);
  mixLabel(160, '排布', electronCfg(Z), 74, col);
  mixLabel(182, '熔沸点', (d[1] ? Math.round(d[1]) + ' K' : '—') + ' / ' + (d[2] ? Math.round(d[2]) + ' K' : '—'), 84);
  var stName = d[0] === 'g' ? '气态' : d[0] === 'l' ? '液态' : '固态';
  var latName = BACK_LATTICE[d[4]] || '';
  mixLabel(204, '性质', stName + (latName ? ' · ' + latName : ''), 74);

  /* 用途（最多两行，超出省略号截断） */
  if (d[3]) {
    c.font = '400 13px "Microsoft YaHei", sans-serif';
    c.fillStyle = hexA(col, 0.95);
    var chars = d[3].split('');
    var line = '', lines = [];
    for (var i = 0; i < chars.length && lines.length < 2; i++) {
      if (c.measureText(line + chars[i]).width > 220) { lines.push(line); line = chars[i]; }
      else line += chars[i];
    }
    if (lines.length < 2) lines.push(line);
    else if (i < chars.length) {
      var l2 = lines[1];
      while (l2 && c.measureText(l2 + '…').width > 220) l2 = l2.slice(0, -1);
      lines[1] = l2 + '…';
    }
    lines.slice(0, 2).forEach(function (ln, li) { c.fillText(ln, 18, 227 + li * 16); });
  }

  var tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

/* ==========================================================================
   玻璃样品舱模块（第一版周期表点击元素后展现）
   --------------------------------------------------------------------------
   用法：
     var ch = HL.GlassChamber(THREE);
     scene.add(ch.group);
     ch.group.position.set(14.6, 1.6, 0); ch.group.scale.setScalar(0.6);
     ch.setElement(e);          // e = HL.ELEMENTS[i]
     ch.setTemperature(298);    // K
     ch.setVisible(true);       // 带缩放动画
     ch.update(dt, time);
   ========================================================================== */
var GC_THERMO = [
    ['g', 13.99, 20.27, '火箭燃料·合成氨·石油加氢', 'hcp'],
    ['g', 0.95, 4.22, '超导磁体冷却·气球·检漏', 'hcp'],
    ['s', 453.65, 1615, '锂电池正极·陶瓷·情绪稳定剂', 'bcc'],
    ['s', 1560, 2742, 'X 射线窗口·航天构件·铍铜合金', 'hcp'],
    ['s', 2349, 4200, '玻璃纤维·硼砂洗涤剂·半导体掺杂', 'dia'],
    ['s', 3823, 4098, '有机分子骨架·石墨电极·碳纤维', 'dia'],
    ['g', 63.15, 77.36, '合成氨·液氮冷冻·保护气', 'dia'],
    ['g', 54.36, 90.20, '炼钢·医疗供氧·火箭氧化剂', 'dia'],
    ['g', 53.53, 85.03, '特氟龙·六氟化铀·含氟药物', 'dia'],
    ['g', 24.56, 27.07, '霓虹灯·激光·低温制冷剂', 'fcc'],
    ['s', 370.94, 1156, '钠灯·金属还原剂·食盐化工', 'bcc'],
    ['s', 923, 1363, '轻合金·闪光灯·抗酸药', 'hcp'],
    ['s', 933.47, 2792, '航空铝材·包装箔·输电导线', 'fcc'],
    ['s', 1687, 3538, '半导体芯片·光伏·有机硅', 'dia'],
    ['s', 317.3, 553.7, '磷肥·阻燃剂·火柴', 'dia'],
    ['s', 388.36, 717.8, '硫酸·橡胶硫化·杀菌剂', 'dia'],
    ['g', 171.6, 239.11, '消毒漂白·PVC·盐酸', 'dia'],
    ['g', 83.81, 87.30, '焊接保护气·冶金·灯泡填充', 'fcc'],
    ['s', 336.53, 1032, '钾肥·玻璃·钠钾合金冷却剂', 'bcc'],
    ['s', 1115, 1757, '水泥石灰·炼钢脱氧·补钙', 'fcc'],
    ['s', 1814, 3109, '铝钪合金·高强度灯·航空航天', 'hcp'],
    ['s', 1941, 3560, '钛合金·人工关节·钛白颜料', 'hcp'],
    ['s', 2183, 3680, '高强度钢添加剂·钒液流电池', 'bcc'],
    ['s', 2180, 2944, '不锈钢·镀铬·颜料', 'bcc'],
    ['s', 1519, 2334, '锰钢·干电池·铝合金', 'bcc'],
    ['s', 1811, 3134, '钢铁工业核心·电机铁芯·血红蛋白', 'bcc'],
    ['s', 1768, 3200, '硬质合金·锂电池正极·蓝色颜料', 'hcp'],
    ['s', 1728, 3186, '不锈钢·充电电池·电镀', 'fcc'],
    ['s', 1357.77, 2835, '电线电缆·电机绕组·换热器', 'fcc'],
    ['s', 692.68, 1180, '镀锌防腐·黄铜·锌空气电池', 'hcp'],
    ['s', 302.91, 2673, '氮化镓 LED 与快充·半导体', 'dia'],
    ['s', 1211.40, 3106, '红外光学·光纤掺杂·半导体', 'dia'],
    ['s', 1090, 887, '砷化镓半导体·农药·合金硬化', 'dia'],
    ['s', 494, 958, '硒鼓光敏材料·光伏·微量元素', 'dia'],
    ['l', 265.8, 332.0, '阻燃剂·感光胶片·医药中间体', 'dia'],
    ['g', 115.79, 119.93, '高功率灯·激光·绝缘气体', 'fcc'],
    ['s', 312.46, 961, '原子钟·光电管·焰火', 'bcc'],
    ['s', 1050, 1655, '焰火红色·夜光材料·铁氧体', 'fcc'],
    ['s', 1799, 3609, 'YAG 激光·白光 LED 荧光粉·超导', 'hcp'],
    ['s', 2128, 4682, '核燃料包壳·陶瓷刀具·立方氧化锆', 'hcp'],
    ['s', 2750, 5017, '超导磁体 NbTi·铌钢·电容器', 'bcc'],
    ['s', 2896, 4912, '高温合金·二硫化钼润滑·催化剂', 'bcc'],
    ['s', 2430, 4538, '核医学显像锝-99m', 'hcp'],
    ['s', 2607, 4423, '催化剂·电子触点·耐磨涂层', 'hcp'],
    ['s', 2237, 3968, '汽车三元催化·铂铑热电偶', 'fcc'],
    ['s', 1828.05, 3236, '催化转换器·储氢·电子元件', 'fcc'],
    ['s', 1234.93, 2435, '导电银浆·感光材料·抗菌', 'fcc'],
    ['s', 594.22, 1040, '镍镉电池·颜料·反应堆控制棒', 'hcp'],
    ['s', 429.75, 2345, 'ITO 透明导电膜·低熔合金', 'fcc'],
    ['s', 505.08, 2875, '焊料·马口铁·青铜', 'dia'],
    ['s', 903.78, 1860, '阻燃协效剂·铅酸电池·半导体掺杂', 'dia'],
    ['s', 722.66, 1261, '碲化镉薄膜电池·热电材料', 'hcp'],
    ['s', 386.85, 457.4, '碘伏消毒·食盐加碘·造影剂', 'dia'],
    ['g', 161.4, 165.03, '闪光灯·麻醉剂·离子推进器', 'fcc'],
    ['s', 301.59, 944, '原子钟基准·光电阴极·钻井液', 'bcc'],
    ['s', 1000, 2170, '钻井加重剂·钡餐造影·焰火绿', 'bcc'],
    ['s', 1193, 3737, '镍氢电池·石油裂化催化·光学玻璃', 'hcp'],
    ['s', 1068, 3716, '抛光粉·汽车尾气催化·打火石', 'fcc'],
    ['s', 1208, 3793, '强磁体·电焊护目镜·玻璃着色', 'hcp'],
    ['s', 1297, 3347, '钕铁硼强磁·激光·玻璃着色', 'hcp'],
    ['s', 1315, 3273, '核电池·测厚仪·发光涂料', 'hcp'],
    ['s', 1345, 2173, '钐钴磁体·中子吸收·抗癌药', 'hcp'],
    ['s', 1099, 1802, '红色荧光粉·防伪油墨', 'bcc'],
    ['s', 1585, 3546, 'MRI 造影剂·磁制冷·中子吸收', 'hcp'],
    ['s', 1629, 3503, '绿色荧光粉·磁光存储·传感器', 'hcp'],
    ['s', 1680, 2840, '高性能磁体添加剂·磁致伸缩', 'hcp'],
    ['s', 1734, 2993, '钬激光碎石·光纤·磁体', 'hcp'],
    ['s', 1802, 3141, '光纤放大器 EDFA·激光·粉色玻璃', 'hcp'],
    ['s', 1818, 2223, '便携 X 射线源·激光·高温超导', 'hcp'],
    ['s', 1097, 1469, '光纤激光·原子钟·应力传感', 'fcc'],
    ['s', 1925, 3675, 'PET 探测器 LSO·催化裂化', 'hcp'],
    ['s', 2506, 4876, '核控制棒·高 k 栅介质·等离子切割', 'hcp'],
    ['s', 3290, 5731, '电容器·外科植入物·硬质合金', 'bcc'],
    ['s', 3695, 6203, '灯丝·硬质合金·穿甲弹·电极', 'bcc'],
    ['s', 3459, 5869, '喷气发动机叶片超合金·催化剂', 'hcp'],
    ['s', 3306, 5285, '耐磨触点·电镜染色·超硬合金', 'hcp'],
    ['s', 2719, 4701, '火花塞电极·坩埚·电解阳极', 'fcc'],
    ['s', 2041.4, 4098, '三元催化·顺铂抗癌药·坩埚电极', 'fcc'],
    ['s', 1337.33, 3129, '货币储备·键合引线·航天镀层', 'fcc'],
    ['l', 234.32, 629.88, '温度计·荧光灯·氯碱电解（已限用）', 'fcc'],
    ['s', 577, 1746, '红外探测器·心脏显像（已限用）', 'hcp'],
    ['s', 600.61, 2022, '铅酸电池·辐射屏蔽·焊料（受限）', 'fcc'],
    ['s', 544.7, 1837, '无铅焊料·胃药·易熔合金', 'hcp'],
    ['s', 527, 1235, '静电消除·同位素热源（放射性）', 'fcc'],
    ['s', 575, 610, '靶向 α 治疗研究（放射性）', 'fcc'],
    ['g', 202, 211.5, '放射治疗史·室内氡监测对象', 'fcc'],
    ['s', 300, 950, '核结构研究（极不稳定）', 'bcc'],
    ['s', 973, 2010, '历史放疗·夜光涂料（已弃用）', 'bcc'],
    ['s', 1323, 3471, '中子源·癌症治疗研究', 'fcc'],
    ['s', 2115, 5061, '钍基核燃料·钨极焊接·光学透镜', 'fcc'],
    ['s', 1841, 4300, '地质年代测定镤-231', 'fcc'],
    ['s', 1405.3, 4404, '核电燃料·舰艇核动力·贫铀装甲', 'bcc'],
    ['s', 917, 4273, '中子探测·核燃料循环研究', 'bcc'],
    ['s', 912.5, 3501, '核武器与 MOX 燃料·同位素电源', 'fcc'],
    ['s', 1449, 2880, '烟雾探测器镅-241·测厚仪', 'hcp'],
    ['s', 1613, 3383, '火星车 α/X 射线谱仪电源', 'hcp'],
    ['s', 1259, 2900, '超铀元素化学研究', 'fcc'],
    ['s', 1173, 1743, '中子源锎-252·探矿·反应堆启动', 'fcc'],
    ['s', 1133, 1269, '重元素化学研究', 'fcc'],
    ['s', 1800, null, '重元素化学研究', 'fcc'],
    ['s', 1100, null, '以门捷列夫命名的合成元素', 'fcc'],
    ['s', 1100, null, '以诺贝尔命名的合成元素', 'fcc'],
    ['s', 1900, null, '以回旋加速器命名的合成元素', 'fcc'],
    ['s', 2400, 5800, '超重元素研究（预测值）', 'fcc'],
    ['s', null, null, '超重元素研究（预测值）', 'fcc'],
    ['s', null, null, '超重元素研究（预测值）', 'fcc'],
    ['s', null, null, '超重元素研究（预测值）', 'fcc'],
    ['s', null, null, '超重元素研究（预测值）', 'fcc'],
    ['s', null, null, '超重元素研究（预测值）', 'fcc'],
    ['s', null, null, '超重元素研究（预测值）', 'fcc'],
    ['s', null, null, '超重元素研究（预测值）', 'fcc'],
    ['l', 283, 340, '超重元素研究（预测值）', 'fcc'],
    ['s', 700, 1430, '超重元素研究（预测值）', 'fcc'],
    ['s', 200, 380, '超重元素研究（预测值）', 'fcc'],
    ['s', 700, 1400, '超重元素研究（预测值）', 'fcc'],
    ['s', 709, 1085, '超重元素研究（预测值）', 'fcc'],
    ['s', 723, 883, '超重元素研究（预测值）', 'fcc'],
    ['g', 258, 263, '超重元素研究（预测值）', 'fcc']
  ];

(function () {
  'use strict';

  var TH = GC_THERMO;                     // 118 × [常温物态, 熔点K, 沸点K, 用途, 晶格]

  var LATTICE = {
    fcc: { name: '面心立方 FCC', nn: 0.72, basis: [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]] },
    bcc: { name: '体心立方 BCC', nn: 0.92, basis: [[0, 0, 0], [0.5, 0.5, 0.5]] },
    hcp: { name: '密排六方 HCP', nn: 1.02, basis: [[0, 0, 0], [0.5, 0.5, 0], [1 / 3, 2 / 3, 0.5], [5 / 6, 5 / 6, 0.5]] },
    dia: {
      name: '金刚石结构', nn: 0.47,
      basis: [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5],
      [0.25, 0.25, 0.25], [0.75, 0.75, 0.25], [0.75, 0.25, 0.75], [0.25, 0.75, 0.75]]
    }
  };

  var PHASE = {
    solid: { hex: 0x9fd8ff, css: '#9fd8ff', label: '固态 SOLID' },
    liquid: { hex: 0xff9a5c, css: '#ff9a5c', label: '液态 LIQUID' },
    gas: { hex: 0xa8f0ff, css: '#a8f0ff', label: '气态 GAS' }
  };

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function ss(e0, e1, x) { var t = (x - e0) / (e1 - e0); t = t < 0 ? 0 : (t > 1 ? 1 : t); return t * t * (3 - 2 * t); }

  /* ---------- 通用小工具 ---------- */
  function dotTexture(THREE) {
    var cv = document.createElement('canvas'); cv.width = cv.height = 64;
    var c = cv.getContext('2d');
    var g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  }

  function Segments(THREE, parent, max, opt) {
    opt = opt || {};
    var pos = new Float32Array(max * 6), col = new Float32Array(max * 6);
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var mat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true,
      opacity: opt.opacity === undefined ? 0.8 : opt.opacity,
      depthWrite: false,
      blending: opt.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending
    });
    var obj = new THREE.LineSegments(geo, mat);
    obj.frustumCulled = false; parent.add(obj);
    var _c = new THREE.Color();
    return {
      obj: obj,
      set: function (i, x1, y1, z1, x2, y2, z2, cA, cB) {
        var o = i * 6;
        pos[o] = x1; pos[o + 1] = y1; pos[o + 2] = z1;
        pos[o + 3] = x2; pos[o + 4] = y2; pos[o + 5] = z2;
        _c.setHex(cA); col[o] = _c.r; col[o + 1] = _c.g; col[o + 2] = _c.b;
        _c.setHex(cB === undefined ? cA : cB);
        col[o + 3] = _c.r; col[o + 4] = _c.g; col[o + 5] = _c.b;
      },
      count: function (n) { geo.setDrawRange(0, n * 2); },
      flush: function () { geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; }
    };
  }

  function Cloud(THREE, parent, n, size, tex, opt) {
    opt = opt || {};
    var pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var mat = new THREE.PointsMaterial({
      size: size, map: tex, vertexColors: true, transparent: true,
      opacity: opt.opacity === undefined ? 0.9 : opt.opacity,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
    });
    var obj = new THREE.Points(geo, mat);
    obj.frustumCulled = false; parent.add(obj);
    var _c = new THREE.Color();
    return {
      obj: obj, mat: mat,
      set: function (i, x, y, z, c) {
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
        _c.setHex(c); col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
      },
      flush: function () { geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; }
    };
  }

  function wireOf(THREE, geo, color, opacity) {
    return new THREE.LineSegments(
      new THREE.WireframeGeometry(geo),
      new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opacity, depthWrite: false })
    );
  }

  /* 可动态改文字的霓虹标签 */
  function Label(THREE, parent, scale, opt) {
    opt = opt || {};
    var W = 900, H = 180;
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    var tex = new THREE.CanvasTexture(cv); tex.minFilter = THREE.LinearFilter;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: opt.opacity === undefined ? 1 : opt.opacity
    }));
    sp.scale.set(4.6 * scale, 0.92 * scale, 1);
    sp.renderOrder = 998; parent.add(sp);
    return {
      sprite: sp,
      set: function (text, color, size) {
        c.clearRect(0, 0, W, H);
        c.font = '700 ' + (size || 92) + 'px "Microsoft YaHei","Segoe UI",sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.shadowColor = color; c.shadowBlur = 30;
        c.fillStyle = color; c.fillText(text, W / 2, H / 2);
        c.shadowBlur = 8; c.globalAlpha = 0.6; c.fillStyle = '#ffffff';
        c.fillText(text, W / 2, H / 2); c.globalAlpha = 1;
        tex.needsUpdate = true;
      }
    };
  }

  /* ======================================================================
     主体
     ====================================================================== */
  HL.GlassChamber = function (THREE) {
    var S = 7.4, half = S / 2, R_IN = half - 0.45;

    var root = new THREE.Group();
    var cell = new THREE.Group(); root.add(cell);

    var dotTex = dotTexture(THREE);

    /* ---------- 玻璃舱体 ---------- */
    var boxGeo = new THREE.BoxGeometry(S, S, S);
    var matRefract = new THREE.MeshPhysicalMaterial({
      color: 0xd6f0ff, metalness: 0, roughness: 0.05,
      transmission: 0.95, thickness: 2.2, ior: 1.48,
      transparent: true, side: THREE.DoubleSide,
      clearcoat: 1, clearcoatRoughness: 0.04, depthWrite: false
    });
    var matPlain = new THREE.MeshBasicMaterial({
      color: 0x8fd8ff, transparent: true, opacity: 0.07,
      side: THREE.DoubleSide, depthWrite: false
    });
    var shell = new THREE.Mesh(boxGeo, matRefract);
    shell.renderOrder = 20; cell.add(shell);

    var edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(boxGeo),
      new THREE.LineBasicMaterial({ color: 0x6fe3ff, transparent: true, opacity: 0.9 })
    );
    edges.renderOrder = 30; cell.add(edges);

    var corner = Segments(THREE, cell, 24, { opacity: 0.95 });
    (function () {
      var k = 0, L = 0.66;
      for (var sx = -1; sx <= 1; sx += 2)
        for (var sy = -1; sy <= 1; sy += 2)
          for (var sz = -1; sz <= 1; sz += 2) {
            var x = sx * half, y = sy * half, z = sz * half;
            corner.set(k++, x, y, z, x - sx * L, y, z, 0xeaf2ff, 0x6fe3ff);
            corner.set(k++, x, y, z, x, y - sy * L, z, 0xeaf2ff, 0x6fe3ff);
            corner.set(k++, x, y, z, x, y, z - sz * L, 0xeaf2ff, 0x6fe3ff);
          }
      corner.count(k); corner.flush();
    })();

    /* 底座 */
    var base = new THREE.Group(); base.position.y = -half - 0.62; cell.add(base);
    base.add(new THREE.Mesh(
      new THREE.CylinderGeometry(3.5, 3.9, 0.42, 64),
      new THREE.MeshBasicMaterial({ color: 0x0c1826, transparent: true, opacity: 0.9 })
    ));
    base.add(wireOf(THREE, new THREE.CylinderGeometry(3.5, 3.9, 0.42, 64), 0x6fe3ff, 0.45));
    var baseRing = new THREE.Mesh(
      new THREE.TorusGeometry(3.72, 0.05, 8, 96),
      new THREE.MeshBasicMaterial({ color: 0x6fe3ff, transparent: true, opacity: 0.9 })
    );
    baseRing.rotation.x = Math.PI / 2; baseRing.position.y = 0.24; base.add(baseRing);

    /* 体积光锥 */
    var volMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x8fe6ff) } },
      vertexShader: [
        'varying vec2 vUv; varying vec3 vN; varying vec3 vV;',
        'void main(){',
        '  vUv = uv;',
        '  vec4 wp = modelMatrix * vec4(position,1.0);',
        '  vN = normalize(mat3(modelMatrix) * normal);',
        '  vV = normalize(cameraPosition - wp.xyz);',
        '  gl_Position = projectionMatrix * viewMatrix * wp;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform float uTime; uniform vec3 uColor;',
        'varying vec2 vUv; varying vec3 vN; varying vec3 vV;',
        'void main(){',
        '  float top = smoothstep(0.0, 0.55, vUv.y);',
        '  float bot = 1.0 - smoothstep(0.55, 1.0, vUv.y) * 0.72;',
        '  float edge = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);',
        '  float band = 0.78 + 0.22 * sin(vUv.x * 34.0 + uTime * 0.6);',
        '  float a = (0.10 + edge * 0.30) * top * bot * band;',
        '  gl_FragColor = vec4(uColor, a);',
        '}'
      ].join('\n')
    });
    var vol = new THREE.Mesh(new THREE.ConeGeometry(3.3, 9.0, 48, 1, true), volMat);
    vol.position.y = half + 4.4; vol.renderOrder = 8; cell.add(vol);

    var lampRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.35, 0.07, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xcaf2ff, transparent: true, opacity: 0.9 })
    );
    lampRing.rotation.x = Math.PI / 2; lampRing.position.y = half + 8.8; cell.add(lampRing);

    /* ---------- 边缘标注 ---------- */
    var lbSym = Label(THREE, cell, 1.5, {});
    lbSym.sprite.position.set(0, half + 1.5, 0);
    var lbName = Label(THREE, cell, 0.86, {});
    lbName.sprite.position.set(0, -half - 1.25, 0);
    var lbInfo = Label(THREE, cell, 0.6, {});
    lbInfo.sprite.position.set(0, -half - 2.25, 0);
    /* 自动降级提示（默认隐藏） */
    var lbPerf = Label(THREE, cell, 0.52, {});
    lbPerf.sprite.position.set(0, -half - 3.15, 0);
    lbPerf.set('\u6027\u80fd\u4f18\u5148\uff1a\u5df2\u81ea\u52a8\u5173\u95ed\u73bb\u7483\u6298\u5c04', '#ffd76e', 60);
    lbPerf.sprite.visible = false;

    /* ==================================================================
       内部样品：气 / 液 / 固
       ================================================================== */
    var sample = new THREE.Group(); cell.add(sample);

    /* --- 气态 --- */
    var Gas = new THREE.Group(); sample.add(Gas);
    var NG = 420;
    var gas = Cloud(THREE, Gas, NG, 0.22, dotTex, { opacity: 0.95 });
    var gx = new Float32Array(NG), gy = new Float32Array(NG), gz = new Float32Array(NG);
    var gvx = new Float32Array(NG), gvy = new Float32Array(NG), gvz = new Float32Array(NG);
    for (var i = 0; i < NG; i++) {
      gx[i] = (Math.random() * 2 - 1) * R_IN; gy[i] = (Math.random() * 2 - 1) * R_IN; gz[i] = (Math.random() * 2 - 1) * R_IN;
      gvx[i] = Math.random() * 2 - 1; gvy[i] = Math.random() * 2 - 1; gvz[i] = Math.random() * 2 - 1;
    }

    /* --- 液态 --- */
    var Liq = new THREE.Group(); sample.add(Liq);
    var liqMat = new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, depthWrite: false,
      uniforms: {
        uTime: { value: 0 }, uAmp: { value: 0.16 },
        uA: { value: new THREE.Color(0x4a1a10) },
        uB: { value: new THREE.Color(0xd0762f) },
        uGlow: { value: new THREE.Color(0xffb066) }
      },
      vertexShader: [
        'uniform float uTime; uniform float uAmp;',
        'varying float vH; varying vec2 vUv;',
        'void main(){',
        '  vUv = uv; vec3 p = position;',
        '  float w = sin(p.x*2.1 + uTime*1.7)*0.5 + sin(p.y*2.7 - uTime*1.25)*0.4',
        '           + sin((p.x+p.y)*1.35 + uTime*2.05)*0.32 + sin((p.x-p.y)*3.1 - uTime*2.6)*0.18;',
        '  p.z += w * uAmp; vH = w;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uA; uniform vec3 uB; uniform vec3 uGlow;',
        'varying float vH; varying vec2 vUv;',
        'void main(){',
        '  float k = clamp(vH*0.5+0.5, 0.0, 1.0);',
        '  vec3 col = mix(uA, uB, k);',
        '  col += uGlow * pow(k, 9.0) * 0.9;',
        '  float rim = smoothstep(0.40, 0.50, abs(vUv.x-0.5));',
        '  col = mix(col, uGlow*0.55, rim*0.45);',
        '  gl_FragColor = vec4(col, 0.94);',
        '}'
      ].join('\n')
    });
    var liqTop = new THREE.Mesh(new THREE.PlaneGeometry(R_IN * 2, R_IN * 2, 72, 72), liqMat);
    liqTop.rotation.x = -Math.PI / 2; liqTop.renderOrder = 12; Liq.add(liqTop);
    var liqH = R_IN * 0.88;
    var liqBodyGeo = new THREE.BoxGeometry(R_IN * 2, liqH, R_IN * 2);
    var liqBody = new THREE.Mesh(liqBodyGeo, new THREE.MeshBasicMaterial({
      color: 0x8c3a18, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide
    }));
    liqBody.renderOrder = 11; Liq.add(liqBody);
    var liqEdge = wireOf(THREE, liqBodyGeo, 0xff9a5c, 0.3); Liq.add(liqEdge);
    liqTop.position.y = -R_IN + liqH;
    liqBody.position.y = -R_IN + liqH / 2;
    liqEdge.position.copy(liqBody.position);

    var NB = 60;
    var bub = Cloud(THREE, Liq, NB, 0.15, dotTex, { opacity: 0.8 });
    var bx = new Float32Array(NB), by = new Float32Array(NB), bz = new Float32Array(NB), bs = new Float32Array(NB);
    for (i = 0; i < NB; i++) {
      bx[i] = (Math.random() * 2 - 1) * R_IN * 0.9;
      bz[i] = (Math.random() * 2 - 1) * R_IN * 0.9;
      by[i] = -R_IN + Math.random() * liqH;
      bs[i] = 0.4 + Math.random() * 0.9;
    }

    /* --- 固态 --- */
    var Sol = new THREE.Group(); sample.add(Sol);
    var MAXAT = 72, MAXBOND = 320;
    var atomMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff });
    var atoms = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 18, 12), atomMat, MAXAT);
    atoms.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    atoms.frustumCulled = false; atoms.count = 0; Sol.add(atoms);
    var haloMat = new THREE.MeshBasicMaterial({
      color: 0x9fd8ff, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    var halos = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), haloMat, MAXAT);
    halos.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    halos.frustumCulled = false; halos.count = 0; halos.renderOrder = 4; Sol.add(halos);
    var bonds = Segments(THREE, Sol, MAXBOND, { opacity: 0.8 });
    var cellBox = wireOf(THREE, new THREE.BoxGeometry(1, 1, 1), 0x9fb3c8, 0.3);
    Sol.add(cellBox);

    var latPts = [], latBonds = [], latA = 1;
    var _m4 = new THREE.Matrix4(), _v3 = new THREE.Vector3(), _s3 = new THREE.Vector3();
    var _q0 = new THREE.Quaternion();

    function buildLattice(kind) {
      var L = LATTICE[kind] || LATTICE.fcc;
      var N = 2;
      var a = (R_IN * 1.74) / N;
      var pts = [];
      for (var i = 0; i < N; i++)
        for (var j = 0; j < N; j++)
          for (var k = 0; k < N; k++)
            for (var b = 0; b < L.basis.length; b++) {
              if (kind === 'hcp' && b >= 2 && k === N - 1) continue;
              var bs = L.basis[b];
              pts.push([(i + bs[0] - N / 2) * a, (j + bs[1] - N / 2) * a, (k + bs[2] - N / 2) * a]);
            }
      var uniq = [];
      for (i = 0; i < pts.length; i++) {
        var dup = false;
        for (j = 0; j < uniq.length; j++) {
          var dx = pts[i][0] - uniq[j][0], dy = pts[i][1] - uniq[j][1], dz = pts[i][2] - uniq[j][2];
          if (dx * dx + dy * dy + dz * dz < a * a * 0.01) { dup = true; break; }
        }
        if (!dup && uniq.length < MAXAT) uniq.push(pts[i]);
      }
      var bd = [];
      var lim = a * L.nn * 1.06;
      for (i = 0; i < uniq.length && bd.length < MAXBOND; i++)
        for (j = i + 1; j < uniq.length && bd.length < MAXBOND; j++) {
          var d2 = 0, t;
          for (k = 0; k < 3; k++) { t = uniq[i][k] - uniq[j][k]; d2 += t * t; }
          if (d2 < lim * lim) bd.push([i, j]);
        }
      latPts = uniq; latBonds = bd; latA = a;
      cellBox.scale.set(a * N, a * N, a * N);
      cellBox.visible = true;
    }

    /* ==================================================================
       状态
       ================================================================== */
    var st = {
      el: null, Tk: 298, vis: false, k: 0,
      wS: 1, wL: 0, wG: 0, lat: 'fcc', Tm: 1000, Tb: 5000, color: 0x6fe3ff,
      refract: true, forceRefract: false,          // forceRefract：用户明确要求折射，不再自动降级
      perfAcc: 0, perfN: 0, autoOff: 0             // autoOff：自动降级后的提示剩余时间
    };

    function setElement(e) {
      st.el = e;
      var Z = e[0];
      var d = TH[Z - 1] || ['s', 1000, 5000, '', 'fcc'];
      st.Tm = d[1] || 1000; st.Tb = d[2] || 1e6;
      var lat = d[4] || 'fcc';
      if (lat !== st.lat) { st.lat = lat; buildLattice(lat); }
      st.color = parseInt((HL.ELEMENT_CATEGORIES[e[4]] || '#6fe3ff').slice(1), 16);
      lbSym.set(e[1], '#' + st.color.toString(16).padStart(6, '0'), 104);
      lbName.set(e[2] || ('第 ' + Z + ' 号元素'), '#d9d3c7', 84);
      atomMat.color.setHex(st.color);
      haloMat.color.setHex(st.color);
      updateTags();
    }

    function updateTags() {
      var ph = st.wS >= Math.max(st.wL, st.wG) ? 'solid' : (st.wG >= st.wL ? 'gas' : 'liquid');
      lbInfo.set(PHASE[ph].label + '   ·   ' + Math.round(st.Tk) + ' K', PHASE[ph].css, 76);
    }

    function setTemperature(Tk) { st.Tk = Tk; updateTags(); }

    /* 折射（transmission）每帧要额外渲染一遍场景，弱设备上会明显掉帧。
       帧率低于 24fps 时自动降级为轻量玻璃，用户手动开启过则尊重用户选择。 */
    /* mode: 'init' 初始化 | 'user' 用户手动 | 'auto' 帧率守卫自动降级 */
    function setRefract(on, mode) {
      st.refract = on;
      shell.material = on ? matRefract : matPlain;
      if (mode === 'user') st.forceRefract = on;
      if (mode === 'auto' && !on) st.autoOff = 4.5;
    }

    function guardPerf(dt) {
      if (!st.refract || !st.vis) { st.perfAcc = 0; st.perfN = 0; return; }
      st.perfAcc += dt; st.perfN++;
      if (st.perfAcc < 0.55) return;                // 按时间窗口判定：弱设备上 0.6s 内即可降级
      var fps = st.perfN / Math.max(1e-6, st.perfAcc);
      st.perfAcc = 0; st.perfN = 0;
      // 用户手动开过折射时阈值放宽（尊重选择），但极端掉帧仍兜底降级
      if (fps < (st.forceRefract ? 12 : 24)) setRefract(false, 'auto');
    }

    function setVisible(v) { st.vis = v; if (v) root.visible = true; }

    /* ---------- 每帧 ---------- */
    function update(dt, time) {
      /* 出现/收起动画 */
      var target = st.vis ? 1 : 0;
      st.k += (target - st.k) * Math.min(1, dt * 6);
      if (st.k < 0.005 && !st.vis) { root.visible = false; return; }
      root.visible = true;
      var s = 0.55 + 0.45 * st.k;
      cell.scale.setScalar(s);

      guardPerf(dt);                     // 帧率守卫：折射开销过大时自动降级
      if (st.autoOff > 0) {              // 降级后短暂提示，说明发生了什么
        st.autoOff -= dt;
        lbPerf.sprite.visible = st.autoOff > 0;
      } else lbPerf.sprite.visible = false;

      volMat.uniforms.uTime.value = time;
      liqMat.uniforms.uTime.value = time;

      /* 相变权重 */
      var wS = 1 - ss(st.Tm * 0.97, st.Tm * 1.03, st.Tk);
      var wG = ss(st.Tb * 0.97, st.Tb * 1.03, st.Tk);
      var wL = clamp(1 - wS - wG, 0, 1);
      var sum = wS + wL + wG || 1;
      st.wS = wS / sum; st.wL = wL / sum; st.wG = wG / sum;

      Gas.visible = st.wG > 0.02;
      Liq.visible = st.wL > 0.02;
      Sol.visible = st.wS > 0.02;

      /* 气态 */
      if (Gas.visible) {
        var sp = 1.7 * Math.sqrt(st.Tk / 298);
        for (var i = 0; i < NG; i++) {
          gx[i] += gvx[i] * sp * dt; gy[i] += gvy[i] * sp * dt; gz[i] += gvz[i] * sp * dt;
          if (gx[i] > R_IN || gx[i] < -R_IN) { gvx[i] *= -1; gx[i] = clamp(gx[i], -R_IN, R_IN); }
          if (gy[i] > R_IN || gy[i] < -R_IN) { gvy[i] *= -1; gy[i] = clamp(gy[i], -R_IN, R_IN); }
          if (gz[i] > R_IN || gz[i] < -R_IN) { gvz[i] *= -1; gz[i] = clamp(gz[i], -R_IN, R_IN); }
          var br = 0.55 + 0.45 * Math.sin(time * 2.2 + i);
          gas.set(i, gx[i], gy[i], gz[i], 0xa8f0ff);
          gas.mat.opacity = 0.55 + 0.4 * st.wG;
        }
        gas.flush();
      }

      /* 液态 */
      if (Liq.visible) {
        liqMat.uniforms.uAmp.value = 0.10 + 0.10 * clamp((st.Tk - st.Tm) / Math.max(1, st.Tb - st.Tm), 0, 1);
        for (var b2 = 0; b2 < NB; b2++) {
          by[b2] += bs[b2] * dt * 1.1;
          if (by[b2] > -R_IN + liqH) by[b2] = -R_IN;
          bub.set(b2, bx[b2], by[b2], bz[b2], 0xffb066);
        }
        bub.flush();
        liqBody.material.opacity = 0.4 * st.k;
      }

      /* 固态 */
      if (Sol.visible) {
        var amp = 0.07 * latA * Math.sqrt(clamp(st.Tk / Math.max(1, st.Tm), 0, 1));
        var rad = latA * 0.13;
        for (var a2 = 0; a2 < latPts.length; a2++) {
          var p = latPts[a2];
          var ox = Math.sin(time * 3.1 + a2 * 1.7) * amp;
          var oy = Math.sin(time * 2.7 + a2 * 2.3) * amp;
          var oz = Math.sin(time * 3.4 + a2 * 1.1) * amp;
          _v3.set(p[0] + ox, p[1] + oy, p[2] + oz);
          _s3.setScalar(rad);
          _m4.compose(_v3, _q0, _s3);
          atoms.setMatrixAt(a2, _m4);
          _s3.setScalar(rad * 1.9);
          _m4.compose(_v3, _q0, _s3);
          halos.setMatrixAt(a2, _m4);
        }
        atoms.count = latPts.length; halos.count = latPts.length;
        atoms.instanceMatrix.needsUpdate = true;
        halos.instanceMatrix.needsUpdate = true;

        for (var bi = 0; bi < latBonds.length; bi++) {
          var A = latPts[latBonds[bi][0]], B = latPts[latBonds[bi][1]];
          bonds.set(bi, A[0], A[1], A[2], B[0], B[1], B[2], 0x9fb3c8, 0x6fe3ff);
        }
        bonds.count(latBonds.length); bonds.flush();
      }

      /* 底座光环与灯环呼吸 */
      baseRing.material.opacity = (0.55 + 0.35 * Math.sin(time * 1.6)) * st.k;
      lampRing.material.opacity = (0.6 + 0.3 * Math.sin(time * 2.1)) * st.k;
      edges.material.opacity = 0.9 * st.k;
      corner.obj.material.opacity = 0.95 * st.k;
      volMat.uniforms.uColor.value.setHex(st.color);
    }

    function dispose() {
      root.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
      });
    }

    buildLattice('fcc');

    return {
      group: root,
      setElement: setElement,
      setTemperature: setTemperature,
      setRefract: setRefract,
      setVisible: setVisible,
      update: update,
      dispose: dispose,
      isVisible: function () { return st.vis; },
      refractOn: function () { return st.refract; },   // 帧率守卫自动降级后为 false
      info: function () {
        var d = TH[(st.el ? st.el[0] : 1) - 1] || [];
        return {
          Tm: st.Tm, Tb: st.Tb, lattice: (LATTICE[st.lat] || {}).name, use: d[3] || '',
          wS: st.wS, wL: st.wL, wG: st.wG, visible: root.visible
        };
      }
    };
  };
})();
