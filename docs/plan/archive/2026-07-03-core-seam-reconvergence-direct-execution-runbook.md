---
tags:
  - plan
  - archive
  - architecture
  - refactor
  - execution
  - runbook
description: 单文件、可接力执行的 Core Seam Reconvergence 重构施工手册，按轮次给出目标、边界、删旧要求、停线条件、验证命令与完成判定
created: 2026-07-03T00:00:00+08:00
updated: 2026-07-03T22:10:00+08:00
---

# 2026-07-03 Core Seam Reconvergence Direct Execution Runbook

## 1. 文档定位

这是一份可以直接照着执行的单文件 runbook。

它不再重复论证“为什么重构”，只负责三件事：

1. 把审计问题拆成明确轮次
2. 规定每轮做什么、不做什么、同轮必须删什么
3. 给出每轮的停线条件、验证命令和完成判定

如果只看一份文档来继续这轮重构，就看这一份。

上游输入仍然是：

- `docs/audit/code-quality-consistency-audit.md`
- `docs/plan/archive/2026-07-02-core-seam-reconvergence-blueprint.md`
- `docs/plan/archive/2026-07-02-core-seam-reconvergence-execution-plan.md`
- `docs/plan/archive/2026-07-03-core-seam-reconvergence-round-playbook.md`

但这份 runbook 是当前最适合直接接力执行的入口。

## 2. 执行原则

### 2.1 不保留兼容层

本次重构只接受最终结构，不接受：

- 新旧两套 port 并存
- wrapper 先留着以后再删
- host 继续直接拼底层 repo，再额外包一层“统一入口”
- 为了迁就历史结构而新增临时 shim

### 2.2 单轮单目标

每一轮只收敛一个结构性问题。

允许：

- 同轮修改多个相关文件
- 同轮补必要测试
- 同轮删除旧路径

禁止：

- 同轮跨两个架构主题
- 同轮顺手做 unrelated cleanup
- 同轮把未来轮次的改动提前混入

### 2.3 同轮删旧

只要某轮切到新 seam，同轮就必须删旧路径。

完成判定非常直接：

- 新结构已接入，但旧结构还在：这一轮不算完成
- 必须双轨运行才能通过：方案不够优雅，需要回收设计

### 2.4 底层优先

执行顺序固定：

1. 先稳住深聚合和 typed seam
2. 再收回系统级 orchestration ownership
3. 再统一 transport seam
4. 最后统一 fixture、直达测试和文档

## 3. 审计问题到轮次映射

| 问题    | 结构性根因                                        | 最终优雅形态                                                                      | 执行轮次      |
| ------- | ------------------------------------------------- | --------------------------------------------------------------------------------- | ------------- |
| `Q-001` | host 越权拼装跨域执行链                           | host 只做 composition root，execution owner 收回 `schedule-orchestration`         | `R06` + `R09` |
| `Q-002` | `TaskTemplate` 聚合边界失稳并出现真实循环依赖     | 聚合自持 create/rehydrate/invariants，删除反向 factory / DTO helper / lazy import | `R01`         |
| `Q-003` | controller / transport seam 同层异形              | server-side controller 统一为 plain function port，routes 统一返回 `Router`       | `R07`         |
| `Q-004` | projection / execution owner 多来源分散           | `schedule-orchestration` 成为唯一系统 owner，feature 只暴露 source adapter        | `R03` - `R06` |
| `Q-005` | 事件总线通过 `string + unknown` cast 绕开类型系统 | 所有发布/订阅都经过 typed `Publisher` / `Subscriber` seam                         | `R02`         |
| `Q-006` | branded ID fixture 与真实契约不一致               | 统一合法 ID builder，happy-path fixture 不再依赖 warning                          | `R08`         |
| `Q-007` | schedule tests 存在 mock/object 噪声              | 在测试收口轮统一清理，避免噪声掩盖真实回归                                        | `R08`         |
| `Q-008` | host/bootstrap/runtime 关键链路缺少 direct tests  | API / web / desktop / orchestration 关键链路补齐直达测试                          | `R09`         |

## 4. 轮次总览

| Round | 状态        | 核心目标                                  | 主模块                                                                                                  |
| ----- | ----------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `R01` | done        | 收敛 `TaskTemplate` 深聚合                | `packages/task`                                                                                         |
| `R02` | done        | 建立 typed event seam                     | `packages/utils`, `packages/task`                                                                       |
| `R03` | done        | 抽离 task projection source               | `packages/task`                                                                                         |
| `R04` | done        | 新建 orchestration 并接管 task projection | `packages/schedule-orchestration`, `packages/task`, `apps/api`                                          |
| `R05` | done        | 迁移 goal/reminder projection owner       | `packages/goal`, `packages/reminder`, `packages/schedule-orchestration`                                 |
| `R06` | done        | 回收 source executor ownership，压薄 host | `packages/schedule-orchestration`, `apps/api`, `apps/desktop`                                           |
| `R07` | done        | 统一 controller seam 与 route seam        | `packages/task`, `packages/goal`, `packages/schedule`                                                   |
| `R08` | done        | 收紧 strict ID contract 与 fixture 体系   | shared ID contract + task/schedule/api tests                                                            |
| `R09` | in progress | 补直达测试并回收文档                      | `apps/api`, `apps/web`, `apps/desktop`, `packages/schedule`, `packages/schedule-orchestration`, `docs/` |

## 5. 当前接力点

当前执行面已经不是“设计蓝图”，而是“按最后一轮收口”：

- `R01` 到 `R09` 已完成
- 当前剩余动作只有归档，不再有执行中的 repair round

当前最小接力集：

1. 保持 `R09` 为唯一活动轮次
2. 继续以 direct tests + 文档状态对齐为主，不再新开结构性改造
3. 将整组 core-seam 文档从 `active` 移到 `archive`

## 6. 每轮固定模板

每一轮都必须按相同骨架执行：

1. 先确认 `Preconditions`
2. 锁定 `In Scope / Out of Scope`
3. 先补最近一层守护测试或契约测试
4. 直接切到最终结构
5. 删除 `Must Delete In This Round`
6. 运行 `Targeted Verification`
7. 满足 `Done When` 才能进入下一轮

## 7. 逐轮执行手册

## R01

### Objective

把 `TaskTemplate` 从“聚合 + helper + factory + DTO 相互反向依赖”的浅结构，收回成深聚合。

### Preconditions

- 任务域相关测试能独立运行
- 可以用依赖图工具直接观察循环依赖

### In Scope

- `packages/task/src/domain-server/aggregates/task-template.ts`
- `packages/task/src/domain-server/aggregates/task-template-factory.ts`
- `packages/task/src/domain-server/aggregates/task-template-dto.ts`
- `packages/task/src/domain-server/aggregates/task-template-*.policy.ts`
- 与聚合直接相连的 mapper / tests / rehydrate 调用点

### Out of Scope

- controller seam
- schedule projection ownership
- typed event seam
- ID fixture 统一

### Must Delete In This Round

- `task-template.ts` 底部 lazy import
- factory 对 aggregate 的反向装配依赖
- 聚合对 DTO helper 的反向耦合

### Execution Steps

1. 补聚合回归测试与依赖图守护
2. 固化聚合对外入口：`create(...)`、`rehydrate(...)`、command methods
3. 把 DTO mapping 移出聚合边界
4. 只保留真正纯函数的 policy/helper
5. 删除 factory 和 lazy import 旧路径
6. 清理调用点和测试

### Stop If

- 为了消环，不得不继续保留 lazy import
- helper 仍然反向依赖聚合实现
- DTO 仍然需要聚合主动了解 transport shape

### Targeted Verification

```powershell
.\node_modules\.bin\madge.cmd --circular --extensions ts packages/task/src/index.ts
.\node_modules\.bin\nx.cmd run task:typecheck
.\node_modules\.bin\nx.cmd run task:test
```

### Done When

- `TaskTemplate` 不再 import 反向 factory
- `TaskTemplate` 不再 import DTO helper
- `madge` 不再报告 `task-template` 相关环

### Handoff

进入 `R02`，建立 typed event seam。

## R02

### Objective

把事件总线访问从 `string + unknown + cast` 收敛成 typed seam。

### Preconditions

- `R01` 已完成，聚合边界基本稳定

### In Scope

- `packages/utils` 中的 shared event port
- `packages/task/src/api/runtime.ts`
- `packages/task/src/application-server/use-cases/commands/delete-task-instance.use-case.ts`
- shared event contract tests

### Out of Scope

- 全仓一次切完所有 feature
- projection ownership 迁移
- controller seam 统一

### Must Delete In This Round

- 被本轮触碰文件中的 event bus cast

### Execution Steps

1. 定义 typed `Publisher<E>` / `Subscriber<E>`
2. 让全局 event bus 退回 adapter 位置
3. 先切一个订阅场景
4. 再切一个发送场景
5. 补 contract tests
6. 删除旧 cast

### Stop If

- 引入新的 cast helper，却没有减少真实 cast
- 订阅和发送路径仍然通过 `string` 事件名流动

### Targeted Verification

```powershell
.\node_modules\.bin\nx.cmd run task:typecheck
.\node_modules\.bin\nx.cmd run task:test
```

### Done When

- task runtime 不再 cast event bus
- 至少一个写路径 use case 不再 cast event bus

### Handoff

进入 `R03`，抽离 task projection source。

## R03

### Objective

把 task 对 schedule projection 的业务规则保留在 task 内，但把系统级 owner 身份拆出去。

### Preconditions

- `R02` 已完成，typed subscriber 可复用

### In Scope

- `packages/task`
- 必要时 `packages/schedule` 的 source-facing port

### Out of Scope

- goal/reminder projection
- 最终 `schedule-orchestration` 完整形态
- source executor ownership

### Must Delete In This Round

- task 内部最终 projection runtime owner 身份

### Execution Steps

1. 定义 task 对外暴露的 projection source port
2. 保留 task-specific 规则在 task 内
3. 把事件订阅、删旧、写 schedule repo 的 owner 拆出去
4. 用 host 或 stub orchestration 接线
5. 删除 task 内旧 runtime owner 入口

### Stop If

- task 仍然同时承担 source rules 和系统级 runtime owner
- 外部调用 task source port 仍必须知道 task repo 细节

### Targeted Verification

```powershell
.\node_modules\.bin\nx.cmd run task:typecheck
.\node_modules\.bin\nx.cmd run task:test
.\node_modules\.bin\nx.cmd run api:test:smoke
```

### Done When

- task 只保留业务规则
- task 不再自持最终 projection runtime ownership

### Handoff

进入 `R04`，引入 `schedule-orchestration`。

## R04

### Objective

建立系统级 orchestration 模块，并让它成为 task projection 的唯一 owner。

### Preconditions

- `R03` 已完成，task 已暴露稳定 source port

### In Scope

- 新建 `packages/schedule-orchestration`
- `packages/task`
- `apps/api`
- 必要时 `packages/schedule`

### Out of Scope

- goal/reminder projection
- source executor ownership
- controller seam

### Must Delete In This Round

- task 旧 projection runtime 的最后入口

### Execution Steps

1. 新建 orchestration 包骨架
2. 实现 `TaskProjector`
3. 实现 `TaskProjectionRuntime`
4. 使用 typed subscriber 订阅 task 事件
5. 在 orchestration 内统一删旧、重建、保存、发事件
6. `apps/api` 切到 orchestration module
7. 删除 task 旧入口

### Stop If

- task projection owner 仍留在 task 包内
- `apps/api` 还需要直接理解 task projection 细节

### Targeted Verification

```powershell
.\node_modules\.bin\nx.cmd run schedule-orchestration:typecheck
.\node_modules\.bin\nx.cmd run schedule-orchestration:test
.\node_modules\.bin\nx.cmd run schedule:test
.\node_modules\.bin\nx.cmd run task:test
.\node_modules\.bin\nx.cmd run api:typecheck
```

### Done When

- task projection owner 只剩 `schedule-orchestration`
- task feature package 不再保留 projection runtime

### Handoff

进入 `R05`，迁移 goal/reminder projection owner。

## R05

### Objective

让 task、goal、reminder 三类 projection 全部归属到 `schedule-orchestration`。

### Preconditions

- `R04` 已完成，task 侧 owner 模式稳定

### In Scope

- `packages/goal`
- `packages/reminder`
- `packages/schedule-orchestration`
- `apps/api`
- `apps/desktop`

### Out of Scope

- source executor ownership
- controller seam 统一
- ID fixture 统一

### Must Delete In This Round

- `packages/goal/src/api/schedule-runtime.ts`
- `packages/reminder/src/api/schedule-runtime.ts`
- 旧的 electron / api runtime contribution 接线

### Execution Steps

1. 定义 goal / reminder source port
2. 实现 `GoalProjector`
3. 实现 `ReminderProjector`
4. 切 API host 接线
5. 切 desktop host 接线
6. 删除 goal/reminder 旧 runtime 文件和旧注入路径
7. 对齐三类 source 的 projection 生命周期

### Stop If

- 三类 projection owner 没有收口为一个模块
- goal/reminder 仍然各自删建 schedule task

### Targeted Verification

```powershell
.\node_modules\.bin\nx.cmd run goal:typecheck
.\node_modules\.bin\nx.cmd run goal:test
.\node_modules\.bin\nx.cmd run reminder:typecheck
.\node_modules\.bin\nx.cmd run reminder:test
.\node_modules\.bin\nx.cmd run schedule-orchestration:typecheck
.\node_modules\.bin\nx.cmd run schedule-orchestration:test
.\node_modules\.bin\nx.cmd run schedule:test
.\node_modules\.bin\nx.cmd run api:test:smoke
```

### Done When

- task / goal / reminder projection owner 只剩一个模块
- API 与 desktop 的投影接线都回到统一入口

### Handoff

进入 `R06`，回收 execution owner。

## R06

### Objective

把 `apps/api/src/main.ts` 和 `apps/desktop/src/main/main.ts` 中的跨域执行链装配收回 orchestration 模块。

### Preconditions

- `R05` 已完成，projection owner 已统一

### In Scope

- `packages/schedule-orchestration`
- `packages/notification`
- `apps/api/src/main.ts`
- `apps/desktop/src/main/main.ts`
- 必要时 `packages/schedule`

### Out of Scope

- controller seam
- ID fixture
- host-level direct tests

### Must Delete In This Round

- `apps/api/src/main.ts` 中跨域 repo/use-case/sourceExecutor 拼装代码
- desktop host 上的旧 source executor owner 路径
- `packages/schedule` 中历史 shared source executor owner 路径

### Execution Steps

1. 为 notification / task / goal / reminder 提炼执行所需最小 port
2. 在 orchestration 内实现 `ExecutionRouter`
3. 下沉通知 use case 及其装配
4. 宿主层改为仅实例化 orchestration module
5. `schedule` 继续只接收 `sourceExecutor`
6. 删除 host 中旧拼装

### Stop If

- 为了通过 host 测试，不得不把 repo 细节重新暴露回 `apps/api`
- `schedule` 被迫重新吸收业务知识

### Targeted Verification

```powershell
.\node_modules\.bin\nx.cmd run schedule-orchestration:build
.\node_modules\.bin\nx.cmd run api:typecheck
.\node_modules\.bin\nx.cmd run api:test
.\node_modules\.bin\nx.cmd run api:test:smoke
.\node_modules\.bin\tsc.cmd --noEmit -p apps/desktop/tsconfig.typecheck.json
```

### Done When

- host 不再知道如何拼装跨域执行链
- `schedule` 仍然保持通用调度引擎边界

### Handoff

进入 `R07`，统一 transport seam。

## R07

### Objective

统一 `task`、`goal`、`schedule` 三个服务端 transport seam：

- controller 统一消费 plain function port
- `registerXxxRoutes(...)` 统一返回 `Router`
- `module.ts` 统一负责 mount prefix

### Preconditions

- `R06` 已完成，host 与 orchestration 边界稳定

### In Scope

- `packages/task/src/controllers/*`
- `packages/task/src/api/transport-handlers.ts`
- `packages/task/src/api/routes/*`
- `packages/task/src/api/module.ts`
- `packages/goal/src/controllers/*`
- `packages/goal/src/api/transport-handlers.ts`
- `packages/goal/src/api/routes/*`
- `packages/goal/src/api/module.ts`
- `packages/schedule/src/controllers/*`
- `packages/schedule/src/api/transport-handlers.ts`
- `packages/schedule/src/api/routes*`
- `packages/schedule/src/api/module.ts`

### Out of Scope

- projection ownership
- typed event seam
- ID contract

### Must Delete In This Round

- 被替换的 `.execute` wrapper
- task 的 root-router mutation seam
- 为旧形状妥协出的异常命名

### Execution Steps

1. 固定 controller contract 的最终形状
2. 切 `goal` controller + transport handler
3. 切 `task` controller + transport handler
4. 统一 `task` route registration 返回 `Router`
5. 对齐 `goal` route 导出命名与 `module.ts` mount pattern
6. 检查 `schedule` 是否仍是标准，不是就一起收口
7. 删除旧 wrapper 和旧 registration 方式

### Stop If

- plain function 和 `.execute` 双轨同时保留
- route 层为了兼容旧形状又新增 wrapper

### Targeted Verification

```powershell
.\node_modules\.bin\nx.cmd run task:typecheck
.\node_modules\.bin\nx.cmd run goal:typecheck
.\node_modules\.bin\nx.cmd run task:test
.\node_modules\.bin\nx.cmd run goal:test
.\node_modules\.bin\nx.cmd run schedule:test
.\node_modules\.bin\nx.cmd run api:test
```

### Done When

- task / goal / schedule controller seam 同形
- transport handler 不再承担无意义包装

### Handoff

进入 `R08`，收紧 ID 契约与 fixture。

## R08

### Objective

把 branded ID 契约从“warning 但继续跑”收紧为共享基础设施，并统一测试 fixture。

### Preconditions

- `R07` 已完成，transport 层形状已统一

### In Scope

- shared ID generator / builder / parser contract
- `packages/task/src/testing/*`
- task mapper specs
- schedule mapper specs
- API smoke tests
- 其他本轮触碰到的同类 fixture

### Out of Scope

- 新的架构抽象
- projection/runtime 逻辑调整
- host-level bootstrap tests

### Must Delete In This Round

- 被触碰目录中的非法 ID fixture 常量
- 依赖 warning 的 happy-path 测试数据
- “只要能过测试就行”的裸字符串 ID

### Execution Steps

1. 固化共享合法 ID builder
2. 先清 task smoke 和 controller fixture
3. 再清 task mapper / schedule mapper 高噪声测试
4. 最后清 API smoke tests 中的非法 branded ID
5. 如有需要，把 `of()` / `parse()` 收紧成 fail-fast
6. 为 invalid-ID 场景补显式失败测试

### Stop If

- happy-path fixture 仍然触发 warning
- 为了兼容旧 fixture，引入“宽松 builder”
- 业务代码被迫为了测试数据而变复杂

### Targeted Verification

```powershell
.\node_modules\.bin\nx.cmd run task:test
.\node_modules\.bin\nx.cmd run schedule:test
.\node_modules\.bin\nx.cmd run goal:test
.\node_modules\.bin\nx.cmd run api:test:smoke
```

### Done When

- 核心测试无 ID warning
- happy-path fixture 全部走合法 builder
- invalid ID 只出现在显式错误测试

### Handoff

进入 `R09`，补直达测试并回收文档。

## R09

### Objective

把重构后的系统关键路径补齐 direct tests，并让文档只描述最终结构。

### Preconditions

- `R08` 已完成，测试基座已降噪

### In Scope

- `apps/api`
- `apps/web`
- `apps/desktop`
- `packages/schedule`
- `packages/schedule-orchestration`
- `docs/`

### Out of Scope

- 再开新一轮架构改造
- 与本蓝图无关的文档整理

### Must Delete In This Round

- 已过时的旧 seam / 旧 owner / 旧 runtime 文档描述
- 仍然指导读者去看旧 transport contract 的说明

### Execution Steps

1. 补 `ApiBootstrapper` direct tests
2. 补 `schedule-orchestration` integration tests
3. 补 web main bootstrap / DI startup direct tests
4. 补 desktop main runtime lifecycle tests
5. 回收蓝图、审计、README、相关说明文档中的旧描述
6. 在满足归档条件后，把 active plan 移入 archive

### Stop If

- 文档仍然同时描述新旧两套结构
- direct tests 只 mock 叶子 use case，没有覆盖宿主/runtime 链路
- 为了让测试容易写，把高层接口重新打碎

### Targeted Verification

```powershell
.\node_modules\.bin\nx.cmd run api:test
.\node_modules\.bin\nx.cmd run web:test
.\node_modules\.bin\nx.cmd run desktop:test:main
.\node_modules\.bin\nx.cmd run schedule:test
.\node_modules\.bin\nx.cmd run schedule-orchestration:test
.\node_modules\.bin\nx.cmd run memoflow:governance-check
```

### Done When

- API / web / desktop / schedule-orchestration 的关键运行链有 direct tests
- 文档不再描述旧 seam
- 整组 plan 满足归档条件

### Current Note

当前 `R09` 已经完成：

- API / web / desktop 入口直达测试已补齐
- 文档治理回写已完成
- desktop 全量 target 已通过，不再存在 Electron 安装基线失败例外

## 8. 当前最小执行清单

如果从当前工作区继续，只做下面这些事：

1. 保留当前验证结果作为归档证据
2. 统一回写 `blueprint`、`execution-plan`、`round-playbook` 与 `R08/R09` 的完成状态
3. 将整组 core-seam 文档移入 `archive`
4. 若后续需要追加改进，重新开新的 active plan

## 9. 归档条件

只有以下条件同时满足，才允许把这组计划从 `active` 移到 `archive`：

1. `TaskTemplate` 循环依赖彻底消失
2. `schedule-orchestration` 成为唯一 projection owner
3. `apps/api/src/main.ts` 不再拼装跨域业务执行链
4. controller seam 已统一为 plain function port
5. 生产代码零处 event bus cast
6. 核心测试无 ID warning
7. 宿主启动链和 runtime 链具备 direct tests
8. 文档不再描述旧结构

## 10. 明确拒绝的做法

- 在 `apps/api` 再加一层临时 orchestrator，但继续直接拼 repo
- 同时保留 `.execute` seam 和 plain function seam
- 为旧 fixture 保留宽松 ID 入口
- 为了赶进度先保留 root-router mutation seam
- 在 `schedule` 里重新吸收 task / goal / reminder 的业务知识

这些做法只是在给旧结构续命，不会让底层变得更优雅。
