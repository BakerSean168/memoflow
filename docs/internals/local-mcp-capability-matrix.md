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
| `relation_neighbors`       | `RelationReadPort.getNeighbors`            | `RelationNeighborsInput → RelationNeighborsOutput`     | `relation.read`                                                    | call+perm | missing      | missing           | supported                            |

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

| Action (tool)                         | Owner port / command                             | Input → output                                           | Permission                                                           | Audit     | Local native | Local client | Hosted                                          |
| ------------------------------------- | ------------------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------- | --------- | ------------ | ------------ | ----------------------------------------------- |
| `notification_get`                    | `NotificationReadPort` ← `NotificationInboxPort` | `NotificationGetInput → NotificationGetOutput`           | `notification.read`                                                  | call+perm | supported    | supported    | supported                                       |
| `notification_list`                   | 同上                                             | `NotificationListInput → NotificationListOutput`         | `notification.read`                                                  | call+perm | supported    | supported    | supported                                       |
| `notification_unread_count`           | 同上                                             | `{} → NotificationUnreadCountOutput`                     | `notification.read`                                                  | call+perm | supported    | supported    | supported                                       |
| `notification_mark_read`              | `NotificationInboxPort.markAsRead`               | `NotificationMarkReadInput → NotificationMarkReadOutput` | `notification.update` + `notifications:write`                        | call+perm | missing      | missing      | supported                                       |
| mark unread / archive / restore       | Notification owner                               | 未定义 MCP 契约                                          | —                                                                    | —         | missing      | missing      | missing                                         |
| preferences                           | Notification owner                               | 未定义 MCP 契约                                          | —                                                                    | —         | missing      | missing      | missing                                         |
| 执行通知 action / 外部发送 / 永久删除 | Notification owner                               | 不暴露任意 action 参数                                   | `notification.execute_action` / `send_external` / `delete_permanent` | —         | blocked      | blocked      | blocked（需逐次确认；MCP 不提供 action handle） |

### 3.5 Schedule / Calendar

| Action (tool)                         | Owner port / command                                         | Input → output                           | Permission              | Audit     | Local native | Local client | Hosted                                                  |
| ------------------------------------- | ------------------------------------------------------------ | ---------------------------------------- | ----------------------- | --------- | ------------ | ------------ | ------------------------------------------------------- |
| `schedule_get`                        | `ScheduleReadPort` ← `ScheduleEventApplicationPort.getEvent` | `ScheduleGetInput → ScheduleGetOutput`   | `task.read`（现有映射） | call+perm | supported    | supported    | missing（descriptor 存在，Host 未绑定 Schedule 读端口） |
| `schedule_list`                       | 同上 `.listEvents`                                           | `ScheduleListInput → ScheduleListOutput` | `task.read`             | call+perm | supported    | supported    | missing（同上）                                         |
| create / update / delete / reschedule | Schedule owner（expectedVersion / 幂等收据）                 | 未接入 MCP                               | —                       | —         | missing      | missing      | missing                                                 |

“睡前准备”类的 end-less Routine marker 只在 UI 投影层补展示时长并在当日 24:00 前裁切（`packages/schedule-ui/src/planner/PlannerCalendar.vue`），不修改源例程触发时间。

### 3.6 Knowledge / Notes

| Action (tool)                         | Owner port / command                        | Input → output                      | Permission         | Audit     | Local native                    | Local client | Hosted                               |
| ------------------------------------- | ------------------------------------------- | ----------------------------------- | ------------------ | --------- | ------------------------------- | ------------ | ------------------------------------ |
| `knowledge_search`                    | `IKnowledgeSourcePort.listRelevantNotes`    | 本地 zod → 引用列表（≤20，≤120 KB） | `knowledge.search` | call+perm | supported（Knowledge 源已绑定） | supported    | blocked（ADR-126：Web 无本地 Vault） |
| `knowledge_get`                       | `IKnowledgeSourcePort.getNoteBySource/ById` | 本地 zod → 单篇（正文 ≤100 KB）     | `knowledge.get`    | call+perm | supported（同前提）             | supported    | blocked（同上）                      |
| 草稿/新建/审阅后交付 Vault            | Knowledge draft owner                       | 未接入 MCP                          | —                  | —         | missing                         | missing      | missing                              |
| 任意 Markdown/路径写入、自动 Git 推送 | —                                           | —                                   | —                  | —         | blocked                         | blocked      | blocked                              |

### 3.7 AI 会话与 Agent 归档

| Action (tool)                | Owner port / command                           | Input → output            | Permission | Audit     | Local native | Local client | Hosted    |
| ---------------------------- | ---------------------------------------------- | ------------------------- | ---------- | --------- | ------------ | ------------ | --------- |
| `ai_conversation_list`       | `AssistantConversationReadPort` ← 本地会话投影 | metadata only             | `ai.read`  | call+perm | supported    | supported    | supported |
| `ai_conversation_get`        | 同上                                           | 首屏 transcript（≤25 条） | `ai.read`  | call+perm | supported    | supported    | supported |
| `ai_conversation_transcript` | 同上                                           | 分页 transcript           | `ai.read`  | call+perm | supported    | supported    | supported |
| `ai_agent_list`              | `AgentArchiveReadPort`                         | 6 个归档字段              | `ai.read`  | call+perm | missing      | missing      | supported |
| `ai_agent_get`               | 同上                                           | 单个归档条目              | `ai.read`  | call+perm | missing      | missing      | supported |
| Provider 凭据 / 主机配置读取 | —                                              | —                         | —          | —         | blocked      | blocked      | blocked   |

### 3.8 标签与 assisted workflow

| Action (tool)                 | Owner port / command     | Input → output                                     | Permission                  | Audit     | Local native              | Local client              | Hosted                                 |
| ----------------------------- | ------------------------ | -------------------------------------------------- | --------------------------- | --------- | ------------------------- | ------------------------- | -------------------------------------- |
| `label_list`                  | `LabelReadPort`          | `LabelListInput → LabelListOutput`                 | `label.read`                | call+perm | missing                   | missing                   | supported                              |
| `label_resolve_names`         | 同上                     | `LabelResolveNamesInput → LabelResolveNamesOutput` | `label.read`                | call+perm | missing                   | missing                   | supported                              |
| `assisted_workflow_*`（5 个） | Assistant workflow owner | 见 assisted descriptors                            | `task.plan.*` / `task.read` | call+perm | blocked（桌面走原生面板） | blocked（无持久交互通道） | supported（`EAG_OAUTH_WRITE_ENABLED`） |

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

本页不重做上述实现；#1076 第 3–7 项（Schedule 写、Notification 分级授权、Knowledge 草稿流、Governance UI、完整验收）仍为后续步骤。

## 6. 验证证据

2026-11-24 在 `feat/1076-local-mcp-matrix-routine` 上重跑（全部通过）：

| 命令                                                                                                                                          | 结果     |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `pnpm exec vitest run --project=desktop apps/desktop/src/main/modules/ai/local-agent-domains.spec.ts`                                         | 5 passed |
| `cd packages/schedule-ui && node ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts src/planner/PlannerCalendar.spec.ts`      | 8 passed |
| `cd packages/setting-ui && node ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts src/components/ExternalMcpClients.spec.ts` | 6 passed |
| `pnpm exec vitest run --project=ai packages/ai/src/server/permissions/authorize.spec.ts`                                                      | 7 passed |

未验证：真实 Windows Desktop 安装、真实 ChatGPT Web 经 WSL tunnel 的端到端路径、主机重启/断连恢复。本页只声明代码路径与定向测试事实。

## 7. 维护规则

- 新增或删除工具：同步改本矩阵对应行；descriptor 变更必须同时体现 owner port 与 permission operation。
- 新宿主（例如新的云端入口）先补“宿主列”，再谈能力。
- 出现 owner 能力但宿主未绑定，标 `missing` 而不是 `blocked`；只有 ADR/issue 明确禁止才标 `blocked`。
- 修改 Local 工具注册或授权路径时，相关测试文件变更后按仓库测试系统更新 `tools/test-system-v2/architecture-review-registry.json` 的 `sourceSha256`。
