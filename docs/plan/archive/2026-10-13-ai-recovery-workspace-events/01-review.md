---
tags: [plan, review, ai, goal, events]
created: 2026-10-13T00:00:00Z
updated: 2026-10-13T00:00:00Z
description: 基于 PR 451 分支代码核验 AI 失败恢复和事件同步建议
---

# 代码核验与架构评审

核验基线：`18210ad0f9f`，当前分支 `feat/goal-pane-embedded-editor-20261013`。结论：采纳轻量中断、原生草稿保留、精确事件同步与统一 Workspace 通道方向；实施必须补齐持久化边界、owner 写入不确定性及跨进程恢复。下述均为源码判断，未重放用户截图对应的 API 日志。

## 三条请求链

Conversation 由 `useConversationProjection.ts` 管理。本地 `upsertConversation()` 与操作触发的 `loadConversationList()` 已存在，没有发现固定周期列表轮询。`pendingListChanges` 已有本地 `mutationRevision` 防止请求期间的更新被覆盖，但清除 pending 时仍比较服务端 `updatedAt` 与可能来自 `Date.now()` 的本地时间。这不是跨客户端服务端修订版本。

Attention 的 `useDurableConversationAttention.ts` 明确通过 `setInterval` 每 5 秒刷新。除此以外，挂载、列表变化、前台恢复及发送结束也会触发读取。必须保留 `revision/seenRevision` 语义：确认第 N 版不能隐藏第 N+1 版。

Goal 的 `useAIGoalWorkflow.ts` 在运行期间约每秒读取一次，读取失败时退避至最多 12 秒。`useAIChatView.ts` 同时把 active run 交给 `useAIWorkflowReconciliation.ts`，后者 500ms 起步、增长至 2 秒；它通常只投影终止/暂停结果，不投影运行中字段。两者确有对同一个 Goal running run 重复读取的可能。

`packages/ai/src/client/runtime-workflow.ts` 的 HTTP 和 IPC client 都会在 `resume()` 返回 running 后调用 `awaitStableWorkflowRun()`；这是有条件的等待轮询，不是第三个永远运行的定时器。请求数量应以运行类型、resume 响应和实测为准，不能简单把三个频率永久相加。

Goal 草稿重命名目前是前端在草稿路径调用 `maybeRenameCurrentConversation()`；没有发现单独的“后台标题生成 + 列表定时等待”链路。

## 失败会销毁原生编辑面

`useAIGoalWorkflow.projectRun()` 在失去可投影草稿、且非 running live 状态时调用 `retireNativeReview()`。`useGoalNativeReviewCoordinator.retireNativeReview()` 对 AI session 执行 `requestCancel()`，因此失败可以连带关闭右侧表单。

`GoalDialog.vue` 的 `releaseControl()` 只释放 capability 和 `editingBlocked`，不会清除 `submitCoordinator/cancelCoordinator/coordinated`。把 `requestCancel()` 原样替换成 `releaseControl()` 会保留失效 workflow 的保存路径。

必须区分两种交接：

- 审核期间主动接手：用户编辑，仍走相同 revision 的原生 owner Save + durable approve。现有 `handoffGoalNativeReview()` 有意保留协调关系。
- 规划失败后的脱离：旧 run 已终止，用户编辑及保存应完全回到原生 Goal owner，旧协调关系必须解除。

不能改变 `releaseControl()` 的既有语义而破坏第一种交接。应新增一个原子、显式的失效 workflow 脱离操作。

另一个关闭入口是 `useGoalSurfaceLease()` 的失权回调：它当前也会取消未保存的 AI 表单。租约丢失不等于 run 已失败；不能直接恢复自由 create，否则可能与另一窗口的保存重复。S0 只处理已确认 failed，后续需要保留失权草稿为只读状态并先核验 owner/authority，才能兑现所有非破坏性 AI 中断都不清除内容的完整目标。

## 持久化和事件能力

`POST /ai/runtime/assistant/sse` 承载普通 Assistant 流；Goal `startDetached()` 是独立 durable Workflow，不自动复用该流。

Notification 的 `api/routes.ts` 已实现身份限定、复合 cursor、历史分页、先订阅再读取历史、缓冲实时事件和 operation 去重。它的 `notification-sse.adapter.ts` 实时订阅仍依赖本进程 observer；历史依据 notification delivery receipts。它提供可靠恢复的参考和可复用部件，不能据此断言已有跨节点广播，也不能把 notification receipt 当成 Workspace 的通用日志。

当前 Goal 已有模型业务动作 journal 和 `publishRunningGoalActions()`。它经过 schema 校验，在 Mastra 的 top-level preview 上做条件更新，不覆写 engine-owned snapshot。后续事件必须覆盖每次持久化 preview、暂停、终止、resume、cancel，而不只在 HTTP start/resume handler 返回时广播。

Mastra 在 Web 用 Postgres store，在 Desktop 用 LibSQL store；正式 Goal/Attention 另有 owner 存储。跨库“写快照后发事件”仍有进程崩溃丢消息窗口。不能把它描述成事务 outbox，除非已证明同一提交边界或持久化恢复链。

## 采纳与修正

统一 Workspace 通道是目标，按仓库真实 owner 试点规则，先用 Goal 状态通知验证，再用 Attention 验证，最后提取稳定重复的基础设施。初期不新增 Goal/Task/Knowledge 各自的公共 SSE；预览动作属于 AI Workflow projection，正式 Goal 仍由 Goal owner 创建。

事件至少包含事件 ID、资源 ID、身份隔离后的作用域、资源修订和必要安全状态。列表顺序仍可用服务端时间，覆盖/去重使用 revision。服务端草稿 revision、live action sequence、流 cursor、lease fence、资源 revision 分别解决不同问题，禁止混用。

失败 UI 允许表达“本轮已停止”，但后台仍真实记录 failed。读取超时不能伪装为 failed。限额提示来自 adapter 的结构化安全分类，不能根据 UI 解析 provider 原文。无法确定配额原因时使用中性文案，不承诺 30 秒一定恢复。

SSE 心跳、连接重试和 lease 续租不等于状态轮询；这些仍有必要。客户端正常收到事件后才停止状态轮询；断线校准必须有明确触发与请求上限。

当前打开草稿保护先做，刷新恢复单独实施。草稿检查点不得隐式创建正式 Goal。已经进入 owner 保存、存在 pending attempt 或已有 Goal receipt 时，不得恢复自由 create，以免重复持久化。
