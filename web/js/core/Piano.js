/**
 * HL.Piano —— 程序化钢琴配乐（Web Audio）
 *
 * 为什么不用音频文件：整个作品是一个离线单文件 HTML，几秒的钢琴 loop 也要
 * 几百 KB；这里用加法合成现场生成钢琴音色，全部成本是几 KB 代码。
 *
 * 音色的关键（听起来像钢琴而不像电子风琴）：
 *   1. 谐波列 + 力度决定亮度：轻触只有基频，重击高次谐波才出来
 *   2. 双段衰减：敲下后有一次快速跌落，再接一条长尾，这是钢琴的标志
 *   3. 音越高衰减越快、截止频率随力度上移
 *   4. 卷积混响（脉冲响应用噪声 + 指数衰减现场算），给琴声一个厅堂
 *
 * 曲目：F# 小调，i–VI–iv–V（F#m → D → Bm → C#），84 BPM，
 * 每小节留白三分之二，只落七个音 —— 稀疏才有"舒缓"。
 *
 * 浏览器自动播放策略要求"用户手势"后才能出声：这里不阻塞，
 * 任何 pointerdown / keydown 之前保持静默挂起，拿到手势再从当前拍续上。
 */
(function (global) {
  'use strict';

  var HL = global.HL || (global.HL = {});
  var AC = global.AudioContext || global.webkitAudioContext;

  var ctx = null, dead = false;
  var master, comp, bus, conv, wet, reverbPre;
  var waves = [];
  var playing = false, muted = false, started = false;
  var timer = 0, step = 0, nextAt = 0;
  var VOL = 0.5, fadeTk = 0;

  var BPM = 84;
  var BEAT = 60 / BPM;        // 0.714 s
  var STEP = BEAT / 2;        // 八分音符
  var BAR = BEAT * 4;         // 2.857 s
  var LOOK = 0.3;             // 提前调度窗口

  /* ---------------- 音名 → MIDI ---------------- */
  var SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function N(s) {
    if (typeof s === 'number') return s;
    var m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
    if (!m) return 60;
    var v = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return v + (parseInt(m[3], 10) + 1) * 12;
  }
  function HZ(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  /* ---------------- 曲谱 ----------------
     每小节 8 个八分音符位，null 表示休止。
     root 落在第 1 位、low 落在第 5 位，右手琶音挑 3 个稀疏位置。 */
  var PROG = [
    {
      low: ['F#2', 'C#3'],
      arp: ['F#4', null, 'A4', 'C#5', null, 'A4', 'E5', null],
      mel: ['C#6'], color: ['F#5']
    },
    {
      low: ['D2', 'A2'],
      arp: ['D4', null, 'F#4', 'A4', null, 'C#5', null, 'A4'],
      mel: ['F#6'], color: ['D5']
    },
    {
      low: ['B2', 'F#3'],
      arp: ['B3', null, 'D4', 'F#4', null, 'A4', null, 'F#4'],
      mel: ['D6'], color: ['B4']
    },
    {
      low: ['C#3', 'G#3'],
      arp: ['C#4', null, 'E4', 'G#4', null, 'B4', null, 'G#4'],
      mel: ['C#6'], color: ['F#5']
    }
  ];

  /* ---------------- 图 ---------------- */
  function makeIR(dur, curve) {
    var sr = ctx.sampleRate, n = Math.max(64, Math.floor(sr * dur));
    var buf = ctx.createBuffer(2, n, sr);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      var pre = Math.floor(sr * 0.014);
      for (var i = 0; i < n; i++) {
        if (i < pre) { d[i] = 0; continue; }
        var x = (i - pre) / (n - pre);
        // 早期 reflections 稍密一点，尾巴稀疏 —— 听起来更像厅堂
        var g = Math.pow(1 - x, curve);
        d[i] = (Math.random() * 2 - 1) * g * (x < 0.06 ? 0.55 : 1);
      }
    }
    return buf;
  }

  function makeWave(p, n) {
    var re = new Float32Array(n + 1), im = new Float32Array(n + 1);
    for (var i = 1; i <= n; i++) {
      var a = Math.pow(i, -p);
      re[i] = a;
      im[i] = a * 0.28;          // 少量虚部引入相位差，音色更厚
    }
    re[0] = 0; im[0] = 0;
    try { return ctx.createPeriodicWave(re, im, { disableNormalization: false }); }
    catch (e) { try { return ctx.createPeriodicWave(re, im); } catch (e2) { return null; } }
  }

  function build() {
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -19;
    comp.knee.value = 24;
    comp.ratio.value = 3.2;
    comp.attack.value = 0.006;
    comp.release.value = 0.28;
    comp.connect(master);

    bus = ctx.createGain();
    bus.gain.value = 0.85;
    bus.connect(comp);

    conv = ctx.createConvolver();
    conv.buffer = makeIR(3.1, 2.3);
    reverbPre = ctx.createGain();
    reverbPre.gain.value = 0.5;
    wet = ctx.createGain();
    wet.gain.value = 0.42;
    bus.connect(reverbPre);
    reverbPre.connect(conv);
    conv.connect(wet);
    wet.connect(comp);

    // 三档力度：p 越小高频越多（越亮）
    waves = [makeWave(2.6, 12), makeWave(1.9, 14), makeWave(1.35, 16)];
  }

  function ensure() {
    if (dead) return false;
    if (ctx) return true;
    try {
      if (!AC) { dead = true; return false; }
      ctx = new AC();
      build();
      return !!waves[0] || true;
    } catch (e) {
      dead = true; ctx = null; return false;
    }
  }

  function resume() {
    if (!ensure()) return false;
    if (ctx.state === 'suspended') {
      try { ctx.resume(); } catch (e) { }
    }
    return ctx.state !== 'suspended';
  }

  /* ---------------- 单音 ---------------- */
  function pickWave(vel) { return waves[vel > 0.52 ? 2 : vel > 0.32 ? 1 : 0]; }

  function strike(midi, when, len, vel, opt) {
    if (!ctx) return;
    opt = opt || {};
    var voicePiece = opt.detune ? 0.55 : 1;
    var f = HZ(midi);
    var peak = 0.20 * vel * vel + 0.012;

    function one(detune, gainScale) {
      var osc = ctx.createOscillator();
      var w = pickWave(vel);
      if (w) { try { osc.setPeriodicWave(w); } catch (e) { osc.type = 'triangle'; } }
      else osc.type = 'triangle';
      osc.frequency.value = f;
      if (detune) osc.detune.value = detune;

      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      // 力度越大滤波器开得越高；低音区整体压暗
      lp.frequency.value = Math.min(15000, (700 + 5600 * vel * vel) * (midi < 50 ? 0.55 : 1));
      lp.Q.value = 0.35;

      var g = ctx.createGain();
      var p = peak * gainScale;
      var t = when;
      // 钢琴的"双段衰减"：先快落一次，再走一条长尾
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(p, t + 0.005);
      g.gain.exponentialRampToValueAtTime(p * 0.44, t + 0.085);
      g.gain.exponentialRampToValueAtTime(p * 0.24, t + 0.34);
      g.gain.exponentialRampToValueAtTime(p * 0.0016, t + len);
      g.gain.linearRampToValueAtTime(0, t + len + 0.03);

      osc.connect(lp); lp.connect(g); g.connect(bus);
      osc.start(t);
      osc.stop(t + len + 0.06);
      // 节点会在 stop 后自动回收
      osc.onended = function () { try { g.disconnect(); lp.disconnect(); } catch (e) { } };
    }

    one(0, 1);
    if (opt.detune) one(opt.detune, voicePiece * 0.85);
  }

  /* ---------------- 调度 ---------------- */
  function scheduleStep(si, when) {
    var bar = Math.floor(si / 8) % PROG.length;
    var pos = si % 8;
    var lap = Math.floor(si / (8 * PROG.length));
    var c = PROG[bar];

    // 微小的人性化抖动，避免机器感
    var human = (Math.random() - 0.5) * 0.012;

    if (pos === 0) {
      strike(N(c.low[0]), when + human, 3.6, 0.46, { detune: 5 });
    } else if (pos === 4) {
      strike(N(c.low[1]), when + human, 2.9, 0.32, { detune: -4 });
    }

    var a = c.arp[pos];
    if (a) {
      // 偶尔留白：这一拍上的音不弹
      if (Math.random() > 0.055) {
        var vel = pos === 0 ? 0.46 : pos === 3 ? 0.40 : 0.30;
        vel *= 0.9 + Math.random() * 0.22;
        strike(N(a), when + human, 1.7 + Math.random() * 0.7, vel);
      }
    }

    // 第二轮起加旋律音与染色音，让重复不那么单调
    if (lap >= 1) {
      if (pos === 4 && c.mel) strike(N(c.mel[0]), when + 0.03, 2.6, 0.26);
      if (pos === 2 && lap >= 2 && Math.random() > 0.5 && c.color) {
        strike(N(c.color[0]), when + human, 1.5, 0.16);
      }
    }
  }

  function tick() {
    if (!playing || !ctx) return;
    var now = ctx.currentTime;
    // 标签页切走再回来会积压一大批音符，直接对齐到当前时间
    if (nextAt < now - 0.4) nextAt = now + 0.06;
    var guard = 0;
    while (nextAt < now + LOOK && guard++ < 48) {
      try { scheduleStep(step, nextAt); } catch (e) { }
      step++;
      nextAt += STEP;
    }
  }

  function fadeTo(v, sec) {
    if (!ctx) return;
    var now = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.linearRampToValueAtTime(v, now + Math.max(0.02, sec));
    } catch (e) { }
  }

  /* ---------------- 对外 ---------------- */
  HL.Piano = {
    /** 浏览器是否支持 Web Audio */
    available: function () { return !!AC && !dead; },
    /** 是否有声（拿到了用户手势且 context 在跑） */
    audible: function () { return !!ctx && !dead && ctx.state === 'running'; },
    resume: resume,

    start: function () {
      if (!ensure()) return false;
      resume();
      started = true;
      if (playing) { fadeTo(muted ? 0 : VOL, 0.6); return true; }
      playing = true;
      step = 0;
      nextAt = ctx.currentTime + 0.16;
      tick();
      timer = setInterval(tick, 25);
      fadeTo(muted ? 0 : VOL, 1.4);
      return true;
    },

    stop: function (fade) {
      started = false;
      if (!ctx) return;
      fadeTo(0, fade == null ? 1.2 : fade);
      if (timer) { clearInterval(timer); timer = 0; }
      playing = false;
    },

    /** 由 Home/Journey 调用：已经在播就续着，没播就起 */
    play: function () {
      if (muted) return false;
      return this.start();
    },

    setMuted: function (m) {
      muted = !!m;
      if (!ctx) return;
      if (playing) fadeTo(muted ? 0 : VOL, 0.35);
    },
    toggleMute: function () { this.setMuted(!muted); return muted; },
    isMuted: function () { return muted; },
    playing: function () { return playing; },

    barSec: function () { return BAR; },
    beatSec: function () { return BEAT; },
    bpm: function () { return BPM; },

    /** 供测试观察调度是否正常 */
    debug: function () {
      return {
        state: ctx ? ctx.state : 'none',
        dead: dead, playing: playing, muted: muted,
        step: step, time: ctx ? +ctx.currentTime.toFixed(2) : -1,
        rate: ctx ? ctx.sampleRate : 0
      };
    }
  };

  // 拿到第一次用户手势就把 context 唤醒，无需显式点音乐按钮
  var once = function () {
    if (!started) return;
    if (resume() && playing && !timer) {
      timer = setInterval(tick, 25);
      tick();
    }
  };
  global.addEventListener('pointerdown', once, true);
  global.addEventListener('keydown', once, true);
  global.addEventListener('touchstart', once, true);

})(window);
