---
tags:
  - guide
  - development
  - email
  - smtp
  - authentication
description: 事务邮件（验证码 / 密码重置）投递配置：console / SMTP / Resend、域名 DNS、local-docker 与 Redis challenge
created: 2026-07-28T00:00:00
updated: 2026-07-29T00:00:00
---

# 事务邮件 SMTP / Resend

本指南说明 **产品验证码与密码重置邮件如何发出**。业务 challenge（发码 / 冷却 / 只存 hash）见认证安全闭环；本文件只覆盖 **投递通道与运维配置**。

| 角色                   | 路径                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 实施 plan（SSOT 决策） | [`docs/plan/archive/2026-07-28-transactional-email-smtp.md`](../../plan/archive/2026-07-28-transactional-email-smtp.md)                |
| 业务与安全清单         | [`docs/plan/archive/2026-07-17-auth-account-security-closure.md`](../../plan/archive/2026-07-17-auth-account-security-closure.md) §3.5 |
| 本地容器               | [local.docker.md](./local.docker.md)                                                                                                   |

## 提供者选择

| `EMAIL_PROVIDER`      | 行为                                    | 典型场景                     |
| --------------------- | --------------------------------------- | ---------------------------- |
| `console`（**默认**） | 日志掩码邮箱 + 内存 capture；**不**外发 | 本地、CI、local-docker、e2e  |
| `smtp`                | 通用 SMTP（`nodemailer`），任意合规中继 | Brevo / 企业中继 / 国内 SMTP |
| `resend`              | Resend HTTP API（`fetch`，无厂商 SDK）  | 已用 Resend 域名的团队       |

**禁止**仅用 `NODE_ENV=production` 推断 provider：local-docker 也是 production，默认仍应是 console。

## 环境变量（摘要）

完整注释见仓库根 [`.env.example`](../../../.env.example)。

```env
# 默认
EMAIL_PROVIDER=console

# SMTP
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=MemoFlow <noreply@mail.example.com>
SMTP_REPLY_TO=support@example.com   # 可选
SMTP_LOCALE=zh                      # zh | en 模板

# Resend
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...
RESEND_FROM=MemoFlow <noreply@mail.example.com>

# 可选：主通道失败后的第二 SMTP
SMTP_SECONDARY_HOST=...
SMTP_SECONDARY_USER=...
SMTP_SECONDARY_PASS=...
SMTP_SECONDARY_FROM=...

# 多 API 副本 challenge（默认 memory）
AUTH_CHALLENGE_STORE=memory   # 或 redis（需 REDIS_URL / REDIS_*）
```

凭据只放 gitignored env（如 `.env.production.local`），**勿提交**、勿写入镜像 build arg 明文。

## 自有域名 DNS

发信 From 必须是你能改 DNS 的域（建议子域 `mail.` / `send.`）：

1. 在中继后台添加域名，按向导配置 **SPF、DKIM**（建议 **DMARC** `p=none` 起步）。
2. 控制台显示 Domain verified。
3. 中继「发送测试」到自己邮箱（含 QQ/163 看垃圾箱）。
4. 应用侧 `EMAIL_PROVIDER=smtp|resend` 走注册或 `email/send-code` 再收一封。
5. API 日志仅有掩码邮箱，**无明文验证码**。

## local-docker

- 默认 **console** + `LOCAL_VALIDATION=1`：可用 `GET /api/v1/auth/test/last-email-code?email=` 取码（仅 validation 车道）。
- 真发：在 `.env.production.local` 设 `EMAIL_PROVIDER=smtp` 与完整 `SMTP_*`，再 `pnpm docker:local:up`（或 rebuild api）。
- `LOCAL_VALIDATION=1` 时 smtp/resend 会 **dual-write** 到 console capture，便于无收件箱时仍取码。
- 取码为 `null`：多为未发码、邮箱不一致、或 API 容器已重建清空内存 — 见 plan §14。

## Challenge 存储

| `AUTH_CHALLENGE_STORE` | 说明                                                            |
| ---------------------- | --------------------------------------------------------------- |
| `memory`（默认）       | 单进程内存；local-docker / 单副本足够                           |
| `redis`                | 多 API 副本共享；apps/api 在启动时注入 ioredis；仍只存 **hash** |

生产多副本务必 `AUTH_CHALLENGE_STORE=redis` 且 Redis 可达，否则发码与校验可能打到不同实例导致失败。

## 安全要点

- 验证码只存 hash；日志 mask 邮箱，禁止明文 code。
- 对外 forgot / send-code 防枚举语义不变；SMTP 失败不向客户端暴露细节。
- 生产关闭 `last-email-code` 测试端点（`isTestEmailCodeEndpointEnabled`）。
- 频率：challenge 冷却与日上限 + 厂商 free tier 配额。

## 验证

```bash
pnpm nx run authentication:test
# 含 create-email-sender、smtp、resend、failover、redis challenge store
```

真发人工清单见 plan Phase C / 上文 DNS 步骤。
