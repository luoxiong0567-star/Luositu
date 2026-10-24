/**
 * HL.Tour —— 通用讲解模式引擎（框架层）
 *
 * 任何场景只要在 controls 里加一项 { type:'button', key:'tour', label:'📖 讲解模式' }，
 * 并在 create 里构造讲解步骤数组，即可获得：
 *   · 暂停模拟（dt=0 + 时间冻结）
 *   · 相机缓动飞行到该步最佳视角
 *   · 脉冲光环高亮（支持跟随运动天体）
 *   · 底部旁白卡片（标题 / 进度 / 解说 / 参数实验建议 / 上一步 / 下一步 / 退出）
 *
 * 用法（场景 create 内）：
 *   var tour = HL.Tour(ctx);
 *   tour.load(steps);
 *   return {
 *     update: function (dt, t) {
 *       tour.update(dt, t, function (ddt, tt) { ...场景模拟... });
 *     },
 *     setParam: function (key, v) { if (key === 'tour') tour.toggle(); ... },
 *     dispose: function () { tour.dispose(); }
 *   };
 *
 * 步骤定义 steps[i]：
 *   { t: 标题, d: 解说, exp: 实验建议,
 *     cam: [[px,py,pz],[tx,ty,tz]] 或 function(){ return [[..],[..]] },
 *     pulse: [x,y,z] 或 function(){ return THREE.Vector3 },
 *     r: 光环半径（默认 2），apply: function(){} }
 */
(function (window) {
  var HL = window.HL = window.HL || {};

  function glowTexture(THREE, rgba) {
    var cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    var c = cv.getContext('2d');
    var g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, rgba || 'rgba(127,212,255,0.55)');
    g.addColorStop(0.45, 'rgba(127,212,255,0.14)');
    g.addColorStop(1, 'rgba(127,212,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(cv);
  }

  HL.Tour = function (ctx, opt) {
    opt = opt || {};
    var THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera, controls = ctx.controls;
    var stage = ctx.stage || document.getElementById('stage');
    var accent = opt.accent === undefined ? 0x7fd4ff : opt.accent;
    var FLY = opt.flySeconds || 1.1;
    var DEF_R = opt.defaultR || 2;

    var steps = null, idx = 0, running = false;
    var fly = null, pulse = null, ui = null;
    var frozenT = 0, lastT = 0;

    /* ---------------- 旁白卡片 UI ---------------- */
    function ensureUi() {
      if (ui) return ui;
      var root = document.createElement('div');
      root.id = 'hlTour';
      stage.appendChild(root);
      root.innerHTML =
        '<div class="gt-card">' +
        '<div class="gt-head"><span class="gt-book">📖</span><b class="gt-title"></b>' +
        '<span class="gt-step"></span></div>' +
        '<div class="gt-body"></div>' +
        '<div class="gt-exp"></div>' +
        '<div class="gt-btns">' +
        '<button class="gt-prev">← 上一步</button>' +
        '<button class="gt-next">下一步 →</button>' +
        '<button class="gt-exit">✕ 退出讲解</button>' +
        '</div></div>';
      root.querySelector('.gt-prev').addEventListener('click', function () {
        if (running && idx > 0) go(idx - 1);
      });
      root.querySelector('.gt-next').addEventListener('click', function () {
        if (!running) return;
        if (idx < steps.length - 1) go(idx + 1); else stop();
      });
      root.querySelector('.gt-exit').addEventListener('click', stop);
      ui = {
        root: root,
        title: root.querySelector('.gt-title'),
        step: root.querySelector('.gt-step'),
        body: root.querySelector('.gt-body'),
        exp: root.querySelector('.gt-exp'),
        prev: root.querySelector('.gt-prev'),
        next: root.querySelector('.gt-next')
      };
      return ui;
    }

    /* ---------------- 脉冲光环 ---------------- */
    function ensurePulse() {
      if (pulse) return pulse;
      var g = new THREE.Group();
      var breathe = new THREE.Group();
      var rings = new THREE.Group();
      var mat = new THREE.MeshBasicMaterial({
        color: accent, transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false
      });
      var r1 = new THREE.Mesh(new THREE.TorusGeometry(1, 0.028, 8, 64), mat);
      r1.rotation.x = Math.PI / 2;
      var r2 = new THREE.Mesh(new THREE.TorusGeometry(1, 0.028, 8, 64), mat.clone());
      var glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(THREE, 'rgba(127,212,255,0.5)'),
        transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending
      }));
      glow.scale.setScalar(1.7);
      rings.add(r1); rings.add(r2); rings.add(glow);
      breathe.add(rings);
      g.add(breathe);
      g.visible = false;
      g.userData = { breathe: breathe, rings: rings, r1: r1, r2: r2 };
      scene.add(g);
      pulse = g;
      return pulse;
    }

    function startFly(pos, tgt) {
      fly = {
        k: 0,
        p0: camera.position.clone(), t0: controls.target.clone(),
        p1: new THREE.Vector3(pos[0], pos[1], pos[2]),
        t1: new THREE.Vector3(tgt ? tgt[0] : 0, tgt ? tgt[1] : 0, tgt ? tgt[2] : 0)
      };
    }

    function go(i) {
      if (!steps || !steps.length) return;
      idx = Math.max(0, Math.min(steps.length - 1, i));
      var s = steps[idx];
      var u = ensureUi();
      u.title.textContent = s.t || '';
      u.step.textContent = (idx + 1) + ' / ' + steps.length;
      u.body.textContent = s.d || '';
      u.exp.style.display = s.exp ? '' : 'none';
      u.exp.textContent = s.exp ? '💡 实验建议：' + s.exp : '';
      u.prev.style.visibility = idx > 0 ? '' : 'hidden';
      u.next.textContent = idx < steps.length - 1 ? '下一步 →' : '完成 ✓';

      var cam = (typeof s.cam === 'function') ? s.cam() : s.cam;
      if (cam) startFly(cam[0], cam[1]);

      if (s.pulse) {
        var p = ensurePulse();
        p.visible = true;
        // r 支持数字或函数：尺度可切换的场景（如太阳系真实比例）需要按当前尺度算半径
        var pr = (typeof s.r === 'function') ? s.r() : (s.r || DEF_R);
        if (!isFinite(pr) || pr <= 0) pr = DEF_R;
        p.userData.rings.scale.setScalar(pr);
      } else if (pulse) pulse.visible = false;

      if (s.apply) { try { s.apply(); } catch (e) { /* 忽略 */ } }
    }

    function start() {
      if (!steps || !steps.length) return;
      running = true;
      frozenT = lastT;
      ensureUi().root.classList.add('show');
      go(0);
    }

    function stop() {
      running = false;
      fly = null;
      if (pulse) pulse.visible = false;
      if (ui) ui.root.classList.remove('show');
    }

    return {
      /** 装载（或更换）讲解步骤；正在讲解时从头重新播放 */
      load: function (list) {
        steps = list || null;
        if (running) { stop(); start(); }
      },
      start: start,
      stop: stop,
      toggle: function () { if (running) stop(); else start(); },
      active: function () { return running; },
      idx: function () { return idx; },
      count: function () { return steps ? steps.length : 0; },
      /** 每帧调用：dt 为真实帧间隔（飞行动画用），sim 为场景模拟回调 */
      update: function (dt, t, sim) {
        lastT = t;
        if (fly) {
          fly.k = Math.min(1, fly.k + dt / FLY);
          var e = fly.k < 0.5 ? 2 * fly.k * fly.k : 1 - Math.pow(-2 * fly.k + 2, 2) / 2;
          camera.position.lerpVectors(fly.p0, fly.p1, e);
          controls.target.lerpVectors(fly.t0, fly.t1, e);
          if (controls.syncFromCamera) controls.syncFromCamera();
          if (fly.k >= 1) fly = null;
        }
        if (pulse && pulse.visible) {
          var s = steps ? steps[idx] : null;
          if (s && s.pulse) {
            var v = (typeof s.pulse === 'function') ? s.pulse() : s.pulse;
            if (v) pulse.position.set(v.x || v[0] || 0, v.y || v[1] || 0, v.z || v[2] || 0);
          }
          pulse.userData.r1.rotation.z += dt * 1.4;
          pulse.userData.r2.rotation.z -= dt * 1.1;
          pulse.userData.breathe.scale.setScalar(1 + Math.sin(t * 3.2) * 0.10);
        }
        if (sim) sim(running ? 0 : dt, running ? frozenT : t);
      },
      dispose: function () {
        stop();
        if (pulse) { scene.remove(pulse); HL.disposeObject && HL.disposeObject(pulse); pulse = null; }
        if (ui) { if (ui.root.parentNode) ui.root.parentNode.removeChild(ui.root); ui = null; }
        steps = null;
      }
    };
  };

})(window);
