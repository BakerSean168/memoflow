---
tags:
  - product
  - module
  - account
  - desktop-profile
description: Account 业务资料、Desktop 本地 Profile 投影与 Cloud Auth 边界
created: 2026-06-02T00:00:00
updated: 2026-09-19T00:00:00+00:00
---

# Account 模块

> **ADR-111 cutover policy (2026-09-09):** 当前没有需要保留的 MemoFlow 旧业务数据，也不要求兼容旧客户端/旧备份。本文历史推演中仅为旧数据保存设计的 migration/backfill/compatibility window 不再执行；目标模型和真实行为不变量继续有效。实施采用 direct canonical cutover + old-surface deletion + reset/reseed。

> **当前 canonical state（2026-09-19）：** ADR-104、AUTH-1501/1502 与 SETTING-9203~9209 已完成。Account 只拥有 Product Profile + `Active | Closed` lifecycle；Better Auth 独占登录身份，Setting/Notification 各自拥有偏好。`Account.settings`、Account auth-email shadow 与兼容投影已删除。

## 1. 功能定位

Account 是用户资料和生命周期的业务聚合，不负责密码、OAuth、Session、本地 Profile 解锁或跨模块偏好。

| 事实                             | 真源                                 |
| -------------------------------- | ------------------------------------ |
| 登录邮箱、验证状态、云端 Session | Better Auth / `@memoflow/cloud-auth` |
| 昵称、真实姓名、头像、简介、性别和生日 | Account                         |
| 外观、区域和跨设备用户偏好       | Setting / `UserPreferenceRecord`    |
| 通知投递偏好                     | Notification                      |
| Desktop 当前打开哪个本地容器     | Desktop Profile Access               |
| Profile 是否连接云端 Account     | `CloudBinding`                       |

Better Auth user ID 直接作为云端 `Account.id` 和业务 `identityId`，不再保留平行 `AuthIdentity` 映射。

## 2. Desktop 语义

Desktop guest Profile 创建真实的本地 Account row，因此访客可以离线查看和修改 Account profile；语言、主题、时区等跨设备偏好由 Setting owner 管理，通知投递偏好由 Notification owner 管理。Profile Registry 的持久化显示名与本地 Account 初始昵称保持一致。

guest 连接云端账号时，tenant adoption 会保留 `profileId`、Profile 目录、Vault、key envelope 和本地显示资料，只把业务 owner 原子重绑为云端 `Account.id`。目标云端账号已经绑定其他本机 Profile 时拒绝静默合并。

本地 Profile 是否可访问只由 Profile unlock 决定。云端 Session 失效不会删除 Account、本地资料或业务数据。

Desktop 的 Account 资料先事务性写入当前 Profile 数据库。registered Profile 同时在该事务内合并一条 revision outbox；有可用 cloud session 时异步推送，离线或失败时保留待办，且只删除已经成功交付的 revision。Account 不从 PowerSync 下载覆盖本地 Profile 投影。

## 3. Cloud 语义

Cloud Auth 创建用户后，由 `CloudAccountProvisioner` 幂等创建同 ID 的 Account。Cloud Auth 是登录邮箱、邮箱验证状态和 session 的唯一真源；AccountView 通过只读 `CloudIdentitySummary` 组合展示身份，不在 Account persistence 中保存登录邮箱 shadow。

Account HTTP API 提供：

- 获取当前云端 Account；
- 更新资料；
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

## 5. Data Portability V3 owner boundary

Account 提供 `account-profile@3` owner capability。portable payload 只包含六个用户拥有的资料字段：`nickname`、`realName`、`avatarUrl`、`bio`、`gender`、`birthday`。

host identity、Account 记录、auth 状态、lifecycle 状态、版本/时间戳和凭据均不属于可移植资料。导入必须针对已经存在的 host Account；`account-profile@3` 不创建 Account，也不恢复身份、认证、生命周期、版本/时间戳或凭据。

## 6. 当前边界

Account 同时服务 Web 云端运行时和 Desktop 本地运行时。Desktop 的 Profile/云端资料协调必须走显式应用服务，不能依赖含混的 `isAuthenticated` 或伪本地 Session。

Account profile、lifecycle 与 Cloud Auth identity projection 已完成收敛；Setting、Notification 与 Data Portability 通过各自 owner contract 提供能力，Account 不再提供 settings compatibility surface。

## 7. 相关资料

- [云端认证与本地 Profile Access](./authentication.md)
- [ADR-039: Cloud Auth 与 Local Profile Access 分离](../../architecture/adr/ADR-039-cloud-auth-and-local-profile-access.md)
- [账户模块文件索引](../module-index/account-files.md)
- [Data Portability 模块说明](./data-portability.md)
- [设置模块说明](./setting.md)
