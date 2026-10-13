---
tags: [plan, acceptance, ai, goal, events]
created: 2026-10-13T00:00:00Z
updated: 2026-10-13T00:00:00Z
description: AI 失败恢复和可靠实时同步的验收场景与本轮证据
---

# 验收与证据

## 当前表单保护（S0）

- A01：AI 已写 name/description/KR 后 failed，表单仍打开，字段/dirty 不变，不重新 open/reset。
- A02：脱离后 base user session 可编辑、验证、保存；保存不调用旧 workflow resume/approve；用户取消不调用旧 cancel callback。
- A03：旧 AI capability 在脱离后不能 read/patch/save，晚到 async projection 不重新绑定旧 coordinator。
- A04：审核期间主动 handoff 仍协调 owner Save + approve；此语义不因新增脱离操作改变。
- A05：保存 busy、pendingOwnerAttempt、submitted 或 result 已含 Goal 时，不转自由 create，不清空防重复状态；结果不明继续校准 owner。
- A06：释放本地 authority 和 lease 续租；网络 release 失败由现有 TTL 兜底，不因此丢草稿。

## 轻量中断与重新规划（S1/S2）

- A07：同一 run 一处聊天状态从 loading 转停止，不叠加 Toast/terminal bubble/send error；重投影不追加重复消息。
- A08：限流、配额不足、未知 429 分开；只有提供安全等待 hint 才显示时长；raw provider 文本与 secret 不进入 UI/receipt。
- A09：点击重试/换模型后新 run 输入包含当前人工草稿，旧 failed run 从不 resume；continue editing 不产生模型请求。
- A10：owner 已保存但 approve 回执丢失，重复点击不会再次创建 Goal/KR。
- A23：run 未确认终止时发生网络/lease 失权，已填表单保留只读；authority/owner 校准前禁止再次 create。此项属于 S1，S0 尚未覆盖。

## 事件可靠性（S3–S6）

- A11：身份 A 不能订阅/查询 B 的会话、run、attention；切换身份后旧事件无效，旧 cursor 不复用。
- A12：提交前 crash 无事件；提交后 publish 前 crash 可补齐；生产与订阅分属两个进程仍及时送达。
- A13：live journal 写入、暂停提问、用户答复续跑、quota failed、completed、cancel 均有已持久事件及安全快照。
- A14：重复、乱序、resource revision gap、旧 run 响应均不回退或覆盖用户接手字段。
- A15：初始快照与订阅交错、重连时历史与 live 交错、超过 100 条历史、低序号晚提交均无丢失。缓冲/去重集合有界。
- A16：cursor 过期得到 reset_required 并执行一次校准；投影失败不能静默推进 cursor；恢复快照后继续订阅。
- A17：健康连接中运行 30 秒，Goal 无周期 workflow/get，Attention 无周期 attention/list；字段事件正常路径不再查询完整 run。心跳/lease renewal 不算业务轮询。
- A18：初始化/显式刷新/gap/断线恢复允许读取，但同资源同时最多一个校准；一次恢复不因三套 observer 触发三个同样请求。请求次数和触发原因保存到测试证据。
- A19：会话创建立即 upsert，标题按 ID/version 更新，删除不被旧列表复活；客户端时钟偏差不影响覆盖判断。
- A20：Web SSE 与 Desktop IPC 的 payload 和恢复行为一致；lease fence 不作为资源 revision 或公开事件 payload。

## 检查点（S7）

- A21：刷新/重新登录可恢复人工草稿；正式 Goal 数量保持不变。
- A22：两窗口检查点 CAS 冲突明确，旧身份不可读，正式保存响应丢失不会导致另一次 create。

## 验证入口

优先使用最近的 Nx target。S0 定向范围是 `GoalDialog.spec.ts`、`useAIGoalWorkflow.spec.ts`、shell native-surface 测试；代码补 `app-vue:lint/typecheck`，文档补 `memoflow:governance-check`。只把实际执行结果记为通过。

S3/S5 增加 Postgres/LibSQL persistence fault tests、真实 HTTP SSE 双进程测试，不能仅靠 mock EventBus。浏览器场景必须使用本次构建，记录 build revision、身份与实际 Network 请求；模型故障优先使用可控结构化 fixture，不周期探测真实模型。

## 当前实施与验证状态

S0–S7 均已有实现，2026-10-14 已在现有 PR #451 分支形成本地检查点 `9f6e9e33237`，尚未推送。S6/S7 由 2026-10-14 定向验证补充证据，但仍未满足全部正式交付门禁。下面记录的是本工作区执行证据，不代表生产部署或 PR 已通过。

- S1/S2：安全 provider 错误分类、原生草稿重启与迟到响应保护的定向测试通过；真实 runtime 范围 3 文件 / 134 通过 / 1 跳过。
- S3/S4：真实 HTTP SSE 另一个 Node 进程写入 LibSQL、即时推送、终止状态续传、认证隔离测试通过；PG 事务回滚、晚提交与连接恢复测试通过。HTTP/IPC/持久化范围 5 文件 / 45 通过。
- Goal 浏览器：Chromium 真实注册/登录与 Goal 保存，受控模型/Workflow SSE fixture；字段立即更新，健康运行 30 秒仅一次初始 workflow/get；配额中断后保留同一表单，人工修改保存只创建一次 Goal，不携带 AI lease，也不调用旧 workflow approve。1 场景通过（58.3 秒）。此场景不代表真实模型服务或 Desktop 实机验收。
- S5：真实 PowerSync 原生表和事件日志同事务提交/回滚、重启 epoch/续传、删除、过期只改变派生投影已通过；原生 watch 的 comparator 使用 SDK 公共 checkEquality 契约，第二条记录变化也能唤醒。两个真实数据库共用游标恢复范围 3 文件 / 18 通过。
- 真实 PostgreSQL Goal + Attention 范围：2 文件 / 2 通过；显式使用本地 prod-like PostgreSQL，独立临时 schema，清理已完成。
- 共享前端订阅与 Goal/Attention 投影：4 文件 / 66 通过；覆盖最后一个消费者释放才关闭传输、全部投影完成后推进游标、旧快照不能复活 Attention tombstone，30 秒无周期 attention/list/workflow/get。
- API composition：2 文件 / 13 通过。

S6/S7 现已包含实际代码及定向测试，当前本地候选的四项目 typecheck/lint、Goal checkpoint 浏览器复验均通过，但完整受影响项目测试、prod-like 与 PR CI 仍待完成。A19、A21、A22 有局部证据，尚未完成全部跨客户端/真实恢复验收；身份切换、跨窗口及 Desktop 实机验收不能仅凭定向测试宣称交付。

## 2026-10-14 · ChatGPT Web 续跑实际证据

执行环境：Agent Fabric → `gcp-dev-01` → `/home/dev/projects/memoflow`，分支 `feat/goal-pane-embedded-editor-20261013`。原 T3 Codex 线程 `90a37bd9-f343-4d41-9188-c8ccad59b4c7` 因额度限制失败；本轮由 ChatGPT Web 直接实施，无新增模型调用。ForgeFlow Inventory 仅证明 GLM/ZCode 是候选执行配置，不代表已真实派发；本轮未因重叠写入风险启动新的 Writer。

- 修复 `GoalDialog.spec.ts` 中的 `afterEach` 将新增布尔 `validationRejected` 当作 Mock 调用 `mockReset` 的错误。原日志中该清理问题引起 28 项失败；修复后 `pnpm nx run app-vue:test --args='src/modules/goal/components/dialogs/GoalDialog.spec.ts src/modules/goal/composables/useGoalDraftCheckpoint.spec.ts src/modules/ai/composables/useConversationAttention.spec.ts src/modules/ai/composables/useAIGoalWorkflow.spec.ts'`：4 文件 / 112 通过，exit 0。
- 修复 `GoalDialog.vue` 从 `snapshot.result.referenceMap.goal.id` 读取 Goal ID 的错误：该值根据 `GoalPlanExecutionReceiptSchema` 为字符串。新增回归覆盖 Workflow 返回既有 Goal ID、owner 读回正式记录、清理检查点及不重复创建。调整测试夹具的 AI-owned 阶段后，`pnpm nx run app-vue:test --args='src/modules/goal/components/dialogs/GoalDialog.spec.ts'`：1 文件 / 48 通过，exit 0。运行日志 `/tmp/memoflow-s0s7-20261014-receipt-retest.log`。
- `pnpm nx run app-vue:typecheck`：修复 TS2339 后 exit 0，含 27 项依赖任务。日志 `/tmp/memoflow-s0s7-20261014-app-vue-typecheck-afterfix.log`。注：该检查早于新增回归测试的最后一次调整，后续需再确认完整候选。
- S6：`pnpm nx run ai:test` 的 Conversation PowerSync、Workspace 多 owner 游标及 HTTP SSE 用例分别通过，共 3 项；Postgres 用例因未注入 `MEMOFLOW_WORKSPACE_EVENTS_PG_URL` 初次跳过。随后从专用 `.env.test` 将测试数据库 URL 仅传入子进程环境（不输出凭据），在 `127.0.0.1:5433` 独立测试库以临时 Schema 重新运行 `conversation-events.postgres.spec.ts`，1 文件 / 1 测试通过，exit 0，验证提交版序、回滚、删除 tombstone 与身份隔离。日志 `/tmp/memoflow-s0s7-20261014-postgres-test.log`。
- 最新定向回归：四个 Goal/Attention 相关测试文件 113/113 通过（`/tmp/memoflow-s0s7-20261014-focused-final.log`）；Workspace 订阅文件改名后，Conversation/Goal/GoalDialog 四个测试文件 93/93 通过（`/tmp/memoflow-s0s7-20261014-afterrename-tests.log`）。
- `ai, app-vue, api, desktop` 四项目的 Typecheck（及 31 项依赖任务）和四项目 Lint 均通过；日志 `/tmp/memoflow-s0s7-20261014-typecheck-final.log`、`/tmp/memoflow-s0s7-20261014-lint.log`。
- 更新 `tools/test-system-v2/test-inventory.json`，生成清单现覆盖 1406 个测试文件，并核验 `inventory.mjs --check` 通过；`workspaceEventSubscription.ts` 改为 `workspace-event-subscription.ts` 并更新五处导入后，`pnpm nx run memoflow:governance-check` 最终 exit 0（`/tmp/memoflow-s0s7-20261014-governance-afterrename.log`）。
- 最新 Playwright：`pnpm nx run web:e2e:ai-workspace --args='--grep=checkpoint'` 1/1 通过，约 45.5 秒，使用真实认证/API/Chromium，覆盖刷新草稿恢复、跨窗口 CAS 竞争、保存成功后响应丢失且不重复创建 Goal（`/tmp/memoflow-s0s7-20261014-checkpoint-e2e.log`）；测试使用受控 Workflow，不代表真实模型推理或 Desktop 实机验收。
- `git diff --check`：通过；形成本地提交 `9f6e9e33237`（133 文件，7,599 增行 / 446 删行），提交后工作树干净，分支领先远端 1 个提交，尚未推送。仍缺完整受影响范围测试、Docker prod-like、PR CI 和发布验证，不以定向测试通过代替完整交付。

下一轮优先事项：① 五项目全量测试已通过（`/tmp/memoflow-s0s7-auto1-full-retest.log`），Desktop IPC 52/52 已通过，S6 双实例并发回归 39/39 已通过；② 补齐真实浏览器双窗口与 Desktop 实机验收；③ 在不干扰现有服务且磁盘有足够余量时完成 Docker prod-like 验证；④ 验证当前候选的全部门禁与 CI 后推送现有 PR #451，不创建多余分支或合并未验证代码。

## 2026-10-14 · 本轮增量验收证据

- 首次五项目测试在 app-vue 出现两个过期 `Rate limited` 文案断言失败，Desktop PIN 测试遇到默认 5 秒超时。已更新 Task/Knowledge 安全文案测试及两个长 PIN 场景的 15 秒预算，不改变业务逻辑。定向复测 42/42 和 18/18 通过。
- 修复后五项目全量 `run-many --target=test` exit 0（Nx 4/6 命中缓存）；治理检查 exit 0；Desktop IPC 8 文件/52 测试 exit 0。证据分别为 `/tmp/memoflow-s0s7-auto1-full-retest.log`、`/tmp/memoflow-s0s7-auto1-governance.log`、`/tmp/memoflow-s0s7-auto1-desktop-ipc.log`。
- S6 新增两个独立客户端投影的版本乱序与旧列表交错测试，`useAIChatSession.spec.ts` 39/39 通过。证据 `/tmp/memoflow-s0s7-auto1-crosswindow.log`；不是两个真实浏览器的 E2E。
- ForgeFlow/Pi 扩展缺少 `pi-subagents/required-child-extensions`，已由 ChatGPT Web 经 Agent Fabric 实施。Docker prod-like 仅完成官方 dry-run，结果为 inconclusive；当前候选未推送 PR #451，也没有对应新 HEAD 的 CI 结果。

## S0 历史切片记录

以下记录仅对应 S0 当时的改动，保留其原始验证范围。当前 mounted 草稿保护与 refresh checkpoint 分开验收。

实际改动：新增原生 `detachWorkflow()`，清除 capability、编辑锁和两个 coordinator；Shell wrapper 同时释放 businessControl。已确认 failed 的 workflow 使用脱离路径而非 requestCancel。pending owner attempt / 已提交状态保留，failed 且有 owner receipt 时禁止启动第二次 create。失效 projection 的 lease/read/open 响应不再恢复旧冲突状态。

验证顺序与结果：

- RED：新增 GoalDialog 与 Workflow 测试在原实现出现 7 个预期失败，原有 87 个测试通过。症状包括自动关闭、旧 coordinator 不清除、pending attempt 被清空以及有 receipt 仍允许新 create。
- GREEN：两个组件/composable 与真实 Shell/GoalModuleLayout 的定向范围，3 文件 / 121 测试通过。
- 第二次 RED：新增 in-flight review/lease 响应测试，复现失败交接后旧投影将 conflict 重新设为 true；补 epoch 检查后纳入广域 GREEN。
- `NX_DAEMON=false pnpm nx run app-vue:test -- src/modules/ai src/modules/goal src/layouts/shell`：93 文件 / 902 测试通过，包含保存 busy 时拒绝脱离、旧 capability 拒绝写入、原生校验/持久化/取消、主动 review handoff、owner 写入不确定性及晚到响应。
- `NX_DAEMON=false pnpm nx run app-vue:typecheck`：通过，包含 27 个依赖任务。
- `NX_DAEMON=false pnpm nx run app-vue:lint`：通过，0 error / 6 warning；warning 位于未改动的 account/authentication/schedule/i18n 文件。
- `NX_DAEMON=false pnpm nx run memoflow:governance-check`：通过。文档最终补充状态和证据后再次运行此 target。
- `git diff --check`：通过。

S0 conformance：A01–A04 由原生 owner 与 composable/Shell 测试覆盖；A05 的“不解除冻结、不清空 pending、不允许第二次 create”已覆盖，终止 run 后新增人工核验入口尚未提供；A06 本地 authority/lease release 已覆盖，远端 release 中断继续使用原有 TTL 行为，未实测网络故障。其他验收项均待对应切片，不以 902 个单元/组件测试代替真实 provider/API/PG/双进程 SSE、浏览器或 Desktop 实机验收。本轮未改传输、存储或部署配置，未执行 Docker/prod-like 部署。
