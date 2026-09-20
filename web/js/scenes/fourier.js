/**
 * 场景：傅里叶级数
 * 将周期函数分解为谐波叠加：各次谐波沿 Z 轴分层排布，最前方为合成波
 * 可观察项数增加时的逼近过程，以及跳变处不随项数消失的吉布斯过冲
 */
HL.registerScene({
  id: 'fourier',
  name: '傅里叶级数',
  short: '谐波叠加与波形合成',
  icon: '∫',
  fov: 46,
  minDistance: 4,
  maxDistance: 160,
  desc: '任意周期函数可分解为正弦谐波之和。方波仅含奇次谐波，系数按 1/n 衰减；三角波按 1/n² 衰减，收敛更快。跳变点附近的过冲（吉布斯现象）稳定在约 9%，不会随项数增多而消失。',

  controls: [
    { type: 'button', key: 'tour', label: '📖 讲解模式' },
    { type: 'buttons', key: 'wave', label: '目标波形', value: 'square', options: [
      { label: '方波', value: 'square' },
      { label: '锯齿波', value: 'saw' },
      { label: '三角波', value: 'triangle' }
    ] },
    { type: 'range', key: 'N', label: '谐波项数', min: 1, max: 40, step: 1, value: 8 },
    { type: 'range', key: 'speed', label: '相位速度', min: 0, max: 2, step: 0.05, value: 0.6, unit: '×' },
    { type: 'check', key: 'decomp', label: '显示谐波分解', value: true },
    { type: 'check', key: 'target', label: '显示目标波形', value: true },
    { type: 'check', key: 'auto', label: '自动扫描项数', value: false }
  ],

  create: function (ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera;
    scene.add(ctx.makeStars(1200, 240));

    var P = { wave: 'square', N: 8, speed: 0.6, decomp: true, target: true, auto: false };

    var MAXN = 40, SAMPLES = 220, X0 = 0, X1 = Math.PI * 4;
    var XS = 1.0, YS = 3.6, ZS = 0.62, HALFW = 0.085;

    var root = new THREE.Group();
    scene.add(root);

    /* ---------- 谐波系数 ---------- */
    function term(k) {
      if (P.wave === 'square') return { n: 2 * k - 1, amp: 4 / (Math.PI * (2 * k - 1)) };
      if (P.wave === 'saw') return { n: k, amp: (2 / (Math.PI * k)) * (k % 2 ? 1 : -1) };
      return { n: 2 * k - 1, amp: (8 / (Math.PI * Math.PI * (2 * k - 1) * (2 * k - 1))) * (k % 2 ? 1 : -1) };
    }

    function targetAt(x) {
      if (P.wave === 'square') return Math.sin(x) >= 0 ? 1 : -1;
      if (P.wave === 'saw') {
        var t = ((x + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        return t / Math.PI;
      }
      return (2 / Math.PI) * Math.asin(Math.sin(x));
    }

    /* ---------- 谐波曲线 ---------- */
    var harmLines = [];
    for (var k = 0; k < MAXN; k++) {
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SAMPLES * 3), 3));
      var line = new THREE.Line(g, new THREE.LineBasicMaterial({
        color: 0x4de2ff, transparent: true, opacity: 0.75
      }));
      line.userData.k = k + 1;
      root.add(line);
      harmLines.push(line);
    }

    /* ---------- 合成波（带状网格，模拟粗线） ---------- */
    var ribGeo = new THREE.BufferGeometry();
    var ribPos = new Float32Array(SAMPLES * 2 * 3);
    var ribCol = new Float32Array(SAMPLES * 2 * 3);
    var ribIdx = [];
    for (var i = 0; i < SAMPLES - 1; i++) {
      var a = i * 2;
      ribIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    ribGeo.setAttribute('position', new THREE.BufferAttribute(ribPos, 3));
    ribGeo.setAttribute('color', new THREE.BufferAttribute(ribCol, 3));
    ribGeo.setIndex(ribIdx);
    var ribbon = new THREE.Mesh(ribGeo, new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.DoubleSide
    }));
    root.add(ribbon);

    /* ---------- 目标波形参考线 ---------- */
    var tgtGeo = new THREE.BufferGeometry();
    tgtGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SAMPLES * 3), 3));
    var targetLine = new THREE.Line(tgtGeo, new THREE.LineBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.22
    }));
    root.add(targetLine);

    /* ---------- 坐标轴 ---------- */
    var axisMat = new THREE.LineBasicMaterial({ color: 0x2f4a6b });
    var axGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-(X1 * XS) / 2 - 0.5, 0, 0),
      new THREE.Vector3((X1 * XS) / 2 + 0.5, 0, 0)
    ]);
    root.add(new THREE.Line(axGeo, axisMat));

    var formula = ctx.makeText('f(x) = Σ aₙ sin(nx)', { size: 40, scale: 1.4, color: '#ffcf6b' });
    formula.position.set(0, -5.6, 2);
    root.add(formula);

    var FORMULA = {
      square: '方波　aₙ = 4/(πn)　n = 1,3,5…（仅奇次）',
      saw: '锯齿波　aₙ = 2(−1)ⁿ⁺¹/(πn)　n = 1,2,3…',
      triangle: '三角波　aₙ = 8(−1)⁽ⁿ⁻¹⁾ᐟ²/(π²n²)　n = 1,3,5…'
    };

    var phase = 0, autoN = 1, autoAcc = 0;
    var sumArr = new Float32Array(SAMPLES);
    var lastRms = 0;

    function refreshFormula() {
      root.remove(formula);
      HL.disposeObject(formula);
      formula = ctx.makeText(FORMULA[P.wave], { size: 36, scale: 1.25, color: '#ffcf6b' });
      formula.position.set(0, -5.6, 2);
      root.add(formula);
    }

    camera.position.set(2, 7, 26);
    camera.lookAt(0, 0, -4);

    var c1 = new THREE.Color(0x4de2ff), c2 = new THREE.Color(0xffcf6b), _c = new THREE.Color();

    function update(dt) {
      var N = P.auto ? autoN : P.N;
      phase += dt * P.speed;

      if (P.auto) {
        autoAcc += dt;
        if (autoAcc > 0.16) {
          autoAcc = 0;
          autoN++;
          if (autoN > MAXN) autoN = 1;
        }
      }

      for (var i = 0; i < SAMPLES; i++) sumArr[i] = 0;

      // 谐波层
      for (var k = 0; k < MAXN; k++) {
        var line = harmLines[k];
        var on = P.decomp && (k + 1) <= N;
        line.visible = on;
        if (!on) continue;
        var t = term(k + 1);
        var arr = line.geometry.attributes.position.array;
        var z = -(k) * ZS;
        for (var i2 = 0; i2 < SAMPLES; i2++) {
          var x = X0 + (X1 - X0) * i2 / (SAMPLES - 1);
          // 相位必须随谐波次数 n 同步缩放（n*(x-vt)），否则各谐波相速不同，合成波形会色散失真
          var y = t.amp * Math.sin(t.n * (x - phase)) * YS;
          arr[i2 * 3] = (x - X1 / 2) * XS;
          arr[i2 * 3 + 1] = y;
          arr[i2 * 3 + 2] = z;
          sumArr[i2] += y;
        }
        line.geometry.attributes.position.needsUpdate = true;
        line.geometry.computeBoundingSphere();
        var f = 1 - k / MAXN;
        line.material.color.copy(c1).lerp(c2, 1 - f);
        line.material.opacity = 0.28 + f * 0.55;
      }

      // 合成波
      var rp = ribGeo.attributes.position.array;
      var rc = ribGeo.attributes.color.array;
      for (var i3 = 0; i3 < SAMPLES; i3++) {
        var xx = X0 + (X1 - X0) * i3 / (SAMPLES - 1);
        var px = (xx - X1 / 2) * XS;
        var py = sumArr[i3];
        rp[i3 * 6] = px; rp[i3 * 6 + 1] = py + HALFW; rp[i3 * 6 + 2] = 1.6;
        rp[i3 * 6 + 3] = px; rp[i3 * 6 + 4] = py - HALFW; rp[i3 * 6 + 5] = 1.6;
        var v = Math.min(1, Math.abs(py) / YS);
        _c.setHSL(0.14 - v * 0.06, 0.95, 0.42 + v * 0.24);
        rc[i3 * 6] = _c.r; rc[i3 * 6 + 1] = _c.g; rc[i3 * 6 + 2] = _c.b;
        rc[i3 * 6 + 3] = _c.r; rc[i3 * 6 + 4] = _c.g; rc[i3 * 6 + 5] = _c.b;
      }
      ribGeo.attributes.position.needsUpdate = true;
      ribGeo.attributes.color.needsUpdate = true;
      ribGeo.computeBoundingSphere();

      // 目标波形
      targetLine.visible = P.target;
      if (P.target) {
        var ta = tgtGeo.attributes.position.array;
        for (var i4 = 0; i4 < SAMPLES; i4++) {
          var x4 = X0 + (X1 - X0) * i4 / (SAMPLES - 1);
          ta[i4 * 3] = (x4 - X1 / 2) * XS;
          ta[i4 * 3 + 1] = targetAt(x4 - phase) * YS;
          ta[i4 * 3 + 2] = 1.6;
        }
        tgtGeo.attributes.position.needsUpdate = true;
        tgtGeo.computeBoundingSphere();
      }

      // 误差统计
      if (ctx.setNote) {
        var se = 0;
        for (var i5 = 0; i5 < SAMPLES; i5++) {
          var x5 = X0 + (X1 - X0) * i5 / (SAMPLES - 1);
          var d = sumArr[i5] / YS - targetAt(x5 - phase);
          se += d * d;
        }
        lastRms = Math.sqrt(se / SAMPLES);
        var osc = 0;
        for (var i6 = 0; i6 < SAMPLES; i6++) osc = Math.max(osc, Math.abs(sumArr[i6]) / YS);
        ctx.setNote(
          '<div class="note-row"><span>叠加项数</span><b>' + N + ' 项</b></div>' +
          '<div class="note-row"><span>最高谐波</span><b>' + term(N).n + ' 次</b></div>' +
          '<div class="note-row"><span>RMS 误差</span><b>' + lastRms.toFixed(4) + '</b></div>' +
          '<div class="note-row"><span>峰值过冲</span><b>' + ((osc - 1) * 100).toFixed(1) + ' %</b></div>'
        );
      }
    }

    var ray = new THREE.Raycaster();
    ray.params.Line.threshold = 0.22;

    /* ---------- 讲解模式（HL.Tour 框架引擎） ---------- */
    var tour = HL.Tour(ctx);
    tour.load([
      {
        t: '一、目标与合成',
        d: '白色细线是目标——理想方波；金色亮带是合成波——有限个正弦谐波的叠加。傅里叶 1807 年的断言：任何周期函数都能这样被正弦之和逼近。两者之间的差距，就藏在「还差多少个谐波」里。',
        exp: '右键拖动旋转视角，从前方看合成波，从侧后方看谐波队列。',
        cam: [[2, 7, 26], [0, 0, -4]],
        pulse: null
      },
      {
        t: '二、谐波家族',
        d: '向后排列的每条青色曲线是一个谐波：第 1 个是基频，之后全是奇数次（3、5、7…），振幅按 1/n 递减——方波里没有偶次谐波，因为它关于横轴对称。每条线的颜色由青渐变到金，标记次数的升高。',
        exp: '点击任意一条谐波曲线，看它的次数、振幅系数与频率比。',
        cam: [[2, 13, 8], [0, 0, -9]],
        pulse: [0, 0, -4], r: 2.5
      },
      {
        t: '三、项数逼近',
        d: '拖动「谐波项数 N」：加上第 3、第 5、第 7 个谐波，合成波逐级贴合方波，右上角 RMS 误差单调下降。傅里叶级数不是魔法，而是一个可以逐项验证的收敛过程。',
        exp: '退出讲解后把 N 从 1 拖到 20，看波形逐级逼近；勾选「自动扫描项数」交给动画。',
        cam: [[2, 6, 18], [0, 0, -2]],
        pulse: null
      },
      {
        t: '四、吉布斯现象',
        d: '把 N 拉满到 40：跳变处的「小耳朵」依然存在——这是吉布斯过冲，稳定在约 9%，永远不会随项数增多而消失。无穷级数在跳变点只能「平均收敛」，无法「点点收敛」——1899 年吉布斯给出了这个证明。',
        exp: '已为你切到 40 项。注意两个过冲尖峰的高度不再随项数变化。',
        cam: [[2, 5, 14], [0, 0, 0]],
        pulse: null,
        apply: function () { P.auto = false; P.N = 40; }
      },
      {
        t: '五、无处不在的傅里叶',
        d: '换锯齿波看 1/n 的慢衰减，换三角波看 1/n² 的快收敛。你每听一次 mp3、每看一张 jpg，都是把信号变到频域、砍掉听不见 / 看不见的谐波再变回来——傅里叶分析是整个数字世界的地基。',
        exp: '已为你切到三角波。对比方波：同样项数下它贴合得多快。',
        cam: [[2, 7, 24], [0, 0, -4]],
        pulse: null,
        apply: function () { P.wave = 'triangle'; refreshFormula(); }
      }
    ]);

    return {
      update: function (dt, tt) {
        tour.update(dt, tt || 0, function (ddt) {
          update(ddt);
        });
      },

      setParam: function (key, v) {
        if (key === 'tour') { tour.toggle(); return; }
        P[key] = v;
        if (key === 'wave') refreshFormula();
      },

      onClick: function (ndc) {
        ray.setFromCamera({ x: ndc.x, y: ndc.y }, camera);
        var hit = ray.intersectObjects(harmLines.filter(function (l) { return l.visible; }), false);
        if (!hit.length) { HL.tooltip.hide(); return; }
        var k = hit[0].object.userData.k;
        var t = term(k);
        var html = '<div class="tt-title">第 ' + k + ' 项谐波</div>';
        html += '<div class="tt-row">谐波次数：<b>n = ' + t.n + '</b></div>';
        html += '<div class="tt-row">振幅系数：<b>' + t.amp.toFixed(5) + '</b></div>';
        html += '<div class="tt-row">频率比：<b>' + t.n + ' × f₀</b></div>';
        html += '<div class="tt-row">相位：<b>0</b></div>';
        HL.tooltip.show(html, ndc.clientX, ndc.clientY);
      },

      dispose: function () {
        tour.dispose();
      }
    };
  }
});
