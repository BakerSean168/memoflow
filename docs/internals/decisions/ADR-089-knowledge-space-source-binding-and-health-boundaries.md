---
tags:
  - adr
  - repository
  - knowledge
  - obsidian
  - github
  - vnext
description: ADR-089 - 以 KnowledgeSpace 为逻辑边界，拆分 Local/Remote Binding、Health/Observation 与 Sync/Projection cursor
created: 2026-09-08T21:25:00+08:00
updated: 2026-09-11T00:02:00+08:00
---

# ADR-089: KnowledgeSpace、Source Binding 与 Health/Observation Boundary

**状态：** 已采纳（已实施 — 2026-09-11）
**日期：** 2026-09-08
**影响范围：** Repository/Knowledge、Desktop、GitHub App、Web Settings、Data Portability、Goal/Task Knowledge Context

## 1. 决策摘要

MemoFlow 不恢复旧 `Repository` aggregate，而是引入一个轻量逻辑 `KnowledgeSpace`，并把当前 `LocalVaultBinding.status` 与 `KnowledgeRepositoryConnection.status` 中混合的多类状态拆开。

目标：

```text
KnowledgeSpace
├── LocalVaultBinding
│   └── LocalVaultHealth
│
├── KnowledgeRemoteBinding
│   └── RemoteRepositoryObservation
│
├── RemoteHistoryFence
└── KnowledgeProjectionCheckpoint
```

核心原则：

```text
Binding = 用户长期选择
Health / Observation = 外部世界当前事实
Sync fence = Git 历史安全游标
Projection checkpoint = 服务端投影游标
```

四者不得继续共用一个 `status`。

### 1.1 Implementation checkpoint — 2026-09-11

本 ADR 已完成 canonical cutover：

- Local Vault binding 由稳定 `localProfileId + KnowledgeSpaceId` 拥有，filesystem 可用性是独立 `LocalVaultHealth`；读取不再写 owner/status/timestamp，旧 schemaVersion 1 不迁移。
- Remote 侧删除混合 `KnowledgeRepositoryConnection.status/error/cursor` 真值，改为 `KnowledgeRemoteBinding + RemoteRepositoryObservation + RemoteHistoryFence + KnowledgeProjectionCheckpoint`。
- 普通 list Query 只读持久化 observation/checkpoint，不触发 GitHub I/O；Provider 检查通过显式 refresh / webhook / reconciliation / security preflight 更新。
- Provider 失效只使 observation `Blocked`，不等于用户 disconnect；用户主动 disconnect 才写 `disconnectedAt`。
- Desktop Local/Remote 必须共享同一个 `KnowledgeSpaceId`；continuous sync 必须同时满足 Provider Ready + history fence。
- Prisma 与 server-held disclosure 均已切到四轴结构；Remote Knowledge 不在 PowerSync/Desktop 建第二份持久真值。

## 2. 当前事实

当前实现已经完成 ADR-034 的主方向：Local Vault 为 Desktop 可写事实源/工作副本；GitHub repository 是可选远端提交日志；server Markdown projection 是可重建 read model。

但当前：

```text
LocalVaultBinding.status
= Active | Missing | Unreadable | Detached
```

同时混合用户 binding lifecycle 与 filesystem health。

`KnowledgeRepositoryConnection` 更进一步混合：

```text
binding lifecycle
GitHub authorization/repository health
Desktop sync cursor
server projection cursor
provider error
projection error
```

`listKnowledgeRepositoryConnections()` 还会在普通 Query 中调用 GitHub 并持久化 lifecycle patch。

## 3. KnowledgeSpace

首期定义：

```ts
interface KnowledgeSpace {
  id: KnowledgeSpaceId;
  createdAt: Instant;
  updatedAt: Instant;
}
```

它只提供稳定逻辑知识空间身份，不要求 cloud `IdentityId`。ownership 由所在 host 的 binding/认证边界承担：Local Vault 由 `localProfileId` 绑定，Remote Binding/Server projection 由在线 `identityId` scope。这样符合 ADR-039：guest 可以只有本地 profile，不需要 cloud user/session。

它不拥有：

```text
Markdown content
attachments
Git history
AI embeddings
Goal/Task relations
worker state
```

首期产品约束：

```text
one local profile
-> one primary KnowledgeSpace
-> <= 1 active Local Vault binding

one cloud-connected KnowledgeSpace
-> <= 1 active remote knowledge binding
```

这与当前产品文档和 Desktop auto-sync 的单一 eligible connection 假设保持一致。

如果未来真的需要多个 KnowledgeSpace，再显式扩展，而不是让同步器在多个 connection 中隐式选择。

## 4. LocalVaultBinding

目标：

```ts
interface LocalVaultBinding {
  id: LocalVaultBindingId;
  knowledgeSpaceId: KnowledgeSpaceId;
  localProfileId: LocalProfileId;
  rootPath: string;
  displayName: string;
  boundAt: Instant;
  detachedAt: Instant | null;
}
```

### 4.1 为什么使用 LocalProfileId

本地 Vault 的物理绑定属于 Desktop profile，不等同于在线 account identity。

当前为了 Guest -> Login 升级而在 `getBinding(identityId)` 读取时重写 `identityId`，会使“谁登录了”与“这个本地 profile 绑定哪个目录”混淆。

目标行为：

```text
Guest profile -> 登录/注册
localProfileId 不变
Vault 不移动、不重绑
KnowledgeSpace owner identity 可完成升级映射
```

而切换到另一个真实 Desktop profile 时，不应因为一次 read 自动取得前一个 profile 的 Vault ownership。

### 4.2 LocalVaultHealth

文件系统可用性是 observation：

```ts
interface LocalVaultHealth {
  bindingId: LocalVaultBindingId;
  state: 'Available' | 'Missing' | 'Unreadable';
  observedAt: Instant;
  detail?: string;
}
```

`Detached` 不属于 Health。

### 4.3 `obsidianVaultId`

当前生产 runtime 始终写 `null` 且没有真实消费者。vNext 不把它作为 canonical business field。以后若 Obsidian CLI/registry 提供稳定能力，可作为 optional observation/capability metadata 新增。

## 5. KnowledgeRemoteBinding

目标：

```ts
interface KnowledgeRemoteBinding {
  id: KnowledgeRemoteBindingId;
  knowledgeSpaceId: KnowledgeSpaceId;
  identityId: IdentityId;
  provider: 'GitHub';
  installationId: string;
  repositoryId: string;
  repositoryFullNameSnapshot: string;
  connectedAt: Instant;
  disconnectedAt: Instant | null;
}
```

Binding 只表示：

> 用户把这个 GitHub repository 选为该 KnowledgeSpace 的远端来源。

用户主动 disconnect：

```text
binding.disconnectedAt = now
```

而不是把 provider 侧失效也映射成同一种 `Revoked`。

## 6. RemoteRepositoryObservation

目标 observation：

```ts
interface RemoteRepositoryObservation {
  bindingId: KnowledgeRemoteBindingId;
  observedAt: Instant;
  accountId: string;
  repositoryFullName: string;
  defaultBranch: string;
  private: boolean;
  archived: boolean;
  disabled: boolean;
  contentsPermission: 'read' | 'write' | 'none';
  installationSuspended: boolean;
  eligibility: { state: 'Ready' } | { state: 'Blocked'; reason: RemoteRepositoryBlockReason };
}
```

建议 block reason：

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

Observation 是外部 provider 当前事实，不等同于用户删除 binding。

## 7. Query/Refresh 边界

普通 read：

```text
GET knowledge binding/workspace
-> read local binding + latest observation/checkpoint
```

不默认因为打开 UI 就：

```text
call GitHub
-> mutate binding status
```

Observation 更新入口：

```text
GitHub webhook
background reconciliation
explicit refresh
security-sensitive command preflight
```

UI 应可显示 observation age，例如 `checkedAt`。

安全敏感 command（发 token、push、create commit）仍必须实时或足够新地重新验证 provider 权限；本 ADR 不用 stale observation 替代授权检查。

## 8. InstallationIntent 保持独立

现有：

```text
Pending -> CallbackReceived -> Finalized -> Consumed
Expired = expiresAt derived
```

继续作为 GitHub App install orchestration state。

`KnowledgeRemoteBinding` 只在 finalized installation + user selected repository 之后建立，因此删除 Connection 上的 `PendingInstall` 语义。

## 9. Remote history fence

当前 `lastSyncedCommitSha` 的真正作用是 remote history rewrite guard，而不是完整 device sync state。

目标语义：

```text
RemoteHistoryFence
├── bindingId
├── defaultBranch
├── lastConfirmedRemoteHeadSha
└── confirmedAt
```

具体最终存储可以内联到 sync state，但 contract/business naming 必须反映“最后确认的安全 remote HEAD”。

Local Git HEAD、working tree、origin refs、rebase state 继续由 Desktop Git runtime 判断。

## 10. Projection checkpoint 独立

`lastProjectedCommitSha` 归 projection pipeline：

```ts
interface KnowledgeProjectionCheckpoint {
  bindingId: KnowledgeRemoteBindingId;
  branch: string;
  projectedCommitSha: string | null;
  state: 'Ready' | 'Lagging' | 'Rebuilding' | 'Failed';
  failure?: { code: string; message: string } | null;
  lastAttemptAt: Instant | null;
  projectedAt: Instant | null;
}
```

Projection failure 不再把 remote binding 整体写成 `Error`。

## 11. Protected contracts

实施不得破坏：

- GitHub login 与 knowledge authorization 解耦；
- InstallationIntent state/hash/TTL；
- private repository + contents write requirement；
- short-lived repository-scoped token；
- Desktop local-first/offline commit queue；
- no force push；
- rebase conflict pause；
- history rewrite detection；
- disconnect 不删除本地 Vault/GitHub repository；
- server projection 仍可重建。

## 12. Migration outline

实施时按单轨迁移，不长期保留 old/new public dual：

1. characterization 当前 LocalVaultBinding/Connection status 行为；
2. 建立 KnowledgeSpaceId 与 local profile ownership；
3. 建立 RemoteBinding + Observation；
4. 把 `lastSyncedCommitSha` 迁移成明确 remote history fence；
5. 把 `lastProjectedCommitSha` 迁移到 ProjectionCheckpoint；
6. 更新 UI/read model；
7. 删除 `PendingInstall/Active/Suspended/Revoked/Error` 作为单一 Connection status contract；
8. 删除 Query-side lifecycle mutation。

已有值必须可解释地迁移；不能简单按旧 status 一对一复制到一个新 enum。

## 13. 不采用的方案

### 13.1 恢复大型 Repository Aggregate

不采用。Markdown/Git 已经提供权威内容和历史，大 aggregate 只会制造第三个事实源。

### 13.2 一个 status 继续承载全部问题

不采用。用户 binding、provider availability、sync history、projection failure 是独立状态轴。

### 13.3 list Query 每次实时刷新并写 lifecycle

不作为默认模型。安全敏感 command 仍实时校验，但普通 read 应读取 observation。

### 13.4 首期支持多个自动同步 remote repository

不采用。当前产品没有真实多空间需求，auto-sync 也已经假定单 eligible connection。
