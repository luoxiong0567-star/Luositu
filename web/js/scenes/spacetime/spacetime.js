/**
 * 时空弯曲 · 广义相对论
 *
 * 跟万有引力同一套外壳：子场景注册、参数面板、KaTeX 公式卡、讲解模式。
 * 视觉素材直接复用 HL.GRAV（玻璃天体、星空、公式卡、拖尾），不另起一套 HUD。
 *
 * 子场景：
 *   well  时空织物 / 引力井
 *   lens  光线偏折 / 引力透镜
 *   time  引力时间膨胀（GPS）
 *
 * 直达：#spacetime
 * 子视图：?st=well|lens|time   （?g= 同名时也认，避免和万有引力的 ?g= 抢未知 id）
 * 讲解：场景级 6 步，会跨子视图飞行（弯曲 → 光偏折 → 时间膨胀 → 牛顿极限）
 */
(function (global) {
  'use strict';

  var HL = global.HL = global.HL || {};
  var GRAV = HL.GRAV;
  if (!GRAV) throw new Error('spacetime 需要先加载 gravity.js');

  var ST = HL.ST = HL.ST || {};
  ST.subs = {};
  ST.order = [];
  ST.registerSub = function (def) {
    if (!def || !def.id) throw new Error('子场景缺少 id');
    ST.subs[def.id] = def;
    ST.order.push(def.id);
  };

  /** 公式卡底部的互见：牛顿引力井 + 质能方程 */
  ST.mountXrefs = function (hud) {
    if (!hud || !hud.root) return;
    var card = document.createElement('div');
    card.className = 'gc-card gc-xrefs';

    var head = document.createElement('div');
    head.className = 'gc-head';
    var bar = document.createElement('i');
    bar.className = 'gc-bar';
    bar.style.background = GRAV.CSS.mint;
    var title = document.createElement('span');
    title.className = 'gc-t';
    title.textContent = '接着看';
    head.appendChild(bar);
    head.appendChild(title);
    card.appendChild(head);

    var note = document.createElement('div');
    note.className = 'gc-note';
    note.textContent = '弱场慢速时，测地线退回牛顿的 a = GM/r²；压弯时空的也不只是质量，能量同样算数。';
    card.appendChild(note);

    var row = document.createElement('div');
    row.className = 'gc-xref-row';
    [
      ['gravity', '🪐 万有引力'],
      ['massenergy', '⚛ 质能方程']
    ].forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = it[1];
      b.title = '打开 #' + it[0];
      b.addEventListener('click', function () {
        if (HL.loadScene) HL.loadScene(it[0], true);
      });
      row.appendChild(b);
    });
    card.appendChild(row);
    hud.root.appendChild(card);
  };

  var CUR = { sub: 'well' };

  function subOptions() {
    return ST.order.map(function (id) {
      var d = ST.subs[id];
      return { label: d.tab || d.name, value: id };
    });
  }

  function initialSub() {
    var want = 'well';
    if (typeof URLSearchParams === 'undefined' || location.search.length < 2) return want;
    var qs = new URLSearchParams(location.search);
    var st = qs.get('st');
    var g = qs.get('g');
    if (st && ST.subs[st]) return st;
    if (g && ST.subs[g]) return g;
    return want;
  }

  HL.registerScene({
    id: 'spacetime',
    name: '时空弯曲',
    short: '光会弯，钟会慢',
    icon: '🌀',
    desc: '时空织物 · 引力透镜 · 引力时间膨胀',
    fov: 46,
    minDistance: 2,
    maxDistance: 800,

    controls: function () {
      var d = ST.subs[CUR.sub];
      var list = [{
        type: 'buttons', key: 'sub', label: '子场景', value: CUR.sub, options: subOptions()
      }];
      list.push({ type: 'button', key: 'tour', label: '📖 讲解模式' });
      if (d && d.controls) list = list.concat(d.controls);
      return list;
    },

    create: function (ctx) {
      var THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera, controls = ctx.controls;
      var stage = document.getElementById('stage');
      var hud = new GRAV.Hud(stage);
      // 窄屏上公式卡几乎铺满宽度，safeArea 会把井推到画面外；先收起，留下把手
      if (window.innerWidth <= 760) {
        hud.setFolded(true);
        hud.root.classList.add('st-narrow');
      }

      var P = {};
      var inst = null, group = null, curId = null;
      var tour = null;
      var building = false;

      function setView(pos, tgt) {
        camera.position.set(pos[0], pos[1], pos[2]);
        controls.target.set(tgt ? tgt[0] : 0, tgt ? tgt[1] : 0, tgt ? tgt[2] : 0);
        controls.syncFromCamera();
        controls.saveHome();
        camera.updateProjectionMatrix();
      }

      function setSub(id, rebuild, opt) {
        if (!ST.subs[id]) return;
        if (id === curId) {
          if (rebuild && !building && HL.rebuildPanel) {
            building = true;
            try { HL.rebuildPanel(); } catch (e) { /* 面板回灌失败不拖垮场景 */ }
            building = false;
          }
          return;
        }
        if (!(opt && opt.keepTour) && tour && tour.active()) tour.stop();
        if (inst && inst.dispose) { try { inst.dispose(); } catch (e) { /* 忽略 */ } }
        if (group) { scene.remove(group); HL.disposeObject(group); }
        hud.clear();
        P = {};

        curId = id;
        CUR.sub = id;
        var def = ST.subs[id];
        if (def.defaults) {
          for (var kk in def.defaults) P[kk] = def.defaults[kk];
        }

        group = new THREE.Group();
        scene.add(group);

        var api = {
          THREE: THREE, scene: scene, camera: camera, controls: controls,
          group: group, hud: hud, P: P, G: GRAV, ctx: ctx,
          canvas: ctx.canvas, setNote: ctx.setNote, setView: setView,
          label: function (txt, opt) { return GRAV.label(THREE, txt, opt); },
          stars: function (n, r, s) { return GRAV.starfield(THREE, n, r, s); }
        };
        inst = def.init(api) || {};
        ST.mountXrefs(hud);
        if (def.view && !(opt && opt.keepTour)) setView(def.view[0], def.view[1]);
        if (HL.setDesc) {
          var text = def.desc || '';
          HL.setDesc(text);
          // main.js 在 create 返回后会用场景总述盖掉副标题；下一拍再写回当前子视图
          var token = id;
          setTimeout(function () {
            if (curId === token && HL.setDesc) HL.setDesc(text);
          }, 0);
        }
        if (rebuild && HL.rebuildPanel) {
          building = true;
          try { HL.rebuildPanel(); } catch (e) { /* 忽略 */ }
          building = false;
        }
      }

      function goSub(id, extra) {
        if (HL.ui && HL.ui.setSilent) {
          HL.ui.setSilent('sub', id);
          if (extra) {
            for (var k in extra) if (extra.hasOwnProperty(k)) HL.ui.setSilent(k, extra[k]);
          }
        }
        setSub(id, true, { keepTour: true });
      }

      var steps = [
        {
          t: '时空是一块可以被压弯的织物',
          d: '爱因斯坦把引力从「隔空的拉力」改写成几何：质量与能量告诉时空如何弯曲，弯曲的时空再告诉物质如何运动。中央这团质量把网格压出一口井，井越深，附近的路就越弯。',
          exp: '拖动「质量 M」。质量加大，织物下陷更深，史瓦西半径读数跟着变长。',
          pulse: [0, -4, 0], r: 2.6,
          cam: [[13, 6.2, 15], [0, -3.6, 0]],
          apply: function () { goSub('well'); }
        },
        {
          t: '自由落体走的是测地线',
          d: '小球并没有被一根看不见的绳子拽向中央。它只是贴着弯曲的网格往前滚——在弯曲时空里，这条「最自然的路」叫做测地线。拖尾就是它刚走过的世界线。',
          exp: '点「重新抛入」多看几条轨道；把「耗散」拉高，小球会一圈圈掉进井里。',
          pulse: [4, -2, 0], r: 1.8,
          cam: [[8, 4.2, 9], [1.2, -3.2, 0]]
        },
        {
          t: '光也得跟着弯',
          d: '光走零质量粒子的测地线，所以星光擦过太阳也会偏折。1919 年日全食测到约 1.75 角秒，是牛顿光微粒说预言的两倍——α = 4GM / (c²b)。',
          exp: '拖动质量或瞄准的光线。越贴着质量，弯得越厉害；太贴就会被吞进去。',
          pulse: [0, 0, 0], r: 2.2,
          cam: [[16, 5, 18], [0, 0, 0]],
          apply: function () { goSub('lens', { lens_align: 0.62 }); }
        },
        {
          t: '对准了，就成一枚爱因斯坦环',
          d: '背景光源、透镜天体和观测者几乎排成一条直线时，光从四面绕过来，在天上合成一枚环。稍有偏开，环就裂成两段弧——这是今天望远镜里真实的引力透镜。',
          exp: '把「源的偏开」从 0 慢慢拉开，看光环怎样裂成弧。',
          pulse: [0, 0, 0], r: 3.4,
          cam: [[22, 3.2, 4.2], [0, 0, 0]],
          apply: function () { goSub('lens', { lens_align: 0 }); }
        },
        {
          t: '井底的钟走得更慢',
          d: '引力势越低，固有时间越慢。GPS 卫星比地面高，引力项让星载钟每天快大约 46 微秒；它飞得快，速度项又让它每天慢大约 7 微秒。净剩约 39 微秒。不修正的话，定位每天会漂出十几千米。',
          exp: '切到「近地」：速度项占上风，钟反而变慢。再切回 GPS，引力项重新赢回来。',
          pulse: [0, 0, 0], r: 3.2,
          cam: [[13, 9, 16], [0, 0.6, 0]],
          apply: function () { goSub('time', { time_preset: 'gps', time_alt: 20200 }); }
        },
        {
          t: '弱场里，它退回牛顿',
          d: '速度远小于光速、引力又不强时，测地线方程就变回 a = −GM/r²。牛顿引力没有被推翻，它是广义相对论的弱场近似。而 E = mc² 提醒我们：能量也有质量，同样会压这张织物。',
          exp: '勾选「牛顿对照」看拉力箭头；公式卡底部可以跳到万有引力和质能方程。',
          pulse: [0, -4, 0], r: 2.6,
          cam: [[13, 6.2, 15], [0, -3.6, 0]],
          apply: function () { goSub('well', { well_newton: true }); }
        }
      ];

      tour = HL.Tour(ctx, { stage: stage, defaultR: 1.8, accent: 0xb98cff });
      tour.load(steps);

      setSub(initialSub(), false);

      return {
        update: function (dt, t) {
          tour.update(dt, t, function (ddt, tt) {
            if (inst && inst.update) inst.update(ddt, tt);
          });
        },
        setParam: function (key, value) {
          // 同一个子场景再回灌（面板重建）不能再次 rebuild，否则和 buildPanel 互相调用
          if (key === 'sub') {
            if (value !== curId) setSub(value, true);
            return;
          }
          if (key === 'tour') { tour.toggle(); return; }
          if (curId && key.indexOf(curId + '_') === 0) {
            P[key.slice(curId.length + 1)] = value;
          }
          if (inst && inst.setParam) {
            var short = (curId && key.indexOf(curId + '_') === 0) ? key.slice(curId.length + 1) : key;
            try { inst.setParam(short, value); } catch (e) { /* 忽略 */ }
          }
        },
        dispose: function () {
          if (tour) tour.dispose();
          if (inst && inst.dispose) { try { inst.dispose(); } catch (e) { /* 忽略 */ } }
          hud.dispose();
          inst = null;
          group = null;
          curId = null;
        }
      };
    }
  });

})(window);
