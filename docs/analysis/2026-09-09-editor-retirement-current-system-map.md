---
tags: [analysis, editor, retirement]
description: 已退役 Editor runtime 与剩余 Prisma/PowerSync/Data Portability compatibility residue 地图
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-09T00:31:00+08:00
---

# Editor Retirement Current-System Map

## 1. Executive finding

Editor 已经不是一个当前产品模块。`@memoflow/editor`、Vue editor module、API runtime、Desktop runtime 和 `/note/:id` 编辑路径已经删除。知识编辑事实源已迁到 Obsidian/Vault/GitHub。

当前仍存在的 editor 资产几乎全部是 **portable backup compatibility residue**。

## 2. Runtime status

不存在：

- `packages/editor`；
- `packages/app-vue/src/modules/editor`；
- first-party Editor HTTP API；
- Editor Desktop IPC runtime；
- `/note/:id` in-app editor。

当前知识相关 UI 是 Repository/Knowledge 工作区 + safe Markdown preview + Obsidian external edit / confirmed Web write。

## 3. Remaining residues

- Prisma: `EditorWorkspace`, `EditorWorkspaceSession`, `EditorWorkspaceSessionGroup`, `EditorWorkspaceSessionGroupTab`；
- Account relations to those models；
- PowerSync schema/table mapping/normalization；
- natural-key preparation script；
- Data Portability projection/importer/contracts/tests；
- compatibility comments and historical docs。

## 4. Why keeping them is now harmful

- 用户无法从当前产品创建这些 workspace facts；
- 导入旧 backup 可以重新创建一批没有 runtime consumer 的 rows；
- 每次 schema/PowerSync/Data Portability 变更都继续支付维护成本；
- 它让文档和代码误以为 Editor 仍是当前 capability。

## 5. Target

Editor retirement closure:

```text
Data Portability V3
  -> no Editor capability in new backups
  -> legacy V2 editor payload = explicit ignored/unsupported migration policy

then
  drop editor_* tables
  remove PowerSync mappings
  remove Account relations
  remove natural-key scripts/tests
  remove portable editor importer/exporter
```

Safe Markdown rendering and external editor launch are **Knowledge/UI capabilities**, not an Editor bounded context.
