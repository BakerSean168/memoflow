---
tags:
  - plan
  - archive
  - code-quality
  - consistency
  - architecture
  - testing
description: 基于 2026-07-01 代码质量审查结果的校正后优化与治理执行方案（已归档；剩余优雅收口由后续 active plan 接续）
created: 2026-07-01T00:00:00+08:00
updated: 2026-07-04T19:20:00+08:00
---

# 2026-07-01 Code Quality Consistency Remediation Plan

## 2026-07-04 implementation review status

本计划当前不能判定为“按原文完整完成”，但也不是“完全未实施”。

更准确的真值是：**部分关键切片已经落地，剩余高价值残留已被拆入新的 active plan 继续处理，因此本文件应归档为历史执行背景，而不是继续作为活跃接力入口。**

当前已确认落地的部分：

1. `reminder` 已抽出 `createReminderUseCases()`，关键模板 CRUD 已改成 use-case delegation。
2. `notification` facade 已不再直接执行 `db.execute()`；更新与偏好修改已经接到 use case。
3. task contracts 已完成本计划要求的关键收紧：
   - response schema 中关键 enum 改为 `z.enum()`
   - create/update schema 已 `.strict()`
   - `TaskType` 已补 `as const`
   - 已补最小 contract tests
4. 错误翻译链路已统一到 `@memoflow/http-client`，`app-vue` 与 `apps/web` 仅保留 re-export。
5. `scheduler-server` 已不再是 0 测试；`passWithNoTests` 也已由治理脚本收紧并白名单化。

当前仍未按本文原始目标完整收口的部分：

1. `reminder` 仍不是“薄 facade”终态：
   - `ReminderApplicationPort` 里仍保留多处 `Record<string, unknown>`
   - facade 内仍有不少 group/template orchestration 直接依赖 `ReminderDomainService`
2. `notification` 虽已清掉 direct SQL seam，但 `deleteNotification`、`batchDelete`、`cleanupOldNotifications` 等行为仍有 facade 级 orchestration，没有完全下沉到 use case / repository seam
3. API 数据库上下文没有按本文设想演进成多态 typed abstraction；仓库后来统一收到了共享 `PrismaClient` 契约
4. `app-vue` 高业务价值 composable 覆盖没有按本文目标整体补齐，当前只有局部补测

因此本文件的当前结论更新为：

1. 它作为“问题分层与优先级判断”的价值仍然成立
2. 它作为“当前 active 执行入口”的角色已经结束
3. 其剩余未完成项已收敛为新的更窄主线：
   - `reminder` facade 继续压薄
   - `notification` 剩余 facade orchestration 继续下沉
   - 全仓高价值 raw `eventBus.on/send` seam 继续 typed 化

后续应以 `docs/plan/archive/2026-07-04-post-core-seam-elegant-refactor-plan.md` 为新的执行真值，而不是继续在本文件上滚动追加。

## 1. 背景

`docs/audit/code-quality-consistency-audit.md` 已经给出一版覆盖全仓的自动化审查结果。该报告方向总体正确，尤其是对以下主题的判断具有较高价值：

1. `reminder` facade 过厚，偏离标准 use-case 装配模式
2. `notification` facade 中仍有直接持久化操作，边界不够统一
3. 若干共享层存在弱类型和重复错误翻译逻辑
4. contracts、测试治理、前端一致性仍有继续收口空间

但该报告也包含少量需要先校正的前提。如果不先校正，后续排期会被带偏。

## 2. 先校正审计前提

以下结论基于 2026-07-01 对当前工作树的二次核对。

### 2.1 `packages/app-vue` 不是 0 测试

仓库现状：

1. `packages/app-vue/src` 当前存在 49 个 `*.spec.ts` / `*.test.ts`
2. `apps/web/src` 当前存在 5 个测试文件
3. `packages/scheduler-server/src` 当前确实仍是 0 测试

因此，原审计中的“`app-vue` 和 `web` 为 0 测试”需要改写成：

1. `app-vue` 已有不少 store/helper/spec，但测试分布不均
2. `web` 已有 mock handler 与 server 侧测试，但缺真正业务层覆盖
3. 真正空白的是 `scheduler-server`

### 2.2 `DatabaseClient = any` 不能机械替换成单一 `PrismaClient`

`apps/api/src/shared/contracts/api-module.ts` 当前注释已经说明：

1. 该类型被设计为兼容多个 Prisma client
2. 当前目标不是“简单把 `any` 改成主库 `PrismaClient`”
3. 正确目标应是引入一个明确的 typed database abstraction 或 union/interface

因此，本计划把这一项定义为“收紧模块数据库上下文类型”，而不是“粗暴单型化”。

### 2.3 `notification` 的问题存在，但性质要分层

核对结果显示：

1. 该模块已经有 `createNotificationUseCases()`
2. 但 `updateNotification` 与 `updatePreferences` 仍直接使用 `db.execute()`
3. `deleteNotification` / `batchDelete` / `cleanupOldNotifications` 虽仍在 facade 中，但部分已经通过 repository 行为完成，不全是 raw SQL

因此，这一块的工作应定义为“把剩余 facade orchestration 与直接持久化逻辑下沉”，而不是“全模块推倒重来”。

## 3. 当前问题分层

本轮优化不把所有问题混成同一类，而是分成五层。

### 3.1 第一层：高风险架构偏差

1. `packages/reminder/src/infrastructure-server/reminder.module.ts`
2. `packages/notification/src/infrastructure-server/notification.module.ts`

特征：

1. facade 仍承担过多业务编排
2. use case、repository、mapper 边界不够清晰
3. 很难做局部行为验证与后续迭代

### 3.2 第二层：类型系统弱 seam

重点点位：

1. `apps/api/src/shared/contracts/api-module.ts`
2. `packages/utils/src/validation/builtin-validators.ts`
3. `packages/account/src/infrastructure-server/adapters/prisma/account-prisma.repository.ts`

特征：

1. 设计上想要强类型
2. 关键边界又通过 `any` 或宽 cast 逃逸
3. 运行时正确性过度依赖人为约定

### 3.3 第三层：contracts 与 schema 一致性

重点点位：

1. `packages/contracts/src/modules/task/api/response-schemas.ts`
2. `packages/contracts/src/modules/task/api/task-template.dto.ts`
3. `packages/contracts/src/modules/task/value-objects/task-type.ts`

特征：

1. task 与 goal 的 contracts 风格不完全一致
2. schema 严格度和 enum 表达存在落差
3. 这会影响 OpenAPI、输入校验和长期可维护性

### 3.4 第四层：前端共享错误翻译和 i18n 收口不足

重点点位：

1. `packages/http-client/src/result-http-client.ts`
2. `apps/web/src/platform/auth-web-service.ts`
3. `apps/web/src/auth/result-error.ts`
4. `packages/app-vue/src/views/DashboardView.vue`
5. `packages/app-vue/src/router/index.ts`

特征：

1. 错误消息在共享层和业务层重复
2. 多处硬编码中文文案
3. i18n 收口不彻底

### 3.5 第五层：测试与治理不均衡

重点点位：

1. `packages/scheduler-server` 无测试
2. `packages/app-vue` 测试覆盖集中在 store/helper，复杂 composable 和跨模块编排偏薄
3. 根 `vitest.config.ts` 开启 `passWithNoTests: true`
4. `reminder` 与 `schedule` 仍有手写 mock repository 模式

## 4. 本轮目标

本轮目标不是做一次“大扫除式重构”，而是把高风险问题收口为一组可连续交付的小切片。

### 4.1 必达目标

1. `reminder` 回到薄 facade + use-case delegation 的标准模式
2. `notification` 清掉剩余 direct persistence seam，至少不再在 facade 中直接写 SQL
3. API 模块数据库上下文从 `any` 收紧为明确抽象
4. task contracts 与 goal contracts 的关键风格对齐
5. 共享错误翻译链路统一，消除重复函数和共享层硬编码消息
6. 测试优先补高风险编排层，而不是只堆低价值数量
7. 把本轮经验沉淀为可执行治理，而不是只留在文档里

### 4.2 明确不做

1. 不做全仓 `as any` 清零
2. 不对所有 feature 包同时进行架构重构
3. 不在本轮重写所有前端页面文案
4. 不为了测试数字好看而补大批低价值 snapshot/spec
5. 不改变现有 API route surface 和主要传输契约

## 5. 执行原则

### 5.1 先收敛高风险，再做广覆盖一致性

优先级顺序固定为：

1. 架构偏差
2. 类型边界
3. contracts 一致性
4. 错误翻译与 i18n
5. 测试治理
6. 规则固化

### 5.2 每一轮都要求“局部可验证”

每个切片都必须满足：

1. 改动范围清楚
2. 最近邻 target 可运行
3. 行为不依赖“全仓一起改完才成立”

### 5.3 优先消灭重复实现，而不是先追求视觉统一

本轮前端优化以：

1. 共享错误翻译
2. i18n key 统一
3. composable 行为测试

为主，不以界面样式重构为主。

## 6. 执行阶段

## Phase 0: 审计校正与基线冻结

目标：在真正动代码前，把本轮工作的真值基线写清楚。

执行内容：

1. 保留 `docs/audit/code-quality-consistency-audit.md` 作为输入材料
2. 以本计划作为校正后的 canonical execution plan
3. 在后续实施中，若发现新的偏差，优先更新本计划顶部审计结论，而不是继续堆口头说明

完成标准：

1. 团队对“app-vue 已有测试、scheduler-server 真空白、DatabaseClient 需 typed abstraction”形成统一认知
2. 后续 PR 不再引用错误的 0 测试前提

## Phase 1: Reminder 模块回归标准装配模式

目标：把 `reminder.module.ts` 中的厚 facade 收回到 use case、mapper 和 repository 边界。

重点文件：

1. `packages/reminder/src/infrastructure-server/reminder.module.ts`
2. `packages/reminder/src/application-server/use-cases/commands/*.use-case.ts`
3. `packages/reminder/src/application-server/use-cases/queries/*.use-case.ts`

执行方向：

1. 新增 `createReminderUseCases()`，形成 typed use-case collection
2. 用 facade 薄委托替换 `createTemplate`、`updateTemplate`、`enableTemplate`、`pauseTemplate`、`toggleTemplate` 中的 inline orchestration
3. 把 `toTemplateClientDTO` / `toTemplateClientDTOList` 抽成稳定 mapper seam
4. 逐步收窄 `ReminderApplicationPort` 中 `Record<string, unknown>` 类型输入
5. 在迁移过程中优先保持 API surface 不变

完成标准：

1. facade 只保留参数整形、权限/上下文注入、use-case delegation
2. reminder 关键行为可以在 use-case 层被单独测试
3. `reminder.module.ts` 不再承担主要业务逻辑

验证：

1. `pnpm nx run reminder:test`
2. `pnpm nx run api:test:smoke`

## Phase 2: Notification 模块下沉剩余持久化与编排逻辑

目标：让 `notification` 重新贴齐“use case + repository + thin facade”模式。

重点文件：

1. `packages/notification/src/infrastructure-server/notification.module.ts`
2. `packages/notification/src/application-server/use-cases/**`
3. 相关 Prisma / repository adapter

执行方向：

1. 为 `updateNotification` 建专门 use case 或 repository method
2. 为 `updatePreferences` 建专门 use case 或 repository method
3. 评估 `deleteNotification`、`batchDelete`、`cleanupOldNotifications` 是否应进一步下沉
4. 彻底移除 facade 中的 `db.execute()` 持久化写操作
5. 保持现有 `createNotificationUseCases()` 作为统一装配入口继续演进

完成标准：

1. facade 不直接执行 SQL
2. notification 更新和偏好修改行为可被 use-case / repository 测试覆盖
3. 模块内“直接持久化写入”不再成为默认实现方式

验证：

1. `pnpm nx run notification:test`
2. 若存在近邻 integration target，则补跑对应 target

## Phase 3: 收紧 API 数据库上下文与生产弱类型点位

目标：把最危险的类型逃逸点收掉，但避免错误地把多数据库上下文压成单型。

重点文件：

1. `apps/api/src/shared/contracts/api-module.ts`
2. `apps/api/src/bootstrap.ts`
3. `packages/utils/src/validation/builtin-validators.ts`
4. `packages/account/src/infrastructure-server/adapters/prisma/account-prisma.repository.ts`

执行方向：

1. 设计 `DatabaseClient` 的明确抽象：
   - union
   - interface
   - 或 typed provider
2. 消除 `apps/api` 模块上下文中“无约束 `any` + 局部断言”的默认通道
3. 为 validator 返回对象引入精确泛型，减少 `builtin-validators.ts` 中的 `as any`
4. 为 account Prisma JSON 字段建立明确 adapter type，清理 repository 内的 `as any`

完成标准：

1. API 模块数据库上下文不再是裸 `any`
2. 两个高价值生产文件的 `as any` 明显下降
3. 类型修复不依赖大范围放宽 lint 或关闭规则

验证：

1. `pnpm nx run api:typecheck`
2. `pnpm nx run utils:test`
3. `pnpm nx run account:test`

## Phase 4: 收齐 task contracts 一致性

目标：让 task contracts 与 goal contracts 的关键模式对齐。

重点文件：

1. `packages/contracts/src/modules/task/api/response-schemas.ts`
2. `packages/contracts/src/modules/task/api/task-template.dto.ts`
3. `packages/contracts/src/modules/task/value-objects/task-type.ts`

执行方向：

1. 用 `z.enum()` 替换 task response schema 中关键 enum 字段的 `z.string()`
2. 为 task CRUD schema 补 `.strict()`
3. 为 `TaskType` 对象补外层 `as const`
4. 为这些 contracts 补针对性的 parse/validation 测试

完成标准：

1. task contracts 与 goal contracts 的关键风格差异收敛
2. OpenAPI 与 schema 行为更接近真实领域约束
3. 不再默许 task schema 静默吞掉多余字段

验证：

1. `pnpm nx run contracts:test`
2. `pnpm nx run task:typecheck`

## Phase 5: 统一错误翻译链路与前端 i18n 收口

目标：把错误翻译逻辑收成一条共享链路，减少共享层和业务层重复实现。

重点文件：

1. `packages/http-client/src/result-http-client.ts`
2. `apps/web/src/platform/auth-web-service.ts`
3. `apps/web/src/auth/result-error.ts`
4. `packages/app-vue/src/shared/utils/translate-result-error.ts`
5. `packages/app-vue/src/views/DashboardView.vue`
6. `packages/app-vue/src/router/index.ts`

执行方向：

1. 统一错误 code 到 message / i18n key 的映射来源
2. 删除或合并 `apps/web/src/auth/result-error.ts` 中与共享层重复的实现
3. 让 web auth service 与 shared `translateResultError()` 收敛到同一套语言
4. 顺手收口 `DashboardView.vue` 和 router title 中最显著的直写文案

完成标准：

1. 错误翻译链路只有一个 canonical 实现
2. 共享 HTTP client 不再直接持有业务级中文文案真值
3. web/auth/shared 之间不再复制同一套翻译逻辑

验证：

1. `pnpm nx run web:typecheck`
2. `pnpm nx run app-vue:test`
3. `pnpm nx run http-client:test`

## Phase 6: 按风险补测试，而不是按目录补测试

目标：把测试补到真正高价值的行为层，而不是追求表面数量。

测试优先级重新定义为：

1. `reminder` 重构后的 use-case 行为测试
2. `notification` 更新/偏好/批处理行为测试
3. `packages/app-vue` 高业务价值 composable：
   - `useTaskTemplates`
   - `useGoal`
   - `useReminder*`
4. `apps/web` router guard / platform lazy service loader
5. `packages/scheduler-server` 从 0 到 1 的最小单测
6. 把 `reminder`、`schedule` 中手写 mock repository 迁到统一 mock helper

完成标准：

1. 高风险编排层具备基本行为保护
2. `scheduler-server` 不再是纯空白区
3. `app-vue` 的测试分布从“store 偏多”向“复杂 composable 补齐”转移

验证：

1. `pnpm nx run reminder:test`
2. `pnpm nx run notification:test`
3. `pnpm nx run app-vue:test`
4. `pnpm nx run web:test`
5. `pnpm nx run scheduler-server:test`

## Phase 7: 把经验固化为治理门禁

目标：避免本轮修完后同类问题继续回潮。

执行方向：

1. 评估新增 governance/audit：
   - facade 复杂度或厚度阈值
   - facade 中 raw SQL / `db.execute()` 使用告警
   - 生产代码 `as any` 趋势统计
   - 共享层硬编码文案扫描
2. 重新审视根 `vitest.config.ts` 的 `passWithNoTests: true`
3. 若不能全局关闭，则至少改为白名单化或显式 documented exception

完成标准：

1. 本轮发现的高频异味具备自动发现能力
2. 测试空包不再默认静默通过
3. 文档约束开始转成脚本或配置约束

验证：

1. `pnpm nx run memoflow:governance-check`
2. 相关 lint / audit target

## 7. 推荐 PR 切分

本轮不建议做巨型单 PR，建议按以下顺序拆分。

1. `docs: add calibrated code quality remediation plan`
2. `reminder: extract and wire standard use-case assembly`
3. `reminder: add migration-safe use-case coverage`
4. `notification: move remaining persistence writes behind use cases or repositories`
5. `api/utils/account: tighten typed boundaries and remove high-value any seams`
6. `contracts: align task schemas with goal conventions`
7. `web/app-vue/http-client: unify result error translation and i18n seams`
8. `tests/governance: fill high-risk gaps and ratchet zero-test detection`

每个 PR 都应满足：

1. 有单一主目标
2. 有对应最近邻验证
3. 不与下一步强耦合到“必须一起合”

## 8. 风险与控制

### 风险 1：Reminder 重构把行为改坏

控制方式：

1. 先抽 use-case assembly，再迁 facade
2. 迁移前后以现有 smoke/use-case 测试兜底
3. 先保 transport contract，不同时做 DTO 重写

### 风险 2：Notification 重构范围失控

控制方式：

1. 只下沉剩余 direct persistence seam
2. 不在本轮顺手重写整个 notification domain
3. 把 repository method 扩展控制在行为需要范围内

### 风险 3：类型修复把多数据库场景打坏

控制方式：

1. 先定义 typed abstraction，再落实现
2. 明确治理模块与主库 client 的边界
3. 不接受“先改成单一 PrismaClient 再说”的投机收口

### 风险 4：前端 i18n 收口引发大面积 UI 改动

控制方式：

1. 本轮只处理共享错误翻译链路和最显著硬编码点
2. 不把页面级全面文案治理塞进同一轮

### 风险 5：测试补齐变成低价值数量工程

控制方式：

1. 以编排层和行为层优先
2. store 已有覆盖的区域不重复刷数量
3. 每新增一组测试，都要对应一个已知风险点

## 9. 验收标准

满足以下条件，才可认为本轮优化真正完成：

1. `reminder` facade 已显著变薄，并形成标准 `useCases` 组装入口
2. `notification` facade 中不再直接执行 SQL 写操作
3. API 模块数据库上下文不再是裸 `any`
4. task contracts 的 enum/strictness/const pattern 已与 goal 关键对齐
5. 共享错误翻译链路已统一，重复实现被删除
6. `scheduler-server` 不再是 0 测试
7. `app-vue` 高业务价值 composable 获得补测
8. `passWithNoTests` 至少被白名单化，不能再默认掩盖空测试包
9. 至少一条治理规则开始自动发现本轮同类异味

## 10. 最小验证矩阵

本轮收口完成前，至少需要跑通以下命令中的相关子集，并在各 PR 中就近执行：

1. `pnpm nx run reminder:test`
2. `pnpm nx run notification:test`
3. `pnpm nx run api:typecheck`
4. `pnpm nx run contracts:test`
5. `pnpm nx run task:typecheck`
6. `pnpm nx run web:typecheck`
7. `pnpm nx run app-vue:test`
8. `pnpm nx run scheduler-server:test`
9. `pnpm nx run memoflow:governance-check`

## 11. 与审计文档的关系

本计划与 `docs/audit/code-quality-consistency-audit.md` 的关系定义如下：

1. 审计文档是问题发现输入
2. 本计划是校正后、可执行的实施真值
3. 若实施过程中发现新的事实与审计文档冲突，以代码、配置、测试和本计划的滚动更新为准

## 12. 当前建议

建议直接从 `Phase 1` 开始，而不是先做泛化治理或全面补测。

原因：

1. `reminder` 是当前单点风险最高、收益最集中的位置
2. 这一步完成后，很多后续 decisions 会自然变清楚：
   - use-case assembly 的标准样板
   - mapper seam 的落点
   - facade 厚度的治理阈值
   - 行为测试应该放在哪一层

因此，本计划的推荐启动顺序是：

1. `Phase 1`
2. `Phase 2`
3. `Phase 3`
4. `Phase 4`
5. `Phase 5`
6. `Phase 6`
7. `Phase 7`
