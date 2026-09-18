---
tags:
  - architecture
  - ai
  - persistence
description: AI vNext runtime persistence ownership——旧 AgentRun/LangGraph checkpoint 已退役
created: 2026-06-12T00:00:00
updated: 2026-09-18T00:00:00+00:00
---

# AI Runtime Persistence Ownership

> 本文曾描述 AgentRun/LangGraph checkpoint bridge。ADR-050 落地后，该架构已退役；本文保留文件路径是为了让旧 ADR/归档链接有明确的“已替代”落点。

## 当前规则

MemoFlow 不再维护 `AgentRunCheckpoint`、`LangGraphCheckpoint` 或 `LangGraphCheckpointWrite` 作为第二套 runtime persistence。

当前 authority：

| Runtime data | Authority |
| --- | --- |
| Assistant thread / memory | Mastra storage |
| Goal/Task/Knowledge workflow snapshot | Mastra storage |
| Product Goal/Task/Reminder/Knowledge rows | MemoFlow domain stores |
| ProviderConfig | MemoFlow AI persistence |
| token/cost/request/trace projection | `ai_execution_records` / `AIExecutionRecord` bounded operations projection |

API lane 的 Mastra storage 使用 PostgreSQL；Desktop profile 使用 local LibSQL。两端不通过 HTTP callback 互相复制 framework checkpoint。

## 禁止回归

- Python LangGraph checkpointer → Node internal checkpoint route；
- `AgentRunCheckpoint` / `LangGraphCheckpoint*` Prisma model；
- `/internal/agents/checkpoints` / `/internal/agents/langgraph-checkpoints`；
- UI 读取 framework checkpoint/node 作为产品状态；
- MemoFlow product DB 复制 Mastra private snapshot 字段。

反回退由 `ai-vnext-no-legacy.surface.spec.ts` 与 `AI_MASTRA_RUNTIME_AUTHORITY` governance rule 共同锁定。

## 相关

- [ADR-050 — Mastra Native AI Runtime](./adr/ADR-050-mastra-native-ai-runtime.md)
- [AI runtime path map](./ai-runtime-path-map.md)
