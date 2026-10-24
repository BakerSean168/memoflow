---
tags:
  - plan
  - active
  - data-portability
  - contracts
description: data-portability contracts 收口与模块化重构详细方案
created: 2026-06-05T00:00:00
updated: 2026-06-05T00:00:00
---

# Data Portability Contracts 收口与模块化重构方案

## 1. 背景

当前 `package/data-portability` 的 contracts 代码已经出现三类明显失衡：

1. **ownership 错位**
   - 共享契约放在 `packages/data-portability/src/contracts/portable-schema.ts`。
   - 这违反了 ADR-010 的 single source of truth：共享类型应进入 `packages/contracts`。

2. **文件职责混杂**
   - 一个 `portable-schema.ts` 同时承载：
     - API request/response schema
     - 导入导出文件 envelope schema
     - 各业务模块 portable DTO schema
     - 递归安全校验 helper
   - 当前文件约 600 行，已经超出“按契约类型组织”的可维护范围。

3. **重复真值与弱类型扩散**
   - `packages/data-portability/src/application-server/portable-types.ts` 又手写了一套 `PortableUserDataV1`、`UserDataExportEnvelopeV1`、`ExportableModule`。
   - `controller.ts` 仍使用 `Result<unknown>`。
   - `import-user-data.use-case.ts` 仍存在 `raw as UserDataExportEnvelopeV1`。
   - `application-client` / `api` / `infrastructure-client` 都通过 feature-local contracts 取共享类型，分层语言不干净。

此外，当前 data-portability contracts 的目录形状也没有贴齐仓库主 contracts 包的模块惯例。用户补充要求的 `domain/`、`protocol/` 应该补上，而且应按 **goal 模块的真实结构** 对齐，而不是机械凑目录。

## 2. 目标

本次重构目标不是“搬文件”，而是把 data portability 契约整理成一个可以长期维护的 contracts 模块。

### 2.1 必达目标

- 把 data portability 的共享契约迁移到 `@memoflow/contracts/data-portability`
- 将现有大文件按职责拆分为多个 contracts 文件
- 引入与 `goal` 模块一致的 `domain/events` 与 `protocol` 结构
- 删除 `portable-types.ts` 中重复的 public contract 类型
- 让 `application-client`、`api`、`application-server`、`infrastructure-client` 全部依赖统一 contracts 出口
- 消除 `Result<unknown>`、`raw as ...` 这类弱类型链路

### 2.2 明确不做

- 不升级 `schemaVersion`
- 不修改现有 HTTP route
- 不修改现有 envelope `kind`
- 不在本次里做 portable file value normalization
- 不在本次里扩展新的业务能力
- 不为了“参考 goal 模块”而硬塞 `aggregates/`、`entities/`、`value-objects/` 等空目录

## 3. 当前问题清单

### 3.1 错位的 contracts ownership

当前共享契约实际散落在以下位置：

- `packages/data-portability/src/contracts/portable-schema.ts`
- `packages/data-portability/src/application-server/portable-types.ts`

这直接导致：

- contracts 不在共享包里
- feature 包同时维护 schema 和 interface 两套公共 shape
- consumer 很难判断哪里才是真正的公开契约

### 3.2 大文件混装

`portable-schema.ts` 当前混了四种层次：

- `ExportUserDataReqSchema` / `ImportUserDataReqSchema`
- `PortableGoalDataSchema` / `PortableTaskDataSchema` / `PortableAIDataSchema` 等 portable payload schema
- `UserDataExportEnvelopeSchema`
- `isBannedPortableDataKey()` / `validateEnvelope()` 这类 rule/helper

这会导致：

- API DTO 和导出文件 DTO 混在一起
- 规则 helper 无法被清晰归类
- 后续新增模块只能继续往大文件里堆

### 3.3 双源真值

`portable-types.ts` 和 `portable-schema.ts` 存在一一对应的重复定义：

- `UserDataExportEnvelopeV1`
- `PortableUserDataV1`
- `ExportableModule`
- export/import 结果摘要 shape

风险很直接：

- schema 变了，interface 可能没变
- 测试只测 schema，不代表运行时使用的 interface 一定一致
- 重构时很容易“改了一半”

### 3.4 弱类型与 unsafe cast

当前弱点集中在三处：

- `DataPortabilityUseCases` 只返回 `Promise<Result<unknown>>`
- controller 和 transport handler 没有把 export/import response 类型一直传到边界
- `ImportUserDataUseCase` 先校验，再把原始 `raw` 强转成 `UserDataExportEnvelopeV1`

这说明 contracts 虽然存在，但没有真正成为 interface 的唯一测试面。

### 3.5 与主 contracts 模块风格不一致

`goal` 模块当前真实结构是：

```text
packages/contracts/src/modules/goal/
  aggregates/
  api/
  domain/
    events/
      *.event.ts
      index.ts
  dtos/
  entities/
  protocol/
    goal-rpc-map.ts
    goal-event-map.ts
    index.ts
  rules/
  value-objects/
  index.ts
```

其中与本次最相关的是：

- `domain/events/`：事件类型文件 + `index.ts`
- `protocol/`：`*-rpc-map.ts`、`*-event-map.ts`、`index.ts`
- 模块 `index.ts` 直接 `export * from './domain/events'`，而不是额外加一个空的 `domain/index.ts`

因此 data-portability 也应该采用同样的真实形状：

- 有 `domain/events/`
- 有 `protocol/`
- 不新增无意义空目录和空 barrel

## 4. 目标结构

### 4.1 `packages/contracts` 中新增 data-portability 模块

新增目录：

```text
packages/contracts/src/modules/data-portability/
  api/
    export-user-data.dto.ts
    import-user-data.dto.ts
    index.ts
  dtos/
    exportable-module.dto.ts
    portable-common.dto.ts
    portable-settings.dto.ts
    portable-goals.dto.ts
    portable-tasks.dto.ts
    portable-reminders.dto.ts
    portable-repositories.dto.ts
    portable-schedules.dto.ts
    portable-editor.dto.ts
    portable-ai.dto.ts
    portable-user-data.dto.ts
    portable-envelope.dto.ts
    index.ts
  domain/
    events/
      user-data-exported.event.ts
      user-data-import-dry-run-validated.event.ts
      user-data-imported.event.ts
      index.ts
  protocol/
    data-portability-rpc-map.ts
    data-portability-event-map.ts
    index.ts
  rules/
    import-safety.ts
    index.ts
  index.ts
```

### 4.2 结构设计原则

- `api/` 只承载 transport-level request/response schema 和 type
- `dtos/` 只承载 portable file 的数据 shape
- `domain/events/` 只承载 data portability 领域事件类型
- `protocol/` 只承载 RPC map 和 event map
- `rules/` 只承载共享校验规则与 envelope parse helper
- 模块 `index.ts` 统一对外导出 `domain/events`、`protocol`、`api`、`dtos`、`rules`

### 4.3 不新增 `domain/index.ts`

这里必须明确：

- `goal` 模块当前没有 `domain/index.ts`
- data-portability 应保持一致
- 正确做法是保留 `domain/events/index.ts`，并由模块根 `index.ts` 导出 `./domain/events`

这是“参考 goal 模块”的真实落位，不是表面化模仿。

## 5. 每个文件夹的具体内容

## 5.1 `api/`

### `export-user-data.dto.ts`

职责：

- 定义导出请求/响应 schema 与类型

包含：

- `ExportUserDataReqSchema`
- `ExportUserDataReq`
- `ExportUserDataResSchema`
- `ExportUserDataRes`

约束：

- `include` 依赖 `ExportableModuleSchema`
- `summary` 的 shape 不重复内联，复用 `dtos/portable-envelope` 或独立 summary DTO

### `import-user-data.dto.ts`

职责：

- 定义导入请求/响应 schema 与类型

包含：

- `ImportUserDataReqSchema`
- `ImportUserDataReq`
- `ImportUserDataResSchema`
- `ImportUserDataRes`

### `api/index.ts`

统一导出：

- export dto
- import dto

## 5.2 `dtos/`

这是本次拆分的主体。

### `exportable-module.dto.ts`

包含：

- `ExportableModuleSchema`
- `ExportableModule`
- `ALL_EXPORTABLE_MODULES`

说明：

- 当前 `ExportableModule` 是 transport 与 use case 共同依赖的公共枚举，应从这里统一输出

### `portable-common.dto.ts`

包含：

- `PortableRefSchema`
- `IsoDateStringSchema`
- envelope 共享子结构，例如 scope schema

### 各业务模块 portable DTO 文件

分别拆成：

- `portable-settings.dto.ts`
- `portable-goals.dto.ts`
- `portable-tasks.dto.ts`
- `portable-reminders.dto.ts`
- `portable-repositories.dto.ts`
- `portable-schedules.dto.ts`
- `portable-editor.dto.ts`
- `portable-ai.dto.ts`

每个文件只放本模块 portable schema 和 inferred type。

示例职责：

- `portable-goals.dto.ts`
  - `PortableGoalFolderSchema`
  - `PortableKeyResultSchema`
  - `PortableGoalReviewSchema`
  - `PortableGoalSchema`
  - `PortableGoalRecordSchema`
  - `PortableFocusSessionSchema`
  - `PortableFocusModeSchema`
  - `PortableGoalDataSchema`

- `portable-tasks.dto.ts`
  - `PortableTaskFolderSchema`
  - `PortableTaskTemplateSchema`
  - `PortableTaskInstanceSchema`
  - `PortableTaskDependencySchema`
  - `PortableTaskDataSchema`

### `portable-user-data.dto.ts`

职责：

- 组合各模块 data schema

包含：

- `PortableUserDataV1Schema`
- `PortableUserDataV1`

### `portable-envelope.dto.ts`

职责：

- 封装最终文件 envelope

包含：

- `UserDataExportEnvelopeV1Schema`
- `UserDataExportEnvelopeV1`

如果导出结果 summary 需要单独抽类型，也放在这里或共享 summary dto 中，不再在 API DTO 和 runtime types 中各写一份。

### `dtos/index.ts`

统一导出所有 portable DTO 与组合 schema。

## 5.3 `domain/events/`

这里按 `goal` 模块的方式放事件类型文件，每个事件一个文件。

### 最小事件集合

建议落三类事件：

1. `user-data-exported.event.ts`
2. `user-data-import-dry-run-validated.event.ts`
3. `user-data-imported.event.ts`

### 事件 payload 设计

#### `UserDataExportedEvent`

建议字段：

- `identityId`
- `requestedModules`
- `fileName`
- `entityCounts`
- `warnings`

#### `UserDataImportDryRunValidatedEvent`

建议字段：

- `identityId`
- `batchId`
- `created`
- `updatedSingletons`
- `skipped`
- `warnings`

#### `UserDataImportedEvent`

建议字段：

- `identityId`
- `batchId`
- `created`
- `updatedSingletons`
- `skipped`
- `warnings`

说明：

- 这些事件是 contracts 结构对齐的一部分
- 本次不要求同步实现 runtime event bus 发布
- 但事件类型必须落到位，保证 `protocol/data-portability-event-map.ts` 不是空壳

### `domain/events/index.ts`

按 `goal` 模块方式逐个 re-export type。

## 5.4 `protocol/`

### `data-portability-rpc-map.ts`

作用：

- 与 `goal-rpc-map.ts` 一样，定义 transport request/response 对

内容：

```ts
export type DataPortabilityRpcMap = {
  'data-portability:export': [ExportUserDataReq, ExportUserDataRes];
  'data-portability:import': [ImportUserDataReq, ImportUserDataRes];
};
```

要求：

- 所有 request/response 类型从 `../api` 导入
- 不在 map 里内联类型

### `data-portability-event-map.ts`

作用：

- 与 `goal-event-map.ts` 一样，定义领域事件键到 payload type 的映射

内容建议：

```ts
export type DataPortabilityEventMap = {
  'data-portability:exported': UserDataExportedEvent;
  'data-portability:import-dry-run-validated': UserDataImportDryRunValidatedEvent;
  'data-portability:imported': UserDataImportedEvent;
};
```

### `protocol/index.ts`

与 `goal` 模块一致，只 re-export type：

- `DataPortabilityRpcMap`
- `DataPortabilityEventMap`

## 5.5 `rules/`

这部分不是 goal 模块强制要求，但对 data portability 是必要的。

### `import-safety.ts`

放以下共享规则与 helper：

- `BANNED_IMPORT_FIELD_NAMES`
- `BANNED_IMPORT_KEY_PATTERN`
- `isBannedPortableDataKey`
- `findBannedImportKey`
- `parseUserDataExportEnvelope`

这里的 `parseUserDataExportEnvelope` 是本次替代 `validateEnvelope + cast` 的关键 helper。

建议返回值：

```ts
type ParseUserDataExportEnvelopeResult =
  { ok: true; envelope: UserDataExportEnvelopeV1 } | { ok: false; error: string };
```

这样 `ImportUserDataUseCase` 可以直接消费 typed envelope，而不是重新 cast 原始对象。

## 6. 模块根导出设计

`packages/contracts/src/modules/data-portability/index.ts` 采用与 `goal` 一致的导出顺序：

```ts
// ============ Domain Events ============
export * from './domain/events';

// ============ Protocol ============
export * from './protocol';

// ============ API ============
export * from './api';

// ============ DTOs ============
export * from './dtos';

// ============ Rules ============
export * from './rules';
```

这里不补 `aggregates`、`entities`、`value-objects`，因为当前模块没有这类真实契约资产。  
目录结构应该服务当前模块深度，不应为形式对齐制造空接口。

## 7. `packages/contracts` 的配套变更

需要同步修改以下文件：

### `packages/contracts/package.json`

新增：

```json
"./data-portability": {
  "types": "./dist/modules/data-portability/index.d.ts",
  "import": "./dist/modules/data-portability/index.js"
}
```

### `packages/contracts/tsup.config.ts`

新增 entry：

- `src/modules/data-portability/index.ts`

### `packages/contracts/README.md`

补充子路径说明：

- `@memoflow/contracts/data-portability`

## 8. `packages/data-portability` 的迁移方案

## 8.1 删除 feature-local contracts 源码

删除：

- `packages/data-portability/src/contracts/portable-schema.ts`

不保留兼容层，不保留 mirror 文件，不保留二次出口。

原因：

- 仓库内引用面当前仍可一次性收口
- 保留兼容层只会延长双源真值生命周期

## 8.2 收缩 `portable-types.ts`

当前文件既有 runtime helper，也有 public DTO。

重构后应拆成 runtime-only 文件，建议命名：

- `portable-runtime.ts`

只保留：

- `RefAllocator`
- `RefMap`
- `ExportContext`
- `ImportContext`

移除：

- `PortableUserDataV1`
- `UserDataExportEnvelopeV1`
- `ExportableModule`
- `ExportResult`
- `ImportResult`

这些都统一改为从 `@memoflow/contracts/data-portability` 读取。

## 8.3 修改所有 consumer 导入

需要收口的主要位置：

- `src/application-client/index.ts`
- `src/infrastructure-client/adapters/types.ts`
- `src/infrastructure-client/adapters/http/data-portability-http.adapter.ts`
- `src/infrastructure-client/adapters/ipc/data-portability-ipc.adapter.ts`
- `src/api/controller.ts`
- `src/api/routes.ts`
- `src/api/transport-handlers.ts`
- `src/electron-entry/index.ts`
- `src/application-server/use-cases/import-user-data.use-case.ts`
- `src/application-server/sanitize.ts`
- 相关测试文件

统一原则：

- request/response/envelope/portable DTO 只从 `@memoflow/contracts/data-portability` 导入
- runtime context/ref allocator 从本包 runtime 文件导入

## 9. 类型链路收口

## 9.1 controller / use case / adapter 全链路强类型

把当前 `Result<unknown>` 改成精确类型：

- `exportUserData(): Promise<Result<ExportUserDataRes>>`
- `importUserData(): Promise<Result<ImportUserDataRes>>`

需要修改：

- `DataPortabilityUseCases`
- `DataPortabilityController`
- `createDataPortabilityTransportHandlers`
- `DataPortabilityClientPort`
- `IDataPortabilityApiClient`
- HTTP / IPC adapter 实现

## 9.2 移除 unsafe cast

当前：

- `validateEnvelope(raw)` 后
- `const envelope = raw as UserDataExportEnvelopeV1`

目标：

- 用 `parseUserDataExportEnvelope(raw)` 直接返回 typed envelope
- 后续 use case 不再接触未类型化的 `raw`

## 10. `domain/events` 与 `protocol` 的落地边界

这里需要先定边界，避免出现“目录有了，内容是空的”。

### 10.1 本次必须落地的内容

- `domain/events/*.event.ts` 类型文件
- `domain/events/index.ts`
- `protocol/data-portability-rpc-map.ts`
- `protocol/data-portability-event-map.ts`
- `protocol/index.ts`

### 10.2 本次不强制要求

- 运行时真正 publish 这些 event
- 引入新的 event bus 依赖
- 在 data-portability use case 中立刻写事件发布逻辑

也就是说，本次先把 contracts module 结构和 interface 完整落下，runtime 采用现有实现，不在这个切片里引入额外基础设施。

## 11. 关于 schema 强化的具体策略

当前 schema 里大量字段是 `z.unknown()` 或 `z.string()`。

### 11.1 本次原则

- **不做 wire-format 升级**
- **不强行把所有字符串字段替换成现有模块 canonical enum**

原因：

- 当前 portable 文件与测试数据里存在：
  - `Active`
  - `active`
  - `ACTIVE`
  - `Moderate`
  - `moderate`
- 直接替换成现有 contracts enum，极可能把“结构重构”变成“协议破坏”

### 11.2 本次允许保留的 opaque JSON

以下类型继续允许是 `unknown`，但必须集中在对应模块 DTO 文件里表达，不再散落：

- `settings.preferences`
- notification preference 复杂 payload
- `goal.progress`
- `task.goalBinding`
- `task.checklist`
- `task.timeConfig`
- `task.recurrenceRule`
- `task.reminderConfig`
- `task.completionRecord`
- `task.skipRecord`
- `repository.config`
- `repository.metadata`
- `schedule.schedule`
- `schedule.execution`
- `schedule.retryPolicy`
- `schedule.metadata`
- `editor.layout`
- `editor.settings`
- `editor.viewState`

### 11.3 本次可以立即收紧的字段

以下类型不应继续退化：

- `_ref`
- `xxxRef`
- `createdAt` / `updatedAt` / `recordedAt`
- `enabled`
- `priority`
- `sortOrder`
- `tags`
- `fileName`
- `dryRun`
- `entityCounts`
- `warnings`

## 12. 实施步骤

## 阶段 1：建立 contracts 模块骨架

- 在 `packages/contracts/src/modules/` 下新增 `data-portability/`
- 创建 `api/`、`dtos/`、`domain/events/`、`protocol/`、`rules/`
- 新建模块 `index.ts`
- 补 `package.json` subpath
- 补 `tsup.config.ts` entry
- 补 `README.md`

交付标准：

- `@memoflow/contracts/data-portability` 可以被 source import 解析

## 阶段 2：迁移 public contract 内容

- 把 `portable-schema.ts` 中 request/response schema 移入 `api/`
- 把 envelope 和各模块 portable schema 移入 `dtos/`
- 把 banned-key 规则和 parse helper 移入 `rules/`
- 建立 `domain/events/` 与 `protocol/`

交付标准：

- 新 contracts 模块能独立承载全部共享契约
- `packages/data-portability/src/contracts` 不再是 source of truth

## 阶段 3：收缩 runtime-only types

- 把 `portable-types.ts` 改为 runtime-only 文件
- 删除其中所有重复的 public DTO/interface
- 所有 use case 改从 contracts 读 public type

交付标准：

- runtime helper 与 shared DTO 不再混装

## 阶段 4：改 consumer 引用

- 批量替换 feature-local contracts 导入
- 改 controller / adapter / use case 返回类型
- 改 `sanitize.ts`
- 改测试

交付标准：

- 仓库中不再存在对 `packages/data-portability/src/contracts/portable-schema.ts` 的依赖

## 阶段 5：移除 unsafe cast

- 新增 typed `parseUserDataExportEnvelope`
- `ImportUserDataUseCase` 直接使用 typed parse 结果

交付标准：

- 不再出现 `raw as UserDataExportEnvelopeV1`

## 阶段 6：跑验证并清理残留

- 删除废弃文件
- 确认 build output 与 public exports 一致
- 跑 contracts/data-portability/web 相关验证

## 13. 测试方案

### 13.1 `packages/contracts`

新增或迁移以下测试：

- request schema parse
- response schema parse
- `PortableUserDataV1Schema` strict unknown key rejection
- `UserDataExportEnvelopeV1Schema` parse
- nested banned-key rejection
- `parseUserDataExportEnvelope` success/failure
- `DataPortabilityRpcMap` type usage smoke coverage
- `DataPortabilityEventMap` type usage smoke coverage

### 13.2 `packages/data-portability`

保留并迁移现有测试：

- schema/import validation tests
- electron module tests
- HTTP / IPC adapter tests

新增关注点：

- controller 返回 `Result<ExportUserDataRes>` / `Result<ImportUserDataRes>`
- `ImportUserDataUseCase` 不再 cast raw object
- runtime file只保留 context/ref allocator

### 13.3 下游消费验证

至少跑：

```text
pnpm nx run contracts:test
pnpm nx run contracts:typecheck
pnpm nx run data-portability:test
pnpm nx run data-portability:typecheck
pnpm nx run data-portability:build
pnpm nx run web:typecheck
```

如本轮涉及 desktop runtime contract，也补：

```text
pnpm nx build desktop
```

## 14. 验收标准

满足以下条件才算完成：

1. `packages/data-portability/src/contracts/portable-schema.ts` 已删除
2. `@memoflow/contracts/data-portability` 成为唯一共享 contracts 出口
3. data-portability contracts 具备：
   - `api/`
   - `dtos/`
   - `domain/events/`
   - `protocol/`
   - `rules/`
4. `domain/events` 与 `protocol` 不是空目录，且有实际事件类型与 map 文件
5. data-portability 模块根 `index.ts` 按 goal 模块风格导出 `domain/events` 和 `protocol`
6. 不新增空的 `domain/index.ts`
7. `portable-types.ts` 不再持有公共 DTO 真值
8. `Result<unknown>` 链路已消除
9. `raw as UserDataExportEnvelopeV1` 已消除
10. contracts、data-portability、至少一个下游 consumer 的类型检查与测试通过

## 15. 风险与处理

### 风险 1：结构重构误伤 wire format

处理：

- 本次不变更 envelope kind、schemaVersion、route path
- 不引入 value normalization
- 先迁移结构，再考虑协议演进

### 风险 2：把 goal 模块“学成空目录模板”

处理：

- 只对齐真实有意义的层级：`domain/events`、`protocol`
- 不复制 `aggregates/entities/value-objects` 空壳

### 风险 3：重复类型删不干净

处理：

- 以 `rg` 全仓搜索 `PortableUserDataV1`、`UserDataExportEnvelopeV1`、`ExportableModule`
- 确保只剩 contracts module 和 runtime context 文件中的最小必要类型

## 16. 建议提交切分

1. `contracts: scaffold data-portability module with api/dtos/domain-events/protocol`
2. `contracts: move portable schemas and safety helpers out of data-portability`
3. `data-portability: consume shared contracts and shrink runtime types`
4. `data-portability: remove unsafe casts and Result<unknown> chain`
5. `tests: migrate contracts and consumer coverage to new subpath`

这样每个提交都能独立解释，不会把“模块结构整理”和“行为变更”混成一个巨型提交。

## 17. 最终决策

本次按以下决策执行：

- data portability 的共享契约迁入 `@memoflow/contracts/data-portability`
- contracts 结构采用接近 `goal` 模块的真实形状
- 必须补 `domain/events/` 与 `protocol/`
- 不新增空 `domain/index.ts`
- 运行时 feature 包只保留 runtime context/helper，不再持有 public contract 真值
- 本次重构不改变 V1 文件格式和 transport surface

这版方案的核心不是“把文件挪过去”，而是把 data-portability 从一个 feature 内大脚本，收口为一个有清晰 seam、明确 interface、可持续演进的 contracts 模块。
