/**
 * 场景：数学模型
 * 参数曲面（莫比乌斯带 / 克莱因瓶 / 双曲抛物面）与洛伦兹吸引子双轨迹
 */
HL.registerScene({
  id: 'math',
  name: '数学模型',
  short: '参数曲面与混沌吸引子',
  icon: '∑',
  fov: 48,
  minDistance: 2,
  maxDistance: 200,
  desc: '由参数方程生成的几何对象。洛伦兹吸引子同时绘制初值仅差 1e-5 的两条轨迹，用于观察确定性系统中的初值敏感性（蝴蝶效应）。',

  controls: [
    { type: 'buttons', key: 'obj', label: '数学对象', value: 'mobius', options: [
      { label: '莫比乌斯带', value: 'mobius' },
      { label: '克莱因瓶', value: 'klein' },
      { label: '马鞍面', value: 'saddle' },
      { label: '洛伦兹吸引子', value: 'lorenz' }
    ] },
    { type: 'range', key: 'seg', label: '网格密度', min: 20, max: 140, step: 4, value: 72 },
    { type: 'check', key: 'wire', label: '线框模式', value: false },
    { type: 'check', key: 'spin', label: '自动旋转', value: true }
  ],

  create: function (ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera;
    scene.add(ctx.makeStars(1600, 320));

    var params = { obj: 'mobius', seg: 72, wire: false, spin: true };
    var current = null;
    var formulaLabel = null;

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    var d1 = new THREE.DirectionalLight(0xffffff, 1.0); d1.position.set(6, 10, 14); scene.add(d1);
    var d2 = new THREE.DirectionalLight(0x4de2ff, 0.55); d2.position.set(-8, -6, -12); scene.add(d2);

    var FORMULA = {
      mobius: '莫比乌斯带　单侧不可定向曲面',
      klein: '克莱因瓶　无内外之分的闭曲面',
      saddle: '双曲抛物面　z = x²／a² − y²／b²',
      lorenz: '洛伦兹系统　σ=10　ρ=28　β=8/3'
    };

    function clearCurrent() {
      if (current) { scene.remove(current); HL.disposeObject(current); current = null; }
      if (formulaLabel) { scene.remove(formulaLabel); HL.disposeObject(formulaLabel); formulaLabel = null; }
    }

    function setLabel(text) {
      formulaLabel = ctx.makeText(text, { size: 40, scale: 1.5, color: '#ffcf6b' });
      formulaLabel.position.set(0, -7.5, 0);
      scene.add(formulaLabel);
    }

    /* ---------- 通用参数曲面 ---------- */
    function parametric(fn, uMin, uMax, vMin, vMax, uSeg, vSeg, closedU) {
      var pos = [], col = [], idx = [];
      var p = new THREE.Vector3();
      var c = new THREE.Color();
      var maxR = 0.001;
      var rows = [];
      for (var i = 0; i <= uSeg; i++) {
        var u = uMin + (uMax - uMin) * i / uSeg;
        var row = [];
        for (var j = 0; j <= vSeg; j++) {
          var v = vMin + (vMax - vMin) * j / vSeg;
          fn(u, v, p);
          row.push(p.clone());
          if (p.length() > maxR) maxR = p.length();
        }
        rows.push(row);
      }
      for (var i2 = 0; i2 <= uSeg; i2++) {
        for (var j2 = 0; j2 <= vSeg; j2++) {
          var pt = rows[i2][j2];
          pos.push(pt.x, pt.y, pt.z);
          var h = (pt.y / maxR + 1) / 2;
          c.setHSL(0.62 - h * 0.5, 0.8, 0.34 + h * 0.26);
          col.push(c.r, c.g, c.b);
        }
      }
      var lim = closedU ? uSeg : uSeg;   // 索引环绕保持一致
      for (var i3 = 0; i3 < lim; i3++) {
        for (var j3 = 0; j3 < vSeg; j3++) {
          var a = i3 * (vSeg + 1) + j3;
          var b = a + vSeg + 1;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    }

    /* ---------- 洛伦兹系统 ---------- */
    function lorenzTrail(x0, y0, z0, color, steps, dt) {
      var pts = new Float32Array(steps * 3);
      var x = x0, y = y0, z = z0;
      var s = 10, r = 28, b = 8 / 3;
      for (var i = 0; i < steps; i++) {
        var dx = s * (y - x), dy = x * (r - z) - y, dz = x * y - b * z;
        x += dx * dt; y += dy * dt; z += dz * dt;
        pts[i * 3] = x * 0.22;
        pts[i * 3 + 1] = (z - 25) * 0.22;
        pts[i * 3 + 2] = y * 0.22;
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      g.setDrawRange(0, 0);
      return new THREE.Line(g, new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.92 }));
    }

    var lorenzLines = null;
    var lorenzStep = 0;

    function build() {
      clearCurrent();
      lorenzLines = null;
      var seg = Math.round(params.seg);

      if (params.obj === 'mobius') {
        var g = parametric(function (u, v, out) {
          var w = 1 + v * 0.5 * Math.cos(u / 2);
          out.set(w * Math.cos(u), v * 0.5 * Math.sin(u / 2), w * Math.sin(u));
        }, 0, Math.PI * 2, -1, 1, seg, 16, true);
        current = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
          vertexColors: true, side: THREE.DoubleSide, roughness: 0.4, metalness: 0.35
        }));
      } else if (params.obj === 'klein') {
        var g2 = parametric(function (u, v, out) {
          var r = 2.2 * (1 - Math.cos(u) / 2);
          var su = Math.sin(u);
          out.set(
            6 * Math.cos(u) * (1 + su) + 4 * r * Math.cos(u) * Math.cos(v),
            16 * su + 4 * r * su * Math.cos(v),
            4 * r * Math.sin(v)
          );
        }, 0, Math.PI * 2, 0, Math.PI * 2, seg, Math.max(16, Math.round(seg / 2)), true);
        current = new THREE.Mesh(g2, new THREE.MeshStandardMaterial({
          vertexColors: true, side: THREE.DoubleSide, roughness: 0.35, metalness: 0.4,
          transparent: true, opacity: 0.95
        }));
        current.scale.setScalar(0.34);
      } else if (params.obj === 'saddle') {
        var g3 = parametric(function (u, v, out) {
          out.set(u, (u * u / 9 - v * v / 16), v);
        }, -8, 8, -8, 8, seg, seg, false);
        current = new THREE.Mesh(g3, new THREE.MeshStandardMaterial({
          vertexColors: true, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.25
        }));
      } else if (params.obj === 'lorenz') {
        var grp = new THREE.Group();
        var N = 9000;
        lorenzLines = [
          lorenzTrail(1, 1, 1, 0x4de2ff, N, 0.004),
          lorenzTrail(1, 1, 1.00001, 0xffcf6b, N, 0.004)
        ];
        lorenzLines.forEach(function (l) { grp.add(l); });
        lorenzStep = 0;
        current = grp;
      }

      if (current) scene.add(current);
      setLabel(FORMULA[params.obj]);
      applyWire();
    }

    function applyWire() {
      if (!current) return;
      current.traverse(function (o) {
        if (o.material && o.material.vertexColors !== undefined && o.type === 'Mesh') {
          o.material.wireframe = params.wire;
        }
      });
    }

    build();
    camera.position.set(0, 6, 20);
    camera.lookAt(0, 0, 0);

    return {
      update: function (dt) {
        if (current) {
          if (params.obj === 'lorenz') {
            if (lorenzLines) {
              lorenzStep += dt * 900;
              var n = Math.min(9000, Math.floor(lorenzStep));
              lorenzLines.forEach(function (l) { l.geometry.setDrawRange(0, n); });
            }
            current.rotation.y += dt * 0.12;
          } else if (params.spin) {
            current.rotation.y += dt * 0.32;
            current.rotation.x += dt * 0.08;
          }
        }
      },

      setParam: function (key, v) {
        params[key] = v;
        if (key === 'obj' || key === 'seg') build();
        if (key === 'wire') applyWire();
      },

      onClick: function () {
        var tips = {
          mobius: '沿带宽方向走一圈会回到起点的「另一侧」——它只有一个面、一条边。',
          klein: '克莱因瓶在三维空间中只能以自交形式呈现，真正的克莱因瓶需要四维空间。',
          saddle: '高斯曲率为负：过该点的两条主曲率方向弯曲方向相反。',
          lorenz: '两条轨迹初值仅相差 1e-5，约 20 秒后完全分离——确定性系统的长期不可预测性。'
        };
        HL.toast(tips[params.obj] || '');
      }
    };
  }
});
