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
