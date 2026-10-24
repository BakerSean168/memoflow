---
tags:
  - plan
  - archive
  - architecture
  - refactor
  - governance
  - code-quality
description: 基于 2026-07-04 当前代码真值，对 core-seam 完成后的三类残留做继续优雅收口的执行方案（已完成并归档）
created: 2026-07-04T19:20:00+08:00
updated: 2026-07-05T10:37:17.8247222+08:00
---

# 2026-07-04 Post Core-Seam Elegant Refactor Plan

## 0. 2026-07-05 归档结论

本计划已完成，不再作为 active 执行入口。

最终已完成的事项：

1. `reminder` thin-facade 收口完成
2. `notification` remaining facade orchestration downshift 完成
3. 高价值 raw `eventBus` 入口 typed 化完成两批收口
4. 新增 `tools/governance/raw-event-bus-audit.mjs`，并接入 `memoflow:governance-check`

最终验证结论：

1. `reminder` / `notification` / `schedule` 最近邻 typecheck 与 test 通过
2. `api:test:smoke`、`desktop:test:main` 通过
3. `memoflow:governance-check` 通过
4. `packages/app-vue` 独立 typecheck 仍有既有测试类型错误，不属于本计划引入

## 1. 文档定位

本文件原为 active plan；截至 2026-07-05，计划已实施完成并归档。

它不重新打开已经完成并归档的主线，而是承接以下两份历史方案在当前代码里留下的真实残留：

1. [2026-07-01-code-quality-consistency-remediation-plan.md](D:/home/projects/memoflow/docs/plan/archive/2026-07-01-code-quality-consistency-remediation-plan.md)
2. [2026-07-04-core-seam-reconvergence-multi-round-executable-plan.md](D:/home/projects/memoflow/docs/plan/archive/2026-07-04-core-seam-reconvergence-multi-round-executable-plan.md)

当前真值不是“主线没做完”，而是：

1. `core-seam reconvergence` 已完成并归档
2. repository / public-surface / baseline / no-tests 治理主线也已完成并归档
3. 剩余问题收敛为三类更窄、更适合继续优雅重构的残留

## 2. 当前残留的真实分类

### 2.1 `reminder` facade 仍偏厚

当前已完成的部分：

1. `createReminderUseCases()` 已存在
2. 模板 CRUD 的主路径已经委托给 use case
3. mapper seam 已从纯 inline 逻辑抽出

当前仍残留的问题：

1. `ReminderApplicationPort` 仍暴露多处 `Record<string, unknown>`
2. facade 仍直接持有较多 group/template orchestration
3. `getUpcomingReminders` / `getTodaySchedule` / group 相关写路径还没有完全压回更稳定的 application seam

根因不是“没有 use case”，而是：

1. 旧 facade 被部分瘦身后停在中间态
2. domain service、mapper、application port 的职责边界还没完全切齐

### 2.2 `notification` 已清掉 direct SQL，但 facade orchestration 仍偏重

当前已完成的部分：

1. `createNotificationUseCases()` 已存在
2. `updateNotification` / `updatePreferences` 已不再在 facade 内直接写 SQL
3. direct `db.execute()` seam 已收掉

当前仍残留的问题：

1. `deleteNotification`
2. `batchDelete`
3. `cleanupOldNotifications`
4. 部分 list/query shaping

这些行为仍然留在 facade 里直接编排 repository，而不是进一步下沉到更稳定的 use case / repository seam。

根因不是“notification 没有模块化”，而是：

1. 第一轮只先清了 direct persistence seam
2. 剩余编排逻辑没有继续完成第二步下沉

### 2.3 高价值 raw `eventBus.on/send` seam 仍未 typed 化

当前已完成的部分：

1. `typed-event-port.ts` / `flush-domain-events.ts` 已存在
2. `core-seam` 主链里依赖 cast 的 event seam 已清掉
3. `schedule-orchestration` 已在新主链中使用 typed publisher / subscriber

当前仍残留的问题不是 `eventBus as any`，而是：

1. 仍有一批生产代码直接调用原始 `eventBus.on/off/send`
2. 这些调用没有统一收口到 typed wrapper
3. 规则层当前也没有禁止“高层代码直接碰 raw eventBus API”

高价值残留集中在：

1. `packages/schedule/src/api/runtime.ts`
2. `apps/desktop/src/main/events/initialize-event-listeners.ts`
3. `apps/desktop/src/main/services/notification.service.ts`
4. `packages/notification/src/application-server/use-cases/commands/create-notification.use-case.ts`
5. `packages/reminder/src/application-server/use-cases/commands/*`
6. `packages/authentication/src/api/runtime.ts`
7. `packages/governance/src/api/runtime.ts`
8. `packages/setting` / `packages/data-portability` 中的事件发送点

## 3. 本轮目标

本轮不做新的 umbrella-level 改造，只做三个残留主题的继续优雅收口：

1. 把 `reminder` 继续压成薄 facade
2. 把 `notification` 剩余 facade orchestration 下沉
3. 把高价值 raw event seam 收到 typed entry，并补最低限度治理门禁

完成后的目标形态：

1. 宿主层、module facade、use case、domain service 的边界更清楚
2. facade 默认只做参数整形、上下文注入和 delegation
3. 业务事件的发送/订阅优先走 typed seam，而不是高层直接碰 raw event bus

## 4. 明确不做

1. 不重新打开 `core-seam reconvergence`
2. 不再新建第二套 orchestration / runtime 结构
3. 不做全仓 `eventBus` 一次性清零
4. 不借机做无关的 contracts / UI / i18n 扫荡式整理
5. 不为了“更干净”而引入兼容层或 wrapper 套 wrapper

## 5. 执行原则

### 5.1 继续沿用“同轮删旧”

只要某一轮已经引入更好的最终结构，同轮就要删掉对应旧路径或旧编排方式。

### 5.2 只收高价值生产 seam

本轮对 event seam 的目标是高价值生产路径，不是立即把 debug 脚本、README 示例和所有测试都做成零命中。

### 5.3 结构收口优先于数量型补测

先收路径，再补最近一层直达测试；不为了制造测试数量而把时间花在低价值 spec 上。

## 6. 分阶段执行

## Phase 0: 基线冻结

目标：把当前三类残留的真实范围固定下来，避免执行中重新把已完成主线混进来。

执行内容：

1. 以本文件作为新的 active 执行入口
2. 保留两份 archive 方案作为背景，不再在它们上追加 active 状态
3. 记录当前高价值 raw `eventBus.on/off/send` 命中清单
4. 记录 `reminder` / `notification` 中仍然留在 facade 的 orchestration 清单

完成标准：

1. 后续 PR 不再把 `core-seam` 已完成事项误判成当前未完成项
2. 剩余问题被清楚约束在三类残留之内

## Phase 1: Reminder Thin Facade Completion

目标：把 `reminder` 从“半薄 facade”继续收成“默认 delegation，少量必要编排显式集中”。

重点文件：

1. `packages/reminder/src/infrastructure-server/reminder.module.ts`
2. `packages/reminder/src/application-server/use-cases/**`
3. `packages/reminder/src/application-server/mappers/**`
4. 必要时 `ReminderDomainService`

执行方向：

1. 盘点 facade 中仍直接编排 `ReminderDomainService` 的方法
2. 把 group/template 生命周期里最重的编排下沉到 use case 或稳定 application service
3. 收紧 `ReminderApplicationPort` 中 `Record<string, unknown>` 输入
4. 明确哪些计算型逻辑保留在 domain service，哪些属于 application orchestration
5. 不改变对外 API surface

完成标准：

1. template/group 主要写路径不再直接散落在 facade 中
2. `ReminderApplicationPort` 的宽输入显著下降
3. facade 只剩少数必要 delegation + context wiring

验证：

1. `pnpm nx run reminder:test`
2. `pnpm nx run reminder:typecheck`
3. `pnpm nx run api:test:smoke`

## 6.1 当前执行进度（2026-07-04）

### 已完成

1. `Phase 0` 已完成：active/archive 计划边界已冻结，当前执行入口已切到本文件。
2. `Phase 1` 已完成：`reminder` facade 已从“半薄”收口到“默认 delegation”。

本轮已落地的 reminder 收口包括：

1. 抽出并接入 `ReminderGroupApplicationService`
2. 抽出并接入 `ReminderPreferencesApplicationService`
3. 抽出并接入 `ReminderTemplateActionApplicationService`
4. 抽出并接入 `ReminderScheduleQueryApplicationService`
5. `ReminderApplicationPort` 中 group / preferences 宽输入已收紧为显式 contract type
6. `ReminderController.updatePreferences()` 已改为 `UpdateReminderPreferencesSchema.safeParse(...)`
7. `application-server` barrel 已补齐 `services` 导出

直接结果：

1. `packages/reminder/src/infrastructure-server/reminder.module.ts` 不再内联 group / preferences / template-actions / schedule-query 编排
2. group read/write 返回值统一回到 client DTO，而不是 aggregate 实例
3. template history 返回值统一回到 client DTO，而不是 entity 实例
4. `moveTemplate` 不再在 facade 层重复补做 group stats 更新

本轮验证：

1. `..\\..\\node_modules\\.bin\\tsc.cmd --noEmit -p tsconfig.json`（`packages/reminder`）通过
2. `node ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts`（`packages/reminder`）通过，`36` 个 test files、`322` 个 tests 全绿

### 结案状态

`Phase 2`、`Phase 3`、`Phase 4` 已全部完成。

本轮继续落地的关键收口包括：

1. `notification` facade 的 `list/get/delete/batchDelete/cleanupOldNotifications` 已下沉到 application services
2. `schedule`、`desktop`、`notification`、`reminder`、`authentication`、`governance`、`data-portability`、`app-vue` 的高价值 raw event seam 已改为 typed publisher / subscriber
3. 新增 `tools/governance/raw-event-bus-audit.mjs`，并接入 `memoflow:governance-check`

补充说明：

1. `packages/app-vue` 独立 typecheck 仍存在既有测试类型错误，集中在 `src/modules/task/composables/useTaskTemplates.spec.ts` 的 `Mock<Procedure | Constructable>` 约束，不属于本轮引入
2. 后续如继续演进 `reminder`，优先补 typed request schema，而不是重新引入新的 orchestration 层

## Phase 2: Notification Orchestration Downshift

目标：在已经清掉 direct SQL 的基础上，把剩余 facade orchestration 继续下沉。

重点文件：

1. `packages/notification/src/infrastructure-server/notification.module.ts`
2. `packages/notification/src/application-server/use-cases/**`
3. 必要时相关 repository adapter / port

执行方向：

1. 为 `deleteNotification` 建独立 use case 或更明确的 repository/application seam
2. 为 `batchDelete` 建稳定批处理用例
3. 为 `cleanupOldNotifications` 明确 application ownership
4. 若 `listNotifications` 的分页整形继续留在 facade 不优雅，则收成显式 query use case
5. 不重新设计 notification domain

完成标准：

1. facade 中不再保留主要删除/批量/清理编排逻辑
2. notification facade 更接近纯 delegation
3. 关键行为可在 use-case 层或最近一层 integration test 里单独验证

验证：

1. `pnpm nx run notification:test`
2. `pnpm nx run notification:typecheck`

## Phase 3: High-Value Typed Event Entry Convergence

目标：把最重要的 raw `eventBus.on/off/send` 入口收回 typed seam。

优先范围：

1. `packages/schedule/src/api/runtime.ts`
2. `apps/desktop/src/main/events/initialize-event-listeners.ts`
3. `apps/desktop/src/main/services/notification.service.ts`
4. `packages/notification/src/application-server/use-cases/commands/create-notification.use-case.ts`
5. `packages/reminder/src/application-server/use-cases/commands/*`

第二批范围：

1. `packages/authentication/src/api/runtime.ts`
2. `packages/governance/src/api/runtime.ts`
3. `packages/setting/**`
4. `packages/data-portability/**`

执行方向：

1. 为订阅侧建立 typed subscriber entry
2. 为发送侧建立 typed publisher entry
3. 高层模块只依赖 typed seam，不直接碰 raw `eventBus`
4. 保留 `global-event-bus` 作为底层 adapter，不把它当高层默认 API

完成标准：

1. 第一批高价值生产路径不再直接调用 raw `eventBus.on/off/send`
2. 新增或保留的 typed seam 具有明确 event map
3. 没有为了 typed 化再引入新的 cast helper

验证：

1. `pnpm nx run schedule:test`
2. `pnpm nx run desktop:test:main`
3. `pnpm nx run notification:test`
4. `pnpm nx run reminder:test`

## Phase 4: Governance Ratchet For Residual Seams

目标：把这三类残留的经验固化成最小机器门禁。

执行方向：

1. 评估新增 pattern audit：
   - facade 中高密度 domain-service/repository orchestration
   - 高层生产代码 direct `eventBus.on/off/send`
2. 至少对白名单之外的生产目录禁止新增 raw event bus 访问
3. 让后续新增 facade 逻辑更难回退到“半 module、半 service locator”状态

完成标准：

1. 本轮发现的高频残留至少有一条能被自动发现
2. 后续代码不能在高层默默重新引入 raw event seam

验证：

1. `pnpm nx run memoflow:governance-check`

## 7. 推荐 PR 切分

1. `docs: archive prior implementation plans and add post-core-seam active plan`
2. `reminder: finish thin-facade convergence`
3. `notification: downshift remaining facade orchestration`
4. `events: converge high-value raw event bus entries to typed seams`
5. `governance: ratchet residual facade and raw-event seams`

## 8. 风险与控制

### 风险 1：Reminder 再次把 domain service 和 use case 职责搅混

控制方式：

1. 先列出仍留在 facade 的真实 orchestration
2. 一次只下沉一类行为
3. 优先让 use case 负责流程，domain service 负责领域规则

### 风险 2：Notification 为了“下沉”引入无意义包装层

控制方式：

1. 只有当行为边界更清楚时才新增 use case
2. 若 repository method 已是正确落点，就不要硬塞 application wrapper

### 风险 3：Typed event 收口变成全仓大扫除

控制方式：

1. 只按高价值生产路径分批推进
2. 第一批完成后再决定第二批是否值得继续

## 9. 验收标准

只有以下事实同时成立，才可把本计划视为完成：

1. `reminder` facade 中高密度 orchestration 已显著下降
2. `notification` facade 不再承担主要删除/批量/清理编排
3. 第一批高价值 raw `eventBus.on/off/send` 生产入口已 typed 化
4. 至少一条新治理规则能发现本轮同类回退
5. 最近邻验证与 `memoflow:governance-check` 通过

## 10. 最小验证矩阵

1. `pnpm nx run reminder:test`
2. `pnpm nx run reminder:typecheck`
3. `pnpm nx run notification:test`
4. `pnpm nx run schedule:test`
5. `pnpm nx run desktop:test:main`
6. `pnpm nx run api:test:smoke`
7. `pnpm nx run memoflow:governance-check`

## 11. 与历史方案的关系

本文件与前述 archive 方案的关系如下：

1. `2026-07-04 core-seam reconvergence` 已完成，不回滚
2. `2026-07-01 code-quality remediation` 的部分目标已实现，未实现部分只保留当前仍有价值的三类残留
3. 截至 2026-07-05，上述三类残留已完成收口，本文件已移入 `docs/plan/archive`
