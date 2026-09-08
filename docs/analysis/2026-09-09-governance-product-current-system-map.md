---
tags: [analysis, governance, knowledge, standards]
description: 产品 Governance Rule/Revision 与仓库工程 Governance 的真实边界及 Knowledge 收敛分析
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-09T00:31:00+08:00
---

# Product Governance Current-System Map

## 1. Two unrelated meanings currently share the word Governance

### Repository engineering governance

`tools/governance/**`, `docs/governance/**`, architecture locks, CI oracles, registries and test inventory are MemoFlow 工程质量基础设施。它们真实、重要、必须保留。

### Product Governance

`packages/governance` 是一个用户可见的“编码规范规则库”：

```text
Rule
├── code
├── title/description
├── severity
├── status Draft/Active/Deprecated
├── tags
├── goodExamples[] / badExamples[]
├── liveReferenceLocation?
└── author

RuleRevision[]
```

它有 Prisma/PowerSync、HTTP/IPC、完整 Vue list/detail/editor/history routes。

## 2. Why the product module is structurally questionable

Repository history documents explicitly describe Governance as a **reference module / 业务虚构** used to demonstrate DDD and transport architecture.

The product rules are documentation-like and do not enforce code. Their revision history duplicates Git-backed Knowledge history. Their tags duplicate knowledge frontmatter/label-like metadata. Their examples are Markdown/code-content semantics.

Now that Knowledge vNext provides:

- Markdown as user-owned truth;
- Git history;
- stable `KnowledgeDocumentId`;
- frontmatter;
- AI index/RAG;
- confirmed write flows;

maintaining a second database-backed document/revision product for coding standards is unnecessary complexity.

## 3. Authorization mismatch

Mutating HTTP routes require `TechLead` or `Architect`, but MemoFlow is primarily a personal product and no first-class user-facing role administration corresponding to this feature was found. This is another sign that the module originated as a reference/enterprise-shaped example rather than current product truth.

## 4. Target: Knowledge Standards

Preserve the useful user intent—personal coding/architecture standards—but represent it as Knowledge documents.

Recommended frontmatter convention:

```yaml
memoflow_id: kdoc_xxx
memoflow_kind: standard
standard_code: ARCH-001
standard_status: active
standard_severity: recommended
tags:
  - architecture
```

Markdown body can contain:

````text
# Rule title
Description
## Good examples
```ts
...
````

## Bad examples

```ts
...
```

## References

...

```

Git history replaces RuleRevision as the durable revision source. Knowledge AI indexing makes standards directly usable by Assistant/agents without a special Governance integration.

## 5. Migration requirements

Before deleting product Governance:

1. export every existing Rule deterministically to a Knowledge standard document;
2. preserve code/title/severity/status/tags/examples/live-reference and provenance;
3. write through confirmed Knowledge operation / migration tooling, never silently overwrite an existing path;
4. verify migrated counts/content hashes;
5. redirect `/governance/**` to the Knowledge standards surface or preserve compatible deep links through a resolver during one migration window;
6. only then drop Rule/RuleRevision tables, PowerSync tables, API/IPC/client/UI package surfaces.

## 6. Do not conflate this with repository governance

Deleting the product Governance bounded context must not remove or weaken:

- `pnpm governance:check`;
- architecture-surface locks;
- dual/time registries;
- docs governance;
- CI Governance Oracle;
- engineering standards documents.
```
