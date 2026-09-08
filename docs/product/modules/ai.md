---
tags:
  - product
  - module
  - ai
description: AI 模块当前功能、Mastra durable workflows、Routine tools 与产品读写边界
created: 2026-06-02T00:00:00
updated: 2026-09-08T09:00:00+08:00
---

# AI 模块说明

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

- `goal.create`：clarify / draft / review / revise / approve，草稿使用当前 Shared Label 与 KR Measurement V2；
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

## 6. Provider / Knowledge / Evaluation

- Provider/BYOK credential 由 host-side secret vault 加密保存；
- model resolver 在 server-side 选择 provider/model；
- Knowledge source/index/analytics 通过 host-owned read ports 注入；
- execution log 保存 usage/cost/requestId/traceId/provider/model；
- evaluation runner 继续承担 quality/cost/latency gate。

## 7. 宿主边界

API 与 Desktop 各自在 composition root 注入 Goal/Task/Reminder owner mutation ports、Routine command port、Planner read port、Notification read port、Repository/Knowledge ports 与 LabelService。AI package 不 deep-import Prisma/PowerSync provider 实现，也不创建第二套业务 repository。

## 8. 相关资产

- [AI 模块文件索引](../module-index/ai-files.md)
- [ADR-050 Mastra-native runtime](../../architecture/adr/ADR-050-mastra-native-ai-runtime.md)
- [ADR-051 AI primitive taxonomy](../../architecture/adr/ADR-051-ai-primitive-taxonomy.md)
- [ADR-052 Goal create reference workflow](../../architecture/adr/ADR-052-goal-create-reference-workflow.md)
- [Core vNext HARD-7104 evidence](../../analysis/2026-09-08-hard-7104-documentation-truth-closure.md)
