---
tags: [plan, active, mcp, oauth]
description: EAG-04 OAuth discovery、consent、refresh、撤销与连接管理
created: 2026-10-07T00:00:00Z
updated: 2026-10-07T00:00:00Z
---

# EAG-04：OAuth 与连接生命周期

状态：明确延期。用户于 2026-10-07 将本次先交付范围改为 PAT + 6 个只读工具；OAuth 实现不作为本次交付前置。原验收要求保留供后续实施。依赖：EAG-02；可与 EAG-03 独立推进。入口：[总方案](../2026-10-07-external-agent-gateway.md)、[ADR-117](../../../architecture/adr/ADR-117-external-agent-authorization-and-credentials.md)。

## 交付行为

用户从 MCP 401 challenge 进入 MemoFlow 登录/注册，确认客户端与 scopes，授权后返回外部客户端；可在设置中查看连接/PAT，并撤销其访问。

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
- 最近日志/浏览器测试、cloud-auth/api/app-vue/web targets 与 prod-like OAuth 验证通过；完成 EAC-03/04 的服务器部分。

## 回退与移交

关闭 OAuth public lane，撤销测试 grant，保留第一方登录；PAT 只能维持受控试点。交 EAG-05 用真实客户端验收，不能将手写 token fixture 视为 OAuth 产品旅程。
