/**
 * 场景：电磁波
 * 沿 +Z 传播的平面电磁波：E ⊥ B ⊥ k，三者构成右手系
 * 支持线偏振与圆偏振，附波前平面与能流密度（坡印廷矢量 S = E × B / μ₀）
 */
HL.registerScene({
  id: 'emwave',
  name: '电磁波',
  short: '麦克斯韦方程组的场可视化',
  icon: 'λ',
  fov: 46,
  minDistance: 4,
  maxDistance: 160,
  desc: '时变电场激发磁场，时变磁场激发电场，二者相互维持并以光速向外传播。E、B、传播方向 k 三者两两垂直构成右手系；点击画面查看麦克斯韦方程组。',

  controls: [
    { type: 'buttons', key: 'polar', label: '偏振状态', value: 'linear', options: [
      { label: '线偏振', value: 'linear' },
      { label: '圆偏振', value: 'circular' }
    ] },
    { type: 'range', key: 'wl', label: '波长 λ', min: 5, max: 22, step: 0.5, value: 12 },
    { type: 'range', key: 'freq', label: '角频率', min: 0, max: 3, step: 0.05, value: 1 },
    { type: 'range', key: 'amp', label: '振幅 E₀', min: 0.6, max: 3.2, step: 0.1, value: 2.2 },
    { type: 'check', key: 'showE', label: '电场 E（红）', value: true },
    { type: 'check', key: 'showB', label: '磁场 B（蓝）', value: true },
    { type: 'check', key: 'showS', label: '能流 S（金）', value: true },
    { type: 'check', key: 'front', label: '波前平面', value: true }
  ],

  create: function (ctx) {
    var THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera;
    scene.add(ctx.makeStars(1200, 260));

    var P = { polar: 'linear', wl: 12, freq: 1, amp: 2.2, showE: true, showB: true, showS: true, front: true };

    var L = 26, NZ = 41;
    var root = new THREE.Group();
    scene.add(root);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    var d1 = new THREE.DirectionalLight(0xffffff, 0.8); d1.position.set(10, 14, 16); scene.add(d1);

    /* ---------- 共享几何 ---------- */
    var gShaft = new THREE.CylinderGeometry(1, 1, 1, 8); gShaft.translate(0, 0.5, 0);
    var gHead = new THREE.ConeGeometry(1, 1, 12); gHead.translate(0, 0.5, 0);
    var UP = new THREE.Vector3(0, 1, 0);

    var MAT = {
      E: new THREE.MeshStandardMaterial({ color: 0xff6b6b, emissive: 0x3a0d0d, roughness: 0.35, metalness: 0.3 }),
      B: new THREE.MeshStandardMaterial({ color: 0x4d9bff, emissive: 0x0d1f3a, roughness: 0.35, metalness: 0.3 }),
      S: new THREE.MeshStandardMaterial({ color: 0xffcf6b, emissive: 0x3a2a00, roughness: 0.4, metalness: 0.2 })
    };

    function makeArrow(material) {
      var g = new THREE.Group();
      var shaft = new THREE.Mesh(gShaft, material);
      var head = new THREE.Mesh(gHead, material);
      g.add(shaft, head);
      root.add(g);
      g.set = function (origin, dir, len, radius) {
        if (len < 0.06) { g.visible = false; return; }
        g.visible = true;
        g.position.copy(origin);
        g.quaternion.setFromUnitVectors(UP, dir);
        var hl = Math.min(0.55, len * 0.34);
        shaft.scale.set(radius, Math.max(0.001, len - hl), radius);
        head.position.y = len - hl;
        head.scale.set(radius * 2.6, hl, radius * 2.6);
      };
      return g;
    }

    var arrE = [], arrB = [], arrS = [];
    for (var i = 0; i < NZ; i++) {
      arrE.push(makeArrow(MAT.E));
      arrB.push(makeArrow(MAT.B));
    }
    for (var j = 0; j < 15; j++) arrS.push(makeArrow(MAT.S));

    /* ---------- 包络曲线 ---------- */
    function envelope(color) {
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NZ * 3), 3));
      var l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.55 }));
      root.add(l);
      return l;
    }
    var envE = envelope(0xff6b6b);
    var envB = envelope(0x4d9bff);

    /* ---------- 波前平面 ---------- */
    var frontGroup = new THREE.Group();
    root.add(frontGroup);
    var fronts = [];
    for (var f = 0; f < 6; f++) {
      var m = new THREE.Mesh(
        new THREE.PlaneGeometry(9, 9),
        new THREE.MeshBasicMaterial({
          color: 0x4de2ff, transparent: true, opacity: 0.06,
          side: THREE.DoubleSide, depthWrite: false
        })
      );
      m.rotation.y = 0;
      frontGroup.add(m);
      fronts.push(m);
    }

    /* ---------- 传播轴 ---------- */
    var axisGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -L / 2 - 2), new THREE.Vector3(0, 0, L / 2 + 3)
    ]);
    root.add(new THREE.Line(axisGeo, new THREE.LineBasicMaterial({ color: 0x39536f })));

    var lbK = ctx.makeText('传播方向 k', { size: 34, scale: 1.15, color: '#8fb6d9' });
    lbK.position.set(0, 1.2, L / 2 + 3.4);
    root.add(lbK);
    var lbE = ctx.makeText('E', { size: 40, scale: 1.2, color: '#ff6b6b' });
    lbE.position.set(0, P.amp + 1.4, 0);
    root.add(lbE);
    var lbB = ctx.makeText('B', { size: 40, scale: 1.2, color: '#4d9bff' });
    lbB.position.set(-P.amp - 1.4, 0, 0);
    root.add(lbB);

    camera.position.set(15, 10, 26);
    camera.lookAt(0, 0, 0);

    var t = 0;
    var _o = new THREE.Vector3(), _d = new THREE.Vector3(), _s = new THREE.Vector3();
    var KHAT = new THREE.Vector3(0, 0, 1);

    return {
      update: function (dt) {
        t += dt * P.freq;
        var k = Math.PI * 2 / P.wl;
        var omega = 2.2;
        var cVis = 1.0;

        for (var i = 0; i < NZ; i++) {
          var z = -L / 2 + L * i / (NZ - 1);
          var psi = k * z - omega * t;
          _o.set(0, 0, z);

          if (P.polar === 'linear') {
            var e = P.amp * Math.sin(psi);
            _d.set(0, Math.sign(e) || 1, 0);
            arrE[i].set(_o, _d, Math.abs(e), 0.055);
            // B = (1/c) k̂ × E，方向为 ẑ × ŷ = −x̂
            _s.set(-1, 0, 0).multiplyScalar(Math.sign(e) || 1);
            arrB[i].set(_o, _s, Math.abs(e) * 0.55, 0.045);
            envE.geometry.attributes.position.array[i * 3] = 0;
            envE.geometry.attributes.position.array[i * 3 + 1] = e;
            envE.geometry.attributes.position.array[i * 3 + 2] = z;
            envB.geometry.attributes.position.array[i * 3] = -e * 0.55;
            envB.geometry.attributes.position.array[i * 3 + 1] = 0;
            envB.geometry.attributes.position.array[i * 3 + 2] = z;
          } else {
            // 圆偏振：E 矢量端点绕传播轴旋转，幅值恒定
            _d.set(-Math.sin(psi), Math.cos(psi), 0).normalize();
            arrE[i].set(_o, _d, P.amp, 0.055);
            _s.crossVectors(KHAT, _d).normalize();
            arrB[i].set(_o, _s, P.amp * 0.55, 0.045);
            envE.geometry.attributes.position.array[i * 3] = _d.x * P.amp;
            envE.geometry.attributes.position.array[i * 3 + 1] = _d.y * P.amp;
            envE.geometry.attributes.position.array[i * 3 + 2] = z;
            envB.geometry.attributes.position.array[i * 3] = _s.x * P.amp * 0.55;
            envB.geometry.attributes.position.array[i * 3 + 1] = _s.y * P.amp * 0.55;
            envB.geometry.attributes.position.array[i * 3 + 2] = z;
          }

          arrE[i].visible = arrE[i].visible && P.showE;
          arrB[i].visible = arrB[i].visible && P.showB;
        }
        envE.visible = P.showE;
        envB.visible = P.showB;
        envE.geometry.attributes.position.needsUpdate = true;
        envE.geometry.computeBoundingSphere();
        envB.geometry.attributes.position.needsUpdate = true;
        envB.geometry.computeBoundingSphere();

        // 坡印廷矢量：S ∝ E × B，沿 +z，强度 ∝ E²
        for (var m = 0; m < arrS.length; m++) {
          var zs = -L / 2 + L * (m + 0.5) / arrS.length;
          var psi2 = k * zs - omega * t;
          var mag = P.polar === 'linear'
            ? Math.pow(Math.sin(psi2), 2) * P.amp * P.amp * 0.3
            : P.amp * P.amp * 0.3;
          _o.set(0, 0, zs);
          _d.set(0, 0, 1);
          if (P.showS && mag > 0.05) arrS[m].set(_o, _d, mag, 0.05);
          else arrS[m].visible = false;
        }

        // 波前平面随相位推进
        frontGroup.visible = P.front;
        if (P.front) {
          var spacing = P.wl;
          for (var q = 0; q < fronts.length; q++) {
            var zp = ((q * spacing + omega * t * cVis * 2) % (L + 8)) - L / 2 - 4;
            fronts[q].position.z = zp;
            fronts[q].visible = true;
          }
        }

        if (ctx.setNote) {
          ctx.setNote(
            '<div class="note-row"><span>波长 λ</span><b>' + P.wl.toFixed(1) + '</b></div>' +
            '<div class="note-row"><span>波数 k</span><b>' + k.toFixed(3) + ' = 2π/λ</b></div>' +
            '<div class="note-row"><span>振幅比</span><b>E / B = c</b></div>' +
            '<div class="note-row"><span>偏振</span><b>' + (P.polar === 'linear' ? '线偏振' : '圆偏振（左旋）') + '</b></div>'
          );
        }
      },

      setParam: function (key, v) {
        P[key] = v;
        if (key === 'amp') {
          lbE.position.y = P.amp + 1.4;
          lbB.position.x = -P.amp - 1.4;
        }
      },

      onClick: function () {
        HL.toast('麦克斯韦方程组（真空）：∇·E = ρ/ε₀　∇·B = 0　∇×E = −∂B/∂t　∇×B = μ₀J + μ₀ε₀ ∂E/∂t');
      },

      dispose: function () {
        gShaft.dispose(); gHead.dispose();
        MAT.E.dispose(); MAT.B.dispose(); MAT.S.dispose();
      }
    };
  }
});
