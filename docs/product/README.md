---
tags:
  - product
  - index
description: 业务功能资产文档入口
created: 2026-06-02T00:00:00
updated: 2026-08-25T17:13:00+08:00
---

# 业务功能资产

`docs/product` 维护当前产品功能的轻量资产底图，服务后续业务优化、功能重构和模块升级。

这里不替代代码、测试、ADR 或开发指南。文档与实现冲突时，以当前代码、配置和测试为准。

## 当前入口

- [功能地图](./feature-map.md)：核心模块、功能点、业务目标和盘点状态。
- [目标模块说明](./modules/goal.md)：目标模块当前功能、用户路径、业务规则和风险点。
- [目标模块文件索引](./module-index/goal-files.md)：目标模块相关页面、接口、领域代码、数据结构和测试入口。
- [任务模块说明](./modules/task.md)：任务模块当前功能、用户路径、业务规则和风险点。
- [任务模块文件索引](./module-index/task-files.md)：任务模块相关页面、接口、领域代码、数据结构和测试入口。
- [日程模块说明](./modules/schedule.md)：日程模块当前功能、用户路径、业务规则和风险点。
- [日程模块文件索引](./module-index/schedule-files.md)：日程模块相关页面、接口、领域代码、数据结构和测试入口。
- [提醒模块说明](./modules/reminder.md)：Reminder 当前实现资产、用户路径、业务规则和风险点；迁移期间作为现状基线。
- [Routine Coach vNext](./routine-coach-vnext.md)：Reminder 向 AI-native 习惯节律 / 健康干预 / 专注协议领域演进的 North Star、真实场景推演与目标模型。
- [提醒模块文件索引](./module-index/reminder-files.md)：提醒模块相关页面、接口、领域代码、数据结构和测试入口。
- [通知模块说明](./modules/notification.md)：通知模块当前功能、用户路径、业务规则和风险点。
- [通知模块文件索引](./module-index/notification-files.md)：通知模块相关页面、接口、领域代码、数据结构和测试入口。
- [AI 模块说明](./modules/ai.md)：AI 模块当前功能、用户路径、业务规则和风险点。
- [AI 模块文件索引](./module-index/ai-files.md)：AI 模块相关页面、接口、领域代码、数据结构和测试入口。
- [桌面工作区与 UI 说明](./workspace-ui.md)：单导航、分栏几何、窄态、缩放与 UI primitive 规则。
- [资源库模块说明](./modules/repository.md)：资源库模块当前实现、本地 Vault、可选 GitHub 同步和 Web 快捷创建边界。
- [资源库模块文件索引](./module-index/repository-files.md)：资源库模块相关页面、接口、领域代码、数据结构和测试入口。
- [编辑器模块说明](./modules/editor.md)：编辑器模块当前实现，以及安全预览、新笔记确认和 Obsidian 外部编辑后的职责收缩。
- [编辑器模块文件索引](./module-index/editor-files.md)：编辑器模块相关页面、接口、领域代码、数据结构和测试入口。
- [账户模块说明](./modules/account.md)：账户模块当前功能、用户路径、业务规则和风险点。
- [账户模块文件索引](./module-index/account-files.md)：账户模块相关页面、接口、领域代码、数据结构和测试入口。
- [认证模块说明](./modules/authentication.md)：认证模块当前功能、用户路径、业务规则和风险点。
- [认证模块文件索引](./module-index/authentication-files.md)：认证模块相关页面、接口、领域代码、数据结构和测试入口。
- [设置模块说明](./modules/setting.md)：设置模块当前功能、用户路径、业务规则和风险点。
- [设置模块文件索引](./module-index/setting-files.md)：设置模块相关页面、接口、领域代码、数据结构和测试入口。
- [治理模块说明](./modules/governance.md)：治理模块当前功能、用户路径、业务规则和风险点。
- [治理模块文件索引](./module-index/governance-files.md)：治理模块相关页面、接口、领域代码、数据结构和测试入口。

## 使用方式

- 做业务优化前，先看功能地图确认模块边界。
- 进入具体模块前，先看模块说明确认当前用户路径和业务规则。
- 准备改代码前，再看文件索引确认影响范围。
- 如果要记录“为什么这么改”，使用 `docs/plan` 写执行计划，长期架构决策写 ADR。

## 维护原则

- 只记录会帮助决策的事实，不写流水账。
- 优先链接现有代码和文档，不重复抄实现细节。
- 每个模块至少说明功能定位、当前能力、用户路径、关键规则、相关代码、当前问题、优化机会和风险点。
- 第一版可以轻量，但必须标清待确认事项。
