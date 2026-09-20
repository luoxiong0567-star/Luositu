/**
 * 轻量轨道控制器（UMD，无 ES module 依赖）
 * 左键拖拽平移 / 右键拖拽旋转 / 滚轮缩放（Shift+左键 或 中键 亦可旋转/平移）
 * 触屏：单指旋转，双指捏合缩放并整体平移
 * 依赖全局 THREE
 */
(function (global) {
  'use strict';

  var EPS = 0.000001;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function Orbit(camera, dom, opts) {
    opts = opts || {};
    this.camera = camera;
    this.dom = dom;

    this.target = new THREE.Vector3();
    this.minDistance = opts.minDistance || 1;
    this.maxDistance = opts.maxDistance || 4000;
    this.minPolarAngle = opts.minPolarAngle || 0.02;
    this.maxPolarAngle = opts.maxPolarAngle || Math.PI - 0.02;
    this.enableDamping = true;
    this.dampingFactor = 0.12;
    this.rotateSpeed = 1.0;
    this.zoomSpeed = 1.0;
    this.autoRotate = false;
    this.autoRotateSpeed = 0.18;
    this.enabled = true;

    this._theta = 0;
    this._phi = Math.PI / 2;
    this._radius = 10;
    this._dTheta = 0;
    this._dPhi = 0;
    this._dRadius = 1;
    this._panX = 0;
    this._panY = 0;

    this._mode = 0;          // 0 无 1 旋转 2 平移
    this._px = 0;
    this._py = 0;
    this._pointers = {};
    this._pinchDist = 0;
    this._pinchMid = null;

    this._home = { theta: 0, phi: Math.PI / 2, radius: 10, target: new THREE.Vector3() };

    this._spherical = new THREE.Spherical();
    this._v = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();

    this._bind();
    this.syncFromCamera();
  }

  Orbit.prototype._bind = function () {
    var self = this;
    var el = this.dom;

    el.style.touchAction = 'none';

    el.addEventListener('pointerdown', function (e) {
      if (!self.enabled) return;
      e.preventDefault();                       // 屏蔽中键自动滚动等默认行为
      el.setPointerCapture(e.pointerId);
      self._pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      self._px = e.clientX;
      self._py = e.clientY;
      self._mode = self._pickMode(e);
      self._downPos = { x: e.clientX, y: e.clientY };
    });

    el.addEventListener('pointermove', function (e) {
      if (!self.enabled || !self._mode) return;
      if (self._pointers[e.pointerId]) {
        self._pointers[e.pointerId].x = e.clientX;
        self._pointers[e.pointerId].y = e.clientY;
      }
      var keys = Object.keys(self._pointers);
      if (keys.length >= 2) { self._pinch(keys); return; }

      var dx = e.clientX - self._px;
      var dy = e.clientY - self._py;
      self._px = e.clientX;
      self._py = e.clientY;

      var h = el.clientHeight || 1;
      if (self._mode === 1) {
        self._dTheta -= 2 * Math.PI * dx / h * self.rotateSpeed;
        self._dPhi -= 2 * Math.PI * dy / h * self.rotateSpeed;
      } else {
        self._panX -= dx;
        self._panY -= dy;
      }
    });

    function end(e) {
      delete self._pointers[e.pointerId];
      var keys = Object.keys(self._pointers);
      self._pinchDist = 0;
      self._pinchMid = null;
      if (keys.length === 0) {
        self._mode = 0;
      } else if (keys.length === 1) {
        // 双指抬起一根后接回单指：重新锚定基准点，避免跳变
        if (e.pointerType === 'touch') self._mode = 1;
        self._px = self._pointers[keys[0]].x;
        self._py = self._pointers[keys[0]].y;
      }
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', end);

    el.addEventListener('wheel', function (e) {
      if (!self.enabled) return;
      e.preventDefault();
      var k = Math.pow(0.95, self.zoomSpeed);
      self._dRadius *= (e.deltaY > 0) ? (1 / k) : k;
    }, { passive: false });

    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };

  /**
   * 按键 → 操作模式：1 旋转 / 2 平移
   * 鼠标：左键平移、右键旋转、中键平移；Shift+左键 临时旋转（方便无右键的环境）
   * 触屏：单指旋转、双指缩放+平移
   */
  Orbit.prototype._pickMode = function (e) {
    if (e.pointerType === 'touch') {
      return Object.keys(this._pointers).length >= 2 ? 2 : 1;
    }
    if (e.button === 2) return 1;      // 右键 → 旋转
    if (e.button === 1) return 2;      // 中键 → 平移
    if (e.shiftKey) return 1;          // Shift+左键 → 旋转
    return 2;                          // 左键 → 平移
  };

  Orbit.prototype._pinch = function (keys) {
    var a = this._pointers[keys[0]], b = this._pointers[keys[1]];
    var d = Math.hypot(a.x - b.x, a.y - b.y);
    if (this._pinchDist) this._dRadius *= (this._pinchDist / d);
    this._pinchDist = d;
    // 双指整体移动 → 平移
    var mx = (a.x + b.x) * 0.5, my = (a.y + b.y) * 0.5;
    if (this._pinchMid) {
      this._panX -= (mx - this._pinchMid.x);
      this._panY -= (my - this._pinchMid.y);
    }
    this._pinchMid = { x: mx, y: my };
  };

  /** 从当前相机位置反推球坐标 */
  Orbit.prototype.syncFromCamera = function () {
    this._v.copy(this.camera.position).sub(this.target);
    this._spherical.setFromVector3(this._v);
    this._theta = this._spherical.theta;
    this._phi = this._spherical.phi;
    this._radius = this._spherical.radius;
  };

  /** 记录当前视角为「复位」目标 */
  Orbit.prototype.saveHome = function () {
    this._home.theta = this._theta;
    this._home.phi = this._phi;
    this._home.radius = this._radius;
    this._home.target.copy(this.target);
  };

  Orbit.prototype.reset = function () {
    this._theta = this._home.theta;
    this._phi = this._home.phi;
    this._radius = this._home.radius;
    this.target.copy(this._home.target);
    this._dTheta = this._dPhi = this._panX = this._panY = 0;
    this._dRadius = 1;
  };

  Orbit.prototype.setDistance = function (d) { this._radius = clamp(d, this.minDistance, this.maxDistance); };
  Orbit.prototype.getDistance = function () { return this._radius; };

  /** dt: 秒 */
  Orbit.prototype.update = function (dt) {
    if (this.autoRotate && !this._mode) {
      this._theta -= this.autoRotateSpeed * (dt || 0.016);
    }

    this._theta += this._dTheta;
    this._phi += this._dPhi;
    this._phi = clamp(this._phi, this.minPolarAngle, this.maxPolarAngle);
    this._radius = clamp(this._radius * this._dRadius, this.minDistance, this.maxDistance);

    // 平移：沿相机的右向量与上向量移动观察目标
    if (this._panX || this._panY) {
      var dist = this._radius * Math.tan((this.camera.fov || 50) * Math.PI / 360) * 2;
      var h = this.dom.clientHeight || 1;
      this._right.setFromMatrixColumn(this.camera.matrix, 0);
      this._up.setFromMatrixColumn(this.camera.matrix, 1);
      this.target
        .addScaledVector(this._right, this._panX * dist / h)
        .addScaledVector(this._up, -this._panY * dist / h);
    }

    var k = this.enableDamping ? (1 - this.dampingFactor) : 0;
    this._dTheta *= k;
    this._dPhi *= k;
    this._panX *= k;
    this._panY *= k;
    this._dRadius = 1 + (this._dRadius - 1) * k;
    if (Math.abs(this._dRadius - 1) < 1e-5) this._dRadius = 1;

    this._spherical.radius = this._radius;
    this._spherical.theta = this._theta;
    this._spherical.phi = clamp(this._phi, EPS, Math.PI - EPS);

    this.camera.position.setFromSpherical(this._spherical).add(this.target);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  };

  Orbit.prototype.dispose = function () { /* 事件随 canvas 生命周期，无需解绑 */ };

  global.HL = global.HL || {};
  global.HL.Orbit = Orbit;

})(window);
