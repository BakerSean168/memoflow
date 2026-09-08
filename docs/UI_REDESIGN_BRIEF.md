# UI 重构前业务与界面分析（UI Redesign Brief）

> **⚠️ Core vNext Goal/Task 边界更新（2026-09-07）**：GoalFolder、Goal Focus/Comparison、TaskFolder、Task Dependency/DAG/CriticalPath 已按 ADR-053/054 与 Core vNext 从运行时、公开契约和产品 UI 退役。本文中仍出现这些名称的页面清单、数据字段、组件或交互描述均是 **vNext 之前的历史快照，不得作为当前实施依据**；当前真值以 `docs/product/modules/goal.md`、`docs/product/modules/task.md` 与 `docs/plan/active/2026-08-25-core-vnext-orchestration.md` 为准。
>


> **📌 更新（2026-07-12）**：重构方向已改为 ChatGPT 桌面式壳（AI 优先三态布局），见 `docs/UI_REDESIGN_V2_PLAN.md`。本文 §9（新信息架构）与 §10（新页面布局）的建议**已被 V2 取代**；§1–§8（现状/用户/页面分析/操作路径/问题清单）、§11（保留资产）、§12（风险）、§13（Obsidian vault 专项）继续有效。
>
> **📌 决策固化（2026-07-16）**：§13 的 Obsidian Vault 方向已由 [ADR-034](./architecture/adr/ADR-034-obsidian-vault-repository.md) 正式采纳并在后续讨论中调整为“本地 Vault + 可选 GitHub private repository”。涉及登录、事实源、同步、Web 创建和 AI 写入路径时以 ADR-034 为准；本文 §13 的 Desktop 自定义上传、Web 永久只读和固定 `00-inbox` 只保留为历史调研方案。
>
> **⚠️ 知识模块现状 supersede（2026-07-21；残留 301 澄清）**：ADR-034 实施后，下列 Brief 现状描述**已退役，不得当作当前架构**：
> - `ResourceClientDTO` / `RepositoryClientDTO` 与 DB Resource CRUD（contracts 已删除；创建面为 `KnowledgeNotePersistedRef`）
> - `/note/:id`、`EditorLinearView`、`@memoflow/editor`、旧 `RepositoryServiceLike` / `useRepository` CRUD 端口形态
> - “在 Web/App 内编辑已有笔记”路径（首期关闭；Desktop 主编辑在 Obsidian）
> - 旧 `RepositoryWorkspaceView` 自建工作区（运行时已删；现为 `RepositoryEntryView` → projection / Local Vault）
>
> **仍有效的 DI 名**：`REPOSITORY_SERVICE_KEY` 现在绑定 knowledge `RepositoryClientPort`（非旧 CRUD 端口）。
> AI `openRecentKnowledgeNote` 着陆 `/repository?note=`，**永不** `/note/:id`。
>
> 当前真值：[`docs/product/modules/repository.md`](./product/modules/repository.md)、[`docs/product/modules/editor.md`](./product/modules/editor.md)、[`docs/product/module-index/repository-files.md`](./product/module-index/repository-files.md)、[ADR-034](./architecture/adr/ADR-034-obsidian-vault-repository.md)。本文 §1–§8/§11 中笔记/仓储段落仅作**迁移前历史快照**。
>
> 状态：分析文档（不含实施）。**除已标注 supersede 的知识/笔记段落外**，其余结论曾基于 2026-07-11 代码；冲突时以当前代码与 product 文档为准。
> 生成日期：2026-07-11。分析范围：`packages/app-vue`（Web 与 Desktop 共用的前端应用层）。
> 移动端（`apps/mobile`，React Native）有独立 UI，本文仅在风险章节涉及。

---

## 1. 当前应用定位

**知行 (MemoFlow)**（`packages/assets/src/brand.ts`）是一个 **AI 优先的个人效能操作系统**，覆盖五个能力域：

| 能力域 | 模块                                 | 核心模型                                                                          |
| ------ | ------------------------------------ | --------------------------------------------------------------------------------- |
| 意图   | Goal（目标）                         | OKR：Goal → KeyResult → 进度记录 → 复盘（`packages/contracts/src/modules/goal/`） |
| 执行   | Task（任务）                         | 模板/实例二元模型 + DAG 依赖 + 目标绑定（`packages/contracts/src/modules/task/`） |
| 时间   | Schedule（日程）+ Reminder（提醒）   | 日历事件聚合（含任务实例投影）；提醒模板/分组/策略                                |
| 知识   | Repository（仓储）+ Desktop Local Vault | GitHub projection / Local Vault（`/note/:id` 与 DB Resource 编辑已退役） |
| 智能   | AI（助手）                           | 对话 + 三种 Agent 工作流（目标创建 / 知识笔记生成 / 知识问答 RAG）                |

技术形态：Nx monorepo；Web（`apps/web`）与 Desktop（`apps/desktop`，Electron）**共用同一套 `packages/app-vue` 页面与路由**（见 `apps/desktop/src/renderer/bootstrap/app.ts:44` 直接调用 `createAppRouter`）；数据经 DI 端口走 HTTP（Web）或 IPC（Desktop）；离线同步使用 PowerSync（`packages/powersync-schema/src/index.ts` 定义了 `documents`、`document_links`、`resources` 等全量业务表）。

关键定性：**这不是一个"待办清单 App"，而是一个把 AI Agent 放在正中央的个人管理系统**——路由 `/`（首页）直接渲染 `AIChatView`（`packages/app-vue/src/router/index.ts:53-58`），AI 可以端到端创建"目标 + 关键结果 + 任务模板 + 提醒"（`packages/app-vue/src/modules/ai/composables/useAIChatView.ts` 聚合的 goalWorkflow），也可以把对话沉淀为知识笔记写入仓储、并对仓储做带引用的知识问答（`packages/contracts/src/modules/ai/api/ai-knowledge-note.dto.ts`、`ai-knowledge-query.dto.ts`）。

---

## 2. 核心用户是谁

从代码可推断（无团队/协作/分享功能，账户模型为单人 profile）：

- **单一用户 = 开发者本人**（个人自用产品）。证据：
  - Governance 模块是"个人编码规范规则库"（规则 + 好/坏代码示例 + 修订历史，`packages/contracts/src/modules/governance/aggregates/rule-client.ts:19-35` 含 `goodExamples/badExamples: CodeSnippetDTO[]`）——这是开发者才需要的功能，却位于一级导航。
  - 界面默认中文（`packages/app-vue/src/modules/setting/views/UserSettingsView.vue:94` locale 默认 `zh-CN`）。
  - 无任何权限/角色/多租户逻辑；路由守卫只有登录态判断（`packages/app-vue/src/router/guards.ts`）。
- 用户画像：**重度自我管理的知识工作者/开发者**，同时使用桌面端（常驻、提醒弹窗 `apps/desktop/src/renderer/CustomNotificationView.vue`）和 Web 端。
- 设计推论：**不需要为"新手大众用户"做防御性设计**，但需要为"每天打开几十次的自己"优化信息密度、路径长度和一致性。

---

## 3. 主要页面 / 路由

汇总自 `packages/app-vue/src/router/index.ts` 与各模块 `router/index.ts`：

| 路由                                                         | 视图组件                                               | 导航可见性       | 备注                                                |
| ------------------------------------------------------------ | ------------------------------------------------------ | ---------------- | --------------------------------------------------- |
| `/auth`                                                      | `views/AuthView.vue`                                   | —                | 登录/注册（Desktop 用 `DesktopAuthView` 覆写）      |
| `/`                                                          | `modules/ai/views/AIChatView.vue`                      | 主导航「首页」   | **AI 工作台即首页**                                 |
| `/ai/chat`                                                   | 同上 `AIChatView.vue`                                  | 主导航「AI对话」 | **与 `/` 完全同一组件，重复入口**                   |
| `/dashboard`                                                 | `views/DashboardView.vue`                              | 主导航「仪表盘」 | Linear 风格聚合页                                   |
| `/goals`                                                     | `goal/views/GoalModuleLayout.vue` + `GoalListView.vue` | 主导航「目标」   | 模块内含第二侧边栏（文件夹/系统视图/专注模式入口）  |
| `/goals/focus`                                               | `goal/views/GoalFocusView.vue`                         | 目标侧边栏入口   | 专注模式状态页                                      |
| `/goals/compare`                                             | `goal/views/MultiGoalComparisonView.vue`               | 列表页按钮       | 多目标对比                                          |
| `/goals/rules-demo`                                          | `goal/views/StatusRulesDemoView.vue`                   | 无入口           | **演示页混在生产路由**                              |
| `/goals/:id`                                                 | `goal/views/GoalDetailView.vue`                        | —                | 目标详情（KR/记录/复盘）                            |
| `/goals/:goalId/review/create`                               | `GoalReviewCreationView.vue`                           | —                | 创建复盘                                            |
| `/goals/:goalId/review/:reviewId`                            | `GoalReviewDetailView.vue`                             | —                | 复盘详情                                            |
| `/goals/:goalId/key-results/:keyResultId`                    | `KeyResultDetailView.vue`                              | —                | KR 详情                                             |
| `/tasks`                                                     | `task/views/TaskManagementView.vue`                    | 主导航「任务」   | 任务模板管理（卡片网格）                            |
| `/tasks/dependency-validation-demo`                          | `DependencyValidationDemoView.vue`                     | 仅 DEV           | 演示页                                              |
| `/tasks/:id`                                                 | `task/views/TaskDetailView.vue`                        | —                | 模板详情（含依赖/父子关系）                         |
| `/schedule` → `/schedule/calendar`                           | `schedule/views/ScheduleCalendarView.vue`              | 主导航「日程」   | 日/周/月三视图统一入口（无 week/dashboard 双轨 redirect） |
| `/reminders`                                                 | `reminder/views/ReminderLinearView.vue`                | 主导航「提醒」   | 分组侧边栏 + 模板列表 + 全局总开关                  |
| `/repository`                                                | `repository/views/RepositoryWorkspaceView.vue`         | 主导航「仓库」   | Obsidian 风格工作区                                 |
| `/note/:id`                                                  | `editor/views/EditorLinearView.vue`                    | —                | 单笔记编辑页（AI 知识笔记落点），meta `hideSidebar` |
| `/notifications`                                             | `notification/views/NotificationListPage.vue`          | 主导航「通知」   | 通知中心                                            |
| `/sse-monitor`                                               | `notification/views/SSEMonitorPage.vue`                | 仅 DEV           | SSE 调试工具                                        |
| `/governance` (+`/new`、`/:id`、`/:id/edit`、`/:id/history`) | `governance/views/*`                                   | 主导航「治理」   | 个人编码规则库（5 个子页）                          |
| `/settings`                                                  | `setting/views/UserSettingsView.vue`                   | 底部导航         | 单页 10 个 Tab                                      |
| `/account/center`                                            | `account/views/AccountCenterView.vue`                  | 底部导航         | 个人资料 + 登出                                     |

**孤儿视图（存在于磁盘但无路由/无引用）**：`goal/views/FocusModeView.vue`、`goal/views/FocusCycle.vue`、`goal/views/WeightSnapshotView.vue`、`schedule/views/ScheduleWeekView.vue`（已删除；Vue 日程仅统一 `/schedule/calendar` 入口）。重构时应先删除或明确归宿。

主导航共 **10 个一级入口 + 2 个底部入口**（`packages/app-vue/src/di/navigation.ts:17-36`），纯文字按钮、无图标、无分组（`layouts/MainLayout.vue:47-62`）。

---

## 4–6. 每个页面：业务目标 / 必须展示 / 可弱化 / 可隐藏 / 可移入详情 / 不可删除的交互状态

> 表格中"信息来源"均为当前代码已存在的数据（store/composable），不引入新功能。

### 4.1 AI 工作台（`/`、`/ai/chat` → `AIChatView.vue`）

**业务目标**：应用的中枢入口——对话、驱动三种 Agent 工作流（目标创建 / 知识笔记 / 知识问答），并快速回到最近对话、最近目标、最近知识笔记。
**数据**：`useAIChatView`（会话/消息流/模型选择）+ 会话列表、AgentRun 列表、recentGoals、recentKnowledgeNotes（`AIConversationSidebar.vue`）。

| 分类               | 内容                                                                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 必须展示           | 消息时间线（`AIMessagePanel`）；输入框 + 发送/停止（`AIFooterComposer`）；当前会话标题；工作流等待用户决策的动作（澄清提交/确认执行/取消，`AIChatView.vue:127-232` goal-agent 状态按钮组）                                                        |
| 可弱化             | 模型选择器（低频，收进输入框 ⚙ 菜单已部分做到）；会话列表刷新按钮；AgentRun 历史列表                                                                                                                                                              |
| 可隐藏             | 遗留工作流按钮组（`showLegacyGoalWorkflowActions`，由 `localStorage['ai:debug:legacy-goal-workflow']` 控制，`AIChatView.vue:484-486`）——纯调试残留；`recentGoals/recentKnowledgeNotes` 在移动宽度下                                               |
| 可移入详情/侧栏    | 工作流产物全文（目标草稿编辑器、KR/任务模板/提醒草稿表格、知识引用列表）——已有右侧 context panel（`AIChatView.vue:304-385`），应保持"默认折叠、有产物才出现"                                                                                      |
| 不可删除的交互状态 | goal-agent 生命周期状态机（clarification → approval → execution → retry，各 `goalAgentWaitingFor*` 分支）；流式生成中的 stop；会话切换时的加载态；知识问答的 `evidenceStatus==='grounded'` 校验（`AIChatView.vue:269`，答案未接地时禁止生成笔记） |

**页面级问题**：单文件 575 行、从 4 个 workflow 子 composable 解构约 80 个绑定；composer 的 action-rail 内嵌 3 套工作流 × 各 5–8 个条件按钮，是全应用状态最复杂的一块 UI。重构时应把"工作流控制"整体从 composer 迁到 context panel，让输入区回归纯对话。

### 4.2 仪表盘（`/dashboard` → `views/DashboardView.vue`）

**业务目标**：一屏总览今日状态并跳转各模块。
**数据**：`useDashboard()`（stats/activityTimeline/trendDays/goalProgress，HTTP 与 IPC 双适配器 `modules/dashboard/adapters/`）+ 复用 `DailyTodoWidget`（task 模块）与 `UpcomingRemindersWidget`（reminder 模块）。

| 分类               | 内容                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 必须展示           | 今日待办 widget；即将到来的提醒 widget；活跃目标进度条列表                                                                                                      |
| 可弱化             | 6 张统计卡（activeTasks/completedToday/activeGoals/upcomingReminders/unreadNotifications/scheduleConflicts，`DashboardView.vue:199-254`）→ 可压成一行紧凑数字条 |
| 可隐藏             | 趋势图（ECharts 双序列，仅回顾用途）→ 折叠或移入"统计"次级页；快捷操作条（4 个按钮全部等价于左侧导航，纯重复，`DashboardView.vue:329-334`）                     |
| 可移入详情         | 活动时间线（activityTimeline）→ 与通知中心合并展示                                                                                                              |
| 不可删除的交互状态 | 刷新（含 `reminderWidgetRefreshKey` 联动）；统计卡点击跳转；loading skeleton                                                                                    |

**定位问题**：与 AI 首页争夺"home"角色（见 §8-P1）。

### 4.3 目标模块（`/goals/**`）

**业务目标**：OKR 全生命周期——建目标/文件夹 → 维护 KR → 记录进度 → 复盘 → 专注模式。
**数据**：`useGoal()`（goals、goalFolders、currentFocusMode、systemView、keyResults、goalRecords、goalReviews）。

**GoalModuleLayout（模块壳，含第二侧边栏）**

| 分类               | 内容                                                                                                                                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 必须展示           | 系统视图切换（进行中/已完成/已过期/回收站，含计数）；文件夹列表（色点）；「新建目标」入口                                                                                                                      |
| 可弱化             | 专注模式卡片（侧边栏底部常驻，`GoalModuleLayout.vue:78-102`）→ 无激活时可缩为一行按钮                                                                                                                          |
| 可隐藏             | 无                                                                                                                                                                                                             |
| 可移入详情         | —                                                                                                                                                                                                              |
| 不可删除的交互状态 | `?dialog=goal&goalId=` **URL 驱动的创建/编辑对话框**（`GoalModuleLayout.vue:262-306` `syncGoalDialogFromRoute`——被 AI 工作流和空态按钮深链使用，改版必须保留该契约）；文件夹右键/悬浮菜单（ActionableWrapper） |

**GoalListView（列表）**

| 分类               | 内容                                                               |
| ------------------ | ------------------------------------------------------------------ |
| 必须展示           | 目标卡片网格（GoalCard：名称/进度/状态）；空态 + 创建按钮          |
| 可弱化             | 「对比」按钮（低频，可收进 ⋯ 菜单）                                |
| 可隐藏             | 搜索框在无目标时                                                   |
| 可移入详情         | 卡片上的次要元数据（由 GoalCard 决定的日期/文件夹徽章）            |
| 不可删除的交互状态 | 卡片 view/edit/delete 三操作；删除确认（`useConfirm` destructive） |

**GoalDetailView（详情）**

| 分类               | 内容                                                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 必须展示           | 名称/状态/重要度徽章；总进度环（SVG ring，`GoalDetailView.vue:41-62`）；KR 列表（当前值/目标值 + 进度条 + 点击进 KR 详情）；「添加 KR」「创建复盘」 |
| 可弱化             | 起止日期/分类/标签四宫格 → 一行元数据                                                                                                               |
| 可隐藏             | 无描述时的占位文案                                                                                                                                  |
| 可移入详情         | 进度记录的展开明细（增量/后值/所属KR/时刻，现为行内展开 `toggleRecordDetail`）——本身已是渐进展示，保留模式即可                                      |
| 不可删除的交互状态 | 记录/复盘两个 Tab；记录行展开态；KeyResultDialog 的保存回调（含 weight/valueType/aggregationMethod 等字段，`GoalDetailView.vue:309-343`）           |

**子页**：GoalFocusView（当前专注期信息 + 剩余天数 + 隐藏非专注目标模式 + 退出按钮）、MultiGoalComparisonView、GoalReviewCreationView/DetailView、KeyResultDetailView——均为详情层级，信息结构合理，主要问题是**入口分散**（compare 在列表头、focus 在侧边栏底部、review 在详情头）。

### 4.4 任务模块（`/tasks/**`）

**业务目标**：管理**任务模板**（一次性/循环），配置时间与重复规则、父子关系、DAG 依赖、目标绑定（完成实例自动累计 KR 进度，`TaskManagementView.vue:176-187` `toGoalBindingPayload`）。
**数据**：`useTask()`（templates、dependencies、fetchTaskGraph、CRUD、pause/resume、依赖 CRUD）。

**TaskManagementView + TaskTemplateManagement**

| 分类               | 内容                                                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 必须展示           | 状态过滤组（含计数徽章）；模板卡片网格（标题/循环规则/状态/关系计数）；「新建模板」                                                                                          |
| 可弱化             | 关系过滤第二排按钮（`TaskTemplateManagement.vue:21-34`，父子/前驱/后继过滤为低频）→ 收进过滤下拉                                                                             |
| 可隐藏             | **「全部删除」按钮**（`TaskTemplateManagement.vue:49-59`，破坏性操作常驻主工具栏，且实现为逐条循环删除 `TaskManagementView.vue:327-343`）→ 移入危险区/移除；DEV 演示路由入口 |
| 可移入详情         | 依赖图（现为 1400px Dialog 内嵌 `TaskDAGVisualization`）→ 作为任务页的一种视图模式而非弹窗                                                                                   |
| 不可删除的交互状态 | 卡片拖拽建依赖（`DraggableTaskCard` `enable-drag` + `onCreateDependency`）;暂停/恢复确认；创建/编辑对话框（含循环规则、目标绑定、依赖管理三块复杂表单）                      |

**TaskDetailView**

| 分类               | 内容                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 必须展示           | 标题 + 状态徽章；时间配置（timeType/timeValue）；父任务链接；依赖状态（`isBlocked`/`blockingReason` 徽章，`TaskDetailView.vue:128-146`） |
| 可弱化             | 创建/更新时间                                                                                                                            |
| 可隐藏             | 空标签占位                                                                                                                               |
| 可移入详情         | —（本页即详情）                                                                                                                          |
| 不可删除的交互状态 | 编辑对话框入口；父任务/依赖任务跳转                                                                                                      |

**模型级问题**：UI 直接暴露"模板/实例"系统概念——用户在 `/tasks` 管理的是模板，而"今天要做的事"（实例）只出现在仪表盘 widget 和日历里，没有一个"今日任务清单"主页面（`DailyTodoWidget` 是最接近的，但只在 dashboard）。

### 4.5 日程（`/schedule/calendar` → `ScheduleCalendarView.vue`）

**业务目标**：以日/周/月日历查看**日程事件 + 任务实例投影**（`useCalendarView.events` 中 `event.source === 'task'`，可直接在日历完成任务实例 `handleCompleteTask` → `task.completeInstance`，`ScheduleCalendarView.vue`），并创建日程。
**数据**：`useCalendarView()`（窗口范围拉取）、`useSchedule()`、`useTask()`。

| 分类               | 内容                                                                                                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 必须展示           | 日/周/月视图切换；日历主体（事件块）；「创建日程」                                                                                                                                                         |
| 可弱化             | —                                                                                                                                                                                                          |
| 可隐藏             | `DevScheduleDebugPanel`（仅 DEV 渲染，保持）                                                                                                                                                               |
| 可移入详情         | 月视图点击某天 → `DayDetailSheet`（右滑抽屉）已是正确模式；任务事件 → `TaskEventActionPanel` 底部面板保留                                                                                                  |
| 不可删除的交互状态 | 视图窗口换页时的范围拉取（day/week/month change）；任务事件的"完成"动作及完成后窗口刷新；非任务事件详情见 `EventDetailSheet`（历史 toast 断层已在 redesign 中补位） |

### 4.6 提醒（`/reminders` → `ReminderLinearView.vue`）

**业务目标**：管理提醒模板与分组；分组有控制模式（group/individual）与启停策略；全局总开关一键静默。
**数据**：`useReminder`（templates、groups、preferences.globalReminderEnabled、组统计 stats）。

| 分类               | 内容                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 必须展示           | 分组侧边栏（计数）；模板列表（各自启停）；全局总开关（关闭时页顶黄色横幅 + 一键恢复，`ReminderLinearView.vue:126-146`） |
| 可弱化             | 头部里重复的"当前分组"徽章条（`ReminderLinearView.vue:96-109`，与正文分组卡重复）；分组卡内的 2×N 统计小方块            |
| 可隐藏             | 分组描述为空时的区块                                                                                                    |
| 可移入详情         | 分组策略详情文案（`getGroupPolicyText`）                                                                                |
| 不可删除的交互状态 | 全局开关与保存中禁用态；分组控制模式（决定模板开关是否被组接管）；模板/分组的创建对话框                                 |

### 4.7 仓储 + 编辑器（`/repository`、`/note/:id`）— **历史快照（已 supersede）**

> **历史快照**：本节描述 2026-07-11 前后的自建编辑器 + DB Resource 架构。当前运行时以 ADR-034 / product 文档为准：
> - 路由：`/repository`（`RepositoryEntryView` → `KnowledgeProjectionWorkspaceView` / `LocalVaultWorkspaceView`）
> - 无 `/note/:id`、无 `EditorLinearView`、无 `RepositoryWorkspaceView`
> - AI 打开笔记：`openRecentKnowledgeNote` → `/repository?note=`


**业务目标**：个人 markdown 知识库——文件树/搜索/书签三模式侧栏、多标签页、CodeMirror6 编辑（源码/分屏/预览）、`[[wikilink]]` 双链与反链、链接图谱、图片/附件引用、失效引用修复、自包含导出、批量导入。
**数据/模型**：Resource 是 **DB 实体**（`content: string | null`、`version`、`ResourceClientDTO`，`packages/contracts/src/modules/repository/aggregates/resource-client.ts:23-49`）；前端经 DI 端口 `REPOSITORY_SERVICE_KEY` 访问（接口 `RepositoryServiceLike`，`useRepository.ts:32-71`）；Web 注 HTTP 实现、Desktop 注 IPC 实现（`apps/web/src/platform/di-app.ts:116`、`apps/desktop/src/renderer/platform/di-app.ts:67`）。链接索引/反链/图谱**全部在客户端**由资源全文即时计算（`editor/utils/link-index.ts`、`wiki-links.ts:17` `\[\[([^\]]+)\]\]`，支持 `[[目标|别名]]` 与 `#小节`）。知识笔记有服务端 RAG 索引（`indexStatus: 'pending'|'indexed'|'failed'`）。

**RepositoryWorkspaceView**

| 分类               | 内容                                                                                                                                                                                                                                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 必须展示           | 文件树（按类型分组，`TypedFileTree`）；编辑器主体 + 保存/脏状态；标签页条（多文件打开时）                                                                                                                                                                                   |
| 可弱化             | 侧栏三模式切换（files/search/bookmarks 图标条）；字数统计                                                                                                                                                                                                                   |
| 可隐藏             | 书签面板（低频，可并入文件树顶部区）；失效引用诊断（无问题时）                                                                                                                                                                                                              |
| 可移入详情         | 自包含导出、批量导入（已是对话框，保留）；引用修复（已是对话框）                                                                                                                                                                                                            |
| 不可删除的交互状态 | 未保存守卫（`useEditorUnsavedChangesGuard`、`useWindowUnsavedChangesGuard`）；标签页 pin/关闭他项/关闭右侧；侧栏折叠（ResizablePanel collapse）；重命名对话框；媒体查看器分支（图片/视频/音频）与"不支持类型"占位分支（`RepositoryWorkspaceView.vue:124-246` 的四分支渲染） |

**EditorLinearView（`/note/:id`）**：单笔记聚焦编辑 + 右侧反链/图谱面板 + `[[` 触发的链接建议浮层（`LinkSuggestion`，支持"创建并链接新笔记"）。它是 AI「打开创建的笔记」「打开引用」的着陆页（`openRecentKnowledgeNote(resourceId)` → `/note/:id`）。

**模块级问题**（详见 §13 Obsidian 讨论）：这是代码量最大的前端模块（editor 模块 40+ 文件、17 个 composable），维护面≈一个小型 Obsidian，而差异化价值其实在"AI 能读写这个库"，不在编辑器本身。

### 4.8 通知（`/notifications`）

| 分类               | 内容                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 必须展示           | 通知列表（未读态）；未读计数徽章；「全部已读」                                                                                         |
| 可弱化             | 过滤 Tab（全部/未读等）                                                                                                                |
| 可隐藏             | `/sse-monitor`（已 DEV-only，保持隐藏）                                                                                                |
| 可移入详情         | 通知点击跳转的目标上下文                                                                                                               |
| 不可删除的交互状态 | 逐条已读/删除；SSE 实时接入（`createNotificationStartupHook`，Desktop 启动时挂载，`apps/desktop/src/renderer/bootstrap/app.ts:74-81`） |

**定位问题**：作为一级页面价值弱——通知天然是"信箱"，适合铃铛入口 + 抽屉/弹层，未读数已在 dashboard 统计卡出现。

### 4.9 治理（`/governance/**`）

**业务目标**：个人编码规范库——规则（code/title/severity/status/tags/好坏示例）、修订历史、废弃/替代链。5 个子页（列表/新建/详情/编辑/历史）。

| 分类               | 内容                                                                          |
| ------------------ | ----------------------------------------------------------------------------- |
| 必须展示（列表）   | 规则卡（code、title、severity、status）；搜索                                 |
| 可弱化             | 状态/严重度双排按钮组过滤（`GovernanceListView.vue:23-63`）→ 下拉；标签 chips |
| 可隐藏             | 过滤命中横幅                                                                  |
| 可移入详情         | 好/坏代码示例（已在详情页）                                                   |
| 不可删除的交互状态 | 规则编辑器表单；修订历史 diff 查看                                            |

**定位问题**：与"目标/任务/日程"不是同一层级的心智——它本质是**知识库的一种特化**（结构化笔记），却占据一级导航。

### 4.10 设置（`/settings`）与账户（`/account/center`）

- 设置：单页 **10 个 Tab**（外观/AI/语言区域/隐私/快捷键/通知/实验性/高级操作/用户文件 + 数据导入导出，`UserSettingsView.vue:15-28`），含全量数据导出/导入（`useDataPortability`）。
- 账户中心：头像/昵称/bio 表单 + 登出（含确认）。
- 问题：账户中心内容单薄，与设置的"隐私"Tab 心智重叠，可作为设置的一个 Tab 或头像弹层；快捷键 Tab 目前只读展示（`UserSettingsView.vue:115-118` 注释 "read-only display for now"）。

### 4.11 登录（`/auth`）

登录/注册表单（`authentication/components/LoginForm/RegisterForm`），Desktop 有独立 `DesktopAuthView` 与启动时 auth 快照水合（`hydrateDesktopBootstrapAuthState`）。改版仅需皮肤级调整，流程勿动。

---

## 7. 用户主要操作路径

基于代码中的事件流与跳转（`router.push` 调用点）：

1. **AI 驱动的目标创建（应用的招牌路径）**
   `/`（AI 工作台）→ 选择 goal-create 工具模式 → 对话描述目标 → Agent 澄清（提交答案）→ 生成草稿（右侧 context panel 可编辑 Goal/KR/任务模板/提醒草稿）→ 确认执行 → Agent 创建目标+KR+任务模板+提醒 → 「打开创建的目标」→ `/goals/:id`。
   （`AIChatView.vue:127-232` 按钮组 + `AIGoalWorkflowPanel.vue`）

2. **手动 OKR 循环**
   `/goals` → 新建目标（URL `?dialog=goal`）→ `/goals/:id` 添加 KR → 日常记录进度（records Tab）→ 阶段性 `/goals/:goalId/review/create` 复盘 → 需要冲刺时侧边栏激活专注模式 → `/goals/focus`。

3. **任务模板 → 日历执行**
   `/tasks` 新建模板（配循环规则/依赖/目标绑定）→ 系统生成实例 → `/schedule/calendar` 周视图看到任务块 → 点击任务事件 → `TaskEventActionPanel` 完成 → 若绑定 KR 则目标进度自动累计。

4. **知识沉淀（AI）**
   `/` 知识问答模式 → 提问 → 得到带引用的接地回答（evidenceStatus=grounded）→ 「生成笔记草稿」→ 保存 → 「打开创建的笔记」→ `/note/:id`；或在 `/repository` 手动建笔记 → `[[` 链接建议 → 反链/图谱面板导航。

5. **每日巡检**
   `/dashboard` 看今日待办 widget + 提醒 widget + 目标进度 → 点卡片跳对应模块；提醒触达经通知（SSE/桌面弹窗）→ `/notifications`。

**路径观察**：1、3、4 是这个产品真正独特的路径；2、5 是通用工具路径。当前 IA 把 12 个入口平铺，没有体现这个优先级。

---

## 8. 当前 UI 的问题

按影响排序：

- **P1 双首页/重复入口**：`/` 与 `/ai/chat` 渲染同一个 `AIChatView`，导航里「首页」「AI对话」两个按钮指向同一页面（`di/navigation.ts:18,20`）；同时 `/dashboard` 又是另一个"总览首页"。用户面对三个"起点"。
- **P1 导航无层级**：10+2 个纯文字入口平铺（`MainLayout.vue`），核心域（目标/任务/日程/提醒 = 计划执行）与外围（通知/治理/设置）无视觉分层；无图标、无折叠、无未读角标（通知入口与未读数割裂）。
- **P1 三个"时间类"模块心智重叠**：任务（模板）、日程（日历，已投影任务实例）、提醒（模板分组）各占一级入口，但数据早已互通（日历完成任务、AI 一次性创建任务+提醒）。用户要回答"我今天该做什么"需要横跨 dashboard/tasks/schedule/reminders 四处。
- **P2 双侧边栏套娃**：主导航侧栏（w-44）+ 模块内第二侧栏（goal w-64 / reminder w-64 / repository 可调），中间内容被两条竖栏夹击；而 task/schedule/notification 又没有第二侧栏——同层级模块壳形态不一致。
- **P2 页面壳不统一**：内容最大宽度散布 `max-w-3xl/4xl/5xl/7xl/960px/1400px`；头部有 `h-14 border-b` 模式（task/schedule/notification/goal-list）与自由布局（governance 用 `p-6 max-w-[960px]` 无横栏头）两种；同为"列表+过滤"，governance 用按钮组、task 用按钮组+第二排、notification 用 Tab 条。
- **P2 AI 工作台的 composer 过载**：3 种工具模式 × 各自完整生命周期按钮内嵌在输入框上方的 action-rail（§4.1），加上 localStorage 调试开关的遗留分支，操作密度远超对话界面应有形态。
- **P3 系统概念直接暴露**：任务页标题是"任务模板管理"、卡片是模板而非"要做的事"；「全部删除」破坏性按钮常驻工具栏。
- **P3 演示/调试路由混入生产**：`/goals/rules-demo` 无 DEV 守卫；孤儿视图 4 个（§3）；`DevScheduleDebugPanel`、legacy goal workflow 开关等调试面散落。
- **P3 硬编码中文 vs i18n 混用**：repository 路由 meta `title: '仓库'`、`note-edit: '编辑笔记'`（`repository/router/index.ts:14,26`）绕过 i18n key 体系。
- **P3 通知一级化**：§4.8。
- **P3 日程事件无详情/编辑（历史）**：非任务日历事件曾仅 toast；当前以 `ScheduleCalendarView` + `EventDetailSheet` 为主路径（以代码为准）。

---

## 9. 建议的新信息架构

原则：**入口数量减半，按"意图→执行→知识→系统"分区，一个首页**。全部由现有页面重组，不新增功能。

```
┌ 侧边栏（分组 + 图标 + 角标）
│
│  工作台
│   ◆ 首页（AI 工作台 = /，唯一 home；删除 /ai/chat 重复入口）
│   ◆ 仪表盘（保留 /dashboard，从导航降级为首页头部的"今日概览"链接，或并入首页右栏）
│
│  计划
│   ◆ 目标  /goals（含 focus/compare/detail 子树，不变）
│
│  执行（三合一分组，路由不变，导航归组）
│   ◆ 日程  /schedule/calendar   ← 建议作为"执行"默认入口（它已聚合任务实例）
│   ◆ 任务  /tasks（更名"任务库/循环任务"以匹配模板语义）
│   ◆ 提醒  /reminders
│
│  知识
│   ◆ 笔记  /repository（更名"笔记"，去掉"仓库"这一实现词）
│   ◆ 规范  /governance（作为知识分区的次级入口，或折叠进"笔记"侧栏的一个分类）
│
│  （底部）
│   ◆ 通知：铃铛图标 + 未读角标 → 弹层预览 + "查看全部"进 /notifications（移出一级导航）
│   ◆ 设置  /settings（账户中心并为设置的"账户"Tab，或头像菜单项；/account/center 保留路由做兼容跳转）
└
```

配套调整（均为既有能力的重排）：

1. **首页 = AI 工作台**，但把 dashboard 的三个最有效 widget（今日待办 `DailyTodoWidget`、即将提醒 `UpcomingRemindersWidget`、目标进度列表）注入 AI 工作台左侧会话栏下方或右侧 context panel 的空闲态（该 panel 已有"无产物占位"分支，`AIChatView.vue:376-383`）——AI 空闲时右栏显示今日概览，工作流激活时显示产物。`/dashboard` 保留为完整统计页。
2. **导航配置只改 `di/navigation.ts` 与 `MainLayout.vue`**：NavigationItem 增加分组与图标字段（路由 meta 已有 `icon`、`order` 字段但 MainLayout 未消费——现成数据）。
3. **演示/调试路由**：`rules-demo` 补 `showInNav/DEV` 守卫并从生产构建剔除；删除 4 个孤儿视图。
4. **repository 路由 meta 改用 i18n key**，与其余模块对齐。

---

## 10. 建议的新页面布局

逐页给出布局方向（组件不换血，只重排）：

| 页面                 | 现状                                                  | 建议布局                                                                                                                                    |
| -------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| AI 首页              | 左会话栏 + 中对话 + 右产物栏；工作流按钮挤在 composer | 保持三栏骨架；**工作流生命周期按钮整体移入右栏顶部**（与产物同屏）；composer 只留发送/停止/模式切换/模型；右栏空闲态显示"今日概览"三 widget |
| 仪表盘               | 6 卡 + 图表 + 时间线 + 3 widget + 快捷条              | 压缩为：一行紧凑统计条（6 数字）→ 三列 widget（待办/提醒/目标）→ 趋势图与活动时间线折叠区；删除快捷操作条                                   |
| 目标列表             | 第二侧栏 + 卡片网格                                   | 保留；侧栏专注模式卡在未激活时缩为按钮；「对比」入 ⋯ 菜单                                                                                   |
| 目标详情             | 概览卡 + KR 卡 + Tabs                                 | 保留结构；四宫格元数据压成单行；进度环缩小与 KR 完成数并排                                                                                  |
| 任务                 | 双排过滤 + 卡片网格 + 图谱弹窗                        | 顶部一排：状态 Tab + 过滤下拉 + 视图切换（卡片 / 图谱——图谱从 Dialog 升为视图模式）；「全部删除」移入 ⋯ 危险区                              |
| 日程                 | 头部视图切换 + 日历                                   | 保留（这是最成熟的页面壳）；把它的 `h-14 头 + 视图 Tab` 模式定为全应用列表页标准壳                                                          |
| 提醒                 | 第二侧栏 + 头部状态徽章 + 分组卡 + 列表               | 删除头部重复徽章条；全局开关固定在头部右侧；分组统计小方块并入分组卡一行                                                                    |
| 笔记（仓储）         | 三模式侧栏 + Tab 条 + 编辑器                          | 保留骨架（它已对齐 Obsidian 心智）；书签并入文件树分区；§13 决策会影响此页去留                                                              |
| 笔记单页 `/note/:id` | 编辑器 + 右反链/图谱栏                                | 保留；作为 AI 笔记着陆页的地位不变                                                                                                          |
| 通知                 | 一级页                                                | 铃铛弹层（最近 N 条 + 全读）+ 完整页保留原布局                                                                                              |
| 治理                 | 独立头部风格                                          | 套用标准列表壳（h-14 头 + 过滤下拉），双按钮组过滤收敛为下拉                                                                                |
| 设置                 | 10 Tab 单页                                           | Tab 分组为：外观与语言 / AI / 通知与提醒 / 隐私与账户（并入账户中心）/ 数据（导入导出/用户文件）/ 高级（实验性/快捷键）                     |

统一规范（新建一份 UI 壳约定，落在 `packages/ui-vue-shadcn` 或 app-vue shared）：

- 列表页壳：`h-14 border-b` 头（标题 + 主操作右置）+ 内容 `max-w-7xl`；详情页 `max-w-4xl`。
- 模块第二侧栏统一 `w-64`，且允许折叠（repository 的 ResizablePanel collapse 模式推广到 goal/reminder）。

---

## 11. 需要保留的组件和状态

改版"不能动"的资产清单：

**状态与数据层（全部保留）**

- 所有 Pinia store 与 composable 门面：`useGoal`、`useTask`、`useSchedule`/`useCalendarView`、`useReminder`、`useRepository`（及其 5 个子 composable 拆分，`useRepository.ts:116-155`）、`useAIChatView` 及其 4 个 workflow 子 composable、`useDashboard`、`useNotification`、`useUserSetting`、`useAccount`、`useSession`。
- DI 端口体系：`di/keys.ts` 全部 injection key（`REPOSITORY_SERVICE_KEY`、`DESKTOP_AUTH_API_KEY`、`LOGOUT_HANDLER_KEY`、`MAIN_NAVIGATION_KEY`…）与两端 `di-app.ts` 装配——**布局层重构不得绕过端口直连 HTTP/IPC**。
- 路由契约：`?dialog=goal&goalId=` 查询参对话框（AI 与空态深链依赖）；`/note/:id`、`/goals/:id` 等被 AI 工作流 `openRecentKnowledgeNote/openAutomatedGoal` 硬引用的路径。
- 守卫类状态：编辑器未保存守卫（两个 composable）+ 标签页状态（`editor-workspace-ui-store.ts`）；认证守卫 `createAuthGuard`。

**交互组件（保留，可换皮不换逻辑）**

- 对话框族：`GoalDialog`、`GoalFolderDialog`、`KeyResultDialog`、`ActivateFocusModeDialog`、`TaskTemplateDialog`（含依赖/循环/目标绑定三段式表单）、`CreateScheduleDialog`、`BatchImportDialog`、`ImageResourcePickerDialog`、`ResourcePickerDialog`、`ReferenceRepairDialog`、`SelfContainedExportDialog`、`useConfirm` 确认框。
- 日历三视图 + `DayDetailSheet` + `TaskEventActionPanel`；`TaskDAGVisualization`；`DraggableTaskCard` 拖拽建依赖。
- 编辑器核心：`ActiveDocumentPane`/`MarkdownEditor`（CodeMirror6 扩展在 `editor/codemirror/`）、`LinkSuggestion`、`BacklinkPanel`、`LinkGraphView`、`MediaViewer`。
- AI：`AIConversationSidebar`、`AIMessagePanel`、`AIFooterComposer`、`AIGoalWorkflowPanel`（1200+ 行，是工作流产物渲染的唯一实现）。
- 共享：`ActionableWrapper`（右键/悬浮菜单容器，goal/reminder 侧栏都在用）。

**测试契约**

- 大量 `data-testid`（`ai-chat-view`、`dashboard-stat-card-*`、`create-goal-button`、`goal-agent-*`、`notification-filter-*`…）被 Playwright 用例引用（`apps/web/e2e/`、`playwright.ai-workspace.config.ts` 等 5 份配置）——重构时 testid 必须随组件迁移。

---

## 12. 改版风险点

1. **双端同源**：`app-vue` 同时服务 Web 与 Desktop（hash 路由 + IPC + 桌面通知弹窗路由 `/custom-notification`）。任何布局/导航改动都要在 Electron 下回归（尤其 `MainLayout.vue:12-16` 的 `isDesktopEnvironment` 分支——桌面端隐藏应用名，因为有系统标题栏）。
2. **E2E 脆性**：5 份 Playwright 配置 + e2e 用例锚定 testid 与路由路径；导航重组（如删除 `/ai/chat`）会打断 `ai-workspace` 专项测试。建议先加路由 redirect 再删导航项。
3. **深链兼容**：AI 工作流、通知点击、dashboard 卡片都以硬编码路径跳转；schedule 模块当前**仅**暴露 `/schedule/calendar` 单入口（无 week/dashboard 双轨 redirect）。删改其它路由时优先直达新路径，避免长期兼容 redirect 双轨。
4. **导航是 DI 可覆写的**：宿主可注入 `MAIN_NAVIGATION_KEY` 覆盖默认导航（`MainLayout.vue:18-19`）。改 NavigationItem 结构（加分组/图标）属于**破坏性接口变更**，需同步 web/desktop 两个宿主与 `di/types.ts`。
5. **状态机 UI 的回归面**：AI goal-agent 的 6+ 等待态按钮互斥逻辑、编辑器未保存守卫、提醒组控制模式——这三处是"改布局时最容易改坏行为"的区域，迁移按钮位置时逻辑分支不要重写。
6. **移动端不同步**：`apps/mobile` 是独立 React Native UI，本次重构范围外，但导航语义（模块命名、分组）若变，会造成两端心智不一致——命名变更需同步 mobile 文案。
7. **i18n 键面**：导航/标题全部走 i18n key（`nav.*`、`*.route.*`），新增分组标签需要补 `packages/app-vue/src/locales/` 两种语言。
8. **PowerSync/离线**：§13 若采纳 Obsidian 方向，`documents/document_links/resources` 同步表与服务端 RAG 索引管线是最大的架构联动面，不是纯前端改动。

---

## 13. 专题：仓储/Editor 模块的走向 —— 自建 vs 接入 Obsidian

（回应产品层疑问：笔记功能是否应该继续自建，还是设计架构接入外部 Obsidian 联动。）

### 13.1 现状事实（代码依据）

1. **当前是"DB 化的 Obsidian 克隆"**：笔记 = `resources` 表行（content 存 DB，带 version），非文件系统；语法层高度 Obsidian 兼容——`[[目标|别名]]`、`[[目标#小节]]`（`wiki-links.ts`）、标准 markdown 图片/链接引用（`markdown-resource-references.ts`）。
2. **双链/反链/图谱在客户端即时计算**（`link-index.ts` 遍历全部资源 content 建索引）——没有服务端链接表参与 UI（PowerSync schema 中虽有 `document_links` 表，前端索引不依赖它）。
3. **AI 是这个库的最大"写入方"与"读取方"**：知识笔记工作流创建 resource、知识问答对 resource 做服务端 RAG（`indexStatus`、`reindex_resource` agent 工具、`ReindexKnowledgeSchema`）。
4. **前端只通过一个端口访问仓储**：`RepositoryServiceLike`（`useRepository.ts:32-71`，13 个方法），Web/Desktop 各注入一个实现。**这意味着"换存储后端"在前端侧只需要第三个适配器**。
5. **后端存储早已是"文件端口 + 文件适配器"结构（关键发现）**：`packages/repository/src/server/application/ports/i-storage-port.ts` 定义 `IStoragePort { write/move/delete/read }`，以 `{repositoryId, path}` 寻址；`FsStorageAdapter`（`.../adapters/fs/fs-storage.adapter.ts`）**已经把每个资源的 content 落成磁盘上的真实文件**（`baseDir/{repositoryId}/{path}`）。Desktop 已用它（`repository/src/electron/index.ts:64` → `app.getPath('userData')/repository-storage`），API 服务端也用它（`main.ts:36` `resolveRepositoryStorageBaseDir`）。**"把 baseDir 指向 Obsidian vault"是配置 + 一个 vault 适配器的事，不是重写。**
6. **RAG 已经是"可插拔向量后端"结构（关键发现）**：`packages/ai/src/server/application/ports/knowledge-index.port.ts` 明确枚举 `vectorRecallBackend: 'none' | 'local-js-hybrid' | 'pgvector-ivfflat'` 与 `persistenceBackend: 'legacy-resource-metadata' | 'powersync-resource-metadata' | 'prisma-index-table'`；索引产物落 `AiKnowledgeIndexEntry` 表（`ai.prisma:139`，含 `embedding/chunks: Json`、`contentHash`、`status`）。ai-service（Python）是**无状态**的——`KnowledgeIndexingService` 只对传入的 `content` 字符串做分块+嵌入（`knowledge_query_service.py:113`），喂什么内容都行，不关心内容来自 DB 还是 vault 文件。
7. **当前检索路径不支撑"2000 篇全量问答"（必须改的点）**：`RepositoryKnowledgeSourceAdapter.listRelevantResources`（`apps/api/src/modules/ai/repository-knowledge-source.adapter.ts:52`）先 `listResources` 再对**每篇** `getResource` 逐条 hydrate（N+1），然后在内存里做关键词打分（`scoreResource`，纯 token 包含计数）。2000 篇 × 每次问答全量读取 + 线性打分，既慢又不是真正的向量召回。这是你"把所有个人笔记用于问答"目标唯一真正的瓶颈。
8. 维护成本证据：editor + repository 两模块 ≈ 90+ 源文件、17 个 editor composable、自建 CodeMirror live-preview（`markdown-live-preview.ts`）、引用修复、自包含导出——约占 app-vue 总文件量的 1/4。

### 13.2 目标架构（已确认方向：Obsidian vault 为真源 + GitHub 同步 + 全量 RAG）

产品决策已定：桌面端/移动端选一个文件夹作为仓库（直接用 Obsidian vault），vault 用 GitHub 同步，Web 端只读，RAG 对全部 2000+ 笔记开放。下面是落地这套的架构，全部沿用代码里**已经存在**的端口，不新造并行体系。

#### 13.2.1 真源与同步（vault 是唯一真相，GitHub 是传输层）

```
        ┌────────────── Obsidian Vault（磁盘上的 .md 真源）──────────────┐
        │                                                                │
 桌面端 Electron                移动端 (Expo)                    GitHub 仓库
 baseDir = vault 目录       本地 vault 副本（git clone）      origin（同步中枢）
   │ 读写 .md 直接落盘          │ isomorphic-git pull/push          │
   └──────── git push/pull ─────┴──────── git push/pull ────────────┘
                                   │
                          （变更后触发重新索引）
                                   ▼
                    RAG 索引层：AiKnowledgeIndexEntry(embedding/chunks)
                                   ▲
     Web 端（只读）──── 查询走服务端索引缓存，不碰磁盘 vault ────┘
```

- **不要让知行自己发明同步协议**。vault 的多端一致性交给 **git（GitHub）**：桌面端可直接调用系统 git 或内置 `isomorphic-git`；移动端用 `isomorphic-git`（纯 JS，Expo 可用）对 clone 下来的 vault 目录做 pull/commit/push。知行只需在"打开 vault / 保存笔记 / 应用启动"时机触发 pull/push，冲突交给 git（`.md` 文本合并友好）。
- **Web 端只读的真正含义**：Web 跑在浏览器里，摸不到本地磁盘 vault，所以它**不参与 vault 编辑**，只消费"服务端已索引的笔记内容缓存 + RAG 问答"。这正好和你的要求吻合，且不需要为 Web 造 vault 桥。

#### 13.2.2 存储侧：一个 vault 适配器，插进已有的 `IStoragePort`（§13.1-5）

后端已有 `IStoragePort` + `FsStorageAdapter`，且 `FsStorageAdapter` 已经把内容写成 `baseDir/{repositoryId}/{path}` 的真实文件。落地只需两步：

1. **把 repository 的 `storageBaseDir` 指向 vault**。`resolveRepositoryStorageBaseDir` 已支持显式路径/env 覆盖（`storage-config.ts`）；桌面端把 `createRepositoryElectronModule({ storageBaseDir: <用户选的 vault 目录> })` 一改即可（`repository/src/electron/index.ts:64` 现在硬编码 `userData/repository-storage`）。
2. **加一个"vault 感知"适配器**（可继承 `FsStorageAdapter`）：
   - `read/write/move/delete` 直接复用文件语义（已有）；
   - 额外职责：**目录扫描回填 DB 索引**（vault 里已有的 2000 篇不是知行建的，需要一次 `scanVault()` 把文件登记成 resource 行 + 触发索引）；
   - `chokidar` 监听 vault 变更 → 增量 upsert（Obsidian 里改了笔记，知行侧索引跟上）；
   - 写路径规则：AI 生成的笔记落 `vault/00-inbox/`（可配），不污染用户的既有结构。

   `RepositoryClientDTO.path` 字段已存在且允许 null（`repository-client.ts:24`），用它承载 vault 绝对路径，零 schema 变更。

3. **`resources` 表从"内容真源"降级为"文件索引/缓存"**：content 列变成"最近一次读到的快照"，真相在 .md 文件。这与 §13.1-5 的现状是连续的（现在 FsStorageAdapter 也已经在写文件，DB 与文件已并存），不是推倒重来。

#### 13.2.3 RAG 侧：复用已有索引端口，把召回换成真向量（§13.1-6、13.1-7）

这是唯一需要"补强"而非"重排"的地方，因为你要 2000 篇全量问答：

1. **索引入口不变**：vault 扫描/文件变更 → 对每篇 .md 调用现有 `knowledge-index` 工作流（Python `KnowledgeIndexingService` 分块+嵌入，产物 upsert 进 `AiKnowledgeIndexEntry`）。内容来自文件而非 DB，对 ai-service 完全透明（它只吃 `content` 字符串）。
2. **召回换实现**：`IKnowledgeIndexRepository.findRelevantResources`（`knowledge-index.port.ts:33`）已是抽象方法，且 `vectorRecallBackend` 枚举里已经写好了 `'pgvector-ivfflat'` 这个目标态。把当前 `RepositoryKnowledgeSourceAdapter` 的"list 全部 + 逐条 hydrate + 内存关键词打分"（§13.1-7 的 N+1 瓶颈）替换为：
   - **服务端（API/Web 问答路径）**：Postgres 开 `pgvector`，`AiKnowledgeIndexEntry.embedding` 落 `vector` 列 + IVFFlat 索引，召回走 SQL ANN（`vectorRecallBackend: 'pgvector-ivfflat'` → status `enabled`）。2000 篇的向量检索是毫秒级，彻底解决全量问答。
   - **桌面端（本地问答路径）**：保持 `local-js-hybrid`（现状 fallback），因为桌面端向量量级小、可本地算；或桌面端也把问答请求转发给服务端索引。
3. **嵌入质量**：现在无 provider 时用的是 48 维 hash 投影的"伪嵌入"（`_embed_text`，`knowledge_query_service.py:415`）——够做玩具召回，2000 篇全量问答要配真 embedding provider（`_apply_provider_embeddings` 已支持，只差把 `provider_config` 常态传入）。

#### 13.2.4 编辑侧：知行退出重度编辑，聚焦"预览 + 反链 + 跳 Obsidian + AI"

- `/note/:id` 与 `RepositoryWorkspaceView`：桌面端保留"只读预览 + 反链/图谱 + 快速捕获（新建/追加）"，主编辑按钮改为 **`obsidian://open?vault=<vault>&file=<path>`** 直接唤起 Obsidian。
- 可整体退役的重装备（vault 场景无意义或 Obsidian 已做得更好）：TabManager 多标签、EditorSplitView 分屏、ReferenceRepairDialog 引用修复、SelfContainedExportDialog 自包含导出、BatchImportDialog 批量导入。**这批正是 §9-C 界面收缩要砍的那批**——UI 精简与架构切换指向同一批删除项，不返工。
- 反链/图谱可留（`link-index.ts` 客户端即时算，对 vault 文件同样成立），作为知行相对 Obsidian 的"轻查看"补充。

一句话：**存储端口和索引端口都已经存在**，工作量集中在①一个 vault 适配器（扫描+监听）②pgvector 召回替换③git 同步接线，而不是"重写笔记系统"。

### 13.3 落地顺序（与 UI 重构解耦，可并行）

| 阶段 | 内容                                                                                                                          | 风险                                         | 与 UI 重构关系          |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------- |
| 0    | **UI 收缩**（§9-C）：砍多标签/分屏/导出/批量导入，`/repository` 更名"笔记"，`/note/:id` 转预览优先                            | 零架构风险，纯前端减法                       | 本轮重构直接做          |
| 1    | **桌面 vault 适配器**：选目录 → `storageBaseDir` 指向 vault → `scanVault()` 登记 2000 篇 → chokidar 监听 → `obsidian://` 跳转 | 中：文件扫描/编码/大 vault 性能              | 独立于 UI，可并行 spike |
| 2    | **pgvector 召回**：加 `vector` 列 + IVFFlat + `findRelevantResources` 走 ANN + 常态 embedding provider                        | 中：需 DB 迁移与 2000 篇回填索引             | 后端专项                |
| 3    | **GitHub 同步**：桌面 git push/pull 接线；移动端只读（不接 git，走服务端索引）；Web 走服务端索引只读                          | 中：桌面单端 git 冲突处理                    | 后端/桌面专项           |
| 4    | **一次性迁移**：现有 DB 里 2000+ 篇导出为 .md 到 vault（若它们还没在文件里）；`document*`/`resources` PowerSync 表角色重定义  | 一次性；项目声明不需要平滑迁移（`AGENT.md`） | 数据专项                |

**结论**：方向 B 不仅可行，而且代码里的两个关键端口（`IStoragePort`、`IKnowledgeIndexRepository`/`vectorRecallBackend`）**本来就是朝这个方向留的**。本轮 UI 重构按阶段 0 执行（纯减法、与架构切换零冲突），阶段 1–4 作为架构专项排期，不阻塞界面改版。

### 13.4 已确认的实现细节（2026-07-11 拍板）

1. **移动端笔记：暂定只读**。移动端与 Web 一样只消费服务端已索引内容 + RAG 问答，**不做本地 vault、不接 `isomorphic-git`**。阶段 3 由此收缩为桌面单端 git 接线。后续若要移动端可编辑，再单独立项。
2. **RAG 召回：跑服务端**。2000+ 篇统一走服务端 pgvector，Web/移动/桌面三端共享同一索引与问答；桌面端问答也转发服务端，不在本机维护第二套向量库。推论：**桌面端需要把 vault 文件内容上报服务端做索引**（"vault 在本地、索引在云端"的必要数据流），这是阶段 1 与阶段 2 的接缝，vault 适配器的 `scanVault()`/chokidar 变更回调要顺带触发上报。
3. **附件/图片**（待处理，不影响方向）：Obsidian vault 里的图片是相对路径文件；知行现在的图片是 resource 引用（`markdown-resource-references.ts`）。切 vault 后图片按文件相对路径解析即可，但预览器要支持从 vault 目录读图——阶段 1 一并处理。

---

## 附：分析覆盖的关键文件清单

- 路由：`packages/app-vue/src/router/index.ts`、`router/guards.ts`、各 `modules/*/router/index.ts`（10 份）
- 布局：`layouts/MainLayout.vue`、`layouts/AuthLayout.vue`、`di/navigation.ts`
- 视图：`views/DashboardView.vue`、`modules/{ai,goal,task,schedule,reminder,repository,editor,notification,governance,setting,account}/views/*.vue`（22 个有路由视图 + 4 个孤儿视图）
- 状态/服务：`modules/*/composables/*`、`modules/*/stores/*`、`repository/services/repository-resource-gateway.ts`、两端 `platform/di-app.ts`
- 契约：`packages/contracts/src/modules/{goal,task,schedule,reminder,repository,editor,ai,governance,notification,setting}/`
- 同步：`packages/powersync-schema/src/index.ts`
- 宿主：`apps/web/src/`、`apps/desktop/src/renderer/bootstrap/app.ts`
