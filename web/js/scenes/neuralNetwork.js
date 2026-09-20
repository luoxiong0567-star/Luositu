/**
 * 场景：人工神经网络
 * 全连接前馈网络（MLP）的前向传播过程可视化
 * 节点亮度 = 激活值，连线颜色 = 权重符号（暖为正 / 冷为负），亮度 = |权重| × 激活强度
 */
HL.registerScene({
  id: 'neural',
  name: '神经网络',
  short: '前向传播与权重可视化',
  icon: '⑃',
  fov: 46,
  minDistance: 4,
  maxDistance: 160,
  desc: '全连接前馈网络：a⁽ˡ⁾ = f( W⁽ˡ⁾a⁽ˡ⁻¹⁾ + b⁽ˡ⁾ )。光带自输入层向输出层推进，展示信息逐层变换与特征提取的过程。',

  controls: [
    { type: 'button', key: 'tour', label: '📖 讲解模式' },
    { type: 'buttons', key: 'arch', label: '网络结构', value: 'std', options: [
      { label: '浅层', value: 'shallow' },
      { label: '标准', value: 'std' },
      { label: '深层', value: 'deep' }
    ] },
    { type: 'buttons', key: 'act', label: '激活函数', value: 'tanh', options: [
      { label: 'Sigmoid', value: 'sigmoid' },
      { label: 'Tanh', value: 'tanh' },
      { label: 'ReLU', value: 'relu' }
    ] },
    { type: 'range', key: 'speed', label: '传播速度', min: 0.2, max: 4, step: 0.1, value: 1.2, unit: '×' },
    { type: 'check', key: 'links', label: '显示权重连线', value: true },
    { type: 'check', key: 'labels', label: '显示层标注', value: true },
    { type: 'button', key: 'reseed', label: '重新随机权重' }
  ],

  create: function (ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera;
    scene.add(ctx.makeStars(1400, 300));

    var ARCH = { shallow: [3, 6, 2], std: [4, 8, 8, 3], deep: [5, 10, 12, 10, 8, 4] };
    var params = { arch: 'std', act: 'tanh', speed: 1.2, links: true, labels: true };

    var ACT = {
      sigmoid: function (x) { return 1 / (1 + Math.exp(-x)); },
      tanh: function (x) { return Math.tanh(x); },
      relu: function (x) { return Math.max(0, x); }
    };

    var root = new THREE.Group();
    scene.add(root);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    var l1 = new THREE.DirectionalLight(0xffffff, 0.9); l1.position.set(8, 14, 20); scene.add(l1);
    var l2 = new THREE.DirectionalLight(0x5fa8ff, 0.5); l2.position.set(-12, -4, -10); scene.add(l2);

    var nodeGeo = new THREE.SphereGeometry(0.34, 24, 16);
    var layers = [];          // { n, nodes:[{mesh, act, b}], label }
    var linkLines = null;
    var targets = [];         // 各层目标激活值
    var wave = 0;
    var weights = [];
    var biases = [];
    var pickables = [];
    var labels = [];
    var paramCount = 0;

    function randn() {
      var u = 1 - Math.random(), v = Math.random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }

    function build(sizes) {
      // 清理
      layers.forEach(function (L) { L.nodes.forEach(function (nd) { root.remove(nd.mesh); }); });
      labels.forEach(function (s) { root.remove(s); });
      if (linkLines) { root.remove(linkLines); HL.disposeObject(linkLines); }
      layers = []; labels = []; pickables = []; weights = []; biases = []; paramCount = 0;

      var GAP = 5.4;
      var totalW = (sizes.length - 1) * GAP;
      var maxN = Math.max.apply(null, sizes);
      var SP = Math.min(1.55, 16 / maxN);

      sizes.forEach(function (n, li) {
        var nodes = [];
        for (var i = 0; i < n; i++) {
          var mesh = new THREE.Mesh(nodeGeo, new THREE.MeshStandardMaterial({
            color: 0x24405c, emissive: 0x0a1a2a, roughness: 0.32, metalness: 0.2
          }));
          mesh.position.set(li * GAP - totalW / 2, (i - (n - 1) / 2) * SP, 0);
          mesh.userData.layer = li;
          mesh.userData.idx = i;
          root.add(mesh);
          nodes.push({ mesh: mesh, act: 0, b: randn() * 0.35 });
          pickables.push(mesh);
        }

        var t = li === 0 ? '输入层' : (li === sizes.length - 1 ? '输出层' : '隐藏层 ' + li);
        var lb = ctx.makeText(t + ' · ' + n, { size: 36, scale: 1.25, color: '#8fb6d9' });
        lb.position.set(li * GAP - totalW / 2, (n - 1) / 2 * SP + 1.7, 0);
        root.add(lb);
        labels.push(lb);

        layers.push({ n: n, nodes: nodes });
      });

      // 权重
      for (var li2 = 0; li2 < layers.length - 1; li2++) {
        var W = [];
        for (var j = 0; j < layers[li2 + 1].n; j++) {
          var row = [];
          for (var k = 0; k < layers[li2].n; k++) {
            row.push(randn() * 0.9);
          }
          W.push(row);
        }
        weights.push(W);
        biases.push(layers[li2 + 1].nodes.map(function (nd) { return nd.b; }));
        paramCount += layers[li2 + 1].n * layers[li2].n + layers[li2 + 1].n;
      }

      // 连线（一次性 LineSegments + 逐顶点颜色）
      var count = 0;
      for (var a = 0; a < layers.length - 1; a++) count += layers[a].n * layers[a + 1].n;
      var pos = new Float32Array(count * 6);
      var col = new Float32Array(count * 8);
      var segInfo = [];
      var p = 0;
      for (var a2 = 0; a2 < layers.length - 1; a2++) {
        for (var j2 = 0; j2 < layers[a2 + 1].n; j2++) {
          for (var k2 = 0; k2 < layers[a2].n; k2++) {
            var A = layers[a2].nodes[k2].mesh.position;
            var B = layers[a2 + 1].nodes[j2].mesh.position;
            pos[p * 6] = A.x; pos[p * 6 + 1] = A.y; pos[p * 6 + 2] = A.z;
            pos[p * 6 + 3] = B.x; pos[p * 6 + 4] = B.y; pos[p * 6 + 5] = B.z;
            segInfo.push({ l: a2, to: j2, from: k2 });
            p++;
          }
        }
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 4));
      linkLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false
      }));
      linkLines.userData.segInfo = segInfo;
      root.add(linkLines);

      reseedInput();
      updateNote();
    }

    function reseedInput() {
      layers[0].nodes.forEach(function (nd) { nd.act = Math.random(); });
      targets = [layers[0].nodes.map(function (nd) { return nd.act; })];
      for (var l = 0; l < layers.length - 1; l++) {
        var prev = targets[l];
        var cur = [];
        for (var j = 0; j < layers[l + 1].n; j++) {
          var s = biases[l][j];
          for (var k = 0; k < prev.length; k++) s += weights[l][j][k] * prev[k];
          cur.push(ACT[params.act](s));
        }
        targets.push(cur);
      }
      wave = 0;
    }

    function updateNote() {
      if (!ctx.setNote) return;
      var dims = layers.map(function (L) { return L.n; }).join(' → ');
      var out = targets[targets.length - 1] || [];
      var best = 0, bi = 0;
      out.forEach(function (v, i) { if (v > best) { best = v; bi = i; } });
      ctx.setNote(
        '<div class="note-row"><span>拓扑</span><b>' + dims + '</b></div>' +
        '<div class="note-row"><span>可训练参数</span><b>' + paramCount.toLocaleString() + '</b></div>' +
        '<div class="note-row"><span>激活函数</span><b>' + params.act + '</b></div>' +
        '<div class="note-row"><span>输出判定</span><b>class ' + bi + '（' + best.toFixed(3) + '）</b></div>'
      );
    }

    build(ARCH[params.arch]);

    camera.position.set(0, 1.5, 26);
    camera.lookAt(0, 0, 0);

    var tmpColor = new THREE.Color();
    var ray = new THREE.Raycaster();

    /* ---------- 讲解模式（HL.Tour 框架引擎） ---------- */
    function layerX(i) {
      return layers[i] && layers[i].nodes[0] ? layers[i].nodes[0].mesh.position.x : 0;
    }
    var tour = HL.Tour(ctx);
    tour.load([
      {
        t: '一、人工神经元',
        d: '每个球是一个神经元：它把上一层所有输入加权求和，加偏置、过一个激活函数，得到自己的激活值——颜色越暖越亮表示激活越强。这个模型源自 1943 年的麦卡洛克-皮茨神经元，比计算机本身还古老。',
        exp: '点击任意神经元，看它当前的激活值、偏置与连接数。',
        cam: [[0, 1.5, 26], [0, 0, 0]],
        pulse: function () { return { x: layerX(0), y: 0, z: 0 }; }, r: 2.2
      },
      {
        t: '二、权重连线：网络的一切',
        d: '每条连线是一个权重：暖色（橙）是正权重（激励），冷色（蓝紫）是负权重（抑制），亮度 = |权重| × 上游激活。所谓「训练」，就是用数据一点点调整这些数字——今天的大模型，调整的是上千亿个这样的数。',
        exp: '取消勾选「显示权重连线」再看一遍前向传播，然后勾回来。',
        cam: [[0, 2, 14], [0, 0, 0]],
        pulse: null
      },
      {
        t: '三、前向传播',
        d: '光带自左向右推进：输入层接收信号，隐藏层逐层变换——通常越靠后的层学到的特征越抽象。直到输出层给出判定（右上角读数显示当前胜出的类别与得分）。深度学习的「深」，指的就是这层层堆叠的非线性变换。',
        exp: '把「传播速度」拉到 3×，看信号奔跑得更快。',
        cam: [[0, 4, 20], [0, 0, 0]],
        pulse: function () { return { x: layerX(layers.length - 1), y: 0, z: 0 }; }, r: 1.8
      },
      {
        t: '四、激活函数：非线性的关键',
        d: '没有激活函数，再深的网络也只等价于一层线性变换。Sigmoid 把一切压进 (0,1)；tanh 压进 (−1,1)；ReLU 直接砍掉负值——简单粗暴，却是 2012 年之后深度学习爆发的功臣之一。',
        exp: '已为你切到 ReLU。对比节点亮度分布与 tanh 的差别。',
        cam: [[0, 2, 16], [0, 0, 0]],
        pulse: null,
        apply: function () { params.act = 'relu'; reseedInput(); updateNote(); }
      },
      {
        t: '五、规模的力量',
        d: '切到「深层」结构：5 → 10 → 12 → 10 → 8 → 4，可训练参数暴涨到上千。2012 年 AlexNet 用 6000 万参数引爆深度学习，如今的大语言模型已达千亿级。而你的大脑：860 亿神经元、约 100 万亿突触——这个画面只是它最粗浅的缩影。',
        exp: '点「重新随机权重」看不同初始化下的传播差异。',
        cam: [[0, 3, 24], [0, 0, 0]],
        pulse: null,
        apply: function () { params.arch = 'deep'; build(ARCH.deep); }
      }
    ]);

    return {
      update: function (dt, tt) {
        tour.update(dt, tt || 0, function (ddt) {
          var L = layers.length;
          wave += ddt * params.speed * 1.7;
          if (wave > L + 1.6) { reseedInput(); updateNote(); }

        // 节点激活
        for (var l = 0; l < L; l++) {
          var k = Math.max(0, Math.min(1, wave - l));
          var tg = targets[l] || [];
          for (var i = 0; i < layers[l].n; i++) {
            var nd = layers[l].nodes[i];
            var a = (tg[i] || 0) * k;
            nd.act = a;
            var norm = params.act === 'tanh' ? (a + 1) / 2 : Math.min(1, a);
            norm = Math.max(0, Math.min(1, norm));
            tmpColor.setHSL(0.55 - norm * 0.42, 0.85, 0.22 + norm * 0.42);
            nd.mesh.material.color.copy(tmpColor);
            nd.mesh.material.emissive.copy(tmpColor).multiplyScalar(0.55);
            var s = 1 + norm * 0.42;
            nd.mesh.scale.setScalar(s);
          }
        }

        // 连线颜色
        if (linkLines) {
          var ca = linkLines.geometry.attributes.color;
          var arr = ca.array;
          var seg = linkLines.userData.segInfo;
          for (var s2 = 0; s2 < seg.length; s2++) {
            var info = seg[s2];
            var w = weights[info.l][info.to][info.from];
            var amp = Math.min(1, Math.abs(w) / 1.4) * (layers[info.l].nodes[info.from].act || 0);
            var warm = w >= 0;
            arr[s2 * 8] = warm ? 1.0 : 0.32;
            arr[s2 * 8 + 1] = warm ? 0.55 : 0.72;
            arr[s2 * 8 + 2] = warm ? 0.35 : 1.0;
            arr[s2 * 8 + 3] = amp * 0.85;
            arr[s2 * 8 + 4] = warm ? 1.0 : 0.32;
            arr[s2 * 8 + 5] = warm ? 0.55 : 0.72;
            arr[s2 * 8 + 6] = warm ? 0.35 : 1.0;
            arr[s2 * 8 + 7] = amp * 0.85;
          }
          ca.needsUpdate = true;
          linkLines.visible = params.links;
        }
        });
      },

      setParam: function (key, v) {
        if (key === 'tour') { tour.toggle(); return; }
        if (key === 'arch') { params.arch = v; build(ARCH[v]); return; }
        if (key === 'reseed') { build(ARCH[params.arch]); return; }
        params[key] = v;
        if (key === 'act') { reseedInput(); updateNote(); }
        if (key === 'labels') labels.forEach(function (s) { s.visible = v; });
      },

      onClick: function (ndc) {
        ray.setFromCamera({ x: ndc.x, y: ndc.y }, camera);
        var hit = ray.intersectObjects(pickables, false);
        if (!hit.length) { HL.tooltip.hide(); return; }
        var d = hit[0].object.userData;
        var L = layers.length;
        var name = d.layer === 0 ? '输入层' : (d.layer === L - 1 ? '输出层' : '隐藏层 ' + d.layer);
        var html = '<div class="tt-title">' + name + ' · 神经元 #' + (d.idx + 1) + '</div>';
        html += '<div class="tt-row">当前激活值：<b>' + layers[d.layer].nodes[d.idx].act.toFixed(4) + '</b></div>';
        html += '<div class="tt-row">偏置 b：<b>' + layers[d.layer].nodes[d.idx].b.toFixed(4) + '</b></div>';
        if (d.layer < L - 1) html += '<div class="tt-row">扇出连接：<b>' + layers[d.layer + 1].n + ' 条</b></div>';
        if (d.layer > 0) html += '<div class="tt-row">扇入连接：<b>' + layers[d.layer - 1].n + ' 条</b></div>';
        HL.tooltip.show(html, ndc.clientX, ndc.clientY);
      },

      dispose: function () {
        tour.dispose();
      }
    };
  }
});
