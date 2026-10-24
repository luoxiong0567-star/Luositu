/**
 * 云服务接入 · 观展回声
 * ---------------------------------------------------------------
 * 数据源：WorkBuddy Cloud Service（Database 模块，PostgREST 兼容）
 * 页面形态：纯 HTML，无构建步骤 → SDK 走 CDN IIFE，使用 WorkBuddyCloud 全局
 *
 * 设计约束：
 *   1. 公开内容，不设登录墙 —— 作品是通过链接分享的展品，加登录会挡住观众。
 *      因此表策略为「所有人可读、所有人可插、任何人不可改删」。
 *   2. 单文件离线版（file://）不联网：SDK 不加载，面板降级为说明文案，
 *      14 个场景完全不受影响。
 *   3. 初始化参数只来自 publicConfig，绝不硬编码环境 id 或密钥。
 */
(function (global) {
  'use strict';

  var HL = global.HL = global.HL || {};

  /* publicConfig：云服务环境开通后由后端返回，可直接放在前端 */
  var PUBLIC_CONFIG = {
    endpoint: 'https://human-light-science.app.workbuddy.host',
    oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
    publishableKey: 'wbpk_Y66v5Zxi3Wv5gkfYo1yj1N_9quCy1cpdJpK8tjPOycBoA4K94q7eD1L'
  };

  var SDK_URL = 'https://cdn.jsdelivr.net/npm/@tencent-ai/workbuddy-cloud-sdk@dev/lib/index.global.js';
  var TABLE = 'hl_notes';
  var MAX_LEN = 200;
  var MAX_NICK = 12;
  var LIST_LIMIT = 30;
  var SDK_TIMEOUT = 9000;

  var cloud = null;          // SDK 客户端（全局只初始化一次）
  var notes = [];            // 最近留言缓存
  var status = 'idle';       // idle | loading | ready | offline | error
  var statusText = '';
  var currentScene = null;   // 用户最近一次真正打开的场景
  var submitting = false;
  var el = {};               // 面板节点引用

  /* ---------------- SDK 载入 ---------------- */
  function loadSdk() {
    return new Promise(function (resolve, reject) {
      if (global.WorkBuddyCloud) { resolve(global.WorkBuddyCloud); return; }
      var s = document.createElement('script');
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        reject(new Error('sdk-timeout'));
      }, SDK_TIMEOUT);
      s.src = SDK_URL;
      s.async = true;
      s.onload = function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (global.WorkBuddyCloud) resolve(global.WorkBuddyCloud);
        else reject(new Error('sdk-missing'));
      };
      s.onerror = function () {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error('sdk-network'));
      };
      document.head.appendChild(s);
    });
  }

  /* 查询构造器是 thenable，统一包成 Promise 并把 error 抛出来 */
  function run(query) {
    return Promise.resolve(query).then(function (res) {
      if (res && res.error) throw res.error;
      return res ? res.data : null;
    });
  }

  /* ---------------- 错误文案 ---------------- */
  function describeError(err) {
    if (!err) return '云端暂时不可用';
    if (err.code === '42P01') return '云端数据表尚未创建，请稍后再试';
    if (err.code === '42501') return '没有写入权限，请稍后再试';
    if (err.code === '23514' || err.code === '23505') return '留言内容不符合要求';
    if (err.kind === 'network' || err.name === 'TypeError') return '网络不可用，请检查连接后重试';
    if (err.status === 401 || err.kind === 'unauthenticated') return '云端连接校验未通过，请从正式链接打开';
    if (err.message === 'sdk-network') return '未能加载云端组件，请检查网络或稍后重试';
    if (err.message === 'sdk-timeout') return '云端组件加载超时，请稍后重试';
    if (err.message === 'sdk-missing') return '云端组件不可用，请稍后重试';
    if (err.message === 'blocked') return '留言未能写入，请稍后再试';
    return err.message || '云端暂时不可用';
  }

  function fail(err) {
    status = 'error';
    statusText = describeError(err);
    if (global.console && console.warn) console.warn('[cloud] ' + statusText);
    renderState();
  }

  /* ---------------- 数据读写 ---------------- */
  function fetchNotes() {
    return run(cloud.database
      .from(TABLE)
      .select('id, nick, content, scene_id, created_at')
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT)
    ).then(function (rows) {
      notes = rows || [];
      renderList();
    });
  }

  function submitNote(text, nick) {
    var row = { content: text, scene_id: currentScene || 'catalog' };
    if (nick) row.nick = nick;
    return run(cloud.database
      .from(TABLE)
      .insert(row)
      .select('id, nick, content, scene_id, created_at')
    ).then(function (rows) {
      // RLS 拦下的写入会返回空数组而不是报错，必须与成功区分开
      if (!rows || !rows.length) throw new Error('blocked');
      notes.unshift(rows[0]);
      if (notes.length > LIST_LIMIT) notes.length = LIST_LIMIT;
      renderList();
    });
  }

  /* ---------------- 渲染 ---------------- */
  function sceneLabel(id) {
    if (!id || id === 'catalog') return '场景目录';
    var def = HL.getScene && HL.getScene(id);
    return def ? def.name : id;
  }

  function timeAgo(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) return '';
    var d = (Date.now() - t) / 1000;
    if (d < 60) return '刚刚';
    if (d < 3600) return Math.floor(d / 60) + ' 分钟前';
    if (d < 86400) return Math.floor(d / 3600) + ' 小时前';
    if (d < 86400 * 7) return Math.floor(d / 86400) + ' 天前';
    var dt = new Date(t);
    return (dt.getMonth() + 1) + '月' + dt.getDate() + '日';
  }

  function renderState() {
    if (!el.state) return;
    el.state.textContent = statusText;
    el.state.className = 'hl-wall-state' + (statusText ? ' show' : '') + ' st-' + status;
    if (el.root) el.root.className = 'hl-wall st-' + status;
    var locked = status === 'offline' || status === 'error';
    if (el.text) el.text.disabled = locked;
    if (el.nick) el.nick.disabled = locked;
    if (el.send) el.send.disabled = locked || submitting;
    if (el.count) el.count.textContent = status === 'loading' ? '连接云端…' : '';
  }

  function renderCount() {
    if (!el.count) return;
    var n = el.text ? el.text.value.length : 0;
    el.count.textContent = n + ' / ' + MAX_LEN;
  }

  function renderList() {
    if (!el.list) return;
    el.list.textContent = '';
    if (!notes.length) {
      var empty = document.createElement('div');
      empty.className = 'hl-wall-empty';
      empty.textContent = status === 'ready' ? '还没有人留下回声 —— 你可以是第一个。' : '暂无留言';
      el.list.appendChild(empty);
      return;
    }
    notes.forEach(function (n) {
      var item = document.createElement('div');
      item.className = 'hl-note';

      var head = document.createElement('div');
      head.className = 'hl-note-head';

      var who = document.createElement('b');
      who.textContent = (n.nick && String(n.nick).trim()) || '匿名观展者';

      var tag = document.createElement('span');
      tag.className = 'hl-note-tag';
      tag.textContent = sceneLabel(n.scene_id);

      var when = document.createElement('time');
      when.textContent = timeAgo(n.created_at);

      head.appendChild(who);
      head.appendChild(tag);
      head.appendChild(when);

      var body = document.createElement('p');
      body.textContent = n.content;

      item.appendChild(head);
      item.appendChild(body);
      el.list.appendChild(item);
    });
  }

  /* ---------------- 交互 ---------------- */
  function onSubmit(e) {
    e.preventDefault();
    if (submitting || status !== 'ready') return;
    var text = (el.text.value || '').trim();
    var nick = (el.nick.value || '').trim().slice(0, MAX_NICK);
    if (text.length < 1) {
      el.state.textContent = '写点什么再提交吧';
      el.state.className = 'hl-wall-state show st-error';
      el.text.focus();
      return;
    }
    if (text.length > MAX_LEN) {
      el.state.textContent = '留言请控制在 ' + MAX_LEN + ' 字以内';
      el.state.className = 'hl-wall-state show st-error';
      return;
    }
    submitting = true;
    renderState();
    statusText = '';
    el.state.className = 'hl-wall-state';
    el.state.textContent = '';

    submitNote(text, nick).then(function () {
      el.text.value = '';
      renderCount();
      submitting = false;
      renderState();
      if (HL.toast) HL.toast('回声已留在这片星空里');
    }).catch(function (err) {
      submitting = false;
      fail(err);
    });
  }

  /* ---------------- 挂载 ---------------- */
  function build() {
    var sec = document.createElement('section');
    sec.className = 'hl-wall';
    sec.id = 'hlWall';

    var head = document.createElement('div');
    head.className = 'hl-wall-head';
    var h3 = document.createElement('h3');
    h3.textContent = '观展回声';
    var en = document.createElement('span');
    en.textContent = 'VOICES';
    h3.appendChild(en);
    var p = document.createElement('p');
    p.textContent = '写下你看到的、想到的一句话。留言保存在云端，所有观展者都能看见。';
    head.appendChild(h3);
    head.appendChild(p);

    var form = document.createElement('form');
    form.className = 'hl-wall-form';

    var nick = document.createElement('input');
    nick.type = 'text';
    nick.className = 'hl-wall-nick';
    nick.maxLength = MAX_NICK;
    nick.placeholder = '昵称（可留空）';
    nick.setAttribute('aria-label', '昵称');

    var text = document.createElement('textarea');
    text.className = 'hl-wall-text';
    text.maxLength = MAX_LEN;
    text.rows = 3;
    text.placeholder = '比如：双缝那段，一颗光子一颗光子把条纹堆出来，看得有点起鸡皮疙瘩。';
    text.setAttribute('aria-label', '留言内容');

    var meta = document.createElement('div');
    meta.className = 'hl-wall-meta';

    var tag = document.createElement('span');
    tag.className = 'hl-wall-tag';
    tag.textContent = '记录于：场景目录';

    var count = document.createElement('span');
    count.className = 'hl-wall-count';
    count.textContent = '0 / ' + MAX_LEN;

    var send = document.createElement('button');
    send.type = 'submit';
    send.className = 'hl-wall-send';
    send.textContent = '留下回声';

    meta.appendChild(tag);
    meta.appendChild(count);
    meta.appendChild(send);

    var state = document.createElement('div');
    state.className = 'hl-wall-state';

    form.appendChild(nick);
    form.appendChild(text);
    form.appendChild(meta);
    form.appendChild(state);

    var list = document.createElement('div');
    list.className = 'hl-wall-list';

    sec.appendChild(head);
    sec.appendChild(form);
    sec.appendChild(list);

    el.root = sec;
    el.nick = nick;
    el.text = text;
    el.count = count;
    el.tag = tag;
    el.send = send;
    el.state = state;
    el.list = list;

    form.addEventListener('submit', onSubmit);
    text.addEventListener('input', renderCount);

    var gal = document.getElementById('gallery');
    if (!gal) return null;
    var foot = gal.querySelector('.gal-foot');
    if (foot && foot.parentNode === gal) gal.insertBefore(sec, foot);
    else gal.appendChild(sec);
    return sec;
  }

  function boot() {
    status = 'loading';
    statusText = '正在连接云端…';
    renderState();

    if (location.protocol === 'file:') {
      status = 'offline';
      statusText = '离线单文件版不联网，观展回声在线上地址可用。';
      renderState();
      renderList();
      return;
    }

    loadSdk().then(function (sdk) {
      // 全局只初始化一次，Database 与后续模块共用这一个客户端
      cloud = sdk.createWorkBuddyCloud({
        endpoint: PUBLIC_CONFIG.endpoint,
        oauthRelayBaseUrl: PUBLIC_CONFIG.oauthRelayBaseUrl,
        publishableKey: PUBLIC_CONFIG.publishableKey
      });
      return fetchNotes();
    }).then(function () {
      status = 'ready';
      statusText = '';
      renderState();
      renderList();
    }).catch(function (err) {
      fail(err);
      renderList();
    });
  }

  function mount() {
    if (el.root) return el.root;
    if (!build()) return null;
    boot();
    return el.root;
  }

  /* 用户在场景间切换时更新「记录于」标签 */
  function setScene(id) {
    currentScene = id || null;
    if (el.tag) el.tag.textContent = '记录于：' + sceneLabel(id);
  }

  HL.Cloud = {
    mount: mount,
    setScene: setScene,
    status: function () { return status; },
    notes: function () { return notes.slice(); }
  };

})(window);
