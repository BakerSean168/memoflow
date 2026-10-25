---
tags:
  - plan
  - archive
  - authentication
  - email
  - smtp
  - infrastructure
description: 事务邮件（验证码 / 密码重置）通用 SMTP 投递方案——自有域名 + IEmailSender 工厂，local 默认 console
created: 2026-07-28T00:00:00
updated: 2026-07-29T00:00:00
status: done
---

> **归档结果（2026-07-29）**：Phase A–D 已实施（SmtpEmailSender、工厂、guides、Redis challenge、Resend、failover）。  
> 默认 `EMAIL_PROVIDER=console`；真发 / 多副本见 `docs/guides/development/transactional-email-smtp.md`。  
> Auth 业务闭环历史：[`./2026-07-17-auth-account-security-closure.md`](./2026-07-17-auth-account-security-closure.md)。

# 2026-07-28 事务邮件通用 SMTP 方案

## 1. 文档地位

| 角色         | 说明                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **本文件**   | 事务邮件**投递通道**实施 plan：通用 SMTP、`IEmailSender` 工厂、env、域名 DNS、分环境策略                                                          |
| 上游业务闭环 | [`2026-07-17-auth-account-security-closure.md`](./2026-07-17-auth-account-security-closure.md) §3.5 邮件端口（发码 / 校验业务已基本落地）         |
| 本地验证通路 | [`2026-07-27-docker-web-pm-journey-findings.md`](./2026-07-27-docker-web-pm-journey-findings.md)（`LOCAL_VALIDATION` + console 取码；**不删除**） |
| 规范入口     | `AGENT.md`；真值：代码 / 配置 / 测试 > 本 plan                                                                                                    |

**本 plan 只解决「信怎么发出去」**，不重做 challenge 业务、不扩营销邮件、不引入第二套验证码协议。

### 1.1 决策摘要（已拍板）

| 项                       | 决策                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 投递实现                 | **通用 SMTP**（`nodemailer` 或等价），一份实现对接任意合规 SMTP 中继                                                                                  |
| 域名                     | **使用已有自有域名**（不依赖学生包买域；不强制 Namecheap 等优惠）                                                                                     |
| 厂商                     | **不绑死** SendGrid / Resend SDK；凭据只进 env。低频长期 free 推荐 **Brevo SMTP** 或任意提供标准 SMTP 的 free tier（Resend 若仅 HTTP 则本阶段不优先） |
| 本地 / CI / local-docker | 默认 **`EMAIL_PROVIDER=console`**，保留 `ConsoleEmailSender` + `last-email-code`                                                                      |
| 真发试验 / 生产          | 显式 **`EMAIL_PROVIDER=smtp`** + 完整 `SMTP_*`                                                                                                        |
| 学生包 SendGrid          | **已不可用**，不作为依赖；文档不写「领 SendGrid EDU」                                                                                                 |

---

## 2. 问题与目标

### 2.1 现状

| 层                                   | 状态                                                               |
| ------------------------------------ | ------------------------------------------------------------------ |
| 发码 / 校验 / 冷却 / 防枚举 use case | ✅ 已有                                                            |
| 端口 `IEmailSender`                  | ✅ 已有（`sendPasswordResetCode` / `sendEmailVerificationCode`）   |
| 实现                                 | 仅 **`ConsoleEmailSender`**（日志掩码 + 内存 capture）             |
| 装配                                 | `createAuthenticationUseCases` **写死** `new ConsoleEmailSender()` |
| env                                  | `.env.example` 有 `SMTP_*` 占位；**无人读取用于发信**              |
| local-docker                         | `LOCAL_VALIDATION=1` 开放取码端点；`SMTP_*` 空                     |

结果：产品验证旅程可在本地用取码端点走通；**真实邮箱收不到信**；生产也无投递。

### 2.2 目标（完成定义）

1. 存在 **`SmtpEmailSender` implements `IEmailSender`**，仅依赖标准 SMTP 配置。
2. 存在 **`createEmailSender(env)`（或等价工厂）**：`console` | `smtp`，可注入覆盖便于单测。
3. **`createAuthenticationUseCases` 不再写死 console**；缺配置时 non-prod 可降级 console，prod + `smtp` 缺关键凭据则 **fail-fast 或明确拒绝启动**（实现时二选一写死在代码+测试）。
4. local-docker / 默认开发路径行为与今日一致（console + 取码），**不破坏** e2e / PM journey。
5. 文档：自有域名 SPF/DKIM/DMARC 清单 + `SMTP_*` 样例（Brevo 等作示例，非唯一厂商）。
6. 最小验证：单元测试（mock transport）+ 可选手动真发检查清单（不强制 CI 连外网）。

### 2.3 非目标

- 不实现 Resend/SES 专用 SDK（可后续再加；端口已预留）。
- 不改 challenge 存储（内存 → Redis）——多副本生产缺口另案；单实例 / local 可真发。
- 不把 `last-email-code` 暴露到真实生产（gate 保持）。
- 不做营销邮件、订阅、批量发送。
- 不强制购买新域名或学生包域名优惠。
- 不把 Gmail 个人 SMTP 写进推荐路径（限额与 ToS 风险）。

---

## 3. 架构

```text
                    ┌─────────────────────────┐
  Register /        │  Use cases (unchanged)  │
  SendCode /        │  hash-only challenges   │
  ForgotPassword    └───────────┬─────────────┘
                                │ IEmailSender
                    ┌───────────▼─────────────┐
                    │  createEmailSender(env) │
                    └───────────┬─────────────┘
               ┌────────────────┼────────────────┐
               ▼                ▼                ▼
        ConsoleEmailSender  SmtpEmailSender   (future)
        capture + mask log  nodemailer SMTP   Resend/...
```

### 3.1 端口（保持）

```ts
// packages/authentication/.../i-email-sender.ts
interface IEmailSender {
  sendPasswordResetCode(email: string, code: string): Promise<void>;
  sendEmailVerificationCode(email: string, code: string): Promise<void>;
}
```

不在本阶段拆更多方法；模板差异用内部 private helper（subject/body）。

### 3.2 SmtpEmailSender 职责

| 要求 | 说明                                                                                                                        |
| ---- | --------------------------------------------------------------------------------------------------------------------------- |
| 传输 | SMTP（STARTTLS 587 或 SMTPS 465，由 `SMTP_PORT` / 可选 `SMTP_SECURE` 决定）                                                 |
| 认证 | `SMTP_USER` + `SMTP_PASS`                                                                                                   |
| From | `SMTP_FROM`（须为已在中继侧验证的域名身份）                                                                                 |
| 正文 | 纯文本优先；可选极简 HTML；**验证码只出现在邮件体，不写应用日志**                                                           |
| 日志 | 仅 `maskEmail` + kind（与 Console 一致）；禁止明文 code                                                                     |
| 错误 | transport 失败向上抛或记 structured log；use case 层保持现有防枚举（register 已 warn 吞失败）——**不把 SMTP 细节返回客户端** |
| 依赖 | 优先 `nodemailer`（成熟、通用）；不引入厂商 SDK                                                                             |

### 3.3 工厂与装配

建议签名（实现可微调命名）：

```ts
type EmailProvider = 'console' | 'smtp';

function resolveEmailProvider(env): EmailProvider {
  // 显式优先；禁止仅用 NODE_ENV=production 推断（local-docker 也是 production）
  const raw = env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (raw === 'smtp' || raw === 'console') return raw;
  // 缺省：console（安全默认，避免误发）
  return 'console';
}

function createEmailSender(env, deps?: { smtpTransport? }): IEmailSender {
  if (resolveEmailProvider(env) === 'smtp') {
    assertSmtpConfig(env); // host/user/pass/from
    return new SmtpEmailSender({ ... });
  }
  return new ConsoleEmailSender();
}
```

装配点：

- `createAuthenticationUseCases`：增加可选 `emailSender?: IEmailSender`；未传入则 `createEmailSender(process.env)`（或 api 已校验的 `env` 对象）。
- 单测：注入 fake / console，不碰网络。

### 3.4 模板（最小）

| kind           | Subject（可 i18n 后续）      | Body 要点                                                    |
| -------------- | ---------------------------- | ------------------------------------------------------------ |
| email-verify   | `【MemoFlow】邮箱验证码`     | 6 位码、有效期（与 challenge TTL 一致，默认 10 min）、勿转发 |
| password-reset | `【MemoFlow】密码重置验证码` | 同上                                                         |

文案先中英硬编码或简单按 `SMTP_LOCALE` 二选一；**不**接 app-vue i18n（服务端无浏览器 locale 时以账户/Accept-Language 为后续增强）。

产品名 / From 显示名来自 `SMTP_FROM`，不写死个人邮箱。

---

## 4. 配置契约

### 4.1 环境变量

| 变量             | 必填条件       | 说明                                 |
| ---------------- | -------------- | ------------------------------------ |
| `EMAIL_PROVIDER` | 推荐显式       | `console`（默认）\| `smtp`           |
| `SMTP_HOST`      | provider=smtp  | 中继主机                             |
| `SMTP_PORT`      | 可选，默认 587 | 587 / 465                            |
| `SMTP_SECURE`    | 可选           | `true` 时用 TLS（465 常见）          |
| `SMTP_USER`      | provider=smtp  | 登录用户（部分厂商为 apikey 字面量） |
| `SMTP_PASS`      | provider=smtp  | 密码或 API key                       |
| `SMTP_FROM`      | provider=smtp  | `Display Name <addr@your.domain>`    |
| `SMTP_REPLY_TO`  | 可选           | 回复地址                             |

与现有 `apps/api` `env.schema` 对齐：扩展可选字段 + 当 `EMAIL_PROVIDER=smtp` 时的 refinements（或启动时 assert，避免 zod 在 console 模式强制 SMTP）。

### 4.2 样例（Brevo SMTP，非唯一）

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=<brevo-login>
SMTP_PASS=<brevo-smtp-key>
SMTP_FROM=MemoFlow <noreply@mail.example.com>
```

其他中继只需换 host/user/pass；**代码零改**。

### 4.3 local-docker

| 项       | 约定                                                                                                                                |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 默认     | **不**在 `docker-compose.local.yml` 强制 smtp；保持 console + `LOCAL_VALIDATION=1`                                                  |
| 真发试验 | 开发者在 **gitignored** `.env.production.local`（或 host env 经 local-compose 注入）设 `EMAIL_PROVIDER=smtp` 与凭据；**勿提交密钥** |
| 取码端点 | provider=smtp 时仍可保留 console dual-write（可选增强，非必须）；默认可不 dual-write，真发以收件箱为准                              |

---

## 5. 自有域名与 DNS

### 5.1 原则

- **已有域名即可**，无需学生包「域名优惠」。
- 域名优惠（若仍存在）仅指注册商一年免费域等，**与发信能力无绑定**。
- 发信身份必须是**你能改 DNS 的域**（不能用学校邮箱域名当 From，除非你是该域管理员）。

### 5.2 推荐记录（在邮件中继控制台生成具体值）

在 DNS 托管商为发信域（建议子域 **`mail.`** 或 **`send.`**）配置：

| 类型                         | 用途                 |
| ---------------------------- | -------------------- |
| SPF (`TXT`)                  | 授权该 SMTP 中继代发 |
| DKIM (`TXT` 或 CNAME)        | 中继提供的选择器记录 |
| DMARC (`TXT`，可先 `p=none`) | 策略与汇报，逐步收紧 |

### 5.3 检查清单（手动）

- [ ] 中继后台 Domain / Sender 显示 Verified
- [ ] 用中继「发送测试」到自己的邮箱（含国内 foxmail/qq 看垃圾箱）
- [ ] 应用侧 `EMAIL_PROVIDER=smtp` 走注册或 send-code 再收一封
- [ ] API 日志无明文验证码、仅有掩码邮箱

---

## 6. 安全与产品约束

| 约束                               | 做法                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------- |
| 码存储                             | 继续只存 hash（现有 challenge store）                                     |
| 日志                               | 禁止 plaintext code；邮箱 mask                                            |
| 防枚举                             | send/forgot 对外成功语义不变；SMTP 失败不区分「用户是否存在」             |
| 密钥                               | 仅 env / secret；不进镜像 build arg 明文                                  |
| 生产取码 API                       | `isTestEmailCodeEndpointEnabled` 保持关闭                                 |
| 频率                               | 沿用现有 challenge 冷却与日上限；SMTP 厂商 free tier 另有配额，超限记日志 |
| local-docker `NODE_ENV=production` | **禁止**用 NODE_ENV 单独决定 provider                                     |

---

## 7. 实施阶段

### Phase A — 实现与装配（代码）

1. 添加依赖（api 或 authentication 包边界按现有依赖方向选择，优先靠近现 Console 实现处）。
2. `smtp-email-sender.ts` + 单元测试（mock `createTransport` / 注入 transport）。
3. `create-email-sender.ts`（或 module 内工厂）+ 缺省 console + smtp assert。
4. 改 `createAuthenticationUseCases` 可注入 / 工厂创建。
5. `env.schema` / `.env.example` 补齐 `EMAIL_PROVIDER` 与 SMTP 说明。
6. surface 或 module 单测：默认仍为 Console；`EMAIL_PROVIDER=smtp` 且缺 host 时失败路径有断言。

### Phase B — 文档与运维

1. ~~本 plan 保持为 SSOT；`docs/guides/development/transactional-email-smtp.md` + local.docker / guides README 交叉链。~~ **已完成**
2. ~~更新 auth security closure §3.5：prod 路径 → 通用 SMTP / Resend（链到本文件 + guide）。~~ **已完成**

### Phase C — 真发验收（人工，不阻塞合入若 A 测试绿）

1. 自有域名在中继完成 SPF/DKIM。
2. ~~本机或 local-docker 覆盖 env，注册/发码，真实收件（Brevo SMTP + docker register/verify）。~~ **已完成（开发者凭据环境）**
3. 切回 console，确认取码端点与 e2e 假设仍成立（默认路径 + dual-write 单测覆盖）。

### Phase D — 增强（已实施）

- ~~Challenge store 持久化（多 API 副本）：`RedisVerificationChallengeStore` + `AUTH_CHALLENGE_STORE=redis` + apps/api ioredis 注入。~~ **已完成**
- ~~邮件多语言模板：`email-templates.ts` + `SMTP_LOCALE` / `EMAIL_LOCALE`（zh|en）。~~ **已完成**
- ~~可选 `ResendEmailSender`（HTTP，`EMAIL_PROVIDER=resend`）。~~ **已完成**
- ~~第二 SMTP 热备：`SMTP_SECONDARY_*` + `FailoverEmailSender`。~~ **已完成**

---

## 8. 文件触点（预期）

| 路径                                                                                            | 变更                               |
| ----------------------------------------------------------------------------------------------- | ---------------------------------- |
| `packages/authentication/src/server/infrastructure/services/smtp-email-sender.ts`               | **新增**                           |
| `packages/authentication/src/server/infrastructure/services/create-email-sender.ts`（名可调整） | **新增**                           |
| `packages/authentication/src/server/infrastructure/authentication.module.ts`                    | 工厂 / 注入                        |
| `packages/authentication/src/server/infrastructure/index.ts`                                    | export                             |
| `packages/authentication/.../__tests__/`                                                        | SMTP + 工厂测试                    |
| `apps/api/src/shared/infrastructure/config/env.schema.ts`                                       | 可选字段                           |
| `.env.example`                                                                                  | `EMAIL_PROVIDER` + SMTP 注释       |
| `docker-compose.local.yml`                                                                      | **默认不改**（或仅注释说明可覆盖） |

---

## 9. 验证

| 检查     | 命令 / 方法                                                                              |
| -------- | ---------------------------------------------------------------------------------------- |
| 单元     | `pnpm nx run authentication:test`（或承载测试的 project）含 smtp/factory                 |
| 回归     | `pnpm nx run api:test`；oauth / email-verification 既有用例仍绿                          |
| 默认行为 | 不设 SMTP 时仍 console；local-docker 取码仍可用                                          |
| 真发     | 人工清单 §5.3 / Phase C                                                                  |
| 治理     | 若只改 docs：`pnpm nx run memoflow:governance-check`；改代码再加最近 lint/typecheck/test |

---

## 10. 风险

| 风险                         | 缓解                                                        |
| ---------------------------- | ----------------------------------------------------------- |
| free tier 政策变更           | 通用 SMTP，换中继只改 env                                   |
| 国内邮箱进垃圾箱             | DKIM/SPF；From 用业务域；必要时换国内中继                   |
| 误在共享 local 环境真发      | 默认 console；smtp 需显式 provider                          |
| 多实例 challenge 内存        | 文档标明单实例假设；D 阶段再持久化                          |
| nodemailer 体积 / 许可       | 常用依赖；若政策不允许再评估轻量 SMTP 客户端                |
| local 取码 `data.code: null` | 见 §14；实施 SMTP 时**顺手排查** console capture 与发码路径 |

---

## 14. 已知问题：local-docker `last-email-code` 返回 `code: null`（2026-07-28 记录）

### 14.1 现象（用户本机复现）

```bash
curl -sS 'http://127.0.0.1:53080/api/v1/auth/test/last-email-code?email=test@test.com'
# → {"ok":true,"data":{"code":null,"kind":null},...}

curl -sS 'http://127.0.0.1:53080/api/v1/auth/test/last-email-code?email=test@test123.com'
# → 同上 null

curl -sS 'http://127.0.0.1:53080/api/v1/auth/test/last-email-code?email=test123@test123.com'
# → 同上 null
```

接口本身 **200 + 已开放**（`LOCAL_VALIDATION=1` 生效），但 **capture 里没有对应该邮箱的码**。

### 14.2 机制说明

- 码只存在 **当前 API 进程内存** 的 `ConsoleEmailSender` 环形缓冲（容器重建 / 进程重启即清空）。
- `GET /test/last-email-code` 按 **规范化后的 email** 查最近一次 capture；查不到则 **`code: null`（仍 200，防枚举风格）**。
- 日志只打掩码：`[EmailVerify] Code issued for x***@...`，**从不打印明文码**。

### 14.3 可能根因（实施 Phase A 时顺手核对）

| #   | 可能原因                                                                                                               | 如何确认                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | **该邮箱从未成功走发码**（只 curl 取码、未注册/未点发送；或 send-code 被冷却/限流/校验挡掉）                           | 发码前后各 curl 一次；看 Network 里 `POST .../email/send-code` 或 register 是否 200 |
| 2   | **邮箱字符串不一致**（前后空格、不同账号、UI 与 curl 邮箱不同）                                                        | 用 UI 里完全同一字符串；服务端 `normalizeEmail` 后比对                              |
| 3   | **register 发码失败被吞**（`RegisterUseCase` 对发信失败仅 warn，注册仍成功 → 无 capture）                              | `docker logs memoflow-api-1` 是否有 `Failed to send email` / 无对应 `Code issued`   |
| 4   | **API 容器在发码后重建**（`docker:local:rebuild` / recreate）清空内存                                                  | 发码后立刻取码；重建后再取必为 null                                                 |
| 5   | **多 worker / 多实例**（发码与取码打到不同进程；当前 compose 多为单容器单进程，概率低）                                | 确认 api 副本数与 cluster 模式                                                      |
| 6   | **模块多份 ConsoleEmailSender 类静态字段**（打包/重复实例导致 record 与 getLatestCode 不在同一静态数组——需查构建产物） | 发码后日志有 `Code issued` 但同邮箱取码仍 null → 重点查此项                         |
| 7   | 用户测的是 **虚构邮箱且从未触发 send**                                                                                 | 日志中无该掩码邮箱的 issued 行                                                      |

### 14.4 临时自检步骤（实施前也可做）

```bash
# 1) 确认接口开着
docker exec memoflow-api-1 printenv LOCAL_VALIDATION

# 2) 用 UI 或 API 对「真实已注册未验证」邮箱发码
curl -sS -X POST 'http://127.0.0.1:53080/api/v1/auth/email/send-code' \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer <登录后的 accessToken>" \
  -d '{"purpose":"EmailVerify"}'

# 或注册（若 use case 会发码）：
# POST /api/v1/auth/register

# 3) 立刻看日志是否 issued
docker logs memoflow-api-1 2>&1 | grep EmailVerify | tail -5

# 4) 用**完全相同**邮箱取码
curl -sS "http://127.0.0.1:53080/api/v1/auth/test/last-email-code?email=<same-email>"
```

### 14.5 与本 plan 的关系

- **不阻塞** SMTP 真发：真发后以收件箱为准，不再依赖 capture。
- **实施 SMTP 时必须顺手**：
  1. 复现「发码 → 日志 issued → 同邮箱 last-email-code 非 null」黄金路径测试（可 unit/integration）。
  2. 若 root cause 是静态 capture / 装配分裂，一并修 console 路径。
  3. 可选：`EMAIL_PROVIDER=smtp` 时 **dual-write** 到 console capture（仅 non-prod），便于 local 无邮箱时仍取码。
- 勾选：§12 增加一项「local last-email-code 黄金路径」见下。

---

## 11. 与相关 plan 的边界

| Plan                          | 关系                                                                   |
| ----------------------------- | ---------------------------------------------------------------------- |
| Auth account security closure | 业务与安全清单 SSOT；本 plan **只补投递实现**                          |
| PM journey findings           | local 取码与 console **保留**；真发为可选增强，不替代 LOCAL_VALIDATION |
| Elegance / dual               | 新增单一 SMTP 实现，**禁止**平行第二套发码 API                         |

---

## 12. 检查清单（实施勾选）

- [x] `SmtpEmailSender` + 测试
- [x] `createEmailSender` / 显式 `EMAIL_PROVIDER`
- [x] `createAuthenticationUseCases` 去写死 console
- [x] `env.schema` + `.env.example`
- [x] 默认 console 回归（api/authentication tests）
- [x] **顺手**：§14 local `last-email-code` 黄金路径（发码后同邮箱非 null）；修 capture/装配若有分裂
- [x] （可选）smtp 非 prod dual-write console capture（`LOCAL_VALIDATION` / `EMAIL_CAPTURE_CODES`）
- [x] （可选）本机自有域名 + 中继真发一封（Brevo SMTP accept + docker register/verify）
- [x] Phase B：guides + security closure §3.5
- [x] Phase D：Redis challenge store + factory / apps/api 注入
- [x] Phase D：i18n 邮件模板 + Resend + secondary SMTP failover
- [x] security closure / 本 plan 状态更新；合入后可 archive

---

## 15. 实施前：你需要手动完成的前置准备

> 代码实施由 agent 做；下列 **只能由你在浏览器 / DNS / 邮件商控制台** 完成。准备好后把「已完成项」和凭据放置方式告诉实施者即可（**不要把 SMTP 密码贴进 git / plan 正文**）。

### 15.1 必做

| #   | 你要做的事                                                    | 完成标准                                                                                                      |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | **选定 SMTP 中继**（长期 free、低频即可）                     | 已注册账号。推荐：**Brevo**（SMTP）或其他提供标准 SMTP 的 free tier。不绑死一家。                             |
| 2   | **确认自有域名可改 DNS**                                      | 登录域名 DNS 面板，能添加 TXT/CNAME。                                                                         |
| 3   | **在中继后台添加并验证发信域**（建议子域 `mail.` 或 `send.`） | 按厂商向导添加 **SPF、DKIM**（建议再加 **DMARC** `p=none`）；控制台显示 **Domain verified / Authenticated**。 |
| 4   | **创建 SMTP 凭据**                                            | 拿到并私密保存：`SMTP_HOST`、`SMTP_PORT`（多为 587）、`SMTP_USER`、`SMTP_PASS`（或 SMTP key）。               |
| 5   | **定 From 地址**                                              | 例如 `MemoFlow <noreply@mail.你的域名>`，且该地址/域已在中继侧允许发送。                                      |
| 6   | **中继控制台先发一封测试信**到你自己的常用邮箱                | 收件箱（或垃圾箱）能看到；记录是否进垃圾箱，便于以后调。                                                      |

### 15.2 写入本机（实施时用，勿提交）

在仓库根 **gitignored** 文件中准备（实施阶段会读这些变量），例如 `.env.production.local` 或单独 `.env.smtp.local`（若采用后者需约定如何注入）：

```env
EMAIL_PROVIDER=smtp
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=MemoFlow <noreply@mail.example.com>
```

- **不要** `git add` 含密钥的文件。
- local-docker 默认仍可保持 console；真发时再打开 `EMAIL_PROVIDER=smtp`。

### 15.3 建议一并准备（非阻塞代码）

| 项                              | 说明                                    |
| ------------------------------- | --------------------------------------- |
| 一个真实收件测试邮箱            | 用于 Phase C 验收（可与 From 不同域）   |
| 国内邮箱各测一次                | 若用户多 QQ/163/foxmail，看是否进垃圾箱 |
| Brevo（或所选厂商）当日剩余额度 | 避免测着用尽 free tier                  |

### 15.4 你现在**不必**做的

- 不必改仓库业务代码（等实施 Phase A）。
- 不必先修 `last-email-code` null（已记入 §14，实施时顺手查）。
- 不必购买新域名或学生包域名。
- 不必上 Resend 专用 SDK（本 plan 是通用 SMTP）。
- 不必配置生产多副本 Redis challenge（Phase D）。

### 15.5 准备完成后请回传（可打码）

便于立刻开工，请确认：

1. 中继厂商名称（如 Brevo）
2. 发信域是否已 Verified（是/否）
3. `SMTP_HOST` / `SMTP_PORT`（可公开）
4. 凭据是否已写入本机 gitignored env（是/否；**不要发送密码**）
5. 计划先在：**仅本机 host 进程** 还是 **local-docker api 容器** 上试真发

收到以上后即可按本 plan **Phase A** 实施。

---

## 13. 推荐实施顺序（给执行 agent）

1. 读本 plan + 现有 `ConsoleEmailSender` / `authentication.module.ts` / `env.schema`。
2. Phase A 一次 PR 级改动，行为默认不变。
3. 跑最近 test/typecheck。
4. 人工 Phase C 由持有域名与 SMTP 凭据的开发者完成。
5. 勾选 §12，更新本文件 `updated` 与 active README 状态。
