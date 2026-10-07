---
tags: [plan, active, mcp, oauth]
description: EAG-04 OAuth discovery、consent、refresh、撤销与连接管理
created: 2026-10-07T00:00:00Z
updated: 2026-10-07T00:00:00Z
---

# EAG-04：OAuth 与连接生命周期

状态：A～E 本地只读切片已交付。用户于 2026-10-07 在 PAT 六工具交付后批准本只读 OAuth 切片。PAT 私有接入 checkpoint 为 `320dd1ac994`；先前延期决定仅描述该 checkpoint 的范围，不再阻止本工作项。依赖：EAG-02、EAG-03。入口：[总方案](../2026-10-07-external-agent-gateway.md)、[ADR-117](../../../architecture/adr/ADR-117-external-agent-authorization-and-credentials.md)。

## 交付行为

用户从 MCP 401 challenge 进入 MemoFlow 登录/注册，确认客户端与 scopes，授权后返回外部客户端；可在设置中查看连接/PAT，并撤销其访问。

## 已批准边界与工程约束

- 业务范围只有 `goals:read`、`tasks:read` 和现有六工具；需要长期访问时明确请求及同意 `offline_access`。不开放 write、client credentials 或第三方 device grant。第一方登录和 PAT 保留。
- Better Auth 1.7.6 的 `jwt()`、`mcp()`、`cimd()` 管协议，不重复注册 `oauthProvider()`。schema 从锁定包生成；官网当前版本不是已锁定包的测试证据。
- CIMD 校验元数据和 redirect，不提供应用信誉证明。首版通过服务端配置的精确 CIMD URL 准入，预注册仅用于明确的兼容需求；DCR 关闭。使用官方 Node SSRF-safe transport，不能替换为普通 fetch。
- Cloud Auth 拥有 `ExternalAgentConnection` 的授权生命周期及 provider 关联。刷新保留 connection；撤销后新授权使用新的生命周期，旧 code/access/refresh 不得借新连接恢复。客户端名称、sessionId、requestId、JWT jti 都不是 connectionId。
- Provider 是 scope、consent、code 和 token 的真值源；Connection 只保存产品身份、关联、有效期和状态。Gateway 有效 scopes 是 token、当前 consent 和服务端允许范围的交集，并在线检查 connection、Active Account 和 owner 权限。provider payload 在 Cloud Auth 适配边界验证。
- access TTL 为 600 秒；refresh overlap 显式为 30 秒。refresh 单次 TTL 最多 30 天，connection 授权总寿命最多 90 天，刷新不延长总寿命。Consent 告知后台访问、到期和撤销。
- 撤销成功后开始的 read/list/refresh（包括 overlap 重试）立即拒绝；auth store 故障 fail closed。token 签发/轮换/重试与撤销共享可验证的数据库原子边界。锁定 provider 的 family 清理竞态必须通过宿主事务集成与真实并发测试解决，不自行实现 OAuth 轮换协议。
- 新 auth 数据不进 PowerSync、业务导出、日志或 AI 对话。401/403 challenge 由协议适配层提供；业务 owner 拒绝不伪装成可通过增加 scope 解决的问题。

## 实施切片

| 切片    | 可观察交付                                       | 验收与状态                                                                                                   |
| ------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| EAG-04A | provider persistence、connection 关联、discovery | 已实现；官方 1.7.6 schema、真实 PG 与两客户端 CIMD 登录通过                                                  |
| EAG-04B | 现有登录 + Consent                               | 已实现；真实注册、邮箱验证、登录、signed query、显式 consent 通过；GitHub 复用既有 popup，未重做上游实机验收 |
| EAG-04C | OAuth → 现有 Gateway 六工具                      | 已实现；Codex 原生控制接口及 Claude CLI 均完成六工具调用；两条 credential lane 隔离                          |
| EAG-04D | refresh、revoke、account closure                 | 已实现；PG 并发/overlap/replay、scope 减少、账户禁用、撤销重连和数据库故障回滚通过                           |
| EAG-04E | Connected apps / External agents                 | 已实现；真实浏览器列表、scope、last used、撤销、一次性 PAT secret 通过                                       |

A～E 与 EAG-05 本地只读验收通过，证据见 [运行时验证](../../../analysis/2026-10-07-eag-04-oauth-read-evidence.md)。公共 rollout、多容器生产演练与后续 write 仍独立推进。工作项保留在尚未完成的 EAG 总计划中，不把本切片完成视为 EAG-06～10 已交付。

## 实施步骤

1. 按 EAG-01 的精确组合安装 provider，新增对应 auth persistence 与 public resource metadata。root discovery、OAuth paths 与现有 `/api/auth` wildcard/body parsing 顺序集成测试。
2. CIMD/预注册绑定合法 redirect；CIMD fetch 使用官方受限 transport，测试 DNS/重定向/metadata 大小与超时。metadata URL 不代表可信客户端身份。
3. 实现 consent UI，显示客户端、实际 owner scopes、expiry 和撤销说明；未登录转登录/注册，拒绝 consent 不创建 grant。scope 扩大重新同意。
4. code+PKCE S256、resource 参数、issuer/audience 校验、refresh rotation/reuse detection 交给 provider；Gateway 绑定 connection/grant 并在线检查账户及撤销状态。
5. 连接/PAT 管理 UI 放现有 Settings 的 Cloud Auth 相关 owner surface；提供列表、scope、最近使用、到期、撤销和 PAT 一次性展示。不要复用 AI Provider Connection 表。
6. account closure 撤销 grants/refresh/PAT，并遵守 owner purge/export 边界；credential 不进入 PowerSync 或普通业务导出。

## 保护契约

第一方 Session/device routes 原样可用，MCP credential 不能调用普通 session REST，普通 session 不能调用 MCP。Cloud Auth 对外抛稳定结果，provider 错误只在 ACL 清洗。

## 验收与验证

- 从未认证 URL 完整走通 OAuth；拒绝错误 resource/audience/issuer、PKCE、redirect、重用 code 和 scope escalation。
- 两个客户端/两个账户不会串 connection；refresh 并发与重放按照 provider 定义返回，不制造永久有效 token。
- 撤销成功后启动的新请求被拒绝；旧 JWT 仍在 TTL 内也被 online grant check 拒绝。auth store 故障 fail closed。
- Account 非 Active 时 read/call/refresh 全部拒绝；现有 Web/Desktop/device 登录回归通过。
- 缺少 `offline_access` 不声称取得 refresh；refresh 不能扩大 scope/resource。同 token 同请求在 overlap 内重试返回相同 token 对；跨实例和重启仍成立，超窗旧 token 重用按 provider 定义失效。
- 撤销再授权后，旧 code/access/refresh 仍失败；同客户端双账户、不同客户端不会串 grant。刷新与 revoke 并发不会生成撤销之外的新 authority。
- Consent scope 缩减立即限制旧 access token；已有 read token 不因发布新 scope 或其他授权扩权。90 天总寿命到期后必须重新同意。
- 最近日志/浏览器测试、cloud-auth/api/app-vue/web targets 与 prod-like OAuth 验证通过；完成 EAC-03/04 的服务器部分。

## 回退与移交

关闭 OAuth public lane，撤销测试 grant，保留第一方登录；PAT 只能维持受控试点。交 EAG-05 用真实客户端验收，不能将手写 token fixture 视为 OAuth 产品旅程。
