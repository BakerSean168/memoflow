---
tags:
  - analysis
  - repository
  - knowledge
  - obsidian
  - github
  - vnext
description: Repository/Knowledge 当前事实源、绑定、同步、投影、AI 索引与遗留数据边界审计
created: 2026-09-08T21:25:00+08:00
updated: 2026-09-11T00:02:00+08:00
---

# Knowledge Repository vNext — Current System Map

## 1. 文档地位

本文记录 **2026-09-08 当时代码事实**，用于支撑 Repository/Knowledge vNext 建模。它是历史 baseline，不应再被当作 2026-09-11 当前实现说明。

> **2026-09-11 supersession note:** 本文第 4/6/7/8/9 节关于 Local `identityId/status`、`KnowledgeRepositoryConnection.status/error`、`lastSyncedCommitSha`、`lastProjectedCommitSha` 与 query-triggered lifecycle refresh 的描述已经被 ADR-089 实施替代。当前真值见 product module / ADR-089 / canonical system plan；本文保留用于说明为何需要该重构。ADR-090/091 相关 baseline 仍用于后续实施分析。

相关目标态文档：

- [Knowledge Repository vNext](../product/knowledge-repository-vnext.md)
- [ADR-089: KnowledgeSpace、Source Binding 与 Health/Observation Boundary](../architecture/adr/ADR-089-knowledge-space-source-binding-and-health-boundaries.md)
- [ADR-090: Stable KnowledgeDocument Identity](../architecture/adr/ADR-090-stable-knowledge-document-identity.md)
- [ADR-091: Knowledge Projection、AI Index 与 Operation Boundary](../architecture/adr/ADR-091-knowledge-projection-index-and-operation-boundaries.md)

## 2. 当前产品事实源

ADR-034 已经把旧数据库 Repository/Folder/Resource CRUD 从运行时知识编辑主链移除。当前知识正文的事实边界为：

```text
Desktop local-first

Local Obsidian Vault
  <-> Desktop Git runtime
  <-> GitHub private repository
       -> verified webhook / reconciliation
       -> server rebuildable projection
       -> Web / Mobile / AI

Web confirmed create
  -> GitHub App commit
  -> projection
  -> Desktop pull
```

当前原则已经正确：

1. Desktop 的本地 Vault 是可写工作副本；
2. GitHub private repository 是可选跨设备提交日志和远端副本；
3. 服务端数据库中的 Markdown/附件是可重建 read model，不是第三个独立编辑事实源；
4. Web 写入必须先成为 Git commit；
5. GitHub 故障不能锁死本地 Vault。

## 3. 当前 `packages/repository` 不是传统 DDD Repository Aggregate

`packages/repository/src/server/domain/index.ts` 当前为空：

```ts
export {};
```

运行时已经没有旧的 Repository/Folder/Resource domain aggregate。当前 package 的真实职责是：

```text
Local Vault runtime
GitHub App installation / connection
Desktop Git synchronization
GitHub webhook / reconciliation
Markdown + attachment projection
confirmed-create operation ledger
link graph projection
AI knowledge ingestion integration
```

因此本文中的 Repository 指产品知识仓库能力，不等同于 `IGoalRepository`、`ITaskPlanRepository` 等 DDD repository pattern。

## 4. Local Vault 当前模型

当前 contract：

```text
LocalVaultBindingClientDTO
├── id
├── identityId
├── rootPath
├── displayName
├── status
│   ├── Active
│   ├── Missing
│   ├── Unreadable
│   └── Detached
├── obsidianVaultId?
├── lastScannedAt?
└── timestamps
```

### 4.1 已验证行为

- binding metadata 存在 Desktop 本地文件；
- Vault 路径为 canonical absolute path；
- 读取、扫描、搜索、打开 Obsidian、confirmed create 均有路径穿越和 symlink escape 防护；
- confirmed create 使用 `requestId + proposalId + revision` 做本地幂等 ledger；
- detach 不删除用户文件；
- `.git`、`.obsidian`、trash、node_modules 等不进入普通扫描；
- Local Vault scan/search 是 Desktop 本地能力，不依赖 GitHub。

### 4.2 当前建模不一致

`identityId` 同时被当作本地 binding owner，但 `getBinding(identityId)` 在读取时会把 binding owner 重写为当前 identity。这是为了 Guest -> online account 升级时保留原 Vault，却使“本地 profile ownership”和“在线 identity ownership”混为一体。

`status` 也同时混合：

```text
Active / Detached       = 用户 binding lifecycle
Missing / Unreadable    = filesystem health observation
```

`obsidianVaultId` 当前生产路径始终写 `null`，没有真实能力消费。

## 5. GitHub Installation Intent 当前模型

当前 `KnowledgeRepositoryInstallationIntent` 是独立、短生命周期的授权编排记录：

```text
Pending
  -> CallbackReceived
  -> Finalized
  -> Consumed

Expired = 由 expiresAt 派生
```

持久字段包括：

```text
identityId
stateHash
routeKey
clientKind
returnPath
installationId?
providerAccountId?
setupAction?
expiresAt
callbackReceivedAt?
finalizedAt?
consumedAt?
```

当前实现只保存 provider state 的 SHA-256 hash，不持久化 raw state/token，并支持 Desktop 已验证 intent 的有限恢复窗口。

**判断：这一状态机职责清楚，应作为 protected asset。**

## 6. KnowledgeRepositoryConnection 当前模型

当前服务端 DTO：

```text
KnowledgeRepositoryConnection
├── id / identityId
├── githubUserId
├── githubRepositoryId
├── githubRepositoryFullName
├── installationId
├── defaultBranch
├── status
│   ├── PendingInstall
│   ├── Active
│   ├── Suspended
│   ├── Revoked
│   └── Error
├── lastSyncedCommitSha
├── lastProjectedCommitSha
├── lastErrorCode / lastErrorMessage
├── version
└── timestamps / deletedAt
```

### 6.1 当前 `status` 承担了多个独立问题

同一个 status 同时回答：

```text
用户是否仍然连接这个 repository？
GitHub installation/repository 当前是否仍然可访问？
projection pipeline 是否失败？
是否因为 force-push/history rewrite 需要 reconcile？
```

具体表现：

- 用户主动 disconnect 会写 `Revoked`，并由 Prisma adapter 写 `deletedAt`；
- installation 不存在或 repository access 丢失也会写 `Revoked`；
- public/archived/disabled/permission/default-branch change 会写 `Suspended`；
- projection failure 可以把 connection 写成 `Error`；
- `PendingInstall` 当前只有 contract/UI/test 消费，实际 connection 创建发生在 installation intent Finalized 之后，没有生产路径创建 PendingInstall connection。

因此 Connection 当前同时混合：

```text
binding lifecycle
provider observation
sync cursor
projection cursor
provider failure
projection failure
```

## 7. Query 与 lifecycle refresh 当前耦合

`listKnowledgeRepositoryConnections()` 当前不只是数据库 Query：

```text
list connections
  -> 调 GitHub installation inventory
  -> refresh provider lifecycle
  -> 可能更新 connection status/error
  -> 返回 DTO
```

这意味着普通设置页读取会产生外部 I/O 和 mutation。GitHub 短暂不可用也会进入 connection lifecycle 处理路径。

## 8. Desktop Git Sync 当前事实

当前 Desktop sync 的关键保护是正确的：

1. 网络操作之前先把 local change 变成 Git commit，形成 durable local queue；
2. 使用短期 repository-scoped installation token；
3. fetch remote HEAD 后检查历史是否被 rewrite；
4. fast-forward 可直接 push；
5. remote 有新提交时 pull/rebase；
6. rebase conflict 会暂停，不 silent overwrite；
7. 不 force push；
8. network recovery / system resume / file watcher 可以触发自动同步；
9. auto-sync 只在恰好一个 eligible reconciled connection 时启用。

`lastSyncedCommitSha` 当前实际被用作 remote-history safety fence：要求它仍然存在且仍是 remote HEAD ancestor。

## 9. 当前“一知识库”产品语义与数据库 many connection 不完全一致

产品文档和 auto-sync 行为基本假设：

```text
一个 Desktop profile
+ 一个 Local Vault
+ 一个 active/reconciled GitHub knowledge repository
```

但数据库允许一个 identity 绑定多个不同 GitHub repository；auto-sync 在 eligible connection 多于一个时直接不选择任何一个。

因此当前缺少一个明确的逻辑 Knowledge Space / Local-Remote pairing identity。

## 10. Note / Attachment Projection 当前模型

当前 Markdown projection：

```text
KnowledgeNoteProjection
├── id
├── connectionId
├── relativePath
├── commitSha
├── blobSha
├── contentHash
├── frontmatter
├── markdownContent
├── indexStatus
└── timestamps / deletedAt
```

附件 projection：

```text
KnowledgeAttachmentProjection
├── id
├── connectionId
├── relativePath
├── commitSha
├── blobSha
├── byteSize
├── mediaType
└── timestamps / deletedAt
```

它们符合“GitHub default branch 可重建 read model”的定位。

## 11. 当前 Note ID 与 path 绑定

Note projection ID 的生成规则是：

```text
knowledge-note-${sha256(connectionId + ':' + relativePath)}
```

Attachment 同样使用 connection + path。

Git rename 时：

```text
previousPath -> Deleted mutation
newPath      -> 新 projection id
```

因此当前 identity 语义是 **path identity**，不是稳定 document identity。

直接影响：如果 Goal/Task/Relation 长期引用当前 projectionId，用户在 Obsidian 中 move/rename 文件后，跨模块 relation 会断开。

## 12. Projection owner 当前重复

当前有两个服务都能构造并直接 apply `KnowledgeNoteProjectionUpsert`：

```text
KnowledgeNoteCommitService
KnowledgeRepositoryProjectionService
```

前者在 Web confirmed Git commit 后立即 projection；后者在 webhook/reconciliation 时 projection。

两者都依赖同一 Git commit 事实，因此尚未形成正文双写真值，但 projection translation/apply ownership 重复。

## 13. AI Index 当前存在双状态

Repository projection 保存：

```text
indexStatus = pending | indexed | failed
```

AI 模块同时拥有 `AiKnowledgeIndexEntry`：

```text
status
contentHash
summary
keywords
embedding
retrievalVector
chunks
error
indexedAt
...
```

AI 通过 `IKnowledgeIndexStatusPort` 反向回写 Repository projection 的 indexStatus。

因此“AI indexing 状态”同时存在于 Knowledge projection 和 AI index store 两个位置。

## 14. Confirmed-create operation ledger 当前模型

`KnowledgeWriteRequest` 已经正确分离：

```text
Git commit state
  Pending | Committed | Failed

Projection state
  Pending | Succeeded | Failed
```

并保存：

```text
requestId / requestHash
relativePath
commitSha?
projectionAttempts
blobSha?
markdownContent?
errors / timestamps
```

`blobSha + markdownContent` 用于 committed-but-projection-failed 的本地 replay source。

该模型的核心优点应保留：Git commit 成功与 projection 成功是两个事实。

## 15. Runtime/operations state

以下当前是基础设施 durable state，不需要重新包装成业务 aggregate：

```text
GithubWebhookDelivery
KnowledgeRepositoryLease
KnowledgeAttachmentContentCache
```

它们分别负责 webhook dedup/processing receipt、distributed worker ownership 和短期 immutable blob cache。

## 16. Application Port 当前过宽

`RepositoryApplicationPort` 同时暴露：

```text
installation setup
connection lifecycle
desktop token
reconciliation
projection browsing
attachment content
confirmed create
webhook ingress
write replay
timeline / audit
```

它作为 host facade 可工作，但对具体消费者而言 capability 边界过宽。

## 17. Legacy Prisma tables 当前边界

`repository.prisma` 仍保留早期：

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

当前运行时 knowledge module 已不再使用这些 CRUD 模型。仍可见的真实消费者主要是：

```text
data-portability legacy re-import/export
account closure integration coverage
generated Prisma surface
```

它们属于历史备份/迁移边界，不应重新成为 vNext 产品模型。

## 18. 当前问题 -> 目标方向

| 当前事实                                             | 问题                            | vNext 目标                                       |
| ---------------------------------------------------- | ------------------------------- | ------------------------------------------------ |
| Connection.status 混合 binding/provider/projection   | 状态所有权不清                  | Binding + Observation + ProjectionCheckpoint     |
| `PendingInstall` 留在 Connection                     | 与 InstallationIntent 重复      | 安装状态只归 InstallationIntent                  |
| list Query 会访问 GitHub 并写状态                    | Query/Command 混合              | background/explicit refresh + cached observation |
| `identityId` 作为 Local Vault owner 且读时 rebind    | profile/online identity 混合    | LocalProfileId + KnowledgeSpace                  |
| Local status 同时表示 lifecycle/health               | 两类状态混合                    | Binding lifecycle + LocalVaultHealth             |
| `lastSyncedCommitSha` 名字模糊                       | 实际是 remote history fence     | `lastConfirmedRemoteHeadSha`/等价明确语义        |
| `lastProjectedCommitSha` 在 Connection               | projection cursor 污染 binding  | ProjectionCheckpoint                             |
| projection id = connection + path                    | rename/move 断 durable relation | stable KnowledgeDocumentId                       |
| Repository 保存 `indexStatus`                        | 与 AI index 双真值              | AI 独占 index state                              |
| commit service + webhook service 都 apply projection | projection owner 重复           | single KnowledgeProjectionEngine                 |
| WriteRequest 保存 replay source                      | retention 未明确                | operation receipt + bounded replay payload       |
| App Port God facade                                  | capability 过宽                 | Binding/Library/Write/Operations ports           |
| legacy Repository tables 仍存在                      | 容易误认为业务真值              | 标记 legacy backup store，后续独立 retirement    |

## 19. Protected assets

后续建模和实施不得破坏：

- local-first Vault；
- GitHub login 与 knowledge authorization 解耦；
- GitHub App 最小仓库授权；
- installation intent state/hash/expiry safety；
- short-lived installation token；
- local Git commit as offline durable queue；
- no force push；
- conflict pause；
- remote history rewrite detection；
- webhook delivery dedup；
- distributed lease；
- confirmed-create idempotency；
- commit/projection 双状态；
- attachment size/integrity/cache boundary；
- server projection rebuildability；
- safe Markdown rendering；
- user-confirmed AI write proposal；
- disconnect 不删除 Local Vault/GitHub repository；
- server-held disclosure 与 portable import artifact 分离。
