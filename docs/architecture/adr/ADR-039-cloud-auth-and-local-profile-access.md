---
tags:
  - adr
  - architecture
  - authentication
  - desktop
  - local-first
description: Better Auth 云端认证内核与 Desktop 本地 Profile Access 分离决策
created: 2026-08-02T00:00:00
updated: 2026-09-08T23:26:00+08:00
---

# ADR-039: Cloud Auth 与 Local Profile Access 分离

**Status:** Accepted
**Date:** 2026-08-02
**Supersedes:** ADR-036 §1 及其中依赖自建 `AuthIdentity` / `AuthSession` 的实现决策

## Context

MemoFlow Desktop 同时存在本地 Profile 访问、访客身份、离线恢复、云端认证和同步授权。旧实现使用同一个认证 Session 表达这些不同事实，导致云端凭据或 guest Session 失效时，本地 Profile 也被判定为不可访问。

自建认证内核还需要持续维护密码、验证、OAuth、Session 撤销和未来的 passkey / 2FA。这些能力不是 MemoFlow 的产品差异化。

## Decision

### 1. 云端认证

- 使用 Better Auth 作为唯一云端认证内核。
- Better Auth 完整负责云端 credential、provider binding、verification 和 session。
- 删除旧 `AuthIdentity`、`AuthIdentifier`、`AuthCredential`、`AuthOAuthBinding`、`AuthSession` 和 MemoFlow JWT 登录实现，不保留运行时双轨。
- Better Auth user ID 直接作为 MemoFlow 云端 `Account.id` 和业务 `identityId`。
- Better Auth 类型只能存在于 `@memoflow/cloud-auth` 实现内部；调用方只依赖 MemoFlow contract。

### 2. Desktop 本地访问

- Desktop Profile Access 是独立 Module，不属于 Cloud Auth。
- Profile 是否可访问只由本地 Profile 选择与 Unlock 状态决定。
- guest 是持久化本地 Profile identity，不创建云端 user、token 或 session。
- 云端 Session 只决定同步和在线能力；失效时进入 `REAUTH_REQUIRED`，不得锁定或删除本地 Profile。
- guest 绑定云端账号时原子重绑本地 ownership，保持 `profileId`、目录、Vault 和业务数据不变。

### 3. 保留 ADR-036 的安全规则

- 登录邮箱真源属于 Cloud Auth，Account 只保存资料投影。
- 禁止仅按相同邮箱静默合并 OAuth identity。
- GitHub 登录身份与 GitHub Repository 授权继续分离。
- Account 关闭必须撤销云端访问，但本地 Profile 的保留或删除由明确的本地操作决定。

## Consequences

- Web、Desktop 和 API 共用一个云端身份源。
- Desktop 路由不再依赖 `isAuthenticated` 或云端 Session。
- Better Auth 升级影响集中在 `@memoflow/cloud-auth`。
- Account provisioning、PowerSync token issuance 和邮箱验证门禁必须从 Better Auth session 构建 MemoFlow `ExecutionContext`。
- 本决策允许一次性破坏性重写；不提供旧数据库或旧本地认证数据迁移。

## Enforcement

- 禁止业务 Module 导入 `better-auth`。
- 禁止 renderer 持久化 bearer token。
- 禁止 guest 创建 access token、refresh token 或 cloud session。
- 禁止使用 `cloudState` 控制本地 Task、Goal、Schedule、Reminder 或 Vault 的访问。
- 最终治理检查禁止旧 Desktop fake token/session 符号回归。

## References

- [Desktop Profile 与云端认证一次性重写](../../plan/active/2026-08-02-desktop-profile-and-cloud-auth-rewrite.md)
- [ADR-036](./ADR-036-auth-account-boundary-and-verification.md)
- [Better Auth](https://www.better-auth.com/)

## 2026-09-08 Preference ownership clarification

ADR-092/093 进一步明确：Account 不再作为 theme/language/timezone/notification preference owner。

目标：

```text
Account
= identity/profile/contact/lifecycle/security-facing metadata

User Preferences
= presentation + regional/time

NotificationPreference
= notification delivery preference
```

因此当前 `Account.settings` 是待迁移 legacy convenience bundle；在 Setting vNext cutover 完成后删除，不保留 shadow truth。

这不改变本 ADR 的核心规则：Cloud Auth 与 Desktop Local Profile Access 继续分离，guest/local profile 不因 cloud session 失效而不可访问。
