---
tags: [architecture, mcp, ai, local-agent, capability-matrix]
description: Desktop Local MCP 逐 Owner 能力矩阵、授权/审计路径与缺口状态（#1076 第一步）
created: 2026-11-24T00:00:00Z
updated: 2026-11-24T00:00:00Z
---

# Desktop Local MCP capability matrix

**状态：事实基线，不是路线图。** 本页按真实 owner port 与已装配代码记录 Desktop Local MCP 每项能力的输入/输出契约、权限、审计和宿主可用性，用以取代“工具数量等于能力”的读法。Hosted Gateway 的协议与发行边界见 [External Agent Gateway](./external-agent-gateway.md)、[ADR-116](./decisions/ADR-116-external-agent-capability-and-gateway-boundary.md)；本地宿主的凭据与云边界见 [ADR-124](./decisions/ADR-124-local-mcp-host-credentials-and-cloud-boundary.md)；笔记以 Obsidian 为 source of truth 见 [ADR-126](./decisions/ADR-126-obsidian-knowledge-connection-and-read-only-web.md)。改动任一注册点时同步更新本页。

## 1. 读法

宿主列：

- **Local native**：Desktop 内建 Agent run（`origin: 'run'`），受 connection grant 与用户交互审批约束。
- **Local client**：外部持久 MCP 客户端（ChatGPT Web 等经 loopback bearer，`origin: 'client'`），无交互审批通道。
- **Hosted**：云端 MCP（`apps/api`），OAuth/PAT 凭据，受 `EAG_*` 开关控制。

状态：

- `supported`：该宿主会发布工具并能经 owner 执行。
- `missing`：owner 能力已存在或已定义契约，但该宿主未绑定/未注册（实现缺口）。
- `blocked`：按 ADR-124/126、issue 非目标或安全策略有意不提供。

审计简写：`call` = 每次工具调用的 audit 行（本地 `LocalGatewayAuditRepository`；Hosted Gateway audit 事件，均只记录工具名、origin 与有界结果，不记录参数与正文）；`perm` = 统一业务权限 checkpoint 的 `PermissionAuditRecord`（`authorize`/`executeAuthorized`）。两者同时存在时写作 `call+perm`。

权限列写 MCP 工具背后的业务 operation；读操作仍需通过 checkpoint，但不受 `*:write` scope 限制。Local 写操作在执行事务内重新校验 connection revision 与 write scope。

## 2. 共享契约与入口

| 层                  | 位置                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 共享读描述符        | `packages/agent-gateway/src/read-tool-descriptors.ts`                                                              |
| 共享写描述符        | `packages/agent-gateway/src/write-tool-descriptors.ts`                                                             |
| Local 工具装配      | `apps/desktop/src/main/modules/ai/local-agent-tools.ts`、`packages/ai/src/server/local-agent/local-tool-bridge.ts` |
| Hosted 工具装配     | `apps/api/src/modules/agent-gateway/`、`apps/api/src/server.ts`                                                    |
| 本地 owner 写实现   | `packages/{goal,task,routine}/.../powersync/*-agent-mutations.ts`                                                  |
| Hosted owner 写实现 | `packages/{goal,task,routine}/.../prisma/*-agent-mutations.ts`                                                     |

## 3. 能力矩阵

### 3.1 Goal / Key Result

| Action (tool)            | Owner port / command                       | Input → output                                            | Permission                                       | Audit     | Local native | Local client                | Hosted                                |
| ------------------------ | ------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------ | --------- | ------------ | --------------------------- | ------------------------------------- |
| `goal_get`               | `GoalReadPort.getGoal`                     | `GoalGetInput → GoalGetOutput`                            | `goal.read`                                      | call+perm | supported    | supported                   | supported                             |
| `goal_search`            | `GoalReadPort.searchGoalPage`              | `GoalSearchInput → GoalSearchOutput`                      | `goal.read`                                      | call+perm | supported    | supported                   | supported                             |
| `goal_create`            | `GatewayWritePort.goalCreate` → Goal owner | `GatewayGoalCreateSchema → GatewayGoalReceiptSchema`      | `goal.create` + `goals:write`                    | call+perm | supported    | supported (scope)           | supported (scope)                     |
| `goal_update`            | `GatewayWritePort.goalUpdate` → Goal owner | `GatewayGoalUpdateSchema → GatewayGoalReceiptSchema`      | `goal.update` + `goals:write`                    | call+perm | supported    | supported (scope)           | supported (scope)                     |
| `goal_key_result_create` | `GatewayWritePort.keyResultCreate`         | `GatewayKeyResultCreateSchema → GatewayGoalReceiptSchema` | `key_result.create` + `goals:write`              | call+perm | supported    | supported (scope)           | supported (scope)                     |
| `goal_key_result_update` | `GatewayWritePort.keyResultUpdate`         | `GatewayKeyResultUpdateSchema → GatewayGoalReceiptSchema` | `key_result.update` + `goals:write`              | call+perm | supported    | supported (scope)           | supported (scope)                     |
| `goal_plan_validate`     | 纯校验，无 owner 写入                      | `GoalPlan → validation result`                            | 无（只读）                                       | call      | supported    | supported                   | supported                             |
| `goal_plan_apply`        | `applyGoalPlan` → Goal/Task owner          | `GoalPlan → apply result`                                 | `goal.create`/`task.plan.create` + `goals:write` | call+perm | supported    | supported (scope)           | supported (scope, assisted)           |
| `goal_panel_*`（8 个）   | Desktop Goal 原生表单桥                    | 面板命令 → snapshot/submit                                | `goal.update` 等                                 | call+perm | supported    | blocked（无桌面表单可接管） | blocked（Hosted 不控制 Desktop 窗口） |

### 3.2 Task

| Action (tool)              | Owner port / command                       | Input → output                                         | Permission                                                         | Audit     | Local native | Local client      | Hosted                               |
| -------------------------- | ------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------ | --------- | ------------ | ----------------- | ------------------------------------ |
| `task_plan_get`            | `TaskReadPort.getTaskPlan`                 | `TaskPlanGetInput → TaskPlanGetOutput`                 | `task.read`                                                        | call+perm | supported    | supported         | supported（`EAG_TASK_READ_ENABLED`） |
| `task_plan_search`         | `TaskReadPort.searchTaskPlans`             | `TaskPlanSearchInput → TaskPlanSearchOutput`           | `task.read`                                                        | call+perm | supported    | supported         | supported（同开关）                  |
| `task_occurrence_get`      | `TaskReadPort.getTaskOccurrence`           | `TaskOccurrenceGetInput → TaskOccurrenceGetOutput`     | `task.read`                                                        | call+perm | supported    | supported         | supported（同开关）                  |
| `task_occurrence_list`     | `TaskReadPort.listTaskOccurrences`         | `TaskOccurrenceListInput → TaskOccurrenceListOutput`   | `task.read`                                                        | call+perm | supported    | supported         | supported（同开关）                  |
| `task_plan_create`         | `GatewayWritePort.taskCreate` → Task owner | `GatewayTaskCreateSchema → GatewayTaskReceiptSchema`   | `task.plan.create` + `tasks:write`（绑定 Goal 再加 `goals:write`） | call+perm | supported    | supported (scope) | supported (scope)                    |
| `task_plan_update`         | `GatewayWritePort.taskUpdate`              | `GatewayTaskUpdateSchema → GatewayTaskReceiptSchema`   | `task.plan.update` + `tasks:write`                                 | call+perm | supported    | supported (scope) | supported (scope)                    |
| `task_occurrence_complete` | `GatewayWritePort.taskComplete`            | `GatewayTaskCompleteSchema → GatewayTaskReceiptSchema` | `task.occurrence.complete` + `tasks:write`                         | call+perm | supported    | supported (scope) | supported (scope)                    |
| `relation_neighbors`       | `RelationReadPort.getNeighbors`            | `RelationNeighborsInput → RelationNeighborsOutput`     | `relation.read`                                                    | call+perm | supported    | supported         | supported                            |

`relation_neighbors` 的可见性策略已收敛到 `packages/agent-gateway/src/server/relation-neighbors.ts`；Local 与 Hosted 只绑定各自的 `forward/reverse` 与 node 可见性回调，不各自复写过滤规则。证据：`local-agent-knowledge-local-reads.spec.ts`（真实 task/note owner + 一条指向不可见 goal 的边被省略）。

### 3.3 Routine

| Action (tool)      | Owner port / command                                                          | Input → output                                                               | Permission                                             | Audit     | Local native            | Local client                                   | Hosted                                       |
| ------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------ | --------- | ----------------------- | ---------------------------------------------- | -------------------------------------------- |
| `routine_get`      | `RoutineReadPort.getConfigurationSnapshot` → Routine configuration owner      | `RoutineGetInput → RoutineGetOutput`                                         | `routine.read`                                         | call+perm | supported               | supported                                      | supported                                    |
| `routine_list`     | 同上 + 有界 keyset/offset                                                     | `RoutineListInput → RoutineListOutput`                                       | `routine.read`                                         | call+perm | supported               | supported                                      | supported                                    |
| `routine_upcoming` | `RoutineReadPort.getUpcomingOccurrences`                                      | `RoutineUpcomingInput → RoutineUpcomingOutput`                               | `routine.read`                                         | call+perm | supported               | supported                                      | supported                                    |
| `routine_create`   | `GatewayWritePort.routineCreate` → `RoutineCoachCommandService.createRoutine` | `GatewayRoutineCreateSchema → GatewayRoutineReceiptSchema` + durable receipt | `routine.create` + `routines:write`                    | call+perm | supported               | supported (scope)                              | supported（`EAG_ROUTINE_WRITE_ENABLED`）     |
| `routine_update`   | 同上 `.updateRoutine`（expectedVersion）                                      | `GatewayRoutineUpdateSchema → GatewayRoutineUpdateReceiptSchema`             | `routine.update` + `routines:write`                    | call+perm | supported               | supported (scope)                              | supported（同开关）                          |
| `routine_pause`    | `.setTemporaryOverride`（snooze，≤30 天）                                     | `GatewayRoutinePauseSchema → GatewayRoutineOverrideReceiptSchema`            | `routine.update` + `routines:write`                    | call+perm | supported               | supported (scope)                              | supported（同开关）                          |
| `routine_override` | `.setTemporaryOverride`（suppress/interval，`expiresAt` 必填）                | `GatewayRoutineOverrideSchema → GatewayRoutineOverrideReceiptSchema`         | `routine.update` + `routines:write`                    | call+perm | supported               | supported (scope)                              | supported（同开关）                          |
| `routine_delete`   | `.deleteRoutine`（expectedVersion）                                           | `GatewayRoutineDeleteSchema → GatewayRoutineDeleteReceiptSchema`             | `routine.delete_permanent`（高风险）+ `routines:write` | call+perm | supported（可交互确认） | blocked（持久 bearer 无 fresh human approval） | supported（scope，无交互通道时 fail closed） |

本地 `routine_*` 写入全部经 `createRoutinePowerSyncAgentMutations`：一个 SQLite write transaction 内完成 owner 授权、幂等收据读写与 owner mutation，提交后触发 schedule/override 通知；不直接操作源表。Hosted 对等实现是 `createRoutinePrismaAgentMutations`。

### 3.4 Notification

| Action (tool)                         | Owner port / command                             | Input → output                                                 | Permission                                                           | Audit     | Local native | Local client | Hosted                                          |
| ------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------- | --------- | ------------ | ------------ | ----------------------------------------------- |
| `notification_get`                    | `NotificationReadPort` ← `NotificationInboxPort` | `NotificationGetInput → NotificationGetOutput`                 | `notification.read`                                                  | call+perm | supported    | supported    | supported                                       |
| `notification_list`                   | 同上                                             | `NotificationListInput → NotificationListOutput`               | `notification.read`                                                  | call+perm | supported    | supported    | supported                                       |
| `notification_unread_count`           | 同上                                             | `{} → NotificationUnreadCountOutput`                           | `notification.read`                                                  | call+perm | supported    | supported    | supported                                       |
| `notification_preferences_get`        | 同上 `.getPreferences`                           | `{} → NotificationPreferencesOutput`                           | `notification.read`                                                  | call+perm | supported    | supported    | supported                                       |
| `notification_mark_read`              | `NotificationInboxPort.markAsRead`               | `NotificationMarkReadInput → NotificationMarkReadOutput`       | `notification.update` + `notifications:write`                        | call+perm | supported    | supported    | supported                                       |
| `notification_mark_unread`            | 同上 `.markAsUnread`                             | `NotificationMarkUnreadInput → NotificationMarkUnreadOutput`   | `notification.update` + `notifications:write`                        | call+perm | supported    | supported    | supported                                       |
| `notification_archive`                | 同上 `.archive`                                  | `NotificationArchiveInput → NotificationArchiveOutput`         | `notification.update` + `notifications:write`                        | call+perm | supported    | supported    | supported                                       |
| `notification_restore`                | 同上 `.restore`                                  | `NotificationRestoreInput → NotificationRestoreOutput`         | `notification.update` + `notifications:write`                        | call+perm | supported    | supported    | supported                                       |
| `notification_preferences_update`     | 同上 `.updatePreferences`                        | `NotificationPreferencesInput → NotificationPreferencesOutput` | `notification.update` + `notifications:write`                        | call+perm | supported    | supported    | supported                                       |
| 执行通知 action / 外部发送 / 永久删除 | Notification owner                               | 不暴露任意 action 参数                                         | `notification.execute_action` / `send_external` / `delete_permanent` | —         | blocked      | blocked      | blocked（需逐次确认；MCP 不提供 action handle） |

写操作共用一个 owner transition 收据：仅返回 `id`、状态（`isRead`/`readAt` 或 `archivedAt`）、`version`、`updatedAt`，不返回正文、action handle、identity 或软删除标记。Local 与 Hosted 分别复用同一组 descriptor 与 owner port；Local 在每次调用前重新校验 connection revision 与 `notifications:write`，Hosted 由 credential scope 与 write authority 校验。`notifications:write` 是新的 Local scope，只对新签发连接/客户端生效，不追溯扩大旧 token。

证据：`apps/desktop/src/main/modules/ai/local-agent-domains.spec.ts`（`notification write tools execute through the real owner and read back`，真实 PowerSync Notification owner + 外部持久客户端 + 回读）；`packages/agent-gateway/src/server/read-gateway.spec.ts`（`exposes unread, archive, restore and preferences with owner state read back`）；`apps/api/src/modules/agent-gateway/notification.port.spec.ts`（所有权与 scope 拒绝）。

### 3.5 Schedule / Calendar

| Action (tool)         | Owner port / command                                         | Input → output                                        | Permission                                               | Audit     | Local native            | Local client                                   | Hosted                                                  |
| --------------------- | ------------------------------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------- | --------- | ----------------------- | ---------------------------------------------- | ------------------------------------------------------- |
| `schedule_get`        | `ScheduleReadPort` ← `ScheduleEventApplicationPort.getEvent` | `ScheduleGetInput → ScheduleGetOutput`                | `task.read`（现有映射）                                  | call+perm | supported               | supported                                      | missing（descriptor 存在，Host 未绑定 Schedule 读端口） |
| `schedule_list`       | 同上 `.listEvents`                                           | `ScheduleListInput → ScheduleListOutput`              | `task.read`                                              | call+perm | supported               | supported                                      | missing（同上）                                         |
| `schedule_create`     | `ScheduleEventApplicationPort.createEvent` → Schedule owner  | `ScheduleCreateInput → ScheduleWriteReceipt`          | `schedule.create` + `schedules:write`                    | call+perm | supported               | supported (scope)                              | supported (scope)                                       |
| `schedule_update`     | 同上 `.updateEvent`（expectedVersion，仅元数据）             | `ScheduleUpdateInput → ScheduleWriteReceipt`          | `schedule.update` + `schedules:write`                    | call+perm | supported               | supported (scope)                              | supported (scope)                                       |
| `schedule_reschedule` | 同上 `.updateEvent`（range + expectedVersion）               | `ScheduleRescheduleInput → ScheduleRescheduleReceipt` | `schedule.update` + `schedules:write`                    | call+perm | supported               | supported (scope)                              | supported (scope)                                       |
| `schedule_delete`     | 同上 `.deleteEvent`（expectedVersion）                       | `ScheduleDeleteInput → ScheduleDeleteReceipt`         | `schedule.delete_permanent`（高风险）+ `schedules:write` | call+perm | supported（可交互确认） | blocked（持久 bearer 无 fresh human approval） | supported（scope，无交互通道时 fail closed）            |

证据：`apps/desktop/src/main/modules/ai/local-agent-domains.spec.ts`（`schedule write tools execute through the real Calendar owner and read back`，真实 PowerSync Schedule owner + 外部持久客户端 + 经 `schedule_get`/`schedule_list` 回读 + 过期版本 CONFLICT + 删除需确认）；`packages/agent-gateway/src/server/read-gateway.spec.ts`（`Schedule hosted write capability`，发布/拒绝与 audit）；`apps/api/src/modules/agent-gateway/schedule.port.spec.ts`（Hosted 绑定、所有权与 scope 拒绝、CONFLICT）。

四个写工具共用同一个最小状态 receipt：创建/更新只返回 `id`、`version`、`updatedAt`，改期额外回显被接受的 `range`，删除返回 `id` + `deleted`；不返回 owner 完整 read model、identity 或审计字段。`schedules:write` 是新的 Local scope，只对新签发连接/客户端生效，不追溯扩大旧 token。`schedule_update` 只改标题、描述、地点与参与者，时间迁移只能走 `schedule_reschedule`，避免元数据补丁意外移动日程。Local 在每次调用前重新校验 connection revision 与 `schedules:write`；Hosted 由 credential scope 与 write authority 校验。删除不可恢复，因此按 #762 的高风险规则要求 fresh human approval：Local 原生 run 走交互确认，外部持久 token 不发布该工具，Hosted 在无交互通道时 fail closed。

“…睡前准备”类的 end-less Routine marker 只在 UI 投影层补展示时长并在当日 24:00 前裁切（`packages/schedule-ui/src/planner/PlannerCalendar.vue`），不修改源例程触发时间。

### 3.6 Knowledge / Notes

| Action (tool)                         | Owner port / command                                                  | Input → output                                            | Permission                                  | Audit     | Local native                    | Local client      | Hosted                                  |
| ------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------- | --------- | ------------------------------- | ----------------- | --------------------------------------- |
| `knowledge_search`                    | `IKnowledgeSourcePort.listRelevantNotes`                              | 本地 zod → 引用列表（≤20，≤120 KB）                       | `knowledge.search`                          | call+perm | supported（Knowledge 源已绑定） | supported         | blocked（ADR-126：Web 无本地 Vault）    |
| `knowledge_get`                       | `IKnowledgeSourcePort.getNoteBySource/ById`                           | 本地 zod → 单篇（正文 ≤100 KB）                           | `knowledge.get`                             | call+perm | supported（同前提）             | supported         | blocked（同上）                         |
| `knowledge_draft_create`              | `LocalKnowledgeDraftService.create`                                   | `KnowledgeDraftCreateInput → KnowledgeDraftView`          | `knowledge.note.create` + `knowledge:write` | call+perm | supported                       | supported (scope) | blocked（ADR-126：Hosted 无本地 Vault） |
| `knowledge_draft_get`                 | 同上 `.get`                                                           | `{ id } → KnowledgeDraftView \| null`                     | `knowledge.get`                             | call+perm | supported                       | supported         | blocked（同上）                         |
| `knowledge_draft_update`              | 同上 `.update`（expectedRevision）                                    | `KnowledgeDraftUpdateInput → KnowledgeDraftView`          | `knowledge.note.update` + `knowledge:write` | call+perm | supported                       | supported (scope) | blocked（同上）                         |
| `knowledge_draft_deliver`             | 同上 `.deliver` → `IKnowledgeNotePersistencePort.createKnowledgeNote` | `{ id, expectedRevision } → KnowledgeDraftDeliverReceipt` | `knowledge.note.create` + `knowledge:write` | call+perm | supported                       | supported (scope) | blocked（同上）                         |
| 任意 Markdown/路径写入、自动 Git 推送 | —                                                                     | —                                                         | —                                           | —         | blocked                         | blocked           | blocked                                 |

草稿只写入 Profile 本地 `local_knowledge_drafts`，不触碰 Vault；`knowledge_draft_deliver` 才通过 `IKnowledgeNotePersistencePort.createKnowledgeNote`（Desktop 绑定为 `LocalVaultRuntime.writeConfirmedNote`）写入已审阅内容。`expectedRevision` 使并发编辑 fail closed，同一 revision 的 `proposalId`/`requestId` 固定，重试重放同一次持久化而不产生副本。`knowledge:write` 是新的 Local scope，只对新签发连接/客户端生效；`knowledge_draft_get` 只需 `knowledge.get`，不要求写 scope。

证据：`apps/desktop/src/main/modules/ai/local-agent-knowledge-local-reads.spec.ts`（真实 `LocalVaultRuntime` + `IKnowledgeNotePersistencePort` + 外部持久客户端；create/get/update/deliver、过期 revision、重复交付与 `knowledge_get` 回读）。

### 3.7 AI 会话与 Agent 归档

| Action (tool)                | Owner port / command                           | Input → output            | Permission | Audit     | Local native | Local client | Hosted    |
| ---------------------------- | ---------------------------------------------- | ------------------------- | ---------- | --------- | ------------ | ------------ | --------- |
| `ai_conversation_list`       | `AssistantConversationReadPort` ← 本地会话投影 | metadata only             | `ai.read`  | call+perm | supported    | supported    | supported |
| `ai_conversation_get`        | 同上                                           | 首屏 transcript（≤25 条） | `ai.read`  | call+perm | supported    | supported    | supported |
| `ai_conversation_transcript` | 同上                                           | 分页 transcript           | `ai.read`  | call+perm | supported    | supported    | supported |
| `ai_agent_list`              | `AgentArchiveReadPort`                         | 6 个归档字段              | `ai.read`  | call+perm | supported    | supported    | supported |
| `ai_agent_get`               | 同上                                           | 单个归档条目              | `ai.read`  | call+perm | supported    | supported    | supported |
| Provider 凭据 / 主机配置读取 | —                                              | —                         | —          | —         | blocked      | blocked      | blocked   |

Local `ai_agent_list/get` 绑定 `AgentInstanceReadService` + Profile PowerSync 归档仓库，只投影 6 个字段，foreign/missing 都是 NOT_FOUND。证据同上（`local-agent-knowledge-local-reads.spec.ts`）。

### 3.8 标签与 assisted workflow

| Action (tool)                 | Owner port / command     | Input → output                                     | Permission                  | Audit     | Local native              | Local client              | Hosted                                 |
| ----------------------------- | ------------------------ | -------------------------------------------------- | --------------------------- | --------- | ------------------------- | ------------------------- | -------------------------------------- |
| `label_list`                  | `LabelReadPort`          | `LabelListInput → LabelListOutput`                 | `label.read`                | call+perm | supported                 | supported                 | supported                              |
| `label_resolve_names`         | 同上                     | `LabelResolveNamesInput → LabelResolveNamesOutput` | `label.read`                | call+perm | supported                 | supported                 | supported                              |
| `assisted_workflow_*`（5 个） | Assistant workflow owner | 见 assisted descriptors                            | `task.plan.*` / `task.read` | call+perm | blocked（桌面走原生面板） | blocked（无持久交互通道） | supported（`EAG_OAUTH_WRITE_ENABLED`） |

Local `label_list` / `label_resolve_names` 绑定已有 `LabelService`（`PowerSyncLabelRepository`），不直接读表。证据同上（真实 `LabelService` 创建与解析后经 MCP 回读）。

### 3.9 本地治理面（Settings → AI）

治理面不是新工具，而是把上表的本地客户端、令牌与审计能力接到既有设置区；UI 只调用宿主端口，不新增第二套运行时。

| 治理能力   | 宿主端口           | 界面落点                                                                  | 状态      | 证据                                                                             |
| ---------- | ------------------ | ------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------- |
| 端点/发现  | `getMcpEndpoint`   | 区块头部展示 loopback URL 与 discovery path；失败可重试                   | supported | `ExternalMcpClients.spec.ts`（端口错误可操作、重试后恢复）                       |
| 客户端列表 | `listMcpClients`   | 生效中列表与已撤销分区，显示 scope、创建/撤销时间与 token 前缀            | supported | 同上（加载态、空态、已撤销分区）                                                 |
| 一次性令牌 | `createMcpClient`  | 新建客户端对话框，一次性展示 token 与客户端配置片段                       | supported | 同上（令牌不再回显）；`local-mcp-governance-desktop.spec.ts`（真实 bridge 落库） |
| 吊销       | `revokeMcpClient`  | 行内撤销 → 应用内确认对话框 → 立即失效并转入已撤销分区                    | supported | 同上（确认/取消、旧 token 401）                                                  |
| 审计       | `listGatewayAudit` | 最近工具调用，显示 origin、effect、scope decision、outcome 与耗时；可刷新 | supported | 同上（真实客户端调用后回读）                                                     |

治理面只覆盖本 Profile 的持久客户端；provider 凭据、Hosted OAuth 客户端管理与云端审计查询仍不在本机界面内（见 §4 与 [External Agent Gateway](./external-agent-gateway.md)）。

## 4. 显式非目标（intentionally blocked）

以下不是缺口，不应作为后续 step 的“补齐”项：

- 任意 SQL、任意文件系统路径、任意 Vault 写入、Desktop 进程外非授权控制。
- 云端凭据/PAT/OAuth token 带入 Local MCP；Local MCP 只认本 Profile 的 bearer。
- Hosted 入口绕回本地数据库，或把 WSL 的本地端口开放到 WAN/Tailscale（ADR-124）。
- 无交互通道自动执行永久删除、批量写、外部发送；scoped bearer 只预授权普通写。
- 把新 `routines:write` 追溯加到已签发 token；scope 变更只能换发新 token。
- 用工具数量代替能力；未绑定 owner port 的 descriptor 不算 supported。

## 5. 与 #1077 的对照（#1076 第 2 项与午夜 Bug）

| #1076 诉求                                                 | 结论                                                         | 位置/证据                                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Local MCP 复用 Routine create/update/delete/pause/override | #1077 已覆盖；delete 仅原生 run，外部持久 token 有意不发布   | `apps/desktop/src/main/modules/ai/local-agent-tools.ts:512`；`local-agent-domains.spec.ts`                      |
| owner mutation receipts                                    | #1077 已覆盖（五类写共享 `routine_agent_mutation_receipts`） | `packages/routine/src/server/infrastructure/routine-agent-mutations.ts:385`                                     |
| PowerSync transaction 接口丢失                             | #1077 已覆盖（显式转发 `execute/get/getOptional/getAll`）    | 同上 `:327`；真实 SQLite/PowerSync 测试                                                                         |
| 外部客户端显式 `routines:write`，旧 token 不扩权           | #1077 已覆盖（新 client 需显式勾选；迁移只导入既有 scope）   | `packages/setting-ui/src/components/ExternalMcpClients.vue`；`packages/ai-contracts/src/api/local-agent.dto.ts` |
| scope 不得替代高风险 fresh consent                         | #1077 已覆盖                                                 | `packages/ai/src/server/permissions/authorize.ts`                                                               |
| 23:50 Routine 被延伸到次日 00:00                           | #1077 已覆盖（仅 UI 投影裁切，源触发时间不变）               | `packages/schedule-ui/src/planner/PlannerCalendar.vue:128`；`PlannerCalendar.spec.ts`                           |

本页不重做上述实现；#1076 第 3–7 项中，Notification 一组已在第二步补齐（见 3.4），Schedule 写已在本步补齐（见 3.5），Knowledge 草稿流与 Local Label/Relation/AI-agent 读已在本步补齐（见 3.6–3.8）；Governance UI 已接入既有设置区（见 3.9），完整验收仍为后续步骤。

## 6. 验证证据

2026-11-24 在 `feat/1076-local-mcp-matrix-routine` 上重跑（全部通过）：

| 命令                                                                                                                                          | 结果     |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `pnpm exec vitest run --project=desktop apps/desktop/src/main/modules/ai/local-agent-domains.spec.ts`                                         | 5 passed |
| `cd packages/schedule-ui && node ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts src/planner/PlannerCalendar.spec.ts`      | 8 passed |
| `cd packages/setting-ui && node ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts src/components/ExternalMcpClients.spec.ts` | 6 passed |
| `pnpm exec vitest run --project=ai packages/ai/src/server/permissions/authorize.spec.ts`                                                      | 7 passed |

未验证：真实 Windows Desktop 安装、真实 ChatGPT Web 经 WSL tunnel 的端到端路径、主机重启/断连恢复。本页只声明代码路径与定向测试事实。

### 6.1 Schedule 写（#1076 第三步，2026-11-24）

新增/更新的定向测试（CI 执行）：

- `pnpm exec vitest run --project=desktop apps/desktop/src/main/modules/ai/local-agent-domains.spec.ts`：真实 Schedule owner + 外部持久客户端 + 回读/冲突/删除确认。
- `pnpm exec vitest run --project=api apps/api/src/modules/agent-gateway/schedule.port.spec.ts`：Hosted 绑定、所有权、scope 与 CONFLICT。
- `pnpm exec vitest run --project=agent-gateway packages/agent-gateway/src/server/read-gateway.spec.ts`：descriptor 发布、scope 门禁、OAuth 开关与 audit。
- `pnpm exec vitest run --project=ai packages/ai/src/server/permissions/permission-policy.spec.ts`：`schedule.delete_permanent` 高风险登记。

本步在 dev 槽内无法执行 vitest（`node_modules/vitest/dist`、`vite/dist` 与 `oxfmt/dist` 缺文件，属该槽 ENOSPC 后的残留安装）。已执行的等效证据：`packages/agent-gateway` 全量 `tsc --noEmit`（含 spec）通过；用 Node 类型剥离 + 仓库 `paths` 加载真实源码，驱动 `registerWriteTools` → `bindScheduleWrites` → 真实 `ScheduleEventApplicationService`/`CalendarEntry` → `getEvent`/`listEvents` 回读，并调用真实 `authorize()` 验证 `schedules:write` 预授权普通写、`schedule.delete_permanent` 必须 ask。基线对照：`origin/main` 的 `write-tool-descriptors.ts` 中四个 `schedule_*` 写工具计数均为 0，本分支对应为 1。格式化未在本槽执行（oxfmt 缺失），提交前仅做人工 100 列换行与 `git diff --check`。

### 6.2 Knowledge 草稿流与 Local 域读（#1076 第四步，2026-11-24）

dev 槽已补齐 vitest/vite/tsx 等缺失 `dist` 后，以下定向测试均真实执行（`node node_modules/vitest/vitest.mjs run ...`，未触发 `pnpm install`）：

- `apps/desktop/src/main/modules/ai/local-agent-knowledge-local-reads.spec.ts`：4 passed。真实 `LocalVaultRuntime` + `DesktopKnowledgeNotePersistenceAdapter` + 外部持久客户端；draft create/get/update/deliver、过期 revision CONFLICT、重复交付幂等、`knowledge_get` 回读、无 scope 客户端拒绝；真实 `LabelService`、`AgentInstanceReadService`、`RelationService` + task/note owner 回读与不可见 peer 省略。
- `local-agent-knowledge.spec.ts`、`local-agent-domains.spec.ts`、`local-agent-tools.spec.ts`、`local-agent-writes.spec.ts`、`compose-ai.spec.ts`、`local-tool-bridge.spec.ts`、`permission-policy.spec.ts`：81 passed / 4 skipped。
- `packages/agent-gateway` `read-gateway.spec.ts`：37 passed（共享 relation 可见性重构后 Hosted 行为不变）。
- `apps/api/.../relation-read.port.spec.ts`：4 passed。
- `packages/setting-ui` `ExternalMcpClients.spec.ts`：6 passed（`knowledge:write` 选项仍按既有 UI 路径渲染）。
- `packages/agent-gateway` `tsc --noEmit`：0 errors；改动文件的定向 `tsc`：0 errors。
- `node ./tools/quality/fmt.mjs --check --changed`：0 different。
- 基线对照：`origin/main` 的 `local-agent-tools.ts` 中 `knowledge_draft`、Local `labels`/`relations`/`agents` 绑定的计数均为 0；本分支 `knowledge_draft` 为 13 处，且对应工具只在传入 owner port 时注册。

未验证：真实 Windows Desktop 安装、ChatGPT Web 经 WSL tunnel 的真实审批体验、Vault 写入后的 Obsidian 侧索引刷新。本页只声明代码路径与定向测试事实。

### 6.3 治理 UI（#1076 第五步，2026-11-24）

治理面复用 `packages/setting-ui/src/components/ExternalMcpClients.vue` 与既有 `SettingLocalAgentPort`，不新增运行时。本步补齐：撤销确认对话框、生效中/已撤销分区、加载态与空态区分、审计 effect 与刷新、以及撤销后旧 bearer 立即 401。另修正 `LocalMcpClient(ClientCreate)Schema` 仍把 `writeScopes` 上限写成 4 的旧值，现绑定 `LocalAgentWriteScopeSchema.options.length`，使 Settings 提供的六个 scope 可一次选中。

定向测试（dev 槽真实执行，未触发 `pnpm install`）：

- `cd packages/setting-ui && node ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts src/components/ExternalMcpClients.spec.ts`：10 passed（确认/取消、加载态、已撤销分区、审计 origin/effect、错误重试与令牌一次性回显）。
- `cd apps/desktop && node ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts src/renderer/platform/local-mcp-governance-desktop.spec.ts`：3 passed。真实 `LocalAgentToolBridge` + `LocalMcpClientRepository`/`LocalGatewayAuditRepository` + 真实 SQLite；从 Settings 组件创建后回读仓储、确认后撤销并验证旧 token 401，以及真实工具调用后的审计回读。
- `cd packages/ai-contracts && node ../../node_modules/vitest/vitest.mjs run src/api/local-agent.dto.spec.ts`：1 passed（六个 scope 的客户端契约）。

未验证：真实 Windows Desktop 安装、宿主重启后已撤销列表的视觉回归。本页只声明代码路径与定向测试事实。

## 7. 维护规则

- 新增或删除工具：同步改本矩阵对应行；descriptor 变更必须同时体现 owner port 与 permission operation。
- 新宿主（例如新的云端入口）先补“宿主列”，再谈能力。
- 出现 owner 能力但宿主未绑定，标 `missing` 而不是 `blocked`；只有 ADR/issue 明确禁止才标 `blocked`。
- 修改 Local 工具注册或授权路径时，相关测试文件变更后按仓库测试系统更新 `tools/test-system-v2/architecture-review-registry.json` 的 `sourceSha256`。
