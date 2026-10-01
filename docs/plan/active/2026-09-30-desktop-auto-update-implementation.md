---
tags:
  - plan
  - active
  - desktop
  - electron
  - auto-update
  - release
description: MemoFlow Desktop 自动更新领域模型、Shell Runtime、Windows 首个闭环、Update Feed、macOS 签名与 Linux ownership 的实施计划
created: 2026-09-30T12:45:00+08:00
updated: 2026-09-30T12:45:00+08:00
---

# MemoFlow Desktop Auto-Update Implementation Plan

> 本计划执行 [ADR-112](../../architecture/adr/ADR-112-desktop-update-domain-runtime-and-installation-ownership.md)。
>
> 外部参考研究见 [Desktop Auto-Update Reference Study](../../analysis/2026-09-30-desktop-auto-update-reference-study.md)。
>
> 初步代码取证见 [Desktop Auto-Update Exploration](./2026-09-30-desktop-auto-update-exploration.md)。

## 1. Outcome

完成后，Direct Download 的 MemoFlow Desktop 应满足：

```text
用户正在运行 N
    ↓
Shell 后台检查
    ↓
发现 N+1
    ↓
后台下载
    ↓
校验 / staging
    ↓
显示“更新已准备好”
    ↓
用户选择“重新启动并更新”
    ↓
统一 graceful shutdown
    ↓
installer handoff
    ↓
启动 N+1
    ↓
验证版本与本地 Profile 数据
```

首个可信 release lane：

```text
Windows x64 / per-user NSIS / Stable
```

随后扩展：

```text
macOS x64 + arm64
Linux AppImage
```

## User scope decision — 2026-10-01

macOS auto-update implementation is deferred by user. DU-1501, DU-1502, DU-1503, and DU-1504 are DEFERRED. macOS is not a gate for Windows feed/rollout work; next work must be non-macOS. DU-1402 and DU-1403 remain DONE only with passing cleanup validation. There is no live pointer cutover/CDN deployment in this scope.

## Cleanup validation — 2026-10-01

- Focused DU-1402 publication tests: 4/4 passed; focused DU-1403 rollout tests: 13/13 passed.
- Affected metadata, release tooling, and workflow tests: 40/40 passed; full `node --test tools/ci-cd-platform/__tests__/*.test.mjs`: 158/158 passed.
- Inventory generation/check: 1266 files passed; `git diff --check` passed.
- Additional `pnpm nx run memoflow:governance-check` fails at the existing platform-leakage finding in `packages/app-vue/src/di/desktop-update-service.surface.spec.ts` (`window.electronAPI`); that file and the audit are unchanged from HEAD.
- All uncommitted Desktop TypeScript macOS changes were restored to HEAD; no Desktop TypeScript typecheck is needed for this cleanup.

## Current progress

- `DU-1001` — **DONE**: legacy updater dormancy / preload / ad-hoc event / mutable policy baseline locked by characterization tests.
- `DU-1002` — **DONE**: release updater metadata closure gate implemented and wired before GitHub Release asset upload; Windows/Linux/current macOS arch manifests are checked against canonical release assets.
- `DU-1101` — **DONE**: renderer-safe Desktop Update schemas and the narrow replayable transport contract are established; legacy channels remain isolated until DU-1301 transport cutover.
- `DU-1102` — **DONE**: installation ownership/capabilities are modeled independently from OS and fail closed for unknown/untrusted installation shapes.
- `DU-1103` — **DONE**: immutable typed update state transitions, illegal-transition guards, intent propagation, and failure recovery are covered by focused tests.
- `DU-1104` — **DONE**: electron-updater is isolated behind a MemoFlow engine port; SDK auto-download/auto-install are disabled, provider events/errors are normalized, and raw paths/errors do not cross the adapter boundary.
- `DU-1105` — **DONE**: DesktopUpdateCoordinator owns scheduling, single-flight checks/downloads, explicit/background intent, automatic-download policy, replayable snapshots, and engine lifecycle; async error/check races preserve the first terminal state.
- `DU-1106` — **DONE**: Desktop Update is composed exactly once at the process/Shell boundary, owned by `DesktopMainRuntime`, survives Profile/window lifecycle changes, and is destroyed only with the process runtime. Host installation evidence is conservative: packaged Windows NSIS and AppImage are self-managed, Snap is package-manager owned, dev/unknown Linux/direct macOS without signed provenance fail closed.
- **Phase 1 complete**: Desktop Update now has contracts, ownership, state machine, adapter, coordinator, and Shell singleton wiring with 52 focused update tests, Desktop main-process tests, full Desktop typecheck, and targeted ESLint green.
- `DU-1201` — **DONE**: `DesktopShutdownCoordinator` now owns single-flight destructive cleanup, the 10s safety bound, failure/timeout settlement, shutdown reason ownership, and an explicit terminal-exit gate. Normal quit and update-install share this owner; update-install cleanup preserves the updater until handoff.
- `DU-1202` — **DONE**: `UpdateInstallCoordinator` is the sole Restart-to-Update terminal path. It accepts only Ready, provides install single-flight, requires a durable pre-shutdown receipt, shares `DesktopShutdownCoordinator`, authorizes terminal exit immediately before `quitAndInstall()`, normalizes receipt/shutdown/handoff failures, and uses a 15s handoff watchdog to prevent a cleaned-but-alive zombie process.
- `DU-1203` — **DONE**: pending install state is atomically stored at device-local `shared/update/install-receipt.json`, outside Profile/PowerSync. Startup verifies the expected version before `ProfileRegistry` initialization, clears successful receipts, preserves mismatches as recovery evidence, and ignores/removes corrupted receipts without blocking local access.
- `DU-1204` — **DONE**: runtime update discovery is explicit through MemoFlow-owned `desktop-update-release.json` + `DesktopUpdateFeed`; stable maps to GitHub `latest`, the adapter translates the typed feed into `electron-updater`, and CI verifies GitHub publish identity, tag prefix, Windows app/product/artifact identity, canonical `latest.yml`, referenced release assets, version, and exact NSIS installer name before upload.
- `DU-1205` — **DONE**: packaged-CI-only Main-process harness drives explicit check → auto-download → Ready → the sole restart/install path without renderer IPC; a dedicated `windows-latest` workflow packages N plus N+1, serves a local `latest.yml` feed, silently installs N, proves N+1 is on disk/relaunched, verifies startup receipt clearance and Profile/userData preservation, uploads evidence, and blocks release-asset promotion. `8c39c53d4a4` closed a synchronous shutdown reentrancy window; `87998ca3e1c` corrected the assisted-NSIS handoff to `quitAndInstall(true, true)`; `6a3c9837b2a` fixed the PowerShell wrapper's invalid `$LASTEXITCODE` check. Windows run `36718670920` is fully green: build, synthetic N/N+1 packaging, installed updater proof, evidence verification, and artifact upload all succeeded.
- `DU-1301` — **DONE**: the renderer boundary now exposes only `GET_SNAPSHOT`, explicit `CHECK`, `RESTART_AND_INSTALL`, and validated `STATE_CHANGED`; Main owns registration/disposal, preload explicitly allow-lists the canonical channels, raw/provider configuration never crosses the boundary, and the dormant legacy `AutoUpdateManager` / five mutable `auto-update:*` channels are fully retired. Desktop, IPC, contracts, typecheck, inventory, governance, and targeted lint suites are green.
- `DU-1302` — **DONE**: shared Vue now owns only the host-neutral `DesktopUpdateService` port and optional DI key; Desktop provides the IPC-backed adapter for snapshot/check/restart-install plus validated `STATE_CHANGED` subscription, malformed renderer payloads fail closed, Web intentionally provides no updater capability, and no Electron/runtime configuration leaks into app-vue. app-vue 231 files / 980 tests, focused Desktop adapter/DI tests, both typechecks, inventory, and targeted lint are green; the only concurrent full-Desktop failure was an unrelated Argon2 PIN-test timeout that passes in isolation.
- `DU-1303` — **DONE**: Settings now exposes a Desktop-only `关于与更新 / About & Updates` group through capability presence rather than environment sniffing. It renders current version/channel/owner plus disabled, checking, explicit up-to-date, available, downloading, preparing, Ready, restarting, and failed/retry states from a pure presentation mapping; uses the sole restart/install command; receives live progress from `STATE_CHANGED`; bounds release-note presentation; has zh-CN/en-US coverage; and stays absent on Web. Focused state/section/i18n tests are green, app-vue typecheck/lint/inventory are green, and the full app-vue suite passes 233 files / 998 tests.
- `DU-1304` — **DONE**: the Shell now projects only actionable updater states through an optional `DesktopUpdateService` consumer: verified Ready and retryable install failures that recover to Ready. Background checking/available/downloading/preparing remain silent; `WindowHeader` stays updater-agnostic through a generic `status-actions` slot; clicking the indicator only routes to `/settings?tab=updates` and never installs directly; stale initial reads cannot overwrite newer pushed state; subscriptions clean up across unmount/remount; Web/no-service hosts render nothing. 43 focused shell/i18n tests, direct app-vue `vue-tsc`, inventory check, targeted ESLint, and `git diff --check` are green.
- **Phase 3 complete**: manual check, live replayable Settings state, durable Ready/retry UX, and the Shell Ready indicator now share one canonical updater snapshot without a duplicate renderer store.
- `DU-1401` — **DONE**: a dependency-free, provider-neutral Update Feed Projection contract now defines stable/beta/canary coordinates across Windows x64 direct NSIS, per-arch signed/notarized macOS, and Linux x64 direct AppImage. Release tooling derives its metadata baseline from the same lane table and validates schema-2 canonical release evidence before a lane is eligible; unsigned macOS, missing trust receipts, package-managed Linux evidence, unsupported coordinates, and ambiguous/drifted contract fixtures fail closed. Current GitHub runtime behavior is unchanged. Focused feed/metadata tests, the 141-test CI/CD platform suite, test inventory, targeted ESLint, and `git diff --check` are green.
- `DU-1402` — **DONE**: release tooling now deterministically materializes a versioned-prefix feed bundle from the canonical schema-2 Desktop release manifest. Only DU-1401-eligible lanes are projected; metadata is renamed only at the projected feed boundary, referenced artifacts and companion blockmaps retain canonical bytes, SHA-256, and size evidence, and traversal/ambiguity/identity drift fail closed. The draft-release workflow materializes the bundle after metadata-closure verification and retains the publication receipt + versioned files as workflow evidence without changing the current GitHub runtime provider or prematurely enabling macOS/Linux rollout. Cleanup validation is recorded below.
- `DU-1403` — **DONE**: staged rollout is projected as immutable control metadata on top of DU-1402 evidence using electron-updater 6.8.9 native `stagingPercentage`; active stages are exactly 10/30/50/100, pause maps to 0%, and cohort selection mirrors the provider-owned persisted `.updaterId` UUID semantics. Control receipts record increase/decrease/pause/resume/hold transitions, re-bind every lane to the DU-1401 contract plus DU-1402 metadata identity, and never mutate canonical release bytes. Initial p10 evidence is retained in release CI without a live provider cutover. Windows-only publication is valid; rollout requires neither a publication class nor macOS lanes. Cleanup validation is recorded below.
- `DU-1501` — **DEFERRED by user**: macOS production signing/updater gate work is deferred; no publication class is introduced.
- `DU-1502` — **DEFERRED by user**: canonical per-architecture macOS metadata and runtime feed work is deferred; the committed arch-specific release behavior remains.
- `DU-1503` — **DEFERRED by user**: native Intel installed-update E2E and packaged provenance work are deferred.
- `DU-1504` — **DEFERRED by user**: native Apple Silicon installed-update E2E and packaged provenance work are deferred.
- macOS is not a gate for Windows feed/rollout work. DU-1402/DU-1403 consume whichever DU-1401 lanes are currently eligible; Windows-only publication is valid.
- Next: `DU-1701` — non-macOS updater diagnostics for the existing Windows lane.

## 2. Non-goals

本计划不包含：

- Windows Store / Mac App Store 上架；
- 自研 installer；
- Mobile 更新；
- Web PWA 更新；
- 强制 minimum version；
- Beta/Canary 第一版产品 UI；
- 企业 updater policy server；
- 自研 binary diff；
- deb/rpm 无感自升级承诺。

## 3. Protected Contracts

实施期间必须保护：

1. Profile Access 继续是本地 Profile 准入边界。
2. updater 不依赖 Profile DB / PowerSync 才能初始化。
3. Profile switch 不重建 updater。
4. app-vue 不直接 import Electron。
5. preload 继续严格 channel allow-list。
6. normal quit 与 update restart 不产生两套资源清理 truth。
7. Delivery Platform V3 的 canonical release / trust / manifest 仍是发布真值。
8. Existing packaged smoke 继续通过。
9. macOS unsigned-pilot 不被误宣称为 production auto-update ready。
10. release artifact version 不允许原地替换同版本字节。

---

# 4. Target Architecture

```text
Canonical Release Pipeline
         │
         ▼
Update Feed Projection
         │
         ▼
InstallationOwnerDetector
         │
         ▼
ElectronUpdaterAdapter
         │
         ▼
DesktopUpdateCoordinator
         │
         ├── scheduling
         ├── single-flight
         ├── policy
         └── canonical state
         │
         ▼
UpdateInstallCoordinator
         │
         ▼
DesktopShutdownCoordinator
         │
         ▼
installer handoff

IPC
 ↓
DesktopUpdateService
 ↓
About & Updates / shell indicator
```

---

# 5. Phase Overview

| Phase   | 目标                                | 完成条件                                 |
| ------- | ----------------------------------- | ---------------------------------------- |
| Phase 0 | 固定 baseline 与 residual contracts | characterization tests + inventory       |
| Phase 1 | 建立 Update Domain 与 Shell owner   | typed state + coordinator + adapter      |
| Phase 2 | 完成 Windows vertical slice         | N → N+1 installed E2E                    |
| Phase 3 | 完成产品 UX 与 replayable state     | Settings + indicator + manual check      |
| Phase 4 | 建立 architecture-aware feed        | generic feed + release projection        |
| Phase 5 | 完成 macOS production lane          | signing + per-arch feed + E2E            |
| Phase 6 | Linux ownership 收口                | AppImage self-update / deb-rpm ownership |
| Phase 7 | 灰度、诊断与发布 runbook            | staged rollout + failure drills          |

---

# Phase 0 — Baseline and Characterization

## DU-1001 — Lock current updater residual surface

**Goal:** 精确记录当前 dormant updater，防止重构时误删现有有用能力或保留错误 dual。

**Why now:** 当前已有 manager、IPC、contracts、builder metadata，但没有真实 runtime consumer。

**Scope:**

- `apps/desktop/src/main/modules/auto-update/**`
- `packages/contracts/src/electron/ipc-channels.ts`
- `apps/desktop/src/preload/allowed-channels.ts`
- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/main/lifecycle/app-lifecycle.ts`

**Implementation:**

1. 增加 characterization test，确认 updater 当前没有被 shell compose。
2. 固定现有五个 `AutoUpdateChannels` 只有 residual tests 使用。
3. 固定 preload 当前不包含 updater channels。
4. 固定 main process 当前没有 updater singleton。
5. 记录所有 ad-hoc `update:*` event string。

**Tests:**

```bash
pnpm nx run desktop:test
pnpm nx run desktop:test:main
```

**Acceptance:**

- 当前 dormant 状态有自动测试证据；
- 后续删除 residual 不依赖人工 grep。

**Risk:** characterization test 不应把错误结构永久规定为目标，只标记为 migration baseline。

---

## DU-1002 — Lock release metadata baseline

**Goal:** 把当前 Release asset shape 变成可执行 inventory。

**Scope:**

- `.github/workflows/release-assets.yml`
- `tools/ci-cd-platform/release-tools/**`
- `apps/desktop/electron-builder.json5`

**Implementation:**

1. 为 Windows 定义 expected updater assets：
   - `latest.yml`
   - NSIS installer
   - blockmap
2. 为 Linux 定义：
   - `latest-linux.yml`
   - AppImage
3. 记录 macOS 当前 arch-specific manifest rename。
4. 增加测试：manifest 中引用的 path 必须在 release asset manifest 中存在。
5. 不在本 ticket 修 macOS。

**Tests:**

```bash
pnpm nx run ci-cd-platform:test
pnpm run ci:delivery:check
```

**Acceptance:**

- release contract 可以明确判断“updater assets complete/incomplete”。

---

# Phase 1 — Domain Foundation

## DU-1101 — Introduce renderer-safe Desktop Update contracts

**Goal:** 建立 MemoFlow-owned DTO，不再把 `electron-updater` 类型当公共协议。

**Scope:**

- `packages/contracts/src/electron/**`

**Add:**

- `DesktopUpdateStateDTO`
- `DesktopUpdateReleaseDTO`
- `DesktopUpdateProgressDTO`
- `DesktopUpdateFailureDTO`
- `DesktopUpdateCapabilitiesDTO`
- `DesktopUpdateSnapshotDTO`
- `DesktopUpdateChannels`

**Target channels:**

```text
desktop-update:get-snapshot
desktop-update:check
desktop-update:restart-and-install
desktop-update:state-changed
```

**Implementation:**

1. 先写 contract tests。
2. 使用 discriminated union。
3. 不出现 `electron-updater` import。
4. `CHECK` renderer command 语义固定为 explicit check。
5. background check 只能由 Main runtime 发起。
6. 不提供 generic CONFIG channel。
7. 不先提供 DOWNLOAD command。

**Tests:**

```bash
pnpm nx run contracts:test
pnpm nx run contracts:typecheck
```

**Acceptance:**

- contract package 完全不知道 Electron updater implementation；
- event surface 只有一个 state-changed stream。

**Dependencies:** DU-1001。

---

## DU-1102 — Model installation ownership and capabilities

**Goal:** 产品行为不再由 `process.platform` 直接决定。

**Scope:**

- 新 `apps/desktop/src/main/modules/desktop-update/domain/**`
- installation detector test fixtures

**Implementation:**

1. 建立 `DesktopInstallationOwner`。
2. 建立 capability projection。
3. 首期 detector 支持：
   - Windows NSIS direct；
   - macOS direct；
   - Linux AppImage；
   - Linux deb/rpm；
   - unsupported/unknown。
4. detector 输出 owner + capabilities。
5. 不在 detector 中发网络请求。

**Acceptance:**

fixture matrix 至少覆盖：

| Platform / Shape         | Owner           | canSelfInstall |
| ------------------------ | --------------- | -------------- |
| Win NSIS per-user        | memoflow-direct | yes            |
| macOS signed direct      | memoflow-direct | yes            |
| macOS unsigned           | unsupported     | no             |
| Linux AppImage           | memoflow-direct | yes            |
| deb/rpm repository-owned | package-manager | no             |
| portable                 | portable        | no             |

**Risk:** 安装来源检测不可靠时必须降级为 unsupported，不猜测。

---

## DU-1103 — Implement canonical state machine

**Goal:** Desktop Update 拥有自己的合法状态转换。

**Scope:**

- `desktop-update-state.ts`
- focused tests

**Implementation:**

1. 建立 ADR-112 state union。
2. 用 reducer / transition functions 固定合法转换。
3. illegal transition fail fast in development/tests。
4. 生产环境将 adapter 异常 normalize 为 `failed`。
5. `downloaded` 与 `ready` 分离。
6. explicit/background intent 随 check → available → download → ready 保留。
7. state object immutable。

**Required tests:**

- idle → checking；
- checking → idle(no update)；
- checking → available；
- available → downloading；
- downloading progress；
- downloading → downloaded；
- downloaded → preparing → ready；
- ready → restarting；
- failure recovery；
- duplicate check ignored；
- install before ready rejected。

**Acceptance:** UI 无需任何 boolean 拼装即可判断可用动作。

---

## DU-1104 — Build ElectronUpdaterAdapter

**Goal:** 将 electron-updater 收口为一个 third-party adapter。

**Scope:**

- `infrastructure/electron-updater.adapter.ts`
- current `auto-update-manager.ts` migration

**Adapter port 示例：**

```ts
interface DesktopUpdateEngine {
  initialize(): Promise<void>;
  check(): Promise<EngineCheckResult>;
  download(): Promise<void>;
  prepare(): Promise<void>;
  quitAndInstall(): void;
  onEvent(listener: EngineEventListener): () => void;
}
```

**Implementation:**

1. dynamic import 可继续保留用于 packaged-only boundary。
2. 设置 library `autoDownload = false`。
3. Phase 1 设置 `autoInstallOnAppQuit = false`。
4. `setFeedURL` 只允许 FeedResolver 调用。
5. 将 provider errors normalize。
6. native event 不跨 adapter。
7. listener dispose 明确。
8. 删除/退休旧 manager 中重复 state ownership。

**Acceptance:**

- repo 内 `electron-updater` import 只存在 infrastructure adapter / packaging test；
- renderer/event contract 不出现 native event name。

---

## DU-1105 — Implement DesktopUpdateCoordinator

**Goal:** 单一 owner 负责 schedule、policy、single-flight 和 state。

**Scope:**

- `application/desktop-update-coordinator.ts`

**Policy Phase 1:**

```text
stable
periodic
startup delay 30s
interval 1h
auto-download eligible stable releases
```

**Implementation:**

1. initialize packaged gate。
2. 解析 installation capabilities。
3. 建立 startup timer。
4. 建立 periodic timer。
5. check single-flight。
6. download single-flight。
7. auto-download decision。
8. snapshot get/subscribe。
9. destroy timers/listeners。
10. dev mode disabled reason 明确。

**Tests:**

使用 fake engine + fake clock，不打真实 GitHub。

**Acceptance:**

- 多次 `check()` 只有一个 provider request；
- Profile change 与 coordinator 无关；
- dispose 后无 timer/listener 泄漏。

---

## DU-1106 — Compose updater as Shell singleton

**Goal:** updater 真正运行，但不进入 profile composition。

**Scope:**

- `apps/desktop/src/main/main.ts`
- `apps/desktop/src/main/desktop-main-runtime.ts`
- `apps/desktop/src/main/lifecycle/app-lifecycle.ts`

**Implementation:**

1. shell init 创建 coordinator。
2. 绑定 current main/profile-access window-independent transport。
3. runtime 持有 updater disposable。
4. app process quit 时 destroy。
5. Profile deactivate 不 destroy。
6. tests 锁定 exactly-one composition。

**Acceptance:**

- lock/switch Profile 不重新构造 updater；
- 创建/关闭 BrowserWindow 不重新构造 updater。

---

# Phase 2 — Safe Install and Windows Vertical Slice

## DU-1201 — Extract shared DesktopShutdownCoordinator

**Goal:** normal quit 和 update restart 共用唯一 cleanup owner。

**Current evidence:**

`app-lifecycle.ts` 当前 `handleBeforeQuit` 直接负责 `mainRuntime.dispose()` 与 timeout。

**Implementation:**

1. 提取明确的 shutdown coordinator。
2. 定义 shutdown reason：
   - normal-quit
   - update-install
3. 保持当前 10s safety bound 或根据 focused test 调整。
4. coordinator 防重入。
5. normal quit 仍保持现有行为。
6. update-install 可以请求 cleanup settlement 后执行 terminal callback。
7. 不复制 runtime dispose list。

**Tests:**

- normal quit only once；
- update install only once；
- concurrent normal quit/update request only one owner；
- cleanup failure；
- cleanup timeout。

**Acceptance:** lifecycle behavior 回归测试全绿。

**Risk:** 这是最敏感的 runtime refactor，必须独立 ticket，不与 UI 混改。

---

## DU-1202 — Implement UpdateInstallCoordinator

**Goal:** 只有一条 Restart-to-Update 路径。

**Implementation:**

1. 只接受 `ready`。
2. install single-flight。
3. state → restarting。
4. 写 install receipt。
5. 调 DesktopShutdownCoordinator。
6. cleanup success 后调用 adapter handoff。
7. handoff throw 记录 failure。
8. destructive cleanup 后若进程未退出，加入 bounded watchdog。
9. 普通 quit 不自动 install。

**Acceptance:**

- Settings/Menu/Toast 最终都调用同一 use case；
- cleanup 期间第二个 install request no-op；
- `autoInstallOnAppQuit` 不形成第二 install path。

---

## DU-1203 — Add device-local install receipt and startup verification

**Goal:** 更新跨进程完成后有可验证结果。

**Scope:**

- shared app data path
- receipt store
- shell startup

**Implementation:**

1. atomic write receipt。
2. handoff 前写 expectedVersion。
3. startup before Profile activation 读取。
4. compare `app.getVersion()`。
5. success：记录 outcome 并清除 receipt。
6. mismatch：记录 bounded failure。
7. corrupted receipt：忽略并记录，不阻塞启动。

**Acceptance:** update success/failure 可由下次启动确定。

---

## DU-1204 — Close Windows NSIS update feed

**Goal:** 当前 release assets 真正被 runtime 使用。

**Implementation:**

1. 保持 canonical `latest.yml`。
2. 确认 productName/appId/installer identity stable。
3. FeedResolver Phase 1 使用 GitHub provider。
4. release gate 校验 `latest.yml` path + sha512 + referenced installer。
5. artifact publication 完成后才允许 release promote。

**Acceptance:** Release 中不存在“published installer but updater manifest missing”的状态。

---

## DU-1205 — Windows N → N+1 installed-update E2E

**Goal:** 首次证明真正 self-update。

**Test journey:**

```text
1. 在 clean Windows runner/VM 安装 N
2. 保留真实 userData/Profile fixture
3. 发布/指向 N+1 candidate feed
4. 启动 N
5. explicit check 检测 N+1
6. 等待 ready
7. request restart and install
8. 等待应用重新启动
9. assert app.getVersion() === N+1
10. assert Profile registry / local data intact
11. assert receipt cleared / success recorded
```

**Artifacts:**

- updater logs；
- before/after version；
- before/after userData checksum/fixture assertion；
- release feed used；
- installer process outcome。

**Acceptance:** 此测试成为 Windows updater release gate。

---

# Phase 3 — Renderer and Product UX

## DU-1301 — Expose narrow updater IPC

**Goal:** preload 只开放 MemoFlow contract。

**Scope:**

- Main IPC adapter
- `preload/allowed-channels.ts`

**Implementation:**

1. GET_SNAPSHOT。
2. CHECK。
3. RESTART_AND_INSTALL。
4. STATE_CHANGED。
5. strict Result envelope。
6. retire residual `auto-update:config` / raw events。
7. surface tests。

**Acceptance:** updater generic config 不可从 renderer mutation。

---

## DU-1302 — Provide DesktopUpdateService in renderer DI

**Goal:** app-vue 不直接知道 Electron。

**Scope:**

- `apps/desktop/src/renderer/platform/**`
- app-vue DI port

**Implementation:**

1. Desktop host adapter。
2. `getSnapshot()`。
3. explicit check。
4. restart/install。
5. subscribe/unsubscribe。
6. Web host 不提供或提供 unavailable implementation。
7. no `window.electronAPI` inline casts in settings component。

**Acceptance:** host-neutral package tests enforce no Electron import。

---

## DU-1303 — Add Settings → About & Updates

**Goal:** 完成用户可理解的更新控制面。

**Scope:**

- `packages/app-vue/src/modules/setting/views/UserSettingsView.vue`
- `SettingsNavigation.vue`
- new update settings component
- zh-CN / en-US locale

**Desktop-only group:**

```text
关于与更新
```

**States:**

- current version；
- disabled reason；
- checking；
- up-to-date after explicit check；
- update available；
- downloading progress；
- ready；
- failure + retry。

**UX constraints:**

- background no-update 不 toast；
- explicit no-update 显示成功反馈；
- ready action durable；
- failure message bounded；
- no modal while downloading。

**Acceptance:** settings tests cover every state fixture。

---

## DU-1304 — Add shell update indicator

**Goal:** 用户无需一直停留设置页也能知道 Ready。

**Implementation:**

1. only meaningful states surface indicator。
2. checking 不默认显示，避免闪烁。
3. ready 显示 badge / lightweight update card。
4. 点击进入 updates settings 或触发统一 action。
5. 不复制 state store。

**Optional polish:** checking presentation >400ms 才显示。

---

# Phase 4 — Architecture-aware Update Feed

## DU-1401 — Define Update Feed Projection contract

**Goal:** client 不永久绑定 GitHub Releases asset naming。

**Feed dimensions:**

```text
channel
platform
arch
installation kind
```

**Target paths:**

```text
/stable/windows/x64/
/stable/darwin/x64/
/stable/darwin/arm64/
/stable/linux/x64/
```

**Decision:** feed 只投影已验证 canonical release。

**DU-1401 implementation closure:**

- `apps/desktop/desktop-update-feed-projection.mjs` owns the dependency-free,
  provider-neutral lane contract and relative path resolution. Stable/beta/canary
  are explicit coordinates; beta/canary reservation does not enable runtime rollout.
- Release tooling derives its metadata baseline from that contract and validates
  schema-2 canonical manifest evidence before declaring a lane eligible. No
  separate version, artifact digest, provider URL, or publication truth is added.
- macOS reuses the existing signed-notarized trust receipt validator. Windows
  keeps signed/unsigned policy. Linux requires `direct-appimage` runtime evidence;
  current `installed-deb` evidence cannot satisfy this future Phase-6 gate.
- Contract fixtures are validated before resolution; unknown dimensions and
  ambiguous paths fail closed. Focused node tests cover mapping and eligibility;
  inventory and repository governance checks cover integration.
- No runtime cutover, file copying, checksum generation, or workflow changes.


---

## DU-1402 — Publish feed from release evidence

**Goal:** 由 release manifest deterministic 生成 feed。

**Implementation:**

1. 输入 desktop release manifest。
2. 只接受通过 runtime/trust gates 的 assets。
3. copy generated updater metadata。
4. copy referenced artifacts/blockmap。
5. publish atomically or versioned-prefix + pointer switch。
6. publication receipt 进入 release evidence。

**Acceptance:** 不存在手工 checksum。

**DU-1402 implementation closure:**

- `materialize-desktop-update-feed.mjs` consumes only the canonical schema-2 Desktop release manifest and the canonical artifact root; it does not create a second release/version truth.
- Publication uses `versions/<tag>/<gitSha>/<channel>/<platform>/<arch>/...`, with a deterministic receipt describing the future channel-pointer switch. The current runtime provider is intentionally unchanged.
- Each eligible lane reuses DU-1401 eligibility. Source updater metadata is copied to the projected target name; every referenced artifact plus an available companion `.blockmap` is copied byte-for-byte and bound to canonical SHA-256/size evidence.
- Unsigned macOS and current `installed-deb` Linux evidence are skipped as policy-ineligible, while malformed signed trust, missing/ambiguous canonical assets, metadata version drift, unsafe references, or conflicting targets fail closed.
- `release-assets.yml` materializes the stable feed only after canonical update-metadata closure and retains the complete versioned bundle plus `desktop-update-feed-publication.json` as workflow evidence. No live feed host or runtime cutover is introduced here.
- Focused publication tests cover Windows materialization, current unsigned-pilot macOS / installed-deb Linux skips, blockmap closure, deterministic output, traversal/ambiguity failures, and workflow ordering. Windows-only feed publication is valid; the receipt is provider-neutral and records lanes/skippedLanes without a publication class.

---

## DU-1403 — Add staged rollout control

**Goal:** 支持 10% → 30% → 50% → 100%。

**Implementation:**

1. 使用 electron-updater supported staging metadata 或等价 feed eligibility。
2. cohort 必须稳定。
3. rollout decrease / pause 有明确 operator action。
4. bad version 通过更高版本修复，不替换同版本 artifact。

**Acceptance:** fixture 测试证明同一 installation ID 多次 check eligibility 稳定。

**DU-1403 implementation closure:**

- Rollout control is an explicit Desktop-owned contract with only `10 / 30 / 50 / 100` active stages plus fail-closed pause. It mirrors electron-updater 6.8.9 cohort semantics exactly: the provider-owned persisted `.updaterId` UUID remains the sole installation identity, and eligibility derives from its final 32 bits rather than a MemoFlow-owned random identifier.
- `materialize-desktop-update-rollout.mjs` consumes the immutable DU-1402 publication receipt, re-validates every lane against the DU-1401 projection contract, verifies source metadata SHA-256/size and release identity, and emits immutable control-specific metadata containing exactly one native `stagingPercentage`. Canonical release metadata and artifact bytes are never mutated.
- Decrease, pause, resume, increase, and hold are explicit transition evidence. Pause projects `stagingPercentage: 0`, while a bad release remains immutable and must be superseded by a higher-version hotfix rather than same-version byte replacement.
- The release workflow prepares initial `p10` rollout evidence only after immutable feed materialization and retains it separately. No live pointer switch, CDN/provider cutover, or macOS/Linux rollout enablement is introduced by DU-1403.
- Windows-only rollout consumes the eligible lanes present in the DU-1402 receipt, without publication-class or macOS-lane requirements. Cleanup validation is recorded below.

Next: `DU-1701` — non-macOS updater diagnostics for the existing Windows lane.

---

# Phase 5 — macOS Production Lane (DEFERRED by user)

macOS production updater work is deferred and is not a gate for Windows feed/rollout. Next work must be non-macOS.

## DU-1501 — Make signing a production updater gate

**Goal:** unsigned-pilot 不再能进入 production update feed。

**Scope:**

- existing macOS signing policy
- release tooling

**Required:**

- Developer ID signing；
- notarization；
- staple；
- trust verify。

**Acceptance:** production feed publisher 对 unsigned-pilot fail closed。

**Status: DEFERRED by user.** No implementation completion is claimed; resume only after a new user decision.

---

## DU-1502 — Replace macOS manifest rename workaround with per-arch feed

**Goal:** x64/arm64 都拥有 canonical `latest-mac.yml` URL。

**Implementation:**

```text
darwin/x64/latest-mac.yml
darwin/arm64/latest-mac.yml
```

FeedResolver 按 `process.arch` 选择。

GitHub Release 仍可保留 arch-specific human assets。

**Acceptance:** client 不依赖 `latest-mac-x64.yml` 这种非默认 provider hack。

**Status: DEFERRED by user.** No implementation completion is claimed; resume only after a new user decision.

---

## DU-1503 — macOS x64 N → N+1 E2E

**Status: DEFERRED by user.**

**Acceptance:** signed installed app 完成 update 并验证版本。

## DU-1504 — macOS arm64 N → N+1 E2E

**Status: DEFERRED by user.**

与 x64 独立 gate，不以 cross-compile package smoke 替代。

---

# Phase 6 — Linux Ownership

## DU-1601 — AppImage self-update lane

**Goal:** Direct AppImage 获得与 installation capability 对齐的 self-update。

**Acceptance:** AppImage N → N+1 E2E。

---

## DU-1602 — deb/rpm package-manager UX

**Goal:** 不向 package-managed 用户显示错误的“Restart to Update”。

**Behavior:**

```text
new version available
→ “更新由系统包管理器管理”
```

可提供：

- documentation；
- package repository action；
- manual download；

但不模拟无感 install。

---

# Phase 7 — Hardening and Operations

## DU-1701 — Add updater diagnostics

最小 diagnostics：

- current version；
- target version；
- owner；
- capabilities；
- feed class（不含 secret URL）；
- last check；
- last result；
- state；
- bounded failure；
- install receipt status。

提供给 Settings troubleshooting / support bundle。

---

## DU-1702 — Add failure injection matrix

至少覆盖：

| Failure                    | Expected behavior                   |
| -------------------------- | ----------------------------------- |
| offline check              | background silent / explicit error  |
| malformed metadata         | fail closed                         |
| missing artifact           | fail closed                         |
| checksum mismatch          | fail closed                         |
| download interrupted       | recoverable                         |
| app closed during download | no corrupt Ready                    |
| cleanup failure            | no handoff                          |
| cleanup timeout            | bounded behavior                    |
| handoff throw              | receipt + diagnostics               |
| renderer recreated         | snapshot restored                   |
| duplicate check            | single provider request             |
| duplicate install          | one terminal path                   |
| superseding release        | no downgrade / optional replacement |
| OS session end             | no unsafe Phase-1 auto-install      |

---

## DU-1703 — Evaluate electron-updater v27+ migration

**Goal:** 在版本稳定且仓库 tech-stack gate 允许时评估：

```text
autoInstallEvent = onNextLaunch
```

**Important:** 此 ticket 不允许为了 API 新鲜度提前升级。

需要先验证：

- electron-builder stable status；
- packaging compatibility；
- signing；
- AppImage；
- NSIS；
- current release tooling。

如果通过，可把普通 quit 后的 pending install 升级为 next-launch 模式。

Domain / UI contract 不应因此改变。

---

## DU-1704 — Write release/update operator runbook

Runbook 至少覆盖：

1. 创建 candidate；
2. build/sign/notarize；
3. package smoke；
4. update E2E；
5. publish feed；
6. rollout 10%；
7. diagnostics observation；
8. raise rollout；
9. pause；
10. hotfix；
11. bad release 处理；
12. feed rollback pointer；
13. 禁止同版本覆盖。

完成后放：

```text
docs/runbooks/desktop-auto-update-release.md
```

---

# 6. Verification Matrix

| Layer          | Verification                          |
| -------------- | ------------------------------------- |
| Domain         | state transition unit tests           |
| Adapter        | mocked electron-updater event mapping |
| Concurrency    | fake clock + single-flight tests      |
| Ownership      | installation fixture matrix           |
| IPC            | contract + preload surface tests      |
| Renderer       | service subscription/replay tests     |
| UX             | component state fixtures              |
| Lifecycle      | normal/update/concurrent quit tests   |
| Packaging      | desktop package + packaged smoke      |
| Release        | manifest → artifact integrity         |
| Windows        | installed N → N+1                     |
| macOS x64      | signed installed N → N+1              |
| macOS arm64    | signed installed N → N+1              |
| Linux AppImage | installed N → N+1                     |

## Standard local gates

```bash
pnpm nx run desktop:test
pnpm nx run desktop:test:main
pnpm nx run desktop:test:ipc
pnpm nx run desktop:typecheck
pnpm nx run desktop:lint
pnpm nx run desktop:build
pnpm run docs:check
pnpm run governance:check
git diff --check
```

Release-related change additionally：

```bash
pnpm nx run ci-cd-platform:test
pnpm run ci:delivery:check
```

Packaged runtime change additionally：

```bash
pnpm nx run desktop:package
pnpm nx run desktop:test:packaged-smoke
```

平台 release build 必须在对应 runner 验证，不允许用 Linux 本机模拟 Windows/macOS installer correctness。

---

# 7. Ticket Dependency Order

```text
DU-1001 ─┬─> DU-1101 ─> DU-1103 ─> DU-1104 ─> DU-1105 ─> DU-1106
         │
DU-1002 ─┘

DU-1106 ─> DU-1201 ─> DU-1202 ─> DU-1203
                    │
DU-1002 ─> DU-1204 ─┴─> DU-1205

DU-1101 ─> DU-1301 ─> DU-1302 ─> DU-1303 ─> DU-1304

DU-1205 ─> DU-1401 ─> DU-1402 ─> DU-1403

DU-1402 + DU-1501 ─> DU-1502 ─> DU-1503/1504

DU-1402 ─> DU-1601
DU-1102 ─> DU-1602

all vertical lanes
    ↓
DU-1701/1702
    ↓
DU-1703 optional
    ↓
DU-1704
```

---

# 8. Review Gates

每个 Phase 完成后执行一次五层 review：

## Contract correctness

- third-party types 是否泄漏；
- state transition 是否唯一；
- IPC 是否仍是 contracts-owned。

## Vertical completeness

- Main → preload → renderer → UI 是否真正闭合；
- 新窗口是否能恢复 snapshot。

## Behavioral completeness

- explicit/background；
- update/no-update；
- retry；
- failure；
- later/restart；
- duplicate actions。

## Engineering quality

- 单一 ownership；
- no duplicated shutdown；
- no leaked timer/listener；
- no raw error leak；
- no unrelated refactor。

## Release integrity

- package；
- metadata；
- signature；
- update feed；
- installed E2E。

Finding 分类继续使用 P0/P1/P2/P3。

---

# 9. Rollback / Containment

## Runtime change regression

可以禁用：

```text
DesktopUpdateRuntime auto check
```

但保留 manual download/release 页面作为应急路径。

## Feed regression

停止发布 / 切回 previous feed pointer。

不要删除已公开的 historical artifact。

## Bad application version

发布：

```text
N+2 fixed release
```

不得把 N+1 tag 下 artifact 原地替换。

## macOS signing unavailable

保持：

```text
manual download / unsigned-pilot
```

但不进入 auto-update feed。

---

# 10. Definition of Done

整个计划只有在以下全部成立后才归档：

- [ ] Desktop Update Domain 已按 ADR-112 落地。
- [ ] updater 是 shell singleton。
- [ ] Profile switch 不影响 updater。
- [ ] electron-updater 被 adapter 隔离。
- [ ] raw updater event 不进入 renderer。
- [ ] generic config mutation IPC 已退休。
- [ ] snapshot + state-changed 可 replay。
- [ ] manual/background intent 行为不同且有测试。
- [ ] check/download/install single-flight 有测试。
- [ ] update install 共用唯一 shutdown owner。
- [ ] install receipt 可跨启动验证。
- [ ] Settings → About & Updates 完成。
- [ ] Ready 有 durable shell indicator。
- [ ] Windows NSIS N → N+1 E2E 通过。
- [ ] update feed projection 有 release integrity gate。
- [ ] macOS x64/arm64 feed conflict 解决。
- [ ] production macOS updater 只接受 signed/notarized build。
- [ ] macOS x64/arm64 N → N+1 E2E 通过。
- [ ] Linux AppImage ownership/E2E 明确。
- [ ] deb/rpm 不误宣称 self-update ownership。
- [ ] staged rollout 可操作。
- [ ] failure injection matrix 完成。
- [ ] operator runbook 完成。
- [ ] docs-check / governance / release gates 全绿。
