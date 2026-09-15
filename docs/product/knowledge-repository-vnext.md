---
tags:
  - product
  - repository
  - knowledge
  - obsidian
  - github
  - vnext
description: Knowledge Repository vNext North Star：KnowledgeSpace、Local/Remote Binding、稳定文档身份、Projection、AI Index 与可靠写入边界
created: 2026-09-08T21:25:00+08:00
updated: 2026-09-11T00:02:00+08:00
---

# Knowledge Repository vNext

> **ADR-111 cutover policy (2026-09-09):** 当前没有需要保留的 MemoFlow 旧业务数据，也不要求兼容旧客户端/旧备份。本文历史推演中仅为旧数据保存设计的 migration/backfill/compatibility window 不再执行；目标模型和真实行为不变量继续有效。实施采用 direct canonical cutover + old-surface deletion + reset/reseed。

## 1. 一句话定义

> **KnowledgeSpace = 用户在 MemoFlow 中的逻辑知识空间。**
> **Source Binding = 这个知识空间从哪里读写。**
> **KnowledgeDocument = 可以跨 rename/move 稳定引用的知识文档身份。**
> **Projection = 当前文件内容的可重建读模型。**
> **AI Index = AI 对知识的检索/理解状态，由 AI 单独拥有。**

Repository vNext 不重新建立数据库式 Repository/Folder/Resource 编辑器，而是在已经完成的 ADR-034 local-first 架构上，把绑定、健康状态、同步、文档身份、投影、AI 索引和可靠操作彻底分轨。

> **实施 checkpoint（2026-09-11）：** ADR-089 已完整实施。Local Vault 使用 profile-owned binding + `LocalVaultHealth`；Remote 使用 `KnowledgeRemoteBinding + RemoteRepositoryObservation + RemoteHistoryFence + KnowledgeProjectionCheckpoint`，普通 list 不再调用 Provider，显式 refresh/security preflight 才观察 GitHub。Desktop Local/Remote 通过同一 `KnowledgeSpaceId` 配对，Provider loss 不会删除 binding。KNOW-2002 已实施 ADR-090：confirmed create 与显式 CAS metadata adoption 使用 `memoflow_id: kdoc_<opaque UUID>`，unmanaged Markdown 不会被静默改写，rename/move 与 AI/Local Vault/PowerSync 都复用 stable ID。ADR-091 single projection engine 仍未实施，本文对应章节仍是下一阶段目标态。

## 2. Product Constitution

### 2.1 Markdown/Git 仍是真正内容事实源

```text
Local Vault
  <-> Git working tree
  <-> GitHub repository
```

服务端 projection 不是第三个可独立编辑的正文事实源。

### 2.2 Binding 与 Health 分离

“用户选择了这个来源”和“这个来源现在是否可用”不是同一个状态。

```text
Binding lifecycle != Provider / filesystem health
```

### 2.3 Sync 与 Projection 分离

Desktop Git 已经同步到哪里，与 Server projection 已经消费到哪里，是两个独立 cursor。

### 2.4 Document Identity 与 Path 分离

```text
path = 用户组织知识的位置
id   = 系统长期引用文档的身份
```

文件移动/重命名不能使 Goal/Task/Relation 永久引用失效。

### 2.5 AI Index 不反向拥有 Knowledge 状态

Repository/Knowledge 只拥有文档事实和 projection；AI 自己拥有 pending/indexed/failed、embedding、chunks 等索引状态。

### 2.6 Reliable Operations 不是 Domain Aggregate

Webhook delivery、lease、cache、confirmed-write ledger 是可靠性状态机，不强行包装为大型业务 aggregate。

## 3. North Star Architecture

```text
                         KnowledgeSpace
                         /            \
                        /              \
              LocalVaultBinding    KnowledgeRemoteBinding
                     │                    │
                     ▼                    ▼
               Obsidian Vault        GitHub repository
                     │                    │
                     └──── Desktop Git ───┘
                                          │
                              webhook / reconcile / web commit
                                          │
                                          ▼
                                  RepositoryChangeSet
                                          │
                                          ▼
                               KnowledgeProjectionEngine
                                  │                 │
                                  ▼                 ▼
                           DocumentProjection   AssetProjection
                                  │
                                  │ DocumentChanged
                                  ▼
                               AI Index

Goal / Task / Relation
          │
          ▼
Stable KnowledgeDocumentId
```

## 4. KnowledgeSpace

vNext 引入一个很轻的逻辑 `KnowledgeSpace`，用于表达“用户的知识库”，而不是恢复旧 Repository aggregate。

目标模型：

```text
KnowledgeSpace
├── id
├── createdAt
└── updatedAt
```

`KnowledgeSpaceId` 是跨 surface 的逻辑空间身份，本身不要求 cloud `IdentityId`。ownership 由所在 host 的 binding 负责：Desktop 用 `localProfileId`，online remote/projection 用认证 `identityId`。这样 guest profile 在没有 cloud account 时也能拥有同一个逻辑知识空间，后续登录/绑定云端时不需要重建 Vault。

首期产品仍保持：

```text
一个 local profile
→ 一个主要 KnowledgeSpace
→ 至多一个 active Local Vault binding

一个已绑定 online identity 的 KnowledgeSpace
→ 至多一个 active remote knowledge repository binding
```

未来如果真的出现多知识空间产品需求，再扩展，而不是先让 auto-sync 在多个 remote connection 中猜。

## 5. Local Source

### 5.1 LocalVaultBinding

```text
LocalVaultBinding
├── id
├── knowledgeSpaceId
├── localProfileId
├── rootPath
├── displayName
├── boundAt
└── detachedAt?
```

它只表达：

> 这个 Desktop local profile 把哪个 Vault 绑定为当前知识来源？

不再用 online `identityId` 直接表达本地物理 owner。

### 5.2 LocalVaultHealth

```text
LocalVaultHealth
├── bindingId
├── state
│   ├── Available
│   ├── Missing
│   └── Unreadable
├── observedAt
└── detail?
```

`Detached` 不属于 Health；它属于 Binding lifecycle。

`obsidianVaultId` 当前没有真实能力，vNext 不保留为必备业务字段。

## 6. Remote Source

### 6.1 KnowledgeRemoteBinding

```text
KnowledgeRemoteBinding
├── id
├── knowledgeSpaceId
├── identityId
├── provider = GitHub
├── installationId
├── repositoryId
├── repositoryFullNameSnapshot
├── connectedAt
└── disconnectedAt?
```

它只表达用户长期选择：

> 这个 KnowledgeSpace 同步到哪个 GitHub private repository？

### 6.2 RemoteRepositoryObservation

```text
RemoteRepositoryObservation
├── bindingId
├── observedAt
├── accountId
├── repositoryFullName
├── defaultBranch
├── private
├── archived
├── disabled
├── contentsPermission
├── installationSuspended
└── eligibility
    ├── Ready
    └── Blocked(reason)
```

建议的 reason：

```text
InstallationMissing
InstallationSuspended
ContentsPermissionRequired
RepositoryAccessLost
RepositoryPublic
RepositoryArchived
RepositoryDisabled
DefaultBranchChanged
CheckUnavailable
```

Observation 由 webhook/background reconciliation/显式 refresh 更新。普通 list Query 默认只读最近 observation，不因打开设置页而隐式修改 binding lifecycle。

## 7. GitHub Installation Intent

现有 InstallationIntent 保留为独立授权编排状态机：

```text
Pending
  -> CallbackReceived
  -> Finalized
  -> Consumed

Expired = expiresAt 派生
```

不再在 Remote Binding 上重复 `PendingInstall`。

## 8. Sync Boundary

Desktop Git 继续是真正同步执行器。

### 8.1 Protected behavior

```text
local change
  -> local commit
  -> fetch
  -> verify remote history
  -> pull/rebase if needed
  -> push
```

继续禁止 force push；冲突继续明确暂停。

### 8.2 Remote history fence

当前 `lastSyncedCommitSha` 的真实语义是 MemoFlow 最近确认过的安全 remote history fence。vNext 应使用更明确的命名，例如：

```text
lastConfirmedRemoteHeadSha
```

或等价 value object。

它不代表某一台设备全部真实 Git 状态；local HEAD、origin refs、working tree、rebase state 仍由本地 Git runtime 自己判断。

## 9. Projection Boundary

### 9.1 ProjectionCheckpoint

`lastProjectedCommitSha` 从 Remote Binding 中拆出：

```text
KnowledgeProjectionCheckpoint
├── bindingId
├── branch
├── projectedCommitSha?
├── state
│   ├── Ready
│   ├── Lagging
│   ├── Rebuilding
│   └── Failed
├── failure?
├── lastAttemptAt?
└── projectedAt?
```

于是可以自然表达：

```text
Remote binding: connected
Provider: ready
Projection: failed
```

而不是把 connection 整体写成 `Error`。

### 9.2 Single KnowledgeProjectionEngine

所有 projection write 必须汇聚到同一个 owner：

```text
Webhook
Web confirmed Git commit
Periodic reconciliation
        │
        ▼
RepositoryChangeSet
        │
        ▼
KnowledgeProjectionEngine
```

入口负责获得 provider change，ProjectionEngine 负责规范化、apply、mutation event、checkpoint advance。

## 10. Stable KnowledgeDocument Identity

### 10.1 Target model

```text
KnowledgeDocument
├── id: KnowledgeDocumentId
├── knowledgeSpaceId
├── currentPath
└── lifecycle metadata
```

当前文件内容仍来自 projection：

```text
KnowledgeDocumentProjection
├── documentId
├── relativePath
├── commitSha
├── blobSha
├── contentHash
├── frontmatter
├── markdownContent
└── timestamps
```

### 10.2 Stable ID persistence

vNext 采用 namespaced Markdown frontmatter：

```yaml
memoflow_id: kdoc_xxx
```

作为跨 clone、跨设备、跨 rename/move 可恢复的稳定身份。

规则：

1. MemoFlow 新建 Note 时，confirmed proposal 中直接展示并写入 `memoflow_id`；
2. 旧 Note 未带 ID 时仍可正常浏览/搜索；
3. 当旧 Note 第一次需要成为 durable cross-module reference 时，MemoFlow 明确提示将加入 `memoflow_id`，用户确认后再修改文件；
4. 不允许 silently 给整个 Vault 批量写 ID；
5. 同一 KnowledgeSpace 内 `memoflow_id` 必须唯一；
6. duplicate ID 进入明确 conflict state，不猜测 winner；
7. rename/move 只更新 currentPath，不更换 documentId。

详细规则见 ADR-090。

## 11. Goal / Task / Relation 使用稳定 DocumentRef

跨模块只引用：

```text
KnowledgeDocumentRef {
  knowledgeSpaceId
  documentId
}
```

不引用：

```text
relativePath
path-derived projectionId
Git blobSha
Git commitSha
```

例如：

```text
Goal --related--> KnowledgeDocumentRef
Task --related--> KnowledgeDocumentRef
```

用户在 Obsidian 中移动文件后，relation 保持。

## 12. AI Index Boundary

Repository/Knowledge projection 最终不保存：

```text
indexStatus
embedding
chunks
retrieval vector
AI failure
```

这些由 AI owner：

```text
AIKnowledgeIndexEntry
├── documentId
├── contentHash
├── state
│   ├── Pending
│   ├── Indexed
│   └── Failed
├── summary
├── keywords
├── chunks
├── embedding/retrieval data
├── error?
└── indexedAt?
```

知识变化：

```text
KnowledgeProjectionEngine
  -> KnowledgeDocumentChanged(documentId, contentHash)
  -> AI ingestion
```

UI 若需要“文档 + 索引状态”，通过 Workspace read model 组合，不让 AI 回写 Knowledge projection。

## 13. Knowledge Commit Operation

当前 `KnowledgeWriteRequest` 的可靠性设计保留，但概念上收敛为 operation：

```text
KnowledgeCommitOperation
├── id
├── identityId
├── bindingId
├── requestId
├── requestHash
├── proposalRef
├── targetPath
│
├── commit
│   ├── Pending
│   ├── Committed(commitSha)
│   └── Failed(error)
│
├── projection
│   ├── Pending
│   ├── Succeeded
│   └── Failed(error, attempts)
│
├── replayPayload?
└── timestamps
```

`replayPayload` 可以暂存 committed source，用于 projection replay，但它不是永久知识事实源。

目标 retention：

```text
projection succeeded
+ bounded retention window expired
→ replay payload 可清理
→ operation receipt 可保留
```

## 14. Knowledge Workspace Read Model

产品需要显示的是组合状态，而不是一个 God Aggregate：

```text
KnowledgeWorkspaceReadModel
=
KnowledgeSpace
+ LocalVaultBinding / LocalVaultHealth
+ RemoteBinding / RemoteObservation
+ Sync status
+ ProjectionCheckpoint
+ DocumentProjection
+ AI index status
+ recent operations
```

用户可以看到完整状态，但 ownership 仍然分离。

## 15. Application Capability Ports

长期把过宽的 `RepositoryApplicationPort` 拆成消费方需要的能力：

```text
KnowledgeBindingPort
  installation / connect / disconnect / reconciliation / refresh

KnowledgeLibraryPort
  list / read / search / link graph / attachment

KnowledgeWritePort
  confirmed create / confirmed metadata adoption

KnowledgeOperationsPort
  replay / timeline / audit
```

Webhook ingress、projection worker 是内部 integration capability，不作为普通 UI application surface。

## 16. Legacy Repository Retirement

以下旧模型不回归运行时：

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

ADR-111 下不再作为 data-portability / historical backup boundary 保留。current consumers 清零后直接删除：

```text
portable export/import
account closure
schema cleanup
```

再统一 DROP。

## 17. Product language

产品继续使用：

```text
知识库
本地 Vault
GitHub 同步
笔记
附件
关联知识
```

不向用户暴露：

```text
Projection
Lease
WebhookDelivery
KnowledgeWriteRequest
Repository Aggregate
```

工程 package `@memoflow/repository` 可在模型收敛后评估重命名为 `@memoflow/knowledge`，但 package rename 不是本轮建模前置条件。

## 18. Protected Contracts

不得为了 vNext 重构破坏：

1. 未连接 GitHub 时 Local Vault 完整可用且不上传；
2. GitHub login 与 knowledge repository authorization 解耦；
3. private repository + GitHub App 最小权限；
4. installation state hash / TTL / route binding；
5. short-lived repository-scoped token；
6. local Git commit durable offline queue；
7. no force push；
8. conflict pause and preserve both sides；
9. remote history rewrite detection；
10. Web writes are Git commits first；
11. confirmed proposal + request idempotency；
12. server projection rebuildable from GitHub default branch；
13. safe Markdown rendering；
14. attachment access remains authenticated and bounded；
15. disconnect does not delete Vault/GitHub repository；
16. server-held disclosure 与 importable portable artifact 保持分离；
17. Goal/Task 不拥有 Knowledge document content；
18. AI 不直接修改 Knowledge authoritative content。

## 19. Non-goals

本轮设计不做：

- 恢复内置 Markdown 全功能编辑器；
- 恢复 Folder/Resource CRUD；
- 支持任意多个同时自动同步的 GitHub knowledge repository；
- 执行 Obsidian plugin/Dataview/Canvas 代码；
- 自动 force merge Git conflict；
- silent bulk mutation 全 Vault frontmatter；
- 把 GitHub private repo 宣称为 E2E encrypted storage；
- 立即重命名 package；
- 立即删除 legacy Prisma backup tables。

## 20. Design package and implementation gate

已冻结设计：

1. [Current System Map](../analysis/2026-09-08-knowledge-repository-vnext-current-system-map.md)
2. [ADR-089](../architecture/adr/ADR-089-knowledge-space-source-binding-and-health-boundaries.md)
3. [ADR-090](../architecture/adr/ADR-090-stable-knowledge-document-identity.md)
4. [ADR-091](../architecture/adr/ADR-091-knowledge-projection-index-and-operation-boundaries.md)

**当前 checkpoint：** ADR-089 与 ADR-090/KNOW-2002 已实施；ADR-091/KNOW-2003 是下一阶段工作。Goal/Task durable relation 仍等待后续 ticket 的 stable `KnowledgeDocumentRef` 接入。
