---
tags: [product, desktop, profile, index]
description: 独立 Profile、多云端账户和访客复制导入系列文档入口
created: 2026-10-09T00:00:00Z
updated: 2026-10-09T00:00:00Z
---

# 独立 Desktop Profile 与访客复制导入

**状态：独立 Profile、访客复制导入、恢复与核验后清理已实现，并通过 Linux Electron E2E、真实 PostgreSQL 与本地部署验证；跨平台、真实云端全链路及主工作区集成尚待验收。** 本系列基于 2026-10-09 用户提供的账户体系讨论及当前代码复核。已实现范围和验收证据以实施计划为准。

产品原则：添加云端账户打开独立 Profile；只有云端没有业务数据且本机有可导入访客资料时，才主动询问一次。源 Profile 默认保留，自动删除必须同时取得完整性与本地可用证据。

## 阅读顺序

1. [当前实现与设计差距](../../analysis/2026-10-09-desktop-profile-current-system.md)：代码证据、已存在的基础设施、具体缺陷与复用限制。
2. [一手资料核验](../../analysis/2026-10-09-profile-auth-primary-sources.md)：Better Auth、PowerSync 与六类成熟产品的可借鉴范围。
3. [ADR-119](../../architecture/adr/ADR-119-independent-desktop-profiles-and-guest-copy-import.md)：独立容器、身份路由和复制导入的取舍。
4. [产品与交互规格](./product-and-interaction.md)：创建、切换、认证、一次性询问、错误和管理入口。
5. [导入、核验与清理协议](../../architecture/desktop-profile-import-protocol.md)：数据范围、接口、并发、幂等、状态与删除条件。
6. [实施与验收计划](../../plan/active/2026-10-09-desktop-independent-profiles.md)：依赖切片、代码落点、验收矩阵、发布条件和未决项。

## 相比原讨论进一步明确的内容

- 当前 V3 不导出 Vault 笔记，AI 只导出会话外壳；界面不承诺完整笔记/聊天记录迁移。
- 导入有持久 operation 和加密本机 journal；Goal/Task/AI 等使用稳定批次和引用映射，已提交恢复不重新 apply。
- 简易导入在服务器原子应用 V3，再同步下载；保留复制语义，不在目标本机重复 apply。
- “空账户”不意味着用户从未改昵称或偏好；这些云端自定义值必须保护。
- “同步正常”不等于导入完整。删除条件需要服务端 manifest、目标本地可用性、源未变化和无遗留内容。

既有契约的核心身份用语见[项目词汇表](../../../CONTEXT.md)。源码、测试和验证结果记录在实施计划；测试矩阵同时包含基础功能与后续导入能力，不表示全部完成。
