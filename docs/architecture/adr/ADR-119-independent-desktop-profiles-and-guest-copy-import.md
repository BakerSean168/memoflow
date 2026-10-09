---
tags: [adr, desktop, profile, authentication, data-portability]
description: 独立 Desktop Profile、认证目标路由与可选访客复制导入
created: 2026-10-09T00:00:00Z
updated: 2026-10-09T00:00:00Z
---

# ADR-119: Independent Desktop Profiles and Guest Copy Import

**状态：** 已采纳并实现；Linux / 本地部署验证通过，跨平台与真实云端全链路尚待实证  
**日期：** 2026-10-09  
**修订：** ADR-039 §2 的 guest 原地重绑；ADR-104 的 tenant-adoption 路径。保留 ADR-105 的认证/本地访问边界和 ADR-106 的 owner-driven V3。

## 背景

用户希望一台设备上保留多个离线资料空间和多个云端账户，快速切换，普通登录不触发资料合并；仅在空云端账户和有数据访客同时存在时提供一次导入选择。当前登录会修改云端个人资料、原地改绑访客数据库，无法同时满足独立 Profile 与保留源访客。[源码证据](../../analysis/2026-10-09-desktop-profile-current-system.md) 已确认这一差距。

## 决策

1. **认证只确定云端身份。** Better Auth 继续管理凭据、provider binding、session 和 device authorization。按其 user ID 对应的 MemoFlow `Account.id` 查找本机云端 Profile；已存在则恢复该 Profile，否则创建独立 Profile。不按邮箱或登录 provider 判断是否同一人，不隐式执行 account linking。
2. **所有 Desktop Profile 默认隔离。** 新建 guest 总是生成新本地身份与目录；启动兜底保留 ensureGuest 语义；打开/恢复/解锁均按精确 Profile ID。单活动业务运行时，切换先完成旧 owner flush/teardown，再绑定新运行时。
3. **登录不导入资料。** 删除认证路径里的 reconciliation、bind/adoption 副作用。显式选择“确认导入”才允许复制支持的业务事实。取消或跳过导入不撤销已经完成的登录。
4. **自动询问最多一次。** 仅新建的本机云端 Profile、服务端证实无用户业务数据、至少一个可导入 guest 时出现；状态持久化，既有 Profile 的重新认证不触发。无法确定云端是否为空时不自动导入。
5. **复用 V3 的格式与 owner 语义。** 不发明访客备份格式、不复制数据库改 identity、不迁移云端认证秘密。跨 Profile 协调归 Desktop host；业务 payload 校验、写入与核验归真实 owner。
6. **V1 使用服务端 apply，再由 PowerSync 下载到目标 Profile。** 源 guest 输出稳定 V3 快照；API 在空账户准入保护下执行既有 owner capability；Desktop 等待目标本地事实与服务器回执匹配。此路径只替换附件建议的“本地 apply 后上传”写入位置，保留独立容器和复制语义。该路径已实现，原子性、持久恢复和核验分别有 owner、真实 PostgreSQL 和 Desktop 测试；真实网络同步仍需验收。
7. **导入完成与源清理分开。** 默认保留源。只有用户勾选、服务端完整核验、目标本地可用、源未变化且无未处理本地独有资料时才可删除；崩溃或结果不确定一律保留。删除是本机资源清理，不产生云端业务 DELETE。

## 取舍

| 选择                              | 收益                                                   | 成本 / 不采用原因                                                                                  |
| --------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| 原地升级 guest                    | 少一次复制，保留目录                                   | 改变源身份，无法满足保留独立访客，放弃                                                             |
| 本地 V3 apply → PowerSync 上传    | 沿用 local-first 写入                                  | 需证明多 owner、不同同步覆盖、上传完成与 server manifest 关联；空账户并发仍需服务器准入，V1 未采用 |
| 服务端 V3 apply → PowerSync 下载  | 云端写入和权威核验靠近 owner，避免二次上传相同导入数据 | 仍需补跨 owner 事务/批次恢复、目标水合核验；只有联网可导入，V1 已采用                              |
| 新 Multi Session / Anonymous 体系 | Better Auth 提供相关插件                               | 浏览器多会话或云端匿名 user 与本地容器不是同一语义，当前不新增                                     |
| 多种自动合并模式和向导            | 可处理复杂冲突                                         | 增加登录决策和维护面；跨账户复杂合并继续放在通用导入/导出范围                                      |

服务端路径有独立的 preflight/commit/get 合约，全部 owner 使用同一外层 Prisma 事务。V1 通过 `public`/`mastra` 全表写入 fence 覆盖普通 SQL 和后台 writer，事务最长 15 秒，会暂时阻塞其他账户写入。这一吞吐量取舍和未来调度恢复 marker 详见[导入协议](../desktop-profile-import-protocol.md)。

## 空账户与默认资料保护

“空”指不存在 owner 定义的用户业务内容，包含可恢复的归档内容；不是注册时间短，也不是 Account/默认设置行数为零。用户修改过的云端昵称或设置可以与“业务为空”共存，因此简易导入仅填入默认/缺失的个人资料和偏好，保留用户已修改字段；有差异的源值必须计入未迁移清单并阻止自动删除。不得用邮箱前缀猜测是否默认昵称。

## 后果与边界

- 当前 session、PIN/key store、Profile Registry、owner capabilities 保留真实职责；不新增第二套认证表、通用任务平台或产品 Governance runtime。
- V1 仅支持一个运行车道绑定一个云端服务；不同服务的同名用户不视为相同身份。
- 本地 Vault、AI 消息/凭据和设备配置不能因为 ten capabilities 导出成功就被认为全部复制。
- 独立 Profile 会增加磁盘占用。V1 快照 UTF-8 上限 100,000 bytes，inventory 有行数/文件数/字节上限；写入失败保留源，没有额外磁盘预留。
- 锁定、云端退出、本地移除、云端关闭账户保持四个独立动作。
- 不提供旧版本兼容或系统升级数据迁移；本 ADR 的 guest 导入是用户发起的产品能力，不是版本迁移。
- ADR-039/104 的登录重绑/adoption 已退役；具体实现、验证及保留范围由实施计划记录。

## 关联文档

- [产品与交互规格](../../product/desktop-profiles/product-and-interaction.md)
- [导入、核验与清理协议](../desktop-profile-import-protocol.md)
- [实施和验收计划](../../plan/active/2026-10-09-desktop-independent-profiles.md)
- [官方资料与能力限制](../../analysis/2026-10-09-profile-auth-primary-sources.md)
