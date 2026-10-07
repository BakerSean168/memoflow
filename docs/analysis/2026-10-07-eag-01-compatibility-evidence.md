---
tags: [analysis, mcp, authentication, evidence]
description: EAG-01 锁定依赖、协议试验、真实 CLI 授权发起和 owner characterization 证据
created: 2026-10-07T00:00:00Z
updated: 2026-10-07T00:00:00Z
---

# EAG-01 兼容性证据

实施基线 `3664f8da6a95174d24ae8f443f2d12b3ce223e33`，分支 `feat/external-agent-gateway-20261007`，worktree `/home/dev/projects/memoflow`。开始时已有方案/ADR/索引/CONTEXT 和两个 AI operator 脚本未提交，均保留。此前 SHA 是研究基线，不用于回退。

## 锁定组合

| 组件                                | 实际安装版本      | 结论                                          |
| ----------------------------------- | ----------------- | --------------------------------------------- |
| Node / pnpm                         | 24.21.0 / 11.20.0 | 本机试验；SDK 要求 Node >=20                  |
| Zod / Express                       | 4.6.5 / 5.2.1     | 严格 schema、Node 转换、Express HTTP 实测通过 |
| MCP server/client/core              | 2.3.1             | 2026 单 POST 发现/调用通过                    |
| MCP Node / Express adapter          | 2.1.1 / 2.0.2     | 中间件各有独立版本，不能统一写成 2.3.1        |
| Better Auth / core / Prisma adapter | 1.7.6             | 保持既有版本                                  |
| MCP / CIMD / OAuth Provider         | 1.7.6             | fixture 共存通过；生产未注册插件              |
| Codex CLI                           | 0.160.1           | 真实 CLI discovery/CIMD/PKCE 授权发起通过     |
| Claude Code                         | 2.1.290           | 真实 CLI discovery/CIMD/PKCE 授权发起通过     |

试验依赖目前仅放在 Cloud Auth devDependencies；不会把试验 OAuth 配置带入 API。pnpm lockfile 包含 peer graph 重算，原有 Better Auth/Express/Zod 版本未升级。所有模型均以锁定包源码为准，禁止复制候选 1.7.7 文档后直接宣称兼容。

官方依据已重新打开：[SDK](https://github.com/modelcontextprotocol/typescript-sdk)、[协议](https://modelcontextprotocol.io/specification/2026-07-28)、[Better Auth MCP](https://better-auth.com/docs/plugins/mcp)、[CIMD](https://better-auth.com/docs/plugins/cimd)、[Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)、[Claude Code MCP](https://code.claude.com/docs/en/mcp)。

## 协议和 provider 可重复试验

- `pnpm nx run cloud-auth:test`：9 files / 49 tests 通过，包含新增 8 项 spike tests。
- `pnpm nx run cloud-auth:lint`：通过；4 项 warning 位于原有文件。
- `pnpm nx run cloud-auth:typecheck`：通过（包括依赖构建）。该 target 按仓库配置排除 spec；测试由 Vitest 执行。
- 首次协议运行失败确认了缺失 header 与默认 legacy 握手问题；修正 fixture 为 client `versionNegotiation: { mode: { pin: '2026-07-28' } }`，HTTP 带 `MCP-Protocol-Version`、`Mcp-Method`，`tools/call` 的 `Mcp-Name` 镜像 `params.name`。
- 2026 discovery/call、output schema、非法 name mirror、未来 revision、非法 input、Origin 拒绝通过。SDK `legacy: 'reject'` 拒绝 2025 initialize；官方 `legacy: 'stateless'` fixture 支持 2025 initialize，响应为请求内 SSE。无自建 shim。
- `bearer()`、原第一方 `deviceAuthorization()`、`jwt()`、`mcp()`、`cimd()` 共存通过；没有重复注册 `oauthProvider()`。第一方 Session token 访问 MCP 被拒绝；其他 device client 被拒绝。
- fixture resource `https://api.memo.test/mcp`，issuer `https://api.memo.test/api/auth`；provider API 得到 `/oauth2/authorize`、`/oauth2/token`、S256、CIMD supported；无对外 DCR registration endpoint。
- protected metadata 的 resource path alias `/.well-known/oauth-protected-resource/mcp` 实测通过。host 在 EAG-04 必须挂载 issuer-inserted authorization metadata 路由，不能只挂 `/api/auth/*`。
- 注册 public client 缺少 PKCE 被拒绝；非法 redirect 返回同 origin 的错误回跳，不能跳到攻击者 origin。fixture 锁定的实际错误是 `invalid_redirect`。
- MCP 默认 30s refresh overlap 与严格 reuse 是不同策略；fixture 显式设 `refreshTokenReuseInterval: 0`、access TTL 600s，实际 refresh/并发/重启证据留给 EAG-04。

## Schema 和在线 grant 边界

锁定 provider 有 `oauthClient`、`oauthResource`、`oauthClientResource`、`oauthAccessToken`、`oauthRefreshToken`、`oauthConsent`、`oauthClientAssertion`，另有 JWT `jwks`。resource 初始化即需要存储。`oauthClientResource.resourceId` 实际引用 canonical resource identifier，不能填资源行的随机 ID。

Consent 存储包含 `clientId`、`userId`、`referenceId`、`resources`、`scopes`。本轮没有证明 JWT 内置稳定 connection/grant ID；不能用 JWT `jti`、session ID 或 requestId 充当 grant。EAG-04 需实现持久连接关联、当前 consent/grant/account 在线检查及撤销。`requireMcpAuth` 本地验签不能独自兑现即时撤销。

测试 provider 用 memoryAdapter 仅验证 API/schema，**不证明数据库事务、refresh 原子性、账户关闭、持久撤销或生产认证**。这些仍未实现/验证。

## 真实 CLI 发起证据及限制

可重现入口：`pnpm nx run cloud-auth:spike:eag-client-profile`。它只监听随机 loopback 端口，用隔离测试 provider，不含真实账户或业务数据，退出即关闭。按打印的 URL 替换以下地址。

```bash
codex -c 'mcp_servers.eag_profile.url="http://127.0.0.1:<port>/mcp"' mcp login eag_profile --no-browser --scopes goals:read --oauth-client-registration cimd
CLAUDE_CONFIG_DIR=/tmp/eag-claude-profile claude mcp add --transport http --scope user eag_profile http://127.0.0.1:<port>/mcp
CLAUDE_CONFIG_DIR=/tmp/eag-claude-profile claude mcp login eag_profile --no-browser
```

实测 resource 是 `http://127.0.0.1:36473/mcp`（端口每次变化）：

| 客户端      | 实际 client_id                                        | 实际 callback                     | 授权参数                              |
| ----------- | ----------------------------------------------------- | --------------------------------- | ------------------------------------- |
| Codex       | `https://chatgpt.com/oauth/codex/client.json`         | `http://127.0.0.1:42577/callback` | S256、goals:read、resource            |
| Claude Code | `https://claude.ai/oauth/claude-code-client-metadata` | `http://localhost:54745/callback` | S256、goals:read tasks:read、resource |

两真实 CLI 均由服务 discovery 生成 CIMD 授权 URL。provider 使用官方 SSRF 安全 fetch 接受以上 metadata/callback，返回去 login 的结构化 redirect；未绕过 TLS。CLI 授权在等待用户阶段取消，未获得真实 OAuth access token，未调用业务工具。Claude 用临时 `CLAUDE_CONFIG_DIR`，Codex 用临时 `-c` 覆盖；没有改动用户永久 MCP 配置。原始 state/challenge/secret 不进入文档。

因此：**授权发起已验证；登录/注册/consent/callback/code exchange/refresh/revoke 与实际 CLI 的 2026 tools 调用均尚未验证**。不能据此关闭 EAC-04 或 EAG-05，也不能据此打开 legacy 公共兼容。先保持 2026 strict，正式 profile 由 EAG-04/05 实际调用决定。

## Owner baseline

CodeGraph 定位：`GoalApplicationPort`、`TaskApplicationPort`、`CloudSessionCapability`；nx-mcp `nx_project_details` 核对四项目 targets。

- `pnpm nx run-many -t test -p cloud-auth goal task --outputStyle=static`：三个 targets 通过。
- Goal create/get/list/search characterization：4 files / 31 tests 通过。
- Task Plan/Occurrence read、completion characterization：3 files / 32 tests 通过；Prompt complete-only 不把 suggestedValue 转成事实。
- Goal 当前 `listGoals`/`searchGoals` 全量读取后过滤，`listGoals` 甚至仅填写 pagination 而不限制结果。EAG-02 必须先补数据库有界查询 seam；不能将当前 REST 结果包壳后发布 search tool。

EAG-01 的 SDK/provider fixture 与 CLI 发起子项已实现并验证；真实 OAuth journey、持久 grant 和 CLI tools profile 未完成，归属 EAG-04/05。EAG-02 可以使用已核验 SDK 和 Goal port 实施 PAT 受控试点，不能宣称公共 OAuth read 版本完成。
