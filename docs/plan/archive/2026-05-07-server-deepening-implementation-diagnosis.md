# 服务端 Deepening 实现诊断

> 创建时间: 2026-05-07
> 状态: 审查完成，已归档
> 范围: `schedule`、`repository`、`goal`、`ai` 四个服务端模块
> 基线文档:
>
> - [服务端 Deepening 执行总览](./2026-05-06-server-deepening-execution-overview.md)
> - [Repository Resource Mutation Deepening 执行方案](./2026-05-06-repository-resource-mutation-deepening.md)
> - [Goal Read-Model Workflow Deepening 执行方案](./2026-05-06-goal-read-model-workflow-deepening.md)
> - [AI Runtime Module Split 执行方案](./2026-05-06-ai-runtime-module-split.md)
>   归档说明：相关实现已按诊断结论完成，本文件现仅保留为历史诊断基线。

## 文档定位

本文档不是新的实施方案，而是基于当前代码和测试结果，对服务端 deepening 相关实现的落地情况做正式诊断。

它回答的问题不是“这些模块有没有重构过”，而是：

1. 复杂 workflow 是否真的从 composition root、controller 或 mega-assembly 收回到了更深的 application seam
2. public seam 是否保持稳定
3. 新 seam 是否拥有独立测试面
4. 当前实现是否已经达到“复杂度集中、删除测试成立”的优雅实现标准

本次诊断以当前代码、配置和测试为真值。如果与现有 active 计划文档状态冲突，以代码现状为准。

## 审查标准

沿用服务端 deepening 总览中的统一成功标准，并在本次诊断中具体化为以下判断规则：

- route path 不变
- controller 对外方法名不变
- contracts wire shape 不变
- route contract spec 继续通过
- 新 workflow seam 有独立测试面
- 删除新 seam 后，复杂度会重新扩散，而不是 caller 只多几行透传

额外判断：

- 若复杂度只是从 controller 挪到 DTO helper，或从 composition root 挪到返回 `Result<unknown>` 的大 service，不视为“已经优雅收口”
- 若测试仍然不能稳定保护 public seam，则不能判定为“完成”

## 总体结论

当前后端 deepening 不是“整体已优雅完成”，而是呈现出明显分化：

- `schedule`: 已基本达到优雅实现标准，可作为当前最接近样板的服务端 deepening 结果
- `repository`: 已明显落地，复杂度大部分收回到了 application service，但仍有边界不够干净的问题
- `goal`: 已明显落地，controller 已回归薄 adapter，但 application seam 仍存在 DTO 泄漏
- `ai`: 关键 deepening 目标尚未完成，仍保留 top-level capability matrix 和多处 presence guard

因此，当前最准确的判断是：

> 服务端 deepening 已经完成了一半以上的结构性回收，但还没有整体进入“已经优雅实现”的状态。

## 模块级诊断

### 1. `schedule`

#### 状态

已基本优雅实现。

#### 已实现内容

- 任务生命周期相关 workflow 已收口为独立 use case：
  - `CompleteScheduleTaskUseCase`
  - `CancelScheduleTaskUseCase`
  - `GetDueScheduleTasksUseCase`
  - `BatchDeleteScheduleTasksUseCase`
  - `BatchOperateScheduleTasksUseCase`
  - `UpdateScheduleTaskMetadataUseCase`
- 冲突相关 workflow 已收口到 `ScheduleConflictResolutionService`
- `createScheduleUseCases()` 负责装配，`createScheduleModule()` 中的 `api` 主要只做参数适配和委派

#### 未优雅 / 未完成点

- `api.listTasks()` 仍保留少量查询分支，但这属于 adapter 级选择逻辑，不再是原先那种跨 seam 的 workflow 泄漏
- `eventApi` 仍承担一部分 `resultify(...)` 包装和 payload 适配，但整体上没有继续吸住复杂业务实现

#### 证据

- `packages/schedule/src/infrastructure-server/schedule.module.ts`
- `packages/schedule/src/application-server/services/schedule-conflict-resolution-service.ts`
- `packages/schedule/src/application-server/use-cases/commands/schedule-command-use-cases.test.ts`
- `packages/schedule/src/api/schedule-event.routes.spec.ts`

#### 判断

`schedule` 已经满足本轮 deepening 的核心目标：复杂 workflow 不再滞留在 composition root。它是当前四个模块里最接近“已经优雅实现”的一项。

### 2. `repository`

#### 状态

已落地，但未完全收干净。

#### 已实现内容

- 新的 deep module 已建立：
  - `RepositoryResolutionService`
  - `StoredResourceHydrationService`
  - `ResourceMutationService`
- `buildApplicationPort()` 已显著变薄，不再内联 canonical repository fallback、hydration、resource mutation helper 的具体实现
- `UploadResourcesUseCase` 已开始复用 `ResourceMutationService.uploadResource(...)`
- 新增 workflow seam 拥有独立测试面：
  - repository resolution spec
  - stored resource hydration spec
  - resource mutation spec

#### 未优雅 / 未完成点

1. `ResourceMutationService` 的 public surface 仍然偏宽，多个入口返回 `Promise<Result<unknown>>`
2. `UploadResourcesUseCase` 仍保留了部分 repository / folder 查询和 path 推导逻辑
3. upload workflow 虽然复用了 mutation seam，但还没有做到“单文件上传语义的所有关键知识都只在 deep module 中维护”

#### 证据

- `packages/repository/src/infrastructure-server/repository.module.ts`
- `packages/repository/src/application-server/services/resource-mutation.service.ts`
- `packages/repository/src/application-server/services/repository-resolution.service.ts`
- `packages/repository/src/application-server/services/stored-resource-hydration.service.ts`
- `packages/repository/src/application-server/use-cases/commands/upload-resources.use-case.ts`

#### 判断

`repository` 已经明显完成了本轮最重要的 deepening：composition root 不再持有主要 workflow implementation。这项可以判定为“已实现”。但从优雅度看，mutation seam 的类型边界和 upload 语义集中度还不够强，因此不能判定为“已完全优雅实现”。

### 3. `goal`

#### 状态

已落地，但 application seam 仍有 DTO 泄漏。

#### 已实现内容

- `GoalController` 已明显回归薄 adapter：
  - `getAggregate()`
  - `getProgressBreakdown()`
  - `cloneGoal()`
  - `batchUpdateKeyResultWeights()`
    现在均直接委派独立 use case
- 新增的 deep workflow seam 已建立：
  - `GetGoalAggregateUseCase`
  - `GetGoalProgressBreakdownUseCase`
  - `CloneGoalUseCase`
  - `BatchUpdateKeyResultWeightsUseCase`
- route 侧 list query alias 已集中到 `normalizeGoalListQuery(...)`
- 对应 workflow seam 拥有独立测试面，route contract spec 也保持通过

#### 未优雅 / 未完成点

1. `GetGoalAggregateUseCase` 仍然先 `goal.toClientDTO(true)`，再基于 DTO 计算 statistics
2. `CloneGoalUseCase` 仍然先把 aggregate 转为 `GoalClientDTO`，再回推 create payload
3. 这意味着 controller orchestration 虽然消失了，但 aggregate read-model 的一部分知识仍通过 client DTO 形式泄漏到 application layer

#### 证据

- `packages/goal/src/controllers/goal.controller.ts`
- `packages/goal/src/api/routes/goal.routes.ts`
- `packages/goal/src/application-server/use-cases/queries/get-goal-aggregate.use-case.ts`
- `packages/goal/src/application-server/use-cases/queries/get-goal-progress-breakdown.use-case.ts`
- `packages/goal/src/application-server/use-cases/commands/clone-goal.use-case.ts`
- `packages/goal/src/application-server/use-cases/commands/batch-update-key-result-weights.use-case.ts`

#### 判断

`goal` 已经完成了本轮 deepening 的主目标，尤其是 controller 收口这一点已经成立。但从实现纯度看，新的 workflow seam 还没有完全摆脱 DTO 中介，因此更准确的判断是“已实现，但未完全优雅”。

### 4. `ai`

#### 状态

关键 deepening 目标尚未完成。

#### 已实现内容

- 当前模块仍保留原有 use case、service 和 API 组装能力
- knowledge auto-index runtime contribution 已独立存在
- chat、goal generation、knowledge、analytics 等能力仍可工作在现有结构下

#### 未优雅 / 未完成点

1. top-level `ai.module.ts` 仍承担 runtime mode 判定
2. top-level `ai.module.ts` 仍承担 capability descriptor 计算
3. top-level `ai.module.ts` 仍承担 direct / remote 依赖组合逻辑
4. `AIApplicationPort` 仍通过 `if (!services.xxx)` 逐项判空处理 unavailable capability
5. `packages/ai/src/api/module.ts` 仍通过 `services.*` presence guard 决定是否允许 API 模块创建
6. 计划中的 runtime split 产物尚未建立：

- `direct-provider-ai.runtime`
- `remote-ai-service.runtime`
- runtime-owned capability surface

#### 证据

- `packages/ai/src/infrastructure-server/ai.module.ts`
- `packages/ai/src/api/module.ts`
- `packages/ai/src/infrastructure-server/runtime/knowledge-auto-index.runtime.ts`

#### 判断

`ai` 当前仍然是一个由 top-level composition root 维护 capability matrix 的模块。它不满足本轮 deepening 方案要求的“runtime 自己拥有 capability 和 unavailable surface”的目标，因此不能判定为已完成，更谈不上优雅实现。

## 验证记录

本次诊断在 2026-05-07 进行了实际测试验证。

由于当前环境中 `pnpm nx ...` 在沙箱内会触发 `spawn EPERM`，本次验证改为直接在各包目录运行：

```bash
pnpm vitest run --config vitest.config.ts
```

验证结果如下：

### `packages/repository`

- 结果: 通过
- Test Files: `11 passed`
- Tests: `54 passed`

### `packages/goal`

- 结果: 通过
- Test Files: `54 passed`
- Tests: `297 passed`

### `packages/schedule`

- 结果: 通过
- Test Files: `22 passed`
- Tests: `262 passed`

### `packages/ai`

- 结果: 未全绿
- Test Files: `22 passed`, `1 failed`
- Tests: `201 passed`, `1 failed`
- 失败用例:
  - `packages/ai/src/api/routes/ai-chat.routes.spec.ts`
  - 用例名: `delete conversation response schema is not z.any()`

该失败说明 `ai` 当前不仅 runtime split 未完成，连 public route contract seam 也存在至少一个未对齐测试基线的问题。

## 问题分级

### P0

#### `ai` runtime module split 尚未落地

这不是“还有些遗留小问题”，而是本轮 `ai` deepening 的核心目标未实现。当前复杂度仍集中在 top-level module，而不是 runtime-specific module。

#### `ai` route contract 测试存在失败

在其他三个服务端模块测试都为绿色的情况下，`ai` 仍有 public seam spec 失败，说明它当前不适合被归类为“完成态”。

### P1

#### `goal` application seam 中仍存在 DTO 泄漏

controller 已经变薄，但 aggregate / clone workflow 还没有完全摆脱 client DTO 中介。

#### `repository` mutation seam 的类型边界与职责边界仍偏宽

composition root 已变薄，但 mutation service 与 upload use case 之间还存在职责切分不够干净的问题。

### P2

#### active 计划文档状态与代码现状存在漂移

- `repository` 执行文档仍写“待实施”，但代码已大体落地
- `goal` 执行文档仍写“待实施”，但代码已大体落地
- `ai` 文档状态与代码状态基本一致，仍属于待完成项

## 整改建议

### 1. 先处理 `ai`

固定优先级最高。原因：

- 它是当前唯一核心结构目标未完成的服务端模块
- 它也是当前唯一在包级测试中仍有 public seam 失败的 deepening 项

本轮整改应优先完成：

- runtime split
- runtime-owned capability surface
- top-level presence guard 删除
- route contract 失败修复

### 2. 然后回收 `goal` 与 `repository` 的剩余不优雅点

`goal` 优先修复：

- aggregate statistics 计算对 client DTO 的依赖
- clone workflow 通过 DTO 回推 payload 的实现方式

`repository` 优先修复：

- `ResourceMutationService` 的返回类型
- upload workflow 中剩余的 folder / path orchestration 泄漏

### 3. 最后同步 active 文档状态

在不改变既有实施方案内容的前提下，应至少同步以下信息：

- `repository` 不再是“待实施”
- `goal` 不再是“待实施”
- `ai` 仍是当前未完成项

## 最终判断

若按“是否已经优雅实现”给当前服务端 deepening 打结论：

- `schedule`: 是
- `repository`: 基本不是，属于“已实现但未完全优雅”
- `goal`: 基本不是，属于“已实现但未完全优雅”
- `ai`: 否

因此，本轮服务端 deepening 的整体状态应表述为：

> `schedule` 已形成可复用样板，`repository` 与 `goal` 已完成主要结构回收但仍需收尾，`ai` 仍是本轮未完成的核心阻塞项。
