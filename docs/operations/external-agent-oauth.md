---
tags: [guide, development, mcp, oauth]
description: ChatGPT Web、Codex 和 Claude Code 的 OAuth 连接、授权、读写开关与撤销
created: 2026-10-07T00:00:00Z
updated: 2026-11-24T00:00:00Z
---

# External Agent OAuth 连接

OAuth 与 [PAT](./external-agent-pat.md) 共存。OAuth 让用户登录 MemoFlow 后，明确授权 ChatGPT Web、Codex 或 Claude Code 访问自己的 MemoFlow 数据；GitHub 仍只是 MemoFlow 的一种登录方式。读写复用同一组 12 个 scope：读和写互不隐含，写能力由 `EAG_OAUTH_WRITE_ENABLED` 控制（[#1054](https://github.com/BakerSean168/memoflow/issues/1054)）。机制与审计要求见 [OAuth 写 consent 设计评估](../internals/external-agent-oauth-write-consent.md)。实现证据见 [EAG-04](https://github.com/BakerSean168/memoflow/blob/7a45112e1840950ead1ba98b748fc70fa1b38344/docs/analysis/2026-10-07-eag-04-oauth-read-evidence.md)。

## 部署配置

默认关闭 OAuth 与 OAuth 写。受控环境需要同时配置：

```dotenv
EAG_READ_PILOT_ENABLED=1
EAG_OAUTH_ENABLED=1
EAG_TASK_READ_ENABLED=1
EAG_AUDIENCE=https://api.example.com/mcp
AUTH_BASE_URL=https://api.example.com/api/auth
MEMOFLOW_WEB_URL=https://app.example.com
CORS_ORIGIN=https://app.example.com
# 需要 OAuth 写时；依赖 EAG_WRITE_ENABLED=1，默认 0
EAG_WRITE_ENABLED=1
EAG_OAUTH_WRITE_ENABLED=1
```

`EAG_OAUTH_WRITE_ENABLED=0` 时写 scope 不可授予；已经发出的 token 仍可读，但写/assisted 工具不发布，写事务也会拒绝。改回 `0` 并重启 API 即可回滚，读与 PAT 不受影响。

`EAG_CURSOR_SECRET` 使用私密的至少 32 字符随机值。数据库 schema 必须包含 OAuth Provider 与 ExternalAgentConnection 模型；沿用仓库 migrator/本地 Docker 流程。Web 的 `/api/auth` 和 `/api/v1` 应代理到同一个 API，授权服务器 metadata 和 `/mcp` 应能在 `EAG_AUDIENCE` 对应 API origin 访问。

`EAG_OAUTH_CLIENT_IDS` 是逗号分隔的精确 HTTPS CIMD URL，缺省只允许：

- `https://chatgpt.com/oauth/client.json`（ChatGPT Web / Plugins）
- `https://chatgpt.com/oauth/codex/client.json`
- `https://claude.ai/oauth/claude-code-client-metadata`

CIMD 不代表软件可信背书。添加其他客户端前应核实身份与回调策略；DCR 默认关闭。仅本机验证允许 loopback HTTP，例如 API `http://127.0.0.1:20201`、Web `http://127.0.0.1:20200`；远程使用 HTTPS。不要使用通配 callback。客户端如何即时注册、何时需要预置种子、如何停用与回滚，见 [Gateway「OAuth 投产」](../internals/external-agent-gateway.md#11-oauth-投产)。

## ChatGPT Web 插件连接（#1060）

ChatGPT Web 是独立 MCP 客户端，不使用 Codex CLI 的 `https://chatgpt.com/oauth/codex/client.json`。标准 CIMD client ID 为 `https://chatgpt.com/oauth/client.json`，稳定回调为 `https://chatgpt.com/connector_platform_oauth_redirect`；稳定回调要求 MemoFlow 的 `issuer` 与 `authorization_servers` 完全一致并在每个授权响应回传 `iss`（RFC 9207）。若工作区改用回调专用模式，ChatGPT 会换成 `https://chatgpt.com/oauth/{callback_id}/client.json` 与 `https://chatgpt.com/connector/oauth/{callback_id}`，先从插件管理页核对**精确 client ID、metadata 文档和 redirect URI**，再单独添加到 `EAG_OAUTH_CLIENT_IDS`；不能加入 `chatgpt.com` 通配符、callback 前缀通配或随意预置不受控 redirect URI。CIMD 首次授权会按文档自动创建 OAuth client 行，不需要向数据库写入 ChatGPT 的密钥。

在具有自定义 MCP 插件权限的 ChatGPT Web 工作区：

1. 打开 Plugins → `+` → Add custom MCP server，填写 MemoFlow 的**公网 HTTPS** `https://<api-host>/mcp`；选择 OAuth 和 CIMD 客户端注册，不要填写 PAT、用户登录 Cookie、服务端密钥或 `localhost`。
2. 在 MemoFlow 登录页使用已验证邮箱的本人账号。首次连接先授权 `goals:read` / `tasks:read`，建议同时允许 `offline_access` 以便 refresh；在 ChatGPT 中先执行 `goal_search` 与 `task_plan_search`。发现工具或 Token 认证成功不代表写权限已生效。
3. 需要创建或修改目标、任务时，在 API 上启用 `EAG_WRITE_ENABLED=1` 与 `EAG_OAUTH_WRITE_ENABLED=1` 并重新授权 `goals:write` / `tasks:write`。确认授权页面列出的客户端域名、精确 client ID 和副作用，仅勾选必要的权限。调用 `goal_create` / `task_plan_create` 成功须回显 durable receipt，使用 `goal_get` / `task_plan_get` 回读；最后核查 Desktop 的 PowerSync 同步。
4. 授权或写入失败时先检查 `/mcp` HTTPS / Host、授权服务器与 protected-resource metadata、CIMD allowlist、scope / consent 和各开关；`issuer` 不一致、缺少 `iss` 或 `authorization_response_iss_parameter_supported` 未生效会让 ChatGPT 拒绝回跳。`EAG_OAUTH_WRITE_ENABLED=0` 会隐藏 OAuth 写工具并拒绝写入，但不影响读操作。ChatGPT 连接配置需在 ChatGPT 插件管理界面由用户完成，服务器部署无法代替用户完成 OAuth 同意。

官方参考：[ChatGPT MCP 认证要求](https://developers.openai.com/plugins/build/auth) 和 [在 ChatGPT 中连接自定义 MCP](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt)。`EAG_CIMD_E2E=1` 下的 `external-agent-oauth-provisioning.integration.test.ts` 可针对官方 ChatGPT / Claude 的真实 CIMD 文档执行隔离数据库验证；ChatGPT CIMD 会注册为 `private_key_jwt` 客户端，因此隔离测试仅验证真实元数据注册以及无签名 token 兑换被拒绝；真实 ChatGPT 必须通过签名的客户端断言完成 token 兑换。此测试不等于 ChatGPT Web 完整交互或实际生产部署验收。

## 客户端连接

已验证 Codex 0.160.1 和 Claude Code 2.1.290。将实际 MCP URL 保存为 `MEMOFLOW_MCP_URL`：

```bash
codex mcp add memoflow --url "$MEMOFLOW_MCP_URL"
codex mcp login memoflow --scopes goals:read,tasks:read,goals:write,tasks:write,offline_access

claude mcp add --transport http --scope user memoflow "$MEMOFLOW_MCP_URL"
claude mcp login memoflow
```

浏览器中登录 MemoFlow、验证邮箱，核对应用名称、**精确域名**和 client ID，按域勾选读取/写入后确认。写权限默认不勾选；也可以点「仅允许只读」降级。SSH/无图形环境可使用各客户端的 `--no-browser`，按 CLI 提示完成 loopback 回调；Claude Code 2.1.290 仍要求交互终端，SSH 使用 `ssh -t`，不能将其登录输入接到普通 pipe；不要把 callback URL、code 或 token 贴进日志或聊天。

授权范围由 consent 决定：`goals:read`、`tasks:read` 等读 scope 只允许读取；`goals:write`、`tasks:write`、`routines:write`、`notifications:write` 只在 `EAG_OAUTH_WRITE_ENABLED=1` 时可授予。完成 Task 可能按既有配置改变 Goal 进度；`routines:write` 含永久删除。`offline_access` 表示允许通过 refresh token 保持连接，省略它就不会获得 refresh token。access token 有效期 10 分钟，refresh rotation 允许 30 秒同请求重试，连接最长 90 天。登录后可用的工具由授权 scope 决定，列表参数和分页规则见 PAT 指南。

## 查看和撤销

进入「设置 → 账户与隐私 → 已连接的应用 / 外部 Agent」，查看应用、授权范围、最近使用时间和到期时间，点击对应应用的「撤销」。撤销后开始的调用和 refresh 立即失效；重新连接会要求新的授权生命周期，旧 token 不会恢复。PAT 在同一位置独立管理。

401 通常表示凭据缺失、过期或连接已撤销；403 `insufficient_scope` 表示该工具不在当前授权内。返回客户端重新连接并核对 Consent。账户关闭、当前 consent 缩减和服务端客户端禁用同样会阻止访问。不要把第一方 Web/Desktop session token 配成 MCP Bearer。

关闭 `EAG_OAUTH_WRITE_ENABLED` 只停写，读保持可用；关闭 `EAG_OAUTH_ENABLED` 或整个 read pilot 会停止对应接入。如需保留明确的撤销记录，应在关闭前使用连接管理撤销。本指南不表示已经完成公共部署，生产 rollout 仍走仓库 release workflow。
