---
tags:
  - adr
  - architecture
  - authentication
  - account
  - security
description: Auth 与 Account 边界、验证挑战、会话与注销级联决策
created: 2026-07-17T00:00:00
updated: 2026-07-17T23:59:00
---

# ADR-036: Auth / Account 边界与验证安全模型

**Status:** Superseded by [ADR-039](./ADR-039-cloud-auth-and-local-profile-access.md)
**Date:** 2026-07-17  
**Context:** 自建认证与账户双模块、多端 session、邮箱验证与密码找回、OAuth 与访客路径并存。

## Context

MemoFlow 已在 monorepo 中自建：

- `@memoflow/authentication`：`AuthIdentity`、凭证、OAuthBinding、`AuthSession`、JWT
- `@memoflow/account`：资料、偏好摘要、联系方式投影；经 `auth:identity-created` 自动创建
- 全域业务数据以 `identityId` 为租户键（含 PowerSync）
- Web / Desktop / Mobile 共享 contracts

同时存在产品与实现张力：

1. 注册后身份为 `Unverified`，但邮箱验证 API 与门禁未闭环。
2. 登录邮箱存在于 Auth Identifier 与 Account `ContactEmail` 两侧，可能漂移。
3. 密码找回服务端骨架已存在（6 位码 + `IEmailSender`），但邮件生产化、限流、前端入口与旧计划中的「链接令牌 / 新路径」叙述不一致。
4. 注销仅关闭 Account，未禁用 Auth、未撤销 session。
5. 业界有 Better Auth / Logto / Keycloak 等成熟方案，但整库替换会冲击 `identityId`、多端与 PowerSync。

需要一份决策，固定**边界、真源、验证与找回形态、以及不做什么**。

## Decision

### 1. 不替换认证内核

- **不**引入 Better Auth、Auth.js、Logto、Keycloak、Clerk 等作为主身份源。
- **保留**自建 `AuthIdentity` + MemoFlow 签发的 access/refresh session。
- 开源项目用于：**流程规格**（验证/重置/linking）与**可替换零件**（SMTP/API 发信、Redis challenge、限流库），不引入第二套 User 表。

### 2. 模块边界与真源

| 关注点 | 权威模块 | 说明 |
| --- | --- | --- |
| 能否认证 / 登录 | Authentication | `AuthIdentity.status` + 锁定字段 |
| 登录标识符（邮箱/手机）及其验证 | Authentication | `AuthIdentifier.isVerified` |
| 凭证与 OAuth binding | Authentication | 密码、GitHub subject 等 |
| 会话 | Authentication | `AuthSession`；业务 API 只认 MemoFlow token |
| 昵称/头像/简介等资料 | Account | 不拥有登录权威 |
| 资料卡展示用联系邮箱 | Account | **Auth 主邮箱的投影**，事件同步 |
| 扩展键值/设备级偏好 | Setting | 不承载登录安全状态 |

硬规则：

1. **登录邮箱真源 = Authentication**。Account 不得提供独立的「改登录邮箱且立即生效」权威路径。
2. Account 更新资料时，不得静默改写与 Auth 不一致的登录邮箱语义。
3. **能否登录不单独看** `Account.status`；注销必须同时禁用 Auth 并撤销全部 session（见 §5）。

### 3. 邮箱验证策略

采用 **注册后验证（post-registration verification）**：

1. `POST /api/v1/auth/register` 可继续创建 identity 与 session（兼容现网与 e2e）。
2. 新身份默认 `Unverified`，邮箱标识符 `isVerified=false`。
3. 通过统一 challenge 发送与校验验证码；成功则 `verifyEmailIdentifier` + 按策略 `activate()`。
4. Unverified 用户的业务门禁：白名单接口（如 me、send-code、verify、logout、refresh）可访问；敏感操作可返回 `EMAIL_VERIFICATION_REQUIRED`（具体名单在实施计划中维护，默认偏宽松以保转化）。

### 4. 统一 Verification Challenge（验证码 / 令牌）

密码重置、邮箱验证、后续绑邮箱等共用同一抽象（名称可实现为 `IVerificationChallengeStore`）：

| purpose | 用途 |
| --- | --- |
| `PasswordReset` | 忘记密码 |
| `EmailVerify` | 注册后验证主邮箱 |
| `EmailBind` / `EmailChange` | 已登录绑定或换绑（换绑可分期） |

约束：

- 仅存储 **challenge 的哈希**；明文只在签发时返回给发信通道。
- 默认 TTL 约 10 分钟；发送冷却、日上限、失败次数上限可配置。
- 成功消费即失效；生成使用 CSPRNG（禁止 `Math.random`）。
- Dev：内存实现；Prod：Redis 或 DB。
- **交付形态**：第一版以 **6 位码** 为主（对齐现有 `ForgotPassword` / `ResetPassword` 契约）。邮件中的魔法链接可作为同 challenge 的第二投递方式，不另起互不兼容的令牌体系。

### 5. 密码找回

- **路径与契约以现网为准**：`POST /api/v1/auth/password/forgot`、`POST /api/v1/auth/password/reset`（`email + code + newPassword`）。
- **不**新建平行的 `/authentication/password-recovery/*` 作为第二套 API，除非未来整体 version 迁移并删除旧路径。
- 安全语义对齐主流实践：
  - 请求重置不泄露邮箱是否存在（统一成功语义）
  - 限流（IP + 邮箱摘要）
  - 重置成功后撤销该 identity 全部 refresh session
  - 新密码复用注册密码复杂度规则
- 生产发信与 challenge 强化属于 authentication 安全闭环的一部分，与邮箱验证共享基础设施。
- 前端「忘记密码」入口仅在链路可测、可配置完成后开放（含本地 mail 捕获或 console 策略下的 e2e）。

旧独立计划 `docs/plan/archive/2026-07-16-password-recovery.md` **作废**，内容归档至同一路径，实施并入 `docs/plan/archive/2026-07-17-auth-account-security-closure.md`。

### 6. 注销级联

用户关闭账户时必须编排：

1. `AuthIdentity` → `Disabled`（或等价不可登录状态）
2. 撤销该 identity 全部 session
3. `Account` → 关闭/停用
4. 审计事件

禁止只软删 Account 而仍可用密码登录。

### 7. 跨模块同步方式

遵循 ADR-033：

- **通知式投影**（邮箱已验证、邮箱变更、身份禁用影响资料）：领域事件 + Account handler。
- **需要原子编排**（注销）：应用层同步调用 Auth + Account 端口（宿主或 Account close use case 注入 Auth 能力），不依赖「发事件碰运气」。

建议事件（实施时可微调命名）：

- `auth:identity-created`（已有）→ 创建 Account  
- `auth:email-verified` → Account 投影 verify  
- `auth:email-changed` → Account 更新展示邮箱  
- `auth:identity-disabled` → Account 停用（若注销未同步调用时的兜底）

### 8. OAuth 与账号链接

- GitHub 登录只解决「是谁」，签发 MemoFlow session；**不**用 GitHub token 访问业务 API（延续产品文档 / ADR-034）。
- **禁止**仅因邮箱相同而静默合并两个 identity（防账号劫持）。
- 链接已有账号必须：已登录后显式 bind，或明确的确认流。
- 完整 authorize / state / PKCE / UI 按安全闭环计划 Phase D 实施；仓库 Contents 授权仍属 Repository。

### 9. 访客（Desktop）

- 访客是本地 profile，不创建服务端 AuthIdentity。
- 升级在线账号时重绑 ownership，不移动 Vault 文件（产品文档既定）。
- 升级失败不得破坏本地 profile。

## Rationale

1. **identityId 已是全域租户键** — 替换 IdP 的成本远高于补齐验证/发信。  
2. **Auth/Account 拆分符合**「凭证 vs 资料」主流心智，问题在同步与级联，不在拆分本身。  
3. **统一 challenge** 避免验证邮箱、重置密码、绑邮箱各造一套存储与限流。  
4. **保留现网 forgot/reset 路径** 避免契约双轨；旧「链接令牌新 API」计划与代码冲突，应归档而非并行实施。  
5. **注册后验证** 兼容当前注册即登录，并允许逐步加门禁。  
6. **注销级联** 是安全底线，与「Account 只是资料」不矛盾：资料关闭不能代替禁用登录。

## Consequences

### 正面

- 实施焦点清晰：零件化发信/challenge + 接线领域已有方法。
- 与密码找回、邮箱验证、后续绑邮箱共享一套基础设施。
- 文档与代码路径对齐，减少「计划写一套、代码另一套」。
- 为 OAuth linking、访客升级留出不破坏内核的扩展面。

### 负面 / 成本

- 需维护 Auth→Account 投影一致性（事件/handler 与测试）。
- 双状态（Auth vs Account）需要文档与 UI 文案解释（「账户已关闭」vs「无法登录」应一致呈现）。
- 自建认证需持续承担安全清单（限流、哈希、审计），不能假设框架默认替你做完。
- 第一版 6 位码 UX 与「邮件魔法链接」相比，桌面深链体验略弱；可用「码 + 可选链接」增强。

### 明确拒绝

- 整包迁移到外部 Auth 产品作为主源（除非未来单独立项「身份中台」并废弃自建 identity）。
- Account 模块单独实现登录邮箱验证权威。
- 平行的 password-recovery 新 API 与旧 API 长期双轨。
- 按邮箱静默自动合并账号。

## Migration & Enforcement

1. **计划**：以 `docs/plan/archive/2026-07-17-auth-account-security-closure.md` 为唯一实施真源；密码找回旧计划已归档。  
2. **代码顺序**：通用 challenge + 邮件端口 → 加固 forgot/reset + 邮箱验证 → 注销级联 → OAuth 完整流 → 访客升级。  
3. **契约**：优先扩展现有 `/api/v1/auth/*`，新增 email send/verify；重置保持 `password/forgot|reset`。  
4. **测试**：challenge 单测；验证/重置重放与枚举防护；注销后 login/refresh 失败；关键 e2e。  
5. **产品文档**：`docs/product/modules/authentication.md` 与 `account.md` 在实施后同步「真源与投影」表述。

## References

- ADR-010 / ADR-017 集中 contracts  
- ADR-023 / ADR-025 / ADR-031 服务端形态与组合  
- ADR-030 Result 模式  
- ADR-033 跨模块通信  
- ADR-034 GitHub 登录与仓库授权分离  
- `docs/product/modules/authentication.md`  
- `docs/product/modules/account.md`  
- `docs/plan/archive/2026-07-17-auth-account-security-closure.md`  
- `docs/plan/archive/2026-07-16-password-recovery.md`（已废）  
- 现网：`ForgotPasswordUseCase`、`ResetPasswordUseCase`、`IEmailSender`、`IPasswordResetCodeStore`
