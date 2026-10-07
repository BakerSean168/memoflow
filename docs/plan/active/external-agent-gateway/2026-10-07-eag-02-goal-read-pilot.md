---
tags: [plan, active, mcp, goal, auth]
description: EAG-02 scoped PAT 与真实 Goal 只读 Hosted MCP 纵向试点
created: 2026-10-07T00:00:00Z
updated: 2026-10-07T00:00:00Z
---

# EAG-02：Goal 私有只读接入

状态：已实现并验证（PAT + Goal 两个只读工具）。最终证据见 [EAG-02 evidence](../../../analysis/2026-10-07-eag-02-goal-pat-evidence.md)。

## 交付行为

一个受控用户通过短期 `goals:read` PAT 调用 `/mcp` 的 `goal_get`、`goal_search`；另一个用户的数据始终不可见。两项工具进入 Goal owner 的有界 application query port，第一方 CRUD port 保持原有行为。

## 实施步骤

1. 增加 Gateway support package 的最小 MCP transport 和具体 Goal handler，公开 schemas 放 contracts；API host 注入 Goal port 并显式挂载 root `/mcp`。
2. 在 Cloud Auth 增加独立 PAT 的创建/列表/撤销能力，使用受 session、CSRF/Origin 与账户状态保护的管理入口。只展示一次 secret、只存摘要；试点 PAT 强制短有效期和 read scope。
3. 实现 credential type/audience/expiry/revocation/Active Account 验证；不接受 Cookie、Web/Desktop bearer session 或 body identity。入口生成 canonical ExecutionContext。
4. 对接 goal_get/search 的严格 schema 与最小结果；若 owner 缺少有界分页，先在 Goal query port/repository 增加分页和稳定排序，禁止全量读取再 slice。
5. `tools/list` 按 scopes/host 过滤，直接 call 再校验；接入脱敏 audit、请求/输出大小、超时和多实例有效的限流；read feature flag 默认关闭。
6. 在本地 prod-like 开启仅受控 read pilot，以真实数据库数据核对 MCP 与 Web 查询一致。

## 保护契约

不引入全局 registry，不增加任何写工具；不把 handler 注册与 auth bypass 绑定。PAT 的 secret 不进入日志、截图、git 或 docs。现有 `/api/v1/goals` 认证语义保持不变。

## 验收与验证

- A/B 两账户的 list/get/call 隔离；他人 ID 与不存在 ID 都返回受控 NOT_FOUND。
- 失效/撤销/wrong audience/session token 被拒绝，未授权时 owner port 没有被调用。
- 搜索空结果、多页边界、重复排序值、篡改 cursor 与最大响应预算有集成测试。
- request/trace 贯穿一次调用，audit 无 secret/知识正文；关闭开关时不能调用缓存的 tool 名。
- `api`、`goal`、`cloud-auth`、`contracts` 最近测试/类型检查/lint 和 prod-like 检查通过，记录 EAC-02/03 的证据。

## 回退与移交

关闭 read flag、撤销 pilot PAT 即停止接入，保留必要 audit。下一项 Task 复用相同入站授权，保持具体 owner handler，直到真实重复出现。

## 当前验收证据

见 [EAG-02 证据与交接](../../../analysis/2026-10-07-eag-02-goal-pat-evidence.md)。

| 验收项                                                        | 状态                                                            |
| ------------------------------------------------------------- | --------------------------------------------------------------- |
| 两账户 get/search、严格 identity、cursor 分页                 | 已实现并验证（真实 PostgreSQL + 官方 SDK）                      |
| PAT 摘要、audience、失效/撤销/账户/scope                      | 已实现并验证；新增 closure 断言最终复跑待记录 |
| request/trace、严格 schemas、关闭开关、timeout/输出预算、脱敏 | 已实现并验证（Gateway/API fixture；真实数据库 read journey）    |
| 共享配额                                                      | 已实现并验证（PostgreSQL + 独立 Redis；credential 60 秒窗口）     |
| 最终 nearest checks、治理、prod-like 启用验收                 | 已实现但尚未验证最终源码；尚未关闭本项                          |

审查补正：生产默认 warn 日志不能吞掉审计；Gateway 使用独立日志通道，Host admission 与 PAT lifecycle 也生成最小事件。Account 状态/closure 通过 Account owner 的有界 authority query 判断，Cloud Auth 不跨域读 Account 表。Goal get/search 共同使用 owner bounded query，真实 PostgreSQL 锁等待测试已验证查询取消及资源释放；完整最终验证正在重跑。
