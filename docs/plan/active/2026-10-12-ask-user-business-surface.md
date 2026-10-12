---
tags: [plan, active]
description: Ask User 与 Goal BusinessPanel owner 操作纵向切片
created: 2026-10-12T00:00:00Z
updated: 2026-10-12T13:05:00Z
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

1. **P1：**真实 Mastra 语义 Goal 工具、运行中事务预览、原生 owner 逐字段更新已由 `cc7f73d4a28` 完成检查点，19/19 CI 全绿；生产 Provider 兼容性 canary 未做。
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
- Goal Native Owner 原本是前端单工作区 capability；P2 首个纵切增加 Web PostgreSQL 持久 Goal Run 租约和 Desktop profile-local SQLite 租约。**仅授权本地 AI 预览操作，未构成最终 Goal 写入事务级 fencing**；Action Journal 跨进程原子 CAS 仍未完成。
- Task/Note/Routine 等其他业务模块仍未复用；当前按用户要求先完成 Goal 纵切。
- 真实凭据/PG/全流程浏览器验收尚需独立环境，不得自动生产部署/合并。

## ChatGPT 接手 · Goal Surface 租约 P2 第 1 纵切（2026-10-12）

### 实施内容

- Web API 宿主的新增 `AiGoalSurfaceLease`（identityId + runId 唯一），持久 ownerToken、单调 fence、30 秒 TTL；Prisma 事务条件更新抢占，续租与释放必须匹配 `identityId/runId/token/fence`，释放不删行，不能复用旧 generation。新增**独立可审查 SQL migration**，**未在任何真实 PostgreSQL 上运行**。
- Desktop 单机同 profile 的 PowerSync SQLite 原子 `writeTransaction` 版本，创建本地 Lease 表；这只能互斥该本地 profile 下共享同一 SQLite 的窗口，**不宣称跨 Web/桌面设备共享租约**。
- Mastra 工作流 runtime 的 `goalSurfaceLease` 身份绑定：`runId` 属于调用者、必须是有效 Goal workflow；服务端 mint UUID token，不接受客户端 identity 注入。renew/release CAS；终态拒绝 claim/renew，但允许原持有者 release。心跳只取 owner 过滤后的 durable workflow snapshot，避免每 8 秒额外读一整份 usage summary。
- HTTP `/workflow/goal-surface-lease` 与 Desktop IPC `ai:runtime:workflow:goal-surface-lease` 共享严格请求/响应合同。客户端 `useGoalSurfaceLease` 定时续租、网络断开或 fence 失效时 fail-closed，刷新后必须重新 claim；异步旧 claim 结果不能复活已销毁的客户端。
- Goal Native Coordinator 在 AI 接管、每次增量业务操作/最终投影、保存前校验 lease。竞争失败展示 surface conflict，不创建/覆盖原生表单；失去 lease 关闭**仅 AI 控制的**预览，不自动丢弃人工 handoff 草稿，停止后续 AI patch/native 保存。

### 验证与剩余风险

- 本地真实 SQLite 测试：并发 claim 唯一获胜、过期换代 fence 递增、跨账号隔离、过时持有者不能 renew/release。
- Vue composable 测试：双窗口抢占、网络故障、过期失效、迟到 claim、运行中 Goal 工具不得在 `busy` 时改草稿、`lost` 不得继续保存；Desktop/HTTP 客户端 contract、Electron channel registry、Mastra owner runtime auth 另外定向覆盖。
- 独立目标测试：Goal UI 3 files / **55 tests**，AI 租约/Client/IPC 5 files / **32 tests**，新增 HTTP route 鉴权 2/2；Prisma schema validate、database:build、ai:build、API/Desktop typecheck、改动 ESLint、`memoflow:governance-check` 通过。测试清单已刷为 1,386 个文件。未进行真实 PostgreSQL 数据库写入，未使用真实供应商额度。
- 当前 P2 是受控租约检查点，**不包含最终 Domain Save 的原子 fencing**；本地通过仍必须检查提交后 exact-head CI，不能按 P2 完整完成验收。

**尚未实施／不能放宽的门槛：**

1. **最终持久 Goal 写入的同事务 fencing**：当前在调用 native Save 前校验服务器租约，但并非写入事务自身的原子 token+fence CAS；在网络或 TTL 边界仍有 TOCTOU。必须把 token/fence 与经认证的 domain 保存事务结合，或在提交时用服务端同事务 fencing gate；不做完不得称“完全防止跨设备旧持有者写入”。
2. 跨 Desktop 本地 Profile / Web 服务器共享的锁，不保证所有设备同一数据域；如需真正跨渠道同步控制，必须收敛身份与共享 authoritative lease/storage。
3. 手动 handoff 的未保存草稿跨设备/重启恢复不在本切片；现有前端 overlay 只恢复有限 supporting data，不当作持久 Native Goal draft。
4. 真实鉴权 API+PG migration+真实 Provider Chat / owner form/browser 整链路、崩溃后迁移接管及双设备并发验收未通过。不得自动 merge、部署或修改生产数据。

## ChatGPT 接手 · P2 CI 回归修复（2026-10-12）

在 5cd7f53f6d0 的 exact-head CI（run 38221646725）中，Typecheck、Build、Static Analysis、Governance 和其余三个 Web Flow Shard 已通过，但出现两个独立测试契约失配：

- Desktop compose-ai.spec.ts 未预期新注入的 AiGoalSurfaceLeasePowerSyncRepository。现改用真实类的 expect.any() 核验依赖，未删除任何组合契约字段。该文件的 5/5 单测已通过。Coverage 子流程同样因这条测试而失败，不是另一个业务错误。
- Web goal-workflow.spec.ts 仍 mock Mastra 工作流的 start/get/resume，却没有 mock 新增的 Goal Surface Lease 接口。由于产品端必须 fail-closed，这使 3 个 P0 浏览器用例找不到右侧原生表单。现于同一测试 fixture 中补齐 goal-surface-lease 的严格请求/响应 schema、只接受已知 Run、30 秒 TTL、单活 claim、renew/release 的 token + fence 校验，以及 release 后单调 fence。未禁用生产校验，也未放宽 UI 可见性断言。
- 为防止本地过期测试库执行数据丢失型 Prisma 变更，浏览器回归改用独立且新建的 PostgreSQL 测试数据库 memoflow_pr449_p2e2e_20261012，不修改共享 memoflow_test。
- 修复后本地验收：Desktop compose-ai.spec.ts **5/5**；隔离 PostgreSQL 下 Chromium Playwright 上一轮 3 个失败的 Goal P0 用例 **3/3**；修改文件 ESLint 0 错误。新提交 exact-head CI 尚待推送后验证，不宣称全绿。

此阶段只收敛测试环境与新租约合同的对齐，没有改变服务端最终 Goal 持久写入事务。此前 P2 留下的原子 domain fencing、跨宿主一致性、正式 PostgreSQL 环境复验仍是下一道门槛。

## 交接收口 · 事务级 fencing + E2E 对齐（2026-10-12）

前一实施线程（T3 `4d6b897f…c7cf1`，Pi/glm-5.3）在 `b6d1c396d02` 后中断（`run_interrupt_request`，无新提交），留下 16 个未提交文件的事务级 fencing WIP；本会话按用户决策接手为唯一 writer，其 WIP 全部保留并收口为 `212d24837b2`。

### 本批交付

- **事务内 fencing（前一线程 WIP，本会话逐行审查保留）**：`GoalWriteTransactionContext` 新增 `assertNativeAiLease`；Prisma 路径用零增量 `UPDATE … SET expires_at=expires_at … RETURNING` 行锁保持到提交，`clock_timestamp()` 在语句求值时判定过期；PowerSync 在同一串行 SQLite 写事务内校验。`CreateGoalUseCase` 无事务 runner 即 fail-closed CONFLICT；fenced 路径的幂等 replay 移入事务内；租约失配/过期在 owner mutation 前拒绝。租约行释放不删除，fence 代数不回滚。
- **客户端**：`useGoalSurfaceLease.currentGrant(runId)` 返回 detached grant snapshot 进入 `requestSubmit`；`CreateGoalSchema` 接受严格 `GoalNativeAiLease`（runId/token(uuid)/fence），`GoalAgentCreateSchema` 显式 omit（模型不能自供租约）。
- **E2E 对齐缺口（本会话发现并修复，前一线程报告已预告但未做）**：goal-workflow E2E 的 lease 端点是 mock（真实端点对不存在的 run fail-closed），但 `POST /api/v1/goals` 是 observe-only → 真实 API+PG；WIP 的围栏会使真实保存 CONFLICT。修复：新增 `apps/web/e2e/helpers/goalLeaseDbMirror.ts`，把 mock 决定的 claim/renew/release 逐条镜像写入 E2E API 所用的同一测试库（`TEST_DATABASE_URL` 解析链与 `ensureTestDatabase()` 完全一致、UTC 会话时区，行语义与 Prisma repo 逐行对齐），E2E 因此真实验证围栏而非绕过它；apps/web 新增 `pg@8.23.0` devDependency。

### 验证记录（本会话独立复验，不采信前一线程的自报）

- `api` compose-ai.spec **4/4**（b6d1c396d02 CI 红灯根因，WIP 内修复有效）；`goal:test` 全量通过；`goal:test:integration` 通过，`goal-native-ai-lease.integration.test.ts` **2/2**（真实 PG 行锁/过期/围栏）。本地共享 `memoflow_test` 曾落后 schema（缺 lease 表 + 两个旧唯一约束，查实 0 重复行），经用户显式同意以 `db push --accept-data-loss` 同步，仅新增性变更。
- app-vue 受影响 4 文件 **111/111**（超过前一线程自报的 90/90）；typecheck（app-vue/api/goal/contracts/ai/web 含依赖 33 任务）与 affected lint（41 projects）全过；`release-tooling.test.mjs` 本地 **11/11**——b6d1c396d02 CI 中的 AppImage 失败确认为并行负载 flaky，非真回归。
- E2E「Goal Agent」**3/3**（3.4m）：mock claim → DB 镜像 → 真实事务校验 → 真实 Goal 创建，链路首次真正验证 fenced create。其余 goal-workflow 用例不触及 lease 路径（goal-crud/core-product-phase-d 无 AI 原生评审，desktop e2e 无 goal 流），交 exact-head CI 覆盖。

### CI 状态与平台事故

推送 `212d24837b2` 后 GitHub Actions 平台 `degraded_performance`（githubstatus 确认）：push/PR 事件未产生 workflow run（第三方 App check-suite 正常收到事件、schedule 类 workflow 正常执行），close/reopen PR #449 已重试触发。exact-head CI 以平台恢复后实际结果为准，未宣称全绿。

### 剩余门槛（不变）

生产 Provider canary、跨设备/跨宿主租约一致性、真实凭据全链路验收、最终端到端验收与完整 exact-head CI 未完成；P1/P2 未验收不得合并或部署。


## Stage B-2 前置 · 合并 main attention 冲突检查点（2026-10-12）

T3 PR watch 报告 #449 与 main 冲突；在唯一写入 worktree 中合并 main `4ba621daab0`（#450 durable conversation attention），不触碰 main checkout。保留本分支 Ask User 答复/挂起读取接口与 main attention list/ack 接口、两套 IPC lifecycle fixture；Prisma source schema 同时保留 AiGoalSurfaceLease 与 AiConversationAttention，从合并后 schema 重新生成并归一化 client，不执行数据库迁移或 db push。测试清单重新生成，1,393 文件。

本地证据：AI 定向 5 文件 **101/101**；Chat/attention composables 4 文件 **42/42**；API compose-ai **4/4**；Desktop compose-ai **5/5**；affected lint **41 projects** 通过。ai/app-vue/api/contracts/web/desktop typecheck **6 projects + 32 dependency tasks** 全部通过；`memoflow:governance-check` 通过。

基线 `d40092d1e76` 的 exact-head CI 仍未产生 run；等待超过 10 分钟后 close/reopen #449 仍未收到新 run。此次合并是 PR 冲突维护，不代表 Stage B-2 实施放行；Ask User 答复/审批真实引擎 RED→GREEN 尚未开始。推送合并 head 后仍要求 exact-head 19-job CI 全绿，PR 保持 Draft，不合并、不部署。
