---
tags:
  - product
  - module
  - ai
description: AI 模块当前功能、Mastra durable workflows、Routine tools 与产品读写边界
created: 2026-06-02T00:00:00
updated: 2026-09-18T00:00:00+00:00
---

# AI 模块说明

> **ADR-111 cutover policy (2026-09-09):** 当前没有需要保留的 MemoFlow 旧业务数据，也不要求兼容旧客户端/旧备份。本文历史推演中仅为旧数据保存设计的 migration/backfill/compatibility window 不再执行；目标模型和真实行为不变量继续有效。实施采用 direct canonical cutover + old-surface deletion + reset/reseed。

> **AI vNext closure (2026-09-18)：** ADR-096～099 已在 AI-9612 exact-head review 中落地并验收。本文件描述实现状态：Mastra 是 Assistant/Workflow/transcript authority；Conversation 只保存产品 shell；ProviderDefinition/Connection/SecretVault 与 capability evidence 分离；AIContextAssembler、stable KnowledgeDocumentId、owner-domain drafts/tools 与 AIExecutionRecord 已接入当前路径。

## 1. 功能定位

AI 模块负责自然语言理解、结构化草稿、durable workflow 与受控工具调用；**不拥有 Goal、Task、Routine、Planner、Notification 等业务事实**。真实写入必须终止在 owner-domain application/command port，只读工具必须使用产品 projection/read port。

## 2. 唯一运行时

当前核心 runtime 是 **TypeScript + Mastra**。Python FastAPI/LangGraph bridge、Agent Host、TurnEngine、ProposalKernel、AgentRun/AgentAction DAG 与 direct-provider/remote-service 双 runtime 已退休。

```text
MastraAIRuntime
├─ Assistant
├─ goal.create
├─ task.create
├─ knowledge.capture
└─ product tools
```

## 3. Durable workflows

- `goal.create`：clarify / draft / review / revise / approve；apply adapter 显式投影到 canonical Goal/KR contract（`initial/current/target`），旧 Goal/KR vocabulary 不进入 owner contract/persistence；
- `task.create`：使用当前 recurrence、Shared Label、Goal Link 与 optional contribution contract；
- `knowledge.capture`：结构化知识草稿，经确认后由 Repository owner port 持久化；
- workflow apply 使用稳定 entity/request identity，重试不会重复创建业务对象或 Label。

## 4. Routine command tools（AI-6102）

Assistant 当前可调用：

```text
routine_create
routine_set_profile_active
routine_set_temporary_override
routine_clear_temporary_override
routine_start_protocol
routine_pause_protocol
routine_resume_protocol
routine_end_protocol
```

持久 Routine 配置与新 ProtocolSession 创建要求 Mastra tool approval。Profile 仍只是 Gate；temporary override 不重写长期 trigger；Protocol timer truth 永远由确定性 Routine runtime 持有。

## 5. Planner / Notification read tools（AI-6103）

Assistant 当前只读工具：

```text
planner_today_summary
planner_conflicts
planner_upcoming_tasks
notification_unread_summary
```

Planner 工具读取 Calendar/Task owner projection；Notification 工具读取 Notification Fact。AI 不获得 `@memoflow/scheduler` repository、ScheduledInvocation 或 raw ScheduleTask mutation capability。HARD-7102 architecture lock 会阻止这条边界复活。

## 6. Provider / Context / Knowledge / Evaluation

- Provider metadata、用户 Connection、SecretVault 与 model capability evidence 是独立边界；普通 DTO、事件、context、snapshot、日志与 portability 不携带 plaintext credential；
- ModelResolver 只接受明确的模型/能力证据，unsupported、unknown、stale capability 与无模型配置均 fail closed；已解析模型在每次 outbound request 前重新验证 connection 与 Vault credential，撤销/替换会得到稳定 `SERVICE_UNAVAILABLE`；
- AIContextAssembler 注入 canonical Product Time、trust metadata 与 bounded token budget；retrieved knowledge 是不可信证据，不能改变工具策略；
- Knowledge source/index/analytics 通过 host-owned read ports 注入，`KnowledgeSpaceId + KnowledgeDocumentId` 是 citation/index identity，rename/move 不改变语义 identity；
- `AIExecutionRecord` 仅保存 bounded usage/cost/request/trace/provider/model 与 sanitized outcome/error projection，不是 workflow 或业务事实；evaluation runner 继续承担 quality/cost/latency gate。

## 7. 宿主边界

API 与 Desktop 各自在 composition root 注入 Goal/Task/Reminder owner mutation ports、Routine command port、Planner read port、Notification read port、Repository/Knowledge ports 与 LabelService。AI package 不 deep-import Prisma/PowerSync provider 实现，也不创建第二套业务 repository。

HTTP 与 Electron IPC 共用相同的 runtime failure projection：capability、configuration、provider availability、model availability、timeout、cancel 与 validation 均以稳定 code 对外；provider/Mastra 原始错误只留在内部诊断边界。Data Portability 的 owner-driven V3 capability `ai-conversations@3` 只导出/导入 Conversation shell 的 `name` 与 canonical `status`；不把 Mastra transcript、provider secret、execution record 或 AI index cache 伪装成第二份产品 truth。PORT-1611 后旧 V1/V2 backup path 已删除，AI shell 只通过 owner V3 capability 参与 export/dry-run/apply。

## 8. 相关资产

- [AI 模块文件索引](../module-index/ai-files.md)
- [ADR-050 Mastra-native runtime](../../architecture/adr/ADR-050-mastra-native-ai-runtime.md)
- [ADR-051 AI primitive taxonomy](../../architecture/adr/ADR-051-ai-primitive-taxonomy.md)
- [ADR-052 Goal create reference workflow](../../architecture/adr/ADR-052-goal-create-reference-workflow.md)
- [ADR-070 AI GoalPlanDraft V2](../../architecture/adr/ADR-070-ai-goal-plan-orchestration.md)
- [ADR-096 Conversation / Mastra runtime state](../../architecture/adr/ADR-096-assistant-conversation-shell-and-mastra-runtime-state-boundary.md)
- [ADR-097 Provider / Secret / Model Capability](../../architecture/adr/ADR-097-ai-provider-connection-secret-and-model-capability-boundary.md)
- [ADR-098 Context / Knowledge Index / Owner Contract](../../architecture/adr/ADR-098-ai-context-knowledge-index-and-owner-contract-boundary.md)
- [ADR-099 Workflow Draft / Apply / Execution Record](../../architecture/adr/ADR-099-ai-workflow-draft-apply-and-execution-record-boundary.md)
- [AI vNext Model Convergence architecture](../../architecture/ai-vnext-model-convergence.md)
- [AI vNext current-system map](../../analysis/2026-09-09-ai-vnext-model-convergence-current-system-map.md)
- [AI vNext reference/reuse ledger](../../analysis/2026-09-09-ai-vnext-model-convergence-reference-and-reuse-ledger.md)
- [AI vNext archived plan](../../plan/archive/2026-09-09-ai-vnext-model-convergence.md)
- [AI-9612 five-layer closure evidence](../../analysis/2026-09-18-ai-9612-vnext-closure-evidence.md)
- [Core vNext HARD-7104 evidence](../../analysis/2026-09-08-hard-7104-documentation-truth-closure.md)
