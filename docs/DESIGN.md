# 摸鱼阅读器（stealth-reader）技术方案 DESIGN.md

> 版本 v2.0 · 2026-11-23 · 状态：v2 已确认，开发中
> 目标：Windows 桌面端，内嵌番茄小说网页版，**自由定位 + 就地淡出隐藏**，鼠标移回恢复，老板键一键伪装。
> v1 为贴边隐藏方案（已被用户否决："贴边功能不要固定死，我要自己调整摆放位置"）；v2 见文末变更章节。

---

## 1. 需求确认（已与用户逐项确认）

| 编号 | 需求 | 用户选择 |
|---|---|---|
| R1 | 内容载体 | ✅ 内嵌番茄网页版 `https://fanqienovel.com/` |
| R2 | 隐藏方式 | ✅ 贴边缩进留细边，鼠标移到边缘滑出展开 |
| R3 | 反侦察 | ✅ 老板键一键隐藏 + 托盘/进程名伪装，可秒速恢复 |
| R4 | 技术栈 | ✅ Electron（本机 Node 22 已就绪） |

### 关键事实依据（已联网核实）
- 番茄小说**没有官方 Windows 原生客户端**；下载站的"电脑版 7.4.x / 165MB"均为安卓模拟器套壳，进程重、特征明显，不适合本场景。
- 官方网页版 `fanqienovel.com` 可直接阅读；游客可读部分章节，登录后同步书架与阅读进度，支持夜间模式/字号调节。→ 采用网页版是正确的载体选择。

### 范围外（明确不做，避免越界）
- ❌ 不破解会员、不绕过付费墙、不抓取/Bypass 番茄内容或广告（只做官方网页的容器）。
- ❌ 不做进程级/驱动级隐藏（无注入、无 Rootkit）；只做窗口与托盘层面的伪装。
- ❌ 不支持手机端；MVP 只做 Windows 桌面，优先支持单显示器，多屏用"鼠标所在屏"适配。

---

## 2. 技术选型

| 项 | 选择 | 理由 |
|---|---|---|
| 框架 | Electron（npm 安装时锁定具体版本到 package-lock.json） | Node 22 就绪；`BrowserWindow` 原生支持无边框/透明/置顶/跳过任务栏；webview 可持久化登录态 |
| 内容容器 | `<webview partition="persist:fanqie">` | Cookie/localStorage 落盘，登录一次长期有效；`nodeIntegration` 保持关闭 |
| 打包 | electron-builder → NSIS 安装包 + 便携版 | 一条命令产出可交付的 Windows 程序 |
| 配置 | 自研轻量模块读写 `%APPDATA%/Input Helper/config.json` | 零额外运行时依赖，便于用户手改 |
| 图标 | 本地生成中性灰 ICO（托盘/进程伪装用） | 不出现"番茄""小说"等字样 |

### 备选方案与否决理由
- **Python + PySide6/QWebEngine**：需额外装依赖、打包体积大（200MB+），且 QWebEngine 的登录态/现代网页兼容不如 Chromium webview → 不选。
- **.NET WPF + WebView2**：本机无 .NET SDK，需先装工具链 → 不选。
- **单一置顶窗口 + 纯透明淡出**：隐蔽性弱于贴边缩进 → 与 R2 不符，不选。

---

## 3. 架构设计

### 3.1 进程模型与目录
```
stealth-reader/
├─ package.json / package-lock.json / .gitignore / README.md
├─ docs/DESIGN.md, TASK.md
├─ src/
│  ├─ main/
│  │  ├─ index.js          # 应用生命周期、创建窗口、装配各模块
│  │  ├─ config.js         # 配置读写（原子写 + 默认值合并）
│  │  ├─ edgeController.js # 贴边状态机 + 鼠标轮询 + 平移动画
│  │  ├─ bossKey.js        # 全局快捷键注册/切换伪装态
│  │  ├─ tray.js           # 托盘图标/菜单/伪装标签
│  │  └─ ipc.js            # 主进程 IPC 处理
│  ├─ preload/index.js     # contextBridge 暴露最小 API
│  └─ renderer/
│     ├─ index.html        # 无边框外壳 + 自定义标题栏 + webview
│     ├─ style.css
│     └─ app.js            # webview 事件、外链拦截、UI 绑定
├─ assets/
│  ├─ icon.ico             # 中性图标（正常态）
│  └─ icon-stealth.ico     # 中性图标（伪装态，更朴素）
└─ build/                  # electron-builder 产物
```

### 3.2 状态机（核心）
```
       悬停命中边缘细边              鼠标离开窗口 + graceMs
HIDDEN ─────────────────► SHOWING ─────────────────► VISIBLE
   ▲                                                    │
   │                                                    ▼
   └────────────── HIDING ◄────────────────────────────┘
                 (动画缩回)

任意状态 ──老板键──► STEALTH（完全离屏 + opacity 0 + 点击穿透 + 停止轮询 + 托盘换伪装名）
STEALTH ──老板键──► 恢复进入 STEALTH 前的状态
```
- 鼠标检测：**不依赖窗口鼠标事件**，主进程用 `screen.getCursorScreenPoint()` 以 `pollMs`(默认 60ms) 轮询全局坐标。
  - 隐藏态：光标进入"触发带"（屏幕边缘 `triggerBandPx` 宽 × 窗口高度范围）→ 展开。
  - 显示态：光标离开窗口矩形后隐藏；`graceMs` 默认 0（移开即隐藏，v2.1 起），设为正数则延迟相应毫秒。
  - 理由：全局轮询比窗口 hover 事件更稳，也能处理鼠标快速划过的情况。
- 点击穿透：隐藏态 `setIgnoreMouseEvents(true, {forward:true})`，细边不挡住下层应用点击；显示态恢复 `false`。
- 动画：`setInterval` 每 16ms 用缓出曲线插值 `win.setBounds()`，时长 `animationMs`(默认 220ms)。

### 3.3 窗口几何
- 展开尺寸默认 `460 × 760`（可配置），垂直居中于工作区（避开任务栏）。
- 隐藏位置：以右贴边为例，`x = workArea.x + workArea.width - revealPx`（`revealPx` 默认 6px），即只露一条细边；左/上/下同理。
- 显示器：用 `screen.getDisplayNearestPoint(cursor)` 取光标所在屏的 `workArea`，避免任务栏遮挡。

### 3.4 老板键与伪装
- 全局快捷键 `Ctrl+Alt+Q`（可配置，注册失败时提示改键）。
- 触发后：窗口离屏 + `opacity 0` + 点击穿透 + 暂停轮询；托盘 tooltip 由"输入助手"切为"系统服务"，图标换为更朴素的 ICO。
- 恢复：再按一次回到原状态；托盘单击也可切换显示/隐藏。
- 进程伪装：`package.json` 的 `productName` 设为中性名（如 `Input Helper`），任务管理器不出现"番茄/小说/摸鱼"字样。

### 3.5 webview 与登录态
- `<webview src="https://fanqienovel.com/" partition="persist:fanqie" allowpopups>`。
- `new-window` 事件：同源（fanqienovel.com）在 webview 内打开，外链交给系统浏览器，避免钓鱼窗口。
- 登录：首次在 webview 内用手机号/抖音扫码登录，之后 partition 持久化保持登录与书架同步。
- 安全：`webPreferences` 中 `nodeIntegration:false, contextIsolation:true, sandbox:true, webviewTag:true`；webview 自身绝不开启 node 集成。

### 3.6 IPC 接口
| 通道 | 方向 | 说明 |
|---|---|---|
| `app:get-config` | renderer→main | 获取配置 |
| `app:set-config` | renderer→main | 增量更新配置（白名单字段） |
| `app:toggle-stealth` | 双向 | 切换/通知伪装态 |
| `app:set-edge` | renderer→main | 切换贴边方向 |
| `app:quit` | renderer→main | 退出 |
| `state:changed` | main→renderer | 状态/配置变化广播 |

---

## 4. 配置数据模型
`%APPDATA%/Input Helper/config.json`
```json
{
  "edge": "right",
  "windowWidth": 460,
  "windowHeight": 760,
  "revealPx": 6,
  "triggerBandPx": 18,
  "graceMs": 0,
  "animationMs": 220,
  "pollMs": 60,
  "bossKey": "Ctrl+Alt+Q",
  "normalTrayLabel": "输入助手",
  "stealthTrayLabel": "系统服务",
  "openAtLogin": false,
  "cleanMode": false,
  "url": "https://fanqienovel.com/"
}
```
> `cleanMode`（实验性注入 CSS 去干扰元素）默认关闭，不当作核心功能；不实现任何绕过付费/广告逻辑。

---

## 5. 验收标准（可测）
- **AC1**：启动后任务栏无图标；托盘显示中性名称；进程名不含"番茄/小说/摸鱼"。
- **AC2**：窗口贴屏幕右边缘，仅露 ≤6px 细边；细边不拦截下层窗口点击（可穿透）。
- **AC3**：鼠标移到细边触发带，≤300ms 内平滑滑出至展开尺寸并加载番茄网页版。
- **AC4**：鼠标移出窗口后立即（graceMs=0，无延迟）淡出，不丢失阅读位置与登录态。
- **AC5**：按老板键后 ≤100ms 全部隐藏；再按一次秒速恢复原状态。
- **AC6**：webview 内登录番茄账号，完全退出程序重启后仍保持登录（书架/进度可见）。
- **AC7**：托盘菜单可切换贴边方向（左/右/上/下）、开关老板键提示、退出；伪装态标签切换正确。
- **AC8**：`npm run build` 产出 Windows NSIS 安装包与便携版，可在干净环境安装运行。

---

## 6. 风险预演与对策
| 风险 | 影响 | 对策 |
|---|---|---|
| 番茄网页版弹出验证/风控 | 无法阅读 | webview 是真实 Chromium，通常无碍；若触发，用户手动完成验证，不自动化绕过 |
| 老板键被其它软件占用 | 快捷键失效 | 注册返回 false 时在托盘菜单提示，允许改键 |
| 透明窗 + 置顶在远程桌面/旧显卡异常 | 渲染黑块 | 配置 `transparent:false` 回退开关（Should） |
| 登录态丢失 | 每次重登 | `persist:fanqie` 落盘；README 提示勿删 userData |
| 鼠标轮询开销 | CPU 占用 | 60ms 间隔，仅调用一次 `getCursorScreenPoint`，可忽略 |
| 多显示器/缩放 | 位置错乱 | 用光标所在屏 workArea；DevTools 显示 DIP 坐标，不混用物理像素 |

---

## 7. 优先级（M-S-C）
- **Must（MVP）**：贴边隐藏+悬停展开+自动缩回、webview 内嵌番茄网页版、老板键隐藏/恢复、托盘中性伪装、登录态持久化、配置持久化。
- **Should**：贴边方向切换、开机自启开关、老板键可改键、透明窗回退开关。
- **Could**：实验性 cleanMode 注入 CSS、多屏位置记忆、假工作窗口诱饵。

---

# 附录：v2 变更（自由定位 + 就地淡出，2026-11-23 用户确认）

## 变更背景
v1 交付后用户双击便携版"打不开"——实为程序正常启动但窗口贴边缩到屏幕外仅露 6px，用户无从发现。用户明确提出：**贴边功能不要固定死，要自己调整摆放位置**。经确认，隐藏方式改为"就地淡出，鼠标移回恢复"，并增加首次启动提示。

## v2 需求（已确认）
| 编号 | 需求 | 选择 |
|---|---|---|
| R1' | 窗口定位 | 可拖动到屏幕任意位置并记住，不锁定边缘 |
| R2' | 隐藏方式 | 就地淡出（保留低透明度作锚点）+ 点击穿透；鼠标移回窗口区域恢复 |
| R3' | 首次启动 | 正常显示 + 操作提示浮层，几秒后进入正常逻辑 |

## 关键取舍
- **低透明度锚点**：完全 0 透明会让用户再次找不到且无法判断触发区；默认 `idleOpacity = 0.06`（极低但可见），可配置改 0。老板键 STEALTH 仍是彻底消失。
- **触发区 = 窗口自身矩形**：不再用边缘触发带。鼠标进入窗口矩形即恢复，比 6px 细线好找得多。
- **拖动实现**：窗口 `movable: true`，标题栏 `-webkit-app-region: drag`；`will-move`/`moved` 事件持久化 x/y 到 config（节流写入）。
- **位置记忆**：新增 `windowX/windowY`（null=首次居中偏上）；重启后恢复到用户摆放处。
- **保留老板键/托盘伪装**：不变。

## 状态机调整
```
首次启动:   VISIBLE（显示提示）──几秒后──► HIDDEN
自由态:     HIDDEN(opacity=0.06,穿透) ──鼠标进入窗口矩形──► SHOWING(淡入) ──► VISIBLE
            VISIBLE ──鼠标离开+graceMs──► HIDING(淡出) ──► HIDDEN
老板键:     任意态 ──► STEALTH(彻底 hide+伪装) ──再按──► 恢复
```

## 配置新增字段
```jsonc
{
  "mode": "free",          // free=自由定位就地淡出 | edge=保留 v1 贴边（兼容）
  "windowX": null,         // 用户拖动后的位置，null=默认居中
  "windowY": null,
  "idleOpacity": 0.06,     // 隐藏态保留的透明度锚点，0=完全隐形
  "firstRunShown": false   // 首次启动提示是否已展示
}
```

## 验收标准（v2）
- AC1'：窗口可拖动到任意位置，重启后位置保持。
- AC2'：鼠标移开 graceMs 后窗口就地淡出到 6% 透明且点击穿透；移回窗口矩形即淡入恢复。
- AC3'：首次启动窗口正常显示并弹出操作提示，几秒后（或用户点"知道了"）进入正常逻辑。
- AC4'：老板键、托盘伪装、登录态持久化等 v1 功能不回归。

## 风险
- 透明窗口 `setOpacity` 与 `setIgnoreMouseEvents` 配合需实测：穿透后轮询仍应能检测鼠标进入（用 `screen.getCursorScreenPoint()`，不依赖窗口鼠标事件）→ 设计上规避。
- 拖动持久化频繁写盘 → 用 300ms 节流。

---

# 附录：v2.1 变更（移开即隐藏，2026-11-23 用户确认）

## 变更
- 用户不需要"鼠标移开后 0.5 秒自动淡出"，改为**鼠标一移开就立即淡出**。
- `graceMs` 默认值 `500 → 0`；`_poll` 中 `graceMs <= 0` 时当帧调用 `hide()`，不等待下一轮轮询。

## 兼容性
- 旧配置文件残留 `graceMs: 500` 会在 `config.load()` 时自动迁移为 0，并写入 `schemaVersion: 2` 保证幂等；其它字段（含窗口位置、firstRunShown）不变。
- 需要宽限期的用户可手动把 `graceMs` 改回正数（如 300）。

## 验证
- 迁移单测：500→0、其它字段保留、幂等、新用户默认均 PASS。
- 行为验证：鼠标移出 350ms（旧版宽限期内）窗口已开始淡出，差异值 235 → 立即淡出生效。

---

# 附录：v3 变更（完全无痕 + 内置设置面板 + 窗口自由缩放，2026-11-23）

## 需求
1. 隐藏彻底无痕（透明度 0，不留锚点）；2. 软件内设置面板调节隐藏模式/淡化程度/窗口缩放；3. 窗口可自由拖拽缩放。

## 实现
- 配置：`idleOpacity` 默认 `0.06→0`；新增 `resizable:true`；`schemaVersion 2→3`，迁移时把旧 `idleOpacity=0.06` 归零。
- 窗口：`BrowserWindow.resizable` 由配置驱动；`setResizeRegion` 启用无边框窗口四周 6px 缩放热区；`resized` 事件节流持久化 `windowWidth/windowHeight`。
- 无痕唤出兜底：① 鼠标移回记忆位置（轮询坐标，不依赖窗口可见性，已验证）；② 新增全局快捷键 `Ctrl+Alt+E` 强制唤出；③ 托盘单击智能切换（隐身→恢复 / 隐藏→显示 / 可见→隐身）。
- 设置面板：renderer 浮层，含隐藏模式（free/edge）、淡化程度滑块（0~50%）、窗口缩放开关、开机自启、恢复默认；改动即时 `setConfig` 保存。
- 防误隐藏：`app:hold-visible` IPC，设置面板/首次提示打开时暂停自动隐藏。

## 验证
- 迁移单测：0.06→0、幂等、保留位置/尺寸 PASS；实际启动后用户配置已迁移为 idleOpacity=0 / schemaVersion=3。
- 完全无痕：截图差异 273（窗口彻底消失）PASS；鼠标移回恢复 PASS。
- 窗口缩放：拖拽右下角 460x760→540x800，尺寸已持久化 PASS。
- 设置面板相关 IPC/语法全通过。
