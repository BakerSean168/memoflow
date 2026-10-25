# Application-Client 层标准化计划

**状态**: Phase 1-4 全部完成
**前置依赖**: `2026-05-02-application-server-layer-standardization.md`（已完成）
**参考实现**: `packages/setting/src/application-client/`（SettingClientPort + SettingClientService + factory）

---

## Context

Application-Server 层标准化（Phases 1-4）已全部完成。现在需要将同样的标准化工作推进到 application-client 层。

### 审计发现

| 维度            | Setting（标准）                     | 其他模块现状                                                                 |
| --------------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| ClientPort 接口 | `SettingClientPort` 定义在 index.ts | 仅 setting 有；其余模块无                                                    |
| Factory 函数    | `createSettingClientService()`      | 仅 setting 有                                                                |
| 废弃代理        | 无                                  | authentication/goal/schedule 有 singleton proxy                              |
| 废弃别名        | 无                                  | authentication 有 `AuthenticationApplicationService`                         |
| 废弃标记        | 无                                  | 5 个模块的 ClientService 有 `@deprecated`                                    |
| 遗留基础设施    | 无                                  | notification 有 legacy NotificationApiClient + NotificationPermissionService |
| Port 定义位置   | infrastructure-client/re-export     | account/auth 在 `ports/`，其余在 `infrastructure-client/adapters/types.ts`   |

### 关键原则

- 保持单类 ClientService（不拆分为单操作文件）
- Port 接口定义统一到 `application-client/ports/`
- 每个模块新增 `XxxClientPort` 接口 + `createXxxClientService()` factory
- `Result<T>` 已全局合规，无需修改

---

## Phase 1: 死代码清理（LOW 风险，纯删除）

### 1a. 移除 deprecated singleton proxy（3 模块）

| 模块           | 删除内容                                                                                                                                                           | 文件                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| authentication | `_authenticationApplicationService` / `setAuthenticationApplicationService()` / `authenticationApplicationService` Proxy + `AuthenticationApplicationService` 别名 | `application-client/index.ts` |
| goal           | `_goalApplicationService` / `setGoalApplicationService()` / `goalApplicationService` Proxy                                                                         | `application-client/index.ts` |
| schedule       | `_scheduleApplicationService` / `setScheduleApplicationService()` / `scheduleApplicationService` Proxy                                                             | `application-client/index.ts` |

外部引用检查：上述 deprecated proxy 仅在各自 `index.ts` 内部定义和使用，无外部消费者。

### 1b. 移除 notification 遗留基础设施

- 删除 `application-client/infrastructure/api/notificationApiClient.ts`（legacy Axios 单例，不返回 `Result<T>`，无外部引用）
- 删除 `application-client/infrastructure/browser/NotificationPermissionService.ts`（无外部引用）
- 删除 `application-client/infrastructure/` 空目录

### 1c. 清理 deprecation 标记

**Goal 数据文件**：

- `GoalTemplates.ts` 和 `BuiltInRules.ts` — 移除 `@deprecated` 标记（数据文件不适合"拆分为单操作文件"的 deprecation 消息）

**5 个 ClientService 文件** — 移除 `@deprecated` JSDoc：

- `packages/goal/src/application-client/goal-client-service.ts`
- `packages/notification/src/application-client/notification-client-service.ts`
- `packages/reminder/src/application-client/reminder-client-service.ts`
- `packages/repository/src/application-client/repository-client-service.ts`
- `packages/schedule/src/application-client/schedule-client-service.ts`

### Phase 1 验证

```bash
pnpm nx run-many --target=typecheck --projects=authentication,goal,schedule,notification,reminder,repository
```

---

## Phase 2: Port 接口统一到 `ports/`（LOW 风险，文件移动 + re-export）

**目标**：所有模块的 API client port 接口定义在 `application-client/ports/`，`infrastructure-client/adapters/types.ts` 改为 re-export。

### 已合规（跳过）

- **account** — 已有 `application-client/ports/account-api-client.port.ts`
- **authentication** — 已有 `application-client/ports/auth-api-client.port.ts`

### 2a. goal（3 个 port）

当前定义位置：`infrastructure-client/adapters/types.ts`（~186 行）

| 操作 | 文件                                                                                    |
| ---- | --------------------------------------------------------------------------------------- |
| 新建 | `application-client/ports/goal-api-client.port.ts` — 搬入 `IGoalApiClient`              |
| 新建 | `application-client/ports/goal-folder-api-client.port.ts` — 搬入 `IGoalFolderApiClient` |
| 新建 | `application-client/ports/goal-focus-api-client.port.ts` — 搬入 `IGoalFocusApiClient`   |
| 更新 | `infrastructure-client/adapters/types.ts` — 删除本地定义，改为 re-export                |
| 更新 | `application-client/goal-client-service.ts` import 路径                                 |
| 更新 | `application-client/index.ts` barrel                                                    |

### 2b. reminder（1 个 port）

当前定义位置：`infrastructure-client/adapters/types.ts`（~94 行）

| 操作 | 文件                                                                               |
| ---- | ---------------------------------------------------------------------------------- |
| 新建 | `application-client/ports/reminder-api-client.port.ts` — 搬入 `IReminderApiClient` |
| 更新 | `infrastructure-client/adapters/types.ts`                                          |
| 更新 | service import + barrel                                                            |

### 2c. notification（1 个 port）

当前定义位置：`infrastructure-client/adapters/types.ts`（~72 行）

| 操作 | 文件                                                                                       |
| ---- | ------------------------------------------------------------------------------------------ |
| 新建 | `application-client/ports/notification-api-client.port.ts` — 搬入 `INotificationApiClient` |
| 更新 | re-export 链                                                                               |

### 2d. repository（1 个 port）

当前定义位置：`infrastructure-client/adapters/types.ts`（~132 行）

| 操作 | 文件                                                                                   |
| ---- | -------------------------------------------------------------------------------------- |
| 新建 | `application-client/ports/repository-api-client.port.ts` — 搬入 `IRepositoryApiClient` |
| 更新 | re-export 链                                                                           |

### 2e. schedule（2 个 port）

当前定义位置：`infrastructure-client/adapters/types.ts`（~116 行）

| 操作 | 文件                                                                                          |
| ---- | --------------------------------------------------------------------------------------------- |
| 新建 | `application-client/ports/schedule-event-api-client.port.ts` — 搬入 `IScheduleEventApiClient` |
| 新建 | `application-client/ports/schedule-task-api-client.port.ts` — 搬入 `IScheduleTaskApiClient`   |
| 更新 | re-export 链                                                                                  |

### 2f. task（3 个 port）

当前定义位置：`infrastructure-client/adapters/types.ts`（~132 行）

| 操作 | 文件                                                                                            |
| ---- | ----------------------------------------------------------------------------------------------- |
| 新建 | `application-client/ports/task-template-api-client.port.ts` — 搬入 `ITaskTemplateApiClient`     |
| 新建 | `application-client/ports/task-instance-api-client.port.ts` — 搬入 `ITaskInstanceApiClient`     |
| 新建 | `application-client/ports/task-dependency-api-client.port.ts` — 搬入 `ITaskDependencyApiClient` |
| 更新 | re-export 链                                                                                    |

### 2g. editor（1 个 port）

当前定义位置：`infrastructure-client/adapters/types.ts`（~79 行）

| 操作 | 文件                                                                           |
| ---- | ------------------------------------------------------------------------------ |
| 新建 | `application-client/ports/editor-api-client.port.ts` — 搬入 `IEditorApiClient` |
| 更新 | re-export 链                                                                   |

### 2h. ai（10 个 port）

当前定义位置：`infrastructure-client/adapters/types.ts`（~152 行）

| 操作 | 文件                                                                        |
| ---- | --------------------------------------------------------------------------- |
| 新建 | `application-client/ports/ai-api-client.port.ts` — 搬入全部 10 个 port 接口 |
| 更新 | re-export 链                                                                |

### 每个模块的变更文件清单

1. `application-client/ports/*.port.ts` — 新建
2. `infrastructure-client/adapters/types.ts` — 删除本地定义，改为 re-export from `../../application-client/ports/`
3. `application-client/*-client-service.ts` — 更新 import 路径
4. `application-client/index.ts` — 更新 barrel export

### Phase 2 验证

```bash
pnpm nx run-many --target=typecheck --projects=goal,reminder,notification,repository,schedule,task,editor,ai
```

---

## Phase 3: ClientPort 接口 + Factory 函数（LOW 风险，纯新增）

**目标**：每个模块添加 `XxxClientPort` 接口和 `createXxxClientService()` factory，与 setting 模式一致。

### 参考模式

```typescript
export interface XxxClientPort {
  operationA(req: ReqType): Promise<Result<ResType>>;
  operationB(req: ReqType): Promise<Result<ResType>>;
}

export class XxxClientService implements XxxClientPort {
  constructor(private readonly apiClient: IXxxApiClient) {
    this.operationA = this.operationA.bind(this);
    this.operationB = this.operationB.bind(this);
  }

  operationA(req: ReqType): Promise<Result<ResType>> {
    return this.apiClient.operationA(req);
  }
  // ...
}

export function createXxxClientService(apiClient: IXxxApiClient): XxxClientService {
  return new XxxClientService(apiClient);
}
```

### 已合规（跳过）

- **setting** — 已有 SettingClientPort + SettingClientService + factory

### 3a. governance

- 新增 `GovernanceClientPort` 接口（GovernanceClientService 已有结构，仅缺接口声明）
- `GovernanceClientService implements GovernanceClientPort`
- 新增 `createGovernanceClientService()`

### 3b. account

- 新增 `AccountClientPort` 接口
- `AccountClientService implements AccountClientPort`
- 新增 `createAccountClientService(apiClient: IAccountApiClient)`

### 3c. authentication

- 新增 `AuthenticationClientPort` 接口
- `AuthClientService implements AuthenticationClientPort`
- 新增 `createAuthenticationClientService(apiClient: IAuthApiClient)`

### 3d. goal

- 新增 `GoalClientPort` 接口
- `GoalClientService implements GoalClientPort`
- 新增 `createGoalClientService()`

### 3e. notification

- 新增 `NotificationClientPort` 接口
- `NotificationClientService implements NotificationClientPort`
- 新增 `createNotificationClientService()`

### 3f. reminder

- 新增 `ReminderClientPort` 接口
- `ReminderClientService implements ReminderClientPort`
- 新增 `createReminderClientService()`

### 3g. repository

- 新增 `RepositoryClientPort` 接口
- `RepositoryClientService implements RepositoryClientPort`
- 新增 `createRepositoryClientService()`

### 3h. schedule

- 新增 `ScheduleClientPort` 接口
- `ScheduleClientService implements ScheduleClientPort`
- 新增 `createScheduleClientService()`

### 3i. task

- 新增 `TaskClientPort` 接口
- `TaskClientService implements TaskClientPort`
- 新增 `createTaskClientService()`

### 3j. editor

- 新增 `EditorClientPort` 接口
- `EditorClientService implements EditorClientPort`
- 新增 `createEditorClientService()`

### 3k. ai

- 新增 `AIClientPort` 接口
- `AIClientService implements AIClientPort`
- 新增 `createAIClientService()`

### Phase 3 验证

```bash
pnpm nx run-many --target=typecheck --projects=governance,account,authentication,goal,notification,reminder,repository,schedule,task,editor,ai,setting
```

---

## Phase 4: Barrel Export 统一（LOW 风险，收尾）

**目标**：统一所有模块的 barrel export 模式。

### 目标模式

```typescript
// application-client/index.ts

// ===== Port Interfaces =====
export type { IXxxApiClient } from './ports/xxx-api-client.port';

// ===== Client Service =====
export { XxxClientService, createXxxClientService } from './xxx-client-service';
export type { XxxClientPort } from './xxx-client-port'; // 或 inline 在 index.ts
```

### 变更

- 移除所有 backward-compat 别名（如 `AuthClientService as AuthenticationApplicationService`）
- 移除所有残余 `@deprecated` 重导出
- 确保每个 barrel 只导出：Port type + ClientPort interface + ClientService class + Factory function
- Goal 额外导出：`GoalTemplates`、`BuiltInRules` 数据（保留）

### Phase 4 验证

```bash
pnpm nx run-many --target=typecheck --projects=governance,account,authentication,goal,notification,reminder,repository,schedule,task,editor,ai,setting
```

---

## 执行规则

1. **Phase 1 → 4 顺序执行** — 每个 Phase 完成后 typecheck 验证
2. **Phase 2-3 内按模块独立执行** — 每个模块可独立验证
3. **先清理后建设** — Phase 1 只删不增，降低后续变更噪音
4. **一个模块一个 commit** — 原子性，可回滚

## 最终验证

```bash
pnpm nx run-many --target=typecheck --projects=governance,account,authentication,goal,notification,reminder,repository,schedule,task,editor,ai,setting
```

全部完成后的确认项：

- 无 deprecated singleton proxy（authentication/goal/schedule）
- 无 legacy infrastructure（notification）
- 无 `@deprecated` ClientService 标记（5 个模块）
- 所有模块有 `XxxClientPort` 接口
- 所有 service 类 `implements XxxClientPort`
- 所有模块有 `createXxxClientService()` factory
- Port 接口统一定义在 `application-client/ports/`
- Barrel exports 干净统一
