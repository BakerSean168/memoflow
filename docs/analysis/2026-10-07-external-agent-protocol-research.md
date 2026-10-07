---
tags:
  - analysis
  - architecture
  - mcp
  - authentication
description: MemoFlow External Agent Gateway 的官方协议、SDK、认证与客户端互操作研究
created: 2026-10-07T00:00:00Z
updated: 2026-10-07T00:00:00Z
---

# External Agent Gateway：协议与认证研究

状态：研究完成；作为架构提案的证据，不表示 Gateway 已实现或客户端已验收。

核验日期：**2026-10-07**。下文所有外部链接均在本次实际打开；版本结论仅代表该日的官方资料。
来源限于 MCP 规范/官方 SDK、Better Auth、OpenAI、Anthropic 和产品官方文档。
“标准事实”“产品选择”“待实测”分别表示规范约束、MemoFlow 建议和尚未取得的运行证据。

## 1. 结论与原讨论的修正

原讨论的方向成立：外部 Agent 通过协议适配调用 Owner Application；不必经过 MemoFlow Assistant，也不应通过 Native Edit Session 模拟网页编辑。
协议版本方面，原讨论并未过时，但认证和兼容边界需要补全。

| 原断言                        | 核验结果                                       | 对实施的影响                                                                  |
| ----------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------- |
| 最新 MCP 是 `2026-07-28`      | 官方 `specification/latest` 实际重定向到该版本 | ADR 可以选定此基线，实施时锁定 SDK 版本                                       |
| TypeScript SDK v2 stable      | 官方仓库明确标为 stable release line           | 使用 v2 独立包，不能照抄 v1 单包示例                                          |
| Stateless core / MRTR         | 成立；2026 协议不再以 `initialize` 建立会话    | 身份、版本、能力按请求处理；业务状态仍需持久化                                |
| Tasks 适合 Durable Workflow   | 成立，但 Tasks 是扩展                          | 不能假设所有 MCP 客户端都支持，也不能直接照搬旧 Tasks API                     |
| Legacy HTTP+SSE deprecated    | 成立                                           | 不新建旧双端点 SSE 服务；Streamable HTTP 仍允许请求内 SSE                     |
| OAuth + PKCE 足够定义连接方案 | 不完整                                         | 必须定义 metadata discovery、resource audience、client registration、撤销语义 |

版本依据：[当前规范入口](https://modelcontextprotocol.io/specification/latest)、[2026-07-28 发布说明](https://blog.modelcontextprotocol.io/posts/2026-07-28/)、[官方 TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)。

额外变化：**DCR 也已被 2026 规范弃用**，新集成应优先 CIMD；有已注册客户端信息时优先使用该信息。DCR 只是可选兼容路径，不是 OAuth 的必备组件。[Client Registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration)

“外部 ready 70%”没有可重复测量的验收口径，不宜进入 ADR。更准确的状态是：Owner 能力存在；协议端点、外部授权边界和客户端联调证据尚待建设。

## 2. 协议与 SDK 基线

### 2.1 标准事实

Streamable HTTP 使用单个 MCP endpoint，每条客户端消息独立 POST；结果可为 JSON 或当前请求的 SSE 流。
协议 metadata 在消息 `_meta` 中，并由 HTTP headers 镜像；headers/body 不一致必须按规范拒绝，不能只相信 `Mcp-Name` 决定授权。
存在但不合法的 `Origin` 必须返回 403；无 Origin 的 CLI 请求仍执行正常认证。[Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)

“Stateless”只描述协议会话。OAuth grants、审计、幂等记录、Workflow Run 都是业务/安全状态；这不要求删除它们，也不赋予进程内 Map 持久性。[Transport Overview](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)

### 2.2 SDK 选型与兼容选择

v2 包名是 `@modelcontextprotocol/server`、`@modelcontextprotocol/client`，另有 `@modelcontextprotocol/core`；Node/Express 集成可使用 `@modelcontextprotocol/node` / `@modelcontextprotocol/express`。
v1 的 `@modelcontextprotocol/sdk` 是不同发布线。[官方 SDK 包布局](https://github.com/modelcontextprotocol/typescript-sdk)

v2 HTTP 入口 `createMcpHandler(factory)` 默认 `legacy: 'stateless'`，同一 factory 可处理 2026 请求及部分 2025 时代请求；`legacy: 'reject'` 明确拒绝旧协议。
2026 读取每次请求携带的 client capabilities；不能依赖旧 `initialize` 缓存。
旧协议无状态 HTTP 的交互返回通道受限，不能据此承诺 MRTR/elicitation 等价兼容。[v2 迁移与兼容指南](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28)

**产品选择：**新 Gateway 以 2026 协议为目标；是否开启 SDK 的旧协议适配由 Codex/Claude 实测矩阵决定。只读工具先证明互操作；不为推测中的旧客户端自建协议 shim。
Better Auth 的 2026 MCP 示例选择 `legacy: 'reject'`；那是该集成 profile 的明确选项，不代表 SDK 默认如此。[Better Auth MCP](https://better-auth.com/docs/plugins/mcp)

## 3. OAuth、身份与权限

### 3.1 必须区分的角色

- MCP Server 是 OAuth Resource Server；Codex/Claude 是 OAuth Client。
- Better Auth 可担任 Authorization Server，复用现有登录/注册体验。
- 浏览器 Session 证明用户登录；OAuth access token 表示某 client 获得的受限委托。
- 登录 GitHub 的 OAuth 配置不等于 MemoFlow 已成为外部客户端的 OAuth Provider。

这些角色可部署在一个进程，也可分开；规范不要求独立微服务。[Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)

### 3.2 Discovery 和注册

受保护端点以 401 和 `WWW-Authenticate` 指向 RFC 9728 Protected Resource Metadata。
资源 metadata 给出授权服务器；授权服务器提供 RFC 8414 metadata 或 OIDC discovery。不能假设它总是位于同主机固定 `/authorize` 路径。[Authorization Server Discovery](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery)

产品注册策略建议：CIMD + 管理的预注册客户端；默认关闭开放 DCR。
CIMD 是 HTTPS URL 形式的 `client_id`，不是认证凭证或“官方客户端已验证”的保证；还需 PKCE、redirect 校验与用户 consent。
MCP 2026 固定 CIMD draft-00，而通用 CIMD 已继续演进；必须选择匹配 profile。[Client Registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration)、[Better Auth CIMD](https://better-auth.com/docs/plugins/cimd)

### 3.3 Token 与 redirect 安全

PKCE 使用 S256，metadata 要广告相应支持；客户端校验授权响应 issuer。
授权请求和 token 请求均传 `resource`，对应 Gateway canonical resource URI。
Gateway 校验签名/issuer/audience/expiry；public client refresh token 轮换；redirect 精确匹配，原生客户端合法 loopback 动态端口按对应规则处理。[Authorization Security](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations)

不得把传入 MCP token 原样透传至另一个 API，也不得拿第一方 Session token 充当 scoped MCP token。
同进程调用 Owner Application 时传已验证的 Principal/ExecutionContext；跨服务调用时另行定义可信服务边界。[Token Passthrough](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices)

### 3.4 Scope、撤销与审批是产品契约

**产品选择：**scope 是能力上限，最终授权仍是 scope ∩ 当前账户/工作区权限 ∩ 对象 ownership ∩ 产品 policy。
`tools/list` 应按有效能力过滤；直接构造 `tools/call` 仍逐次检查。业务 not-owned 不能通过重新 consent 获得权限。
为需要提升 scope 的操作返回规范的 `insufficient_scope`；初次只请求最小 read scope。[Scope Selection / Step-up](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)

**产品选择：**明确撤销 SLA。仅校验 JWT 不保证 consent 撤销立即生效；不能把“refresh token 已撤销”写成“所有 access token 已失效”。
需要短 access-token TTL 与在线 grant/account 状态检查，或定义可测的失效窗口。PAT 独立查询撤销状态。
此结论来自 JWT 本地验证模型；具体 grant 标识和缓存实现需要对锁定版本验证。[Better Auth MCP 验证行为](https://better-auth.com/docs/plugins/mcp)

客户端弹确认框、MCP tool annotation、MRTR 中 `action: accept` 都不能单独作为 MemoFlow 服务端的审批事实。
普通写操作可以由用户事先授予 write scope；必须逐次审批的操作则需要 MemoFlow 自己持久化、绑定参数和主体、可一次消费的审批记录。这是产品选择，不是 MCP 自动提供的能力。

## 4. Better Auth 可以复用什么

### 4.1 仓库现状

[`cloud-auth.ts`](../../packages/cloud-auth/src/server/cloud-auth.ts) 配置 `bearer()` 与 `deviceAuthorization()`，device client 固定为 `memoflow-desktop`、10 分钟过期、5 秒轮询。
[`cloud-auth/package.json`](../../packages/cloud-auth/package.json) 锁定 `better-auth` / Prisma adapter `1.7.6`；本次访问官方插件页标为 `1.7.7`。
因此官网 API 是候选集成依据，不能假定锁定的本地版本已具有全部相同 helper。

`bearer()` 把 Session 认证放进 Authorization header，未把 Session 转换为 OAuth 委托。[Better Auth Bearer](https://better-auth.com/docs/plugins/bearer)
独立 `deviceAuthorization()` 的 `/device/token` 返回 Better Auth Session token；OAuth device grant 使用 `oauthDeviceAuthorization()` 与 `/oauth2/token`，可颁发 audience/scoped OAuth token。[Better Auth Device Authorization](https://better-auth.com/docs/plugins/device-authorization)

### 4.2 建议集成方向

- `@better-auth/mcp`：基于 OAuth Provider 的 MCP 认证集成。
- `jwt()`：签名密钥/JWKS 能力。
- `@better-auth/cimd`：配置 `metadataProfile: 'mcp-2026-07-28'`。
- `@better-auth/oauth-provider`：基础 Provider；`mcp()` 已包含其职责，同一 auth instance 不再重复注册 `oauthProvider()`。

以上是当前官方组合；由 cloud-auth 拥有认证数据，MCP SDK 拥有协议/transport。[Better Auth MCP](https://better-auth.com/docs/plugins/mcp)、[OAuth Provider](https://better-auth.com/docs/plugins/oauth-provider)

CIMD fetch 是服务端访问客户端控制 URL 的边界。使用官方 Node transport 或等价机制，限制特殊用途地址、固定解析后的连接地址、拒绝重定向，设置超时/大小限制，并覆盖 metadata/JWKS 相关取回。[CIMD Security Boundary](https://better-auth.com/docs/plugins/cimd)

**EAG-01 源码纠偏（2026-10-07）：**锁定 `@better-auth/mcp` / `cimd` / `oauth-provider` `1.7.6` 的实际 provider schema 除 `oauthClient`、`oauthAccessToken`、`oauthRefreshToken`、`oauthConsent`、`oauthClientAssertion` 外，还包含 `oauthResource` 和 `oauthClientResource`；`jwt()` 另需 `jwks`。provider 初始化会 seed resource，缺少这些模型会在启动时失败。不能只按官网 MCP 页的五模型摘要生成 Prisma schema。

**待实测：**插件与现有 Prisma adapter/schema 命名、issuer/base path、Session/device routes 共存；consent 管理/撤销；refresh 并发；账号关闭后 token 拒绝；精确依赖版本和 Node/Express 适配。
这应是认证 vertical slice 的验收内容，不是写 ADR 时声称已解决。

### 4.3 PAT 和纯终端

**产品选择：**前置受控私测可以使用短期 scoped PAT；公测默认 OAuth，PAT 保留给个人脚本与自托管 Agent。
PAT 独立生成高熵密钥，只存不可逆摘要，创建时显示一次；绑定 user、resource audience、scope、expiry、revocation、审计 ID，拒绝 Web Session token 替代。
不要让未认证 MCP 提供 `account_create`；注册属于登录授权页面。

标准 MCP 客户端通常走 code + PKCE。给 MemoFlow 自己的 CLI 增加 OAuth Device Grant 是可选后续工作，不能因为服务端已有 device flow 就认为 Codex/Claude 会自动使用它。[Better Auth Device Authorization](https://better-auth.com/docs/plugins/device-authorization)

## 5. Codex / Claude Code 的连接基线

以下命令/配置是**待 Gateway 部署后的接入样例**；`example.com` 为占位地址，不是已存在的服务。

Codex 支持 remote Streamable HTTP、OAuth login 和环境变量 Bearer token；当前还支持 CIMD/DCR/预注册客户端。实际注册时保留 CLI 显示的完整 callback，不自行猜路径。[OpenAI Docs：MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)

```bash
codex mcp add memoflow --url https://api.example.com/mcp
codex mcp login memoflow
```

PAT 场景在用户本地 Codex 配置中引用环境变量：

```toml
[mcp_servers.memoflow]
url = "https://api.example.com/mcp"
bearer_token_env_var = "MEMOFLOW_MCP_TOKEN"
```

Claude Code 可使用下列命令，再运行 `/mcp` 完成浏览器授权；官方也支持 CIMD 与预注册客户端。CLI loopback redirect 曾发生版本差异，必须记录测试版本。[Claude Code MCP](https://code.claude.com/docs/en/mcp)

```bash
claude mcp add --transport http memoflow https://api.example.com/mcp
```

PAT 配置通过 `.mcp.json` 的环境变量引用传入，不写明文密钥：

```json
{
  "mcpServers": {
    "memoflow": {
      "type": "http",
      "url": "https://api.example.com/mcp",
      "headers": { "Authorization": "Bearer ${MEMOFLOW_MCP_TOKEN}" }
    }
  }
}
```

不能由“客户端支持 remote OAuth”推导“客户端所有版本已支持 2026 MRTR/Tasks”。公网、SSH devbox callback、代理和产品账号设置都属于实测矩阵；本研究没有执行 MemoFlow 连接试验。

## 6. Durable Workflow 与 MRTR / Tasks

MRTR 的 `input_required` 要求客户端重发原请求并附 `inputResponses`/opaque `requestState`，不是服务端等待 HTTP 连接中的用户回答。
requestState 必须视为攻击者可控：保护完整性，绑定主体、请求摘要、TTL；要求单次消费时服务端另行保证。
客户端未声明 elicitation 能力时不得发送该 input request。[MRTR 规范](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr)

Tasks 是 `io.modelcontextprotocol/tasks` 扩展；每个相关请求都要声明支持。主要方法是 `tasks/get`、`tasks/update`、`tasks/cancel`，不照搬旧 `tasks/list`/`tasks/result` 假设。
返回 handle 前必须 durable 且能查询；每次请求重新认证授权。cancel 是合作取消，不能承诺回滚；工具业务错误可表示为 `completed` + `isError: true`，`failed` 对应协议错误。[Tasks 2026](https://tasks.extensions.modelcontextprotocol.io/specification/2026-07-28/tasks)

**产品选择：**第一期只读、确定性写操作不依赖 Tasks/MRTR。后续高级工具返回/映射真实 Workflow Run，保留 Owner revision、审批与恢复语义；不能将 UI-only submit 假定为服务端 commit。
对不支持 Tasks 的客户端，可提供普通的 `workflow_get/resume/cancel` 业务工具；这和 MCP 扩展不是同一契约。映射层不能维护第二套 Workflow 真值。

## 7. 可借鉴的产品实践

- Linear：同时提供只读 endpoint 与 read scope；这是能力隔离示例，不必复制两个 URL。[Linear MCP](https://linear.app/docs/mcp)
- Todoist：REST、SDK、CLI、MCP、webhooks 围绕同一产品对象模型；并列入口不意味着每个 REST endpoint 都要机械生成 tool。[Todoist Developers](https://developer.todoist.com/)
- Asana：MCP app token 与普通 API token 分开，明确限制 token 用途。[Asana MCP Integration](https://developers.asana.com/docs/integrating-with-asanas-mcp-server)
- Notion：MCP 继续遵守既有权限；可借鉴 owner 权限继承，不照搬其全权限授权粒度。[Notion MCP](https://www.notion.com/help/notion-mcp)

## 8. 落地前必须取得的证据

1. **协议**：记录 SDK/客户端精确版本；2026 discovery/read 成功，unsupported revision、错误 metadata headers、非法 Origin 明确拒绝。
2. **OAuth**：从 401 发现开始完成 CIMD/预注册、PKCE、登录/注册、consent、callback、refresh、撤销；拒绝错 audience、issuer、scope、redirect、复用 code。
3. **权限**：账户 A 不能读写 B；撤销后缓存/重试不能恢复权限；跨 scope 聚合查询不泄露无权子结果。
4. **Token**：PAT/Web Session/OAuth access token 严格分流；日志不含 token；账号关闭后新请求受拒绝。
5. **写入**：重试/并发重放只有一个业务结果；相同 key 不同参数拒绝；错误明确区分未提交、已提交、需要查询确认。
6. **高级能力**：仅在后续取得 MRTR/Tasks 声明、恢复、过期、取消竞态证据后开放；客户端退出不改变服务端持久业务事实。

这些检查是后续实施计划的验收输入。本轮没有安装依赖、启动 MCP 服务或执行用户授权流程。
