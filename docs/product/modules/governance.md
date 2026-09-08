---
tags:
  - product
  - module
  - governance
description: 治理模块当前功能资产说明
created: 2026-06-02T00:00:00
updated: 2026-06-02T00:00:00
---

# 治理模块说明

> **2026-09-09 convergence notice:** ADR-109 决定将产品 Rule/RuleRevision 迁入 Knowledge Standards 后退休产品 Governance bounded context。`tools/governance` / `docs/governance` / CI engineering governance 不受影响。

## 1. 功能定位

治理模块用于管理产品内的治理规则。它围绕规则列表、规则详情、规则编辑、修订历史和治理状态形成闭环，是用户可见的治理入口。需要注意区分产品内治理功能和仓库级治理规范（docs/governance/）。

## 2. 当前功能说明

- 规则管理：创建、更新、删除和搜索治理规则。
- 规则状态管理：Draft → Active → Deprecated 状态流转。
- 规则严重度：Mandatory（强制）和 Recommended（推荐）两种级别。
- 修订历史：每次规则变更自动记录修订，包含变更字段、前后值和变更类型。
- 代码示例：每个规则可配置 good examples 和 bad examples 代码片段。
- 标签管理：为规则添加标签，支持按标签筛选。
- 搜索：支持按标题、代码、描述和标签搜索，带相关性评分和状态权重。
- 规则代码：每个规则有唯一的 code 标识符（如 ARCH-001）。
- 实时引用：每个规则可关联 live reference location（如文件路径或 URL）。
- 角色控制：创建/更新/删除操作需要 TechLead 或 Architect 角色。

## 3. 用户路径

- 规则浏览路径：用户进入治理规则列表页，通过搜索、状态筛选、严重度筛选和标签筛选查找规则，点击进入规则详情。
- 规则创建路径：用户点击新建规则，填写代码、标题、描述、严重度、标签和代码示例，保存后规则为 Draft 状态。
- 规则编辑路径：用户在规则详情页点击编辑，修改规则内容，保存后自动创建修订记录。
- 规则状态管理路径：用户将 Draft 规则激活为 Active，或将 Active 规则标记为 Deprecated。
- 修订历史路径：用户在规则详情页查看修订时间线，或进入完整修订历史页面。

## 4. 业务规则

- Rule 是治理模块核心聚合，RuleRevision 是关联实体（不可变审计记录）。
- 规则状态机：Draft → Active → Deprecated。Mandatory 规则必须先降级为 Recommended 才能废弃。Draft 不能直接到 Deprecated。
- 每次规则变更（创建、更新、废弃、重新激活）都自动创建 RuleRevision 记录。
- RuleRevision 记录变更字段、前后值、变更类型和作者，是 write-once 不可修改的。
- 搜索相关性评分：title exact > title partial > code > description > tags，Active > Draft > Deprecated。
- 规则 code 全局唯一，格式由 GOVERNANCE_VALIDATION_CONFIG 定义。
- 客户端通过 HTTP 或 IPC 适配器访问治理能力，服务端通过模块组合根装配用例和仓储实现。

## 5. 相关文件索引

详细文件清单见 [治理模块文件索引](../module-index/governance-files.md)。

## 6. 当前问题

- 产品内治理功能和仓库级治理规范（docs/governance/）不要混淆：产品内是用户可见的规则管理 UI，仓库级是开发规范文档。
- 规则编辑、修订历史和真实生效规则之间的边界需要确认：当前规则是文档性质的，不直接约束代码行为。
- 治理模块目前没有与其他模块的直接集成（如自动检查代码是否符合规则）。
- 角色控制（TechLead/Architect）的角色分配机制需要确认。

## 7. 优化机会

- 考虑治理规则与 CI/CD 的集成，自动检查代码是否符合规则。
- 为规则提供更好的组织方式（如按项目、按团队分组）。
- 强化规则的可视化和统计能力。
- 考虑规则的版本对比能力。

## 8. 风险点

- 产品内治理功能和仓库级治理规范的混淆。
- 规则编辑和修订历史的准确性。
- 规则 code 的唯一性约束。
- 角色控制的权限管理。

## 9. 后续待确认

- 治理规则是否需要与 CI/CD 集成。
- 规则的组织方式是否需要更丰富。
- 角色分配的管理机制。
- 规则的有效性评估策略。

## 10. 相关资料

- [仓库级治理规范](../../governance/README.md)
- [治理模块文件索引](../module-index/governance-files.md)
