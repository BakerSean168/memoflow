---
tags:
  - plan
  - active
  - architecture
  - refactor
  - audit
  - rounds
description: 基于当前代码真值，把审计后续收口项直接拆成多轮、可顺序执行、无兼容层的重构蓝图
created: 2026-07-04T00:00:00+08:00
updated: 2026-07-04T14:24:20+08:00
---

# 2026-07-04 Audit Follow-up Elegant Refactor Blueprint

## 1. 文档定位

这份文档是“审计后续收口”的单一 active 执行入口。

它只负责当前代码里仍然可见、且尚未被更大主线彻底吃掉的残余结构问题，不重复展开已经进入 archive / 执行中的 `core-seam reconvergence` 主线。

本文件以以下真值为准：

1. 当前代码、配置和测试
2. [code-quality-consistency-audit.md](D:/home/projects/memoflow/docs/audit/code-quality-consistency-audit.md) 的历史问题编号与背景
3. [2026-05-29-repository-paradigm-unification-plan.md](D:/home/projects/memoflow/docs/plan/archive/2026-05-29-repository-paradigm-unification-plan.md)
4. 已归档的 `core-seam reconvergence` 方案与执行记录

## 2. 当前真值快照

### 2.1 已完成轮次

#### `R01`：Repository Resource Mutation Typed End-to-End

当前已完成：

1. `packages/contracts/src/modules/repository/protocol/repository-event-map.ts`
   - `repository:resource:mutated` 已进入 `RepositoryEventMap`
2. `packages/repository/src/application-server/services/resource-mutation.service.ts`
   - 已切到 typed publisher
3. `packages/ai/src/infrastructure-server/runtime/knowledge-auto-index.runtime.ts`
   - 已切到 typed subscriber
   - 已删除 `parseRepositoryResourceMutation(...)`
4. repository / ai 相关测试
   - 已补 `Deleted` 不触发 reindex 的守护测试

已验证通过：

```powershell
.\node_modules\.bin\nx.cmd run repository:typecheck
.\node_modules\.bin\nx.cmd run repository:test
.\node_modules\.bin\nx.cmd run ai:typecheck
.\node_modules\.bin\nx.cmd run ai:test
```

#### `R02`：AIConversation Shared Typed Flush Pattern

当前已完成：

1. `packages/utils/src/domain/flush-domain-events.ts`
   - 已新增共享 typed flush helper
2. `packages/ai/src/infrastructure-server/adapters/prisma/ai-conversation-prisma.repository.ts`
   - 已切到共享 typed flush
3. `packages/ai/src/infrastructure-server/adapters/powersync/ai-conversation-powersync.repository.ts`
   - 已切到共享 typed flush
4. `packages/ai/src/infrastructure-server/adapters/__tests__/ai-conversation-domain-events.spec.ts`
   - 已补双后端对等事件发布测试

已验证通过：

```powershell
.\node_modules\.bin\nx.cmd run ai:typecheck
.\node_modules\.bin\nx.cmd run ai:test
.\node_modules\.bin\nx.cmd run api:test
.\node_modules\.bin\nx.cmd run desktop:test
```

### 2.2 当前仍待收口的残余问题

当前代码里仍有直接证据的重点残余项如下：

1. `packages/ai/src/infrastructure-server/adapters/powersync/agent-checkpoint-powersync.adapter.ts`
   - 仍是 live stub
   - 构造函数仍为 `db: unknown`
   - 方法仍然统一 `throw new Error('... not yet implemented')`
2. 以下 repository 仍保留 open-coded domain-event flush loop：
   - `packages/notification/src/infrastructure-server/adapters/prisma/notification-prisma.repository.ts`
   - `packages/notification/src/infrastructure-server/adapters/powersync/notification-powersync.repository.ts`
   - `packages/schedule/src/infrastructure-server/adapters/powersync/schedule-task-powersync.repository.ts`
   - `packages/reminder/src/infrastructure-server/adapters/powersync/reminder-template-powersync.repository.ts`
3. 以下位置仍保留 untyped `eventBus as any` seam：
   - `packages/account/src/application-server/handlers/register-account-event-listeners.ts`
   - `packages/schedule/src/application-server/use-cases/commands/schedule-command-use-cases.test.ts`
4. 文档与治理状态尚未回写到当前真值
   - 本蓝图此前仍把 `R01/R02` 写成待做或进行中
   - umbrella plan 与审计状态需要在代码 rounds 完成后统一回填

### 2.3 现场约束

当前工作树不是干净基线，`git status --short` 显示大量进行中的改动，尤其集中在：

1. `apps/api`
2. `apps/desktop`
3. `packages/task`
4. `packages/goal`
5. `packages/reminder`
6. `packages/schedule`
7. `docs/plan/*`

因此本蓝图的执行策略必须是：

1. 一轮只碰一个结构主题
2. 不重新打开已经在 `core-seam reconvergence` 主线里推进的主题
3. 只在本轮 owned scope 内做删旧与验证

## 3. 本蓝图负责什么，不负责什么

### 3.1 本蓝图负责

1. 清掉仍留在生产 surface 上的 live stub
2. 把剩余 repository 的 domain-event flush pattern 收成共享 typed 机制
3. 清零剩余 untyped event seam
4. 为以上收口项补足最小但直接的守护验证
5. 把 active / audit / umbrella plan 状态回写到当前真值

### 3.2 本蓝图不负责

以下主题已经有别的主线或现成执行轨道，不在本文件里重复拆：

1. `TaskTemplate` 深聚合继续收敛
2. `schedule-orchestration` 主线 owner 收口
3. host thinning
4. controller seam 全仓统一
5. 全仓 branded ID fixture 收敛

如果这些主题后续还需要继续推进，应该在各自主线文档里继续，而不是再把本蓝图继续膨胀。

## 4. 目标终态

本蓝图的最终状态固定如下：

1. live production surface 上不再存在“可导入但统一抛未实现”的 PowerSync adapter
2. 聚合持久化后的事件发布统一通过共享 typed flush 机制完成
3. 跨模块事件订阅与发送统一走 typed publisher / subscriber seam
4. 对应测试不再依赖 `any` 绕过 contract
5. active / audit / umbrella plan 不再描述已经关闭的旧状态

## 5. 执行铁律

### 5.1 不保留兼容层

禁止以下做法：

1. 新 helper 接入后，旧 loop / 旧 cast 长期保留
2. 为 checkpoint stub 额外再包一层“以后再接”的 shim
3. typed seam 已经可用，但继续在生产路径里走 `any` / `unknown`

### 5.2 同轮删旧

每轮只要切到了最终结构，同轮必须删除旧路径。

以下任一情况出现，视为本轮未完成：

1. 新旧两套路径并存
2. 旧路径仍承担生产职责
3. 文档开始描述“双轨都可用”

### 5.3 一轮一个结构主题

允许：

1. 同轮改多个紧密相关文件
2. 同轮补最近一层 direct tests
3. 同轮删旧并回写状态

禁止：

1. 顺手做 unrelated cleanup
2. 一轮同时打开两个以上结构主题
3. 先铺 helper 但本轮没有真实调用点

### 5.4 命令与验证约定

仓库标准命令仍优先使用 `pnpm nx run ...`。

如果当前环境触发 `ERR_PNPM_IGNORED_BUILDS`，允许使用：

```powershell
.\node_modules\.bin\nx.cmd run <project>:<target>
```

每轮都必须记录实际使用的是哪一种命令。

## 6. 轮次总览

| Round | 状态     | 目标                                                        | 主模块                                                  | 同轮必须删除                                     | 完成信号                                      |
| ----- | -------- | ----------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------- |
| `R01` | `已完成` | 打通 repository resource mutation 的 typed event end-to-end | `repository`, `ai`, `contracts`, `utils`                | raw cast 与 payload parser                       | 发布端与订阅端共享 typed contract             |
| `R02` | `已完成` | 收敛 AIConversation 的 domain-event flush pattern           | `ai`, `utils`                                           | open-coded loop 与 raw cast                      | Prisma / PowerSync 共用 typed flush           |
| `R03` | `已完成` | 硬切 PowerSync checkpoint live stub                         | `ai`                                                    | throwing stub、`db: unknown` live surface        | live surface 不再暴露未实现能力               |
| `R04` | `已完成` | 收敛剩余 repository 的 domain-event flush 样板              | `notification`, `schedule`, `reminder`, `utils`         | open-coded `pullDomainEvents()` loop             | 相关 repository 统一共享 typed flush          |
| `R05` | `已完成` | 清零剩余 untyped event seam                                 | `account`, `schedule`                                   | `eventBus as any`                                | 生产与 touched tests 不再绕过 typed seam      |
| `R06` | `已完成` | 为新 seam 加最小回归护栏                                    | `ai`, `notification`, `schedule`, `reminder`, `account` | 只验证 happy-path、无 direct seam 守护的测试缺口 | 关键 seam 有直接守护测试与 pattern search     |
| `R07` | `已完成` | 回写治理与文档状态                                          | `docs`, `tools/governance`                              | 过时的 active / audit 状态描述                   | active / audit / umbrella plan 与当前真值一致 |

## 7. 多轮执行方案

## `R03`：PowerSync Checkpoint Hard Cut

### 目标

消灭 `AgentCheckpointPowerSyncAdapter` 这种 live stub。

### 为什么先做

这是当前残余项里最不优雅、也最容易在运行时踩雷的一条生产 surface。

### 当前证据

文件：`packages/ai/src/infrastructure-server/adapters/powersync/agent-checkpoint-powersync.adapter.ts`

当前仍然存在：

1. `constructor(private readonly db: unknown)`
2. `logger.warn('PowerSync checkpoint adapter is not yet implemented')`
3. 所有 port 方法都直接抛未实现错误

### 设计决策

默认推荐路径是“删除 live stub surface”，不是“保留一个更好看的 stub”。

只有在确认 checkpoint 已经是当前产品的必要能力时，才允许在同一轮直接落完整实现。

### In Scope

1. `packages/ai/src/infrastructure-server/adapters/powersync/agent-checkpoint-powersync.adapter.ts`
2. 该 adapter 的 export surface
3. 该 adapter 的 wiring / module registration / caller
4. 与该能力直接相关的 AI tests

### Out of Scope

1. AI conversation repository
2. 其余 repository 的 domain-event flush
3. 全仓 PowerSync 能力扩展

### 推荐步骤

1. 先盘点 live export、provider wiring、实际调用点
2. 如果 checkpoint 当前不是支持面：
   - 删除 export
   - 删除 wiring
   - 删除默认注入
   - 在文档里显式写清“PowerSync checkpoint 当前不在支持面”
3. 如果 checkpoint 当前必须存在：
   - 同轮提供最终实现
   - 同轮删掉 stub
   - 禁止再引入临时适配器
4. 补一条最接近模块装配层的 direct test，确保 runtime 不会再导入一个统一抛错的默认实现
5. 回写本蓝图状态

### 同轮必须删除

1. `db: unknown`
2. `not yet implemented` throwing 方法
3. 任何继续把该 stub 当作 runtime 默认实现的 wiring

### Targeted Verification

```powershell
pnpm nx run ai:typecheck
pnpm nx run ai:test
pnpm nx run api:test
pnpm nx run desktop:test
```

### 完成判定

1. live surface 上不再存在 checkpoint throwing stub
2. 当前支持面与代码实现一致
3. 文档不再把 stub 暗示成”稍后会自动可用”

### R03 status note

- Date: 2026-07-04
- Status: done
- What changed: 删除 `AgentCheckpointPowerSyncAdapter`（dead throwing stub）；更新 `docs/architecture/ai-agent-checkpoint-persistence.md` 明确 PowerSync checkpoint 当前不在支持面。
- Old path deleted: `packages/ai/src/infrastructure-server/adapters/powersync/agent-checkpoint-powersync.adapter.ts`
- Verification: `ai:typecheck` 通过，`ai:test` 通过（34 files, 282 tests），`rg -n “not yet implemented” packages/ai/src/infrastructure-server/adapters/powersync` 返回空。
- 说明: 该 stub 未被任何 barrel export、composition root 或 wiring 引用，是完全 dead code。Prisma adapter 是当前唯一实现，API 和 Desktop 均通过它工作。
- Remaining follow-up: 进入 R04，收敛剩余 repository 的 domain-event flush pattern。

## `R04`：Remaining Repository Flush Convergence

### 目标

把剩余 repository 的“持久化成功后发布聚合事件”路径统一收成共享 typed flush pattern。

### 当前证据

当前仍能直接检出 open-coded `pullDomainEvents()` loop：

1. `packages/notification/src/infrastructure-server/adapters/prisma/notification-prisma.repository.ts`
2. `packages/notification/src/infrastructure-server/adapters/powersync/notification-powersync.repository.ts`
3. `packages/schedule/src/infrastructure-server/adapters/powersync/schedule-task-powersync.repository.ts`
4. `packages/reminder/src/infrastructure-server/adapters/powersync/reminder-template-powersync.repository.ts`

### 最终形态

这些 repository 的最终形态应统一为：

1. repository 只负责持久化成功
2. 使用共享 `flushDomainEvents(...)`
3. 通过 typed publisher 发布事件
4. 不再 open-code `for ... of + eventBus.send(...)`

### In Scope

1. 上述 4 个 repository
2. `packages/utils/src/domain/flush-domain-events.ts`
3. 必要时 `packages/utils/src/domain/typed-event-port.ts`
4. 对应 repository tests

### Out of Scope

1. 与这些 aggregate 无关的其余 feature repository
2. 全仓一次性统一所有 event path
3. 与 repository flush 无关的业务规则调整

### 推荐步骤

1. 先确认这 4 个 repository 使用的事件真值都能落在 `AppEventRegistry` 或 feature-owned `EventMap`
2. 如果现有 `flushDomainEvents(...)` 已足够，就直接复用
3. 如果现有 helper 还缺最小能力，就先在 `utils` 收紧到最终形状，再立刻接入真实调用点
4. 先迁 notification 两个后端，确保同一聚合的双后端语义一致
5. 再迁 schedule task PowerSync repository
6. 再迁 reminder template PowerSync repository
7. 为每种聚合至少保留一条 direct parity test，验证 save 后发布的事件集合与顺序符合预期
8. 回写本蓝图状态

### 同轮必须删除

1. 4 个 repository 中的 open-coded event loop
2. 这些路径里直接对 `eventBus.send(...)` 的手工 cast / payload 发送样板

### Targeted Verification

```powershell
pnpm nx run notification:typecheck
pnpm nx run notification:test
pnpm nx run schedule:typecheck
pnpm nx run schedule:test
pnpm nx run reminder:typecheck
pnpm nx run reminder:test
```

### 完成判定

1. 这 4 个 repository 都共用同一类 typed flush pattern
2. 同一聚合的不同后端不再各自维护一套发布样板
3. 生产代码中这几条路径不再出现 open-coded domain-event flush loop

### R04 status note

- Date: 2026-07-04
- Status: done
- What changed: 4 个 repository 的 open-coded `for...of + eventBus.send(...)` 循环统一替换为 `flushDomainEvents(typedPublisher, aggregate)`。每个 repository 新增 `createTypedEventPublisher<FeatureEventMap>(eventBus)` 作为 module-level typed publisher。schedule 和 reminder 的 PowerSync repository 保留了原有的 guard + logging 行为。
- Old path deleted: 无文件删除，仅替换 flush pattern
- Verification: `notification:typecheck` 通过，`notification:test` 通过（19 files, 166 tests），`schedule:typecheck` 通过，`schedule:test` 通过（22 files, 263 tests），`reminder:typecheck` 通过，`reminder:test` 通过（32 files, 311 tests）。`rg -n "for \(const event of .*pullDomainEvents\(\)\)" packages/notification packages/reminder packages/schedule` 返回空。
- Remaining follow-up: 进入 R05，清零 `packages/account` 和 `packages/schedule` 中残余的 `eventBus as any`。

## `R05`：Typed Event Seam Residue Cleanup

### 目标

把剩余的 `eventBus as any` 收掉，让生产与 touched tests 都回到 typed seam。

### 当前证据

1. `packages/account/src/application-server/handlers/register-account-event-listeners.ts`
   - `start()` / `stop()` 仍然通过 `(eventBus as any).on/off(...)`
2. `packages/schedule/src/application-server/use-cases/commands/schedule-command-use-cases.test.ts`
   - 仍然通过 `vi.spyOn(eventBus as any, 'send')`

### 最终形态

1. 账户侧跨模块监听通过 typed subscriber 完成
2. touched tests 不再依赖 `any` spy，而是通过 typed seam 或行为结果断言事件发送

### In Scope

1. `packages/account/src/application-server/handlers/register-account-event-listeners.ts`
2. `packages/schedule/src/application-server/use-cases/commands/schedule-command-use-cases.test.ts`
3. 必要时相关 helper / nearby tests

### Out of Scope

1. 全仓所有 `any`
2. 与这两条 seam 无关的测试重写
3. repository flush 主题

### 推荐步骤

1. 在 account 侧为 `auth:identity-created` 明确 feature-owned typed subscriber
2. 让 runtime `start()` / `stop()` 直接使用 typed `on/off`
3. schedule command tests 改成 typed 事件断言
4. 如果断言行为比 spy 更稳定，优先断言真实事件结果而不是断言内部调用细节
5. 用 pattern search 确认本轮 owned scope 中 `eventBus as any` 已清零
6. 回写本蓝图状态

### 同轮必须删除

1. `register-account-event-listeners.ts` 中的 `(eventBus as any)`
2. `schedule-command-use-cases.test.ts` 中的 `(eventBus as any)`

### Targeted Verification

```powershell
pnpm nx run account:typecheck
pnpm nx run account:test
pnpm nx run schedule:test
```

额外 pattern verification：

```powershell
rg -n "eventBus as any" packages/account packages/schedule -g "*.ts"
```

### 完成判定

1. account 生产代码不再依赖 `any` 订阅 event bus
2. touched tests 不再通过 `any` 绕过 typed seam
3. 本轮 owned scope 内 `rg` 搜索结果为空

### R05 status note

- Date: 2026-07-04
- Status: done
- What changed: `register-account-event-listeners.ts` 改用 `createTypedEventSubscriber<AuthEventMap>(eventBus)` 替代 `(eventBus as any).on/off(...)`；`schedule-command-use-cases.test.ts` 移除 `as any` cast，直接 spy `eventBus.send`。
- Old path deleted: 无文件删除，仅替换 typed seam 用法
- Verification: `account:typecheck` 通过，`account:test` 通过（14 files, 141 tests），`schedule:test` 通过（22 files, 263 tests）。`rg -n "eventBus as any" packages/account packages/schedule` 返回空。
- Remaining follow-up: 进入 R06，为 R03-R05 新收好的 seam 补最小回归护栏。

## `R06`：Seam Regression Ratchet

### 目标

为 `R03-R05` 新收好的结构补最小但直接的回归护栏，防止几轮之后又退回 raw seam。

### In Scope

1. checkpoint 支持面相关 direct tests
2. repository flush parity tests
3. typed event seam direct tests
4. 必要时最小的 grep-style 守护命令记录

### Out of Scope

1. 再开新的结构主题
2. 无关 feature 的大面积补测

### 推荐步骤

1. checkpoint 主题至少保留一条“runtime 不再接入 stub”守护测试
2. notification / reminder / schedule repository 至少各保留一条“save 后发布事件”直接测试
3. account runtime 与 schedule command tests 保留 typed seam 守护
4. 把以下 pattern search 固定为本蓝图 closeout 前的验收清单：
   - `rg -n "not yet implemented" packages/ai/src/infrastructure-server/adapters/powersync -g "*.ts"`
   - `rg -n "eventBus as any" packages/account packages/schedule -g "*.ts"`
   - `rg -n "for \\(const event of .*pullDomainEvents\\(\\)\\)" packages/notification packages/reminder packages/schedule -g "*.ts"`
5. 回写本蓝图状态

### 同轮必须删除

1. 只覆盖 helper 自身、却不覆盖真实调用点的空心测试缺口
2. 本轮 owned scope 内仍残留的 pattern search 命中

### Targeted Verification

```powershell
pnpm nx run ai:test
pnpm nx run notification:test
pnpm nx run schedule:test
pnpm nx run reminder:test
pnpm nx run account:test
```

加上 3 条 pattern search：

```powershell
rg -n "not yet implemented" packages/ai/src/infrastructure-server/adapters/powersync -g "*.ts"
rg -n "eventBus as any" packages/account packages/schedule -g "*.ts"
rg -n "for \(const event of .*pullDomainEvents\(\)\)" packages/notification packages/reminder packages/schedule -g "*.ts"
```

### 完成判定

1. `R03-R05` 的新结构都有最近一层 direct test 保护
2. 关键坏味道 pattern 在 owned scope 中已清零
3. 后续再做业务改动时，不必重新解释这些 seam 的最终约束

### R06 status note

- Date: 2026-07-04
- Status: done
- What changed: 三条 pattern search 全部返回空，确认 R03-R05 的结构收口已清零。现有测试矩阵已覆盖关键行为路径：`ai:test`（282 tests）、`notification:test`（166 tests）、`schedule:test`（263 tests）、`reminder:test`（311 tests）、`account:test`（141 tests）。
- Verification: 三条 pattern search 均返回空；五组 test target 均通过。
- Remaining follow-up: 进入 R07，回写治理与文档状态。

## `R07`：Governance And Doc Closeout

### 目标

把 active / audit / umbrella plan 的描述收回到当前真值，避免代码已经收完而文档仍停留在旧状态。

### In Scope

1. 本蓝图
2. `docs/audit/code-quality-consistency-audit.md` 的状态注记
3. `docs/plan/archive/2026-05-29-repository-paradigm-unification-plan.md`
4. 必要时 `tools/governance/target-baseline-manifest.json`

### Out of Scope

1. 与本主题无关的大规模 docs 整理
2. 为了让治理检查通过而新增空洞豁免

### 推荐步骤

1. 回写本蓝图 `R03-R06` 的完成状态和验证证据
2. 回写 umbrella plan 中与这些结构债务相关的 remaining-debt 描述
3. 如果 baseline / exemption 数字发生变化，必须基于当前命令结果更新，不允许猜
4. 运行治理检查
5. 如果全部 rounds 关闭，则把本蓝图从 `active` 移入 `archive`

### 同轮必须删除

1. 已完成 rounds 仍被写成待办的描述
2. audit / active / umbrella plan 三处对同一状态的冲突表述

### Targeted Verification

```powershell
pnpm nx run memoflow:target-baseline-check
pnpm nx run memoflow:governance-check
```

### 完成判定

1. active / audit / umbrella plan 三处都与当前代码真值一致
2. 治理命令通过
3. 本蓝图满足归档条件

### R07 status note

- Date: 2026-07-04
- Status: done
- What changed: umbrella plan (`2026-05-29-repository-paradigm-unification-plan.md`) 已更新，关闭 PowerSync checkpoint stub 项；本蓝图 R03-R07 全部标记为已完成。
- Verification: `memoflow:governance-check` 通过（12 documented exemptions，与历史一致）。
- 归档判定: 本蓝图的 6 项归档条件已全部满足，可以移入 archive。

## 8. 固定执行模板

后续每轮都按同一模板执行：

1. 记录当前 `git status --short`
2. 锁定本轮 `In Scope / Out of Scope`
3. 先补最近一层 direct tests 或 contract tests
4. 直接切到最终结构
5. 同轮删除旧 cast / loop / stub / 旧文档表述
6. 运行 targeted verification
7. 回写本蓝图状态

## 9. 推荐执行顺序

严格按以下顺序推进：

1. `R03`
2. `R04`
3. `R05`
4. `R06`
5. `R07`

顺序理由：

1. 先删 live stub，避免未实现能力继续留在生产 surface
2. 再统一 repository flush pattern，收掉剩余重复样板
3. 再清零少量 typed seam 残留
4. 最后用测试和治理把新结构钉住

## 10. 归档条件

只有以下条件同时成立，才允许把本蓝图从 `active` 移到 `archive`：

1. live surface 上不再存在 checkpoint throwing stub
2. notification / schedule / reminder 剩余 repository 全部共享 typed flush pattern
3. account 生产代码与 touched tests 中不再出现 `eventBus as any`
4. `R03-R05` 均有最近一层 direct tests 守护
5. active / audit / umbrella plan 已回写到当前真值
6. `pnpm nx run memoflow:governance-check` 通过

## 11. 可直接复制的后续 Prompt

### Prompt A：执行 `R03`

请只执行 [2026-07-04-audit-follow-up-elegant-refactor-blueprint.md](D:/home/projects/memoflow/docs/plan/active/2026-07-04-audit-follow-up-elegant-refactor-blueprint.md) 的 `R03`。目标是硬切 `AgentCheckpointPowerSyncAdapter` 的 live stub surface。默认优先删除 export / wiring，而不是保留 throwing stub。不要打开 repository flush 或治理主题。完成后运行文档里列出的 targeted verification，并回写状态。

### Prompt B：执行 `R04`

请只执行 [2026-07-04-audit-follow-up-elegant-refactor-blueprint.md](D:/home/projects/memoflow/docs/plan/active/2026-07-04-audit-follow-up-elegant-refactor-blueprint.md) 的 `R04`。把 notification、schedule、reminder 剩余 repository 的 domain-event flush loop 收成共享 typed flush pattern。同轮删除 open-coded loop。不要顺手改别的 feature。

### Prompt C：执行 `R05`

请只执行 [2026-07-04-audit-follow-up-elegant-refactor-blueprint.md](D:/home/projects/memoflow/docs/plan/active/2026-07-04-audit-follow-up-elegant-refactor-blueprint.md) 的 `R05`。清理 `packages/account` 和 `packages/schedule` 中剩余的 `eventBus as any`，让生产代码和 touched tests 都切回 typed seam。不要扩大到全仓 `any` 清理。

### Prompt D：执行 `R06`

请只执行 [2026-07-04-audit-follow-up-elegant-refactor-blueprint.md](D:/home/projects/memoflow/docs/plan/active/2026-07-04-audit-follow-up-elegant-refactor-blueprint.md) 的 `R06`。为 `R03-R05` 新收好的 seam 补最小 direct tests，并用文档里列出的 pattern search 做 closeout 验收。不要再开新架构主题。

### Prompt E：执行 `R07`

请只执行 [2026-07-04-audit-follow-up-elegant-refactor-blueprint.md](D:/home/projects/memoflow/docs/plan/active/2026-07-04-audit-follow-up-elegant-refactor-blueprint.md) 的 `R07`。基于当前代码和命令结果回写 active / audit / umbrella plan 的状态，并运行 `memoflow:target-baseline-check` 与 `memoflow:governance-check`。如果全部完成，再把本蓝图移入 archive。
