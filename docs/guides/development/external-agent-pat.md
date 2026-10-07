---
tags: [guide, development, mcp]
description: 受控 PAT 只读 MCP 的本地连接与 scope 配置
created: 2026-10-07T00:00:00Z
updated: 2026-10-07T00:00:00Z
---

# External Agent PAT 只读连接

本车道保留 PAT 与六个只读工具；常规 Agent 连接另见 [OAuth 指南](./external-agent-oauth.md)。PAT 验证状态见 [EAG-03 证据](../../analysis/2026-10-07-eag-03-task-read-evidence.md)。默认关闭 Gateway，受控开发入口为 `http://127.0.0.1:20201/mcp`，只适用于同机客户端。

在既有 `docker-compose.local.yml` prod-like 车道中配置 `EAG_READ_PILOT_ENABLED=1`、`EAG_AUDIENCE=http://127.0.0.1:20201/mcp` 和私密的至少 32 字符 `EAG_CURSOR_SECRET`，沿用 [本地 Docker 流程](./local.docker.md)。Task 注册由 `EAG_TASK_READ_ENABLED` 控制，默认开启；设为 0 可回退至 Goal 两工具。

用已验证邮箱的第一方登录会话，在可信 Web Origin 下调用 `POST /api/v1/agent-connections/pats`：

也可以在 Web 的「设置 → 账户与隐私 → 已连接的应用 / 外部 Agent」创建、查看和撤销 PAT；当前有效期为 7 天，密钥只在创建后显示一次。

```json
{ "name": "personal-read", "expiresInDays": 7, "scopes": ["goals:read", "tasks:read"] }
```

响应中的 `data.secret` 只返回一次。缺省 scopes 为 goals:read；必须显式选择 tasks:read 才能使用 Task 四工具。第一方 session token 不能用作 MCP PAT。`GET /api/v1/agent-connections/pats` 列出凭据元数据；`DELETE /api/v1/agent-connections/pats/:id` 撤销，后续调用立即拒绝。

将 PAT 放入本地私密环境变量 `MEMOFLOW_PAT`，Codex 的配置为：

```toml
[mcp_servers.memoflow]
url = "http://127.0.0.1:20201/mcp"
bearer_token_env_var = "MEMOFLOW_PAT"
tool_timeout_sec = 30
```

`bearer_token_env_var` 是 [Codex 官方 MCP 配置](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) 支持的显式 Bearer 配置，无需 OAuth 登录步骤。当前证据使用官方 MCP SDK；不将其等同于真实 Codex/Claude OAuth 登录验收。

工具：goal_get、goal_search、task_plan_get、task_plan_search、task_occurrence_get、task_occurrence_list。列表 limit 为 1～100，默认 20；nextCursor 必须连同原筛选和 limit 使用。Occurrence startDate/endDate 为 epoch 毫秒，最长 31 天，按照当前账户时区查询已有事实；分页固定 asOf，时区改变后应重新从第一页查询。
