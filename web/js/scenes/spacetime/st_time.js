/**
 * ③ 引力时间膨胀：同一秒，地面和卫星上不一样长
 *
 * 弱场：Δτ/τ ≈ ΔΦ/c² − v²/(2c²)
 *   引力项让高处的钟变快，速度项让飞着的钟变慢。
 * GPS（高度约 20200 km）净效果约 +39 μs/天；不修正，定位每天漂 ~12 km。
 * 近地轨道反过来：速度项赢，钟变慢。
 * 画面上的指针把这点差额放大到肉眼能看，卡片上的微秒是真实数量级。
 */
(function (global) {
  'use strict';

  var ST = global.HL.ST;
  var GRAV = global.HL.GRAV;
  var K = GRAV.K;
  var PFX = 'time_';
  function C(o) { o.key = PFX + o.key; return o; }

  var C_LIGHT = 299792458;
  var MU = K.G * K.MEARTH;
  var RE = K.REARTH;
  var V_SURF = 2 * Math.PI * RE / 86164.0905;
  var RE_KM = RE / 1000;
  var R_SCENE = 2.35;

  function rates(altKm) {
    var r = RE + altKm * 1000;
    var v = Math.sqrt(MU / r);
    var gr = ((-MU / r) - (-MU / RE)) / (C_LIGHT * C_LIGHT);
    var sr = ((-v * v / 2) - (-V_SURF * V_SURF / 2)) / (C_LIGHT * C_LIGHT);
    var day = 86400 * 1e6;
    return { gr: gr * day, sr: sr * day, net: (gr + sr) * day, v: v, r: r };
  }

  function signedUs(x) {
    var sign = x >= 0 ? '+' : '−';
    return sign + GRAV.fix(Math.abs(x), 1) + ' μs/天';
  }

  ST.registerSub({
    id: 'time',
    name: '时间膨胀',
    tab: '③ 时间',
    desc: 'GPS 必须修正的那几十微秒，来自引力让钟变快',
    view: [[12, 8.5, 16], [0, 0.4, 0]],
    defaults: { alt: 20200, preset: 'gps', speed: 1 },
    controls: [
      C({
        type: 'buttons', key: 'preset', label: '轨道预设', value: 'gps', options: [
          { label: '近地', value: 'leo' },
          { label: 'GPS', value: 'gps' },
          { label: '同步', value: 'geo' }
        ]
      }),
      C({ type: 'range', key: 'alt', label: '轨道高度', min: 200, max: 36000, step: 100, value: 20200, unit: ' km' }),
      C({ type: 'range', key: 'speed', label: '时间流速', min: 0, max: 2.5, step: 0.05, value: 1, unit: '×' }),
      {
        type: 'legend', items: [
          ['地面钟', '#7ec8ff'],
          ['星载钟', '#ffcf6b'],
          ['净变快', '#7cf0d0'],
          ['净变慢', '#ff8aa3']
        ]
      }
    ],

    init: function (api) {
      var THREE = api.THREE, G = api.group, P = api.P, hud = api.hud;
      G.add(api.stars(1000, 760, 1.4));

      var earth = GRAV.body(THREE, {
        r: R_SCENE, color: 0x1a4f86, rim: 0x8fd0ff, opacity: 0.94,
        wireOpacity: 0.2, haloScale: 3.3, power: 2.2, detail: 2
      });
      G.add(earth);

      var orbitLineGeo = new THREE.BufferGeometry();
      var orbitN = 160;
      var orbitArr = new Float32Array(orbitN * 3);
      orbitLineGeo.setAttribute('position', new THREE.BufferAttribute(orbitArr, 3));
      var orbitLine = new THREE.LineLoop(orbitLineGeo, new THREE.LineBasicMaterial({
        color: 0xffcf6b, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      G.add(orbitLine);

      var linkGeo = new THREE.BufferGeometry();
      linkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      var link = new THREE.Line(linkGeo, new THREE.LineBasicMaterial({
        color: 0x4de2ff, transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      G.add(link);

      var sat = GRAV.orb(THREE, 0.38, 0xffe0a0, 6.2);
      G.add(sat);

      function makeClock(hex) {
        var g = new THREE.Group();
        var mat = new THREE.MeshBasicMaterial({
          color: hex, transparent: true, opacity: 0.9,
          blending: THREE.AdditiveBlending, depthWrite: false
        });
        var face = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.028, 8, 48), mat);
        g.add(face);
        var ticks = new THREE.Group();
        var ti;
        for (ti = 0; ti < 12; ti++) {
          var tick = new THREE.Mesh(new THREE.BoxGeometry(0.035, ti % 3 === 0 ? 0.16 : 0.09, 0.03), mat);
          var a = ti / 12 * Math.PI * 2;
          tick.position.set(Math.sin(a) * 0.58, Math.cos(a) * 0.58, 0);
          tick.rotation.z = -a;
          ticks.add(tick);
        }
        g.add(ticks);
        var handPivot = new THREE.Group();
        var hand = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.48, 0.04), mat);
        hand.position.y = 0.2;
        handPivot.add(hand);
        g.add(handPivot);
        g.userData.hand = handPivot;
        return g;
      }

      var groundClock = makeClock(0x7ec8ff);
      groundClock.scale.setScalar(1.15);
      G.add(groundClock);
      var orbitClock = makeClock(0xffcf6b);
      orbitClock.scale.setScalar(1.45);
      G.add(orbitClock);
      var gTag = api.label('地面钟', { color: '#c5e4ff', scale: 0.72, size: 42 });
      var oTag = api.label('星载钟', { color: '#ffe3ad', scale: 0.72, size: 42 });
      G.add(gTag); G.add(oTag);

      function sceneR(altKm) {
        return R_SCENE * (RE_KM + altKm) / RE_KM;
      }

      function layoutOrbit() {
        var r = sceneR(P.alt);
        var i;
        for (i = 0; i < orbitN; i++) {
          var a = i / orbitN * Math.PI * 2;
          orbitArr[i * 3] = Math.cos(a) * r;
          orbitArr[i * 3 + 1] = 0;
          orbitArr[i * 3 + 2] = Math.sin(a) * r;
        }
        orbitLineGeo.attributes.position.needsUpdate = true;
        orbitLineGeo.computeBoundingSphere();
      }

      var ang = 2.35;
      var handG = 0, handO = 0;

      function presetOf(alt) {
        if (Math.abs(alt - 400) < 180) return 'leo';
        if (Math.abs(alt - 20200) < 280) return 'gps';
        if (Math.abs(alt - 35786) < 450) return 'geo';
        return 'none';
      }
      function altOf(preset) {
        if (preset === 'leo') return 400;
        if (preset === 'gps') return 20200;
        if (preset === 'geo') return 35786;
        return null;
      }

      var card = hud.card({
        title: '引力时间膨胀',
        accent: GRAV.CSS.gold,
        badge: 'GPS',
        tex: '\\dfrac{\\Delta\\tau}{\\tau}\\approx\\dfrac{\\Delta\\Phi}{c^{2}}-\\dfrac{v^{2}}{2c^{2}}',
        note: '第一项是引力：越高越快。第二项是速度：越快越慢。指针把差额放大到看得见，下面的微秒是按地球真实质量算的。',
        rows: [['引力项', '—'], ['速度项', '—'], ['净差', '—'], ['定位漂移', '—']]
      });

      var plotCard = hud.card({
        title: '高度 — 每天差多少',
        accent: GRAV.CSS.cyan,
        badge: 'μs',
        tex: '\\Delta\\tau_{\\mathrm{net}}=\\Delta\\tau_{\\Phi}+\\Delta\\tau_{v}',
        note: '曲线过零处两种效应抵消。左边近地变慢，右边 GPS / 同步轨道变快。',
        plot: {
          w: 300, h: 92,
          draw: function (ctx, w, hgt) {
            ctx.clearRect(0, 0, w, hgt);
            var minA = 200, maxA = 36000;
            var samples = [];
            var i, ymin = 0, ymax = 0;
            for (i = 0; i <= 48; i++) {
              var alt = minA + (maxA - minA) * i / 48;
              var net = rates(alt).net;
              samples.push(net);
              if (net < ymin) ymin = net;
              if (net > ymax) ymax = net;
            }
            ymin -= 4; ymax += 4;
            function X(alt) { return 28 + (w - 40) * (alt - minA) / (maxA - minA); }
            function Y(net) { return 12 + (hgt - 28) * (1 - (net - ymin) / (ymax - ymin)); }
            var y0 = Y(0);
            ctx.strokeStyle = 'rgba(143,163,189,0.45)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(28, y0); ctx.lineTo(w - 12, y0); ctx.stroke();
            ctx.beginPath();
            for (i = 0; i < samples.length; i++) {
              var alt2 = minA + (maxA - minA) * i / (samples.length - 1);
              var px = X(alt2), py = Y(samples[i]);
              if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.strokeStyle = '#7cf0d0';
            ctx.lineWidth = 1.7;
            ctx.stroke();
            var mx = X(Math.max(minA, Math.min(maxA, P.alt)));
            var my = Y(rates(P.alt).net);
            ctx.fillStyle = '#ffcf6b';
            ctx.beginPath(); ctx.arc(mx, my, 3.6, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#8fa3bd';
            ctx.font = '10px sans-serif';
            ctx.fillText('近地', 28, hgt - 4);
            ctx.fillText('GPS', X(20200) - 10, hgt - 4);
          }
        }
      });

      layoutOrbit();
      if (api.setNote) api.setNote('切「近地 / GPS / 同步」。低轨钟变慢，GPS 高度开始变快——两种效应在抢。');

      return {
        update: function (dt, t) {
          var raw = dt;
          if (!(raw > 0 && raw < 0.5)) raw = 0.016;
          var step = Math.min(0.05, raw) * (P.speed > 0 ? P.speed : 0);
          var info = rates(P.alt);
          var r = sceneR(P.alt);
          if (step > 0) ang += step * 0.55 * Math.sqrt(10 / Math.max(3, r));
          var sx = Math.cos(ang) * r;
          var sz = Math.sin(ang) * r;
          sat.position.set(sx, 0, sz);
          var lp = linkGeo.attributes.position.array;
          lp[0] = sx * (R_SCENE / r); lp[1] = 0; lp[2] = sz * (R_SCENE / r);
          lp[3] = sx; lp[4] = 0; lp[5] = sz;
          linkGeo.attributes.position.needsUpdate = true;

          earth.rotation.y = (t || 0) * 0.15;

          var boost = Math.max(-0.42, Math.min(0.6, info.net / 38.6 * 0.24));
          var base = 1.15 * (P.speed > 0 ? Math.min(P.speed, 1.4) : 0.35);
          handG += step * base;
          handO += step * base * (1 + boost);
          groundClock.userData.hand.rotation.z = -handG;
          orbitClock.userData.hand.rotation.z = -handO;

          groundClock.position.set(-6.4, 2.5, 0.4);
          orbitClock.position.set(sx + sx / r * 1.35, 1.15, sz + sz / r * 1.35);
          if (api.camera) {
            groundClock.lookAt(api.camera.position);
            orbitClock.lookAt(api.camera.position);
          }
          gTag.position.set(-6.4, 3.7, 0.4);
          oTag.position.set(orbitClock.position.x, orbitClock.position.y + 1.15, orbitClock.position.z);

          var km = info.net * C_LIGHT / 1e9;
          var tone = info.net >= 0 ? GRAV.CSS.mint : GRAV.CSS.rose;
          card.setBadge(info.net >= 0 ? '净变快' : '净变慢', tone);
          card.setRows([
            ['引力项（高处更快）', signedUs(info.gr)],
            ['速度项（飞着更慢）', signedUs(info.sr)],
            ['净差', signedUs(info.net)],
            ['若不修正，每天漂', GRAV.fix(km, 1) + ' km']
          ]);
          if (plotCard.plot) plotCard.plot.redraw();
        },
        setParam: function (key, value) {
          if (key === 'preset') {
            var alt = altOf(value);
            if (alt == null) return;
            P.alt = alt;
            if (global.HL.ui && global.HL.ui.sync) global.HL.ui.sync(PFX + 'alt', alt);
            layoutOrbit();
          } else if (key === 'alt') {
            layoutOrbit();
            var p = presetOf(P.alt);
            if (global.HL.ui && global.HL.ui.sync) global.HL.ui.sync(PFX + 'preset', p);
          }
        }
      };
    }
  });

})(window);
