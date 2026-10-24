---
tags:
  - plan
  - active
  - architecture
  - business-closure
  - reliability
description: 基础业务 P0/P1 问题的双视角复核与优雅修复方案
created: 2026-08-09T00:00:00Z
updated: 2026-08-09T00:00:00Z
---

# 基础业务 P0/P1 优雅修复计划

## 目标与边界

本计划承接 [`docs/audit/2026-08-09-business-modules-pm-diagnosis.md`](../../audit/2026-08-09-business-modules-pm-diagnosis.md)，只处理 Reminder cron/lease、Reminder→Notification 投递、账号关闭撤销、Goal 删除依赖、Task 计划原子创建、Schedule 并发/冲突投影、Knowledge projection、Settings 默认值、认证错误状态以及跨模块状态投影。目标是让“创建后会执行、执行后可追踪、失败可恢复、关闭后不可继续访问、并发修改不静默覆盖”成为共享基础设施不变量。

本轮只做审查和规划，不修改业务代码，不新增测试，不处理 P2、AI、移动端或付费能力。后续实施必须在独立变更中完成；所有新运行时能力都从组合根注入，禁止隐式 fallback。

## 双视角复核结论

- **产品视角**：诊断抓住了用户可感知的四个断点：到点不执行、记录成功但未投递、关闭后凭证仍有效、异步投影暂时不可见。P1 重复完成、密码错误消失和设置默认值属于体验闭环问题，应明确区分“首次成功”和“已完成/处理中/失败”。
- **项目视角**：部分问题不是单文件缺陷。Reminder 的真实 cron 工厂已经存在但 API 仍接入空 runtime；Notification 已有重试状态机但缺少生产 capability 约束和 durable dispatch；Schedule 有可选 `withTransaction`，却没有版本条件和重算任务契约；桌面端关闭账号的云端协调不能替代服务端撤销全部会话。上述问题需要先冻结跨模块契约，再分模块迁移。
- **补充遗漏**：所有异步链路都需要统一 delivery/operation receipt（状态、attempt、lease、lastError、nextRetryAt、deadLetterAt、correlationId），并具备按 identity 的授权查询与 replay；账号关闭还必须阻断新 token、清理/停用身份下的待投递工作。

## 根因判定表

| 问题                                                 | 复核定性                                                                 | 根因类型                                                                  | 重构或修复                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Reminder cron 未接入，默认 runtime `start/stop` 为空 | P0 定性准确；cron factory 已存在但未进入 API composition root            | 根本基础设施：运行时组合与调度 ownership 缺失                             | 重构为显式 scheduler capability，生产无 runtime 时 fail-fast            |
| Reminder 多实例扫描/先写历史后推进模板               | P1 准确；崩溃窗口和并发重复均可发生                                      | 根本基础设施：claim/lease 与投递意图持久化缺失                            | 重构为 durable reminder occurrence + atomic claim/状态机                |
| Notification no-op deliverer 被视为成功              | P0 准确；当前注释明确默认成功                                            | 根本基础设施：channel capability 与 fail-closed 启动策略缺失              | 重构 deliverer registry/capability，生产未配置即拒绝启动                |
| Notification 创建依赖进程内 dispatch                 | P1 准确；保存后事件丢失不会重放                                          | 根本基础设施：跨进程消息未使用事务 outbox                                 | 重构为 notification dispatch outbox + 幂等 worker                       |
| Account close 只关闭业务 Account                     | P0 准确；桌面端 cloud-close 是客户端补偿，不覆盖 Web/Bearer/其他 session | 根本基础设施：Account 与 Cloud Auth 生命周期未编排                        | 重构为服务端 account-closure saga，先禁用/撤销认证，再完成业务关闭      |
| Goal 删除依赖固定为 `false`                          | P1 准确；Task binding 不在 Goal aggregate children                       | 根本基础设施：跨领域查询边界错误                                          | 重构为 identity-scoped dependency read port，并在删除策略中 fail-closed |
| Goal 已完成但未归档可重复进入写路径                  | P1 定性准确                                                              | 局部代码：终态幂等条件不完整                                              | 简单修复状态机终态判断并返回同一 receipt                                |
| Task 模板/实例分步保存                               | P1 需以适配器证据确认，但事务能力是可选的，风险真实                      | 根本基础设施：持久化事务契约未强制                                        | 重构为 mandatory transaction runner，模板、实例、outbox 同一提交        |
| Schedule update 无 expected version                  | P1 准确                                                                  | 根本基础设施：并发控制契约不统一                                          | 重构 CalendarEntry conditional update/version receipt                   |
| Schedule delete 后冲突重算失败留下旧投影             | P1 准确；`withTransaction` 只能覆盖支持该能力的适配器                    | 根本基础设施：派生投影没有可重建可靠任务                                  | 重构为事务内变更 + conflict-rebuild outbox/lease worker                 |
| Knowledge commit 后 projection 延迟/失败不可恢复     | P1 准确；立即 upsert 已是优化，不是可靠保证                              | 根本基础设施：外部 commit 与本地 projection 状态没有统一 operation ledger | 重构为 projection operation 状态机、重放和用户可见 receipt              |
| Settings `loadDefaults` 未实现、无记录 reset 抛错    | P1 定性准确；分类参数丢失属于诊断中的 P2，本计划不处理                   | 局部代码/契约缺口                                                         | 简单修复 defaults 查询、空记录 materialize                              |
| Web 密码失败只 toast                                 | P1 准确，属于短生命周期 UI 状态丢失                                      | 局部代码：错误状态未写入共享 store                                        | 简单修复结构化 auth error receipt 与表单恢复状态                        |
| 跨模块状态语义不一致（Pending/Failed/Success）       | P1 横切遗漏                                                              | 根本基础设施：没有统一 operation/delivery projection                      | 重构共享状态词典、receipt schema、查询/指标/replay 入口                 |

## 分步实施方案

### W0：冻结契约、指标和迁移边界

**涉及文件**：`packages/contracts/src/modules/reliable-messaging/**`、新增业务 operation/delivery contract；各模块 `application` port；`docs/architecture/adr/ADR-042-unified-business-operation-and-delivery-contracts.md`（新增 ADR）；`docs/audit/2026-08-09-w0-infrastructure-audit.md`（盘点文档）。

**改动要点**：定义版本化 `BusinessOperationReceipt`、`DeliveryAttempt`、`LeaseClaim` 和 `ProjectionOperation`；统一 `pending/running/succeeded/skipped/failed/retryable/dead_letter/cancelled` 语义、幂等键（identity + source + occurrence）、correlation/causation；规定生产 capability 缺失必须 fail-fast，测试 double 只能显式注入。盘点 Prisma 表、事务 runner、outbox dispatcher、指标和运维 replay 权限（见盘点报告 [`docs/audit/2026-08-09-w0-infrastructure-audit.md`](../../audit/2026-08-09-w0-infrastructure-audit.md)）。

**验证方式**：契约 schema 正/负向校验；每个 operation 能关联 receipt、lastError、nextRetryAt 和 dead-letter；治理检查通过；不宣称任何业务行为已实施。

### W1：Reminder 调度与投递意图重构（P0/P1）

**涉及文件**：`packages/reminder/src/api/module.ts`、`server/infrastructure/runtime/reminder.runtime.ts`、`server/infrastructure/cron/reminder-trigger-cron-job.ts`、`server/domain/repositories/i-reminder-template-repository.ts`、Prisma reminder schema/repository；Reminder→Notification application port/outbox。

**改动要点**：API 组合根注入真实 cron，并由部署配置决定唯一 scheduler lane；以数据库 lease（owner token、expiry、heartbeat）保护扫描。新增按 `templateId + occurrenceKey` 唯一的 reminder occurrence/delivery intent；用 conditional claim 将 due→running，事务内写历史、推进 next trigger、写 Notification intent；崩溃由 lease expiry 恢复，重复 claim 返回原 receipt。Reminder 只发布可靠 intent，不直接依赖进程内事件。

**验证方式**：双实例抢同一 occurrence 只能一个 owner；进程在各写入点崩溃可恢复且不重复；暂停/分组禁用/过期/时区边界正确；cron start/stop/dispose 生命周期和 graceful shutdown 可观察；指标覆盖 due latency、claimed、failed、retry、dead-letter。

### W2：Notification channel capability 与 durable dispatch（P0/P1）

**涉及文件**：`packages/notification/src/server/infrastructure/runtime/notification.runtime.ts`、模块 composition root/deliverer registry、`create-notification.use-case.ts`、notification repository/schema、outbox dispatcher 与客户端 SSE adapter。

**改动要点**：按渠道注册真实 adapter（in-app、desktop/push 等）；生产启动前检查必需 capability，删除“无 deliverer 即成功”的默认行为。创建通知在同一事务写 aggregate、channel 和 dispatch outbox，outbox event 带 deliveryId/idempotencyKey；worker claim 后投递，成功/失败/重试/dead-letter 均落库，SSE 只是 outbox consumer，断线可从 receipt/list 恢复。提供按 identity 授权的 dead-letter/replay 运维接口。

**验证方式**：缺 adapter 启动 fail-fast；适配器超时、权限拒绝、断线和重复消费均产生正确状态；重放不重复发送；in-app 列表与实时事件最终一致；端到端指标能区分 persisted、dispatched、delivered。

### W3：Account/Cloud Auth 关闭生命周期（P0）

**涉及文件**：`packages/account/src/server/application/use-cases/commands/close-account.use-case.ts`、`account.module.ts`/application ports、`packages/cloud-auth/src/server/cloud-auth.ts`、Better Auth 管理/撤销 adapter、account lifecycle event handlers、相关 Prisma schema。

**改动要点**：新增服务端 `AccountClosureCoordinator`。以 closure operation/idempotency key 执行：标记 closure requested 并阻断新登录/refresh；撤销 identity 全部 `cloudAuthSession`、禁用或删除 cloud user/provider account；再在同一可恢复 saga 中关闭业务 Account，并发布 account-closed event 清理或取消 reminder/notification/repository pending work。失败保留 retryable receipt，重试安全；当前会话客户端收到明确 signed-out 状态。区分“撤销认证”与“删除用户数据”的审计和保留策略。

**验证方式**：Web、Bearer、Desktop 多会话全部失效；并发 close 幂等；任一步骤失败可重试且不会恢复登录；关闭后业务读取和新投递均 fail-closed；审计事件和 PII 清理符合现有政策。

### W4：Goal/Task 边界与持久化原子性（P1）

**涉及文件**：`packages/goal/.../delete-goal.use-case.ts`、Goal application ports；Task binding repository/query port；`create-task-template.use-case.ts`、template/instance repositories、transaction runner/outbox adapter。

**改动要点**：Goal 依赖检查通过专用 identity-scoped Task read port 查询 active bindings（不让 Goal 直接依赖 Task ORM）；存在 binding 时返回计数/警告并按产品策略阻止或要求先解绑。统一 Goal completed/archived 终态幂等，receipt 不再次写入。将 Task 模板、首批实例及相关 outbox 纳入强制事务 runner；适配器没有事务能力时组合根拒绝启动，不使用 inline fallback。

**验证方式**：跨 identity 查询隔离；删除前后绑定状态符合策略；重复完成不增加 version/event；模板保存失败或实例保存失败整体回滚；outbox 与聚合同 commit；故障注入和事务一致性检查通过。

### W5：Schedule 并发与冲突投影（P1）

**涉及文件**：`packages/schedule/src/server/application/services/schedule-event-application-service.ts`、CalendarEntry contract/aggregate/repository、`ScheduleConflictCacheService`、ScheduleLease/重算 worker 与 schema。

**改动要点**：更新 API 接受 `expectedVersion`，仓储执行 `WHERE identityId,id,version` 条件更新并返回 conflict receipt；客户端显示冲突而非覆盖。删除/更新与受影响时间窗口的冲突变更在同一事务提交；若投影成本过高，事务只写 versioned rebuild outbox，由带 lease 的 worker 重算，任务可重试、可重建且带 source revision。统一旧窗口和新窗口的 union 重算范围。

**验证方式**：双客户端并发只有一个成功；冲突响应包含当前版本；删除后 worker 重启仍能重建准确冲突；重复 outbox 消费幂等；缓存与基础事件查询可比对校验。

### W6：Knowledge projection、Settings 和认证体验收口（P1）

**涉及文件**：`packages/repository/src/server/application/services/knowledge-note-commit.service.ts`、write-request/projection repositories；`packages/app-vue/src/modules/setting/composables/useUserSetting.ts`、setting client/service/store、`reset-user-setting.ts`；`packages/app-vue/src/modules/authentication/composables/usePassword.ts` 与 auth store。

**改动要点**：Knowledge 将外部 Git commit 与 projection operation 绑定，Committed 但 projection pending/failed 必须可见、可重放、可刷新。Settings 增加 defaults query/store 初始化；无记录 reset 通过默认 aggregate materialize。密码 mutation 将结构化错误、request id、retryability 写入共享认证 store，页面卸载后仍可恢复并在成功时清除。

**验证方式**：模拟 webhook 延迟/失败/重复可重放且状态不倒退；Committed/Pending/Failed UI 与服务端一致；新用户全量 reset 返回默认值；刷新页面后仍能看到可操作错误；错误不会泄露凭据。

### W7：统一状态投影、运维入口和回归门禁

**涉及文件**：共享 receipt/query contracts、各模块 read model/controller、outbox/worker telemetry、Nx project targets、治理文档。

**改动要点**：提供按 identity/source 查询 operation timeline、失败原因、下次重试和 replay（最小权限、审计）；把 Reminder、Notification、Knowledge、Schedule rebuild、Account closure 接入同一指标命名和 dashboard；补跨模块集成测试、故障注入、schema/gov surface tests，更新正式 ADR/运行手册。禁止新增 silent success/no-op fallback。

**验证方式**：最近改动项目的 `lint`、`typecheck`、`test`/integration targets；跨模块故障矩阵；`pnpm nx run memoflow:governance-check`；local prod-like runtime 验证后再 PR。

## 实施顺序与依赖

1. W0 冻结契约和数据模型，是所有重构的前置条件。
2. W1、W2 可并行实现，但 W1 的 Notification intent schema 必须与 W2 共用 W0 receipt；W1 完成后才能宣称 Reminder P0 闭环。
3. W3 独立优先于清理策略；W3 发布的 account-closed event 是 W1/W2 取消 pending work 的输入。
4. W4 依赖 W0 的事务/identity port；W5 依赖同一 conditional-write 与 rebuild-outbox 能力。
5. W6 可在 W0 后并行，W7 必须最后执行并作为发布门禁。
6. 每个 work package 先落 contracts/adapter，再切换 composition root，最后删除旧 fallback；不得长期保留双轨行为。

## 风险与回滚

| 风险                               | 预防/监测                                                                 | 回滚策略                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| cron/worker 多实例重复处理         | lease fencing、唯一 occurrence、owner/expiry 指标                         | 停 scheduler lane，保留已落库 intent，由单实例 replay；不回退到无 lease 扫描 |
| 渠道 adapter 上线导致投递量下降    | capability startup check、delivery latency/dead-letter 告警、灰度 adapter | 禁用有问题渠道并保留 Pending/Failed；切换到人工 replay，不把 no-op 标为成功  |
| 账号关闭中途失败                   | closure receipt、阶段性审计事件、重试限流                                 | 暂停新登录并重试未完成阶段；不得恢复已撤销 session，必要时人工完成数据清理   |
| 新版本/事务 schema 不兼容          | 先扩展后切换、唯一键和状态迁移前校验                                      | 停写入口，worker 继续消费旧 receipt；按 operation 状态恢复，不删除历史记录   |
| projection 重算积压或版本倒退      | source revision、队列深度、lag、幂等 upsert                               | 停止实时 consumer，按 source revision 批量重建；读模型回退基础查询           |
| expectedVersion 引入客户端冲突增多 | 冲突率、重试成功率、用户可见冲突文案                                      | 保留条件更新；临时提高客户端重载/合并辅助，不恢复静默 last-write-wins        |

## 完成定义

- 所有 P0 均 fail-closed、可观测、可重试，并有真实生产 capability；
- P1 跨模块问题使用统一 receipt/outbox/lease/conditional-write，不以局部 try/catch 掩盖；
- 用户能区分成功、处理中、失败、已跳过、冲突和已关闭；
- 任何回滚都保留 operation/audit 历史，不重新引入 silent success；
- 本计划完成前不修改本文件状态、不声称代码已实施。
