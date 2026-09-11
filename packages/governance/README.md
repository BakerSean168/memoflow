# @memoflow/governance

> **ADR-110 protected reference feature:** 本包永久保留为 MemoFlow 的可执行架构参考模块，并在 development / diagnostic 场景中真实提供编码规范管理能力。不得把它当成临时示例或 Knowledge migration residue 删除。

治理模块（活文档）— 当前仓库的参考模块。它展示的是目标架构，而不是历史兼容结构：公共 contracts 集中、public seam 收敛、服务端内部统一为 `server/*` 切片。

## 公开 seam

```text
@memoflow/contracts/governance
@memoflow/contracts/mocks

@memoflow/governance
@memoflow/governance/api
@memoflow/governance/client
@memoflow/governance/electron
```

## 模块职责

- `@memoflow/contracts/governance`：治理公共契约唯一真值源
- `@memoflow/governance`：规范化服务端组合根 + 宿主装配 ingredient factory（create*Repositories / createGovernanceEventLogRuntime）
- `@memoflow/governance/api`：HTTP API 模块
- `@memoflow/governance/client`：Web / Desktop renderer 客户端 seam
- `@memoflow/governance/electron`：Desktop main 入口

## 内部结构标准

```text
packages/governance/src/
├── api/                    # HTTP module 与 resource-first routes
├── client/                 # renderer client seam
├── electron/               # desktop main seam
├── server/
│   ├── domain/             # 聚合根、实体、仓储接口、值对象
│   ├── application/        # commands / queries / GovernanceApplicationPort
│   ├── transport/          # controller 与 transport 翻译
│   └── infrastructure/     # adapters / runtime / composition root / seed
└── index.ts                # canonical server composition root public entry
```

## 明确不再保留的公开层

- `@memoflow/governance/domain-shared`
- `@memoflow/governance/domain-server`
- `@memoflow/governance/domain-client`
- `@memoflow/governance/application-client`
- `@memoflow/governance/infrastructure-client`
- `@memoflow/governance/electron-entry`
- `@memoflow/governance/mocks`

## 关键收敛点

- 公共契约只保留在 `packages/contracts`
- former `domain-shared` + `domain-server` 合并为 `server/domain`
- former `controllers` 收敛为 `server/transport`
- 模块运行时副作用归位到 `server/infrastructure/runtime`
- root 暴露规范化组合根工厂 `createGovernanceModule()` 与宿主装配所需的 ingredient factory（`createGovernancePrismaRepositories` / `createGovernancePowerSyncRepositories` / `createGovernanceEventLogRuntime`）；具体 adapter class 与技术命名模块工厂（`createGovernancePrismaModule` / `createGovernancePowerSyncModule`）仍留在包内
- governance IPC channel / payload 统一收口到 `@memoflow/contracts/governance/protocol`
- UI display logic 不放在治理包内，app 层自行派生展示模型

## Composition ownership

治理的宿主装配（composition）由两个 runtime composer 完成，而不是由 `api`/`electron` module 在 register 内隐式组合：

- **API lane composer**：`apps/api/src/runtime/compose-governance.ts`（Prisma）。选择 Prisma adapter → `createGovernancePrismaRepositories(db)` → `createGovernanceEventLogRuntime()` → `createGovernanceModule(...)` → `createGovernanceApiModule({ instance })`。
- **Desktop lane composer**：`apps/desktop/src/main/runtime/compose-governance.ts`（PowerSync）。选择 PowerSync adapter → `createGovernancePowerSyncRepositories(db)` → `createGovernanceEventLogRuntime()` → `createGovernanceModule(...)` → `createGovernanceElectronModule({ instance })`。
- 两个宿主复用同一个 transport-neutral 的 `createGovernanceModule()` / `GovernanceApplicationPort`，只替换持久化 adapter，从而从构造上保证 HTTP/IPC 行为一致。
- `api` / `electron` module 只是 transport + lifecycle 适配器：只做路由 / IPC handler 注册与 instance 的 start/dispose，不创建 Repository、use case 或 runtime adapter。
- RefArch Phase 6：`GovernanceApiModuleDef` 显式继承共享 `ServerModuleHandle<ServerTransportModuleContext>`；注册上下文仅含 transport（无 `db`），`instance` 由 composer 注入且必填。治理作为 governance-first 试点，先于其它 feature 锁定该契约。

## 活文档定位

> `governance` 的代码结构本身就是仓库治理标准。
>
> 新模块开发时，应优先对齐这套 `api/client/electron/server/*` 结构，而不是继续复制旧的 layer-named seam、模块内公共 contracts 或 UI domain-client 特例。

## Reference feature executable invariants

`GOV-1901` 把 ADR-110 的 reference responsibility 固化为可执行契约，而不是只依赖本文档：

- Rule CRUD/search、Draft → Active → Deprecated → Active lifecycle 与 `RuleRevision` append-only audit 必须保持行为测试；
- Prisma 与 PowerSync 必须把同一 Rule/RuleRevision 恢复为等价领域状态，并保持 search/filter 语义一致；
- HTTP 与 IPC 必须经过同一 contracts validation 与 `GovernanceApplicationPort`，返回等价 Result/failure contract；
- API/Desktop host composer 负责选择 Prisma/PowerSync adapter，`api` / `electron` transport module 不允许重新内嵌 composition；
- `src/reference-module-invariants.surface.spec.ts` 会直接核对 package exports、host composer、Vue list/detail/editor/history surface 与 README/QUICK_REFERENCE，防止 gold-standard 文档和真实包形状漂移。

因此，当全仓库引入新的 feature architecture pattern 时，Governance 的这组 gate 应先变绿，再把相同模式推广到复杂业务模块。
