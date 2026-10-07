---
tags: [architecture, mcp, ai, external-agent]
description: MemoFlow External Agent Gateway 提案规格与能力、认证、结果、运行边界
created: 2026-10-07T00:00:00Z
updated: 2026-10-07T00:00:00Z
---

# MemoFlow External Agent Gateway

**状态：已授权实施；协议/provider 基线已验证，Goal/Task 的 PAT 六个只读工具已通过真实数据库与官方 SDK 验证；六工具最终 prod-like 验收通过。OAuth consent、连接管理与刷新撤销已完成本地验收，纳入 v0.15.0；生产交付证据在发布后补齐。** 目标是让 Codex、Claude Code 在用户授权后查询并管理 MemoFlow，调用真实 owner application，同时保留内部 Assistant/native UI 的既有流程。

先读 [仓库核验](../analysis/2026-10-07-external-agent-repository-assessment.md) 和 [协议研究](../analysis/2026-10-07-external-agent-protocol-research.md)。长期决策分别是 [ADR-116：能力边界](./adr/ADR-116-external-agent-capability-and-gateway-boundary.md)、[ADR-117：授权](./adr/ADR-117-external-agent-authorization-and-credentials.md)、[ADR-118：写入与工作流](./adr/ADR-118-external-agent-mutations-and-assisted-workflows.md)。执行顺序以 [实施总方案](../plan/active/2026-10-07-external-agent-gateway.md) 为准；[术语表](../../CONTEXT.md) 只定义概念。

## 1. 用户可见结果与边界

第一里程碑：添加 MemoFlow MCP URL，经 OAuth 登录/注册及同意后，用户可以问“列出本周任务和相关目标”，获得只属于自己的结构化对象。
第二里程碑：用户授予写权限后，可以创建 Goal（包括 KRs）、创建 TaskPlan、修改定义、完成指定 TaskOccurrence；网络重试不会重复写入，和 Web/Desktop 并发编辑会明确返回冲突。

高级能力随后提供 MemoFlow-assisted planning、云端提醒及 Knowledge capture。SDK/CLI/skills/webhooks 是后续分发渠道，不能成为 Gateway 首版依赖。

第一版不提供账号创建工具、全量 REST 自动翻译、批量永久删除、管理员工具、任意 SQL、任意 URL/file 读取、Desktop 远程控制或自建 Agent runtime。ChatGPT 等其他客户端列为后续兼容对象，不将未测试支持写成已交付。

## 2. 责任与包落点

下列包及 API host 已实现 R1/PAT/OAuth；写入、assisted workflow 与后续能力仍按里程碑规划。

| 所在位置                                                | 责任                                                                  | 不承担                                           |
| ------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------ |
| `apps/api/src/modules/agent-gateway/`（新增）           | Gateway host composer、owner port wiring、root `/mcp` 注册            | 领域规则与协议重实现                             |
| `packages/agent-gateway/`（新增 support package）       | MCP adapter、入站能力调用、gateway-owned ports；server 子入口隔离 SDK | Goal/Task repository、OAuth 实现、Mastra runtime |
| `packages/contracts/src/modules/agent-gateway/`（新增） | 公开 tool input/output/失败与 descriptor 数据；从 owner schema 组合   | handler、SDK 类型、Prisma 类型                   |
| `packages/cloud-auth/`                                  | external grant/PAT 认证、provider ACL、撤销和登录集成                 | Goal/Task 权限规则                               |
| `packages/goal/`、`packages/task/` 等                   | application operation、ownership、事务、并发、领域事件                | MCP envelope 与 OAuth token                      |
| `packages/ai/`                                          | Mastra adapter、assisted workflow 与原有内部 policy                   | 普通 MCP deterministic 命令的必经路径            |
| `packages/database/` 与 host infra                      | credential/receipt schema 和端口实现，由各语义 owner 使用             | Gateway 直接操作业务表                           |

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

ID 使用稳定 snake_case，内部 capability ID 可采用 `goal.get` 等命名；不得将二者用不受控字符串替换相互推导。表中是候选发布集合，schema 和实际可用性由每项验收确定。

| 批次     | Tool                                                 | Owner / scope                                                    | 行为约束                                                           |
| -------- | ---------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| R1       | `goal_get`                                           | Goal / goals:read                                                | ID、摘要、KRs、version；不夹带 Task/Knowledge 私密内容             |
| R1       | `goal_search`                                        | Goal / goals:read                                                | 有界查询、确定排序和分页                                           |
| R1       | `task_plan_get`                                      | Task / tasks:read                                                | 返回定义、version、关联引用                                        |
| R1       | `task_plan_search`                                   | Task / tasks:read                                                | 按 owner 支持的过滤检索，不承诺不存在的全文搜索                    |
| R1       | `task_occurrence_get`                                | Task / tasks:read                                                | 返回执行状态、version、planId                                      |
| R1       | `task_occurrence_list`                               | Task / tasks:read                                                | 明确时间范围、时区与分页                                           |
| W1       | `goal_create`                                        | Goal / goals:write                                               | initial KRs 与 Goal 原子创建；不自动 activate                      |
| W1       | `goal_update`                                        | Goal / goals:write                                               | expectedVersion；首版排除整组 keyResults replacement               |
| W1       | `task_plan_create`                                   | Task / tasks:write                                               | schedule/reminderPolicy 由 owner 校验；新 binding 另需 goals:write |
| W1       | `task_plan_update`                                   | Task / tasks:write                                               | 显式 patch 与 expectedVersion；binding 同上                        |
| W1       | `task_occurrence_complete`                           | Task / tasks:write                                               | 精确 occurrence、并发条件、明确 measurement decision               |
| R2/W2    | `planner_today_summary`                              | Planner / planner:read + tasks:read + goals:read + routines:read | 汇聚 scope 取并集；首版全部满足才启用                              |
| R2/W2    | `planner_conflicts`                                  | Planner / 同上                                                   | 有界范围，保留冲突语义                                             |
| R2/W2    | `workspace_overview`                                 | Home composition / 上述 scope + notifications:read               | 显式版本化 sections；加入新来源前同步 scopes                       |
| R2/W2    | `notification_unread_summary`                        | Notification / notifications:read                                | 不隐式执行 action                                                  |
| R2/W2    | `knowledge_search`                                   | Knowledge / knowledge:read                                       | 只搜索 host 可访问且属于用户的索引，返回 freshness/source          |
| R2/W2    | `routine_create`                                     | Routine / routines:write                                         | Hosted 首版仅 WallClock；profile IDs 权限校验                      |
| R2/W2    | `routine_set_temporary_override`                     | Routine / routines:write                                         | 显式时间和 expiration，不能延伸为设备控制                          |
| Later    | `goal_archive`、`key_result_update_progress`         | Goal / goals:write                                               | 单独效果分类与版本/receipt 测试后发布                              |
| Later    | `knowledge_capture`                                  | Knowledge / knowledge:write                                      | 目标 KnowledgeSpace 可写、可恢复，禁止任意本地路径                 |
| Assisted | `goal_create_assisted`、`workflow_get/resume/cancel` | AI / workflows:read 或 workflows:execute + 实际 owner scopes     | 显式费用、审批、绑定 connection 的 durable handle                  |

R1 为 **6 个工具**，W1 后为 11 个；其余分能力扩展，不为凑 15～25 个而提前发布。MCP 自带发现功能足够，不新增 `capabilities_list` 平台 API。

### 跨 owner 权限

read scope 与 write scope 不互相隐含。write 结果可以返回该写操作自身的最小 receipt；后续完整查询仍需 read scope。Goal/Task 详情只返回已有关系引用，不因一个 scope 允许任意扩展其他 owner 内容。

Task 的已配置 Goal contribution 是完成动作的一部分，`tasks:write` consent 必须说明它会按既有配置影响目标进度；它不授权直接更新任意 Goal/KR。创建或更改 binding 要求 `tasks:write + goals:write` 及双方归属，不能靠对已有 Task 的写权限引入新 Goal 影响。读取 Goal 名称/测量上下文仍需 `goals:read`；没有时只允许 complete-only，不能偷偷取 protected context。

planner/workspace 首版采用 scope 并集并全有或全无，避免同名工具随权限变化输出难以理解的半个世界。后续如果需要按 section 降级，必须公开 omitted sections 和需要的 scopes，并发布契约变更。

## 5. 输入、时间、结果与分页

输入使用严格 Zod schema，拒绝未知 identityId、ownerId、source、approved、credential 等字段。业务字段复用 owner schema；工具层将内部可选 deterministic IDs 隐藏并由幂等执行生成，防止客户端用猜测 ID 改变 replay 行为。

时间沿用 Product Time：Instant 为 epoch milliseconds，日期为 Ymd，日程使用 IANA timeZone。描述中附可理解示例；不要把服务器系统时区作为“今天”。“明天 10 点”由客户端结合有效用户时区消歧；未能确定时返回 needs_input。月/季度目标通过 GoalTimeframe 表达，不能偷偷取某日午夜。

R1 list/search 默认 20 条、最多 100 条，时间列表默认最多 31 天窗口，使用 `(sortKey, id)` 确定排序。cursor 绑定 owner/filter/sort，并校验完整性；它不是权限凭证。现有 owner 不支持数据库分页时先补 owner query seam，禁止全量取数再 slice。超过响应预算时返回明确分页/截断指示，不悄悄丢掉结果；初始结构化结果预算建议 256 KiB。

工具结果保持 owner object identity，并附 schema version/业务 version；错误不包含栈、SQL、provider secret 或他人对象存在性。每项工具定义具体 `outputSchema`，不用任意 JSON map 代替契约。

候选公开结果词汇：

| 结果                                   | 客户端下一步                                       |
| -------------------------------------- | -------------------------------------------------- |
| `succeeded` + data/receipt             | 读取 canonical IDs 与版本；重复请求显示 replayed   |
| `needs_input` + fields/allowed choices | 收集明确输入后重新调用；未产生业务写入             |
| `accepted` + handle                    | 通过 workflow_get 或声明支持的 Tasks 查询          |
| `NOT_FOUND`                            | 对不存在和不属于用户的 ID 一致处理                 |
| `VALIDATION_ERROR`                     | 修正字段，不依赖错误文本解析                       |
| `CONFLICT` + safe version context      | 重新读取，决定是否覆盖；不自动替换 expectedVersion |
| `IDEMPOTENCY_CONFLICT`                 | 不复用同 key 表达新意图                            |
| `OPERATION_IN_PROGRESS`                | 有界等待并使用同 key 查询/重试                     |
| `RESULT_EXPIRED`                       | 原 key 不再执行；用户核对业务事实                  |
| `RATE_LIMITED` / `UNAVAILABLE`         | 遵循 retryAfter；不自动升级权限或更换身份          |

现有 owner public failures 通过 ADR-049 的单一边界映射；上述新增接入 code 只表达 Gateway 语义，不建立另一套领域错误体系。

## 6. 写入与审批

原子性、key namespace、输入摘要、原始结果重放与授权顺序以 ADR-118 为准。应将 receipt 能力注入 owner transaction runner，使用真实 PostgreSQL 集成测试证明进程重启、提交后断连和并发 duplicate。仅有 mocks 不够。

首批 `goal_update` 排除会整组替换/删除 KRs 的字段；保留 name/summary/description/timeframe/reminderConfig 等经过 owner 允许的 patch。增加危险操作时重新评估 tool effect 和 server approval，不能因为名叫 update 就自动标记无破坏性。

所有普通写工具要求 idempotencyKey。是否弹出客户端确认是额外 UX；服务器的写权限源是 grant。需要再次确认的高风险命令先不发布，直到有真实 approval intent 流程；不把它当作所有 CRUD 的平台前置。

## 7. OAuth/PAT 连接与运行策略

OAuth 协议步骤和撤销边界见 ADR-117。canonical resource URI 由部署配置指定，例如 `https://api.example.com/mcp`；这是占位符，不是已部署地址。metadata URI 按 RFC 与实际 root route 映射，API `/api/v1` prefix 不自动应用到 MCP discovery。

新授权数据不得进入 PowerSync、数据导出、浏览器日志或 AI conversation；用户可见连接名称、scope、最近使用、有效期和撤销按钮。scope 扩大必须重新 consent；已存在只读 connection 不因发布新工具自动获得写能力。

Gateway 启动默认关闭，read/write/assisted 分别有受验证配置的 rollout 开关。read 开关关闭时已有连接收到明确 unavailable；write 关闭时不再发现或执行写工具。shutdown 停止接收新调用并有界 drain，已 durable 的 workflow 由原 runtime 恢复；不能关闭同进程共享 owner 实例。

rate limit 按 IP（未认证）、owner/connection/tool（认证后）组合，在多实例下仍有效。具体阈值来自 load test；请求体建议 256 KiB、普通工具截止时间 30 秒、页大小硬上限作为初值写入统一配置。所有 limits 都在转换为昂贵 owner query 前检查。

EAG-02 的具体 owner read budget：Goal 行最多 101（含 lookahead），每 Goal 先检查 KR count，最多 100；正文 description/review/snapshot 不进入读取。name/summary/KR title/unit 的字节长度先由 PostgreSQL 检查，超出 owner 投影上限的单聚合返回明确 `RESPONSE_TOO_LARGE`，不伪造部分 KR 的 overallProgress。搜索页超出传输预算时缩小返回页并标记 `truncated=response-budget`，游标仍从最后实际返回项继续。整个 HTTP 调用有共同截止时间；取消信号单独传给查询，不扩展或混用 ExecutionContext。Goal 查询使用 transaction-local PostgreSQL statement_timeout 和 transaction timeout，认证/账户 authority 的独立只读查询最多 5 秒；响应停止等待之后数据库工作仍有明确上界。Redis admission 同样必须有命令超时，429 含 Retry-After。

audit 最小字段：request/trace ID、connection/credential ID、owner identity、tool/version、effect、scope decision、duration、outcome code、operation receipt ID、replayed。默认不记录 token、参数全文、知识正文或模型对话。unauthenticated/denied/read 调用也要可追踪；首版使用现有结构化日志与持久日志收集，写成功 receipt 是 durable audit fact。

## 8. Hosted 能力与 Workflow 适配

WallClock intent -> owner scheduling port -> durable Scheduler -> Notification delivery。Agent 进程退出不是计时依赖；通知最终在何种设备出现由 Notification policy 和设备能力决定。

Elapsed/ActiveUsage/专注 protocol 需要设备本地执行，暂不通过 Hosted MCP 发布。仅“服务端接受了 startProtocol”不构成用户设备实际执行的证据。

高级 workflow 在 EAG-10 单独设计并验证。先通过现有 runtime public seam 保持 owner/revision/receipts，再做 Tasks/MRTR 投影。客户端未声明扩展时使用普通 workflow tools，首期不能为等待用户回复占用长连接。

内部 native review 和外部 headless review 可以共享 owner 输入契约，但外部 apply 需要明确的服务器审批事实或受授权的直接提交政策；没有这个闭环时 assisted 工具只能返回 draft，不得报告 Goal 已创建。

## 9. 验收、不确定项与复核时机

验收 ID 和责任切片集中在实施总方案，避免重复维护进度。以下实施决定必须由证据关闭：

- EAG-01：精确 SDK/Better Auth 版本、CIMD profile、旧协议兼容开关和真实 CLI callback。
- EAG-02/03：现有 owner query 是否满足 bounded pagination；不能以总数小为长期理由。
- EAG-04：JWT grant 标识与在线撤销检查是否可由官方 provider 稳定支持。
- EAG-06～08：receipt 如何加入现有 owner transaction，Task 并发版本及 Prompt decision 如何进入 canonical owner seam。
- EAG-09：Routine one-shot WallClock 的 owner 表达、Knowledge host 可访问性和各聚合 scope 清单。
- EAG-10：实施时 workflow public seam、Tasks/MRTR 客户端支持与 headless review 能力；本轮已有 runtime 提取文档已归档。

这些是已指定切片的技术验证任务，不是要求现在先解决全部问题才能交付只读 Gateway。若验证改变 ADR 的关键选择，更新对应 ADR 后继续，不能以文档中的建议冒充已验证 API。


## 生产边界

生产 API 不发布宿主端口，只信任一个内部代理 hop（`API_TRUST_PROXY_HOPS=1`）。Caddy 仅信任 Cloudflare 公布网段的 `CF-Connecting-IP`，将解析后的地址覆盖为单一 `X-Forwarded-For`；直连 origin 的伪造 forwarding header 无效。其他宿主默认不信任代理。

Caddy access log 删除 URI、Referer 与 Location，Nginx access log 只记录不含查询的路径。授权 query、code、token 不作为日志字段。Cloudflare 网段变更时须更新 Caddy 配置并验证；不以信任任意代理替代。
