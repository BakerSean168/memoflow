---
tags:
  - plan
  - active
description: AI runtime、workflow contract 与 owner-native frontend 的 Batch 2–6 实施和验收
created: 2026-10-07T00:00:00
updated: 2026-10-07T00:00:00
---

# AI Runtime Layering — Batch 2–6

## 基线与授权

用户已要求实现剩余所有 batch，并一起合并。基线为 main `0464ec6f2d8`（PR #419）。Batch 1 的 durable workflow runtime、snapshot/projection 分层已经完成，不重复拆分。实施位于独立 worktree，避免混入另一项 External Agent 设计工作。

## 设计结论

原讨论按职责而非行数重构的方向正确。最小、明确的内部模块足以消化 orchestration complexity：保留唯一 `MastraAIRuntime` facade 和 composition root，继续使用同一 Mastra、storage、controller、memory、owner application ports。内部 session 和 projection 无独立 runtime authority。

单个 turn 的 ownership、approval、Stop replay、event ordering、settle 必须留在一个 session；telemetry 只观察，不参与授权或状态转换。Goal/Task 原生 owner persistence 与 Knowledge approval 后 persistence 不统一。外部 DTO 和 composable facade 的导出稳定。

## 交付切片

| Batch | 模块与职责                                                                                                                                                                   | 必须保留的行为                                                                                                                                                     | 验收证据                                                                                |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| 2     | `assistant-turn-observability.ts` 管理 phase/usage/terminal writes；`assistant-turn-session.ts` 管理完整 turn state machine；facade 准备 model/context/native session 并委派 | 双重 busy 检查、同步 reservation、bindingGeneration/nativeRunId 校验、approval 使用新 ExecutionContext、启动中取消的 Stop replay、一次 terminal、generator cleanup | 真实 native controller 的并发/授权/审批/取消/usage/telemetry 测试及现有 runtime suite   |
| 3     | owner-specific workflow suspension/recovery schema；snapshot projection 明确识别 native status                                                                               | Goal/Task revision 和 owner identity hints；三种 workflow kind 必须与 review/receipt/failure operation 一致                                                        | DTO 正反例、三 owner projection tests、HTTP/IPC 消费者 typecheck                        |
| 4     | Goal draft mapping/projection/native review coordination 与 facade；Task owner coordination；Knowledge 独立 review coordination；离开保护和有界 polling                      | lost response → probe owner truth → freeze revision → approve-only retry；Knowledge 不提前持久化；取消不能抹掉已落库事实                                           | Goal/Task/Knowledge composable suites、dirty/busy guard 和 missing run polling 行为测试 |
| 5     | composer context、Assistant stream、conversation projection；`useAIChatSession` 保留公开 facade                                                                              | delta buffering、event/approval/abort、history/list/delete/usage refresh、attachment/context reset 和并发隔离                                                      | chat session 行为测试、消费组件 typecheck、web journeys                                 |
| 6     | assistant runtime/events、workflow runtime、usage DTO；product tool schema/context；Goal planner provider output normalization/repair                                        | public barrel 稳定、tool policy 不变、planner research/repair/usage 行为不变                                                                                       | contracts/tools/planner suites、imports/governance/typecheck                            |

## 行为变更决策

1. **Contract owner**：Zod schema 是 transport DTO 的唯一权威，TypeScript 类型从 schema 推导。每种 workflow 的 suspension 只接受 clarification、自己的 draft review 和自己的 recovery receipt/failure operation。通用 suspension union 仍用于跨 workflow 的事件传输。
2. **未知 native status**：停止默认为 running。已知可执行状态显式映射；未知状态投影为终态 `failed`，稳定 failure code `AI_WORKFLOW_STATUS_UNSUPPORTED`。这是只读投影，绝不修改 Mastra 存储或声称 owner mutation 失败。已有 status vocabulary 可以表达失败，无需新增全栈 unsupported status。
3. **Corrupt snapshot**：保持明确 corrupt error，而不伪造成功或 running。前端读取失败必须有明确失败/停止策略，不能无限轮询。跨 owner suspension 在 projection 边界被拒绝。
4. **Missing run**：对已经获得 runId 的 query 返回 null，视为 unavailable/expired，终止该 run 的 polling 并给出安全提示。网络错误与 missing 区分，不通过继续无限 polling 掩盖 incompatibility。
5. **离开保护**：原生 owner 编辑有未提交内容或提交进行中时，Goal/Task/Knowledge 均进入现有离开确认机制；不引入全局新 guard runtime。

## 实施顺序和测试方法

每个切片独立提交，最后一个 PR。先完整保留 Batch 2 的 characterization，再对 Batch 3 的新 contract 写失败测试。前端先固定 Goal 真实 owner，再迁移 Task，Knowledge 独立实现；只有已证实重复的底层 mechanics 才共享。行为变更用 red-green，纯移动不增添复刻实现的测试。

外部 payload 从 unknown 经 schema/parser 进入可信数据；不增加绕过 schema 的 DTO assertion。有限 kind/status 显式枚举，公共错误不泄露 provider payload。保留 owner ports 的事务、幂等和 recovery 语义，本轮不改数据库模型或 migration。

## 非目标

- 不引入 GenericWorkflow、Universal UI、第二个 runtime/store 或新的 orchestration framework。
- 不为行数拆 `AIContextAssembler`，不大改 `ai.module.ts` composition root。
- 不部署生产；本轮交付到 main，生产 rollout 仍为独立操作。

## 最终 gate

1. ai/contracts/app-vue 最近的 lint、typecheck、test；必要的宿主 typecheck/build。
2. inventory、governance-check、docs-check 和 diff 检查。
3. 仓库 `validate-local-deploy` 与 fresh prod-like Docker 验证，记录实际证据。
4. `code-review` 独立 Standards/Spec read-only 审查；修复阻断项。
5. 新 PR 注册到 T3；按确切 head 验证完整 CI，再合并 main，核对 merge ancestry。
6. 完成计划归档。回滚使用整个 PR revert，不维护双实现。

## 进展与证据

- [x] 确认 #419 已合并、创建干净独立 worktree。
- [x] 记录剩余范围、架构和行为决策。
- [x] Batch 2 实现；最终全量 gate 见下文。
- [x] Batch 3 实现；最终全量 gate 见下文。
- [x] Batch 4 实现；最终全量 gate 见下文。
- [x] Batch 5 实现；最终全量 gate 见下文。
- [x] Batch 6 实现；最终全量 gate 见下文。
- [ ] 全量验收、review、CI 和 main 合并。

### 实施结果（最终 gate 前）

- Batch 2：`AssistantTurnSession` 整体保留同步 reservation、native binding、审批与取消；`AssistantTurnObservability` 负责 phase 和终态记录。facade 保留双重 busy 检查与基础设施装配。真实 controller / observability / projection 106 项通过。
- Batch 3：每个 owner 的 suspension schema 独立引用自己的 recovery failure/receipt，Goal/Task 的原有 refinement 放在 review schema 上复用。未知、空或 paused status 显式 failed；running/pending/waiting 仍可轮询。新增用例先确认红灯，再收紧实现。
- Batch 4：Goal draft mapping、timeline projection 和完整 native coordinator 分层；Task/Knowledge 各自 coordinator。Goal/Task 的 owner probe、revision freeze 与 approve-only retry 不变。3 owner + leave guard + polling + View 111 项通过。
- Polling 细化：null 终止并删除已失效 pointer；runId/kind/conversation 任一不符立即停止；连续 5 次读取失败停止自动重试，保留最后投影和 durable pointer，并提示重新打开会话。成功的 running 读取清零失败计数；页面切换后忽略未完成请求的响应。
- Batch 5：`useAIComposerContext`、`useAssistantStream`、`useConversationProjection` 各自持有对应状态；`useAIChatSession` 继续作为公开 facade。既有 20 项 chat 行为测试通过，app-vue typecheck 通过。
- Batch 6：DTO 拆为 assistant-runtime、assistant-events、workflow-runtime、runtime-usage，公共 barrel 保留；共享 event envelope 为内部模块。product tool 输入与可信 context 解码独立。Goal provider wire normalization、JSON 提取和单次 repair 在 `goal-planner-output.ts`，research 编排仍与 planner 内聚。planner/tools 24 项通过。
- 全量检查首轮发现 usage surface lock 仍读取旧物理 DTO 文件；已改为检查新 canonical schema/event 文件，保留原有唯一 schema 的架构约束。

### 独立审查收敛

- Standards：补齐 `AI_WORKFLOW_STATUS_UNSUPPORTED` 的 canonical safe message、HTTP 错误码映射和中英文 UI 提示；正常 failed run 仍是 HTTP 200 query 结果。三 owner HTTP/IPC 测试和真实 i18n 测试验证 public code 保留、内部诊断不外泄。
- Standards：owner recovery receipt 改为命名 schema 引用，消除依赖 union options 位置的隐式耦合。
- Spec：读取失败的有界重试只承诺 runtime read，不宣称会重试同步改变 watched run 后的 native projection failure；后者沿用原有行为。
- Spec：在真实 shell leave protocol、Goal module 状态发布和真实 Knowledge editor 上补充 dirty/busy 拒绝离开覆盖；确认拒绝后 draft/dialog/route 保留。
- 原有架构 surface tests 更新到新 canonical 文件边界，继续断言唯一 runtime/schema 与宿主 dispatch contract。

### 最终验收记录

待填：affected checks、prod-like Docker、独立 review、PR head CI 与 merge SHA。
