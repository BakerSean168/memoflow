---
tags:
  - analysis
  - desktop
  - electron
  - auto-update
  - release
  - ux
description: Electron 自动更新成熟产品与开源项目研究，提炼 MemoFlow 可复用的业务流程、领域建模与工程模式
created: 2026-09-30T12:45:00+08:00
updated: 2026-09-30T12:45:00+08:00
---

# Desktop Auto-Update Reference Study

> 本文是 MemoFlow Desktop 自动更新设计的外部参考研究。它记录“外部项目事实 → 可复用模式 → MemoFlow 适配结论”，不把任何单一项目的实现直接复制为本项目架构。
>
> 对应正式决策见 [ADR-114](../architecture/adr/ADR-114-desktop-update-domain-runtime-and-installation-ownership.md)，实施拆解见 [Desktop Auto-Update Implementation Plan](../plan/active/2026-09-30-desktop-auto-update-implementation.md)。

## 1. 研究目标

本轮研究回答四个问题：

1. 成熟桌面产品在业务上如何组织“发现更新、下载、提醒、重启、安装、失败恢复”。
2. 优雅的 Electron 项目如何避免让 `electron-updater` / `autoUpdater` 的事件直接污染产品层。
3. Windows / macOS / Linux、Direct Download / Store / package manager 等安装形态为什么不能使用同一套更新所有权。
4. MemoFlow 已经存在的 updater skeleton 应当保留什么、重构什么、补什么。

研究重点：

- Electron 官方 updater 能力与生命周期语义；
- electron-builder / electron-updater 的发布协议与现代安装策略；
- VS Code 的状态机、Update Service abstraction、平台适配和策略；
- Slack 的产品 UX 与 installation ownership；
- Replit Desktop 的 Update Release Server；
- Joplin 的手动检查 / 自动更新 / pre-release 产品边界；
- Daintree 的 graceful shutdown、single-flight、snapshot replay 和失败恢复。

## 2. MemoFlow 当前基线

详细代码取证已记录在：

- [2026-09-30 Desktop Auto-Update Exploration](../plan/active/2026-09-30-desktop-auto-update-exploration.md)

当前已确认：

- `apps/desktop/package.json` 已依赖 `electron-updater@6.8.9`；
- `apps/desktop/electron-builder.json5` 已使用 GitHub publish provider；
- Windows 已产出 NSIS installer、`latest.yml` 和 blockmap；
- Linux 已产出 AppImage/deb/rpm 与 `latest-linux.yml`；
- macOS 已产出 DMG/ZIP/blockmap，但 CI 将 `latest-mac.yml` 重命名为 arch-specific manifest；
- `AutoUpdateManager` 与 updater IPC handler 已存在，但没有被 shell runtime compose；
- preload allow-list 没有暴露 updater command/event；
- renderer 没有 update service / update state product surface；
- 当前发布中的 macOS 仍处于 `unsigned-pilot`。

因此 MemoFlow 的问题不是缺少 updater library，而是**缺少 update domain、runtime ownership、release protocol closure 和产品闭环**。

---

# 3. Electron 官方：最小正确流程与底层约束

## 3.1 Electron 内建 autoUpdater

Electron 官方 `autoUpdater` 的核心行为非常小：

```text
setFeedURL
    ↓
checkForUpdates
    ↓
update-available
    ↓
download
    ↓
update-downloaded
    ↓
quitAndInstall
```

但官方文档明确暴露了几个容易被简单 Demo 忽略的重要约束：

### 3.1.1 Linux 不能假设和 macOS / Windows 一样

Electron 自带 `autoUpdater` 只正式覆盖 macOS / Windows；Linux 官方建议由发行版 package manager 管理更新。

这说明“platform”只是第一层维度，更重要的是：

```text
谁拥有当前安装？
```

### 3.1.2 macOS 自动更新要求签名

macOS app 必须签名才能执行自动更新。

因此签名不是发布 polish，而是 updater capability prerequisite。

### 3.1.3 重复 check 不是天然幂等

Electron 官方文档明确提醒：重复调用 `checkForUpdates()` 可能重复下载更新。

由此可推导：

> Update check 必须有 application-owned single-flight，而不能依赖 SDK 自己消重。

### 3.1.4 更新退出不是普通退出

`quitAndInstall()` 有特殊 lifecycle 顺序。Electron 还提供 `before-quit-for-update`，用于处理更新退出和正常退出不同的时序。

因此：

> 有数据库、journal、后台进程、scheduler 的应用不能把 updater handoff 当成普通 `app.quit()` 的别名。

来源：

- Electron autoUpdater: https://www.electronjs.org/docs/latest/api/auto-updater/

## 3.2 update-electron-app：最小产品化实现

Electron 官方维护的 `update-electron-app` 展示了“简单 Electron App”最小可接受的产品体验：

- 启动后检查更新；
- 周期检查；
- 自动后台下载；
- 下载完成后提示用户立即重启或稍后；
- 支持 GitHub public update service 或 static storage；
- 支持停止周期检查。

它的价值不是作为 MemoFlow 最终架构，而是作为**复杂度下界**：

> 如果一个设计连这些基本语义都没有覆盖，就不完整；如果增加的复杂度没有解决 MemoFlow 的真实约束，则属于过度设计。

来源：

- update-electron-app: https://github.com/electron/update-electron-app

## 3.3 electron-builder / electron-updater

MemoFlow 当前实际使用的是这一套。

electron-updater 相比 Electron built-in updater 多了：

- Windows NSIS；
- macOS；
- Linux AppImage / deb / rpm 等 target；
- 自动生成 update metadata；
- 多 provider；
- download progress；
- staged rollout；
- differential update / blockmap；
- Windows signature validation；
- GitHub / S3 / R2 / generic HTTPS 等 feed。

标准发布链：

```text
build artifact
    +
latest*.yml
    +
blockmap
    ↓
publish provider
    ↓
electron-updater
```

来源：

- electron-builder Auto Update: https://www.electron.build/auto-update.html
- electron-updater: https://github.com/electron-userland/electron-builder/tree/master/packages/electron-updater

### 3.3.1 v27 的 autoInstallEvent 是一个重要架构信号

electron-updater v27 将过去的：

```ts
autoInstallOnAppQuit: boolean;
```

升级为：

```ts
autoInstallEvent:
  | 'manual'
  | 'onQuit'
  | 'onNextLaunch'
```

并增加 OS session-end guard。

设计原因非常重要：

```text
Windows shutdown / reboot
        ↓
App quit
        ↓
spawn detached NSIS installer
        ↓
OS 同时终止 installer
        ↓
可能出现部分卸载 / 未完成安装
```

`onNextLaunch` 的方向是：

```text
正常退出
    ↓
记录 pending update
    ↓
下一次正常启动
    ↓
重新获取 update info
    ↓
重新校验 checksum / signature / version
    ↓
执行安装
```

这说明 updater ecosystem 本身也在从“退出即安装”向更明确的安装生命周期演进。

MemoFlow 当前仍在 electron-updater 6.8.9，因此不能直接使用这个 API，但领域模型**不应把 v26 的 boolean 固化为产品语义**。

来源：

- electron-updater CHANGELOG: https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/CHANGELOG.md
- electron-builder Auto Update / Install on Next Launch: https://www.electron.build/auto-update.html

---

# 4. VS Code：最值得学习的 Update Domain

VS Code 是本轮最重要的代码结构参考。

## 4.1 先有自己的状态机，再接平台 updater

VS Code 的 `src/vs/platform/update/common/update.ts` 直接声明：

> Updates are run as a state machine.

其状态包括：

```text
Uninitialized
Disabled
Idle
CheckingForUpdates
AvailableForDownload
Downloading
Downloaded
Updating
Ready
Overwriting
Cancelling
Restarting
```

并用 discriminated union 表达状态，而不是：

```ts
{
  isChecking?: boolean
  isDownloading?: boolean
  isReady?: boolean
  error?: string
  ...
}
```

例如：

```ts
type CheckingForUpdates = {
  type: StateType.CheckingForUpdates;
  explicit: boolean;
};

type Downloading = {
  type: StateType.Downloading;
  update?: IUpdate;
  explicit: boolean;
  downloadedBytes?: number;
  totalBytes?: number;
};

type Ready = {
  type: StateType.Ready;
  update: IUpdate;
  explicit: boolean;
};
```

### 可复用模式

**状态决定合法字段，状态决定合法命令。**

这样：

- Checking 状态不会同时看起来 Ready；
- Downloading 才有 progress；
- Ready 才允许 quit-and-install；
- Disabled 一定有明确 reason。

来源：

- VS Code `update.ts`: https://github.com/microsoft/vscode/blob/main/src/vs/platform/update/common/update.ts

## 4.2 explicit 是非常重要的用户意图

VS Code 的：

```ts
checkForUpdates(explicit: boolean)
downloadUpdate(explicit: boolean)
```

把：

```text
用户主动操作
```

和：

```text
后台系统操作
```

作为同一业务动作上的不同 intent。

这直接影响 UX：

### Background check

```text
没更新
→ 静默

临时网络失败
→ log / 后续重试
```

### Explicit check

```text
没更新
→ 明确反馈“已是最新”

失败
→ 告诉用户本次检查失败
```

VS Code 还会在 metered connection 下阻止非 explicit 的自动下载，而保留用户主动行为。

这是 MemoFlow 应直接吸收的模型：

```ts
type UpdateIntent = 'background' | 'explicit';
```

来源：

- VS Code `abstractUpdateService.ts`: https://github.com/microsoft/vscode/blob/main/src/vs/platform/update/electron-main/abstractUpdateService.ts

## 4.3 update.mode 把“检查策略”显式建模

VS Code 的 `update.mode`：

```text
none
manual
start
default
```

语义分别是：

- `none`: 禁用；
- `manual`: 仅显式手动检查；
- `start`: 启动时检查一次；
- `default`: 启动 + 后台周期检查。

并且这些设置可以被组织 policy 管理。

相比一个：

```ts
autoUpdate: boolean;
```

它更接近真实业务。

MemoFlow 第一版不必把四个模式全部暴露给用户，但内部 policy 应避免把：

- check；
- download；
- install；
- notification；
- channel

混成一个 boolean。

来源：

- VS Code `update.config.contribution.ts`: https://github.com/microsoft/vscode/blob/main/src/vs/platform/update/common/update.config.contribution.ts

## 4.4 启动延迟与周期检查属于 Update Service

VS Code 默认：

```text
窗口打开后
    ↓
30 秒
    ↓
第一次检查
    ↓
每 1 小时
    ↓
下一次检查
```

而不是由 UI component setInterval。

可复用结论：

> Update scheduling 是 shell/application runtime responsibility，不是 renderer responsibility。

## 4.5 平台实现通过统一 IUpdateService 隔离

VS Code 上层依赖：

```ts
interface IUpdateService {
  onStateChange;
  state;
  checkForUpdates(explicit);
  downloadUpdate(explicit);
  applyUpdate();
  quitAndInstall();
}
```

Electron Main 根据平台注入：

```text
Win32UpdateService
DarwinUpdateService
LinuxUpdateService
SnapUpdateService
```

上层不会知道：

- Squirrel；
- NSIS；
- Snap；
- native updater event。

这正是 MemoFlow 应采用的 Ports & Adapters 边界。

来源：

- VS Code app composition: https://github.com/microsoft/vscode/blob/main/src/vs/code/electron-main/app.ts
- Windows updater: https://github.com/microsoft/vscode/blob/main/src/vs/platform/update/electron-main/updateService.win32.ts
- macOS updater: https://github.com/microsoft/vscode/blob/main/src/vs/platform/update/electron-main/updateService.darwin.ts

## 4.6 Downloaded 与 Ready 有意分离

VS Code 状态文档明确区分：

```text
Downloaded
= 更新已下载，但平台可能仍需要 apply/stage

Ready
= 应用重启即可进入新版本
```

macOS 当前实现中 `update-downloaded` 后会经过内部转换再进入 Ready。

可复用结论：

> 产品层不应把 SDK 的 `update-downloaded` 直接翻译为“立即重启即可安装”；Ready 必须是自己的 domain capability。

## 4.7 退出前先经过应用 lifecycle

VS Code `quitAndInstall()` 不直接调用 raw updater：

```text
Ready
  ↓
Restarting
  ↓
lifecycleMainService.quit(willRestart=true)
  ↓
如果被 veto → 恢复 Ready
  ↓
doQuitAndInstall()
```

它把“应用是否允许安全退出”放在 updater handoff 前。

这是 MemoFlow 必须学习的核心点，因为 MemoFlow 有：

- PowerSync；
- Scheduler；
- Routine；
- knowledge repository / Git runtime；
- device/background runtime；
- future unsaved work。

## 4.8 Ready 时还会检查 superseding update

VS Code 在某些平台 Ready 后、真正重启前，会再次判断 pending update 是否已经被更新版本覆盖。

如果存在更新版本，会进入 `Overwriting` 并替换 pending update。

这不是 MemoFlow MVP 必须复制的功能，但它说明：

> “已下载”不是 immutable truth；release eligibility 可以在最终安装前再次验证。

## 4.9 Disabled 也有领域原因

VS Code 不只是：

```text
enabled=false
```

而是：

```text
NotBuilt
DisabledByEnvironment
ManuallyDisabled
Policy
MissingConfiguration
InvalidConfiguration
RunningAsAdmin
```

这使诊断能力非常强。

MemoFlow 也应该有明确 disable reason，而不是 UI 只得到 “updater unavailable”。

---

# 5. Slack：业务 UX 与 Installation Ownership

Slack 的产品层非常值得学习。

## 5.1 Direct Download

Direct Download 版本提供：

```text
Check for Updates
       ↓
下载 / 准备
       ↓
Restart to Apply Update
```

发现更新后会给 Help icon 增加 badge，并展示 durable update card。

重点是：

- 更新可发现；
- 不强制立即退出；
- ready 状态有持续可见入口；
- 手动检查始终存在。

## 5.2 Store / Package Manager 版本不争夺所有权

Slack 明确区分：

```text
Direct Download
Mac App Store
Microsoft Store
Linux repository
Enterprise / IT managed
```

例如 Store 版本由 Store 更新，Linux repository 版本随着系统 package manager 更新。

可复用结论：

> Update ownership 由 installation provenance / installation shape 决定，而不是只由 OS 决定。

因此正确的问题不是：

```ts
if (process.platform === 'linux')
```

而是：

```ts
whoOwnsThisInstallation();
```

来源：

- Slack desktop update help: https://slack.com/help/articles/360048367814-Update-the-Slack-desktop-app

---

# 6. Replit Desktop：Release Feed 应成为独立边界

Replit Desktop 的 README 明确说明：

- macOS / Windows 在启动时支持自动更新；
- Desktop 会访问独立的 Update Release Server；
- Update Release Server 作为 GitHub Releases 的 proxy；
- server 根据平台提供最新 artifact；
- release 流程包含签名。

结构：

```text
Electron Client
     ↓
Update Release Server
     ↓
GitHub Releases / release artifacts
```

这比：

```text
Electron Client
     ↓
直接猜 GitHub Release asset 名称
```

更可控。

对 MemoFlow 的价值尤其明显：

当前 release matrix 同时产生：

```text
macOS x64
macOS arm64
```

而 GitHub Release 中默认 `latest-mac.yml` 会产生名称冲突。

独立 feed 可以自然变成：

```text
/stable/darwin/x64/latest-mac.yml
/stable/darwin/arm64/latest-mac.yml
/stable/windows/x64/latest.yml
/stable/linux/x64/latest-linux.yml
```

并把：

- channel；
- platform；
- arch；
- rollout；
- artifact selection；
- CDN；

从 GitHub UI 的发布语义里解耦。

来源：

- Replit Desktop: https://github.com/replit/desktop

---

# 7. Joplin：不要把 Check / Auto Update / Pre-release 混成一个开关

Joplin 提供了几个值得注意的边界：

- 用户可手动 Check for updates；
- auto-update 是独立能力；
- pre-release inclusion 是独立 preference；
- updater implementation 可以在 feature flag 下迁移；
- 自动更新会周期访问 release endpoint，可被用户禁用。

当前代码中，手动 Check for updates 会根据新的 AutoUpdaterService feature flag 选择不同实现，而 `autoUpdate.includePreReleases` 作为独立设置参与旧路径。

可复用结论：

```text
Check Policy
Download Policy
Install Policy
Channel Policy
Notification Policy
```

必须在概念上分开。

即使 UI 第一版只给一个简单开关，domain 也不要把所有语义折叠进 `autoUpdate: boolean`。

来源：

- Joplin MenuBar: https://github.com/laurent22/joplin/blob/dev/packages/app-desktop/gui/MenuBar.tsx
- Joplin Privacy / Auto-update: https://github.com/laurent22/joplin/blob/dev/readme/privacy.md

---

# 8. Daintree：更新安装首先是一个 Shutdown Coordination 问题

Daintree 的 `AutoUpdaterService.ts` 很长，但其价值不是“代码越多越好”，而是展示了有本地状态的 Electron app 会遇到哪些真实边界。

## 8.1 installInFlight

它显式维护：

```ts
installInFlight;
```

用于覆盖整个：

```text
用户请求安装
    ↓
graceful shutdown
    ↓
updater handoff
```

窗口。

目的：

- 防重复点击；
- 防 menu / toast / quit 多个入口同时触发；
- 防 cleanup 期间普通 Cmd+Q 再产生第二条 install path。

## 8.2 安装前关闭 auto-install-on-quit

Daintree 在显式 install window 里临时关闭 `autoInstallOnAppQuit`，因为 cleanup 可能持续数秒。

否则：

```text
显式 Restart to Update
        +
cleanup 中用户 Cmd+Q
        ↓
两条 updater install path race
```

## 8.3 先 durable，再 handoff

它的安装流程会先完成：

- session journal；
- DB checkpoint；
- audit flush；
- subprocess teardown；
- IPC teardown；

之后才调用 `quitAndInstall()`。

可复用结论：

> updater handoff 应当是 graceful shutdown pipeline 的最后一个 terminal action。

## 8.4 handoff watchdog

如果应用已经完成 destructive cleanup，但 updater handoff 没有成功让进程退出，则应用已经成为“功能被拆空但进程仍活着”的 zombie。

因此 Daintree 为 handoff 设置 watchdog，失败时 force exit。

这个模式是否原样采用需要结合 MemoFlow shutdown coordinator 设计，但问题本身必须进入故障模型。

## 8.5 Replayable latest update snapshot

Updater native event 是 one-shot 的：

```text
update available
→ event emitted
→ renderer 还没创建 / 重建
→ UI 永远没看到
```

Daintree 因此保留 replayable latest snapshot，并提供 GET_LATEST。

这对 MemoFlow 的 Profile Access → Main Window、窗口重建尤其重要。

正确模式是：

```text
GET_SNAPSHOT
+
STATE_CHANGED
```

而不是只订阅 native events。

## 8.6 避免 UI 闪烁

Daintree 对 “Checking…” menu state 加约 400ms 延迟，快速 CDN round-trip 不显示瞬态状态。

这属于很小但很成熟的 UX 细节：

> 对短暂 transient state 可以设置 presentation threshold，避免视觉 flicker；domain 状态本身仍完整记录。

来源：

- Daintree AutoUpdaterService: https://github.com/daintreehq/daintree/blob/develop/electron/services/AutoUpdaterService.ts

---

# 9. 跨项目共同模式

## 9.1 Updater SDK 不是业务模型

不推荐：

```text
electron-updater event
      ↓
IPC raw event
      ↓
Vue component
```

推荐：

```text
Updater Driver
      ↓
Platform Adapter
      ↓
Update Coordinator / Domain State
      ↓
Typed Snapshot
      ↓
Renderer Service
      ↓
Product UI
```

## 9.2 Update 是 Shell capability，不属于用户 Profile

更新的是安装在设备上的应用二进制，不是某个用户的数据。

因此：

```text
App Process
└── Desktop Update Runtime  ← exactly once

Profile A
Profile B
Guest
```

切换 Profile 不应重建 updater。

## 9.3 Explicit / Background 必须分离

同一 operation，intent 不同：

| 场景            | Background   | Explicit       |
| --------------- | ------------ | -------------- |
| 无更新          | 静默         | 告知“已是最新” |
| 网络失败        | log/后续重试 | 显式失败       |
| Metered network | 可跳过下载   | 用户操作可覆盖 |
| loading UI      | 通常不打扰   | 明确反馈       |
| analytics       | system check | user action    |

## 9.4 Installation ownership 是第一等领域概念

建议 taxonomy：

```text
self-managed-direct
store-managed
package-manager-managed
portable
enterprise-managed
unsupported
```

而不是：

```text
Windows/macOS/Linux
```

直接决定全部行为。

## 9.5 Single-flight 是 correctness requirement

至少：

```text
check single-flight
download single-flight
install single-flight
shutdown/install single owner
```

## 9.6 Snapshot + Event

Renderer 进入时：

```text
GET_SNAPSHOT
```

活跃期间：

```text
STATE_CHANGED(snapshot)
```

避免 one-shot native event 导致窗口重建后状态丢失。

## 9.7 Downloaded != Ready

```text
Downloaded
= bytes are local

Ready
= platform says restart/apply is safe
```

未来如果不同平台有 staging/apply 差异，产品层仍保持稳定。

## 9.8 Update install 必须经过统一 shutdown pipeline

禁止：

```text
Settings button → quitAndInstall
Menu → quitAndInstall
Toast → quitAndInstall
normal quit → auto install
```

四条并行路径。

应该：

```text
requestInstall()
      ↓
UpdateInstallCoordinator
      ↓
DesktopShutdownCoordinator
      ↓
flush / stop / dispose
      ↓
UpdaterAdapter.handoff()
```

## 9.9 Feed 是 release projection，不是产品真值

产品版本真值仍来自 release / build contract。

Update Feed 是从已验证 release artifact 投影出的 machine-readable delivery surface：

```text
Canonical Release
      ↓
verified artifacts
      ↓
update feed projection
      ↓
client
```

不要让 client 依赖“GitHub 最新 Release 页面当前怎么排序”来定义业务版本。

## 9.10 更新结果需要跨进程验证

安装 handoff 后旧进程无法知道最终结果。

因此建议持久化最小 receipt：

```ts
{
  (expectedVersion, previousVersion, stage, requestedAt);
}
```

下一次启动：

```text
app.getVersion() === expectedVersion
→ success

否则
→ recovery / diagnostics
```

此记录属于 device-local shell state，不属于 Profile/PowerSync。

---

# 10. 哪些做法适合直接学习，哪些不要照抄

| 模式                                    | 来源                 | MemoFlow 结论                               |
| --------------------------------------- | -------------------- | ------------------------------------------- |
| discriminated update state machine      | VS Code              | 直接采用思想                                |
| explicit/background intent              | VS Code              | 直接采用                                    |
| per-platform adapters                   | VS Code              | 直接采用                                    |
| update.mode 多策略                      | VS Code              | domain 支持，第一版 UI 不全部暴露           |
| Ready 前 lifecycle quit                 | VS Code              | 直接采用                                    |
| installation ownership                  | Slack / VS Code      | 直接采用                                    |
| durable update badge / Restart to Apply | Slack                | 直接采用 UX                                 |
| Update Release Server                   | Replit               | 作为长期 feed 架构                          |
| pre-release 独立设置                    | Joplin               | channel policy 独立，MVP 仅 Stable          |
| feature-flag updater migration          | Joplin               | 如需逐步迁移可采用                          |
| replayable latest snapshot              | Daintree             | 直接采用                                    |
| install single-flight                   | Daintree             | 直接采用                                    |
| graceful shutdown before handoff        | Daintree / VS Code   | 直接采用                                    |
| 400ms checking display threshold        | Daintree             | UI polish，可后置                           |
| handoff watchdog                        | Daintree             | 纳入故障模型，按 MemoFlow shutdown 设计实现 |
| 10 分钟固定轮询                         | update-electron-app  | 不直接照抄；MemoFlow 采用自己的 policy      |
| renderer 直接监听 SDK events            | 小型 Demo            | 禁止                                        |
| autoInstallOnAppQuit 作为唯一正确路径   | v26 updater 简单用法 | 第一版禁止依赖                              |
| 所有 Linux 包都由应用自己更新           | updater 支持能力     | 不采用；按安装所有权决定                    |

---

# 11. MemoFlow 北极星模型

综合研究后，推荐的长期结构：

```text
                    ┌─────────────────────────────┐
                    │ Canonical Release Pipeline  │
                    │ build / sign / verify       │
                    └──────────────┬──────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │ Update Feed Projection      │
                    │ channel/platform/arch       │
                    └──────────────┬──────────────┘
                                   │
                                   ▼
┌───────────────────────────────────────────────────────────────────┐
│ Electron Main / Desktop Shell                                    │
│                                                                   │
│  InstallationOwnerDetector                                       │
│           │                                                       │
│  UpdateFeedResolver                                               │
│           │                                                       │
│  ElectronUpdaterAdapter ── third-party boundary                  │
│           │                                                       │
│  DesktopUpdateCoordinator ── canonical state machine             │
│           │                                                       │
│  UpdateInstallCoordinator ── graceful shutdown / handoff         │
│           │                                                       │
│  Update IPC Adapter                                               │
└───────────────────────────────┬───────────────────────────────────┘
                                │ typed snapshot
                                ▼
                    ┌─────────────────────────────┐
                    │ DesktopUpdateService        │
                    │ renderer host adapter       │
                    └──────────────┬──────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │ app-vue                     │
                    │ About & Updates             │
                    │ badge / toast / restart     │
                    └─────────────────────────────┘
```

关键原则：

1. `electron-updater` 类型不穿过 infrastructure boundary。
2. update runtime 是 process-scoped，而不是 profile-scoped。
3. renderer 只能看到 MemoFlow DTO。
4. update command/event 统一由 contracts 管理。
5. state snapshot 可 replay。
6. install 只有一个 terminal path。
7. update feed 和 GitHub human release surface 解耦。
8. platform / installation owner 可以替换，不改变产品层。

---

# 12. 研究结论

最值得 MemoFlow 吸收的不是某个库的快捷调用，而是五个成熟系统特征：

### A. 自己拥有 Update Domain

SDK 是 adapter。

### B. 自己拥有 Update State

UI 不拼装 raw events。

### C. 自己拥有 Update Policy

manual/background/check/download/install/channel 分离。

### D. 自己拥有 Shutdown / Install Coordination

更新安装不能绕过本地 durable state lifecycle。

### E. 自己拥有 Release Feed Contract

GitHub Releases 可以继续作为 artifact mirror 和人类 release 页面，但不应长期成为 client 业务语义的唯一边界。

这五点共同构成 [ADR-114](../architecture/adr/ADR-114-desktop-update-domain-runtime-and-installation-ownership.md) 的依据。
