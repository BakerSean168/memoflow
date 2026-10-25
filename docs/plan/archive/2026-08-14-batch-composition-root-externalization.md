---
tags:
  - plan
  - active
  - architecture
  - composition-root
  - batch-migration
description: 将剩余业务模块的 composition root 从 API/Electron transport register 外移到两个宿主 runtime composer
created: 2026-08-14T00:00:00Z
updated: 2026-08-14T00:00:00Z
---

# Remaining Modules Composition Root Externalization — Batch Plan

## 1. 背景与目标

本阶段是一次 **batch migration**，但仍然只推进一个大阶段：把已通过 review 的 governance、goal、task 模式复制到剩余模块。目标是移动 **ownership**，不是重写 domain/use-case：宿主 runtime 选择 Prisma/PowerSync adapters，创建 runtime contributions，组装 transport-neutral deep module；package 内的 API/Electron module 只注册 transport 并托管 lifecycle。

参考实现已经落在：

- `apps/api/src/runtime/compose-governance.ts:5-25,62-99`：`db -> repositories -> runtime -> createGovernanceModule -> createGovernanceApiModule({ instance })`。
- `apps/desktop/src/main/runtime/compose-governance.ts:5-49,76-113`：同一 deep module 换 PowerSync adapter。
- `apps/api/src/runtime/compose-goal.ts:17-43,144-181` 与 `apps/desktop/src/main/runtime/compose-goal.ts:111-181`：host contributions、instance-bound repository view。
- `apps/api/src/runtime/compose-task.ts:45-59,158-196` 与 `apps/desktop/src/main/runtime/compose-task.ts:118-195`：conditional outbox/runtime contribution。
- 已批准的 invariant 记录在 `docs/plan/archive/2026-08-14-goal-task-composition-root-externalization.md:173-201,365-425`。

### Scope

API lane 的七个 remaining modules：`account`, `data-portability`, `notification`, `reminder`, `repository`, `schedule`, `setting`。

Electron lane 的七个 remaining modules：`account`, `ai`, `data-portability`, `notification`, `reminder`, `schedule`, `setting`；`repository` 也列入 desktop composer cleanup，但它当前没有 PowerSync/deep-module DB assembly，详见 §2.3 与 §3.4。

### Non-goals

- 不改变 route prefix、IPC channel、payload schema、auth wrapper、result envelope、OpenAPI registration 或业务规则。
- 不把 `context.db` 改成 `any`/`unknown` 来假装完成迁移；transport seam 必须真正不再组合数据库。
- 不新增 layer-named shim、service locator、module-global repository ownership。
- API AI 不在本批 API lane 清单内；batch 完成时 `createAIApiModule()` 仍在 `register()` 内组合 Prisma（§2.4 已记录），因此本计划不宣称它已完成。该 residual 已由后续计划 [2026-08-14-api-ai-composition-root-externalization](2026-08-14-api-ai-composition-root-externalization.md) 关闭。

### Hard invariants（所有步骤都必须遵守）

1. **Per-handle lifecycle**：每个 API/Electron factory handle 都有 `created -> registered | failed -> disposed` 状态；仅 `created` 可 register，重复 register fail-closed，`failed` 不可重试；destroy 幂等。
2. **API ordering**：routes/controllers 先 build；`instance.start()` 成功后才 `router.use` mount。若 start 失败，不能留下已挂载 route；若 mount 失败，清理本次新增的 router stack 并 rethrow original error。
3. **Electron ordering/ownership**：handlers 在 start 前安装；维护 `installedChannels`，失败时只 reverse-remove 本次 `register()` 实际安装的 channels；dispose error 必须 log，registration failure 仍 rethrow original error。
4. **Deep-module partial-start cleanup**：每个 module instance 记录 `startedContributions`；第 N 个 contribution start 失败时 reverse-stop 已成功启动的 N-1 个，清空列表、保持 `started=false`，使后续 dispose no-op。Schedule 已有该形状（`packages/schedule/src/server/infrastructure/schedule.module.ts:520-552`），其余模块须补齐。
5. **Public seam**：root/infrastructure barrels 只导出 ingredient factories、module factory、runtime contribution factories、port/set types；concrete Prisma/PowerSync classes 不泄漏。Apps 不得 import `/server` 或 `/server/infrastructure`。
6. **Explicit cross-module ports**：`cloudAuth`, `closureChecker`, `channelCapabilities`, `storageBaseDir`, `githubApp`, `knowledge*` ports、`sourceExecutor`、schedule lifecycle controller 等都由 host composer 显式传入，不能从 transport context 推断。

## 2. 现状分析（以 HEAD `ec0a7f965` 为准）

### 2.1 Host assembly and registration order

API 已有 shared Prisma、CloudAuth、schedule orchestration，但 remaining modules 仍由 package module 在 `register()` 内组装：

- imports 与已迁移 composer 在 `apps/api/src/main.ts:29-67`。
- CloudAuth 在 `apps/api/src/main.ts:120-146` 创建；account closure checker 在 `:126-128`。
- schedule orchestration 先在 `apps/api/src/main.ts:150-174` 组装，然后仅 goal/task 使用 composer（`:175-179`）。
- repository、AI、schedule、remaining constants 在 `apps/api/src/main.ts:180-210` 创建；governance/goal 在 `:211-215` 通过 composer 创建。
- 注册链顺序与当前行为在 `apps/api/src/main.ts:216-244`：governance、account、notification、reminder、repository、schedule、setting、task、AI、goal、data-portability、PowerSync、dashboard。
- `ApiBootstrapper` 仍把 `db` 放进 shared context（`apps/api/src/bootstrap.ts:117-132`），逐个 await `register()`（`:134-146`），最后把 root router mount 到 `/api` 与 `/api/v1`（`:150-155`）。本批只让 migrated handles 忽略 `db`；未迁移 sibling 暂时继续使用它，符合 `apps/api/src/shared/contracts/api-module.ts:68-100` 的过渡契约。

Desktop 是 per-profile runtime：

- module imports 在 `apps/desktop/src/main/main.ts:24-61`。
- profile DB、local vault、schedule orchestration、goal/task composers 在 `apps/desktop/src/main/main.ts:103-178`。
- repository host ports（vault、remote gateway、Git runtime、auto-sync scheduler）在 `apps/desktop/src/main/main.ts:180-226`。
- schedule/account module handles 目前在 `apps/desktop/src/main/main.ts:228-307` 创建，仍有 DB-driven construction；注册顺序在 `:309-324`。
- `ElectronBootstrapper` 明确要求 host 先 compose，再顺序 await `register()`（`apps/desktop/src/main/bootstrap.ts:42-65`），destroy 逆序（`:70-88`）。

### 2.2 API lane module-by-module

#### account

- `packages/account/src/api/module.ts:49-82` 的 `createAccountApiModule()` 在 `register()` 解构 `context.db`（`:55-58`），调用 `createAccountPrismaModule(db, options)`，启动后再注册 `/accounts` routes（`:64-73`）；package singleton `activeAccountModule` 位于 `:47`。
- `createAccountPrismaModule()` 当前创建 account repo、closure-operation repo、CloudAuth revocation adapter、outbox publisher、runtime contributions 与 operation audit（`packages/account/src/server/infrastructure/prisma.ts:30-66`）。
- `AccountModuleDependencies` 的实际需要是 account repo、closure operation、revocation、event publisher、lane capability、runtime、audit（`packages/account/src/server/infrastructure/account.module.ts:25-39`）；API lane 缺少 coordinator ingredients 会 fail-fast（`:92-105`）。
- API host 已有真实 CloudAuth capability（`apps/api/src/main.ts:129-146`），因此目标 composer 必须接收它，不能在 package 内重新创建或从 `context` 隐式读取。

#### data-portability

- `packages/data-portability/src/api/module.ts:29-57` 是 constant；`register()` 从 `context.db` 创建 Prisma module、runtime contribution、server-held disclosure port，启动后 mount `/data-portability`（`:32-50`）；singleton 在 `:19`。
- Prisma ingredient 已把所有跨模块 export repos 直接装配在 `createPrismaDataPortabilityDependencies(db)`（`packages/data-portability/src/server/infrastructure/prisma.ts:35-70`），覆盖 Goal/Task/Reminder/Repository/Schedule/AI/Notification/Setting fields；完整 `DataPortabilityDependencies` shape 在 `packages/data-portability/src/server/application/data-portability.dependencies.ts:112-138`。
- `createDataPortabilityPrismaModule()` 还隐藏 `PrismaDataPortabilityImportStore`（`packages/data-portability/src/server/infrastructure/prisma.ts:73-81`）；其 deep module 明确要求 `exportDependencies` + `importStore`（`packages/data-portability/src/server/infrastructure/data-portability.module.ts:14-39,68-114`）。
- Electron constant 在 `packages/data-portability/src/electron/index.ts:54-88` 内从 `ctx.db` 创建 PowerSync dependencies/import store、启动并安装 EXPORT/IMPORT handlers。
- PowerSync export ingredient 已存在但 nested 于 `packages/data-portability/src/server/infrastructure/powersync/powersync-export-dependencies.ts:368-447`（factory 返回完整 fields）；目标是把该 factory 与 PowerSync import-store factory 提升为公开 ingredient seam，而不是复制 SQL adapters。

#### notification

- API factory 的 context/options shape 仍携带 `closureChecker`、`channelCapabilities`、desktop/push transports（`packages/notification/src/api/module.ts:41-61`）；`register()` 在 `:77-101` 从 `context.db` 调 `createNotificationPrismaModule`，并在 `:69` 使用 singleton。
- Prisma factory 要求 closure checker，创建 notification/preference/template repos、reliable adapter、durable runtime、channel deliverers、audit repository（`packages/notification/src/server/infrastructure/prisma.ts:26-79`）；已有但不完整的 `createNotificationPrismaRepositories()` 只返回三个 repos（`:82-88`）。
- PowerSync factory 在 `packages/notification/src/server/infrastructure/powersync.ts:315-374` 自己创建 repo、durable worker、固定 InApp/Desktop capabilities、PowerSync closure checker；因此 Electron host 无法表达 per-host capability。
- Electron module 在 `packages/notification/src/electron/index.ts:64-109` 暴露 `getNotificationRepository()` accessor，并在 `:95-106` 从 `ctx.db` compose/start；schedule notification port 也在 `:72-90` 直接创建 concrete PowerSync repos。

#### reminder

- `createReminderApiModule()` 在 `packages/reminder/src/api/module.ts:46-96` 读取 `context.db`，自己创建 repo set、cron job/runtime contribution、closure checker 注入 module，随后启动并 mount `/reminders`（`:52-87`）；singleton 在 `:44`。
- Prisma set 已较完整：四个 domain repos、reliable port、transaction runner（`packages/reminder/src/server/infrastructure/prisma.ts:66-75`）；但 `createReminderPrismaModule()` 仍隐藏 snooze rescheduler、reliable、audit（`:39-59`）。
- PowerSync module 在 `packages/reminder/src/server/infrastructure/powersync.ts:63-77` 创建四个 PowerSync repos 与 closure checker；schedule projection/execution sources 已由该文件公开（`:80-94`）。
- Electron module 在 `packages/reminder/src/electron/index.ts:36-52` 暴露 `getReminderTemplateRepository()`，并在 `register()` 从 `ctx.db` compose/start；desktop host 已在 `apps/desktop/src/main/main.ts:132-141` 预先创建 reminder schedule sources。

#### repository

- API module 在 `packages/repository/src/api/module.ts:77-119` 的 `register()` 读取 db，解析 `storageBaseDir`、读取 closure checker，然后调 `createRepositoryPrismaModule()`；host ports 是 storage、closure、githubApp、cloud data purger（`:57-67,89-104`）。
- Prisma factory 目前一次性创建 GitHub connection/projection/attachment/write-request/lease repos、GitHub client、connection/projection/commit services、runtime contribution 与 audit（`packages/repository/src/server/infrastructure/prisma.ts:32-149`），没有独立 repository-set factory。
- deep module 对外依赖仍直接写 concrete service types（`packages/repository/src/server/infrastructure/repository.module.ts:24-45`），必须在 ingredient seam 阶段收窄为 port-shaped interfaces，避免 concrete service 通过类型 declaration 泄漏。
- Electron repository **不是 DB composition**：`packages/repository/src/electron/index.ts:39-79` 只声明 local-vault/remote/reconciliation/sync/scheduler ports，`register()` 只安装 handlers（`:93-126`），destroy 只停止 scheduler、移除 channels（`:307-327`）。因此目标 desktop composer 是 host-port composer，不得凭空新增 PowerSync repository factory。
- Desktop host 已拥有这些 ports，在 `apps/desktop/src/main/main.ts:180-226` 创建并传入 `createRepositoryElectronModule()`；这必须移动到 `compose-repository.ts`，但 local vault/Git runtime 业务保持不变。

#### schedule

- API `createScheduleApiModule()` 在 `packages/schedule/src/api/module.ts:47-106` 内创建 lease coordinator、task repo/runtime contribution、Prisma module，`await start()` 后才构造/mount `/schedules` 与 `/schedules/events`（`:53-97`）；source executor 是显式 option（`:43-49`）。
- Prisma module 需要 schedule、execution、task repos、lease coordinator、delivery-log consumer、runtime contributions、audit（`packages/schedule/src/server/infrastructure/schedule.module.ts:82-96`）。现有 Prisma helper 只分别暴露三个 repo factories，并在 convenience module 内隐藏 lease/consumer/audit（`packages/schedule/src/server/infrastructure/prisma.ts:25-61`）。
- PowerSync 已有三-repo set factory（`packages/schedule/src/server/infrastructure/powersync.ts:23-37`），但 lease repository/coordinator 不在 set 中；convenience module 在 `:43-59` 另行创建它。
- Electron module 在 `packages/schedule/src/electron/index.ts:39-98` 暴露 `getScheduleRepository`, `getScheduleTaskRepository`, `startScheduleRuntime`, `stopScheduleRuntime`，并在 `register()` 从 `ctx.db` 创建 repos/module；destroy 在 `:239-246` 停止 global runtime。
- Desktop schedule runtime 故意延迟到主窗口 ready：`apps/desktop/src/main/lifecycle/window-manager.ts:270-287,304-315` 调 `startScheduleRuntime/stopScheduleRuntime`，profile deactivation 也在 `apps/desktop/src/main/profile/desktop-profile-runtime-manager.ts:333-344` 调 stop。这是本批必须保留并改为 instance-bound controller 的行为。
- Schedule 是唯一需要显式 two-phase host assembly 的剩余模块：orchestration 先需要 `scheduleTaskRepository`（API `apps/api/src/main.ts:150-174`；Desktop `apps/desktop/src/main/main.ts:122-142`），再产生 `sourceExecutor`。因此 Step A 提供 ingredient set，composer 接受 host-created set/runtime，而不隐藏第二个 DB composition root。

#### setting

- API constant 在 `packages/setting/src/api/module.ts:35-60` 从 `context.db` 创建 Prisma module/runtime，启动后 mount `/settings`；singleton 在 `:33`。
- Prisma 已有单 repo factory，但 module factory仍在 `packages/setting/src/server/infrastructure/prisma.ts:16-39` 直接 `new UserSettingPrismaRepository(db)`；PowerSync 也在 `packages/setting/src/server/infrastructure/powersync.ts:10-17` 直接 new。
- Electron constant 在 `packages/setting/src/electron/index.ts:22-89` 从 `ctx.db` compose/start 并安装 six channels。

### 2.3 Electron host-port consumers and accessors

Current `rg` inventory shows the remaining accessor consumers are small but cross-cutting:

- `apps/desktop/src/main/services/dashboard-read-service.ts:10-15,115-143` imports `getScheduleRepository`, `getReminderTemplateRepository`, `getNotificationRepository` and reads them at request time (`:120-122`); Goal/Task have already moved to explicit dependencies (`:32-36`).
- `apps/desktop/src/main/profile/desktop-profile-runtime-manager.ts:4,333-344` and `apps/desktop/src/main/lifecycle/window-manager.ts:21,270-315` import/use schedule start/stop accessors.
- Package accessors are defined at `packages/notification/src/electron/index.ts:64-70`, `packages/reminder/src/electron/index.ts:36-42`, and `packages/schedule/src/electron/index.ts:39-73`.
- `apps/desktop/src/main/main.ts:155-178` already passes Goal/Task repository views to dashboard/analytics; extend that same view to schedule/reminder/notification and pass a bound schedule runtime controller to lifecycle owners.

No other accessor consumer may be assumed away: final inventory must rerun `rg -n "get(Notification|Reminder|Schedule).*Repository|startScheduleRuntime|stopScheduleRuntime" apps packages` and lock the result with a surface spec.

### 2.4 AI status (Electron scope only)

- API `AIApiModule` was created as a `const` in `apps/api/src/main.ts:189-210`, but its factory still composed Prisma/concrete checkpoint adapters inside `register()` (`packages/ai/src/api/module.ts:102-159,233-239`) and mounted routes at `:245-306`; it was **not** transport-only. It was outside this API batch and was not marked done. **Closed by** [2026-08-14-api-ai-composition-root-externalization](2026-08-14-api-ai-composition-root-externalization.md) (Step B rewrote the transport; Step C locked the surface).
- Electron `createAIElectronModule(options)` currently accepts host callbacks (`packages/ai/src/electron/index.ts:75-84`) but still creates the PowerSync module and all service adapters from `ctx.db` inside `register()` (`:90-129`). It also owns all stream/session cleanup (`:518-529`).
- `createAIPowerSyncModule()` currently creates four PowerSync ingredients plus optional ports (`packages/ai/src/server/infrastructure/powersync.ts:41-88`) and re-exports concrete classes at `:91-96`; `packages/ai/src/server/infrastructure/index.ts:38-62` leaks Prisma/PowerSync classes too.
- Desktop host callbacks are already explicit for knowledge persistence/source/analytics/automation (`apps/desktop/src/main/main.ts:161-178`); the composer must evaluate them before creating `createAIElectronModule({ instance })`, while service runtime adapters use the host-owned `getAIServiceRuntimeConfig()` capability currently read at `packages/ai/src/electron/index.ts:90-127`.

### 2.5 Current public barrels and concrete leakage

The following infra barrels export concrete classes and must be cleaned during the surface step: account (`packages/account/src/server/infrastructure/index.ts:9-22`), notification (`packages/notification/src/server/infrastructure/index.ts:15-29`), schedule (`packages/schedule/src/server/infrastructure/index.ts:15-29`), repository (`packages/repository/src/server/infrastructure/index.ts:32-46`), setting (`packages/setting/src/server/infrastructure/index.ts:16-18`), and AI (`packages/ai/src/server/infrastructure/index.ts:38-62`). Account root additionally re-exports `PrismaAccountClosureOperationRepository` (`packages/account/src/index.ts:11-24`). Electron account exports `PowerSyncAccountRepository` (`packages/account/src/electron/index.ts:36-39`), and notification/reminder/schedule export accessors/concrete schedule helpers (`packages/notification/src/electron/index.ts:64-90`, `packages/reminder/src/electron/index.ts:36-42,183-185`, `packages/schedule/src/electron/index.ts:26,39-73`).

The desired public surface is factories + port/set types + runtime contribution factories + `create*Module`; concrete adapter imports may remain package-internal, but not in root or infrastructure barrels consumed by apps.

## 3. 目标设计

### 3.1 Common transport adapter contract

Every migrated `create<Feature>{Api,Electron}Module` will accept an already-created `instance`:

```ts
interface ApiModuleOptions<I> {
  readonly instance: I;
  // feature-specific transport ports only, never db
}

interface ElectronModuleOptions<I> {
  readonly instance: I;
  // feature-specific host ports only, never db
}
```

The implementation must mirror governance's local state and cleanup semantics (`packages/governance/src/api/module.ts:33-63,80-103,127-150`; Electron counterpart `packages/governance/src/electron/index.ts:33-65,89-121,141-149`):

- API: build route objects first; call `instance.start()`; only then mount with `router.use`; record pre-mount `router.stack.length` so a post-start mount failure truncates only this handle's additions. `destroy()` marks disposed before calling `instance.dispose()` and is idempotent.
- Electron: create controller closures from `instance.api`, install handlers while appending each successful channel to `installedChannels`; start only after handler registration; on failure reverse-remove `installedChannels`, best-effort dispose, log dispose error, rethrow original. `destroy()` removes this handle's installed channels, marks disposed, aborts feature-owned streams/timers, then disposes once.
- For Notification custom-renderer channels, the module must not remove channels it did not install; custom notification manager remains owner of its own installation. Add an explicit surface test because current `allChannels` intentionally includes custom channels (`packages/notification/src/electron/index.ts:40-61`).

### 3.2 Deep-module lifecycle normalization

Add the same helper pattern to account, data-portability, notification, reminder, repository and setting modules, and preserve schedule's existing implementation:

```text
created instance
  start(): forward start; push each successful contribution
  on Nth failure: reverse stop startedContributions; clear; started=false; rethrow original
  dispose(): if not started, no-op; otherwise reverse stop and clear
```

Current non-compliant loops are account (`packages/account/src/server/infrastructure/account.module.ts:225-237`), data portability (`packages/data-portability/src/server/infrastructure/data-portability.module.ts:85-98`), notification (`packages/notification/src/server/infrastructure/notification.module.ts:321-343`), reminder (`packages/reminder/src/server/infrastructure/reminder.module.ts:423-436`), repository (`packages/repository/src/server/infrastructure/repository.module.ts:259-271`), and setting (`packages/setting/src/server/infrastructure/setting.module.ts:102-115`). Reminder must await async contributions; schedule already awaits and cleans partial starts (`packages/schedule/src/server/infrastructure/schedule.module.ts:520-552`).

### 3.3 Composer signatures and ingredient shapes

The following are the target interfaces. Names are normative; exact file-local aliases may be chosen only if they preserve these narrow fields.

#### Account

```ts
// apps/api/src/runtime/compose-account.ts
interface ComposeAccountApiDependencies {
  readonly db: PrismaClient;
  readonly cloudAuth: AccountCloudAuthPort; // required host capability
  readonly runtimeContributions?: AccountRuntimeContributionsInput;
}
function composeAccount(deps: ComposeAccountApiDependencies): AccountApiModuleDef;

// apps/desktop/src/main/runtime/compose-account.ts
interface ComposeAccountDesktopDependencies {
  readonly db: IElectronDatabase;
  readonly syncOptions?: DesktopAccountProfileSyncOptions;
  readonly runtimeContributions?: AccountRuntimeContributionsInput;
}
interface ComposedAccountDesktop {
  readonly module: AccountElectronModuleDef;
  readonly repositories: { readonly accountRepository: IAccountRepository };
}
```

`createAccountPrismaRepositories({ db, cloudAuth })` must return account, closure-operation, revocation, event-publisher and audit ports; the composer calls `createAccountModule({ ...set, laneCapability: 'api', runtimeContributions })`. `cloudAuth` is never inferred from API context. Desktop uses `createAccountPowerSyncRepositories(db)` (new set factory), `laneCapability: 'desktop'`, and `instance.accountRepository` for profile sync; `PowerSyncAccountRepository` is removed from Electron public exports. `syncOptions` remains host-owned because its cloud close/profile callbacks are currently built in `apps/desktop/src/main/main.ts:235-307`.

#### Data portability

```ts
interface ComposeDataPortabilityApiDependencies {
  readonly db: PrismaClient;
}
interface ComposedDataPortabilityApi {
  readonly module: DataPortabilityApiModuleDef;
  readonly serverHeldDataDisclosureApi: ServerHeldDataDisclosureApplicationPort;
}
function composeDataPortability(
  deps: ComposeDataPortabilityApiDependencies,
): ComposedDataPortabilityApi;

interface ComposeDataPortabilityDesktopDependencies {
  readonly db: IElectronDatabase;
}
function composeDataPortability(
  deps: ComposeDataPortabilityDesktopDependencies,
): DataPortabilityElectronModuleDef;
```

Expose `createPrismaDataPortabilityDependencies(db)` and `createPowerSyncDataPortabilityDependencies(db)` as typed `DataPortabilityDependencies` ingredient factories, plus `createPrisma/PowerSyncDataPortabilityImportStore` behind a `DataPortabilityImportStore` port (`packages/data-portability/src/server/application/import-store/data-portability-import-store.ts:464-466`). API composer creates the server-held disclosure port (`packages/data-portability/src/server/infrastructure/server-held-data-disclosure.ts:6-16`) and passes it explicitly to `createDataPortabilityApiModule({ instance, serverHeldDataDisclosureApi })`; Electron composer creates PowerSync dependencies/import store.

#### Notification

```ts
interface ComposeNotificationApiDependencies {
  readonly db: PrismaClient;
  readonly closureChecker: (identityId: string) => Promise<boolean>;
  readonly channelCapabilities: readonly ChannelCapabilitySpec[];
  readonly desktopTransport?: unknown;
  readonly pushTransport?: unknown;
}
interface ComposeNotificationDesktopDependencies {
  readonly db: IElectronDatabase;
  readonly channelCapabilities: readonly ChannelCapabilitySpec[];
  readonly desktopTransport?: unknown;
  readonly runtimeContributions?: NotificationRuntimeContributionsInput;
}
interface ComposedNotificationApi {
  readonly module: NotificationApiModuleDef;
  readonly repositories: { readonly notificationRepository: INotificationRepository };
  readonly scheduleNotificationPort: ScheduleNotificationPort;
}
interface ComposedNotificationDesktop {
  readonly module: NotificationElectronModuleDef;
  readonly repositories: { readonly notificationRepository: INotificationRepository };
  readonly scheduleNotificationPort: ScheduleNotificationPort;
}
```

Add complete `NotificationPrismaRepositorySet` and `NotificationPowerSyncRepositorySet`: three domain repos, reliable-operation adapter, audit (Prisma), and the runtime ingredients needed to build durable runtime. Keep `closureChecker` as a host port; PowerSync may offer a separate `createPowerSyncClosureChecker(db)` ingredient, but the composer passes the result explicitly. Create a package-owned `createNotificationRuntimeContribution({ repositories, channelCapabilities, transport })` so host capability selection is visible. API main passes only InApp capability (current explicit policy in `apps/api/src/main.ts:220-233`); Desktop passes InApp + Desktop capabilities and its native transport. Composer also returns the schedule port so schedule orchestration no longer constructs PowerSync concrete repos in `apps/desktop/src/main/main.ts:136-141` or Prisma concrete repos in `apps/api/src/main/main.ts:168-173`.

#### Reminder

```ts
interface ComposeReminderApiDependencies {
  readonly db: PrismaClient;
  readonly closureChecker: (identityId: string) => Promise<boolean>;
  readonly runtimeContributions?: ReminderRuntimeContributionsInput;
}
interface ComposedReminderApi {
  readonly module: ReminderApiModuleDef;
  readonly repositories: { readonly reminderTemplateRepository: IReminderTemplateRepository };
  readonly scheduleExecutionSource: ReminderScheduleExecutionSource;
  readonly scheduleProjectionSource: ReminderScheduleProjectionSource;
}
interface ComposedReminderDesktop {
  readonly module: ReminderElectronModuleDef;
  readonly repositories: { readonly reminderTemplateRepository: IReminderTemplateRepository };
  readonly scheduleExecutionSource: ReminderScheduleExecutionSource;
  readonly scheduleProjectionSource: ReminderScheduleProjectionSource;
}
```

Complete PowerSync set (`template`, `group`, `response`, `user preference`, plus closure checker port); preserve the existing Prisma set's `reliablePort` and `transactionRunner` (`packages/reminder/src/server/infrastructure/prisma.ts:66-74`). Composer creates the module-owned cron/snooze/reliable/audit runtime and returns schedule source ports for orchestration. `closureChecker` remains required and fail-closed; Electron uses the PowerSync closure checker created from its profile DB.

#### Repository

```ts
interface ComposeRepositoryApiDependencies {
  readonly db: PrismaClient;
  readonly storageBaseDir: string;
  readonly closureChecker: (identityId: string) => Promise<boolean>;
  readonly githubApp?: GithubAppConfig;
  readonly knowledgeRepositoryCloudDataPurger?: IKnowledgeRepositoryCloudDataPurger;
}
function composeRepository(deps: ComposeRepositoryApiDependencies): RepositoryApiModuleDef;

interface ComposeRepositoryDesktopDependencies {
  readonly localVaultPort: LocalVaultElectronPort;
  readonly knowledgeRepositoryConnectionPort: KnowledgeRepositoryConnectionElectronPort;
  readonly knowledgeRepositoryReconciliationPort: KnowledgeRepositoryReconciliationElectronPort;
  readonly knowledgeRepositorySyncPort: KnowledgeRepositorySyncElectronPort;
  readonly knowledgeRepositoryAutoSyncScheduler: KnowledgeRepositoryAutoSyncSchedulerElectronPort;
}
function composeRepository(deps: ComposeRepositoryDesktopDependencies): RepositoryElectronModuleDef;
```

Add `createRepositoryPrismaRepositories(db)` returning a named port-shaped set for connection, webhook delivery, note/attachment projections, content cache, write requests, lease and audit. Add `createRepositoryPrismaRuntimeContributions({ repositories, storageBaseDir, closureChecker, githubApp, purger })` returning port-shaped connection/projection/commit services plus runtime contribution; move concrete GitHub client/service construction behind that factory. Change `RepositoryModuleDependencies` from concrete service classes (`packages/repository/src/server/infrastructure/repository.module.ts:24-31`) to narrow application ports. This keeps the deep module interface small while preserving all existing service implementations and fail-closed `githubApp + closureChecker` check (`packages/repository/src/server/infrastructure/prisma.ts:56-62`).

Electron has no `createRepositoryPowerSyncModule` and no PowerSync infrastructure file; therefore do not invent one. The desktop composer owns only the existing host ports and returns `createRepositoryElectronModule({ ports })`.

#### Schedule

```ts
interface ScheduleRepositorySet {
  readonly scheduleRepository: IScheduleRepository;
  readonly scheduleExecutionRepository: IScheduleExecutionRepository;
  readonly scheduleTaskRepository: IScheduleTaskRepository;
  readonly leaseCoordinator: ScheduleLeaseCoordinator;
  readonly auditRepository?: OperationAuditRepository;
}

// Two-phase because orchestration needs scheduleTaskRepository before it creates sourceExecutor.
function createSchedulePrismaRepositories(db: PrismaClient): ScheduleRepositorySet;
function createSchedulePowerSyncRepositories(db: IElectronDatabase): ScheduleRepositorySet;

interface ComposeScheduleDependencies {
  readonly repositories: ScheduleRepositorySet;
  readonly sourceExecutor: ScheduleTaskSourceExecutor;
  readonly runtimeContributions?: ScheduleRuntimeContributionsInput;
  readonly shouldScheduleTask?: (task: ScheduleTask) => boolean | Promise<boolean>;
}
interface ComposedScheduleApi {
  readonly module: ScheduleApiModuleDef;
  readonly repositories: ScheduleRepositorySet;
}
interface ComposedScheduleElectron {
  readonly module: ScheduleElectronModuleDef;
  readonly repositories: ScheduleRepositorySet;
  readonly runtime: { start(): Promise<void>; stop(): Promise<void> };
}
```

The host calls `create*Repositories(db)` first, uses `scheduleTaskRepository` to construct schedule orchestration, then calls `composeSchedule({ repositories, sourceExecutor, runtimeContributions })`. This is an explicit two-phase composer, not hidden assembly; it is required by the verified dependency order in `apps/api/src/main.ts:150-174` and `apps/desktop/src/main/main.ts:122-142`. PowerSync set must include lease coordinator; Prisma set must include delivery-log consumer/audit ingredients. Preserve Desktop delayed scheduler start by returning a bound runtime controller consumed by `WindowManager`/`DesktopProfileRuntimeManager`, while IPC handler registration remains instance-bound.

#### Setting

```ts
interface ComposeSettingApiDependencies {
  readonly db: PrismaClient;
}
interface ComposeSettingElectronDependencies {
  readonly db: IElectronDatabase;
}
function composeSettingApi(deps: ComposeSettingApiDependencies): SettingApiModuleDef;
function composeSettingElectron(deps: ComposeSettingElectronDependencies): SettingElectronModuleDef;
```

Add `createSettingPrismaRepositorySet(db)` and `createSettingPowerSyncRepositorySet(db)` (one `IUserSettingRepository` each), plus `createSettingRuntimeContribution()`; no host cross-module port is needed. Replace constants with instance-bound transport factories.

#### AI (Electron only)

```ts
interface ComposeAIElectronDependencies {
  readonly db: IElectronDatabase;
  readonly knowledgeNotePersistence: IKnowledgeNotePersistencePort;
  readonly knowledgeSourcePort: IKnowledgeSourcePort;
  readonly analyticsReadPort: IAnalyticsReadPort;
  readonly automationToolExecutor: IAIAutomationToolExecutorPort;
  readonly aiServiceRuntimeConfig?: AIServiceRuntimeConfig;
}
function composeAI(deps: ComposeAIElectronDependencies): AIElectronModuleDef;
```

Add `createAIPowerSyncRepositories(db)` with conversation/provider/index/execution-log ports; move service adapter construction currently at `packages/ai/src/electron/index.ts:97-127` into the desktop composer; call `createAIModule({ set, host ports, runtimeContributions })`, then `createAIElectronModule({ instance })`. Stream session handling remains in Electron transport. API AI was a separately tracked follow-up because it was not in this batch scope; **closed by** [2026-08-14-api-ai-composition-root-externalization](2026-08-14-api-ai-composition-root-externalization.md).

### 3.4 Cross-module host wiring decisions

| Capability                 | API composer owner                                                                                    | Desktop composer owner                                                                                                        | Required behavior                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `cloudAuth`                | `composeAccount({ db, cloudAuth })`; `cloudAuth` built in `apps/api/src/main.ts:129-146`              | account `syncOptions` host callbacks, not inferred from Electron auth context                                                 | Cloud revocation remains account port; no second CloudAuth instance                    |
| `closureChecker`           | account-active checker from `apps/api/src/main.ts:126-128` passed to notification/reminder/repository | PowerSync checker built from profile DB and passed explicitly to notification/reminder/account module                         | Missing checker fail-fast/fail-closed as existing factories require                    |
| notification capabilities  | `[InApp, requiredInProduction]` from `apps/api/src/main.ts:220-233`                                   | explicit `[InApp, Desktop]` capability set and native transport                                                               | Never let PowerSync default silently decide host policy                                |
| schedule sources           | reminder/goal/task/notification composers return source ports; orchestration consumes them            | same, with PowerSync variants                                                                                                 | no direct concrete repo creation in `main.ts`                                          |
| repository API             | `storageBaseDir`, closure, GitHub App config, cloud purger from `apps/api/src/main.ts:183-188`        | local vault + remote/reconciliation/sync/auto-sync ports from `apps/desktop/src/main/main.ts:180-226`                         | all ports passed into composer; no `/server` import                                    |
| schedule runtime lifecycle | API starts with module                                                                                | Desktop returns bound `start/stop` controller to window/profile owners                                                        | remove `startScheduleRuntime`/`stopScheduleRuntime` globals and preserve delayed start |
| dashboard/analytics        | n/a                                                                                                   | extend existing Goal/Task repository view (`apps/desktop/src/main/main.ts:155-178`) with schedule/reminder/notification ports | consumers use instance-bound injection only                                            |

### 3.5 Step E documented deviations & residuals

Step E locks the final surface. The following are deliberate, documented
deviations / residuals — recorded here so the batch completion claim stays
precise:

1. **AI service adapters stay on `@memoflow/ai` root.** The desktop composer
   (`apps/desktop/src/main/runtime/compose-ai.ts`) constructs the service
   runtime adapters (`AIService*Adapter`, `AIEvaluationReportFileAdapter`)
   from the host-owned runtime config. These concrete classes are therefore
   exported from the package root — an intentional exception to the
   "factories + port types only" rule. The `DirectProvider*Adapter` legacy
   classes have been REMOVED from the root barrel (they live only in the
   package-internal infra barrel); the governance guard whitelist no longer
   admits them, so any reintroduction fails `package-export-audit`. The AI
   infra barrel kept its concrete Prisma/engine classes too because
   `@memoflow/ai` has no `./server` export map entry (infra barrel is
   package-internal) and the residual API-AI module still composed them inside
   `register()`. The residual was **closed by**
   [2026-08-14-api-ai-composition-root-externalization](2026-08-14-api-ai-composition-root-externalization.md):
   the concrete Prisma re-exports were removed from the infra barrel and the
   transport now consumes the checkpoint pair through the application seam.
2. **API AI was a follow-up residual.** `createAIApiModule()` in
   `packages/ai/src/api/module.ts` still composed Prisma and concrete service
   adapters inside `register()` and read `context.db`. Not marked done in this
   batch; documented in the file header and in `docs/standards/architecture.md`.
   **Closed by** [2026-08-14-api-ai-composition-root-externalization](2026-08-14-api-ai-composition-root-externalization.md).
3. **Repository desktop composer is a host-port composer.** `compose-repository.ts`
   carries the five existing host ports (local vault, remote, reconciliation,
   sync, auto-sync scheduler) and returns `createRepositoryElectronModule`.
   There is deliberately no `createRepositoryPowerSyncModule` / PowerSync infra
   file — do not invent one. Repository has no DB composition in the Electron
   lane.
4. **Schedule is an explicit two-phase composer.** The host calls
   `createSchedule{Prisma,PowerSync}Repositories(db)` once, feeds
   `scheduleTaskRepository` into `createScheduleOrchestrationModule`, then
   passes the SAME set plus the orchestration `sourceExecutor` into
   `composeSchedule`. No second repository set or hidden DB composition root.
   Desktop returns a bound `ScheduleRuntimeController` as the sole start/stop
   owner (delayed until window-ready).
5. **Reminder cron / schedule event-delivery-log consumer — API lane restored,
   desktop-lane deviations.** Both are wired as module-owned runtime
   contributions on the API lane only:
   - The reminder trigger cron is RESTORED to merge-base behavior via
     `createReminderTriggerCronRuntime` (wraps `createReminderTriggerCronJob`
     with start/stop idempotency), prepended in the reminder runtime
     contributions by `apps/api/src/runtime/compose-reminder.ts:168-170`.
   - The schedule `eventDeliveryLogConsumer` is wired through the API lane:
     `createSchedulePrismaRepositories` constructs the
     `ScheduleEventDeliveryLogConsumer` (Prisma `$transaction` idempotent
     consumption) and returns it on `ScheduleRepositorySet`; the API composer
     passes it into `createScheduleModule` (`apps/api/src/runtime/compose-schedule.ts:133`).
   - Desktop deviations (recorded, not silently omitted): the desktop PowerSync
     lane has no cron runtime (its snooze rescheduler has no PowerSync
     counterpart, and merge-base never wired the cron) and never had the
     delivery-log consumer (a Prisma-only consumer; the PowerSync set has no
     such field at merge-base or today). See the explanatory comments in
     `apps/desktop/src/main/runtime/compose-reminder.ts` and
     `apps/desktop/src/main/runtime/compose-schedule.ts`.
6. **Host-used concrete classes remain in root/infra barrels.** apps/api still
   constructs the account closure saga from Prisma: `PrismaAccountClosureOperationRepository`
   (closure checker, `main.ts:122`) and `AccountClosedWorker` (`main.ts:265`)
   on `@memoflow/account` root; `NotificationAccountClosedConsumer` /
   `ReminderAccountClosedConsumer` / `RepositoryAccountClosedConsumer` on the
   `/server` seams. These are documented host-used exports, not new seam leaks.
   Surface specs keep them out of the forbidden-name lists while asserting the
   removed concrete classes (PowerSync repos, notification/schedule PowerSync
   repos, `PowerSyncScheduleTaskRepository`) are gone from root AND infra
   barrels.
7. **Compose-repository imports only the `/electron` seam** (host-port types);
   it never touches the package root — a deliberate exception to the
   "package root + electron seam" composer rule.
8. **`DashboardRepositoryDependencies.scheduleTaskRepository` is carried but
   not consumed.** It remains in the dependency shape for dashboard parity;
   dashboard reads schedule/reminder/notification repos through instance-bound
   injection. Kept as-is to avoid churn; noted for a later cleanup.

## 4. 分步实施步骤

### Step 0 — Baseline, inventory, and no-code gate

**Files:** none beyond this plan. Record output before implementation.

**Inventory commands:**

```bash
git status --short
git rev-parse HEAD
rg -n "create(Account|DataPortability|Notification|Reminder|Repository|Schedule|Setting|AI).*(Prisma|PowerSync|Api|Electron)Module|context\.db|ctx\.db|get(Notification|Reminder|Schedule).*Repository|startScheduleRuntime|stopScheduleRuntime" apps packages
rg -n "from ['\"]@memoflow/.*/server|from ['\"]@memoflow/.*/server/infrastructure" apps/api/src apps/desktop/src/main
```

**Direct verification baseline (never use `pnpm nx run <pkg>:test`; repository guidance and approved plans note it hangs):**

```bash
pnpm nx run account:typecheck && pnpm nx run account:lint
pnpm nx run data-portability:typecheck && pnpm nx run data-portability:lint
pnpm nx run notification:typecheck && pnpm nx run notification:lint
pnpm nx run reminder:typecheck && pnpm nx run reminder:lint
pnpm nx run repository:typecheck && pnpm nx run repository:lint
pnpm nx run schedule:typecheck && pnpm nx run schedule:lint
pnpm nx run setting:typecheck && pnpm nx run setting:lint
pnpm nx run ai:typecheck && pnpm nx run ai:lint
pnpm nx run api:typecheck && pnpm nx run api:lint
pnpm nx run desktop:typecheck && pnpm nx run desktop:lint
for cfg in account data-portability notification reminder repository schedule setting ai; do node node_modules/vitest/vitest.mjs run --config packages/$cfg/vitest.config.ts; done
node node_modules/vitest/vitest.mjs run --config apps/api/vitest.config.ts
node node_modules/vitest/vitest.mjs run --config apps/desktop/vitest.main.config.ts
node node_modules/vitest/vitest.mjs run --config apps/desktop/vitest.ipc.config.ts
```

**Completion gate:** baseline failures are recorded; every accessor/deep-import consumer is named; no implementation starts until the current route/channel and registration order is captured.

### Step A — Ingredient seams for every remaining package (additive, parallel-safe)

This step adds factories and named set types while leaving old convenience factories callable. It must not change runtime behavior. The old convenience factories delegate to the new ingredient + deep-module factory so rollback remains possible.

**Account files:** `packages/account/src/server/infrastructure/prisma.ts`, `powersync.ts`, `account.module.ts`, `infrastructure/index.ts`, `server/index.ts`, `src/index.ts`.

- Add `AccountPrismaRepositorySet` and `AccountPowerSyncRepositorySet`; include closure-operation, CloudAuth revocation, event publisher, audit and `Transactional`/runtime port fields as appropriate.
- Keep `createAccountPrismaModule()` and `createAccountPowerSyncModule()` as delegating convenience roots; ensure `cloudAuth` is a typed port, not a concrete CloudAuth dependency.
- Surface spec asserts API and Desktop sets expose identical port names where lane-capable and no concrete repository class is exported.

**Data-portability files:** `server/infrastructure/prisma.ts`, `server/infrastructure/data-portability.module.ts`, `server/infrastructure/powersync/powersync-export-dependencies.ts`, `server/infrastructure/powersync/powersync-import-store.ts`, barrels.

- Export typed `createPrismaDataPortabilityDependencies`, `createPowerSyncDataPortabilityDependencies`, and import-store factories; keep `DataPortabilityImportStore` as the interface from `server/application/import-store/data-portability-import-store.ts:464-466`.
- Add a public `DataPortabilityRepositorySet` alias for the complete 26-field dependency shape (`data-portability.dependencies.ts:112-138`); no `PowerSync*Adapter` class export.

**Notification files:** `server/infrastructure/prisma.ts`, `powersync.ts`, `notification.module.ts`, runtime factory, barrels.

- Add explicit Prisma/PowerSync sets containing three domain repos, reliable operation port, closure checker port, and durable-runtime ingredients. Make a module-owned runtime contribution factory accept host channel capabilities and transport.
- Preserve current PowerSync default behavior (durable worker, InApp/Desktop deliverers, fail-closed closure checker) by making `createNotificationPowerSyncModule()` delegate to the new set/runtime factories.

**Reminder files:** `server/infrastructure/prisma.ts`, `powersync.ts`, `reminder.module.ts`, barrels.

- Add `ReminderPowerSyncRepositorySet` with all four repositories and closure checker; retain Prisma `reliablePort` and `transactionRunner` fields already present at `prisma.ts:66-74`.
- Export schedule source factories as port factories; no adapter class re-export.

**Repository files:** `server/infrastructure/prisma.ts`, `repository.module.ts`, `server/application/ports/*`, `infrastructure/index.ts`, root.

- Add `RepositoryPrismaRepositorySet` and `createRepositoryPrismaRepositories(db)` for the seven knowledge persistence categories plus audit.
- Introduce narrow service ports for connection/projection/commit operations and make `RepositoryModuleDependencies` consume those ports rather than concrete service classes (`repository.module.ts:24-31`).
- Add `createRepositoryPrismaRuntimeContributions(...)` with an explicit port-shaped return; concrete `GitHubAppClient`, service, Fs adapter and Prisma classes stay implementation-private.

**Schedule files:** `server/infrastructure/prisma.ts`, `powersync.ts`, `schedule.module.ts`, lease files, barrels.

- Add complete `SchedulePrismaRepositorySet` and extend `SchedulePowerSyncRepositories` with lease coordinator/lease repository. Keep existing three repo field names for consumers.
- Add `createScheduleRuntimeContribution` inputs for source executor/shouldScheduleTask; keep delivery-log consumer and audit ownership in API ingredient factory.

**Setting files:** `server/infrastructure/prisma.ts`, `powersync.ts`, `setting.module.ts`, barrels.

- Add one-field `SettingPrismaRepositorySet` and `SettingPowerSyncRepositorySet`; convenience module factories delegate to them and `createSettingRuntimeContribution()`.

**AI files:** `server/infrastructure/powersync.ts`, `ai.module.ts`, `infrastructure/index.ts`, root.

- Add `AIPowerSyncRepositorySet` for conversation/provider/index/execution log. Keep optional host ports out of the set.
- Retain convenience `createAIPowerSyncModule()` as a delegate; remove concrete adapter exports from public barrels and update package-internal imports.

**Verification and independent completion:**

```bash
node node_modules/vitest/vitest.mjs run --config packages/account/vitest.config.ts packages/account/src/server/infrastructure packages/account/src/api
node node_modules/vitest/vitest.mjs run --config packages/data-portability/vitest.config.ts packages/data-portability/src/server/infrastructure
node node_modules/vitest/vitest.mjs run --config packages/notification/vitest.config.ts packages/notification/src/server/infrastructure
node node_modules/vitest/vitest.mjs run --config packages/reminder/vitest.config.ts packages/reminder/src/server/infrastructure
node node_modules/vitest/vitest.mjs run --config packages/repository/vitest.config.ts packages/repository/src/server/infrastructure
node node_modules/vitest/vitest.mjs run --config packages/schedule/vitest.config.ts packages/schedule/src/server/infrastructure
node node_modules/vitest/vitest.mjs run --config packages/setting/vitest.config.ts packages/setting/src/server/infrastructure
node node_modules/vitest/vitest.mjs run --config packages/ai/vitest.config.ts packages/ai/src/server/infrastructure
for p in account data-portability notification reminder repository schedule setting ai; do pnpm nx run $p:typecheck && pnpm nx run $p:lint; done
```

The step is complete only when each old convenience factory still has the same behavior, new set surface specs pass, and no app file needs a concrete adapter import. Do not switch entry points in this step.

### Step B — Instance-bound API/Electron transport factories (all packages)

Implement package transport adapters in small vertical groups, but keep the public target consistent. During the worktree transition, do not merge a package whose host call sites still invoke the old DB-composing signature; each package's factory change and host switch must land in the same verified batch.

**API modules:**

- `packages/account/src/api/module.ts`: `createAccountApiModule({ instance })`; retain only transport context and `cloudAuth`-specific behavior already encoded in the instance. Remove `PrismaClient`, `context.db`, singleton.
- `data-portability/src/api/module.ts`: `createDataPortabilityApiModule({ instance, serverHeldDataDisclosureApi })`; preserve `/data-portability` and logging.
- `notification/src/api/module.ts`: `createNotificationApiModule({ instance })`; `channelCapabilities`, transports and closure checker leave this module entirely.
- `reminder/src/api/module.ts`: `createReminderApiModule({ instance })`; preserve async `register/destroy` and `/reminders`.
- `repository/src/api/module.ts`: `createRepositoryApiModule({ instance })`; retain `getApplicationPort()` as an instance-bound closure because API AI consumed it (`apps/api/src/main.ts:189-205`), but it must never compose or return a package-global. The consumer later became an explicit dependency of `composeAI` in [2026-08-14-api-ai-composition-root-externalization](2026-08-14-api-ai-composition-root-externalization.md).
- `schedule/src/api/module.ts`: `createScheduleApiModule({ instance })`; build both schedule route objects before start, start instance, then mount `/schedules` and `/schedules/events` only after success.
- `setting/src/api/module.ts`: `createSettingApiModule({ instance })`; preserve `/settings`.

**Electron modules:**

- account, data-portability, notification, reminder, schedule, setting: `create<Feature>ElectronModule({ instance, featureHostPorts })`; `ctx.auth` may be used by `withAuthenticated*`, `ctx.db` may not be used for composition.
- repository: change `createRepositoryElectronModule(options)` to an already-host-bound transport factory with no DB option; its options remain the explicit local-vault/remote/scheduler ports in `packages/repository/src/electron/index.ts:39-79`.
- AI: `createAIElectronModule({ instance })`; all service adapter construction moves to `composeAI`, while stream/session handlers and channel cleanup remain in this file.

**Lifecycle specs to add/update for every factory:**

- fake instance and fake router/ipcMain; assert `created -> registered -> disposed`, duplicate register rejection, failed start cleanup, idempotent destroy, original error preservation, no `context.db`/`ctx.db` read for assembly.
- API asserts route factory is called before `start`, `router.use` after successful `start`, and no route remains after failure.
- Electron asserts only channels installed by this handle are removed on failure; dispose error is logged and does not replace original registration error; all installed channels are removed exactly once on destroy.
- Schedule's delayed runtime controller gets a dedicated test: `register()` installs IPC transport without importing a global accessor; controller start/stop is idempotent and profile deactivation stops the same instance.

**Verification:**

```bash
for p in account data-portability notification reminder repository schedule setting ai; do
  node node_modules/vitest/vitest.mjs run --config packages/$p/vitest.config.ts packages/$p/src/api packages/$p/src/electron
done
for p in account data-portability notification reminder repository schedule setting ai; do pnpm nx run $p:typecheck; done
pnpm nx run api:typecheck && pnpm nx run desktop:typecheck
```

**Do-not-break note:** until Step C/D switches all host entry points, leave no exported constant that silently creates a second module instance. Any retained convenience root is for standalone tests/rollback only and must be documented as non-host composition.

### Step C — API composers and API entry switch

Add `apps/api/src/runtime/compose-account.ts`, `compose-data-portability.ts`, `compose-notification.ts`, `compose-reminder.ts`, `compose-repository.ts`, `compose-schedule.ts`, `compose-setting.ts`; update `apps/api/src/main.ts` and composer/surface specs. Apps import only package root/API public seams; no `/server`.

**Assembly order and signatures:**

1. `composeAccount({ db: prisma, cloudAuth, runtimeContributions })` -> account Prisma set -> module instance -> API handle. Pass the exact CloudAuth object created at `main.ts:129-146`.
2. `composeNotification({ db, closureChecker: accountActiveChecker, channelCapabilities: [{ InApp, requiredInProduction: true }] })` -> return module plus schedule notification port.
3. `composeReminder({ db, closureChecker })` -> module plus Prisma schedule execution/projection sources.
4. `composeRepository({ db, storageBaseDir: repositoryStorageBaseDir, closureChecker, githubApp: getGithubAppConfig(), knowledgeRepositoryCloudDataPurger })` -> module; its application port is available to API AI through the existing `getApplicationPort()` handle. API AI later consumed it as an explicit `repositoryApiPort` dependency of `composeAI` in [2026-08-14-api-ai-composition-root-externalization](2026-08-14-api-ai-composition-root-externalization.md).
5. `composeSchedule` uses the two-phase `createSchedulePrismaRepositories(prisma)` set, passes `scheduleTaskRepository` to `createScheduleOrchestrationModule`, then passes orchestration `sourceExecutor`/projection runtime into the bound schedule instance. Do not create a second schedule set.
6. `composeSetting({ db })` -> one repo set -> runtime contribution -> module.
7. `composeDataPortability({ db })` -> complete cross-module export set + Prisma import store + server-held disclosure port -> module.

Keep registration order from `apps/api/src/main.ts:216-244`; replace only the remaining module definitions with bound handles. Schedule orchestration construction must move to the composer/explicit preparation area without changing source wiring. API AI stayed in its current separate path and was listed in the follow-up residual at batch completion; the residual was **closed by** [2026-08-14-api-ai-composition-root-externalization](2026-08-14-api-ai-composition-root-externalization.md).

**Tests and gates:**

```bash
for f in account data-portability notification reminder repository schedule setting; do
  node node_modules/vitest/vitest.mjs run --config apps/api/vitest.config.ts apps/api/src/runtime/compose-$f.spec.ts apps/api/src/runtime/compose-$f.surface.spec.ts
done
node node_modules/vitest/vitest.mjs run --config apps/api/vitest.config.ts apps/api/src/bootstrap.spec.ts apps/api/src/__tests__/integration/express-auth-closure.integration.test.ts apps/api/src/__tests__/integration/account-closure-consumers.integration.test.ts
pnpm nx run api:typecheck && pnpm nx run api:lint
```

Composer specs must mock factories and assert exact object identity/order: repository sets are created once, host ports are passed unchanged, runtime contributions precede host contributions, and each returned API module receives `{ instance }`. Route smoke tests lock `/accounts`, `/data-portability`, `/notifications`, `/reminders`, `/repositories`, `/schedules`, `/schedules/events`, `/settings`; root `/api` and `/api/v1` behavior remains covered by bootstrap.

**Intermediate-step rule:** do not switch a single API module in `main.ts` without its transport factory and composer surface spec. The API lane must remain typecheckable after each module group; use package-by-package commits inside this step if a large all-at-once diff causes a broken intermediate build.

### Step D — Desktop composers, accessor consumer refactor, and entry switch

Add `apps/desktop/src/main/runtime/compose-account.ts`, `compose-ai.ts`, `compose-data-portability.ts`, `compose-notification.ts`, `compose-reminder.ts`, `compose-schedule.ts`, `compose-setting.ts`, `compose-repository.ts`; update `apps/desktop/src/main/main.ts`, lifecycle owners, dashboard/analytics services, and package Electron tests.

**Composer outputs:**

- Account: `{ module, repositories: { accountRepository } }`; pass `syncOptions` from existing host callbacks.
- AI: `{ module }`; build PowerSync set and all four host ports before `createAIElectronModule({ instance })`.
- Data portability: `{ module }`; use complete PowerSync export dependencies and import store.
- Notification: `{ module, repositories: { notificationRepository }, scheduleNotificationPort }`; capabilities are explicit Desktop values.
- Reminder: `{ module, repositories: { reminderTemplateRepository }, scheduleExecutionSource, scheduleProjectionSource }`.
- Schedule: two-phase PowerSync set; return `{ module, repositories: { scheduleRepository, scheduleTaskRepository }, runtimeController }`. The controller is the only schedule start/stop owner.
- Setting: `{ module }` from PowerSync repo set/runtime.
- Repository: `{ module }` from the already-built local-vault, remote, reconciliation, sync and auto-sync ports; no fake PowerSync repository.

Update `registerBusinessModules()` assembly in `apps/desktop/src/main/main.ts:118-226`:

1. Create local vault and raw schedule ingredient set.
2. Create notification/reminder composers so schedule orchestration consumes their returned source/notification ports.
3. Create schedule orchestration using the single schedule-task repository.
4. Compose goal/task (existing reference), then account/data-portability/setting/AI/repository with explicit instances.
5. Replace registration calls at `main.ts:311-324` with `.register(composed.module)` in the same order.

**Accessor consumer refactor:**

- Extend `DashboardRepositoryDependencies` in `apps/desktop/src/main/services/dashboard-read-service.ts:32-36` with schedule, reminder and notification ports; remove imports and reads at `:10-15,120-122`.
- Keep `getDesktopDashboardData(identityId, dependencies)` shape; `registerDashboardIpcHandler` already lazily resolves injected repositories (`apps/desktop/src/main/ipc/dashboard-handler.ts:18-44`), so pass the expanded active view from `main.ts:91-97,155-178,412-421`.
- `DesktopAnalyticsReadAdapter` is already instance-bound (`apps/desktop/src/main/modules/ai/desktop-analytics-read.adapter.ts:8-28`); keep explicit Goal/Task injection and use the expanded dashboard loader.
- Remove `getNotificationRepository`, `getReminderTemplateRepository`, `getScheduleRepository`, `getScheduleTaskRepository`, `startScheduleRuntime`, `stopScheduleRuntime` exports after all consumers are injected. No package-global fallback is permitted.
- Add `WindowManager.setScheduleRuntimeController()` and an equivalent profile-manager callback or dependency. Call the bound controller from the existing transition points (`window-manager.ts:270-287,304-315`) and deactivation (`desktop-profile-runtime-manager.ts:333-344`), then clear it before module destroy. Preserve delayed start/stop timing.

**Electron verification:**

```bash
for p in account ai data-portability notification reminder repository schedule setting; do
  node node_modules/vitest/vitest.mjs run --config packages/$p/vitest.config.ts packages/$p/src/electron
done
node node_modules/vitest/vitest.mjs run --config apps/desktop/vitest.main.config.ts apps/desktop/src/main/profile apps/desktop/src/main/lifecycle apps/desktop/src/main/services apps/desktop/src/main/modules/ai
node node_modules/vitest/vitest.mjs run --config apps/desktop/vitest.ipc.config.ts apps/desktop/src/main/ipc
pnpm nx run desktop:typecheck && pnpm nx run desktop:lint
```

Add behavior tests for every existing IPC channel set, account cloud-close flow, data export/import validation, schedule delayed runtime, dashboard aggregation, and AI stream cancellation. Add a surface spec asserting no Electron module source contains `create*PowerSyncModule(ctx.db)`, `ctx.db` passed to a module factory, or accessor import.

**Do-not-break note:** Desktop typecheck may temporarily fail while a package transport factory and its composer are being switched. Do not leave that state between commits; complete each package's Step B + Step D switch before moving to the next package. The only permitted transitional state is an unmerged local worktree during the same atomic implementation slice.

### Step E — Public surface, docs, and test inventory lock

**Files:** package root/infrastructure/API/Electron barrels for all touched packages; package README files where present; `apps/api/src/runtime/*surface.spec.ts`; `apps/desktop/src/main/runtime/*surface.spec.ts`; new accessor/no-deep-import specs; relevant docs under `docs/standards` and package docs.

**Surface rules:**

- Root exports: `create<Feature>PrismaRepositories`, `create<Feature>PowerSyncRepositories`, `create<Feature>Module`, `create<Feature>RuntimeContribution(s)`, host-port/set types, and `create<Feature>{Api,Electron}Module` via subpaths.
- Remove concrete Prisma/PowerSync repository/service exports from infra barrels cited in §2.5. Internal package files can import concrete implementations by relative path; apps cannot.
- Remove root `PrismaAccountClosureOperationRepository` export and Electron `PowerSyncAccountRepository`/notification/reminder/schedule accessor exports once consumers are injected.
- Keep package.json exports unchanged unless a factory currently has no public path; prefer existing root/API/Electron exports and do not add `/server` for app use.
- Surface specs assert `rg`-equivalent invariants: no app `/server` imports, no API `context.db` composition, no Electron `ctx.db` composition, no concrete class names in root/infrastructure export lists, and no accessor imports.

**Do-not-break note:** remove a concrete export or accessor only after the final consumer inventory is empty and the replacement port/set export has passed its surface spec. Do not use a broad barrel re-export to make an intermediate typecheck pass.

**Documentation:**

- Composer and transport module JSDoc is English-first + 中文, explaining deep module, seam, host capability ownership, ordering and failure semantics.
- Update each touched package README/API/Electron entry comments that currently claim “self-contained Composition Root” (for example notification `packages/notification/src/api/index.ts:5-18`, reminder `packages/reminder/src/api/index.ts:5-20`, AI `packages/ai/src/api/index.ts:5-20`).
- Document repository's explicit many-port decision and schedule's two-phase assembly; document API AI as a remaining follow-up rather than silently omitting it. The API AI follow-up existed at batch completion and was **closed by** [2026-08-14-api-ai-composition-root-externalization](2026-08-14-api-ai-composition-root-externalization.md).
- Regenerate the repository's test inventory using the normal project tool if required by `governance-check`; attach raw command output and final `rg` inventory to the implementation PR.

**Verification:**

```bash
pnpm nx run memoflow:governance-check
pnpm nx run memoflow:docs-check
for p in account ai data-portability notification reminder repository schedule setting; do pnpm nx run $p:typecheck && pnpm nx run $p:lint; done
pnpm nx run api:typecheck && pnpm nx run desktop:typecheck
node node_modules/vitest/vitest.mjs run --config apps/api/vitest.config.ts apps/api/src/runtime
node node_modules/vitest/vitest.mjs run --config apps/desktop/vitest.main.config.ts apps/desktop/src/main/runtime apps/desktop/src/main/services apps/desktop/src/main/profile
node node_modules/vitest/vitest.mjs run --config apps/desktop/vitest.ipc.config.ts apps/desktop/src/main/ipc
```

### Step F — Final definition of done

Only after Steps A-E are green may the plan be considered complete. Archive movement is a separate action; do not mark this active plan done merely because composers compile.

## 5. 验证清单

### Per-step gates

| Gate                | Evidence required                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Step 0 baseline     | all existing failures named; current `rg` accessor/deep-import inventory attached                                                                             |
| Step A ingredients  | every Prisma/PowerSync set is complete and port-shaped; old convenience roots delegate; concrete classes not public                                           |
| Step B transports   | lifecycle specs pass for all handles; route-before-start/route-after-successful-start; Electron installed-channel reverse cleanup; deep partial-start cleanup |
| Step C API          | composer order/object identity specs; API main has no DB-composing remaining transport call for seven modules; routes/OpenAPI/order unchanged                 |
| Step D Desktop      | PowerSync selection only in composers; repository/dashboard/analytics injection; no accessor imports; schedule delayed start preserved                        |
| Step E surface/docs | governance/docs checks green; barrel/export and no-deep-import specs green; bilingual JSDoc and inventory updated                                             |
| Final               | direct Vitest for all touched package/API/Desktop configs plus typecheck/lint; no Nx package test target                                                      |

### Behavior invariance matrix

- API paths: `/accounts`, `/data-portability`, `/notifications`, `/reminders`, `/repositories`, `/schedules`, `/schedules/events`, `/settings`; root `/api` + `/api/v1` still mounted by `ApiBootstrapper` (`apps/api/src/bootstrap.ts:150-155`).
- Electron channels: every existing `Object.values(<Feature>Channels)` registration remains once; payload parsing/auth wrappers/result envelopes unchanged. Custom Notification channels are not removed by a handle that did not install them.
- Account CloudAuth/revocation and desktop cloud-close saga remain host-driven; no silent local fallback.
- Notification API has only InApp required capability; Desktop has explicit InApp/Desktop capability; missing required capability remains fail-closed.
- Reminder schedule source, cron, closure checker, snooze and reliable operation behavior unchanged.
- Repository GitHub App fail-closed check remains (`packages/repository/src/server/infrastructure/prisma.ts:56-62`), storage path resolution remains host-owned (`apps/api/src/main.ts:86,183-188`), and desktop Local Vault/auto-sync lifecycle remains unchanged.
- Schedule lease, event-delivery consumer, source executor, orchestration, delayed Desktop scheduler start and profile stop all use the same repository instance; no duplicate lease/runtime.
- Setting runtime and one repository per lane remain unchanged.
- AI Electron stream sessions abort/clear on destroy (`packages/ai/src/electron/index.ts:518-529`); knowledge and analytics ports are the exact host-provided instances.
- Deep module contributions start in declaration order and stop in reverse; partial start cleans only successfully started contributions and rethrows the first error.

### Final `rg` locks

```bash
rg -n "create(Account|DataPortability|Notification|Reminder|Repository|Schedule|Setting|AI)(Prisma|PowerSync)Module\(.*(context|ctx)\.db|context\.db|ctx\.db" packages/*/src/api packages/*/src/electron
rg -n "get(Notification|Reminder|Schedule).*Repository|startScheduleRuntime|stopScheduleRuntime" apps/desktop/src/main packages/*/src/electron
rg -n "from ['\"]@memoflow/.*/server|from ['\"]@memoflow/.*/server/infrastructure" apps/api/src apps/desktop/src/main
```

Expected result: no migrated transport-side composition, no remaining Electron accessor consumers, and no app `/server` import. The only documented residual was API AI composition in `packages/ai/src/api/module.ts:102-159,233-239`, outside this batch. That residual existed at batch completion and was **closed by** [2026-08-14-api-ai-composition-root-externalization](2026-08-14-api-ai-composition-root-externalization.md).

## 6. 风险与回滚

### Risks

1. **Incomplete set shape**：Data portability has 26 export fields (`data-portability.dependencies.ts:112-138`); schedule needs lease/audit/consumer beyond its existing three-repo PowerSync set; account needs closure/audit ports. Explicit set types and surface tests prevent silent omissions.
2. **Cross-module identity drift**：schedule orchestration must receive the exact schedule-task repository that the schedule module owns; notification/reminder sources must use the same lane DB. Composer tests assert object identity.
3. **CloudAuth leakage**：account may accidentally read `context.cloudAuth` or construct a second auth object. Require `cloudAuth` in `ComposeAccountApiDependencies` and test the exact object pass-through.
4. **Channel capability drift**：PowerSync notification currently hardcodes InApp/Desktop (`notification/powersync.ts:346-360`). Host capability arrays must be explicit and tested per lane.
5. **Repository interface widening**：moving concrete service classes out of the barrel can expose an accidental shallow interface. Use small port interfaces for connection/projection/commit operations; do not pass `PrismaClient` into `RepositoryModuleDependencies`.
6. **Schedule delayed lifecycle regression**：starting scheduler at Electron register instead of window-ready changes behavior. Keep a composer-owned runtime controller and test transition/deactivation ordering.
7. **Partial start leaks**：all non-schedule modules currently set `started=true` only after a forward loop with no partial cleanup. Add failure tests before switching transport factories.
8. **IPC handler ownership**：Notification custom-renderer channels are installed by another manager but included in current destroy list. Track per-handle installs and add an explicit owner test before removing broad cleanup.
9. **Accessor consumer race**：dashboard IPC is registered before profile activation (`apps/desktop/src/main/main.ts:91-97,412-421`). Keep lazy auth/repository getters, but the getter must return the current composer result and be nulled before destroy.
10. **API AI residual confusion**：`const AIApiModule` in main does not mean transport-only. Keep it listed as follow-up so the batch success claim remains precise. This existed at batch completion; the residual was **closed by** [2026-08-14-api-ai-composition-root-externalization](2026-08-14-api-ai-composition-root-externalization.md).

### Targeted rollback

- Step A rollback: switch composer implementation back to the retained `create*PrismaModule`/`create*PowerSyncModule` convenience roots; no schema/data migration is involved.
- Step B rollback: restore the old transport factory signature only for the package being rolled back, then restore its host call site; do not restore package-global accessors as a permanent seam.
- Step C rollback: restore the corresponding `apps/api/src/main.ts` registration expression while retaining additive ingredient factories; rerun the affected package/API direct Vitest configs.
- Step D rollback: restore `main.ts` registration handles and temporarily route dashboard/lifecycle through an explicitly passed compatibility view only if the same commit cannot recover injection; do not use an unbounded module-global repository registry.
- Step E rollback: restore only barrel/documentation exports required by an identified consumer; do not re-export all concrete adapters. No `git reset --hard` or broad checkout.

## 7. 成功标准（checklist）

- [x] API composers for account, data-portability, notification, reminder, repository, schedule and setting own Prisma selection and return instance-bound API handles.
- [x] Desktop composers for account, ai, data-portability, notification, reminder, schedule and setting own PowerSync selection; repository has an explicit host-port composer with no invented DB adapter.
- [x] Every migrated API/Electron module factory accepts an already-bound instance and never composes from `context.db`/`ctx.db`.
- [x] Each deep module has forward/reverse runtime lifecycle and partial-start cleanup; original start errors are preserved.
- [x] Account `cloudAuth`, notification `channelCapabilities`, closure checkers, repository host ports, reminder sources and schedule source executor are explicit composer inputs.
- [x] Schedule two-phase ingredient/composer assembly preserves one repository identity, lease ownership and delayed Desktop runtime start.
- [x] Dashboard, analytics, WindowManager and DesktopProfileRuntimeManager consume instance-bound repository/runtime views; all Electron accessor imports and exports are removed.
- [x] Root and infrastructure barrels expose only factories, runtime contribution factories, port/set types and application surfaces; concrete adapter classes do not leak.
- [x] Route/channel, OpenAPI, auth, payload, result envelope and registration-order behavior is unchanged.
- [x] English-first + 中文 JSDoc, package docs, surface specs and test inventory describe the host-composer ownership model.
- [x] All direct Vitest commands, touched-project typecheck/lint, `pnpm nx run memoflow:governance-check`, and `pnpm nx run memoflow:docs-check` are green.
- [x] Final residual report explicitly names API AI composition as out of this batch; no other unverified residual remains. That residual existed at batch completion and was **closed by** [2026-08-14-api-ai-composition-root-externalization](2026-08-14-api-ai-composition-root-externalization.md).
