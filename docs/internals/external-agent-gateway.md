---
tags: [architecture, mcp, ai, external-agent]
description: MemoFlow External Agent Gateway 当前能力、认证、事务写入与运行边界
created: 2026-10-07T00:00:00Z
updated: 2026-11-24T00:00:00Z
---

# MemoFlow External Agent Gateway

**状态：代码与组装已就绪，全部默认关闭。** 共享 descriptor 定义 47 个工具：2 个静态指南/校验、23 个只读（Goal 2、Task 4、Relation 1、Routine 3、Notification 4、AI 5、Schedule 2、Label 2）、17 个写（Goal/KR、Goal plan、TaskPlan、TaskOccurrence、Routine 全写、Notification 已读/未读/归档/恢复/偏好）、5 个 assisted Task workflow。Hosted 当前未绑定 Schedule 读端口，因此实际发布上限为 45 个（只读 21 个）；逐工具、逐宿主的真实可用性以 [Desktop Local MCP capability matrix](./local-mcp-capability-matrix.md) 为准。OAuth 复用同一组 12 个 scope：写与 assisted 由 `EAG_OAUTH_WRITE_ENABLED` 控制，关闭时只发布读工具（[#1054](https://github.com/BakerSean168/memoflow/issues/1054)）。生产开关尚未翻转，公共 rollout 未完成；开启步骤见 [§10 runbook](#10-一期开启-runbook)。#490/#538/#539 的本地验收只代表代码路径，不代表生产已部署。

## 0. 硬边界：OAuth 写由全局开关控制

**OAuth 与 PAT 使用同一组 12 个业务 scope，读 scope 与写 scope 互不隐含。** OAuth 写能力由 `EAG_OAUTH_WRITE_ENABLED` 控制：为 `0` 时写 scope 不可授予、已发 token 的写能力在 Gateway 与写事务两层立即失效，读与 PAT 不受影响；为 `1` 时按 scope 发布写与 assisted 工具。assisted 不再保留 PAT-only 例外（#1054）。改开关或 scope 时不要只改一层：签发、Gateway 发布/调用、AI checkpoint 与写事务 authority 必须同时对齐。

若未来开放 OAuth 写，必须先满足 [OAuth 写 consent 设计评估](./external-agent-oauth-write-consent.md) 的前置条件，并新增独立默认关闭的开关；该文同时给出 scope 映射、consent/审计/吊销要求和回滚方案。[#1033](https://github.com/BakerSean168/memoflow/issues/1033) 当前结论为“有条件开放、当前不开放”。

先读 [仓库核验](https://github.com/BakerSean168/memoflow/blob/7a45112e1840950ead1ba98b748fc70fa1b38344/docs/analysis/2026-10-07-external-agent-repository-assessment.md) 和 [协议研究](https://github.com/BakerSean168/memoflow/blob/7a45112e1840950ead1ba98b748fc70fa1b38344/docs/analysis/2026-10-07-external-agent-protocol-research.md)。长期决策分别是 [ADR-116：能力边界](./decisions/ADR-116-external-agent-capability-and-gateway-boundary.md)、[ADR-117：授权](./decisions/ADR-117-external-agent-authorization-and-credentials.md)、[ADR-118：写入与工作流](./decisions/ADR-118-external-agent-mutations-and-assisted-workflows.md)。执行顺序以 [实施总方案](https://github.com/BakerSean168/memoflow/issues/490) 为准；[术语表](./glossary.md) 只定义概念。

## 1. 用户可见结果与边界

第一里程碑：添加 MemoFlow MCP URL，经 OAuth 登录/注册及同意后，用户可以问“列出本周任务和相关目标”，获得只属于自己的结构化对象。
第二里程碑：用户授予写权限后，可以创建 Goal（包括 KRs）、创建 TaskPlan、修改定义、完成指定 TaskOccurrence；网络重试不会重复写入，和 Web/Desktop 并发编辑会明确返回冲突。

高级能力随后提供 MemoFlow-assisted planning、云端提醒及 Knowledge capture。当前有云端 Routine 读写（`routine_get/list/upcoming` 与 `routine_create/update/delete/pause/override`）和 5 个 assisted Task workflow 工具，均默认关闭；当前另提供共享业务 Skill 与普通指南工具，供当前 Agent 自主规划；CLI/webhooks 等后续分发渠道不成为 Gateway 依赖。

第一版不提供账号创建工具、全量 REST 自动翻译、批量永久删除、管理员工具、任意 SQL、任意 URL/file 读取或自建 Agent runtime。Hosted Gateway 不提供 Desktop 窗口控制；Local Host 的原生表单交接见下文。ChatGPT 等其他客户端列为后续兼容对象，不将未测试支持写成已交付。

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

| 批次 | Tool                                 | Owner / scope                      | 行为约束                                                                                                                                |
| ---- | ------------------------------------ | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| R1   | `goal_get`                           | Goal / goals:read                  | ID、摘要、KRs、version；不夹带 Task/Knowledge 私密内容                                                                                  |
| R1   | `goal_search`                        | Goal / goals:read                  | 有界查询、确定排序和分页                                                                                                                |
| R1   | `task_plan_get`                      | Task / tasks:read                  | 返回定义、version、关联引用                                                                                                             |
| R1   | `task_plan_search`                   | Task / tasks:read                  | 按 owner 支持的过滤检索，不承诺不存在的全文搜索                                                                                         |
| R1   | `task_occurrence_get`                | Task / tasks:read                  | 返回执行状态、version、planId                                                                                                           |
| R1   | `task_occurrence_list`               | Task / tasks:read                  | 明确时间范围、时区与分页                                                                                                                |
| R1   | `notification_get`                   | Notification / notifications:read  | 单个通知事实；不含身份与审计关联                                                                                                        |
| R1   | `notification_list`                  | Notification / notifications:read  | 分页列表（page ≤ 20, limit ≤ 50），正文截断 2000 字符；execute-action 不开放                                                            |
| R1   | `notification_unread_count`          | Notification / notifications:read  | 统计未读通知数量                                                                                                                        |
| R1   | `notification_preferences_get`       | Notification / notifications:read  | 读取凭据所有者自己的投递偏好（渠道开关、workflow overrides、静默时段）；不含身份字段                                                    |
| R2   | `relation_neighbors`                 | Relation / relations:read          | 查询 Goal/Task/Knowledge 跨域邻居（类型过滤与游标分页）；只返回双方均可见的关系，指向不可见/跨 owner 节点的边直接省略，不泄露对端存在性 |
| R2   | `routine_get`                        | Routine / routines:read            | 单个定义与 trigger revision                                                                                                             |
| R2   | `routine_list`                       | Routine / routines:read            | 名称/描述过滤、确定排序、有界分页                                                                                                       |
| R2   | `routine_upcoming`                   | Routine / routines:read            | epoch 毫秒窗口最长 31 天，单页最多 100 条                                                                                               |
| R2   | `label_list`                         | Label / labels:read                | 标签列表与搜索，支持分页与确定排序；有界强类型契约                                                                                      |
| R2   | `label_resolve_names`                | Label / labels:read                | 按名称批量解析标签，返回已知标签列表；不越界查询                                                                                        |
| R3   | `schedule_get`                       | Schedule / schedules:read          | 单个日历条目；不含内部审计或租户关联                                                                                                    |
| R3   | `schedule_list`                      | Schedule / schedules:read          | epoch 毫秒范围最长 90 天，单页最多 100 条                                                                                               |
| W1   | `goal_create`                        | Goal / goals:write                 | initial KRs 与 Goal 原子创建；不自动 activate                                                                                           |
| W1   | `goal_update`                        | Goal / goals:write                 | expectedVersion；首版排除整组 keyResults replacement                                                                                    |
| W1   | `goal_key_result_create/update`      | Goal / goals:write                 | 单 KR 命令使用 Goal expectedVersion；不替换整个集合                                                                                     |
| W1   | `task_plan_create`                   | Task / tasks:write                 | schedule/reminderPolicy 由 owner 校验；新 binding 另需 goals:write；暂不支持 labelIds（传入非空返回 VALIDATION_ERROR）                  |
| W1   | `task_plan_update`                   | Task / tasks:write                 | 显式 patch 与 expectedVersion；binding 同上；暂不支持 labelIds（传入非空返回 VALIDATION_ERROR）                                         |
| W1   | `task_occurrence_complete`           | Task / tasks:write                 | 精确 occurrence、并发条件、明确 measurement decision                                                                                    |
| W1   | `routine_create`                     | Routine / routines:write           | WallClock 单次或合法 recurrence；另需 `EAG_ROUTINE_WRITE_ENABLED=1`                                                                     |
| W1   | `routine_update`                     | Routine / routines:write           | expectedVersion；trigger 仅接受托管 WallClock                                                                                           |
| W1   | `routine_delete`                     | Routine / routines:write           | expectedVersion；不可恢复的永久删除                                                                                                     |
| W1   | `routine_pause`                      | Routine / routines:write           | 暂停至指定时刻，最长 30 天                                                                                                              |
| W1   | `routine_override`                   | Routine / routines:write           | snooze/suppress/interval，expiresAt 必填且最长 30 天                                                                                    |
| W1   | `notification_mark_read/mark_unread` | Notification / notifications:write | 切换已读/未读（幂等）；execute-action 动作执行不开放（留三期评估）                                                                      |
| W1   | `notification_archive/restore`       | Notification / notifications:write | 可恢复的归档生命周期（幂等）                                                                                                            |
| W1   | `notification_preferences_update`    | Notification / notifications:write | 有界偏好补丁（≤50 workflow overrides、≤14 静默窗口）                                                                                    |
| A1   | `assisted_workflow_start`            | Task / tasks:write                 | 启动或恢复一个受审核的 Task planning run                                                                                                |
| A1   | `assisted_workflow_get`              | Task / tasks:write                 | 读取自有 run 的当前 revision                                                                                                            |
| A1   | `assisted_workflow_review`           | Task / tasks:write                 | 读取待决定的 typed ask 或 Task draft                                                                                                    |
| A1   | `assisted_workflow_resume`           | Task / tasks:write                 | 回答澄清、批准精确 draft 或恢复 apply                                                                                                   |
| A1   | `assisted_workflow_cancel`           | Task / tasks:write                 | 取消剩余工作并保留已提交的 Task facts                                                                                                   |

R1 为 **10 个工具**（Goal 2 个 + Task 4 个 + Notification 4 个），R2 为 **6 个只读工具**（Routine 3 个、Label 2 个、Relation 1 个），R3 为 **2 个 Schedule 只读工具**，另有 **5 个 `ai:read` 工具**（会话 3 个、Agent 2 个），只读合计 **23 个**；W1 为 **17 个写工具**（含 Notification 的已读、未读、归档、恢复与偏好补丁），A1 为 **5 个 assisted 工具**，全量合计 **45 个**。R3 由宿主绑定 Schedule owner 端口后发布（本地桥接绑定；托管 API 尚未绑定该端口，因此托管连接不可见），只读且不提供日历写入。OAuth 复用同一组 12 个 scope：读工具按请求 scope 发布；写与 assisted 在 `EAG_OAUTH_WRITE_ENABLED=1` 时按 write scope 发布，关闭时只有读工具。MCP 自带发现功能足够，不新增 `capabilities_list` 平台 API。

### 跨 owner 权限

read scope 与 write scope 不互相隐含。MCP write 结果只返回该写操作自身的最小 receipt（ID、版本、影响的实体 ID、replayed），持久 receipt 也只保存同一投影；Owner 完整 read model 不进入外部写入回执，后续完整查询仍需 read scope。Goal/Task 详情只返回已有关系引用，不因一个 scope 允许任意扩展其他 owner 内容。

Task 的已配置 Goal contribution 是完成动作的一部分，`tasks:write` consent 必须说明它会按既有配置影响目标进度；它不授权直接更新任意 Goal/KR。创建或更改 binding 要求 `tasks:write + goals:write` 及双方归属，不能靠对已有 Task 的写权限引入新 Goal 影响。读取 Goal 名称/测量上下文仍需 `goals:read`；没有时只允许 complete-only，不能偷偷取 protected context。

Notification 域在 #990 接入：开放 `notification_list` 与 `notification_unread_count` 读工具及 `notification_mark_read` 写工具；#995 追加单条读取 `notification_get`（同一 `notifications:read` scope）；#1076 第二步补齐 `notification_mark_unread`、`notification_archive`、`notification_restore`、`notification_preferences_get` 与 `notification_preferences_update`，五个写工具共用 `notifications:write` 与同一个最小状态 receipt。**execute-action 动作执行明确不开放**（动作执行牵涉各业务域副作用，留三期评估），在工具清单与文档中均明确标注。Planner/Knowledge 的扩展按真实需求单列在 [#539](https://github.com/BakerSean168/memoflow/issues/539)；Routine 读写已随 [#972](https://github.com/BakerSean168/memoflow/issues/972) 二期注册，写工具由 `EAG_ROUTINE_WRITE_ENABLED` 单独开关，其余工具尚未注册。

### 标签写操作显式拒绝契约（#993）

云端 MCP 二期仅开放 `labels:read` 读工具（`label_list`、`label_resolve_names`）。写侧维持对标签创建与分配的一刀切拒绝，但将其固化为显式契约：

- **拒绝入口**：`task_plan_create`（传入非空 `plan.labelIds`）、`task_plan_update`（传入非空 `changes.labelIds`），以及 `assisted_workflow_*` 生成含标签变更草案并审批提交时。
- **错误码**：返回确定性错误码 `VALIDATION_ERROR`（对外错误文本即该 code；标签写不另造业务错误体系）。
- **暂不开放原因**：标签体系涉及跨实体双向引用和组织治理策略，目前 External Agent 尚未建立标签生命周期与写安全模型，为避免脏数据和多端同步不一致，暂不开放外部 Agent 写入标签。
- **回归保证**：写端口与 assisted workflow 集成测试包含显式回归用例，确保写拒绝路径不退化。

### Agent 自主规划与共享 Skill

Goal 规划的默认链路是「当前 Agent 理解意图 → 规划 Goal、可衡量 KR 和关联 Task → 必要时询问用户 → 确定性业务工具写入 → 按回执报告结果」。用户明确只要一个简单 Goal 或单项修改时，保留原子工具的自由组合。这里不启动第二个模型，不创建内部 Conversation/Run，也没有必须恢复的规划工作流状态。

共享内容位于 `packages/agent-gateway/src/workflow-guides.ts`。内置 Mastra planner 只引用业务准则，保留既有 structured decision、review 与 durable runtime；native BYOA 引用同一准则并遵循宿主原生表单策略。外部 Agent 通过两种入口读取完整指南：

- 标准 `io.modelcontextprotocol/skills` 扩展：`skills/list`、`skills/get`、`resources/read`；文件 URI 为 `skill://goal-planning/SKILL.md`。
- 普通 MCP 工具 `workflow_guide_get`：返回同一份完整 Markdown，兼容只支持 tools 的宿主。

扩展直接使用官方 TypeScript SDK 的 `SkillsExtension` 与 `memorySkillFiles`，固定 server 版本 2.4.0；不自建 manifest、摘要、YAML 解析或资源协议。一个只读 catalog 附到每次请求的 server。读取指南仍经过当前 MCP 连接认证，但静态资料不访问 owner 数据，不额外要求某个业务 read scope。

**提供 Skill 不等于宿主自动激活 Skill。** 宿主是否加载、注入和遵循指南由客户端决定；server instructions、工具描述与普通指南工具共同提供发现路径。没有原生 Ask User 的客户端可在当前文字对话中询问。

| 工具                 | 必要 scope / 宿主                                         | 行为                                                                            |
| -------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `workflow_guide_get` | 已认证连接；Local / Hosted                                | 返回业务指南，无模型调用和写入                                                  |
| `goal_plan_validate` | 已认证连接；Local / Hosted                                | 校验计划结构、引用和字段；缺 KR/Task 只产生完整度提醒                           |
| `goal_plan_apply`    | `goals:write`，含 Task 另需 `tasks:write`；Local / Hosted | 组合既有 owner 操作，逐项权限检查，返回实际回执和引用映射                       |
| `goal_panel_present` | `goals:write`；有活动原生窗口的 Local Host                | 单次请求填入 Goal/KR 草稿，或打开已保存 Goal，然后交还用户；不保存、不创建 Task |

Hosted 的 read/write scopes 独立。当前 Local MCP 沿用本地凭证模型：连接认证提供 read transport 能力，只有写授权单列 `writeScopes`；读取与表单展示仍分别经过既有业务 permission checkpoint（如 `goal.read`），不新增第二套权限体系。

`goal_plan_apply` 的 `plan` 使用 owner schema 组合，`tools/list` 为完整输入契约：

- `target.mode=create` 携带 Goal fields；初始 KRs 随 Goal 在同一 owner 事务内创建。即便合并为一个写入，也检查 KR-specific permission rule。
- `target.mode=existing` 携带 `goalId`、`expectedVersion`，只补充 KR/Task；不会创建替代 Goal 或覆盖已有字段。新增 KR 沿真实回执传递版本。
- `keyResults` 为新 KR 分配稳定 `kr:<slug>` 引用；`existingKeyResults` 只为已有 Goal 映射已验证的 KR ID。
- `tasks` 为每项分配稳定 `task:<slug>`，可通过 `keyResultRef` 绑定 KR；实际 ID 来自 owner 回执。Task schedule 必须来自用户信息或可信上下文，不能为满足 schema 随意编造。当前缺少日期的 Task 需先询问，或明确保留为未保存建议。
- 现有 Goal、KR、Task 原子工具继续可用。组合工具不能绕过 native Agent 的表单策略。

计划是多个 owner 本地事务的顺序组合，**不是跨域原子事务**。结果明确区分 `success`、`partial`、`failed`，只报告实际成功的 receipts、referenceMap、版本与失败项。任何步骤的权限拒绝、冲突或取消都会停止后续步骤；成功步骤不会自动删除。

重试必须保留同一 `idempotencyKey`、原计划、稳定 refs 与原始 expectedVersion。排序变化不改变子操作 key，owner 会重放持久回执；已提交项的内容变化会冲突。幂等性按 item 及既有 owner/credential 边界成立，没有全计划 manifest 锁；不要在中断操作下追加新 refs，也不要自动刷新版本覆盖人类修改。冲突后读取当前状态，只为剩余工作制定新操作。跨本地凭证轮换前先核实已有对象。

### Local Host 原生表单交接

Electron 的活动 Profile 持有本地业务服务与 MCP，应用启动/解锁后即可工作；此链路不依赖远端 API 或独立常驻 daemon。Hosted Web/API 继续作为云端入口与同步服务，复用业务工具但不提供本地窗口能力。

外部 `goal_panel_present` 是一次请求内的有界交接：

1. 按连接权限打开干净且可用的表单。
2. create 模式逐步填入 Goal 字段与 KRs，每一步使用前一 snapshot 的 revision；edit 模式只打开指定的已保存 Goal。
3. 等待释放编辑权的回包，再报告 `handedOff: true`、`savedByTool: false`。失败、取消或凭证吊销也执行清理，保留草稿。
4. 人在既有表单里继续微调和保存。若需要先保存完整 Goal/KR/Task 计划，再调用 `goal_plan_apply` 并用返回的 Goal ID 打开面板。

IPC caller 显式区分 native conversation/run 与 external client。外部只用真实 client ID 和主进程签发的请求 binding；不同 HTTP 请求互相隔离，binding 关联 Profile/window generation。临时编辑者沿用 `local-agent:` 恢复命名空间，renderer 重启后可恢复草稿给用户，无须 Mastra run。

外部不发布 `goal_panel_submit`，主进程和 IPC schema 也拒绝 external submit。dirty/busy、旧 revision、失去控制或窗口切换时不重新抢占表单。原生长流程的 review、持久租约与提交策略保留；这里没有扩展为外部长期编辑会话。

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

Desktop 离线写入经 PowerSync 上行时使用同一冲突口径：`goals`/`task_plans` 以 `version` 乐观锁拒绝过期上传，同步接口返回 409 `row_version_conflict`，客户端留证后不重试该笔；规则见 [ADR-125](./decisions/ADR-125-powersync-uplink-row-version-guard.md)。

## 6. 写入与审批

原子性和重试契约以 ADR-118 为准。`packages/database/src/adapters/prisma/external-mutation.ts` 提供两个真实 Owner 共用的 PostgreSQL 事务 receipt runner。身份 + capability version + key 的 SHA-256 标识使用数据库 advisory transaction lock 串行化；凭据轮换后同一 owner 的重试仍重放已提交结果，`connection_id` 只作首次执行审计。schema 归一化后按排序字段计算摘要。同 key 异 body 返回 `IDEMPOTENCY_CONFLICT`，同 body 返回原始结果及 `replayed: true`。回执只保存响应实际返回的最小投影，不保存 Owner 完整 read model；回执不自动过期；原结果不会用当前对象替换。账户删除通过 Account 外键级联清理回执。

Goal/Task 各自在自己的 infrastructure factory 中创建 transaction-bound repositories，并调用原有 application commands。Owner facts、receipt、Task→Goal 现有 outbox 一起提交。业务失败或 receipt 写入失败回滚；MCP 超时/断连只停止等待，不能撤销已提交事实，客户端必须用同一 key 重试。事务 15 秒、SQL 10 秒、锁等待 5 秒有界；Task owner 事务加入已有的 receipt 事务而不新开嵌套事务，因此继承同一预算。并发 Task/Goal 的最终 CAS 仍由 Owner repository 执行。Gateway 既不取得 repositories，也不直接写 GoalRecord。

每次请求及执行/重放前重新校验当前凭据；写路径在 receipt 事务开始前完成校验，避免事务内等待第二条连接。写入接受 PAT 或（`EAG_OAUTH_WRITE_ENABLED=1` 时的）OAuth 连接；OAuth 在 receipt 事务内对 connection 与 consent 行取 `FOR SHARE` 复核。Task binding 更改另需 `goals:write` 且在 Owner 事务中查双方归属；记录 Prompt measurement 另需 `goals:read`。`complete_only` 不用 suggestedValue 伪造测量；Fixed 贡献沿用 Task 既有语义。成功 receipt 是持久审计事实，传输审计另含 tool/effect/receiptId/replayed、`credentialType`/`clientId`/`consentScopesHash`，不记录正文或 token。

首批 `goal_update` 排除会整组替换/删除 KRs 的字段；保留 name/summary/description/timeframe/reminderConfig 等经过 owner 允许的 patch。增加危险操作时重新评估 tool effect 和 server approval，不能因为名叫 update 就自动标记无破坏性。

所有普通写工具要求 idempotencyKey。每次工具调用（读、写、assisted）都经过 `packages/ai` 的 AI 权限 checkpoint，Gateway 不直连 owner port。checkpoint 的默认 preset 是 `confirm_each`；对 MCP 写调用，`命中该 operation 的写 scope + operation 已在 operation-catalog 登记` 视为签发/consent 时的用户预授权，checkpoint 放行并写审计（PAT 与 OAuth 同规则，OAuth 的 credential type 与开关已由 Gateway 先校验）。scope 外、未登记 operation 仍拒；显式 deny 规则和 `read_only` preset 仍然优先。放行与拒绝都记录 `credentialId`（权限审计中的 `agentId` 为 `external-mcp:<credentialId>`，传输审计另带 `credentialId`）。需要再次确认的高风险命令先不发布，直到有真实 approval intent 流程；不把它当作所有 CRUD 的平台前置。

## 7. OAuth/PAT 连接与运行策略

OAuth 协议步骤和撤销边界见 ADR-117。canonical resource URI 由部署配置指定，例如 `https://api.example.com/mcp`；这是占位符，不是已部署地址。metadata URI 按 RFC 与实际 root route 映射，API `/api/v1` prefix 不自动应用到 MCP discovery。**OAuth 写由 `EAG_OAUTH_WRITE_ENABLED` 控制**：允许集是 12 个共享 scope 加 `offline_access`，开关关闭时写 scope 不可授予、调用侧也不发布；机制与审计见 [OAuth 写 consent 设计评估](./external-agent-oauth-write-consent.md)。

新授权数据不得进入 PowerSync、数据导出、浏览器日志或 AI conversation；用户可见连接名称、scope、最近使用、有效期和撤销按钮。scope 扩大必须重新 consent；已存在只读 connection 不因发布新工具自动获得写能力。

Gateway 由 `EAG_READ_PILOT_ENABLED` 总开关控制，默认 `0`；关闭时 `/mcp` 与 `/agent-connections/*`（PAT/OAuth 管理）都不挂载，而不是返回空工具列表。其余子开关默认：`EAG_TASK_READ_ENABLED=1`、`EAG_WRITE_ENABLED=0`、`EAG_ROUTINE_WRITE_ENABLED=0`、`EAG_ASSISTED_ENABLED=0`、`EAG_OAUTH_ENABLED=0`。`apps/api/src/server.ts` 的 compose 已把 `enabled`、`writes`（含 `routineWriteEnabled`）和 `assisted` 传入 Gateway；写关闭时不再发现或执行写工具，assisted 关闭时 5 个 assisted 工具不发布。`EAG_ASSISTED_ENABLED=1` 依赖 durable AI workflow runtime，启动时缺失会直接失败。shutdown 沿用现有 API host 生命周期；本轮未执行完整容器 shutdown/drain 验收，不宣称已验证该运行边界。

rate limit 分三层，都是固定 60 秒窗口且多实例共享计数：请求源 IP（Redis，键 `eag:read-pilot:ip:<sha256(ip)>`，认证前计数，认证请求也计）、认证后的 owner（Redis，键 `eag:read-pilot:owner:<sha256(identityId)>`）、以及凭据（PAT 的 `external_agent_pats` / OAuth 的 `external_agent_connections` 行内 `rate_count`/`rate_window`，PostgreSQL CAS）。默认预算 IP 1200/min、owner 480/min、凭据 240/min；分别由 `EAG_RATE_LIMIT_IP_PER_MIN`、`EAG_RATE_LIMIT_OWNER_PER_MIN`、`EAG_RATE_LIMIT_CREDENTIAL_PER_MIN` 覆盖，默认值只维护在 `packages/agent-gateway/src/rate-limits.ts`。超限统一返回 `429 {"error":"RATE_LIMITED"}` 与 `Retry-After: 60`，不发送 `RateLimit-*` 头。IP 桶在认证前检查，是体量防护而不是按用户预算：共享出口（企业 NAT、托管客户端出口）共用同一桶，公平性由 owner/凭据维度承担；owner 与凭据检查在认证后、解析请求体和 owner 查询之前，顺序为 owner 后凭据：凭据被拒的请求已经计入 owner，三层互不对称，任一层拒绝都不回滚上层计数。预算按 MCP 客户端工具调用密度校准（一个 assistant turn 可并发多个 `tools/call`，一个 owner 可开多个客户端）：凭据要容纳单个激进 agent loop，owner 要容纳同一身份的多客户端，IP 只挡体量滥用。估算口径：Codex 类会话启动握手约 4 次请求，普通 turn 1–5 次 `tools/call`，持续跑工具的循环约 30–60 次/分钟。据此凭据 240/min（4 次/秒）对 60/min 的激进循环留 4 倍余量、对 30/min 的常规会话留 8 倍，并能吸收 5 个并发工具调用的瞬时突发；owner 480/min 等于两个跑满的凭据，覆盖同身份 4–8 个并发会话（按 30–60 次/分钟计）；IP 1200/min（20 次/秒）按常规用户 30 次/分钟可支撑约 40 个共享出口使用者，只在该出口聚合时生效。这是推算而非生产遥测：试点期没有线上峰值数据，取值按保守上界取整，并保留环境覆盖以便拿到真实分布后收紧。校准脚本是 `apps/api/src/modules/agent-gateway/rate-limit.calibration.integration.test.ts`，对本地路由按固定速率打 `/mcp` 并逐维报告首次拒绝位置与拒绝形态（并发下发使发送序不等于准入序，脚本只断言准入数与拒绝形态，不复用上次运行的 IP 桶）；设置 `EAG_RATE_LIMIT_CALIBRATION=1` 才运行，禁止指向已部署环境。请求体上限 256 KiB、普通工具截止时间 30 秒、页大小硬上限仍作为初值。

EAG-02 的具体 owner read budget：Goal 行最多 101（含 lookahead），每 Goal 先检查 KR count，最多 100；正文 description/review/snapshot 不进入读取。name/summary/KR title/unit 的字节长度先由 PostgreSQL 检查，超出 owner 投影上限的单聚合返回明确 `RESPONSE_TOO_LARGE`，不伪造部分 KR 的 overallProgress。搜索页超出传输预算时缩小返回页并标记 `truncated=response-budget`，游标仍从最后实际返回项继续。整个 HTTP 调用有共同截止时间；取消信号单独传给查询，不扩展或混用 ExecutionContext。Goal 查询使用 transaction-local PostgreSQL statement_timeout 和 transaction timeout，认证/账户 authority 的独立只读查询最多 5 秒；响应停止等待之后数据库工作仍有明确上界。Redis admission 同样必须有命令超时，429 含 Retry-After。

audit 最小字段：request/trace ID、connection/credential ID、owner identity、tool/version、effect、scope decision、duration、outcome code、operation receipt ID、replayed。默认不记录 token、参数全文、知识正文或模型对话。unauthenticated/denied/read 调用也要可追踪；写成功 receipt 是 durable audit fact。

自 #1031 起同一事件双写：`ExternalAgentAudit` 结构化日志保持同步写出（既有日志采集不变），随后由有界批量写入器落入 `external_agent_audit_events`。热路径只做内存入队（默认 250ms 去抖、50 条一批、2000 条上限），批量 INSERT 使用 5s statement timeout；写失败丢弃该批并计数，不重试、不阻塞响应——日志副本仍是该事件的兜底。进程优雅关闭时先 flush 再断开连接。

查询入口为 `GET /api/v1/agent-connections/audit-events`（`/api` 别名同样可用），与 PAT 管理 API 共用 session、邮箱验证和 `no-store` 口径。支持 `credentialId`、`requestId`、`from`/`to`（ISO 8601，闭区间）与 `limit`（1–200，默认 50）；identity 只取自 session，任何过滤条件都不扩大 owner 范围，查他人 credential/request 返回空页。审计只读入口不产生 credential 审计事件。未认证的 edge 早期拒绝（identity 为空）只保留日志副本，不进入按 owner 的查询；管理 UI 尚未交付，可在后续单沿用该 API。edge 早期拒绝观察器现在同时匹配 `/api` 与 `/api/v1` 两条管理别名；此前只匹配 `/api/v1`，`/api/agent-connections/*` 在 CORS、解析或中断等早期失败时不产生任何审计。

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

| 变量                                | 开启值                   | 说明                                                                                     |
| ----------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| `EAG_READ_PILOT_ENABLED`            | `1`                      | 总开关；为 `0` 时 `/mcp` 与 PAT/OAuth 管理路由都不挂载                                   |
| `EAG_AUDIENCE`                      | `https://<api-host>/mcp` | 必须是 HTTPS 的规范 origin + `/mcp`；其 host 必须与请求 `Host` 一致，否则 403            |
| `EAG_CURSOR_SECRET`                 | 随机 ≥32 字节            | 分页游标密钥；跨重启保持稳定                                                             |
| `EAG_TASK_READ_ENABLED`             | `1`                      | Task 只读工具；默认已为 `1`                                                              |
| `EAG_WRITE_ENABLED`                 | `1`                      | 发布 8 个 PAT 写工具（Routine 写另由下一项控制）                                         |
| `EAG_ROUTINE_WRITE_ENABLED`         | `1`                      | 在 writes 打开的前提下发布 Routine 写工具（create/update/delete/pause/override）         |
| `EAG_ASSISTED_ENABLED`              | `1`                      | 发布 5 个 assisted 工具；要求 durable AI workflow runtime，否则启动失败                  |
| `EAG_OAUTH_ENABLED`                 | 可选 `1`                 | 需要总开关、`AUTH_BASE_URL`（HTTPS `/api/auth`）与 `MEMOFLOW_WEB_URL`                    |
| `EAG_OAUTH_WRITE_ENABLED`           | 可选 `1`                 | 授予并执行 OAuth 写 scope；依赖 `EAG_OAUTH_ENABLED=1` 与 `EAG_WRITE_ENABLED=1`，默认 `0` |
| `EAG_RATE_LIMIT_IP_PER_MIN`         | `1200`                   | 请求源 IP 的每分钟预算；认证前后都计，共享出口共用一个桶，只作体量防护                   |
| `EAG_RATE_LIMIT_OWNER_PER_MIN`      | `480`                    | 同一身份每分钟预算，覆盖该身份的全部凭据与客户端                                         |
| `EAG_RATE_LIMIT_CREDENTIAL_PER_MIN` | `240`                    | 单个 PAT/OAuth connection 的每分钟预算                                                   |

一致性检查：

- `AUTH_BASE_URL` 是 OAuth issuer，必须指向 `https://<auth-host>/api/auth`。
- `MEMOFLOW_WEB_URL` 与 `CORS_ORIGIN` 共同构成 PAT/OAuth 管理端点的 trusted origins；签发/撤销的浏览器请求必须带其中一个 `Origin`，否则 403。
- `EAG_AUDIENCE` 的 host 必须与公网入口实际转发到 API 的 `Host` 一致；API 不发布宿主端口，`API_TRUST_PROXY_HOPS=1` 只信任一个内部代理 hop。

开启顺序（每步验证后再下一步）：

1. 总开关 + audience + cursor secret：`EAG_READ_PILOT_ENABLED=1`。验证 `/<api-host>/mcp` 可认证、PAT 创建/列表/撤销可用、14 个只读工具可用（含 `labels:read` 授权下的 `label_list`、`label_resolve_names`，以及 `relations:read` 授权下的 `relation_neighbors`）。
2. 写：`EAG_WRITE_ENABLED=1`。用带 `goals:write`/`tasks:write` 的 PAT 验证 `goal_create`、`task_plan_create` 与重放。注意：写侧暂不开放标签写入，`task_plan_create` / `task_plan_update` 传入非空 `labelIds` 时应返回显式 `VALIDATION_ERROR`。
3. Routine：`EAG_ROUTINE_WRITE_ENABLED=1`。用 `routines:read`/`routines:write` 验证 `routine_list`、`routine_upcoming` 与 `routine_create/update/delete/pause/override`。
4. Assisted：`EAG_ASSISTED_ENABLED=1`。验证 `assisted_workflow_start → review → resume(approve)`。
5. OAuth（可选）：最后再开 `EAG_OAUTH_ENABLED=1`；需要 OAuth 写时再置 `EAG_OAUTH_WRITE_ENABLED=1`（必须同时满足 `EAG_WRITE_ENABLED=1`）。用带写 scope 的授权验证一次 create/update，再置回 `0` 验证读仍可用、写被拒。

回滚：把对应开关置回 `0` 并重启 API。`EAG_OAUTH_WRITE_ENABLED=0` 即时隐藏 OAuth 写/assisted 工具并在写事务拒绝，读不受影响；子开关回滚只隐藏对应工具；总开关回滚会同时卸下 `/mcp` 与管理路由，需重新打开才能恢复。已持久化的 receipt 和 assisted workflow 行保留，无需数据迁移回滚。

## 11. OAuth 投产

OAuth 只有在 §10 第 5 步之后才有意义；本节说明客户端从何而来、如何停用、如何回滚。OAuth 写由 `EAG_OAUTH_WRITE_ENABLED` 单独控制（[#1054](https://github.com/BakerSean168/memoflow/issues/1054)）；`--scopes` 的合法集合是 12 个共享 scope + `offline_access`，缺省种子仍只写三个只读 scope。

### 前置

1. 数据库已通过 migrator 建好 OAuth provider 与 `ExternalAgentConnection` 表；`apps/api` 启动时会 insert-only 播种 `oauthResource`（identifier = `EAG_AUDIENCE`）。
2. `EAG_READ_PILOT_ENABLED=1`、`EAG_OAUTH_ENABLED=1`、`EAG_AUDIENCE=https://<api-host>/mcp`、`AUTH_BASE_URL=https://<auth-host>/api/auth`、`MEMOFLOW_WEB_URL`、`CORS_ORIGIN` 已配置。
3. 待接入的客户端列入 `EAG_OAUTH_CLIENT_IDS`（逗号分隔、精确 HTTPS URL）。该列表同时是 CIMD 拉取策略与产品授权 allowlist；不在列表内的 client_id 在 authorize 和 consent 阶段都会被拒绝。
4. DCR 保持关闭（`allowDynamicClientRegistration: false`）：没有 `registration_endpoint`，客户端不能自助写入 `oauthClient`。

ChatGPT Web 默认 CIMD 为 `https://chatgpt.com/oauth/client.json`，与 Codex CLI 的 `https://chatgpt.com/oauth/codex/client.json` 不同。两者使用精确 allowlist；若实际插件使用 callback-specific CIMD，需要依据真实客户端元数据单独登记（见 [OAuth 客户端连接指南](../operations/external-agent-oauth.md#chatgpt-web-插件连接1060)）。

### 客户端落地路径

**A. CIMD（默认路径，无需预置）。** client_id 本身就是 HTTPS metadata 文档 URL。首次 `/oauth2/authorize` 时 provider 拉取文档、按 MCP 2026-07-28 profile 校验 `client_name`/`redirect_uris`/公钥方法，然后即时插入 `oauthClient`（`clientDiscoveryId=cimd`），随后才进入登录与 consent。之后同一 client_id 复用它自己的行；运维无需执行任何写库命令。

已实测（`apps/api/src/__tests__/integration/external-agent-oauth-provisioning.integration.test.ts`，`EAG_CIMD_E2E=1`）：本地启动与 API 相同的 Express + Better Auth + `/mcp` 组合，client_id 使用 `https://claude.ai/oauth/claude-code-client-metadata`（真实托管文档）。首轮 authorize 前 `oauthClient` 计数为 0，authorize 后出现 `clientDiscoveryId=cimd`、`name=Claude Code` 的行；随后授权码 + PKCE 换到 token，`goal_search` 返回本人 Goal。结论：**CIMD 能 JIT 建行，投产主路径成立**。

CIMD 的边界：

- 文档必须 HTTPS、可公网路由、无重定向、JSON、≤ 大小上限；校验失败按 `invalid_client` 拒绝，不建行。
- `disabled`、`skipConsent` 等运维列在文档刷新时保留，但 `name`/`redirect_uris`/`scopes` 以文档为准；不要把 CIMD 行当作手工可编辑的配置。
- 客户端域名被收回或文档改坏时，该客户端立即无法刷新；停用请用下方 `disable`，不要靠改文档。

**B. 预置种子（CIMD 不可用时）。** 适用于内网/受限网络或客户端无法发布 metadata 文档的场景。种子行写入 `clientDiscoveryId=null`，因此不会被 CIMD 刷新覆盖。

```bash
pnpm nx run api:oauth-client -- seed \
  --client-id https://agents.example.com/oauth/client.json \
  --name "Ops Agent" \
  --redirect-uri http://127.0.0.1:43210/callback \
  --resource https://api.example.com/mcp
```

- 命令需要 `DATABASE_URL`；`--resource` 缺省取 `EAG_AUDIENCE`；`--scopes` 缺省为三个只读 scope，也可传入 12 个共享 scope 中的任意组合（含写 scope，运行时仍受 `EAG_OAUTH_WRITE_ENABLED` 约束）。
- 幂等：插入前按 `clientId` 查行，已存在则只补齐 `oauthClientResource` 链接并返回 `exists`；重复执行不新增行，也不会把已停用的客户端重新启用。
- client_id 仍须符合 `EAG_OAUTH_CLIENT_IDS` 的 HTTPS 形式并被列入其中；种子不会绕过 allowlist。
- 每次 seed/disable/enable 在 stdout 打印一行 JSON 审计（`actor`、`at`、`action`、`clientId`、`result`、`resource`、`redirectUris`、`scopes`）。把该行接入运维日志采集；持久化查询入口属 [#973](https://github.com/BakerSean168/memoflow/issues/973) 的审计项，不在本路径内。

### 管理入口

```bash
pnpm nx run api:oauth-client -- list
pnpm nx run api:oauth-client -- disable --client-id https://agents.example.com/oauth/client.json
pnpm nx run api:oauth-client -- enable  --client-id https://agents.example.com/oauth/client.json
```

`list` 输出 `{ clients: [...] }`，含 `clientId`、`name`、`disabled`、`createdAt`、`redirectUris`、`scopes` 和 `discovery`（`cimd` / `managed`）。`--actor` 缺省取 `EAG_OAUTH_ADMIN_ACTOR`，再退化到 `user@host`。

`disable` 的效果是即时的：每次 MCP 认证、token 交换和 refresh 都会重新检查 `oauthClient.disabled`，因此既有 access token 在下次调用即 401，refresh 返回 `invalid_grant`，新的 authorize/consent 被拒绝。不需要删除 token 行；这也意味着 `enable` 会让仍在有效期内的旧 token 恢复可用，重新启用前应确认这是预期行为。Web 端不提供这套 UI，运维只走命令行。

### 回滚

1. 停止新授权：`pnpm nx run api:oauth-client -- disable --client-id <url>`，或把 `EAG_OAUTH_ENABLED` 置 `0` 并重启 API（OAuth 路由与 discovery 一起消失，PAT 不受影响）。
2. 用户侧撤销走「设置 → 账户与隐私 → 已连接的应用」；服务端 disable 只停用客户端，不会替用户删除 consent 记录。需要彻底清理时由用户撤销，再删除对应 `oauthClient` 行（`oauthClientResource`、token 通过外键级联）。
3. 重新开启按 §10 第 5 步；已存在的 `oauthClient` 行保留，不需要重新种子。

### 与 PAT 的分工

| 路径  | 适用                        | 凭据形态                             | 能力边界                                                 |
| ----- | --------------------------- | ------------------------------------ | -------------------------------------------------------- |
| PAT   | 自动化、脚本、需要写工具    | `mfp_` 前缀长期凭据，用户自建/撤销   | 按 scope 发布读或写工具                                  |
| OAuth | Codex/Claude 等交互式客户端 | 10 分钟 access token + refresh token | 12 个共享 scope；写在 `EAG_OAUTH_WRITE_ENABLED=1` 时开放 |

两条路径共用同一 owner 权限、审计与 rate limit；OAuth 写能力取决于自己的开关与 consent，不继承 PAT 的授权。第一方 Web/Desktop session token 不能当 MCP Bearer。

## 生产边界

生产 API 不发布宿主端口，只信任一个内部代理 hop（`API_TRUST_PROXY_HOPS=1`）。Caddy 仅信任 Cloudflare 公布网段的 `CF-Connecting-IP`，将解析后的地址覆盖为单一 `X-Forwarded-For`；直连 origin 的伪造 forwarding header 无效。其他宿主默认不信任代理。

Caddy access log 删除 URI、Referer 与 Location，Nginx access log 只记录不含查询的路径。授权 query、code、token 不作为日志字段。Cloudflare 网段变更时须更新 Caddy 配置并验证；不以信任任意代理替代。
