/**
 * 场景：元素周期表（3D）
 * 三种布局：经典周期表平面 / 原子序数螺旋 / 原子量地形
 * 点击元素查看物性参数，并生成该原子的简化壳层示意模型
 */
HL.registerScene({
  id: 'periodic',
  name: '元素周期表',
  short: '118 种元素的三维排布',
  icon: '⚛',
  fov: 48,
  minDistance: 4,
  maxDistance: 200,
  desc: '118 种元素按周期与族排布，颜色区分类别。切换布局可观察原子序数的连续性与相对原子质量的增长趋势。点击任一元素查看细节。',

  controls: [
    { type: 'buttons', key: 'mode', label: '布局方式', value: 'table', options: [
      { label: '周期表', value: 'table' },
      { label: '螺旋', value: 'spiral' },
      { label: '质量地形', value: 'mass' }
    ] },
    { type: 'check', key: 'atom', label: '显示原子壳层模型', value: true },
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

    var params = { mode: 'table', atom: true, autoRotate: false };
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
      blocks.push({ mesh: mesh, target: pos.clone(), base: color.clone(), Z: Z });
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
    atomRoot.position.set(13.5, 5.2, 0);
    scene.add(atomRoot);
    var atomParts = [];

    function buildAtom(Z) {
      atomParts.forEach(function (o) { atomRoot.remove(o); HL.disposeObject(o); });
      atomParts = [];

      var rest = Z, shells = [];
      for (var s = 0; s < SHELL_MAX.length && rest > 0; s++) {
        var n = Math.min(rest, SHELL_MAX[s]);
        shells.push(n); rest -= n;
      }

      var nucleus = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 28, 20),
        new THREE.MeshStandardMaterial({ color: 0xffcf6b, emissive: 0x8a5a00, roughness: 0.35 })
      );
      atomRoot.add(nucleus);
      atomParts.push(nucleus);

      var core = new THREE.Sprite(ctx.glowSprite('rgba(255,190,90,0.7)'));
      core.scale.set(3, 3, 1);
      atomRoot.add(core);
      atomParts.push(core);

      shells.forEach(function (count, li) {
        var R = 0.95 + li * 0.62;
        var ringGeo = new THREE.TorusGeometry(R, 0.018, 8, 90);
        var ringMat = new THREE.MeshBasicMaterial({ color: 0x4de2ff, transparent: true, opacity: 0.4 });
        var ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2 + (li % 2 ? 0.5 : -0.35);
        ring.rotation.z = li * 0.6;
        atomRoot.add(ring);
        atomParts.push(ring);

        var holder = new THREE.Group();
        holder.rotation.copy(ring.rotation);
        for (var k = 0; k < count; k++) {
          var a = (k / count) * Math.PI * 2;
          var eMesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.085, 12, 8),
            new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x1d5d7a, roughness: 0.3 })
          );
          eMesh.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
          holder.add(eMesh);
        }
        atomRoot.add(holder);
        atomParts.push(holder);
      });

      var lb = ctx.makeText('Z = ' + Z + '　壳层 ' + shells.join('·'), { size: 34, scale: 1.1, color: '#ffcf6b' });
      lb.position.set(0, -2.6, 0);
      atomRoot.add(lb);
      atomParts.push(lb);

      var note = ctx.makeText('玻尔简化壳层示意', { size: 26, scale: 0.9, color: '#6f7f9a' });
      note.position.set(0, -3.1, 0);
      atomRoot.add(note);
      atomParts.push(note);
    }
    buildAtom(6);

    camera.position.set(0, 2, 26);
    camera.lookAt(0, 0, 0);

    /* ---------- 交互 ---------- */
    var ray = new THREE.Raycaster();

    function onMove(e) {
      if (!params.mode) return;
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

    return {
      update: function (dt) {
        var k = 1 - Math.pow(0.001, dt);           // 与帧率无关的插值系数
        blocks.forEach(function (b) {
          b.mesh.position.lerp(b.target, k);
        });
        var spin = params.autoRotate ? 0.22 : 0.06;
        atomRoot.rotation.y += dt * spin;
        atomRoot.rotation.x += dt * spin * 0.25;
        atomRoot.visible = params.atom;
        ctx.controls.autoRotate = params.autoRotate && params.mode !== 'table';
      },

      setParam: function (key, v) {
        params[key] = v;
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
        ray.setFromCamera({ x: ndc.x, y: ndc.y }, camera);
        var hit = ray.intersectObjects(pickables, false);
        if (!hit.length) { HL.tooltip.hide(); return; }
        var e = hit[0].object.userData.el;
        var Z = e[0], sym = e[1], zh = e[2], mass = e[3], cat = e[4], period = e[5], group = e[6];

        var name = zh || ('第 ' + Z + ' 号元素（人工合成）');
        var html = '<div class="tt-title">' + (zh ? zh + ' · ' : '') + sym + '　' + Z + '</div>';
        html += '<div class="tt-row">中文名：<b>' + name + '</b></div>';
        html += '<div class="tt-row">相对原子质量：<b>' + mass + '</b></div>';
        html += '<div class="tt-row">类别：<b style="color:' + (HL.ELEMENT_CATEGORIES[cat] || '#fff') + '">' + cat + '</b></div>';
        html += '<div class="tt-row">位置：<b>第 ' + period + ' 周期' + (group ? '　第 ' + group + ' 族' : '　镧/锕系') + '</b></div>';
        if (HL.SHELL_HINT[Z]) html += '<div class="tt-row">电子排布：<b>' + HL.SHELL_HINT[Z] + '</b></div>';
        HL.tooltip.show(html, ndc.clientX, ndc.clientY);

        if (params.atom) buildAtom(Z);
      },

      dispose: function () {
        ctx.canvas.removeEventListener('pointermove', onMove);
      }
    };
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
