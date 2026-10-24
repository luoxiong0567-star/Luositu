/**
 * HL.Journey —— 跨场景播放器（「两分钟速览」）
 *
 * 与 HL.Tour 的分工：
 *   Tour     一个场景内部的讲解步骤（相机在场景里飞，旁白换文字）
 *   Journey  场景之间的章节（换场景 + 相机入场 + 一句旁白，自动切下一段）
 * 两者互不引用：Tour 的步骤结构在这里被"借用"成 beat，但 Tour.js 一行没改。
 *
 * 用法：
 *   var jr = HL.Journey({ loadScene: load, onExit: fn });
 *   jr.start(HL.JOURNEY);          // 从第一段开始
 *   jr.stop();                     // 退出，恢复 UI
 *
 * 每一段（HL.JOURNEY 数组元素）：
 *   { kind:'open'|'scene', dur, kicker, title, line, beats:[...] }
 *   beats 缺省时，段本身就是一个 beat（取 scene/params/cam/zoom/dur/fly）
 *   beat：{ scene, params, cam:[[x,y,z],[tx,ty,tz]], zoom, ms, fly }
 *
 * 相机怎么飞：不直接改 camera.position —— 控制器的 update() 每帧都会用球坐标
 * 重写相机位置，直接改会被立刻覆盖。所以这里改的是控制器自己的
 * _theta / _phi / _radius / target，交给 update() 落位。
 * 终点默认取场景自己的 home（设计师调好的机位），起点由终点再往外推一点，
 * 于是每一镜都是「从外面缓缓推近」，不需要给十几个场景逐个手调机位；
 * 需要精确控制时（同一个场景切视角）用 cam 显式给世界坐标。
 *
 * 时钟是 tick 驱动的（不用 setTimeout），所以暂停 = 不再推进 dt，
 * 相机飞行与段落计时会一起停住，不需要记"还剩多少毫秒"。
 */
(function (global) {
  'use strict';

  var HL = global.HL;
  if (!HL) return;

  function ease(k) {
    return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  HL.Journey = function (opt) {
    opt = opt || {};
    var stage = opt.mount || document.getElementById('stage');
    var loadScene = opt.loadScene || function (id) { HL.manager && HL.manager.load(id); };
    var onExit = opt.onExit || function () { };

    var list = [], idx = -1, running = false, paused = false;
    var curSeg = null, beats = [], bi = -1, bt = 0, segT = 0, wait = 0;
    var fly = null, raf = 0, last = 0;
    var ui = null, art = null, curScene = null;
    var mode = 'seg';          // 'seg'（整段一个镜头 / 开场）| 'beat'（段内串镜）

    /* ---------------- UI ---------------- */
    function ensureUi() {
      if (ui) return ui;
      var root = document.createElement('div');
      root.id = 'hlJourney';
      stage.appendChild(root);
      var nScene = (HL.allScenes && HL.allScenes().length) || 16;
      root.innerHTML =
        '<div class="jr-top">' +
        '<span class="jr-brand">✦ 人类之光 · 两分钟速览</span>' +
        '<span class="jr-count"></span>' +
        '<button class="jr-quit" title="退出速览（Esc）">✕</button>' +
        '</div>' +
        '<div class="jr-bar"><i></i></div>' +
        '<div class="jr-card">' +
        '<div class="jr-kicker"></div>' +
        '<h3 class="jr-title"></h3>' +
        '<p class="jr-line"></p>' +
        '<div class="jr-btns">' +
        '<button class="jr-prev" title="上一段（←）">← 上一段</button>' +
        '<button class="jr-pause" title="暂停（空格）">⏸ 暂停</button>' +
        '<button class="jr-next" title="下一段（→）">下一段 →</button>' +
        '</div>' +
        '</div>' +
        '<div class="jr-endcard">' +
        '<div class="jr-end-kicker">✦ 人类之光 · HUMAN LIGHT</div>' +
        '<h2>从星尘到思考，<br>这段路我们走了 138 亿年</h2>' +
        '<p>' + nScene + ' 个可交互的三维现场，都在目录里等你。</p>' +
        '<div class="jr-end-btns">' +
        '<button class="jr-again">↺ 再看一遍</button>' +
        '<button class="jr-toHome">回到开篇</button>' +
        '<button class="jr-toGallery">进入场景目录 →</button>' +
        '</div>' +
        '</div>';

      ui = {
        root: root,
        bar: root.querySelector('.jr-bar i'),
        count: root.querySelector('.jr-count'),
        card: root.querySelector('.jr-card'),
        kicker: root.querySelector('.jr-kicker'),
        title: root.querySelector('.jr-title'),
        line: root.querySelector('.jr-line'),
        prev: root.querySelector('.jr-prev'),
        next: root.querySelector('.jr-next'),
        pause: root.querySelector('.jr-pause'),
        end: root.querySelector('.jr-endcard')
      };

      ui.prev.addEventListener('click', function () { go(idx - 1); });
      ui.next.addEventListener('click', function () { go(idx + 1); });
      ui.pause.addEventListener('click', togglePause);
      root.querySelector('.jr-quit').addEventListener('click', function () { stop(false); });
      root.querySelector('.jr-again').addEventListener('click', function () { go(0); });
      root.querySelector('.jr-toGallery').addEventListener('click', function () { stop(false); });
      root.querySelector('.jr-toHome').addEventListener('click', function () { stop(true); });
      return ui;
    }

    /* ---------------- 开场：甲骨文逐字显影 ---------------- */
    var GLYPHS = ['日', '月', '星', '山', '水'];

    function ensureArt() {
      if (art) return art;
      art = document.createElement('div');
      art.id = 'jrArt';
      art.innerHTML = '<canvas></canvas><div class="jr-art-cap"><b>甲骨 · 约公元前 1200 年</b>' +
        '<span>日、月、星、山、水 —— 人类第一次把世界写下来</span></div>';
      stage.appendChild(art);
      art.cv = art.querySelector('canvas');
      art.cap = art.querySelector('.jr-art-cap');
      return art;
    }

    function sizeArt() {
      if (!art) return;
      var cv = art.cv, dpr = Math.min(global.devicePixelRatio || 1, 2);
      var w = stage.clientWidth || global.innerWidth;
      var h = stage.clientHeight || global.innerHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      cv.style.width = w + 'px'; cv.style.height = h + 'px';
      art.ctx = cv.getContext('2d');
      art.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      art.w = w; art.h = h;
      art.stars = [];
      for (var i = 0; i < 180; i++) {
        art.stars.push({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.3 + 0.3, a: Math.random() });
      }
    }

    function drawArt(elapsed) {
      if (!art || !art.ctx) return;
      var c = art.ctx, w = art.w, h = art.h;      c.clearRect(0, 0, w, h);

      var g = c.createRadialGradient(w * 0.5, h * 0.42, 10, w * 0.5, h * 0.42, Math.max(w, h) * 0.8);
      g.addColorStop(0, 'rgba(14,24,44,0.96)');
      g.addColorStop(0.55, 'rgba(7,11,22,0.98)');
      g.addColorStop(1, 'rgba(3,5,10,1)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);

      for (var i = 0; i < art.stars.length; i++) {
        var s = art.stars[i];
        var tw = 0.35 + 0.65 * Math.abs(Math.sin(elapsed * 0.0006 + s.a * 6));
        c.globalAlpha = tw * 0.7;
        c.fillStyle = '#bcd6ff';
        c.fillRect(s.x, s.y, s.r, s.r);
      }
      c.globalAlpha = 1;

      var n = GLYPHS.length;
      var size = Math.min(w / (n * 1.9), h * 0.24, 150);
      var gap = size * 1.6;
      var totalW = gap * (n - 1);
      var y = h * 0.48;
      var font = '600 ' + size + 'px "Songti SC","STSong","SimSun",serif';

      // 显影节奏跟着段落时长走（原来写死 900 + k*1500，是按 12 s 排的）。
      // 速览压到 2 分钟、这一段只有 9 s 时，固定节奏会让最后一个字来不及出现。
      var dur = art.dur || 12000;
      var g0 = dur * 0.08;                       // 首字落点
      var gs = dur * 0.42 / (n - 1);             // 字间距（末字落在 50% 处）
      var rd = Math.max(320, gs * 0.62);         // 单字显影时长

      for (var k = 0; k < n; k++) {
        var t = elapsed - (g0 + k * gs);
        if (t < 0) continue;
        var p = clamp(t / rd, 0, 1);
        var x = w / 2 - totalW / 2 + k * gap;

        c.save();
        c.beginPath();
        c.rect(x - size, y - size * 0.95 + size * 1.5 * (1 - p), size * 2, size * 1.5 * p + size * 0.2);
        c.clip();
        c.font = font;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.shadowColor = 'rgba(77,226,255,' + (0.55 * p) + ')';
        c.shadowBlur = 26;
        c.fillStyle = 'rgba(226,240,255,' + (0.55 + 0.45 * p) + ')';
        c.fillText(GLYPHS[k], x, y);
        c.restore();

        if (p < 1) {
          var ly = y - size * 0.95 + size * 1.5 * (1 - p) + size * 0.75;
          c.globalAlpha = 0.85;
          c.strokeStyle = '#4de2ff';
          c.lineWidth = 1.2;
          c.beginPath();
          c.moveTo(x - size * 0.5, ly);
          c.lineTo(x + size * 0.5, ly);
          c.stroke();
          c.globalAlpha = 1;
        }

        c.font = '400 10px "Microsoft YaHei",sans-serif';
        c.fillStyle = 'rgba(123,138,165,' + (0.5 * p) + ')';
        c.textAlign = 'center';
        c.fillText('0' + (k + 1), x, y + size * 0.78);
      }

      var lt = elapsed - (g0 + gs * (n - 1) + dur * 0.07);
      if (lt > 0) {
        var lp = clamp(lt / 900, 0, 1);
        c.globalAlpha = 0.55 * (1 - lp * 0.4);
        c.strokeStyle = 'rgba(120,200,255,0.65)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(w / 2 - (w * 0.22) * lp, y + size * 1.15);
        c.lineTo(w / 2 + (w * 0.22) * lp, y + size * 1.15);
        c.stroke();
        c.globalAlpha = 1;
      }
    }

    /* ---------------- 相机入场 ---------------- */
    function flyTo(b) {
      var c = HL.manager && HL.manager.controls;
      if (!c || !c.camera) return;

      var home = c._home, end;
      if (b.cam) {
        var pos = new THREE.Vector3(b.cam[0][0], b.cam[0][1], b.cam[0][2]);
        var tgt = new THREE.Vector3(
          (b.cam[1] && b.cam[1][0]) || 0,
          (b.cam[1] && b.cam[1][1]) || 0,
          (b.cam[1] && b.cam[1][2]) || 0
        );
        var sph = new THREE.Spherical().setFromVector3(pos.clone().sub(tgt));
        end = { theta: sph.theta, phi: sph.phi, radius: sph.radius, target: tgt };
      } else if (home) {
        end = { theta: home.theta, phi: home.phi, radius: home.radius, target: home.target.clone() };
      } else {
        var s0 = new THREE.Spherical().setFromVector3(c.camera.position.clone().sub(c.target));
        end = { theta: s0.theta, phi: s0.phi, radius: s0.radius, target: c.target.clone() };
      }

      var zoom = b.zoom || 1;
      // 竖屏（手机）：底部字幕卡占的比例更大，整体再退一点，别把主体压到卡上。
      // 横屏里已经取景刚好的镜头（如麦克斯韦的电磁波），竖屏要退得更多 —— 用 pzoom 单独给。
      var portrait = c.dom && c.dom.clientHeight > c.dom.clientWidth * 1.1;
      if (portrait) zoom *= (b.pzoom || 1.3);
      end.radius = clamp(end.radius * zoom, c.minDistance * 1.02, c.maxDistance);

      // lift：把画面整体上移若干像素，避开底部字幕卡（正数 = 内容上移）
      if (b.lift) {
        var vh = (c.dom && c.dom.clientHeight) || global.innerHeight || 600;
        var worldPerPx = 2 * end.radius * Math.tan((c.camera.fov || 50) * Math.PI / 360) / vh;
        end.target.y -= b.lift * worldPerPx;
      }

      var start = {
        theta: end.theta - 0.42,
        phi: clamp(end.phi * 0.92, 0.06, Math.PI - 0.06),
        radius: clamp(end.radius * 1.55, c.minDistance, c.maxDistance),
        target: end.target.clone()
      };

      var dur = b.fly || 2400, t = 0;
      fly = function (dt) {
        t += dt * 1000;
        var e = ease(clamp(t / dur, 0, 1));
        c._theta = start.theta + (end.theta - start.theta) * e;
        c._phi = start.phi + (end.phi - start.phi) * e;
        c._radius = start.radius + (end.radius - start.radius) * e;
        c.target.lerpVectors(start.target, end.target, e);
        if (t >= dur) fly = null;
      };
    }

    /* ---------------- 段落结构 ---------------- */
    function beatsOf(seg) {
      if (seg.beats && seg.beats.length) return seg.beats;
      if (seg.scene) {
        return [{
          scene: seg.scene, params: seg.params, cam: seg.cam, zoom: seg.zoom,
          ms: seg.dur || 15000, fly: seg.fly || 2400
        }];
      }
      return [];
    }

    function durOf(seg) {
      if (!seg) return 1;
      if (seg.kind === 'end') return 0;
      if (seg.kind === 'open') return seg.dur || 12000;
      var b = beatsOf(seg), s = 0;
      for (var i = 0; i < b.length; i++) s += (b[i].ms || 9000);
      return s || (seg.dur || 15000);
    }

    function total() {
      var s = 0;
      for (var i = 0; i < list.length; i++) s += durOf(list[i]);
      return s || 1;
    }

    /* ---------------- 舞台状态 ---------------- */
    function setStageMode(on) {
      var app = document.getElementById('app');
      if (app) app.classList.toggle('journey-mode', on);
      if (HL.manager) {
        setTimeout(function () { HL.manager.resize(); }, 30);
      }
    }

    function showArt(on, dur) {
      if (on) {
        ensureArt();
        sizeArt();
        art.t = 0;
        art.dur = dur || 12000;      // 甲骨显影节奏按本段时长排
        art.classList.add('show');
        if (ui) ui.card.classList.add('on-art');
      } else if (art) {
        art.classList.remove('show');
        if (ui) ui.card.classList.remove('on-art');
      }
    }

    /* ---------------- 调度 ---------------- */
    function go(i) {
      if (!running) return;
      if (i >= list.length) { finish(); return; }
      if (i < 0) i = 0;

      idx = i;
      curSeg = list[i];
      beats = beatsOf(curSeg);
      bi = -1; bt = 0; segT = 0; wait = 0; fly = null;
      paused = false;

      var u = ensureUi();
      if (u.pause) u.pause.textContent = '⏸ 暂停';
      u.root.classList.remove('paused', 'is-end');
      u.end.classList.remove('show');
      u.card.classList.add('show');

      u.count.textContent = (idx + 1) + ' / ' + list.length;
      u.kicker.textContent = curSeg.kicker || '';
      u.title.textContent = curSeg.title || '';
      u.line.textContent = curSeg.line || '';
      u.prev.style.visibility = idx > 0 ? '' : 'hidden';
      u.next.textContent = idx < list.length - 1 ? '下一段 →' : '完成 ✓';

      if (curSeg.kind === 'open') {
        mode = 'seg';
        showArt(true, curSeg.dur);
        return;
      }

      showArt(false);
      mode = 'beat';
      enterBeat(0);
    }

    function enterBeat(k) {
      bi = k;
      bt = 0;
      var b = beats[k];
      var needLoad = b.scene !== curScene;
      if (needLoad) {
        curScene = b.scene;
        loadScene(b.scene, false);
        wait = 3;          // 细胞 / 光合作用 建场要 1–2 s，等几帧再落参数
      } else {
        wait = 1;
      }
    }

    function beginBeat(b) {
      var inst = HL.manager && HL.manager.inst;
      if (b.params && inst && inst.setParam) {
        for (var k in b.params) {
          try { inst.setParam(k, b.params[k]); } catch (e) { /* 场景不认这个参数就算了 */ }
        }
      }
      flyTo(b);
    }

    function nextBeat() {
      if (bi + 1 < beats.length) enterBeat(bi + 1);
      else go(idx + 1);
    }

    function finish() {
      var u = ensureUi();
      u.root.classList.add('is-end');
      u.end.classList.add('show');
      u.card.classList.remove('show');
      u.count.textContent = '';
      u.bar.style.width = '100%';
      showArt(false);
      fly = null;
      mode = 'end';
    }

    function updateBar() {
      if (!ui) return;
      if (mode === 'end') { ui.bar.style.width = '100%'; return; }
      var done = 0;
      for (var i = 0; i < idx; i++) done += durOf(list[i]);
      var local = clamp(segT, 0, durOf(curSeg));
      var pct = clamp((done + local) / total(), 0, 1) * 100;
      ui.bar.style.width = pct.toFixed(2) + '%';
    }

    function tick(now) {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      if (!last) last = now;
      // rAF 时间戳偶尔倒退（headless 见过）：负 dt 会让场景物理倒放甚至发散
      var raw = (now - last) / 1000;
      if (!(raw > 0 && raw < 5)) raw = 0.016;
      var dt = Math.min(0.05, raw);
      last = now;

      if (art && art.classList.contains('show')) {
        if (!paused) art.t = (art.t || 0) + dt * 1000;
        drawArt(art.t || 0);
      }

      if (paused) return;

      if (mode === 'end') return;

      segT += dt * 1000;

      if (wait > 0) {
        wait--;
        if (wait === 0) beginBeat(beats[bi]);
        return;
      }

      if (mode === 'beat') {
        var b = beats[bi];
        if (!b) return;
        bt += dt * 1000;
        if (fly) fly(dt);
        if (bt >= (b.ms || 9000)) nextBeat();
      } else if (segT >= durOf(curSeg)) {
        go(idx + 1);
        return;
      }

      updateBar();
    }

    function togglePause() {
      if (!running) return;
      var u = ensureUi();
      paused = !paused;
      u.pause.textContent = paused ? '▶ 继续' : '⏸ 暂停';
      u.root.classList.toggle('paused', paused);
    }

    /* ---------------- 键盘 ---------------- */
    function onKey(e) {
      if (!running) return;
      var k = e.key;
      if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); stop(false); return; }
      if (k === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); go(idx + 1); return; }
      if (k === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); go(idx - 1); return; }
      if (k === ' ') { e.preventDefault(); e.stopPropagation(); togglePause(); return; }
    }

    global.addEventListener('keydown', onKey, true);
    global.addEventListener('resize', function () { if (art && art.classList.contains('show')) sizeArt(); });

    /* ---------------- 退出 ---------------- */
    // 独立函数声明（而不是返回对象上的方法）：UI 上的退出按钮在 ensureUi 里
    // 就要引用它，属性写法那时还不存在。
    function stop(toHome) {
      if (!running) return;
      running = false;
      fly = null;
      mode = 'end';
      paused = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      var u = ensureUi();
      u.root.classList.remove('show', 'is-end', 'paused');
      u.card.classList.remove('show');
      u.end.classList.remove('show');
      showArt(false);
      setStageMode(false);
      if (HL.setQuiet) HL.setQuiet(false);
      onExit(!!toHome);
    }

    /* ---------------- 对外 ---------------- */
    return {
      start: function (script, from) {
        list = script || HL.JOURNEY || [];
        if (!list.length) return;
        running = true;
        paused = false;
        curScene = null;
        last = 0;
        ensureUi();
        ui.root.classList.add('show');
        if (HL.setQuiet) HL.setQuiet(true);
        setStageMode(true);
        go(from || 0);
        if (!raf) raf = requestAnimationFrame(tick);
      },
      stop: stop,
      active: function () { return running; },
      idx: function () { return idx; },
      count: function () { return list.length; },
      next: function () { go(idx + 1); },
      // 调试用：当前段 / 段内第几镜 / 场景 / 是否暂停
      state: function () {
        return {
          idx: idx, bi: bi, mode: mode, scene: curScene, paused: paused,
          segs: list.length,
          beats: beats.length,
          title: (ui && ui.title) ? ui.title.textContent : ''
        };
      }
    };
  };

})(window);
