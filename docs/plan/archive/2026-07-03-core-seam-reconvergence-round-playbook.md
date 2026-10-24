---
tags:
  - plan
  - archive
  - architecture
  - refactor
  - execution
  - playbook
description: 将 Core Seam Reconvergence 蓝图直接拆成可逐轮执行的操作手册，强调底层优先、单轮单目标、同轮删旧路径、不保留兼容层
created: 2026-07-03T00:00:00+08:00
updated: 2026-07-03T20:54:00+08:00
---

# 2026-07-03 Core Seam Reconvergence Round Playbook

## 1. 文档定位

这份文档不是再讲一次“为什么要重构”，而是把现有审计和蓝图直接拆成可以接力执行的多轮方案。

输入来源固定为：

1. `docs/audit/code-quality-consistency-audit.md`
2. `docs/plan/archive/2026-07-02-core-seam-reconvergence-blueprint.md`
3. `docs/plan/archive/2026-07-02-core-seam-reconvergence-execution-plan.md`
4. 各轮独立执行文档 `R01` 到 `R09`
5. 当前代码真值与当前工作区状态

本文件的职责只有三个：

1. 明确现在应该从哪一轮继续
2. 明确每一轮要做什么、删什么、验什么
3. 明确每一轮完成后下一轮如何接手

如果需要一份单文件、从 `R01` 到 `R09` 都按统一模板展开的直接执行文档，请优先打开：

- `docs/plan/archive/2026-07-03-core-seam-reconvergence-direct-execution-runbook.md`

## 2. 总原则

### 2.1 不保留兼容层

本次重构只接受最终形态，不接受以下方案：

- 新旧两套 port 并存
- wrapper 先留着以后再删
- host 继续手工拼装，只是在外面再包一层
- 通过 helper 或 adapter 掩盖旧结构，而不是删除旧结构

### 2.2 底层优先

顺序固定为：

1. 先收敛深聚合和 typed seam
2. 再收回系统级 orchestration ownership
3. 再统一 transport seam
4. 最后统一 fixture、测试和文档

### 2.3 单轮单目标

每一轮只解决一个结构性问题。

允许：

- 同轮改多个相关文件
- 同轮补必要测试
- 同轮删除旧路径

禁止：

- 同轮顺手清 unrelated cleanup
- 同轮跨两个架构主题
- 同轮把“以后可能要做的事情”提前混入

### 2.4 同轮删旧路径

只要某轮已经切到新 seam，同轮就必须删除旧 seam。

判断标准很简单：

- 如果旧路径还保留，说明这轮还没有完成
- 如果还需要双轨运行，说明方案不够干净

## 3. 当前接力点

### 3.1 计划层面的最新状态

根据现有蓝图与执行计划，正式状态现在是：

- `R01` done
- `R02` done
- `R03` done
- `R04` done
- `R05` done
- `R06` done
- `R07` done
- `R08` done
- `R09` in progress

### 3.2 工作区层面的现实状态

当前工作区已经完成 `R01` 到 `R09` 的全部轮次。

已知事实：

- `schedule-orchestration` 已经接管 projection / execution owner
- host 已经退回到 module-level wiring
- task / goal / schedule controller seam 已统一到 plain function port + returned `Router`
- API / web / desktop 入口直达测试已经补齐，desktop 全量 target 也已通过

因此，当前不需要继续扩展这组计划；应直接做归档与历史保留。

## 4. 当前收口面

当前需要继续的是 `R09`，重点不再是结构判断，而是把测试与文档治理收口。

### 4.1 当前最小验证命令

```powershell
.\node_modules\.bin\nx.cmd run api:test
.\node_modules\.bin\nx.cmd run web:test
.\node_modules\.bin\nx.cmd run schedule-orchestration:test
.\node_modules\.bin\nx.cmd run memoflow:governance-check
```

### 4.2 判断规则

如果出现以下结果：

- `api:test`、`web:test`、`schedule-orchestration:test` 通过
- `memoflow:governance-check` 通过
- desktop file-targeted bootstrap tests 通过

则把当前工作区视为：

- `R09` 已完成全部收口
- 整组 core-seam 计划满足 archive 条件

当前 `desktop:test` 与 `desktop:test:main` 已通过，不再需要保留 baseline failure 例外记录。

## 5. 审计问题到轮次映射

| 审计问题 | 结构根因                                          | 最终优雅形态                                                                      | 执行轮次       |
| -------- | ------------------------------------------------- | --------------------------------------------------------------------------------- | -------------- |
| `Q-001`  | host 越权拼装跨域执行链                           | host 只做 composition root，execution owner 收回 `schedule-orchestration`         | `R06` + `R09`  |
| `Q-002`  | `TaskTemplate` 聚合边界失稳并出现真实循环依赖     | 聚合自持 create/rehydrate/invariants，删除反向 factory / DTO helper / lazy import | `R01`          |
| `Q-003`  | controller / transport seam 同层异形              | server-side controller 统一为 plain function port，routes 统一返回 `Router`       | `R07`          |
| `Q-004`  | projection / execution owner 多来源分散           | `schedule-orchestration` 成为唯一系统 owner，feature 只暴露 source adapter        | `R03` 到 `R06` |
| `Q-005`  | 事件总线通过 `string + unknown` cast 绕开类型系统 | 所有发布/订阅都经过 typed `Publisher` / `Subscriber` seam                         | `R02`          |
| `Q-006`  | branded ID fixture 与真实契约不一致               | 统一合法 ID builder，happy-path fixture 不再依赖 warning                          | `R08`          |
| `Q-007`  | schedule tests 存在 mock/object 噪声              | 在测试收口轮统一清理，避免噪声掩盖真实回归                                        | `R08`          |
| `Q-008`  | host/bootstrap/runtime 关键链路缺少 direct tests  | API / web / desktop / orchestration 关键链路补齐直达测试                          | `R09`          |

## 6. 轮次总览

| Round | 核心目标                                  | 主模块                                                                                                  | 同轮必须删除                                        | 完成后得到什么                    |
| ----- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------- |
| `R01` | 收敛 `TaskTemplate` 深聚合                | `packages/task`                                                                                         | lazy import、反向 factory、聚合对 DTO helper 的认知 | 任务域核心聚合稳定                |
| `R02` | 建立 typed event seam                     | `packages/utils`, `packages/task`                                                                       | 被触碰文件中的 event bus cast                       | 运行时事件边界稳定                |
| `R03` | 抽离 task projection source               | `packages/task`                                                                                         | task 内部最终 projection runtime owner              | task 只保留业务规则               |
| `R04` | 新建 orchestration 并接管 task projection | `packages/schedule-orchestration`, `packages/task`, `apps/api`                                          | task 旧 projection runtime 最后入口                 | task projection owner 单一        |
| `R05` | 迁移 goal/reminder projection owner       | `packages/goal`, `packages/reminder`, `packages/schedule-orchestration`                                 | goal/reminder 旧 runtime 文件与接线                 | 三类 projection owner 单一        |
| `R06` | 回收 source executor ownership，压薄 host | `packages/schedule-orchestration`, `packages/notification`, `apps/api`, `apps/desktop`                  | host 里的跨域执行链拼装                             | host 回到纯 composition root      |
| `R07` | 统一 controller seam 与 route seam        | `packages/task`, `packages/goal`, `packages/schedule`                                                   | `.execute` wrapper、task root-router mutation seam  | transport 层同形                  |
| `R08` | 收紧 strict ID contract 与 fixture 体系   | shared ID contract + task/schedule/api tests                                                            | 依赖 warning 的 happy-path fixture                  | 测试契约与生产一致                |
| `R09` | 补直达测试并回收文档                      | `apps/api`, `apps/web`, `apps/desktop`, `packages/schedule`, `packages/schedule-orchestration`, `docs/` | 过时旧 seam 文档描述                                | 关键链路有 direct tests，文档闭环 |

## 7. 逐轮执行方案

## 7.1 R06：回收 source executor ownership，压薄宿主层

### 目标

让 `apps/api/src/main.ts` 和 `apps/desktop/src/main/main.ts` 重新退回宿主层角色，不再理解 task / goal / reminder / notification 的底层执行装配。

### 核心结果

- `schedule-orchestration` 成为唯一 execution router owner
- host 只实例化 module 并传入高层 port
- `schedule` 继续保持通用调度引擎，不吸收业务知识

### In Scope

- `packages/schedule-orchestration`
- `packages/notification`
- `apps/api/src/main.ts`
- `apps/desktop/src/main/main.ts`
- 必要时 `packages/schedule`

### Must Delete In This Round

- `apps/api/src/main.ts` 中跨域 repo / use-case / notification execution 手工拼装
- `apps/desktop` 中旧 source executor owner 路径
- `packages/schedule` 中历史 shared source executor owner 路径

### Tiny Commit Slices

1. 固化 orchestration 执行侧依赖接口，只保留 task / goal / reminder / notification 所需最小 port
2. 在 `schedule-orchestration` 内完成 execution router 的最终装配
3. 把通知执行链装配下沉到 orchestration，不再由 host 手工 new use case
4. 切 API host 到 `scheduleOrchestrationModule.sourceExecutor`
5. 切 desktop host 到同一高层 contract
6. 删除旧 host/source-executor 路径
7. 跑 host 和 orchestration 的 targeted verification

### Stop Lines

如果出现以下情况，停在 `R06`，不要继续 `R07`：

- `api:typecheck` 仍然因为 source executor 接线失败
- `api:test` 失败点仍然在 host/bootstrap/orchestration
- 为了让 host 通过，不得不重新把 repo 细节暴露回 `apps/api`

### Targeted Verification

```powershell
.\node_modules\.bin\nx.cmd run schedule-orchestration:build
.\node_modules\.bin\nx.cmd run api:typecheck
.\node_modules\.bin\nx.cmd run api:test
.\node_modules\.bin\nx.cmd run api:test:smoke
.\node_modules\.bin\tsc.cmd --noEmit -p apps/desktop/tsconfig.typecheck.json
```

### Exit Criteria

- host 不再知道如何拼装跨域执行链
- `schedule-orchestration` 对外仍只有小而明确的接口
- `schedule` 没有重新吸收业务 source 细节

### Handoff

只有 `R06` 收口后，`R07` 才允许进入正式验收。

## 7.2 R07：统一 controller seam 与 route registration seam

### 目标

统一 task / goal / schedule 三个 server-side transport seam：

- controller 统一消费 plain function port
- transport handler 只在“重分组”时保留
- `registerXxxRoutes(...)` 一律返回 `Router`
- `module.ts` 统一负责 mount prefix

### 核心结果

- transport 层只有一种形状
- `goal` 不再需要 `.execute` wrapper
- `task` 不再保留 root-router mutation seam

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
- 直接受影响的 controller / route tests

### Must Delete In This Round

- 所有被替换的 `.execute` wrapper
- task 的 root-router mutation seam
- `registerGoalFolderRoutes_` 这类为旧形状妥协出的异常命名
- 只为了旧 shape 存在的 pass-through transport helper

### Tiny Commit Slices

1. 先固定 controller contract 的最终形状，并在 task/goal controller tests 里转成 plain function mock
2. 切 `goal` controller + transport handler，删除 `{ execute: api.xxx }` 包装
3. 切 `task` controller + transport handler，保留必要分组但不改变函数 contract
4. 统一 `task` route registration 返回 `Router`
5. 对齐 `goal` route 导出命名与 `module.ts` mount pattern
6. 检查 `schedule` 是否仍是最终标准，如不是则收口到同一形状
7. 删除旧 wrapper、旧命名、旧 registration 方式

### Stop Lines

如果出现以下情况，停在 `R07`，不要提前进入 `R08`：

- 仍然保留 plain function 和 `.execute` 双轨 contract
- 路由层为了兼容旧形状又引入额外 wrapper
- `api:test` 失败点说明 host/orchestration 仍未稳定

### Targeted Verification

```powershell
.\node_modules\.bin\nx.cmd run task:typecheck
.\node_modules\.bin\nx.cmd run goal:typecheck
.\node_modules\.bin\nx.cmd run task:test
.\node_modules\.bin\nx.cmd run goal:test
.\node_modules\.bin\nx.cmd run schedule:test
.\node_modules\.bin\nx.cmd run api:typecheck
.\node_modules\.bin\nx.cmd run api:test
```

### Exit Criteria

- task / goal / schedule controller seam 同形
- transport handler 不再承载无意义包装
- route registration 风格一致

### Handoff

`R08` 可以在统一的 transport 基面上处理 ID 契约和 fixture 体系，不再被接口异形噪声分散注意力。

## 7.3 R08：收紧 strict ID contract 与 fixture 体系

### 目标

把 branded ID 契约从“warning 但继续跑”收紧为真正的共享基础设施，同时把测试 fixture 全部收回统一 builder。

### 核心结果

- happy-path fixture 全部使用合法 branded ID
- invalid ID 只出现在显式错误场景测试里
- 核心 smoke / mapper / runtime tests 不再输出 ID warning

### In Scope

- shared ID generator / builder / parser contract
- `packages/task/src/testing/*`
- task mapper specs
- schedule mapper specs
- API smoke tests
- 其他本轮触碰到的同类 fixture

### Must Delete In This Round

- 被触碰目录中的非法 ID fixture 常量
- 依赖 warning 的 happy-path 测试数据
- “只要能过测试就行”的裸字符串 ID

### Tiny Commit Slices

1. 固化共享合法 ID builder，明确 happy-path 一律从 builder 取值
2. 先清 task smoke 和 controller fixture
3. 再清 task mapper / schedule mapper 这两组高噪声测试
4. 最后清 API smoke tests 中的非法 branded ID
5. 如有需要，把 `of()` / `parse()` 收紧成 fail-fast 或 fail result
6. 为 invalid-ID 场景补显式失败测试

### Stop Lines

如果出现以下情况，停在 `R08`：

- 继续允许 happy-path fixture 触发 warning
- 为了兼容旧 fixture，引入“宽松 builder”
- 把业务代码改复杂，只是为了迁就历史测试字符串

### Targeted Verification

```powershell
.\node_modules\.bin\nx.cmd run task:test
.\node_modules\.bin\nx.cmd run schedule:test
.\node_modules\.bin\nx.cmd run api:test:smoke
```

### Exit Criteria

- 核心测试无 ID warning
- fixture 与生产契约一致
- invalid ID 只存在于显式错误测试

### Handoff

`R09` 可以在更干净的测试基座上补宿主和 runtime 直达测试。

## 7.4 R09：补宿主启动链与 runtime 直达测试，回收文档

### 目标

把重构后的系统关键路径补齐 direct tests，并让文档只描述最终结构。

### 核心结果

- API / web / desktop / schedule-orchestration 的关键运行链都有直接测试
- 蓝图、审计、README、相关说明文档与最终实现对齐
- 这组 active plan 具备转 archive 条件

### In Scope

- `apps/api`
- `apps/web`
- `apps/desktop`
- `packages/schedule`
- `packages/schedule-orchestration`
- `docs/`

### Must Delete In This Round

- 已过时的旧 seam / 旧 owner / 旧 runtime 文档描述
- 仍然指导读者去看旧 transport contract 的说明

### Tiny Commit Slices

1. 补 API bootstrap direct tests
2. 补 `schedule-orchestration` integration tests
3. 补 web main bootstrap / DI startup direct tests
4. 补 desktop main runtime lifecycle tests
5. 回收蓝图和审计报告中的“处理中”状态描述
6. 将完成后的计划移动到 archive

### Stop Lines

如果出现以下情况，停在 `R09`：

- 文档仍然同时描述新旧两套结构
- direct tests 只 mock 叶子 use case，没有真正覆盖宿主/runtime 链路
- 为了让测试好写，把重构后的高层接口重新打碎

### Targeted Verification

```powershell
.\node_modules\.bin\nx.cmd run api:test
.\node_modules\.bin\nx.cmd run web:test
.\node_modules\.bin\nx.cmd run desktop:test:main
.\node_modules\.bin\nx.cmd run schedule:test
.\node_modules\.bin\nx.cmd run memoflow:governance-check
```

### Exit Criteria

- 宿主启动链和 runtime 链有 direct tests
- 文档不再描述旧 seam
- 本轮结束后整组 plan 可以归档

## 8. 每轮固定操作模板

所有轮次统一按下面顺序执行：

1. 先确认本轮的 `In Scope / Out of Scope`
2. 先补最近一层守护测试或契约测试
3. 直接引入最终结构，不加过渡包装
4. 切调用点到最终结构
5. 删除本轮必须消失的旧路径
6. 跑 targeted verification
7. 回写对应 round doc、execution plan、blueprint 的状态

## 9. 当前最推荐的下一步

如果从当前工作区继续，推荐顺序固定为：

1. 跑第 4 节的当前最小验证命令
2. 完成 `R09` 的计划/蓝图状态回写
3. 将整组 core-seam 文档移入 `archive`
4. 若后续需要继续改进，重新开新的 active plan

不要把这组已完成计划继续留在 `active`。  
否则会把“历史收敛记录”和“当前仍在执行的计划”重新缠在一起。

## 10. 这份 playbook 明确拒绝的做法

- 在 `apps/api` 再加一层临时 orchestrator，但仍继续直接拼 repo
- 同时保留 `.execute` seam 和 plain function seam
- 为旧 fixture 保留宽松 ID 入口
- 为了赶进度，先保留 root-router mutation seam，等以后再统一
- 在 `schedule` 里重新吸收 task / goal / reminder 的业务知识

这些做法都只是在给旧结构续命，不会让底层真正变优雅。
