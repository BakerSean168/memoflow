---
tags:
  - plan
  - archive
  - architecture
  - refactor
  - execution
  - rounds
description: Core Seam Reconvergence Blueprint 的多轮可执行实施手册，按底层优先、单轮单目标、同轮删旧路径的方式推进
created: 2026-07-02T00:00:00+08:00
updated: 2026-07-03T20:54:00+08:00
---

# 2026-07-02 Core Seam Reconvergence Execution Plan

## 1. 文档定位

本文件是以下蓝图的直接执行版：

- `docs/plan/archive/2026-07-02-core-seam-reconvergence-blueprint.md`
- `docs/plan/archive/2026-07-03-core-seam-reconvergence-round-playbook.md`
- `docs/plan/archive/2026-07-03-core-seam-reconvergence-direct-execution-runbook.md`

蓝图负责定义最终结构。  
本文件负责把蓝图拆成可以逐轮落地的实施顺序。

目标不是“列出很多想法”，而是形成一个可以按轮推进、按轮验收、按轮收口的重构手册。

## 1.1 拆分后的文档结构

本文件现在只负责：

- 维护总顺序
- 维护当前状态
- 维护轮次之间的依赖关系
- 指向每一轮的独立执行文档
- 指向可直接接力的 round playbook

每一轮的具体执行细节已经拆到独立文档，方便直接接力，不再要求在一份大文件里来回滚动查找。

如果需要一份“从当前工作区直接继续做”的操作手册，请优先打开：

- `docs/plan/archive/2026-07-03-core-seam-reconvergence-direct-execution-runbook.md`
- `docs/plan/archive/2026-07-03-core-seam-reconvergence-round-playbook.md`

| Round | 状态 | 独立执行文档                                                                                    |
| ----- | ---- | ----------------------------------------------------------------------------------------------- |
| R01   | done | `docs/plan/archive/2026-07-02-core-seam-reconvergence-r01-task-template-deep-aggregate.md`      |
| R02   | done | `docs/plan/archive/2026-07-02-core-seam-reconvergence-r02-typed-event-seam-foundation.md`       |
| R03   | done | `docs/plan/archive/2026-07-02-core-seam-reconvergence-r03-task-schedule-projection-source.md`   |
| R04   | done | `docs/plan/archive/2026-07-02-core-seam-reconvergence-r04-schedule-orchestration-task-owner.md` |
| R05   | done | `docs/plan/archive/2026-07-02-core-seam-reconvergence-r05-goal-reminder-projection-owner.md`    |
| R06   | done | `docs/plan/archive/2026-07-02-core-seam-reconvergence-r06-source-executor-host-thinning.md`     |
| R07   | done | `docs/plan/archive/2026-07-02-core-seam-reconvergence-r07-controller-route-seam-unification.md` |
| R08   | done | `docs/plan/archive/2026-07-02-core-seam-reconvergence-r08-strict-id-contract-fixtures.md`       |
| R09   | done | `docs/plan/archive/2026-07-02-core-seam-reconvergence-r09-host-runtime-tests-doc-alignment.md`  |

## 1.2 审计问题到执行轮次映射

这份文档现在直接承担“把审计问题拆成多轮可执行方案”的职责。  
后续执行者不需要再二次分解，只需要按表选择当前轮次并打开对应独立文档。

| 审计问题 | 当前风险                                       | 最终优雅形态                                                                | 执行轮次                             | 当前状态               |
| -------- | ---------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------ | ---------------------- |
| `Q-001`  | `apps/api` 越权装配跨域执行链                  | host 只做 module composition，execution owner 收回 `schedule-orchestration` | `R06`，并在 `R09` 补 bootstrap tests | `R06` done，`R09` done |
| `Q-002`  | `TaskTemplate` 真正循环依赖 + lazy import hack | 深聚合收敛，删除反向 factory / DTO helper                                   | `R01`                                | done                   |
| `Q-003`  | controller / transport contract 同层异形       | 全部统一成 plain function port + returned `Router`                          | `R07`                                | done                   |
| `Q-004`  | projection / execution owner 分散在多个模块    | `schedule-orchestration` 成为唯一系统 owner，feature 只保留 source ports    | `R03` - `R06`                        | `R03` - `R06` done     |
| `Q-005`  | 事件总线 cast 绕过类型系统                     | typed `Publisher` / `Subscriber` seam 成为唯一入口                          | `R02`                                | done                   |
| `Q-006`  | fixture 与 branded ID 契约漂移                 | 全部 happy-path fixture 使用合法 builder                                    | `R08`                                | done                   |
| `Q-007`  | schedule test 噪声会掩盖真实问题               | 在测试收口轮清理重复 mock/object shape 噪声                                 | `R08`                                | done                   |
| `Q-008`  | bootstrap/runtime 关键链路缺少直达测试         | API / web / desktop / orchestration 增加 direct tests                       | `R09`                                | done                   |

## 1.3 直接执行方式

如果只想“从现在开始按轮往下做”，直接按下面顺序行动：

1. 打开第一个 `in progress` 的轮次文档
2. 只执行该轮 `In Scope` 内的结构收敛
3. 同轮删除 `Must Delete In This Round` 中的旧路径，不保留兼容层
4. 跑该轮 `Targeted Verification`
5. 回写 `Status Note`，再进入下一轮

判断一轮是否足够“可执行”，统一看五个字段：

- `Objective`
- `In Scope / Out of Scope`
- `Must Delete In This Round`
- `Targeted Verification`
- `Exit Criteria`

## 2. 执行硬约束

### 2.1 单轮单目标

每一轮只允许完成一个明确的结构性目标。

允许：

- 一轮内修改多个文件
- 一轮内补必要测试
- 一轮内做同目标下的小步提交

禁止：

- 一轮同时改聚合、调度 ownership、controller seam、ID fixture
- 一轮顺手做 unrelated cleanup
- 一轮把“未来可能要改”的内容提前混进来

### 2.2 不保留兼容层

每一轮结束时必须只剩一种最终形态：

- 旧接口删除
- 旧 runtime ownership 删除
- 旧 wrapper / shim 删除
- 旧 helper 路径删除

不允许“先接入新结构，旧结构先留着备用”。

### 2.3 底层优先

顺序固定遵循：

1. 先收敛深聚合和 typed seam
2. 再回收系统级 orchestration ownership
3. 再统一 transport seam
4. 最后统一 fixture、测试和文档

原因很简单：如果底层不先稳住，上层测试和适配层只会继续围绕旧结构生长。

### 2.4 每轮都要可验证

每一轮都必须满足：

- 有明确的 targeted verification
- 有明确的退出条件
- 有明确的“本轮不做什么”
- 有明确的下轮接力条件

### 2.5 每轮结束后必须更新计划状态

每轮完成后至少更新：

1. 本文件中的轮次状态
2. 蓝图中的进度注记或下一轮链接

避免代码进入新世界，而计划文档还停留在旧世界。

## 3. 使用方式

执行时严格按下面流程：

1. 找到第一个 `Status: not started` 或 `Status: in progress` 的轮次
2. 只读取该轮涉及的模块和直接邻接调用点
3. 开工前确认本轮的 in scope / out of scope
4. 按“先测试守护，再改结构，再删旧路径，再验证”的顺序推进
5. 完成后写入 status note
6. 只有当前轮 exit criteria 满足，才进入下一轮

## 4. 总体轮次总览

| Round | 核心目标                                            | 主要模块                                                                                                | 必须同轮删除的旧路径                                  | 合并门槛                                        |
| ----- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------- |
| R01   | 收敛 `TaskTemplate` 深聚合                          | `packages/task`                                                                                         | lazy import、反向 factory、聚合对 DTO helper 的认知   | `task-template` 相关环消失                      |
| R02   | 建立 typed event seam 基础设施                      | `packages/utils`, `packages/task`                                                                       | 被触碰文件中的 event bus cast                         | task runtime 与写路径 use-case 至少一处真实切换 |
| R03   | 抽离 task 的 schedule projection source             | `packages/task`                                                                                         | task 内部最终 projection runtime ownership            | task 只保留业务规则，不保留系统 owner           |
| R04   | 新建 `schedule-orchestration`，接管 task projection | `packages/schedule-orchestration`, `packages/task`, `apps/api`                                          | task 旧 projection runtime 最后入口                   | task projection owner 单一化                    |
| R05   | 迁移 goal/reminder projection ownership             | `packages/goal`, `packages/reminder`, `packages/schedule-orchestration`, `apps/api`, `apps/desktop`     | goal/reminder 旧 runtime 文件与接线                   | 三类 projection owner 全收回                    |
| R06   | 回收 source executor ownership，压薄宿主层          | `packages/schedule-orchestration`, `packages/notification`, `apps/api`, `apps/desktop`                  | `apps/api/src/main.ts` 中跨域执行链拼装               | host 退回纯宿主级 composition root              |
| R07   | 统一 controller seam 与 route registration seam     | `packages/task`, `packages/goal`, `packages/schedule`                                                   | `.execute` wrapper、task 的 root-router mutation seam | controller contract 同形                        |
| R08   | 收紧 strict ID contract 与 fixture 体系             | shared ID contract + task/schedule/api tests                                                            | 依赖 warning 的 happy-path fixture                    | 核心测试无 ID warning                           |
| R09   | 补宿主启动链和 runtime 直达测试，清理文档           | `apps/api`, `apps/web`, `apps/desktop`, `packages/schedule`, `packages/schedule-orchestration`, `docs/` | 过时旧 seam 文档描述                                  | 关键运行链有 direct tests，文档回收完成         |

## 4.1 当前进度快照

- Completed: `R01`, `R02`, `R03`, `R04`, `R05`, `R06`, `R07`, `R08`, `R09`
- In progress: none
- Active blockers: none
- Final verification snapshot: `madge --circular`、`task:typecheck`、`task:test`、`goal:test`、`reminder:test`、`schedule:test`、`schedule-orchestration:test`、`api:test`、`api:test:smoke`、`web:test`、`desktop:test:main`、`desktop:test`、`memoflow:governance-check` 均已通过
- Current handoff: 该计划已完成，下一步应将整组 core-seam 计划从 `active` 移到 `archive`

## 4.2 当前接力点

当前多轮计划已经不是“从零开始设计”，也不再处于收尾阶段；它已经完成整轮执行：

1. `R01` 已完成 `TaskTemplate` 深聚合收敛
2. `R02` 已完成 typed event seam 基础设施，并先在 task runtime 与删除实例 use-case 落地
3. `R03` 已完成 task projection source 抽离与 host-level ownership 过渡
4. `R04` 与 `R05` 已完成 projection ownership 收敛，`schedule-orchestration` 已接管 task/goal/reminder 三条线
5. `R06`、`R07`、`R08` 已完成并回写状态
6. `R09` 已完成宿主入口直达测试、计划状态回写与治理检查收口

这一接力顺序不要打乱。  
如果跳过 `R03` 先做 host 或 controller 改造，只会让旧 ownership 再长一轮。

## 4.3 当前最小接力集

如果下一位执行者只想知道“现在立刻该做什么”，按下面顺序继续：

1. 将 core-seam 相关计划文件整体移入 `docs/plan/archive`
2. 保留当前验证结果作为归档证据：
   - `desktop:test` / `desktop:test:main` 已通过
   - `SessionManager` 与 remembered-account 相关 branded ID fixture 已收口
3. 后续若需要 focused repair，应基于归档计划重新开启新的 active plan，而不是继续复用本组 active 文档

## 4.4 每轮固定执行模板

每一轮都按同一个骨架推进，避免“每轮临时发明流程”：

1. 锁定 in scope / out of scope
2. 补最近一层守护测试或契约测试
3. 引入最终结构，而不是过渡包装
4. 切换调用点到最终结构
5. 删除同轮必须消失的旧路径
6. 运行 targeted verification
7. 在本文件和蓝图里补 status note / next handoff

## 5. Round Playbooks

## R01：收敛 `TaskTemplate` 深聚合

### Status

- Status: done

### Objective

把 `TaskTemplate` 从“聚合 + factory + DTO helper + policy helper 相互反向依赖”的形态，收回成一个真正深的聚合模块。

### Why This Round Goes First

这是后续所有收敛动作的地基。如果聚合本身仍有循环依赖和 helper 反向缠绕，后面做 orchestration 收敛只会把不稳定性放大。

### In Scope

- `packages/task/src/domain-server/aggregates/task-template.ts`
- `packages/task/src/domain-server/aggregates/task-template-factory.ts`
- `packages/task/src/domain-server/aggregates/task-template-dto.ts`
- `packages/task/src/domain-server/aggregates/task-template-*.policy.ts`
- 与上述聚合边界直接相连的 mapper / tests / rehydrate 调用点

### Out of Scope

- task controller seam
- task route registration seam
- schedule projection ownership
- typed event seam
- ID fixture 统一

### Must Delete In This Round

- `task-template.ts` 底部 lazy import
- factory 对 aggregate 的反向装配依赖
- 聚合内对 DTO helper 的反向耦合

### Execution Slices

1. 补聚合回归测试和依赖图守护
2. 定义聚合最终外部入口：`create(...)`、`rehydrate(...)`、command methods
3. 将 DTO mapping 移出聚合边界
4. 只保留纯计算 policy/helper，且不能反向依赖 aggregate 实现
5. 删除 factory 和 lazy import 旧路径
6. 清理直接调用点与测试

### Deliverables

- `TaskTemplate` 成为单向依赖中心
- `TaskTemplateState` 或等价状态定义从实现细节中收敛为稳定输入
- `task-template-factory.ts` 被删除或被消解到不再承担实际入口职责

### Targeted Verification

- `pnpm nx run task:test`
- `pnpm nx run task:typecheck`
- `.\node_modules\.bin\madge.cmd --circular --extensions ts packages/task/src/index.ts`

### Exit Criteria

- `TaskTemplate` 不再 import 反向 factory
- `TaskTemplate` 不再 import DTO helper
- `madge` 不再报告 `task-template` 相关环
- 聚合 API 比当前更小，但承担更多真实行为

### Handoff To Next Round

R02 可以直接建立 typed event seam，不再担心聚合层本身继续扩散耦合。

### R01 status note

- Date: 2026-07-02
- Status: done
- What changed: 抽出 `task-template.state.ts` 作为独立状态模块；将 `createOneTimeTask`、`createRecurringTask`、`create`、`load` 并回 `TaskTemplate`；将 DTO 映射内联回聚合方法，去掉对外部 helper 的反向依赖；同步更新 policy、导出、tests 和 PowerSync mapper 的状态类型引用。
- Old path deleted: `packages/task/src/domain-server/aggregates/task-template-dto.ts`、`packages/task/src/domain-server/aggregates/task-template-factory.ts`、`task-template.ts` 底部 lazy import。
- Verification: `.\node_modules\.bin\madge.cmd --circular --extensions ts packages/task/src/index.ts` 通过；`.\node_modules\.bin\nx.cmd run task:typecheck` 通过；`.\node_modules\.bin\nx.cmd run task:test` 通过；标准命令 `pnpm nx run task:typecheck` 仍被现有环境的 `ERR_PNPM_IGNORED_BUILDS` 阻塞。
- Remaining follow-up: 进入 R02，建立 typed publisher/subscriber seam，并先在 task runtime 与删除实例 use-case 上切换。

## R02：建立 typed event seam 基础设施

### Status

- Status: done

### Objective

把事件总线访问从 `string + unknown + cast` 收敛成真实 typed seam，为后续 runtime/orchestration 收敛提供稳定底座。

### In Scope

- `packages/utils/domain` 或等价 shared infra 位置
- `packages/task/src/api/runtime.ts`
- `packages/task/src/application-server/use-cases/commands/delete-task-instance.use-case.ts`
- shared event types / helper tests

### Out of Scope

- 全仓一次性切完所有 feature
- projection ownership 迁移
- controller seam 统一

### Must Delete In This Round

- 被本轮触碰文件中的 event bus cast

### Execution Slices

1. 定义 typed `Publisher<E>` / `Subscriber<E>`
2. 让现有全局 event bus 退回 adapter 位置
3. 先在 task runtime 上完成一个订阅场景切换
4. 再在一个直接发事件的 use-case 上完成发送场景切换
5. 用 contract tests 锁住 typed seam 行为
6. 删除旧 cast

### Deliverables

- 第一批真实生产代码不再 cast event bus
- 一套可复用的 typed publisher/subscriber seam

### Targeted Verification

- `pnpm nx run task:test`
- `pnpm nx run task:typecheck`

### Exit Criteria

- task runtime 不再 cast event bus
- 至少一个写路径 use-case 不再 cast event bus
- 没有新增 “cast helper” 之类的伪统一层

### Handoff To Next Round

R03 可以直接把 task projection source 从 runtime owner 中拆出来，并复用 typed subscriber。

### R02 status note

- Date: 2026-07-02
- Status: done
- What changed: 在 `packages/utils` 新增 `typed-event-port.ts`，提供 `Publisher`、`Subscriber`、`TypedEventPort` 及对应工厂；`packages/task/src/api/runtime.ts` 切换为 typed subscriber，删除 runtime 内对 `eventBus` 的 `unknown` cast；`delete-task-instance.use-case.ts` 切换为 typed publisher，删除发送路径的 `unknown` cast；新增 `runtime.spec.ts` 并补强删除实例 use-case 的事件发布测试。
- Old path deleted: `packages/task/src/api/runtime.ts` 与 `packages/task/src/application-server/use-cases/commands/delete-task-instance.use-case.ts` 中原有的 `eventBus as unknown as ...` 路径。
- Verification: `.\node_modules\.bin\nx.cmd run task:typecheck` 通过；`.\node_modules\.bin\nx.cmd run task:test` 通过（`43` 个文件、`658` 个测试）；标准命令 `pnpm nx ...` 在当前环境仍可能被 `ERR_PNPM_IGNORED_BUILDS` 阻塞，因此本轮沿用本地 `nx.cmd` 作为已知 fallback。
- Remaining follow-up: 进入 `R03`，把 task 的 schedule projection source 提炼成独立对外 port，并删除 task 内部的系统级 runtime owner 身份。

## R03：抽离 task 的 schedule projection source

### Status

- Status: done

### Objective

把 task 对 schedule projection 的业务规则保留在 task 内，把系统级 runtime ownership 拆出去。

### In Scope

- `packages/task`
- 必要时 `packages/schedule` 的 source-facing port

### Out of Scope

- goal/reminder projection
- 最终 `schedule-orchestration` 全量形态
- source executor ownership

### Must Delete In This Round

- task 内部最终 projection runtime owner 身份

### Execution Slices

1. 定义 task 对外暴露的 projection source port
2. 把 task-specific draft/calculation 规则留在 task 内
3. 把“订阅事件、删旧任务、写 schedule repo”的职责从 task 中移走
4. 由临时 orchestration stub 或 host 接线调用 task source port
5. 删除 task 内旧 runtime owner 入口

### Deliverables

- task source port
- task-specific projection logic 与系统 owner 的明确边界

### Targeted Verification

- `pnpm nx run task:test`
- `pnpm nx run api:test:smoke`

### Exit Criteria

- task 仍拥有 task-specific projection rules
- task 不再拥有最终 projection runtime ownership
- 外部可以不懂 task repo 细节而调用 task source port

### Handoff To Next Round

R04 可以在新包里接管 task projection，而不需要把 task 内部 repo/规则拖进 host。

### R03 status note

- Date: 2026-07-03
- Status: done
- What changed: 已经把 task-specific projection 规则抽成 `schedule-projection-source`，并把 API/desktop 上的 runtime owner 提升到 host 级贡献点；`packages/task/src/api/schedule-runtime.ts` 已从 task 包内删除；task 包只保留 projection rules 和 event handler mapping，不再自持系统级 owner。
- Old path deleted: `packages/task/src/api/schedule-runtime.ts`
- Verification: `.\node_modules\.bin\nx.cmd run task:typecheck` 通过；`.\node_modules\.bin\nx.cmd run task:test` 通过；`.\node_modules\.bin\nx.cmd run api:typecheck` 通过；`.\node_modules\.bin\tsc.cmd --noEmit -p apps/desktop/tsconfig.typecheck.json` 通过。`.\node_modules\.bin\nx.cmd run api:test:smoke` 仍被现有 `@memoflow/patterns/scheduler` 解析失败阻塞；`.\node_modules\.bin\nx.cmd run desktop:test:main` 仍被现有 Electron 安装与认证测试空文件基线阻塞；`.\node_modules\.bin\nx.cmd run desktop:typecheck` 的依赖构建链仍被 `ui-vue-shadcn:build` 的现有 `TS2742` 阻塞。
- Remaining follow-up: 开始 `R04`，新建 `schedule-orchestration` 包并接管 task projection owner。

## R04：新建 `schedule-orchestration`，接管 task projection

### Status

- Status: done

### Objective

建立真正的系统级 orchestration 模块，并让它成为 task projection 的唯一 owner。

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

### Execution Slices

1. 新建 `schedule-orchestration` 包骨架
2. 实现 `TaskProjector`
3. 实现 `TaskProjectionRuntime`
4. 用 typed subscriber 订阅 task 事件
5. 在 orchestration 内统一完成删旧、重建、保存、发事件
6. `apps/api` 改为实例化 orchestration module
7. 删除 task 旧入口

### Deliverables

- 新包 `packages/schedule-orchestration`
- 仅对外暴露小接口的 task projection runtime

### Targeted Verification

- `pnpm nx run schedule-orchestration:typecheck`
- `pnpm nx run schedule-orchestration:test`
- `pnpm nx run api:typecheck`
- `pnpm nx run task:test`
- `pnpm nx run schedule:test`

### Exit Criteria

- task projection owner 只剩 `schedule-orchestration`
- task feature package 内不再保留 projection runtime
- `apps/api` 的 task projection 接线只指向 orchestration module

### Handoff To Next Round

R05 只需把 goal/reminder 按同一模式并入，而不是重新设计 owner 模型。

### R04 status note

- Date: 2026-07-03
- Status: done
- What changed: `packages/task` 新增 `@memoflow/task/schedule-projection` 窄公共出口；`packages/schedule-orchestration` 完整接管 task projection owner；`apps/api` 与 `apps/desktop` 继续只做 source 选择和 module 实例化；host 上的 task 临时 owner 文件已删除。
- Old path deleted: `apps/api/src/modules/task-schedule-projection/runtime.ts`、`apps/desktop/src/main/modules/schedule/task-schedule-projection.runtime.ts`
- Verification: `.\node_modules\.bin\nx.cmd run schedule-orchestration:typecheck`、`.\node_modules\.bin\nx.cmd run schedule-orchestration:test`、`.\node_modules\.bin\nx.cmd run schedule:test`、`.\node_modules\.bin\nx.cmd run task:test`、`.\node_modules\.bin\nx.cmd run api:typecheck`、`.\node_modules\.bin\nx.cmd run schedule-orchestration:build`、`.\node_modules\.bin\nx.cmd run memoflow:governance-check` 通过。
- Remaining follow-up: 进入 `R05`，按同一模式迁移 goal/reminder projection ownership。

## R05：迁移 goal/reminder projection ownership

### Status

- Status: done

### Objective

让 task、goal、reminder 三类 projection 统一归属到 `schedule-orchestration`。

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

### Execution Slices

1. 定义 goal / reminder source port
2. 实现 `GoalProjector`
3. 实现 `ReminderProjector`
4. 切换 API host 接线
5. 切换 desktop host 接线
6. 删除 goal/reminder 旧 runtime 文件和旧注入路径
7. 对齐三类 source 的 projection 生命周期

### Deliverables

- 三类 source port
- 单一 owner 的 projection runtime

### Targeted Verification

- `pnpm nx run goal:typecheck`
- `pnpm nx run goal:test`
- `pnpm nx run reminder:typecheck`
- `pnpm nx run reminder:test`
- `pnpm nx run schedule-orchestration:typecheck`
- `pnpm nx run schedule-orchestration:test`
- `pnpm nx run schedule:test`
- `pnpm nx run api:typecheck`
- `pnpm nx run api:test:smoke`

### Exit Criteria

- task / goal / reminder 的 projection owner 只剩一个模块
- feature package 不再自己删建 schedule task
- API 与 desktop 的投影接线都回到统一入口

### Handoff To Next Round

R06 可以继续把 execution routing 收进同一个系统模块，让 host 进一步变薄。

### R05 status note

- Date: 2026-07-03
- Status: done
- What changed: `packages/goal` 与 `packages/reminder` 都新增 `schedule-projection` 窄公共出口；`packages/schedule-orchestration` 新增 goal/reminder projector、runtime 和共享 projection helper；API/desktop host 改为只负责选择 projection source，并统一把 `projectionRuntime` 注入 task module。
- Old path deleted: `packages/goal/src/api/schedule-runtime.ts`、`packages/reminder/src/api/schedule-runtime.ts`
- Verification: `.\node_modules\.bin\nx.cmd run goal:typecheck`、`.\node_modules\.bin\nx.cmd run goal:build`、`.\node_modules\.bin\nx.cmd run goal:test`、`.\node_modules\.bin\nx.cmd run reminder:typecheck`、`.\node_modules\.bin\nx.cmd run reminder:test`、`.\node_modules\.bin\nx.cmd run schedule-orchestration:typecheck`、`.\node_modules\.bin\nx.cmd run schedule-orchestration:test`、`.\node_modules\.bin\nx.cmd run schedule-orchestration:build`、`.\node_modules\.bin\nx.cmd run schedule:test`、`.\node_modules\.bin\nx.cmd run api:typecheck`、`.\node_modules\.bin\nx.cmd run api:test:smoke` 通过。`.\node_modules\.bin\tsc.cmd --noEmit -p apps/desktop/tsconfig.typecheck.json` 仍因既有 `electron-entry` 别名解析失败而阻塞，不作为本轮回退条件。
- Remaining follow-up: 开始 `R06`，把 `createSharedSourceExecutor(...)` 与 `createDesktopSourceExecutor(...)` 收回 `packages/schedule-orchestration`，并让 `packages/schedule` 退回纯 runtime contract。

## R06：回收 source executor ownership，压薄宿主层

### Status

- Status: done

### Objective

把 `apps/api/src/main.ts` 中手工拼装的跨域执行链收回到 orchestration 模块，恢复 host 作为纯宿主的职责边界。

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

### Execution Slices

1. 为 notification / task / goal / reminder 提炼执行所需最小 port
2. 在 orchestration 内实现 `ExecutionRouter`
3. 下沉通知 use-case 及其装配
4. 宿主层改为仅实例化 orchestration module
5. `schedule` 继续只接收 `sourceExecutor`
6. 删除 host 中旧拼装

### Deliverables

- 更薄的 `apps/api/src/main.ts`
- 系统级 execution router

### Targeted Verification

- `pnpm nx run api:test`
- `pnpm nx run api:test:smoke`
- `pnpm nx run schedule:test`
- `pnpm nx run desktop:test:main`

### Exit Criteria

- host 不再知道如何跨域拼装执行链
- `schedule` 没有吸收业务知识
- orchestration 对外接口仍然保持小而明确

### Handoff To Next Round

R07 可以开始统一 transport seam，而不需要继续和 host 层结构债纠缠。

### R06 status note

- Date: 2026-07-03
- Status: done
- What changed: `schedule-orchestration` 已成为 execution router 的唯一 owner；API / desktop host 现在都只注入 `scheduleOrchestrationModule.sourceExecutor`；`schedule` 已退回纯 runtime contract，不再持有 task/goal/reminder/notification 的业务知识。
- Old path deleted: `packages/schedule/src/application-server/source-executors/shared-source-executor.ts`、`packages/schedule/src/application-server/source-executors/types.ts`、`apps/desktop/src/main/modules/schedule/source-executors.ts`；host-local execution assembly 已从 `apps/api/src/main.ts` 与 `apps/desktop/src/main/main.ts` 移除。
- Verification: `.\node_modules\.bin\nx.cmd run schedule-orchestration:build`、`schedule-orchestration:test`、`api:typecheck`、`api:test`、`api:test:smoke`、`schedule:test`、`.\node_modules\.bin\tsc.cmd --noEmit -p apps/desktop/tsconfig.typecheck.json` 通过。
- Remaining follow-up: 进入 `R07`，统一 controller seam 与 route registration seam。

## R07：统一 controller seam 与 route registration seam

### Status

- Status: done

### Objective

统一 `task`、`goal`、`schedule` 三个服务端 transport seam：

1. controller 统一依赖 plain function port
2. route registration 统一返回 `Router`
3. `module.ts` 统一负责 mount prefix

### In Scope

- `packages/task/src/controllers/*`
- `packages/goal/src/controllers/*`
- `packages/schedule/src/controllers/*`
- 对应 `api/transport-handlers.ts`
- 对应 `api/routes/*`
- 对应 `api/module.ts`

### Out of Scope

- projection ownership
- typed event seam
- ID contract

### Must Delete In This Round

- 被替换的 `.execute` wrapper
- task 的 root-router mutation seam

### Execution Slices

1. 以 `schedule` 当前风格为标准确认 controller port 形状
2. 改 `goal` controller 构造与 transport handler
3. 改 `task` controller 构造与 transport handler
4. 统一 route registration 风格
5. 同步更新 tests
6. 删除旧接口和 wrapper

### Deliverables

- 统一 controller contract
- 统一 route registration seam

### Targeted Verification

- `pnpm nx run task:test`
- `pnpm nx run goal:test`
- `pnpm nx run schedule:test`
- `pnpm nx run api:test`

### Exit Criteria

- 三个 feature package 的 controller seam 同形
- transport handler 只在确有 shape adaptation 时存在
- route 装配风格一致

### Handoff To Next Round

R08 可以专注修 ID 契约与 fixture，而不会再被 transport 差异噪声干扰。

## R08：收紧 strict ID contract 与 fixture 体系

### Status

- Status: done

### Objective

把 ID 契约从“warning but pass”收敛成统一、强约束、可验证的基础设施，同时清理测试夹具体系。

### In Scope

- shared ID generator / builders
- `packages/task/src/testing/*`
- task/schedule mapper specs
- API smoke tests
- 其他被本轮触碰到的同类 fixture

### Out of Scope

- 新的架构抽象
- projection/runtime 逻辑调整
- host-level bootstrap tests

### Must Delete In This Round

- 被触碰目录中的非法 ID fixture 常量
- 依赖 warning 的 happy-path 测试数据

### Execution Slices

1. 统一共享 ID builder
2. 优先清掉 task / schedule / api-smoke 三组高噪声测试
3. 若 `Id.of()` 当前只是警告，则收紧成 fail-fast 或 fail result
4. 为 invalid-ID 场景补显式失败测试
5. 清理 stderr warning

### Deliverables

- 统一合法 ID fixture 入口
- 显式 invalid-ID tests

### Targeted Verification

- `pnpm nx run task:test`
- `pnpm nx run schedule:test`
- `pnpm nx run api:test:smoke`

### Exit Criteria

- 核心 smoke / mapper / runtime tests 无 ID warning
- happy-path fixture 全部使用合法 branded ID
- invalid ID 只存在于显式错误场景测试

### Handoff To Next Round

R09 可以在一个更干净的测试基座上补宿主启动链和 runtime 直达测试。

## R09：补宿主启动链和 runtime 直达测试，清理文档

### Status

- Status: done

### Objective

为重构后的系统补上关键 direct tests，并让文档与最终职责边界对齐。

### In Scope

- `apps/api`
- `apps/web`
- `apps/desktop`
- `packages/schedule`
- `packages/schedule-orchestration`
- `docs/architecture/*`
- `docs/plan/*`

### Out of Scope

- 再开新一轮架构改造
- 与本蓝图无关的文档整理

### Must Delete In This Round

- 已过时的旧 seam / 旧 owner / 旧 runtime 文档描述

### Execution Slices

1. 补 `ApiBootstrapper` direct tests
2. 补 `bootstrapMainApp` direct tests
3. 补 `schedule-orchestration` integration tests
4. 补 desktop runtime lifecycle tests
5. 回收蓝图、审查报告、相关 ADR/README 的旧描述

### Deliverables

- 关键宿主与 runtime 直达测试
- 与最终代码结构一致的文档

### Targeted Verification

- `pnpm nx run api:test`
- `pnpm nx run web:test`
- `pnpm nx run desktop:test:main`
- `pnpm nx run schedule:test`
- `pnpm nx run memoflow:governance-check`

### Exit Criteria

- API、web、desktop、schedule-orchestration 的关键运行链有 direct tests
- 文档不再描述旧 transport seam、旧 projection owner、旧 host 装配方式
- 本计划具备转入 archive 的条件

## 6. PR 与提交粒度规则

### 6.1 一轮最多一个合并单元

推荐一轮对应一个 PR。  
如果一轮确实过大，可以拆成同主题的连续小 PR，但不得跨轮混合目标。

### 6.2 提交顺序必须保持系统可工作

每轮内部推荐遵循：

1. 补或调整守护测试
2. 引入最终结构
3. 切换调用点
4. 删除旧路径
5. 跑 targeted verification

每个小提交之后都应该尽量保持测试可运行、结构可解释。

### 6.3 不允许的 PR 形态

- “先接新模块，旧模块以后再删”
- “顺手把 unrelated lint cleanup 一起带上”
- “同一个 PR 同时做 R04 和 R06”
- “同一个 PR 同时做 R07 和 R08”

## 7. 每轮状态记录模板

每轮完成后，在对应轮次下追加：

```md
### R0X status note

- Date:
- Status: not started / in progress / done / blocked
- What changed:
- Old path deleted:
- Verification:
- Remaining follow-up:
```

如果某轮被阻塞，必须明确：

- 阻塞点是什么
- 是结构问题、测试问题还是外部依赖问题
- 哪个后续轮次因此不能提前启动

## 8. 哪些轮次不要合并

以下轮次不要压成一个超级 PR：

- R01 和 R04 不合并
- R04 和 R06 不合并
- R07 和 R08 不合并

原因分别是：

1. 深聚合收敛必须先稳定，再接系统级 orchestration
2. projection ownership 与 execution ownership 是两类不同 cross-domain 改造
3. transport seam 收敛与 ID fixture 收敛属于不同噪声面

## 9. 完成归档条件

当以下条件全部满足时，本文件与蓝图一起从 `active` 移到 `archive`：

1. `TaskTemplate` 循环依赖彻底消失
2. `schedule-orchestration` 成为唯一 projection owner
3. `apps/api/src/main.ts` 不再拼装跨域业务执行链
4. controller seam 已统一为 plain function port
5. 生产代码零处 event bus cast
6. 核心测试无 ID warning
7. 宿主启动链和 runtime 链具备 direct tests
8. 相关文档已更新，不再描述旧结构

## 10. 推荐执行顺序

严格按以下顺序推进：

1. R01
2. R02
3. R03
4. R04
5. R05
6. R06
7. R07
8. R08
9. R09

不建议为了“减少轮次数”跨过底层基础轮次直接做上层切换。
