---
tags: [architecture, mcp, ai, external-agent]
description: MemoFlow External Agent Gateway 当前能力、认证、事务写入与运行边界
created: 2026-10-07T00:00:00Z
updated: 2026-10-19T00:00:00Z
---

# MemoFlow External Agent Gateway

**状态：PAT/OAuth 六个只读工具已实现，OAuth 有历史本地验收证据，公共 rollout 未完成。#490 增加默认关闭的 PAT 写入：Goal/KR、TaskPlan、TaskOccurrence；验收以该 Issue/PR 的实际本地检查为准，不代表生产已部署。Assisted workflow 仍未交付。**

先读 [仓库核验](https://github.com/BakerSean168/memoflow/blob/7a45112e1840950ead1ba98b748fc70fa1b38344/docs/analysis/2026-10-07-external-agent-repository-assessment.md) 和 [协议研究](https://github.com/BakerSean168/memoflow/blob/7a45112e1840950ead1ba98b748fc70fa1b38344/docs/analysis/2026-10-07-external-agent-protocol-research.md)。长期决策分别是 [ADR-116：能力边界](./decisions/ADR-116-external-agent-capability-and-gateway-boundary.md)、[ADR-117：授权](./decisions/ADR-117-external-agent-authorization-and-credentials.md)、[ADR-118：写入与工作流](./decisions/ADR-118-external-agent-mutations-and-assisted-workflows.md)。执行顺序以 [实施总方案](https://github.com/BakerSean168/memoflow/issues/490) 为准；[术语表](./glossary.md) 只定义概念。

## 1. 用户可见结果与边界

第一里程碑：添加 MemoFlow MCP URL，经 OAuth 登录/注册及同意后，用户可以问“列出本周任务和相关目标”，获得只属于自己的结构化对象。
第二里程碑：用户授予写权限后，可以创建 Goal（包括 KRs）、创建 TaskPlan、修改定义、完成指定 TaskOccurrence；网络重试不会重复写入，和 Web/Desktop 并发编辑会明确返回冲突。

高级能力随后提供 MemoFlow-assisted planning、云端提醒及 Knowledge capture。SDK/CLI/skills/webhooks 是后续分发渠道，不能成为 Gateway 首版依赖。

第一版不提供账号创建工具、全量 REST 自动翻译、批量永久删除、管理员工具、任意 SQL、任意 URL/file 读取、Desktop 远程控制或自建 Agent runtime。ChatGPT 等其他客户端列为后续兼容对象，不将未测试支持写成已交付。

## 2. 责任与包落点

下列包及 API host 复用 R1/PAT/OAuth 与 Owner 契约；写入由 Owner 持有事务，assisted workflow 尚未发布。

| 所在位置                                        | 责任                                                                  | 不承担                                           |
| ----------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------ |
| `apps/api/src/modules/agent-gateway/`           | Gateway host composer、owner port wiring、root `/mcp` 注册            | 领域规则与协议重实现                             |
| `packages/agent-gateway/`（support package）    | MCP adapter、入站能力调用、gateway-owned ports；server 子入口隔离 SDK | Goal/Task repository、OAuth 实现、Mastra runtime |
| `packages/contracts/src/modules/agent-gateway/` | 公开 tool input/output/失败与 descriptor 数据；从 owner schema 组合   | handler、SDK 类型、Prisma 类型                   |
| `packages/cloud-auth/`                          | external grant/PAT 认证、provider ACL、撤销和登录集成                 | Goal/Task 权限规则                               |
| `packages/goal/`、`packages/task/` 等           | application operation、ownership、事务、并发、领域事件                | MCP envelope 与 OAuth token                      |
| `packages/ai/`                                  | Mastra adapter、assisted workflow 与原有内部 policy                   | 普通 MCP deterministic 命令的必经路径            |
| `packages/database/` 与 host infra              | credential/receipt schema 和端口实现，由各语义 owner 使用             | Gateway 直接操作业务表                           |

新包属于接入 support，不是虚构 bounded context；不建立 domain CRUD、同步模型或独立数据库。Goal slice 先使用具体类型与显式 handler；第二 owner 后才提取重复 descriptor/dispatcher。`@memoflow/capabilities` 独立包暂不创建。

依赖规则是 transport → invocation application → consumer-owned port ← host binding → owner application。共享 descriptor 不含 `createTool()`、MCP SDK 或 handler；MCP 和 Mastra 各自适配，同一已共享操作使用同一输入/输出 contract 和同一业务 handler。架构检查禁止 AI-only SDK 从 descriptor 传入 domain。

## 3. 入站请求处理

1. 代理/Host/Origin、body size、超时和请求速率检查；生成 canonical RequestContext。
2. 核验唯一 Bearer credential，校验 issuer/audience/expiry/current grant/Active Account。无效时按 MCP OAuth challenge 返回 401；有效但 scope 不足按规范返回 403/insufficient_scope。
3. SDK 解析协议与请求 metadata；header/body mirror 不一致拒绝。不要从客户端 `Mcp-Name` header 单独决定权限。
4. `tools/list` 返回授权且当前宿主可用的静态定义；`tools/call` 再查 allowlist、scope、宿主、runtime input schema。
5. 入口生成 ExecutionContext（`source: 'http'`）并调用 handler；owner 核验资源归属、业务规则与并发条件。
6. 校验 output schema，清洗失败，投影 MCP structuredContent 与有界文本摘要，完成 audit；写成功以 durable receipt 为准。

认证/协议错误不套 REST ApiResponse。未知工具/无效协议参数按 MCP SDK 的 protocol error 处理；已经进入工具执行的 owner 业务失败用受控 `isError: true` 和稳定 failure code。needs_input、accepted、部分成功是显式业务 outcome，不靠自然语言字符串猜状态。

无 Scope 的空工具列表不能伪装为可用连接；给出明确的权限说明。反之，新 owner 未注册时不发布一个调用后才发现缺依赖的工具。

## 4. Tool taxonomy 与发行批次

ID 使用稳定 snake_case，内部 capability ID 可采用 `goal.get` 等命名；不得将二者用不受控字符串替换相互推导。表中是实现的有限 allowlist；写工具只有显式启用且满足 PAT scope 时才发布。

| 批次 | Tool                            | Owner / scope      | 行为约束                                                           |
| ---- | ------------------------------- | ------------------ | ------------------------------------------------------------------ |
| R1   | `goal_get`                      | Goal / goals:read  | ID、摘要、KRs、version；不夹带 Task/Knowledge 私密内容             |
| R1   | `goal_search`                   | Goal / goals:read  | 有界查询、确定排序和分页                                           |
| R1   | `task_plan_get`                 | Task / tasks:read  | 返回定义、version、关联引用                                        |
| R1   | `task_plan_search`              | Task / tasks:read  | 按 owner 支持的过滤检索，不承诺不存在的全文搜索                    |
| R1   | `task_occurrence_get`           | Task / tasks:read  | 返回执行状态、version、planId                                      |
| R1   | `task_occurrence_list`          | Task / tasks:read  | 明确时间范围、时区与分页                                           |
| W1   | `goal_create`                   | Goal / goals:write | initial KRs 与 Goal 原子创建；不自动 activate                      |
| W1   | `goal_update`                   | Goal / goals:write | expectedVersion；首版排除整组 keyResults replacement               |
| W1   | `goal_key_result_create/update` | Goal / goals:write | 单 KR 命令使用 Goal expectedVersion；不替换整个集合                |
| W1   | `task_plan_create`              | Task / tasks:write | schedule/reminderPolicy 由 owner 校验；新 binding 另需 goals:write |
| W1   | `task_plan_update`              | Task / tasks:write | 显式 patch 与 expectedVersion；binding 同上                        |
| W1   | `task_occurrence_complete`      | Task / tasks:write | 精确 occurrence、并发条件、明确 measurement decision               |

R1 为 **6 个工具**，W1 为 **7 个写工具**，启用后最多 13 个。OAuth 仍只有六个只读工具。MCP 自带发现功能足够，不新增 `capabilities_list` 平台 API。

### 跨 owner 权限

read scope 与 write scope 不互相隐含。MCP write 结果只返回该写操作自身的最小 receipt（ID、版本、影响的实体 ID、replayed），持久 receipt 也只保存同一投影；Owner 完整 read model 不进入外部写入回执，后续完整查询仍需 read scope。Goal/Task 详情只返回已有关系引用，不因一个 scope 允许任意扩展其他 owner 内容。

Task 的已配置 Goal contribution 是完成动作的一部分，`tasks:write` consent 必须说明它会按既有配置影响目标进度；它不授权直接更新任意 Goal/KR。创建或更改 binding 要求 `tasks:write + goals:write` 及双方归属，不能靠对已有 Task 的写权限引入新 Goal 影响。读取 Goal 名称/测量上下文仍需 `goals:read`；没有时只允许 complete-only，不能偷偷取 protected context。

Planner/Notification/Routine/Knowledge 的扩展按真实需求单列在 [#539](https://github.com/BakerSean168/memoflow/issues/539)，目前没有注册这些工具。

## 5. 输入、时间、结果与分页

输入使用严格 Zod schema，拒绝未知 identityId、ownerId、source、approved、credential 等字段。业务字段复用 owner schema；工具层将内部可选 deterministic IDs 隐藏并由幂等执行生成，防止客户端用猜测 ID 改变 replay 行为。

时间沿用 Product Time：Instant 为 epoch milliseconds，日期为 Ymd，日程使用 IANA timeZone。描述中附可理解示例；不要把服务器系统时区作为“今天”。“明天 10 点”由客户端结合有效用户时区消歧；未能确定时返回 needs_input。月/季度目标通过 GoalTimeframe 表达，不能偷偷取某日午夜。

R1 list/search 默认 20 条、最多 100 条，时间列表默认最多 31 天窗口，使用 `(sortKey, id)` 确定排序。cursor 绑定 owner/filter/sort，并校验完整性；它不是权限凭证。现有 owner 不支持数据库分页时先补 owner query seam，禁止全量取数再 slice。超过响应预算时返回明确分页/截断指示，不悄悄丢掉结果；初始结构化结果预算建议 256 KiB。

工具结果保持 owner object identity，并附 schema version/业务 version；错误不包含栈、SQL、provider secret 或他人对象存在性。每项工具定义具体 `outputSchema`，不用任意 JSON map 代替契约。

当前公开结果词汇：

| 结果                            | 客户端下一步                                       |
| ------------------------------- | -------------------------------------------------- |
| `receiptId + result + replayed` | 读取 canonical IDs 与版本；重复请求显示 replayed   |
| `NOT_FOUND`                     | 对不存在和不属于用户的 ID 一致处理                 |
| `VALIDATION_ERROR`              | 修正字段，不依赖错误文本解析                       |
| `CONFLICT`                      | 重新读取，决定是否覆盖；不自动替换 expectedVersion |
| `IDEMPOTENCY_CONFLICT`          | 不复用同 key 表达新意图                            |
| `OPERATION_IN_PROGRESS`         | 有界等待并使用同 key 查询/重试                     |
| `RATE_LIMITED` / `UNAVAILABLE`  | 遵循 retryAfter；不自动升级权限或更换身份          |

现有 owner public failures 通过 ADR-049 的单一边界映射；上述新增接入 code 只表达 Gateway 语义，不建立另一套领域错误体系。

## 6. 写入与审批

原子性和重试契约以 ADR-118 为准。`packages/database/src/adapters/prisma/external-mutation.ts` 提供两个真实 Owner 共用的 PostgreSQL 事务 receipt runner。身份 + capability version + key 的 SHA-256 标识使用数据库 advisory transaction lock 串行化；凭据轮换后同一 owner 的重试仍重放已提交结果，`connection_id` 只作首次执行审计。schema 归一化后按排序字段计算摘要。同 key 异 body 返回 `IDEMPOTENCY_CONFLICT`，同 body 返回原始结果及 `replayed: true`。回执只保存响应实际返回的最小投影，不保存 Owner 完整 read model；回执不自动过期；原结果不会用当前对象替换。账户删除通过 Account 外键级联清理回执。

Goal/Task 各自在自己的 infrastructure factory 中创建 transaction-bound repositories，并调用原有 application commands。Owner facts、receipt、Task→Goal 现有 outbox 一起提交。业务失败或 receipt 写入失败回滚；MCP 超时/断连只停止等待，不能撤销已提交事实，客户端必须用同一 key 重试。事务 15 秒、SQL 10 秒、锁等待 5 秒有界；Task owner 事务加入已有的 receipt 事务而不新开嵌套事务，因此继承同一预算。并发 Task/Goal 的最终 CAS 仍由 Owner repository 执行。Gateway 既不取得 repositories，也不直接写 GoalRecord。

每次请求及执行/重放前重新校验当前凭据；写路径在 receipt 事务开始前完成校验，避免事务内等待第二条连接。写入只接受 PAT。Task binding 更改另需 `goals:write` 且在 Owner 事务中查双方归属；记录 Prompt measurement 另需 `goals:read`。`complete_only` 不用 suggestedValue 伪造测量；Fixed 贡献沿用 Task 既有语义。成功 receipt 是持久审计事实，传输审计另含 tool/effect/receiptId/replayed，不记录正文或 token。

首批 `goal_update` 排除会整组替换/删除 KRs 的字段；保留 name/summary/description/timeframe/reminderConfig 等经过 owner 允许的 patch。增加危险操作时重新评估 tool effect 和 server approval，不能因为名叫 update 就自动标记无破坏性。

所有普通写工具要求 idempotencyKey。是否弹出客户端确认是额外 UX；服务器的写权限源是 grant。需要再次确认的高风险命令先不发布，直到有真实 approval intent 流程；不把它当作所有 CRUD 的平台前置。

## 7. OAuth/PAT 连接与运行策略

OAuth 协议步骤和撤销边界见 ADR-117。canonical resource URI 由部署配置指定，例如 `https://api.example.com/mcp`；这是占位符，不是已部署地址。metadata URI 按 RFC 与实际 root route 映射，API `/api/v1` prefix 不自动应用到 MCP discovery。

新授权数据不得进入 PowerSync、数据导出、浏览器日志或 AI conversation；用户可见连接名称、scope、最近使用、有效期和撤销按钮。scope 扩大必须重新 consent；已存在只读 connection 不因发布新工具自动获得写能力。

Gateway 启动默认关闭（`EAG_READ_PILOT_ENABLED=0`）；PAT 写入另由 `EAG_WRITE_ENABLED=0` 默认关闭。Assisted 工具尚未注册，不存在已实现的 assisted 开关。read 开关关闭时已有连接收到明确 unavailable；write 关闭时不再发现或执行写工具。shutdown 沿用现有 API host 生命周期；本轮未执行完整容器 shutdown/drain 验收，不宣称已验证该运行边界。

rate limit 按 IP（未认证）、owner/connection/tool（认证后）组合，在多实例下仍有效。具体阈值来自 load test；请求体建议 256 KiB、普通工具截止时间 30 秒、页大小硬上限作为初值写入统一配置。所有 limits 都在转换为昂贵 owner query 前检查。

EAG-02 的具体 owner read budget：Goal 行最多 101（含 lookahead），每 Goal 先检查 KR count，最多 100；正文 description/review/snapshot 不进入读取。name/summary/KR title/unit 的字节长度先由 PostgreSQL 检查，超出 owner 投影上限的单聚合返回明确 `RESPONSE_TOO_LARGE`，不伪造部分 KR 的 overallProgress。搜索页超出传输预算时缩小返回页并标记 `truncated=response-budget`，游标仍从最后实际返回项继续。整个 HTTP 调用有共同截止时间；取消信号单独传给查询，不扩展或混用 ExecutionContext。Goal 查询使用 transaction-local PostgreSQL statement_timeout 和 transaction timeout，认证/账户 authority 的独立只读查询最多 5 秒；响应停止等待之后数据库工作仍有明确上界。Redis admission 同样必须有命令超时，429 含 Retry-After。

audit 最小字段：request/trace ID、connection/credential ID、owner identity、tool/version、effect、scope decision、duration、outcome code、operation receipt ID、replayed。默认不记录 token、参数全文、知识正文或模型对话。unauthenticated/denied/read 调用也要可追踪；首版使用现有结构化日志与持久日志收集，写成功 receipt 是 durable audit fact。

## 8. Hosted 能力与 Workflow 适配

WallClock intent -> owner scheduling port -> durable Scheduler -> Notification delivery。Agent 进程退出不是计时依赖；通知最终在何种设备出现由 Notification policy 和设备能力决定。

Elapsed/ActiveUsage/专注 protocol 需要设备本地执行，暂不通过 Hosted MCP 发布。仅“服务端接受了 startProtocol”不构成用户设备实际执行的证据。

高级 workflow 在 EAG-10 单独设计并验证。先通过现有 runtime public seam 保持 owner/revision/receipts，再做 Tasks/MRTR 投影。客户端未声明扩展时使用普通 workflow tools，首期不能为等待用户回复占用长连接。

内部 native review 和外部 headless review 可以共享 owner 输入契约，但外部 apply 需要明确的服务器审批事实或受授权的直接提交政策；没有这个闭环时 assisted 工具只能返回 draft，不得报告 Goal 已创建。

## 9. 当前 main 审计与未交付范围

基线 `973328ed174`；历史 Active Plan 仅供参考。OAuth 早期 PAT 验收中的“延期”已被后续实现替代，不能继续作为当前状态。

| 项目         | 基线交付状态                                                                | file:line 证据（基线）                                                                                                                                                                                                                                                         |
| ------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| EAG-01/02/03 | Accepted：PAT + 六只读工具                                                  | `packages/cloud-auth/src/server/scoped-pat.ts:96`；`packages/agent-gateway/src/server/register-read-tools.ts:151`、`:199`、`:245`                                                                                                                                              |
| EAG-04       | Accepted：OAuth 实现及历史本地生命周期验收；公共 rollout 未交付             | `packages/cloud-auth/src/server/external-agent-oauth.ts:154`、`:186`、`:294`、`:353`                                                                                                                                                                                           |
| EAG-05       | Accepted：历史本地 PG/浏览器/两 CLI 只读验收；未证明生产部署                | `docs/analysis/2026-10-07-eag-04-oauth-read-evidence.md:20`、`:28`                                                                                                                                                                                                             |
| EAG-06/07/08 | 基线 Hosted 未交付；#490 本次实现 PostgreSQL 通用 receipt 和七个 PAT 写工具 | 基线仅 `packages/goal/src/server/infrastructure/adapters/powersync/goal-agent-mutations.ts:46`、`packages/task/src/server/infrastructure/adapters/powersync/task-agent-mutations.ts:46`；新增验收 `apps/api/src/__tests__/integration/agent-gateway-write.integration.test.ts` |
| EAG-09       | Follow-up：按需扩展，未交付                                                 | [#539](https://github.com/BakerSean168/memoflow/issues/539)；当前工具 allowlist 无这些工具                                                                                                                                                                                     |
| EAG-10       | Follow-up：外部 handle/review/resume/cancel 未交付                          | [#538](https://github.com/BakerSean168/memoflow/issues/538)；`packages/ai/src/server/mastra/runtime/workflow-runtime.port.ts:19` 只有现有 runtime，未绑定 external connection                                                                                                  |

[#538](https://github.com/BakerSean168/memoflow/issues/538) 必须复用现有 durable runtime 与 ask/resume，补不透明且 connection-bound handle、revision、apply 前授权和取消竞态验收。当前 runtime 的 identity/runId 不能直接当外部授权；不增加接口占位或第二个执行器。

新写入的 Linux 本地 PG/HTTP 验收不代表真实客户端或 release/staging 已验收。公开部署、打包制品、真实 Codex/Claude 写调用仍为 manual acceptance pending，复现步骤及实际结果记录在 #490。禁止仅因文档列出能力就在 release/staging 开启写工具。

## 生产边界

生产 API 不发布宿主端口，只信任一个内部代理 hop（`API_TRUST_PROXY_HOPS=1`）。Caddy 仅信任 Cloudflare 公布网段的 `CF-Connecting-IP`，将解析后的地址覆盖为单一 `X-Forwarded-For`；直连 origin 的伪造 forwarding header 无效。其他宿主默认不信任代理。

Caddy access log 删除 URI、Referer 与 Location，Nginx access log 只记录不含查询的路径。授权 query、code、token 不作为日志字段。Cloudflare 网段变更时须更新 Caddy 配置并验证；不以信任任意代理替代。
