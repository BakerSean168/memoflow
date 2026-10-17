---
tags: [plan, acceptance, ai, goal, events]
created: 2026-10-13T00:00:00Z
updated: 2026-10-13T00:00:00Z
description: AI 失败恢复和可靠实时同步的验收场景与本轮证据
---

# 验收与证据

2026-10-14 正式接管后的 S0–S7 / A01–A23 完成矩阵、修复与交付状态统一见
[05-final-audit.md](./05-final-audit.md)。本文件以下的执行日志保留历史提交与范围，不代表当前候选或当前部署。

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

## 2026-10-14 · 第二轮续跑（实测）

- 执行入口：ChatGPT Web 经 Agent Fabric → GCP `gcp-dev-01`；原 T3 Codex 线程仍为 quota `failed`，本轮未调用额外 Codex 推理。ForgeFlow 的 ZCode/GLM 配置仅可用于调度规划；Pi 物理模型注册仍不满足派发条件。没有启动第二写入者。
- S6：重新实际运行 `pnpm nx run app-vue:test --args='src/modules/ai/composables/useAIChatSession.spec.ts'`：39/39 通过，exit 0，Nx cache 0/1。
- S7：使用隔离端口 `AI_WORKSPACE_E2E_PORT=20380` 运行真实认证、API/PostgreSQL 与 Chromium 的 `web:e2e:ai-workspace --grep=checkpoint`：Goal Checkpoint 刷新恢复、第二窗口 CAS 冲突及稳定 Goal ID 防重创建场景 1/1 通过，exit 0，Nx cache 0/1；仍是受控 Workflow，不代表真实模型调用或 Desktop 实机。
- 修复 AI Workspace E2E 启动器 `apps/web/e2e/helpers/run-ai-workspace-playwright.ts`：启动前检测 Web 端口占用、Vite 使用 `--strictPort`、API/Vite 子进程提早退出即终止等待，并修正 SIGTERM 后通过 `child.killed` 误判已退出、不能升级 SIGKILL 的问题。曾有一次被默认 4174 端口占用的复测失败（`ERR_CONNECTION_REFUSED`）；新代码在已占用的 20200 端口进行负向探测，会立即给出 `EADDRINUSE` 与明确诊断，不修改或占用该服务。
- 新启动器的 Prettier 与 `git diff --check` 通过，`web:lint` exit 0、`web:typecheck` exit 0（32 个依赖任务），工程治理检查 exit 0。修改后的独立端口 E2E 首次遭遇并发 Nx daemon `EPIPE`（未进入浏览器），隔离并串行使用 `NX_DAEMON=false` 后，在独立 `20382` 端口、`/tmp/memoflow-auto2b-ai-e2e-*` 报告目录复测：真实 API/PostgreSQL/Chromium 登录与 Goal checkpoint 场景 1/1 通过、exit 0、Nx cache 0/1，Playwright 用时 46.2 秒、Nx 整体约 76 秒。这证明启动器修复并未破坏主要 E2E 流程；此前 `EPIPE` 属 Nx 执行环境并发问题，不能计作产品失败。
- Git 提交和官方 validate-local-deploy 实际执行入口受到远程工具安全检查拦截，尚无新的 Commit、PR/CI 或 Docker prod-like 部署证据。仍须关闭这些验收缺口；不绕过安全拦截，保留 staged 及 unstaged 修改。

## 2026-10-14 · Workspace SSE late-join 初始化竞态修复（ChatGPT Web）

执行入口：ChatGPT Web → Agent Fabric → GCP `gcp-dev-01`，基线为 `39abe37b1e2`；没有启动其他写入 Worker，也未使用 Codex Team 额度。

- 在 `packages/app-vue/src/shared/services/workspace-event-subscription.ts` 发现竞态：`stream.ready` 的首批监听者仍在异步快照校准时，新加入的消费者既未被首批事件广播覆盖，也因共享 ready 状态尚未提交而拿不到初始化通知。该消费者可能无法建立投影快照。
- 新增 `workspaceEventSubscription.spec.ts` 的 late-join 回归，先复现 RED：5 项中 4 项通过、1 项按预期失败（第二消费者的 `stream.ready` 收到 0 次）；再修复初始 ready 广播，补送给广播过程中加入的监听者。所有相关消费者投影完成后才提交共享游标；投影拒绝仍阻止 ACK。
- GREEN：定向 `app-vue:test` 5/5 通过、Nx cache 0/1；Conversation/Goal/Attention/共享订阅联动范围 5 文件 / 108 项通过、Nx cache 0/1；`app-vue:typecheck` exit 0；`app-vue:lint` exit 0；`memoflow:governance-check` exit 0；Prettier 与 `git diff --check` 通过。以上均为本轮真实执行。
- 官方上轮 `reports/local-deploy-validation-auto3/latest.json` 的唯一阻塞是 Docker 浏览器证据 HEAD 不匹配：浏览器 `77f5c7de09a7`，Docker API/Web 镜像和容器均为 `bfc3ca1ccae`，当前源码基线 `39abe37b1e2`。本轮尝试按仓库官方入口执行 `pnpm docker:local:up`，被远程操作安全检查阻止，未启动任务、未改容器、未伪造新证据。此项仍是发布验收阻塞。
- 剩余：在获得合法执行条件后重建匹配当前候选的 Docker Prod-like、运行真实 local-docker Chromium，重跑 `validate-local-deploy`，核对新 HEAD 的 PR CI 和 Desktop 实机。不能因定向测试通过提前宣称整体交付。

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

## 2026-10-16 · Windows Electron Workspace IPC 真实事件验收（#454）

以下是该阶段的**增量实机证据**，并不代表 #454 全部验收门禁已关闭：

- 基线：`main@331bdb0f7d549d11b1ad7632cabf1a5a22385886`；Windows 11 上隔离 `D:\AgentValidation` 工作树，官方 Electron 44.4.5，实际编译的 Desktop Main/Preload/Renderer。真实 IPC handlers、PowerSync 本地 Conversation owner、独立 WebContents 与隔离 Guest Profile 均参与。
- 真实 Windows Playwright `workspace-ipc-qa.spec.mts`：`1/1 PASS`，退出 0；`stream.ready`、准确 ACK/错误 ACK、重复订阅冲突、实际创建 Conversation 推送 `conversation.updated`（`resourceVersion=1`）、STOP、无效 cursor reset、旧 cursor 重订阅与事件重放均实际通过。
- 同一个真实 Electron 进程中创建第二个 Guest；原 Guest 的 Conversation 无法由新身份列出，旧身份 cursor 对新身份返回 `stream.reset_required(reason=invalid)`，跨身份不可读。
- 该测试现作为 `apps/desktop/e2e/workspace-ipc.spec.mts` 进入独立 Windows Workflow `Desktop Update Installed E2E`，其 Workflow 通过结果必须单独按最新 commit SHA 核实；本地成功不自动等于未来 CI 通过。
- 相关独立证据：[CI #38893771350](https://github.com/BakerSean168/memoflow/actions/runs/38893771350) `main` 20/20；[Installed Update E2E #38899197567](https://github.com/BakerSean168/memoflow/actions/runs/38899197567) Windows NSIS 与 Linux AppImage 更新均通过。Windows Desktop IPC 52/52 与本机真实 Electron Auth/Profile 5/5 已通过，均属不同验收层。
- **尚缺**：实际产生并核验 `workflow.updated`（Goal AI workflow）及 `attention.changed`（Attention）两条事件流的真实 Windows 端到端场景，以及受控可用 non-Codex 上游真实 429/quota 中断和完整 Agent 发送/恢复。不得用 Conversation 的通过结果替代这些项目，不得因此关闭 #454 或解除发布门禁。

## 2026-10-16 · Goal Workflow Windows IPC 原生状态事件增量验收

- 测试来源：隔离 Windows 11 / Electron 44.4.5、实编译 Desktop Main/Preload/Renderer、全新 Guest + Native Agent Home；基线源码为 `331bdb0f7d549d11b1ad7632cabf1a5a22385886`，未读取生产认证或执行可计费模型推理。
- 在原先真实 Conversation/游标重放测试后，按协议 **STOP → 新 START → stream.ready ACK → 原生 `RUNTIME_WORKFLOW_START(kind=goal.create)` → `workflow.updated` → ACK**，验证来自 Mastra 持久化状态的 `runId`、`status=running`、`resourceVersion=1`，并保留跨 Guest owner 隔离断言。
- Windows 本地定向复测：1/1 通过、退出码 0、约 8.6 秒，日志 `GOAL_WORKSPACE_DIAGNOSTIC_EVENT`。首次临时探测因未 ACK 前一事件而阻塞，后按协议重排订阅及 ACK 顺序并复测通过；不算作产品缺陷。
- 现将断言加入仓库规范回归 `apps/desktop/e2e/workspace-ipc.spec.mts`；其 **GitHub Windows exact-SHA CI 仍待后续独立验证**。本项只证明 Goal Workflow 首个持久事件的 Windows IPC 投递，不涵盖有效模型计划输出、Goal 最终提交或 Attention 状态流。
- #454/#456/#457 发布门禁仍开放，尤其是 Attention `attention.changed` 和真实非 Codex 上游 429/quota/发送/恢复，不得提前宣称完整交付。

## 2026-10-17 · Attention owner-backed IPC event regression (offline native failure)

- Real Windows 11 Electron / isolated user profile, original compiled Desktop Main + Preload + Renderer: Playwright `workspace-attention.spec.mts` **1/1 passed, exit 0**. The test uses public Desktop Native Connection/Conversation/Assistant IPC and a small in-repo test-only ACP JSON-RPC executable that **never accesses a model, network, or user auth**.
- Real native runtime publishes `assistant.run.started` then `assistant.run.failed`; `ConversationAttentionObserver` persists `working → failed` to Profile PowerSync; Workspace IPC delivers owner-backed `attention.changed` with increasing resourceVersion. Client ACKs each cursor, reads `RUNTIME_ASSISTANT_ATTENTION_LIST` and acknowledges the attention revision idempotently (first accepted, duplicate rejected).
- Reusable test fixture: `apps/desktop/e2e/support/attention-acp-fixture.cjs`. Both the spec and fixture must remain test-only. Workflow `Desktop Update Installed E2E` runs this beside Windows Workspace IPC on the exact candidate SHA. **Only GitHub Windows completion is final CI acceptance; the local result is preliminary until that run passes.**
- **Critical scope distinction:** failure is injected by an **offline ACP fixture**, not produced by a real authorized non-Codex upstream. This validates real application event persistence/delivery/ack, **not** live-provider availability, actual 429/quota classification, billed Send, editable Goal draft under rate limit, or final application release. The outstanding #454/#456/#457 hard gates stay open.

## 2026-10-17 · Windows DSH Flash 真正 Desktop IPC → 数据库持久化验收

- **可追溯构建基线**：`main@7fce957261780201cfdd5bf91b5a2b801cec15d9`（包含 [#466](https://github.com/BakerSean168/memoflow/pull/466) 知识库 MCP Wire Schema 修复、[#465](https://github.com/BakerSean168/memoflow/pull/465) DSH 错误码保留）；WSL 干净工作树 `desktop:build:production`（32 项依赖任务）成功，构建的 Electron Main/Preload/Renderer 仅部署到 `D:\AgentValidation` **隔离测试副本**，主进程 SHA-256 前后一致，没有覆盖正式 Windows MemoFlow 程序。
- **Windows 实机无模型推理预检**：真实 Electron 44.4.5，Workspace IPC、cursor/ACK/replay、Conversation 和 Guest/Profile 隔离共 1/1 Playwright 通过（4.2 秒）。
- **用户明确许可的低成本真实模型请求**：Windows 原生 `dsh 0.2.0-rc.2` 已登录 `deepseek-account`，通过 **MemoFlow 正式 Desktop IPC** 创建隔离 Native Provider Connection、检测到 `status=ready` 和 5 个模型、绑定 `deepseek-flash`，创建 Conversation 后进行**唯一一次**短文本 `Send`。收到 `assistant.run.started → assistant.message.delta → assistant.run.completed`，实际回复「收到」。`RUNTIME_ASSISTANT_HISTORY` 回读 `user`、`assistant` 两条持久消息，流式内容、完成事件及数据库 Assistant 消息完全一致。
- Windows Playwright **1/1 passed**，测试案例 8.5 秒、总运行 9.2 秒、退出码 0；无 Agent Tool Grant、无自动重试、无额外推理。密钥和原生认证文件均未读取/复制/记录。测试数据使用独立临时 Guest/Profile 并在测试后销毁。
- 已添加可复用的 `apps/desktop/e2e/live-dsh-operator.spec.mts`。**默认一律跳过**；仅 Windows 操作者明确设置 `MEMOFLOW_RUN_LIVE_DSH_QA=CONFIRM_ONE_PAID_REQUEST`，同时指定 `MEMOFLOW_QA_DSH_EXECUTABLE`、使用已经单独完成认证的 DSH CLI，并在独立构建环境中调用时才会发起最多一条真实推理。CI 不应设置该授权变量；脚本不输出原生认证数据或模型全文。
- **尚未完成**：由**真实上游返回**的 429/quota（不能通过大量请求人为触发）、Composer/Goal 草稿无损恢复、Goal 人工确认和唯一保存、跨账户真实身份切换、签名正式安装包同版本的 Live Provider 发送。此项仅证明隔离开发构建的普通 DSH Flash 成功路径，#454/#456/#457 **均继续 Open**，不解除 Release、Prod-like 或 Prod 门禁。

## 2026-10-17 · Release 冻结下的 Windows 安装版 Native QA 补强（待独立验收）

本轮源码基线 main@90bd7caa73e2522351e4acfef351f51d26debd36，使用独立分支 test/windows-native-installed-acceptance-20261017，**不进行任何正式 Release / 生产部署**。功能范围是补齐 #454/#456/#457 的可复用验收缺口，不把创建测试等同于测试成功。

- Windows Desktop Update Installed E2E 新增**无认证 Codex 安装版**测试：更新 N→N+1 后，从安装证明取得 exe 路径、版本和独立记录的 SHA-256；另起临时 MemoFlow Profile 和空 Codex Home，验证不能伪造账号/模型，也不能仅探测就创建 Connection。保留原 AGY 离线 Composer 测试。
- Windows updater 安装报告新增 installedExecutableSha256，Workflow 在另一个 Playwright 进程重新计算比对；Playwright 再核对运行 exe 的哈希、版本和 packaged 状态。须由本轮精确 SHA 的真实 GitHub Windows Run 通过才可标为完成。
- 新增**人工显式同意、零推理**的 Codex 真实 Windows A→空 B→A 测试：只查账号和模型目录，明确选择 Native Agent 后仅一个 Connection、显示可选模型但**不点击发送**，空 Home 不能继承认证信息，恢复 A 后身份/连接可用。默认无 opt-in 跳过；不读取/复制认证文件，不记录用户邮箱。
- 真实 DSH Send 测试支持指定**已安装**可执行文件及对应 app.asar preload，默认仍因需单独授权而跳过；之前的 DSH Windows 实时发送证据仅绑定开发态构建。
- 本轮 Linux 的 Windows 专用 3 项 Playwright 收集均显示 Skip（符合默认安全要求），**不是 Windows 实机通过**。最新 Windows NSIS E2E、操作员真实账号、Profile 隔离与签名安装候选仍需独立结果。#454/#456/#457 **保持 Open**。

参见 windows-native-provider-operator-qa.md。三个发布工作流必须保持 disabled_manually，任何 CI 或 staging 通过不构成发布授权。

## 2026-10-17 · Windows Native/Workspace installed-only single-pass acceptance preparation

Scope: **test-only PR, unmerged at time of writing**; base is exact main SHA c444ca3937bc3d14dc068cf4bf58ec28e5f386c2, whose independent main CI and Coverage both passed. The prior #473 Windows NSIS/Linux AppImage proof belongs to the **different** feature-branch SHA c7c3f5290aedc59b7ff4bd6686f920446a72b73c; it is not evidence for a later combined candidate.

- Consolidate existing Windows Workspace IPC/Goal/Conversation test and six synthetic Attention failures into the already-installed NSIS candidate run alongside AGY Composer and unconfigured Codex checks; **exactly one Playwright invocation after updater proof**, not two before/after packaging.
- On Workspace IPC and Attention, verify the running app is actually packaged, its executable path and SHA-256 match the independent updater receipt, and version matches installed candidate; secondary inspector windows use its own installed preload.
- Cross-Guest cursor/identity checks and model-free Goal workflow event remain real application IPC and durable Profile storage; ACP 429/quota remain **explicitly offline fixture injection**. No credential file or billable model request.
- Before this test-only PR merges and its **later exact-main SHA** Windows single-pass CI succeeds, the new installed Workspace/Attention coverage is **pending**, not an accepted Windows result. The operator-approved Codex A→empty B→A and separately authorized signed-installed live Send remain external acceptance items.
- The same workflow retains one seven-day **unsigned QA-only Windows installer**, verified byte-for-byte against the updater's recorded candidate.installerSha256 before upload; a separately authorized Windows operator can use this binary with no second packaging job. **No signed public installer or real account is claimed here.**
- This work does **not** reopen release workflows or publish v0.20.x. Final DoD also requires #454/#456/#457 product and owner/profile recovery evidence, release signing/assets and a project-wide Go/No-Go.

See docs/guides/development/windows-native-provider-operator-qa.md for the opt-in/native safety boundary.
