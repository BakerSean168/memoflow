---
tags:
  - architecture
  - index
description: 架构文档入口
created: 2026-04-13T00:00:00
updated: 2026-10-07T00:00:00Z
---

# 架构入口

`docs/architecture` 只保留长期有效的架构入口、ADR 和少量总览说明，不承担实现百科、迁移进度或阶段性计划。

## 当前入口

- [`../standards/architecture.md`](../standards/architecture.md)：长期有效的架构规则
- [`adr/README.md`](./adr/README.md)：正式 ADR 索引与编号规则
- [`external-agent-gateway.md`](./external-agent-gateway.md)：External Agent Gateway 提案；owner capabilities、MCP、OAuth/PAT、可靠写入与 assisted workflow（未实施）
- [`ci-cd-platform-v2.md`](./ci-cd-platform-v2.md)：CI/CD Platform V2 的既有控制面与稳定契约
- [`delivery-platform-v3.md`](./delivery-platform-v3.md)：Delivery Platform V3 的目标状态机、candidate/staging/release/production 边界
- [`release-lifecycle-v3.md`](./release-lifecycle-v3.md)：Release Please、Server candidate、跨平台 Desktop 与 production selection 契约
- [`cross-platform-desktop-release.md`](./cross-platform-desktop-release.md)：Windows/Linux/macOS x64+arm64 Desktop 发布契约
- [`../governance/README.md`](../governance/README.md)：仓库治理来源、检查方式与文档约定

## 使用方式

- 需要看规则是什么：先看 `docs/standards`
- 需要看为什么这样定：看 ADR
- 需要确认当前真实边界：看 `project.json`、配置文件、实现代码和测试

## 不在这里维护的内容

- 分阶段迁移计划
- 与代码重复的一次性实现说明
- 模块级的长篇操作手册

## 产品时间

- [ADR-037 产品时间体系](./adr/ADR-037-product-time-system.md)
- [ADR-038 Goal 聚合一致性与可靠 Task 贡献](./adr/ADR-038-goal-consistency-and-reliable-task-contributions.md)
- [产品时间体系详设](./product-time-system.md)
