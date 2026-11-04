/**
 * ② 光线偏折 / 引力透镜
 *
 * 侧视：光线在等效折射率 n ≈ 1 + r_s/r 里弯向质量（弱场，帮助看形状）。
 * 正视：同一团质量把背后的光源映成双像；对准时合成爱因斯坦环。
 * 偏折角读数用真实弱场公式 α = 4GM/(c²b)，并以掠日 1.75″ 为尺。
 */
(function (global) {
  'use strict';

  var ST = global.HL.ST;
  var GRAV = global.HL.GRAV;
  var PFX = 'lens_';
  function C(o) { o.key = PFX + o.key; return o; }

  var SRC_N = 52;
  var RAY_N = 8;
  var MAX_PT = 280;

  ST.registerSub({
    id: 'lens',
    name: '引力透镜',
    tab: '② 透镜',
    desc: '星光绕过质量，对准时合成一枚爱因斯坦环',
    view: [[16, 6.5, 16], [0, 0, 0]],
    defaults: { M: 1.3, align: 0.42, speed: 1, rays: true },
    controls: [
      C({ type: 'range', key: 'M', label: '透镜质量 M', min: 0.4, max: 4.2, step: 0.1, value: 1.3, unit: ' M☉' }),
      C({ type: 'range', key: 'align', label: '源的偏开', min: 0, max: 1, step: 0.01, value: 0.42 }),
      C({ type: 'range', key: 'speed', label: '光子流速', min: 0, max: 2.4, step: 0.05, value: 1, unit: '×' }),
      C({ type: 'check', key: 'rays', label: '画出弯曲光线', value: true }),
      {
        type: 'legend', items: [
          ['弯曲光线', '#ffcf6b'],
          ['透镜质量', '#d2b4ff'],
          ['爱因斯坦像', '#7cf0d0'],
          ['光源真实位置', '#8fa3bd']
        ]
      }
    ],

    init: function (api) {
      var THREE = api.THREE, G = api.group, P = api.P, hud = api.hud;
      G.add(api.stars(1100, 780, 1.45));

      var mass = GRAV.body(THREE, {
        r: 0.78, color: 0x1a1028, rim: 0xd2b4ff, opacity: 0.95,
        wireOpacity: 0.34, haloScale: 6.2, power: 2.6, glow: 1.05
      });
      G.add(mass);

      var ring = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.018, 8, 160),
        new THREE.MeshBasicMaterial({
          color: 0x7cf0d0, transparent: true, opacity: 0.55,
          blending: THREE.AdditiveBlending, depthWrite: false
        })
      );
      ring.rotation.y = Math.PI / 2;
      G.add(ring);

      var srcPos = new Float32Array(SRC_N * 3);
      var srcCol = new Float32Array(SRC_N * 3);
      var srcGeo = new THREE.BufferGeometry();
      srcGeo.setAttribute('position', new THREE.BufferAttribute(srcPos, 3));
      srcGeo.setAttribute('color', new THREE.BufferAttribute(srcCol, 3));
      var srcPts = new THREE.Points(srcGeo, new THREE.PointsMaterial({
        size: 0.42, vertexColors: true, transparent: true, opacity: 0.85,
        depthWrite: false, blending: THREE.AdditiveBlending, map: GRAV.dotTexture(THREE)
      }));
      srcPts.frustumCulled = false;
      G.add(srcPts);

      var imgPos = new Float32Array(SRC_N * 2 * 3);
      var imgCol = new Float32Array(SRC_N * 2 * 3);
      var imgGeo = new THREE.BufferGeometry();
      imgGeo.setAttribute('position', new THREE.BufferAttribute(imgPos, 3));
      imgGeo.setAttribute('color', new THREE.BufferAttribute(imgCol, 3));
      var imgPts = new THREE.Points(imgGeo, new THREE.PointsMaterial({
        size: 0.34, vertexColors: true, transparent: true, opacity: 0.95,
        depthWrite: false, blending: THREE.AdditiveBlending, map: GRAV.dotTexture(THREE)
      }));
      imgPts.frustumCulled = false;
      G.add(imgPts);

      var rays = [];
      var bi;
      for (bi = 0; bi < RAY_N; bi++) {
        var arr = new Float32Array(MAX_PT * 3);
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        geo.setDrawRange(0, 0);
        var line = new THREE.Line(geo, new THREE.LineBasicMaterial({
          color: 0xffcf6b, transparent: true, opacity: 0.72,
          blending: THREE.AdditiveBlending, depthWrite: false
        }));
        line.frustumCulled = false;
        G.add(line);
        var photon = GRAV.orb(THREE, 0.12, 0xffe3a3, 6);
        G.add(photon);
        rays.push({ line: line, arr: arr, geo: geo, count: 0, photon: photon, phase: bi / RAY_N });
      }

      var tagLens = api.label('透镜质量', { color: '#e6d4ff', scale: 0.82, size: 44 });
      tagLens.position.set(0, 2.15, 0);
      G.add(tagLens);
      var tagSrc = api.label('背景光源', { color: '#b7c6da', scale: 0.78, size: 42 });
      G.add(tagSrc);
      var tagObs = api.label('观测者', { color: '#d5ecff', scale: 0.78, size: 42 });
      tagObs.position.set(13.2, 1.3, 0);
      G.add(tagObs);
      var eye = GRAV.orb(THREE, 0.18, 0xbfe9ff, 5);
      eye.position.set(13.2, 0, 0);
      G.add(eye);

      // 固定的小团块形状，避免每帧重新抽随机
      var blob = [];
      for (bi = 0; bi < SRC_N; bi++) {
        var u = Math.random();
        var ang = Math.random() * Math.PI * 2;
        var rad = 0.15 + 0.85 * Math.sqrt(u);
        blob.push({ y: Math.cos(ang) * rad, z: Math.sin(ang) * rad });
      }

      function thetaE() { return 2.55 * Math.sqrt(Math.max(0.2, P.M)); }
      function rsVis() { return Math.min(1.75, 0.78 * P.M); }
      function massR() { return 0.7 + 0.08 * P.M; }

      function trace(b, rs) {
        var x = -15, z = b, dx = 1, dz = 0;
        var out = [];
        var ds = 0.11;
        var i, prev = 0;
        for (i = 0; i < MAX_PT; i++) {
          out.push(x, 0.04, z);
          var r = Math.sqrt(x * x + z * z);
          if (r < Math.max(0.9, massR())) break;
          r = Math.max(r, 0.55);
          var n = 1 + rs / r;
          var inv = -rs / (r * r * r);
          var gx = inv * x, gz = inv * z;
          var udg = dx * gx + dz * gz;
          dx += (gx - dx * udg) / n * ds;
          dz += (gz - dz * udg) / n * ds;
          var L = Math.sqrt(dx * dx + dz * dz) || 1;
          dx /= L; dz /= L;
          var ang = Math.atan2(dz, dx);
          if (i > 8 && Math.abs(ang - prev) > 0.9 && Math.abs(ang) > 1.6) break;
          prev = ang;
          x += dx * ds; z += dz * ds;
          if (x > 13.2) break;
        }
        return out;
      }

      function rebuildRays() {
        var rs = rsVis();
        var bs = [-7.4, -5.1, -3.4, -2.15, 2.15, 3.4, 5.1, 7.4];
        var i, j;
        for (i = 0; i < RAY_N; i++) {
          var flat = trace(bs[i], rs);
          var count = flat.length / 3;
          var arr = rays[i].arr;
          for (j = 0; j < flat.length && j < MAX_PT * 3; j++) arr[j] = flat[j];
          rays[i].count = count;
          rays[i].geo.setDrawRange(0, count);
          rays[i].geo.attributes.position.needsUpdate = true;
          rays[i].geo.computeBoundingSphere();
          rays[i].photon.visible = count > 2 && P.rays !== false;
          rays[i].line.visible = P.rays !== false;
        }
      }

      function layoutImages() {
        var te = thetaE();
        var shift = P.align * te * 1.55;
        var blobR = 0.42;
        var i, p = 0;
        for (i = 0; i < SRC_N; i++) {
          var sy = blob[i].y * blobR;
          var sz = shift + blob[i].z * blobR;
          srcPos[i * 3] = -6.4;
          srcPos[i * 3 + 1] = sy;
          srcPos[i * 3 + 2] = sz;
          srcCol[i * 3] = 0.55; srcCol[i * 3 + 1] = 0.62; srcCol[i * 3 + 2] = 0.72;

          var beta = Math.sqrt(sy * sy + sz * sz);
          var uy, uz, tp, tm;
          if (beta < 1e-3) {
            var a = (i / SRC_N) * Math.PI * 2;
            uy = Math.cos(a); uz = Math.sin(a);
            tp = te; tm = te;
          } else {
            uy = sy / beta; uz = sz / beta;
            var disc = Math.sqrt(beta * beta + 4 * te * te);
            tp = 0.5 * (beta + disc);
            tm = 0.5 * (beta - disc);
          }
          imgPos[p] = 0; imgPos[p + 1] = uy * tp; imgPos[p + 2] = uz * tp;
          var mag = beta < 1e-3 ? 1 : Math.min(2.2, Math.sqrt(Math.abs(tp / Math.max(beta, 0.15))));
          imgCol[p] = 0.45 * mag; imgCol[p + 1] = 0.95 * mag; imgCol[p + 2] = 0.82 * mag;
          p += 3;
          imgPos[p] = 0; imgPos[p + 1] = uy * tm; imgPos[p + 2] = uz * tm;
          imgCol[p] = 0.35; imgCol[p + 1] = 0.75; imgCol[p + 2] = 0.68;
          p += 3;
        }
        srcGeo.attributes.position.needsUpdate = true;
        srcGeo.attributes.color.needsUpdate = true;
        srcGeo.computeBoundingSphere();
        imgGeo.attributes.position.needsUpdate = true;
        imgGeo.attributes.color.needsUpdate = true;
        imgGeo.computeBoundingSphere();

        ring.scale.setScalar(te);
        ring.material.opacity = 0.12 + 0.62 * (1 - Math.min(1, P.align));
        tagSrc.position.set(-6.4, blobR + 1.35, shift);
        mass.scale.setScalar(massR());
      }

      var card = hud.card({
        title: '光线偏折',
        accent: GRAV.CSS.gold,
        badge: '1919',
        tex: '\\alpha=\\dfrac{4GM}{c^{2}b}=\\dfrac{2r_{s}}{b}',
        note: '内侧那对光线按「贴着太阳表面擦过」来读数。M = 1 时就是日全食里的 1.75″；牛顿光微粒说只预言一半。',
        rows: [['偏折角 α', '—'], ['内侧光线', '—'], ['爱因斯坦环尺度', '—']]
      });
      hud.card({
        title: '透镜方程',
        accent: GRAV.CSS.mint,
        badge: '天空',
        tex: '\\beta=\\theta-\\dfrac{\\theta_{E}^{2}}{\\theta}',
        note: 'β 是光源真实的偏开，θ 是我们看见的像。β = 0 时像落在整圈 θ_E 上，那就是爱因斯坦环。青绿色的点是像，灰点是光源本来的位置。'
      });

      rebuildRays();
      layoutImages();
      if (api.setNote) api.setNote('金色光线是侧视的测地线；青点是观测者在天上看见的像。把「源的偏开」拉到 0，环会合上。');

      var tAcc = 0;

      return {
        update: function (dt) {
          var raw = dt;
          if (!(raw > 0 && raw < 0.5)) raw = 0.016;
          tAcc += Math.min(0.05, raw) * (P.speed > 0 ? P.speed : 0);
          var show = P.rays !== false;
          var i;
          for (i = 0; i < RAY_N; i++) {
            var ray = rays[i];
            ray.line.visible = show;
            ray.photon.visible = show && ray.count > 2;
            if (!show || ray.count < 2) continue;
            var u = (tAcc * 0.22 + ray.phase) % 1;
            var f = u * (ray.count - 1);
            var i0 = Math.floor(f);
            if (i0 >= ray.count - 1) i0 = ray.count - 2;
            var fr = f - i0;
            var a = ray.arr;
            var x0 = a[i0 * 3], y0 = a[i0 * 3 + 1], z0 = a[i0 * 3 + 2];
            var x1 = a[(i0 + 1) * 3], y1 = a[(i0 + 1) * 3 + 1], z1 = a[(i0 + 1) * 3 + 2];
            ray.photon.position.set(x0 + (x1 - x0) * fr, y0 + (y1 - y0) * fr, z0 + (z1 - z0) * fr);
          }
          var arcsec = 1.7517 * P.M;
          card.setRows([
            ['偏折角 α', GRAV.fix(arcsec, 2) + '″'],
            ['内侧光线', '1 R☉ · 掠日'],
            ['环的半径 θ_E', GRAV.fix(thetaE(), 2) + ' 格']
          ]);
        },
        setParam: function (key) {
          if (key === 'M') { rebuildRays(); layoutImages(); }
          else if (key === 'align') layoutImages();
          else if (key === 'rays') rebuildRays();
        }
      };
    }
  });

})(window);
