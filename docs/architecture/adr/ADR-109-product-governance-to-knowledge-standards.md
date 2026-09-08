---
tags: [adr, governance, knowledge, standards, retirement]
description: 将产品 Governance Rule/RuleRevision 收敛为 Knowledge Standards 文档，保留工程 Governance 基础设施
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-09T00:31:00+08:00
---

# ADR-109: Product Governance to Knowledge Standards

**状态：** 已采纳，待实施
**日期：** 2026-09-09
**依赖：** ADR-089~091

## Critical distinction

```text
Engineering Governance
= tools/governance + docs/governance + CI/oracles/registries
= KEEP

Product Governance
= Rule + RuleRevision + /governance UI/API/IPC
= MIGRATE TO KNOWLEDGE, THEN RETIRE
```

## Decision

个人编码/架构规范是知识内容，而不是需要独立 DB bounded context 的业务事实。迁移为 Knowledge Standards。

### Canonical representation

Knowledge Markdown + stable `KnowledgeDocumentId` + frontmatter，例如：

```yaml
memoflow_id: kdoc_xxx
memoflow_kind: standard
standard_code: ARCH-001
standard_status: active
standard_severity: recommended
tags: [architecture]
```

正文表达 description / good examples / bad examples / references。Git history 替代 RuleRevision。

`memoflow_kind` 是 Knowledge frontmatter convention，不意味着 Knowledge core 需要为所有文档建立 closed enum Aggregate；未知 kind 仍可作为普通 Markdown 浏览。

### Migration

1. create deterministic migration manifest for each Rule;
2. resolve target path without overwrite, recommended `standards/<code-slug>.md`;
3. preserve code/title/status/severity/tags/examples/reference/author provenance;
4. assign stable KnowledgeDocumentId;
5. commit migration through Knowledge write/change engine;
6. compare rule count and content manifest;
7. switch `/governance/**` to Knowledge standards view/deep-link resolver;
8. remove product Rule/Revision package/runtime/persistence.

### Authorization

现有 TechLead/Architect gate 不迁移为 Knowledge business rule。Knowledge write authorization follows normal user ownership. Future team policy/role features require a separate Collaboration/Organization design.

### Deletion after migration

- `packages/governance` product package and contracts;
- Vue governance module/routes/store/query cache;
- Rule/RuleRevision Prisma/PowerSync;
- Governance HTTP/IPC host composition;
- mock handlers and product locales/tests.

### Explicitly protected

Engineering governance tools/docs/CI must continue unchanged except references that used product Governance as a sample implementation; those references must be replaced by a real maintained module before package deletion.
