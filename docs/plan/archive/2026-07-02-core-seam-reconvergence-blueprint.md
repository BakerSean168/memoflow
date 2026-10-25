---
tags:
  - plan
  - archive
  - architecture
  - refactor
  - blueprint
description: 基于 2026-07-02 代码审查结果的核心 Seam 收敛重构蓝图，目标是在不保留兼容层的前提下重建深 Module、统一 Interface、收敛调度与事件运行时
created: 2026-07-02T00:00:00+08:00
updated: 2026-07-03T20:54:00+08:00
---

# 2026-07-02 Core Seam Reconvergence Blueprint

## 1. 背景

本蓝图对应以下输入：

1. [code-quality-consistency-audit.md](D:/home/projects/memoflow/docs/audit/code-quality-consistency-audit.md)
2. 当前代码真值
3. 已采纳 ADR：
   - `ADR-020` API 只负责框架适配
   - `ADR-023` Composition Root 只在 infrastructure/runtime
   - `ADR-025` Module Composition Pattern
   - `ADR-026` Server-Side Adapter Pattern
   - `ADR-031` Server Feature Standard Shape
4. 现有 standards：
   - `docs/standards/domain-event-spec.md`
   - `docs/standards/id值对象生成id的实现.md`

本蓝图对应的逐轮实施文档见：

- `docs/plan/archive/2026-07-02-core-seam-reconvergence-execution-plan.md`
- `docs/plan/archive/2026-07-03-core-seam-reconvergence-round-playbook.md`
- `docs/plan/archive/2026-07-03-core-seam-reconvergence-direct-execution-runbook.md`
- `docs/plan/archive/2026-07-02-core-seam-reconvergence-r01-task-template-deep-aggregate.md`
- `docs/plan/archive/2026-07-02-core-seam-reconvergence-r02-typed-event-seam-foundation.md`
- `docs/plan/archive/2026-07-02-core-seam-reconvergence-r03-task-schedule-projection-source.md`
- `docs/plan/archive/2026-07-02-core-seam-reconvergence-r04-schedule-orchestration-task-owner.md`
- `docs/plan/archive/2026-07-02-core-seam-reconvergence-r05-goal-reminder-projection-owner.md`
- `docs/plan/archive/2026-07-02-core-seam-reconvergence-r06-source-executor-host-thinning.md`
- `docs/plan/archive/2026-07-02-core-seam-reconvergence-r07-controller-route-seam-unification.md`
- `docs/plan/archive/2026-07-02-core-seam-reconvergence-r08-strict-id-contract-fixtures.md`
- `docs/plan/archive/2026-07-02-core-seam-reconvergence-r09-host-runtime-tests-doc-alignment.md`

当前执行状态以该实施文档为准。  
本文件负责定义目标结构、边界与拒绝项；真正的多轮推进顺序、每轮验收条件、当前接力点，统一以下述执行文档与各轮独立文档为 canonical source。

如果需要一份可以直接顺序执行、并且已经拆到“每轮做什么、删什么、怎么验”的操作手册，请直接打开：

- `docs/plan/archive/2026-07-03-core-seam-reconvergence-direct-execution-runbook.md`
- `docs/plan/archive/2026-07-03-core-seam-reconvergence-round-playbook.md`

当前实施状态：

- `R01` done
- `R02` done
- `R03` done
- `R04` done
- `R05` done
- `R06` done
- `R07` done
- `R08` done
- `R09` done

当前工作区已完成 Core Seam Reconvergence 的全部既定轮次，并通过最终完成判定需要的主链路验证：

- `schedule-orchestration` 已完成 projection/execution owner 收敛
- task / goal / schedule 的 transport seam 已统一
- strict ID fixture 已在 task/schedule/goal/api-smoke/desktop-auth 核心面收口
- API / web / desktop 的 bootstrap 与 runtime 直达测试已补齐
- `madge` 无 task circular dependency，`task:test`、`goal:test`、`reminder:test`、`schedule:test`、`schedule-orchestration:test`、`api:test`、`api:test:smoke`、`web:test`、`desktop:test:main`、`desktop:test`、`memoflow:governance-check` 全部通过

本蓝图的执行目标已经达成；后续只保留为归档真值与历史收敛记录。

为避免“审计报告 -> 蓝图 -> 执行轮次”脱节，本蓝图固定采用以下问题映射：

| 审计问题 | 结构性根因                                        | 优雅终态                                                                          | 对应轮次      |
| -------- | ------------------------------------------------- | --------------------------------------------------------------------------------- | ------------- |
| `Q-001`  | host 越权拼装跨域执行链                           | host 只做 composition root，execution owner 收回 `schedule-orchestration`         | `R06` + `R09` |
| `Q-002`  | `TaskTemplate` 聚合边界失稳并出现真实循环依赖     | 聚合自持 create/rehydrate/invariants，删除反向 factory / DTO helper / lazy import | `R01`         |
| `Q-003`  | controller / transport seam 形状不统一            | server-side controller 统一改成 plain function port，routes 统一返回 `Router`     | `R07`         |
| `Q-004`  | projection / execution owner 多来源分散           | `schedule-orchestration` 成为唯一系统 owner，feature 只暴露 source adapter        | `R03` - `R06` |
| `Q-005`  | 事件总线通过 `string + unknown` cast 绕开类型系统 | 所有发布/订阅通过 typed `Publisher` / `Subscriber` seam                           | `R02`         |
| `Q-006`  | branded ID fixture 与真实契约不一致               | 统一合法 ID builder，happy-path fixture 不再依赖 warning                          | `R08`         |
| `Q-007`  | schedule test 自身存在 mock/object 噪声           | 在测试收口轮一并清理，确保测试噪声不会掩盖真实回归                                | `R08`         |
| `Q-008`  | host/bootstrap/runtime 关键链路缺少 direct tests  | API / web / desktop / orchestration 关键链路补齐直达测试                          | `R09`         |

当前最重要的结论已经从“继续回收 execution owner”转为“确认新结构完成收敛并归档”。  
`schedule-orchestration` 已经通过 `@memoflow/task|goal|reminder/schedule-projection` 与 `schedule-execution` 窄公共出口接管 projection / execution owner；API / web / desktop 的 bootstrap 直达测试和计划文档状态也已经完成对齐。

当前代码主体结构并没有崩坏，问题集中在几条关键 Seam 已经变浅：

1. `apps/api/src/main.ts` 知道太多跨域业务细节
2. `TaskTemplate` 聚合被 helper / factory / DTO / policy 反向缠绕
3. schedule projection 的事实来源被拆散到 `task` / `goal` / `reminder`
4. controller/use-case transport seam 形状不统一
5. typed event seam 被字符串 cast 绕开
6. ID 契约在测试中被弱化成“警告但通过”

这不是“逐点修小 bug”的问题，而是需要把几个浅 Module 收回成更深的 Module，让调用方重新获得更高的 **Leverage**，让维护者重新获得更高的 **Locality**。

## 2. 本蓝图的核心决策

### 2.1 这是一次收敛，不是一次兼容迁移

本蓝图明确遵守仓库策略：

- 不保留兼容层
- 不保留双轨 Interface
- 不保留 deprecated wrapper
- 不保留“新旧两套 runtime 并存”
- 不保留“先加一层 adapter 以后再删”的长期过渡结构

允许的唯一“过渡”是：在单个分支、单个 repair pass 内部暂时改到一半；但合并前必须删除旧路径，让主干只剩最终形态。

### 2.2 重构目标不是“拆更多文件”，而是做更深的 Module

本次重构要避免两类伪优化：

1. 只把大文件拆成更多小文件，但 Interface 没有变深
2. 只用 wrapper / adapter 把现状包起来，但复杂度仍散在 N 个调用点

判断标准使用 deletion test：

- 如果删除一个 Module，复杂度会重新回到多个调用点，那么这个 Module 是深的，应该保留并加深
- 如果删除一个 Module，复杂度只是消失或几乎不变，那么它是浅的，应该删除或并回

## 3. 最终目标形态

## 3.1 宿主层

`apps/api`、`apps/desktop`、`apps/web` 只承担宿主职责：

- 初始化驱动
- 实例化 Module
- 装配 Module 之间公开的 Interface
- 挂载 transport / runtime

宿主层不再直接知道：

- 任务/目标/提醒的具体 repository 细节
- 通知创建的具体 use-case 装配
- schedule projection 是如何删建 task 的

## 3.2 领域层

`domain-server` 重新回到纯领域职责：

- 聚合
- 实体
- 值对象
- 领域不变量
- 领域事件

领域聚合不再知道：

- DTO
- HTTP / IPC
- Prisma
- transport 层 handler 形状
- 为绕开循环依赖而存在的 lazy import

## 3.3 调度层

调度相关逻辑拆成两个深 Module：

1. `packages/schedule`
   - 通用调度引擎
   - `ScheduleTask` 生命周期
   - 队列、执行、重试、持久化
   - 不包含 task / goal / reminder 的业务知识

2. `packages/schedule-orchestration`
   - 统一的 schedule projection
   - 统一的 source execution routing
   - 跨域依赖的集中装配点
   - 是系统级 orchestration Module，不是单个业务 feature Module

## 3.4 transport seam

所有 server-side controller 的 Interface 统一为 plain function port，不再使用 `.execute` 对象形状作为 controller contract。

控制器最终只依赖：

```ts
interface XxxControllerPort {
  action(input, ctx): Promise<Result<...>>;
}
```

而不是：

```ts
interface XxxUseCases {
  action: { execute(input, ctx): Promise<Result<...>> };
}
```

## 3.5 event seam

所有运行时和 use-case 对事件总线的访问都通过 typed seam 完成：

- `Publisher<EventMap>`
- `Subscriber<EventMap>`

业务 Module 不再直接 cast 全局 `eventBus`。

## 3.6 ID 契约

所有 branded ID 都通过共享生成器与共享校验规则生成和还原：

- 非法 ID 不再 `warn and continue`
- 非法 ID 在 `of()` 或 `parse()` 处直接失败
- 测试 fixture 统一使用合法 ID builder

## 4. 目标结构图

```text
apps/api
  -> instantiate feature modules
  -> instantiate schedule-orchestration module
  -> instantiate schedule module
  -> mount API modules

packages/task
  -> deep task domain module
  -> exposes task module API + schedule projection source adapter

packages/goal
  -> deep goal domain module
  -> exposes goal module API + schedule projection source adapter

packages/reminder
  -> deep reminder domain module
  -> exposes reminder module API + schedule projection source adapter

packages/notification
  -> exposes notification command port

packages/schedule-orchestration
  -> projectors
  -> execution router
  -> projection runtime
  -> source executor

packages/schedule
  -> schedule engine
  -> schedule task aggregate
  -> queue/runtime
  -> transport
```

## 5. 目标 Module 设计

## 5.1 `packages/schedule-orchestration`

### 目标

把今天散落在：

- `apps/api/src/main.ts`
- `packages/task/src/api/schedule-runtime.ts`
- `packages/goal/src/api/schedule-runtime.ts`
- `packages/reminder/src/api/schedule-runtime.ts`

中的 Implementation 收到一个深 Module 里。

### 角色

这是系统 orchestration Module，不是业务 feature Module。它的价值是集中跨域复杂度，而不是暴露新的业务概念给产品。

### 对外 Interface

```ts
export interface ScheduleOrchestrationModule {
  readonly projectionRuntime: RuntimeContribution;
  readonly sourceExecutor: ScheduleTaskSourceExecutor;
}

export interface CreateScheduleOrchestrationModuleDeps {
  readonly taskSource: TaskScheduleProjectionSource;
  readonly goalSource: GoalScheduleProjectionSource;
  readonly reminderSource: ReminderScheduleProjectionSource;
  readonly notificationPort: ScheduleNotificationPort;
  readonly scheduleTaskRepository: IScheduleTaskRepository;
  readonly eventPublisher: Publisher<SystemEventMap>;
  readonly eventSubscriber: Subscriber<SystemEventMap>;
}
```

### 内部子 Module

- `TaskProjector`
- `GoalProjector`
- `ReminderProjector`
- `ScheduleProjectionRuntime`
- `ScheduleExecutionRouter`
- `NotificationScheduleActionAdapter`

### 设计规则

1. `task` / `goal` / `reminder` 不再自己创建 schedule runtime contribution
2. `schedule` 不再自己了解业务 source module 的内部规则
3. `apps/api` 不再自己拉四组 repo 拼 `sourceExecutor`
4. 删除旧投影 runtime 的同时切换到新 Module，不保留双轨

### 为什么这是深 Module

因为删除它之后，当前的跨域复杂度会重新散落回 `apps/api` 与三个 feature 包；它明显通过一个小 Interface 集中了承载复杂协作的 Implementation。

## 5.2 `packages/task` 的深聚合收敛

### 目标

把 `TaskTemplate` 从“聚合 + factory + DTO helper + policy helper 相互反向依赖”的状态，收回成真正深的聚合 Module。

### 最终规则

1. `TaskTemplate` 自己拥有：
   - `create(...)`
   - `rehydrate(...)`
   - 业务方法
   - 领域事件触发
2. DTO mapping 退出聚合
3. factory 不再反向 import 聚合
4. policy helper 只保留真正纯函数的部分
5. 删除 lazy import

### 推荐拆法

#### 聚合内部保留

- 构造时状态归一化
- 日期区间校验
- 生命周期命令
- recurrence / one-time / goal-binding 的聚合级不变量

#### 可以抽成纯函数 Module 的部分

- 只依赖 snapshot 的计算逻辑
- instance generation algorithm
- DTO serialization mapper

前提是这些 Module 不再反向依赖聚合类型实现。

### 禁止的最终形态

- `TaskTemplate` 继续 import DTO helper 再由 DTO helper import `TaskTemplate`
- `TaskTemplate` 底部继续 `import * as factory`
- 再引入新的 policy wrapper 去回避循环

## 5.3 统一 controller seam

### 目标

让 `task`、`goal`、`schedule` 的 controller 都依赖同一种 Interface。

### 统一规则

1. controller 只依赖 plain function port
2. transport handler 只有在“application facade 形状与 controller 形状不同”时才存在
3. 如果 application facade 已经同形，则直接传入，不保留无意义 pass-through Module

### 最终形态

#### `schedule`

保留当前“最接近最终形态”的风格，作为标准。

#### `task`

- controller port 改为 plain function
- `transport-handlers.ts` 仅作为必要的字段分组映射
- route registration 统一返回 Router，不直接改外部 root router

#### `goal`

- 删除 `{ execute: api.xxx }` 包装形状
- controller 直接消费 plain function port
- 删除为了 `.execute` 形状而存在的浅包装

### 顺带统一

本次一起统一 route registration seam：

- 所有 `registerXxxRoutes(...)` 返回 `Router`
- `module.ts` 负责 mount prefix
- 不再混用“返回 Router”和“直接改 rootRouter”两种模式

## 5.4 typed event seam

### 目标

让所有事件发布与订阅重新经过类型系统，而不是靠 `string + unknown`。

### 最终设计

```ts
interface Publisher<E> {
  send<K extends keyof E>(event: K, payload: E[K]): void;
}

interface Subscriber<E> {
  on<K extends keyof E>(event: K, handler: (payload: E[K]) => void): void;
  off<K extends keyof E>(event: K, handler: (payload: E[K]) => void): void;
}
```

### 使用位置

- 运行时 Module：注入 `Subscriber<...>`
- 手工发事件的 use-case：注入 `Publisher<...>`
- 全局 `eventBus` 只作为 Adapter，藏在 infra 层

### 收敛结果

删除以下形态：

- `eventBus as unknown as { on/off/send(...) }`
- 任意 `string` 事件名
- 任意 `unknown` payload

## 5.5 strict ID contract

### 目标

把 ID 从“最佳努力校验”改成“强约束 Interface”。

### 最终设计

1. 统一 `IdGenerator`
2. 统一 `createIdType(prefix)`
3. `of()` / `parse()` 默认执行强校验
4. 非法值直接抛错或返回 fail，不再只警告
5. 所有测试 fixture 调用 shared builders 生成合法 ID

### 设计要求

- 生产代码和测试代码共用同一套 ID 契约
- mapper / smoke / controller tests 不允许自造裸字符串 ID
- 若测试需要“非法 ID”场景，应显式写成 invalid-input test，而不是混在 happy path fixture 里

## 6. 详细执行方案

说明：本节按“结构主题”归纳，不等同于实际落地轮次顺序。  
直接实施时，请以执行文档中的 `R01` 到 `R09` 为唯一执行顺序。

## Phase 0: 先固化规则，再动实现

### 目标

避免“每个 repair pass 都重新讨论目标结构”。

### 本阶段产出

1. 本蓝图文档
2. 如有必要，补一份 ADR，明确：
   - `schedule-orchestration` 是系统级 orchestration Module
   - server-side controller seam 统一为 plain function
   - feature package 不再内建 schedule projection runtime

### 完成标志

- 团队对最终形态不再存在歧义
- 后续 repair pass 只讨论“如何落地”，不再讨论“要不要兼容旧 seam”

## Phase 1: Task 深聚合收敛

### 状态更新

- Date: 2026-07-02
- State: completed
- Outcome: `TaskTemplate` 的循环依赖已收敛；`TaskTemplateState` 已抽到独立状态模块；`task-template-factory.ts` 与 `task-template-dto.ts` 已删除；聚合不再通过 lazy import 和反向 helper 工作。
- Verification: `.\node_modules\.bin\madge.cmd --circular --extensions ts packages/task/src/index.ts` 通过，`.\node_modules\.bin\nx.cmd run task:typecheck` 通过，`.\node_modules\.bin\nx.cmd run task:test` 通过。
- Next seam: 进入 Phase 2 前，先按执行计划完成 R02 的 typed event seam 基础设施。

### 涉及文件

- `packages/task/src/domain-server/aggregates/task-template.ts`
- `packages/task/src/domain-server/aggregates/task-template-factory.ts`
- `packages/task/src/domain-server/aggregates/task-template-dto.ts`
- `packages/task/src/domain-server/aggregates/task-template-*.policy.ts`
- 相关 mapper / use-case / controller

### 动作

1. 先补依赖图守护和聚合级回归测试
2. 合并或删除浅 factory / helper
3. 把 DTO mapping 从聚合剥离到 mapper
4. 把聚合恢复为单向依赖
5. 删除 lazy import

### 本阶段禁止

- 为了减少 diff 再保留一层 `legacyFactory`
- 再加一个“中间 state helper”绕开循环

### 完成标志

- `madge` 无 task-template 环
- `TaskTemplate` 不再 import 任何反向 factory
- 聚合对 DTO 和 transport 零认知

## Phase 2: schedule-orchestration Module 引入并切断旧投影

### 状态更新

- Date: 2026-07-03
- State: completed
- Outcome: `R04`、`R05`、`R06` 已完成 projection / execution owner 收敛：`packages/schedule-orchestration` 已接管 task/goal/reminder projection 与 task/goal/reminder/notification execution routing；API/desktop host 已回到 source adapter + module composition 角色。
- Verification: `goal:typecheck`、`goal:test`、`reminder:typecheck`、`reminder:test`、`schedule-orchestration:typecheck`、`schedule-orchestration:test`、`schedule-orchestration:build`、`schedule:test`、`api:typecheck`、`api:test`、`api:test:smoke`、`.\node_modules\.bin\tsc.cmd --noEmit -p apps/desktop/tsconfig.typecheck.json` 通过。
- Next seam: `R09` 已完成，整组计划满足归档条件。

### 涉及范围

- 新建 `packages/schedule-orchestration`
- 修改 `packages/task`
- 修改 `packages/goal`
- 修改 `packages/reminder`
- 修改 `packages/schedule`
- 修改 `apps/api`
- 修改 `apps/desktop`

### 动作

1. 新建 orchestration Module skeleton
2. 为 task / goal / reminder 定义 projection source Interface
3. 各 feature Module 暴露 source adapter，不暴露底层 repo 细节
4. 在 orchestration Module 内部实现三类 projector 与 execution router
5. 删除 feature 包里旧的 schedule runtime contribution
6. `apps/api` 只实例化 orchestration Module 并传给 schedule Module

### 重要切换规则

- 新 orchestration Module ready 的同一个 pass 内，旧 `createTaskScheduleRuntimeContribution` / `createGoalScheduleRuntimeContribution` / `createReminderScheduleRuntimeContribution` 必须删除
- 不允许新 Module 上线后旧 runtime 仍留在 feature 包里“备用”

### 完成标志

- `apps/api/src/main.ts` 不再 import `create*PrismaRepositories` 来拼调度链
- feature 包不再拥有 schedule projection runtime
- 调度投影事实来源只剩一个 Module

## Phase 3: transport seam 统一

### 涉及范围

- `packages/task/src/controllers/*`
- `packages/goal/src/controllers/*`
- `packages/schedule/src/controllers/*`
- 对应 `api/transport-handlers.ts`
- 对应 `api/routes/*`

### 动作

1. 以 `schedule` 为标准重写 `task` 与 `goal` controller port
2. 删除 `.execute` 形状
3. task route registration 改成返回 `Router`
4. 统一 module.ts 中的 mount pattern

### 重要切换规则

- 同一个 feature 改 seam 时，controller、transport、routes、tests 同步切换
- 不允许同时保留两套 controller constructor 形状

### 完成标志

- 所有 server-side controller contract 是 plain function port
- `goal` 不再包 `{ execute: api.xxx }`
- `task` 不再混用 root router mutation 与 returned router

## Phase 4: typed event seam 与 strict ID contract

### Phase split note

这一主题在执行层已经拆成两轮：

1. `R02` 先完成 typed event seam foundation
2. `R08` 再统一 strict ID contract 与 fixture 体系

不要把两者重新并回一个超级 PR。

### 涉及范围

- `packages/utils/domain` 中的事件 Adapter
- `packages/task/src/api/runtime.ts`
- `packages/task/src/api/schedule-runtime.ts` 或其替代实现
- `packages/task/src/application-server/use-cases/commands/delete-task-instance.use-case.ts`
- ID builders / testing helpers / mapper specs / smoke tests

### 动作

1. 引入 typed publisher/subscriber seam
2. 切换 task runtime 与手工发事件 use-case
3. 删除所有 event bus casts
4. 统一 ID 生成 / 校验
5. 统一测试 fixture

### 重要切换规则

- 只要某个 Module 开始使用 typed seam，旧 cast 必须在同一 pass 删除
- 只要某个 test file 触碰 ID fixture，就改成合法 branded ID，不保留 warning 路径

### 完成标志

- 生产代码中零处 `eventBus as unknown as ...`
- smoke / mapper / schedule tests 无 ID warning
- 所有合法 fixture 都来自 shared builders

## Phase 5: host-level tests 与最终收尾

### 涉及范围

- `apps/api`
- `apps/web`
- `apps/desktop`
- `packages/schedule`
- `packages/schedule-orchestration`

### 动作

1. 补 API bootstrap tests
2. 补 schedule runtime / orchestration integration tests
3. 补 web bootstrap tests
4. 补 desktop main runtime lifecycle tests
5. 删除文档中已过时的旧 seam 说明

### 完成标志

- 宿主启动链有 direct tests
- 调度投影与执行链有 direct tests
- 文档不再描述旧 transport seam 和旧 runtime ownership

## 7. 推荐的最终目录变化

## 7.1 新增

```text
packages/schedule-orchestration/
  src/
    application-server/
    infrastructure-server/
    projectors/
    runtime/
    ports/
    index.ts
```

## 7.2 删除或回收

- `packages/task/src/api/schedule-runtime.ts`
- `packages/goal/src/api/schedule-runtime.ts`
- `packages/reminder/src/api/schedule-runtime.ts`
- `packages/task/src/domain-server/aggregates/task-template-factory.ts` 或其大部分职责
- 为 `.execute` 形状存在的 goal transport wrapper

## 7.3 收敛后保持更薄的文件

- `apps/api/src/main.ts`
- `packages/task/src/api/transport-handlers.ts`
- `packages/goal/src/api/transport-handlers.ts`

## 8. 风险与处理方式

## 8.1 最大风险：跨域切换时一次改动过大

处理方式：

- 按 Phase 切
- 每个 Phase 只做一个结构性目标
- 但在该目标内坚持“不保留旧 seam”

## 8.2 最大风险：把 schedule-orchestration 做成新的上帝 Module

处理方式：

- 对外只保留 `projectionRuntime` 和 `sourceExecutor` 两个 Interface
- 内部 Implementation 再按 projector / execution router 拆分
- 不在对外 Interface 里暴露 task/goal/reminder 的底层细节

## 8.3 最大风险：聚合重构时误把 DTO / mapper 逻辑重新塞回 use-case

处理方式：

- DTO mapping 明确归位到 mapper / controller adapter
- 聚合只接受领域输入，不接受 transport DTO

## 9. 每阶段的验证主线

## Phase 1

- `pnpm nx run task:test`
- `pnpm nx run task:typecheck`
- `.\node_modules\.bin\madge.cmd --circular --extensions ts packages/task/src/index.ts`

## Phase 2

- `pnpm nx run task:test`
- `pnpm nx run goal:test`
- `pnpm nx run reminder:test`
- `pnpm nx run schedule:test`
- `pnpm nx run api:test:smoke`

## Phase 3

- `pnpm nx run task:test`
- `pnpm nx run goal:test`
- `pnpm nx run schedule:test`
- `pnpm nx run api:test`

## Phase 4

- `pnpm nx run task:test`
- `pnpm nx run schedule:test`
- `pnpm nx run api:test:smoke`

## Phase 5

- `pnpm nx run api:test`
- `pnpm nx run web:test`
- `pnpm nx run desktop:test:main`
- `pnpm nx run schedule:test`
- `pnpm nx run memoflow:governance-check`

## 10. 完成判定

当以下条件同时满足时，本蓝图可从 `active` 移到 `archive`：

1. `apps/api/src/main.ts` 回到纯宿主级 Composition Root，不再拼装跨域业务细节
2. `TaskTemplate` 无循环依赖、无 lazy import、无 DTO 反向耦合
3. schedule projection 只剩一个 owner
4. server-side controller seam 全统一为 plain function port
5. 生产代码零处字符串事件总线 cast
6. 核心 smoke / mapper / runtime tests 不再输出 ID 格式 warning
7. API bootstrap、schedule runtime、web bootstrap、desktop runtime lifecycle 至少具备一层 direct tests

## 11. 建议的实施顺序

推荐严格按以下顺序推进：

1. `TaskTemplate` 深聚合收敛
2. `schedule-orchestration` 引入并切断旧投影
3. transport seam 统一
4. typed event seam + strict ID contract
5. host-level tests + 文档回收

原因很直接：

- 先稳住最底层聚合
- 再收掉最分散的跨域 orchestration
- 再统一上层 seam
- 最后补测试与回收文档

如果顺序反过来，测试和 adapter 只会围绕旧形态继续生长，增加清理成本。

## 12. 这份蓝图明确拒绝的方案

以下方案一律不采用：

1. 在 `apps/api` 再包一层临时 orchestrator，继续直接拼 repo
2. 继续保留 `task/goal/reminder` 各自的 schedule runtime，只在外层再加一个统一入口
3. 保留 `.execute` seam，同时再引入 plain function seam
4. 继续让 `TaskTemplate` 通过 lazy import 工作，只是把注释写得更清楚
5. 继续让非法 ID 在测试里 warning 通过
6. 为事件总线 cast 添加共享 helper，然后继续 cast

这些方案都只是在给浅 Module 化妆，不会真正提升 **Depth**、**Leverage** 和 **Locality**。
