# 摸鱼阅读器 任务拆解 TASK.md

> 配套 DESIGN.md · 勾选式 · 标注依赖与验收 · 修复循环上限 3 轮

## 阶段 A：脚手架与基线
- [x] **A1** 初始化 npm 项目，`package.json` 写好 productName（中性名）、main 入口、scripts（start/build）
  - 依赖：`electron`（锁版本）；devDep：`electron-builder`
- [x] **A2** 建立目录骨架（src/main、src/preload、src/renderer、assets、docs）
- [x] **A3** 生成中性 ICO 图标（icon.ico / icon-stealth.ico），确认无敏感字样
  - 验收：文件存在且可被 Electron Tray 加载
- [x] **A4** `.gitignore` 排除 node_modules、build 产物、userData
- **依赖**：无 → **基线验收**：`npm start` 能弹出一个空白无边框窗口

## 阶段 B：配置与 IPC 基座
- [x] **B1** `config.js`：默认配置合并 + 原子读写 `%APPDATA%/Input Helper/config.json`
- [x] **B2** `preload/index.js`：contextBridge 暴露白名单 API
- [x] **B3** `ipc.js`：get-config / set-config / toggle-stealth / set-edge / quit 处理
- [x] **B4** `state:changed` 广播机制
- **依赖**：A4 → **验收**：renderer 能读到配置、改配置后重启仍保留

## 阶段 C：贴边状态机（核心）
- [x] **C1** `edgeController.js`：实现 HIDDEN/SHOWING/VISIBLE/HIDING 状态机
- [x] **C2** 全局鼠标轮询 + 触发带判定（边缘 band × 窗口高度范围）
- [x] **C3** 缓出平移动画（16ms 步进，220ms 时长），展开/缩回不闪屏
- [x] **C4** 隐藏态 `setIgnoreMouseEvents(true,{forward:true})`，显示态恢复
- [x] **C5** 多屏适配：用光标所在 display 的 workArea 计算几何
- **依赖**：B2, B3 → **验收**：AC2 + AC3 + AC4（贴细边、悬停滑出、移开缩回、点击穿透）

## 阶段 D：内容容器与登录态
- [x] **D1** `renderer/index.html`：无边框外壳 + 自定义标题栏 + webview
- [x] **D2** `style.css`：标题栏拖拽区、按钮、无边框布局
- [x] **D3** `app.js`：webview 加载番茄网页版，`new-window` 同源拦截/外链外开
- [x] **D4** `webPreferences` 安全配置（nodeIntegration:false, contextIsolation:true, sandbox:true, webviewTag:true）
- [x] **D5** 验证登录态持久化：登录后退出重启，书架/进度仍在
- **依赖**：A4, B2 → **验收**：AC6 + 页面正常显示、可翻页、夜间模式可用

## 阶段 E：老板键与托盘伪装
- [x] **E1** `bossKey.js`：globalShortcut 注册/注销，失败提示
- [x] **E2** STEALTH 态实现（离屏 + opacity 0 + 穿透 + 暂停轮询 + 恢复原状态）
- [x] **E3** `tray.js`：托盘图标 + 单击切换 + 右键菜单（方向/清登录态提示/退出）
- [x] **E4** 伪装标签切换（输入助手 ⇄ 系统服务）+ 图标切换
- [x] **E5** 开机自启开关（Should，`app.setLoginItemSettings`）
- **依赖**：B3, C1 → **验收**：AC1 + AC5 + AC7

## 阶段 F：集成回归与交付
- [x] **F1** 全量走查 AC1~AC8，逐项打勾或记录问题
- [x] **F2** 静态检查：node --check 全部 js 文件
- [x] **F3** 手动端到端：启动→悬停→登录→阅读→移开→老板键→恢复→退出→重启
- [x] **F4** `npm run build` 产出 NSIS 安装包 + 便携版
- [x] **F5** 写 README（安装、使用、快捷键、登录、常见问题、清除登录态方法）
- [x] **F6** 交付摘要：变更文件、验证结果、遗留项
- **依赖**：C~E 全部完成 → **验收**：AC8 + 无 P0/P1 遗留

---

## 修复循环规则
- 每阶段发现问题 → 记录到 TASK 对应项备注 → 修复 → 重跑该阶段验收
- 同一问题修复 **≤3 轮**；超 3 轮停止，输出「待人工确认项」请用户定夺
- 迭代原则：只改与需求相关文件，不重构无关代码

---

## 阶段 G：v2 自由定位 + 就地淡出（用户变更需求）
- [x] **G1** config 新增字段：mode/windowX/windowY/idleOpacity/firstRunShown，默认值与白名单同步
- [x] **G2** 窗口改为可拖动（movable:true + 标题栏 drag 区），拖动结束节流持久化 windowX/windowY
- [x] **G3** edgeController 新增 free 模式：就地淡入淡出（setOpacity）替代位移动画
- [x] **G4** 触发区改为窗口自身矩形；隐藏态保留 idleOpacity 锚点 + 点击穿透
- [x] **G5** 首次启动：窗口正常显示 + renderer 提示浮层，几秒后或点击"知道了"进入正常逻辑
- [x] **G6** 保留 edge 模式作为可选（配置可切回 v1 贴边），不删旧逻辑
- [x] **G7** 更新 README（新操作说明、配置项）与 test-geometry 兼容检查
- [x] **G8** 全量回归 AC1'~AC4' + 重新打包 + 便携版冒烟测试
- **依赖**：v1 全量完成 → **验收**：可拖动记忆位置、就地淡出/恢复、首次提示、老板键不回归

---

## 阶段 H：v3 无痕 + 设置面板 + 缩放（用户变更需求）
- [x] **H1** idleOpacity 默认 0，schemaVersion 3 迁移旧 0.06
- [x] **H2** 窗口 resizable 配置驱动 + setResizeRegion 缩放热区 + 尺寸持久化
- [x] **H3** 内置设置面板：隐藏模式/淡化程度/窗口缩放/开机自启/恢复默认，即时保存
- [x] **H4** 无痕唤出兜底：鼠标移回 + Ctrl+Alt+E 快捷键 + 托盘智能切换
- [x] **H5** hold-visible IPC，防止设置面板操作时被自动隐藏
- [x] **H6** 更新 README/DESIGN，全量验证 + 打包 + 推送
- **验收**：完全无痕、移回恢复、缩放并记忆、设置面板即时生效均 PASS

---

## 阶段 I：v4 打开即进书架 + 书架/书城切换（用户变更需求）
- [x] **I1** config：`url` 默认改 `/bookshelf`，新增 `homeUrl`，白名单同步，`schemaVersion 3→4` 迁移（自定义网址保留、幂等）
- [x] **I2** `loadSite()` 默认加载书架；按钮文字据当前 URL 初始化
- [x] **I3** 标题栏新增 `#btnShelf`，`toggleShelf()` 一键往返书架/书城首页并记住当前页
- [x] **I4** `did-navigate` 同步按钮状态；首次提示新增书架说明；加载文案通用化
- [x] **I5** 语法检查 + 迁移单测（旧首页→书架 / 自定义保留 / 无字段→书架 / 幂等）全 PASS
- [x] **I6** 更新 README/DESIGN/TASK，GUI 实测，重新打包，推送，交付新版 exe
- **依赖**：H 全部完成 → **验收**：打开进书架、一键切换、重启保持所在页、老配置自动迁移均 PASS

---

## 阶段 J：v5 修复"下载 App"引导，强制桌面版（用户反馈）
- [x] **J1** CDP 排查定位：番茄把桌面 webview 塞 force_mobile=1 走移动落地页；用户未掉登录；伪装 UA 无效，force_mobile=0 有效；否决安卓模拟器方案
- [x] **J2** config：url/homeUrl 默认带 force_mobile=0，schemaVersion 4→5 迁移（首页/书架补参，阅读页/自定义网址不动，幂等）
- [x] **J3** renderer：新增 desktopUrl()，loadSite()/toggleShelf() 走桌面版；did-navigate 站内导航自动补参
- [x] **J4** 验证：desktopUrl 边界测试 7 项 PASS；端到端确认书架显示无下载引导、配置迁移 v5、站内导航补参、按钮双向切换带参、阅读页正文正常
- [x] **J5** 更新 README/DESIGN/TASK，重新打包，推送，交付新版 exe
- **验收**：打开进桌面版书架、正文可读、全程无"下载 App"引导、无需模拟器均 PASS

---

## 阶段 K：v6 一键重新登录 + 内容自适应窗口（用户反馈）
- [x] **K1** 排查"书架没同步最新书"：登录态被挤下线 + 书架 1224px 固定宽在窄窗口横向裁切，两因叠加
- [x] **K2** 重新登录：主进程 `app:clear-login` 清 persist:fanqie 全量存储；标题栏「登录」按钮 + 确认浮层 + 清态重载首页
- [x] **K3** 内容自适应：主进程 `app:fit-content` 用 `webContents.executeJavaScript` 注入缩放脚本；书架完整适配、首页设 0.45 下限、阅读页不缩放
- [x] **K4** resize 实时重算 + did-finish-load 双次注入；修复 executeScript 不存在、zoom 影响测量、src 同 URL 不重载三个坑
- [x] **K5** 端到端验证（登录流程/书架/窗口缩放/阅读页/首页）、更新 README/DESIGN/TASK、重新打包、推送、交付
- **验收**：一键重新登录可见登录入口、书架 5 本全显示无横向溢出、窗口缩放实时适配、阅读页字号不变均 PASS

---

## 阶段 L：v7 手机同款阅读（用户反馈：SVIP 限制 + 浮窗）
- [x] **L1** 实测对比：桌面版 reader 有"SVIP网页畅读"横幅+常驻工具栏；移动版 reader 无横幅无浮窗；移动版书架番茄不提供
- [x] **L2** 按请求切 UA：webRequest.onBeforeSendHeaders 按 URL/referrer 判定，reader 及其请求走 iPhone UA，其余走干净桌面 Chrome UA
- [x] **L3** 踩坑定位：will-navigate 里 setUserAgent 会取消导航（隔离实验证实），改 webRequest 方案绕过
- [x] **L4** 工具栏淡化 CSS：默认 6% 透明不干扰，hover 恢复可点，功能不丢
- [x] **L5** 验证：书架→点书→reader（免SVIP+正文+无浮窗）→返回书架（UA 自动恢复）全链路 PASS；更新文档、打包、推送、交付
- **验收**：阅读页无 SVIP 提示、正文全本可读、界面无常驻浮窗、书架/登录/自适应不回归均 PASS

---

## 阶段 M：v8 外部窗口隐藏器（用户需求：模拟器也要鼠标唤出）
- [x] **M1** 技术选型：DWM Cloak 对外部进程 E_ACCESSDENIED（实测）→ ShowWindow(SW_HIDE/SW_SHOWNA) + koffi FFI
- [x] **M2** winHider.js：bindForeground / tick(60ms 轮询) / setStealth(老板键锁定) / unbind / restoreOnBoot，句柄失效按类名自动重找
- [x] **M3** 装配：config.hiderTarget（v5 白名单）、ipc 3 个 handler、preload API、tray 子菜单（绑定弹窗确认）、edgeController._poll 挂 tick
- [x] **M4** 打包：显式安装 @koromix/koffi-win32-x64@3.3.8 + asarUnpack（koffi 二进制在独立包）
- [x] **M5** GUI 实测 7 项全 PASS：绑定、矩形内保持、移开隐藏、移入显示、老板键锁定/解锁、解绑恢复、重启自动恢复绑定
- [x] **M6** 更新 README/DESIGN/TASK，重新打包（验证 asarUnpack 后 koffi 可用），推送，交付
- **验收**：记事本模拟目标窗口，鼠标唤出/老板键/持久化/重启恢复全部 PASS；模拟器装好后绑定其窗口即可获得同款摸鱼体验
