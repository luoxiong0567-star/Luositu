/**
 * 场景：太阳系
 * 展示八大行星的公转/自转、轨道共面性与尺度差异（半径为可视化压缩值，非真实比例）
 * 内含「讲解模式」：7 步旁白导览（HL.Tour 框架引擎）
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
    { type: 'button', key: 'tour', label: '📖 讲解模式' },
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
    var clock = 0;                 // 累计场景时间（讲解暂停时随之冻结）

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

    /* ---------- 讲解模式（HL.Tour 框架引擎） ---------- */
    var tour = HL.Tour(ctx);
    tour.load(buildTourSteps(planets));

    return {
      update: function (dt, t) {
        tour.update(dt, t || 0, function (ddt) {
          clock += ddt;
          var k = params.speed;
          sun.rotation.y += ddt * 0.06 * k;
          glow.scale.setScalar(30 + Math.sin(clock * 0.7) * 0.7);

          planets.forEach(function (pl) {
            pl.angle += pl.w * ddt * k;
            pl.group.position.set(Math.cos(pl.angle) * pl.data.dist, 0, Math.sin(pl.angle) * pl.data.dist);
            pl.mesh.rotation.y += pl.spin * ddt * k * 0.02;
            if (pl.moonPivot) pl.moonPivot.rotation.y += ddt * 0.9 * k;
          });

          // 讲解期间冻结相机环绕，避免与飞行镜头打架
          ctx.controls.autoRotate = tour.active() ? false : params.autoRotate;
        });
      },

      setParam: function (key, v) {
        if (key === 'tour') { tour.toggle(); return; }
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
      },

      dispose: function () {
        tour.dispose();
      }
    };
  }
});

/* ================= 太阳系讲解步骤（7 步） =================
 * 视角沿「整体 → 太阳 → 内行星 → 地月 → 巨行星 → 冰巨星 → 定律」推进，
 * 每步给出文字解说与可动手验证的参数实验建议。 */
function buildTourSteps(planets) {
  // 跟随某颗行星的光环位置
  function at(i) {
    return function () { return planets[i].group.position; };
  }
  // 飞到某颗行星附近：沿径向外移 + 抬高 + 切向偏移，保证立体感
  function near(i, dist, height) {
    return function () {
      var p = planets[i].group.position;
      var len = Math.sqrt(p.x * p.x + p.z * p.z) || 1;
      var ux = p.x / len, uz = p.z / len;
      var a = dist * 0.72, b = dist * 0.90;
      return [
        [p.x + ux * a - uz * b, height, p.z + uz * a + ux * b],
        [p.x, 0, p.z]
      ];
    };
  }

  return [
    {
      t: '一、全景：一个近乎扁平的圆盘',
      d: '八大行星几乎在同一个平面内绕太阳运行，这个平面叫「黄道面」。除水星（约 7°）外，各行星轨道的倾角普遍不到 3°——太阳系不是一团乱麻，而是一张薄盘。为了让整张盘能塞进一屏，这里的星球大小与距离都做了可视化压缩：若按真实比例，太阳是一个 14 cm 的球时，海王星要在 4 公里之外。',
      exp: '右键拖动把视角压到接近水平，从侧面看看这张「盘」到底有多薄。',
      cam: [[0, 62, 132], [0, 0, 0]],
      pulse: null
    },
    {
      t: '二、太阳：99.86% 的质量',
      d: '太阳独占整个太阳系质量的 99.86%，正是这份质量产生的引力把所有行星拴在各自的轨道上。它的核心温度约 1500 万 K，每秒把大约 6 亿吨氢聚变成氦，其中约 400 万吨质量转化为能量——这就是地球上一切光与热的来源。所有行星加起来，在太阳面前只是一点点零头。',
      exp: '点击太阳，查看它的完整参数卡；点击空白处关闭。',
      cam: [[0, 13, 30], [0, 0, 0]],
      pulse: function () { return { x: 0, y: 0, z: 0 }; },
      r: 7.2
    },
    {
      t: '三、内行星：小而快',
      d: '水星、金星、地球、火星统称类地行星：岩石外壳、体积不大、离太阳很近。它们也跑得最快——水星 88 天绕日一圈，地球 365 天，火星 687 天。留意它们的外观差异：金星被浓密的二氧化碳云层包裹，反照率极高；火星的红色来自表面富含的氧化铁，也就是铁锈。',
      exp: '退出讲解后把「时间流速」拉到 3×，对比内行星与外行星的公转快慢。',
      cam: [[0, 25, 48], [0, 0, 0]],
      pulse: function () { return { x: 0, y: 0, z: 0 }; },
      r: 33
    },
    {
      t: '四、地球与月球：被潮汐锁定的伙伴',
      d: '地球是目前已知唯一拥有液态水海洋与生命的行星。它唯一的天然卫星月球距地 384,400 km，自转周期与公转周期都是 27.32 天——这种同步并非巧合，而是地球引力长期「刹车」的结果，称为潮汐锁定，所以我们从地球上永远只能看到月球的同一面。',
      exp: '点击月球看它的参数卡；讲解结束后按 F 全屏观察地月系。',
      cam: near(2, 9, 4.2),
      pulse: at(2),
      r: 3.0
    },
    {
      t: '五、气态巨行星：木星与土星',
      d: '越过小行星带就是气体巨行星。木星的质量是其余七颗行星总和的 2.5 倍，已知卫星 95 颗，表面那块「大红斑」是至少持续了 300 年的巨型风暴，直径还能装下一个地球。土星最著名的是环：宽达 28 万公里，厚度却只有几十米，主要由水冰颗粒构成——如果按比例做成一张纸，它比保鲜膜还薄。',
      exp: '取消勾选「显示轨道线」，土星环的层次会看得更清楚。',
      cam: near(5, 15, 6.5),
      pulse: at(5),
      r: 4.6
    },
    {
      t: '六、冰巨星：寒冷的边疆',
      d: '天王星与海王星属于冰巨星，内部主要是水、氨和甲烷的「冰」。天王星的自转轴倾斜 98°，几乎是躺着绕太阳滚动，可能源于早期一次巨大撞击；海王星公转一圈需要 164.8 年——它 1846 年才被发现，到今天才刚绕太阳走完一圈多一点点。这里阳光微弱到只有地球的千分之一。',
      exp: '把时间流速调到最大，注意天王星那颗「躺着转」的姿态。',
      cam: near(6, 12, 5.5),
      pulse: at(6),
      r: 3.2
    },
    {
      t: '七、开普勒第三定律：越远越慢',
      d: '把整张盘收进视野，你会看到一个统一的规律：轨道半长轴 a 与公转周期 T 满足 T² ∝ a³。距离越远的行星不但跑得越慢，而且慢得比距离增长得更快——海王星到太阳的距离约是地球的 30 倍，公转周期却是地球的 165 倍。这条 1619 年从观测数据中总结出的定律，几十年后成为牛顿万有引力定律最直接的推论。',
      exp: '把时间流速调到 6×，盯着水星转完一整圈，海王星几乎还没挪动。',
      cam: [[0, 95, 152], [0, 0, 0]],
      pulse: null
    }
  ];
}

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
