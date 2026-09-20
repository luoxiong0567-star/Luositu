/**
 * 场景：太阳系
 * 展示八大行星的公转/自转、轨道共面性与尺度差异（半径为可视化压缩值，非真实比例）
 */
HL.registerScene({
  id: 'solar',
  name: '太阳系',
  short: '八大行星轨道运行',
  icon: '☉',
  fov: 50,
  minDistance: 8,
  maxDistance: 900,
  desc: '八大行星按开普勒第三定律的近似规律绕日运行，距离与半径经可视化压缩。点击任意天体查看其物理参数。',

  controls: [
    { type: 'range', key: 'speed', label: '时间流速', min: 0.1, max: 6, step: 0.1, value: 1, unit: '×' },
    { type: 'check', key: 'orbit', label: '显示轨道线', value: true },
    { type: 'check', key: 'label', label: '显示名称', value: true },
    { type: 'check', key: 'autoRotate', label: '相机环绕', value: false }
  ],

  create: function (ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera;

    scene.add(ctx.makeStars(3000, 1200));

    var params = { speed: 1, orbit: true, label: true, autoRotate: false };
    var SECONDS_PER_EARTH_YEAR = 7;

    /* ---------- 太阳 ---------- */
    var sun = new THREE.Mesh(
      new THREE.SphereGeometry(5.2, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd06a })
    );
    sun.userData.info = {
      title: '太阳 · Sun',
      rows: [['类型', 'G2V 主序星'], ['直径', '1,392,000 km'], ['质量', '1.989×10³⁰ kg（占系统 99.86%）'],
      ['表面温度', '约 5,772 K'], ['核心温度', '约 1.5×10⁷ K'], ['自转周期', '25.4 天（赤道）']]
    };
    scene.add(sun);

    var glow = new THREE.Sprite(ctx.glowSprite('rgba(255,170,60,0.85)'));
    glow.scale.set(30, 30, 1);
    scene.add(glow);

    scene.add(new THREE.AmbientLight(0xffffff, 0.22));
    var sunLight = new THREE.PointLight(0xfff0d0, 2.6, 0, 1.1);
    scene.add(sunLight);

    /* ---------- 行星数据 ---------- */
    var DATA = [
      { name: '水星', en: 'Mercury', color: '#9c968f', dist: 13, r: 0.78, yr: 0.241, day: 58.6, moons: 0, d: '4,879 km', t: '-173 ~ 427 ℃' },
      { name: '金星', en: 'Venus', color: '#e6c48b', dist: 18.5, r: 1.12, yr: 0.615, day: -243, moons: 0, d: '12,104 km', t: '约 464 ℃' },
      { name: '地球', en: 'Earth', color: '#3f86d6', dist: 25, r: 1.18, yr: 1, day: 1, moons: 1, d: '12,756 km', t: '-89 ~ 58 ℃' },
      { name: '火星', en: 'Mars', color: '#c9613c', dist: 33, r: 0.9, yr: 1.881, day: 1.026, moons: 2, d: '6,792 km', t: '-143 ~ 35 ℃' },
      { name: '木星', en: 'Jupiter', color: '#d3a06a', dist: 49, r: 3.0, yr: 11.86, day: 0.414, moons: 95, d: '142,984 km', t: '约 -108 ℃' },
      { name: '土星', en: 'Saturn', color: '#e0c184', dist: 66, r: 2.75, yr: 29.46, day: 0.444, moons: 146, d: '120,536 km', t: '约 -139 ℃', ring: true },
      { name: '天王星', en: 'Uranus', color: '#a3dbe3', dist: 82, r: 2.0, yr: 84.01, day: -0.718, moons: 28, d: '51,118 km', t: '约 -197 ℃', tilt: true },
      { name: '海王星', en: 'Neptune', color: '#4a6ed8', dist: 98, r: 1.95, yr: 164.8, day: 0.671, moons: 16, d: '49,528 km', t: '约 -201 ℃' }
    ];

    var planets = [];
    var pickables = [sun];
    var orbitLines = [];
    var labels = [];

    DATA.forEach(function (p, i) {
      var group = new THREE.Group();

      var mesh = new THREE.Mesh(
        new THREE.SphereGeometry(p.r, 40, 28),
        new THREE.MeshStandardMaterial({
          map: planetTexture(p.color, i === 4 || i === 5),
          roughness: 0.85, metalness: 0.05
        })
      );
      mesh.rotation.z = p.tilt ? 1.72 : 0.05 * i;
      group.add(mesh);

      if (p.ring) {
        var ringGroup = new THREE.Group();
        [[1.35, 2.3, 0.38], [1.55, 1.85, 0.22], [1.9, 2.25, 0.16]].forEach(function (cfg) {
          var ring = new THREE.Mesh(
            new THREE.RingGeometry(cfg[0] * p.r, cfg[1] * p.r, 96),
            new THREE.MeshBasicMaterial({
              color: 0xe8d3a4, transparent: true, opacity: cfg[2],
              side: THREE.DoubleSide, depthWrite: false
            })
          );
          ring.rotation.x = Math.PI / 2;
          ringGroup.add(ring);
        });
        ringGroup.rotation.x = 0.42;
        group.add(ringGroup);
      }

      var label = ctx.makeText(p.name, { size: 56, scale: 1.5, color: '#cfe6ff' });
      label.position.set(0, p.r + 1.4, 0);
      group.add(label);
      labels.push(label);

      // 轨道线
      var seg = 220, pos = new Float32Array(seg * 3);
      for (var s = 0; s < seg; s++) {
        var a = s / seg * Math.PI * 2;
        pos[s * 3] = Math.cos(a) * p.dist;
        pos[s * 3 + 1] = 0;
        pos[s * 3 + 2] = Math.sin(a) * p.dist;
      }
      var og = new THREE.BufferGeometry();
      og.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      var line = new THREE.LineLoop(og, new THREE.LineBasicMaterial({
        color: 0x4de2ff, transparent: true, opacity: 0.22
      }));
      scene.add(line);
      orbitLines.push(line);

      // 地月系
      var moonPivot = null;
      if (p.moons === 1) {
        moonPivot = new THREE.Group();
        var moon = new THREE.Mesh(
          new THREE.SphereGeometry(0.32, 20, 14),
          new THREE.MeshStandardMaterial({ color: 0xcfcfc8, roughness: 1 })
        );
        moon.position.x = 2.6;
        moon.userData.info = {
          title: '月球 · Moon',
          rows: [['类型', '天然卫星'], ['直径', '3,475 km'], ['与地距离', '384,400 km'], ['公转周期', '27.32 天'], ['潮汐锁定', '是']]
        };
        moonPivot.add(moon);
        group.add(moonPivot);
        pickables.push(moon);
      }

      var angle = Math.random() * Math.PI * 2;
      group.position.set(Math.cos(angle) * p.dist, 0, Math.sin(angle) * p.dist);
      scene.add(group);

      mesh.userData.info = {
        title: p.name + ' · ' + p.en,
        rows: [['轨道半长轴', (p.dist / 25).toFixed(2) + ' AU'], ['赤道直径', p.d],
        ['公转周期', p.yr < 1 ? (p.yr * 365.25).toFixed(1) + ' 天' : p.yr.toFixed(2) + ' 年'],
        ['自转周期', Math.abs(p.day) < 1 ? (Math.abs(p.day) * 24).toFixed(1) + ' 小时' : Math.abs(p.day).toFixed(2) + ' 天' + (p.day < 0 ? '（逆向）' : '')],
        ['已知卫星', p.moons + ' 颗'], ['表面温度', p.t]]
      };
      pickables.push(mesh);

      planets.push({
        group: group, mesh: mesh, data: p, angle: angle,
        w: (Math.PI * 2) / (p.yr * SECONDS_PER_EARTH_YEAR),
        spin: (Math.PI * 2) / (Math.max(Math.abs(p.day), 0.05) * SECONDS_PER_EARTH_YEAR / 365.25) * (p.day < 0 ? -1 : 1),
        moonPivot: moonPivot
      });
    });

    camera.position.set(0, 48, 118);
    camera.lookAt(0, 0, 0);

    /* ---------- 交互 ---------- */
    var ray = new THREE.Raycaster();

    return {
      update: function (dt) {
        var k = params.speed;
        sun.rotation.y += dt * 0.06 * k;
        glow.scale.setScalar(30 + Math.sin(performance.now() * 0.001) * 0.7);

        planets.forEach(function (pl) {
          pl.angle += pl.w * dt * k;
          pl.group.position.set(Math.cos(pl.angle) * pl.data.dist, 0, Math.sin(pl.angle) * pl.data.dist);
          pl.mesh.rotation.y += pl.spin * dt * k * 0.02;
          if (pl.moonPivot) pl.moonPivot.rotation.y += dt * 0.9 * k;
        });

        ctx.controls.autoRotate = params.autoRotate;
      },

      setParam: function (key, v) {
        params[key] = v;
        if (key === 'orbit') orbitLines.forEach(function (l) { l.visible = v; });
        if (key === 'label') labels.forEach(function (l) { l.visible = v; });
      },

      onClick: function (ndc) {
        ray.setFromCamera({ x: ndc.x, y: ndc.y }, camera);
        var hit = ray.intersectObjects(pickables, false);
        if (hit.length && hit[0].object.userData.info) {
          var info = hit[0].object.userData.info;
          var html = '<div class="tt-title">' + info.title + '</div>';
          info.rows.forEach(function (r) {
            html += '<div class="tt-row">' + r[0] + '：<b>' + r[1] + '</b></div>';
          });
          HL.tooltip.show(html, ndc.clientX, ndc.clientY);
        } else {
          HL.tooltip.hide();
        }
      }
    };
  }
});

/* 程序生成行星表面纹理（条带 + 斑块噪声），避免外部贴图依赖 */
function planetTexture(baseColor, banded) {
  var cv = document.createElement('canvas');
  cv.width = 512; cv.height = 256;
  var c = cv.getContext('2d');
  c.fillStyle = baseColor;
  c.fillRect(0, 0, 512, 256);

  if (banded) {
    for (var i = 0; i < 26; i++) {
      var y = Math.random() * 256;
      var h = 3 + Math.random() * 20;
      c.fillStyle = 'rgba(255,255,255,' + (0.04 + Math.random() * 0.08).toFixed(3) + ')';
      c.fillRect(0, y, 512, h);
      c.fillStyle = 'rgba(60,30,0,' + (0.04 + Math.random() * 0.1).toFixed(3) + ')';
      c.fillRect(0, y + h, 512, h * (0.3 + Math.random() * 0.7));
    }
    // 木星大红斑
    c.fillStyle = 'rgba(190,80,50,0.55)';
    c.beginPath();
    c.ellipse(340, 165, 34, 15, 0, 0, Math.PI * 2);
    c.fill();
  } else {
    for (var n = 0; n < 60; n++) {
      var r = 4 + Math.random() * 26;
      c.fillStyle = 'rgba(0,0,0,' + (0.03 + Math.random() * 0.07).toFixed(3) + ')';
      c.beginPath();
      c.ellipse(Math.random() * 512, Math.random() * 256, r, r * 0.6, Math.random() * 3, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,' + (0.02 + Math.random() * 0.06).toFixed(3) + ')';
      c.beginPath();
      c.ellipse(Math.random() * 512, Math.random() * 256, r * 0.7, r * 0.4, Math.random() * 3, 0, Math.PI * 2);
      c.fill();
    }
  }
  var tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}
