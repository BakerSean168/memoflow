---
tags:
  - plan
  - ai
  - goal
  - mastra
  - workflow
  - chat
  - ui
  - performance
  - governance
status: proposed
created: 2026-10-04T00:00:00+08:00
updated: 2026-10-04T00:00:00+08:00
description: MemoFlow AI Chat 与 Goal 创建 Workflow 收敛方案；修复 history/tool approval/runtime P0，并将 Goal clarification 与原生 Goal owner surface 收敛为单一产品路径
---

# MemoFlow AI Interaction + Goal Workflow Convergence Plan

## 0. Executive decision

本计划针对 2026-10-04 GCP Dev 实机审查中确认的 AI Chat / `goal.create` 运行时缺陷与产品收敛缺口。

结论不是“更换一个更强模型”，而是继续完成 AI vNext 已经确定但尚未完全闭环的三层架构：

```text
Conversation / Chat interaction
          ↓
Mastra durable runtime / workflow
          ↓
Owner Native Business Surface
```

本轮的核心决策：

1. **Chat 是自然语言交互入口。** 用户提问、clarification、自然语言 revise、workflow status / recovery 都在 Chat 中表达。
2. **Mastra 是 Assistant / Workflow 的执行与 durable state owner。** Goal 创建、resume、approve、retry 不能靠普通聊天文本“假装完成”。
3. **Goal owner UI 是唯一业务编辑面。** Goal/KR 编辑继续由 GoalDialog / Owner Native Edit Session 承担；AI 不恢复第二套 Goal editor。
4. **显式 `goal.create` 不再先跑一轮普通 Assistant。** 同一用户 turn 只能由一个 orchestrator 消费；避免 Generic Assistant 与 Goal Workflow 双执行。
5. **只读工具必须显式 auto-allow；高影响写操作才进入 approval。** 隐藏的 parked approval 不允许继续存在。
6. **用户输入不可因 history refresh 消失。** AgentController 的真实 `signal/user` 消息必须被 canonical history 正确投影，前端也不得用可能落后的 history destructive replace 当前 turn。
7. **Goal clarification 改为主 Composer 续聊。** `clarification_required` 不再要求用户到右侧 AI workflow textarea 重复输入。
8. **Workflow context surface 按 parity 逐步退场。** Goal 路径先停止把大型 AI workbench 当默认 surface；Task/Knowledge 与 recovery/supporting overlays 完成替代后再评估物理删除 `BusinessPanel.workflow`。
9. **性能问题单独硬化。** streaming delta batching、Markdown 渲染、自动滚动、composer loading 状态不得与业务正确性修复混成一个不可审查的大 diff。
10. **Web Research 不进入最小修复。** 它是 Goal Planner 的后续 evidence capability，不是当前 P0 的前置条件。

### Baseline

本计划创建于：

```text
origin/main @ 1f05edfa4f8b
```

规划分支：

```text
plan/ai-interaction-goal-workflow-convergence
```

本文件只定义实施顺序、契约、验收与 retirement gate；不在本计划提交中修改产品代码。

---

# 1. Current-system map and evidence

## 1.1 已经完成、必须保留的 AI vNext 基础

当前系统不是“Goal Workflow 完全不存在”。以下基础已经落地：

- TypeScript + Mastra 是唯一核心 AI runtime；
- `goal.create` / `task.create` / `knowledge.capture` 都有 durable workflow；
- `goal.create` 已支持 planning / clarification / review / revise / approve / recovery；
- Goal planner 有 typed structured output；
- `GoalPlanningDecision.needs_clarification` 已允许可选 `candidateDraft`；
- ADR-112 Owner Native Surface Orchestration 已实施 Goal / Task / Knowledge native review；
- `AIGoalDraftEditor` / `AITaskDraftEditor` 已从正常业务编辑路径退休；
- GoalDialog 已可接受 workflow-orchestrated native create session；
- Mastra workflow 继续拥有 `workflowRunId / revision / draftRef / receipt / retry`；
- owner-domain mutation ports、validation、dirty/busy/leave guard 不属于 AI；
- `BusinessPanel.workflow` 在 AI-8131 中被暂时保留为 workflow context/status surface，而不是业务 owner surface。

相关真值：

- `docs/architecture/adr/ADR-112-owner-native-surface-orchestration-and-quick-surface-reuse.md`
- `docs/product/modules/ai.md`
- `docs/product/workspace-ui.md`
- `docs/plan/archive/2026-10-01-pvc-ai-8101-goal-native-workflow.md`
- `docs/plan/archive/2026-10-02-pvc-ai-8121-retire-ai-owned-editors.md`
- `docs/plan/archive/2026-10-02-pvc-ai-8131-workflow-surface-retention.md`

因此，本计划的方向不是重建 AI Goal Workflow，而是完成**交互入口、history projection、tool approval、progressive draft 与 surface retirement** 的最后一段收敛。

## 1.2 当前真实用户路径

当前显式 Goal 创建大致是：

```text
User message
  ↓
inferWorkflowMode(message)
  ↓
AIChatView.handleComposerSend()
  ↓
先 handleSendChatBase() 运行普通 Assistant SSE
  ↓
refreshRuntimeHistory()
  ↓
再尝试 startGoalAgentRun()
  ↓
若 run 建立成功：goal.create workflow
  ↓
clarification / goal_draft_review / recovery
```

这意味着 Generic Assistant 与 Goal Workflow 在同一个用户 turn 内是**串行双 orchestrator**。

这是当前最重要的产品/架构偏差之一。

## 1.3 2026-10-04 实机证据

### Evidence E1 — 用户输入确实写入 Mastra，但 role 是 `signal`

GCP Dev 对同一 conversation 的 `mastra.mastra_messages` 记录显示：

```text
12:24:41 role=signal
“帮我创建一个考研的目标，我要备战今年考研”

12:27:39 role=signal
“我的目标院校是北京大学”
```

对应 metadata：

```text
metadata.signal.type = "user"
```

### Evidence E2 — canonical history projection 丢掉 `signal/user`

`packages/ai/src/server/mastra/runtime/assistant-history.service.ts` 当前只投影：

```text
role === user
role === assistant
role === system
```

因此 AgentController 实际产生的 `signal` 用户输入不会进入 `AssistantRuntimeHistoryView`。

现有 `assistant-history.service.spec.ts` 仍手工构造 `role: 'user'`，没有覆盖 AgentController 的真实 message shape。

### Evidence E3 — 前端成功 turn 后 destructive replace timeline

`packages/app-vue/src/modules/ai/composables/useAIChatSession.ts`：

```text
optimistic user + assistant draft
        ↓
streamMessage()
        ↓
refreshRuntimeHistory()
        ↓
chatTimeline = history.messages.map(...)
```

因此当前实际行为是：

```text
optimistic 用户消息出现
→ history 不包含 signal/user
→ chatTimeline 被整表覆盖
→ 用户消息消失
```

### Evidence E4 — Goal Workflow 本次完全没有启动

同一时间窗口的 `ai_execution_records` 只有：

```text
operation = assistant.turn
model = gemini-2.5-flash
```

没有：

```text
workflow.goal.plan
MASTRA_GOAL_PLANNER
goal.create planner execution
```

API RequestContext 日志只有：

```text
POST /api/v1/ai/runtime/assistant/sse
POST /api/v1/ai/runtime/assistant/history
POST /api/v1/ai/runtime/usage
```

没有 workflow start/resume 请求。

对应 conversation 在 `mastra_workflow_snapshot` 中也没有 Goal Workflow run。

### Evidence E5 — Goal start gate 依赖已经被 history 丢弃的 user message

`useAIGoalWorkflow.ts` 的 `canRunGoalAgent` 依赖：

```text
hasWorkflowUserMessages === true
```

而 `hasWorkflowUserMessages` 来源是当前 `chatTimeline` 中 `role === 'user'` 的消息。

因此：

```text
history 丢 user
→ hasWorkflowUserMessages=false
→ startGoalAgentRun() 静默 return
→ 不发 workflow HTTP
```

### Evidence E6 — 下一句会把未建立 run 的 workflow surface 退出

第二句：

```text
“我的目标院校是北京大学”
```

没有 create verb，所以 `inferWorkflowMode()` 返回普通 `chat`。

由于前一轮没有建立 `goalWorkflowRun`：

```text
workflowInProgress=false
```

前端会 `exitToolMode()`，导致右侧从临时 workflow surface 回到普通 Goal workspace。

### Evidence E7 — clarification 后端存在，但前端入口不是主聊天

后端 `goal.create` 支持：

```text
needs_clarification
→ clarification_required suspension
→ resume({ type: 'answer', answers: [...] })
```

但是当前回答入口位于 `AIGoalWorkflowPanel` 的专用 textarea / submit action。

主 Composer 发送的消息仍走普通 Assistant Chat，不会自动成为 workflow clarification answer。

### Evidence E8 — partial draft schema 已存在，但 workflow suspension 丢失它

`GoalPlanningDecisionSchema`：

```text
needs_clarification {
  questions,
  candidateDraft?: GoalPlanDraftContent
}
```

但是 `goal-create.workflow.ts` 在 `needs_clarification` 分支只 persist/suspend：

```text
pendingQuestions
round
```

没有把 `candidateDraft` 投影为当前 partial draft，也没有打开/patch native GoalDialog。

因此“先填已有信息，再继续问”目前是**schema 可以表达、orchestration 没接通**。

### Evidence E9 — 复杂任务卡住不是模型思考 1–2 分钟

开发环境真实 `assistant.turn`：

```text
74,979 ms  -> cancelled / aborted
137,926 ms -> cancelled / aborted
```

普通 turn 多数约：

```text
0.6s – 6.3s
```

两次长 turn 的 Mastra message 都显示模型在约 1 秒内已经进入：

```text
knowledge_search(...)
```

最终 tool invocation：

```text
state = output-denied
approval.approved = false
approval.reason = "Aborted by the user"
```

### Evidence E10 — read-only `knowledge_search` 被默认 approval park

`knowledge_search` 没有 `requireApproval: true`。

但是 AgentController 当前没有 MemoFlow-owned `toolCategoryResolver` / session permission policy。

AgentController 的 permission 规则默认最终：

```text
fallback = ask
```

没有 resolver 时工具落入 `other` category。

因此只读搜索也可能被 parked approval gate 阻塞。

### Evidence E11 — Web runtime 协议没有可操作的 tool approval surface

MemoFlow Assistant runtime 当前 DTO 包含：

```text
assistant.run.started
assistant.message.delta
assistant.activity
assistant.usage.updated
assistant.workflow.linked
assistant.run.completed
assistant.run.failed
assistant.run.cancelled
```

但当前 runtime 没有把 AgentController 的：

```text
tool_start
tool_approval_required
tool_end
```

完整投影为用户可见/可操作事件。

前端也没有 generic Assistant tool approval card。

所以用户只看到“生成中/...”而不知道实际在等待批准。

### Evidence E12 — composer 的 wait cursor 部分是 UI 主动制造

`AIFooterComposer.vue` 当前：

```text
textarea :disabled="loading"
disabled:cursor-wait
```

因此只要 SSE 未 terminal，输入框就完全 disabled，并显示系统 wait cursor。

这与真实长 parked run 叠加后，非常像浏览器/Windows 无响应。

### Evidence E13 — streaming path 有明显主线程压力源

当前每个 delta：

```text
target.content += delta
```

随后 `AIMessageContent` 对不断增长的整段文本执行 `renderSafeMarkdown()`；该路径包含 MarkdownIt、Highlight.js 与 Obsidian 扩展语法。

同时 timeline watcher 会持续：

```text
scrollTo({ behavior: 'smooth' })
```

因此长输出存在：

```text
频繁 reactive update
+ 全量 Markdown parse
+ DOM/v-html 更新
+ scrollHeight/layout
+ smooth scroll animation
```

的组合型 jank 风险。

## 1.4 Finding ledger

| ID    | Severity | Finding                                            | Root cause                                                       | Primary impact                        |
| ----- | -------- | -------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------- |
| F-001 | P0       | 用户消息在发送后消失                               | AgentController `signal/user` 未被 history 投影                  | 对话历史错误、后续 workflow gate 失真 |
| F-002 | P0       | 显式 Goal create 没有真正启动 workflow             | `hasWorkflowUserMessages` 被错误 history 清空，start 静默 return | Primary Goal AI path broken           |
| F-003 | P0       | read-only knowledge search 可无限等待              | AgentController permission 默认 `ask`，无 read allow policy      | Assistant 看似卡死 1–2 分钟           |
| F-004 | P0       | parked approval 无 UI/协议闭环                     | tool approval event/decision 没暴露到 Web runtime                | 用户无法知道/解除等待                 |
| F-005 | P1       | Generic Assistant 与 Goal Workflow 双 orchestrator | explicit workflow turn 仍先跑 Assistant                          | 假创建话术、额外 latency、状态冲突    |
| F-006 | P1       | clarification 不走主聊天                           | 专用 workflow textarea 承担 answer                               | “继续对话”语义与真实行为冲突          |
| F-007 | P1       | partial candidate draft 不进入 GoalDialog          | clarification suspension 丢 `candidateDraft`                     | 不能边问边完善原生目标草稿            |
| F-008 | P1       | Goal 路径仍默认暴露大型 workflow context surface   | AI-8131 过渡层尚未完成下一轮 parity                              | AI/owner UI 双层感仍明显              |
| F-009 | P1/P2    | composer 在整个 run 期间不可编辑                   | `loading -> disabled textarea`                                   | 长任务期间体验像程序冻结              |
| F-010 | P1/P2    | streaming 可能高频全量 Markdown/layout             | token 级 reactive render + smooth scroll                         | 长回答主线程 jank                     |
| F-011 | P2       | 用户看不到 tool/activity phase                     | activity/tool events 未完成投影                                  | 缺乏可解释的长操作反馈                |
| F-012 | P2       | Goal Planner 没有 Web Research evidence            | 当前只有 KnowledgeSource                                         | 不能自动查公开考研资料；非当前 P0     |

## 1.5 模型质量定位

Gemini 2.5 Flash 在实测中确实违反过：

```text
“不要在 typed business capability 完成前声称已经创建”
```

并错误回复“已经为您创建目标”。

这属于模型 instruction-following 质量问题，但不是本次 primary failure 的根因。

模型切换不能修复：

- history projection；
- workflow start gate；
- tool approval parking；
- clarification routing；
- owner surface orchestration；
- streaming UI 性能。

因此本计划必须先修 runtime / orchestration，再通过 eval 比较模型质量。

---

# 2. Target outcome and primary user path

## 2.1 Product outcome

用户只需要理解两个东西：

```text
左侧：和 AI 对话
右侧：MemoFlow 原生业务对象
```

用户不需要理解：

```text
workflow mode
AgentRun
workflow workbench
internal draftRef
revision
Mastra suspension
```

这些继续存在，但必须作为 runtime detail。

## 2.2 Goal create north-star journey

```text
User:
“帮我创建一个考研目标，我要备战今年考研”
          ↓
Turn Router 判断为 explicit goal.create
          ↓
Canonical user turn 被持久化到 Mastra conversation
          ↓
直接启动 durable goal.create
（不先跑 generic Assistant）
          ↓
Goal Planner
  ├─ User turn / clarification history
  ├─ selected MemoFlow context
  └─ Knowledge evidence
          ↓
PlanningDecision
  ├─ draft_ready
  └─ needs_clarification + optional candidateDraft
          ↓
如果已有 partial candidateDraft：
  打开右侧 Goal workspace
  打开 GoalDialog create session
  patch 已知字段
          ↓
Chat:
“我先帮你搭好了基础目标。还需要确认：
1. 目标院校/专业是什么？
2. ……？”
          ↓
User 仍在主 Composer 回复：
“目标院校是北京大学……”
          ↓
Active workflow routing 优先于新的 intent inference
          ↓
workflow.resume(clarification response)
          ↓
Planner revise / patch existing native Goal draft
          ↓
重复直到 review-ready
          ↓
用户可以：
  - 继续用自然语言 revise
  - 直接编辑 GoalDialog
          ↓
Save / Confirm
          ↓
Goal owner validation + canonical owner submit
          ↓
Mastra approve / deterministic replay / supporting mutations
          ↓
Chat 显示成功结果
          ↓
BusinessPanel 保留新创建 Goal 的 owner context
```

## 2.3 Clarification UX

目标不是“AI 弹一个问卷”。

推荐规则：

- 问题由 AI 主动提出；
- 问题显示在普通 assistant message 中；
- 用户用主 Composer 自然回答；
- active workflow 有优先路由权；
- 用户不需要重新选择“Goal workflow”；
- 同一轮可以回答一个或多个问题；
- 信息足够时不强行完成固定问题数；
- clarification 次数继续保持有限上限，避免无限问答；
- 用户随时可以取消当前 workflow；
- 用户显式切换到无关话题时，产品必须给出“继续当前目标 / 暂停目标并普通聊天”的明确交互，不允许静默退出并丢 run。

## 2.4 Failure / retry / cancel

### Provider failure

```text
Planner/provider failed
→ 保留当前 workflow run + native draft
→ Chat 显示可重试错误
→ 用户可重试或取消
```

### Owner validation failure

```text
GoalDialog validation failed
→ 不 approve workflow
→ owner UI 聚焦错误字段
→ Chat 不声称已创建
```

### Approval transport failure after owner submit

继续保留 AI-8101 的 existing invariant：

```text
owner submit 成功
→ approve transport 失败
→ 不重新创建 Goal
→ retry approval against same run/revision/idempotent owner identity
```

### User cancel

```text
Cancel workflow
→ cancel durable run
→ close/invalidate workflow-controlled native Goal create session
→ keep conversation history
→ return to ordinary chat / Goal workspace
```

### Refresh/restart

```text
Conversation shell + persisted workflow pointer
→ workflowRuntime.get(runId)
→ restore authoritative run
→ reopen native GoalDialog when applicable
→ restore clarification/recovery state in Chat projection
```

---

# 3. Scope and non-goals

## 3.1 In scope

### Runtime correctness

- AgentController `signal/user` history projection；
- post-turn timeline reconciliation；
- Assistant read tool permission policy；
- typed tool activity / approval runtime protocol；
- Web approval UI for genuine approval-required tools；
- explicit cancellation semantics；
- input/composer loading semantics。

### Goal vertical slice

- explicit Goal create single-owner turn routing；
- direct durable workflow start；
- main Composer -> clarification resume；
- progressive partial draft；
- native GoalDialog open/patch during clarification；
- manual native edit reconciliation；
- review/approve/create closure；
- Goal-specific workflow context demotion。

### Performance / observability

- SSE delta batching；
- Markdown render cadence；
- smart auto-scroll；
- activity feedback；
- long-turn telemetry / thresholds；
- focused browser performance acceptance。

### Governance

- test coverage for AgentController native message shape；
- no duplicate AI-owned Goal form；
- explicit tool permission manifest；
- one-orchestrator-per-turn invariant；
- workflow surface retirement gate update。

## 3.2 Explicitly out of scope for the minimal closure

- 更换默认模型/provider；
- 用 LLM classifier 替换全部 deterministic intent hint；
- Web Research / external search capability；
- 大规模重写 Mastra runtime；
- 重建 Goal/KR domain model；
- DOM automation owner UI；
- Production release / deployment；
- 同一批一次性完成所有 Task/Knowledge native follow-up migration；
- 重新引入 AI-owned Goal/Task/Knowledge editor；
- 用隐藏 prompt 兜底 runtime contract bug。

## 3.3 Follow-up scope

在 Goal vertical slice 稳定后，再进入：

1. Task clarification -> Chat；
2. Knowledge clarification -> Chat；
3. Goal supporting Task/Knowledge overlay -> owner-native follow-up / inline summary；
4. `BusinessPanel.workflow` 最终 retirement；
5. Web Research evidence phase。

---

# 4. Protected contracts

## 4.1 Owner-domain contracts

必须继续保护：

- Goal/KR 事实由 Goal owner 持有；
- GoalDialog / Owner Native Edit Session 负责业务 validation；
- AI 不直接写 Pinia/component private state；
- AI 不绕过 Goal owner command；
- deterministic Goal/KR create identity / replay semantics；
- Label resolution/create 仍服从当前 owner/identity boundary；
- Task/Knowledge 后续 mutation 仍走其 owner ports。

## 4.2 Mastra workflow contracts

保留：

- `workflowRunId`；
- revision；
- `draftRef`；
- restart/get/list/resume；
- cancel；
- approval；
- execution receipt；
- partial/recovery/retry；
- bounded clarification rounds；
- process restart restore。

允许迁移：

- clarification response 的 UI-facing payload；
- `clarification_required` suspension 增加 partial draft projection；
- runtime event schema增加 tool activity/approval typed events。

## 4.3 Conversation/history contracts

Mastra Memory 继续是 Assistant transcript authority。

必须满足：

- AgentController native user signal 可被 history 投影成 product role `user`；
- system/internal signals 不伪装成 user；
- attachments 只返回 bounded metadata，不泄露 data URL；
- Conversation shell 继续只保存产品 shell metadata；
- no second product transcript database；
- current-turn optimistic projection 不因临时 stale history destructive replace 而消失。

## 4.4 Tool permission contracts

必须显式区分：

```text
read-only capability     -> allow
safe/session-local action -> 按当前 owner policy 显式 allow/ask
persistent/high-impact mutation -> ask
unsupported/forbidden    -> deny
```

禁止继续使用“没有规则所以 fallback ask”作为产品权限模型。

工具 permission 必须由 MemoFlow-owned manifest / resolver 定义，不能散落为 UI 特判。

## 4.5 Shell/UI contracts

保护：

- BusinessPanel dirty/busy/leave guard；
- Goal business surface 仍在右侧 owner workspace；
- workflow attention/recovery 在 retirement 前必须有 replacement；
- mobile/narrow layout 不因 Goal workbench demotion 失去 workflow 状态访问；
- normal user UI 不暴露 raw runId/draftRef/revision；
- no DOM selector automation。

## 4.6 Security / privacy / provider contracts

保护：

- credentials 不进入 workflow snapshot / message / public event；
- identity 来自 authenticated ExecutionContext；
- provider/model capability resolution fail closed；
- retrieved knowledge / future web evidence 都是 untrusted data；
- tool availability / approval policy 不可由 prompt/knowledge 改写。

---

# 5. North-star architecture

## 5.1 Ownership model

```text
┌──────────────────────────────┐
│ Chat Interaction Projection  │
│ - user/assistant messages    │
│ - clarification             │
│ - activity/progress         │
│ - approval/recovery cards   │
└──────────────┬───────────────┘
               │ typed turn / decision
               ▼
┌──────────────────────────────┐
│ AI Interaction Orchestrator  │
│ - active workflow priority   │
│ - explicit intent routing    │
│ - generic assistant fallback│
└──────────────┬───────────────┘
               │
     ┌─────────┴──────────┐
     ▼                    ▼
Assistant Runtime     Workflow Runtime
AgentController       goal.create
     │                    │
     └─────────┬──────────┘
               ▼
        Mastra Memory / Storage
               │
               ▼
      Surface Orchestrator
               │
               ▼
       Goal Owner Native UI
```

### Single-owner rule

同一个 user turn 只能有一个 primary execution owner：

```text
active workflow continuation
> explicit create/capture workflow
> ordinary assistant
```

禁止：

```text
ordinary assistant 完整执行
+ 同一 turn 再启动 goal.create
```

## 5.2 Turn routing

推荐优先级：

```text
1. 当前 conversation 有 non-terminal workflow
   ├─ clarification_required -> clarification response
   ├─ review -> natural language revise / owner edit
   ├─ recovery -> recovery action / explicit cancel
   └─ running -> queue/stop policy

2. 无 active workflow
   ├─ clear goal create intent -> goal.create
   ├─ clear task create intent -> task.create
   ├─ clear knowledge capture -> knowledge.capture
   ├─ knowledge QA -> ordinary assistant + read tools
   └─ otherwise -> ordinary assistant
```

`inferWorkflowMode()` 可以继续作为 conservative explicit-intent hint，但它不再负责 active workflow continuation。

## 5.3 Canonical history projection

### Server projection

`AssistantHistoryService` 应引入一个单一 message role projector：

```text
Mastra role=assistant -> assistant
Mastra role=user      -> user
Mastra role=system    -> system/filtered by product policy
Mastra role=signal + metadata.signal.type=user -> user
其它 controller/internal signal -> filtered
```

不得用一个简单 role whitelist 继续假设 AgentController 会写 `role=user`。

### Client current-turn projection

成功 SSE terminal 后：

- 不再立即用可能落后的 history destructive replace 当前 turn；
- local SSE projection 可作为当前 session 的 live projection；
- authoritative history 在 conversation load/reload/reconnect 时恢复；
- 如保留后台 reconcile，只允许 **merge/reconcile**，不能删除尚未在 server response 中出现的当前 optimistic turn。

这样同时降低：

- 消息闪烁；
- history API 请求；
- workflow start race；
- read-after-write timing sensitivity。

## 5.4 Tool permission model

建立一个 MemoFlow-owned manifest，而不是依赖 AgentController fallback：

```text
knowledge_search              read      allow
workspace_overview            read      allow
planner_today_summary         read      allow
planner_conflicts             read      allow
planner_upcoming_tasks        read      allow
notification_unread_summary   read      allow

routine_create                edit/execute  ask
routine_set_profile_active    edit          ask
routine_set_temporary_override edit         ask
routine_clear_temporary_override edit       ask
routine_start_protocol        execute       ask
notification_execute_action   execute       ask

routine_pause_protocol        execute   preserve current product policy explicitly
routine_resume_protocol       execute   preserve current product policy explicitly
routine_end_protocol          execute   preserve current product policy explicitly
```

实施前先通过 characterization test 锁定后三个 session transition 的 intended policy，避免顺手改变现有产品安全策略。

### Important invariant

`createTool({ requireApproval: true })` 与 AgentController permission rule 不能形成两套互相不一致的 approval semantics。

最终需要一个 canonical helper/manifest 产生：

- tool category；
- controller permission；
- UI risk label；
- whether explicit user decision is required。

## 5.5 Tool activity / approval protocol

当前 `assistant.activity` 可以继续承担普通 progress，但 approval 必须 typed。

建议扩展 Assistant Runtime Event：

```text
assistant.tool.started
assistant.tool.completed
assistant.tool.approval_required
assistant.tool.approval_resolved
```

至少字段包括：

```text
runId
conversationId
sequence
toolCallId
toolName
safe summary / activity type
approval risk category
```

不得把 raw tool args 中可能包含敏感内容直接广播到 UI。

增加 authenticated decision endpoint/client：

```text
approve
decline
always_allow_category   // 只有产品明确允许时暴露
```

第一版 Web UI：

- read tool：只显示 activity，不弹 approval；
- true write tool：inline approval card；
- decline 后 run 得到明确的非错误 denied outcome；
- stop/cancel 必须解除 parked gate；
- transport disconnect 不允许留下“永远 generating”的 UI。

## 5.6 Progressive Goal draft

### Planning decision

继续复用：

```text
needs_clarification + candidateDraft?
```

不要新增第二套“pre-draft” schema。

### Workflow persistence

当 planner 返回 `needs_clarification` 且存在 candidate draft：

```text
candidateDraft
→ parse as GoalPlanDraftContent
→ assign/persist target revision
→ retain as current partial workflow draft
→ suspension exposes safe partial draft projection
```

### Native surface

前端拿到 clarification suspension：

```text
partial draft exists
→ open Goal owner workspace
→ open workflow-controlled GoalDialog create session
→ semantic patch known fields
```

此时：

- Goal 还没有 owner persistence；
- Save/submit 仍受 workflow stage gate；
- 只是在 native owner edit session 中展示/编辑草稿。

## 5.7 Clarification data model

当前：

```text
questions[]
answers[]
```

天然偏向表单式逐题回答。

目标 UX 是自由对话，因此建议把 workflow 的 canonical clarification round 收敛到：

```text
questions: string[]
response: string
```

Planner 同时看到：

- pending questions；
- raw user response；
- current partial/native draft；
- prior clarification rounds。

如果为了短期兼容必须保留 `answers[]`，可以内部生成，但 UI contract 不应继续要求“每个 question 一个 textarea answer”。

由于 ADR-111 已明确当前 AI vNext 不承担 legacy data compatibility，本次可以采用 direct canonical cutover；但任何现存 development snapshots 必须 reset/reseed 或在 restore 时 fail closed，不做模糊迁移。

## 5.8 Manual edit + AI revise convergence

同一个 GoalDialog 内可能同时发生：

```text
AI partial draft patch
用户手动编辑
用户聊天补充
AI 再次 revise
```

必须避免 AI 下一轮把用户刚手改的字段覆盖掉。

推荐顺序：

1. 每次 clarification/revise 之前读取 live owner-native draft；
2. reconcile live Goal/KR content 到 workflow draft/revision；
3. planner 基于最新 currentDraft + clarification response 生成新 candidate；
4. Surface Orchestrator 只应用新 revision；
5. owner session 保持 stale-response rejection；
6. 任何 revision mismatch fail closed，不 silently overwrite。

优先复用 AI-8101 已经存在的 owner/native reconciliation 与 revision guard，不创建第二套 draft merge engine。

## 5.9 Workflow context surface retirement path

AI-8131 的“retain”决定当时是正确的，因为 clarification/recovery 等没有 replacement。

本计划不直接推翻它，而是逐项关闭 retention gate。

### Goal path first

Goal 默认路径改为：

```text
Chat = clarification/status/recovery
BusinessPanel = Goal owner surface
```

`AIGoalWorkflowPanel` 不再作为 Goal 创建的默认大型右侧 surface。

### Temporary secondary access

在 supporting Task/Knowledge / diagnostics 尚未迁移前，可以保留一个低优先级：

```text
“Workflow details” / debug context
```

但：

- 不自动抢占 Goal business surface；
- 不包含 Goal/KR business form；
- 不作为用户完成 Goal 创建的必经路径。

### Final removal gate

只有以下全部完成，才删除 `BusinessPanel.workflow`：

- Goal clarification replacement；
- Task clarification replacement；
- Knowledge clarification replacement；
- recovery/retry replacement；
- supporting Task/Knowledge replacement；
- dirty/busy attention replacement；
- mobile context replacement；
- diagnostics replacement；
- restart/reopen replacement。

## 5.10 Composer behavior

“AI 正在执行”不等于“用户不能打字”。

第一阶段目标：

- textarea 在普通 streaming 期间保持可编辑；
- send 是否可执行由 active run policy 决定；
- Stop 是独立 action；
- 不使用 `cursor-wait` 伪装系统忙；
- active clarification 必须允许立即回答；
- 如果暂不支持 queued follow-up，允许输入但 send 在 terminal 前保持 disabled，并给明确状态；
- 后续若采用 AgentController `queuedFollowUps`，单独设计，不在 P0 修复中偷偷启用。

## 5.11 Streaming rendering

最小性能方案：

```text
SSE raw deltas
→ non-reactive buffer
→ requestAnimationFrame / bounded interval flush
→ Vue message content update
```

建议：

- 50–100ms bounded flush 或每 animation frame 一次；
- 不为每个 token/fragment 单独触发全量 markdown parse；
- generating 阶段可以降低 Markdown render cadence；
- terminal 时保证完整 safe Markdown final render；
- auto-scroll 只在用户位于 near-bottom 时执行；
- 连续 stream 使用 `behavior: auto` / rAF，不连续触发 `smooth`；
- 用户手动上滚后停止强制拉回底部。

---

# 6. Contract changes

## 6.1 History projector

**Preserve:** `AssistantRuntimeHistoryView` 的 product role contract。

**Change:** server 接受 AgentController native `signal/user` 作为 product `user`。

**No change:** Conversation shell / Mastra transcript authority。

## 6.2 Assistant runtime events

**Extend, do not break existing events.**

新增 tool lifecycle / approval typed events；已有 client 忽略新事件时必须 fail-safe 或同步升级所有当前 consumers。

若 `AssistantRuntimeEventSchema` 使用 closed discriminated union，contracts + server + web + desktop consumer 必须在同一 migration batch 中更新。

## 6.3 Tool approval command

新增 authenticated runtime action；identity 从 server context 解析。

禁止 client 发送：

- identityId；
- credential；
- arbitrary permission rule mutation。

## 6.4 Goal clarification schema

优先把 UI-facing resume 从结构化 textarea answers 迁移为自然语言 response。

若改变 durable snapshot schema：

- development reset/reseed；
- restore 对 unknown old shape fail closed；
- 不引入长期 dual-read/dual-write compatibility。

## 6.5 Goal partial draft suspension

`clarification_required` 可以扩展：

```text
partialDraft?
revision?
```

或通过一个 typed workflow projection 返回。

禁止直接暴露：

- provider details；
- raw prompt；
- credential；
- internal tool traces。

## 6.6 Turn routing

`AIChatView.handleComposerSend()` 不再负责“先 generic assistant，再 workflow”。

它需要收敛为一个明确的 turn dispatcher；具体是 composable 还是小的 interaction service，可以在 AIC-2001 中按当前依赖最小化决定。

---

# 7. Phased roadmap

## Phase 0 — Baseline and characterization

### Objective

把已确认的生产代码缺陷转成可重复的自动化失败，防止修复过程中误判。

### Why first

当前多个症状共用同一根因。没有 characterization tests 就直接改 orchestration，容易把 Goal、Chat、Tool Approval 三条路径混在一起。

### In scope

- AgentController signal history fixture；
- current-turn disappearance regression；
- explicit Goal create should issue workflow start；
- read tool permission park reproduction；
- long tool wait / stop behavior；
- existing workflow surface / native Goal baseline。

### Out of scope

- 不修产品代码；
- 不重构 UI；
- 不改模型。

### Deliverables

- failing tests / characterization tests；
- exact baseline commands；
- finding ledger 与 test mapping。

### Acceptance

每个 P0 至少有一个能在旧实现上稳定失败或明确证明旧行为的自动化测试。

---

## Phase 1 — Runtime correctness foundation

### Objective

先恢复：

```text
消息不丢
工具不隐式挂起
审批可见可操作
取消可释放
```

### Dependencies

Phase 0。

### Main changes

1. canonical history role projector；
2. signal/user tests；
3. remove/descope post-turn destructive history replacement；
4. explicit MemoFlow tool permission manifest/resolver；
5. read tools auto-allow；
6. true write tools typed approval event + action；
7. tool activity projection；
8. composer 不再 entire-turn disabled；
9. stop/cancel releases parked approval。

### Protected contracts

- Mastra Memory authority；
- existing workflow runtime；
- high-impact mutation approval；
- authenticated identity；
- no plaintext credential/event leakage。

### Acceptance evidence

- knowledge search 不再出现 hidden parked approval；
- write tool 会出现 approval card；
- user message stream 完成后仍存在；
- Stop 可在普通 inference / tool activity / approval wait 三种状态终止；
- no stuck `chatLoading=true` after terminal/cancel/error。

---

## Phase 2 — Goal progressive native workflow vertical slice

### Objective

完成用户最关心的 Goal 创建主路径：

```text
one turn -> durable workflow -> native GoalDialog -> Chat clarification -> owner create
```

### Dependencies

Phase 1 必须完成。

### Main changes

1. explicit Goal create 不再先跑 Generic Assistant；
2. canonical user turn persistence；
3. direct `goal.create` start；
4. active workflow routing priority；
5. clarification response 从主 Composer resume；
6. `candidateDraft` 在 clarification 阶段进入 durable partial draft；
7. partial draft 打开并 patch GoalDialog；
8. manual edit / AI revise reconciliation；
9. final Goal owner submit + workflow approve；
10. success/recovery projection 回 Chat。

### Out of scope

- Task/Knowledge 全量迁移；
- Web Research；
- `BusinessPanel.workflow` 物理删除。

### Acceptance evidence

真实浏览器完整执行：

```text
“帮我创建一个考研目标，我要备战今年考研”
→ 右侧 GoalDialog 自动打开并出现基础 name/description
→ AI 在聊天中主动问缺失信息
→ “目标院校北京大学” 走同一 workflow resume
→ GoalDialog 被同一 run/revision 更新
→ 用户可手工修改
→ Save/Confirm
→ 只创建一个 canonical Goal
```

并证明该 turn 没有额外 `assistant.turn` 假创建回答。

---

## Phase 3 — Workflow context demotion and migration

### Objective

把 AI-8131 的 retained surface 从“默认大工作台”进一步降级为真正的 transitional context/detail surface，并逐项关闭 retirement gate。

### Order

1. Goal default path 不再自动占用 workflow surface；
2. Goal clarification/recovery/chat status 完整替代；
3. supporting Task/Knowledge follow-up 设计为：
   - owner-native surface；或
   - Chat inline review summary + explicit open owner surface；
4. Task clarification 迁到 Chat；
5. Knowledge clarification 迁到 Chat；
6. dirty/busy/mobile/attention replacement；
7. 最后重新评估 `BusinessPanel.workflow` physical retirement。

### Acceptance

Goal 用户不需要打开 workflow surface 就能从自然语言完整创建 Goal；Task/Knowledge 尚未迁移部分不得被删除。

---

## Phase 4 — Streaming performance and long-operation UX

### Objective

解决“像 Windows 未响应”的剩余体验与真实主线程压力。

### Main changes

- SSE delta buffer/batching；
- Markdown render throttling/final render；
- smart auto-scroll；
- remove cursor-wait；
- user typing remains responsive；
- activity phase/status；
- long-turn watchdog / observability；
- browser CPU-throttle acceptance。

### Acceptance

- streaming 期间 textarea 可输入；
- 不出现由 composer CSS 主动制造的 wait cursor；
- 4x CPU throttling 下持续输出仍可交互；
- large response 不产生持续的长任务/滚动抢占；
- hidden approval 不再是长请求来源。

---

## Phase 5 — Optional external research evidence

### Objective

在核心 workflow 正确后，再支持“帮助用户主动搜集公开考研信息”。

### Architecture

```text
User facts
Owner facts
Knowledge evidence
External research evidence
        ↓
Goal Planner
```

### Rules

- external evidence = untrusted data；
- 不覆盖用户明确输入；
- source/citation 可追踪；
- bounded result/token budget；
- 网络失败不阻塞用户继续手工创建 Goal；
- 与 generic Assistant Web Search 不复制一套平行 evidence model。

### Out of current minimal release

本 Phase 不阻塞 P0–P1 收敛。

---

# 8. Execution-ready tickets

## AIC-1001 — Project AgentController user signals into canonical chat history

**Goal:** AgentController 持久化的真实用户消息在 Assistant history 中稳定表现为 product `role=user`。

**Why now:** F-001 是 Goal start、用户消息消失与 transcript correctness 的共同 P0 根因。

**Scope:**

- `packages/ai/src/server/mastra/runtime/assistant-history.service.ts`
- `packages/ai/src/server/mastra/runtime/assistant-history.service.spec.ts`
- 如需要，新增小型 message projector helper。

**Out of scope:** 不改变 Mastra storage schema；不创建第二份 transcript。

**Protected contracts:** owner-scoped thread、attachment redaction、Mastra authority。

**Implementation:**

1. 用真实 AgentController fixture 加入 `role=signal + metadata.signal.type=user` 测试；
2. 定义 explicit product-role projector；
3. 只把 user signal 投影为 `user`；
4. internal/system/controller signal fail closed；
5. 保留 attachment metadata projection；
6. 验证排序稳定；
7. 增加 regression case：user signal + assistant reply 都出现在 history。

**Tests:**

```text
packages/ai/src/server/mastra/runtime/assistant-history.service.spec.ts
packages/ai/src/server/mastra/runtime/assistant-history.persistence.spec.ts
```

**Acceptance:** GCP Dev 当前类型的 `signal/user` conversation 经 history API 返回完整 user+assistant pair。

**Dependencies:** none。

**Risks:** 把其它 signal 错投影为用户消息；通过 strict metadata type gate containment。

---

## AIC-1002 — Stop destructive post-turn history replacement

**Goal:** 当前 turn 的用户消息和 assistant live projection 不再因 read-after-write / projection lag 被整表覆盖。

**Why now:** F-001/F-002 即使 server projector 修复，也需要客户端消除 timing-sensitive destructive replace。

**Scope:**

- `packages/app-vue/src/modules/ai/composables/useAIChatSession.ts`
- `useAIChatSession.spec.ts`

**Out of scope:** 不引入完整 offline message cache。

**Protected contracts:** conversation reload 仍以 Mastra history 为 authority。

**Implementation:**

1. characterize current `refreshRuntimeHistory()` success path；
2. 成功 terminal 后保留 SSE/live projection；
3. usage 可独立刷新；
4. conversation select/reload/reconnect 继续使用 authoritative history；
5. 若仍需 background history reconcile，使用 merge，不允许删除 current turn optimistic item；
6. 确保 assistant terminal id 替换 draft id；
7. 添加 delayed/stale history regression test。

**Tests:**

- history 不含 latest user 时，发送后的 user bubble 仍存在；
- reload 后 authoritative history 正确替代 local projection；
- abort/error 不丢 user turn。

**Acceptance:** 发送完成后用户输入永不因自动 history refresh 消失。

**Dependencies:** AIC-1001 推荐先完成。

**Risks:** local projection 与 reload 后 server id 不一致；current session 不依赖 user message id 做业务 identity。

---

## AIC-1101 — Introduce explicit MemoFlow tool permission policy

**Goal:** read-only product tools 不进入 approval；高影响写操作保持明确审批。

**Why now:** F-003 是真实 75s/138s hung turn 根因。

**Scope:**

- `packages/ai/src/server/mastra/tools/product-tools.ts`
- `packages/ai/src/server/mastra/runtime/mastra-ai.runtime.ts`
- related specs。

**Out of scope:** 不改变 owner business permission。

**Protected contracts:** mutation approval、prompt 不能修改 policy。

**Implementation:**

1. inventory all Assistant tools；
2. 建立 one canonical tool policy manifest；
3. 生成/接入 AgentController `toolCategoryResolver`；
4. 明确 read category = allow；
5. 明确 requireApproval mutation = ask；
6. characterize routine pause/resume/end current desired policy；
7. unsupported/unknown tool 默认 deny 或显式 ask，由安全审查冻结；
8. 单测禁止新 tool 未分类静默进入生产。

**Tests:**

- `knowledge_search` / workspace/planner/notification read 不需要 approval；
- high-impact tools 保持 ask；
- unknown tool fail closed。

**Acceptance:** “我的笔记里有类似 Figma 的工具吗”不再 parked approval。

**Dependencies:** Phase 0 characterization。

**Risks:** permission 放宽过度；通过 allowlist manifest containment。

---

## AIC-1102 — Expose typed tool activity and approval events

**Goal:** Assistant runtime 能告诉 UI 正在使用什么能力、是否等待用户决定。

**Why now:** F-004/F-011。

**Scope:**

- `packages/contracts/src/modules/ai/api/ai-runtime.dto.ts`
- contracts tests；
- `packages/ai/src/server/mastra/runtime/mastra-ai.runtime.ts`
- `packages/ai/src/client/runtime-assistant.ts`
- API transport composition as required。

**Out of scope:** 不把 raw args/credentials 暴露到 UI。

**Protected contracts:** authenticated identity、event sequence/order、cancel semantics。

**Implementation:**

1. define typed tool events；
2. map `tool_start / tool_approval_required / tool_end`；
3. sanitize event payload；
4. extend client parser；
5. add authenticated approval decision command；
6. map decline/abort distinctly；
7. ensure terminal cannot be emitted while an unresolved hidden gate exists without UI state。

**Tests:** event schema、sequence、unknown event protocol failure、approve/decline/cancel。

**Acceptance:** server parked approval 必有 corresponding client-visible typed event。

**Dependencies:** AIC-1101 policy manifest。

**Risks:** closed union migration；contracts/server/client 同批实施。

---

## AIC-1103 — Add Chat tool activity / approval UI

**Goal:** true write approval 作为 Chat inline decision card；read tool 只显示轻量 activity。

**Why now:** 完成 AIC-1102 的用户闭环。

**Scope:**

- AI chat message/activity projection；
- new focused approval component if necessary；
- `useAIChatSession` event handling；
- i18n/test。

**Out of scope:** 不建立独立 Tool Workbench。

**Protected contracts:** keyboard/accessibility、Stop、mobile/narrow layout。

**Implementation:**

1. add activity state in timeline/run projection；
2. display “正在搜索知识库”等 non-blocking activity；
3. approval-required render approve/decline card；
4. disable duplicate decisions；
5. stop cancels run and closes parked gate；
6. transport failure gives retryable state；
7. no raw JSON tool args as normal UX。

**Acceptance:** 用户能区分“模型在生成”“正在读数据”“等待我的批准”。

**Dependencies:** AIC-1102。

**Risks:** timeline clutter；只保留当前活动，completed read activity 可折叠/弱化。

---

## AIC-1201 — Keep composer editable during long Assistant runs

**Goal:** streaming / tool execution期间用户仍可输入，不再出现 wait cursor 伪死机。

**Why now:** F-009。

**Scope:** `AIFooterComposer.vue` + chat view state/tests。

**Out of scope:** 第一版不自动启用 queued follow-up sending。

**Implementation:**

1. 去掉 `textarea :disabled=loading`；
2. 去掉 `disabled:cursor-wait`；
3. 将 “can type” 与 “can submit” 分离；
4. active ordinary run 时允许编辑下一条，但按产品 policy 控制 send；
5. Stop 独立可达；
6. active clarification 时 composer 必须可以 submit answer；
7. IME/composition behavior 回归。

**Acceptance:** 138s 等待场景即使仍有长操作，输入框也不表现为系统冻结。

**Dependencies:** AIC-1102/1103 可以并行后合入。

**Risks:** 用户误以为已发送 queued follow-up；send disabled 状态必须清楚。

---

## AIC-2001 — Replace dual orchestration with one turn dispatcher

**Goal:** explicit workflow turn 不再先完整执行 Generic Assistant。

**Why now:** F-005 是假创建话术和额外 latency 的架构根因。

**Scope:**

- `AIChatView.vue`
- `useAIChatView.ts`
- `workflowIntent.ts`
- minimal canonical user-turn persistence seam as required。

**Out of scope:** 不引入 LLM intent classifier。

**Protected contracts:** ordinary chat、knowledge QA、conversation shell、selected context。

**Implementation:**

1. 抽出/收敛一个 turn dispatch decision；
2. priority = active workflow > explicit workflow intent > generic Assistant；
3. explicit Goal create 记录 user turn 后直接 `workflowRuntime.start`；
4. 不调用 `handleSendChatBase()`；
5. ordinary chat 保持现有 Assistant path；
6. knowledge QA 继续 ordinary Assistant + read tool；
7. start failure 显示明确错误，不保留假的 workflow surface；
8. execution record regression：Goal create turn 不产生无意义的 `assistant.turn`。

**Acceptance:** “帮我创建考研目标”第一轮直接进入 `goal.create`，不存在“已经创建”普通 Assistant 文本抢跑。

**Dependencies:** AIC-1001/1002。

**Risks:** user turn persistence path；必须继续以 Mastra transcript 为 authority，不能只存在浏览器 local timeline。

---

## AIC-2002 — Route active Goal clarification through the main Composer

**Goal:** workflow suspension 问题由 AI 在 Chat 提问，用户从主 Composer 自然回答。

**Why now:** F-006。

**Scope:**

- Goal workflow clarification contract；
- `useAIGoalWorkflow.ts`
- `useAIChatView.ts` / `AIChatView.vue`
- `AIGoalWorkflowPanel` clarification UI retirement/demotion。

**Protected contracts:** max rounds、cancel、restart/restore。

**Implementation:**

1. active `clarification_required` 对 composer 有 route priority；
2. 把 questions 投影为 assistant chat message / workflow message projection；
3. main composer message -> workflow resume；
4. store raw natural-language response in clarification state；
5. planner receives pending questions + response；
6. successful resume 后更新 questions/draft；
7. retire Goal panel dedicated clarification textarea；
8. restore suspended run 后 chat projection 能重新显示 pending questions。

**Acceptance:** 用户不进入右侧 workflow textarea 也能完整走完 clarification。

**Dependencies:** AIC-2001。

**Risks:** 多问题回答映射；canonical state 应保存 raw response，而不是强行 frontend 拆 answers。

---

## AIC-2003 — Preserve and project partial Goal draft during clarification

**Goal:** AI 已知的信息立即进入原生 GoalDialog，而不是等所有 clarification 完成。

**Why now:** F-007，直接对应目标 UX。

**Scope:**

- `ai-goal-create-workflow.dto.ts`
- `goal-create.workflow.ts`
- Goal planner/workflow specs；
- `useAIGoalWorkflow.ts`
- Goal native surface adapter/session tests。

**Protected contracts:** no owner persistence before confirm；deterministic identity；revision guard。

**Implementation:**

1. persist `needs_clarification.candidateDraft` when present；
2. assign canonical target revision；
3. include safe partial draft projection in suspension/run view；
4. `projectRun()` 在 clarification 状态也能打开 native Goal create session；
5. patch known Goal/KR fields；
6. submit remains workflow-controlled and disabled/guarded until review-ready；
7. restore 时重建同一 partial native review；
8. no Goal/KR AI-owned form。

**Acceptance:** 第一轮只有“考研/今年”信息时，GoalDialog 也能先出现合理 name/description/target skeleton。

**Dependencies:** AIC-2002。

**Risks:** planner 可能不返回 candidateDraft；产品仍需正常显示问题，不把 draft 当 required。

---

## AIC-2004 — Reconcile manual native edits before each AI re-plan

**Goal:** 用户手改 GoalDialog 后再回答 AI，不被下一轮 planner 静默覆盖。

**Why now:** progressive draft 必须处理 human+AI concurrency。

**Scope:** reuse AI-8101 Goal native session/revision machinery。

**Implementation:**

1. resume/revise 前读取 live native draft；
2. reconcile Goal/KR edits into workflow draft；
3. only then invoke planner；
4. project fresh revision with stale rejection；
5. preserve KR draftRef mapping；
6. fail closed on revision mismatch；
7. owner validation remains only at submit boundary。

**Acceptance:** 手工修改 Goal name/KR 后补充院校信息，修改不会被 AI revision 丢失。

**Dependencies:** AIC-2003。

**Risks:** merge complexity；严格复用 existing structured edit/revision pipeline，不新增 generic merge engine。

---

## AIC-2005 — Close Goal owner submit / workflow approve lifecycle

**Goal:** progressive workflow 最终只创建一个 canonical Goal，并正确完成 receipt/recovery。

**Why now:** vertical slice closure。

**Scope:** Goal native confirm coordinator + existing approve path。

**Protected contracts:** AI-8101 idempotent replay / approval retry。

**Implementation:**

1. final live native draft -> durable workflow revision；
2. owner `requestSubmit`；
3. validation error -> no approve；
4. owner success -> workflow approve；
5. approve transport retry reuses same deterministic identities；
6. Chat success message comes from typed outcome, not generic Assistant claim；
7. BusinessPanel remains on created Goal owner context。

**Acceptance:** one Goal, no duplicate KR, no fake success, transport retry safe。

**Dependencies:** AIC-2004。

---

## AIC-2101 — Demote Goal workflow workbench from the default product path

**Goal:** Goal AI create 的正常体验只显示 Chat + Goal native owner surface。

**Why now:** F-008；Goal clarification/native parity 完成后，AI-8131 的 Goal-specific retention reasons 已显著减少。

**Scope:**

- Goal composition in workflow context；
- shell workflow auto-open behavior；
- Goal workflow panel default visibility；
- docs/governance/tests。

**Out of scope:** 不物理删除全局 `BusinessPanel.workflow`。

**Implementation:**

1. Goal start 不自动抢占右侧为 workflow surface；
2. Goal owner surface remains primary；
3. clarification/status/recovery in Chat；
4. supporting overlays 暂时放 secondary workflow details if not migrated；
5. hidden attention 不影响 owner edit；
6. mobile 给等价 status access；
7. update AI-8131 gate matrix。

**Acceptance:** 用户完整创建 Goal 的过程中不需要看到大型“AI 工作台”。

**Dependencies:** AIC-2005。

---

## AIC-3001 — Migrate Task / Knowledge clarification into Chat

**Goal:** 将 Goal reference slice 扩展到另外两个 durable workflow。

**Why now:** final workflow surface retirement prerequisite。

**Scope:** Task / Knowledge clarification only；不顺带重写 owner editor。

**Implementation:** mirror Goal routing/persistence rules, preserve each workflow’s own schema and native owner UI。

**Acceptance:** Task/Knowledge 用户也不需要 workflow textarea 回答问题。

**Dependencies:** Goal slice accepted。

---

## AIC-3002 — Replace Goal supporting Task/Knowledge overlays

**Goal:** 退休 Goal workflow panel 中剩余的 supporting Task/Knowledge business-like overlay。

**Decision to freeze before implementation:**

优先比较两种方案：

1. Chat inline proposal summary + “Open Task/Knowledge” owner action；
2. workflow sequentially opens owner-native Task/Knowledge review。

不得恢复 AI-owned Task/Knowledge editor。

**Acceptance:** supporting proposal 可 review/revise/recover，且 owner mutation 仍只走 native owner contract。

**Dependencies:** AIC-3001。

---

## AIC-3003 — Re-evaluate and retire `BusinessPanel.workflow`

**Goal:** 所有 AI-8131 retention gates 有 replacement 后物理退休独立 workflow surface。

**Implementation:**

1. update gate matrix；
2. prove zero remaining owner or context-only required responsibility；
3. delete shell workflow surface；
4. delete obsolete context panels/styles/tests/storage；
5. update governance positive/negative locks；
6. migration map all deep/internal references。

**Acceptance:** no feature loss in clarification/recovery/mobile/attention/restore/diagnostics。

**Dependencies:** AIC-3001/3002 + shell replacement evidence。

---

## AIC-4001 — Batch streaming deltas and stop token-level full rerender

**Goal:** 长回复 streaming 时主线程保持可交互。

**Scope:** `useAIChatSession`, `AIMessageContent`, scroll behavior。

**Implementation:**

1. non-reactive delta buffer；
2. bounded flush cadence；
3. throttle Markdown parse while generating；
4. terminal full safe render；
5. near-bottom auto-scroll；
6. stream scroll uses non-smooth path；
7. manual scroll up suspends auto-follow。

**Acceptance:** CPU throttling 下 input/focus/stop 响应稳定。

**Dependencies:** P0 runtime correctness可并行后合入。

---

## AIC-4002 — Add Assistant long-turn observability and performance acceptance

**Goal:** 后续能区分 provider latency、tool wait、approval wait、render jank。

**Scope:** existing `AIExecutionRecord` + frontend/browser metrics where appropriate。

**Metrics:**

```text
turn total latency
first activity / first token
provider inference segments if available
tool started/completed duration
approval wait duration
cancel reason
render/update cadence
long task count in browser perf test
```

不得把 raw prompt/tool sensitive payload 写进 telemetry。

**Acceptance:** 再出现 120s turn 时，能够明确回答它在 provider、tool、approval、transport 哪个阶段。

**Dependencies:** AIC-1102。

---

## AIC-5001 — Add external research evidence to Goal Planner (optional)

**Goal:** Goal Planner 可在用户允许/产品策略允许时检索公开资料辅助规划。

**Why later:** 当前 P0 全部与 Research 无关。

**Protected contracts:** evidence trust, citation, token budget, no owner truth override。

**Acceptance:** external failure 不阻塞 Goal workflow；planner 能区分 user/owner/knowledge/web provenance。

**Dependencies:** Phase 2/4 stable。

---

# 9. Dependency order

```text
Phase 0 characterization
   │
   ├───────────────┐
   ▼               ▼
AIC-1001        AIC-1101
   │               │
   ▼               ▼
AIC-1002        AIC-1102
                   │
                   ▼
                AIC-1103
                   │
          ┌────────┴────────┐
          ▼                 ▼
       AIC-1201          AIC-4002

AIC-1001 + AIC-1002
          │
          ▼
       AIC-2001
          │
          ▼
       AIC-2002
          │
          ▼
       AIC-2003
          │
          ▼
       AIC-2004
          │
          ▼
       AIC-2005
          │
          ▼
       AIC-2101
          │
          ▼
       AIC-3001
          │
          ▼
       AIC-3002
          │
          ▼
       AIC-3003

AIC-4001 can start after Phase 0,
but merge only after P0 runtime behavior is stable.

AIC-5001 is independent follow-up after Goal closure.
```

---

# 10. Verification matrix

## 10.1 Unit / contract

| Area           | Required proof                                                             |
| -------------- | -------------------------------------------------------------------------- |
| History        | real `signal/user` -> product user projection                              |
| History        | internal signal is not shown as user                                       |
| Chat session   | stale history cannot delete current user turn                              |
| Tool policy    | read tools allow; high-impact tools ask; unknown policy fail closed        |
| Runtime events | tool activity/approval schema and sequence                                 |
| Cancel         | stop releases inference/tool/approval wait                                 |
| Goal workflow  | clarification natural response persists and resumes                        |
| Goal workflow  | partial candidate draft persists across suspension/restore                 |
| Native Goal    | partial draft opens/patches GoalDialog                                     |
| Native Goal    | manual edit survives re-plan                                               |
| Approve        | owner submit before workflow approve; retry idempotent                     |
| UI             | composer editable while run active                                         |
| UI             | Goal path does not render duplicate Goal form/workbench as primary surface |

## 10.2 Focused commands

Known Nx targets：

```bash
pnpm nx run ai:test
pnpm nx run contracts:test
pnpm nx run app-vue:test

pnpm nx run ai:typecheck
pnpm nx run contracts:typecheck
pnpm nx run app-vue:typecheck
```

实现 ticket 应优先运行对应 focused Vitest files，再扩大到 package test；不得只跑 full suite 而跳过 focused regression。

## 10.3 Governance / hygiene

每个合并批次至少：

```bash
pnpm test:inventory:check
pnpm nx run memoflow:governance-check
git diff --check
```

并对 changed files 运行现有 ESLint / Prettier gate。

## 10.4 Web E2E reference journeys

至少增加/重写以下 browser journey：

### Journey G1 — Goal progressive creation

```text
self-register/login
→ AI chat
→ “帮我创建一个考研目标，我要备战今年考研”
→ Goal native create dialog opens
→ partial name/description visible
→ chat asks clarification
→ answer “目标院校北京大学” in main composer
→ same workflow continues
→ native draft updates
→ manual edit one field
→ confirm/save
→ exactly one Goal exists
```

### Journey G2 — Refresh during clarification

```text
start goal.create
→ clarification suspended + partial GoalDialog
→ page refresh
→ workflow restore
→ pending question visible
→ native GoalDialog restored
→ continue answer
```

### Journey G3 — Validation failure

```text
AI draft
→ user makes native field invalid
→ confirm
→ owner validation blocks
→ no workflow approve
→ no Goal created
```

### Journey G4 — Read tool no approval

```text
“我的笔记里有类似 Figma 的设计工具吗”
→ knowledge_search activity
→ no approval card
→ result/empty result terminal
→ bounded latency
```

### Journey G5 — Write tool approval

```text
request approval-required mutation
→ inline approval card
→ approve/decline
→ explicit terminal behavior
```

### Journey G6 — Stop long activity

```text
active provider/tool operation
→ Stop
→ runtime cancel
→ no parked approval
→ composer returns to ready
```

## 10.5 Performance acceptance

Browser performance test at normal and 4x CPU throttle：

- textarea input/focus remains responsive while streaming；
- Stop action remains responsive；
- no repeated smooth-scroll animation storm；
- 生成较长 Markdown 时不出现连续明显 long-task burst；
- repeated send/stop 不产生持续 heap growth；
- activity/tool wait 不被误记为 model inference latency。

不在计划阶段硬写一个未经 baseline 测量的绝对 ms 阈值；AIC-4002 先采 current baseline，再冻结 target threshold。

---

# 11. Rollout strategy

## 11.1 Branching

建议按 repair pass / ticket group 使用独立 worktree，主集成分支只做 review/merge control plane。

优先小批次：

```text
Batch A — History + permission P0
Batch B — Tool events + approval UI + composer
Batch C — Goal turn routing + clarification
Batch D — Progressive native draft + submit closure
Batch E — Goal workbench demotion
Batch F — Performance
Batch G — Task/Knowledge + final workflow surface retirement
```

不建议把 A–G 压成一个超大 PR。

## 11.2 Staging

每个 vertical batch：

```text
focused tests
→ package tests/typecheck
→ governance/inventory
→ Required Web Flow
→ targeted real-browser validation on Dev
→ Staging deploy only after CI green
```

Production / Release 不属于本计划默认动作。

## 11.3 Feature flags

优先不新增长期 feature flag。

如果 Goal turn routing 需要短期 A/B containment，可使用 development/staging-only gate，但 acceptance 后必须删除；不保留“双 orchestration”长期兼容路径。

---

# 12. Risk ledger

| Risk                                                                      | Impact                          | Containment                                                                     |
| ------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------- |
| signal projector误投影 internal signal                                    | Chat 泄露内部消息               | strict `metadata.signal.type === user` gate + fixture tests                     |
| read tool policy过度放宽                                                  | 越权工具无审批                  | allowlist manifest，unknown fail closed                                         |
| approval出现双重 gate                                                     | 用户重复批准                    | one canonical policy helper，characterize `requireApproval` + controller policy |
| active workflow 抢走无关聊天                                              | 用户不能临时问别的问题          | 明确 pause/leave workflow UX；不静默 exit                                       |
| partial draft 覆盖手工编辑                                                | 数据/体验回归                   | live native reconcile before planner + revision guard                           |
| Goal create turn 不跑 Assistant 后 conversation 少一条 AI acknowledgement | UI 感觉“没反应”                 | workflow status/clarification 立即投影到 Chat，不额外跑模型                     |
| workflow schema direct cutover导致旧 dev snapshot restore失败             | Dev 恢复错误                    | reset/reseed；unknown snapshot fail closed                                      |
| workbench过早删除                                                         | Task/Knowledge/recovery功能缺失 | Goal-only demotion first，final delete受 gate matrix约束                        |
| streaming batch 导致文本视觉延迟                                          | typing feel变差                 | bounded 50–100ms / rAF，实机 perf acceptance                                    |
| Web Research扩大 scope                                                    | 延误 P0修复                     | Phase 5 explicitly optional                                                     |

---

# 13. Open decisions to freeze during implementation

这些不是当前需要向产品重新提问的阻塞项，但对应 ticket 开工时必须给出代码证据并冻结：

1. **Routine pause/resume/end controller permission**：保留当前无 explicit approval 的产品策略，还是统一归入 execute/ask？先 characterization，不擅自改变。
2. **Clarification canonical payload**：直接把 durable round 改成 `questions + response`，还是短期兼容 `answers[]`？倾向 direct cutover。
3. **Current-turn persistence seam**：explicit workflow turn 的 user message由一个 shared history append helper 记录，还是由 workflow runtime start 同事务记录？选择最小、Mastra-native、可测试的 owner，禁止浏览器-only history。
4. **Supporting Task/Knowledge review replacement**：inline proposal card vs sequential owner-native review。Goal core closure后再冻结。
5. **Final workflow diagnostics location**：developer/debug surface vs Chat expandable details。不能因为 diagnostics 而保留大型普通用户 workbench。
6. **Unknown tool default policy**：`deny` vs `ask`。产品工具建议 fail closed `deny`；若 runtime 基础设施要求 ask，需要明确例外与测试。

---

# 14. Review and repair protocol

每个 batch 完成后按五层审查：

## 14.1 Contract correctness

检查：

- history role projection；
- event schema；
- tool permission；
- workflow resume/snapshot；
- revision/idempotency；
- owner boundary。

## 14.2 Vertical completeness

沿真实路径逐层核对：

```text
Composer
→ turn router
→ API/runtime
→ Mastra memory/workflow
→ planner/tool
→ suspension/event
→ Chat projection
→ native Goal surface
→ owner submit
→ receipt/result
```

任何层丢数据都不能靠“UI看起来正常”关闭 ticket。

## 14.3 Behavioral completeness

至少覆盖：

- create；
- clarification；
- manual edit；
- revise；
- refresh/restore；
- cancel；
- stop；
- provider failure；
- approval decline；
- owner validation failure；
- approve transport retry；
- empty/no evidence；
- narrow/mobile access。

## 14.4 Engineering quality

检查：

- one owner per transition；
- no duplicate form/editor；
- no DOM automation；
- no raw sensitive telemetry；
- bounded retries；
- no debug leftovers；
- no unrelated formatting churn。

## 14.5 Finding severity

```text
P0 blocker — primary path broken / data loss / hidden indefinite wait / unsafe permission
P1 major   — required behavior missing / duplicate orchestration / owner boundary bypass
P2 normal  — robustness / performance / observability / consistency
P3 polish  — non-blocking visual refinement
```

合并前 P0/P1 必须为 0；defer 必须写明确理由与后续 ticket。

---

# 15. Definition of Done

本计划的核心部分只有在以下全部满足时才可称为完成：

## Runtime

- [ ] AgentController `signal/user` 被正确投影；
- [ ] user message 不再发送后消失；
- [ ] post-turn 不再 destructive stale-history replace；
- [ ] read tools 不再隐式 approval park；
- [ ] true write approval 有 typed event + UI + decision；
- [ ] stop/cancel 能解除所有 active/parked state；
- [ ] composer streaming 时可编辑，不显示 wait cursor。

## Goal workflow

- [ ] explicit Goal create 不再先跑 Generic Assistant；
- [ ] user turn 被 canonical persist；
- [ ] `goal.create` 第一轮真正建立 durable run；
- [ ] AI 主动在 Chat 提 clarification；
- [ ] 用户从主 Composer 回答；
- [ ] clarification 可携带/更新 partial Goal draft；
- [ ] GoalDialog 自动打开并预填已知信息；
- [ ] manual native edits survive re-plan；
- [ ] owner submit/validation 保持 canonical；
- [ ] approve/retry 不重复创建；
- [ ] Chat success 来自 typed workflow outcome；
- [ ] Goal 正常路径不依赖大型 AI workflow workbench。

## Performance / UX

- [ ] tool/activity phase 可见；
- [ ] long response 不 token-level full rerender/scroll storm；
- [ ] 4x CPU throttle 下输入/Stop 可交互；
- [ ] long-turn observability 能区分 provider/tool/approval/transport。

## Retirement

- [ ] Goal-specific workflow surface retention gate 已关闭或明确剩余项；
- [ ] Task/Knowledge migration 有独立验收；
- [ ] final `BusinessPanel.workflow` 删除前 gate matrix 全绿；
- [ ] governance 阻止 AI-owned Goal/Task/Knowledge editor 回归。

## Validation

- [ ] focused unit/contract tests green；
- [ ] `ai:test` / `contracts:test` / `app-vue:test` relevant scope green；
- [ ] relevant typecheck green；
- [ ] test inventory green；
- [ ] full governance green；
- [ ] targeted Web E2E green；
- [ ] Staging real-browser acceptance green；
- [ ] no Production/Release side effect unless separately approved。

---

# 16. Recommended first implementation batch

不要从 Goal UI 开始。

第一批应只解决最底层 P0：

```text
AIC-1001 History signal projection
        ↓
AIC-1002 No destructive post-turn replace
        +
AIC-1101 Explicit tool permission policy
```

原因：

- 这三项本身就能恢复用户消息稳定性；
- 可以让 Goal start gate 恢复真实输入；
- 可以消除当前最明显的 75–138s hidden tool wait；
- blast radius 小，容易独立 review；
- 修完后再实施 Goal single-owner routing，调试信号会更可信。

第二批再进入：

```text
AIC-1102/1103 tool protocol + UI
AIC-1201 composer
```

第三批才进入：

```text
AIC-2001 → AIC-2005 Goal vertical slice
```

这种顺序比直接改 `AIGoalWorkflowPanel` 更安全，也更符合当前根因证据。

## Batch A implementation evidence (2026-10-04; bounded scope)

AIC-1001, AIC-1002 and AIC-1101 are implemented locally; this is **not** overall
plan completion or live GCP acceptance. No tool-event/approval UI, composer,
Goal routing/native draft, streaming performance or workflow-surface retirement
work is included.

- Canonical history projects only native `signal` rows with
  `content.metadata.signal.type === 'user'`; other signals fail closed. Mastra
  remains transcript authority; owner-thread checks and attachment redaction remain.
- Successful turns retain SSE/local user and completed assistant projection;
  post-turn refresh fetches usage only. Explicit reload/reselect replaces the
  transcript from authoritative history.
- One MemoFlow tool-policy manifest classifies all fifteen product tools.
  Six read tools auto-allow; six high-impact mutation tools ask and require
  approval; pause/resume/end preserve explicit no-approval intent. Unknown and
  prototype-key names deny; unclassified registrations fail construction.
  Session policy initialization resets only permission rules/yolo before turns,
  including cached sessions; owner authorization is unchanged.

Regression evidence: focused history/tool/runtime tests 42 passed; chat session
13 passed. Uncached `ai:test`: 447 tests / 89 files passed; uncached
`app-vue:test`: 1712 tests / 274 files passed. Both package typecheck targets,
`pnpm test:inventory:check`, governance check and changed-file lint passed.
Red/green, installed Mastra precedence and exact command/log evidence are recorded
in the managed Batch A artifacts (`history.md`, `live-turn.md`, `tool-policy.md`,
`validation.md`), not in a second runtime store. Live provider/GCP validation
remains outstanding; later plan batches remain unimplemented.
