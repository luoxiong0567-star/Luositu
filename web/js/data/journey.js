/**
 * 「五分钟速览」脚本：八段，十三个落点。
 *
 * 一段 = 一章 = 一句旁白；段内可以串多个镜头（beats）。
 * 这样既能满足"八段"的叙事节奏，又能把十三处现场都走到，
 * 而不必为每一处单独开一段。
 *
 * beat 字段：
 *   scene   场景 id
 *   params  进入后逐条 setParam（场景不认的键会被忽略）
 *   cam     显式机位 [[x,y,z],[tx,ty,tz]]（世界坐标）；不写就用场景自己的 home
 *   zoom    在 home 基础上再乘一个距离系数（<1 推近，>1 拉远）
 *   ms      这一镜停留多久（含飞行时间）
 *   fly     飞行时长（毫秒），缺省 2400
 *
 * 叙事主线：
 *   文字 → 星空 → 银河 → 太阳系 → 周期表 → 原子 → 分子 → DNA → 细胞
 *        → 光合 → 数学 → 引力 → 质能 → 神经网络 → 智能体
 */
(function (global) {
  'use strict';

  var HL = global.HL = global.HL || {};

  HL.JOURNEY = [
    /* ── 1 ───────────────────────────────────────────── 文字 */
    {
      kind: 'open', dur: 12000,
      kicker: '序 · 文字',
      title: '人类第一次把世界写下来',
      line: '甲骨上刻下日、月、星、山、水——符号替我们记住了天空，也记住了时间。'
    },

    /* ── 2 ───────────────────────────────────────── 星空与银河 */
    {
      kicker: 'Ⅰ · 宇宙的法则',
      title: '从仰望到俯瞰',
      line: '抬头，银河横过天顶；退到十二万光年外才看清，那只是猎户臂上的一个点。',
      beats: [
        {
          scene: 'cosmos', params: { view: 'sky', labels: false },
          cam: [[0, 0.4, 0], [-18, 7.5, -34]],
          ms: 10000, fly: 2800
        },
        {
          scene: 'cosmos', params: { view: 'galaxy' }, lift: 26,
          cam: [[0, 15.5, 21], [0, 0, 0]],
          ms: 12000, fly: 3200
        }
      ]
    },

    /* ── 3 ───────────────────────────────────────────── 太阳系 */
    {
      kicker: 'Ⅰ · 宇宙的法则',
      title: '太阳系',
      line: '八颗行星沿椭圆轨道运行：水星八十八天一圈，海王星要一百六十五年，同一套开普勒定律。',
      beats: [
        { scene: 'solar', ms: 18000, fly: 3200, zoom: 0.92, lift: 18 }
      ]
    },

    /* ── 4 ───────────────────────────────────── 回到微观 · 原子 */
    {
      kicker: 'Ⅱ · 物质的语言',
      title: '回到微观：从一张表到一个原子',
      line: '一百一十八种元素排成一张表；把其中一个格子拉近，是原子核与分层排布的电子——所有分子都由它们拼成。',
      beats: [
        // 整张表：稍微拉远并整体上移，避开底部字幕卡
        { scene: 'periodic', params: { mode: 'table', hint: false }, zoom: 0.66, lift: 64, ms: 8000, fly: 2600 },
        // 拉近到右侧的玻尔壳层示意（场景里 atomRoot 在 x≈13.4、y≈-6.1）
        {
          scene: 'periodic', params: { mode: 'table', atom: true, hint: false },
          cam: [[13.4, -6.9, 4.4], [13.4, -6.9, 0]],
          ms: 9000, fly: 2800
        }
      ]
    },

    /* ── 5 ─────────────────────────────────────── 分子 · DNA · 细胞 */
    {
      kicker: 'Ⅱ · 物质的语言',
      title: '写在分子上的说明书',
      line: '原子拼成分子，分子编成双螺旋：三十亿个字母写下一个人的全部构造，细胞照着它建起一座自给自足的城。',
      beats: [
        { scene: 'molecule', params: { mode: 'alpha', spin: true }, lift: 18, ms: 7000, fly: 2400 },
        { scene: 'molecule', params: { mode: 'dna', unwind: 0.35 }, zoom: 1.85, lift: 40, ms: 8000, fly: 2600 },
        { scene: 'animalcell', params: { view: 'overview', cut: 0.35 }, zoom: 1.15, lift: 16, ms: 9000, fly: 2800 }
      ]
    },

    /* ── 6 ─────────────────────────────────────────── 光合作用 */
    {
      kicker: 'Ⅱ · 物质的语言',
      title: '光合作用',
      line: '叶绿素抓住一个光子，把水和二氧化碳变成糖，顺手放出我们呼吸的氧——整条食物链从这里开始。',
      beats: [
        { scene: 'photosynthesis', params: { level: 'leaf' }, lift: 34, ms: 15000, fly: 3000 }
      ]
    },

    /* ── 7 ───────────────────────────────── 数学 · 引力 · 质能 */
    {
      kicker: 'Ⅲ · 规律的抽象',
      title: '用符号读懂看不见的东西',
      line: '只用五条公设就能推出勾股定理，只用一条平方反比就能算出潮汐，只用 E = mc² 就能知道太阳在变轻。',
      beats: [
        { scene: 'math', ms: 8000, fly: 2600 },
        { scene: 'gravity', params: { sub: 'well' }, lift: 24, ms: 8000, fly: 2600 },
        { scene: 'massenergy', params: { act: 'balance' }, zoom: 1.1, ms: 8000, fly: 2600 }
      ]
    },

    /* ── 8 ──────────────────────────────────── 神经网络 · 智能体 */
    {
      kicker: 'Ⅳ · 思维的光芒',
      title: '思维也可以被观察',
      line: '输入乘权重、加偏置、过激活函数，答案从概率里浮出来；再往前一步，它会规划、会调用工具、会互相评审。',
      beats: [
        { scene: 'neural', ms: 10000, fly: 2800 },
        { scene: 'aiagent', ms: 11000, fly: 2800 }
      ]
    }
  ];

})(window);
