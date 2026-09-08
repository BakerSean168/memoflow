---
tags:
  - adr
  - repository
  - knowledge
  - projection
  - ai
  - operation
  - vnext
description: ADR-091 - 单一 KnowledgeProjectionEngine、AI Index 单独 ownership、可靠 KnowledgeCommitOperation 与 capability port 边界
created: 2026-09-08T21:25:00+08:00
updated: 2026-09-08T21:25:00+08:00
---

# ADR-091: Knowledge Projection、AI Index 与 Operation Boundary

**状态：** 已采纳（待实施）
**日期：** 2026-09-08
**影响范围：** Repository/Knowledge、AI、Web confirmed create、GitHub webhook/reconciliation、Application Ports、Operations、Legacy Repository tables

## 1. 决策摘要

Repository/Knowledge vNext 采用三个独立 owner：

```text
Knowledge Projection
  = Git/Vault 当前文档/附件事实的可重建 read model

AI Index
  = AI 对 KnowledgeDocument 的检索/理解状态

Knowledge Operations
  = confirmed write / webhook / worker 的可靠性状态
```

所有 projection mutation 汇聚到一个 `KnowledgeProjectionEngine`。

Repository projection 不再持久化 AI `indexStatus`；AI 不反向回写 Knowledge projection。

当前 `KnowledgeWriteRequest` 的 commit/projection 双状态保留，并收敛为 `KnowledgeCommitOperation` 概念。

## 2. 当前问题

### 2.1 Projection owner 重复

当前：

```text
KnowledgeNoteCommitService
KnowledgeRepositoryProjectionService
```

都能构造 `KnowledgeNoteProjectionUpsert` 并直接 `applyChanges()`。

虽然正文事实仍然来自 Git commit，不是双内容真值，但 projection translation/apply ownership 重复。

### 2.2 AI indexing 状态双写

Repository projection 保存：

```text
indexStatus = pending | indexed | failed
```

AI 的 `AiKnowledgeIndexEntry` 同时保存：

```text
status / contentHash / chunks / embedding / error / indexedAt
```

AI 还通过 `IKnowledgeIndexStatusPort` 回写 Repository。

这是 indexing state 的双真值。

### 2.3 Application Port 过宽

`RepositoryApplicationPort` 当前同时承载安装、连接、token、reconciliation、library read、attachment、create、webhook、replay、timeline/audit。

这作为 host facade 可以工作，但 capability ownership 对消费者不够明确。

## 3. Single KnowledgeProjectionEngine

目标数据流：

```text
GitHub webhook
Web confirmed commit
Periodic reconciliation
        │
        ▼
RepositoryChangeSet
        │
        ▼
KnowledgeProjectionEngine
        │
        ├── resolve KnowledgeDocumentId
        ├── normalize Markdown/frontmatter
        ├── apply DocumentProjection
        ├── apply AssetProjection
        ├── update ProjectionCheckpoint
        └── publish KnowledgeDocumentChanged/Moved/Deleted
```

入口不再自行实现 projection translation。

### 3.1 RepositoryChangeSet

概念 contract：

```ts
interface RepositoryChangeSet {
  bindingId: KnowledgeRemoteBindingId;
  beforeCommitSha: string | null;
  afterCommitSha: string;
  fullSnapshot: boolean;
  documents: KnowledgeDocumentChange[];
  assets: KnowledgeAssetChange[];
}
```

具体 provider adapter 负责把 GitHub API response 变成 provider-neutral change set。

### 3.2 Engine idempotency

同一：

```text
bindingId + afterCommitSha
```

重复 webhook/reconciliation/replay 必须安全幂等。

Checkpoint 只在该 commit 的 projection 成功后 advance。

## 4. Knowledge Projection 所有权

Knowledge 模块拥有：

```text
KnowledgeDocument identity/location
current Markdown projection
attachment projection
Markdown link graph derived data
projection checkpoint
content hash
```

不拥有：

```text
embedding
chunks
retrieval vector
AI index pending/indexed/failed
LLM summary
AI-specific error/retry
```

## 5. AI Index 所有权

AI 模块 canonical index record：

```ts
interface AIKnowledgeIndexEntry {
  identityId: IdentityId;
  knowledgeSpaceId: KnowledgeSpaceId;
  documentId: KnowledgeDocumentId;
  contentHash: string;
  state: 'Pending' | 'Indexed' | 'Failed';
  summary?: string;
  keywords: string[];
  chunks: KnowledgeIndexedChunk[];
  error?: string | null;
  indexedAt?: Instant | null;
}
```

Knowledge 更新发布：

```text
KnowledgeDocumentChanged(documentId, contentHash)
```

AI 消费后自行推进 index state。

UI 需要综合状态时：

```text
KnowledgeWorkspaceReadModel
= DocumentProjection + AIIndexSummary
```

而不是 AI 回写 Repository projection。

## 6. KnowledgeCommitOperation

当前 `KnowledgeWriteRequest` 已有正确基础：Git commit state 与 projection state 分离。

vNext 概念模型：

```ts
interface KnowledgeCommitOperation {
  id: KnowledgeCommitOperationId;
  identityId: IdentityId;
  bindingId: KnowledgeRemoteBindingId;
  requestId: string;
  requestHash: string;
  proposalRef: { proposalId: string; revision: number };
  targetPath: string;

  commit:
    | { state: 'Pending' }
    | { state: 'Committed'; commitSha: string }
    | { state: 'Failed'; code: string; message: string };

  projection:
    | { state: 'Pending'; attempts: number }
    | { state: 'Succeeded'; projectedAt: Instant }
    | { state: 'Failed'; attempts: number; code: string; message: string };

  replayPayload?: {
    blobSha: string;
    markdownContent: string;
  };

  createdAt: Instant;
  updatedAt: Instant;
}
```

名称变化是概念收敛；实施时可以先迁移 contract/schema，再决定是否物理重命名表。

## 7. Reliable write path

目标：

```text
confirmed proposal
  -> reserve idempotency operation
  -> Git commit
  -> mark Committed
  -> build RepositoryChangeSet for exact commit
  -> KnowledgeProjectionEngine
  -> mark projection Succeeded
```

如果 Git commit 已成功而 projection 失败：

```text
commit = Committed
projection = Failed
```

retry 不得再次创建第二个文件/commit，只重放 projection。

Webhook 之后观察到同一 commit，也可以把 operation projection state 收敛到 Succeeded。

## 8. Replay payload retention

当前 `blobSha + markdownContent` 作为 local replay source 是合理的可靠性优化，但它不是永久知识事实源。

实施必须定义 bounded retention，例如：

```text
projection succeeded
AND retention window elapsed
-> purge replay payload
```

保留 operation receipt：

```text
requestId
requestHash
commitSha
final state
errors/timestamps
```

用于 audit/idempotency。

具体 retention 时长由实施 plan 根据 storage/repair requirements 冻结。

## 9. Webhook Delivery / Lease / Attachment Cache

继续作为 operations/infrastructure state：

```text
GithubWebhookDelivery
KnowledgeRepositoryLease
KnowledgeAttachmentContentCache
```

不创建对应大型 domain aggregate。

职责：

- delivery: webhook dedup + processing receipt；
- lease: distributed ownership/fencing；
- cache: bounded immutable attachment bytes。

## 10. Capability Ports

长期 public capability 按 consumer 拆分：

### 10.1 KnowledgeBindingPort

```text
start/finalize installation
connect/disconnect
refresh observation
preview/confirm reconciliation
issue Desktop token
```

### 10.2 KnowledgeLibraryPort

```text
list/search/read document projections
read link graph
list/read attachments
resolve stable KnowledgeDocumentRef
```

### 10.3 KnowledgeWritePort

```text
confirmed create
confirmed document-identity adoption
```

### 10.4 KnowledgeOperationsPort

```text
replay projection
operation timeline
audit
```

### 10.5 Internal integration ports

```text
GitHubWebhookIngress
KnowledgeProjectionWorker
```

不作为普通 UI 能力面。

Host 仍可提供一个 thin facade 组合这些 ports，但消费者不得因此获得不需要的 privileged methods。

## 11. Markdown Link Graph

Wiki link / Markdown link graph 仍是 Knowledge projection derived data。

它与跨模块 Relation 区分：

```text
Markdown Link Graph
= 文档内容本身表达的知识链接

Goal/Task Relation
= MemoFlow 业务 context relation
```

二者可以在 Workspace 中合并展示，但不能混为同一个 truth store。

## 12. Legacy Repository tables

旧：

```text
Repository
Folder
Resource
RepositoryResource
LinkedContent
ResourceReference
RepositoryExplorer
RepositoryStatistic
```

继续标记为 legacy portability/backup boundary，不恢复 runtime CRUD。

删除前置：

1. portable import/export 替代/退役策略明确；
2. account closure 不再依赖旧表；
3. migration tests 完成；
4. Prisma/PowerSync schema 统一清理。

本 ADR 不要求当前立即 DROP。

## 13. Package naming

产品和新文档统一优先使用 `Knowledge` 语义。

`@memoflow/repository` 与 DDD repository pattern 存在认知冲突，但 package rename 为低优先级 migration，不作为本轮 architecture implementation 前置。

## 14. Protected contracts

- Git commit 是 Web remote write 的第一事实；
- projection 可重建；
- confirmed request 幂等；
- commit/projection state 分离；
- webhook delivery dedup；
- lease ownership；
- attachment size/integrity/auth boundary；
- AI 不拥有 Markdown content；
- Repository 不拥有 AI index truth；
- failure/replay 不制造 duplicate file/commit；
- safe Markdown 和 user confirmation 保持。

## 15. 不采用的方案

### 15.1 CommitService 和 WebhookService 各维护一套 projection

不采用。入口可以不同，projection owner 只能有一个。

### 15.2 Repository projection 继续保存 AI index status

不采用。AI 已经有 canonical index store，回写只制造双真值。

### 15.3 把 operation ledger 当作正文备份

不采用。replay payload 只是 bounded reliability material。

### 15.4 所有能力继续暴露在一个 God Port

不作为长期边界。可以保留 thin host facade，但内部/消费者 capability 必须拆分。
