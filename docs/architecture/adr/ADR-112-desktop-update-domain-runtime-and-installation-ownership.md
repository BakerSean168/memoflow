---
tags:
  - adr
  - desktop
  - electron
  - auto-update
  - release
  - runtime
  - lifecycle
description: Desktop 自动更新的领域模型、Shell Runtime 所有权、Installation Ownership、平台适配、安装生命周期与 Release Feed 边界
created: 2026-09-30T12:45:00+08:00
updated: 2026-09-30T12:45:00+08:00
---

# ADR-112: Desktop Update Domain、Runtime Boundary 与 Installation Ownership

**状态：** 提议中（设计已定稿，待实施验证后采纳）  
**日期：** 2026-09-30  
**关联：** ADR-004、ADR-006、ADR-040、ADR-041、ADR-066、ADR-092、ADR-094  
**研究依据：** [Desktop Auto-Update Reference Study](../../analysis/2026-09-30-desktop-auto-update-reference-study.md)  
**实施计划：** [Desktop Auto-Update Implementation Plan](../../plan/active/2026-09-30-desktop-auto-update-implementation.md)

---

## 1. Context

MemoFlow Desktop 当前已经拥有自动更新所需的大部分技术原料：

- Electron；
- electron-builder；
- electron-updater；
- GitHub Releases；
- Windows NSIS；
- macOS DMG / ZIP；
- Linux AppImage / deb / rpm；
- update metadata；
- blockmap；
- `AutoUpdateManager`；
- updater IPC skeleton。

但这些能力尚未形成一个完整产品能力：

```text
release artifacts
     ├── 存在
     ↓
updater code
     ├── 存在但未 compose
     ↓
preload
     ├── 没有暴露 updater surface
     ↓
renderer
     ├── 没有 typed update service
     ↓
settings / shell
     └── 没有更新产品体验
```

此外还存在三个结构性问题。

### 1.1 当前 updater skeleton 由第三方事件定义业务

`apps/desktop/src/main/modules/auto-update/auto-update-manager.ts` 当前直接把：

```text
checking-for-update
update-available
update-not-available
download-progress
update-downloaded
error
```

映射成 ad-hoc renderer events。

这种结构会让：

```text
electron-updater lifecycle
```

变成：

```text
MemoFlow product lifecycle
```

第三方库升级、平台差异、安装方式差异都会泄漏到 renderer。

### 1.2 更新是 device installation capability，不是 Profile capability

MemoFlow Desktop 当前有：

- 本地 Profile；
- Profile Access；
- PowerSync；
- 每 Profile runtime；
- cloud binding；
- Profile 切换。

但应用版本属于设备安装本身。

```text
MemoFlow 0.14.1
```

不是：

```text
Profile A 0.14.1
Profile B 0.15.0
```

因此 updater 必须是 Shell-scoped singleton。

### 1.3 安装更新会穿越应用退出边界

MemoFlow 的正常退出包含真实资源：

- PowerSync；
- schedule runtime；
- Routine runtime；
- notification/runtime resources；
- local repository / Git runtime；
- database；
- future local unsaved state。

直接调用 `quitAndInstall()` 可能绕过或打乱正常退出时序。

因此“下载更新”是 updater 问题，而“安装更新”同时是 lifecycle correctness 问题。

---

# 2. Decision Summary

MemoFlow 采用以下正式设计：

1. 建立 MemoFlow-owned **Desktop Update Domain**。
2. updater runtime 是 **Desktop Shell capability**，每个 Electron app process 只有一个 owner。
3. `electron-updater` 只作为 **Infrastructure Adapter**。
4. Update 状态使用 **discriminated state machine**。
5. 手动行为与后台行为通过 **UpdateIntent** 区分。
6. 安装方式由 **Installation Ownership** 决定，不仅由 OS 决定。
7. renderer 只消费 **Snapshot + StateChanged Event**，不消费第三方 raw events。
8. 更新安装统一进入 **Update Install Coordinator → Desktop Shutdown Pipeline → Updater Handoff**。
9. 第一阶段不依赖 `autoInstallOnAppQuit=true` 作为 correctness path。
10. Release Feed 是已验证 canonical release 的 machine-readable projection，不是另一份 release truth。
11. Stable 是第一阶段唯一 channel；Beta/Canary 保留 domain seam，不进入 MVP。
12. Profile/PowerSync 不持久化 updater 状态；必要 durable state 属于 device-local shell storage。
13. 必须建立真实 **N → N+1 installed-update E2E**，package smoke 不能替代更新测试。

---

# 3. Bounded Context

本 ADR 建立一个 host-specific bounded context：

```text
Desktop Update
```

它不是普通业务 package，也不应被抽象成 Web/Mobile 共用模块。

边界：

```text
@memoflow/contracts/electron
    ↑ renderer-safe contracts only
    │
apps/desktop
└── Desktop Update domain/application/infrastructure/lifecycle
```

不新增：

```text
packages/update
```

作为跨宿主领域 package。

原因：

- Web 不安装 Electron 二进制；
- Mobile 由 Store / native distribution 模型管理；
- Desktop update 直接依赖 installation provenance、Electron lifecycle 和 platform installer；
- 强行跨端复用会制造错误抽象。

---

# 4. Domain Language

## 4.1 Update Release

表示已经通过 release pipeline、对当前 client 有资格的发布候选。

```ts
interface DesktopUpdateRelease {
  version: string;
  publishedAt?: string;
  channel: DesktopUpdateChannel;
  releaseNotes?: string;
  releaseNotesUrl?: string;
}
```

Domain 不暴露：

- GitHub asset ID；
- electron-updater `UpdateInfo`；
- blockmap internal metadata；
- provider-specific response。

这些属于 adapter/feed。

## 4.2 Update Channel

```ts
type DesktopUpdateChannel = 'stable' | 'beta' | 'canary';
```

### Phase 1

只有：

```text
stable
```

可以被选择。

Beta / Canary 是未来扩展 seam，不在第一阶段产品 UI 暴露。

## 4.3 Update Intent

```ts
type DesktopUpdateIntent = 'background' | 'explicit';
```

含义：

### background

由 runtime policy 自动发起。

产品原则：

- no-update 静默；
- transient network failure 不弹全局错误；
- metered connection 可以跳过自动下载；
- 不打断当前工作。

### explicit

由用户主动点击“检查更新”等动作发起。

产品原则：

- no-update 必须给反馈；
- failure 必须给本次操作反馈；
- 可以覆盖部分 background-only 限制。

## 4.4 Update Mode

内部策略模型：

```ts
type DesktopUpdateMode = 'disabled' | 'manual' | 'on-start' | 'periodic';
```

第一版默认：

```text
periodic
```

语义：

| Mode     | Startup Check | Periodic Check | Manual Check |
| -------- | ------------- | -------------- | ------------ |
| disabled | no            | no             | no           |
| manual   | no            | no             | yes          |
| on-start | yes           | no             | yes          |
| periodic | yes           | yes            | yes          |

第一版 UI 不要求暴露所有 mode。

## 4.5 Installation Ownership

这是本 ADR 最重要的领域对象之一。

```ts
type DesktopInstallationOwner =
  | 'memoflow-direct'
  | 'system-store'
  | 'package-manager'
  | 'portable'
  | 'enterprise-managed'
  | 'unsupported';
```

### memoflow-direct

MemoFlow 自己拥有：

- version discovery；
- download；
- verification；
- install handoff。

典型：

- Windows per-user NSIS direct download；
- signed/notarized macOS direct download；
- supported AppImage direct download。

### system-store

例如未来：

- Microsoft Store；
- Mac App Store。

MemoFlow 可以展示版本信息，但 Store 是 update authority。

### package-manager

例如：

- apt repository；
- rpm repository；
- Snap 等。

MemoFlow 不与 package manager 争夺 installer ownership。

### portable

例如 zip portable。

可以：

- 检查新版本；
- 提醒；
- 打开下载页面。

但不假装具有安全的 self-update capability。

### enterprise-managed

由 IT policy 管理。

产品 UI 需要说明更新由组织管理。

### unsupported

当前安装形态无法可靠判断或 updater prerequisite 不满足。

---

# 5. Capability Model

InstallationOwner 进一步投影成 capability，而不是 UI 自己判断。

```ts
interface DesktopUpdateCapabilities {
  canCheck: boolean;
  canBackgroundCheck: boolean;
  canDownload: boolean;
  canSelfInstall: boolean;
  canAutoDownload: boolean;
  installAuthority: 'memoflow' | 'system' | 'package-manager' | 'administrator' | 'none';
}
```

UI 只消费 capability。

禁止：

```ts
if (navigator.platform.includes('Linux')) {
  ...
}
```

判断产品行为。

---

# 6. Canonical State Machine

## 6.1 State

采用 discriminated union。

```ts
type DesktopUpdateState =
  | {
      type: 'uninitialized';
    }
  | {
      type: 'disabled';
      reason: DesktopUpdateDisableReason;
    }
  | {
      type: 'idle';
      currentVersion: string;
      lastCheckedAt?: string;
      lastOutcome?: DesktopUpdateOutcome;
    }
  | {
      type: 'checking';
      intent: DesktopUpdateIntent;
      startedAt: string;
    }
  | {
      type: 'available';
      intent: DesktopUpdateIntent;
      release: DesktopUpdateRelease;
      autoDownloadEligible: boolean;
    }
  | {
      type: 'downloading';
      intent: DesktopUpdateIntent;
      release: DesktopUpdateRelease;
      progress: DesktopUpdateProgress;
    }
  | {
      type: 'downloaded';
      intent: DesktopUpdateIntent;
      release: DesktopUpdateRelease;
    }
  | {
      type: 'preparing';
      intent: DesktopUpdateIntent;
      release: DesktopUpdateRelease;
    }
  | {
      type: 'ready';
      intent: DesktopUpdateIntent;
      release: DesktopUpdateRelease;
    }
  | {
      type: 'restarting';
      release: DesktopUpdateRelease;
    }
  | {
      type: 'failed';
      operation: DesktopUpdateOperation;
      failure: DesktopUpdateFailure;
      recoverableTo: 'idle' | 'available' | 'ready';
      release?: DesktopUpdateRelease;
    };
```

## 6.2 为什么保留 Downloaded 和 Ready

```text
Downloaded
= artifact bytes 已经在本地

Preparing
= adapter/platform 正在完成 staging / apply preparation

Ready
= 当前安装方式已经确认可以进入 restart/install handoff
```

产品 UI 的：

```text
重新启动并更新
```

只允许出现在：

```text
ready
```

而不是 native `update-downloaded` 一到就出现。

## 6.3 为什么保留 Failed

第三方 provider error 不直接进入 renderer。

Domain 先 normalize：

```ts
type DesktopUpdateFailureCode =
  | 'network-unavailable'
  | 'feed-unavailable'
  | 'invalid-metadata'
  | 'unsupported-installation'
  | 'signature-invalid'
  | 'checksum-mismatch'
  | 'download-failed'
  | 'prepare-failed'
  | 'shutdown-failed'
  | 'install-handoff-failed'
  | 'release-superseded'
  | 'unknown';
```

```ts
interface DesktopUpdateFailure {
  code: DesktopUpdateFailureCode;
  message: string;
  retryable: boolean;
}
```

禁止把：

- raw stack；
- provider token；
- local file path；
- installer command line；

发送到 renderer。

---

# 7. State Transitions

主路径：

```text
uninitialized
      ↓ initialize
idle
      ↓ check(background|explicit)
checking
      ├── no update ───────────────→ idle
      ├── failure ────────────────→ failed → idle
      └── update found
              ↓
          available
              ↓ download
         downloading
              ├── failure ────────→ failed → available
              ↓
          downloaded
              ↓ prepare
          preparing
              ├── failure ────────→ failed
              ↓
            ready
              ↓ request install
          restarting
              ↓ graceful shutdown
          updater handoff
              ↓
        old process terminates
              ↓
        next launch verifies version
```

Disable path：

```text
uninitialized/idle
      ↓
disabled(reason)
```

第一版不要求支持“下载一半动态禁用并 cancel”，但 domain 不阻止未来增加 `cancelling`。

---

# 8. Command Model

Renderer-facing commands应保持非常窄：

```ts
interface DesktopUpdateService {
  getSnapshot(): Promise<DesktopUpdateSnapshot>;
  checkForUpdates(): Promise<DesktopUpdateSnapshot>;
  restartAndInstall(): Promise<void>;
  subscribe(listener: (snapshot: DesktopUpdateSnapshot) => void): () => void;
}
```

### 不直接暴露通用 CONFIG

现有：

```text
auto-update:config
```

允许 renderer 传任意：

- interval；
- autoDownload；
- autoInstall；
- updateServerUrl；

这是错误边界。

这些属于：

- product policy；
- operator configuration；
- release/feed configuration；

不能被普通 renderer 任意修改。

### DOWNLOAD 是否 renderer-facing

MVP 默认 background auto-download。

因此普通 UI 不需要独立 `downloadUpdate()`。

如果未来加入：

- manual-download mode；
- metered network override；

再通过显式 use case 暴露。

---

# 9. Snapshot Contract

Renderer 必须能够在任意时间重建状态。

```ts
interface DesktopUpdateSnapshot {
  state: DesktopUpdateState;
  currentVersion: string;
  channel: DesktopUpdateChannel;
  owner: DesktopInstallationOwner;
  capabilities: DesktopUpdateCapabilities;
}
```

transport pattern：

```text
renderer mount / new BrowserWindow
      ↓
GET_SNAPSHOT
      ↓
current state

then

STATE_CHANGED(snapshot)
      ↓
incremental updates
```

避免：

```text
renderer 只监听 native one-shot events
```

导致状态丢失。

---

# 10. Runtime Ownership

## 10.1 Shell Singleton

```text
Electron App Process
│
├── DesktopUpdateRuntime  ← exactly one
│
├── ProfileRegistry
├── DesktopProfileRuntimeManager
│   ├── Profile A runtime
│   └── Profile B runtime
└── WindowManager
```

Profile：

- login；
- logout；
- lock；
- switch；
- local/cloud mode；

都不能 recreate updater。

## 10.2 初始化时机

Updater 不应在 source/dev 模式运行真实 check。

推荐：

```text
app.whenReady()
    ↓
shell initialization
    ↓
first usable window is available
    ↓
initialize DesktopUpdateRuntime
    ↓
delay ~30s
    ↓
background check
```

避免：

- 阻塞 first paint；
- 开发环境误查 release；
- Profile 未解锁就依赖业务 DB。

## 10.3 检查周期

Phase 1：

```text
startup delay: 30s
periodic interval: 1h
```

理由：

- 与当前 skeleton 1h 默认一致；
- 与 VS Code 的成熟策略相近；
- 发布传播延迟可接受；
- 不需要 10 分钟高频轮询。

未来 feed 层可以通过：

- cache-control；
- rollout；
- jitter；

进一步优化。

---

# 11. Single-Flight and Concurrency

Update Coordinator 是唯一 command serializer。

必须保护：

```text
check single-flight
download single-flight
prepare single-flight
install single-flight
```

规则：

### check

只有：

```text
idle
```

允许进入 checking。

重复 background check：

```text
no-op
```

explicit check 遇到 in-flight：

```text
返回当前 snapshot
```

不发第二个 provider request。

### download

只有：

```text
available
```

允许开始。

### install

只有：

```text
ready
```

允许开始。

一旦：

```text
restarting
```

所有新的 updater mutation command 拒绝。

---

# 12. Automatic Download Policy

Phase 1 Stable：

```text
check finds eligible stable update
      ↓
if memoflow-direct
and not metered/background-restricted
      ↓
auto download
```

关键决策：

> electron-updater library 层保持 `autoDownload=false`，由 MemoFlow Update Coordinator 显式决定何时调用 download。

这样 product policy 不被第三方 boolean 反向定义。

未来可以加入：

- metered network；
- battery saver；
- enterprise policy；
- manual download；
- rollout pause。

---

# 13. Installation Policy

## 13.1 Phase 1

采用：

```text
manual explicit install handoff
```

即：

```text
Ready
→ user clicks Restart and Update
→ graceful shutdown
→ updater handoff
```

Phase 1 不依赖：

```ts
autoInstallOnAppQuit = true;
```

作为 correctness path。

理由：

- 当前 electron-updater 6.8.9 只有 boolean 语义；
- MemoFlow 正常 quit 有较多 runtime cleanup；
- 避免 normal quit 和 explicit install 双路径竞争；
- 避免 OS shutdown 场景触发 installer race。

## 13.2 Future

升级到稳定的 electron-updater v27+ 后，单独评估：

```text
onNextLaunch
```

作为普通退出后的 deferred install。

领域层不需要因此改变。

---

# 14. Graceful Update Install Boundary

安装流程必须统一：

```text
Settings / badge / menu
        │
        └── requestRestartAndInstall()
                    ↓
          UpdateInstallCoordinator
                    ↓
          acquire install single-flight
                    ↓
          DesktopShutdownCoordinator
                    ↓
          stop/flush/dispose
                    ↓
          mark install receipt
                    ↓
          UpdaterAdapter.quitAndInstall()
```

## 14.1 禁止多个 terminal path

禁止：

```text
Settings → direct quitAndInstall
Menu → direct quitAndInstall
Toast → direct quitAndInstall
onQuit → second direct install
```

## 14.2 与现有 lifecycle 的关系

当前：

`apps/desktop/src/main/lifecycle/app-lifecycle.ts`

拥有 `before-quit` cleanup。

实施时应提取或建立共享 shutdown coordinator，使：

```text
normal quit
update restart
future app restart
```

使用同一 resource cleanup owner。

不能复制一套“update-only dispose list”。

## 14.3 Cleanup 失败

原则：

### 在 destructive shutdown 前失败

保持应用运行，恢复 `ready`，提示重试。

### 在 destructive shutdown 已完成后 updater handoff 失败

记录：

```text
install-handoff-failed
```

避免让已被拆除 runtime 的 zombie process 长期存活。

具体 watchdog / force-exit 策略由 implementation ticket 验证后落地。

---

# 15. Durable Device-local Update State

不进入：

- Profile database；
- PowerSync；
- cloud sync；
- user portability export。

只保存必要 shell state：

```ts
interface DesktopUpdateInstallReceipt {
  previousVersion: string;
  expectedVersion: string;
  requestedAt: string;
  stage: 'restart-requested' | 'shutdown-complete' | 'installer-handoff';
}
```

存放在 shared app data 下的 device-local file。

下一次启动：

```text
receipt exists
      ↓
app.getVersion() === expectedVersion ?
      ├── yes → update-success + clear receipt
      └── no  → update-not-applied / recovery diagnostics
```

不得依赖业务 DB，因为 update verification 必须发生在 Profile activation 之前。

---

# 16. Release Feed Boundary

## 16.1 Canonical Truth

```text
Release Pipeline
= canonical version + verified artifacts + signatures + checksums
```

Update Feed：

```text
= delivery projection
```

不能让 Feed 成为第二份手工维护的版本真值。

## 16.2 Phase 1

Windows 允许继续使用现有 GitHub Releases provider，完成第一个 N → N+1 vertical slice。

## 16.3 North-star

采用 architecture-aware generic feed：

```text
updates.<domain>/
└── stable/
    ├── windows/
    │   └── x64/
    │       └── latest.yml
    ├── darwin/
    │   ├── x64/
    │   │   └── latest-mac.yml
    │   └── arm64/
    │       └── latest-mac.yml
    └── linux/
        └── x64/
            └── latest-linux.yml
```

这样解决当前：

```text
latest-mac-x64.yml
latest-mac-arm64.yml
```

与 electron-updater default manifest expectation 的冲突。

## 16.4 GitHub Releases 的长期角色

继续用于：

- human download；
- release notes；
- artifact mirror；
- historical release discovery。

不要求 client 永久直接依赖 GitHub provider。

---

# 17. Platform Policy

## 17.1 Windows direct NSIS

Phase 1 首个完整更新 lane。

条件：

- per-user NSIS；
- manifest 完整；
- blockmap 完整；
- version monotonic；
- installer identity stable。

生产成熟前增加 Authenticode signing。

## 17.2 macOS direct

自动更新 capability gate：

```text
signed
+
notarized
+
stapled/trust verified
+
matching update feed
```

当前 unsigned-pilot 不进入正式 self-update rollout。

继续 x64/arm64 分包，优先采用 per-arch feed；暂不为了 updater 强行转 Universal。

## 17.3 Linux AppImage

允许作为 self-managed direct lane 验证。

## 17.4 Linux deb/rpm

第一阶段不承诺 seamless self-update。

如果由 package repository 安装：

```text
package-manager owner
```

如果只是 raw deb/rpm download：

- 可检查版本；
- 可引导下载；
- 不把 elevation / package install 包装成“无感自动更新”。

---

# 18. Product UX Decision

Desktop-only Settings 新增：

```text
关于与更新
```

最小信息：

- MemoFlow；
- current version；
- Stable channel；
- current update state；
- last checked；
- check for updates；
- available version；
- release note summary；
- progress；
- restart and update；
- bounded failure message。

## 18.1 无更新

### background

不弹 toast。

### explicit

显示：

```text
已是最新版本
```

## 18.2 有更新

下载期间：

- 不强制 modal；
- 可在设置页显示进度；
- shell 可以显示轻量 indicator。

Ready：

```text
新版本已准备好
[重新启动并更新]
[稍后]
```

“稍后”只关闭当前提示，不丢失 ready state。

## 18.3 错误

Background：

- log；
- settings status 可见；
- 不用全局 destructive alert。

Explicit：

- 当前操作失败；
- 提供 retry。

---

# 19. Renderer / IPC Boundary

## 19.1 Contracts

所有 renderer-safe：

- channels；
- snapshot DTO；
- state DTO；
- capability DTO；
- failure DTO；

进入：

```text
@memoflow/contracts/electron
```

## 19.2 Channel Shape

现有 `AutoUpdateChannels` 作为 residual surface 迁移。

目标：

```ts
DesktopUpdateChannels = {
  GET_SNAPSHOT: 'desktop-update:get-snapshot',
  CHECK: 'desktop-update:check',
  RESTART_AND_INSTALL: 'desktop-update:restart-and-install',
  STATE_CHANGED: 'desktop-update:state-changed',
};
```

是否保留旧名称 compatibility alias，只在实施 Phase 0 根据实际 consumers 决定。

目前已知没有真实 renderer consumer，因此优先一次性迁移，不长期保留 dual。

## 19.3 Preload

只 allow-list 上述窄 surface。

禁止：

- arbitrary update server URL；
- generic config mutation；
- raw updater event forwarding。

---

# 20. Proposed Internal Structure

目标结构：

```text
apps/desktop/src/main/modules/desktop-update/
├── domain/
│   ├── desktop-update-state.ts
│   ├── desktop-update-policy.ts
│   ├── desktop-update-release.ts
│   └── installation-ownership.ts
├── application/
│   ├── desktop-update-coordinator.ts
│   └── update-install-coordinator.ts
├── infrastructure/
│   ├── electron-updater.adapter.ts
│   ├── update-feed-resolver.ts
│   ├── installation-owner.detector.ts
│   └── update-receipt.store.ts
├── transport/
│   └── desktop-update-ipc.ts
└── index.ts
```

如果实际代码量不足，不要求为了目录美观强制每层一个目录；保护的是职责边界，而不是目录数量。

### Renderer host

```text
apps/desktop/src/renderer/platform/
└── desktop-update-service.ts
```

### Shared Vue

```text
packages/app-vue/
└── DesktopUpdateService port + Settings surface
```

app-vue 不允许直接 import Electron 或 electron-updater。

---

# 21. Policy Defaults

Phase 1：

```ts
{
  channel: 'stable',
  mode: 'periodic',
  startupDelayMs: 30_000,
  intervalMs: 60 * 60 * 1000,
  autoDownload: true,
  install: 'explicit-restart',
}
```

注意：

```text
autoDownload: true
```

是 MemoFlow policy，不等价于把：

```ts
electronUpdater.autoDownload = true;
```

交给第三方库自动决定。

Adapter 层仍设置 library auto-download off，由 Coordinator 显式发 download command。

---

# 22. Release Eligibility

第一阶段 eligibility：

```text
current channel = stable
AND release channel = stable
AND release version > current version
AND installation capability permits update
AND rollout cohort eligible
```

禁止自动 downgrade。

如果 Feed 指向：

- 相同版本；
- 更旧版本；
- malformed semver；
- artifact mismatch；

必须 fail closed。

---

# 23. Staged Rollout

electron-updater 已支持 staged rollout metadata。

长期 rollout：

```text
candidate
→ 10%
→ 30%
→ 50%
→ 100%
```

客户端 eligibility 必须稳定，不能每次 check 随机变化。

推荐使用稳定 device installation ID / updater provider 的稳定 rollout semantics。

若发现坏版本：

> 发布更高版本 hotfix，而不是替换同一 semantic version 背后的字节。

---

# 24. Security Boundary

## 24.1 Required

- HTTPS feed；
- generated checksum；
- checksum mismatch fail closed；
- no arbitrary renderer feed override；
- no downgrade by default；
- macOS code signing；
- macOS notarization/trust；
- Windows signing 纳入 production hardening；
- release metadata 与 artifact 来自同一 canonical release；
- provider secrets 不进入 renderer。

## 24.2 Supply-chain rule

禁止：

```text
手工编辑 latest.yml checksum
```

manifest 必须由 packaging pipeline 生成或从已验证 artifact deterministic projection。

---

# 25. Observability

最小事件：

```text
update_check_started
update_check_completed
update_available
update_download_started
update_download_completed
update_ready
update_restart_requested
update_shutdown_completed
update_handoff_started
update_version_changed
update_failed
```

记录：

- app version；
- target version；
- platform；
- arch；
- installation owner；
- intent；
- phase；
- duration；
- bounded failure code。

不得记录：

- absolute user file paths；
- secrets；
- signed download URL token；
- raw environment。

---

# 26. Protected Contracts

实施必须保护：

1. Profile Access 仍是本地数据 access gate。
2. Profile 切换不影响 updater ownership。
3. PowerSync / Profile DB 不存 updater device state。
4. Existing release build/promotion contract 不被 client update 逻辑反向修改。
5. System `GET_APP_VERSION` contract 可继续存在。
6. Preload 继续严格 allow-list。
7. app-vue 继续保持 host-neutral，不直接引入 Electron。
8. normal app quit 和 update restart 共享单一 cleanup owner。
9. current packaged smoke 继续验证 artifact 可启动。
10. update E2E 是新增验证，不替代已有 release trust/runtime checks。

---

# 27. Explicitly Forbidden

- renderer 直接 import `electron-updater`；
- renderer 直接订阅 third-party updater event 名；
- profile activation 创建 updater；
- 每个 BrowserWindow 创建独立 updater；
- UI 直接 setFeedURL；
- UI 直接修改 update interval；
- 同时保留多个 install terminal path；
- 普通 Cmd+Q 与 Restart-to-Update 竞争调用 installer；
- 用 `autoUpdate: boolean` 表达 check/download/install/channel 全部语义；
- 根据 `process.platform` 单独决定 installation authority；
- 把 raw GitHub “latest” 页面语义视为长期 domain contract；
- macOS unsigned build 开启正式 automatic install；
- 只用 package smoke 宣称 self-update 已验证；
- 对同一个 semantic version 替换已发布 artifact。

---

# 28. Consequences

## Positive

- Update domain 不再绑定 electron-updater 版本。
- Electron-updater v27/v28 升级不会要求 UI 重写。
- Windows/macOS/Linux 差异在 adapter/ownership 层被隔离。
- Profile runtime 不再承担 device installation concern。
- Window rebuild 不会丢失 update state。
- 产品 UX 可以明确区分后台行为和用户主动行为。
- graceful shutdown 成为唯一安装前置路径。
- Release feed 可以演进为自有 CDN / generic provider。
- 能建立真正的 N → N+1 correctness test。

## Cost

- 比“main.ts 两行 autoUpdater”复杂。
- 需要额外 state machine 和 IPC contract。
- 需要重构现有 app quit cleanup owner。
- macOS production self-update 受 signing credential gate。
- 自建 update feed projection 会增加 delivery pipeline 维护面。

这些成本是有意接受的，因为 MemoFlow 已经不是无状态 Demo。

---

# 29. Non-goals

本 ADR 不决定：

- 强制安全更新的 minimum-supported-version 产品策略；
- 企业集中式 updater policy server；
- delta algorithm 自研；
- 自研 installer；
- background service / daemon updater；
- mobile app updates；
- Web PWA updates；
- Beta/Canary 第一版 UI；
- Windows Store / Mac App Store 上架。

---

# 30. Adoption Criteria

ADR 从“提议中”升级为“已采纳并实施”，至少要求：

1. canonical typed state machine 已落地；
2. shell singleton ownership 已验证；
3. raw updater event 不再进入 renderer；
4. update snapshot replay 可用；
5. install single-flight 可用；
6. update install 经过 shared shutdown path；
7. Windows direct-download N → N+1 E2E 通过；
8. current version / user Profile data 更新后保持；
9. release metadata gate 可以阻止缺失 manifest/artifact；
10. macOS 正式 rollout 前签名与 feed conflict 已解决。

后续具体执行见实施计划。
