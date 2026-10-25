---
tags:
  - plan
  - archive
  - ai
  - agent
  - mastra
  - refactor
description: MemoFlow AI vNext Mastra-native 一次性大重构实施计划
created: 2026-08-20T00:00:00+08:00
updated: 2026-08-23T00:05:00+08:00
---

# MemoFlow AI vNext — Mastra-native 一次性大重构实施计划

> **归档结论（2026-08-23）**：AI-VNEXT-01–09 全部完成。实施 PR [#252](https://github.com/BakerSean168/memoflow/pull/252) 已 squash merge 为 `5507722e2`；最终 required CI run `32581922602` 全绿。合并前 clean-HEAD local Docker 验收基于 `f23d9cb184d64d5a6abe3e9e2bb81141ec436b9e`：API/Web first-party image revision 精确匹配、API/Web/PowerSync/Postgres/Redis healthy、PowerSync 派生镜像配置与仓库 SHA256 一致；最终 review 无未解决 P0/P1/P2。

## 1. 文档地位

本计划执行：

- [ADR-050](../../architecture/adr/ADR-050-mastra-native-ai-runtime.md)
- [ADR-051](../../architecture/adr/ADR-051-ai-primitive-taxonomy.md)
- [ADR-052](../../architecture/adr/ADR-052-goal-create-reference-workflow.md)

本计划已完成并归档；实现后的 canonical AI runtime 以代码、ADR-050/051/052 与 current-system docs 为真值。旧 Agent Host / LangGraph / Pi 目标态计划同样只保留历史参考价值。

## 2. 实施姿态

本任务采用 **single-branch decisive rewrite**，不是长期双轨迁移：

- 目标架构优先，现有实现只决定迁移成本；
- 允许同一 PR 大范围修改 contracts、server、desktop、Vue、database、docs/tests；
- 不为兼容旧 Agent Host 长期保留 adapter/shim；
- 临时兼容代码只能存在于同一分支的中间 commit，最终 PR 必须删除；
- 不拆成多个长期 PR 让旧/新 runtime 并存；
- 但每个批次仍必须有可运行验证，防止“大改”退化成不可审查的盲改。

最终拓扑：

```text
UI
 -> existing HTTP/IPC host
 -> @memoflow/ai Mastra Runtime
      |- AgentController / Assistant
      |- Workflows
      |- Memory / Storage
      |- ModelResolver
      |- Observability / Eval
      `- typed Domain Tools / Application Ports
 -> Goal / Task / Reminder / Knowledge domains
```

必须消失：Python AI business runtime、LangGraph checkpoint bridge、自研 Turn/Workflow/Capability/Proposal runtime、UI AgentAction DAG orchestration。

## 3. Protected Business Invariants

大重构不保护旧实现，但保护下列已经正确的业务 invariant：

1. authenticated `ExecutionContext.identityId` 是身份真值；客户端不能注入 identity。
2. Goal/Task/Reminder/Knowledge mutation 走各自 Application Port/Use Case，不让 Agent 直写 persistence。
3. Provider credential 加密保存，API key 不进入 client DTO/prompt trace/snapshot。
4. Desktop Local Obsidian Vault 是本地知识 source；Web 不获得 Desktop 绝对路径。
5. 高影响业务 draft 在 apply 前需要明确用户确认。
6. mutation retry 必须幂等，不能因断线/重复 approve 创建重复实体。
7. HTTP/IPC 对同一产品能力保持契约 parity。
8. 现有 deep link（例如 `/goals/:id`）和核心 Goal/Task/Knowledge 产品结果保持可达。
9. business audit/reliable operation 继续由现有 domain/application 体系负责。

## 4. Target Contracts

### 4.1 Assistant

客户端只需要：

```text
send assistant message
cancel active turn
observe message/activity/usage/workflow-link events
```

proposal approve/revise/reject 不再是 Assistant 通用 command。

### 4.2 Workflow

统一 API/IPC：

```text
startWorkflow(kind, input)
resumeWorkflow(runId, command)
getWorkflow(runId)
listWorkflows(conversationId?)
cancelWorkflow(runId)
```

`WorkflowRunView` 只投影产品 UI 需要的状态，不复制 Mastra private checkpoint：

```text
runId
kind
conversationId
status
suspension?
result?
usage?
createdAt/updatedAt
```

### 4.3 Suspension

首期 discriminated union：

```text
clarification_required
goal_draft_review
knowledge_draft_review
task_draft_review
recovery_required
```

resume command：

```text
answer
approve
cancel
edit_structured
revise_natural_language
regenerate
retry
accept_partial
```

## 5. Primitive Map

| Product capability                                 | Primitive                                                     |
| -------------------------------------------------- | ------------------------------------------------------------- |
| open chat / intent routing                         | `MemoFlow Assistant`                                          |
| goal planning reasoning                            | `GoalPlannerAgent` worker                                     |
| `goal.create`                                      | Workflow                                                      |
| `task.create`                                      | Workflow                                                      |
| `knowledge.generate/capture`                       | Workflow                                                      |
| `knowledge.qa`                                     | Assistant + query tools（必要时薄 Workflow）                  |
| `searchKnowledge`, `readGoal`, `readTask`          | query Tool                                                    |
| `ApplyGoalPlan`, `CreateTask`, `SaveKnowledgeNote` | deterministic Application Service / mutation Tool at boundary |
| Goal planning method / note conventions            | Skill                                                         |
| conversation history / stable user preferences     | Memory                                                        |
| selected page/entity/retrieved notes               | Context                                                       |
| large Vault reorganization                         | staging Workspace + Workflow/Agent                            |

## 5.1 Initial Recovery Checkpoint — 2026-08-20

> **Historical recovery snapshot.** 本节记录接管 worktree 时的状态；AI-VNEXT-01/02 已随后闭合，当前事实以 §5.6 为准。

本计划已进入实施，不是纯设计状态。当前仓库证据如下：

**已经落地的 Mastra foundation：**

- `@memoflow/ai` 已引入 `@mastra/core`、`@mastra/memory`、`@mastra/pg`、`@mastra/libsql`；
- `packages/ai/src/server/mastra/models/model-resolver.ts` 已建立 request-scoped BYOK `MastraModelResolver`，credential 只停留在 server-side model config；
- `packages/ai/src/server/mastra/runtime/storage.ts` 已建立 Server PostgreSQL / Desktop LibSQL 两种 storage composition primitive；
- `packages/ai/src/server/mastra/agents/memoflow-assistant.ts` 已建立单一 user-facing `MemoFlow Assistant`；
- `packages/ai/src/server/mastra/runtime/mastra-ai.runtime.ts` 已建立 `Mastra + Memory + AgentController` runtime，并具备基本 stream / abort 投影；
- `identityId -> resourceId`、`conversationId -> threadId` 已在 runtime 内开始按 ADR-050 映射。

**尚未闭合、因此不能宣称 Batch A/B 完成：**

- `mastra/context`、`tools`、`workflows`、`observability`、`evals` 仍为空；
- 旧 `AssistantFacade / CapabilityResolver / TurnEngine / ModelGateway / ProposalKernel / LangGraphWorkflowAdapter` 仍在生产树；
- `AIService*Adapter` 与 Python `apps/ai-service` 仍存在；
- `packages/contracts` 仍以 `AgentRun / AgentState / AgentAction[] / dependsOn[] / AgentResumePayload` 为主要 runtime contract；
- 当前 Mastra runtime 仍把 framework event 投影成带 `engineId/profile` 的旧 `AssistantEvent`，尚未形成 vNext canonical assistant/workflow event envelope；
- `MemoFlow Assistant` 当前没有 domain/query/orchestration tools，尚不能代表完整产品 AI capability；
- 尚无 `goal.create` Mastra Workflow，因此 UI/Host/Python 的旧 workflow ownership 尚未解除。

**恢复结论：** 从 `AI-VNEXT-01` 的 closure 继续，不重启 discovery，不重新设计另一个 runtime。先把 foundation、contract 与 host composition 闭合，再进入 Goal vertical slice；旧 runtime 只允许作为同一重构分支中的暂时迁移面存在。

## 5.2 Canonical Runtime Event / Reconnect Semantics

vNext 不直接把 Mastra private event 透传给 UI。HTTP SSE 与 Desktop IPC 共享一个稳定 envelope：

```text
RuntimeEvent
- eventId
- runId
- conversationId
- sequence
- createdAt
- type
- data
```

Assistant 首期 canonical types：

```text
assistant.run.started
assistant.message.delta
assistant.activity
assistant.usage.updated
assistant.workflow.linked
assistant.run.completed
assistant.run.failed
assistant.run.cancelled
```

Workflow 首期 canonical types：

```text
workflow.started
workflow.suspended
workflow.resumed
workflow.usage.updated
workflow.completed
workflow.failed
workflow.cancelled
```

规则：

1. `sequence` 在单 run 内严格单调递增；UI 不根据 framework callback 到达顺序自行推断状态。
2. Runtime event 是 transport projection，不复制为第二份 workflow checkpoint。
3. 断线重连不要求重放所有 token delta；客户端重新读取 Mastra thread 的 authoritative message history，并查询 `WorkflowRunView` 恢复 durable workflow 状态。
4. unknown event / unknown suspension type 必须 fail closed，显示可恢复错误而不是静默忽略。
5. provider/model/tool 原始 error 先 server-side sanitize，再进入 public event；credential、Authorization header、raw provider request 不得出现在 event。

## 5.3 Cancel / Retry / Resume Semantics

- **Assistant cancel**：终止当前 AgentController run；已完成的 query 无副作用；mutation 不允许由开放 chat 直接无审批执行。
- **Workflow cancel**：停止未来 workflow step，不承诺回滚已经成为 domain fact 的 mutation。
- **Retry**：模型/网络 transient retry 与业务 mutation retry 分开；业务 mutation 只通过 deterministic idempotency key 重试。
- **Resume**：只接受 typed resume command；`identityId` 从 trusted host context 注入并重新校验 run ownership，客户端不得通过 runId 越权恢复他人 workflow。
- **Process restart**：Assistant history 由 Mastra Memory/Storage 恢复；Workflow suspend/resume 由 Mastra snapshot 恢复；不再依赖 MemoFlow 自研 checkpoint bridge。

## 5.4 Product Data / Runtime State Migration Policy

必须区分“用户内容”与“可丢弃 runtime state”：

- `AIProviderConfig`、Conversation shell、Goal/Task/Reminder/Knowledge 等产品事实原样保留；
- 现有 `AiMessage` transcript 属于用户可见内容，**不得因为 runtime 切换静默丢失**；Batch B 必须做一次性、可重复执行的 history import/cutover，使既有 conversation 能在 Mastra thread 中继续读取；cutover 后只允许 Mastra 写 transcript，禁止长期双写；
- `AgentRunCheckpoint`、`LangGraphCheckpoint*`、旧 Proposal/Action runtime state 属于退休执行器的技术状态，可在 Batch F 删除；
- destructive runtime migration 放在全部 vNext journey 验证通过之后执行；PR 合并前的回滚策略是回退整个重构分支，而不是长期保留双 runtime feature flag；
- Mastra Server storage 使用独立 schema/namespace，避免与业务 Prisma table ownership 混淆。

## 5.5 Foundation Closure Gate

进入 `goal.create` 大规模迁移前，`AI-VNEXT-01/02` 必须同时满足：

1. API host 能构造 PostgreSQL-backed Mastra runtime，Desktop host 能构造 LibSQL-backed runtime；
2. `MastraModelResolver` 校验 provider 属于当前 identity，且 provider/model selection 不允许绕过 active/enabled policy；
3. credential serialization / prompt / memory / snapshot / event 泄露测试通过；
4. canonical Assistant + Workflow contracts 已进入 `@memoflow/contracts`，HTTP/IPC 使用同一 schema；
5. Assistant send/stream/cancel/reconnect 至少有 package-level characterization tests；
6. legacy `AgentAction DAG` contract 不再被新 Mastra code 引用；
7. 建立 architecture lock：新代码不得新增 `AIService*Adapter`、LangGraph checkpoint bridge、`TurnEngine`/`ModelGateway` 依赖；
8. `pnpm nx run ai:typecheck`、`ai:test`、`ai:build` 与 contracts focused tests 全绿。

## 5.6 Foundation Closure Checkpoint — 2026-08-20

**AI-VNEXT-01 / AI-VNEXT-02 已完成。** Foundation closure gate 已从“目录/原型存在”推进到有 transport、host composition、security、test/governance 证据的可依赖状态：

- API host 以 PostgreSQL-backed Mastra storage 组装单一 `MastraAIRuntime`；Desktop host 以 profile-local `mastra.db` / LibSQL 组装同一 runtime owner；两端 lifecycle 都等待 `init/dispose`，失败执行 rollback；
- `MastraModelResolver` 只从 authenticated identity 的 provider repository 解析 active provider/model，BYOK credential 不跨 server boundary；
- Assistant 已有 canonical command/event、HTTP SSE/cancel、Desktop IPC start/cancel/event/error 与共享 HTTP/IPC client seam；
- Workflow 已有 canonical start/resume/get/list/cancel contracts、HTTP/IPC request surface 与共享 client seam；**具体 Mastra Workflow implementation 由 Batch C 注册**，在此之前 transport 明确 `SERVICE_UNAVAILABLE` fail closed，绝不回退旧 AgentRun runtime；
- 新 `server/mastra/**` 由 architecture lock 禁止依赖 `AIService*Adapter`、LangGraph checkpoint bridge、`TurnEngine`、`ModelGateway`、`CapabilityResolver`、`ProposalKernel`、`AgentAction DAG`；
- runtime public event 对 provider/model/tool raw error 做 sanitize；credential-shaped serialized event 字段被剥离；旧 `AIServiceInternalClient` request/error 日志也已增加递归 credential redaction，同时真实 request body/HMAC 不变；
- Node contract 对齐 Mastra 1.60.0：engine `>=22.13.0`，本地 `.nvmrc` 对齐 Node 24；
- 新 Desktop composition spec 已纳入 test-system-v2 inventory，治理元数据同步更新。

**Closure evidence：**

- `contracts:typecheck` PASS；`contracts:test` = **68 files / 593 tests PASS**；
- `ai` direct typecheck PASS；`ai:test` = **130 files / 901 tests PASS**；`ai:build` PASS；
- API composition = **12/12 PASS**；API target-equivalent typecheck PASS；
- Desktop composition = **4/4 PASS**；`assets:build` + Desktop target-equivalent typecheck PASS；
- changed-file Prettier check PASS；contracts/ai/api/desktop lint targets均无 error，vNext 新增面 focused lint clean；
- `docs:check` PASS；`governance:check` PASS；test-system-v2 inventory/governance PASS。

**Historical next owner:** `AI-VNEXT-03 / Batch B — Open chat cutover to Mastra Assistant`。该 owner 已在 §5.7 闭合；当前 next owner 为 `AI-VNEXT-04 / Batch C — goal.create reference Workflow`。

## 5.7 Open Chat Cutover Closure Checkpoint — 2026-08-20

**AI-VNEXT-03 / Batch B 已完成。** 默认 open chat 已从旧 `AssistantFacade -> DirectTurnEngine -> AIServiceChatExecutionAdapter` 路径物理切换到单一 Mastra Assistant runtime；旧 Agent Host 仅保留给尚未迁移的 workflow proposal lifecycle，不能再承载默认聊天。

**Runtime / persistence：**

- `useAIChatSession` 的 history / send / cancel / delete 全部经过独立 `AssistantRuntimeClient`；Web 注入 `AssistantRuntimeHttpClient`，Desktop 注入 `AssistantRuntimeIpcClient`；默认聊天不再 import `useAssistantDispatch`；
- canonical Assistant transport 已包含 `history / delete / stream / cancel`，HTTP 与 IPC 共享 contracts，identity 只由 authenticated host 注入；
- 既有 `Conversation` / `AiMessage` 只作为一次性只读 bootstrap source；Mastra thread metadata 写入 `memoflowTranscriptBootstrapVersion` 后不再读取旧 transcript，新消息不双写 `AiMessage`；
- persistent LibSQL restart test 证明第二个 runtime 实例从同一 Mastra thread 恢复历史且不再次调用 legacy transcript source；
- conversation delete 先 owner-scoped 删除 Mastra thread，再删除 legacy shell；若 shell delete 失败，保留的 shell/transcript 仍可重新 bootstrap，不产生不可见 orphan；
- runtime 对外投影 selected `providerId/modelId` 与 `assistant.usage.updated` token usage，不暴露 credential/raw provider payload。

**Legacy product path retirement：**

- API/Desktop host composition 不再构造 `AIServiceChatExecutionAdapter`，默认 chat 没有 `chatExecutionPort`；
- `AIFooterComposer` 删除 `direct_turn / pi_readonly` execution-profile selector；默认 chat 不再制造 client-owned Host runId 或 open-chat engine badge memory；
- `hostOpenChatCancel.ts`、`hostOpenChatTurnMemory.ts` 及对应 tests 已删除；
- 历史 ADR-035 cross-end scaffold/driver 保留稳定文件名以兼容归档引用，但治理语义已重写为 Mastra cutover conformance，不再强制旧 multi-engine open-chat 存在；
- Web 历史 `multi-engine-host.spec.ts` 已重写为真实 Mastra open-chat Playwright journey；Goal workflow E2E 的普通聊天 bootstrap 也改走 canonical runtime SSE，旧 `/ai/assistant/dispatch/sse` 只允许 transitional proposal command，并显式拒绝 `message`。

**Closure evidence：**

- `contracts:test` = **68 files / 594 tests PASS**；test-system-v2 inventory = **1145 files**，inventory check PASS；
- `ai:test` = **133 files / 917 tests PASS**；Mastra cutover scaffold/driver focused = **13/13 PASS**；
- `app-vue:test` = **185 files / 1018 tests PASS**；`AIChatView` = **29/29 PASS**；
- API composition = **12/12 PASS**；Desktop composition = **4/4 PASS**；Assistant history/delete/client/HTTP/IPC focused suite PASS；
- real Web Playwright Mastra open-chat = **2/2 PASS**：发送路径 + reload 后 authoritative history 恢复；
- real Web Playwright mixed-period Goal journey = **1/1 PASS**：Mastra open chat bootstrap → transitional Goal Agent confirmation/execution；
- `ai:typecheck`、`app-vue:typecheck`、`api:typecheck`、`desktop:typecheck`、`web:typecheck` PASS；`ai:build`、`web:build`、`desktop:build` PASS；
- `ai/app-vue/api/desktop/web` lint 均 **0 error**，本轮改动面新增 warning 已清零；
- changed-file Prettier + `git diff --check` PASS；`docs:check` PASS；`governance:check` PASS；
- packaged Electron full product E2E 本轮未执行，因此治理 scaffold 仍把该单项标为 `external_blocked`；这不改变 Desktop canonical IPC/runtime composition 与 package-level parity 已闭合的事实。

**Next owner:** `AI-VNEXT-04 / Batch C — goal.create reference Workflow`。下一轮直接注册 concrete Mastra `goal.create` Workflow，替换 Goal AgentRun / Host Proposal bridge 的 primary path。

## 5.8 Goal.create Reference Workflow Closure Checkpoint — 2026-08-20

**AI-VNEXT-04 / Batch C 已完成。** `goal.create` 由 durable Mastra `GoalCreateWorkflow` + `ApplyGoalPlanService` 权威承载。Goal Workflow 的 UI/ownership 从旧 Goal AgentRun / Host Proposal / primary-task 双镜像产品切到新的 `AIWorkflowRunView`（`AIGoalWorkflowPanel`，testid `goal-workflow-panel` / `goal-workflow-recovery` / `goal-workflow-result` / `goal-workflow-revision`）与 `useAIGoalWorkflow` 投影；没有把旧 `goal-agent-panel` / AgentRun / Host Proposal 兼容加回。

**Runtime / contracts：**

- 新增 typed `GoalCreateClientInput` / `GoalPlanDraft` / `GoalPlanExecutionReceipt` / `AIWorkflowSuspension`（clarification_required / goal_draft_review / recovery_required 等）contracts（`ai-goal-create-workflow.dto.ts`）；
- 新增 `GoalPlannerAgent` worker、`goal-create.workflow.ts`、`apply-goal-plan.service.ts`、`goal-plan-mutation.port.ts`、`deterministic-entity-id.ts`；
- mutation 走 canonical Goal/Task/Reminder application ports；`goalWorkflowEntityId` 提供 deterministic child entity IDs（workflowRunId + revision + kind + index）保障 double-approve / retry 幂等，不创建重复实体；
- WORKFLOW transport 走 `/ai/runtime/workflow/{start,resume,get,list,cancel}`，identity 只由 authenticated host 注入，客户端 `identityId` 注入被 schema 拒绝；不再用于 goal.create 的 `agents/runs` AgentRun / Host Proposal 双轨。

**UI ownership fix（本 closure 发现并修复的真实 bug）：**

- 旧 watcher 在每次 `goal_draft_review` 投影时自动 `router.push('/goals')`，会 clobber AI workspace 上的 HITL confirm/cancel/retry 表面（尤其 session restore 的 pending run 也被拽出 AI workspace），与 ADR-052 HITL 冲突；
- 修复为：仅当 run `status === 'completed'` 且产生 `automatedGoalId` 时才 deep-link 到 created goal；pending draft review 与 recovery_required（partial）留在 AI workspace 由 Workflow panel 承载确认/取消/恢复。

**E2E：**

- `goal-workflow.spec.ts` 的 3 个 HITL 场景已按新 Workflow ownership 重写（goal-workflow-panel / goal-workflow-recovery / goal-workflow-result + goal-agent-confirm-run / goal-agent-cancel-run / goal-agent-retry-execution）：refresh 恢复 / confirm+retry / cancel at approval；
- Web E2E `web:e2e:ai-workspace` 全量 **8/8 PASS**（含 3 个 goal 测试 + 5 个既有 root/mobile/knowledge 测试）。注：该套件偶发 auth `#email`/scene 基础设施 flake（跨分支既有、与端口占用/负载相关，非 Batch C 引入），在负载下降 / 端口干净（3400 / 4174）后可稳定全绿。

**Closure evidence：**

- `contracts:test` = **69 files / 598 tests PASS**；`ai` focused/runtime workflow specs PASS（Mastra Workflow runtime spec、goal planner worker、ApplyGoalPlan、deterministic entity id）；
- `app-vue:test` = **185 files / 917 tests PASS**（含 AIChatView 29/29、AIGoalWorkflowPanel）；`ai:typecheck`、`app-vue:typecheck`、`api:typecheck`、`desktop:typecheck`、`web:typecheck` PASS；lint:affected 40 projects 0 error；
- `docs:check` PASS；`governance:check` PASS；format 已跑；
- Web E2E `web:e2e:ai-workspace` **8/8 PASS**（3 个 goal HITL 测试 + 5 个既有测试）；goal 工作流断言只依赖 canonical Workflow 表面，不依赖已退役的 AgentRun / Host Proposal。

**Next owner:** `AI-VNEXT-05 / Batch E — UI / workbench rewrite`（整体 UI 投影 + E2E 全量 auth 基础设施稳定性）。

## 5.9 Goal Workbench / Task.create Backend Closure Checkpoint — 2026-08-21

**AI-VNEXT-05 已完成；AI-VNEXT-06 backend 已完成（UI 呈现与 knowledge 迁移待续）。**

**AI-VNEXT-05 — Goal workbench UI（COMPLETE）：** goal 工作台彻底不拥有 workflow 状态。`useAIGoalWorkflow` 是 `AIWorkflowRunView`（kind `goal.create`）的薄投影：所有 start/resume/get/cancel 走 `workflowRuntime` client，映射到 typed resume command；deep link 只在 run `completed` 且产生 `goalId` 时 `router.push('/goals/:id')`（pending draft review / recovery 留在 AI workspace）。新增 `useAIGoalWorkflow.spec.ts`（8 组合式测试）：client 请求不带 `identityId`、clarification/draft-review/recovery 阶段投影、approve/answer/retry/cancel typed command 映射、completed-only deep link、session restore 经 `workflowRuntime.get`。生产 UI 不再引用 `pendingActions/approvedActions/dependsOn`（goal 面；task 面见 AI-VNEXT-06 继续位置）。

**AI-VNEXT-06 — task.create 迁移 Mastra-native（backend COMPLETE）：** 按 ADR-052/gol.create reference 模式落地 `task.create` durable Mastra Workflow：

- contracts：`TaskCreateClientInput`（无 identityId，strict）、`TaskCreateWorkflowInput`（runtime 注入 identityId）、`TaskPlanDraft/Content`、`TaskPlanningDecision`、`TaskClarificationState`、`TaskPlanExecutionReceipt`（`ai-task-create-workflow.dto.ts`）；`AIWorkflowRunView`/`AIWorkflowStartClientRequest`/`task_draft_review` suspension 从 `z.record` 收窄为 typed schema（`ai-runtime.dto.ts`）。
- backend：`TaskPlannerWorker`（structured output，无 mutation capability）、`task-create.workflow.ts`（durable createWorkflow：planning/clarification/review/recovery/completed/cancelled phases，MAX_CLARIFICATION_ROUNDS=3，approve/edit_structured/revise/regenerate/retry/accept_partial/cancel commands）、`ApplyTaskPlanService` + `TaskPlanMutationPort`（deterministic apply）、`taskWorkflowEntityId`（UUIDv8，独立 `memoflow:task.create:v1` namespace，不与其 goal.create 的 task_template id 冲突）。
- runtime：`MastraAIRuntime` 增加 `taskCreateWorkflow`/`taskPlanner`，注册进 Mastra workflows/agents map；start/resume/get/list/cancel 按 kind 分发（get/list 同时查 goal + task 两个 workflow 名）；API & Desktop host 增加 `TaskPlanMutationAdapter`/`DesktopTaskPlanMutationAdapter` 绑定 canonical `taskApplicationPort`（mutation 永远走 application port，agent 不直写 persistence）。

**Closure evidence：**

- contracts focused `ai` tests PASS（含 typed task.create start/suspension/runview）；`ai:test` = **138 files / 934 tests PASS**（含新增 `task-create.workflow.spec.ts` 重启/取消/幂等 3 例，与 `mastra-workflow.runtime.spec.ts` task.create journey 1 例 —— 该 spec 旧「reject task.create」期望已更新为「task.create 已落地」+ knowledge.capture 仍 unsupported）；
- `app-vue:test` = **186 files / 925 tests PASS**（含新增 `useAIGoalWorkflow.spec.ts` 8 例）；
- `contracts/ai/api/desktop/web/app-vue` typecheck 全 PASS；`ai:build` PASS；
- lint（contracts/ai/app-vue/api/desktop/web）**0 error**（仅既有无关 warning）；changed-file Prettier + `git diff --check` PASS；
- `test:inventory` = **1152 files**；`docs:check` PASS；`governance:check` PASS。

**Next owner（AI-VNEXT-06 续点 / AI-VNEXT-07 前置）：** ① 重写 `useAITaskWorkflow` 去除 AgentRun/`pendingActions`/`approvedActions`/`createAgentId`/`hostProposalLifecycle` ownership，投影到 `AIWorkflowRunView`（kind `task.create`）+ `AITaskWorkflowPanel`（testid `task-workflow-panel`）+ 组合式/组件测试；② `knowledge.*`（generate/capture/qa）迁移 Mastra-native；③ task/knowledge E2E（3400 端口）；④ AI-VNEXT-07 「Remove Python/AgentHost legacy」随后执行。

## 5.10 Final Runtime Closure Checkpoint — 2026-08-22

**AI-VNEXT-06 / 07 / 08 已完成；AI-VNEXT-09 已进入最终 delivery gate。** 当前 tree 的核心 AI execution authority 已完全收敛到 TypeScript + Mastra，没有 Python/AgentHost 双 runtime fallback。

**AI-VNEXT-06 — Remaining product journeys（COMPLETE）：**

- `task.create` 已完成 typed durable Workflow、`TaskPlannerWorker`、`ApplyTaskPlanService`、产品 mutation port、Web/Desktop transport 与 `AITaskWorkflowPanel` / `useAITaskWorkflow` 薄投影；
- `knowledge.capture` 已完成 durable Workflow、typed draft/review/recovery、`ApplyKnowledgeNoteService` 与 Repository persistence boundary；
- knowledge QA/analytics 继续使用 host-owned read ports + OpenAI-compatible typed adapters，不经过 Python service；
- AI workspace 浏览器套件覆盖 goal/task/knowledge/open-chat/recovery/cancel 等当前产品旅程，最终 **11/11 PASS**（隔离 API `3011` / Web `4174`，避免无关容器占用 `3000`）。

**AI-VNEXT-07 — Hard delete（COMPLETE）：**

- `apps/ai-service`、`Dockerfile.ai-service`、Python FastAPI/LangGraph runtime/eval/checkpoint bridge 已物理删除；
- Agent Host / `AssistantFacade` / `ProposalKernel` / `CapabilityResolver` / `TurnEngine` / AgentRun contracts、routes、checkpoint persistence 与 UI DAG ownership 已删除；
- Docker/CI/env/local validation 不再构建、启动或探测 `ai-service`；Web CI 不再因 AI runtime 安装 Python/uv；
- `ai-vnext-no-legacy.surface.spec.ts` + architecture governance 锁定 retired files、legacy transport token、AgentAction DAG 与 deploy env 不得回归；
- local Docker env layering 修正为 `.env.production` + 可选 `.env.production.local` overlay，独立 worktree 使用 machine-local port override，不干扰其他服务。

**AI-VNEXT-08 — Observability / eval / release gate（COMPLETE）：**

- Assistant 与 planner generation 统一记录 request/trace/provider/model/token/cost，usage read 以 authenticated identity 作为数据库谓词；
- Web/Desktop 均使用 canonical `RuntimeUsageClient` / Assistant / Workflow contracts；
- `pnpm nx run ai:eval:replay` **PASS**：baseline/candidate pass rate 均 `1.000`，candidate estimated cost `-4.81%`，p95 latency `-10.61%`；evidence source 明确为可复现的 `recorded_replay`，不冒充 live-model eval；
- canonical eval authority 为 `reports/apps/ai/evals`，quality/case regression/cost/p95 latency comparison gate 已落地。

**真实产品验证（2026-08-22）：**

- `packages/ai`：64 test files / 367 tests PASS；
- `packages/app-vue`：183 test files / 756 tests PASS；
- core `ai/app-vue/contracts/api/web/desktop` typecheck PASS；core lint PASS（仅既有 warning）；docs/governance/diff-check PASS；
- Web production `--skipNxCache` fresh build PASS；Docker `web/api/migrator/powersync` no-cache image build PASS；migrator `Exited (0)`；API/Web/Postgres/Redis/PowerSync healthy；
- official local-Docker Chromium product validation **15/15 PASS**，`reports/local-deploy-validation/local-docker-playwright-evidence.json` 为 `ok: true`；
- AI workspace Chromium E2E **11/11 PASS**；
- local validation 暴露的 Better Auth `3/10s` shared-IP flake 已修：生产默认限流保持不变，`LOCAL_VALIDATION` 使用正确的 `/**` nested-path override，反代 IP 明确读取 `x-forwarded-for` / `x-real-ip`；
- Phase E refresh/approval fixture 已从旧 `/ai/agents/runs` 迁到 canonical `/ai/runtime/workflow/get` + `AIWorkflowRunView`，没有为通过测试恢复 AgentHost。

**Delivery closure:** `AI-VNEXT-09 / Batch H` 已完成：最终全仓门禁、diff/review、commit/rebase/push、PR #252、required CI 与 clean-HEAD local Docker 验收均闭合。

## 6. Implementation Batches

### Batch A — Foundation rewrite: contracts + dependencies + runtime composition

**Goal:** 让 TypeScript repository 原生构建并由 API/Desktop host 装配 Mastra runtime，建立唯一的 Assistant / Workflow cross-boundary language。

**Current status:** **COMPLETED — AI-VNEXT-01/02 closed**，见 §5.6。Batch A 的 runtime composition、canonical Assistant/Workflow transport language、host seams、architecture locks 与验证证据已闭合；具体业务 Workflow implementation 不属于 Batch A。

**A1 — Runtime composition closure**

- finish host-owned PostgreSQL / LibSQL storage wiring and lifecycle (`init/dispose`);
- keep `AIProviderConfigRepository -> MastraModelResolver -> Agent/Workflow` as the only BYOK model path;
- validate identity ownership / active provider / selected model before returning runtime model config;
- keep OpenAI-compatible BYOK as the current product provider contract; do not introduce LiteLLM or a second gateway abstraction in vNext foundation.

**A2 — Contract rewrite**

- add canonical `AssistantCommand/Event`、`WorkflowCommand/RunView/Suspension/ResumeCommand` schemas to `@memoflow/contracts`;
- HTTP/IPC must consume the same schemas and public failure contract;
- replace legacy `AgentRunResult / AgentState / AgentAction DAG` references in newly migrated paths;
- define sequence / reconnect / cancel / error semantics from §5.2–5.3 in contract tests, not only prose.

**A3 — Host integration**

- API composer injects authenticated `ExecutionContext.identityId`, PostgreSQL storage and provider repository into one Mastra runtime owner;
- Desktop composer injects authenticated profile identity, local LibSQL storage and the same model resolution boundary;
- expose Assistant send/stream/cancel and Workflow start/resume/get/list/cancel without exposing Mastra private types;
- verify HTTP/IPC transport parity with shared fixtures.

**A4 — Architecture locks**

- forbid credentials in serialized event/snapshot/context fixtures;
- forbid new production imports of Python AI adapters, LangGraph checkpoint bridge, `TurnEngine`, `ModelGateway`, `CapabilityResolver`, `ProposalKernel` from vNext code;
- keep old code only until its replacement journey is green in the same branch, then delete it in Batch F.

**Delete in same batch where replacement exists:** `ModelGateway`, `TurnEngine`, `CapabilityResolver` public contracts.

**Acceptance:** §5.5 全部满足；focused contract/runtime tests + `ai` typecheck/test/build green；API/Desktop composition smoke green；no credential in serialized runtime event/snapshot。

### Batch B — Open chat cutover to Mastra Assistant / AgentController

**Current status:** **COMPLETED — AI-VNEXT-03 closed**，见 §5.7。默认聊天已由 Mastra Assistant + persistent Memory/Storage 权威承载；旧 Agent Host/Python chat 不再位于 default path。

**Goal:** 默认聊天不再经过 `DirectTurnEngine` 或 Python service。

**Changes:**

- create single user-facing `MemoFlow Assistant`;
- dynamic model resolution from BYOK config;
- persistent thread/memory binding;
- stream assistant output through existing HTTP/IPC transport projection;
- expose usage/model metadata;
- retain Conversation shell only; remove transcript dual-write once UI load uses Mastra thread history;
- delete `ReadonlyAnalysisTurnEngine` / `pi_readonly` product profile and speculative Pi runtime surface.

**Acceptance:** send/stream/cancel over Web + Desktop; same conversation resumes after process restart using persistent store; no `AIServiceChatExecutionAdapter` wiring.

### Batch C — `goal.create` reference Workflow

**Current status:** **COMPLETED — AI-VNEXT-04 closed**，见 §5.8。goal.create 已由 durable Mastra `GoalCreateWorkflow` 权威承载；Goal Workflow 不再回退 AgentRun / Host Proposal 双 ownership。

**Goal:** 完成 ADR-052 全旅程并成为 vNext canonical pattern。

**Changes:**

- typed `GoalCreateInput`, `GoalPlanningDecision`, `GoalPlanDraft`, suspension/resume commands;
- `GoalPlannerAgent` structured output；clarification max rounds；context loading；
- review suspend/resume；structured edit without LLM；natural-language revision with worker agent；
- `ApplyGoalPlanService` calling Goal/Task/Reminder application ports；
- deterministic idempotency/recovery receipt (`goalWorkflowEntityId` deterministic child IDs);
- replace `useAIGoalWorkflow` with thin run projection；
- delete Goal AgentAction construction, dependsOn patching, Host Proposal bridge lifecycle.

**Acceptance journey:** clarification → draft → edit → approve → Goal/KR/task/reminder → deep link；restart resume；double approve idempotent；cancel no mutation；partial retry safe。

### Batch D — Remaining workflow migration

**Current status:** **COMPLETED — AI-VNEXT-06 closed**，见 §5.10。Task/Knowledge 当前产品 AI 路径已迁移到 Mastra-native / host-owned typed read path，不再依赖 Python runtime。

**Goal:** Python graphs no longer own any product AI path。

**Migrate:**

- `task.create` -> typed TaskCreateWorkflow;
- `knowledge.generate` -> KnowledgeCaptureWorkflow with draft review + semantic Knowledge persistence port;
- `knowledge.qa` -> Assistant query capability using knowledge retrieval/context and citations;
- knowledge note generation and analytics query -> Mastra/AI SDK typed worker/tool paths;
- knowledge indexing remains deterministic repository/index service; replace Python-only inference with TS model/embedding path or deterministic fallback as appropriate.

**Acceptance:** all current UI user journeys have a vNext path; no production request to `/internal` Python AI endpoints.

### Batch E — UI/workbench rewrite

**Current status:** **COMPLETED — AI-VNEXT-05/06 UI closure**，见 §5.10。Vue 仅投影 `AIWorkflowRunView` / Assistant state，不再拥有 AgentAction DAG 或第二套 approval lifecycle。

**Goal:** Vue 只投影 runtime，不实现 runtime。

**Changes:**

- replace `AgentRunResult` composables with `WorkflowRunView`;
- remove `hostProposalLifecycle` and AgentAction patch helpers;
- workbench renders typed suspension payloads；
- conversation and workflow timeline use server projection；
- usage/token/cost display surface added at conversation/run level；
- HTTP/IPC adapters share schemas and unknown-event fail closed。

**Acceptance:** Vue typecheck/tests + Web journeys；no `pendingActions`, `approvedActions`, `dependsOn` in production UI。

### Batch F — Hard delete legacy runtime and persistence

**Current status:** **COMPLETED — AI-VNEXT-07 closed**，见 §5.10。Python/AgentHost/legacy checkpoint/runtime/deploy surface 已物理删除，并有反回退 architecture locks。

**Goal:** final tree contains only vNext runtime。

**Delete:**

- `apps/ai-service`；
- Docker/service/env/HMAC configuration for ai-service；
- all `AIService*Adapter`；
- Python runtime/checkpoint/eval scripts that only serve retired runtime；
- `AgentRunCheckpoint`, `LangGraphCheckpoint`, `LangGraphCheckpointWrite` schema + repositories/controllers/routes；
- Agent Host `AssistantFacade`, `ProposalKernel`, `CapabilityResolver`, `TurnEngine`, `WorkflowAdapter`, `CustomModelGateway`；
- old `AgentRun/AgentAction/AgentArtifact` contracts if no longer used；
- old direct-provider/remote-ai-service dual runtime；
- obsolete surface tests/governance rules，replaced with vNext architecture locks。

**Data migration policy:** old execution/checkpoint rows are non-product runtime state and may be dropped by migration；Goal/Task/Reminder/Knowledge/ProviderConfig product rows untouched。

### Batch G — Observability, eval, governance

**Current status:** **COMPLETED — AI-VNEXT-08 closed**，见 §5.10。Usage/cost/trace、recorded replay eval comparison 与 release gate 均有可执行证据。

**Goal:** framework adoption不牺牲治理。

**Changes:**

- Mastra tracing/usage projection；
- token/cost aggregate query for conversation/workflow；
- eval datasets for open chat + goal planning + knowledge answer；
- release gates cover quality/governance/cost/latency；
- architecture surface checks forbid Python AI runtime、AIService adapters、AgentAction DAG、direct persistence from Mastra tools；
- docs current-system map rewritten。

**Acceptance:** eval runner can compare configuration bundles；usage可按 run/thread 查询；governance catches forbidden legacy reintroduction。

### Batch H — Review / repair / delivery

**Current status:** **COMPLETE — AI-VNEXT-09 closed**。Runtime migration、最终全仓 gate、review、Git/PR/CI 与 local Docker acceptance 均已闭合。

**Goal:** zero known blockers，完整 PR 可合并。

1. focused tests per changed package；
2. `pnpm nx run ai:typecheck` / `test` / `build`；
3. `pnpm typecheck`；
4. `pnpm lint`；
5. `pnpm test`；
6. `pnpm build`；
7. `pnpm docs:check`；
8. `pnpm governance:check`；
9. local Docker build/preflight + AI journey；
10. batch review: contracts / vertical completeness / behavior / ownership / security / diff hygiene；
11. repair P0/P1/P2 findings and rerun narrow + wide gates；
12. commit、push、open PR；
13. wait/check GitHub CI；失败则读取 logs、修复、push、直到 required checks green；
14. PR ready-to-merge only after no unresolved review blocker。

## 7. Ticket Dependency Order

### AI-VNEXT-01 — Adopt Mastra runtime foundation

**Status:** **COMPLETE**（§5.6）。
**Goal:** TypeScript runtime instantiates Mastra with host-owned storage/model resolution。
**Files:** `packages/ai/package.json`, `packages/ai/src/server/mastra/**`, API/Desktop composers。
**Acceptance:** build/typecheck + storage smoke。

### AI-VNEXT-02 — Replace Agent Host contracts

**Status:** **COMPLETE**（§5.6；未迁移旧路径仍暂时保留旧 contract，但所有 vNext execution seam 只接受 canonical Assistant/Workflow contract）。
**Goal:** new Assistant + Workflow contracts become sole cross-boundary AI execution language。
**Dependency:** 01。
**Acceptance:** contracts tests + HTTP/IPC parity tests。

### AI-VNEXT-03 — Cut open chat to MemoFlow Assistant

**Status:** **COMPLETE**（§5.7）。
**Goal:** stream/cancel/history/usage via Mastra。
**Dependency:** 01–02。
**Acceptance:** Web/Desktop journey。

### AI-VNEXT-04 — Implement GoalCreateWorkflow + ApplyGoalPlan

**Status:** **COMPLETE**（§5.8）。goal.create 已由 durable Mastra `GoalCreateWorkflow` + `ApplyGoalPlanService` 权威承载，UI 已投影到 `AIWorkflowRunView` / `goal-workflow-panel`，HITL E2E 三个场景各自验证通过；不含旧 AgentRun / Host Proposal 双轨。
**Goal:** ADR-052 canonical journey。
**Dependency:** 01–02。
**Acceptance:** clarify/review/revise/approve/cancel/retry/idempotency/restart tests。

### AI-VNEXT-05 — Rewrite Goal workbench UI

**Status:** **COMPLETE**（§5.9）。goal 工作台已由 `useAIGoalWorkflow` 作为 `AIWorkflowRunView`（kind `goal.create`）的薄投影承载：UI 不拥有 workflow 状态，所有 start/resume/get/cancel 走 `workflowRuntime` client，typed resume command 映射，deep link 仅在 run `completed` 且产生 `goalId` 时跳到 `/goals/:id`；新增 `useAIGoalWorkflow.spec.ts` 组合式测试（8 例）覆盖投影/命令映射/deep-link/会话恢复。

**Goal:** UI no longer owns workflow state。
**Dependency:** 04。
**Acceptance:** composable/component tests + deep link。

### AI-VNEXT-06 — Migrate Task/Knowledge capabilities

**Status:** **COMPLETE**（§5.10）。`task.create` UI/backend、`knowledge.capture` durable workflow、knowledge QA/analytics typed read path 与 task/knowledge browser journeys 已闭合；当前产品 AI 路径不再依赖 AgentRun/Host Proposal/Python runtime。

**Goal:** all product AI journeys Mastra-native。
**Dependency:** 03–04。
**Acceptance:** task/knowledge focused tests and journeys。

### AI-VNEXT-07 — Remove Python/AgentHost legacy

**Status:** **COMPLETE**（§5.10）。Python/AgentHost/LangGraph checkpoint/legacy transport/deploy surface 已物理删除并由 architecture lock 防回归。
**Goal:** no dual runtime。
**Dependency:** 03–06。
**Acceptance:** forbidden-surface grep/governance + full build。

### AI-VNEXT-08 — Observability/eval/release gates

**Status:** **COMPLETE**（§5.10）。Token/cost/trace durable usage 与 configuration-bundle eval/release gate 已落地；canonical replay gate PASS。
**Goal:** token/cost/quality/governance evidence complete。
**Dependency:** 03–07。
**Acceptance:** metrics/eval/governance tests。

### AI-VNEXT-09 — Whole-repo validation + PR

**Status:** **COMPLETE**。全仓 typecheck/lint/test/build/docs/governance、fresh Docker、11/11 AI Workspace E2E、P0/P1/P2 review、PR #252 与 required CI 均已闭合。
**Goal:** complete delivery。
**Dependency:** all。
**Acceptance:** required local gates + GitHub CI green。

## 8. Review Protocol

审查不是确认“能编译”，而是检查：

- **P0:** auth/credential 泄露、重复 mutation、数据损坏、主要 AI path 断裂；
- **P1:** UI 仍拥有 workflow engine、存在双 runtime truth、Agent 直写 persistence、resume 不 durable；
- **P2:** usage/cost 关联缺失、边界 test 缺口、错误/取消/retry 不一致；
- **P3:** 文案/命名/低风险清理。

P0/P1/P2 在 PR ready 前全部修复或有明确不可实施的外部理由；本重构不以“以后再清理”为默认结论。

## 9. Definition of Done

- [x] ADR-050/051/052 与 current-system docs 同步；
- [x] Mastra 是唯一核心 Agent/Workflow runtime；
- [x] Python `apps/ai-service` 退役；
- [x] open chat Mastra-native；
- [x] `goal.create` reference workflow 完整；
- [x] task/knowledge 现有产品 AI 路径迁移；
- [x] UI 不再维护 AgentAction DAG / double approval；
- [x] old checkpoint/AgentHost runtime persistence removed；
- [x] ProviderConfig/BYOK 保留且 credential 不泄露；
- [x] token/cost/trace + eval/release gates 有证据；
- [x] Web + Desktop transport parity；
- [x] full typecheck/lint/test/build/docs/governance green；
- [x] local Docker AI journey 通过；
- [x] PR opened and required CI checks green；
- [x] no unresolved P0/P1/P2 review findings。
