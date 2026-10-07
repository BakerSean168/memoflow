---
tags: [analysis, mcp, auth, goal, validation]
description: EAG-02 Goal PAT 纵向链路、真实 PostgreSQL 与 Redis 验证证据及未完成项
created: 2026-10-07T00:00:00Z
updated: 2026-10-07T00:00:00Z
---

# EAG-02 Goal/PAT 实施证据

状态：EAG-02 已实现并验证（受控 PAT + Goal 两个只读工具）。基线 HEAD `3664f8da6a95174d24ae8f443f2d12b3ce223e33`，分支 `feat/external-agent-gateway-20261007`，工作区包含本次修改和开始时已有文档/operator 修改；尚未提交。

## 源码纠偏

原 Goal list/search 先全量读取再在内存筛选，不能直接作为 hosted search。先在仓库评估和工作项明确差距，再增加 Goal owner 的 `SearchGoalPageUseCase` 和具体 Prisma read port：identity/deleted/archived 条件、字面搜索转义、`createdAt DESC, id DESC` keyset、数据库 take `limit + 1`，不改变旧 PowerSync/application CRUD。

Goal ID 使用现有 prefixed ID schema，不能误用纯 UUID；真实数据库第二页测试暴露该差异后已修正。KR/Goal 的输出同样从 owner contract 投影，明确排除 reviews、description 和跨 owner 私密内容。

## 已实现并验证

- 新 support package `packages/agent-gateway` 仅持 consumer-owned application/credential ports，没有 Prisma 或 Goal repository 依赖。公开 schemas 位于 contracts 子入口。
- API host 显式注册 root `/mcp`，通过 Goal owner 的有界 get/page application query 绑定；复用入口 RequestContext，组成 canonical ExecutionContext，不进入 Assistant/Planner LLM。
- PAT 管理入口 `/api/v1/agent-connections/pats` 使用第一方 session、邮箱验证及 mutation Origin gate；严格输入拒绝 identityId。PAT 只展示一次 secret，数据库只有 SHA-256 摘要和 prefix；最长七天，仅 `goals:read`。
- 每次 MCP HTTP 和每次 owner 调用前核验独立 PAT、audience、expiry、当前 scopes/revoke、CloudAuth disabled 状态、Account owner 的 Active/closure authority query。Cookie 和第一方 bearer session 不能替代 PAT。
- 严格 Goal schemas、identity/filter/limit/sort/expiry HMAC cursor、默认 20/最多 100、256 KiB request/result budget、从 canonical RequestContext.startedAt 起的 30 秒整体调用 deadline、默认关闭 read pilot；关闭后缓存 tool call 也拒绝。
- 脱敏 audit 保留 canonical request/trace、credential/identity、tool/version/effect/scope decision/outcome/duration，不记录 secret、参数全文或业务正文。
- PAT quota 为 PostgreSQL 原子条件 UPDATE 的每 credential 60 次/60 秒；Redis Lua 为共享 IP/owner 各 120 次/60 秒。阈值是受控试点初值，尚不代表生产容量基线；代理入口先按 socket IP 限流，不信任任意 forwarded header。

## 当前工具契约

| 工具 | Scope | 严格输入 | 最小输出 / 时间语义 |
| --- | --- | --- | --- |
| `goal_get` | `goals:read` | `{ id: GoalId }` | `goal`，含 id/name/summary/status/version/createdAt/updatedAt/overallProgress 与有限 KR 投影；只读 owned 非 deleted Goal，允许 owned archived Goal |
| `goal_search` | `goals:read` | `{ query?: string, limit?: 1..100, cursor?: string }` | `items/hasMore/nextCursor`；缩页时增加 `truncated: response-budget`；过滤 deleted/archived，按 createdAt/id 降序 |

`createdAt/updatedAt` 是现有 owner Instant 的 UTC epoch 毫秒；`version` 是聚合版本，不是 requestId、cursor 或 workflowRunId。KR 只含 id/title/progress/progressPercentage/isCompleted，测量值来自 owner 的真实当前 progress；不附 review/description 或跨 owner 正文。输入不接受 identity、scope、approved 或客户端版本替代授权。

样例输入：`goal_get({ id: "IGoalId_00000000-0000-4000-8000-000000000001" })`；`goal_search({ query: "Quarter", limit: 20 })`。下一页保持同 query/limit，使用上一页签名 cursor。示例 ID 为占位符，不代表已存在资源。普通读取失败有受控 code，单聚合超出投影上限返回 `RESPONSE_TOO_LARGE`，不会给出错误的部分 KR progress。

## 已执行的证据

| 命令/测试                                                                         | 观察结果                                              | 证据范围                                                                                                                                                                           |
| --------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm nx run goal:test:integration -- goal-prisma.repository.integration.test.ts` | 1 file / 10 tests 通过                                 | 真实 PostgreSQL；多身份、字面 query、相同 sort timestamp、分页与 reviews 排除                                                                                                      |
| `pnpm nx run api:test:integration -- scoped-pat.integration.test.ts`              | 初始并发 quota 测试失败，修复后 1 file / 2 tests 通过 | 真实 PostgreSQL；摘要、audience、跨 owner revoke、disabled、撤销重建 service；70 并发恰好 60 放行                                                                                  |
| `pnpm nx run api:test:integration -- agent-gateway.integration.test.ts`           | 1 file / 1 test 通过                                  | 官方 MCP Client + Node/Express + 独立 PAT + 真实 Goal application + PostgreSQL，A/B 隔离、三 Goal 两页、相同 timestamp、跨 owner cursor、第一方 application 查询一致、撤销即时失效 |
| `pnpm nx run api:test:integration -- pilot-admission.integration.test.ts`         | 1 file / 1 test 通过（独立 Redis 容器）               | 两个独立 Redis 连接，每种 bucket 130 并发恰好 120 放行；无全库 flush                                                                                                               |
| Gateway fixture                                                                   | 6 tests 通过；最终复跑见下方补充证据                                          | 关闭/撤销/call-time scope/strict identity/input、Origin、篡改 cursor、请求 budget、owner timeout、response budget、失败 audit 脱敏                                                 |
| API host fixture                                                                  | 2 tests 通过                                          | 第一方管理入口 session/Origin/strict input，root 路由与 Host gate、canonical request ID                                                                                            |

Closed Account/current scope/expiry 和 credential 自身 60 秒窗口已通过三组 integration（3 files / 4 tests），70 并发恰好 60 放行。审查后又补了 Account closure 的真实数据库断言，最终复跑已通过，见下方补充证据。

## 审查修复与最终验证

Standards/Spec 两个只读审查确认了真实缺口，已逐项修复；EAG-02 修正与验证已完成；整体六工具最终报告见 EAG-03：

- Cloud Auth 不再读 Account 表；Account owner 提供 active/closing application query，PostgreSQL statement/transaction timeout 5 秒。PAT 身份查询/配额也设数据库超时。
- 独立 audit logger 强制保留 info，不影响 API 诊断级别；Host/重复 Authorization/IP admission、PAT 创建/列表/撤销，以及 CORS/parser/aborted 等未到路由的尝试都有最小审计。管理事件 effect 为 credential；不输出 secret/请求正文。
- Goal get 不再走全量 children/review 查询。get/page 先在数据库检查 KR count 和大字段长度，再按有限字段读取；每 Goal 最多 100 KR，且不重新计算截断 KR 的进度。搜索响应预算导致缩页时返回显式 truncated 与签名续页 cursor。
- 整体 HTTP deadline 覆盖认证、配额、body 与 owner；signal 与 deadline 独立传递。Goal 数据库 statement_timeout 使用实际剩余时间，并由 transaction timeout 约束排队/执行。Redis 私有连接 commandTimeout 为 5 秒。429 含 Retry-After。
- 真实 Goal DB 测试现在 10 tests，通过了 101 KR、大字段 preflight 和持表锁时的 PostgreSQL 查询取消；取消后 pg_stat_activity 没有遗留锁等待查询，释放锁后读取正常。
- API unit：3 files / 4 tests 通过，包括早期 413 仅审计一次、canonical ID、无 credential/body 泄露；独立日志通道在 warn 诊断级别下仍保留 audit。
- nearest `api/agent-gateway/cloud-auth/goal/account/contracts` lint/typecheck：39 tasks 通过。docs-check 通过；整体六工具 helper 在 EAG-03 阶段按冻结源码再次执行。
- 开始时已有两份 `.operator` 脚本引用 database private source，导致 affected lint 失败。只把 import 改到公开 `@memoflow/database/environment`，新增该既有 env loader 的公开子入口；没有执行脚本或改其业务内容。

上一轮 helper 在审查补正前取了源码快照，已停止其进程树，不作为最终证据。当前最终验证独占 Docker 构建；未停止原有 host-dev 进程或改动其他 worktree。

测试 helper 原来自动使用 `prisma db push --accept-data-loss`，被 Prisma Codex 保护拒绝。未绕过保护或设置同意标记；改用普通 `db push`。真实测试库报告已同步，不涉及数据丢失；必要 schema 变更仍通过正常迁移流程处理。

## 交付边界与后续

EAG-02 Goal/PAT 已实现并验证；整体 PAT 六工具的最终部署验收及最新交接见 [EAG-03 证据](./2026-10-07-eag-03-task-read-evidence.md)。本页下方保存 Goal 切片完成时的真实镜像与 SDK 证据，不将旧镜像当成 Task 交付证明。

PAT 管理 UI 未增加，受控试点使用受保护管理 API。OAuth、真实 Codex/Claude OAuth callback/refresh/revoke 明确延期；EAG-06～10 写入、其他 owner 与 workflow 未完成。普通并发配额已验证，容量压测没有交付声明。

## EAG-02 最终补充证据

- 真实 prod-like SDK journey：`/tmp/eag02-prod-journey-final.json`，run `8acbae82`，协议 `2026-07-28`；真实注册/验证/登录、PAT 签发及脱敏列表、两账户隔离、多页读取、Goal/KR/version 第一方 parity、撤销后 401 均通过。所有试验 PAT 在 finally 撤销。
- 首次实际运行发现 API tsconfig source aliases 让 tsup 分别内联 main/server LoggerFactory，生产 audit 被默认 provider 禁用。先验证旧产物缺少 external logger 且包含内联 factory（失败），再用独立 bundle tsconfig 清空 source paths；新产物保留公共包导入并共享 logger（通过）。未修改业务日志级别。
- `pnpm docker:local:up` 在修复源码上完成真实重建，API image revision `3664f8da6a95174d24ae8f443f2d12b3ce223e33-dirty-cd3b21134e09`，healthy。日志过滤得到 15 条 info audit，requestId/traceId/credentialId/identityId/tool/scopeDecision/outcome/duration/version/effect 字段齐全；包含 OK、INVALID_CREDENTIAL、INVALID_CURSOR、NOT_FOUND、PROTOCOL_OK。没有在文档保留凭据、请求正文或原始日志。
- 最近 owner DB 10 tests、API integration 3 files/4 tests、nearest lint/typecheck 39 tasks 均通过；独立 governance 重跑通过（`/tmp/eag-governance-solo.log`），此前高并发下 5 秒 fixture 超时没有通过删测试或改 timeout 绕过。
- Goal 切片期间的旧报告属于冻结版本 `65bd699dfd6c`；EAG-03 已刷新完整 helper，新 revision `e28ff26819be` 与实际容器六工具 journey 均通过，最新证据见 EAG-03。
- EAG-03 Task 四工具已实施，最终状态见对应证据；OAuth 和真实客户端 OAuth 验收由用户明确延期。本节为 Goal 切片完成时的证据，六工具最新状态单独记录。
