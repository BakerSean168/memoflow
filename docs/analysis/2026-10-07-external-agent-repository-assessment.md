---
tags: [analysis, architecture, mcp]
description: External Agent 接入前的 MemoFlow 仓库事实、差距与原讨论纠偏
created: 2026-10-07T00:00:00Z
updated: 2026-10-07T00:00:00Z
---

# External Agent Gateway：仓库现状核验

核验日期：2026-10-07。源码基线：`291c19e7e902cc8d2cb60a5b26a0ecea77ef838a`。开始时工作区干净。
这是本地 checkout 的静态代码/配置检查，**不是 GCP 已部署制品或生产行为验收**。使用 CodeGraph 查询入口、源码交叉检查和 nx-mcp 核对 workspace targets。本轮写作期间 HEAD 前进到 `3664f8da6a95174d24ae8f443f2d12b3ce223e33`（仅归档已有 Durable Workflow 文档）；相关链接已按最新路径复核。

## 判断

“owner application 为底座，MCP 作为外部 Agent adapter”的方向正确。MemoFlow 的可复用资产很多，但“内部成熟”“外部 ready 70%”无法代替可执行的验收。当前应描述为：**业务能力已具备，外部协议、委托身份、写入重试契约和客户端联调尚待补齐。**

## 已验证资产

| 资产                        | 代码证据                                                                                                                                                                                                                       | 可复用内容 / 限制                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| 15 个内部 product tools     | [product-tools.ts](../../packages/ai/src/server/mastra/tools/product-tools.ts)                                                                                                                                                 | Knowledge、workspace、Planner、Notification、Routine；不包含完整 Goal/Task CRUD tool 集                         |
| 工具分类与 approval         | [product-tool-policy.ts](../../packages/ai/src/server/mastra/tools/product-tool-policy.ts)                                                                                                                                     | read allow、edit ask、execute 按工具分类；unknown deny、yolo false；属于内部 Assistant policy                   |
| Goal application            | [goal.application.port.ts](../../packages/goal/src/server/application/goal.application.port.ts)                                                                                                                                | create/get/list/search/update/lifecycle/KR/review；返回 owner Result/receipt                                    |
| Task application            | [task.application.port.ts](../../packages/task/src/server/application/task.application.port.ts)                                                                                                                                | Plan CRUD 与 Occurrence complete 等明确分开；调用签名尚未全部统一为 ExecutionContext                            |
| HTTP/OpenAPI                | [Goal routes](../../packages/goal/src/api/routes/goal.routes.ts)、[TaskPlan routes](../../packages/task/src/api/routes/task-plan.routes.ts)、[Occurrence routes](../../packages/task/src/api/routes/task-occurrence.routes.ts) | 复用已验证的请求/结果语义；不机械全量生成 tools                                                                 |
| AI → owner wiring           | [Goal mutation adapter](../../apps/api/src/modules/ai/goal-plan-mutation.adapter.ts)、[Task mutation adapter](../../apps/api/src/modules/ai/task-plan-mutation.adapter.ts)                                                     | host 组合真实 application ports，无需经 Assistant 发命令                                                        |
| Native edit session         | [ownerNativeEditSession.ts](../../packages/app-vue/src/shared/composables/ownerNativeEditSession.ts)                                                                                                                           | patch/addChild/removeChild/focus/requestSubmit/requestCancel/readDraftState；依赖 UI 宿主，不是远程 API         |
| Durable workflow            | [mastra-durable-workflow.runtime.ts](../../packages/ai/src/server/mastra/runtime/mastra-durable-workflow.runtime.ts)、[workflow runtime port](../../packages/ai/src/server/mastra/runtime/workflow-runtime.port.ts)            | 可复用 start/get/resume/cancel 等能力；本轮 runtime 提取已归档，后续 adapter 仍需按实施时 HEAD 核对 public seam |
| 第一方认证                  | [cloud-auth.ts](../../packages/cloud-auth/src/server/cloud-auth.ts)                                                                                                                                                            | Cookie/Bearer session、GitHub 登录、deviceAuthorization；没有已接好的公共 Agent grant/scope/audience 链路       |
| Active Account enforcement  | [auth-middleware.ts](../../apps/api/src/shared/infrastructure/http/middlewares/auth-middleware.ts)                                                                                                                             | resolve principal 后检查 Account.status；新 MCP 入口需复用相同规则，不能只验 JWT                                |
| canonical execution context | [execution-context.ts](../../packages/contracts/src/shared/execution-context.ts)                                                                                                                                               | identity、request/trace/source 已定；source 只有 http/ipc/system，requestId 明确不是幂等键                      |

## 原讨论需要收紧的地方

### 1. “仓库 MCP 搜索全部为 0”不成立

仓库已有开发工具的 [.mcp.json](../../.mcp.json)、`tools/mcp` 和 nx-mcp 依赖；这说明开发环境消费 MCP。
本次未找到产品侧的 `@modelcontextprotocol` 集成或向外提供 MemoFlow 业务的 `/mcp` Gateway。两者必须分开描述。

### 2. Reminder 已不是候选 CRUD owner

[Reminder API marker](../../packages/reminder/src/api/module.ts) 明确不注册 legacy routes；[Routine HTTP module](../../apps/api/src/modules/routine/module.ts) 挂载 `/routines` 与 `/routine-profiles`。
[ADR-076](../architecture/adr/ADR-076-routine-definition-trigger-and-legacy-reminder-retirement.md) 的边界是：WallClock 由 durable Scheduler 拥有，Elapsed/ActiveUsage 由 local runtime 拥有。

所以“Agent 退出后提醒仍可执行”对 cloud-owned WallClock/Task 提醒可以成为验收目标；对设备本地 runtime 不能直接承诺。OS 通知还受用户设备在线、权限与 delivery policy 影响。

### 3. Task 完成不能直接等于 task_complete

[CompleteTaskOccurrenceUseCase](../../packages/task/src/server/application/use-cases/commands/complete-task-occurrence.use-case.ts) 检查 occurrence ownership、状态与 goalMeasurement 合法性，通过 Task owner 事务保存并产生贡献事件。
[Task action coordinator](../../packages/app-vue/src/modules/task/composables/useTaskOccurrenceActionCoordinator.ts) 对 Prompt binding 打开测量选择，同时允许 complete-only。

当前 [CompleteTaskOccurrenceSchema](../../packages/contracts/src/modules/task/api/task-occurrence.dto.ts) 没有客户端 expectedVersion，也不强制 Prompt 必须提交测量。这是设计需处理的已知差距：外部工具要保留显式选择，不能把“必须有测量”谎称为现有服务端规则，也不能用读后自动补版本代替 CAS。

### 4. 已有 deterministic ID 不等于完整外部幂等

[CreateGoalUseCase](../../packages/goal/src/server/application/use-cases/commands/create-goal.use-case.ts) 对已存在的 caller-supplied ID 返回现有 aggregate；这支持 workflow replay，却没有独立证明“同 key 不同 body 拒绝”和“返回原始提交 snapshot”。
Task 已完成 occurrence 会返回当前投影；另一次带不同 measurement 的重试不会重新完成，但仍需要外部请求摘要区分意图。

已有 [TaskWriteTransactionRunner](../../packages/task/src/server/application/use-cases/commands/task-write-support.ts)、Goal write runner 和部分可靠 operation receipts 可复用。写 Gateway 的核心工作是把 receipt 与 owner effect 放进同一提交边界，不是加一个进程内去重 Map。

### 5. Capability Registry 不能先于真实试点

[AGENT.md](../../AGENT.md) 与 [ADR-113](../architecture/adr/ADR-113-retire-product-governance-runtime-keep-engineering-governance.md) 要求先真实 owner、再第二 owner、再提取重复。全局 capability 平台和所有 Mastra tools 的重写不是首个接入版本的前置条件。

### 6. 同源业务契约不要求所有 adapter 一模一样

外部 deterministic Goal create 可以调用现有 owner application；内部 Goal workflow 继续使用 native edit session。两者共享 owner validation 和业务事实，但不需要相同 approval UX、工具全集或生命周期。
`IAI*Port` 是已有 AI consumer 的接口，Gateway 可以按自身需求声明小 port，并在 host 中绑定同一 owner；不能为了“复用”强制 import AI runtime。

## 差距与下一步

| 差距                                              | 所属层                       | 对应工作项 |
| ------------------------------------------------- | ---------------------------- | ---------- |
| 版本锁定、客户端 profile、provider 组合未实测     | protocol/auth infrastructure | EAG-01     |
| scoped credential、首个真实 MCP read、隔离审计    | cloud-auth / Gateway / Goal  | EAG-02     |
| 第二 owner、分页、共享 descriptor 验证            | Task / Gateway               | EAG-03     |
| OAuth consent、refresh/revoke、账户关闭           | cloud-auth / Web             | EAG-04     |
| 两客户端端到端 read 与交付证据                    | API deployment / clients     | EAG-05     |
| request fingerprint、原子 receipt、并发版本       | Goal / Task application      | EAG-06～08 |
| Planner/Routine/Knowledge 的最小权限和宿主可用性  | 各 owner 与 host             | EAG-09     |
| workflow handle、headless review、Tasks/MRTR 投影 | AI runtime adapter           | EAG-10     |

外部协议事实见 [官方研究](./2026-10-07-external-agent-protocol-research.md)；决策和执行入口见 [架构规格](../architecture/external-agent-gateway.md) 与 [实施总方案](../plan/active/2026-10-07-external-agent-gateway.md)。

## EAG-02 实施前源码纠偏

2026-10-07 基线 `3664f8da6a9` 的 `ListGoalsUseCase` 与 `SearchGoalsUseCase` 通过 `findByIdentityId` 全量读取再过滤；list 仅填写分页 metadata，没有限制返回数据。旧 characterization 只检查 metadata，未证明有界数据库分页。新增 Gateway 查询必须先补 Goal owner 的 `(createdAt, id)` keyset read seam，不能复用这个全量路径。旧 UI 查询行为先由原测试保护，新的有界接口独立验收。

### EAG-03 当前 Task 只读源码复核（2026-10-07）

当前 HEAD 的 `ListTaskPlansUseCase` 已使用 `findPage(limit, offset)`，并只对结果页取得 30 天统计，不应再按“所有 Task list 都是全量查询”实施。读取没有 occurrence materialization 写副作用；维护 runtime 仍负责生成实例。Hosted search 仍缺少 query/keyset，以及 JSON/正文字段与数据库 deadline 的预算。

`GetTaskPlanUseCase` 在统计返回缺失时会通过 `findByPlanId` 全量读 occurrences；Hosted 最小投影应避开这个 fallback。`GetTaskOccurrencesByDateRangeUseCase` 将 Instant 按 owner 的 IANA timeZone 转为 Ymd，但 range 和可选 overdue 分支仍无数据库 row limit/keyset。EAG-03 要先补 Task owner 的有界 application queries，并明确时间窗口及 overdue 范围，不能只在 Gateway slice 返回数组。
