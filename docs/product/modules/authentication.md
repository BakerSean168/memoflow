---
tags:
  - product
  - module
  - authentication
  - desktop-profile
  - local-first
description: Better Auth 云端认证与 Desktop 本地 Profile Access 的当前产品边界
created: 2026-06-02T00:00:00
updated: 2026-08-03T00:00:00+08:00
---

# 云端认证与本地 Profile Access

> **ADR-111 cutover policy (2026-09-09):** 当前没有需要保留的 MemoFlow 旧业务数据，也不要求兼容旧客户端/旧备份。本文历史推演中仅为旧数据保存设计的 migration/backfill/compatibility window 不再执行；目标模型和真实行为不变量继续有效。实施采用 direct canonical cutover + old-surface deletion + reset/reseed。

> **2026-09-09 vNext notice:** ADR-105 保留 Better Auth 单一云端认证权威，并进一步固定 Account lifecycle / Auth enforcement / Desktop Profile Access 三轴边界。

## 1. 模块边界

MemoFlow 不再使用一个“登录状态”同时表示本地数据访问、访客身份和云端同步资格。

| 事实                  | 真源                   | 决定的能力                         |
| --------------------- | ---------------------- | ---------------------------------- |
| 本地 Profile 是否打开 | Desktop Profile Access | Desktop 本地业务、Vault 和设置访问 |
| 云端用户是谁          | Better Auth            | Web 访问、云端 Account 和在线能力  |
| Profile 是否连接云端  | `CloudBinding`         | 当前 Profile 对应的云端 tenant     |
| 云端会话是否有效      | Better Auth session    | 同步、云端 AI 和远程仓库连接       |

云端 session 失效只会把 Profile 置为 `REAUTH_REQUIRED`，不得锁定、删除或重建本地 Profile。

## 2. 云端认证

`@memoflow/cloud-auth` 以固定版本 Better Auth 作为唯一云端认证内核，负责：

- 邮箱密码注册和登录；
- 邮箱验证链接；
- 密码重置链接和密码修改；
- GitHub OAuth（Web）；
- session 创建、查询、撤销和过期；
- Web cookie transport；
- Desktop bearer transport。

Better Auth user ID 直接作为 MemoFlow 云端 `Account.id` 和业务 `identityId`。业务模块不能导入 Better Auth 类型，只能消费 MemoFlow 的 `CloudPrincipal` 和 contracts。

Web GitHub 登录与 GitHub Knowledge Repository 授权是两套独立权限。登录 OAuth 只证明身份；仓库连接继续使用 Repository 模块的 GitHub App installation/token。

Desktop 当前只提供已经闭环的邮箱认证。GitHub 登录不暴露 Desktop IPC；未来只有在实现安全的 app protocol 或 loopback callback 后才能开放。

## 3. Desktop Profile Access

Desktop 以 Profile 为启动入口：

```text
选择最近 Profile
→ device key 或本地 PIN 解锁
→ 打开 Profile 数据库和 Vault
→ 进入主页面
→ 后台独立检查 cloud session
```

Profile 使用三个不混用的标识：

| 标识             | 语义                                   |
| ---------------- | -------------------------------------- |
| `profileId`      | 永久稳定的本地容器、目录和密钥命名空间 |
| `localOwnerId`   | 未绑定云端时本地业务数据 owner         |
| `cloudAccountId` | Better Auth 云端用户和同步 tenant      |

本地锁定与云端退出是两个独立命令：

- **Lock Profile**：关闭本地运行时并清除内存解锁 key，保留云端绑定和凭据。
- **Sign out cloud**：撤销/删除云端 session 并停止同步，本地 Profile 保持打开。

## 4. 访客 Profile

访客是持久化本地用户，不是临时认证 session：

- 首次启动生成随机 `profileId`、`localOwnerId`、昵称和头像 seed；
- 创建真实本地 Account row；
- 不创建 access token、refresh token 或 cloud session；
- 可以离线编辑昵称、头像、简介、语言、主题和业务数据；
- 侧栏显示持久化访客昵称，不显示“未登录”；
- 只有同步和云端能力需要注册或登录。

## 5. Guest 到云端账号

访客在当前 Profile 内完成在线认证后执行 tenant adoption：

1. 拒绝目标账号已绑定其他本机 Profile 的静默合并；
2. 在 PowerSync 本地数据库事务内更新全部 `identity_id` 表和 Account 主键；
3. 表范围从 `PowerSyncAppSchema` 自动派生，新增 identity-owned 表不会漏入；
4. 将 registry entry 重绑为 registered Profile；
5. 保持 `profileId`、目录、key envelope 和 Vault 路径不变；
6. 保存 profile-scoped cloud credential 并启动首次同步。

## 6. 状态和能力

Profile 云端状态只有：

- `UNBOUND`：访客或未绑定云端；
- `ONLINE`：session 有效且云端可达；
- `OFFLINE`：有可信 session，但当前网络/服务不可达；
- `REAUTH_REQUIRED`：session 缺失、过期、撤销或账号不匹配。

本地业务路由只依赖 Profile unlock。同步、云端 AI 和仓库连接分别依赖 capability，不得复用含混的 `isAuthenticated` 作为 Desktop 准入条件。

## 7. 安全边界

- renderer 不持久化 bearer token；
- cloud credential 由 Electron main process 按 Profile 加密存储；
- Profile key 由系统凭据存储保护，本地 PIN 只解封 key；
- PIN 保护的 Profile 不能通过省略 PIN 绕过；
- guest 永远没有伪 token/session；
- 云端密码变化或 session 撤销不能锁死本地数据；
- 第一版不承诺 SQLite/Vault 全盘加密，全盘静态加密属于独立项目。

## 8. 验证状态

当前实现已经覆盖：

- Better Auth contract、邮箱链接、Account provisioning、关闭账号后的 API 拒绝；
- Desktop PIN 防绕过、Profile registry、guest adoption、云端退出与本地锁定分离；
- 生产 Electron 旅程中的离线 guest 首次启动、资料编辑、锁定/重新打开、Profile 目录不变和进程重启恢复；
- local-docker 下真实 Better Auth 注册/验证/登录与核心 Web 产品旅程，Playwright 结果为 7/7；
- API、Web、Desktop、PowerSync 的 prod-like 容器启动与健康检查。

机器可读的 local-docker 旅程证据位于 `reports/local-deploy-validation/local-docker-playwright-evidence.json`（本地生成，不提交）。

## 9. 相关资料

- [ADR-039: Cloud Auth 与 Local Profile Access 分离](../../architecture/adr/ADR-039-cloud-auth-and-local-profile-access.md)
- [Desktop Profile 与云端认证一次性重写](../../plan/archive/2026-08-02-desktop-profile-and-cloud-auth-rewrite.md)
- [认证模块文件索引](../module-index/authentication-files.md)
- [ADR-034: 本地 Obsidian Vault 与可选 GitHub 知识仓库](../../architecture/adr/ADR-034-obsidian-vault-repository.md)
