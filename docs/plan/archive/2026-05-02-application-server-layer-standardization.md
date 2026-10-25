# Application-Server 层标准化计划

**状态**: Phase 1-4 全部完成
**前置依赖**: `2026-05-02-domain-layer-standardization.md`（已完成）
**参考实现**: `packages/governance/`

---

## Context

Domain 层标准化（Waves 0-5）已全部完成。现在需要将同样的标准化工作推进到 application-server 层。Governance 模块是参考实现，采用 5 层调用链：Route → Controller → UseCase → Repository → Prisma。

### 审计发现的核心不一致

| 维度            | Governance（标准）              | 其他模块现状                                                  |
| --------------- | ------------------------------- | ------------------------------------------------------------- |
| 文件命名        | `*.use-case.ts`                 | 多数无后缀，editor/ai 用 `*-application-service.ts`           |
| 类命名          | `XxxUseCase`                    | `CreateGoal`、`Login`、`EditorSessionApplicationService` 等   |
| 返回值          | `Promise<Result<T>>`            | 仅 goal/task 用 Result，其余抛异常                            |
| 参数            | `ExecutionContext{identityId}`  | `Context` / `identityId:string` / `params.identityId` 等 3 种 |
| 结构            | Pure Use Case（每文件一个操作） | schedule/editor/ai 用多方法 Application Service               |
| Controller 位置 | `src/controllers/`              | task 和 ai 在 `src/api/controllers/`                          |

### 关键原则

遵循 AGENT.md："prefer root-cause fixes over shims"。Composition root 中的 try/catch 包裹是 shim，应将 `Result<T>` 移入 use case 内部。

---

## Phase 1: 结构性修复（LOW 风险，纯机械操作）

### 1a. Task controller 位置修正

当前 `packages/task/src/api/controllers/` 应移至 `packages/task/src/controllers/`

- [ ] 移动 `src/api/controllers/task-template.controller.ts` → `src/controllers/`
- [ ] 移动 `src/api/controllers/task-instance.controller.ts` → `src/controllers/`
- [ ] 移动 `src/api/controllers/task-dependency.controller.ts` → `src/controllers/`
- [ ] 移动 `src/api/controllers/__tests__/` → `src/controllers/__tests__/`
- [ ] 新建 `src/controllers/index.ts` barrel 导出
- [ ] 更新 `src/api/module.ts` import 路径
- [ ] 更新 `src/api/routes/*.ts` import 路径
- [ ] 删除 `src/api/controllers/` 目录

### 1b. AI controller 位置修正

同上模式：`packages/ai/src/api/controllers/` → `packages/ai/src/controllers/`

- [ ] 移动所有 controller 文件
- [ ] 新建 `src/controllers/index.ts` barrel
- [ ] 更新 `src/api/module.ts` 和 `src/api/routes/*.ts` import 路径
- [ ] 删除旧目录

### 1c. Use case 文件重命名为 `*.use-case.ts`

Governance 和 schedule 已遵循此规范。其余 8 个模块需重命名。每个重命名后同步更新 barrel `index.ts`。

**goal**（32 文件）:

- [ ] `packages/goal/src/application-server/use-cases/commands/` — 所有 `*.ts` → `*.use-case.ts`
- [ ] `packages/goal/src/application-server/use-cases/queries/` — 所有 `*.ts` → `*.use-case.ts`
- [ ] 更新 `commands/index.ts` 和 `queries/index.ts`

**task**（30 文件）:

- [ ] 同上模式

**reminder**（9 文件）:

- [ ] 同上模式

**notification**（5 文件）:

- [ ] 同上模式（保留 `notification-dto-converters.ts` 工具文件不动）

**authentication**（10 文件）:

- [ ] 同上模式

**repository**（20 文件）:

- [ ] 同上模式

**editor**（2 文件）:

- [ ] `editor-session-application-service.ts` → `manage-editor-session.use-case.ts`
- [ ] `editor-workspace-application-service.ts` → `manage-editor-workspace.use-case.ts`

**account**（5 文件）:

- [ ] 同上模式

**ai**（15 文件）:

- [ ] 纯 use case 和 application service 统一重命名

### 1d. Use case 类名添加 `UseCase` 后缀

在文件重命名的同时，将类名也统一加上 `UseCase` 后缀。影响面：类声明 + 所有 import 站点 + composition root + barrel exports + controller 类型引用。

| 模块           | 示例                                                             |
| -------------- | ---------------------------------------------------------------- |
| goal           | `CreateGoal` → `CreateGoalUseCase`                               |
| task           | `CreateTaskTemplate` → `CreateTaskTemplateUseCase`               |
| reminder       | `CreateReminderTemplate` → `CreateReminderTemplateUseCase`       |
| notification   | `CreateNotification` → `CreateNotificationUseCase`               |
| authentication | `Login` → `LoginUseCase`                                         |
| repository     | `CreateRepository` → `CreateRepositoryUseCase`                   |
| editor         | `EditorSessionApplicationService` → `ManageEditorSessionUseCase` |
| account        | 已有 `XxxUseCase` 后缀的保持不变                                 |
| ai             | `AIChatApplicationService` → `ManageAIChatUseCase`               |

### Phase 1 验证

```bash
pnpm nx run-many --target=typecheck --projects=goal,task,reminder,schedule,notification,editor,repository,authentication,account,ai
```

---

## Phase 2: Result\<T\> 标准化（MEDIUM 风险，按模块逐个执行）

**目标**：所有 use case 返回 `Promise<Result<T>>`，移除 composition root 中的 try/catch shim。

### 2a. account（5 个 use case — 最小模块）

- [x] 5 个 use case：`execute()` 返回 `Promise<Result<T>>`，`throw` → `return error(...)`
- [x] 更新 `account.module.ts`：移除 port facade 上的 try/catch 包裹
- [x] 更新 controller（如有 try/catch 包裹）
- [x] `pnpm nx run account:typecheck`

### 2b. reminder（9 个 use case）

- [x] 同上模式
- [x] `pnpm nx run reminder:typecheck`

### 2c. notification（5 个 use case）

- [x] 同上模式
- [x] `pnpm nx run notification:typecheck`

### 2d. authentication（10 个 use case）

- [x] Composition root 中 catch 的异常移入 use case 内部 `return error(...)`
- [x] `pnpm nx run authentication:typecheck`

### 2e. repository（20 个 use case）

- [x] `pnpm nx run repository:typecheck`

### 2f. schedule（10 个 use case + 2 个 app service）

- [x] Use case 改 Result
- [x] `pnpm nx run schedule:typecheck`

### 2g. goal（32 个 use case — 已部分使用 Result）

- [x] 逐个检查，将仍抛异常的补齐 Result（6 个 use case + 1 个跨模块查询）
- [x] `pnpm nx run goal:typecheck`

### 2h. task（30 个 use case — 已部分使用 Result）

- [x] 已合规，无需修改
- [x] `pnpm nx run task:typecheck`

### 2i. editor（2 个 app service）

- [x] service 方法改为返回 Result
- [x] `pnpm nx run editor:typecheck`

### 2j. ai（11 个 service + 2 个 use case — 最大模块）

- [x] service 方法改为返回 Result
- [x] `pnpm nx run ai:typecheck`

每个模块变更文件：

1. `packages/{module}/src/application-server/use-cases/**/*.{ts,use-case.ts}` — 返回类型 + 替换 throw
2. `packages/{module}/src/infrastructure-server/{module}.module.ts` — 移除 try/catch shim
3. `packages/{module}/src/controllers/*.controller.ts` — 简化错误处理

---

## Phase 3: Application Service 分解（HIGH 风险，目标模块）

**目标**：将多方法 Application Service 分解为 Pure Use Case（每文件一个操作）。

### 3a. editor（2 个 service, 33 个方法 → 34 个 use cases）

- [x] `ManageEditorSessionUseCase` (13 methods) → 13 individual use cases + `editor-session-helpers.ts`
- [x] `ManageEditorWorkspaceUseCase` (20 methods) → 20 individual use cases + `workspace-helpers.ts`
- [x] 更新 `editor.module.ts` 组合根
- [x] `pnpm nx run editor:typecheck`

### 3b. repository（已合规）

- [x] `SyncRepositoryUseCase` 已是单方法，无分解需要

### 3c. schedule（1 个 service, 4 个方法 → 4 个 use cases）

- [x] `ScheduleTaskExecutor` → `FindDueScheduleTasksUseCase` + `ExecuteScheduleTaskUseCase` + `ExecuteDueScheduleTasksUseCase` + `ExecuteScheduleTaskByIdUseCase`
- [x] 更新 adapter 和测试
- [x] `pnpm nx run schedule:typecheck`

### 3d. ai（5 个 service, 26 个方法 → 26 个 use cases + helpers）

- [x] `ManageAIProviderConfigUseCase` (9 methods) → 9 use cases + `ai-provider-config-helpers.ts`
- [x] `ManageAIConversationUseCase` (8 methods) → 8 use cases
- [x] `ManageAIChatUseCase` (2 methods) → 2 use cases + `ai-chat-helpers.ts`
- [x] `QueryAIKnowledgeUseCase` (3 methods) → 3 use cases
- [x] `ManageAIKnowledgeIndexUseCase` (4 methods) → 4 use cases + `ai-knowledge-index-helpers.ts`
- [x] 更新 `ai.module.ts` 组合根
- [x] `pnpm nx run ai:typecheck`

---

## Phase 4: ExecutionContext 统一（收尾）

- [x] 共享 `ExecutionContext{ identityId: string }` 添加到 `@memoflow/contracts/shared`
- [x] Goal: `Context` → `ExecutionContext`（create-goal 是唯一使用 Context 的 use case）
- [x] Account: `identityId: string` → `cx: ExecutionContext`（4 个 use case + composition root + controller + transport handlers + electron entry + tests）
- [x] Authentication: `Context` → `ExecutionContext`（login/register 提取 deviceId 为独立参数，其余 use case 直接替换）
- [x] Reminder: `identityId: string` → `cx: ExecutionContext`（4 个 use case + composition root + controller + tests）
- [x] AI: `identityId: string` → `cx: ExecutionContext`（18 use cases + composition root + 4 controllers + electron entry + routes + runtime）
- [x] Governance: 保持原样（本地 branded IdentityId 类型，参考实现）

**不改模块**（Pattern D — identityId 在 input 对象内）：Notification, Repository, Schedule, Task, Editor

---

## 执行规则

1. Phase 1 → 4 顺序执行，每个 Phase 完成后 typecheck
2. Phase 2 内按模块独立执行，可独立验证
3. 先结构后行为 — Phase 1 不改变运行时行为
4. 一个模块一个 commit

## 最终验证

```bash
pnpm nx run-many --target=typecheck --projects=contracts,goal,task,reminder,schedule,notification,editor,repository,authentication,account,ai,governance
```

全部完成后的确认项：

- 所有 use case 文件以 `*.use-case.ts` 结尾
- 所有 use case 类以 `UseCase` 后缀结尾
- 所有 use case `execute()` 返回 `Promise<Result<T>>`
- 所有 composition root 无 try/catch shim
- 所有 controller 在 `src/controllers/` 目录
- Pattern A/B 模块统一使用 `ExecutionContext`（Goal, Account, Authentication, Reminder, AI）
