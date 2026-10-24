---
tags:
  - plan
  - archive
  - authentication
  - account
  - security
  - web
  - desktop
description: Auth 与 Account 收敛、邮箱验证、会话安全与注销级联的统一实施方案
created: 2026-07-17T00:00:00
updated: 2026-07-29T00:00:00
status: done
---

> **归档结果（2026-07-29）**：ADR-036 已采纳；Phase A–E 源码闭环（challenge、邮箱验证、会话、OAuth、访客升级）。  
> 投递通道 A–D 见 [`./2026-07-28-transactional-email-smtp.md`](./2026-07-28-transactional-email-smtp.md)（SMTP/Resend/Redis challenge）。  
> 残余运维：生产域名 SPF/DKIM、全量 e2e 真跑——不阻塞本 plan 归档。

# Auth + Account 收敛与安全闭环实施方案

## 1. 文档地位

状态：**实施中**（ADR-036 已采纳；A–D + Phase C 会话增强 + Phase E 访客升级 ownership 重绑已源码闭环；auth e2e 规格含 OAuth；待本机/CI 真跑 e2e 与生产发信）。

本文汇总并固化以下讨论结论：

- 不引入 Better Auth / Logto / Keycloak 作为主身份源；保留自建 `AuthIdentity` + MemoFlow session。
- 开源方案用于**流程规格与零件复用**（发信、限流、OTP 存储），不用于替换全域 `identityId`。
- 优先做「安全与一致性闭环」，再补 OAuth 完整流、访客升级等产品入口。

### 1.1 与现有计划的关系

| 计划                                                                                        | 关系                                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~密码找回独立计划~~                                                                        | **已归档**：[`archive/2026-07-16-password-recovery.md`](../archive/2026-07-16-password-recovery.md)；能力并入本文 Phase A/B，契约以现网 `/password/forgot | reset` 为准 |
| [Web 登录与注册页面后续优化](./2026-07-15-web-auth-page-optimization.md)                    | 前端入口整理；邮箱验证场景与错误码与本文契约对齐                                                                                                          |
| [Obsidian Vault 与 GitHub 知识仓库](./2026-07-16-obsidian-vault-repository-optimization.md) | GitHub **登录**与 **仓库授权**分离；OAuth 登录完整流在本文 Phase D，仓库连接仍归 Repository                                                               |
| [authentication 产品说明](../../product/modules/authentication.md)                          | 目标态与差距的产品真源                                                                                                                                    |
| [account 产品说明](../../product/modules/account.md)                                        | 资料与状态职责                                                                                                                                            |

### 1.2 配套 ADR

已采纳：[ADR-036 Auth / Account 边界与验证安全模型](../../architecture/adr/ADR-036-auth-account-boundary-and-verification.md)。

冻结要点：登录邮箱真源=Auth；Account 邮箱为投影；注销级联；统一 challenge；密码找回走现网路径；禁止静默合并账号；不替换认证内核。

---

## 2. 现状摘要（以代码为准）

### 2.1 已有且应保留

- `AuthIdentity` / Identifier / PasswordCredential / OAuthBinding / `AuthSession`
- 邮箱密码注册、登录、改密；密码重置 use case + `IEmailSender` + 内存 code store（开发占位）
- `AuthenticationProvider` 可插拔 + `AuthenticateUseCase` + GitHub provider 骨架
- `auth:identity-created` → Account 自动创建
- access/refresh JWT、refresh hash、session list/revoke API
- 多端 contracts + HTTP/IPC
- 领域预埋：`Unverified`、`EmailIdentifier.isVerified`、`verifyEmailIdentifier`、`activate`

### 2.2 主要缺口

| 缺口                       | 表现                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------- |
| 邮箱验证未闭环             | 注册即发 token；无 send/verify API；Unverified 不门禁                                  |
| 双邮箱 / 双验证状态        | Auth Identifier 与 Account `ContactEmail` 可漂移                                       |
| 注销不完整                 | `closeAccount` 只改 Account，不禁登录、不撤 session                                    |
| 邮件与限流                 | `ConsoleEmailSender`；无系统化限流                                                     |
| OTP 存储偏弱               | 内存、明文码、`Math.random`；多实例不可用                                              |
| OAuth 产品流               | callback 骨架有；授权发起、state/PKCE、UI、绑定页未齐                                  |
| 账号链接                   | 同邮箱多 identity 风险未产品化处理                                                     |
| 访客升级                   | Desktop 有访客；升级在线账号未闭环                                                     |
| 会话安全增强               | ~~缺 reuse detection 与设备元数据~~ **已补齐**（reuse 全撤 + device 元数据 + 会话 UI） |
| AccountSettings vs Setting | 偏好双源风险                                                                           |

### 2.3 明确不做（本计划范围外）

- 替换认证框架或外置 IdP 为主源
- 短信 OTP 生产化、2FA/WebAuthn（可占位隐藏）
- 企业 SSO / 多租户组织
- Account 与 Setting 大合并（仅约定边界，见 Phase A）

---

## 3. 目标架构

### 3.1 职责边界

```text
Authentication（安全真相）
  - 登录方式、凭证、OAuth binding
  - 会话签发/撤销
  - 邮箱/手机作为登录标识符及其验证
  - 身份生命周期：Unverified / Active / Locked / Disabled

Account（业务画像）
  - 昵称、头像、简介等 profile
  - 业务侧状态：Active / Suspended / Deactivated
  - 联系方式展示投影与通知偏好摘要
  - 不拥有「改登录邮箱」的独立权威

Setting（扩展配置）
  - 键值、设备级、实验开关
  - 不承载登录安全状态
```

### 3.2 状态主从

| 问题                            | 权威                               |
| ------------------------------- | ---------------------------------- |
| 能否通过密码/OAuth 拿到 session | `AuthIdentity.status` + lock 字段  |
| 业务上是否视为正常用户资料      | `Account.status`                   |
| 登录邮箱是否已验证              | `AuthIdentifier(Email).isVerified` |
| 资料卡上显示的邮箱              | Account 投影；默认跟随 Auth 主邮箱 |

规则：

- `Account.status = Deactivated` **不能单独**阻止登录，除非同时 `AuthIdentity = Disabled`（注销流程保证两者一致）。
- 验证邮箱成功：`verifyEmailIdentifier` +（若尚无 Active 且满足策略）`activate()`，并发布事件同步 Account。

### 3.3 邮箱验证产品策略（已定）

采用 **注册后验证（策略 B）**：

1. `POST /register` 仍可创建 identity + session（兼容现状与 e2e）。
2. 身份保持 `Unverified`，邮箱 `isVerified=false`。
3. 注册成功后服务端可异步/同步触发发送验证码（失败不阻断注册响应，但要可重发）。
4. 前端进入验证场景或全局 banner；敏感 API 可返回 `EMAIL_VERIFICATION_REQUIRED`。
5. 验证成功 → 标识符 verified + identity Active + Account 投影同步。

第一版使用 **6 位验证码**（与现网 reset 形态一致）；魔法链接可作为同 challenge 的可选投递方式，不另建平行令牌体系。

### 3.4 通用验证码 / 令牌模型

将 `IPasswordResetCodeStore` 提升为通用端口（名称示例）：

```text
IVerificationChallengeStore
  issue({ purpose, subject, identityId? }) -> plaintextChallenge  // 仅返回一次
  consume({ purpose, subject, challenge }) -> boolean
  // 存储：hash(challenge), expiresAt, attempts, lastIssuedAt
```

| purpose         | 用途                          |
| --------------- | ----------------------------- |
| `EmailVerify`   | 注册后验证主邮箱              |
| `EmailBind`     | 已登录绑定新邮箱              |
| `EmailChange`   | 换绑（可要求 old+new 两次）   |
| `PasswordReset` | 密码找回（现网 forgot/reset） |

约束：

- TTL 默认 10 分钟；发送冷却 60s；日上限可配置（如 10/邮箱/天）
- 失败次数上限后作废
- 成功即消费；存储只存 hash
- 生成使用 `crypto.randomInt`（禁止 `Math.random`）
- 单机 dev：内存实现；prod：Redis 或 DB 表

### 3.5 邮件端口

扩展 `IEmailSender`（或拆 `ITransactionalEmailSender`）：

- `sendPasswordResetCode(...)` — 密码找回
- `sendEmailVerificationCode(...)` — 邮箱验证
- 实现（已落地投递通道）：
  - **本地 / CI / local-docker 默认**：`ConsoleEmailSender`（`EMAIL_PROVIDER=console`）+ `LOCAL_VALIDATION` 取码
  - **生产 / 真发**：**通用 SMTP**（`SmtpEmailSender` + `EMAIL_PROVIDER=smtp`）或可选 **Resend HTTP**（`EMAIL_PROVIDER=resend`）；可选第二 SMTP 热备
  - 工厂：`createEmailSender(env)`；**禁止**仅用 `NODE_ENV` 推断 provider
- 本地可测：console capture / dual-write；真发以收件箱为准
- **投递 SSOT**：[`2026-07-28-transactional-email-smtp.md`](./2026-07-28-transactional-email-smtp.md)；运维指南：[`docs/guides/development/transactional-email-smtp.md`](../../guides/development/transactional-email-smtp.md)
- Challenge 多副本：`AUTH_CHALLENGE_STORE=redis` + `RedisVerificationChallengeStore`（默认仍 memory）

### 3.7 密码找回（并入本计划，非独立文档）

- API：**现网** `POST /api/v1/auth/password/forgot`、`POST /api/v1/auth/password/reset`（`ForgotPasswordSchema` / `ResetPasswordSchema`）。
- 不新增平行 `/password-recovery/*` 路径（旧归档计划中的路径作废）。
- purpose = `PasswordReset` 的 challenge；重置成功撤销全部 session（use case 已有，迁移 store 后保持）。
- 前端入口在 B1 完成验收前保持隐藏（与 web-auth 优化计划一致）。
- 可选增强：邮件内同时附带带 token 的链接，解码后仍走同一 `consume` 语义。

### 3.6 领域事件（跨模块同步）

| 事件                      | 消费方           | 行为                                                                   |
| ------------------------- | ---------------- | ---------------------------------------------------------------------- |
| `auth:identity-created`   | Account（已有）  | 创建 Account                                                           |
| `auth:email-verified`     | Account（新增）  | `ContactEmail.verify()` / 对齐 address                                 |
| `auth:email-changed`      | Account（新增）  | 更新投影邮箱                                                           |
| `auth:identity-disabled`  | Account（新增）  | 关闭/停用 Account                                                      |
| `account:close-requested` | Auth（新增编排） | disable identity + revoke sessions（或由应用服务同步调用，不必纯事件） |

实施可选 **应用服务同步编排**（注销）+ **事件投影**（邮箱），避免分布式事务复杂度。

---

## 4. API 契约草案

Base：`/api/v1/auth`（与现网一致）。  
所有错误码进入 contracts，前端可翻译。

### 4.1 邮箱验证

| 方法 | 路径               | 鉴权 | Body（要点）                                               | 成功                                            |
| ---- | ------------------ | ---- | ---------------------------------------------------------- | ----------------------------------------------- |
| POST | `/email/send-code` | 可选 | `{ email?, purpose: EmailVerify\|EmailBind\|EmailChange }` | 统一 200，防枚举（Verify 场景对未知邮箱也 200） |
| POST | `/email/verify`    | 可选 | `{ email, code, purpose }`                                 | 200；已登录可刷新 identity DTO                  |

规则摘要：

- `EmailVerify`：邮箱必须已绑定到某 identity；码正确则 verify+activate
- `EmailBind`：必须登录；邮箱全局未占用；绑定未验证标识符后发码，或 send 时写入 pending
- `EmailChange`：必须登录；建议 Phase B 再做完整双码

### 4.2 账户安全只读摘要（建议）

扩展现有 `GET /api/v1/auth/me` 或新增字段：

```text
identity.status
identifiers[].{ type, valueMasked, isVerified }
hasPassword, hasOAuth
emailVerification: { required: boolean, emailMasked?: string }
```

Account `GET /api/v1/accounts/me` 继续只返回资料；前端「账户安全」页组合两个读模型，或后续做 BFF 聚合（非必须）。

### 4.3 注销级联

`POST /api/v1/accounts/me/close` 行为升级为应用编排：

1. 校验登录与确认口令/二次确认（若契约已有）
2. `AuthIdentity` → `Disabled`（或等价）
3. `removeAllByIdentityId` 撤销 session
4. `Account.close()`
5. 审计事件

不得仅软删 Account。

### 4.4 OAuth（Phase C，与产品文档对齐）

| 能力               | 说明                                         |
| ------------------ | -------------------------------------------- |
| 授权发起           | 生成 authorize URL + state/PKCE 存储         |
| callback           | 已有路径完善校验                             |
| 已登录 bind/unbind | 账户安全页；禁止静默按邮箱合并               |
| 冲突               | 返回 `ACCOUNT_LINK_REQUIRED`，引导登录后链接 |

---

## 5. 实施阶段与 PR 切片

### Phase A — 边界与基础设施（ADR 已完成；代码零件）

**目标**：邮件/challenge 可测；密码重置与邮箱验证共用底座。

1. ~~起草 ADR-036~~ → **已采纳**
2. 通用 `IVerificationChallengeStore`（purpose 含 `PasswordReset` / `EmailVerify` / …）+ 内存实现 + 单测（hash、TTL、冷却、消费、CSPRNG）
3. 扩展 `IEmailSender`（重置 + 验证模板）；`ConsoleEmailSender` / 本地 mail 捕获
4. 将现有 `ForgotPassword` / `ResetPassword` **迁到**新 store（**保持** `POST /api/v1/auth/password/forgot|reset` 与 `email+code+newPassword` 契约，不另开 `/password-recovery/*`）
5. 稳定错误码：`EMAIL_VERIFICATION_REQUIRED`、`INVALID_OR_EXPIRED_CODE`、`RATE_LIMITED` 等
6. 限流中间件（IP + 邮箱摘要），forgot 与 send-code 共用策略

**验收**

- [x] ADR-036 已采纳
- [x] challenge store 单测覆盖过期/重放/冷却（`in-memory-verification-challenge-store.spec.ts`）
- [x] forgot/reset 行为兼容且测试通过；未知邮箱统一成功语义（`forgot-reset-password.test.ts`）
- [x] 重置成功仍撤销全部 session

### Phase B — 密码找回前端 + 邮箱验证闭环 + 投影同步 + 门禁

**目标**：找回密码入口可开放；注册后邮箱验证可用。

#### B1. 密码找回（承接已归档独立计划的产品验收）

1. Web/Desktop：请求重置页 + 输入邮箱验证码 + 新密码页（字段级反馈、i18n、无障碍）
2. 仅当后端 challenge/邮件策略可用时展示「忘记密码」入口（能力探测或部署开关）
3. E2E：请求 → 读码（console/mailpit）→ 重置 → 旧密码失效 → 新密码登录 → 令牌/码重放失败
4. Desktop 可与 Web 同契约；深链可选后续增强

#### B2. 邮箱验证

1. Contracts：`SendEmailCodeSchema` / `VerifyEmailCodeSchema`
2. Use cases：`SendEmailVerificationCode`、`VerifyEmailCode`
3. Routes + controller + application port + module wiring
4. Client HTTP/IPC + RPC map
5. 验证成功：`verifyEmailIdentifier` + `activate` + `auth:email-verified`
6. Account handler：同步 `ContactEmail`
7. 门禁策略：敏感路由对 Unverified 返回 403（白名单：me、send-code、verify、logout、refresh、password/*）
8. 前端：注册后验证场景、重发倒计时、Unverified banner

**验收**

- [~] 忘记密码完整链路 e2e 规格已写并纳入默认 playwright match；待 CI/本地跑通后再视为验收完成
- [x] 注册 → 发码 → 验码 → Active 且 Account.email verified（后端 use case + Account handler + Web 验证场景；`email-verification.test.ts` 绿）
- [x] 错误码可翻译；防枚举；authentication 聚焦单测绿（gate/forgot-reset/email-verification/routes）；Web validation + auth-web-service 绿；account 投影 handler 待扩展覆盖

### Phase C — 注销级联、会话增强、双源收敛

**目标**：安全闭环与一致性。

1. ~~Close account 编排（Auth disable + sessions + Account）~~ **已完成**
2. ~~禁止客户端直接改「登录邮箱」绕过 Auth（Account update 接口收紧）~~ **已完成**（`UpdateAccountSchema` 仅 profile 字段）
3. ~~Refresh token reuse detection~~ **已完成**（active session hash 不匹配 → `removeAllByIdentityId`）
4. ~~登录写入更完整 deviceInfo（UA/平台，能取则取）~~ **已完成**（`Context.device` + `AuthSession.start` 合并元数据）
5. ~~账户安全 UI：会话列表/踢下线~~ **已完成**（`AccountProfileSection` 会话卡片 + `useSession`）

**验收**

- [x] 注销后无法 login/refresh（`account:closed` → disable + `removeAllSessions`；login 拒绝 Disabled；refresh reuse 会 revoke 全部 session）
- [x] Account 与 Auth 邮箱在验证/换绑路径保持一致（Account `UpdateAccountSchema` 不含登录邮箱；`auth:email-verified` 投影）
- [x] 会话撤销可测（API + 账户设置「设备与会话」UI + `useSession`）

### Phase D — OAuth 完整流与账号链接

**目标**：三入口中的 GitHub 登录产品化（不含仓库 Contents 授权）。

1. ~~authorize URL + state/PKCE store~~ **已完成**
2. ~~Web/Desktop 回调与 deep link（Desktop 只收 code）~~ **Web 回调已接；Desktop IPC/gateway 已接 OAuth URL/callback/bind/unbind**
3. ~~已登录 bind/unbind GitHub~~ **API + client + 账户设置 UI 已接**
4. ~~冲突处理 UI（subject 已绑定其他身份）~~ **`OAUTH_ALREADY_LINKED` + 设置页冲突文案**；同邮箱账密静默合并仍禁止（登录侧不自动合并）
5. ~~与 Repository 的 GitHub App 授权入口文案隔离~~ **设置页 repoScopeHint + authorize scopes 仅 read:user/user:email**

**验收**

- [x] 未配置 client 时仍 `SERVICE_UNAVAILABLE`；`GET /oauth/providers` + Web 按钮 `v-if` 隐藏入口
- [~] 配置齐全时 GitHub 登录可拿 MemoFlow session（e2e-mock 提供者 + auth-oauth 规格已写；本机/CI 真跑待做）
- [x] 绑定不申请仓库权限；与 ADR-034 一致（scopes 与文案双重约束）

### Phase E — 访客升级（Desktop）

**目标**：本地 profile 升级在线账号，Vault 不搬家。

1. ~~升级 API/桌面流程：访客 → 注册或 GitHub 登录~~ **已完成**（login/register/OAuth callback 走 `prepareProfileForOnlineIdentity`）
2. ~~ownership 重绑策略固化~~ **已完成**（`ProfileRegistry.rebindIdentityOwnership` 保留 profileId；冲突拒绝静默合并）
3. ~~失败不破坏本地 profile~~ **已完成**（无 guest 则抛错；目标 identity 已有其他 profile 拒绝；升级前 discard/deactivate 访客 runtime）

**验收**

- [x] 访客升级保持 profileId/目录不变（`DesktopProfileRuntimeManager` + `ProfileRegistry` 单测）
- [x] 登录/注册在访客态走 rebind 而非新目录（`desktop-auth-shell` 单测）
- [~] 产品文档路径可手测；端到端桌面手测仍待

---

## 6. 前端与跨端要点

| 端      | 要求                                                                       |
| ------- | -------------------------------------------------------------------------- |
| Web     | 无访客入口（见 web-auth 计划）；注册后验证场景；忘记密码入口等后端就绪再开 |
| Desktop | 保留访客；OAuth 走系统浏览器；升级路径 Phase E                             |
| Mobile  | 跟随 contracts；不单独发明验证协议                                         |
| i18n    | 所有新错误码双语                                                           |

---

## 7. 安全清单（实施时逐项打勾）

- [x] 验证码/重置令牌只存 hash（InMemoryVerificationChallengeStore SHA-256）
- [~] 发送与校验限流（subject challenge store + IP middleware 已有；多实例 Redis 待替换）
- [x] 防邮箱枚举（统一响应：forgot/send-code 未知邮箱仍 ok）
- [x] 日志仅掩码邮箱，不打明文码（ConsoleEmailSender + register/runtime 掩码）
- [~] OAuth state/PKCE；provider token 不进入 MemoFlow session（state/PKCE 已存 hash challenge 并校验；provider token 仅临时换身份，不入 MemoFlow session）
- [x] 身份登录场景评估：OAuthBinding 表中 access/refresh **默认不落库**（bind/createWithOAuth 均不写 provider token）
- [x] 改密/重置/注销后撤 session（change revoke-all valid；reset removeAll；close cascade disable+removeAll）
- [ ] 生产发信域名 SPF/DKIM/DMARC

---

## 8. 测试与验证策略

1. **单元**：challenge store、identity verify/activate、close 编排
2. **包测**：`pnpm nx run authentication:test`、`account:test`
3. **契约**：OpenAPI 与 Zod schema 同步（RouteRegistrar）
4. **E2E**：注册-验证；重置密码（本文 B1）；OAuth 可用 mock provider
5. **本地 prod-like**：涉及 env/邮件/部署时走 `docker-compose.local.yml`（见 AGENT.md）

---

## 9. 推荐实施顺序（执行排期）

```text
A 边界+challenge+邮件端口
  → 密码找回与邮箱验证共用零件
B 邮箱验证 API + 前端门禁 + Account 投影
C 注销级联 + 会话增强
D OAuth 完整流 + 链接策略
E 访客升级
```

原则：**先 A/B 再 D/E**。没有邮件与验证基础设施，OAuth 与升级也会反复返工。

---

## 10. 风险与缓解

| 风险                   | 缓解                                                                       |
| ---------------------- | -------------------------------------------------------------------------- |
| 双邮箱历史数据不一致   | 以 Auth 为准做一次对齐脚本或启动校验日志（项目不要求迁移兼容时可直接校正） |
| 注册后强制验证影响 e2e | 白名单 + 测试环境可配置跳过或固定码                                        |
| 邮件进垃圾箱           | 域名认证；dev 用 console/mailpit                                           |
| 静默合并导致账号劫持   | ADR 禁止；冲突必须显式确认                                                 |
| 码与链接两种交付形态   | 统一 challenge 抽象，禁止平行 API                                          |

---

## 11. 完成定义（整体）

- [x] ADR-036 已采纳，边界无歧义
- [~] 邮箱验证全链路可用（含 Account 投影；源码 + 单元测已绿；e2e 规格已写，待跑）
- [x] 密码找回与邮箱验证共享发信/challenge/限流（契约：现网 `/password/forgot|reset` + email verify；IP 限流已挂）
- [x] 注销后无法继续持有有效 session（account:closed → disable + removeAllSessions；refresh reuse 全撤；e2e 仍待真跑）
- [x] Unverified 策略可配置且有测试（`require-email-verified.middleware.spec.ts`）
- [~] OAuth 登录在配置开启时产品可用；与仓库授权分离（authorize URL + state/PKCE + callback + bind/unbind + 冲突 UI 已接线；e2e mock 待跑）
- [ ] 不引入第二套用户身份源
- [~] 相关聚焦单测通过（contracts/auth 重建 + authentication/web 聚焦 vitest）；全量 typecheck/e2e 未跑

---

## 12. 非目标回顾

- 不「为优雅」替换 `@memoflow/authentication`
- 不在 Account 模块单独实现登录邮箱验证权威
- 不把 GitHub 仓库同步权限绑进登录
- 本计划不包含 2FA/短信生产化

---

## 13. 下一步

1. ~~起草 ADR-036~~ 已完成
2. ~~归档密码找回独立计划~~ 已完成
3. ~~从 **Phase A PR1** 开工：`IVerificationChallengeStore` + 邮件端口扩展 + forgot/reset 迁移~~ **已完成**
4. ~~**B2** 邮箱验证后端~~ **已完成**（契约/use case/路由/client/Account 投影）
5. ~~**B1** 密码找回前端~~ / ~~**B2** 门禁 + Web 验证场景~~ **已完成（Web）**
6. ~~**包 dist 闭环**~~ contracts + authentication 重建；@memoflow/authentication/api 导出 gate；聚焦单测 25+11 绿
7. ~~e2e 规格 + Phase C 注销级联 + Desktop 同契约 + Unverified banner~~ **源码已接入**
8. ~~Phase D OAuth bind/unbind + 冲突处理 + 设置页入口~~ **源码已接入**
9. ~~e2e mock OAuth + providers 门控 + 掩码日志~~ **源码已接入**
10. ~~Phase C 会话增强~~ **已完成**（reuse detection + device 元数据 + 会话 UI）
11. ~~Phase E 访客升级 ownership 重绑~~ **源码 + 单测已完成**
12. 下一步：本机/CI 真跑 auth e2e（register/password/oauth）→ 生产发信（SPF/DKIM）→ 桌面访客升级手测

## 实施进度（滚动）

| 日期       | 进度                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------- |
| 2026-07-17 | **Phase A** challenge store + email port + forgot/reset 迁移完成；单测已写                                            |
| 2026-07-17 | **Phase A6** `challenge-ip-rate-limit` 挂到 `/password/forgot` 与 `/email/send-code`                                  |
| 2026-07-17 | **Phase B2 后端** Send/VerifyEmail 契约、use case、路由、client、`auth:email-verified`、Account 投影                  |
| 2026-07-17 | **Web B1/B2** `WebAuthView` forgot/reset/verify-email；service/composable/i18n/MSW                                    |
| 2026-07-17 | **B2 门禁** `require-email-verified` + API/Account 挂载                                                               |
| 2026-07-17 | **验收加固** 重建 contracts/authentication dist；gate import 与 `Result.data` 断言修复；auth 聚焦 25 测 + web 11 测绿 |
| 2026-07-17 | **仍待** e2e；主应用 Unverified banner；Desktop 真实现；Phase C 注销级联；Phase D OAuth 产品流；生产发信              |

| 2026-07-18 | **e2e 规格** register/password 用例 + `/auth/test/last-email-code`（仅 test/e2e lane）|
| 2026-07-18 | **Desktop** FORGOT/RESET/CHANGE/SEND/VERIFY_EMAIL_CODE 走 AuthRemoteGateway 现网契约 |
| 2026-07-18 | **Phase C** `account:closed` → disable identity + removeAll sessions；登录拒绝 Disabled |
| 2026-07-18 | **主应用** AppShell Unverified banner + `/auth?scene=verify-email` |

| 2026-07-18 | **Phase D 起步** `POST /oauth/url` + InMemoryOAuthStateStore(PKCE) + callback state 校验；Web GitHub 按钮/回调 |

| 2026-07-18 | **安全清单** challenge 只存 hash；ConsoleEmailSender 掩码邮箱且不打印明文码；forgot/send-code 防枚举复核 |
| 2026-07-18 | **OAuth mock** `e2e-mock` client + `MockGithubOAuthClient`；e2e lane 默认注入；`GET /oauth/providers` UI 门控 |
| 2026-07-18 | **e2e 规格** `auth-oauth.spec.ts` 纳入 playwright testMatch；authentication 339 测绿；governance-check 绿 |

| 2026-07-18 | **Phase C 补齐** refresh reuse detection（旧 hash 重放撤全会话）+ `Context.device`/`AuthSession.start` 设备元数据 + 账户设置会话列表/踢下线 UI |
| 2026-07-18 | **聚焦验证** authentication refresh/login/oauth/session 相关 vitest 绿；app-vue AccountProfileSection 绿；utils express-adapter 绿 |

| 2026-07-18 | **Phase E** 访客 profile ownership 重绑：`rebindIdentityOwnership` + `upgradeGuestProfileToOnlineIdentity`；login/register/OAuth callback 接入；profile/shell 单测 38 绿 |
| 2026-07-18 | **归档** App Vue UI 深度重构计划（PR #187 已合入 main） |

| 2026-07-18 | **治理复验** `memoflow:governance-check` 绿；cross-feature boundary plan 归档 |
