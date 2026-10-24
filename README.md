# 人类之光 · HUMAN LIGHT

三维科学可视化网页应用 · 作者：罗司徒

**交付形态：纯 HTML**。不打包 exe，所有交付物都由浏览器直接打开，零安装、零依赖、全程离线。

## 交付物

| 文件 | 体积 | 适用场景 |
|---|---|---|
| `release\人类之光.html` | ~2.3 MB | **唯一推荐交付物**。单文件自包含，微信/钉钉/邮件直接发，双击浏览器即开 |
| `release\人类之光-网页版.zip` | ~0.9 MB | 备选。web/ 文件夹形态，需解压后双击 `index.html` |

两个文件功能完全一致（14 个场景：12 个 3D 场景 + 2 个内嵌页面）。分享给他人看，用第一个文件即可；详细说明见 `release\分享说明.md`，作品介绍见 `release\人类之光-作品介绍.html`。

## 单文件自包含 HTML

把 `web/` 目录 33 个文件（CSS、Three.js、KaTeX、14 个场景脚本、2 个内嵌页面数据）全部内联为一个 `.html`，因此不需要压缩包、不需要保持目录结构、不需要本地服务器。KaTeX 的 woff2 字体已 base64 内嵌进 CSS，公式渲染全程离线。

**已验证**：在只含这一个文件的隔离目录中，以 `file://` 协议无任何特殊参数打开，14 个场景全部正常注册并渲染（含最重的光合作用场景）。手机浏览器（iPhone Safari 等）同样直接打开。

**启动体验**：无直达链接打开时先展示**场景目录页**——14 张 CDP 真实渲染的场景缩略图 + 一句话简介平铺展示，点击卡片进入场景；侧栏「☰ 场景目录」按钮或 `Esc` 随时返回。左侧场景列表按「Ⅰ 宇宙的法则 → Ⅱ 物质的语言 → Ⅲ 规律的抽象 → Ⅳ 思维的光芒」四章分组。带 `#场景id` 直达链接则跳过目录直接进入。

**太阳系（第 1 个场景，v2 全面重做）**：轨道力学按真实数据实算，不是轨道动画。每颗行星带 J2000 历元的轨道根数——半长轴 `a`（AU）、偏心率 `e`、轨道倾角 `i`、升交点黄经 `Ω`、近日点幅角 `ω`、平黄经 `L₀`；每帧由平近点角 `M = L₀ + 360°·Δt/T` 反解开普勒方程 `E − e·sinE = M`（牛顿迭代 6 次，收敛到 1e-12），再由真近点角 `ν = atan2(√(1−e²)sinE, cosE−e)` 与向径 `r = a(1 − e·cosE)` 定出位置。轨道面朝向由 `qY(Ω)·qX(i)·qY(ω)` 合成四元数，所以八条轨道彼此倾斜、近日点方向各异，与真实天空一致。初始时刻取 J2000 到今日的天数，行星起步相位就是今天的真实位置，HUD 同步显示模拟日期。

自转与倾角同样用真实值：地球 23.44° / 23.934 h、天王星 97.77°（躺着转）、金星 −2.6° 逆向自转；公转周期从水星 87.97 天到海王星 60182 天。

**两种尺度**（面板 `scale` 可切换）：`可视化压缩` 用 `dist = 9.2·a^0.60`、`size = 0.34·(R/6371)^0.52`，一屏看全八行星又不牺牲大小关系；`真实比例` 严格 `1 AU = 180 units`，太阳与行星都缩到真实尺寸（地球半径 0.0077、海王星在 5413 单位外），近裁剪面降到 0.01 才能看清。物理量全部真实，压缩只发生在显示层。

**时间控制**：右方向键 / 上方向键加速（×1.5、上限 365 天/秒），左 / 下减速，空格暂停，面板滑杆也可直接拖动；HUD 实时显示日期、流速倍率与当前尺度。

**环境**：程序化生成的行星表面（岩质撞击坑、地球海陆与云层、木星大红斑、土星环含卡西尼缝）、日冕三层辉光、主带小行星 1830 点 + 柯伊伯带 800 点（同解开普勒方程，内圈快外圈慢）、7 颗高偏心陨石穿行、随机流星；远景是 1800 颗恒星 + 沿大圆集中的银河带 + 2 个旋涡星系 + 3 团星云 + 2 个远方双星系。全部贴图逐像素 fbm 噪声生成，不依赖任何外部资源，单文件离线可用。

**AI-Agent思维模型（内嵌页面场景，第 13 个）**：侧栏「Ⅳ · 思维的光芒」下的第二个条目，内容为独立的「Agent 战术大屏 · OPS 调度中心」页面（源：`D:/agent-display-main/index.html#ops`）。集成方式是 **iframe + `srcdoc` 内联**，而不是 `src` 直连——Chrome / Edge 默认禁止 `file://` 页面 iframe 加载其他本地文件，直连必然白屏（实测默认启动参数下 `contentDocument` 为 `null`）。`_build_agentpage.js` 把源页面转成 base64 存入 `web/js/data/agentpage.js`，运行时解码写入 `srcdoc`，因此单文件版、离线环境和任意机器上都能正常显示，也不会与主页面样式/全局变量冲突。源页面已做三处最小改造：去掉 Google Fonts 外链（保持全程离线）、启动视图锁定为 `ops`、注入 Esc 转发（iframe 内按 Esc 同样回到场景目录）。直达链接 `?#aiagent`，快捷键 `q`。

**神经网络推理（内嵌页面场景，第 14 个）**：内容为「神经网络推理 · NEURAL INFERENCE」大屏（源：`D:/agent-display-main/neural-lab.html`），左侧 28 项真实训练参数（学习率、损失、梯度范数、GPU 利用率、MFU、KV Cache、KL 散度…），中间多层全连接，右侧 softmax 输出 8 类训练诊断。集成方式与上一个场景相同（`_build_neuralpage.js` → `web/js/data/neuralpage.js` → `srcdoc`）。顶栏「宽度」控件在 S / M / L / XL 之间切换层宽（12·16·12 → 18·22·16 → 24·28·20 → 28·28·24，单层上限 28）；连线按「冷 / 热」合并成两个 `Path2D`，784 条线每帧只 stroke 两次。直达链接 `?#neuralnet`，快捷键 `w`。

**周期表卡片翻面**：点击任一元素卡片，卡片绕 Y 轴 180° 缓动翻转到背面——原子量、电子排布（Madelung 规则 + 例外修正，118 号全覆盖）、熔沸点、常温物态、晶格与典型用途完整呈现；再点翻回，同一时间只保留一张翻开；背面贴图首次翻转时才绘制，讲解模式冻结时翻转动画依然流畅。

**性能自适应（玻璃样品舱）**：玻璃舱的 `transmission` 折射材质每帧要多渲染一遍整个场景，弱设备上会明显掉帧（实测 35 → 7.5 fps）。场景内置帧率守卫：连续 0.55 s 平均帧率低于 24 fps 时自动降级为轻量玻璃，并在舱下给出 4.5 s 提示；用户手动打开折射开关后视为明确选择，仅在极端掉帧（< 12 fps）时才兜底降级。

**万有引力场景**内含六个可切换子场景：引力井 / 双星互绕 / 开普勒三定律 / 三体混沌 / 潮汐力 / 逃逸速度，用 `#gravity` 进入后点面板顶部按钮切换，或用 `?g=子场景id&...#gravity` 直达（子场景 id：`well` `binary` `kepler` `threebody` `tidal` `escape`）。

**讲解模式**：面板中的「📖 讲解模式」按钮会暂停模拟、分步讲解——每步含文字旁白 + 💡 参数实验建议。**已覆盖 12 个 3D 场景**：太阳系（9 步，含「水星偏心率 0.206 肉眼可见」「T² ∝ a³」两处数值验证）、元素周期表（6 步）、神经网络（5 步）、数学曲面（5 步）、双缝干涉（5 步）、DNA 双螺旋（6 步）、傅里叶级数（5 步）、电磁波（5 步）、光合作用（6 步，从叶片一路飞进卡尔文循环）、麦克斯韦方程组（6 步）、质能方程（5 步）、万有引力全部 6 个子场景。部分步骤自动飞行相机 / 脉冲光环高亮要素 / 联动切换预设（三体的拉格朗日、混沌、黑洞面条化等）。「下一步 →」逐步播放，「完成 ✓ / ✕ 退出讲解」恢复运行。

**画布安全区（HL.safeArea）**：框架每帧检测左侧公式卡、右侧参数面板、顶部标题栏占用的屏幕区域，自动平移渲染视锥，让 3D 主体始终落在可用区域的视觉中心——场景无需手工调相机避让 HUD。万有引力场景公式卡左上角有「≪ 收起 / ≫ 公式卡」一键折叠把手，收起后主体自动回到更大可用区的中心。

**首次引导浮层**：每个场景首次进入时（localStorage 记忆）底部弹出操作指引（左键平移 / 右键旋转 / 滚轮缩放 / 快捷键），4 秒自动淡出，点击即关；`?guide=1` 可强制重看。

**发布流程**（改动源码后，一条命令产出全部交付物）：

```bash
python build_single_html.py                    # → release\人类之光.html + 人类之光-网页版.zip
python build_single_html.py 自定义路径.html     # 仅导出单文件到指定路径
```

脚本内联前会逐个文件检查 `</script>`、`<!--`、`<style>` 等会破坏 HTML 结构的字符，命中则中止并报出文件名，不会产出坏文件。

**注意**：`web/index.html` 不能单独拿走——它是相对路径引用 `css/`、`js/`、`vendor/` 的入口，脱离目录即白屏。要单文件分享请用上面导出的 `.html`。

### 线上发布（WorkBuddy「发布为网站」）

云端的分享链接带 `?sharecode=` 才放行，而且**只对首个 HTML 请求生效**：页面里的 `<link href="css/main.css">`、`<script src="js/main.js">` 是浏览器另发的请求，不带该参数，会被网关直接 403。多文件形态上线后表现为「整页白底黑字的裸 HTML」——样式与脚本一个都没加载。

因此线上必须走**单文件入口**：

1. `build_single_html.py` 默认构建后自动把 `release/人类之光.html` 复制为 `web/single.html`（全部资源内联，只有一次请求，天然带 sharecode）。
2. `web/index.html` 里有一小段转发脚本：检测到 `?sharecode=` 且当前不是 `single.html` 时，`location.replace('single.html' + location.search)`。本地 `file://` 无此参数、单文件自身也不匹配，均不会跳转。
3. 发布目录仍是 `web/`，所以链接与 app 不变，无需传 `entryHtml`。

发布后若原样链接仍是旧内容：CDN 的缓存键**包含完整查询串**，`?sharecode=RF2TV443LO` 这个精确 URL 一旦被缓存，重新发布不会刷新它（无缓存刷新入口，TTL 未知，实测可挂数小时以上）。绕开办法：在链接末尾追加一个新版本参数，如 `?sharecode=RF2TV443LO&r=2`（缓存键变了就回源），转发脚本会原样保留参数传给 single.html。**约定：每次重新发布后把 r 的数字加一，把带新 r 的链接发给用户**；不带参数的原链接会在 CDN 过期后自行恢复。

## 云服务（WorkBuddy Cloud Service）

作品在目录页底部有一块**「观展回声」**留言板，数据存在云数据库里，所有观展者共享同一份。

| 项 | 值 |
|---|---|
| applicationId | `wbapp_Y66v5Zxi3Wv5gkfYo1yj1N` |
| 资源 id | `wbcs_3Dxl31crFFGNbRwPPHWgWu` |
| endpoint（数据面） | `https://human-light-science.app.workbuddy.host` |
| 已接模块 | Database（Auth / Storage / LLM 未使用） |

**表 `hl_notes`**：`id`（identity）、`scene_id`（记录于哪个场景）、`nick`、`content`（≤200 字）、`created_at`。

**为什么没有登录**：作品是靠链接分享的展品，加登录墙会挡住观众，所以按「公开内容」建模，而不是「用户私有数据」：

- RLS 已开启；`anon` / `authenticated` 只被授予 `SELECT, INSERT`
- 读策略 `USING (true)`（所有人可见），写策略 `WITH CHECK` 限定内容长度
- **没有 UPDATE / DELETE 策略**，客户端改不了也删不掉别人的留言；要清理只能走管理端 SQL

**前端怎么接**（`web/js/cloud.js`）：

1. 纯 HTML 无构建步骤 → 用 CDN 形态 `@tencent-ai/workbuddy-cloud-sdk@dev/lib/index.global.js`，取 `WorkBuddyCloud` 全局
2. 客户端全局只初始化一次：`createWorkBuddyCloud({ endpoint, oauthRelayBaseUrl, publishableKey })`，三个值都来自开通时返回的 `publicConfig`
3. 读：`.from('hl_notes').select(...).order('created_at',{ascending:false}).limit(30)`；写：`.insert({ content, nick, scene_id }).select()`
4. **`insert` 的返回是空数组时说明被 RLS 拦下，必须当成失败**，不能当成功（已按此处理）
5. 留言文本一律用 `textContent` 渲染，不拼 HTML

**离线与降级**：`file://` 打开单文件版时 SDK 不加载，面板只留一句说明（`st-offline`），14 个场景完全不受影响；云端报错（无网络 / 401 / 42501）会显示对应文案并禁用提交，不会静默失败。

**验证**（`_cloud_test.js` / `_cloud_probe.js`）：离线模式断言「降级 + 场景完好」；线上模式会在真实域名下读列表、提交一条带时间戳的留言并读回。

## 从源码开发

```bat
run.cmd     :: 免安装预览（Edge --app 模式打开 web/index.html，改代码后重开即可）
```

或直接用任意现代浏览器打开 `web\index.html`。

源码结构：

```
web/
  vendor/three.min.js      Three.js r149（UMD，已本地化，不依赖 CDN）
  vendor/katex.min.js      KaTeX 0.16.11（公式排版，已本地化）
  css/katex.css            KaTeX 样式（woff2 字体 base64 内嵌，离线可用）
  js/core/                 轨道控制器（左键平移/右键旋转/滚轮缩放/触屏手势）、场景管理器（GPU 资源回收）
  js/scenes/               14 个场景插件（aiAgent、neuralLab 为内嵌页面，其余为 3D；gravity/ 含主框架 + 6 个子场景）
  js/data/                 元素数据、场景缩略图（thumbs.js）、内嵌页面数据（agentpage.js / neuralpage.js，自动生成）
  js/main.js               侧栏（四章分组）、场景目录页、参数面板、URL 参数解析
  js/cloud.js              云服务接入（SDK 载入、观展回声的读写与离线降级）
build_single_html.py       唯一发布脚本（单文件 HTML + 网页版 zip）
_thumbs.js                 缩略图再生成工具（CDP 逐场景截图 → web/js/data/thumbs.js）
_build_agentpage.js        外部页面打包工具（agent-display → base64 → web/js/data/agentpage.js）
_build_neuralpage.js       外部页面打包工具（neural-lab → base64 → web/js/data/neuralpage.js）
_agent_test.js             AI-Agent 内嵌场景回归（渲染 / 目录 / Esc / 切场景清理 / 侧栏进入，5 项）
_nn_test.js                神经网络推理场景回归（直达 / Esc / 清理 / 侧栏 / 快捷键，5 项）
_nn_page_test.js           神经网络推理源页冒烟（宽度切换、28 行参数、784 条连线）
_intro_test.js             作品介绍页回归（结构断言 + 桌面 / 手机分段截图）
_cloud_test.js             观展回声回归（离线降级 / 线上读 / 线上写并读回）
_cloud_probe.js            云服务连通性预检（正式域名下 SDK → 读 → 写 → 读回）
_solar_test.js              太阳系回归（21 项：轨道根数 / 近日远日距 / 角速度比 / T²∝a³ / 双尺度 / 时间推进 / 讲解 / 帧率）
_solar_shots.js             太阳系多机位截图（全景 / 土星 / 木星 / 地球 / 真实比例）
_t1_test.js                全量回归（12 个 3D 场景讲解模式 + 四章侧栏 + 目录页）
_flip_test.js              周期表回归（电子排布全覆盖 + 翻面交互 + 性能守卫，9 项）
_perf_diag.js              分阶段 FPS 诊断（初始 / 点击后 / 关玻璃舱 / 对照场景）
_grav_test.js              万有引力模块自测（CDP 六子场景渲染 + 物理读数抽查，GRAV_SHOT=1 同时截图）
_iso_test.js               单文件版隔离冒烟（目录页 + 全场景抽查）
_cdp.js / _eval.js         CDP 截图与页面内断言工具（回归验证用）
_versions/                 场景历史版本备份（如 periodicTable v1/v2）
```

新增场景只需三步：在 `web/js/scenes/` 新建 js 文件、按 `HL.registerScene` 契约注册、在 `web/index.html` 追加一行 `<script>`。侧栏、参数面板、资源回收、快捷键全部自动生效。

## 已知工程约束（勿踩回去）

1. **Three.js 不能用 ES module 版**——`file://` 下 UMD 最稳，r163 起官方已移除 UMD 构建。
2. **场景 `create` 中不要只写轨道控制器私有球坐标**——框架会在 create 后调用 `syncFromCamera()` 覆盖，必须同时写 `camera.position`。
3. **场景 id 与 URL hash 必须一致**（如 `#molecule`，不是 `#molecular`），否则回退到第一个场景。
4. **不要再引入任何打包壳**（pywebiew/PyInstaller/Electron 均已评估并放弃）——浏览器直开是最稳、最轻的形态。
5. **面板「回灌记忆参数」也走 `setParam`**——`main.js` 构建面板时会把记忆值逐控件 apply 一次。场景若要用"是否用户手动操作"做分支，只能信 `setParam(key, v, user)` 的第三参，不能把回灌当用户意愿（否则自动降级之类的守卫会被锁死）。
6. **CDP/headless 里让相机贴近目标**：改完 `camera.position` + `controls.target` 后必须调 `controls.syncFromCamera()`，否则控制器内部球坐标未更新，下一帧把相机弹回原距离；且后台标签 rAF 会被节流，观察动画要先注入一个活跃 rAF 循环。
7. **上千个同质小物体用 `THREE.Points`，不要用 `InstancedMesh`**——旧版 three + SwiftShader（headless / 无独显机器）下，2720 个实例的 `InstancedMesh` 逐帧矩阵上传把太阳系拖到 14 FPS，改成一张岩石贴图 + `alphaTest` 的点云后回到 35–39 FPS。同理 `bumpMap` 在软件渲染里极其昂贵，程序化贴图像素成本远低于多一遍光照。
8. **屏幕恒定大小的 Sprite 标签必须自己做避让**——`sizeAttenuation: false` 的标签不会随距离缩小，远景时必然叠在一起；用 `project(camera)` 取屏幕坐标，按 `dx²/44² + dy²/19² < 1` 椭圆阈值做距离优先的贪心剔除。
