---
tags:
  - adr
  - repository
  - knowledge
  - identity
  - relation
  - markdown
  - vnext
description: ADR-090 - 为 Knowledge Note 建立跨 rename/move/clone 的稳定 KnowledgeDocumentId，并作为 Goal/Task/Relation durable reference
created: 2026-09-08T21:25:00+08:00
updated: 2026-09-11T00:00:00+08:00
---

# ADR-090: Stable KnowledgeDocument Identity

**状态：** 已采纳（KNOW-2002 已实施）
**日期：** 2026-09-08
**影响范围：** Repository/Knowledge、Markdown contract、Desktop/Web confirmed write、Goal/Task Relation、AI Knowledge Index、Data Portability

## 1. 决策摘要

MemoFlow 引入稳定的 `KnowledgeDocumentId`，使知识文档在文件 rename/move、Git clone、跨设备同步后仍保持同一业务身份。

**实施 checkpoint（2026-09-11）：** confirmed create 在用户确认前冻结 `kdoc_<opaque UUID>`，并将其写入 Markdown `memoflow_id`；未管理笔记保持可读/可索引且不会被静默改写。已有笔记仅可通过绑定预期 blob SHA 的显式 metadata-only CAS adoption 纳入管理，generic existing-note editor 仍被禁止。Local Vault 扫描不写盘，远端投影在 marker 删除、替换、重复或身份冲突时 fail closed 并记录 checkpoint failure。AI source/index 使用同一 stable ID；PowerSync AI 索引使用 local-only cache。后续 Goal/Task durable relation 与 ADR-091 projection-engine convergence 不属于本 ticket。

跨模块 durable relation 只引用：

```text
KnowledgeDocumentRef {
  knowledgeSpaceId
  documentId
}
```

不得引用：

```text
relativePath
path-derived projectionId
blobSha
commitSha
```

稳定 ID 采用 namespaced Markdown frontmatter：

```yaml
memoflow_id: kdoc_xxx
```

作为可随 Git/Vault 传播、可从 repository 重建的 canonical document identity marker。

## 2. 当前问题

当前 `KnowledgeNoteProjection.id` 由：

```text
sha256(connectionId + ':' + relativePath)
```

生成。

因此：

```text
notes/job-guide.md
  -> career/job-guide.md
```

会导致 projection id 改变，并在 change pipeline 中表现为：

```text
old path Deleted
new path Created/Updated
```

这对 read model 本身可以工作，但不适合作为 Goal/Task/Relation 的长期引用。

## 3. 为什么不能继续以 path 作为 identity

Path 是用户组织知识的可变属性：

- 用户会移动目录；
- Obsidian 中 rename 是正常操作；
- AI 可能建议重新分类；
- Desktop 和 Web 需要在跨设备后识别同一文档。

若 durable relation 指向 path-derived id：

```text
Goal -> Note
```

会因为一次普通 rename 失效。

因此：

```text
identity != location
```

必须成为硬约束。

## 4. Target model

```ts
interface KnowledgeDocumentRef {
  knowledgeSpaceId: KnowledgeSpaceId;
  documentId: KnowledgeDocumentId;
}

interface KnowledgeDocument {
  id: KnowledgeDocumentId;
  knowledgeSpaceId: KnowledgeSpaceId;
  currentPath: string;
  createdAt: Instant;
  lastObservedAt: Instant;
  deletedAt: Instant | null;
}
```

当前内容通过 projection 表达：

```ts
interface KnowledgeDocumentProjection {
  documentId: KnowledgeDocumentId;
  relativePath: string;
  commitSha: string;
  blobSha: string;
  contentHash: string;
  frontmatter: Record<string, unknown>;
  markdownContent: string;
  createdAt: Instant;
  updatedAt: Instant;
  deletedAt: Instant | null;
}
```

`KnowledgeDocument` 提供稳定 identity；projection 提供当前 Git state 的可重建内容。

## 5. Canonical identity marker

使用：

```yaml
memoflow_id: kdoc_<opaque-id>
```

约束：

1. `memoflow_id` 是 MemoFlow namespaced metadata；
2. ID 为 opaque，不把 path/title/provider 编码进 ID；
3. 同一 KnowledgeSpace 内唯一；
4. rename/move 不改变 ID；
5. content edit 不改变 ID；
6. copy file 时若复制出重复 ID，必须进入 conflict resolution，不静默生成 winner；
7. provider projection 不凭 path 覆盖另一个 document identity。

具体 ID 编码可使用项目现有 branded-id/UUID/ULID 机制中的一个，但编码选择不是本文核心；必须保持 opaque + unique + stable。

## 6. 新建文档

MemoFlow 创建新 Note 时：

```text
AI / user proposal
  -> proposed path/title/frontmatter/content
  -> inject/show memoflow_id
  -> user confirms final proposal
  -> Local write or Git commit
```

`memoflow_id` 必须出现在用户确认的最终 frontmatter 中，不做隐藏写入。

同一 confirmed request 重放必须复用同一个 documentId，不能每次 retry 重新生成。

## 7. Existing note adoption

现有 Vault 中没有 `memoflow_id` 的 Note：

- 继续正常浏览；
- 继续正常搜索；
- 继续参与普通 Markdown link graph；
- 可以进入 AI 临时上下文；
- 但不能直接成为 durable cross-module reference 的最终 target。

第一次需要 durable reference 时，例如：

```text
Goal -> Note
Task -> Note
Pinned long-lived knowledge reference
```

MemoFlow 执行一个显式 adoption 流程：

```text
select existing note
  -> generate stable documentId
  -> show metadata patch
  -> user confirms
  -> write memoflow_id to Markdown
  -> project stable KnowledgeDocument
  -> create relation
```

不允许在后台 silently 扫描全 Vault 并批量写 ID。

## 8. Web capability boundary

ADR-034 首期 Web 不允许任意编辑已有 Note。Stable ID adoption 是一个 **受限 metadata mutation**，不能借机开放 generic note editor。

目标 Web contract 应是专用 command，例如概念上：

```text
adoptKnowledgeDocumentIdentity(existingProjectionRef, expectedBlobSha/contentHash)
```

要求：

- authenticated owner；
- repository still authorized；
- expected base/blob/content hash 防止覆盖并发修改；
- 只允许受控 metadata patch；
- 最终仍必须形成 Git commit；
- 不能替代 generic existing-note editing policy。

如果该专用 command 未实现，Web 对未 adoption 的旧 Note 应明确提示先在 Desktop 完成稳定引用，而不是退化成 path relation。

## 9. Rename / move behavior

当 Git change 能确认同一带 `memoflow_id` 文档发生 rename/move：

```text
KnowledgeDocument.id     unchanged
currentPath              updated
Projection.relativePath  updated
Relation target          unchanged
AI index documentId      unchanged
```

不再产生“跨模块意义上的删除 + 新建”。

Projection event 可保留 location change 语义，例如：

```text
KnowledgeDocumentMoved
```

而不是只发 `Deleted(oldId) + Created(newId)`。

## 10. Duplicate ID conflict

最常见来源是用户复制 Markdown 文件并保留 frontmatter：

```text
a.md  memoflow_id: kdoc_1
b.md  memoflow_id: kdoc_1
```

系统必须：

1. 不覆盖其中任一文件；
2. 不随机挑一个 winner；
3. 标记 `DuplicateDocumentIdentity`；
4. 暂停依赖该 identity 的 durable relation resolution；
5. 提供显式 repair：保留一个 ID，给另一个分配新 ID；
6. repair 是用户可见、可审计的 metadata change。

## 11. Missing ID / removed ID

如果一个已被 durable relation 引用的 Note 的 `memoflow_id` 被用户手工删除：

- 不根据 path 重新猜成同一 document；
- relation 进入 unresolved/document-identity-missing 状态；
- UI 显示修复提示；
- 可以在用户确认后把原 documentId 恢复到该文件，前提是 identity lineage/expected content 足以安全确认。

## 12. Deletion behavior

Git 删除带 stable ID 的文档：

```text
KnowledgeDocument.deletedAt = observed deletion
Projection deleted
```

Goal/Task relation 不应被静默物理删除。Relation owner 可以把 target 显示为：

```text
Linked knowledge unavailable/deleted
```

这样保留业务历史和修复可能性。

用户显式 unlink 才删除 relation 本身。

这里描述的是 **KnowledgeDocument 作为 relation target 被删除** 的语义。GOAL-7206 中 **Goal 作为 relation source 被删除** 是另一条边界：Goal soft/permanent delete 会通过 Relation owner 的窄 cleanup port 原子 unlink 所有引用该 Goal 的 edge，但不会删除 KnowledgeDocument。Prisma/PowerSync lane 都把 Goal mutation 与 edge cleanup 放在同一个 business-database transaction 中；失败时一起回滚。

## 13. AI Index identity

AI index 从当前：

```text
resourceId = path-derived projection id
```

迁移到：

```text
documentId = KnowledgeDocumentId
contentHash = current content version
```

更新内容只更新同一 documentId 的 index version/state，不因为 rename 产生一个全新的逻辑知识对象。

## 14. Goal/Task Relation contract

Goal/Task/Shared Relation 实施必须等待本 ADR 的 stable identity 能力到位。

禁止实现：

```text
Relation.objectId = KnowledgeNoteProjection.id(path-derived)
```

为兼容当前 shared Relation `SubjectType = note`，首轮迁移目标为：

```text
SubjectRef {
  type: note
  id: KnowledgeDocumentId
}
```

其中 `note` 的业务语义升级为稳定 KnowledgeDocument reference；不再把 path-derived projection id 填入 `id`。未来若要把 discriminator 从 `note` 重命名为 `knowledge_document`，应作为独立 contract migration，而不是与 stable-id 迁移绑在一起。

## 15. Migration strategy

现有 projection 没有 stable IDs，因此不能无条件在数据库层生成 ID 后声称完成迁移。

分层迁移：

### 15.1 Existing note without durable references

保持未 adopted；继续按 projection path 浏览。

### 15.2 MemoFlow-created note

新创建链路从第一天带 stable ID。

### 15.3 Existing note becoming durable target

按 §7 adoption flow 写 metadata 后再建立 durable relation。

### 15.4 Existing future relations

如果实施 stable identity 前已经出现 path-derived durable relation，则必须提供显式 migration/repair 工具；本 ADR 不允许新代码继续制造这种 relation。

## 16. Protected contracts

- 用户 Markdown 仍可直接在 Obsidian 编辑；
- MemoFlow 不锁定自定义目录结构；
- 不 silent bulk mutate Vault；
- Web mutation 仍需 Git commit；
- confirmed proposal/metadata patch 必须幂等；
- server read model 仍可从 GitHub repository 重建；
- Goal/Task/AI 不拥有 Markdown content；
- relation unlink 不删除 Note；
- Note deletion 不静默删除业务 relation history。

## 17. 不采用的方案

### 17.1 path 继续作为 durable identity

不采用。rename/move 会破坏 relation。

### 17.2 blobSha 作为 identity

不采用。正文一改 blobSha 就变。

### 17.3 commitSha + path 作为 identity

不采用。它表示 revision/location，不表示逻辑文档。

### 17.4 只把 ID 存 server DB

不作为 canonical identity。纯 DB registry 在完全 rebuild/clone 时不能单凭 repository 内容恢复稳定文档身份。

### 17.5 silent bulk frontmatter injection

不采用。它会在没有用户意图的情况下修改大量知识资产。
