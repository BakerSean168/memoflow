# MemoFlow 代码质量审查报告（2026-11-03）

- 审查分支：`chore/code-quality-audit-20261103`（创建时与 `origin/main` 完全一致，0 ahead / 0 behind）
- 审查基线：`17a16b664`（Merge pull request #813）
- 审查阶段：阶段一只读审查。本报告是唯一新增文件，未修改任何源码、测试或配置。
- 结论用途：可直接据 §5 的批次拆分派单整改。

---

## 0. 扫描口径与规范基线

### 0.1 扫描口径

| 项目 | 内容 |
| --- | --- |
| 枚举方式 | `git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' '*.vue' '*.mts' '*.cts'`（只统计已跟踪文件，天然排除 `node_modules/`、`dist/`、`dist-electron/`、`dist-renderer/`、`coverage/`、`.nx/` 等未跟踪产物） |
| 枚举结果 | 4,890 个文件 / 803,027 行 |
| 排除：声明文件 | 19 个 `*.d.ts`（其中 6 个属于 Prisma 生成物） |
| 排除：生成代码 | 16 个 `packages/database/src/generated/prisma/**`（Prisma Client 生成产物，含 `.js` 与 `.d.ts`） |
| 排除：基准测试 | 2 个 `*.bench.ts`（`packages/task/src/server/domain/performance/`，258 行） |
| 归入「测试」 | 1 个 `*.live.ts` 验收测试（见 §4.5，文件内含 `describe/it`，仅由 `apps/desktop/vitest.live-github.config.ts` 执行） |
| 实际统计 | **4,859 个文件 / 609,084 行**：源码 **3,482 / 356,556**；测试 **1,377 / 252,528** |
| 测试识别规则 | 文件名匹配 `*.spec.*` / `*.test.*`，或路径含 `/__tests__/`、`/e2e/`；另加上述 `*.live.ts` |
| 计入源码但非生产运行时代码 | `packages/test-utils/**`（测试基建）、`apps/web/src/mocks/**`（MSW mock handler）、`*.stories.ts`（Storybook 样例）。它们参与构建/类型检查，因此保留在源码口径，但在下述判断中不作为「业务大文件」 |
| 行数口径 | 物理行（`wc -l` 语义，含空行与注释） |

排除的 29 个声明/生成文件合计 193,685 行，占枚举行数的 24.1%；这部分体量来自 Prisma 生成，不代表手写代码规模。

### 0.2 与仓库既有规范的一致性

审查依据（按仓库约定先读代码与规范）：

- `AGENTS.md`：业务所有权留在真实模块；跨面契约、API/IPC 传输和持久化边界必须一致；优先最小改动，不做投机性架构。
- `docs/internals/standards/architecture.md`：`apps/*` 只是运行时容器；`packages/<feature>` 是垂直业务切片，内部再分 domain/application/infrastructure/transport；`packages/utils` 只放技术性、无业务所有权的通用能力；`shared-primitives` 放跨域纯类型；`host-runtime` 拥有全局 Event/RPC 注册表。
- `docs/internals/decisions/ADR-028-workspace-package-resolution-strategy.md`：包的公开面由 `package.json#exports`、`tsconfig.workspace-src.json`、`tsconfig.workspace-dist.json`、Vite alias 共同决定，缺一不可。
- `docs/internals/decisions/ADR-021-api-routes-file-organization-strategy.md`：明确把「单个路由文件 200–700+ 行」列为问题，规定「一个 Router 一个文件」。
- `docs/internals/decisions/ADR-005-ui-package-multi-framework.md`：`ui-core` 承载无框架 headless 逻辑；`ui-vue-shadcn` 是 Vue primitive 的唯一 Module。
- `docs/internals/decisions/ADR-058-oss-first-standard-capability-reuse.md`：标准能力优先复用成熟库/既有实现，产品语义留在领域包。

**新建包 vs 包内拆文件的成本（本报告的核心取舍依据）**

| 动作 | 需要改动的注册点 | 成本 |
| --- | --- | --- |
| 新建一个 package | 新包自身：`package.json`（name/exports/files）、`project.json`（Nx targets/tags）、`tsconfig.json`、`tsconfig.build.json`、`tsup.config.ts`、`vitest.config.ts`；仓库级：`tsconfig.workspace-src.json`（146 个 `@memoflow` 条目）、`tsconfig.workspace-dist.json`（134 个条目）、`vite.workspace-aliases.ts`（711 行）、`vitest.workspace-helpers.ts`（606 行）、`eslint.config.ts`（21 处 `@memoflow` 规则/例外）；每个消费方还要改 `package.json`、`tsconfig.json`、`tsconfig.build.json`，并触发 `pnpm install` 更新锁文件 | 高 |
| 包内新增/拆分文件 | 0 处仓库级注册；仅调整相对 import，必要时更新该包 `index.ts` barrel | 低 |
| 在既有共享包新增子路径 | 通常 1–3 处（`package.json#exports`、`tsconfig.workspace-src.json`，若 UI 宿主源码消费再加 `vite.workspace-aliases.ts`） | 中低 |

因此本报告把「包内沿自然接缝拆文件」「抽到既有共享包」排在前两批；**目前没有任何一项必须新建包**。凡涉及包边界变化（例如让 `setting-ui` 依赖 `repository-ui`）的候选，均在 §3 标注为「需评估边界，暂不建议」。

---

## 1. 总览数字

### 1.1 源码 / 测试行数分布

| 行数区间 | 源码文件 | 测试文件 |
| --- | ---: | ---: |
| > 1000 | 16 | 19 |
| 800 – 1000 | 19 | 9 |
| 600 – 800 | 36 | 30 |
| 400 – 600 | 102 | 75 |
| ≤ 400 | 3,309 | 1,244 |
| 合计 | 3,482 / 356,556 行 | 1,377 / 252,528 行 |

测试/源码行数比约 0.71。整体测试体量健康，但**覆盖不均**：`packages/ai` 有 28,619 行测试，`packages/ai-ui` 有 15,025 行；而 `packages/repository-ui` 只有 3,284 行测试对应 4,838 行源码，且若按单文件看，若干千行级组合式函数没有直接测试（见 §2.1.2）。

### 1.2 按包分布（源码）

排序按行数；`≥600` 列表示该归属下 ≥600 行源码文件的数量。

| 归属 | 文件 | 行 | 最大文件 | ≥600 |
| --- | ---: | ---: | ---: | ---: |
| `packages/ai` | 290 | 39,346 | 1,306 | 9 |
| `packages/app-vue` | 222 | 29,578 | 1,583 | 11 |
| `apps/desktop` | 189 | 27,576 | 1,199 | 4 |
| `packages/goal` | 165 | 17,419 | 1,179 | 4 |
| `packages/task` | 145 | 15,708 | 625 | 1 |
| `packages/ai-ui` | 60 | 15,604 | 1,294 | 7 |
| `packages/ui-vue-shadcn` | 410 | 13,104 | 194 | 0 |
| `packages/routine` | 94 | 13,043 | 854 | 3 |
| `packages/repository` | 71 | 12,917 | 1,340 | 7 |
| `packages/notification` | 96 | 12,587 | 978 | 5 |
| `packages/goal-ui` | 66 | 12,527 | 1,545 | 2 |
| `apps/api` | 100 | 11,638 | 593 | 0 |
| `packages/task-ui` | 58 | 10,901 | 1,181 | 3 |
| `packages/app-react` | 71 | 9,424 | 462 | 0 |
| `packages/setting-ui` | 41 | 7,897 | 1,304 | 3 |
| `packages/utils` | 58 | 7,504 | 645 | 1 |
| `apps/web` | 56 | 6,340 | 680 | 1 |
| `packages/ai-contracts` | 83 | 5,554 | 437 | 0 |
| `packages/schedule` | 49 | 5,133 | 767 | 2 |
| `packages/repository-ui` | 29 | 4,838 | 1,245 | 1 |
| `packages/scheduler` | 67 | 4,621 | 407 | 0 |
| `packages/account` | 60 | 4,601 | 527 | 0 |
| `packages/schedule-ui` | 27 | 4,466 | 791 | 2 |
| 根目录（`eslint.config.ts`、`vite.workspace-aliases.ts` 等） | 13 | 4,230 | 804 | 3 |
| `packages/notification-ui` | 39 | 3,772 | 282 | 0 |
| `packages/data-portability` | 37 | 3,031 | 365 | 0 |
| `packages/goal-contracts` | 63 | 3,030 | 301 | 0 |
| `packages/routine-ui` | 18 | 2,879 | 946 | 1 |
| `packages/database` | 38 | 2,628 | 234 | 0 |
| `packages/ai-client` | 34 | 2,605 | 551 | 0 |
| 其余 48 个归属合计 | 733 | 42,055 | 999 | 1 |

前 6 个归属（ai / app-vue / desktop / goal / task / ai-ui）合计 145,231 行，占源码 40.7%。`packages/powersync-schema` 的 999 行单文件落在「其余」内。

### 1.3 测试按包分布（简表）

| 归属 | 文件 | 行 | 最大测试文件 |
| --- | ---: | ---: | ---: |
| `packages/ai` | 126 | 28,619 | 2,809 |
| `apps/desktop` | 152 | 27,107 | 831 |
| `packages/task` | 92 | 18,205 | 1,425 |
| `packages/goal` | 108 | 17,656 | 921 |
| `apps/api` | 89 | 15,521 | 669 |
| `packages/ai-ui` | 41 | 15,025 | 2,751 |
| `packages/app-vue` | 92 | 14,984 | 1,458 |
| `apps/web` | 93 | 13,885 | 553 |
| `packages/repository` | 34 | 11,144 | 1,870 |
| `packages/notification` | 44 | 9,887 | 1,596 |
| 其余 62 个归属合计 | 506 | 80,495 | 1,145 |

### 1.4 初步判断

1. 大文件不是「算法太复杂」，而是**组合根、运行时装配、视图编排**三类堆积：`main.ts`、`ai.module.ts`、`ai/src/electron/index.ts`、多个 `*-ui` 视图与组合式函数。
2. 800+ 行源码 35 个，集中在 15 个归属：`repository`/`app-vue`/`ai` 各 5 个，`ai-ui` 4 个，其余 2–1 个。
3. 路由层与仓库既有 ADR-021 直接冲突的有 2 处（`ai-runtime.routes.ts`、`notification/src/api/routes.ts`），且都有高质量测试，属于最高确定性的整改项。
4. 组合式函数（composable）正在成为新的巨型单元：`useAIChatView`（1,294 行）、`useGoalNativeReviewCoordinator`（1,180 行）、`useConversationProjection`（813 行）、`useDesktopProfiles`（619 行、547 行单函数）。其中后两者没有直接测试。
5. 跨包重复集中在**基础设施胶水**（鉴权 IPC 组合器、运行时贡献归一化、对象守卫、别名注册表），而不是业务逻辑；这类重复抽取收益高、语义风险低。

---

## 2. 大文件逐个评判

### 2.1 全部 >800 行源码文件（35 个）

判定口径：**单一职责**指该文件是否只服务一个可命名的变化原因；**接缝**指无需改变公开导出的前提下，能沿数据结构/阶段/依赖边界切开的位置。

#### 2.1.1 建议拆分（接缝清晰）

> 下列 24 项都能在不改公开导出的前提下找到接缝，但测试强度不同：第 1–7、12–23 项有直接同名 spec 或高质量间接覆盖；第 8（TaskDetailView）、10（mastra runtime）、11（ai electron）、24（useGoalNativeReviewCoordinator）需要先补测试或依赖间接覆盖，因此均未进入第一批。

**1) `packages/repository/src/server/application/services/knowledge-repository-projection.service.ts` — 1,340 行**
- 职责：GitHub webhook 入口校验、投递去重与重试、连接级串行队列、知识笔记投影与游标推进、附件读取与完整性校验、写请求重放。
- 单一性：否。至少 5 个变化原因（签名校验、队列调度、投影、附件、重放）。
- 测试：同名 spec 1,870 行，另有 `knowledge-write-request-projection-ledger.integration.test.ts`、`github-webhook-delivery-ownership.surface.spec.ts` 等；覆盖面是本次审查中最好的之一。
- 接缝与拆法：`getAttachmentContent`/`loadAttachmentBlob`/`readCachedAttachment`/`assertAttachmentBlobIntegrity`（343–545）→ `knowledge-attachment-content.ts`（附件读取与缓存）；`enqueue`/`queueConnectionTask`/`startManagedRuntime`/`processDelivery*`/`scheduleDeliveryRetry`（769–1250）→ `knowledge-delivery-queue.ts`（生命周期与投递队列）；主类保留 `ingest`/`list*`/`replayWriteRequestProjection` 与依赖装配。
- 风险：中。队列与代际（generation）语义必须逐字保留；有 spec 兜底，但并发相关的失败路径需要在整改 PR 中逐条对照。

**2) `packages/setting-ui/src/components/KnowledgeRepositorySettings.vue` — 1,304 行**
- 职责：GitHub App 安装（Web 弹窗 / 桌面 intent 轮询）、连接列表与状态展示、云/本地账户分支、Local Vault 绑定、私有仓库创建、断连与清云数据等危险操作。
- 单一性：否。模板 460 行（1–460），脚本 840 行，含约 40 个顶层函数。
- 测试：同名 spec 1,392 行，覆盖弹窗授权、回调完成、私有仓库创建、断连确认等。
- 接缝与拆法：`KnowledgeRepositoryInstallationSection.vue`（`beginInstallation`/`startInstallation`/`poll*`/`completeInstallationFromQuery`，738–1047）；`KnowledgeRepositoryConnectionList.vue`（加载、状态标签、`connectRepository`，608–666、1048–1090）；`KnowledgeRepositoryDangerZone.vue`（purge/confirm disconnect，模板 400–459）；`useKnowledgeRepositoryIntent.ts`（567–600 的 intent 存取 + 轮询）。
- 风险：中。拆子组件必须保留全部 `data-testid` 与事件顺序；安装流程涉及 `window.open` 与轮询，测试对时序敏感。

**3) `packages/routine-ui/src/views/RoutineConfigurationView.vue` — 946 行**
- 职责：Routine 列表/筛选、profile 作用域与启停门、创建菜单与模板入口、编辑器路由联动、删除/暂停操作。
- 单一性：否。模板 424 行 + 脚本约 30 个函数。
- 测试：同名 spec 391 行（列表、profile 门、暂停指示、创建入口）。
- 接缝与拆法：`RoutineListToolbar.vue`（9–218，筛选/门/创建菜单）、`RoutineCard.vue`（`routine-card-*` 区块，248–420）、`useRoutineRouteSelection.ts`（`routeRoutineId`/`openRoutineFromRoute`/`clearRoutineRouteSelection`，723–744）；视图保留数据加载与编辑器路由。
- 风险：中。路由联动与编辑器打开顺序是行为的一部分。

**4) `packages/ai-ui/src/views/AIChatView.vue` — 841 行**
- 职责：聊天页头部、目标中断/保存/冲突横幅、消息面板宿主、移动端侧栏、原生执行状态。
- 单一性：否，但它是「页面编排」，拆成子组件是自然方向。
- 测试：无同名 spec；`useAIChatView.lifecycle.spec.ts`（1,269 行）挂载该视图并覆盖生命周期行为。
- 接缝与拆法：`AIChatGoalBanners.vue`（157–297，goal interruption/save/conflict/native status）、`AIChatHeader.vue`（83–156）；消息列表已由 `AIMessagePanel.vue` 承担，可继续把 `handleComposerSend`（652–734）下沉到 `useChatComposerSend.ts`。
- 风险：中。横幅与 workflow 状态强耦合，且直接测试只覆盖生命周期。

**5) `packages/app-vue/src/layouts/shell/ConversationSidebar.vue` — 822 行**
- 职责：会话列表分组、归档区、重命名/删除、未读与活动标记、拖拽/滚动行为、移动端外壳。
- 单一性：否（列表容器 + 单项交互 + 归档区）。
- 测试：同名 spec 651 行，覆盖渲染、操作与响应式行为。
- 接缝与拆法：`ConversationSidebarItem.vue`（单项渲染与菜单）、`ConversationSidebarArchive.vue`（归档分区）、`useConversationSidebarActions.ts`（重命名/删除/恢复回调）；外壳保留布局与列表数据。
- 风险：中低。`data-testid` 与事件冒泡需保持。

**6) `packages/goal-ui/src/views/GoalDetailView.vue` — 1,545 行**
- 职责：Goal 工作区头部（标题/状态/时间框/标签/提醒/知识关联）、描述、关键结果区、近期进展、多个 overlay 对话框路由。
- 单一性：否。模板 716 行，是全仓最大模板。
- 测试：同名 spec 539 行，覆盖 quick check-in、KR 展示、Task/笔记上下文与刷新。
- 接缝与拆法：`GoalWorkspaceHeader.vue`（51–475，含身份/状态/时间框/标签/提醒）、`GoalKeyResultsSection.vue`（495–617）、`GoalRecentProgressSection.vue`（618–675）；脚本侧把 `syncReviewDetailFromRoute`（984–1036）与 review 状态抽到 `useGoalReviewRoute.ts`。
- 风险：中。头部大量 `v-model` 草稿与保存节流耦合，拆组件时要保持 props/emit 与草稿生命周期一致。

**7) `packages/goal-ui/src/components/dialogs/GoalDialog.vue` — 1,149 行**
- 职责：Goal 创建/编辑对话框、草稿会话（makeSession/publishSession/persistDraft/checkpoint）、工作流回执对账、原生草稿协调。
- 单一性：否。`publishSession`（432–631，200 行）内含 `makeSession`（438–629），另有 `persistDraft`（1,031–1,148，118 行）。
- 测试：同名 spec 1,966 行，覆盖草稿恢复、幂等提交、回执对账、ACK 顺序。
- 接缝与拆法：`useGoalDraftSession.ts`（会话快照/发布/失效）、`useGoalDraftPersistence.ts`（`persistDraft`/`checkCheckpoint`/`operation`）；对话框保留模板与用户交互。
- 风险：中。草稿持久化与 workflow checkpoint 的顺序是测试重点，抽 composable 时要保持调用时序。

**8) `packages/task-ui/src/views/TaskDetailView.vue` — 1,181 行**
- 职责：任务详情（概要、属性行、Goal/Label/Reminder、计划与 occurrence、活动记录、完成/删除）。
- 单一性：否。模板 670 行。
- 测试：同名 spec 仅 209 行，覆盖运行时完成、可选属性语法、最近活动；**覆盖相对模板规模明显不足**。
- 接缝与拆法：`TaskDetailOverview.vue`（97–336）、`TaskDetailRelations.vue`（337–500，Goal/Labels/Reminders）、`TaskDetailActivity.vue`（后段活动区）；脚本按 section 抽 composable。
- 风险：中。先补测试再拆更稳妥；当前不建议进入第一批。

**9) `packages/repository-ui/src/views/KnowledgeProjectionWorkspaceView.vue` — 1,245 行**
- 职责：知识投影工作区：工具栏、目录树懒加载、上下文面板、预览、采纳（adopt）流程、投影进度刷新、连接状态。
- 单一性：否。模板 374 行 + 约 40 个函数。
- 测试：同名 spec 1,098 行，覆盖未连接态、目录懒加载与复用、adopt 流程。
- 接缝与拆法：`KnowledgeCatalogPanel.vue`（151–230）、`KnowledgeContextPanel.vue`（231–310，仓库中已存在同名组件 `KnowledgeNoteContextPanel.vue`，需先对齐命名与职责）、`KnowledgeAdoptPanel.vue`（310–370）、`useKnowledgeCatalogTree.ts`（718–834 的树加载/展开）。
- 风险：中。树缓存与 `applyNoteQuerySelection`（588–644）有顺序语义。

**10) `packages/ai/src/server/mastra/runtime/mastra-ai.runtime.ts` — 1,306 行**
- 职责：`AIWorkflowRuntimePort` 的 Mastra 实现：会话启动/恢复/取消、暂停（ask-user/approval）恢复、消息与历史、用量汇总、并发策略。
- 单一性：是（一个端口实现），但**接口过宽**，构造函数 105 行，恢复分支各自很长（`driveSuspensionResume` 565–644、`driveApprovalResume` 645–760）。
- 测试：无同名 spec；`mastra-workflow.runtime.spec.ts`（2,809 行）、`conversation-title.spec.ts`、`assistant-approval-boundary.spec.ts` 间接覆盖。
- 接缝与拆法：`mastra-run-lifecycle.ts`（start/resume/recover/cancel）、`mastra-suspension-resume.ts`（两类 resume 驱动）、`mastra-run-queries.ts`（get/list/messages/usage）；运行时类保留端口转发与依赖。
- 风险：中高。AI 运行时的恢复语义与幂等约束强，建议在第二批并且只做「同一类内提取」，不跨包。

**11) `packages/ai/src/electron/index.ts` — 1,303 行**
- 职责：AI 模块的 Electron 装配：45 个 `ipcMain.handle` 通道（provider、conversation、local-agent、assistant 流、workflow、knowledge、analytics、evaluation）与销毁。
- 单一性：否（一个注册函数 176–1,303，1,128 行）。对比同仓其他 Electron 模块：goal 563、repository 560、task 538、notification 426，本文件是次大者的 2.3 倍。
- 测试：无同名 spec；`ai-application-capabilities.surface.spec.ts` 引用该模块。
- 接缝与拆法：`electron/handlers/provider.ts`、`conversation.ts`、`assistant-runtime.ts`、`workflow.ts`、`knowledge-analytics.ts`，每个导出 `registerXHandlers(context, deps)`；`createAIElectronModule` 只做顺序装配。通道名与处理顺序保持不变。
- 风险：中。当前缺少直接测试，拆完后应以一次 Electron 侧 surface 测试或通道清单测试兜底。

**12) `packages/ai/src/server/infrastructure/ai.module.ts` — 911 行**
- 职责：AI 模块组合根：仓储/端口/用例装配、runtime contributions 归一化、部分启动策略。
- 单一性：否。`createAIModule` 445 行（467–911）。
- 测试：`__tests__/ai-module-partial-start.spec.ts`（111 行）、`ai-module-mastra-lifecycle.spec.ts`、`apps/*/runtime/compose-ai.spec.ts`。
- 接缝与拆法：参照同仓 `task.module.ts` 已有的 `createTaskUseCases` 模式，抽 `createAIUseCases(dependencies)`（用例装配，约 300 行）与 `createAIRuntimeContributions()`；`createAIModule` 只保留生命周期与对外实例。该模式已是仓库惯例，改造方向一致。
- 风险：中。装配顺序与「未配置能力返回 SERVICE_UNAVAILABLE」的 fail-closed 行为必须保持。

**13) `packages/notification/src/server/infrastructure/runtime/notification.runtime.ts` — 978 行**
- 职责：通知 durable runtime 工厂：认领/派发/重试/死信、SSE 适配器、指标、回执查询、渠道投递器装配。
- 单一性：否。`createNotificationRuntimeContribution` 单函数 238–928，**691 行**，返回一个包含十几个方法的对象字面量。
- 测试：`notification.runtime.spec.ts`（193 行）、`notification-durable-dispatch.spec.ts`、`notification-powersync-durable-worker.spec.ts`、`notification-module-partial-start.spec.ts`。
- 接缝与拆法：`notification-dispatch-loop.ts`（`processClaimedDispatch` 387–637 及 `tick`/`processNotificationRequested`）、`notification-sse-adapter.ts`、`notification-dead-letter.ts`、`notification-metrics.ts`；工厂只组装并返回端口对象。
- 风险：中。派发/重试/死信是一个状态机，拆分必须保留调用顺序与共享闭包状态（`sseAdapter`、in-flight 集合）。

**14) `packages/repository/src/server/application/services/knowledge-repository-connection.service.ts` — 1,119 行**
- 职责：安装 intent（开始/回调/最终化）、连接/断连、观察状态刷新、首轮对账预览、head 确认。
- 单一性：否。`connect` 172 行（413–584）、`confirmHead` 255 行（723–977）。
- 测试：同名 spec 916 行 + `knowledge-remote-binding-ownership.surface.spec.ts`。
- 接缝与拆法：`knowledge-installation-intent.service.ts`（148–412：start/receive/finalize/status）、`knowledge-connection-observation.ts`（607–626、1,001–1,119：观察构建与刷新）、`knowledge-head-confirmation.ts`（688–977）；主服务保留连接/断连与对外端口。
- 风险：中。安装 intent 的身份绑定与幂等是安全边界，测试覆盖好但改动需逐条对照。

**15) `packages/repository/src/electron/local-vault-runtime.ts` — 1,053 行**
- 职责：本地 Vault 绑定、扫描与索引、笔记读取/搜索、Obsidian 打开、确认写入、内容状态检查、代数（generation）失效。
- 单一性：否（读路径、写路径、投影缓存、平台适配）。
- 测试：同名 spec 688 行，覆盖绑定归属、健康观察、schema 迁移、扫描。
- 接缝与拆法：`local-vault-scan.ts`（401–522）、`local-vault-write.ts`（652–866）、`local-vault-projection-cache.ts`（889–1,050）；`LocalVaultRuntime` 保留端口方法与生命周期。
- 风险：中。`generation`/`scope` 断言与缓存失效顺序是核心不变量。

**16) `apps/desktop/src/main/modules/repository/desktop-knowledge-repository-git.runtime.ts` — 1,199 行**
- 职责：Git 子进程端口、manifest 校验、同步状态文件、fetch/rebase/push 状态机、冲突错误构造。
- 单一性：否（进程适配 + 状态机 + 清单协议）。
- 测试：同名 spec 660 行。
- 接缝与拆法：`git-process.port.ts`（42–126）、`git-sync-state.ts`（533–593 的读写/清理）、`git-rebase-guard.ts`（487–675 的 rebase/ancestor/remote 校验）；运行时类保留 `inspect/reconcile/prepare/synchronize` 编排。
- 风险：中。Git 状态机的错误分类（冲突/历史被改写）必须逐字保留。

**17) `packages/routine/src/server/application/routine-portability.ts` — 854 行**
- 职责：Routine 可移植能力：导出、导入校验、dry-run 收敛计划、apply、occurrence 身份对齐。
- 单一性：是（一个 `PortableCapability` 实现），但三个方法各自 154/164/271 行。
- 测试：同名 spec 531 行，覆盖往返、全局门、occurrence 收敛、缺失 owner fact 的 fail-closed。
- 接缝与拆法：同包内 `routine-portability/export.ts`、`validate.ts`、`plan.ts`、`apply.ts`，类只保留编排与依赖；或先抽 `routine-portability-occurrence.ts`（occurrence 收敛，apply 内最大块）。
- 风险：中。apply 是事务性变更，抽取仅限纯映射/计划函数，避免跨事务边界。

**18) `packages/routine/src/server/application/services/routine-coach-command.service.ts` — 836 行**
- 职责：Routine coach 命令端口工厂：偏好、Routine CRUD、Profile CRUD、成员关系、临时覆盖、occurrence 响应、preset protocol 启动与协议流转。
- 单一性：否。`createRoutineCoachCommandService` 541 行（295–835），返回 16 个命令方法。
- 测试：同名 spec 629 行，通过 `RoutineCoachCommandPort` 覆盖各命令。
- 接缝与拆法：`services/routine-coach/commands-preferences.ts`、`commands-routine.ts`、`commands-profile.ts`、`commands-membership.ts`、`commands-protocol.ts`，各自导出 `createXCommands(ctx)`；工厂按对象展开组装，键与签名不变。
- 风险：低（见 §5 第一批）。

**19) `packages/ai-ui/src/composables/useAIChatView.ts` — 1,294 行**
- 职责：聊天视图组合式：模型选择与能力校验、会话切换/重命名/归档、工作流投影与恢复、知识笔记捕获、surface context 同步、composer 高度。
- 单一性：否。单函数 `useAIChatView` 1,216 行（79–1,294），返回大量状态与动作。
- 测试：`useAIChatView.lifecycle.spec.ts` 1,269 行（生命周期为主），另有 `useAIChatSession.spec.ts` 2,751 行覆盖底层会话。
- 接缝与拆法：`useComposerModelSelection.ts`（297–661：原生模型选项、`selectComposerModel` 149 行、权限）、`useAIChatWorkflowProjection.ts`（886–1,008）、`useAIChatConversationSwitch.ts`（1,009–1,100）；主 composable 组合并转出。
- 风险：中。模型选择与 workflow 投影共享大量状态，边界需先画出状态归属。

**20) `packages/app-vue/src/layouts/shell/AppShell.vue` — 1,583 行**
- 职责：应用外壳：布局几何（chat/split/focus）、侧栏/业务面板拖拽与焦点恢复、顶栏胶囊、业务 Tab、设置场景、全局 composer、多个对话框宿主。
- 单一性：否，但它是 shell 编排的合理位置；问题在于单文件承载了「几何 + 交互 + 场景」。
- 测试：同名 spec 831 行，覆盖侧栏/右栏 resize、焦点恢复、卸载清理、设置路由、胶囊入口。
- 接缝与拆法：`useShellPanelResize.ts`（502–760：宽度计算、拖拽、焦点守卫、resize disposer）、`useShellScene.ts`（131–205：`shellScene`/`isSettingsScene`/`sidebarPresentation`）、`ShellOverlaySidebar.vue`（1,362–末尾的窄屏 Sheet）；模板保留工作区结构。
- 风险：中低。resize/焦点守卫是全仓最细的 DOM 行为，但已有专门测试；建议在第二批作为首项。

**21) `packages/ai/src/api/routes/ai-runtime.routes.ts` — 885 行**
- 职责：AI 运行时 HTTP 路由注册：workspace SSE、assistant SSE/历史/ask-user/attention/approval/cancel/delete、usage、workflow start/resume/lease/get/list/cancel。
- 单一性：否，17 条路由一个函数。
- 测试：`ai-runtime.routes.test.ts` 869 行，通过 `router.stack` 取处理器并断言鉴权、流式与失败脱敏行为。
- 接缝与拆法：按 ADR-021 拆 `api/routes/ai-assistant-stream.routes.ts`（workspace SSE、assistant SSE、history、ask-user pending）、`ai-assistant-control.routes.ts`（answer/attention/approval/cancel/delete）、`ai-workflow.routes.ts`、`ai-usage.routes.ts`；每个导出 `registerX(router, deps, auth)`，`registerAIRuntimeRoutes` 只按原顺序调用。**保持同一 Router 实例**，避免改变 `router.stack` 形状。
- 风险：低（见 §5 第一批）。

**22) `packages/repository/src/server/infrastructure/services/github-app-client.ts` — 837 行**
- 职责：GitHub App JWT、installation token、installation/repository inventory、contents 读写、错误映射。
- 单一性：是（一个外部服务的 anti-corruption client），但职责内有 3 个明显分区。
- 测试：同名 spec 890 行。
- 接缝与拆法：`github-app-auth.ts`（JWT/token）、`github-installation-inventory.ts`（`getInstallationInventory` 173–219 等）、`github-contents.ts`（文件读写）；client 保留 HTTP 基础设施与错误映射。
- 风险：中。token 缓存与错误码映射是安全相关逻辑，抽取不得改变重试/缓存语义。

**23) `packages/repository/src/server/application/services/knowledge-note-commit.service.ts` — 818 行**
- 职责：知识笔记创建/采纳：幂等记录、CAS 元数据提交、Git 写入、索引投影、并发队列。
- 单一性：否。`adopt` 单方法 158–770，**613 行**。
- 测试：同名 spec 1,066 行 + 写请求账本集成测试，覆盖幂等、stale blob 拒绝、单次提交、投影与指标。
- 接缝与拆法：`knowledge-adoption-request.ts`（请求校验/哈希/CAS 前置条件）、`knowledge-adoption-commit.ts`（Git 提交与投影）、`knowledge-write-queue.ts`（`connectionQueues` 串行化，740–770）；服务方法保留编排。
- 风险：中。事务与队列顺序是正确性核心，必须保留单一事务边界。

**24) `packages/ai-ui/src/composables/useGoalNativeReviewCoordinator.ts` — 1,180 行**
- 职责：Goal 原生评审会话协调：native live 投影、评审会话生命周期、owner 提交/批准/修订、goal 重启与只读保留、surface 控制。
- 单一性：否。单函数 1,148 行（33–1,180），内含约 30 个嵌套函数。
- 测试：**无直接测试**（全仓 grep 未找到引用）。
- 接缝与拆法：`useGoalNativeLiveProjection.ts`（102–306）、`useGoalNativeReviewSession.ts`（353–704）、`useGoalRestartFlow.ts`（705–947）、`useGoalClarificationResponse.ts`（884–947）；主 coordinator 组合。
- 风险：高。无测试且状态机细密，必须「先补特征测试，再拆」，不建议进入前两批。

#### 2.1.2 需要先补测试或先做架构决策

**25) `packages/ai/src/server/local-agent/local-agent-runtime.ts` — 1,207 行**
- 职责：本地 Agent 运行时：连接/目录缓存/探针、会话 CRUD、`dispatchMessage` 流式执行、暂停与工具授权、注销与清理。
- 单一性：否。`dispatchMessage` 605–1,057，**453 行**的 async generator，混杂模型校验、权限、事件投影、失败记账与清理。
- 测试：同名 spec 1,291 行，覆盖目录复用、模型切换、未广告选项拒绝等。
- 接缝与拆法：`local-agent-dispatch.ts`（把 `dispatchMessage` 拆为 `prepareTurn`/`streamTurn`/`finalizeTurn` 三个阶段函数）、`local-agent-catalog.ts`（191–278 的目录与探针缓存）；类保留端口方法。
- 风险：高。流式生成器的取消、grant 回收、失败计数顺序都是行为契约，不宜在第一、二批动。

**26) `apps/desktop/src/main/main.ts` — 998 行**
- 职责：Electron 主进程组合根：注册全部业务模块（577 行）、初始化 shell runtime（231 行）、窗口/生命周期接线。
- 单一性：否，但组合根本身就是「聚合」；问题是单个函数过宽。
- 测试：无单测；仅 `desktop-update-shell-ownership.surface.spec.ts` 间接涉及启动路径。
- 接缝与拆法：`runtime/register-goal.ts`、`register-task.ts`、`register-routine.ts`…（与既有 `compose-*.ts` 对称），`registerBusinessModules` 只按顺序调用；`initializeShellRuntime` 同理拆分。
- 风险：高。启动顺序、单例与宿主资源生命周期没有自动化兜底，必须有一份启动 smoke 再动。

**27) `packages/notification/src/server/infrastructure/adapters/powersync/power-sync-notification-reliable.adapter.ts` — 952 行**
- 职责：PowerSync 可靠投递适配器：outbox 认领/围栏令牌/心跳/确认/死信、表初始化。
- 单一性：是（一个适配器），但内含 `newFencingToken`（55 行）等长方法。
- 测试：仅 `power-sync-notification-reliable.adapter.test.ts` 50 行，另有 durable worker 测试间接覆盖；**直接测试偏薄**。
- 接缝与拆法：`powersync-outbox-claim.ts`（认领与围栏）、`powersync-outbox-heartbeat.ts`、`powersync-outbox-ddl.ts`；适配器保留端口实现。
- 风险：中高。围栏/租约是并发正确性核心，先补测试更稳。

**28) `packages/goal/src/server/domain/aggregates/goal.ts` — 1,179 行**
- 职责：Goal 聚合根：生命周期、时间框、提醒、关键结果、权重快照、评审、持久化投影。
- 单一性：是（一个聚合根），**不应按文件机械拆分**；但聚合偏胖，可抽策略/值对象。
- 测试：`goal.spec.ts` 245 + `goal-management.spec.ts` 258 + `goal-planning-time.spec.ts` 146 + `goal-w2.spec.ts` 112 + `goal-domain-events.spec.ts` 89 + 领域服务测试约 670 行，覆盖较好。
- 接缝与拆法：把提醒触发管理（501–601）抽为 `goal-reminders.policy.ts`，把权重快照（845–898）抽为领域服务；聚合保留不变量与状态迁移。
- 风险：高。聚合边界与事件顺序属于领域决策，必须走 ADR/Issue 讨论，不在代码整洁批次内处理。

**29) `packages/setting-ui/src/components/LocalAgentSettings.vue` — 829 行**
- 职责：本地 Agent 连接设置：驱动选择、登录流程、模型目录、默认运行时、权限。
- 单一性：否。模板 413 行，脚本 415 行。
- 测试：**无直接测试**。
- 接缝与拆法：`LocalAgentConnectionCard.vue`、`LocalAgentLoginPanel.vue`、`LocalAgentModelList.vue`、`useLocalAgentSettings.ts`。
- 风险：中。无测试，先补组件测试再拆。

**30) `packages/ai-ui/src/composables/useConversationProjection.ts` — 813 行**
- 职责：会话投影：列表排序/更新、历史拉取与规范化、归档分页、重命名、删除、确保会话创建。
- 单一性：否。单函数 791 行（23–813）。
- 测试：**无直接测试**（由 `useAIChatSession.spec.ts` 间接覆盖部分路径）。
- 接缝与拆法：`useConversationList.ts`（36–123、316–422）、`useConversationHistory.ts`（423–515）、`useConversationArchive.ts`（663–733）；投影组合。
- 风险：中高。无直接测试，且与会话缓存/实时事件耦合。

#### 2.1.3 合理，不应拆

**31) `packages/powersync-schema/src/index.ts` — 999 行**
- 声明式表定义（`new Table({...})`），是 Desktop/Web PowerSync 客户端 schema 的**单一真源**，文件头已注明。拆分只会制造「schema 分散」的维护风险，收益为零。
- 测试：`index.spec.ts` 158 行校验表集合与列类型。结论：不拆。

**32) `packages/app-vue/src/locales/en-US/goal.ts` — 877 行**
**33) `packages/app-vue/src/locales/zh-CN/goal.ts` — 859 行**
**34) `packages/app-vue/src/locales/en-US/aiAssistant.ts` — 809 行**
- i18n 资源表，纯数据；按 namespace 拆文件只会增加加载与查找成本，且与语言文件对齐关系变复杂。结论：不拆。若继续增长，可按 `goal.detail.*` / `goal.list.*` 分子 namespace（低优先级）。

**35) `eslint.config.ts` — 804 行**
- 治理配置：scope 边界矩阵与例外集中在一处是有意设计（可审计）。拆成多个 config 文件会降低「一处看清全部边界规则」的能力。结论：不拆；如需降低阅读成本，可把 scope 矩阵抽成 `tools/lint/scope-matrix.ts` 数据表（可选，低收益）。

### 2.2 600–800 行中最可疑的若干

**A) `packages/notification/src/api/routes.ts` — 612 行**
- `registerNotificationRoutes` 单函数 71–612，**542 行**，21 条路由 + OpenAPI 元数据内联。
- 测试：`routes.spec.ts` 690 行，通过公开注册函数验证路径、OpenAPI 注册与处理行为。
- 拆法：按 ADR-021 拆 `api/routes/notification-inbox.routes.ts`（CRUD + 已读）、`notification-preference.routes.ts`、`notification-operations.routes.ts`（死信/回执/时间线/审计）、`notification-stream.routes.ts`（SSE）；`routes.ts` 保留单一导出并原序调用。
- 风险：低。→ 第一批。

**B) `packages/app-vue/src/shared/composables/useDesktopProfiles.ts` — 619 行**
- `useDesktopProfiles` 单函数 73–619，**547 行**，返回 **44 个键**（573–618），混合本地 Profile 管理、解锁、云登录、GitHub device flow、注册（云/本地）、访问视图状态机。
- 测试：`useDesktopProfiles.spec.ts` 407 行；`DesktopProfileList.spec.ts`、`ManageAccountsDialog.spec.ts` 覆盖消费方。
- 拆法：`useDesktopProfileCatalog.ts`（列表/选择/重命名/删除）、`useDesktopProfileUnlock.ts`（密码/访问视图）、`useDesktopCloudSignIn.ts`（云登录 + GitHub device）、`useDesktopRegistration.ts`（注册表单）；原 composable 组合后返回同名键。
- 风险：低-中。→ 第一批。

**C) `packages/ai/src/server/mastra/context/ai-context-assembler.ts` — 700 行**
- `assemble` 438–643，206 行，负责预算分配、分区裁剪、脱敏与排序。
- 测试：同名 spec 224 行。
- 拆法：`ai-context-budget.ts`（token 预算与裁剪）、`ai-context-redaction.ts`（SECRET_FIELD_NAMES 脱敏）；assembler 保留编排。
- 风险：中。预算与顺序影响模型输入，必须保持 section 顺序与截断点。

**D) `packages/ai-ui/src/composables/useAssistantStream.ts` — 794 行**
- `handleSendChat` 548–780（233 行）、`applyRuntimeEvent` 359–546（188 行），同一个 composable 内承担发送与事件归并。
- 测试：同名 spec 410 行。
- 拆法：`useAssistantSend.ts` 与 `useAssistantEventReducer.ts`；流式事件 reducer 可以是纯函数，便于补测试。
- 风险：中。事件顺序与去重是行为核心。

**E) `packages/goal/src/server/application/goal-portability.ts` — 696 行**
- `assertExistingGoalMatchesPortableDefinition` 131–285（155 行）与 `export` 90 行，属于同一能力的校验/导出分区。
- 测试：同名 spec 717 行。
- 拆法：`goal-portability-assertions.ts`（定义一致性校验）；主能力保留 import/export 编排。
- 风险：中低。纯校验逻辑，适合在第二批随 `routine-portability` 一起处理。

**F) `packages/utils/src/validation/form-validator.ts` — 645 行**
- 单个 `FormValidator` 类，含异步校验取消、事件派发、结果构造。
- 测试：**该目录无任何 spec**。
- 拆法：`validation/rules-runner.ts`（`filterApplicableRules` 280–524）、`validation/result-factory.ts`（543–636）、`validation/events.ts`；类保留对外 API。
- 风险：中。无测试的通用库，先补测试再拆。

**G) `packages/ai/src/server/local-agent/acp-driver.ts` — 690 行**
- `connect` 117 行、`modelsFromOptions` 94 行、`notification` 58 行；驱动协议适配集中在单文件。
- 测试：通过 `local-agent-runtime.spec.ts` 间接覆盖（驱动被替换/模拟）。
- 拆法：`acp-model-catalog.ts`（选项→模型映射）、`acp-session-connect.ts`；驱动保留协议消息循环。
- 风险：中高。外部进程协议，错误处理细节多。

---

## 3. 可复用性 / 重复热点

### 3.1 既有共享包盘点

| 包 | 职责 | 规模（源码） |
| --- | --- | ---: |
| `ui-core` | 无框架 headless UI 逻辑（color-picker、dialog、form validation、loading、message） | 9 文件 / 684 行 |
| `ui-vue-shadcn` | Vue primitive 的唯一 Module（wrapper + 样式 + contract tests） | 410 文件 / 13,104 行 |
| `ui-react-native` | React Native 适配层 | 15 文件 / 1,007 行 |
| `ui-host-contracts` | 平台渲染宿主契约 | 4 文件 / 173 行 |
| `app-vue` / `app-react` | Vue / React 宿主装配（路由、i18n、shell、平台适配） | 29,578 / 9,424 行 |
| `shared-primitives` | 跨域纯类型与值对象（Instant/Ymd/Hm/IDs/优先级等） | 19 文件 / 631 行 |
| `utils` | 技术性通用能力；子路径 `domain`/`errors`/`frontend`/`logger`/`result`/`shared`/`validation`/`lifecycle` | 58 文件 / 7,504 行 |
| `patterns` | 可复用设计模式与调度原语（租约、优先队列、operations） | 26 文件 / 1,637 行 |
| `time` | 产品时间 owner：TimeContext/Clock/Format/Calendar/recurrence | 25 文件 / 2,285 行 |
| `transport-contracts` | Result/协议/传输契约 | 14 文件 / 1,642 行 |
| `http-client` / `ipc-client` | HTTP / Electron IPC 客户端 | 8 / 5 文件 |
| `host-runtime` | 宿主运行时、全局注册表、authenticated IPC 工厂 | 8 文件 / 369 行 |
| `test-utils` | 统一测试基建（setup、mock factory、matchers） | 18 文件 / 1,332 行 |
| `goal-core` | Goal 纯计算（进度计算、预览、ID） | 6 文件 / 199 行 |
| `database` / `powersync-schema` | Prisma 基础设施 / PowerSync 客户端 schema | 2,628 / 1,013 行 |
| `desktop-contracts` | 桌面与 IPC 通道契约 | 15 文件 / 1,266 行 |
| `reliable-messaging-contracts` / `operations-contracts` | 可靠消息 / 操作时间线契约 | 1,148 / 94 行 |

观察：`ui-core`（684 行）与 `ui-vue-shadcn`（13,104 行）体量差近 20 倍，说明跨框架 headless 层尚未吸收各 UI 包里的展示派生逻辑；`utils` 已经承担了 `shared/error-message`、`parse-query-value`、`uuid` 等零散工具，是低风险抽取的默认落点。

### 3.2 重复热点与抽取候选

**H1. `withAuthenticatedValidation` 三份逐字相同（鉴权 + schema 校验组合器）**
- 证据：
  - `packages/goal/src/electron/authenticated-ipc.ts:67-83`
  - `packages/task/src/electron/authenticated-ipc.ts:65-81`
  - `packages/notification/src/electron/authenticated-ipc.ts:73-89`
  - 对 goal 与 task、goal 与 notification 的该函数做 `diff`，输出为空；三处还各自重复 `ZodLikeSchema` / `IpcInvokeEventLike` 结构类型。
- 规模：3 × 约 35 行（含类型与注释约 50 行/处）。
- 现状对照：全仓 9 个特性包（account / data-portability / goal / notification / repository / schedule / scheduler / setting / task）的 `withAuthenticatedValue` / `withAuthenticatedIdentity` 都已经由 `packages/host-runtime/src/electron-ipc/authenticated-ipc.ts` 的工厂生成，唯独 validation 组合器没有上收。
- 抽取候选：在既有 `host-runtime/electron-ipc` 增加 `createAuthenticatedValidationHandler()`，三包改为引用。**无需新建包。**
- 收益：消除安全边界代码的三份漂移风险；风险：低（纯工厂搬迁，签名不变）。

**H2. `normalizeRuntimeContributions` 六份同构实现**
- 证据：`packages/ai/src/server/infrastructure/ai.module.ts:378-390`、`packages/task/.../task.module.ts:176-188`、`packages/repository/.../repository.module.ts:50-60`、`packages/schedule/.../schedule.module.ts:120-125`、`packages/notification/.../notification.module.ts:117-125`、`packages/account/.../account.module.ts:120-134`。
- 规模：6 处、11–15 行/处，逻辑均为 `undefined → []`、数组 → 拷贝、单值 → 单元素数组，只是泛型参数不同。
- 抽取候选：`@memoflow/utils/shared` 增加 `normalizeContribution<T>(input?: T | readonly T[]): readonly T[]`。六个包均已依赖 `@memoflow/utils`（已核对 `package.json`），无新增依赖边。
- 收益：中（消除 6 处同构噪声）；风险：低。

**H3. `isRecord` 对象守卫八份**
- 证据：`packages/ai/src/server/mastra/agents/goal-planner-output.ts:7`、`packages/ai-ui/src/composables/useAIWorkflowPersistence.ts:21`、`packages/task/src/server/application/outbox/task-goal-outbox-dispatcher.ts:129`、`packages/routine/src/server/infrastructure/routine-schedule/routine-schedule-contract.ts:175`、`packages/routine/src/server/infrastructure/routine-vnext/trigger-persistence-parity.ts:117`、`packages/database/src/schema/notification-preference-hierarchy.ts:30`、`apps/desktop/src/main/database/powersync-crud.ts:9`、`apps/desktop/src/main/utils/http-envelope-guards.ts:9`（另 `packages/transport-contracts/src/result/core.ts:84` 因依赖方向必须保留）。
- 规模：8 处、每处 3–6 行。
- 抽取候选：`@memoflow/utils/shared/guards.ts`；**注意**：`utils` 依赖 `transport-contracts`（已核对），所以 `transport-contracts` 不能反向引用 `utils`，其私有副本应保留。
- 收益：低-中；风险：低。

**H4. 知识仓库展示派生函数跨 UI 包复制**
- 证据：
  - `packages/setting-ui/src/components/KnowledgeRepositorySettings.vue:608` 与 `packages/repository-ui/src/views/KnowledgeProjectionWorkspaceView.vue:669` 的 `repositoryDisplayName` 逐字相同；
  - 同两文件 `:612` 与 `:673` 的 `repositoryDefaultBranch` 逐字相同；
  - `:622` 与 `:677` 的 `providerStateLabel` 仅 i18n key 前缀不同；
  - `formatUpdatedAt` 在 `KnowledgeProjectionWorkspaceView.vue:683` 与 `packages/repository-ui/src/components/KnowledgeNoteContextPanel.vue:134`（`formattedUpdatedAt` computed）各一份。
- 规模：约 5 个函数、20 行，但属于**会随 DTO 演进而漂移**的展示规则。
- 抽取候选：在 `@memoflow/repository-contracts` 增加无框架的纯选择器（`resolveRepositoryDisplayName`/`resolveDefaultBranch`/`resolveProviderState`），渲染与 i18n 留在各自 UI。**不建议**把 `setting-ui` 改为依赖 `repository-ui`（新增跨 scope 边界，成本高）。
- 收益：中；风险：中低（contracts 增加展示辅助函数需要确认不违反「contracts 只放 DTO/Schema」的约定；若不允许，则先在 `repository-ui` 内抽并保持 setting-ui 独立）。

**H5. 包源码别名/注册清单双份维护**
- 证据：`vite.workspace-aliases.ts`（711 行）与 `vitest.workspace-helpers.ts`（606 行）各自枚举包与子路径别名；两处都必须随新包/新子路径同步。`tsconfig.workspace-src.json` 有 146 个 `@memoflow` 条目、`tsconfig.workspace-dist.json` 有 134 个。
- 规模：约 1,300 行配置，两份同源信息。
- 抽取候选：单一 `tools/workspace-package-map.ts` 数据表，由 Vite 与 Vitest 助手共同消费。**不需要新建业务包**，但属于工具链改动，需在 CI 全绿下验证。
- 收益：高（直接降低「新建包」的注册成本，回应本次审查的成本判断）；风险：中（构建/测试解析路径出错影响面大）。

**H6. 通知包内 SQLite DDL 重复，并与 `powersync-schema` 真源存在潜在漂移**
- 证据：`packages/notification/src/server/infrastructure/adapters/powersync/notification-powersync.repository.ts:142`（创建 `notification_interactions`、`notification_delivery_decisions`、`notification_dispatch_outbox`）与 `.../power-sync-notification-reliable.adapter.ts:271`（创建 `outbox_messages` 及索引）；同一批 outbox 列（`fencing_token`、`lease_expires_at`、`claim_id` 等）在两处与 `packages/powersync-schema/src/index.ts` 各自维护。
- 规模：2 处 DDL、约 100 行；列集合与 schema 真源部分重叠。
- 抽取候选：包内 `powersync-ddl.ts` 导出常量，两适配器共用；同时核对哪些表应由 schema 真源创建、哪些是适配器自有本地表（现有注释已说明视图不可创建）。**无需新建包。**
- 收益：中（避免列漂移）；风险：中（DDL 变更涉及本地数据兼容，需迁移验证）。

**H7. UI 侧绕过 `@memoflow/time` 自建日期格式化**
- 证据：`packages/repository-ui/src/views/KnowledgeProjectionWorkspaceView.vue:683`、`packages/repository-ui/src/components/KnowledgeNoteContextPanel.vue:135`、`packages/setting-ui/src/components/DesktopUpdateSettingsSection.vue:109` 直接 `new Intl.DateTimeFormat(locale.value, ...)`；而 `packages/time/src/format/format.ts` 与 `session.formatPattern` 已提供产品时间格式化 seam（ADR-101）。
- 规模：3 处、各 5–8 行；另有 `app-vue/src/shared/components/ProductTemporalPickerSurface.vue:216` 的 UTC 月名格式化属于日历控件专用，可保留。
- 抽取候选：优先收敛到 `@memoflow/time` 的 presentation API；若只是一次性绝对时间戳，先在 `repository-ui` 内抽 `formatReferenceDate()`。**无需新建包。**
- 收益：低-中；风险：低。

**H8. 各域 `business-data-presence` 存在性检查模式重复（可选）**
- 证据：9 个同名文件，`packages/goal/.../business-data-presence.ts`（16 行）、`packages/repository/.../business-data-presence.ts`（14 行）、`packages/ai/.../business-data-presence.ts`（47 行）等，合计 169 行；结构均为「对若干 Prisma delegate 逐个 `findFirst({ where: { identityId }, select: { id: true } })`」。
- 抽取候选：`@memoflow/database` 提供 `createExistenceCheck(db, delegates)`。收益低（每域表不同，泛型约束强），风险中低。列入「可选，暂不排期」。

**明确不应合并的「重复」**

- Prisma 与 PowerSync 的 per-aggregate mapper（如 `prisma-goal-mapper.ts` 161 行 vs `powersync-goal.mapper.ts` 119 行）：两种持久化形态的字段映射本就不同，强行共用会引入条件分支。
- `app-vue/src/shared/utils/product-time.ts` 与 `app-react/src/utils/product-time.ts`：都是 `@memoflow/time` 之上的**框架适配薄层**（Vue 响应式、React 无响应式、空标签语义不同），代码短且职责明确。
- 各域 `portable-v3.ts`、`response-schemas.ts`：契约按域所有权拆分，是 ADR-010/ADR-017 的直接结果。
- `en-US` / `zh-CN` 语言文件：天然成对。

---

## 4. 其他可维护性问题

### 4.1 超长函数（>150 行，按长度排序）

| # | 位置 | 函数 | 行数 |
| --- | --- | --- | ---: |
| 1 | `packages/ai-ui/src/composables/useAIChatView.ts:79` | `useAIChatView` | 1,216 |
| 2 | `packages/ai/src/electron/index.ts:176` | `createAIElectronModule` | 1,128 |
| 3 | `packages/ai-ui/src/composables/useGoalNativeReviewCoordinator.ts:33` | `useGoalNativeReviewCoordinator` | 1,148 |
| 4 | `packages/ai-ui/src/composables/useConversationProjection.ts:23` | `useConversationProjection` | 791 |
| 5 | `packages/notification/src/server/infrastructure/runtime/notification.runtime.ts:238` | `createNotificationRuntimeContribution` | 691 |
| 6 | `packages/repository/src/server/application/services/knowledge-note-commit.service.ts:158` | `adopt` | 613 |
| 7 | `apps/desktop/src/main/main.ts:171` | `registerBusinessModules` | 577 |
| 8 | `packages/app-vue/src/shared/composables/useDesktopProfiles.ts:73` | `useDesktopProfiles` | 547 |
| 9 | `packages/notification/src/api/routes.ts:71` | `registerNotificationRoutes` | 542 |
| 10 | `packages/routine/src/server/application/services/routine-coach-command.service.ts:295` | `createRoutineCoachCommandService` | 541 |
| 11 | `packages/ai/src/server/local-agent/local-agent-runtime.ts:605` | `dispatchMessage` | 453 |
| 12 | `packages/ai/src/server/infrastructure/ai.module.ts:467` | `createAIModule` | 445 |
| 13 | `packages/repository/src/server/application/services/knowledge-repository-connection.service.ts:723` | `confirmHead` | 255 |
| 14 | `packages/ai-ui/src/composables/useAssistantStream.ts:548` | `handleSendChat` | 233 |
| 15 | `packages/ai/src/server/mastra/context/ai-context-assembler.ts:438` | `assemble` | 206 |
| 16 | `packages/repository/src/server/application/services/knowledge-repository-projection.service.ts:1039` | `processDeliveryOwned` | 201 |
| 17 | `packages/goal-ui/src/components/dialogs/GoalDialog.vue:432` | `publishSession` | 200 |
| 18 | `packages/ai-ui/src/composables/useAssistantStream.ts:359` | `applyRuntimeEvent` | 188 |
| 19 | `apps/desktop/src/main/lifecycle/window-manager.ts:599` | `registerIpcHandlers` | 165 |
| 20 | `packages/goal/src/server/application/goal-portability.ts:131` | `assertExistingGoalMatchesPortableDefinition` | 155 |
| 21 | `packages/routine/src/server/application/routine-portability.ts:245` | `export` | 154 |
| 22 | `packages/ai-ui/src/composables/useAIChatView.ts:513` | `selectComposerModel` | 149 |

说明：`useAIChatView`、`useAIChatSession`、`useGoalNativeReviewCoordinator` 这类「单函数返回 30–100 个成员」的组合式函数，本质上是把整个页面控制器塞进一个闭包。它们比同规模类更难做单元测试（无法局部 mock），也是 §2 中大文件与「无直接测试」高度重合的原因。

### 4.2 深层嵌套

按脚本范围内最大缩进估算（2 空格/层）：

- `packages/ai/src/server/local-agent/local-tool-bridge.ts:348` — 缩进 36（约 18 层），出现在 approval promise 的 `.then(async …)` 内再嵌条件与回调；文件 580 行。
- `packages/ui-react-native/src/components/PageActionDrawer.tsx:150` — 约 16 层。
- `packages/app-react/src/screens/ScheduleScreen.tsx:131`、`packages/app-react/src/screens/GoalDetailScreen.tsx:268` — 约 16 层。
- `packages/app-react/src/screens/TaskDetailScreen.tsx:312`、`packages/ai/src/server/mastra/agents/goal-planner-output.ts:65` — 约 15 层。
- `packages/ai/src/server/local-agent/claude-driver.ts:166` — 约 14 层。

`local-tool-bridge.ts` 的深层嵌套主要来自「授权回调 + Promise 链 + 生成器」叠加，建议以早返回/提取 `requestToolApproval()` 函数降低深度（第二批可附带，不必单独排期）。

### 4.3 巨型组件 / 巨型模板

| 文件 | 模板行数 | 模板范围 |
| --- | ---: | --- |
| `packages/goal-ui/src/views/GoalDetailView.vue` | 716 | 1–716 |
| `packages/task-ui/src/views/TaskDetailView.vue` | 670 | 1–670 |
| `packages/setting-ui/src/components/KnowledgeRepositorySettings.vue` | 460 | 1–460 |
| `packages/app-vue/src/layouts/shell/ConversationSidebar.vue` | 434 | 389–822 |
| `packages/ai-ui/src/components/AIGoalWorkflowPanel.vue` | 432 | 1–432 |
| `packages/routine-ui/src/views/RoutineConfigurationView.vue` | 424 | 1–424 |
| `packages/app-vue/src/layouts/shell/AppShell.vue` | 419 | 1,030–1,448 |
| `packages/setting-ui/src/components/LocalAgentSettings.vue` | 413 | 417–829 |
| `packages/ai-ui/src/components/AIMessagePanel.vue` | 412 | 1–412 |
| `packages/repository-ui/src/views/KnowledgeProjectionWorkspaceView.vue` | 374 | 1–374 |

模板本身不是问题，问题是「模板 + 同文件脚本 + 同文件状态机」三者叠加。`GoalDetailView` 与 `TaskDetailView` 的模板均超过 600 行且脚本另有 400–800 行，是最典型的巨型组件。

### 4.4 测试文件同样巨型（但优先级低）

`mastra-workflow.runtime.spec.ts` 2,809 行、`useAIChatSession.spec.ts` 2,751 行、`useAIGoalWorkflow.spec.ts` 2,230 行、`GoalDialog.spec.ts` 1,966 行。测试的拆分不改变运行时行为，但会改变「一个测试文件对应一个失败信号」的可诊断性。建议随对应源码拆分同批处理，不单独排期。

### 4.5 其他具体问题

1. **验收测试放在生产源码树里**：`apps/desktop/src/main/modules/repository/github-knowledge-repository.live.ts`（769 行）文件内直接 `import { afterAll, describe, expect, it } from 'vitest'`，并深路径引用 `packages/repository/src/...`（文件开头有 `eslint-disable @nx/enforce-module-boundaries`）。它只被 `apps/desktop/vitest.live-github.config.ts` 执行，不进入生产构建，但放在 `src/main/modules/` 会污染源码统计、IDE 导航与模块边界检查。建议移到 `apps/desktop/src/main/modules/repository/__tests__/` 或独立 acceptance 目录（第二批，低风险，需确认打包 include 规则）。
2. **热路径上的无条件日志**：`packages/host-runtime/src/electron-ipc/authenticated-ipc.ts:34,38,42,48,64` 在一次成功的鉴权 IPC 调用中固定输出 3 条 `console.info`（开始、拿到上下文、执行完成），错误路径再加 2 条（含对象展开）。这是所有桌面 IPC 的公共路径，属于性能与日志噪音问题；建议改为 debug 级或由 logger 开关控制（第二批，低风险）。
3. **生产源码中仍有 125 处 `console.log/info/debug`**（排除 spec/test/test 目录），分布：`apps/desktop` 56、`packages/utils` 39、`test-utils` 8、`ipc-client` 6、`host-runtime` 5、`http-client` 4。仓库已有 `@memoflow/utils/logger`，建议在 lint 层面收紧而非一次性清理（治理项，非本批次）。
4. **无直接测试的大文件**：`useGoalNativeReviewCoordinator.ts`（1,180）、`useConversationProjection.ts`（813）、`LocalAgentSettings.vue`（829）、`main.ts`（998）、`ai/src/electron/index.ts`（1,303，仅间接）。这五个文件正好也是风险最高的整改对象，说明「先补测试」是它们的前置条件，而不是可选项。
5. **`packages/database/src/generated/prisma` 入库**：16 个文件、193,463 行（含 .d.ts）。这属于既有构建策略（生成物入库以保证离线构建），本报告不评判其取舍，但在行数统计中已排除。

---

## 5. 整改批次（按收益/风险排序）

### 5.1 第一批：低风险、高确定性（4 项）

准入标准逐项满足：同一包内拆文件；不改变公开导出与运行时行为；该文件逻辑已有测试覆盖。

#### B1-1 `packages/ai/src/api/routes/ai-runtime.routes.ts`（885 行）

- 涉及文件：`packages/ai/src/api/routes/ai-runtime.routes.ts` → `ai-assistant-stream.routes.ts`、`ai-assistant-control.routes.ts`、`ai-workflow.routes.ts`、`ai-usage.routes.ts`。
- 接缝：按 URL 前缀与处理器依赖分组（assistant SSE/history/ask-user；answer/attention/approval/cancel/delete；workflow 六条；usage 一条）。每个子模块导出 `registerX(router, deps, auth)`，在同一个 `Router` 实例上按原顺序注册。
- 覆盖测试：`packages/ai/src/api/routes/ai-runtime.routes.test.ts`（869 行），通过 `router.stack` 定位 `route.path/methods` 并调用末位 handler，覆盖鉴权、SSE、错误脱敏与身份注入。
- 为何零行为变化：路由数量、顺序、路径、方法与 handler 实现均不变；`registerAIRuntimeRoutes` 签名与返回类型不变；不引入子 Router（避免改变 `router.stack` 的扁平结构，测试无需改）。
- 建议分支：`refactor/ai-runtime-routes-split`
- 验证：`pnpm exec vitest run packages/ai/src/api/routes/ai-runtime.routes.test.ts` + `pnpm check:changed`

#### B1-2 `packages/notification/src/api/routes.ts`（612 行）

- 涉及文件：`packages/notification/src/api/routes.ts` → `api/routes/notification-inbox.routes.ts`、`notification-preference.routes.ts`、`notification-operations.routes.ts`、`notification-stream.routes.ts`，`routes.ts` 保留为聚合入口。
- 接缝：`RouteRegistrar` 的注册调用按资源域分组；共享的 `controller` / `operationsController` / `r`（含 `basePath` 与 OpenAPI registry）由聚合入口创建后传入。
- 覆盖测试：`packages/notification/src/api/routes.spec.ts`（690 行），通过公开的 `registerNotificationRoutes` 验证路径、OpenAPI 注册与处理行为。
- 为何零行为变化：注册顺序与 OpenAPI 元数据逐条搬迁；`basePath`、`defaultTags`、`defaultSecurity` 保持由同一处构造；公开函数签名不变。
- 建议分支：`refactor/notification-routes-split`
- 验证：`pnpm exec vitest run packages/notification/src/api/routes.spec.ts` + `pnpm check:changed`

#### B1-3 `packages/routine/src/server/application/services/routine-coach-command.service.ts`（836 行）

- 涉及文件：改为 `services/routine-coach/commands-preferences.ts`（`updatePreferences`）、`commands-routine.ts`（`createRoutine`/`updateRoutine`/`deleteRoutine`）、`commands-profile.ts`（profile CRUD）、`commands-membership.ts`（membership/override/occurrence）、`commands-protocol.ts`（`startPresetProtocol`/`transitionProtocol`）；原文件保留工厂与装配。
- 接缝：返回对象由 16 个命令方法组成（312–835），每个方法是独立闭包，仅依赖 `options`、`now`、`protocolRuntime` 与两个 notify 回调。
- 覆盖测试：同名 spec 629 行，经 `RoutineCoachCommandPort` 覆盖偏好门、Routine 创建、profile 校验、occurrence 响应。
- 为何零行为变化：每个命令函数体原样搬迁，`createXCommands(ctx)` 返回同名方法；工厂用对象展开组装，键集合与签名不变；`RoutineCoachCommandPort` 类型不变。
- 建议分支：`refactor/routine-coach-commands`
- 验证：`pnpm exec vitest run packages/routine/src/server/application/services/routine-coach-command.service.spec.ts` + `pnpm check:changed`

#### B1-4 `packages/app-vue/src/shared/composables/useDesktopProfiles.ts`（619 行）

- 涉及文件：拆为 `useDesktopProfileCatalog.ts`、`useDesktopProfileUnlock.ts`、`useDesktopCloudSignIn.ts`、`useDesktopRegistration.ts`，原 composable 组合并返回原有 44 个键。
- 接缝：按 `accessView` 状态机分区——目录/选择/编辑（约 73–420）、解锁（密码/`submitPassword`）、云登录（`signInWithPassword`/`signInWithGithub`/device polling）、注册（云/本地两套提交）。共享的 `invoke`/`invokeScoped` 与 `profiles`/`snapshot` 状态可下沉到 `useDesktopProfileCatalog` 并由其余三者注入。
- 覆盖测试：`useDesktopProfiles.spec.ts`（407 行）；消费方 `DesktopProfileList.spec.ts`、`ManageAccountsDialog.spec.ts`。
- 为何零行为变化：返回值键、ref/computed 身份与动作语义不变；只是把内部实现搬到同目录 composable 并组合。模板与消费方无需改动。
- 建议分支：`refactor/use-desktop-profiles-split`
- 验证：`pnpm exec vitest run packages/app-vue/src/shared/composables/useDesktopProfiles.spec.ts` + `pnpm check:changed`

> 第一批合计涉及 4 个文件、约 2,950 行（885 + 612 + 836 + 619），拆出约 17 个模块。全部为包内操作，零仓库级注册变更。

### 5.2 第二批：中风险、需要设计或补测（12 项）

前置条件：每项先确认对应测试能在本地跑通；跨包抽取需先跑受影响包的测试。

1. **`AppShell.vue` → `useShellPanelResize.ts` + `useShellScene.ts`**（风险中低）：resize/焦点守卫是最细的 DOM 逻辑，`AppShell.spec.ts` 已覆盖；先抽非模板逻辑，模板子组件留到第三批。
2. **H1 鉴权 IPC 组合器上收**：`host-runtime/electron-ipc` 新增 validation 工厂，goal/task/notification 改为复用。跨包但语义等价，风险低，因涉及三包同时改动放第二批。
3. **H2 `normalizeContribution` + H3 `isRecord` 收敛到 `@memoflow/utils/shared`**：纯函数抽取，6 + 7 处替换。
4. **`knowledge-repository-projection.service.ts` 附件与投递队列拆分**：队列/代际语义需对照 spec 的并发用例。
5. **`knowledge-note-commit.service.ts` 的 `adopt` 流水线拆分**：必须保持单一事务边界与写请求队列顺序。
6. **`notification.runtime.ts` 工厂拆分**：按认领/派发、SSE、死信、指标拆，保持共享闭包状态顺序。
7. **`useAIChatView.ts` 的模型选择与 workflow 投影拆分**：先画状态归属图，再动代码。
8. **`ai.module.ts` 抽 `createAIUseCases`**：对齐 `task.module.ts` 既有模式，保持 fail-closed 兜底。
9. **`ai/src/electron/index.ts` 按通道组拆 handler**：拆前补一份通道清单/surface 测试。
10. **`useGoalNativeReviewCoordinator.ts` 前置工作**：先补特征测试（本轮不改）。
11. **H5 别名注册表单源化**：工具链改动，需 CI 验证 serve/build/test 三种解析。
12. **H6 通知 DDL 收敛**、**H4 知识仓库展示选择器**、**H7 时间格式化收敛**：可并入相应 UI/适配器整改 PR。

### 5.3 第三批：高风险或需要架构决策

1. **`main.ts` 组合根拆分**（启动顺序无自动化兜底，先补启动 smoke）。
2. **`local-agent-runtime.ts` 的 `dispatchMessage` 三阶段拆分**（流式取消/grant/失败记账契约）。
3. **`mastra-ai.runtime.ts` 的恢复路径拆分**（AI 恢复幂等语义）。
4. **`goal.ts` 聚合瘦身**（抽提醒策略/权重快照领域服务，需领域 ADR）。
5. **`goal-portability` / `routine-portability` 的 apply 事务拆分**（事务边界）。
6. **H8 存在性检查模式收敛**（可选，收益低）。
7. 任何**新建包**方案：本阶段无必要；若未来确需「跨 Vue/React 的仓库展示层」，应单独立项评估 ADR-005/ADR-028 的注册成本。

### 5.4 明确不建议动

- `packages/powersync-schema/src/index.ts`（schema 单一真源）。
- `packages/app-vue/src/locales/**` 的大语言表（纯数据）。
- `eslint.config.ts`（治理规则集中可审计）。
- Prisma/PowerSync per-adapter mappers、各域 `portable-v3.ts`、`response-schemas.ts`（按所有权/持久化形态拆分是规范要求）。
- `app-vue` / `app-react` 的 `product-time.ts` 适配层（薄且语义不同）。

---

## 6. 复现方式

```bash
# 枚举与行数
git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' '*.vue' '*.mts' '*.cts' \
  | grep -v '\.d\.ts$' | grep -v '^packages/database/src/generated/' \
  | xargs wc -l | sort -rn

# 排除 bench 与 live 验收后按 600/800/1000 分桶
# 测试识别：*.spec.* / *.test.* / __tests__ / e2e（另加 *.live.ts）
```

本报告未运行任何测试或构建；测试覆盖判断仅基于 spec/test 文件存在性、文件内 `describe/it` 标题与 import 引用关系。所有 file:line 证据均来自上述已跟踪文件。

---

**结论摘要**

- 需要整改的千行级文件是真实存在的（16 个 >1,000 行），但它们集中在组合根、运行时与视图编排，**不是靠「统一拆小」就能解决**；必须按接缝拆。
- 最高杠杆的两类改动是：路由/命令/组合式的**包内分区**（第一批 4 项，零行为变化），以及**基础设施胶水的跨包上收**（H1–H3，消除约 200 行逐字重复与漂移风险）。
- 本阶段不需要新建任何包；这与仓库既有「新建包注册成本高、包内拆文件成本低」的规范一致。
