---
tags:
  - product
  - module
  - account
  - desktop-profile
description: Account 业务资料、Desktop 本地 Profile 投影与 Cloud Auth 边界
created: 2026-06-02T00:00:00
updated: 2026-08-03T00:00:00+08:00
---

# Account 模块

> **ADR-111 cutover policy (2026-09-09):** 当前没有需要保留的 MemoFlow 旧业务数据，也不要求兼容旧客户端/旧备份。本文历史推演中仅为旧数据保存设计的 migration/backfill/compatibility window 不再执行；目标模型和真实行为不变量继续有效。实施采用 direct canonical cutover + old-surface deletion + reset/reseed。

> **2026-09-09 vNext notice:** ADR-104 决定 Account 收敛为 Product Profile + Lifecycle；当前 `Account.settings` 与登录邮箱投影仍是实现事实，待 Setting/Auth cutover 后退休。

## 1. 功能定位

Account 是用户资料和偏好的业务聚合，不负责密码、OAuth、Session 或本地 Profile 解锁。

| 事实                             | 真源                                 |
| -------------------------------- | ------------------------------------ |
| 登录邮箱、验证状态、云端 Session | Better Auth / `@memoflow/cloud-auth` |
| 昵称、头像、简介和 Account 设置  | Account                              |
| Desktop 当前打开哪个本地容器     | Desktop Profile Access               |
| Profile 是否连接云端 Account     | `CloudBinding`                       |

Better Auth user ID 直接作为云端 `Account.id` 和业务 `identityId`，不再保留平行 `AuthIdentity` 映射。

## 2. Desktop 语义

Desktop guest Profile 创建真实的本地 Account row，因此访客可以离线查看和修改昵称、头像、简介、语言、主题、时区和通知设置。Profile Registry 的持久化显示名与本地 Account 初始昵称保持一致。

guest 连接云端账号时，tenant adoption 会保留 `profileId`、Profile 目录、Vault、key envelope 和本地显示资料，只把业务 owner 原子重绑为云端 `Account.id`。目标云端账号已经绑定其他本机 Profile 时拒绝静默合并。

本地 Profile 是否可访问只由 Profile unlock 决定。云端 Session 失效不会删除 Account、本地资料或业务数据。

Desktop 的 Account 资料先事务性写入当前 Profile 数据库。registered Profile 同时在该事务内合并一条 revision outbox；有可用 cloud session 时异步推送，离线或失败时保留待办，且只删除已经成功交付的 revision。Account 不从 PowerSync 下载覆盖本地 Profile 投影。

## 3. Cloud 语义

Cloud Auth 创建用户后，由 `CloudAccountProvisioner` 幂等创建同 ID 的 Account。Cloud Auth 是登录邮箱和邮箱验证状态的真源，Account 只保存业务使用的联系邮箱投影。

Account HTTP API 提供：

- 获取当前云端 Account；
- 更新资料和设置；
- 检查昵称或邮箱可用性；
- 关闭云端 Account。

Web 使用 Better Auth cookie session，Desktop 在线能力使用 main process 持有的 bearer session。业务模块不直接导入 Better Auth 类型。

## 4. 核心规则

- guest 必须拥有可持久化编辑的本地 Account，不使用 renderer mock。
- 本地 Profile identity、云端 Account identity 和 Better Auth session 是不同概念。
- 登录邮箱变更必须由 Cloud Auth 流程完成，不能通过 Account 资料更新暗改登录凭据。
- Cloud sign-out 只暂停在线能力，不等于锁定 Profile、删除 Account 或删除本地数据。
- Close cloud account 与 Remove local Profile 是两个独立且需要明确确认的操作。
- Close cloud account 只关闭服务端 Account 并断开当前 cloud connection；本地 Profile、Vault 和业务数据保留。关闭后的 Account 不能继续调用受保护业务 API。
- HTTP、IPC、Prisma 和 PowerSync adapter 必须遵守同一 Account 聚合规则和 identity 隔离。

## 5. 当前边界

Account 同时服务 Web 云端运行时和 Desktop 本地运行时。Desktop 的 Profile/云端资料协调必须走显式应用服务，不能依赖含混的 `isAuthenticated` 或伪本地 Session。

账户设置与独立 Setting 模块的职责仍按现有 contracts 划分；跨模块合并不属于本次认证重写。

## 6. 相关资料

- [云端认证与本地 Profile Access](./authentication.md)
- [ADR-039: Cloud Auth 与 Local Profile Access 分离](../../architecture/adr/ADR-039-cloud-auth-and-local-profile-access.md)
- [账户模块文件索引](../module-index/account-files.md)
- [设置模块说明](./setting.md)
