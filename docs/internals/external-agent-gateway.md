---
tags: [architecture, mcp, ai, external-agent]
description: MemoFlow External Agent Gateway 当前能力、认证、事务写入与运行边界
created: 2026-10-07T00:00:00Z
updated: 2026-11-16T00:00:00Z
---

# MemoFlow External Agent Gateway

**状态：代码与组装已就绪，全部默认关闭。** Gateway 当前实现 32 个工具：14 个只读（Goal/Task/Routine 9 个 + Notification 2 个 + Label 2 个 + Relation 1 个）、13 个写（Goal/KR、TaskPlan、TaskOccurrence、Routine 全写、`notification_mark_read`）、5 个 assisted Task workflow；OAuth 仍只有 9 个只读工具。写与 assisted 只对 PAT 开放，且每次调用都经过 AI 权限 checkpoint。生产开关尚未翻转，公共 rollout 未完成；开启步骤见 [§10 runbook](#10-一期开启-runbook)。#490/#538/#539 的本地验收只代表代码路径，不代表生产已部署。

先读 [仓库核验](https://github.com/BakerSean168/memoflow/blob/7a45112e1840950ead1ba98b748fc70fa1b38344/docs/analysis/2026-10-07-external-agent-repository-assessment.md) 和 [协议研究](https://github.com/BakerSean168/memoflow/blob/7a45112e1840950ead1ba98b748fc70fa1b38344/docs/analysis/2026-10-07-external-agent-protocol-research.md)。长期决策分别是 [ADR-116：能力边界](./decisions/ADR-116-external-agent-capability-and-gateway-boundary.md)、[ADR-117：授权](./decisions/ADR-117-external-agent-authorization-and-credentials.md)、[ADR-118：写入与工作流](./decisions/ADR-118-external-agent-mutations-and-assisted-workflows.md)。执行顺序以 [实施总方案](https://github.com/BakerSean168/memoflow/issues/490) 为准；[术语表](./glossary.md) 只定义概念。

## 1. 用户可见结果与边界

第一里程碑：添加 MemoFlow MCP URL，经 OAuth 登录/注册及同意后，用户可以问“列出本周任务和相关目标”，获得只属于自己的结构化对象。
第二里程碑：用户授予写权限后，可以创建 Goal（包括 KRs）、创建 TaskPlan、修改定义、完成指定 TaskOccurrence；网络重试不会重复写入，和 Web/Desktop 并发编辑会明确返回冲突。

高级能力随后提供 MemoFlow-assisted planning、云端提醒及 Knowledge capture。当前有云端 Routine 读写（`routine_get/list/upcoming` 与 `routine_create/update/delete/pause/override`）和 5 个 assisted Task workflow 工具，均默认关闭；SDK/CLI/skills/webhooks 是后续分发渠道，不能成为 Gateway 首版依赖。

第一版不提供账号创建工具、全量 REST 自动翻译、批量永久删除、管理员工具、任意 SQL、任意 URL/file 读取、Desktop 远程控制或自建 Agent runtime。ChatGPT 等其他客户端列为后续兼容对象，不将未测试支持写成已交付。

## 2. 责任与包落点

下列包及 API host 复用 R1/PAT/OAuth 与 Owner 契约；写入由 Owner 持有事务，assisted workflow 通过既有 durable runtime 绑定。

| 所在位置                                     | 责任                                                                  | 不承担                                           |
| -------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------ |
| `apps/api/src/modules/agent-gateway/`        | Gateway host composer、owner port wiring、root `/mcp` 注册            | 领域规则与协议重实现                             |
| `packages/agent-gateway/`（support package） | MCP adapter、入站能力调用、gateway-owned ports；server 子入口隔离 SDK | Goal/Task repository、OAuth 实现、Mastra runtime |
| `packages/agent-gateway/src/contracts/`      | 公开 tool input/output/失败与 descriptor 数据；从 owner schema 组合   | handler、SDK 类型、Prisma 类型                   |
| `packages/cloud-auth/`                       | external grant/PAT 认证、provider ACL、撤销和登录集成                 | Goal/Task 权限规则                               |
| `packages/goal/`、`packages/task/` 等        | application operation、ownership、事务、并发、领域事件                | MCP envelope 与 OAuth token                      |
| `packages/ai/`                               | Mastra adapter、assisted workflow 与原有内部 policy                   | 普通 MCP deterministic 命令的必经路径            |
| `packages/database/` 与 host infra           | credential/receipt schema 和端口实现，由各语义 owner 使用             | Gateway 直接操作业务表                           |

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

| 批次 | Tool                            | Owner / scope                      | 行为约束                                                                                                                                |
| ---- | ------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| R1   | `goal_get`                      | Goal / goals:read                  | ID、摘要、KRs、version；不夹带 Task/Knowledge 私密内容                                                                                  |
| R1   | `goal_search`                   | Goal / goals:read                  | 有界查询、确定排序和分页                                                                                                                |
| R1   | `task_plan_get`                 | Task / tasks:read                  | 返回定义、version、关联引用                                                                                                             |
| R1   | `task_plan_search`              | Task / tasks:read                  | 按 owner 支持的过滤检索，不承诺不存在的全文搜索                                                                                         |
| R1   | `task_occurrence_get`           | Task / tasks:read                  | 返回执行状态、version、planId                                                                                                           |
| R1   | `task_occurrence_list`          | Task / tasks:read                  | 明确时间范围、时区与分页                                                                                                                |
| R1   | `notification_get`              | Notification / notifications:read  | 单个通知事实；不含身份与审计关联                                                                                                        |
| R1   | `notification_list`             | Notification / notifications:read  | 分页列表（page ≤ 20, limit ≤ 50），正文截断 2000 字符；execute-action 不开放                                                            |
| R1   | `notification_unread_count`     | Notification / notifications:read  | 统计未读通知数量                                                                                                                        |
| R2   | `relation_neighbors`            | Relation / relations:read          | 查询 Goal/Task/Knowledge 跨域邻居（类型过滤与游标分页）；只返回双方均可见的关系，指向不可见/跨 owner 节点的边直接省略，不泄露对端存在性 |
| R2   | `routine_get`                   | Routine / routines:read            | 单个定义与 trigger revision                                                                                                             |
| R2   | `routine_list`                  | Routine / routines:read            | 名称/描述过滤、确定排序、有界分页                                                                                                       |
| R2   | `routine_upcoming`              | Routine / routines:read            | epoch 毫秒窗口最长 31 天，单页最多 100 条                                                                                               |
| R2   | `label_list`                    | Label / labels:read                | 标签列表与搜索，支持分页与确定排序；有界强类型契约                                                                                      |
| R2   | `label_resolve_names`           | Label / labels:read                | 按名称批量解析标签，返回已知标签列表；不越界查询                                                                                        |
| R3   | `schedule_get`                  | Schedule / schedules:read          | 单个日历条目；不含内部审计或租户关联                                                                                                    |
| R3   | `schedule_list`                 | Schedule / schedules:read          | epoch 毫秒范围最长 90 天，单页最多 100 条                                                                                               |
| W1   | `goal_create`                   | Goal / goals:write                 | initial KRs 与 Goal 原子创建；不自动 activate                                                                                           |
| W1   | `goal_update`                   | Goal / goals:write                 | expectedVersion；首版排除整组 keyResults replacement                                                                                    |
| W1   | `goal_key_result_create/update` | Goal / goals:write                 | 单 KR 命令使用 Goal expectedVersion；不替换整个集合                                                                                     |
| W1   | `task_plan_create`              | Task / tasks:write                 | schedule/reminderPolicy 由 owner 校验；新 binding 另需 goals:write；暂不支持 labelIds（传入非空返回 VALIDATION_ERROR）                  |
| W1   | `task_plan_update`              | Task / tasks:write                 | 显式 patch 与 expectedVersion；binding 同上；暂不支持 labelIds（传入非空返回 VALIDATION_ERROR）                                         |
| W1   | `task_occurrence_complete`      | Task / tasks:write                 | 精确 occurrence、并发条件、明确 measurement decision                                                                                    |
| W1   | `routine_create`                | Routine / routines:write           | WallClock 单次或合法 recurrence；另需 `EAG_ROUTINE_WRITE_ENABLED=1`                                                                     |
| W1   | `routine_update`                | Routine / routines:write           | expectedVersion；trigger 仅接受托管 WallClock                                                                                           |
| W1   | `routine_delete`                | Routine / routines:write           | expectedVersion；不可恢复的永久删除                                                                                                     |
| W1   | `routine_pause`                 | Routine / routines:write           | 暂停至指定时刻，最长 30 天                                                                                                              |
| W1   | `routine_override`              | Routine / routines:write           | snooze/suppress/interval，expiresAt 必填且最长 30 天                                                                                    |
| W1   | `notification_mark_read`        | Notification / notifications:write | 标记通知已读（幂等）；execute-action 动作执行不开放（留三期评估）                                                                       |
| A1   | `assisted_workflow_start`       | Task / tasks:write                 | 启动或恢复一个受审核的 Task planning run                                                                                                |
| A1   | `assisted_workflow_get`         | Task / tasks:write                 | 读取自有 run 的当前 revision                                                                                                            |
| A1   | `assisted_workflow_review`      | Task / tasks:write                 | 读取待决定的 typed ask 或 Task draft                                                                                                    |
| A1   | `assisted_workflow_resume`      | Task / tasks:write                 | 回答澄清、批准精确 draft 或恢复 apply                                                                                                   |
| A1   | `assisted_workflow_cancel`      | Task / tasks:write                 | 取消剩余工作并保留已提交的 Task facts                                                                                                   |

R1 为 **9 个工具**（Goal 2 个 + Task 4 个 + Notification 3 个），R2 为 **6 个只读工具**（Routine 3 个、Label 2 个、Relation 1 个），R3 为 **2 个 Schedule 只读工具**，W1 为 **13 个写工具**（含 `notification_mark_read`），A1 为 **5 个 assisted 工具**，合计 **35 个**。R3 由宿主绑定 Schedule owner 端口后发布（本地桥接绑定；托管 API 尚未绑定该端口，因此托管连接不可见），只读且不提供日历写入。OAuth 仍只有九个只读工具；写与 assisted 仅对 PAT 发布，且需要对应 write scope 和相应开关。MCP 自带发现功能足够，不新增 `capabilities_list` 平台 API。

### 跨 owner 权限

read scope 与 write scope 不互相隐含。MCP write 结果只返回该写操作自身的最小 receipt（ID、版本、影响的实体 ID、replayed），持久 receipt 也只保存同一投影；Owner 完整 read model 不进入外部写入回执，后续完整查询仍需 read scope。Goal/Task 详情只返回已有关系引用，不因一个 scope 允许任意扩展其他 owner 内容。

Task 的已配置 Goal contribution 是完成动作的一部分，`tasks:write` consent 必须说明它会按既有配置影响目标进度；它不授权直接更新任意 Goal/KR。创建或更改 binding 要求 `tasks:write + goals:write` 及双方归属，不能靠对已有 Task 的写权限引入新 Goal 影响。读取 Goal 名称/测量上下文仍需 `goals:read`；没有时只允许 complete-only，不能偷偷取 protected context。

Notification 域在 #990 接入：开放 `notification_list` 与 `notification_unread_count` 读工具及 `notification_mark_read` 写工具；#995 追加单条读取 `notification_get`（同一 `notifications:read` scope）。**execute-action 动作执行明确不开放**（动作执行牵涉各业务域副作用，留三期评估），在工具清单与文档中均明确标注。Planner/Knowledge 的扩展按真实需求单列在 [#539](https://github.com/BakerSean168/memoflow/issues/539)；Routine 读写已随 [#972](https://github.com/BakerSean168/memoflow/issues/972) 二期注册，写工具由 `EAG_ROUTINE_WRITE_ENABLED` 单独开关，其余工具尚未注册。

### 标签写操作显式拒绝契约（#993）

云端 MCP 二期仅开放 `labels:read` 读工具（`label_list`、`label_resolve_names`）。写侧维持对标签创建与分配的一刀切拒绝，但将其固化为显式契约：

- **拒绝入口**：`task_plan_create`（传入非空 `plan.labelIds`）、`task_plan_update`（传入非空 `changes.labelIds`），以及 `assisted_workflow_*` 生成含标签变更草案并审批提交时。
- **错误码**：返回确定性错误码 `VALIDATION_ERROR`（对外错误文本即该 code；标签写不另造业务错误体系）。
- **暂不开放原因**：标签体系涉及跨实体双向引用和组织治理策略，目前 External Agent 尚未建立标签生命周期与写安全模型，为避免脏数据和多端同步不一致，暂不开放外部 Agent 写入标签。
- **回归保证**：写端口与 assisted workflow 集成测试包含显式回归用例，确保写拒绝路径不退化。

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

Desktop 离线写入经 PowerSync 上行时使用同一冲突口径：`goals`/`task_plans` 以 `version` 乐观锁拒绝过期上传，同步接口返回 409 `row_version_conflict`，客户端留证后不重试该笔；规则见 [ADR-124](./decisions/ADR-124-powersync-uplink-row-version-guard.md)。

## 6. 写入与审批

原子性和重试契约以 ADR-118 为准。`packages/database/src/adapters/prisma/external-mutation.ts` 提供两个真实 Owner 共用的 PostgreSQL 事务 receipt runner。身份 + capability version + key 的 SHA-256 标识使用数据库 advisory transaction lock 串行化；凭据轮换后同一 owner 的重试仍重放已提交结果，`connection_id` 只作首次执行审计。schema 归一化后按排序字段计算摘要。同 key 异 body 返回 `IDEMPOTENCY_CONFLICT`，同 body 返回原始结果及 `replayed: true`。回执只保存响应实际返回的最小投影，不保存 Owner 完整 read model；回执不自动过期；原结果不会用当前对象替换。账户删除通过 Account 外键级联清理回执。

Goal/Task 各自在自己的 infrastructure factory 中创建 transaction-bound repositories，并调用原有 application commands。Owner facts、receipt、Task→Goal 现有 outbox 一起提交。业务失败或 receipt 写入失败回滚；MCP 超时/断连只停止等待，不能撤销已提交事实，客户端必须用同一 key 重试。事务 15 秒、SQL 10 秒、锁等待 5 秒有界；Task owner 事务加入已有的 receipt 事务而不新开嵌套事务，因此继承同一预算。并发 Task/Goal 的最终 CAS 仍由 Owner repository 执行。Gateway 既不取得 repositories，也不直接写 GoalRecord。

每次请求及执行/重放前重新校验当前凭据；写路径在 receipt 事务开始前完成校验，避免事务内等待第二条连接。写入只接受 PAT。Task binding 更改另需 `goals:write` 且在 Owner 事务中查双方归属；记录 Prompt measurement 另需 `goals:read`。`complete_only` 不用 suggestedValue 伪造测量；Fixed 贡献沿用 Task 既有语义。成功 receipt 是持久审计事实，传输审计另含 tool/effect/receiptId/replayed，不记录正文或 token。

首批 `goal_update` 排除会整组替换/删除 KRs 的字段；保留 name/summary/description/timeframe/reminderConfig 等经过 owner 允许的 patch。增加危险操作时重新评估 tool effect 和 server approval，不能因为名叫 update 就自动标记无破坏性。

所有普通写工具要求 idempotencyKey。每次工具调用（读、写、assisted）都经过 `packages/ai` 的 AI 权限 checkpoint，Gateway 不直连 owner port。checkpoint 的默认 preset 是 `confirm_each`；对 MCP 写调用，`PAT + 命中该 operation 的写 scope + operation 已在 `operation-catalog` 登记`视为签发时的用户预授权，checkpoint 放行并写审计。scope 外、未登记 operation、OAuth 凭据写请求仍拒；显式 deny 规则和 `read_only` preset 仍然优先。放行与拒绝都记录 `credentialId`（权限审计中的 `agentId` 为 `external-mcp:<credentialId>`，传输审计另带 `credentialId`）。需要再次确认的高风险命令先不发布，直到有真实 approval intent 流程；不把它当作所有 CRUD 的平台前置。

## 7. OAuth/PAT 连接与运行策略

OAuth 协议步骤和撤销边界见 ADR-117。canonical resource URI 由部署配置指定，例如 `https://api.example.com/mcp`；这是占位符，不是已部署地址。metadata URI 按 RFC 与实际 root route 映射，API `/api/v1` prefix 不自动应用到 MCP discovery。

新授权数据不得进入 PowerSync、数据导出、浏览器日志或 AI conversation；用户可见连接名称、scope、最近使用、有效期和撤销按钮。scope 扩大必须重新 consent；已存在只读 connection 不因发布新工具自动获得写能力。

Gateway 由 `EAG_READ_PILOT_ENABLED` 总开关控制，默认 `0`；关闭时 `/mcp` 与 `/agent-connections/*`（PAT/OAuth 管理）都不挂载，而不是返回空工具列表。其余子开关默认：`EAG_TASK_READ_ENABLED=1`、`EAG_WRITE_ENABLED=0`、`EAG_ROUTINE_WRITE_ENABLED=0`、`EAG_ASSISTED_ENABLED=0`、`EAG_OAUTH_ENABLED=0`。`apps/api/src/server.ts` 的 compose 已把 `enabled`、`writes`（含 `routineWriteEnabled`）和 `assisted` 传入 Gateway；写关闭时不再发现或执行写工具，assisted 关闭时 5 个 assisted 工具不发布。`EAG_ASSISTED_ENABLED=1` 依赖 durable AI workflow runtime，启动时缺失会直接失败。shutdown 沿用现有 API host 生命周期；本轮未执行完整容器 shutdown/drain 验收，不宣称已验证该运行边界。

rate limit 按 IP（未认证）、owner/connection/tool（认证后）组合，在多实例下仍有效。具体阈值来自 load test；请求体建议 256 KiB、普通工具截止时间 30 秒、页大小硬上限作为初值写入统一配置。所有 limits 都在转换为昂贵 owner query 前检查。

EAG-02 的具体 owner read budget：Goal 行最多 101（含 lookahead），每 Goal 先检查 KR count，最多 100；正文 description/review/snapshot 不进入读取。name/summary/KR title/unit 的字节长度先由 PostgreSQL 检查，超出 owner 投影上限的单聚合返回明确 `RESPONSE_TOO_LARGE`，不伪造部分 KR 的 overallProgress。搜索页超出传输预算时缩小返回页并标记 `truncated=response-budget`，游标仍从最后实际返回项继续。整个 HTTP 调用有共同截止时间；取消信号单独传给查询，不扩展或混用 ExecutionContext。Goal 查询使用 transaction-local PostgreSQL statement_timeout 和 transaction timeout，认证/账户 authority 的独立只读查询最多 5 秒；响应停止等待之后数据库工作仍有明确上界。Redis admission 同样必须有命令超时，429 含 Retry-After。

audit 最小字段：request/trace ID、connection/credential ID、owner identity、tool/version、effect、scope decision、duration、outcome code、operation receipt ID、replayed。默认不记录 token、参数全文、知识正文或模型对话。unauthenticated/denied/read 调用也要可追踪；首版使用现有结构化日志与持久日志收集，写成功 receipt 是 durable audit fact。

## 8. Hosted 能力与 Workflow 适配

WallClock intent -> owner scheduling port -> durable Scheduler -> Notification delivery。Agent 进程退出不是计时依赖；通知最终在何种设备出现由 Notification policy 和设备能力决定。

Elapsed/ActiveUsage/专注 protocol 需要设备本地执行，暂不通过 Hosted MCP 发布。仅“服务端接受了 startProtocol”不构成用户设备实际执行的证据。

高级 workflow 在 EAG-10 单独设计并验证。先通过现有 runtime public seam 保持 owner/revision/receipts，再做 Tasks/MRTR 投影。客户端未声明扩展时使用普通 workflow tools，首期不能为等待用户回复占用长连接。

内部 native review 和外部 headless review 可以共享 owner 输入契约，但外部 apply 需要明确的服务器审批事实或受授权的直接提交政策；没有这个闭环时 assisted 工具只能返回 draft，不得报告 Goal 已创建。

## 9. 当前 main 审计与未交付范围

基线 `99101ddd9`（#969）；更早的历史 Active Plan 仅供参考。OAuth 早期 PAT 验收中的“延期”已被后续实现替代，不能继续作为当前状态。

| 项目         | 交付状态                                                                            | file:line 证据                                                                                                                                                                                                                |
| ------------ | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EAG-01/02/03 | Accepted：PAT + 十三只读工具                                                        | `packages/cloud-auth/src/server/scoped-pat.ts`；`packages/agent-gateway/src/server/register-read-tools.ts`                                                                                                                    |
| EAG-04       | Accepted：OAuth 实现及历史本地生命周期验收；公共 rollout 未交付                     | `packages/cloud-auth/src/server/external-agent-oauth.ts`                                                                                                                                                                      |
| EAG-05       | Accepted：历史本地 PG/浏览器/两 CLI 只读验收；未证明生产部署                        | `docs/analysis/2026-10-07-eag-04-oauth-read-evidence.md`                                                                                                                                                                      |
| EAG-06/07/08 | Accepted：PostgreSQL 通用 receipt + 12 个 PAT 写工具（含 Routine 全写）             | `apps/api/src/modules/agent-gateway/write.port.ts`；`apps/api/src/__tests__/integration/agent-gateway-write.integration.test.ts`、`agent-gateway-assembly.integration.test.ts`                                                |
| EAG-09       | Partial：Routine 全写已交付（#972 二期）；Planner/Notification/Knowledge 扩展仍按需 | [#972](https://github.com/BakerSean168/memoflow/issues/972)；`packages/agent-gateway/src/write-tool-descriptors.ts`、`apps/api/src/modules/agent-gateway/write.port.ts`                                                       |
| EAG-10       | Accepted at code/compose level：5 个 assisted 工具已注册；生产开关未开启            | `apps/api/src/modules/agent-gateway/assisted-workflow.ts`、`packages/agent-gateway/src/server/register-assisted-tools.ts`、`packages/ai/src/server/permissions/operation-catalog.ts`、`assisted-workflow.integration.test.ts` |

[#538](https://github.com/BakerSean168/memoflow/issues/538) 复用现有 durable runtime 与 ask/resume，已提供不透明且 connection-bound handle、revision、apply 前授权和取消竞态验收。runtime 的 identity/runId 不直接当外部授权；没有第二个执行器。

新写入的 Linux 本地 PG/HTTP 验收不代表真实客户端或 release/staging 已验收。公开部署、打包制品、真实 Codex/Claude 写调用仍为 manual acceptance pending，复现步骤及实际结果记录在 #490。禁止仅因文档列出能力就在 release/staging 开启写工具。

## 10. 一期开启 runbook

生产模板见 `deployment/production/docker-compose.production.yml`；本 runbook 只说明运维翻转，本单不改生产 env。

| 变量                        | 开启值                   | 说明                                                                                |
| --------------------------- | ------------------------ | ----------------------------------------------------------------------------------- |
| `EAG_READ_PILOT_ENABLED`    | `1`                      | 总开关；为 `0` 时 `/mcp` 与 PAT/OAuth 管理路由都不挂载                              |
| `EAG_AUDIENCE`              | `https://<api-host>/mcp` | 必须是 HTTPS 的规范 origin + `/mcp`；其 host 必须与请求 `Host` 一致，否则 403       |
| `EAG_CURSOR_SECRET`         | 随机 ≥32 字节            | 分页游标密钥；跨重启保持稳定                                                        |
| `EAG_TASK_READ_ENABLED`     | `1`                      | Task 只读工具；默认已为 `1`                                                         |
| `EAG_WRITE_ENABLED`         | `1`                      | 发布 8 个 PAT 写工具                                                                |
| `EAG_ROUTINE_WRITE_ENABLED` | `1`                      | 在 writes 打开的前提下发布 Routine 写工具（create/update/delete/pause/override）    |
| `EAG_ASSISTED_ENABLED`      | `1`                      | 发布 5 个 assisted 工具；要求 durable AI workflow runtime，否则启动失败             |
| `EAG_OAUTH_ENABLED`         | 可选 `1`                 | 需要总开关、`AUTH_BASE_URL`（HTTPS `/api/auth`）与 `MEMOFLOW_WEB_URL`；OAuth 仍只读 |

一致性检查：

- `AUTH_BASE_URL` 是 OAuth issuer，必须指向 `https://<auth-host>/api/auth`。
- `MEMOFLOW_WEB_URL` 与 `CORS_ORIGIN` 共同构成 PAT/OAuth 管理端点的 trusted origins；签发/撤销的浏览器请求必须带其中一个 `Origin`，否则 403。
- `EAG_AUDIENCE` 的 host 必须与公网入口实际转发到 API 的 `Host` 一致；API 不发布宿主端口，`API_TRUST_PROXY_HOPS=1` 只信任一个内部代理 hop。

开启顺序（每步验证后再下一步）：

1. 总开关 + audience + cursor secret：`EAG_READ_PILOT_ENABLED=1`。验证 `/<api-host>/mcp` 可认证、PAT 创建/列表/撤销可用、14 个只读工具可用（含 `labels:read` 授权下的 `label_list`、`label_resolve_names`，以及 `relations:read` 授权下的 `relation_neighbors`）。
2. 写：`EAG_WRITE_ENABLED=1`。用带 `goals:write`/`tasks:write` 的 PAT 验证 `goal_create`、`task_plan_create` 与重放。注意：写侧暂不开放标签写入，`task_plan_create` / `task_plan_update` 传入非空 `labelIds` 时应返回显式 `VALIDATION_ERROR`。
3. Routine：`EAG_ROUTINE_WRITE_ENABLED=1`。用 `routines:read`/`routines:write` 验证 `routine_list`、`routine_upcoming` 与 `routine_create/update/delete/pause/override`。
4. Assisted：`EAG_ASSISTED_ENABLED=1`。验证 `assisted_workflow_start → review → resume(approve)`。
5. OAuth（可选）：最后再开 `EAG_OAUTH_ENABLED=1`。

回滚：把对应开关置回 `0` 并重启 API。子开关回滚只隐藏对应工具；总开关回滚会同时卸下 `/mcp` 与管理路由，需重新打开才能恢复。已持久化的 receipt 和 assisted workflow 行保留，无需数据迁移回滚。

## 生产边界

生产 API 不发布宿主端口，只信任一个内部代理 hop（`API_TRUST_PROXY_HOPS=1`）。Caddy 仅信任 Cloudflare 公布网段的 `CF-Connecting-IP`，将解析后的地址覆盖为单一 `X-Forwarded-For`；直连 origin 的伪造 forwarding header 无效。其他宿主默认不信任代理。

Caddy access log 删除 URI、Referer 与 Location，Nginx access log 只记录不含查询的路径。授权 query、code、token 不作为日志字段。Cloudflare 网段变更时须更新 Caddy 配置并验证；不以信任任意代理替代。
