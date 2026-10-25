---
tags:
  - plan
  - active
  - web
  - typecheck
  - contracts
  - app-vue
description: 修复 web:typecheck 中由 branded ID 收紧和 app-vue DI 类型退化引发的失败链
created: 2026-05-12T00:00:00
updated: 2026-05-12T00:00:00
status: active
---

# Web Typecheck 失败链修复方案

## 文档定位

这份文档是当前 `web:typecheck` 失败链的唯一 active 实施计划，目标不是做一次宽泛的类型清扫，而是把当前 CI 红灯对应的两条根因链路完整收口，让后续 agent 可以直接按步骤实现并验收。

本轮计划聚焦：

- `apps/web` mock handlers 与 contracts branded ID 漂移
- `packages/app-vue` 中 `AI / Task / Goal` 的 DI 类型边界退化
- 由上述边界退化传导出的 `AIChatView.vue`、`useTask.ts`、`useTaskGoalBindingOptions.ts` 类型错误

本轮不做：

- `app-vue` 全量 DI `any` 清扫
- 无关模块的类型风格统一
- 通过 `as any` / 宽断言做临时消音

## 当前真值（基于 2026-05-12 代码与失败日志）

### 失败链 1：web mocks 未跟上 branded DTO

当前失败集中在：

- `apps/web/src/mocks/handlers/notification.handlers.ts`
- `apps/web/src/mocks/handlers/repository.handlers.ts`
- `apps/web/src/mocks/handlers/task.handlers.ts`

根因不是 MSW 本身，而是 contracts 的 DTO 已经把多类 `id` 收紧成 branded primitive，但 handlers 仍在直接把：

- `params.id`
- `body.resourceId`
- 手写的 `'task-a'` / `'dep-1'` / `faker.string.uuid()`

作为裸 `string` 写回 DTO 字段。

已确认受影响字段包括：

- `NotificationId`
- `BookmarkId`
- `ResourceId`
- `TaskTemplateId`
- `TaskInstanceId`
- `TaskDependencyId`

另外，`task.handlers.ts` 中 `createMockTaskDependency()` 仍在写入 `TaskDependencyClientDTO` 已不存在的字段：

- `version`
- `deletedAt`

这不是局部报错，而是 DTO 真值已经变化，mock 工厂还停留在旧形状。

### 失败链 2：app-vue 的服务边界被弱化成 unknown

`packages/app-vue/src/di/types.ts` 当前存在两类问题：

- `IGoalService`、`ITaskService` 仍是 `PublicInterface<any>`
- `IAIService` 是手写接口，但大量方法返回 `Promise<unknown>`

这会让下游 composable 丢失真实返回类型，直接造成：

- `packages/app-vue/src/modules/task/composables/useTask.ts`
  - `result.data` 被推成 `unknown`
  - `.toDTO()`、`.map()` 无法安全推导
- `packages/app-vue/src/modules/task/composables/useTaskGoalBindingOptions.ts`
  - helper 自己把 `Result<T>` 弱化成 `{ ok: boolean; data?: T }`
  - `ok` 从字面量判别联合退化成普通 `boolean`
  - `result.data` 重新变成 `unknown`
- `packages/app-vue/src/modules/ai/views/AIChatView.vue`
  - `service` 无法赋值给 `AIChatService`
  - `goalExecutionSummary` 的类型推导方式错误
  - 缺失 `canRunWorkflowActions` 计算属性

## 目标与关闭条件

本计划完成后，必须同时满足以下条件：

- `pnpm nx run web:typecheck` 全量通过
- `apps/web` mock handlers 与当前 contracts DTO 形状一致
- `AI / Task / Goal` 三个服务在 `app-vue` 内恢复真实结构化类型
- `useTask.ts`、`useTaskGoalBindingOptions.ts`、`AIChatView.vue` 不再依赖 `unknown` 或伪结果类型
- 不引入新的 `as any`、`unknown as X` 作为主修复手段

## 实施方案

### 修复 web mocks 与 branded DTO 边界

修改文件：

- `apps/web/src/mocks/handlers/notification.handlers.ts`
- `apps/web/src/mocks/handlers/repository.handlers.ts`
- `apps/web/src/mocks/handlers/task.handlers.ts`

实施要求：

- 在每个 handler 文件内部定义最小本地 helper，把 `params/body` 收口到对应 DTO 字段类型。
- helper 只做边界收口，不新建共享 util，不扩散到其他模块。
- helper 返回值优先写成 `SomeDTO['field']` 形式，避免重复手写 primitive type import。

具体要求：

1. `notification.handlers.ts`

- 为 `params.id` 增加本地转换 helper，返回 `NotificationClientDTO['id']`
- `createMockNotification({ id: ... })` 全部改用该 helper
- 不改响应 shape，不改路由

2. `repository.handlers.ts`

- 保留已有 `toRepoId` / `toResourceId` 思路，但补齐 bookmark/search 场景的 typed helper
- `createMockResourceBookmark()` 中 `id` 与 `resourceId` 默认值都必须满足 DTO 类型
- `PATCH /bookmarks/:bookmarkId`、`reorder`、`POST /bookmarks` 中所有 bookmark/resource id 都必须走 typed helper
- `createMockRepositorySearchResponse()` 返回的 `results` 必须满足 `SearchResultItem[]`
- 重点修复 `resourceId`，不要再用 `as string`

3. `task.handlers.ts`

- `createMockTaskDependency()` 只返回 `TaskDependencyClientDTO` 真实存在字段
- 删除 `version`、`deletedAt` 的构造与覆盖
- 为 dependency/template/instance id 分别增加本地 typed helper
- 所有 `params.id`、`params.taskId`、`params.templateId`、默认手写 task id 都统一走 helper
- `createMockDependencyChain()` 的 `taskId` 也必须是 `DependencyChainClientDTO['taskId']`

### 恢复 app-vue 的真实服务边界

修改文件：

- `packages/app-vue/src/di/types.ts`

实施要求：

- 保持当前文件的设计原则：使用 inline `import()` + `PublicInterface<T>`，避免顶层 type import 触发 d.ts / `rootDir` 问题。
- 不顺手扩展到所有 service，只修当前失败链涉及的 `Goal / Task / AI`。

具体改动：

1. `IGoalService`

- 从 `PublicInterface<any>` 改为：
  `PublicInterface<import('@memoflow/goal/application-client').GoalClientService>`

2. `ITaskService`

- 从 `PublicInterface<any>` 改为：
  `PublicInterface<import('@memoflow/task/application-client').TaskClientService>`

3. `IAIService`

- 放弃当前手写的 `Promise<unknown>` 接口
- 改为：
  `PublicInterface<import('@memoflow/ai/application-client').AIClientService>`

注意事项：

- 不要保留一半手写、一半结构化的混合状态
- 不新增 wrapper type，直接让注入键看到真实 public method surface

## 修复 Task composables 的 Result<T> 漂移

修改文件：

- `packages/app-vue/src/modules/task/composables/useTask.ts`
- `packages/app-vue/src/modules/task/composables/useTaskGoalBindingOptions.ts`

实施要求：

1. `useTask.ts`

- 保持 `executeDesktopAuthenticatedResult` 为唯一错误恢复入口
- `executeTaskOperation<T>` 应显式返回 `Promise<Result<T>>`
- 所有 `service.*` 调用通过真实 `ITaskService` 签名推导 `T`
- 不要再用额外断言把 `result.data` 硬转成数组或对象
- 保持现有行为不变：
  - 列表实体仍 `.map(entity => entity.toDTO())`
  - 单体实体仍 `result.data.toDTO()`

2. `useTaskGoalBindingOptions.ts`

- `executeGoalBindingOperation<T>` 的 `operation` 参数改成 `() => Promise<Result<T>>`
- 移除自定义 `{ ok: boolean; data?: T; error?: ... }` 返回类型
- `loadGoals()` 必须直接消费 `GoalClientService.listGoals()` 的真实数据结构：
  - `result.data.goals`
  - `result.data.pagination`
- `loadKeyResults()` 必须直接消费 `GoalClientService.getKeyResults()` 的真实数据结构：
  - `result.data.keyResults`
- `mapGoalOption()`、`mapKeyResultOption()` 保留“兼容 domain entity / plain DTO”的思路，但类型基线不再从 `{}` / `unknown` 开始

## 修复 AIChatView 的类型与模板漏项

修改文件：

- `packages/app-vue/src/modules/ai/views/AIChatView.vue`

实施要求：

1. 补齐 `canRunWorkflowActions`

- 当前模板在知识笔记按钮上使用了该变量，但脚本内未定义
- 新增一个计算属性，语义与当前页面行为一致：
  - 有可用模型
  - 非 `chatLoading`
  - 非 `noteCreating`
  - 在 workflow 需要的前提满足时允许执行
- 不要把它做成与 `canRunGoalWorkflow` 强绑定；它服务于通用 workflow 操作，尤其是 note workflow

2. 修复 `goalExecutionSummary` 的状态类型引用

- 当前 `NonNullable<ReturnType<typeof goalExecutionSummary>>['status']` 是错误用法，因为 `goalExecutionSummary` 是 `ComputedRef`
- 改为从 value 层或明确 union type 派生
- 目标是让 `formatExecutionOutcome()` 的参数成为：
  - `'success' | 'partial' | 'failed'`

3. 利用 `IAIService` 修复结果，消除 service 赋值不兼容

- `useAI()` 返回的 `service`
- 传给 `useAIChatSession`
- 传给 `useAIGoalWorkflow`
- 传给 `useAIKnowledgeNoteWorkflow`
  都应在不额外断言的情况下通过类型检查

## 同步测试断言与验证

### 需要同步的测试

优先检查并修正：

- `apps/web/src/mocks/handlers/task.handlers.spec.ts`
- `apps/web/src/mocks/handlers/repository.handlers.spec.ts`

具体要求：

1. `task.handlers.spec.ts`

- 删除对 `createMockTaskDependency().version` 的断言
- 只断言当前 DTO 真实字段：
  - `predecessorTaskId`
  - `successorTaskId`
  - `dependencyType`

2. `repository.handlers.spec.ts`

- 如 branded helper 收口方式影响测试构造，保持断言语义不变，只修正类型构造方式
- 不扩大测试范围，不重写 spec 结构

### 验证顺序

按下面顺序执行，减少反馈成本：

1. 受影响 spec / 局部类型检查

- `repository.handlers.spec.ts`
- `task.handlers.spec.ts`

2. 全量验收

- `pnpm nx run web:typecheck`

如果 DI 收紧后暴露同链路新增错误，原则是：

- 只修与 `AI / Task / Goal` 真实边界直接相关的问题
- 不扩展到无关 service
- 直到 `web:typecheck` 通过再结束

## 实施约束

- 不允许用 `as any` 作为主修复路径
- 不引入共享“万能 ID cast util”
- 不修改 contracts 真值来迁就 web mocks
- 不改 HTTP adapter 路由和业务行为
- 不在 `app-vue` 新增另一套 service wrapper 层

## 风险与注意点

- `pnpm nx run web:typecheck` 会连带触发依赖包 build，耗时较长，属于正常验证成本
- `di/types.ts` 收紧后，可能暴露先前被 `any` 掩盖的同链路错误；这些错误应在本计划内一并修完
- `createLazyService()` 返回的是 Proxy，但类型层必须继续表现为真实 service 的 public interface；不要为 Proxy 特性再做额外类型兜底

## 交接说明

后续实施 agent 应按以下顺序工作：

1. 先改 `apps/web` mock handlers，清掉 branded DTO 失败链
2. 再收紧 `packages/app-vue/src/di/types.ts`
3. 然后修 `useTask.ts`、`useTaskGoalBindingOptions.ts`
4. 最后修 `AIChatView.vue`
5. 跑受影响 spec 和 `pnpm nx run web:typecheck` 做闭环

验收时只要 `web:typecheck` 仍未通过，就不能把本计划归档。
