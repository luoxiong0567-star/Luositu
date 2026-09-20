/**
 * 场景管理器：负责渲染器生命周期、场景切换、GPU 资源回收、拾取事件分发
 *
 * 场景契约（每个 scenes/*.js 通过 HL.registerScene 注册）：
 * {
 *   id, name, short, icon, desc,
 *   controls: [ {type:'range'|'check'|'button'|'legend', key, label, min, max, step, value, ...} ],
 *   create(ctx) -> { update(dt, t), dispose(), setParam(key, value), onClick(ndc) }
 * }
 */
(function (global) {
  'use strict';

  var scenes = {};
  var order = [];

  function registerScene(def) {
    if (!def || !def.id) throw new Error('场景定义缺少 id');
    scenes[def.id] = def;
    order.push(def.id);
  }

  function allScenes() { return order.map(function (id) { return scenes[id]; }); }
  function getScene(id) { return scenes[id]; }

  /* ---------------- 资源回收 ---------------- */
  function disposeObject(root) {
    if (!root) return;
    root.traverse(function (o) {
      // Sprite 复用 three 内部共享几何，dispose 会影响所有 Sprite，仅释放材质
      if (o.geometry && !o.isSprite) o.geometry.dispose();
      var m = o.material;
      if (m) {
        var list = Array.isArray(m) ? m : [m];
        list.forEach(function (mat) {
          for (var k in mat) {
            if (mat[k] && mat[k].isTexture) mat[k].dispose();
          }
          mat.dispose();
        });
      }
    });
  }

  /* ---------------- 管理器 ---------------- */
  function Manager(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas, antialias: true, alpha: false, powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x05070f, 1);

    this.clock = new THREE.Clock();
    this.inst = null;
    this.def = null;
    this.scene = null;
    this.camera = null;
    this.controls = null;

    this.onFps = null;
    this._fpsAcc = 0;
    this._fpsFrames = 0;
    this._down = null;

    var self = this;
    window.addEventListener('resize', function () { self.resize(); });

    canvas.addEventListener('pointerdown', function (e) {
      // 仅左键/触屏参与拾取；右键已改为旋转，抬起时不应触发场景点击
      var isPick = (e.pointerType === 'touch') || e.button === 0;
      self._down = isPick ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
    });
    canvas.addEventListener('pointerup', function (e) {
      if (!self._down || !self.inst || !self.inst.onClick) return;
      var d = Math.hypot(e.clientX - self._down.x, e.clientY - self._down.y);
      var dt = performance.now() - self._down.t;
      self._down = null;
      if (d > 5 || dt > 500) return;                 // 拖拽视为视角操作，不触发拾取
      var r = canvas.getBoundingClientRect();
      self.inst.onClick({
        x: ((e.clientX - r.left) / r.width) * 2 - 1,
        y: -((e.clientY - r.top) / r.height) * 2 + 1,
        clientX: e.clientX, clientY: e.clientY
      });
    });

    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  Manager.prototype.resize = function () {
    var w = this.canvas.clientWidth || window.innerWidth;
    var h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  };

  Manager.prototype.load = function (id) {
    var def = scenes[id];
    if (!def) return false;

    this.unload();

    this.def = def;
    this.scene = new THREE.Scene();
    var w = this.canvas.clientWidth || 800, h = this.canvas.clientHeight || 600;
    this.camera = new THREE.PerspectiveCamera(def.fov || 50, w / h, 0.05, 40000);
    this.camera.position.set(0, 8, 20);

    this.controls = new HL.Orbit(this.camera, this.canvas, {
      minDistance: def.minDistance || 1.2,
      maxDistance: def.maxDistance || 2000
    });

    var ctx = {
      THREE: THREE,
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      controls: this.controls,
      canvas: this.canvas,
      makeText: makeTextSprite,
      makeStars: makeStarfield,
      glowSprite: makeGlow,
      setNote: function (html) {
        var el = document.getElementById('panelNote');
        if (el) el.innerHTML = html || '';
      }
    };

    this.inst = def.create(ctx) || {};
    this.controls.syncFromCamera();
    this.controls.saveHome();
    this.resize();
    return true;
  };

  Manager.prototype.unload = function () {
    if (this.inst && this.inst.dispose) {
      try { this.inst.dispose(); } catch (e) { console.warn(e); }
    }
    if (this.scene) disposeObject(this.scene);
    if (this.controls) this.controls.dispose();
    this.inst = null; this.def = null;
    this.scene = null; this.camera = null; this.controls = null;
  };

  Manager.prototype.resetView = function () {
    if (this.controls) this.controls.reset();
  };

  Manager.prototype._loop = function () {
    requestAnimationFrame(this._loop);
    var dt = Math.min(this.clock.getDelta(), 0.1);
    var t = this.clock.elapsedTime;

    if (this.scene && this.camera) {
      if (this.inst && this.inst.update) {
        try { this.inst.update(dt, t); } catch (e) {
          console.error(e);
          if (location.search.indexOf('debug=1') >= 0) document.title = 'ERR: ' + e.message;
        }
      }
      if (this.controls) this.controls.update(dt);
      // 场景可自带后处理链：inst.render(renderer, scene, camera) 优先于默认渲染
      if (this.inst && this.inst.render) {
        try { this.inst.render(this.renderer, this.scene, this.camera); }
        catch (e) {
          console.error(e);
          if (location.search.indexOf('debug=1') >= 0) document.title = 'POST-ERR: ' + e.message;
          this.inst.render = null;   // 出错后永久退回默认渲染，保证画面不黑
        }
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    }

    this._fpsAcc += dt; this._fpsFrames++;
    if (this._fpsAcc >= 0.5) {
      if (this.onFps) this.onFps(Math.round(this._fpsFrames / this._fpsAcc));
      this._fpsAcc = 0; this._fpsFrames = 0;
    }
  };

  /* ---------------- 公用素材 ---------------- */

  /** Canvas 文字精灵（用于行星名、元素符号等） */
  function makeTextSprite(text, opt) {
    opt = opt || {};
    var size = opt.size || 64;
    var font = (opt.weight || '600') + ' ' + size + 'px "Microsoft YaHei", "Segoe UI", sans-serif';
    var measure = document.createElement('canvas').getContext('2d');
    measure.font = font;
    var w = Math.ceil(measure.measureText(text).width) + 24;
    var h = Math.ceil(size * 1.45);

    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var c = cv.getContext('2d');
    c.font = font;
    c.textBaseline = 'middle';
    c.textAlign = 'center';
    c.shadowColor = 'rgba(0,0,0,0.95)';
    c.shadowBlur = 10;
    c.fillStyle = opt.color || '#dce7f5';
    c.fillText(text, w / 2, h / 2);

    var tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false
    }));
    var s = (opt.scale || 1) * 0.011;
    sp.scale.set(w * s, h * s, 1);
    sp.renderOrder = 999;
    return sp;
  }

  /** 星空背景 */
  function makeStarfield(count, radius) {
    count = count || 2600;
    radius = radius || 900;
    var pos = new Float32Array(count * 3);
    var col = new Float32Array(count * 3);
    for (var i = 0; i < count; i++) {
      var r = radius * (0.55 + Math.random() * 0.45);
      var th = Math.random() * Math.PI * 2;
      var ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph);
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      var b = 0.45 + Math.random() * 0.55;
      var tint = Math.random();
      col[i * 3] = b * (tint > 0.7 ? 1 : 0.82);
      col[i * 3 + 1] = b * 0.9;
      col[i * 3 + 2] = b;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var m = new THREE.PointsMaterial({
      size: 1.6, sizeAttenuation: false, vertexColors: true,
      transparent: true, opacity: 0.9, depthWrite: false
    });
    return new THREE.Points(g, m);
  }

  /** 径向渐变光晕贴图（太阳、发光节点） */
  function makeGlow(color) {
    var cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    var c = cv.getContext('2d');
    var g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, color || 'rgba(255,200,90,0.75)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
    var tex = new THREE.CanvasTexture(cv);
    return new THREE.SpriteMaterial({
      map: tex, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false
    });
  }

  global.HL = global.HL || {};
  global.HL.registerScene = registerScene;
  global.HL.allScenes = allScenes;
  global.HL.getScene = getScene;
  global.HL.Manager = Manager;
  global.HL.disposeObject = disposeObject;

})(window);
