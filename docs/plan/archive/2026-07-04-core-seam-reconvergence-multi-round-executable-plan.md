---
tags:
  - plan
  - archive
  - architecture
  - refactor
  - execution
  - rounds
description: 将 Core Seam Reconvergence 审计结论直接拆成单文件、多轮、可顺序执行的重构方案，强调底层优先、同轮删旧、无兼容层
created: 2026-07-04T00:00:00+08:00
updated: 2026-07-04T19:20:00+08:00
---

# 2026-07-04 Core Seam Reconvergence Multi-Round Executable Plan

## 2026-07-04 implementation review status

本计划对应的 `core-seam reconvergence` 主线，按当前代码真值可以判定为：**结构目标已经实现，归档状态成立，不应再作为 active plan 重新打开。**

当前已确认与本计划终态一致的事实：

1. `TaskTemplate` 深聚合收敛已落地：
   - `task-template-factory.ts` 已删除
   - `task-template-dto.ts` 已删除
   - `TaskTemplate` 状态已收回聚合/状态模块自身
2. feature 自持的旧 projection runtime 路径已删除：
   - `packages/task/src/api/schedule-runtime.ts`
   - `packages/goal/src/api/schedule-runtime.ts`
   - `packages/reminder/src/api/schedule-runtime.ts`
3. `packages/schedule-orchestration` 已成为 projection / execution owner，API 与 desktop host 都通过它接 projection runtime 与 source executor。
4. server-side transport seam 已基本统一到 plain function port + returned `Router` 形态。
5. direct tests 已补到宿主启动链路：
   - `apps/api/src/bootstrap.spec.ts`
   - `apps/web/src/bootstrap/app.spec.ts`
   - `apps/desktop/src/renderer/bootstrap/app.spec.ts`
6. 本计划针对的“event bus cast seam”已经收口，typed `Publisher` / `Subscriber` 基础设施已落地。

需要明确的一点是：

1. 本计划关闭的是 **core seam 主链中的 typed event cast/residue**
2. 它并不等于“全仓任何位置都不再直接调用原始 `eventBus.on/send` API”
3. 当前剩余的 raw `eventBus.on/send` 更多属于后续的优雅收口与治理加严，不应回溯性地判成 `core-seam reconvergence` 未完成

因此本文件的当前角色应固定为：

1. `core-seam reconvergence` 的归档执行总方案
2. 证明宿主 / orchestration / transport / direct-test 主线已经完成的历史证据
3. 新一轮优雅重构的前置背景，而不是新的 active 入口

后续如继续推进残余优雅收口，应使用 `docs/plan/active/2026-07-04-post-core-seam-elegant-refactor-plan.md`，只处理：

1. `reminder` 厚 facade 残留
2. `notification` 剩余 facade orchestration
3. 高价值 raw `eventBus.on/send` seam typed 化与治理固化

## 1. 文档定位

这是一份单文件、可直接接力执行的重构方案文档。

它基于以下真值来源：

1. [code-quality-consistency-audit.md](D:/home/projects/memoflow/docs/audit/code-quality-consistency-audit.md)
2. 当前代码与测试
3. [2026-07-02-core-seam-reconvergence-blueprint.md](D:/home/projects/memoflow/docs/plan/archive/2026-07-02-core-seam-reconvergence-blueprint.md)
4. [2026-07-02-core-seam-reconvergence-execution-plan.md](D:/home/projects/memoflow/docs/plan/archive/2026-07-02-core-seam-reconvergence-execution-plan.md)

本文件的目标不是重复讲“为什么重构”，而是把审计问题直接拆成可执行轮次，供后续 focused repair pass 顺序推进。

## 2. 目标终态

本次重构追求的是更深的 Module，而不是更多的文件或更多的包装层。

目标终态固定如下：

1. `apps/api`、`apps/desktop`、`apps/web` 只做宿主层 composition root。
2. `packages/task` 的 `TaskTemplate` 重新成为稳定的深聚合，不再依赖 lazy import、反向 factory、DTO helper。
3. `packages/schedule-orchestration` 成为唯一的系统级 projection / execution owner。
4. `packages/schedule` 只保留通用调度引擎能力，不重新吸收 task / goal / reminder / notification 的业务知识。
5. server-side controller seam 统一为 plain function port，route registration 统一为 returned `Router`。
6. 事件发布和订阅统一经过 typed `Publisher` / `Subscriber` seam。
7. branded ID 契约严格一致，happy-path fixture 不再依赖 warning。
8. API / web / desktop / runtime 核心链路具备 direct tests。

## 3. 执行铁律

### 3.1 不保留兼容层

禁止以下做法：

1. 新旧两套 port 并存
2. 先包 wrapper 以后再删
3. 在 host 外面加一层 orchestrator，但 host 仍继续拼 repo
4. 为旧 fixture 保留“宽松模式”
5. 用 cast helper 掩盖事件总线类型逃逸

### 3.2 同轮删旧

每一轮只要切到了新结构，同轮必须删掉对应旧路径。

如果出现以下情况，视为该轮未完成：

1. 新结构已接入，但旧结构仍在
2. 为了通过测试，必须保留双轨运行
3. 旧 shim 仍承担真实生产职责

### 3.3 底层优先

执行顺序必须固定为：

1. 先收敛深聚合和 typed seam
2. 再收回 projection / execution owner
3. 再统一 transport seam
4. 最后收紧 ID contract、补直达测试、回写文档

### 3.4 一轮只做一个结构目标

允许：

1. 同轮改多个相关文件
2. 同轮补最近一层测试
3. 同轮同步删旧路径

禁止：

1. 一轮顺手做 unrelated cleanup
2. 一轮同时处理两个架构主题
3. 一轮把未来轮次的方案提前混入

## 4. 执行前置

在正式进入分轮修复前，先做一次基线冻结：

1. 记录当前 `git status --short`
2. 记录与本计划相关的 Existing Failure
3. 只对当前轮次的目标模块运行 targeted verification
4. 不把无关失败误判为本轮回归

命令规范：

1. 仓库标准命令写法仍以 `pnpm nx run ...` 为准
2. 若当前环境触发 `ERR_PNPM_IGNORED_BUILDS`，允许使用 `.\node_modules\.bin\nx.cmd run ...` 作为本地 fallback
3. 后续每轮报告里都必须明确写清使用了哪一种命令

## 5. 审计问题映射

| 问题 ID | 结构性根因                                        | 最终优雅形态                                                                      | 对应轮次      |
| ------- | ------------------------------------------------- | --------------------------------------------------------------------------------- | ------------- |
| `Q-001` | host 越权拼装跨域执行链                           | host 只做 composition root，execution owner 收回 `schedule-orchestration`         | `R06` + `R09` |
| `Q-002` | `TaskTemplate` 聚合边界失稳并出现真实循环依赖     | 聚合自持 create/rehydrate/invariants，删除反向 factory / DTO helper / lazy import | `R01`         |
| `Q-003` | controller / transport seam 同层异形              | 全部统一成 plain function port + returned `Router`                                | `R07`         |
| `Q-004` | projection / execution owner 多来源分散           | `schedule-orchestration` 成为唯一系统 owner，feature 只暴露 source adapter        | `R03` - `R06` |
| `Q-005` | 事件总线通过 `string + unknown` cast 绕开类型系统 | 所有发布/订阅都经过 typed `Publisher` / `Subscriber` seam                         | `R02`         |
| `Q-006` | branded ID fixture 与真实契约不一致               | 统一合法 ID builder，happy-path fixture 不再依赖 warning                          | `R08`         |
| `Q-007` | schedule tests 存在 mock/object 噪声              | 在测试收口轮清理噪声，避免掩盖真实回归                                            | `R08`         |
| `Q-008` | host/bootstrap/runtime 关键链路缺少 direct tests  | API / web / desktop / orchestration 关键链路补齐直达测试                          | `R09`         |

## 6. 轮次总览

| Round | 目标                                      | 主模块                                                                                                  | 同轮必须删除                                        | 完成信号                               |
| ----- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------------------------- |
| `R01` | 收敛 `TaskTemplate` 深聚合                | `packages/task`                                                                                         | lazy import、反向 factory、聚合对 DTO helper 的认知 | `task-template` 相关环消失             |
| `R02` | 建立 typed event seam                     | `packages/utils`, `packages/task`                                                                       | 被触碰文件中的 event bus cast                       | 至少一条真实发布路径和订阅路径完成切换 |
| `R03` | 抽离 task projection source               | `packages/task`                                                                                         | task 内部最终 projection runtime owner              | task 只保留业务规则                    |
| `R04` | 新建 orchestration 并接管 task projection | `packages/schedule-orchestration`, `packages/task`, `apps/api`                                          | task 旧 projection runtime 最后入口                 | task projection owner 单一化           |
| `R05` | 迁移 goal/reminder projection owner       | `packages/goal`, `packages/reminder`, `packages/schedule-orchestration`                                 | goal/reminder 旧 runtime 文件与接线                 | 三类 projection owner 单一化           |
| `R06` | 回收 source executor ownership，压薄 host | `packages/schedule-orchestration`, `packages/notification`, `apps/api`, `apps/desktop`                  | host 里的跨域执行链拼装                             | host 回到纯 composition root           |
| `R07` | 统一 controller seam 与 route seam        | `packages/task`, `packages/goal`, `packages/schedule`                                                   | `.execute` wrapper、task root-router mutation seam  | transport 层同形                       |
| `R08` | 收紧 strict ID contract 与 fixture 体系   | shared ID contract + task/schedule/api tests                                                            | 依赖 warning 的 happy-path fixture                  | 核心测试无 ID warning                  |
| `R09` | 补直达测试并回收文档                      | `apps/api`, `apps/web`, `apps/desktop`, `packages/schedule`, `packages/schedule-orchestration`, `docs/` | 过时旧 seam 文档描述                                | 关键链路有 direct tests，文档闭环      |

## 7. 分轮执行方案

## R01：Task 深聚合收敛

### 目标

把 `TaskTemplate` 从“聚合 + factory + DTO helper + policy helper 相互反向依赖”的浅结构，收回成一个真正深的聚合 Module。

### In Scope

1. `packages/task/src/domain-server/aggregates/task-template.ts`
2. `packages/task/src/domain-server/aggregates/task-template-factory.ts`
3. `packages/task/src/domain-server/aggregates/task-template-dto.ts`
4. `packages/task/src/domain-server/aggregates/task-template-*.policy.ts`
5. 与聚合边界直接相连的 mapper / tests / rehydrate 调用点

### Out of Scope

1. controller seam
2. schedule projection ownership
3. typed event seam
4. ID fixture 统一

### 设计动作

1. 补依赖图守护和聚合级回归测试
2. 固化聚合对外入口：`create(...)`、`rehydrate(...)`、command methods
3. 把 DTO mapping 移出聚合边界
4. 只保留真正纯函数的 policy/helper
5. 删除 factory 与 lazy import 旧路径

### 同轮必须删除

1. `task-template.ts` 底部 lazy import
2. factory 对 aggregate 的反向装配依赖
3. 聚合内对 DTO helper 的反向耦合

### 停线条件

1. 为了消环，不得不继续保留 lazy import
2. helper 仍反向依赖聚合实现
3. DTO 仍需要聚合了解 transport shape

### Targeted Verification

```powershell
pnpm nx run task:test
pnpm nx run task:typecheck
.\node_modules\.bin\madge.cmd --circular --extensions ts packages/task/src/index.ts
```

### 完成判定

1. `TaskTemplate` 不再 import 反向 factory
2. `TaskTemplate` 不再 import DTO helper
3. `madge` 不再报告 `task-template` 相关环

## R02：Typed Event Seam Foundation

### 目标

把事件总线访问从 `string + unknown + cast` 收敛成 typed seam。

### In Scope

1. `packages/utils` 中的 shared event port
2. `packages/task/src/api/runtime.ts`
3. `packages/task/src/application-server/use-cases/commands/delete-task-instance.use-case.ts`
4. shared event contract tests

### Out of Scope

1. 全仓一次切完所有 feature
2. projection ownership 迁移
3. controller seam 统一

### 设计动作

1. 定义 typed `Publisher<E>` / `Subscriber<E>`
2. 让全局 `eventBus` 退回 adapter 位置
3. 先切一个真实订阅路径
4. 再切一个真实发送路径
5. 补 contract tests

### 同轮必须删除

1. 被本轮触碰文件中的 event bus cast

### 停线条件

1. 引入新的 cast helper，却没有减少真实 cast
2. 订阅和发送路径仍通过 `string` 事件名流动

### Targeted Verification

```powershell
pnpm nx run task:typecheck
pnpm nx run task:test
```

### 完成判定

1. task runtime 不再 cast event bus
2. 至少一个写路径 use case 不再 cast event bus

## R03：Task Projection Source 抽离

### 目标

把 task 对 schedule projection 的业务规则保留在 task 内，但把系统级 runtime owner 身份拆出去。

### In Scope

1. `packages/task`
2. 必要时 `packages/schedule` 的 source-facing port

### Out of Scope

1. goal/reminder projection
2. 最终 `schedule-orchestration` 完整形态
3. source executor ownership

### 设计动作

1. 定义 task 对外暴露的 projection source port
2. 保留 task-specific 规则在 task 内
3. 把事件订阅、删旧、写 schedule repo 的 owner 拆出去
4. 由 host 或临时 orchestration stub 接线

### 同轮必须删除

1. task 内部最终 projection runtime owner 身份

### 停线条件

1. task 仍同时承担 source rules 和系统级 runtime owner
2. 外部调用 task source port 仍必须知道 task repo 细节

### Targeted Verification

```powershell
pnpm nx run task:typecheck
pnpm nx run task:test
pnpm nx run api:test:smoke
```

### 完成判定

1. task 只保留业务规则
2. task 不再自持最终 projection runtime ownership

## R04：引入 Schedule Orchestration 并接管 Task Projection

### 目标

建立真正的系统级 orchestration Module，并让它成为 task projection 的唯一 owner。

### In Scope

1. 新建 `packages/schedule-orchestration`
2. `packages/task`
3. `apps/api`
4. 必要时 `packages/schedule`

### Out of Scope

1. goal/reminder projection
2. source executor ownership
3. controller seam

### 设计动作

1. 新建 orchestration 包骨架
2. 实现 `TaskProjector`
3. 实现 `TaskProjectionRuntime`
4. 使用 typed subscriber 订阅 task 事件
5. 在 orchestration 内统一删旧、重建、保存、发事件
6. `apps/api` 切到 orchestration module

### 同轮必须删除

1. task 旧 projection runtime 的最后入口

### 停线条件

1. task projection owner 仍留在 task 包内
2. `apps/api` 还需要直接理解 task projection 细节

### Targeted Verification

```powershell
pnpm nx run schedule-orchestration:typecheck
pnpm nx run schedule-orchestration:test
pnpm nx run schedule:test
pnpm nx run task:test
pnpm nx run api:typecheck
```

### 完成判定

1. task projection owner 只剩 `schedule-orchestration`
2. task feature package 不再保留 projection runtime

## R05：迁移 Goal / Reminder Projection Owner

### 目标

让 task、goal、reminder 三类 projection 全部归属到 `schedule-orchestration`。

### In Scope

1. `packages/goal`
2. `packages/reminder`
3. `packages/schedule-orchestration`
4. `apps/api`
5. `apps/desktop`

### Out of Scope

1. source executor ownership
2. controller seam 统一
3. ID fixture 统一

### 设计动作

1. 定义 goal / reminder source port
2. 实现 `GoalProjector`
3. 实现 `ReminderProjector`
4. 切 API host 接线
5. 切 desktop host 接线
6. 对齐三类 source 的 projection 生命周期

### 同轮必须删除

1. `packages/goal/src/api/schedule-runtime.ts`
2. `packages/reminder/src/api/schedule-runtime.ts`
3. 旧的 electron / api runtime contribution 接线

### 停线条件

1. 三类 projection owner 没有收口为一个模块
2. goal/reminder 仍各自删建 schedule task

### Targeted Verification

```powershell
pnpm nx run goal:typecheck
pnpm nx run goal:test
pnpm nx run reminder:typecheck
pnpm nx run reminder:test
pnpm nx run schedule-orchestration:typecheck
pnpm nx run schedule-orchestration:test
pnpm nx run schedule:test
pnpm nx run api:test:smoke
```

### 完成判定

1. task / goal / reminder projection owner 只剩一个模块
2. API 与 desktop 的投影接线都回到统一入口

## R06：回收 Source Executor Ownership，压薄 Host

### 目标

把 `apps/api/src/main.ts` 和 `apps/desktop/src/main/main.ts` 中的跨域执行链装配收回 orchestration 模块。

### In Scope

1. `packages/schedule-orchestration`
2. `packages/notification`
3. `apps/api/src/main.ts`
4. `apps/desktop/src/main/main.ts`
5. 必要时 `packages/schedule`

### Out of Scope

1. controller seam
2. ID fixture
3. host-level direct tests

### 设计动作

1. 为 notification / task / goal / reminder 提炼执行所需最小 port
2. 在 orchestration 内实现 `ExecutionRouter`
3. 下沉通知 use case 及其装配
4. 宿主层改为只实例化 orchestration module
5. `schedule` 继续只接收 `sourceExecutor`

### 同轮必须删除

1. `apps/api/src/main.ts` 中跨域 repo/use-case/sourceExecutor 拼装代码
2. desktop host 上的旧 source executor owner 路径
3. `packages/schedule` 中历史 shared source executor owner 路径

### 停线条件

1. 为了通过 host 测试，不得不把 repo 细节重新暴露回 `apps/api`
2. `schedule` 被迫重新吸收业务知识

### Targeted Verification

```powershell
pnpm nx run schedule-orchestration:build
pnpm nx run api:typecheck
pnpm nx run api:test
pnpm nx run api:test:smoke
pnpm nx run desktop:test:main
```

### 完成判定

1. host 不再知道如何拼装跨域执行链
2. `schedule` 仍然保持通用调度引擎边界

## R07：统一 Controller Seam 与 Route Seam

### 目标

统一 `task`、`goal`、`schedule` 三个 server-side transport seam：

1. controller 统一消费 plain function port
2. `registerXxxRoutes(...)` 统一返回 `Router`
3. `module.ts` 统一负责 mount prefix

### In Scope

1. `packages/task/src/controllers/*`
2. `packages/task/src/api/transport-handlers.ts`
3. `packages/task/src/api/routes/*`
4. `packages/task/src/api/module.ts`
5. `packages/goal/src/controllers/*`
6. `packages/goal/src/api/transport-handlers.ts`
7. `packages/goal/src/api/routes/*`
8. `packages/goal/src/api/module.ts`
9. `packages/schedule/src/controllers/*`
10. `packages/schedule/src/api/transport-handlers.ts`
11. `packages/schedule/src/api/routes*`
12. `packages/schedule/src/api/module.ts`

### Out of Scope

1. projection ownership
2. typed event seam
3. ID contract

### 设计动作

1. 固定 controller contract 的最终形状
2. 切 `goal` controller + transport handler
3. 切 `task` controller + transport handler
4. 统一 `task` route registration 返回 `Router`
5. 对齐 `goal` route 导出命名与 `module.ts` mount pattern
6. 检查 `schedule` 是否仍是标准，不是就一起收口

### 同轮必须删除

1. 被替换的 `.execute` wrapper
2. task 的 root-router mutation seam
3. 为旧形状妥协出的异常命名

### 停线条件

1. plain function 和 `.execute` 双轨同时保留
2. route 层为了兼容旧形状又新增 wrapper

### Targeted Verification

```powershell
pnpm nx run task:typecheck
pnpm nx run goal:typecheck
pnpm nx run task:test
pnpm nx run goal:test
pnpm nx run schedule:test
pnpm nx run api:test
```

### 完成判定

1. task / goal / schedule controller seam 同形
2. transport handler 不再承担无意义包装

## R08：Strict ID Contract 与 Fixture 收敛

### 目标

把 branded ID 契约从“warning 但继续跑”收紧为共享基础设施，并统一测试 fixture。

### In Scope

1. shared ID generator / builder / parser contract
2. `packages/task/src/testing/*`
3. task mapper specs
4. schedule mapper specs
5. API smoke tests
6. 其他本轮触碰到的同类 fixture

### Out of Scope

1. 新的架构抽象
2. projection/runtime 逻辑调整
3. host-level bootstrap tests

### 设计动作

1. 固化共享合法 ID builder
2. 先清 task smoke 和 controller fixture
3. 再清 task mapper / schedule mapper 高噪声测试
4. 最后清 API smoke tests 中的非法 branded ID
5. 如有需要，把 `of()` / `parse()` 收紧成 fail-fast
6. 为 invalid-ID 场景补显式失败测试

### 同轮必须删除

1. 被触碰目录中的非法 ID fixture 常量
2. 依赖 warning 的 happy-path 测试数据
3. “只要能过测试就行”的裸字符串 ID

### 停线条件

1. happy-path fixture 仍然触发 warning
2. 为了兼容旧 fixture，引入“宽松 builder”
3. 业务代码被迫为了测试数据而变复杂

### Targeted Verification

```powershell
pnpm nx run task:test
pnpm nx run schedule:test
pnpm nx run goal:test
pnpm nx run api:test:smoke
```

### 完成判定

1. 核心测试无 ID warning
2. happy-path fixture 全部走合法 builder
3. invalid ID 只出现在显式错误测试

## R09：补直达测试并回收文档

### 目标

把重构后的系统关键路径补齐 direct tests，并让文档只描述最终结构。

### In Scope

1. `apps/api`
2. `apps/web`
3. `apps/desktop`
4. `packages/schedule`
5. `packages/schedule-orchestration`
6. `docs/`

### Out of Scope

1. 再开新一轮架构改造
2. 与本蓝图无关的文档整理

### 设计动作

1. 补 `ApiBootstrapper` direct tests
2. 补 `schedule-orchestration` integration tests
3. 补 web main bootstrap / DI startup direct tests
4. 补 desktop main runtime lifecycle tests
5. 回收蓝图、审计、README、相关说明文档中的旧描述
6. 满足归档条件后，把 active plan 移入 archive

### 同轮必须删除

1. 已过时的旧 seam / 旧 owner / 旧 runtime 文档描述
2. 仍然指导读者去看旧 transport contract 的说明

### 停线条件

1. 文档仍然同时描述新旧两套结构
2. direct tests 只 mock 叶子 use case，没有覆盖宿主/runtime 链路
3. 为了让测试容易写，把高层接口重新打碎

### Targeted Verification

```powershell
pnpm nx run api:test
pnpm nx run web:test
pnpm nx run desktop:test:main
pnpm nx run schedule:test
pnpm nx run schedule-orchestration:test
pnpm nx run memoflow:governance-check
```

### 完成判定

1. API / web / desktop / schedule-orchestration 的关键运行链有 direct tests
2. 文档不再描述旧 seam
3. 整组 plan 满足归档条件

## 8. 每轮固定执行模板

后续每一轮都按下面的顺序推进：

1. 锁定本轮 `In Scope / Out of Scope`
2. 先补最近一层守护测试或契约测试
3. 直接引入最终结构，而不是过渡包装
4. 切调用点到最终结构
5. 删除本轮必须消失的旧路径
6. 运行 targeted verification
7. 回写本轮状态、阻塞点和下一轮接力条件

## 9. 归档条件

只有以下条件同时满足，才允许把本计划从 `active` 移到 `archive`：

1. `TaskTemplate` 循环依赖彻底消失
2. `schedule-orchestration` 成为唯一 projection owner
3. `apps/api/src/main.ts` 不再拼装跨域业务执行链
4. controller seam 已统一为 plain function port
5. 生产代码零处 event bus cast
6. 核心测试无 ID warning
7. 宿主启动链和 runtime 链具备 direct tests
8. 文档不再描述旧结构

## 10. 推荐执行入口

如果只选择一份文档作为后续接力入口，就使用本文件。

建议执行方式：

1. 从 `R01` 顺序推进到 `R09`
2. 每轮只做该轮目标
3. 每轮完成后回写状态
4. 不在主线上保留任何兼容层或双轨路径

这份方案故意把“优雅”落在底层 seam 和 owner 收敛上，而不是落在更花哨的 adapter 包装上。真正的完成标志不是文件变多，而是复杂度回收到更少、更深、更稳的 Module 里。
