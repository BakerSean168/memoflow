---
tags: [analysis, mcp, oauth, verification]
description: EAG-04 只读 OAuth 的真实 PG、浏览器和 CLI 验证证据
created: 2026-10-07T00:00:00Z
updated: 2026-10-07T00:00:00Z
---

# EAG-04 OAuth read 证据

PAT checkpoint 为 `320dd1ac994`，OAuth 实现 checkpoint 为 `5a9a26221c4`。本次实现将 OAuth 接入同一个六工具 Gateway，不增加写工具；默认 `EAG_OAUTH_ENABLED=0`。本报告记录实现与本地验证，公共 rollout 尚未执行。

## 运行时与持久化

- Better Auth、MCP、CIMD、OAuth Provider 锁定 1.7.6。生产组合为 bearer + deviceAuthorization + jwt + mcp + cimd，没有重复 oauthProvider。
- 使用 `auth@1.7.6 generate` 和 `packages/cloud-auth/testing/oauth-schema.config.ts` 生成协议 schema，添加 MemoFlow UUID 默认值和查询索引。实际 Prisma/PG 验证发现 resource 自动播种的 nullable array 与 Prisma 不兼容，配置显式 resource/allowedScopes 后通过。
- `ExternalAgentConnection` 只拥有稳定授权生命周期。JWT 自定义 claim 绑定该 connection；Gateway 同时检查签名、issuer/audience/expiry、connection、当前 consent、Active Account、owner。
- provider token/consent/revoke 与产品撤销在同一个 PG transaction/advisory lock 中执行。无进程内授权缓存，两个 runtime 的并发刷新共享数据库序列化边界。细节和吞吐限制见 [ADR-117](../architecture/adr/ADR-117-external-agent-authorization-and-credentials.md)。

## 自动验证

`pnpm nx run api:test:integration -- apps/api/src/__tests__/integration/external-agent-oauth.integration.test.ts apps/api/src/__tests__/integration/agent-gateway.integration.test.ts`：2 文件、10 测试通过，使用真实 PostgreSQL `memoflow_test`。

覆盖授权码与 form-encoded token exchange、600 秒 access TTL、offline_access、稳定 connection、跨 runtime 并发 refresh、同结果 overlap、超窗旧 token replay、scope 减少、账户禁用、RFC 7009 refresh revoke、code replay、撤销重连、错误 issuer/audience/signature、connection 到期和数据库故障回滚。原 PAT 六工具、两账户隔离和 owner parity 回归通过。

Web Consent 三项行为测试通过：签名 query 保留、只有显式动作才授权、无效请求不呈现批准按钮。Cloud Auth/Gateway 单测通过；最终 affected lint 41 项目、typecheck 37 项目及 31 依赖、test 36 项目及 4 依赖通过，governance/docs 通过。首次验证把部署用 `EAG_OAUTH_ENABLED=1` 传入单测却漏传 issuer/Web 配置，API 配置校验按预期拒绝；同一源码、正常测试环境重跑 affected-test 后全部通过，未修改服务代码来规避校验。最终报告保留该失败尝试和成功重跑，不重复已通过的 lint/typecheck/镜像构建。

## 浏览器与真实客户端

本轮使用 e2e lane：API `http://127.0.0.1:3000`、Web `http://127.0.0.1:5173`，真实 API bootstrap、测试 PG 与临时 Redis。新建合成测试账户，通过真实注册、邮件链接捕获/验证、邮箱登录和显式 Consent，不预注入 first-party session。没有发送真实第三方邮件。

| 客户端      | 版本    | 验证                                                                                         |
| ----------- | ------- | -------------------------------------------------------------------------------------------- |
| Codex       | 0.160.1 | CIMD → 浏览器邮箱登录/Consent → code exchange → 原生 app-server `mcpServer/tool/call` 六工具 |
| Claude Code | 2.1.290 | CIMD → 同一浏览器账户显式 Consent → code exchange → 真实 CLI 六工具                          |

两客户端都实际请求 `goals:read tasks:read offline_access`，使用各自官方 CIMD URL、S256 和标准 loopback callback。Token 由生产 createCloudAuth 签发。Codex 第一次授权在 13:30 UTC，13:52 UTC 再次完成六工具；原 access token 已超过 600 秒，数据库显示新的 refresh 记录仍关联原 connection。Claude 也验证了本地凭据到期后的 refresh rotation 和新 expiry。

Codex 通过原生控制 API 调用，不启动模型 turn。Claude 通过本地固定 Anthropic 响应驱动实际 CLI 的工具执行，避免把上游模型选工具能力混入 MCP 验收；OAuth、CLI token 存储、transport、Gateway、owner 和 PG 都没有替身。本证据不声称验证了上游模型推理。

可重用脚本：

- `packages/cloud-auth/testing/eag-oauth-codex-tools.mjs`
- `packages/cloud-auth/testing/eag-oauth-claude-tools.mjs`

脚本要求已完成浏览器 OAuth，并设置 `EAG_RESOURCE_URL`、`EAG_FIXTURE_IDS_FILE`（JSON 中有 goal/plan/occurrence ID）、`EAG_REPORT_DIR`。Claude 另需 `EAG_CLAUDE_CONFIG_DIR`、`EAG_CLAUDE_NATIVE_BIN`，必须指向官方 CLI 二进制，不能用会覆盖模型 endpoint 的用户 wrapper。测试资源名使用 `OAuth acceptance`，Task 日期为 `2026-11-01`。报告只记录调用结果，临时 CLI 原始输出权限为 0600。

## 连接管理

真实浏览器 `settings?tab=account` 显示 Codex/Claude、scopes、连接时间、last used、到期和撤销按钮；PAT 保留独立列表与一次性密钥。

点击撤销 Claude 后，旧 access token 调用立即返回 401，旧 refresh token 返回 400。浏览器创建只读 PAT、隐藏密钥、刷新页面和撤销均通过。截图及精简 JSON 记录位于本机 `/tmp/eag04/`；不在文档或 Git 保存 token、密码、code、verifier 或 signed query。

## Prod-like 最终制品

执行仓库 `validate-local-deploy` 流程，无缓存构建及 migrator 成功，API、Web、PowerSync healthy，端口和 OCI revision 一致。最终报告：`reports/local-deploy-validation/eag04-final.json` / `.md`（同步到 `latest`）；原始首次报告 `2026-10-07T14-54-08.186Z.json` 保留，汇总中的 `priorAttempt` 与 `reconciliation` 记录测试环境纠正。

- 源码：`5a9a26221c4018fd66dae382193cabbebe0f6ba2`。
- 制品 revision：`5a9a26221c4018fd66dae382193cabbebe0f6ba2-dirty-92e25a58d693`。dirty 指纹来自两份原有未跟踪 AI 操作脚本；未将其纳入 OAuth 提交，运行时源码已提交。
- API image ID：`sha256:dabbeb40098bd43e713735f56d228552bb23c90b28ae26b9f686744782a7a3e5`。
- Web image ID：`sha256:13e00a9d2f5e32a88fb96eecd27a763c3f8defebc6909182227136744df34249`。

使用本机配置的 HTTPS 开发入口，issuer 为 `https://gcp-dev-01.taile92a8e.ts.net:20201/api/auth`、resource 为同 origin 的 `/mcp`，Web 为端口 20200。真实新账户注册/邮箱验证后，浏览器完成登录与显式 Consent；官方 SDK 固定 `2026-07-28` profile，实际调用六工具。随后真实 Codex 与 Claude Code 分别完成 HTTPS OAuth、原生 token 存储及六工具调用。Claude 仍使用固定本地模型响应，不能据此宣称上游模型推理已验收。

33 项断言通过：discovery/issuer/resource、S256/CIMD、DCR 关闭、600 秒 access、offline_access、六工具、并发 refresh 同结果、稳定 connection、非法 Origin、两个原生 CLI、设置页撤销后旧/新 access 401、旧/新 refresh 400、重新 consent 后新 connection、旧 token 不复活、无 offline_access 不发 refresh，以及 Goal-only 只显示两工具且直接 Task 调用返回 403 scope challenge。该制品测试没有修改数据库 token 状态或预注入浏览器 session。

记录：`/tmp/eag04/prod-oauth.json`、`/tmp/eag04/prod-clients/{codex,claude}-tools.json`、`prod-consent.png`、`prod-connections.png`。CLI 版本同上；原生 CLI 使用各自协议协商，不将 SDK 的固定 profile 冒充为 CLI header 抓包证据。Claude 的 headless 验证需要真实 TTY；测试驱动使用伪终端，并剥除 OSC 超链接控制序列后读取授权 URL。测试授权与第一方 session 已撤销/退出。

Nx 保留 `contracts:build` 和本次环境误配导致的 `api:test` flaky 历史；最终命令退出码均为 0。该告警不表示最终验证失败。

## 尚未声明的验收

- 本轮完成单机 prod-like 与双 runtime PG 并发测试，没有进行多容器生产负载/故障演练。
- GitHub 上游实际登录未重跑；新的授权页复用既有 GitHub popup 登录能力，邮箱真实旅程已完成。
- HTTPS 开发入口和原生 loopback callback 已验证，不等同于公共生产 rollout。本轮未发布生产服务或启用写工具。
- provider 对单独 JWT 的 RFC 7009 revoke 与无 refresh 记录的 code replay 清理有限制，产品连接撤销仍即时生效，见 ADR-117。
