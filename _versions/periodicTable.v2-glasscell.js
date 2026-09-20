/**
 * 场景：元素周期表（暗色深空实验室 · 玻璃样品舱 + 3D 周期表墙 + BLOOM）
 *
 * 结构：
 *   中央  透明玻璃立方体样品舱，内部按元素物态实时呈现
 *          气态 = 青白色漂浮发光粒子（速度 ∝ √T）
 *          液态 = 红棕色波动液面 + 上升气泡
 *          固态 = 金属晶格球棍结构（FCC / BCC / HCP / 金刚石）
 *   舱体   霓虹边线框 + 元素符号 / 中文名 / 物态 / 温度 标注
 *   背景   半透明 3D 元素周期表网格墙（按类别分色发光，可点击选元素）
 *   HUD    侧栏卡片：原子序 / 电子排布 / 熔点 / 沸点 / 用途
 *
 * 温度滑杆驱动真实相变：T < Tm 固态，Tm ≤ T < Tb 液态，T ≥ Tb 气态
 *
 * 后处理：three r149 UMD 无 EffectComposer，自实现 Bloom（HDR RT → 亮度提取
 *         → 3 级降采样双向高斯 → 合成），通过 SceneManager 的 inst.render 钩子接管。
 */
(function (global) {
  'use strict';

  /* ==================================================================
     一、配色
     ================================================================== */
  var C = {
    ink: 0xd9d3c7, steel: 0x9fb3c8, cyan: 0x6fe3ff, gold: 0xffc94d,
    amber: 0xff8a3d, violet: 0xc9a6ff, green: 0x7ef2a8,
    blue: 0x4db4ff, white: 0xeaf2ff, red: 0xff4d6d, deep: 0x0a1424
  };

  /* 物态配色 */
  var PC = {
    solid: { hex: 0x9fd8ff, css: '#9fd8ff', label: '固态 SOLID' },
    liquid: { hex: 0xc86a2e, css: '#ff9a5c', label: '液态 LIQUID' },
    gas: { hex: 0xa8f0ff, css: '#a8f0ff', label: '气态 GAS' }
  };

  /* ==================================================================
     二、元素热学 / 用途 / 晶格数据
     索引 = Z-1；格式 [常温物态, 熔点 K, 沸点 K, 用途, 晶格]
     数据来源：CRC / IUPAC 推荐值；超重元素为理论预测值
     ================================================================== */
  var T = [
    ['g', 13.99, 20.27, '火箭燃料·合成氨·石油加氢', 'hcp'],
    ['g', 0.95, 4.22, '超导磁体冷却·气球·检漏', 'hcp'],
    ['s', 453.65, 1615, '锂电池正极·陶瓷·情绪稳定剂', 'bcc'],
    ['s', 1560, 2742, 'X 射线窗口·航天构件·铍铜合金', 'hcp'],
    ['s', 2349, 4200, '玻璃纤维·硼砂洗涤剂·半导体掺杂', 'dia'],
    ['s', 3823, 4098, '有机分子骨架·石墨电极·碳纤维', 'dia'],
    ['g', 63.15, 77.36, '合成氨·液氮冷冻·保护气', 'dia'],
    ['g', 54.36, 90.20, '炼钢·医疗供氧·火箭氧化剂', 'dia'],
    ['g', 53.53, 85.03, '特氟龙·六氟化铀·含氟药物', 'dia'],
    ['g', 24.56, 27.07, '霓虹灯·激光·低温制冷剂', 'fcc'],
    ['s', 370.94, 1156, '钠灯·金属还原剂·食盐化工', 'bcc'],
    ['s', 923, 1363, '轻合金·闪光灯·抗酸药', 'hcp'],
    ['s', 933.47, 2792, '航空铝材·包装箔·输电导线', 'fcc'],
    ['s', 1687, 3538, '半导体芯片·光伏·有机硅', 'dia'],
    ['s', 317.3, 553.7, '磷肥·阻燃剂·火柴', 'dia'],
    ['s', 388.36, 717.8, '硫酸·橡胶硫化·杀菌剂', 'dia'],
    ['g', 171.6, 239.11, '消毒漂白·PVC·盐酸', 'dia'],
    ['g', 83.81, 87.30, '焊接保护气·冶金·灯泡填充', 'fcc'],
    ['s', 336.53, 1032, '钾肥·玻璃·钠钾合金冷却剂', 'bcc'],
    ['s', 1115, 1757, '水泥石灰·炼钢脱氧·补钙', 'fcc'],
    ['s', 1814, 3109, '铝钪合金·高强度灯·航空航天', 'hcp'],
    ['s', 1941, 3560, '钛合金·人工关节·钛白颜料', 'hcp'],
    ['s', 2183, 3680, '高强度钢添加剂·钒液流电池', 'bcc'],
    ['s', 2180, 2944, '不锈钢·镀铬·颜料', 'bcc'],
    ['s', 1519, 2334, '锰钢·干电池·铝合金', 'bcc'],
    ['s', 1811, 3134, '钢铁工业核心·电机铁芯·血红蛋白', 'bcc'],
    ['s', 1768, 3200, '硬质合金·锂电池正极·蓝色颜料', 'hcp'],
    ['s', 1728, 3186, '不锈钢·充电电池·电镀', 'fcc'],
    ['s', 1357.77, 2835, '电线电缆·电机绕组·换热器', 'fcc'],
    ['s', 692.68, 1180, '镀锌防腐·黄铜·锌空气电池', 'hcp'],
    ['s', 302.91, 2673, '氮化镓 LED 与快充·半导体', 'dia'],
    ['s', 1211.40, 3106, '红外光学·光纤掺杂·半导体', 'dia'],
    ['s', 1090, 887, '砷化镓半导体·农药·合金硬化', 'dia'],
    ['s', 494, 958, '硒鼓光敏材料·光伏·微量元素', 'dia'],
    ['l', 265.8, 332.0, '阻燃剂·感光胶片·医药中间体', 'dia'],
    ['g', 115.79, 119.93, '高功率灯·激光·绝缘气体', 'fcc'],
    ['s', 312.46, 961, '原子钟·光电管·焰火', 'bcc'],
    ['s', 1050, 1655, '焰火红色·夜光材料·铁氧体', 'fcc'],
    ['s', 1799, 3609, 'YAG 激光·白光 LED 荧光粉·超导', 'hcp'],
    ['s', 2128, 4682, '核燃料包壳·陶瓷刀具·立方氧化锆', 'hcp'],
    ['s', 2750, 5017, '超导磁体 NbTi·铌钢·电容器', 'bcc'],
    ['s', 2896, 4912, '高温合金·二硫化钼润滑·催化剂', 'bcc'],
    ['s', 2430, 4538, '核医学显像锝-99m', 'hcp'],
    ['s', 2607, 4423, '催化剂·电子触点·耐磨涂层', 'hcp'],
    ['s', 2237, 3968, '汽车三元催化·铂铑热电偶', 'fcc'],
    ['s', 1828.05, 3236, '催化转换器·储氢·电子元件', 'fcc'],
    ['s', 1234.93, 2435, '导电银浆·感光材料·抗菌', 'fcc'],
    ['s', 594.22, 1040, '镍镉电池·颜料·反应堆控制棒', 'hcp'],
    ['s', 429.75, 2345, 'ITO 透明导电膜·低熔合金', 'fcc'],
    ['s', 505.08, 2875, '焊料·马口铁·青铜', 'dia'],
    ['s', 903.78, 1860, '阻燃协效剂·铅酸电池·半导体掺杂', 'dia'],
    ['s', 722.66, 1261, '碲化镉薄膜电池·热电材料', 'hcp'],
    ['s', 386.85, 457.4, '碘伏消毒·食盐加碘·造影剂', 'dia'],
    ['g', 161.4, 165.03, '闪光灯·麻醉剂·离子推进器', 'fcc'],
    ['s', 301.59, 944, '原子钟基准·光电阴极·钻井液', 'bcc'],
    ['s', 1000, 2170, '钻井加重剂·钡餐造影·焰火绿', 'bcc'],
    ['s', 1193, 3737, '镍氢电池·石油裂化催化·光学玻璃', 'hcp'],
    ['s', 1068, 3716, '抛光粉·汽车尾气催化·打火石', 'fcc'],
    ['s', 1208, 3793, '强磁体·电焊护目镜·玻璃着色', 'hcp'],
    ['s', 1297, 3347, '钕铁硼强磁·激光·玻璃着色', 'hcp'],
    ['s', 1315, 3273, '核电池·测厚仪·发光涂料', 'hcp'],
    ['s', 1345, 2173, '钐钴磁体·中子吸收·抗癌药', 'hcp'],
    ['s', 1099, 1802, '红色荧光粉·防伪油墨', 'bcc'],
    ['s', 1585, 3546, 'MRI 造影剂·磁制冷·中子吸收', 'hcp'],
    ['s', 1629, 3503, '绿色荧光粉·磁光存储·传感器', 'hcp'],
    ['s', 1680, 2840, '高性能磁体添加剂·磁致伸缩', 'hcp'],
    ['s', 1734, 2993, '钬激光碎石·光纤·磁体', 'hcp'],
    ['s', 1802, 3141, '光纤放大器 EDFA·激光·粉色玻璃', 'hcp'],
    ['s', 1818, 2223, '便携 X 射线源·激光·高温超导', 'hcp'],
    ['s', 1097, 1469, '光纤激光·原子钟·应力传感', 'fcc'],
    ['s', 1925, 3675, 'PET 探测器 LSO·催化裂化', 'hcp'],
    ['s', 2506, 4876, '核控制棒·高 k 栅介质·等离子切割', 'hcp'],
    ['s', 3290, 5731, '电容器·外科植入物·硬质合金', 'bcc'],
    ['s', 3695, 6203, '灯丝·硬质合金·穿甲弹·电极', 'bcc'],
    ['s', 3459, 5869, '喷气发动机叶片超合金·催化剂', 'hcp'],
    ['s', 3306, 5285, '耐磨触点·电镜染色·超硬合金', 'hcp'],
    ['s', 2719, 4701, '火花塞电极·坩埚·电解阳极', 'fcc'],
    ['s', 2041.4, 4098, '三元催化·顺铂抗癌药·坩埚电极', 'fcc'],
    ['s', 1337.33, 3129, '货币储备·键合引线·航天镀层', 'fcc'],
    ['l', 234.32, 629.88, '温度计·荧光灯·氯碱电解（已限用）', 'fcc'],
    ['s', 577, 1746, '红外探测器·心脏显像（已限用）', 'hcp'],
    ['s', 600.61, 2022, '铅酸电池·辐射屏蔽·焊料（受限）', 'fcc'],
    ['s', 544.7, 1837, '无铅焊料·胃药·易熔合金', 'hcp'],
    ['s', 527, 1235, '静电消除·同位素热源（放射性）', 'fcc'],
    ['s', 575, 610, '靶向 α 治疗研究（放射性）', 'fcc'],
    ['g', 202, 211.5, '放射治疗史·室内氡监测对象', 'fcc'],
    ['s', 300, 950, '核结构研究（极不稳定）', 'bcc'],
    ['s', 973, 2010, '历史放疗·夜光涂料（已弃用）', 'bcc'],
    ['s', 1323, 3471, '中子源·癌症治疗研究', 'fcc'],
    ['s', 2115, 5061, '钍基核燃料·钨极焊接·光学透镜', 'fcc'],
    ['s', 1841, 4300, '地质年代测定镤-231', 'fcc'],
    ['s', 1405.3, 4404, '核电燃料·舰艇核动力·贫铀装甲', 'bcc'],
    ['s', 917, 4273, '中子探测·核燃料循环研究', 'bcc'],
    ['s', 912.5, 3501, '核武器与 MOX 燃料·同位素电源', 'fcc'],
    ['s', 1449, 2880, '烟雾探测器镅-241·测厚仪', 'hcp'],
    ['s', 1613, 3383, '火星车 α/X 射线谱仪电源', 'hcp'],
    ['s', 1259, 2900, '超铀元素化学研究', 'fcc'],
    ['s', 1173, 1743, '中子源锎-252·探矿·反应堆启动', 'fcc'],
    ['s', 1133, 1269, '重元素化学研究', 'fcc'],
    ['s', 1800, null, '重元素化学研究', 'fcc'],
    ['s', 1100, null, '以门捷列夫命名的合成元素', 'fcc'],
    ['s', 1100, null, '以诺贝尔命名的合成元素', 'fcc'],
    ['s', 1900, null, '以回旋加速器命名的合成元素', 'fcc'],
    ['s', 2400, 5800, '超重元素研究（预测值）', 'fcc'],
    ['s', null, null, '超重元素研究（预测值）', 'fcc'],
    ['s', null, null, '超重元素研究（预测值）', 'fcc'],
    ['s', null, null, '超重元素研究（预测值）', 'fcc'],
    ['s', null, null, '超重元素研究（预测值）', 'fcc'],
    ['s', null, null, '超重元素研究（预测值）', 'fcc'],
    ['s', null, null, '超重元素研究（预测值）', 'fcc'],
    ['s', null, null, '超重元素研究（预测值）', 'fcc'],
    ['l', 283, 340, '超重元素研究（预测值）', 'fcc'],
    ['s', 700, 1430, '超重元素研究（预测值）', 'fcc'],
    ['s', 200, 380, '超重元素研究（预测值）', 'fcc'],
    ['s', 700, 1400, '超重元素研究（预测值）', 'fcc'],
    ['s', 709, 1085, '超重元素研究（预测值）', 'fcc'],
    ['s', 723, 883, '超重元素研究（预测值）', 'fcc'],
    ['g', 258, 263, '超重元素研究（预测值）', 'fcc']
  ];

  /* ==================================================================
     三、电子排布（Madelung 填充 + 已知异常修正）
     ================================================================== */
  var ORB = [
    ['1s', 2], ['2s', 2], ['2p', 6], ['3s', 2], ['3p', 6], ['4s', 2], ['3d', 10],
    ['4p', 6], ['5s', 2], ['4d', 10], ['5p', 6], ['6s', 2], ['4f', 14], ['5d', 10],
    ['6p', 6], ['7s', 2], ['5f', 14], ['6d', 10], ['7p', 6]
  ];
  var SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  function sup(n) { return String(n).split('').map(function (c) { return SUP[c] || c; }).join(''); }

  /* 实验观测到的异常构型（价层部分） */
  var EXCEPT = {
    24: '[Ar]3d⁵4s¹', 29: '[Ar]3d¹⁰4s¹', 41: '[Kr]4d⁴5s¹', 42: '[Kr]4d⁵5s¹',
    44: '[Kr]4d⁷5s¹', 45: '[Kr]4d⁸5s¹', 46: '[Kr]4d¹⁰', 47: '[Kr]4d¹⁰5s¹',
    57: '[Xe]5d¹6s²', 58: '[Xe]4f¹5d¹6s²', 64: '[Xe]4f⁷5d¹6s²',
    78: '[Xe]4f¹⁴5d⁹6s¹', 79: '[Xe]4f¹⁴5d¹⁰6s¹',
    89: '[Rn]6d¹7s²', 90: '[Rn]6d²7s²', 91: '[Rn]5f²6d¹7s²', 92: '[Rn]5f³6d¹7s²',
    93: '[Rn]5f⁴6d¹7s²', 96: '[Rn]5f⁷6d¹7s²', 103: '[Rn]5f¹⁴7s²7p¹'
  };
  var CORE = [[86, '[Rn]'], [54, '[Xe]'], [36, '[Kr]'], [18, '[Ar]'], [10, '[Ne]'], [2, '[He]']];

  var cfgCache = {};
  function electronConfig(Z) {
    if (cfgCache[Z]) return cfgCache[Z];
    if (EXCEPT[Z]) { cfgCache[Z] = EXCEPT[Z]; return EXCEPT[Z]; }
    var left = Z, fill = [], i;
    for (i = 0; i < ORB.length && left > 0; i++) {
      var name = ORB[i][0], cap = ORB[i][1];
      var n = Math.min(cap, left);
      fill.push({ name: name, n: n, shell: parseInt(name.charAt(0), 10), l: name.charAt(1) });
      left -= n;
    }
    if (left > 0) return '—';
    fill.sort(function (a, b) {
      if (a.shell !== b.shell) return a.shell - b.shell;
      var la = 'spdf'.indexOf(a.l), lb = 'spdf'.indexOf(b.l);
      return la - lb;
    });
    var parts = fill.map(function (f) { return f.name + sup(f.n); });
    // 压缩为稀有气体实
    var core = '', idx = 0;
    for (i = 0; i < CORE.length; i++) {
      if (Z > CORE[i][0]) {
        core = CORE[i][1];
        var l2 = CORE[i][0], k2 = 0;
        for (var j = 0; j < ORB.length && l2 > 0; j++) { l2 -= Math.min(ORB[j][1], l2); k2++; }
        idx = k2;
        break;
      }
    }
    var out = core + parts.slice(idx).join('');
    cfgCache[Z] = out;
    return out;
  }

  /* ==================================================================
     四、小工具
     ================================================================== */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function fmtK(x) {
    if (x === null || x === undefined || !isFinite(x)) return '—';
    if (x >= 1000) return (Math.round(x)).toString() + ' K';
    return (Math.round(x * 10) / 10).toString() + ' K';
  }
  function fmtBoth(x) {
    if (x === null || x === undefined || !isFinite(x)) return '—';
    var c = x - 273.15;
    if (x >= 1000) return Math.round(x) + ' K / ' + Math.round(c) + ' °C';
    return (Math.round(x * 10) / 10) + ' K / ' + (Math.round(c * 10) / 10) + ' °C';
  }

  /* ==================================================================
     五、Canvas 绘制辅助
     ================================================================== */
  function drawTokens(c, tokens, cx, baseY, baseSize, mono) {
    if (!tokens || !tokens.length) return;
    var fam = mono ? '"Consolas","DejaVu Sans Mono",monospace'
      : '"Cambria Math","Georgia","Microsoft YaHei",serif';
    var items = [], total = 0, i;
    for (i = 0; i < tokens.length; i++) {
      var tk = tokens[i];
      var size = baseSize * (tk.sz || 1);
      c.font = (tk.i ? 'italic ' : '') + (tk.b ? '700 ' : '400 ') + size + 'px ' + fam;
      var w = c.measureText(tk.s).width;
      items.push({ tk: tk, w: w, size: size });
      total += w;
    }
    var x = cx - total / 2;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      var y = baseY + (it.tk.sub ? it.size * 0.30 : (it.tk.sup ? -it.size * 0.42 : 0));
      c.font = (it.tk.i ? 'italic ' : '') + (it.tk.b ? '700 ' : '400 ') + it.size + 'px ' + fam;
      c.fillStyle = it.tk.c || '#e8f2ff';
      c.fillText(it.tk.s, x + it.w / 2, y);
      x += it.w;
    }
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  function dottedLeader(c, x0, x1, y) {
    c.save();
    c.fillStyle = 'rgba(140,162,190,0.30)';
    for (var x = x0; x < x1 - 2; x += 10) c.fillRect(x, y, 2, 2);
    c.restore();
  }

  /** HUD 数据卡片（1024×880，支持 8 行 + 页脚） */
  function mkCard(THREE, parent, w, h, def) {
    var W = 1024, H = 880;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    var tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;

    var mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide })
    );
    mesh.renderOrder = 900;
    parent.add(mesh);

    var card = {
      title: def.title, accent: def.accent, formula: def.formula || [],
      sub: def.sub || [], note: def.note || '', rows: def.rows || [], foot: def.foot || ''
    };

    function redraw() {
      c.clearRect(0, 0, W, H);
      c.save();
      roundRect(c, 8, 8, W - 16, H - 16, 4);
      var g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(13,18,27,0.955)');
      g.addColorStop(1, 'rgba(6,9,15,0.97)');
      c.fillStyle = g; c.fill();
      c.lineWidth = 2; c.strokeStyle = 'rgba(196,214,232,0.30)'; c.stroke();
      c.restore();

      c.save();
      roundRect(c, 8, 8, W - 16, H - 16, 4); c.clip();
      var lg = c.createLinearGradient(0, 0, W, 0);
      lg.addColorStop(0, card.accent);
      lg.addColorStop(0.45, 'rgba(255,255,255,0.05)');
      lg.addColorStop(1, card.accent);
      c.fillStyle = lg; c.globalAlpha = 0.9;
      c.fillRect(8, 8, W - 16, 4);
      c.restore();

      c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillStyle = card.accent;
      c.fillRect(46, 50, 5, 30);
      c.font = '700 31px "Georgia","Microsoft YaHei",serif';
      c.fillStyle = '#dfe7f2';
      c.fillText(card.title, 66, 66);

      c.strokeStyle = 'rgba(150,170,195,0.35)'; c.lineWidth = 2;
      for (var i = 0; i < 6; i++) {
        c.beginPath();
        c.moveTo(W - 52 - i * 13, 46);
        c.lineTo(W - 52 - i * 13, 46 + (i % 2 ? 9 : 16));
        c.stroke();
      }

      drawTokens(c, card.formula, W / 2, 150, 78, false);
      if (card.sub.length) drawTokens(c, card.sub, W / 2, 224, 32, false);

      c.textAlign = 'center';
      c.font = '400 24px "Microsoft YaHei","Segoe UI",sans-serif';
      c.fillStyle = 'rgba(152,170,192,0.95)';
      c.fillText(card.note, W / 2, 274, W - 120);

      c.strokeStyle = 'rgba(150,175,205,0.20)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(52, 306); c.lineTo(W - 52, 306); c.stroke();

      var y0 = 358, dy = 58;
      for (var r = 0; r < card.rows.length; r++) {
        var row = card.rows[r], y = y0 + r * dy;
        c.textAlign = 'left';
        c.font = '400 25px "Microsoft YaHei","Segoe UI",sans-serif';
        c.fillStyle = 'rgba(174,192,216,1)';
        c.fillText(row.k, 54, y);
        var kw = c.measureText(row.k).width;
        c.textAlign = 'right';
        c.font = '600 27px "Consolas","DejaVu Sans Mono",monospace';
        c.fillStyle = row.c || '#e8f2ff';
        c.fillText(row.v, W - 54, y);
        var vw = c.measureText(row.v).width;
        dottedLeader(c, 54 + kw + 14, W - 54 - vw - 14, y);
      }

      if (card.foot) {
        c.textAlign = 'center';
        c.font = 'italic 400 23px "Georgia","Microsoft YaHei",serif';
        c.fillStyle = 'rgba(126,144,168,0.92)';
        c.fillText(card.foot, W / 2, H - 38, W - 110);
      }
      tex.needsUpdate = true;
    }
    redraw();
    return { mesh: mesh, card: card, redraw: redraw };
  }

  /** 静态文字标签（自适应宽度） */
  function mkTag(THREE, parent, text, color, scale, opt) {
    opt = opt || {};
    var css = color || '#d9d3c7';
    var font = '600 62px "Microsoft YaHei","Segoe UI",sans-serif';
    var mc = document.createElement('canvas').getContext('2d');
    mc.font = font;
    var W = Math.max(128, Math.ceil(mc.measureText(text).width) + 72), H = 132;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    if (opt.rule) { c.fillStyle = 'rgba(190,210,232,0.55)'; c.fillRect(10, H - 18, W - 20, 2); }
    c.font = font;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = css; c.shadowBlur = 22;
    c.fillStyle = css; c.fillText(text, W / 2, H / 2 - 4);
    c.shadowBlur = 8; c.globalAlpha = 0.5; c.fillStyle = '#ffffff';
    c.fillText(text, W / 2, H / 2 - 4);
    var tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: opt.opacity === undefined ? 1 : opt.opacity
    }));
    var s = scale || 1;
    sp.scale.set(W / H * 1.45 * s, 1.45 * s, 1);
    sp.renderOrder = 998;
    parent.add(sp);
    return sp;
  }

  /** 可动态改文字的标签 */
  function mkTagDyn(THREE, parent, scale, opt) {
    opt = opt || {};
    var W = 900, H = 180;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    var tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    var s = scale || 0.6;
    sp.scale.set(W / H * 1.45 * s, 1.45 * s, 1);
    sp.renderOrder = 998;
    parent.add(sp);
    return {
      sprite: sp,
      set: function (text, css) {
        c.clearRect(0, 0, W, H);
        if (opt.rule) { c.fillStyle = 'rgba(190,210,232,0.55)'; c.fillRect(24, H - 34, W - 48, 3); }
        c.font = '600 84px "Microsoft YaHei","Segoe UI",sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.shadowColor = css || '#eaf2ff'; c.shadowBlur = 26;
        c.fillStyle = css || '#eaf2ff';
        c.fillText(text, W / 2, H / 2 - 8);
        c.shadowBlur = 9; c.globalAlpha = 0.5; c.fillStyle = '#ffffff';
        c.fillText(text, W / 2, H / 2 - 8);
        tex.needsUpdate = true;
      }
    };
  }

  /* ==================================================================
     六、几何辅助
     ================================================================== */
  function Segments(THREE, parent, maxSeg, opt) {
    opt = opt || {};
    var g = new THREE.BufferGeometry();
    var pos = new Float32Array(maxSeg * 6);
    var col = new Float32Array(maxSeg * 6);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var m = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true,
      opacity: opt.opacity === undefined ? 0.9 : opt.opacity,
      blending: opt.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
      depthWrite: false
    });
    var obj = new THREE.LineSegments(g, m);
    obj.frustumCulled = false;
    obj.renderOrder = opt.order || 5;
    parent.add(obj);
    var _c = new THREE.Color();
    return {
      obj: obj, max: maxSeg,
      set: function (i, x1, y1, z1, x2, y2, z2, c1, c2) {
        if (i < 0 || i >= maxSeg) return this;
        var o = i * 6;
        pos[o] = x1; pos[o + 1] = y1; pos[o + 2] = z1;
        pos[o + 3] = x2; pos[o + 4] = y2; pos[o + 5] = z2;
        if (c1 !== undefined) {
          _c.setHex(c1); col[o] = _c.r; col[o + 1] = _c.g; col[o + 2] = _c.b;
          _c.setHex(c2 === undefined ? c1 : c2); col[o + 3] = _c.r; col[o + 4] = _c.g; col[o + 5] = _c.b;
        }
        return this;
      },
      count: function (n) {
        g.setDrawRange(0, Math.min(n, maxSeg) * 2);
        g.attributes.position.needsUpdate = true;
        g.attributes.color.needsUpdate = true;
        return this;
      }
    };
  }

  function Cloud(THREE, parent, n, size, tex, opt) {
    opt = opt || {};
    var g = new THREE.BufferGeometry();
    var pos = new Float32Array(n * 3);
    var col = new Float32Array(n * 3);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    var m = new THREE.PointsMaterial({
      size: size, sizeAttenuation: true, vertexColors: true,
      map: tex || null, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: opt.opacity === undefined ? 1 : opt.opacity
    });
    var obj = new THREE.Points(g, m);
    obj.frustumCulled = false;
    obj.renderOrder = opt.order || 6;
    parent.add(obj);
    var _c = new THREE.Color();
    return {
      obj: obj, n: n,
      set: function (i, x, y, z, c, k) {
        if (i < 0 || i >= n) return;
        var o = i * 3;
        pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
        _c.setHex(c === undefined ? 0xffffff : c);
        var f = k === undefined ? 1 : clamp(k, 0, 1);
        col[o] = _c.r * f; col[o + 1] = _c.g * f; col[o + 2] = _c.b * f;
      },
      flush: function () {
        g.attributes.position.needsUpdate = true;
        g.attributes.color.needsUpdate = true;
      }
    };
  }

  function wireOf(THREE, geo, color, opacity, thr) {
    return new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, thr === undefined ? 18 : thr),
      new THREE.LineBasicMaterial({
        color: color === undefined ? C.ink : color, transparent: true,
        opacity: opacity === undefined ? 0.55 : opacity, depthWrite: false
      })
    );
  }

  var _dotTex = null;
  function dotTexture(THREE) {
    if (_dotTex) return _dotTex;
    var s = 64;
    var cv = document.createElement('canvas');
    cv.width = s; cv.height = s;
    var c = cv.getContext('2d');
    var gd = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gd.addColorStop(0, 'rgba(255,255,255,1)');
    gd.addColorStop(0.35, 'rgba(255,255,255,0.75)');
    gd.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gd; c.fillRect(0, 0, s, s);
    _dotTex = new THREE.CanvasTexture(cv);
    return _dotTex;
  }

  /* ==================================================================
     七、BLOOM 后处理
     ================================================================== */
  function makeBloom(THREE, renderer) {
    var isGL2 = !!(renderer.capabilities && renderer.capabilities.isWebGL2);
    var type = isGL2 ? THREE.HalfFloatType : THREE.UnsignedByteType;
    function mkRT(w, h, depth) {
      var o = {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat, type: type,
        depthBuffer: !!depth, stencilBuffer: false
      };
      var rt = new THREE.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), o);
      if (isGL2 && depth) rt.samples = 4;
      return rt;
    }

    var size = new THREE.Vector2();
    renderer.getDrawingBufferSize(size);
    var W = Math.max(2, Math.floor(size.x)), H = Math.max(2, Math.floor(size.y));

    var rtScene = mkRT(W, H, true);
    var levels = [];
    for (var i = 0; i < 3; i++) {
      var d = Math.pow(2, i + 1);
      levels.push({
        a: mkRT(Math.floor(W / d), Math.floor(H / d), false),
        b: mkRT(Math.floor(W / d), Math.floor(H / d), false),
        w: Math.floor(W / d), h: Math.floor(H / d)
      });
    }

    var quadScene = new THREE.Scene();
    var quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    var quadGeo = new THREE.PlaneGeometry(2, 2);
    var quad = new THREE.Mesh(quadGeo, null);
    quad.frustumCulled = false;
    quadScene.add(quad);

    var VS = 'varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

    var matBright = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uThresh: { value: 0.60 }, uSoft: { value: 0.35 } },
      vertexShader: VS,
      fragmentShader: [
        'uniform sampler2D tSrc; uniform float uThresh; uniform float uSoft;',
        'varying vec2 vUv;',
        'void main(){',
        '  vec3 c = texture2D(tSrc, vUv).rgb;',
        '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
        '  float k = smoothstep(uThresh, uThresh + uSoft, l);',
        '  gl_FragColor = vec4(c * k, 1.0);',
        '}'
      ].join('\n'),
      depthTest: false, depthWrite: false
    });

    var matBlur = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2(1, 0) } },
      vertexShader: VS,
      fragmentShader: [
        'uniform sampler2D tSrc; uniform vec2 uDir;',
        'varying vec2 vUv;',
        'void main(){',
        '  vec4 s = texture2D(tSrc, vUv) * 0.227027;',
        '  s += (texture2D(tSrc, vUv + uDir * 1.3846153846) + texture2D(tSrc, vUv - uDir * 1.3846153846)) * 0.3162162162;',
        '  s += (texture2D(tSrc, vUv + uDir * 3.2307692308) + texture2D(tSrc, vUv - uDir * 3.2307692308)) * 0.0702702703;',
        '  gl_FragColor = s;',
        '}'
      ].join('\n'),
      depthTest: false, depthWrite: false
    });

    var matComp = new THREE.ShaderMaterial({
      uniforms: {
        tBase: { value: null }, tB0: { value: null }, tB1: { value: null }, tB2: { value: null },
        uStrength: { value: 1.0 }, uVignette: { value: 0.55 }, uScan: { value: 0.030 }
      },
      vertexShader: VS,
      fragmentShader: [
        'uniform sampler2D tBase, tB0, tB1, tB2;',
        'uniform float uStrength, uVignette, uScan;',
        'varying vec2 vUv;',
        'void main(){',
        '  vec3 b = texture2D(tBase, vUv).rgb;',
        '  vec3 g = texture2D(tB0, vUv).rgb * 0.50',
        '          + texture2D(tB1, vUv).rgb * 0.32',
        '          + texture2D(tB2, vUv).rgb * 0.18;',
        '  vec3 o = b + g * uStrength;',
        '  vec2 d = vUv - 0.5;',
        '  o *= 1.0 - dot(d, d) * uVignette;',
        '  o *= 1.0 - uScan * step(0.5, fract(gl_FragCoord.y * 0.5));',
        '  gl_FragColor = vec4(o, 1.0);',
        '}'
      ].join('\n'),
      depthTest: false, depthWrite: false
    });

    function pass(mat, target) {
      quad.material = mat;
      renderer.setRenderTarget(target || null);
      renderer.render(quadScene, quadCam);
    }

    var curW = W, curH = H;
    function resize() {
      renderer.getDrawingBufferSize(size);
      var w = Math.max(2, Math.floor(size.x)), h = Math.max(2, Math.floor(size.y));
      if (w === curW && h === curH) return;
      curW = w; curH = h;
      rtScene.setSize(w, h);
      for (var i = 0; i < levels.length; i++) {
        var d = Math.pow(2, i + 1);
        var lw = Math.max(2, Math.floor(w / d)), lh = Math.max(2, Math.floor(h / d));
        levels[i].a.setSize(lw, lh);
        levels[i].b.setSize(lw, lh);
        levels[i].w = lw; levels[i].h = lh;
      }
    }

    return {
      strength: 1.0, threshold: 0.60, enabled: true, scan: true,
      resize: resize,
      render: function (r, scene, camera) {
        resize();
        if (!this.enabled || this.strength <= 0.001) {
          renderer.setRenderTarget(null);
          renderer.render(scene, camera);
          return;
        }
        renderer.setRenderTarget(rtScene);
        renderer.clear();
        renderer.render(scene, camera);

        matBright.uniforms.tSrc.value = rtScene.texture;
        matBright.uniforms.uThresh.value = this.threshold;
        pass(matBright, levels[0].a);

        for (var i = 0; i < levels.length; i++) {
          var L = levels[i];
          if (i > 0) {
            matBright.uniforms.tSrc.value = levels[i - 1].a.texture;
            matBright.uniforms.uThresh.value = 0.0;
            pass(matBright, L.a);
          }
          matBlur.uniforms.tSrc.value = L.a.texture;
          matBlur.uniforms.uDir.value.set(1 / L.w, 0);
          pass(matBlur, L.b);
          matBlur.uniforms.tSrc.value = L.b.texture;
          matBlur.uniforms.uDir.value.set(0, 1 / L.h);
          pass(matBlur, L.a);
        }

        matComp.uniforms.tBase.value = rtScene.texture;
        matComp.uniforms.tB0.value = levels[0].a.texture;
        matComp.uniforms.tB1.value = levels[1].a.texture;
        matComp.uniforms.tB2.value = levels[2].a.texture;
        matComp.uniforms.uStrength.value = this.strength;
        matComp.uniforms.uVignette.value = this.scan ? 0.55 : 0.0;
        matComp.uniforms.uScan.value = this.scan ? 0.030 : 0.0;
        pass(matComp, null);
      },
      dispose: function () {
        rtScene.dispose();
        levels.forEach(function (L) { L.a.dispose(); L.b.dispose(); });
        quadGeo.dispose();
        matBright.dispose(); matBlur.dispose(); matComp.dispose();
      }
    };
  }

  /* ==================================================================
     八、晶格基元（单位晶胞内原子坐标，归一化 0..1）
     ================================================================== */
  var LATTICE = {
    fcc: {
      name: '面心立方 FCC · 配位数 12', nn: 0.72,
      basis: [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]]
    },
    bcc: {
      name: '体心立方 BCC · 配位数 8', nn: 0.92,
      basis: [[0, 0, 0], [0.5, 0.5, 0.5]]
    },
    hcp: {
      name: '密排六方 HCP · 配位数 12', nn: 1.02,
      basis: [[0, 0, 0], [0.5, 0.5, 0], [1 / 3, 2 / 3, 0.5], [5 / 6, 5 / 6, 0.5]]
    },
    dia: {
      name: '金刚石结构 · 配位数 4', nn: 0.47,
      basis: [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5],
      [0.25, 0.25, 0.25], [0.75, 0.75, 0.25], [0.75, 0.25, 0.75], [0.25, 0.75, 0.75]]
    }
  };

  /* ==================================================================
     九、主场景
     ================================================================== */
  var S = 7.4;                            // 样品舱边长
  var CAP = { x: 1.5, y: 0.6, z: 0 };     // 样品舱中心

  HL.registerScene({
    id: 'periodic',
    name: '元素周期表',
    short: '118 种元素的物态剧场',
    icon: '⬛',
    desc: '玻璃样品舱按温区实时呈现气/液/固三态 · 背景 3D 周期表墙按类别分色 · HUD 元素档案',
    fov: 45,
    minDistance: 3,
    maxDistance: 200,

    controls: [
      { type: 'range', key: 'Z', label: '原子序数 Z', min: 1, max: 118, step: 1, value: 26 },
      { type: 'range', key: 'logT', label: '环境温度 log₁₀(T / K)', min: 0.7, max: 3.8, step: 0.005, value: 2.474 },
      {
        type: 'buttons', key: 'hl', label: '高亮分组',
        options: [
          { label: '全部', value: 'all' },
          { label: '金属', value: 'metal' },
          { label: '卤素', value: 'halogen' },
          { label: '稀有气体', value: 'noble' },
          { label: '非金属', value: 'nonmetal' }
        ],
        value: 'all'
      },
      {
        type: 'buttons', key: 'lat', label: '晶格类型',
        options: [
          { label: '自动', value: 'auto' },
          { label: 'FCC', value: 'fcc' },
          { label: 'BCC', value: 'bcc' },
          { label: 'HCP', value: 'hcp' },
          { label: '金刚石', value: 'dia' }
        ],
        value: 'auto'
      },
      { type: 'check', key: 'tour', label: '自动巡览元素', value: false },
      { type: 'check', key: 'grid', label: '显示 3D 周期表墙', value: true },
      { type: 'check', key: 'refract', label: '玻璃折射（关闭可提速）', value: true },
      { type: 'range', key: 'bloom', label: 'BLOOM 强度', min: 0, max: 2.2, step: 0.05, value: 1.0 },
      { type: 'check', key: 'scan', label: '扫描线 / 暗角', value: true }
    ],

    create: function (ctx) {
      var THREE = ctx.THREE, scene = ctx.scene, camera = ctx.camera;
      var g = new THREE.Group();
      scene.add(g);

      var P = {
        Z: 26, logT: 2.474, hl: 'all', lat: 'auto',
        tour: false, grid: true, refract: true, bloom: 1.0, scan: true
      };

      var ELEMS = HL.ELEMENTS;
      var CATCOLOR = HL.ELEMENT_CATEGORIES;
      var dotTex = dotTexture(THREE);

      /* ---------- 背景：深空渐变 ---------- */
      var bgGeo = new THREE.SphereGeometry(600, 32, 24);
      var bgMat = new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false,
        uniforms: {},
        vertexShader: 'varying vec3 vP;\nvoid main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: [
          'varying vec3 vP;',
          'void main(){',
          '  float h = normalize(vP).y * 0.5 + 0.5;',
          '  vec3 top = vec3(0.022, 0.046, 0.090);',
          '  vec3 mid = vec3(0.008, 0.016, 0.035);',
          '  vec3 bot = vec3(0.004, 0.008, 0.018);',
          '  vec3 c = h > 0.5 ? mix(mid, top, (h-0.5)*2.0) : mix(bot, mid, h*2.0);',
          '  gl_FragColor = vec4(c, 1.0);',
          '}'
        ].join('\n')
      });
      var bg = new THREE.Mesh(bgGeo, bgMat);
      bg.renderOrder = -1000;
      scene.add(bg);

      var stars = ctx.makeStars(2200, 700);
      scene.add(stars);

      /* ---------- 地面：网格 + 径向渐隐 ---------- */
      var floorY = -7.6;
      var floorGeo = new THREE.PlaneGeometry(120, 120, 1, 1);
      var floorMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 } },
        vertexShader: 'varying vec2 vUv;\nvoid main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: [
          'varying vec2 vUv; uniform float uTime;',
          'void main(){',
          '  vec2 p = (vUv - 0.5) * 120.0;',
          '  vec2 q = p / 2.0;',
          '  vec2 gr = abs(fract(q + 0.5) - 0.5) / max(fwidth(q), vec2(0.0001));',
          '  float line = 1.0 - min(min(gr.x, gr.y), 1.0);',
          '  float r = length(p);',
          '  float fade = smoothstep(46.0, 8.0, r);',
          '  float pulse = 0.55 + 0.45 * sin(r * 0.35 - uTime * 0.9);',
          '  vec3 col = mix(vec3(0.18,0.42,0.62), vec3(0.35,0.72,0.92), line);',
          '  gl_FragColor = vec4(col, (0.04 + line * 0.26) * fade * (0.6 + 0.4 * pulse));',
          '}'
        ].join('\n')
      });
      var floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = floorY;
      scene.add(floor);

      /* ============================================================
         样品舱：玻璃立方体 + 霓虹线框 + 角标
         ============================================================ */
      var Cell = new THREE.Group();
      Cell.position.set(CAP.x, CAP.y, CAP.z);
      g.add(Cell);

      var half = S / 2;
      var boxGeo = new THREE.BoxGeometry(S, S, S);

      var shellRefract = new THREE.MeshPhysicalMaterial({
        color: 0xd6f0ff, metalness: 0.0, roughness: 0.05,
        transmission: 0.95, thickness: 2.2, ior: 1.48,
        transparent: true, opacity: 1.0, side: THREE.DoubleSide,
        clearcoat: 1.0, clearcoatRoughness: 0.04,
        depthWrite: false
      });
      var shellFallback = new THREE.MeshBasicMaterial({
        color: 0x8fd8ff, transparent: true, opacity: 0.06,
        side: THREE.DoubleSide, depthWrite: false
      });
      var shell = new THREE.Mesh(boxGeo, shellRefract);
      shell.renderOrder = 20;
      Cell.add(shell);

      var edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(boxGeo),
        new THREE.LineBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.9 })
      );
      edges.renderOrder = 30;
      Cell.add(edges);

      var cornerSeg = Segments(THREE, Cell, 24, { opacity: 0.95 });
      (function buildCorners() {
        var k = 0, Lc = 0.66;
        for (var sx = -1; sx <= 1; sx += 2)
          for (var sy = -1; sy <= 1; sy += 2)
            for (var sz = -1; sz <= 1; sz += 2) {
              var x = sx * half, y = sy * half, z = sz * half;
              cornerSeg.set(k++, x, y, z, x - sx * Lc, y, z, C.white, C.cyan);
              cornerSeg.set(k++, x, y, z, x, y - sy * Lc, z, C.white, C.cyan);
              cornerSeg.set(k++, x, y, z, x, y, z - sz * Lc, C.white, C.cyan);
            }
        cornerSeg.count(k);
      })();

      // 底座
      var baseGrp = new THREE.Group();
      baseGrp.position.y = -half - 0.62;
      Cell.add(baseGrp);
      baseGrp.add(new THREE.Mesh(
        new THREE.CylinderGeometry(4.9, 5.4, 0.42, 64),
        new THREE.MeshBasicMaterial({ color: 0x0c1826, transparent: true, opacity: 0.9 })
      ));
      baseGrp.add(wireOf(THREE, new THREE.CylinderGeometry(4.9, 5.4, 0.42, 64), C.cyan, 0.5, 30));
      var baseRing = new THREE.Mesh(
        new THREE.TorusGeometry(5.05, 0.05, 8, 96),
        new THREE.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: 0.9 })
      );
      baseRing.rotation.x = Math.PI / 2;
      baseRing.position.y = 0.24;
      baseGrp.add(baseRing);

      // 体积光锥
      var volGeo = new THREE.ConeGeometry(4.7, 11.5, 48, 1, true);
      var volMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x8fe6ff) } },
        vertexShader: [
          'varying vec2 vUv; varying vec3 vN; varying vec3 vV;',
          'void main(){',
          '  vUv = uv;',
          '  vec4 wp = modelMatrix * vec4(position,1.0);',
          '  vN = normalize(mat3(modelMatrix) * normal);',
          '  vV = normalize(cameraPosition - wp.xyz);',
          '  gl_Position = projectionMatrix * viewMatrix * wp;',
          '}'
        ].join('\n'),
        fragmentShader: [
          'uniform float uTime; uniform vec3 uColor;',
          'varying vec2 vUv; varying vec3 vN; varying vec3 vV;',
          'void main(){',
          '  float top = smoothstep(0.0, 0.55, vUv.y);',
          '  float bot = 1.0 - smoothstep(0.55, 1.0, vUv.y) * 0.72;',
          '  float edge = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);',
          '  float band = 0.78 + 0.22 * sin(vUv.x * 34.0 + uTime * 0.6);',
          '  float a = (0.09 + edge * 0.28) * top * bot * band;',
          '  gl_FragColor = vec4(uColor, a);',
          '}'
        ].join('\n')
      });
      var vol = new THREE.Mesh(volGeo, volMat);
      vol.position.set(CAP.x, CAP.y + half + 5.5, CAP.z);
      vol.renderOrder = 8;
      g.add(vol);

      var lampRing = new THREE.Mesh(
        new THREE.TorusGeometry(1.55, 0.075, 8, 48),
        new THREE.MeshBasicMaterial({ color: 0xcaf2ff, transparent: true, opacity: 0.9 })
      );
      lampRing.rotation.x = Math.PI / 2;
      lampRing.position.set(CAP.x, CAP.y + half + 11.2, CAP.z);
      g.add(lampRing);

      /* ---------- 边缘霓虹标注 ---------- */
      var tagSym = mkTagDyn(THREE, Cell, 1.6, {});
      tagSym.sprite.position.set(0, half + 1.5, 0);
      var tagName = mkTagDyn(THREE, Cell, 0.95, {});
      tagName.sprite.position.set(0, -half - 1.15, 0);
      var tagPhase = mkTagDyn(THREE, Cell, 0.72, {});
      tagPhase.sprite.position.set(-half - 3.0, 0, 0);
      var tagTemp = mkTagDyn(THREE, Cell, 0.68, {});
      tagTemp.sprite.position.set(half + 3.0, 0, 0);
      var tagZ = mkTagDyn(THREE, Cell, 0.8, {});
      tagZ.sprite.position.set(0, half + 0.85, half + 0.25);

      mkTag(THREE, Cell, 'SAMPLE CHAMBER', '#6fe3ff', 0.5, { opacity: 0.7 })
        .position.set(0, -half - 2.45, 0);

      /* ============================================================
         内部样品：气 / 液 / 固
         ============================================================ */
      var Sample = new THREE.Group();
      Cell.add(Sample);
      var R_IN = half - 0.45;

      /* --- 气态 --- */
      var Gas = new THREE.Group(); Sample.add(Gas);
      var NG = 440;
      var gasP = Cloud(THREE, Gas, NG, 0.20, dotTex, { opacity: 0.95 });
      var gasV = new Float32Array(NG * 3);
      var gasPh = new Float32Array(NG);
      var gasPos = new Float32Array(NG * 3);
      for (var i = 0; i < NG; i++) {
        gasV[i * 3] = (Math.random() * 2 - 1);
        gasV[i * 3 + 1] = (Math.random() * 2 - 1);
        gasV[i * 3 + 2] = (Math.random() * 2 - 1);
        gasPh[i] = Math.random() * Math.PI * 2;
        gasPos[i * 3] = (Math.random() * 2 - 1) * R_IN;
        gasPos[i * 3 + 1] = (Math.random() * 2 - 1) * R_IN;
        gasPos[i * 3 + 2] = (Math.random() * 2 - 1) * R_IN;
      }

      /* --- 液态 --- */
      var Liq = new THREE.Group(); Sample.add(Liq);
      var liqMat = new THREE.ShaderMaterial({
        transparent: true, side: THREE.DoubleSide, depthWrite: false,
        uniforms: {
          uTime: { value: 0 }, uAmp: { value: 0.16 },
          uA: { value: new THREE.Color(0x4a1a10) },
          uB: { value: new THREE.Color(0xd0762f) },
          uGlow: { value: new THREE.Color(0xffb066) }
        },
        vertexShader: [
          'uniform float uTime; uniform float uAmp;',
          'varying float vH; varying vec2 vUv;',
          'void main(){',
          '  vUv = uv;',
          '  vec3 p = position;',
          '  float w = sin(p.x * 2.1 + uTime * 1.7) * 0.5',
          '           + sin(p.y * 2.7 - uTime * 1.25) * 0.4',
          '           + sin((p.x + p.y) * 1.35 + uTime * 2.05) * 0.32',
          '           + sin((p.x - p.y) * 3.1 - uTime * 2.6) * 0.18;',
          '  p.z += w * uAmp;',
          '  vH = w;',
          '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);',
          '}'
        ].join('\n'),
        fragmentShader: [
          'uniform vec3 uA; uniform vec3 uB; uniform vec3 uGlow;',
          'varying float vH; varying vec2 vUv;',
          'void main(){',
          '  float k = clamp(vH * 0.5 + 0.5, 0.0, 1.0);',
          '  vec3 col = mix(uA, uB, k);',
          '  float spec = pow(k, 9.0) * 0.9;',
          '  float rim = smoothstep(0.40, 0.50, abs(vUv.x - 0.5));',
          '  col += uGlow * spec;',
          '  col = mix(col, uGlow * 0.55, rim * 0.45);',
          '  gl_FragColor = vec4(col, 0.94);',
          '}'
        ].join('\n')
      });
      var liqTop = new THREE.Mesh(new THREE.PlaneGeometry(R_IN * 2, R_IN * 2, 72, 72), liqMat);
      liqTop.rotation.x = -Math.PI / 2;
      liqTop.renderOrder = 12;
      Liq.add(liqTop);

      var liqBodyH = R_IN * 0.88;
      var liqBodyGeo = new THREE.BoxGeometry(R_IN * 2, liqBodyH, R_IN * 2);
      var liqBody = new THREE.Mesh(liqBodyGeo, new THREE.MeshBasicMaterial({
        color: 0x8c3a18, transparent: true, opacity: 0.40,
        depthWrite: false, side: THREE.DoubleSide
      }));
      liqBody.renderOrder = 11;
      Liq.add(liqBody);
      var liqEdge = wireOf(THREE, liqBodyGeo, 0xff9a5c, 0.32);
      Liq.add(liqEdge);
      liqTop.position.y = -R_IN + liqBodyH;
      liqBody.position.y = -R_IN + liqBodyH / 2;
      liqEdge.position.copy(liqBody.position);

      var NB = 64;
      var bub = Cloud(THREE, Liq, NB, 0.14, dotTex, { opacity: 0.8 });
      var bubY = new Float32Array(NB), bubX = new Float32Array(NB), bubZ = new Float32Array(NB), bubS = new Float32Array(NB);
      for (i = 0; i < NB; i++) {
        bubX[i] = (Math.random() * 2 - 1) * R_IN * 0.9;
        bubZ[i] = (Math.random() * 2 - 1) * R_IN * 0.9;
        bubY[i] = -R_IN + Math.random() * liqBodyH;
        bubS[i] = 0.4 + Math.random() * 0.9;
      }

      /* --- 固态 --- */
      var Sol = new THREE.Group(); Sample.add(Sol);
      var MAXAT = 72, MAXBOND = 300;

      var atomMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 1 });
      var atoms = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 18, 12), atomMat, MAXAT);
      atoms.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      atoms.frustumCulled = false;
      atoms.count = 0;
      Sol.add(atoms);

      var haloMat = new THREE.MeshBasicMaterial({
        color: 0x9fd8ff, transparent: true, opacity: 0.18,
        blending: THREE.AdditiveBlending, depthWrite: false
      });
      var halos = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), haloMat, MAXAT);
      halos.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      halos.frustumCulled = false;
      halos.count = 0;
      halos.renderOrder = 4;
      Sol.add(halos);

      var bonds = Segments(THREE, Sol, MAXBOND, { opacity: 0.85 });
      var cellBox = wireOf(THREE, new THREE.BoxGeometry(1, 1, 1), C.steel, 0.32);
      Sol.add(cellBox);

      var latPts = [], latBonds = [];
      var _m4 = new THREE.Matrix4();
      var _v3 = new THREE.Vector3();
      var _q0 = new THREE.Quaternion();
      var _s3 = new THREE.Vector3();

      function buildLattice(kind) {
        var L = LATTICE[kind] || LATTICE.fcc;
        var N = 2;
        var a = (R_IN * 1.74) / N;
        var pts = [];
        for (var i = 0; i < N; i++)
          for (var j = 0; j < N; j++)
            for (var k = 0; k < N; k++)
              for (var b = 0; b < L.basis.length; b++) {
                if (kind === 'hcp' && b >= 2 && k === N - 1) continue;
                var bs = L.basis[b];
                pts.push([
                  (i + bs[0] - N / 2) * a,
                  (j + bs[1] - N / 2) * a,
                  (k + bs[2] - N / 2) * a
                ]);
              }
        var uniq = [];
        for (i = 0; i < pts.length; i++) {
          var dup = false;
          for (j = 0; j < uniq.length; j++) {
            var dx = pts[i][0] - uniq[j][0], dy = pts[i][1] - uniq[j][1], dz = pts[i][2] - uniq[j][2];
            if (dx * dx + dy * dy + dz * dz < 1e-6) { dup = true; break; }
          }
          if (!dup) uniq.push(pts[i]);
        }
        if (uniq.length > MAXAT) uniq.length = MAXAT;

        var thr = L.nn * a * 1.06, bd = [];
        for (i = 0; i < uniq.length && bd.length < MAXBOND; i++)
          for (j = i + 1; j < uniq.length && bd.length < MAXBOND; j++) {
            var ddx = uniq[i][0] - uniq[j][0], ddy = uniq[i][1] - uniq[j][1], ddz = uniq[i][2] - uniq[j][2];
            if (ddx * ddx + ddy * ddy + ddz * ddz < thr * thr) bd.push([i, j]);
          }
        latPts = uniq; latBonds = bd;
        atoms.count = uniq.length;
        halos.count = uniq.length;
        cellBox.scale.set(a * N, a * N, a * N);
        return L.name;
      }

      /* ============================================================
         背景：3D 周期表墙
         ============================================================ */
      var Wall = new THREE.Group();
      Wall.position.set(-1.6, 11.0, -15.0);
      g.add(Wall);

      var tileGeo = new THREE.BoxGeometry(0.94, 0.94, 0.20);
      var tiles = [];
      var wallW = 1.06;

      (function buildWall() {
        for (var i = 0; i < ELEMS.length; i++) {
          var e = ELEMS[i];
          var Z = e[0], cat = e[4], per = e[5], grp = e[6];
          var col = new THREE.Color(CATCOLOR[cat] || '#8fa8c0');
          var row = per, colx = grp;
          if (grp === 0) {
            row = (cat === '镧系') ? 9 : 10;
            colx = Z - (cat === '镧系' ? 54 : 86);
          }
          var m = new THREE.Mesh(tileGeo, new THREE.MeshBasicMaterial({
            color: col, transparent: true, opacity: 0.30, depthWrite: false
          }));
          m.position.set((colx - 9.5) * wallW, (6.0 - row) * wallW, -row * 0.34);
          m.renderOrder = 3;
          Wall.add(m);

          var ed = new THREE.LineSegments(
            new THREE.EdgesGeometry(tileGeo),
            new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.55 })
          );
          ed.position.copy(m.position);
          ed.renderOrder = 4;
          Wall.add(ed);

          tiles.push({ mesh: m, edge: ed, Z: Z, x: m.position.x, y: m.position.y, z: m.position.z, cat: cat });
        }
      })();

      var linkSeg = Segments(THREE, g, 4, { opacity: 0.7 });

      /* ============================================================
         HUD 卡片
         ============================================================ */
      var hud = mkCard(THREE, g, 9.6, 8.25, {
        title: '元素档案 · ELEMENT DOSSIER',
        accent: '#6fe3ff', formula: [], sub: [], note: '', rows: [], foot: ''
      });
      hud.mesh.position.set(-9.9, 1.2, 1.4);
      hud.mesh.rotation.y = 0.20;

      var hudTag = mkTag(THREE, g, 'ELEMENT DATA', '#9fd8ff', 0.6, { opacity: 0.85 });
      hudTag.position.set(-9.9, 6.2, 1.4);

      /* ============================================================
         状态
         ============================================================ */
      var st = { phase: 0, wS: 1, wL: 0, wG: 0, latName: '', tourT: 0, cardT: 0, atomR: 0.22 };
      var _col = new THREE.Color();

      function elemData(Z) {
        var e = ELEMS[Z - 1], t = T[Z - 1];
        return {
          Z: Z, sym: e[1], cn: e[2], mass: e[3], cat: e[4], per: e[5], grp: e[6],
          ph0: t[0], mp: t[1], bp: t[2], use: t[3], lat: t[4],
          color: CATCOLOR[e[4]] || '#8fa8c0'
        };
      }

      function phaseOf(d, Tk) {
        if (d.mp === null || d.bp === null) return d.ph0 === 'g' ? 2 : (d.ph0 === 'l' ? 1 : 0);
        if (Tk < d.mp) return 0;
        if (Tk < d.bp) return 1;
        return 2;
      }

      function applyElement() {
        var d = elemData(P.Z);
        st.latName = buildLattice(P.lat === 'auto' ? d.lat : P.lat);

        var gi = d.grp === 0 ? 3 : ((d.grp - 1) % 18);
        st.atomR = clamp(0.19 + 0.020 * d.per - 0.0031 * gi, 0.13, 0.33);

        _col.set(d.color);
        atomMat.color.copy(_col);
        haloMat.color.copy(_col);
        edges.material.color.set(d.color);
        baseRing.material.color.set(d.color);

        tagSym.set(d.sym, d.color);
        tagName.set(d.cn || d.sym, '#e8f2ff');
        tagZ.set('Z = ' + d.Z, d.color);

        updateCard();
        ctx.setNote(
          '<b>' + (d.cn || d.sym) + ' ' + d.sym + '</b> · ' + d.cat +
          '<br>' + electronConfig(d.Z) +
          '<br>熔点 ' + fmtK(d.mp) + ' / 沸点 ' + fmtK(d.bp)
        );
      }

      function updateCard() {
        var d = elemData(P.Z);
        var Tk = Math.pow(10, P.logT);
        var ph = phaseOf(d, Tk);
        var pcfg = ph === 0 ? '固态' : (ph === 1 ? '液态' : '气态');
        var phCss = ph === 0 ? '#9fd8ff' : (ph === 1 ? '#ff9a5c' : '#a8f0ff');
        var grpTxt = d.grp === 0 ? (d.cat === '镧系' ? '镧系' : '锕系') : ('第 ' + d.grp + ' 族');

        hud.card.accent = d.color;
        hud.card.title = '元素档案 · ' + (d.cn || d.sym) + '  ' + d.sym;
        hud.card.formula = [
          { s: d.sym, b: true, c: d.color, sz: 1.25 },
          { s: '   ' },
          { s: String(d.Z), c: '#e8f2ff', sz: 0.68, sub: true }
        ];
        hud.card.sub = [{ s: d.cat + '   ·   第 ' + d.per + ' 周期   ·   ' + grpTxt }];
        hud.card.note = st.latName;
        hud.card.rows = [
          { k: '原子序数 Z', v: String(d.Z), c: '#e8f2ff' },
          { k: '相对原子质量', v: d.mass.toFixed(3), c: '#e8f2ff' },
          { k: '电子排布', v: electronConfig(d.Z), c: '#6fe3ff' },
          { k: '环境温度 T', v: fmtBoth(Tk), c: '#ffd76e' },
          { k: '当前物态', v: pcfg, c: phCss },
          { k: '熔点 Tm', v: fmtBoth(d.mp), c: '#9fd8ff' },
          { k: '沸点 Tb', v: fmtBoth(d.bp), c: '#ff9a5c' },
          { k: '典型晶格', v: (P.lat === 'auto' ? d.lat : P.lat).toUpperCase() }
        ];
        hud.card.foot = '用途：' + d.use;
        hud.redraw();
      }

      /* ============================================================
         每帧更新
         ============================================================ */
      function update(dt, time) {
        var d = elemData(P.Z);
        var Tk = Math.pow(10, P.logT);
        var ph = phaseOf(d, Tk);
        st.phase = ph;

        floorMat.uniforms.uTime.value = time;
        volMat.uniforms.uTime.value = time;
        liqMat.uniforms.uTime.value = time;

        if (P.tour) {
          st.tourT += dt;
          if (st.tourT > 2.6) {
            st.tourT = 0;
            P.Z = P.Z >= 118 ? 1 : P.Z + 1;
            applyElement();
            if (ctx.onParamChange) ctx.onParamChange('Z', P.Z);
          }
        }

        var k = 1 - Math.pow(0.0015, dt);
        st.wS += ((ph === 0 ? 1 : 0) - st.wS) * k;
        st.wL += ((ph === 1 ? 1 : 0) - st.wL) * k;
        st.wG += ((ph === 2 ? 1 : 0) - st.wG) * k;

        Gas.visible = st.wG > 0.01;
        Liq.visible = st.wL > 0.01;
        Sol.visible = st.wS > 0.01;
        gasP.obj.material.opacity = 0.95 * st.wG;
        liqTop.material.uniforms.uAmp.value = 0.09 + 0.11 * st.wL;
        liqBody.material.opacity = 0.40 * st.wL;
        liqEdge.material.opacity = 0.32 * st.wL;
        atomMat.opacity = st.wS;
        haloMat.opacity = 0.18 * st.wS;
        bonds.obj.material.opacity = 0.85 * st.wS;
        cellBox.material.opacity = 0.32 * st.wS;

        var target = ph === 0 ? 0x9fd8ff : (ph === 1 ? 0xc86a2e : 0xa8f0ff);
        edges.material.color.lerp(_col.setHex(target), 0.035);

        /* 气态粒子 */
        if (Gas.visible) {
          var vScale = 1.6 * Math.sqrt(clamp(Tk / 300, 0.02, 40));
          for (var i = 0; i < NG; i++) {
            var o = i * 3;
            gasPos[o] += gasV[o] * vScale * dt;
            gasPos[o + 1] += gasV[o + 1] * vScale * dt;
            gasPos[o + 2] += gasV[o + 2] * vScale * dt;
            if (gasPos[o] > R_IN) { gasPos[o] = R_IN; gasV[o] *= -1; }
            else if (gasPos[o] < -R_IN) { gasPos[o] = -R_IN; gasV[o] *= -1; }
            if (gasPos[o + 1] > R_IN) { gasPos[o + 1] = R_IN; gasV[o + 1] *= -1; }
            else if (gasPos[o + 1] < -R_IN) { gasPos[o + 1] = -R_IN; gasV[o + 1] *= -1; }
            if (gasPos[o + 2] > R_IN) { gasPos[o + 2] = R_IN; gasV[o + 2] *= -1; }
            else if (gasPos[o + 2] < -R_IN) { gasPos[o + 2] = -R_IN; gasV[o + 2] *= -1; }
            var tw = 0.55 + 0.45 * Math.sin(time * 3.1 + gasPh[i]);
            gasP.set(i, gasPos[o], gasPos[o + 1], gasPos[o + 2], 0xbdf0ff, tw * st.wG);
          }
          gasP.flush();
        }

        /* 液态气泡 */
        if (Liq.visible) {
          for (var b = 0; b < NB; b++) {
            bubY[b] += bubS[b] * dt * (0.5 + 0.9 * clamp(Tk / 400, 0.1, 4));
            if (bubY[b] > -R_IN + liqBodyH) {
              bubY[b] = -R_IN;
              bubX[b] = (Math.random() * 2 - 1) * R_IN * 0.9;
              bubZ[b] = (Math.random() * 2 - 1) * R_IN * 0.9;
            }
            bub.set(b, bubX[b], bubY[b], bubZ[b], 0xffd0a0, 0.55 * st.wL);
          }
          bub.flush();
        }

        /* 固态晶格 */
        if (Sol.visible) {
          var amp = 0.05 * clamp(Math.sqrt(Tk / (d.mp || 1000)), 0.05, 1.3);
          var ar = (st.atomR || 0.22) * (0.65 + 0.35 * st.wS);
          for (var a2 = 0; a2 < latPts.length; a2++) {
            var p = latPts[a2];
            _v3.set(
              p[0] + Math.sin(time * 2.4 + a2 * 1.7) * amp,
              p[1] + Math.sin(time * 2.9 + a2 * 2.3) * amp,
              p[2] + Math.sin(time * 2.1 + a2 * 3.1) * amp
            );
            _s3.set(ar, ar, ar);
            _m4.compose(_v3, _q0, _s3);
            atoms.setMatrixAt(a2, _m4);
            _s3.set(ar * 1.8, ar * 1.8, ar * 1.8);
            _m4.compose(_v3, _q0, _s3);
            halos.setMatrixAt(a2, _m4);
          }
          atoms.instanceMatrix.needsUpdate = true;
          halos.instanceMatrix.needsUpdate = true;

          var bc = 0;
          for (var bi = 0; bi < latBonds.length; bi++) {
            var A = latPts[latBonds[bi][0]], B = latPts[latBonds[bi][1]];
            if (!A || !B) continue;
            bonds.set(bc++, A[0], A[1], A[2], B[0], B[1], B[2], C.steel, C.white);
          }
          bonds.count(bc);
          Sol.rotation.y = time * 0.16;
          Sol.rotation.x = Math.sin(time * 0.23) * 0.09;
        }

        /* 周期表墙 */
        Wall.visible = P.grid;
        if (P.grid) {
          for (var ti = 0; ti < tiles.length; ti++) {
            var tl = tiles[ti];
            var sel = (tl.Z === P.Z);
            var dim = 1;
            if (P.hl !== 'all') {
              var isMetal = (tl.cat.indexOf('金属') >= 0 || tl.cat === '镧系' || tl.cat === '锕系');
              var ok = (P.hl === 'metal' && isMetal) || (P.hl === 'halogen' && tl.cat === '卤素') ||
                (P.hl === 'noble' && tl.cat === '稀有气体') ||
                (P.hl === 'nonmetal' && !isMetal && tl.cat !== '卤素' && tl.cat !== '稀有气体');
              dim = ok ? 1 : 0.12;
            }
            var pop = sel ? 1 : 0;
            var zf = tl.z + pop * 1.6 + Math.sin(time * 1.1 + tl.Z * 0.2) * 0.06;
            tl.mesh.position.z += (zf - tl.mesh.position.z) * 0.15;
            tl.edge.position.z = tl.mesh.position.z;
            var sc = 1 + pop * 0.34;
            var cs = tl.mesh.scale.x + (sc - tl.mesh.scale.x) * 0.15;
            tl.mesh.scale.set(cs, cs, cs);
            tl.edge.scale.set(cs, cs, cs);
            var op = (sel ? 0.92 : 0.28) * dim;
            tl.mesh.material.opacity += (op - tl.mesh.material.opacity) * 0.15;
            tl.edge.material.opacity += ((sel ? 1.0 : 0.5) * dim - tl.edge.material.opacity) * 0.15;
          }

          var stl = null;
          for (ti = 0; ti < tiles.length; ti++) if (tiles[ti].Z === P.Z) { stl = tiles[ti]; break; }
          if (stl) {
            var wp = new THREE.Vector3(stl.x, stl.y, stl.mesh.position.z);
            Wall.localToWorld(wp);
            linkSeg.set(0, wp.x, wp.y, wp.z, CAP.x, CAP.y + half + 0.6, CAP.z, 0x6fe3ff, 0xffffff);
            linkSeg.count(1);
            linkSeg.obj.material.opacity = 0.5 + 0.25 * Math.sin(time * 3);
          } else linkSeg.count(0);
        } else linkSeg.count(0);

        /* 边缘标注 */
        var pc = ph === 0 ? PC.solid : (ph === 1 ? PC.liquid : PC.gas);
        tagPhase.set(pc.label, pc.css);
        tagTemp.set(fmtK(Tk) + '  ·  ' + Math.round(Tk - 273.15) + ' °C', '#ffd76e');
        tagSym.sprite.material.opacity = 0.85 + 0.15 * Math.sin(time * 1.5);

        st.cardT += dt;
        if (st.cardT > 0.16) { st.cardT = 0; updateCard(); }

        vol.rotation.y = time * 0.05;
      }

      /* ============================================================
         交互
         ============================================================ */
      var _ray = new THREE.Raycaster();
      var _ndc = new THREE.Vector2();

      function pick(ndc) {
        if (!P.grid) return;
        _ndc.set(ndc.x, ndc.y);
        _ray.setFromCamera(_ndc, ctx.camera);
        var meshes = [];
        for (var i = 0; i < tiles.length; i++) meshes.push(tiles[i].mesh);
        var hit = _ray.intersectObjects(meshes, false);
        if (!hit.length) return;
        for (i = 0; i < tiles.length; i++) {
          if (tiles[i].mesh === hit[0].object) {
            P.Z = tiles[i].Z;
            applyElement();
            if (ctx.onParamChange) ctx.onParamChange('Z', P.Z);
            return;
          }
        }
      }

      function setParam(k, v) {
        P[k] = v;
        if (k === 'Z') { P.Z = clamp(Math.round(P.Z), 1, 118); applyElement(); }
        if (k === 'lat') applyElement();
        if (k === 'bloom') bloom.strength = v;
        if (k === 'scan') bloom.scan = !!v;
        if (k === 'refract') shell.material = v ? shellRefract : shellFallback;
      }

      /* ============================================================
         后处理 + 初始相机
         ============================================================ */
      var bloom = makeBloom(THREE, ctx.renderer);
      bloom.strength = P.bloom;
      bloom.scan = P.scan;

      camera.position.set(0.6, 5.6, 31.0);
      camera.lookAt(0.8, 4.8, 0);
      ctx.controls.target.set(0.8, 4.8, 0);

      applyElement();
      shell.material = P.refract ? shellRefract : shellFallback;

      return {
        update: update,
        setParam: setParam,
        onClick: pick,
        render: function (r, sc, cam) { bloom.render(r, sc, cam); },
        dispose: function () { bloom.dispose(); }
      };
    }
  });

})(window);
