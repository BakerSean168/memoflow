---
tags: [guide, development, mcp, oauth]
description: Codex 和 Claude Code 的只读 OAuth 连接、授权与撤销
created: 2026-10-07T00:00:00Z
updated: 2026-10-07T00:00:00Z
---

# External Agent OAuth 只读连接

OAuth 与 [PAT](./external-agent-pat.md) 共存。OAuth 让用户登录 MemoFlow 后，明确授权 Codex 或 Claude Code 读取自己的 Goal 和 Task；GitHub 仍只是 MemoFlow 的一种登录方式。当前支持六个只读工具，不支持创建、修改或完成任务。实现证据见 [EAG-04](../../analysis/2026-10-07-eag-04-oauth-read-evidence.md)。

## 部署配置

默认关闭 OAuth。受控环境需要同时配置：

```dotenv
EAG_READ_PILOT_ENABLED=1
EAG_OAUTH_ENABLED=1
EAG_TASK_READ_ENABLED=1
EAG_AUDIENCE=https://api.example.com/mcp
AUTH_BASE_URL=https://api.example.com/api/auth
MEMOFLOW_WEB_URL=https://app.example.com
CORS_ORIGIN=https://app.example.com
```

`EAG_CURSOR_SECRET` 使用私密的至少 32 字符随机值。数据库 schema 必须包含 OAuth Provider 与 ExternalAgentConnection 模型；沿用仓库 migrator/本地 Docker 流程。Web 的 `/api/auth` 和 `/api/v1` 应代理到同一个 API，授权服务器 metadata 和 `/mcp` 应能在 `EAG_AUDIENCE` 对应 API origin 访问。

`EAG_OAUTH_CLIENT_IDS` 是逗号分隔的精确 HTTPS CIMD URL，缺省只允许：

- `https://chatgpt.com/oauth/codex/client.json`
- `https://claude.ai/oauth/claude-code-client-metadata`

CIMD 不代表软件可信背书。添加其他客户端前应核实身份与回调策略；DCR 默认关闭。仅本机验证允许 loopback HTTP，例如 API `http://127.0.0.1:20201`、Web `http://127.0.0.1:20200`；远程使用 HTTPS。不要使用通配 callback。

## 客户端连接

已验证 Codex 0.160.1 和 Claude Code 2.1.290。将实际 MCP URL 保存为 `MEMOFLOW_MCP_URL`：

```bash
codex mcp add memoflow --url "$MEMOFLOW_MCP_URL"
codex mcp login memoflow --scopes goals:read,tasks:read,offline_access

claude mcp add --transport http --scope user memoflow "$MEMOFLOW_MCP_URL"
claude mcp login memoflow
```

浏览器中登录 MemoFlow、验证邮箱，核对应用名称和 client ID，然后点击「允许只读访问」。SSH/无图形环境可使用各客户端的 `--no-browser`，按 CLI 提示完成 loopback 回调；不要把 callback URL、code 或 token 贴进日志或聊天。

授权范围为 `goals:read`、`tasks:read`；`offline_access` 表示允许通过 refresh token 保持连接。省略它就不会获得 refresh token。access token 有效期 10 分钟，refresh rotation 允许 30 秒同请求重试，连接最长 90 天。登录后可读取 `goal_get`、`goal_search`、`task_plan_get`、`task_plan_search`、`task_occurrence_get`、`task_occurrence_list`；列表参数和分页规则见 PAT 指南。

## 查看和撤销

进入「设置 → 账户与隐私 → 已连接的应用 / 外部 Agent」，查看应用、授权范围、最近使用时间和到期时间，点击对应应用的「撤销」。撤销后开始的调用和 refresh 立即失效；重新连接会要求新的授权生命周期，旧 token 不会恢复。PAT 在同一位置独立管理。

401 通常表示凭据缺失、过期或连接已撤销；403 `insufficient_scope` 表示该工具不在当前授权内。返回客户端重新连接并核对 Consent。账户关闭、当前 consent 缩减和服务端客户端禁用同样会阻止访问。不要把第一方 Web/Desktop session token 配成 MCP Bearer。

关闭 `EAG_OAUTH_ENABLED` 或整个 read pilot 会停止对应接入；如需保留明确的撤销记录，应在关闭前使用连接管理撤销。本指南不表示已经完成公共部署，生产 rollout 仍走仓库 release workflow。
