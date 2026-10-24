---
tags:
  - plan
  - active
  - data-portability
  - desktop
  - powersync
description: Desktop 端用户数据导入导出详细实现方案
created: 2026-06-03T23:10:00
updated: 2026-06-04T10:15:00
---

# Desktop 端用户数据导入导出详细实现方案

## 0. 执行状态（2026-06-04）

代码实现和自动化门禁已完成：

- Desktop main 已注册真实 `DataPortabilityElectronModule`。
- Desktop renderer 已通过 `DATA_PORTABILITY_SERVICE_KEY` 提供 IPC-backed data portability service。
- Electron IPC handler 已使用共享 Zod contract 校验 payload，并通过 authenticated IPC wrapper 返回结构化 `Result`。
- Desktop export 已从当前 profile 的 PowerSync 本地库读取业务数据。
- Desktop import 已通过 `PowerSyncDataPortabilityImportStore` 写入当前 profile 的 PowerSync 本地库。
- API import 已通过 `PrismaDataPortabilityImportStore` 保持 Web/API 路径可用。
- Import store 已保留 portable `createdAt`/`updatedAt` 字段，按 PowerSync snake_case 写入 `created_at`/`updated_at`。
- Schedule task import 已恢复 `schedule` / `execution` / `retryPolicy` 字段，不再丢失 scheduler 状态。
- Reminder response import 已使用 import 阶段生成的新 ID。
- PowerSync export projection 已覆盖 PowerSync row 的 JSON、boolean、alias 字段和 goal children。

已验证通过：

```text
pnpm nx run data-portability:lint
pnpm nx run data-portability:typecheck
pnpm nx run data-portability:test
pnpm nx run data-portability:build
pnpm nx build api
pnpm nx build desktop
pnpm nx run app-vue:typecheck
pnpm nx run memoflow:governance-check
```

补充说明：

- `pnpm nx build desktop` 仍会打印既有的 `GoalDAGVisualization.vue` declaration warning 和 chunk-size warning，但 target 退出码为 0。
- 本轮未执行 GUI 手工 click-through；第 11.4 节 Desktop 手工验证清单仍需在真实 profile 会话中执行。

## 1. 背景

当前 `feat/user-data-portability-v1` 分支已经实现了 Web/API 路径的用户数据导入导出能力，并且移除了之前不可用的 `data-portability` Electron IPC 假入口。

实施前状态：

- Web 端可以通过 HTTP adapter 调用 `/api/v1/data-portability/export` 和 `/api/v1/data-portability/import`。
- `packages/app-vue` 设置页已经有 `useDataPortability()`，并支持在 service 不存在时隐藏全量导入导出入口。
- Desktop 主进程暂未注册 `@memoflow/data-portability/electron-entry`。
- Desktop renderer 暂未提供 `DATA_PORTABILITY_SERVICE_KEY`，因此不会展示全量用户数据导入导出按钮。

本方案目标是在 Desktop 端实现真实可用的本地用户数据导入导出，而不是恢复一个会抛错的 IPC surface。

相关主计划：

```text
docs/plan/active/2026-06-03-user-data-portability-v1.md
```

## 2. 核心判断

Desktop 端不能直接复用当前 API module。

原因：

- API module 使用 `PrismaClient` 和 Prisma repositories 组装 `ExportUserDataUseCase` / `ImportUserDataUseCase`。
- Desktop module context 提供的是 `IElectronDatabase`，也就是 PowerSync-backed 本地 SQL 接口。
- 当前 `ImportUserDataUseCase` 直接依赖 `PrismaClient.$transaction`，importers 直接调用 `tx.goal.create()`、`tx.repository.create()`、`tx.userSetting.upsert()` 这类 Prisma delegate。
- 强行把 API module 接入 Desktop 会出现类型绕过和运行时不可靠问题。

因此 Desktop 实现需要两层改造：

1. 导出读取：为 `DataPortabilityDependencies` 增加 PowerSync 实现。
2. 导入写入：把 `ImportUserDataUseCase` 从 Prisma delegate 解耦，改为依赖中立的 import store，再分别实现 Prisma store 和 PowerSync store。

## 3. 目标

- Desktop 设置页显示“导出全部用户数据”和“导入全部用户数据”入口。
- Desktop 导出从当前 profile 的 PowerSync 本地数据库读取当前登录用户数据。
- Desktop 导入把 JSON 文件中的数据写入当前 profile 的 PowerSync 本地数据库。
- Desktop 导入仍遵守 append-create-like 语义：
  - 不清空已有数据。
  - 不覆盖业务实体。
  - 为业务实体生成新 ID。
  - 当前用户单例偏好执行 upsert。
- Desktop 不导出认证、账号、token、session、API key、PowerSync 内部状态。
- Desktop 端导入导出使用真实 IPC handler，不能注册后抛“请使用 HTTP”。
- Web/API 路径继续保持可用。

## 4. 非目标

- 不在本阶段实现二进制资源打包。
- 不做复杂冲突合并。
- 不做服务端同步状态恢复。
- 不导出 local profile 元数据、PowerSync bucket/checkpoint、auth session。
- 不把 Desktop 导出改成 HTTP fallback。
- 不一次性重构所有模块领域仓储。

## 5. 架构方案

### 5.1 目标结构

建议新增和调整以下文件：

```text
packages/data-portability/src/
  application-server/
    import-store/
      data-portability-import-store.ts
      prisma-data-portability-import-store.ts
    use-cases/
      import-user-data.use-case.ts
      importers/
        *.importer.ts
  infrastructure-server/
    powersync/
      export-dependencies.ts
      powersync-data-portability-import-store.ts
      sql.ts
      index.ts
  electron-entry/
    index.ts
  infrastructure-client/
    adapters/ipc/
      data-portability-ipc.adapter.ts
```

同时调整：

```text
packages/data-portability/package.json
packages/data-portability/tsup.config.ts
apps/desktop/package.json
apps/desktop/src/main/main.ts
apps/desktop/src/renderer/platform/di-app.ts
packages/app-vue/src/modules/setting/composables/useDataPortability.ts
```

### 5.2 分层边界

推荐边界：

| 层                                | 责任                                                        |
| --------------------------------- | ----------------------------------------------------------- |
| `contracts`                       | 请求/响应 DTO、portable schema、envelope validation         |
| `application-server`              | export/import use case、projection、refMap、import ordering |
| `application-server/import-store` | 中立写入 port 和 Prisma implementation                      |
| `infrastructure-server/powersync` | Desktop PowerSync read/write adapters                       |
| `api`                             | API composition root，只组装 Prisma                         |
| `electron-entry`                  | Electron composition root，只组装 PowerSync                 |
| `infrastructure-client/http`      | Web/API client adapter                                      |
| `infrastructure-client/ipc`       | Desktop renderer IPC client adapter                         |

核心原则：

- `application-server` 不直接 import Electron。
- `application-server` 不直接写 PowerSync SQL。
- `infrastructure-client` 不 import server application layer。
- Desktop IPC handler 必须真实执行 use case。

## 6. 导出设计

### 6.1 复用现有 export use case

`ExportUserDataUseCase` 当前依赖 `DataPortabilityDependencies`，这是适合 Desktop 的抽象。

需要新增：

```ts
export function createPowerSyncDataPortabilityDependencies(
  db: IElectronDatabase,
): DataPortabilityDependencies;
```

### 6.2 PowerSync export dependencies

可以优先复用现有 PowerSync repositories：

| 模块         | 可复用来源                                                 | 说明                                                |
| ------------ | ---------------------------------------------------------- | --------------------------------------------------- |
| goal         | `@memoflow/goal/api` 暴露的 PowerSync repositories         | `findByIdentityId(..., { includeChildren })` 已存在 |
| task         | `@memoflow/task/api` 暴露的 PowerSync repositories         | 需确认 dependency repository 是否完整导出           |
| reminder     | `@memoflow/reminder/api` PowerSync repositories            | 已有 template/group/response/preference             |
| repository   | `@memoflow/repository/api` PowerSync repositories          | repository/folder/resource 可复用                   |
| notification | `@memoflow/notification/api` PowerSync repositories        | preference 可复用                                   |
| setting      | `@memoflow/setting/api` 或 infrastructure export           | user setting 可复用                                 |
| editor       | `@memoflow/editor/api` 或 direct infrastructure export     | workspace/session/group/tab 可复用                  |
| schedule     | `@memoflow/schedule/api` PowerSync repositories            | schedule 和 schedule task 可复用                    |
| ai           | 若没有完整 PowerSync repository，则写最小 SQL read adapter | 只读 conversation + messages                        |

如果某个模块的 PowerSync repository 没有被 public API 暴露，不要从 package internal path import。应优先让对应 package 的 `api` entry 明确导出该 PowerSync repository，或者在 `data-portability` 内写基于 `IElectronDatabase` 的最小 SQL adapter。

### 6.3 SQL adapter 规则

PowerSync 表和列以 `packages/powersync-schema/src/index.ts` 为准。

示例：

```sql
SELECT * FROM repositories
WHERE identity_id = ?
  AND deleted_at IS NULL
ORDER BY created_at DESC
```

不要使用 Prisma camelCase 字段名，例如 `identityId`、`deletedAt`。PowerSync 本地列是 `identity_id`、`deleted_at`。

### 6.4 导出返回

Desktop IPC handler 直接返回与 HTTP API 一致的 `Result<ExportUserDataRes>`：

```ts
{
  ok: true,
  data: {
    fileName,
    content,
    summary,
  }
}
```

renderer 继续由 `useDataPortability()` 调用 `system:userFiles:saveText` 保存文件。

## 7. 导入设计

### 7.1 抽象 import store

当前 `ImportUserDataUseCase` 构造函数接收 `PrismaClient`：

```ts
new ImportUserDataUseCase(prisma);
```

建议改为：

```ts
new ImportUserDataUseCase(importStore);
```

新增 port：

```ts
export interface DataPortabilityImportStore {
  transaction<T>(fn: (tx: DataPortabilityImportTx) => Promise<T>): Promise<T>;
}
```

### 7.2 Import transaction port

不要用完全泛化的 `insert(table, row)` 作为 application API。那会把表结构泄漏回 importers，也会让 Prisma implementation 变得脆弱。

推荐使用按实体命名的方法：

```ts
export interface DataPortabilityImportTx {
  upsertUserSetting(input: UpsertUserSettingInput): Promise<void>;
  upsertNotificationPreference(input: UpsertNotificationPreferenceInput): Promise<void>;
  upsertUserReminderPreference(input: UpsertUserReminderPreferenceInput): Promise<void>;

  createRepository(input: CreateRepositoryInput): Promise<void>;
  createResourceFolder(input: CreateResourceFolderInput): Promise<void>;
  createResource(input: CreateResourceInput): Promise<void>;

  createGoalFolder(input: CreateGoalFolderInput): Promise<void>;
  createGoal(input: CreateGoalInput): Promise<void>;
  createKeyResult(input: CreateKeyResultInput): Promise<void>;
  createGoalReview(input: CreateGoalReviewInput): Promise<void>;
  createGoalRecord(input: CreateGoalRecordInput): Promise<void>;
  createFocusSession(input: CreateFocusSessionInput): Promise<void>;
  createFocusMode(input: CreateFocusModeInput): Promise<void>;

  createTaskFolder(input: CreateTaskFolderInput): Promise<void>;
  createTaskTemplate(input: CreateTaskTemplateInput): Promise<void>;
  createTaskInstance(input: CreateTaskInstanceInput): Promise<void>;
  createTaskDependency(input: CreateTaskDependencyInput): Promise<void>;

  createSchedule(input: CreateScheduleInput): Promise<void>;
  createScheduleTask(input: CreateScheduleTaskInput): Promise<void>;

  createReminderGroup(input: CreateReminderGroupInput): Promise<void>;
  createReminderTemplate(input: CreateReminderTemplateInput): Promise<void>;
  createReminderResponse(input: CreateReminderResponseInput): Promise<void>;

  createEditorWorkspace(input: CreateEditorWorkspaceInput): Promise<void>;
  createEditorSession(input: CreateEditorSessionInput): Promise<void>;
  createEditorGroup(input: CreateEditorGroupInput): Promise<void>;
  createEditorTab(input: CreateEditorTabInput): Promise<void>;

  createAIConversation(input: CreateAIConversationInput): Promise<void>;
  createAIMessage(input: CreateAIMessageInput): Promise<void>;
}
```

这些 input type 应使用 application 层字段名，例如 `identityId`、`repositoryId`、`createdAt`。Prisma store 负责映射到 Prisma delegate，PowerSync store 负责映射到 SQL snake_case。

### 7.3 RefMap 位置保持不变

`ImportUserDataUseCase` 和 importers 仍负责：

- validate envelope。
- validate duplicate `_ref`。
- dryRun。
- allocate new id。
- 建立 `_ref -> newId`。
- 按顺序调用 importer。

import store 只负责持久化，不参与 ref 分配。

### 7.4 Prisma implementation

新增：

```text
application-server/import-store/prisma-data-portability-import-store.ts
```

职责：

- 包装 `prisma.$transaction()`。
- 每个 `createX()` 调用对应 Prisma delegate。
- 每个 `upsertX()` 调用 Prisma upsert。

这一步完成后，API 端行为应完全不变：

```ts
const importUseCase = new ImportUserDataUseCase(new PrismaDataPortabilityImportStore(db));
```

### 7.5 PowerSync implementation

新增：

```text
infrastructure-server/powersync/powersync-data-portability-import-store.ts
```

职责：

- 包装 `db.writeTransaction()`。
- 每个 `createX()` 写 `INSERT INTO ...`。
- 每个 `upsertX()` 先查后写，或使用 SQLite 支持的 conflict 语法。
- JSON 字段写字符串。
- boolean 字段写 `0/1`。
- Date 字段写 ISO string 或 `null`。
- 所有写入都注入当前 `identityId`。

示例：

```ts
await tx.execute(
  `INSERT INTO repositories (
     id, identity_id, name, description, type, path, status, config, stats,
     version, created_at, updated_at, deleted_at
   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    input.id,
    input.identityId,
    input.name,
    input.description,
    input.type,
    input.path,
    input.status,
    json(input.config),
    '{}',
    1,
    input.createdAt,
    input.updatedAt,
    null,
  ],
);
```

### 7.6 PowerSync 写入字段映射原则

| portable/application 字段 | PowerSync 写入                   |
| ------------------------- | -------------------------------- |
| `identityId`              | `identity_id`                    |
| `createdAt` / `updatedAt` | `created_at` / `updated_at` text |
| `deletedAt`               | 通常写 `null`                    |
| object/array JSON         | `JSON.stringify(value)`          |
| boolean                   | `1` / `0`                        |
| missing version           | `1`                              |
| text nullable             | `null`                           |
| focused goal ids          | `focused_goal_ids` JSON string   |

不要导入或写入：

- auth tables。
- account tables。
- notification history。
- PowerSync sync metadata。
- provider API key。
- deleted data。

## 8. Electron IPC 设计

### 8.1 Electron entry

新增：

```text
packages/data-portability/src/electron-entry/index.ts
```

示例结构：

```ts
const Ch = {
  EXPORT: 'data-portability:export',
  IMPORT: 'data-portability:import',
} as const;

export const DataPortabilityElectronModule: IElectronModule = {
  name: 'DataPortability',

  register(ctx) {
    const deps = createPowerSyncDataPortabilityDependencies(ctx.db);
    const exportUseCase = new ExportUserDataUseCase(deps);
    const importUseCase = new ImportUserDataUseCase(
      new PowerSyncDataPortabilityImportStore(ctx.db),
    );

    ipcMain.handle(Ch.EXPORT, (_, dto) =>
      withAuthenticatedIdentity(ctx, (identityId) =>
        ok(exportUseCase.execute(identityId, dto?.include)),
      ),
    );

    ipcMain.handle(Ch.IMPORT, (_, dto) =>
      withAuthenticatedIdentity(ctx, (identityId) =>
        ok(importUseCase.execute(identityId, dto.content, dto.dryRun)),
      ),
    );
  },

  destroy() {
    ipcMain.removeHandler(Ch.EXPORT);
    ipcMain.removeHandler(Ch.IMPORT);
  },
};
```

实际代码应注意：

- handler 需要 validate payload。
- 捕获 use case 抛出的 `VALIDATION_ERROR`，让 authenticated IPC wrapper 返回结构化 `Result`。
- 不要在 handler 中处理文件保存/读取。

### 8.2 package exports

恢复：

```json
"./electron-entry": {
  "types": "./dist/electron-entry/index.d.ts",
  "import": "./dist/electron-entry/index.js"
}
```

`tsup.config.ts` 增加：

```ts
'src/electron-entry/index.ts';
```

### 8.3 desktop main 注册

`apps/desktop/src/main/main.ts`：

```ts
import { DataPortabilityElectronModule } from '@memoflow/data-portability/electron-entry';

await bootstrapper
  .register(AccountElectronModule)
  .register(SettingElectronModule)
  .register(NotificationElectronModule)
  .register(DataPortabilityElectronModule)
  ...
```

推荐放在 Setting/Notification 后、具体 feature modules 前后均可。它只依赖 `ctx.db` 和 `ctx.auth`，不依赖其他 Electron module runtime。

## 9. Renderer 接线设计

### 9.1 IPC adapter

恢复：

```text
packages/data-portability/src/infrastructure-client/adapters/ipc/data-portability-ipc.adapter.ts
```

接口仍实现 `IDataPortabilityApiClient`：

```ts
export class DataPortabilityIpcAdapter implements IDataPortabilityApiClient {
  exportUserData(data: ExportUserDataReq): Promise<Result<ExportUserDataRes>> {
    return this.ipc.invoke('data-portability:export', data);
  }

  importUserData(data: ImportUserDataReq): Promise<Result<ImportUserDataRes>> {
    return this.ipc.invoke('data-portability:import', data);
  }
}
```

### 9.2 Desktop DI

在 `apps/desktop/src/renderer/platform/di-app.ts` 提供：

```ts
provide(DATA_PORTABILITY_SERVICE_KEY, createDataPortabilityClientService(ipcAdapter));
```

如果 desktop renderer 里已有统一 IPC client factory，应复用现有模式，不单独访问 `window.electron`。

### 9.3 UI 文件流

`useDataPortability()` 当前已经处理：

- 导出：调用 service，拿到 `fileName/content`。
- Desktop 保存：调用 `system:userFiles:saveText`。
- Web 保存：Blob download。
- 导入：Desktop 调 `system:userFiles:openText`，Web 使用 file input。

接入 IPC service 后，Desktop 按钮会因为 `isAvailable = true` 自动展示。

后续应补：

- 导入前确认。
- i18n 文案。
- 结构化 summary。

## 10. 实施阶段

### 阶段 1：抽 import store，不改变行为

目标：API 端仍通过。

改动：

- 新增 `DataPortabilityImportStore` / `DataPortabilityImportTx`。
- 新增 `PrismaDataPortabilityImportStore`。
- 修改 `ImportUserDataUseCase` 构造函数。
- 修改 importers，把 `tx.goal.create()` 改成 `tx.createGoal()` 等。
- `DataPortabilityApiModule` 使用 Prisma store。

验证：

```text
pnpm nx run data-portability:test
pnpm nx run data-portability:typecheck
pnpm nx run data-portability:build
pnpm nx build api
```

### 阶段 2：实现 Desktop export

目标：Desktop 能真实导出 JSON。

改动：

- 新增 `createPowerSyncDataPortabilityDependencies(db)`。
- 新增必要 SQL read adapters。
- 新增 `DataPortabilityElectronModule`，先只注册 export。
- 恢复 `./electron-entry` package export。
- desktop main 注册 module。
- renderer DI 暂可只接 export-capable service，或者同一 IPC adapter 中 import 暂未开放。

验证：

```text
pnpm nx run data-portability:test
pnpm nx build desktop
```

手工验证：

1. Desktop 登录当前 profile。
2. 创建一个目标、任务、文本资源和提醒。
3. 设置页导出。
4. 查看 JSON 不包含 `identityId`、`id`、token、session。

### 阶段 3：实现 Desktop import

目标：Desktop 能真实导入 JSON。

改动：

- 新增 `PowerSyncDataPortabilityImportStore`。
- 在 `DataPortabilityElectronModule` 注册 import。
- renderer 导入按钮接通。
- dryRun 只校验，不写库。

验证：

```text
pnpm nx run data-portability:test
pnpm nx build desktop
pnpm nx run app-vue:typecheck
```

手工验证：

1. 导出一份 JSON。
2. 切换 profile 或清理业务数据。
3. 导入 JSON。
4. 确认数据归属当前用户。
5. 确认关系恢复。

### 阶段 4：补测试和治理

测试重点：

- IPC handler contract。
- PowerSync export dependencies。
- PowerSync import store transaction rollback。
- Desktop renderer DI service available。
- malicious JSON import rejection。

最终门禁：

```text
pnpm nx run data-portability:lint
pnpm nx run data-portability:typecheck
pnpm nx run data-portability:test
pnpm nx run data-portability:build
pnpm nx build api
pnpm nx build desktop
pnpm nx run app-vue:typecheck
pnpm nx run memoflow:governance-check
```

## 11. 测试计划

### 11.1 Unit tests

新增：

- `prisma-data-portability-import-store.test.ts`
  - 确认 API import store 调用 Prisma transaction。
  - 确认 create/upsert input 映射到正确 delegate。
- `powersync-data-portability-import-store.test.ts`
  - 用 fake `IElectronDatabase` 捕获 SQL。
  - 确认 snake_case 列名正确。
  - 确认 boolean 变为 `0/1`。
  - 确认 JSON stringify。
- `powersync-export-dependencies.test.ts`
  - fake `getAll()` 返回 rows。
  - adapter 返回 projection 可识别的对象。

### 11.2 IPC tests

新增或扩展 desktop IPC contract tests：

- `DataPortabilityElectronModule` 注册 `data-portability:export`。
- `DataPortabilityElectronModule` 注册 `data-portability:import`。
- `destroy()` 移除 handlers。
- 未登录时返回 auth required。
- handler 不直接访问文件系统。

### 11.3 Integration-style tests

最小 round-trip：

- settings。
- repository + folder + text resource。
- goal + key result + record。
- task template + instance。
- reminder group + template + response。
- AI conversation + message。

### 11.4 Manual QA

Desktop 手工验证清单：

1. 登录 profile A。
2. 创建目标、任务、资源、提醒、AI 对话和设置。
3. 点击导出，保存 JSON。
4. 打开 JSON，搜索：
   - `identityId`
   - `"id"`
   - `token`
   - `apiKey`
   - `session`
5. 登录 profile B。
6. 导入 JSON。
7. 确认数据全部属于 profile B 当前身份。
8. 再导入同一个文件，确认创建第二批数据而不是覆盖。
9. 导入恶意 JSON，确认失败且没有半导入。

## 12. 风险与缓解

| 风险                               | 说明                                                     | 缓解                                                     |
| ---------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| Prisma 字段名和 PowerSync 列名不同 | API importer 现在用 camelCase，PowerSync 需要 snake_case | 通过 import store 分层映射                               |
| 半导入                             | 多表写入过程中失败                                       | PowerSync `writeTransaction()` 包裹整次导入              |
| 同步副作用                         | 本地导入后可能同步到服务端                               | 只写当前 identity，保持 append-create-like               |
| 字段缺省不一致                     | PowerSync 表可能需要 version/stats 等字段                | store 统一默认值：version=1、stats=`{}`                  |
| public surface 假能力              | IPC handler 注册但不可用                                 | 阶段 2/3 必须真实执行 use case                           |
| package boundary 违规              | 从其他包 internal path import PowerSync repository       | 优先使用 public `api` entry，必要时补对应 package export |
| 恶意导入                           | JSON 中嵌套身份和凭据字段                                | 已有 recursive banned-key validation，继续保留           |

## 13. 推荐提交切分

1. `data-portability`: add import store port and Prisma store。
2. `data-portability`: refactor importers to use import tx port。
3. `data-portability`: add PowerSync export dependencies。
4. `data-portability`: add PowerSync import store。
5. `data-portability`: add real electron-entry and IPC adapter。
6. `desktop`: register DataPortabilityElectronModule and provide renderer service。
7. `tests`: add PowerSync store/export/IPC coverage。
8. `docs`: update active plan and run governance。

## 14. 当前建议

建议先实施阶段 1 和阶段 2，让 Desktop 先具备真实导出能力。导出是只读路径，风险明显低于导入。

Desktop 导入应作为单独阶段处理，因为它涉及：

- PowerSync transaction。
- 多表写入。
- 冲突策略。
- 同步副作用。
- 回滚验证。

完成阶段 1 和阶段 2 后，即使暂不开放导入，也可以让用户先拿到完整 JSON 数据文件；这符合“目前不需要复杂功能，只需要能够导出数据生成一个数据文件”的第一半目标。
