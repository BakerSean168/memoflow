---
tags: [plan, active]
description: Ask User 与 Goal BusinessPanel owner 操作纵向切片
created: 2026-10-12T00:00:00Z
updated: 2026-10-12T07:00:00Z
---

# Ask User + Goal Business Surface

## 边界

唯一 writer：`feat/agent-ask-user-business-surface`，独立 worktree，base `1e79cbbadc4`。
不修改原 main worktree，不做数据库 push/reset，不合并、不部署。

## 已检查的 owner / 协议

- `GoalDialog` 是 native draft / CreateGoalSchema / owner 保存入口；现有语义 session patch 未逐操作校验。
- `useGoalNativeSurface` 当前导航 `?dialog=goal`，导致 global modal；GoalModuleLayout 注册 owner handle。
- Goal Workflow lifecycle 通过 Mastra `suspend` / `resume`，已有 clarification/review/recovery、确定性 Goal/KR identities 与 owner-first replay。
- 实际安装 SDK `@mastra/core@1.70.0` 内置 `askUserTool`：question/options/selectionMode；选项的 label 就是答复值，默认 single_select，multi_select 答复为 string[]。`agent.suspend` 保存 run，`SessionSuspensions` 绑定 run/thread/resource/toolCallId，`session.respondToToolSuspension({resumeData, toolCallId, requestContext})` 恢复。SDK resumeSchema 只检查 string/string[]，不验证选项 membership，MemoFlow 边界仍需严格答案校验。
- 现有 `AssistantTurnSession` whitelist 拒绝 ask_user，`agent_end:suspended` 会 abort/fail。其 activeRuns 是流生命周期内的内存 map，不提供刷新后恢复入口；history 投影也尚未提供结构化 question 恢复。因此本切片保留禁用项，未创建替代阻塞引擎、未假称原生 ask_user 已贯通。

## 实施顺序与验收

1. native Goal form 增加 panel 承载，复用完全相同 owner 表单与保存路径，手动 modal 不变。
2. 业务表面独占控制：冲突检查不可调用 dirty-confirm 自动覆盖；显式继续再次检查；版本 token 与同步 owner 检查；取消/退出释放。
3. Chat 立即显示真实请求状态；review save/manual handoff 两个选项；保存仍用原生 owner 校验与现有 durable approve/replay。
4. 定向 tests/typecheck/lint，记录真实结果；SDK native ask_user 与真正生成期间增量业务命令若未闭合则明确标记未完成，不伪称交付。

## 必须保持的 invariants

- ROOT/OWNER：semantic patch 在原生 owner 校验后一次性提交，invalid patch 不产生部分变更。
- REPLAY/IDENTITY：最终保存用现有 run/revision deterministic ids、authenticated owner service；重复投影不覆盖用户 handoff 草稿。
- PARITY：panel/modal 共用一个表单实现，不复制保存业务逻辑。
- CONTROL：已有 open/dirty/busy 表面不接管，继续时重新检查；AI 持有期间用户 mutation 与导航均在业务逻辑拒绝。

## 实际完成范围（部分交付，不可按完整功能验收）

- `GoalFormFrame` 在右侧 section 承载完全相同 `GoalDialog` owner 表单；路由 `goalForm=create` 与 manual `dialog=goal` 分开，无 global overlay/teleport。原手动 modal 与原生保存业务路径保留。
- Shell 的 transient owner/version capability + native session 的不可重用 Symbol capability：AI 期间用户语义 mutation/Save 和 shell/router navigation 被拒绝。release/handoff/cancel/owner关闭/shell disposal 清理控制；刷新不持久化锁，须通过真实 owner 安全检查重开。
- 已有 Goal 表单（包括空白表单）、active dirty/busy 状态先询问，不弹 dirty-confirm 自动覆盖；每次继续再次检查。已有 run/revision durable suspension 是权威，Chat 选项是本地 projection，不是新的 suspend engine。
- 草稿完成后 Chat 提供显式 Save 或 manual handoff；未点击保存不会创建 Goal。Save 使用原 `requestSubmit` + deterministic owner ids + durable approve。manual handoff 保留当前未提交字段，后续 native Save 仍协调 workflow；为避免 coordinator 被销毁，接手期间须先保存或取消表单再切换 AI 会话。
- AI capability patch 的 schema/status/time/reminder/KR 验证在 owner mutation 前原子 preflight；invalid batch 不产生半修改。
- 第一时间显示真实请求、运行/答复处理/暂停/终止状态；只有原生 patch 成功后才记录带 run/revision 的本地操作回执，重复 projection 不再填第二遍。现阶段实际是一次 batch patch，不伪装成逐 token 填写。
- Workflow turn 准备在 conversation 创建之前同步占用发送状态，拒绝 double-send；Stop 的 epoch 检查覆盖准备期和 late start，不会在取消后继续打开表单；取消结果未经 server 确认不显示为已取消。
- 最终自审补充：KeepAlive panel presentation 捕获在 active owner，避免切 Tab 造成草稿 reset；native opening 每个 async preflight 后再次检查 clean 状态，不能落入普通 dirty-confirm 导航路径。
- AgentController 原生 `ask_user` 纵向切片：注册 SDK `askUserTool` 并暴露可用工具清单；`tool_suspended` 翻译为 `assistant.ask_user.required`；答复合同 `AssistantRuntimeToolAnswerCommandSchema`（`action: 'answer' | 'cancel'`）+ `assistant.ask_user.resolved`；HTTP `/assistant/answer`、`/assistant/ask-user/pending` 与 IPC 通道；运行中会话经 `session.respondToToolSuspension` 恢复，持久化/重启后经 `agent.listSuspendedRuns()` 定位 + `agent.resumeStream()` 恢复；前端 ask-user 卡片、`answerAskUser` / `cancelAskUser` 与 `assistant.run.started` 后的 suspension 恢复。

## 尚未完成 / 未验证

1. Goal create workflow 的 clarification/review 仍走 Mastra workflow `suspend`（`clarification_required` / `goal_draft_review`），尚未迁移到 SDK `ask_user` tool。SDK 原生 `ask_user` 能力本身已接通（见“实际完成范围”），两者是不同机制，不能互相替代。
2. 模型生成期间逐条业务命令、可持久回放的动作 journal。当前 planner 仍返回整份 draft，再真实 batch patch；仅改变承载与控制不能当成完成核心渐进式体验。
3. 跨窗口/设备 durable lease、用户手动编辑草稿的刷新持久化。当前 scope 是单个 mounted shell；刷新后锁释放，workflow draft 从 server 恢复，人工未同步字段没有新增持久化保障。
4. 所有 Task/Note/Routine/Schedule 活跃 editor 的通用 conflict publication。Shell dirty/busy 导航控制通用，但 owner capability 当前仅 Goal。
5. 真实鉴权 API + PG + provider + Chat 整条浏览器验收、local prod-like Docker、exact-head CI。未访问或迁移数据库，也未部署。

## 验证记录

依赖：`pnpm install --frozen-lockfile` 成功；workspace package 解析指向本 worktree，未链接原 main 编译产物；约 19 GiB 磁盘余量。

- RED：原生 Goal 新增 panel/control 两测试失败（panel 不存在、claimControl 缺失），原有 40 tests 通过。
- `NX_DAEMON=false pnpm nx run app-vue:test -- src/modules/ai src/modules/goal src/layouts/shell src/locales/i18n-key-completeness.spec.ts`：89 files / 834 tests 通过（含真正 owner/router 联合测试、原 manual Goal、冲突重检、manual handoff、取消 late start、并发保存、stale handle、host disposal）。
- `NX_DAEMON=false pnpm nx run ai:test -- src/server/mastra/workflows/goal-create.workflow.spec.ts src/server/mastra/workflows/apply-goal-plan.service.spec.ts src/server/mastra/runtime/mastra-workflow.runtime.spec.ts`：3 files / 60 tests 通过，使用隔离 LibSQL files，不修改 PG schema。
- `NX_DAEMON=false pnpm nx run web:e2e -- --config playwright.goal-reference.config.ts goal-business-panel.spec.ts`：Chromium 2/2 通过；真实 owner Vue components + deterministic service doubles，**不是**完整 Chat/provider/PG E2E。测试证明右侧无 modal、真实 command 字段更新、AI 占用禁止编辑/保存、handoff 不创建 Goal、手动保存一次。
- `NX_DAEMON=false pnpm nx run app-vue:typecheck`：通过（独立工作树 dependency builds）。
- `NX_DAEMON=false pnpm nx run app-vue:lint`：通过，6 条既有 warning，无 error；随后 `pnpm nx run-many -t lint --projects=app-vue,web` 也通过。
- `NX_DAEMON=false pnpm nx run memoflow:governance-check`：通过；新增 reference E2E 已登记 `tools/test-system-v2/e2e-ownership.json` 并通过 `pnpm test:inventory` 更新 inventory。
- 最后补充 preparation/Stop/异步 takeover race 三文件定向测试：62/62 通过。广域 exact-head 复验在提交后执行，最终数量以 PR 验证回报为准。
- 初次全 app-vue test 在 200 秒 timeout；随后修正新增接口涉及的 mock 与 source assertion，再跑上述 89 文件范围全绿。未宣称整个 app-vue suite 通过。

最终复验：exact-head CI（run 38199456950 @ `5f8fa09d5ab`）19/19 job 全绿（含 Unit Tests、Typecheck、Web Flow Shard 1–4/4、Validate Oracle、Web Flow Oracle、Governance Oracle 等）。此前两次红灯的可复现失败均由本切片修复，不再有未分类失败。

## ChatGPT 接手 · Ask User 续流闭环检查点（2026-10-12）

继续在原 feat/agent-ask-user-business-surface 独立 worktree 实施，不改 main checkout。fc5f80e07fc 的历史 CI 19/19 通过，仅证明旧 HEAD，不能代替本批 CI。

- 修正 HTTP /assistant/answer 与 Desktop IPC 对异步 answerToolSuspension 的 Promise 错判；两个传输入口显式 await，HTTP 错误严格映射 public transport code，避免泄漏 provider 凭据。
- Mastra resumeStream 返回的是 MastraModelOutput；须等待读取其 text 完成，再确认答复或取消，随后刷新权威消息历史显示后续 Assistant 内容。
- 重新进入会话时，除了 Mastra history，还读取 listAskUserSuspensions，把持久待答问题恢复为 Chat 卡片；不用依赖旧组件加载状态。成功回答后刷新历史；不伪造模型输出。
- 取消同样校验 runId / threadId / resourceId / toolCallId，拒绝外部用户或会话；用 resumedRuns 避免同进程重复恢复。
- RED→GREEN 验证：HTTP+IPC 33/33，Chat Composables 31/31，Mastra Runtime 39/39，app-vue Nx typecheck（含依赖包构建）成功。更全面的 exact-head CI 以本批提交后 GitHub 实际结果为准。
- 注意：本批是「恢复生成完成，再读取历史」，并非续流期间逐 token 送达；真实 provider/API/PG 浏览器全链路、跨进程幂等性尚未验收。

### 后续主任务（尚未完成）

1. **P1：**模型生成过程中调用真实 Goal 语义业务工具并同步右侧表单，必须在 owner 授权、校验与持久化 Action Journal 下实现；现有完整 GoalPlanDraft + batch patch 仍然不是增量工具。
2. **P2：**跨窗口/设备 durable lease、人工接手后禁止覆盖、持久恢复及真实运行环境 E2E。
3. 每次检查点提交并 push 到原 Draft PR #449，核对该 HEAD CI；P1/P2 未验收不得合并或部署。

## ChatGPT 接手 · Goal 模型业务动作检查点（2026-10-12）

此阶段交付的是 **模型工具调用驱动的 Goal 草稿增量操作纵切**，而不是改变最终 Goal 保存入口，也不是把最终 JSON 草稿动画拆成几次 patch：

1. 为 goal.create 定义严格语义动作合同：goal.setName、goal.patchDescription、goal.setStart、goal.setTarget、goal.patchKeyResults，每次附带服务器绑定的 revision 和模型调用提供的 actionId；不得有 owner/save/persist 等可直接提交业务数据的工具。
2. Goal Planner 在有效的服务端 Workflow Action Sink 内注册五个 Mastra native tools；SDK 生成步骤上限按需要扩至 12，允许同一生成执行中多次调用工具后仍给出完整的结构化规划决策。没有 sink 时保留既有非工具规划方式。
3. Worker 每次工具调用经过 SDK 输入 schema、服务器身份+run+revision 校验、队列串行化、动作日志去重/冲突校验，在原 Mastra Workflow snapshot.value.liveActions 中持久化；工具回执为 staged，不创建 Goal。Action Journal 对同一 revision/actionId 幂等，跨 revision 可复用 actionId，严格检查 sequence。
4. projectGoalCreateRun 在验证 owner resourceId 后才投影 Action Journal；Workflow running 阶段即可通过既有 authenticated get API 读取已提交的增量动作。异常 journal fail-closed，不向其他 owner 暴露数据。
5. Chat 前端在模型运行期间定时读取权威 Workflow，按 sequence 应用真实语义动作到已 claim 的 GoalNativeEditSession，并追加动作回执；相同 run/revision/actionId 不重复 patch；遇到已有用户草稿不接管，先展示冲突，显式继续时重检。用户手动接手后不再执行后续 AI patch。终态仍走原有全量结构化 Draft 审查和明确 Save/Cancel/Manual handoff；跨旧 Run 的迟到轮询不得覆盖新 Run。
6. RED→GREEN：真实 LibSQL Workflow 状态持久化与服务端投影测试、模型工具声明和身份测试、模型多步骤调用选项测试、右侧 native owner 字段逐次更新、冲突/人工接手、运行中轮询/取消迟到竞态等测试。当前定向：AI 139+（后续 17 项 Planner 测试）、UI 49+（含 1 个取消竞态），lint 0 errors，AI/ Vue typecheck 通过。真正 exact-head CI 以推送后 GitHub 结果为准。

**仍未完成且不得混淆：**
- 没有使用真实生产 Provider 验证模型实际按预期调用五个工具并继续输出合法最终决策；不同 Provider 的 tool calling / structured output 兼容性需要单独 canary。
- 模型工具操作与 UI 刷新采用经验证的 durable action journal + 短轮询，而非逐 token SSE。
- **运行中可读事实的独立验收：**Mastra 的 `setState` 在 Workflow Step 尚未 yield 前仅更新其引擎状态；原实现的 snapshot.value.liveActions 此刻不可由另一请求读取，新增的真实 LibSQL 中途阻塞测试先 RED。现在通过版本限定的 transactional `WorkflowsStorage.updateWorkflowState` 只发布 top-level `goalLiveActions` 预览，CAS 仅允许 running 状态，不改引擎 `value/context/step graph`；读 API 在 running 期间选有效持久投影，完成/暂停后恢复以 `snapshot.value.liveActions` 为权威。PG 与 LibSQL 对该 update API 的实现均已检查为单事务并合并扩展字段。由于额外快照字段不是 SDK 公布的稳定 opts 类型，本功能依赖当前固定 Mastra 1.70.0 存储实现；升级 SDK 必须跑中途读写与终态防复活测试，不得无验收直接升级。
- 模拟 Provider 真实多步 Mastra Agent 验证了 tool-call → `goal_set_name` execute → structured final decision，区别于仅 mock generate 参数；不需要实际商业 Provider 额度。
- 安全测试覆盖存储 publisher 的非所有者及已挂起 Run 写入拒绝、run/revision/actionId 幂等、同一运行中的多调用排序、浏览器 late poll、用户草稿冲突/人工接手不覆盖。
- Goal Native Owner 仍是前端单工作区 capability；跨设备/窗口的服务端 durable lease、失效恢复/统一权限资源和 Action Journal 跨进程单写与原子 CAS 尚未落地。后续为 P2 安全硬化。
- Task/Note/Routine 等其他业务模块仍未复用；当前按用户要求先完成 Goal 纵切。
- 真实凭据/PG/全流程浏览器验收尚需独立环境，不得自动生产部署/合并。
