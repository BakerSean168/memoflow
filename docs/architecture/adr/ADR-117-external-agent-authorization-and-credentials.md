---
tags: [adr, mcp, oauth, security, cloud-auth]
description: OAuth 委托授权与 scoped PAT 分离于第一方登录 session，并维持 owner 访问控制
created: 2026-10-07T00:00:00Z
updated: 2026-10-07T00:00:00Z
---

# ADR-117: External Agent Authorization 与 Credential 边界

**状态：** 已采纳授权边界；Better Auth 1.7.6 MCP/CIMD/JWT fixture 及真实 CLI 授权发起已验证，scoped PAT 持久 authority、撤销/关闭/scope/expiry 和并发配额已实现并通过真实数据库测试；PAT 显式支持 goals:read/tasks:read，默认仅 goals:read；OAuth 持久授权与真实客户端 journey 按用户本次范围明确延期，尚未实现/验证。
**日期：** 2026-10-07
**关联：** ADR-036、ADR-039、ADR-045、ADR-104、ADR-105、ADR-116、ADR-118

## Context

当前 Better Auth 提供 Web Cookie、Desktop Bearer session 与仅接受 `memoflow-desktop` 的 device authorization。它们解决第一方登录，不等价于面向第三方客户端的 scoped access token。GitHub OAuth 登录也不意味着 MemoFlow 已是外部 Agent 的 OAuth Authorization Server。

外部客户端需要发现授权入口、让用户登录或注册、选择访问范围、更新凭据及撤销连接。客户端展示的确认框与 MCP tool annotations 都不能作为服务器授权证据。

## Decision

### OAuth 是默认连接体验，PAT 服务个人自动化

- 公共 Hosted MCP 使用 OAuth authorization code + PKCE S256，提供受保护资源元数据和授权服务器元数据。浏览器完成 MemoFlow 登录/注册与 consent；不提供匿名 `account_create` MCP tool。
- 授权服务器复用 Cloud Auth 的身份和账户状态检查。优先验证 Better Auth 当前官方 OAuth Provider/MCP 集成，不自行实现 OAuth 签名、code exchange 或 PKCE。
- OAuth 客户端身份优先采用当前规范的 CIMD 与受控预注册；DCR 若确实为指定客户端版本所需，作为显式兼容选项评估，不能默认为无限开放注册。
- PAT 为独立高熵 opaque credential，绑定 owner、name、scope、MCP audience、expiry、revokedAt；仅创建时展示 secret，数据库只保存不可逆摘要和可识别前缀。不能复制现有 session token 当 PAT。
- 私有试点允许先用短期只读 PAT 打通真实 owner；公共上线仍以 OAuth 验收为前提。PAT 的完整管理 UI 后续补齐，试点至少有受 session 保护的创建、列表、撤销入口与审计。

### 身份、授权、业务权限各有 owner

```text
Cloud Auth identity + Active Account
  -> verified external credential / grant
  -> audience + expiry + scope + revocation
  -> capability-specific authorization
  -> owner resource ownership + business validation
```

可信入口生成 `identityId`；客户端不能提交 owner、身份、system source 或任意授权 scope。MCP Cookie 不作为 tool 调用凭据。OAuth consent 页面可以使用第一方 Cookie，但其 CSRF、回跳 URL 与 tool 调用链严格分离。

MCP access token 只被 MCP resource audience 接受；现有 REST session API 不接受它，MCP 也不接受第一方 session。将来若推出 scoped REST Developer API，另行定义 resource/audience，不通过 token passthrough 复用。PAT 同样执行 audience 限制。

### Scope 与撤销具有服务端意义

- 首批授权分别为 `goals:read`、`tasks:read`，写 scope 不隐含读 scope。后续按真实 owner 增加 `goals:write`、`tasks:write` 等。
- 复合查询必须具备其全部数据 scope；不能授权后再依赖 UI 隐藏。业务派生影响及跨 owner scope 见架构规格，不能依赖 Agent 自报 risk。
- 失效、撤销、账户关闭、scope 缩减都在每次请求入口生效，包括 `tools/list`、长任务查询和恢复。JWT 本地验签不能单独兑现即时撤销；首版增加在线 grant/account 状态检查，存储不可用则拒绝执行，避免跨请求授权缓存。
- access token 使用短 TTL，refresh token 采用 provider 的 rotation/reuse detection；grant 撤销同时禁止 refresh。建议初始 TTL 为 10 分钟、PAT 默认 30 天且上限 90 天，属于产品配置提案，EAG-01 验证 provider 支持后固化。
- 撤销保证“撤销成功后开始的请求被拒绝”。已经被 owner 接受并提交的命令不回滚；尚未提交的长期工作按 ADR-118 在继续执行前重新检查授权。

### SSRF 和回跳地址不是普通配置字符串

redirect URI 精确匹配注册值；仅按原生客户端标准处理 loopback 特例，禁止通配回跳。CIMD URL/远程元数据读取使用 SSRF 防护（HTTPS、解析后 IP 限制、重定向复检、超时和大小限制）；不把用户输入 issuer/resource URL 当作任意可抓取地址。Host/Origin 校验、可信代理与实际部署域名共同配置。

## Considered Options

- **只提供永久 API key**：不足以支持可撤销的第三方委托、范围可见性与默认登录体验。
- **直接接受 Web/Desktop session**：权限过大且没有连接粒度，扩大凭据泄露影响。
- **只靠 JWT 过期来撤销**：简单但存在整个 TTL 的授权窗口，不符合连接撤销体验；首版选择在线检查。
- **自建完整 OAuth Server**：不必要的协议和安全维护成本；采用经过兼容测试的现成实现。

## Consequences

需要新增 External Agent Connection/Grant、PAT 管理和清晰的用户撤销入口；这些属于 Cloud Auth/delegated access，不属于 AI Provider 配置。第三方 metadata 与 OAuth 错误由 ACL 清洗，不进入 owner domain。

官方依据与 SDK/provider 版本约束见 [协议研究](../../analysis/2026-10-07-external-agent-protocol-research.md)。上线验收必须包含两个不同账户与真实 Codex/Claude Code 客户端，不能用单一 curl 成功代替。

实施证据：[EAG-01 兼容报告](../../analysis/2026-10-07-eag-01-compatibility-evidence.md)。JWT 验签不能替代当前 grant/账户在线检查；CLI 授权发起不能替代完整 OAuth 验收。
