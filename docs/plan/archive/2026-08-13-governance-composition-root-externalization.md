---
tags:
  - plan
  - active
  - architecture
  - governance
  - composition-root
description: 将 governance 的宿主装配从 API module register 外移到 API runtime，并以 reference module 形式固定可复制的接线方式
created: 2026-08-13T00:00:00Z
updated: 2026-08-13T00:00:00Z
---

# Governance Composition Root 外移执行方案

## 1. 背景与目标

评审报告指出，API runtime 已在 `apps/api/src/main.ts` 创建数据库、CloudAuth 与跨模块适配器，但 `IApiModule.register(context)` 仍允许 feature package 在注册时创建 Repository、Application 和 runtime listener，形成“外层 runtime + 模块内隐式组合根”的双重 ownership。本次只先改 `packages/governance`，遵守 `AGENT.md` 的 reference module 试点铁律，把治理模块的 Prisma 适配器选择和实例装配移到 `apps/api/src/runtime/compose-governance.ts`。治理业务、HTTP 路由、HTTP/IPC 共用的 `GovernanceApplicationPort`、事件日志内容和 `start/dispose` 语义必须保持不变，并用详细注释把该模式固定成后续模块可照抄的示范。

> **真实代码差异。** 评审报告以 Goal/Task 的 `create*PrismaModule` 为主要例子；当前 governance 已有 transport-neutral 的 `createGovernanceModule(dependencies)`（`packages/governance/src/server/infrastructure/governance.module.ts:114-157`）。因此本计划不重写这个深模块，而是把宿主特定的 Prisma repository/runtime 选择和 API module registration 外移；评审中“模块内 register 直接创建完整 Repo → Service → Controller”的描述对 governance 只部分成立。

## 2. 现状分析：governance 当前组装路径

### 2.1 具体文件与调用链

1. API 进程在 `apps/api/src/main.ts:103-144` 连接共享 `prisma`，并创建 `cloudAuth`；`apps/api/src/main.ts:146-207` 还创建 schedule、repository、AI 等 runtime 级跨模块依赖。
2. `apps/api/src/main.ts:147` 创建 `ApiBootstrapper(prisma, cloudAuth, testEmailLinks)`，然后在 `apps/api/src/main.ts:208-236` 链式注册模块；当前治理入口是 `.register(GovernanceApiModule)`（`main.ts:210`）。
3. `ApiBootstrapper.init()` 在 `apps/api/src/bootstrap.ts:112-127` 组装通用 `IApiModuleContext`（Express app/router、`db`、平台 middleware、OpenAPI registry），并在 `bootstrap.ts:131-141` 顺序调用每个模块的 `register(context)`。
4. 当前 `packages/governance/src/api/module.ts:34-57` 的 `GovernanceApiModule` 是一个 singleton-shaped module definition。`register(context)` 在 `module.ts:38-42` 读取 `context.db`，调用 `createGovernancePrismaModule(db)`，保存为 `activeGovernanceModule`，并立即 `start()`。
5. `createGovernancePrismaModule()`（`packages/governance/src/server/infrastructure/prisma.ts:24-30`）在 package 内选择两个 Prisma adapter：`new RulePrismaRepository(db)` 与 `new RuleRevisionPrismaRepository(db)`（其实现分别位于 `server/infrastructure/adapters/prisma/rule-prisma.repository.ts:46-51`、`rule-revision-prisma.repository.ts:35-39`），同时创建 `createGovernanceEventLogRuntime()`（`server/infrastructure/prisma.ts:28`），再传给 `createGovernanceModule()`。
6. `createGovernanceModule()`（`packages/governance/src/server/infrastructure/governance.module.ts:114-130`）把 repository Port 注入七个 use case，再以 `GovernanceApplicationPort` 作为唯一 callable surface 返回；`start()` 在 `governance.module.ts:134-143` 启动 runtime adapter，`dispose()` 在 `governance.module.ts:145-155` 按逆序停止 runtime adapter，并且两者都是幂等的。
7. API transport 仍由 `packages/governance/src/api/module.ts:44-50` 完成：`registerGovernanceRoutes(governanceModule.api, middleware, openApiRegistry)` 创建 controller/routes，并将路由挂到 `/governance/rules`。因此 controller/route 不创建 Prisma，也不应在本次改动中改变。
8. `ApiBootstrapper.destroy()` 在 `apps/api/src/bootstrap.ts:155-172` 按 API 注册顺序调用每个 module 的 `destroy()`。当前治理 `destroy()`（`packages/governance/src/api/module.ts:53-56`）调用 instance `dispose()` 并清空 singleton 引用。

### 2.2 现状依赖图（谁创建谁）

```text
apps/api/src/main.ts
  ├─ connectDatabase() / shared prisma
  ├─ createCloudAuth(...)
  └─ new ApiBootstrapper(prisma, cloudAuth)
       └─ register(GovernanceApiModule)
            └─ ApiBootstrapper.init() -> GovernanceApiModule.register(context)
                 ├─ context.db  (由 ApiBootstrapper 携带)
                 ├─ createGovernancePrismaModule(db)              [package convenience root]
                 │    ├─ new RulePrismaRepository(db)             [Prisma adapter]
                 │    ├─ new RuleRevisionPrismaRepository(db)     [Prisma adapter]
                 │    ├─ createGovernanceEventLogRuntime()         [runtime adapter]
                 │    └─ createGovernanceModule({ ports, runtime }) [deep module assembly]
                 │         ├─ Create/Update/Delete/Get/List/Search/GetRevisions use cases
                 │         └─ GovernanceApplicationPort (api)
                 ├─ governanceModule.start()
                 └─ registerGovernanceRoutes(api, middleware, openApiRegistry)
                      └─ GovernanceController -> GovernanceApplicationPort
```

**问题边界：** `createGovernanceModule()` 本身已经是小接口、深实现；问题是 API runtime 的 adapter 选择仍隐藏在 package 的 `api/module.ts` 中，`register()` 同时承担 assembly、transport registration 和 lifecycle。`IApiModule` 的全局注释仍明确写着“模块在 register 内完成 Composition Root”（`apps/api/src/shared/contracts/api-module.ts:64-84`），这是评审报告所说的契约与目标设计不一致处。本次只收窄 governance 的 module factory，不立即改写所有 sibling 或删除全局 `context.db`。

## 3. 目标设计

### 3.1 API composer 接口

新增 `apps/api/src/runtime/compose-governance.ts`，提供一个只接受 governance 实际需要的 runtime capability 的窄接口：

```ts
import type { PrismaClient } from '@memoflow/database';
import type { GovernanceModuleInstance } from '@memoflow/governance';
import type { GovernanceApiModuleDef } from '@memoflow/governance/api';

export interface ComposeGovernanceDependencies {
  /** Shared API-lane Prisma client owned by apps/api. */
  readonly db: PrismaClient;
}

export function composeGovernance(
  dependencies: ComposeGovernanceDependencies,
): GovernanceApiModuleDef;
```

实现顺序必须是：

```text
runtime db
  -> createGovernancePrismaRepositories(db)
  -> createGovernanceEventLogRuntime()
  -> createGovernanceModule({ ruleRepository, revisionRepository, runtimeAdapters })
  -> createGovernanceApiModule({ instance })
```

这里的 `db` 是 API runtime 已拥有的 Prisma capability；`CloudAuth` 不参与 governance server assembly，因治理 application/use cases 没有 CloudAuth port；`repositoryStorageBaseDir` 也不属于 governance。不要为了和未来 `compose-goal.ts` 的宽依赖形状一致而引入未使用参数。`composeGovernance()` 返回的应是已绑定 instance 的 `IApiModule` 实现，而不是把 repository 或 Express router 暴露给调用方。

### 3.2 `packages/governance/src/api/module.ts` 的目标接口

将当前无参数常量改为工厂（命名可固定为 `createGovernanceApiModule`），只接受已组装的 instance：

```ts
export interface GovernanceApiModuleOptions {
  readonly instance: GovernanceModuleInstance;
}

export function createGovernanceApiModule(
  options: GovernanceApiModuleOptions,
): GovernanceApiModuleDef;
```

目标 `register(context)` 只做三件事：

1. 从 `context` 读取 `router`、`middleware`、`openApiRegistry`；不读取 `context.db`。
2. 使用 `options.instance.api` 调用 `registerGovernanceRoutes(...)` 并挂载 `/governance/rules`。
3. 按明确的 lifecycle contract 启动 instance（见下文顺序约束），在 `destroy()` 中调用一次 `instance.dispose()`。

推荐生命周期实现是 factory 内维护 `registered`/`started` 状态，而不是 package 级 `activeGovernanceModule` singleton；同一 factory 返回的 module handle 自己拥有 instance，`destroy()` 幂等，重复 register 不会创建第二个 instance。transport registration 失败时，若 `start()` 已发生，必须在 `register()` 的 catch/finally 中调用 `dispose()`，避免 listener 泄漏；更简单的实现是先挂 route、再 `start()`，确保 route 构建失败时没有副作用。无论选择哪种实现，都要用测试固定失败与销毁语义。

### 3.3 与 `IApiModule` 契约的关系

本次不直接破坏 `IApiModule`：`GovernanceApiModuleDef` 继续结构兼容 `IApiModule`（`name`、`register(context)`、可选 `destroy()`），因此 `ApiBootstrapper.register()`、路由双前缀和模块生命周期不变。变化只发生在 governance 的**构造方式**：`apps/api` 先得到 module handle，再注册 handle。

同步更新 `apps/api/src/shared/contracts/api-module.ts:64-84` 的说明文字，将“register 内完成 Composition Root”改成“runtime 先完成 feature assembly；register 负责 transport registration 与 module lifecycle；尚未迁移的 sibling 可暂时使用旧 context”。类型层在后续 Goal/Task 阶段再移除 `db`；本计划不得通过改成 `db?: unknown` 或 `any` 伪造完成。

### 3.4 Electron 复用策略

Electron 仍由 `apps/desktop/src/main/main.ts:274-289` 通过 `ElectronBootstrapper` 注册 `GovernanceElectronModule`；`IElectronModuleContext` 目前只提供 PowerSync 数据库和 auth（`packages/contracts/src/electron/index.ts:42-47`），与 API 的 Prisma 依赖不是同一种 runtime capability。为保持 HTTP/IPC parity，两个宿主都必须调用同一个 transport-neutral `createGovernanceModule()`，只替换 adapter：

```text
API composer:     PrismaClient -> Prisma repositories -> createGovernanceModule -> API transport module
Desktop composer: IElectronDatabase -> PowerSync repositories -> createGovernanceModule -> IPC transport module
```

本次建议同步新增 `apps/desktop/src/main/runtime/compose-governance.ts`（或按现有 desktop runtime 目录落在同等 `runtime` seam），接收 `IElectronDatabase`，调用公开的 `createGovernancePowerSyncRepositories(db)` + `createGovernanceModule(...)`，再将 instance 传给 `createGovernanceElectronModule({ instance })`。`packages/governance/src/electron/index.ts` 只保留 IPC handler registration、`withAuthenticatedValue`、`ipcMain.removeHandler` 和 instance dispose；不再直接调用 `createGovernancePowerSyncModule(ctx.db)`。

如果实施者决定把 Electron 对称迁移拆为后续 commit，必须在本次 API commit 中保留现状并在 PR checklist 标红“Electron 仍是 package 内 convenience root”；不能宣称 composition root 已跨宿主完成。推荐同阶段完成，因为 governance 是 reference module，示范必须同时展示 Prisma/PowerSync 双 adapter 方向。

### 3.5 公开 seam 与导出约束

apps 不能深导入 `@memoflow/governance/server/infrastructure`：`tools/governance/public-surface-audit.mjs:14-16,62-66` 会阻止该路径；`packages/governance/package.json` 当前只公开 `.`, `./api`, `./client`, `./electron`。因此应采用与 `packages/goal/src/server/infrastructure/prisma.ts:55-62`、`packages/task/src/server/infrastructure/prisma.ts:56-63` 相同的公开“抽取 repository factory”模式：

- 在 `packages/governance/src/server/infrastructure/prisma.ts` 新增 `createGovernancePrismaRepositories(db)`，返回 `{ ruleRepository, revisionRepository }`，不公开 `RulePrismaRepository` class 给 API。
- 在 `packages/governance/src/server/infrastructure/powersync.ts` 新增 `createGovernancePowerSyncRepositories(db)`，返回同名 Port shape。
- 在 `packages/governance/src/server/infrastructure/index.ts` 与 `packages/governance/src/server/index.ts` 通过 root barrel 导出这两个 `create*Repositories` 工厂、`createGovernanceEventLogRuntime`、`createGovernanceModule` 及其公开类型；不 re-export 具体以 `Prisma`/`PowerSync`/`Repository` 结尾的 class。`createGovernanceEventLogRuntime` 是可逆的 runtime adapter factory，属于 composition ingredient，不是 concrete adapter class。
- `packages/governance/src/index.ts` 增加两个 `create*Repositories` 工厂的明确 named export；`packages/governance/package.json` 无需新增 `./server`，避免破坏治理文档中“root 只暴露 server composition root”的决定。
- 更新 `packages/governance/README.md`、`docs/governance/QUICK_REFERENCE.md` 与 `docs/governance/DECISIONS.md` 中关于“root 只暴露 `createGovernanceModule()` / API module 内部组合”的过时文字，说明 root 现在同时暴露宿主 composer 所需的 `create*Repositories` ingredient factory；继续禁止 layer-named seam 和具体 adapter class 泄漏。

## 4. 分步实施步骤

### Step 0：建立基线与变更清单

**文件：** 无生产文件；记录本计划引用的现状行号与测试入口。

**执行：**

- 运行 `pnpm nx run governance:typecheck`、`pnpm nx run governance:lint`、`pnpm nx run governance:test`，再用 `pnpm exec vitest run apps/api/src/bootstrap.spec.ts --config apps/api/vitest.config.ts` 固定 API bootstrap 基线（不要给 `nx run api:test` 追加未声明的 `--testPathPattern` 参数）。
- 运行 `pnpm nx run memoflow:governance-check`，保存完整输出。
- 用 `rg` 固定现有 `GovernanceApiModule`、`createGovernancePrismaModule`、`createGovernancePowerSyncModule` 的消费者只有本计划列出的 API/Electron 入口。

**为什么：** 先有可回放的行为和治理基线，后续失败可以区分 wiring 回归与已有问题。

**独立完成标准：** 基线命令全部通过，或每一个已有失败都记录到实施 PR 的 baseline 附件；没有未解释的失败进入 Step 1。

### Step 1：先收窄 governance 的 server ingredient seam

**文件：**

- `packages/governance/src/server/infrastructure/prisma.ts`
- `packages/governance/src/server/infrastructure/powersync.ts`
- `packages/governance/src/server/infrastructure/index.ts`
- `packages/governance/src/server/index.ts`
- `packages/governance/src/index.ts`
- 可能新增 `packages/governance/src/server/infrastructure/__tests__/governance-repositories.surface.spec.ts`

**现状 → 改成：**

- 现状：`createGovernancePrismaModule(db)` 和 `createGovernancePowerSyncModule(db)` 在 package 内同时选择 adapter、创建 runtime、调用 canonical module；API/Electron 只能拿到完整 instance。
- 改成：保留两个 convenience module factory 作为迁移期间的内部复用/回滚点，同时新增 `createGovernancePrismaRepositories(db)`、`createGovernancePowerSyncRepositories(db)`；两个 factory 只实例化各自的 repository 并返回 Port shape。`createGovernancePrismaModule`/`createGovernancePowerSyncModule` 改为委托“repositories factory + `createGovernanceEventLogRuntime()` + `createGovernanceModule()`”，确保旧入口行为不变。
- 根 barrel 只新增 `create*Repositories` named export，不暴露 `RulePrismaRepository`、`RuleRevisionPrismaRepository`、PowerSync class；补双语 JSDoc、`@param`/`@returns` 和 `@internal` 说明。
- 若新 factory 需要公开返回类型，命名为 `GovernanceRepositorySet`，其字段只使用 `IRuleRepository`/`IRuleRevisionRepository`，不要把 Prisma generated row type 带出 seam。

**为什么：** API runtime 需要选择 adapter，但不需要知道 concrete class；这与 Goal/Task 已有的 `create*PrismaRepositories` 模式一致，也保留了治理根入口不泄露技术实现的规则。

**独立验证：** `pnpm nx run governance:typecheck`、`pnpm nx run governance:lint`、`pnpm nx run governance:test`；新增 surface spec 断言两种 factory 返回同名 Port 字段，且现有 convenience module 的 `api/start/dispose` 仍存在。

### Step 2：把 API module 改为“已装配 instance + transport/lifecycle”

**文件：**

- `packages/governance/src/api/module.ts`
- `packages/governance/src/api/index.ts`
- 新增 `packages/governance/src/api/module-lifecycle.spec.ts`（或放在现有 API spec 目录）

**现状 → 改成：**

- 删除 `PrismaClient`、`ServerModuleContext` 和 `createGovernancePrismaModule` import；`GovernanceApiModuleContext` 只保留 `IApiModuleContext` 所需的 transport 形状（推荐 `Pick<ServerModuleContext<unknown>, 'app' | 'router' | 'middleware' | 'openApiRegistry'>`，不得再含 `db`），避免把 `never` 作为伪数据库类型传播到 module seam。
- 删除 package 级 `activeGovernanceModule` singleton。
- 新增 `GovernanceApiModuleOptions { readonly instance: GovernanceModuleInstance }` 与 `createGovernanceApiModule({ instance })`。返回对象的 `register()` 使用 `instance.api` 调用 `registerGovernanceRoutes`，挂载路径保持 `/governance/rules`；不创建 Repository、use case 或 runtime adapter。
- `destroy()` 只对该 factory 闭包中的 instance 调用 `dispose()`，并保持幂等；不要删除 `ipcMain` 或承担 API 以外的资源。
- 为治理 API 工厂补详细双语注释：解释它是 transport adapter，不是 composition root；解释 `api` 是 HTTP/IPC 共用 application seam；解释 start/dispose 的 ownership、失败清理和重复调用语义。
- `packages/governance/src/api/index.ts` 改为导出 `createGovernanceApiModule`、`GovernanceApiModuleOptions`、`GovernanceApiModuleDef`；删除无依赖的 `GovernanceApiModule` 常量导出和“内部完成 Composition Root”的旧文档示例。

**为什么：** composition seam 从 module package 的 register 移到宿主，API module 变成浅但职责单一的 transport/lifecycle adapter；深行为仍在 `GovernanceModuleInstance.api` 后面，HTTP/IPC 继续共享一套 Application Port。

**独立验证：** `pnpm nx run governance:typecheck`、`pnpm nx run governance:lint`、`pnpm nx run governance:test`；新增测试用 fake `GovernanceModuleInstance` 验证 `register()` 不触碰 `db`、路由注册一次、`destroy()` 只调用一次 `dispose()`，并验证 dispose 后 fake runtime 不再收到事件。

### Step 3：新增 API runtime composer 并切换 API 入口

**文件：**

- 新增 `apps/api/src/runtime/compose-governance.ts`
- `apps/api/src/main.ts`
- `apps/api/src/bootstrap.ts`
- `apps/api/src/shared/contracts/api-module.ts`
- 新增 `apps/api/src/runtime/compose-governance.spec.ts`
- 更新 `apps/api/src/bootstrap-module-names.surface.spec.ts` 或新增 `apps/api/src/runtime/compose-governance.surface.spec.ts`

**现状 → 改成：**

- `compose-governance.ts` 导入 `PrismaClient` 类型、`createGovernancePrismaRepositories`、`createGovernanceEventLogRuntime`、`createGovernanceModule` 和 `createGovernanceApiModule`。`composeGovernance({ db })` 按第 3.1 节顺序创建 repositories/runtime/module instance，并返回 `createGovernanceApiModule({ instance })`。
- `apps/api/src/main.ts:29` 把 `GovernanceApiModule` import 改为 `composeGovernance`；在 `bootstrap()` 的 API module assembly 区域创建 `const governanceApiModule = composeGovernance({ db: prisma })`，并把 `.register(GovernanceApiModule)` 改为 `.register(governanceApiModule)`。注册顺序保持 governance 第一项，避免改变现有路由/启动顺序。
- 更新 `main.ts:1-10` 旧注释，删除“模块内部自行管理数据库访问”，写明 API runtime 负责治理 adapter/application assembly，module 只注册 transport/lifecycle。
- `apps/api/src/bootstrap.ts` 的执行逻辑、`ApiBootstrapper` 构造参数、module destroy 顺序不变；只更新 JSDoc/example，不能在这里为治理再创建 instance。
- `apps/api/src/shared/contracts/api-module.ts:64-84` 更新契约注释为新目标方向，并注明当前未迁移 sibling 仍可从 `context.db` 组装；接口字段本身本步不删，以免 Goal/Task 等模块同时破坏。

**为什么：** API runtime 是拥有 Prisma connection 和模块生命周期的最外层宿主；把治理组装放在 `apps/api/src/runtime` 使依赖方向显式，同时将本次 diff 限定在 reference module，不把其他 sibling 的迁移混入。

**独立验证：** `pnpm nx run api:typecheck`、`pnpm nx run api:lint`、`pnpm nx run api:test`、`pnpm nx run api:test:smoke`；`compose-governance.spec.ts` 用 fake Prisma dependency / mocked factory 断言调用顺序；surface spec 断言 `main.ts` 不再导入/注册 `GovernanceApiModule`，并包含 `composeGovernance({ db: prisma })`。

### Step 4：同步 Electron composer，保持 PowerSync/API 对称

**文件：**

- 新增 `apps/desktop/src/main/runtime/compose-governance.ts`（若当前 desktop runtime 目录不接受新文件，则在 `apps/desktop/src/main/main.ts` 的 runtime assembly 邻近位置建立同名局部函数，并在后续整理回 runtime 目录）
- `apps/desktop/src/main/main.ts`
- `packages/governance/src/electron/index.ts`
- `packages/governance/src/electron/index.spec.ts`（新增）
- `packages/governance/src/server/infrastructure/powersync.ts`、相关 barrel
- 可能更新 `apps/desktop/src/main/desktop-electron-contracts-path.surface.spec.ts`

**现状 → 改成：**

- `compose-governance.ts` 接收 `IElectronDatabase`，调用 `createGovernancePowerSyncRepositories(db)`、`createGovernanceEventLogRuntime()`、`createGovernanceModule(...)`，返回 `createGovernanceElectronModule({ instance })`（若不新增 factory，则将已绑定 instance 作为显式参数传给现有 Electron module factory）。
- `packages/governance/src/electron/index.ts:32-92` 删除 `ctx.db` 上的 `createGovernancePowerSyncModule` 调用和 package-level active singleton；保留 channels、controller、`withAuthenticatedValue`、`ipcMain.handle`/`removeHandler`，并由闭包 instance 执行 `dispose()`。
- `apps/desktop/src/main/main.ts:287` 将静态 `GovernanceElectronModule` 改为 `governanceElectronModule = composeGovernance({ db })` 后注册；`.register` 顺序不变。
- IPC handler 的 channel 名称、payload schema、controller method、返回 envelope 不能改变；`GovernanceController` 仍由 `packages/governance/src/server/transport/governance.controller.ts:53-143` 作为 HTTP/IPC 共用的 transport adapter。

**为什么：** Electron 的 runtime capability 是 PowerSync，不是 Prisma；复用的是同一个 `createGovernanceModule` 和 Application Port，不是把 API 的 Prisma adapter 带到桌面。这样治理才真正示范“双宿主、双 adapter、单 application seam”。

**独立验证：** `apps/desktop/project.json` 当前没有 `typecheck` target，因此使用 `pnpm nx run governance:typecheck` 覆盖共享 governance 类型、`pnpm nx run desktop:lint`、`pnpm nx run desktop:test:main`（IPC 相关时再加 `pnpm nx run desktop:test:ipc`）。新增 IPC lifecycle spec 验证所有 governance channels 注册/移除、同一 instance 被 controller 使用、dispose 后事件 listener 停止。

### Step 5：补齐文档、契约与治理 surface 检查

**文件：**

- `packages/governance/README.md`
- `docs/governance/QUICK_REFERENCE.md`
- `docs/governance/DECISIONS.md`
- `docs/standards/architecture.md`（只修正 composition root ownership 描述）
- `tools/governance/package-export-audit.mjs`（仅在新公开 subpath 确有必要时修改；推荐不新增 `./server`）
- `packages/governance/src/server/infrastructure/__tests__/governance-composition-root.surface.spec.ts`
- `apps/api/src/runtime/compose-governance.surface.spec.ts`

**现状 → 改成：**

- governance README/速查卡把“`api/module.ts` 内部完成 Composition Root”改成“runtime composer 选择宿主 adapter；`server/infrastructure/governance.module.ts` 组装 Port→use case→application facade；API/Electron module 只做 transport/lifecycle”。
- `DECISIONS.md` 保留“root 不暴露具体技术命名工厂”的原则，但补充：`createGovernancePrismaRepositories` / `createGovernancePowerSyncRepositories` 是宿主装配所需的 abstract ingredient factory，不是 concrete adapter surface。
- surface specs 固定：`apps/api` 只从 `@memoflow/governance` 和 `/api` 公开 seam 导入；不存在 `@memoflow/governance/server/infrastructure` 深导入；`packages/governance/src/api/module.ts` 不出现 `PrismaClient`、`context.db`、`createGovernancePrismaModule`；Electron module 不出现 `ctx.db` 组合调用。

**为什么：** governance 是活文档；如果代码已迁移但 README、JSDoc 和治理脚本仍描述旧 ownership，下一次模块迁移会重新复制旧模式。

**独立验证：** `pnpm nx run governance:lint`、`pnpm nx run governance:typecheck`、`pnpm nx run governance:test`、`pnpm nx run api:test`、`pnpm nx run memoflow:docs-check`、`pnpm nx run memoflow:governance-check`。

### Step 6：完成定义与移交

**文件：** 本计划文件及实施 PR 变更清单。

**执行：**

- 对照第 7 节逐项勾选；把每个命令的原始结果、测试文件、未执行原因写入 PR 描述。
- 若 Electron 被拆到后续 commit，必须把“API 已外移、Electron 尚未外移”的残余明确记录，不得把计划标记为完成。
- 只有在 governance API、Electron 两个宿主均使用 runtime composer，且 `governance-check` 通过后，才允许开始 Goal/Task 阶段。

**独立完成标准：** 所有成功标准满足；没有未解释的行为差异、未 dispose 的 listener 或绕过 public seam 的 import。

## 5. 验证清单

### 5.1 每步门禁与期望结果

| 阶段                   | 命令                                                                                                                   | 期望结果                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Step 0 基线            | `pnpm nx run governance:typecheck`                                                                                     | 治理源码无 TypeScript 错误                                                                                                 |
| Step 0 基线            | `pnpm nx run governance:lint`                                                                                          | governance lint 通过，无新增 warning/error                                                                                 |
| Step 0 基线            | `pnpm nx run governance:test`                                                                                          | 现有 domain/application/API route/surface tests 全部通过                                                                   |
| Step 0 基线            | `pnpm nx run api:test`                                                                                                 | `bootstrap.spec.ts` 与 API tests 通过                                                                                      |
| Step 1 repository seam | `pnpm nx run governance:test`                                                                                          | Prisma/PowerSync factory 与旧 convenience factory 行为一致                                                                 |
| Step 2 API module      | `pnpm nx run governance:test`                                                                                          | route registration、fake instance lifecycle、dispose 幂等通过                                                              |
| Step 3 API runtime     | `pnpm nx run api:typecheck`                                                                                            | composer、module factory、公开 exports 类型闭合                                                                            |
| Step 3 API runtime     | `pnpm nx run api:lint`                                                                                                 | `apps/api/src/runtime` 与 main 注释/导入符合 lint                                                                          |
| Step 3 API runtime     | `pnpm nx run api:test`                                                                                                 | bootstrap 双前缀、模块注册、destroy 顺序无回归                                                                             |
| Step 3 API runtime     | `pnpm nx run api:test:smoke`                                                                                           | API smoke 可启动并访问治理健康/路由链路                                                                                    |
| Step 4 Electron        | `pnpm nx run governance:typecheck`                                                                                     | governance PowerSync composer、Electron module factory 与共享 instance 类型闭合；desktop app 当前没有独立 typecheck target |
| Step 4 Electron        | `pnpm nx run desktop:lint`                                                                                             | desktop runtime/module 代码通过 lint                                                                                       |
| Step 4 Electron        | `pnpm nx run desktop:test:main`                                                                                        | desktop main bootstrap 与治理 module lifecycle 通过                                                                        |
| Step 4 Electron        | `pnpm nx run desktop:test:ipc`                                                                                         | IPC channels 注册、调用和移除通过                                                                                          |
| Step 5 surface         | `pnpm nx run memoflow:governance-check`                                                                                | JSDoc、package export、public surface、server shape 等审计全部通过                                                         |
| Step 5 docs            | `pnpm nx run memoflow:docs-check`                                                                                      | 计划 frontmatter、文档入口和目录规则通过                                                                                   |
| 最终组合               | `pnpm nx run governance:test && pnpm nx run api:test && pnpm nx run desktop:test:main && pnpm nx run desktop:test:ipc` | governance、API、desktop main/IPC 四条测试车道均绿                                                                         |

### 5.2 行为不变检查

- API 仍由 `ApiBootstrapper` 先注册 Governance，再注册其他模块；`/api/governance/rules` 和 `/api/v1/governance/rules` 双前缀仍可用。
- Governance route path、middleware、OpenAPI registry、Zod validation、response envelope 不变；只改变 instance 的创建地点。
- `GovernanceApplicationPort` 的七个方法和 `ExecutionContext` 入参不变；`GovernanceController` 不新增 Prisma/PowerSync 依赖。
- Prisma path 继续使用 `RulePrismaRepository.saveWithRevision()` 的单事务语义；PowerSync path 继续使用原有 SQLite transaction/mapper 行为；本次不改 SQL、mapper、domain rule 或错误码。
- event-log runtime 的七个 event name、handler 文案、start 幂等和 reverse stop 顺序不变；dispose 后再次 publish 不应触发治理日志。
- Electron IPC channels、auth wrapper、controller method 和 `ipcMain.removeHandler` 数量不变。

## 6. 风险与回滚

### 6.1 行为变化点

- **实例 ownership 变化：** 以前 `register()` 首次调用时创建 instance；之后 composer 创建并把 instance 绑定到 module handle。必须保证 composer 只调用一次，module handle 只注册一次，避免重复 event listener。
- **启动时机：** 推荐 route wiring 成功后再 `instance.start()`；若 start 失败，module factory 必须把已注册 route 视为 app init 失败，由 `ApiBootstrapper` 抛错并触发外层 shutdown，不得留下半活跃 instance。
- **dispose 语义：** `GovernanceModuleInstance.dispose()` 只在 `start()` 成功后 stop runtime；API/Electron module 的 `destroy()` 可能被 bootstrapper 调用多次，必须保持幂等并清理闭包引用。API `ApiBootstrapper` 当前按注册顺序 destroy（`bootstrap.ts:155-172`），Electron `ElectronBootstrapper` 按逆序 destroy（`apps/desktop/src/main/bootstrap.ts:68-86`）；本次不要改两个 bootstrapper 的全局顺序。
- **失败注册：** API module 在 route registration 或 start 抛错时，需执行一次 best-effort dispose；测试要覆盖该路径，防止 event-bus subscription 泄漏到后续 Vitest case。

### 6.2 依赖顺序风险

- `composeGovernance({ db })` 必须在 `.register(...)` 前执行；不要把 composer 放进 `register(context)` 或 `ApiBootstrapper.init()`。
- `db` 是 `connectDatabase()` 完成后可用的共享 client，但当前 API 允许 limited mode（`main.ts:103-116`）；若治理 composer 在数据库连接失败时仍被创建，Prisma adapter 的首次 query 才会失败。实施时保持当前 bootstrap 行为和错误策略，不新增“静默内存治理”分支。
- Governance 不依赖 CloudAuth、schedule orchestration、repository storage；不要把这些 capability 通过宽 options 传入，避免隐含顺序和测试负担。
- `createGovernancePrismaRepositories` 与 `createGovernancePowerSyncRepositories` 必须返回相同 Port shape，确保 transport/application 不知道宿主技术。

### 6.3 回滚

1. 若 Step 1 失败：保留新增 factory 但不切换调用方，恢复 `createGovernancePrismaModule(db)`/`createGovernancePowerSyncModule(db)` 的原调用；删除未通过的 surface spec 或修正后再继续，不改 domain/application。
2. 若 Step 2/3 失败：将 `apps/api/src/main.ts` 恢复为 `.register(GovernanceApiModule)`，把 `packages/governance/src/api/module.ts` 恢复到调用 `createGovernancePrismaModule(context.db)` 的版本；不需要数据库迁移或数据回滚。
3. 若 Step 4 失败：API composer 变更可独立保留；Electron 恢复 `GovernanceElectronModule` 内的 `createGovernancePowerSyncModule(ctx.db)`，并在 PR 中记录 Electron residual，避免回滚 API 已验证的 seam。
4. 任何回滚后重新运行 `pnpm nx run governance:test`、`pnpm nx run api:test`、`pnpm nx run desktop:test:main`、`pnpm nx run desktop:test:ipc`（若涉及 Electron）和 `pnpm nx run memoflow:governance-check`；禁止用 `git reset --hard` 或覆盖用户无关改动。

## 7. 成功标准

- [x] 新增 `apps/api/src/runtime/compose-governance.ts`，其接口只接受 `db: PrismaClient`，并明确按“adapter → repository set → application instance → API module”顺序组装。
- [x] `packages/governance/src/api/module.ts` 不再 import `PrismaClient`、不再读取 `context.db`、不再创建 repository/use case/runtime；只接受 `GovernanceModuleInstance`，注册 routes 并拥有该 instance 的 dispose。
- [x] API `main.ts` 使用 `composeGovernance({ db: prisma })`，Governance 仍保持原注册顺序和双 API 前缀行为；`bootstrap.ts` 不承担 governance assembly。
- [x] Electron 通过 PowerSync composer 复用同一 `createGovernanceModule()`/`GovernanceApplicationPort`；HTTP 与 IPC 只替换 persistence adapter，不复制业务逻辑。
- [x] `GovernanceApplicationPort`、controller、route、DTO/schema、event names、SQL/mapper、错误语义和 lifecycle observable behavior 零变化。
- [x] 具体 `RulePrismaRepository`/`PowerSyncRuleRepository` class 没有泄漏到 apps public import；仅公开命名清晰的 `create*Repositories` ingredient factory，所有 public surface/export audit 通过。
- [x] governance 相关新增/修改文件包含详细 English-first + 中文 JSDoc，公开 factory 有 `@param`/`@returns`，具体 adapter 仍标记 `@internal`；README/Quick Reference/Decision 与实现一致。
- [x] `pnpm nx run governance:typecheck`、`governance:lint`、`governance:test`、`api:typecheck`、`api:lint`、`api:test`、`api:test:smoke`、`desktop:lint`、`desktop:test:main`、`desktop:test:ipc`、`pnpm nx run memoflow:governance-check` 和 `pnpm nx run memoflow:docs-check` 全部通过；desktop 当前没有独立 `typecheck` target，治理共享源码类型由 `governance:typecheck` 覆盖。
- [x] 只有上述标准全部满足，才把本计划从 `docs/plan/active` 移入 archive，并开始 `goal、task` 的下一阶段迁移。
