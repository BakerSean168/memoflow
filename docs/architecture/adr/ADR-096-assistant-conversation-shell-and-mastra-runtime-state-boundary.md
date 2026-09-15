---
tags:
  - adr
  - ai
  - conversation
  - mastra
  - workflow
  - state-ownership
  - vnext
description: ADR-096 - Assistant Conversation Shell、Mastra Thread/Workflow 单一状态所有权与 UI hydration boundary
created: 2026-09-09T00:00:00+08:00
updated: 2026-09-09T00:00:00+08:00
---

# ADR-096: Assistant Conversation Shell 与 Mastra Runtime State Boundary

**状态：** 已采纳（待实施）
**日期：** 2026-09-09
**影响范围：** AI Conversation、Mastra Runtime/Memory/Workflow、Vue AI workspace、Prisma/PowerSync、HTTP/IPC、Data Portability
**依赖：** ADR-050、ADR-051、ADR-052

## 1. 决策摘要

MemoFlow 将 AI conversation 明确拆成：

```text
AssistantConversationShell
= product list/title/archive identity

Mastra Thread / Workflow
= message/memory/runtime durable truth
```

因此：

1. `AIConversation` 收缩为 thin product shell；
2. `AiMessage` 在 legacy bootstrap 完成后退役；
3. `messageCount` / `lastMessageAt` 退出 aggregate truth，改为 read projection；
4. `Closed` lifecycle 在没有真实产品行为证据时退休，仅保留 archive semantics；
5. UI 不再把完整 `AIWorkflowRunView`/suspension/result/draft revision 持久化到 localStorage；
6. UI 只保存 active run pointer 与真正未提交的 editor overlay；
7. reconnect/restart 始终从 Mastra hydrate authoritative thread/workflow state。

## 2. 为什么需要这次收敛

ADR-050 已经实施：Mastra 是 message history、memory、workflow snapshot 的唯一 runtime owner。

但当前 `AIConversation` 仍包含：

```text
messages[]
messageCount
lastMessageAt
status: Active | Closed | Archived
```

同时 Vue `useAIWorkflowPersistence` 仍把完整 workflow run/draft shadow 写入：

```text
ai:conversation-workflow-map
```

这让“runtime 已经单轨”与“product/UI 模型仍复制 runtime 状态”发生冲突。

## 3. Canonical conversation shell

目标：

```ts
interface AssistantConversationShell {
  id: AIConversationId;
  identityId: IdentityId;
  title: string;
  archivedAt: Instant | null;
  createdAt: Instant;
  updatedAt: Instant;
}
```

### 3.1 不再属于 shell 的字段

以下不是 product shell 的 authoritative state：

```text
messages[]
messageCount
lastMessageAt
activeRunId as durable workflow truth
workflow status
workflow suspension
workflow result
model/tool invocation state
```

## 4. Conversation list/read model

UI 需要 conversation list 时可以组合：

```text
AssistantConversationShell
+
Mastra Thread Summary
```

投影：

```text
ConversationListItem
├── id
├── title
├── archived
├── lastActivityAt?
├── messageCount?
├── preview?
└── activeWorkflowSummary?
```

这些字段是 read model，可重建，不要求双写进 shell row。

## 5. Status simplification

当前 `ConversationStatus.Closed` 缺少稳定产品 journey 证据。

目标不保留形式化三态：

```diff
- Active
- Closed
- Archived

+ archivedAt?
```

如果未来出现“锁定对话不可继续输入”的真实产品需求，再新增明确语义状态；不提前保留无消费者 lifecycle。

## 6. Message migration

### 6.1 当前 legacy bootstrap 继续保护用户内容

已有 conversation 的 `AiMessage` 属于历史用户可见内容，不能直接删除。

迁移顺序：

```text
legacy AiMessage transcript
  -> one-time idempotent Mastra thread bootstrap
  -> mark/import proof
  -> all reads authoritative from Mastra
  -> verify no production writer/reader requires AiMessage
  -> delete AiMessage table/contracts/repository shape
```

### 6.2 禁止长期双写

稳定态不允许：

```text
write Mastra message
+
write AiMessage
```

也不允许：

```text
read Mastra, fallback AiMessage forever
```

## 7. Thread identity

继续采用 ADR-050：

```text
MemoFlow identityId     -> Mastra resourceId
MemoFlow conversationId -> Mastra threadId
```

客户端不得再创建与 Conversation 平行的 random threadId。

## 8. Workflow authority

Workflow durable state 唯一来自 Mastra：

```text
status
step
suspension
resume cursor
result
runtime revision
retry/cancel state
```

MemoFlow 可以保存薄关联：

```text
conversationId
workflowRunId
workflowKind
```

但不能复制 workflow state machine。

## 9. UI state boundary

目标 UI local state：

```ts
interface AssistantConversationUiState {
  activeToolMode?: string;
  activeWorkflowRunId?: string;
  unsavedEditorState?: unknown;
}
```

其中 `unsavedEditorState` 只表示：

> 用户正在前端修改、尚未成功提交到 workflow runtime 的内容。

它不是当前 workflow draft 真值。

### 9.1 Restore path

```text
open conversation
 -> read shell
 -> read active workflow pointer if any
 -> workflowRuntime.get(runId)
 -> project authoritative run/suspension/draft
 -> overlay optional unsaved editor state
```

### 9.2 Structured edit commit

当 UI 调用：

```text
resume(edit_structured)
```

并收到成功后的新 workflow projection：

```text
runtime draft revision
```

重新成为唯一真值，本地 overlay 应清空或基于新 revision 重新建立。

## 10. Reconnect / restart semantics

- Assistant message streaming 断线后不要求 replay 所有 delta；重新读取 Mastra thread history；
- Workflow 断线/重启后通过 `workflowRuntime.get()` hydrate；
- localStorage 不能作为“Mastra 暂时不可用时的 workflow truth fallback”；
- Mastra storage 不可用时应显式 unavailable/error，不用旧 snapshot 冒充当前状态。

## 11. Delete semantics

删除 conversation 时需要明确两个 owner：

```text
Mastra thread/runtime data
AssistantConversationShell
```

目标操作必须：

- 校验 authenticated owner；
- 对部分失败可重试；
- 不产生用户看不到但仍可访问的 orphan thread；
- 继续沿用当前可恢复删除顺序，直到新测试证明更优顺序。

本 ADR 不要求跨两个 storage 做虚假分布式事务。

## 12. Persistence target

稳定态产品表：

```text
assistant_conversations
```

删除候选：

```text
ai_messages
```

`message_count` / `last_message_at` 如果为性能需要保留，也只能明确定义为 rebuildable cache/projection，不得重新成为业务 source of truth。

## 13. Data portability

Conversation portability 必须区分：

```text
product shell metadata
runtime transcript data
```

如果产品导出包含 transcript，应从 Mastra authoritative history 导出；不能在 `AiMessage` 删除后悄悄停止导出历史。

实施前必须审计当前 portability 行为并补 fixture。

## 14. Protected contracts

1. Mastra single runtime authority；
2. existing conversation ids 不变化；
3. historical transcript 不丢失；
4. Web/Desktop HTTP/IPC history/delete parity；
5. identity 只由 ExecutionContext 注入；
6. workflow suspend/resume/cancel/retry behavior 不退化；
7. conversation delete 不产生越权/orphan exposure；
8. no permanent AiMessage fallback；
9. UI unknown run/suspension fail closed。

## 15. 明确拒绝

本 ADR 拒绝：

- 把 Mastra thread transcript 再同步到 Prisma message table；
- 用 localStorage 恢复整个 durable workflow；
- 为 DDD 完整感保留无产品行为的 `Closed`；
- 让 conversation aggregate hydrate 所有 messages；
- 新建第二套 AI checkpoint/replay store。

## 16. Acceptance target

实现完成后能够证明：

```text
restart app
 -> open existing conversation
 -> shell/title loads from MemoFlow
 -> transcript loads from Mastra
 -> suspended workflow loads from Mastra
 -> no full workflow snapshot read from localStorage
 -> legacy AiMessage never participates in production read/write
```

并且：

```text
conversation list message count/latest activity
```

即使 projection/cache 被清空也可以从 authoritative sources 重建。
