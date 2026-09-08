---
tags: [adr, editor, retirement, data-portability]
description: 物理退休 legacy Editor workspace persistence 和 portable compatibility shell
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-09T00:31:00+08:00
---

# ADR-107: Legacy Editor Persistence Retirement

**状态：** 已采纳，待实施
**日期：** 2026-09-09
**依赖：** ADR-034, ADR-089~091, ADR-106

## Decision

Editor bounded context 已退休，不创建 vNext Editor module。

### Keep

- Knowledge safe Markdown preview；
- properties/internal links/embed/attachment rendering；
- confirmed new-note/write proposal UI；
- Desktop `obsidian://` / file-manager external edit capability。

这些能力分别属于 Knowledge 或 UI/device surface。

### Delete after V3 cutover

```text
EditorWorkspace
EditorWorkspaceSession
EditorWorkspaceSessionGroup
EditorWorkspaceSessionGroupTab
editor_* PowerSync tables/mappings
editor natural-key preparation scripts
PortableEditorData
editor exporter/importer/adapters/tests
Account editor relations
```

### Legacy import behavior

V2 backups containing `editor` receive an explicit migration warning that this retired workspace UI state is not restored. No new empty editor rows are created.

## Acceptance

- no production/runtime import of `@memoflow/editor` (already true);
- no `editor_*` tables in final Prisma/PowerSync schema;
- Data Portability V3 contains no Editor capability;
- Knowledge create/preview/external-edit journeys remain green.
