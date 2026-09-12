# 页面级 UI 重构方案（UI Page Redesign Plan）

> **⚠️ Core vNext Goal/Task 边界更新（2026-09-07）**：GoalFolder、Goal Focus/Comparison、TaskFolder、Task Dependency/DAG/CriticalPath 已按 ADR-053/054 与 Core vNext 从运行时、公开契约和产品 UI 退役。本文中仍出现这些名称的页面清单、数据字段、组件或交互描述均是 **vNext 之前的历史快照，不得作为当前实施依据**；当前产品真值以 `docs/product/modules/goal.md`、`docs/product/modules/task.md` 与相关 ADR 为准；Core vNext 的完整实施证据已归档至 `docs/plan/archive/2026-08-25-core-vnext-orchestration.md`。
>


> **⚠️ 已被取代（2026-07-12）**：壳与导航体系（§0.1 页面壳、§0.2 主导航、§0.4 响应式基线、§0.5 壳类共享组件、§15.3 实施顺序）由 `docs/UI_REDESIGN_V2_PLAN.md`（ChatGPT 桌面式壳，AI 优先三态布局）**取代**。各页面章节 §1–§14 的**内容级结论**（主/次操作、信息删减清单、拆分/退役/更名表、空态设计、不可破坏契约）仍然有效，作为 V2 面板内容设计的输入，由 V2 §6 逐条映射引用。请勿按本文 §0/§15.3 施工。
>
> **⚠️ 笔记边界更新（2026-07-16）**：§9/§10 中仍保留的跨端轻编辑、新建和保存描述已由 [ADR-034](./architecture/adr/ADR-034-obsidian-vault-repository.md) 取代。目标态为 Desktop 在 Obsidian 外部编辑；绑定 GitHub 知识仓库后 Web 可快捷创建新文件，但已有笔记编辑仍延期。本文相关内容只用于理解迁移前 UI。
>
> **⚠️ 路由/DTO 退役（2026-07-21）**：`/note/:id`、`EditorLinearView`、`ResourceClientDTO` 与旧 Repository CRUD 已从运行时删除；AI 打开笔记改为 repository projection / Local Vault 工作区。以 product 模块文档与 ADR-034 为准。
>
> 状态：~~实施方案~~ → 内容级参考。上游分析见 `docs/UI_REDESIGN_BRIEF.md`（下称 Brief），本文不重复分析，只给可执行的页面级方案。
> 生成日期：2026-07-11。范围：`packages/app-vue`（Web 与 Desktop 共用前端层）。
> 原则：**不追求花哨视觉；优先信息层级、业务清晰度、可维护性**。全部改动为现有能力的重排与减法，不新增业务功能（唯一例外：日程事件"查看详情"留位，Brief §8-P3 已定性为必须补的缺口）。
> 阅读方式：§0 是全局约定（页面壳 / 状态 / 响应式 / 导航），每个页面章节只写与全局约定的差异，避免逐页重复。

---

## 0. 全局约定

### 0.1 三种页面壳（收敛 P2「页面壳不统一」）

现状：内容宽度散布 `max-w-3xl/4xl/5xl/7xl/960px/1400px`，头部有 `h-14 border-b` 与自由布局两种。统一为三种壳，落在 `packages/app-vue/src/components/shared/`，消费 `ui-vue-shadcn` 已有的 `custom/linear` 组件族：

| 壳                             | 适用页面                                              | 结构                                                                                                         | 现成基础                                                                                   |
| ------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| **ListPageShell（列表壳）**    | 仪表盘、目标列表、任务、提醒、通知、治理              | `LinearPageHeader`（sticky：标题 + 描述 + 右置操作）→ 可选 FilterBar 行 → 内容 `max-w-7xl mx-auto px-6 py-6` | `custom/linear/LinearPageHeader.vue` 已存在（`px-6 py-3 border-b sticky top-0`），直接采用 |
| **DetailPageShell（详情壳）**  | 目标详情、KR 详情、复盘、任务详情、规则详情/编辑/历史 | 返回按钮 + 标题 + 状态徽章 + 右置操作 → 内容 `max-w-4xl`                                                     | 从 `GoalDetailView` / `TaskDetailView` 现有头部抽取                                        |
| **WorkspaceShell（工作区壳）** | AI 首页、日程日历、笔记工作区（`/repository`；`/note/:id` 已退役） | 全宽无 max-w；`ResizablePanel` 分栏；模块第二侧栏统一 `w-64` 可折叠                                          | repository 的 ResizablePanel collapse 模式推广到 goal/reminder                             |

操作层级约定（每页强制执行）：

- **主操作**：页头右侧第一位，实心 Button，一页最多一个。
- **次操作**：主操作旁 `⋯`（DropdownMenu）或区块级按钮。
- **破坏性操作**：只允许出现在 `⋯` 菜单末尾"危险区"分组（红色文案 + `useConfirm` destructive），禁止常驻工具栏。

### 0.2 主导航重构（`MainLayout.vue` + `di/navigation.ts`）

目标形态（Brief §9，入口 12 → 8）：

```
工作台   ◆ 首页(AI)   ◆ 仪表盘
计划     ◆ 目标
执行     ◆ 日程   ◆ 任务   ◆ 提醒
知识     ◆ 笔记   ◆ 规范
─────────────────────────────
🔔 通知铃铛（未读角标 → NotificationDrawer 弹层，"查看全部"进 /notifications）
⚙ 设置（账户并入其"账户"Tab）
```

实施要点：

1. `NavigationItem` 增加 `group? / icon? / badge?` 字段——**破坏性接口变更**（导航 DI 可覆写，Brief §12-4）：同步改 `di/types.ts`、`apps/web` 与 `apps/desktop` 两个 `di-app.ts`、`MainLayout.vue` 渲染。路由 meta 已有 `icon/order` 字段可直接回收。
2. 删除导航项 `/ai/chat`；路由保留并 `redirect: '/'`（先 redirect 后删导航，保护 `playwright.ai-workspace` E2E，Brief §12-2）。
3. `/notifications`、`/account/center` 移出一级导航，路由保留做深链兼容。通知入口改为侧栏底部 `NotificationBell`（组件已存在）+ `NotificationDrawer`（组件已存在）。
4. `/governance` 移入"知识"分组次级位置。
5. 新增 i18n key：`nav.group.workbench / plan / execute / knowledge`，补 `locales/` 中英两份（Brief §12-7）。
6. `nav.repositories` 文案「仓库」→「笔记」；repository 路由 meta 硬编码中文改 i18n key（修 Brief §8-P3）。
7. Electron 回归：保留 `isDesktopEnvironment` 分支（桌面端隐藏应用名，`MainLayout.vue:40`）。
8. 导航按钮 `data-testid`（`main-nav-*` / `bottom-nav-*`）生成规则不变。

### 0.3 状态设计基线（空 / 加载 / 错误）

新增共享组件 `AppEmptyState.vue`：图标（lucide，muted 色）+ 一句话标题 + 可选描述 + 主操作按钮（与页头主操作同一动作）+ 可选次链接。testid 约定 `{page}-empty-state`。

**加载**：

- 首次加载 = Skeleton 镜像最终布局（卡片网格 → 卡片骨架 ×N；列表 → 行骨架 ×N；日历 → 网格骨架）。禁止整页 spinner。
- 刷新 = 页头小 spinner，内容保持旧数据（stale-while-revalidate 展示约定）。沿用各 composable 现有 loading 标志，**不改数据层**。

**错误**：

- 区块级：该区域替换为 inline `Alert`(destructive) + 「重试」按钮（调用 composable 既有 fetch 方法）。多区块页面各区独立失败，不整页失败。
- 动作级：sonner toast（现状保留）。
- 禁止 alert() / 弹窗式错误。

### 0.4 响应式基线

前提（Brief §2、§12-6）：真正的移动端是 `apps/mobile`（React Native 独立 UI）。本文"移动端响应式"指 **Web 窄视口与桌面窄窗口的优雅降级**——目标是可用与不破版，不追求原生移动体验。

| 断点           | 行为                                                               |
| -------------- | ------------------------------------------------------------------ |
| ≥1280 (xl)     | 完整布局，右侧 context panel 可常驻                                |
| 1024–1279 (lg) | 右侧面板转悬浮 Sheet；卡片网格 3→2 列                              |
| 768–1023 (md)  | 模块第二侧栏 → 页头按钮唤起的 Sheet；网格 2 列                     |
| <768 (sm)      | 主导航 → 顶部条（汉堡 + 铃铛）+ Sheet；网格 1 列；多列元数据转堆叠 |

统一入口：shared composable `useViewportBreakpoint()`（或纯 tailwind 响应类），**各页不得自造断点值**。

### 0.5 共享组件动作清单

**复用（已存在，直接用）**：`LinearPageHeader / LinearPanel / LinearListItem / LinearSidebarItem`（ui-vue-shadcn `custom/linear`）；`ActionableWrapper`（shared）；`NotificationBell / NotificationDrawer`（notification 模块）；shadcn primitives（skeleton / sheet / drawer / tabs / dropdown-menu / collapsible / alert / badge / resizable / switch / tooltip…）。

**新建（本轮允许新增的全部共享层，共 5 个）**：

| 组件                  | 说明                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `ListPageShell.vue`   | §0.1 列表壳（header slot + filter slot + content slot）                                   |
| `DetailPageShell.vue` | §0.1 详情壳（back + title + badges + actions）                                            |
| `ModuleSidebar.vue`   | `w-64` 可折叠第二侧栏容器（封装 ResizablePanel collapse）                                 |
| `AppEmptyState.vue`   | §0.3                                                                                      |
| `FilterBar.vue`       | 「状态 Tabs + 过滤下拉 + 搜索框」标准行（task / governance / notification 共用，slot 化） |

**删除（孤儿 / 调试，Brief §3、§8-P3）**：`goal/views/FocusModeView.vue`、`goal/views/FocusCycle.vue`、`goal/views/WeightSnapshotView.vue`、`schedule/views/ScheduleWeekView.vue`（孤儿视图已删除；Vue 日程仅 `/schedule/calendar`）；`/goals/rules-demo` 补 DEV 守卫（或直接删除）；AIChatView 中 legacy goal workflow 分支。

### 0.6 全局不可破坏契约（每页默认适用，不再逐页重复）

- `data-testid` 随组件迁移（5 份 Playwright 配置锚定，Brief §11）。
- `?dialog=goal&goalId=` URL 对话框契约；`/repository?note=`、`/goals/:id` 等 AI 工作流硬引用路径（`/note/:id` 已退役）。
- 一切数据访问走 DI 端口与 composable 门面，布局重构不得直连 HTTP/IPC。
- 每页改动在 Web + Electron 双端回归（Brief §12-1）。
- 删除/改名路由若需过渡可加 redirect；**当前** Vue schedule 已收口为单一 `/schedule/calendar` 入口（不再保留 week/dashboard 双轨）。

---

## 1. AI 工作台 `/`（`AIChatView.vue`）

**1) 页面目标**：应用唯一首页与中枢——对话、驱动三种 Agent 工作流（目标创建 / 知识笔记 / 知识问答）、快速回到最近对象；空闲时兼任"今日概览"（承接仪表盘的高频职责，Brief §9-1）。

**2) 最重要的动作**

- 主操作：**发送消息**（含工具模式选择：chat / goal-create / note / qa）。
- 次操作：工作流生命周期决策（提交澄清 / 确认执行 / 取消 / 重试）、新建会话、切换会话、打开产物（目标 / 笔记）。

**3) 新布局结构**（WorkspaceShell，三栏骨架保持）

```
┌───────────┬───────────────────────────────┬────────────────────┐
│ 会话侧栏    │ 消息时间线 (AIMessagePanel)     │ 上下文面板 w-96      │
│ w-64 可折叠 │                               │ ┌────────────────┐ │
│ ・新建会话  │                               │ │ 工作流操作条      │ │
│ ・会话列表  │                               │ │ (生命周期按钮组)  │ │
│ ・折叠段:   │                               │ ├────────────────┤ │
│   AgentRun │                               │ │ 产物/证据面板     │ │
│   最近目标  ├───────────────────────────────┤ │ (AIGoalWorkflow  │ │
│   最近笔记  │ Composer                      │ │  Panel / 引用)   │ │
│           │ [模式] [输入框.......] [⚙][发送] │ │ 空闲=今日概览     │ │
└───────────┴───────────────────────────────┴────────────────────┘
```

核心变更：**工作流生命周期按钮组（goal-agent 澄清/确认/取消/重试等 6+ 等待态）整体从 composer action-rail 迁至右栏顶部"工作流操作条"**，与产物同屏；composer 回归纯对话（Brief §4.1 页面级问题）。迁移只动模板位置，**状态机分支逻辑一行不改**（Brief §12-5），`goal-agent-*` testid 随迁。

右栏三态：① 空闲（无运行工作流）→ 今日概览（`DailyTodoWidget` + `UpcomingRemindersWidget` + 目标进度列表）；② 工作流运行 → 操作条 + 产物草稿；③ 知识问答 → 证据列表 + `evidenceStatus==='grounded'` 校验提示（未接地时"生成笔记"禁用并说明原因——校验保留）。

**4) 首屏**：当前会话消息时间线 + composer；≥xl 时右栏空闲态常驻今日概览。新用户 / 无会话：中央欢迎区 + 三个工作流入口卡（点击即设定对应工具模式）+ composer。

**5) 次要信息处理**

| 信息                               | 处理                                     | 原因                                                                                     |
| ---------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| 模型选择器                         | 收进 composer ⚙ 菜单（已部分完成，做完） | 低频配置，不值得常驻输入区                                                               |
| 会话列表刷新按钮                   | 收进侧栏 ⋯ 菜单                          | 低频；会话切换已隐式拉取                                                                 |
| AgentRun 历史列表                  | 侧栏折叠段，默认收起                     | 回溯用途，非日常路径                                                                     |
| recentGoals / recentKnowledgeNotes | 侧栏折叠段                               | 快捷入口有价值但非首要，折叠保留而非删除                                                 |
| legacy 工作流按钮组                | **删除**                                 | `localStorage['ai:debug:legacy-goal-workflow']` 调试残留，新状态机已全覆盖（Brief §4.1） |

**6) 表单 / 卡片 / 列表 / 详情组织**：无传统表单，对话即输入。草稿编辑（Goal/KR/任务模板/提醒草稿，`AIGoalDraftEditor` + `AIGoalWorkflowPanel`）全部在右栏，保持"默认折叠、有产物才出现"契约；会话列表项用 `LinearListItem`；证据引用列表在右栏，点击走 `openRecentKnowledgeNote` → `/repository?note=`。

**7) 空 / 加载 / 错误**：空会话 = 欢迎态（见 4）；会话切换 = 消息行 skeleton；流式生成 = 现有打字指示 + stop 按钮（保留）；发送失败 = 消息气泡内 inline 重试；工作流执行失败 = 操作条 retry 分支（现有状态机，不动）。

**8) 响应式**：<xl 右栏转右侧 Sheet（有产物/等待决策时页头出现「工作流」按钮 + 角标，避免用户错过决策点）；<md 会话侧栏转 Sheet；composer sticky bottom；今日概览三 widget 在 <lg 不渲染（窄屏概览由 RN 端承担，降级可接受）。

**9) 复用组件**：`AIMessagePanel`、`AIFooterComposer`、`AIConversationSidebar`、`AIGoalWorkflowPanel`、`AIGoalDraftEditor`、`DailyTodoWidget`（task 模块 widgets）、`UpcomingRemindersWidget`（reminder 模块 widgets）、sheet / skeleton / collapsible。

**10) 拆分 / 重命名**

| 动作         | 对象                                             | 说明                                                                                                                                                                   |
| ------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 拆分         | `AIChatView.vue`（574 行，~80 个 workflow 绑定） | → `AIChatView`（布局协调）+ `AIContextPanel.vue`（新，右栏三态容器）+ `AIWorkflowActionBar.vue`（新，生命周期按钮组，从 composer/主视图整体搬移）                      |
| 拆分（内部） | `AIGoalWorkflowPanel.vue`（1280 行）             | 按产物类型拆 `GoalDraftSection / KeyResultDraftSection / TaskDraftSection / ReminderDraftSection` 子组件；**对外 props/emits 不变**（它是产物渲染唯一实现，Brief §11） |
| 删除         | legacy workflow 模板分支 + localStorage 开关     | 见 5)                                                                                                                                                                  |
| 路由         | `/ai/chat` → `redirect: '/'`，导航项删除         | Brief §8-P1 双首页                                                                                                                                                     |

---

## 2. 仪表盘 `/dashboard`（`views/DashboardView.vue`）

**1) 页面目标**：从"第二首页"降级为**完整统计与回顾页**——今日概览的高频职责已由 AI 首页右栏承接（§1），本页保留全量统计、趋势与活动回顾。导航中留在"工作台"分组第二位。

**2) 最重要的动作**

- 主操作：**点击 widget 项跳转处理**（完成今日待办、查看目标详情）。
- 次操作：刷新、展开趋势/活动折叠区、统计数字点击跳转对应模块。

**3) 新布局结构**（ListPageShell）

```
LinearPageHeader「仪表盘」                       [刷新]
─────────────────────────────────────────────────
StatStrip：活跃任务 12 · 今日完成 3 · 活跃目标 4 · 待提醒 2 · 未读 5 · 冲突 0
─────────────────────────────────────────────────
┌ 今日待办 widget ┐ ┌ 即将提醒 widget ┐ ┌ 目标进度列表 ┐
└───────────────┘ └────────────────┘ └────────────┘
▸ 趋势图（Collapsible，默认收起）
▸ 活动时间线（Collapsible，默认收起）
```

**4) 首屏**：统计条 + 三列 widget。一屏内完整可见。

**5) 次要信息处理**

| 信息                     | 处理                                                                             | 原因                                                            |
| ------------------------ | -------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 6 张统计卡               | 压成一行 `StatStrip` 紧凑数字条（保留点击跳转与 `dashboard-stat-card-*` testid） | 卡片阵列占首屏近半，信息量只是 6 个数字                         |
| 趋势图（ECharts 双序列） | Collapsible 默认收起                                                             | 回顾用途、低频；渲染成本高，收起可延迟初始化                    |
| 活动时间线               | Collapsible 默认收起                                                             | 与通知中心信息重叠（Brief §4.2 建议合并方向），先弱化观察使用率 |
| 快捷操作条（4 按钮）     | **删除**                                                                         | 与左侧主导航 100% 重复（Brief §4.2）                            |

**6) 组织**：三 widget 各自内部滚动（`max-h` + scroll-area）；目标进度列表抽成 `GoalProgressWidget` 移入 `goal/components/widgets/`（与 task/reminder 的 widgets 目录约定对齐，供 AI 首页右栏复用）。

**7) 空 / 加载 / 错误**：每区独立 skeleton（statstrip 数字骨架、widget 行骨架）；区块独立 inline error + 重试，互不拖累；今日无待办 = widget 内"今天没有安排"+「新建任务」链接（跳 `/tasks`）；刷新保留 `reminderWidgetRefreshKey` 联动（Brief §4.2 不可删除状态）。

**8) 响应式**：widget 三列 → lg 2 列 → md 1 列；StatStrip 窄屏横向滚动，不换行。

**9) 复用组件**：`DailyTodoWidget`、`UpcomingRemindersWidget`、`LinearPageHeader`、collapsible、skeleton。

**10) 拆分 / 重命名**

| 动作 | 对象                          | 说明                                                                                                                                                      |
| ---- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 拆分 | `DashboardView.vue`（605 行） | → `DashboardStatsStrip.vue` + `DashboardTrendPanel.vue` + `DashboardActivityTimeline.vue`（dashboard 模块内）+ `GoalProgressWidget.vue`（移入 goal 模块） |
| 删除 | 快捷操作条模板段              | 见 5)                                                                                                                                                     |

---

## 3. 目标列表 `/goals`（`GoalModuleLayout.vue` + `GoalListView.vue`）

**1) 页面目标**：OKR 入口——按系统视图（进行中/已完成/已过期/回收站）与文件夹浏览目标，创建目标/文件夹，进入专注模式。

**2) 最重要的动作**

- 主操作：**新建目标**（保留 `?dialog=goal` URL 契约——AI 与空态深链依赖，Brief §11）。
- 次操作：切换系统视图/文件夹、新建文件夹、多目标对比（收进 ⋯）、激活专注模式、卡片 view/edit/delete。

**3) 新布局结构**（WorkspaceShell + ModuleSidebar）

```
┌ ModuleSidebar w-64 ────┐┌ 内容区 ──────────────────────────┐
│ 系统视图×4（计数徽章）    ││ LinearPageHeader「目标」(计数)     │
│ ───────────────        ││        [搜索] [新建目标] [⋯:对比]  │
│ 文件夹列表（色点+计数）    ││ ────────────────────────────── │
│ + 新建文件夹             ││ GoalCard 网格 (3列)              │
│ ───────────────        ││                                 │
│ [◎ 专注模式] ←未激活一行  ││                                 │
└────────────────────────┘└─────────────────────────────────┘
```

**4) 首屏**：当前视图的目标卡片网格；侧栏系统视图计数即"状态总览"。

**5) 次要信息处理**

| 信息                       | 处理                                                 | 原因                                                      |
| -------------------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| 专注模式侧栏卡片           | 未激活时缩为一行按钮，激活时才展开为卡片（剩余天数） | 未激活时信息量为零，却常驻占侧栏约 1/4 高度（Brief §4.3） |
| 「对比」按钮               | 收进页头 ⋯ 菜单                                      | 低频功能（Brief §4.3 可弱化）                             |
| 搜索框                     | 目标数为 0 时隐藏                                    | 空集合搜索无意义                                          |
| GoalCard 上日期/文件夹徽章 | 降为次行小字（muted）                                | 网格扫视场景核心是"哪个目标、进展如何"，元数据是二级信息  |

**6) 组织**：侧栏项统一用 `LinearSidebarItem` + `ActionableWrapper`（文件夹右键/悬浮菜单保留）；卡片 = `GoalCard`（名称/进度/状态为主视觉）；删除走 `useConfirm` destructive（保留）；`?dialog=goal&goalId=` 的 `syncGoalDialogFromRoute` 逻辑原样保留。

**7) 空 / 加载 / 错误**：分视图空态——进行中视图空 = `AppEmptyState`「还没有进行中的目标」+ 主按钮「新建目标」+ 次链接「让 AI 帮我规划 →」（`router.push('/')`）；已完成/已过期/回收站空 = 纯说明文案，无按钮（这些视图的空是正常态，不应催促操作）。加载 = 卡片骨架 ×6。错误 = 区块 Alert + 重试。

**8) 响应式**：<md 侧栏转 Sheet（页头左侧出现视图切换按钮）；卡片 3→2→1 列。

**9) 复用组件**：`GoalCard`、`GoalDialog`、`GoalFolderDialog`、`ActivateFocusModeDialog`、`ActionableWrapper`、`LinearSidebarItem`、`ModuleSidebar`（新壳）、`AppEmptyState`。

**10) 拆分 / 重命名**

| 动作   | 对象                                                            | 说明                                                                                          |
| ------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 拆分   | `GoalModuleLayout.vue`（416 行）                                | 抽出 `GoalSidebar.vue`（系统视图 + 文件夹 + 专注入口），layout 只留路由容器与 dialog 同步逻辑 |
| 加守卫 | `/goals/rules-demo`                                             | `import.meta.env.DEV` 守卫或删除（Brief §8-P3）                                               |
| 删除   | `FocusModeView.vue`、`FocusCycle.vue`、`WeightSnapshotView.vue` | 孤儿视图（§0.5）                                                                              |

---

## 4. 目标详情 `/goals/:id`（`GoalDetailView.vue`）

**1) 页面目标**：单个目标的运营台——看总进度与 KR 健康度、记录进度、维护 KR、发起复盘。

**2) 最重要的动作**

- 主操作：**记录进度**（打开 `GoalRecordDialog`；手动 OKR 循环里的最高频动作，Brief §7-2）。
- 次操作：添加 KR（KR 区块级按钮）、创建复盘、编辑目标（⋯）、归档/删除（⋯ 危险区）。

**3) 新布局结构**（DetailPageShell，`max-w-4xl`）

```
← 返回 | 目标名 [状态徽章][重要度徽章]      [记录进度] [⋯]
起止 2026-01-01 ~ 2026-12-31 · 分类 · #标签  ← 单行元数据
──────────────────────────────────────────
┌ 概览行：进度环(小) + "KR 完成 2/5" + 描述摘要 ┐
├ KR 列表（KeyResultCard：当前/目标值+进度条）  │ [+ 添加 KR]
├ Tabs: [进度记录] [复盘]                     │
│   记录行（点击行内展开明细——保留现有模式）      │
└──────────────────────────────────────────┘
```

**4) 首屏**：标题行 + 概览行 + KR 列表前 3 项。KR 是这个页面的"正文"。

**5) 次要信息处理**

| 信息                 | 处理                              | 原因                                             |
| -------------------- | --------------------------------- | ------------------------------------------------ |
| 起止/分类/标签四宫格 | 压成标题下单行元数据              | 静态低频信息占首屏约 1/4（Brief §10 已定方向）   |
| 进度环（SVG ring）   | 缩小，与"KR 完成数"并排为一行概览 | 大环是装饰性放大，数值本身一行可承载             |
| 无描述占位文案       | 隐藏                              | 空占位是噪音（Brief §4.3 可隐藏）                |
| 创建复盘按钮         | 从页头移到"复盘"Tab 内首位        | 页头只留一个主操作；复盘动作在复盘上下文里更清晰 |

**6) 组织**：KR 编辑走 `KeyResultDialog`——**保存回调字段契约（weight/valueType/aggregationMethod 等）原样保留**（Brief §4.3 不可删除）；记录/复盘双 Tab 保留；记录行内展开（`toggleRecordDetail`）保留——已是正确的渐进展示；KR 行点击进 `/goals/:goalId/key-results/:keyResultId`。

**7) 空 / 加载 / 错误**：无 KR = KR 区 `AppEmptyState`「先添加一个关键结果」+「添加 KR」（此时它升级为页面主操作，页头「记录进度」禁用并提示原因——无 KR 不能记录）；无记录/复盘 = Tab 内轻量空文案；加载 = 详情骨架（标题行 + 3 行块）；目标不存在 = 整页 `AppEmptyState` + 返回列表。

**8) 响应式**：<md 元数据行换行为两行；进度环隐藏只留数字；Tabs 保持。

**9) 复用组件**：`KeyResultCard`、`GoalRecordCard`、`GoalRecordDialog`、`KeyResultDialog`、`GoalReviewListCard`、`DetailPageShell`（新壳）、badge / tabs。

**10) 拆分 / 重命名**

| 动作 | 对象                           | 说明                                                                                                                                                     |
| ---- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 拆分 | `GoalDetailView.vue`（388 行） | 抽出 `GoalOverviewHeader.vue`（标题+元数据+概览行）、`GoalRecordsTab.vue`、`GoalReviewsTab.vue`；KR 区留在视图内（与 dialog 回调耦合最深，避免过度拆分） |

---

## 5. 目标子页面群（`/goals/focus`、`/goals/compare`、复盘二页、KR 详情）

信息结构本身合理（Brief §4.3），问题是**入口分散**。统一入口后逐页微调：

| 页面                                              | 目标                         | 主操作 / 次操作                         | 布局与状态                                                                                                                      | 组件动作                                                              |
| ------------------------------------------------- | ---------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `GoalFocusView` `/goals/focus`                    | 展示当前专注期状态，冲刺心智 | 主：退出/调整专注；次：跳转专注中的目标 | 居中单卡（状态页，不套列表壳）：专注目标 + 剩余天数大字 + "隐藏非专注目标"开关；未激活访问 = `AppEmptyState` + 「激活专注模式」 | 复用 `ActivateFocusModeDialog`；入口固定为目标侧栏底部按钮（§3）      |
| `MultiGoalComparisonView` `/goals/compare`        | 多目标横向对比               | 主：选择对比目标；次：返回              | DetailPageShell，全宽表格区；<md 横向滚动                                                                                       | 入口收进列表页 ⋯ 菜单（§3）；复用 `comparison/` 现有组件              |
| `GoalReviewCreationView` / `GoalReviewDetailView` | 创建/查看复盘                | 主：提交复盘 / 无；次：返回详情         | DetailPageShell `max-w-4xl`；表单分节（自评/总结）；提交失败 inline error 保留已填内容                                          | 入口收敛到详情页"复盘"Tab（§4）；组件不动                             |
| `KeyResultDetailView`                             | KR 明细与记录轨迹            | 主：记录进度（预选该 KR）；次：编辑 KR  | DetailPageShell；进度趋势 + 记录列表                                                                                            | 复用 `GoalRecordDialog` / `KeyResultDialog`；进度统一读取 KR/Goal aggregate，不再使用独立 `ProgressBreakdownPanel` |

响应式与状态设计全部继承 §0.3 / §0.4，不特殊化。

---

## 6. 任务 `/tasks`（`TaskManagementView.vue` + `TaskTemplateManagement.vue`，含 `/tasks/:id`）

**1) 页面目标**：管理**可重复的"任务定义"**（模板：循环规则、父子、DAG 依赖、目标绑定）。页面语言去系统化：标题从「任务模板管理」改为「任务库」——"今天要做什么"由日程页与今日待办 widget 回答（Brief §4.4 模型级问题），本页回答"我定义了哪些事、它们如何关联"。

**2) 最重要的动作**

- 主操作：**新建任务**（`TaskTemplateDialog`，含循环规则/目标绑定/依赖三段式表单）。
- 次操作：状态过滤、卡片/图谱视图切换、暂停/恢复、编辑、拖拽建依赖、（危险区）全部删除。

**3) 新布局结构**（ListPageShell + FilterBar）

```
LinearPageHeader「任务库」(计数)            [新建任务] [⋯: 全部删除⚠]
FilterBar：[全部|进行中|已暂停|已归档](计数Tabs) [关系过滤▾] | 视图 [卡片|图谱]
─────────────────────────────────────────────
卡片视图：DraggableTaskCard 网格（拖拽建依赖保留）
图谱视图：TaskDAGVisualization 全宽内嵌（替代原 1400px Dialog）
```

**4) 首屏**：状态 Tabs + 当前过滤下的任务卡片网格。卡片主视觉 = 标题 + 循环规则 + 状态；关系计数为角标。

**5) 次要信息处理**

| 信息                                 | 处理                                          | 原因                                                                                  |
| ------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------- |
| 关系过滤第二排按钮（父子/前驱/后继） | 收进 FilterBar「关系过滤」下拉                | 低频过滤占一整行工具栏（Brief §4.4）                                                  |
| 「全部删除」按钮                     | 移入 ⋯ 菜单危险区（destructive confirm 保留） | 破坏性操作常驻主工具栏违反 §0.1；其"逐条循环删除"实现改批量属后端专项，本轮只降级入口 |
| 依赖图 Dialog                        | 升级为视图模式（图谱 Tab）                    | 1400px 弹窗是"用弹窗装下一个页面"的反模式；作为视图模式与卡片平级（Brief §10）        |
| DEV 演示路由入口                     | 保持 DEV-only 隐藏                            | 已有守卫，维持                                                                        |

**6) 组织**：过滤 = FilterBar（状态 Tabs 含计数 + 关系下拉）；卡片 = `DraggableTaskCard`（`enable-drag` + `onCreateDependency` 拖拽建依赖保留）；暂停/恢复二次确认保留；目标绑定表单段维持 `toGoalBindingPayload` 契约（完成实例自动累计 KR，Brief §4.4）。

`/tasks/:id`（`TaskDetailView.vue`，DetailPageShell）：标题 + 状态徽章 + **阻塞徽章（`isBlocked`/`blockingReason`）置顶醒目**（这是决策信息）；时间配置、父任务链接、依赖任务跳转保留；创建/更新时间弱化为页脚小字（原因：审计信息非决策信息）；主操作 =「编辑」，次操作 = 暂停/恢复、删除（⋯ 危险区）。

**7) 空 / 加载 / 错误**：空 = `AppEmptyState`「还没有任务定义」+「新建任务」+ 次链接「让 AI 帮我生成 →」（`/`）；过滤后空 = "无匹配"轻文案 + 清除过滤按钮；加载 = 卡片骨架；图谱加载 = 居中骨架块；错误 = 区块 Alert + 重试。

**8) 响应式**：卡片 3→2→1 列；<lg 拖拽建依赖禁用（触屏/窄屏误操作率高，依赖管理走编辑对话框内的依赖段）；图谱视图 <md 显示"请在更宽的窗口查看"占位（不为窄屏铺图谱交互）。

**9) 复用组件**：`DraggableTaskCard`、`TaskTemplateCard`、`TaskTemplateDialog`、`TaskDAGVisualization`、`FilterBar`（新）、`ListPageShell` / `DetailPageShell`（新）。

**10) 拆分 / 重命名**

| 动作 | 对象                                   | 说明                                                                                                       |
| ---- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 拆分 | `TaskTemplateManagement.vue`（425 行） | → `TaskFilterBar.vue`（消费共享 FilterBar）+ `TaskTemplateGrid.vue`；视图切换状态留在 `TaskManagementView` |
| 文案 | 页标题「任务模板管理」→「任务库」      | UI 层去"模板/实例"系统词；数据模型与 API 不动                                                              |
| 审计 | `TaskInstanceManagement.vue`           | 疑似无路由挂载，确认引用后删除或并入 widget 体系                                                           |

---

## 7. 日程 `/schedule/calendar`（`ScheduleCalendarView.vue`）

**1) 页面目标**："执行"分组默认入口——以日/周/月日历查看**日程事件 + 任务实例投影**，在日历里直接完成任务、创建日程。它是"我今天/本周要做什么"的正解页面。

**2) 最重要的动作**

- 主操作：**创建日程**（`CreateScheduleDialog`）。
- 次操作：日/周/月切换、翻页/回今天、点击任务事件完成（`TaskEventActionPanel`）、点击日期看当天明细（`DayDetailSheet`）。

**3) 新布局结构**：现状即标准（Brief §10 认定它是最成熟页面壳）——`h-14 border-b` 头（视图 Tabs + 主操作右置）+ 日历主体全宽。**本页作为全应用壳规范的参照实现**，其头部模式即 §0.1 ListPageShell 的依据。

**4) 首屏**：默认周视图 + 今天高亮 + 事件块（任务事件带完成状态视觉区分）。

**5) 次要信息处理**

| 信息                      | 处理                 | 原因                 |
| ------------------------- | -------------------- | -------------------- |
| `DevScheduleDebugPanel`   | 保持 DEV-only        | 已有守卫             |
| 冲突提示（ConflictAlert） | 保留，仅有冲突时出现 | 条件显示已是正确形态 |

本页无可删项——信息密度合理。需要的是**补位**：非任务日历事件点击目前仅 toast（Brief §8-P3 定性为功能缺口）。本轮加 `EventDetailSheet`（右侧 Sheet，只读展示既有字段：标题/时间/描述/来源），编辑能力另立项。这是全文唯一的"加法"，理由：点击无响应是交互断层，且只读详情用现有数据即可实现。

**6) 组织**：三视图组件（`DayViewCalendar` / `WeekViewCalendar` / `MonthViewCalendar`）不动；月视图点日期 → `DayDetailSheet`（保留）；任务事件 → `TaskEventActionPanel` 底部面板（保留，完成后窗口刷新逻辑不动）；非任务事件 → 新 `EventDetailSheet`；视图窗口换页范围拉取（day/week/month change）逻辑不动。

**7) 空 / 加载 / 错误**：日历天然无"空态"（网格即内容），周/日视图无事件时在当日列显示轻文案"无安排"；首次加载 = 日历网格骨架；范围拉取失败 = 顶部 inline Alert + 重试（保留已渲染网格）。

**8) 响应式**：<md 默认切日视图（周/月网格窄屏不可读）；视图 Tabs 压缩为下拉；`DayDetailSheet` / `TaskEventActionPanel` 转全宽底部 Drawer。

**9) 复用组件**：三视图日历、`DayDetailSheet`、`TaskEventActionPanel`、`CreateScheduleDialog`、`ConflictAlert`、sheet / drawer。

**10) 拆分 / 重命名**

| 动作   | 对象                                                     | 说明                                                          |
| ------ | -------------------------------------------------------- | ------------------------------------------------------------- |
| 重命名 | `ScheduleDashboardView.vue` → `ScheduleCalendarView.vue` | 文件名含 "Dashboard" 与 `/dashboard` 心智冲突；路由 path 不变 |
| 新增   | `EventDetailSheet.vue`                                   | 只读详情留位（见 5/6），参照 `DayDetailSheet` 实现            |
| 删除   | `ScheduleWeekView.vue` 孤儿视图                          | §0.5；Vue 仅保留 `/schedule/calendar` 单入口（无 week redirect） |

---

## 8. 提醒 `/reminders`（`ReminderLinearView.vue`）

**1) 页面目标**：管理提醒模板与分组——分组控制模式（group/individual）决定模板启停归属；全局总开关一键静默。

**2) 最重要的动作**

- 主操作：**新建提醒**（`TemplateDialog`）。
- 次操作：模板启停 Switch、切换分组、全局总开关、新建分组（⋯）、编辑/移动模板。

**3) 新布局结构**（WorkspaceShell + ModuleSidebar）

```
┌ ModuleSidebar w-64 ──┐┌ 内容区 ──────────────────────────────┐
│ 全部提醒（计数）       ││ LinearPageHeader「提醒」               │
│ 分组列表（计数）       ││  [全局开关 Switch] [新建提醒] [⋯:新建分组]│
│ + 新建分组            ││ ⚠ 全局提醒已关闭横幅 + [一键恢复] ←条件时 │
│                      ││ ────────────────────────────────── │
│                      ││ 当前分组卡（控制模式 + 内联统计一行）      │
│                      ││ 模板列表（各自启停 Switch）              │
└──────────────────────┘└─────────────────────────────────────┘
```

**4) 首屏**：分组侧栏 + 当前分组的模板列表；全局开关常驻页头右侧（关闭时黄色横幅置顶 + 一键恢复——保留，Brief §4.6 必须展示项）。

**5) 次要信息处理**

| 信息                                     | 处理                        | 原因                                           |
| ---------------------------------------- | --------------------------- | ---------------------------------------------- |
| 头部"当前分组"徽章条                     | **删除**                    | 与正文分组卡信息完全重复（Brief §4.6）         |
| 分组卡内 2×N 统计小方块                  | 压成分组卡内一行内联数字    | 统计是辅助信息，方块阵列制造视觉噪音、拉长首屏 |
| 分组策略详情文案（`getGroupPolicyText`） | 收进分组卡 tooltip / 展开区 | 理解性信息，非操作必需                         |
| 分组描述为空的区块                       | 隐藏                        | 空占位是噪音                                   |

**6) 组织**：分组控制模式交互**不可简化**——group 模式下模板 Switch 显示禁用态 + "由分组接管"提示（Brief §4.6 不可删除状态）；全局开关保存中禁用态保留；`TemplateDialog` / `GroupDialog` / `TemplateMoveDialog` 保留；侧栏分组项用 `LinearSidebarItem` + `ActionableWrapper`。

**7) 空 / 加载 / 错误**：无分组无模板 = `AppEmptyState`「还没有提醒」+「新建提醒」；分组内无模板 = 轻文案 +「在此分组新建」；加载 = 列表行骨架；开关保存失败 = toast + Switch 回滚（现有逻辑保留）。

**8) 响应式**：<md 分组侧栏转 Sheet；全局开关保持页头可达（它是安全阀，任何宽度都不得隐藏）；模板列表单列。

**9) 复用组件**：`TemplateDialog`、`GroupDialog`、`TemplateMoveDialog`、`UpcomingRemindersWidget`（对外共享给 dashboard/AI 首页）、`ActionableWrapper`、`ModuleSidebar`、switch / alert。

**10) 拆分 / 重命名**

| 动作   | 对象                                                                                                     | 说明                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 拆分   | `ReminderLinearView.vue`（553 行）                                                                       | → `ReminderGroupSidebar.vue` + `ReminderTemplateList.vue` + `ReminderGlobalBanner.vue`，视图只留编排 |
| 重命名 | `TemplateDesktopCard.vue` → `ReminderTemplateCard.vue`；`GroupDesktopCard.vue` → `ReminderGroupCard.vue` | "Desktop" 后缀误导——Web 端同样使用；命名按业务不按端                                                 |
| 审计   | `ReminderInstanceSidebar.vue`、`ScheduleStatusCard.vue`、`GridTemplateItem/GridBlankItem`                | 确认是否仍被挂载，无引用则删除                                                                       |

---

## 9. 笔记工作区 `/repository`（`RepositoryWorkspaceView.vue`）— **历史方案（已 supersede）**

> **⚠️ 运行时 supersede（2026-07-21；残留 301）**：`RepositoryWorkspaceView.vue` 已从运行时删除。
> 当前 `/repository` 入口为 `RepositoryEntryView` → `KnowledgeProjectionWorkspaceView`（GitHub 投影）/
> `LocalVaultWorkspaceView`（Desktop 本地 Vault）；controlled confirmed-create / explicit metadata adoption；AI 着陆 `/repository?note=`。
> 以下布局/动作描述保留为 UI redesign 历史方案，**不得**当作当前实现清单。真值见 product 模块文档与 ADR-034。
>
> 本页原执行 Brief §13.3 **阶段 0（UI 收缩）**。说明：Brief §4.7 的"不可删除交互状态"以自建编辑器为长期方向为前提；§13 已拍板 Obsidian vault 方向（2026-07-11），两处冲突**以 §13 / ADR-034 为准**。

**1) 页面目标（历史）**：个人 markdown 知识库的浏览与轻编辑——文件树导航、单文档编辑/预览、`[[wikilink]]` 双链。长期定位（阶段 1 后）：**预览 + 反链 + 快速捕获 + 跳转 Obsidian**，重编辑退出。

**2) 最重要的动作**

- 主操作：**新建笔记**。
- 次操作：搜索、打开文件、保存（脏状态）、重命名、（阶段 1 起）在 Obsidian 打开。

**3) 新布局结构**（WorkspaceShell）

```
┌ ModuleSidebar w-64（现有 ResizablePanel 折叠保留）─┐┌ 文档区 ─────────────┐
│ [搜索框]                                         ││ 文档头：文件名·脏标记 │
│ 文件树 TypedFileTree（按类型分组）                  ││        [保存] [⋯]   │
│ ▸ 书签（折叠分区，并入树顶部）                       ││ MarkdownEditor      │
│                                                  ││（源码/预览切换保留）   │
└──────────────────────────────────────────────────┘└────────────────────┘
```

单文档模式：去掉标签页条后，多文件切换回归文件树点击（不造"最近打开"等替代品，保持减法）。

**4) 首屏**：文件树 + 上次打开的文档（或空态）。

**5) 次要信息处理**

| 信息                                              | 处理                                             | 原因                                                                         |
| ------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------- |
| 侧栏三模式图标条（files/search/bookmarks）        | **删除**：搜索内联到树顶部、书签并入树内折叠分区 | 三个浅层模式不值得一条独立图标轨；Brief §10 已定"书签并入文件树"             |
| `TabManager` 多标签条                             | **退役**                                         | 阶段 0 拍板项；vault 方向下重编辑迁往 Obsidian，多标签是自建编辑器野心的遗产 |
| `EditorSplitView` 分屏                            | **退役**                                         | 同上                                                                         |
| `SelfContainedExportDialog` / `BatchImportDialog` | **退役**                                         | 同上；vault 场景由文件系统/git 天然承担导入导出                              |
| `ReferenceRepairDialog`                           | 入口降级到 ⋯ 菜单，标记阶段 1 随 vault 移除      | §13.2.4 列入退役但阶段 0 未点名；先降级观察                                  |
| 字数统计                                          | 移到文档区底部状态行小字                         | 辅助信息                                                                     |

**6) 组织**：四分支渲染保留——markdown 编辑 / 图片视频音频 `MediaViewer` / 不支持类型占位（Brief §4.7）；**未保存守卫双 composable 原样保留**（`useEditorUnsavedChangesGuard` + `useWindowUnsavedChangesGuard`，单文档模式仍需要）；重命名对话框保留；`[[` 链接建议（`LinkSuggestion`）保留。

**7) 空 / 加载 / 错误**：无任何笔记 = `AppEmptyState`「开始你的第一篇笔记」+「新建笔记」；未选中文档 = 文档区轻占位；文档加载 = 行骨架；保存失败 = toast + 脏标记保持（不丢内容）；文件树加载失败 = 侧栏 inline 重试。

**8) 响应式**：<md 文件树转 Sheet（文档头左侧出现树按钮）；编辑器单栏全宽；此页窄屏定位为"能看能小改"，重操作引导去桌面端。

**9) 复用组件**：`TypedFileTree`、`MarkdownEditor` / `ActiveDocumentPane`（editor 模块 CodeMirror6）、`LinkSuggestion`、`MediaViewer`、`BookmarksPanel`（并入树后复用其逻辑）、`ModuleSidebar`。

**10) 拆分 / 重命名 / 退役**

| 动作 | 对象                                                                                                   | 说明                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 退役 | `TabManager`、`EditorSplitView`、`SelfContainedExportDialog`、`BatchImportDialog`                      | 阶段 0 清单；同步清理 `editor-workspace-ui-store` 中标签页状态（保留守卫所需的脏状态部分） |
| 收敛 | 编辑器三实现：repository 的 `ObsidianEditor.vue`、`ResourceEditor.vue` vs editor 模块 `MarkdownEditor` | 收敛到 editor 模块 CodeMirror6 一套，其余确认无引用后删除                                  |
| 收敛 | 文件树七件套：`FileTree/FileTreeItem/FileTreeNode/FileTreePanel/FilesPanel/FileExplorer/TreeNodeItem`  | 以 `TypedFileTree` 为准，其余引用审计后删除——本模块 ≈90 文件的主要瘦身点                   |
| 审计 | `RepoCard/RepoHeader/RepoInfoCard/ResourceCard/ResourceList/ResourcesPanel/TagsPanel`                  | 疑似旧版仓库列表 UI 遗留，无引用则删除                                                     |
| 文案 | 导航与页标题「仓库」→「笔记」                                                                          | 去实现词（Brief §9）；路由 path 不变                                                       |

---

## 10. 笔记单页 `/note/:id`（`EditorLinearView.vue`）— **已退役（2026-07-21）**

**1) 页面目标（历史）**：单笔记聚焦阅读与轻编辑。**当前着陆**为 `/repository?note=`（projection / Local Vault 预览）；`/note/:id` 与 `EditorLinearView` 已从运行时删除。

**2) 最重要的动作**

- 主操作：**编辑/保存**（阶段 0）→ 阶段 1 变为「在 Obsidian 打开」（`obsidian://` 跳转），编辑降为次操作。
- 次操作：反链跳转、查看图谱、回到笔记库。

**3) 新布局结构**（WorkspaceShell，meta `hideSidebar` 保留）

```
← 笔记库 | 笔记标题 · 脏标记 [索引徽章]      [编辑/预览] [保存] [⋯]
┌ 文档列（排版宽度 max-w-3xl 居中）─────┐┌ 右栏 w-80 可折叠 ─┐
│ 预览渲染（默认）/ CodeMirror（编辑态） ││ Tabs: [反链][图谱] │
│ [[链接建议]] 浮层（编辑态）            ││ BacklinkPanel     │
└──────────────────────────────────────┘│ LinkGraphView    │
                                        └──────────────────┘
```

**4) 首屏**：文档预览正文。默认预览而非编辑——着陆场景的第一动作是"看 AI 生成了什么"，先看后改。

**5) 次要信息处理**：图谱 Tab 默认不激活（点击才渲染——`link-index` 全量遍历资源有成本）；RAG 索引状态（`indexStatus: pending/indexed/failed`）显示为标题旁小徽章，仅 `failed` 时醒目（影响问答可用性才值得打扰）。

**6) 组织**：编辑态 = CodeMirror + `LinkSuggestion`（"创建并链接新笔记"保留）；未保存守卫保留；反链项点击在本页壳内导航。

**7) 空 / 加载 / 错误**：资源不存在/已删除 = 整页 `AppEmptyState`「笔记不存在」+「回到笔记库」（**AI 深链可能指向已删资源，此态必须做**）；加载 = 文档行骨架；保存失败 = toast + 保持编辑态与内容。

**8) 响应式**：<lg 右栏转底部 Collapsible（反链优先，图谱窄屏不渲染）；文档列全宽。

**9) 复用组件**：`MarkdownEditor`、`LinkSuggestion`、`BacklinkPanel`、`LinkGraphView`、`AppEmptyState`。

**10) 拆分 / 重命名**：`EditorLinearView` 保持；抽出 `NoteContextPanel.vue`（反链/图谱 Tabs 容器）便于窄屏复用；无重命名。

---

## 11. 通知 `/notifications`（`NotificationListPage.vue`）+ 铃铛弹层

**1) 页面目标**：通知的"信箱"归档页。日常消费降级到**铃铛弹层**（侧栏底部 `NotificationBell` + 未读角标 → `NotificationDrawer` 最近 N 条 + 全部已读 + "查看全部"），完整页只服务回溯与批量处理——移出一级导航（Brief §4.8 定位问题：未读数已在别处出现，信箱不值得一级入口）。

**2) 最重要的动作**

- 主操作：**全部已读**。
- 次操作：逐条已读/删除、过滤切换、点击跳转来源上下文。

**3) 新布局结构**（ListPageShell）：`LinearPageHeader「通知」(未读计数)` + 右置「全部已读」→ Tabs [全部 | 未读] → `NotificationList` 行列表（`max-w-4xl`——信箱是读列表，7xl 过宽）。

**4) 首屏**：未读优先的通知行列表；每行 = 未读点 + 标题 + 来源模块 + 相对时间 + hover 操作。

**5) 次要信息处理**

| 信息               | 处理                                                | 原因                                          |
| ------------------ | --------------------------------------------------- | --------------------------------------------- |
| 过滤 Tab           | 收敛为 全部/未读 两态，其余类型过滤（若有）收进下拉 | 信箱高频动作只有"看新的"（Brief §4.8 可弱化） |
| 通知目标上下文详情 | 点击跳转来源页承载                                  | 列表只做索引，不复述正文                      |
| `/sse-monitor`     | 保持 DEV-only                                       | 调试工具                                      |

**6) 组织**：SSE 实时接入（`createNotificationStartupHook`）不动——它是铃铛角标的数据源；`NotificationPermissionWarning` 保留在页顶条件位；逐条操作走 hover 行内按钮，不加批量选择（单人产品，全部已读足够）。

**7) 空 / 加载 / 错误**：空 = `AppEmptyState`「没有通知」（无按钮——空信箱是好事，不催促任何操作）；未读 Tab 空 = "已全部处理 ✓"；加载 = 行骨架；SSE 断线 = 页顶轻提示 + 自动重连（现有机制）。

**8) 响应式**：行布局天然窄屏友好；<md 操作按钮常显（无 hover）；铃铛在 <md 顶部条右侧（§0.4）。

**9) 复用组件**：`NotificationBell`、`NotificationDrawer`、`NotificationList`、`NotificationItem`、`NotificationPermissionWarning`（全部已存在，本页几乎零新组件）。

**10) 拆分 / 重命名**

| 动作     | 对象                                                                  | 说明                                                                     |
| -------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 合并审计 | `components/NotificationPage.vue` vs `views/NotificationListPage.vue` | 二者职责重叠：view 只留壳，渲染统一走 `NotificationList`；多余的一个删除 |
| 集成     | `NotificationBell` + `NotificationDrawer` 挂入 `MainLayout` 侧栏底部  | §0.2；`notification-filter-*` 等 testid 保留                             |

---

## 12. 治理 `/governance/**`（列表/新建/详情/编辑/历史）

**1) 页面目标**：个人编码规范库——规则（code/severity/status/标签/好坏示例）+ 修订历史 + 废弃/替代链。导航上归入"知识"分组次级入口（Brief §4.9：它本质是结构化笔记，不与目标/任务同层）。

**2) 最重要的动作**

- 主操作（列表）：**新建规则**；（详情）：**编辑**。
- 次操作：搜索、状态/严重度过滤、查看修订历史、废弃规则（⋯ 危险区）。

**3) 新布局结构**：列表 = ListPageShell + FilterBar（放弃现有 `p-6 max-w-[960px]` 自由布局，套标准壳——修 Brief §8-P2 壳不统一）；新建/详情/编辑/历史四子页 = DetailPageShell `max-w-4xl`。

```
LinearPageHeader「编码规范」(计数)                [新建规则]
FilterBar：[搜索________] [状态▾] [严重度▾] [标签▾]
──────────────────────────────────────────────
RuleCard 列表（code + title + RuleStatusBadge + severity）
```

**4) 首屏**：搜索框 + 规则卡列表。开发者场景第一动作是"找到那条规则"，搜索优先级高于过滤。

**5) 次要信息处理**

| 信息                  | 处理                                       | 原因                                                     |
| --------------------- | ------------------------------------------ | -------------------------------------------------------- |
| 状态/严重度双排按钮组 | 收敛为两个下拉                             | 双排按钮占两行工具栏，枚举值固定且过滤低频（Brief §4.9） |
| 标签 chips 行         | 收进「标签▾」下拉（多选）                  | 同上；chips 随标签数线性膨胀                             |
| 过滤命中横幅          | 删除，改为列表头计数文本"共 N 条 · 已过滤" | 横幅与计数信息重复                                       |
| 好/坏代码示例         | 保持仅详情页展示                           | 列表扫视不需要代码块（现状已正确）                       |

**6) 组织**：规则编辑器表单与修订历史 diff 查看**不可删除**（Brief §4.9）；详情页结构：规则元信息 → 描述 → 好示例/坏示例（`CodeSnippetView`）→ 替代链；历史页 = `RevisionCard` 时间线。

**7) 空 / 加载 / 错误**：空 = `AppEmptyState`「还没有规范条目」+「新建规则」；过滤后空 = 清除过滤按钮；加载 = 卡片骨架；表单提交失败 = inline error 保留已填内容。

**8) 响应式**：列表单列本就窄屏友好；FilterBar 下拉换行；代码示例块横向滚动。

**9) 复用组件**：`RuleCard`、`RuleStatusBadge`、`TagFilterChips`（改为下拉内容源）、`CodeSnippetView`、`RevisionCard`、`FilterBar`（新）、两壳（新）。

**10) 拆分 / 重命名**

| 动作   | 对象                                                                                             | 说明                                               |
| ------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| 重命名 | `governance/components/SearchBar.vue` → `GovernanceSearchBar.vue`（或并入共享 FilterBar 后删除） | 泛化命名占用了共享名字空间，与未来 shared 组件冲突 |

---

## 13. 设置 `/settings`（`UserSettingsView.vue`，含 `/account/center` 合并）

**1) 页面目标**：所有低频配置的唯一归宿。10 个平铺 Tab 重组为 6 组；账户中心并入"账户"分组（Brief §4.10：账户页内容单薄且与"隐私"心智重叠）。

**2) 最重要的动作**

- 主操作：**修改并保存当前分组的设置**（各分组内联保存）。
- 次操作：数据导出/导入、登出（账户分组内，确认保留）。

**3) 新布局结构**：DetailPageShell 变体——左侧垂直分组导航（w-48，10 个 Tab 横排在窄窗口必然溢出，纵向导航是可维护解），右侧内容 `max-w-3xl`：

| 新分组     | 合并自（现 10 Tab）                           |
| ---------- | --------------------------------------------- |
| 外观与语言 | 外观 + 语言区域                               |
| AI         | AI                                            |
| 通知与提醒 | 通知                                          |
| 账户与隐私 | 隐私 + **账户中心迁入**（头像/昵称/bio/登出） |
| 数据       | 数据导入导出 + 用户文件                       |
| 高级       | 快捷键（保持只读展示现状）+ 实验性 + 高级操作 |

**4) 首屏**：默认打开"外观与语言"；左栏 6 组一屏可见。

**5) 次要信息处理**：实验性/高级操作沉到"高级"组底部（危险操作按 §0.1 危险区处理）；快捷键只读表继续保留但不投入交互开发（代码注释已标注 read-only for now，不在 UI 层造假象）。

**6) 组织**：每组一个 section 组件（表单 + 保存），落 `setting/components/sections/`；数据导入导出保留 `useDataPortability` 对话框流程；登出确认保留。

**7) 空 / 加载 / 错误**：设置无空态；加载 = 表单骨架；保存失败 = 字段级 inline error + toast；导入导出错误走对话框内提示（现状保留）。

**8) 响应式**：<md 左栏分组导航转顶部下拉选择器；表单单列。

**9) 复用组件**：现有各 Tab 表单内容组件、`useConfirm`、account 模块头像/资料表单（迁入）。

**10) 拆分 / 重命名**

| 动作 | 对象                                              | 说明                                                                                                           |
| ---- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 拆分 | `UserSettingsView.vue`（393 行）                  | → 6 个 section 组件 + 壳视图                                                                                   |
| 合并 | `AccountCenterView.vue` → 设置"账户与隐私"section | `/account/center` 路由保留 `redirect: '/settings?tab=account'`；`?tab=` 查询参数为新增契约，需在路由 meta 注明 |
| 导航 | `/account/center` 移出底部导航                    | §0.2；头像点击也可直达该 tab（可选增强）                                                                       |

---

## 14. 登录 `/auth`（`AuthView.vue` / `DesktopAuthView.vue`）

**1) 页面目标**：登录/注册。**流程勿动**（Brief §4.11），仅皮肤级对齐。

**2) 最重要的动作**：主操作 = 提交登录/注册；次操作 = 登录/注册模式切换。

**3) 新布局结构**：居中单卡 `max-w-sm`（AuthLayout 保留），品牌名取 `@memoflow/assets`。

**4) 首屏**：表单即全部。 **5) 次要信息**：无。

**6) 组织**：`LoginForm` / `RegisterForm` 组件不动；Desktop 覆写视图与 `hydrateDesktopBootstrapAuthState` 水合流程不动。

**7) 状态**：提交 loading（按钮内 spinner）+ 表单级 inline error；不引入 toast（登录失败必须在表单旁可读）。

**8) 响应式**：单列居中天然自适应。

**9) 复用**：`LoginForm`、`RegisterForm`、card/button/input。 **10) 拆分/重命名**：无。

---

## 15. 汇总与实施顺序

### 15.1 每页主/次操作总览（评审用）

| 页面                 | 主操作                                | 关键次操作                              |
| -------------------- | ------------------------------------- | --------------------------------------- |
| `/` AI 工作台        | 发送消息                              | 工作流决策、切换会话                    |
| `/dashboard`         | 点击 widget 项处理                    | 刷新、展开趋势                          |
| `/goals`             | 新建目标                              | 视图/文件夹切换、对比(⋯)、专注          |
| `/goals/:id`         | 记录进度                              | 添加 KR、创建复盘、编辑(⋯)              |
| `/tasks`             | 新建任务                              | 过滤、视图切换、暂停/恢复、全部删除(⋯⚠) |
| `/schedule/calendar` | 创建日程                              | 视图切换、完成任务事件                  |
| `/reminders`         | 新建提醒                              | 启停 Switch、全局开关、新建分组(⋯)      |
| `/repository`        | 新建笔记                              | 搜索、保存、重命名                      |
| ~~`/note/:id`~~ → `/repository?note=` | 预览 / Desktop 在 Obsidian 打开 | 反链、图谱（projection） |
| `/notifications`     | 全部已读                              | 逐条已读/删除、跳转来源                 |
| `/governance`        | 新建规则                              | 搜索、过滤、看历史                      |
| `/settings`          | 保存当前分组设置                      | 导入导出、登出                          |

### 15.2 删除 / 退役清单汇总（全部含原因，正文对应章节已展开）

| 类别         | 项                                                                                                                | 出处               |
| ------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------ |
| 重复入口     | 导航项 `/ai/chat`（路由改 redirect）；dashboard 快捷操作条；reminder 头部分组徽章条                               | §0.2 / §2 / §8     |
| 调试残留     | AI legacy workflow 按钮组；`/goals/rules-demo` 无守卫                                                             | §1 / §3            |
| 孤儿文件     | `FocusModeView` / `FocusCycle` / `WeightSnapshotView` / `ScheduleWeekView`                                        | §0.5               |
| 阶段 0 退役  | `TabManager` / `EditorSplitView` / `SelfContainedExportDialog` / `BatchImportDialog`                              | §9                 |
| 反模式       | 「全部删除」常驻工具栏（降级 ⋯ 危险区）；1400px 依赖图 Dialog（升为视图模式）                                     | §6                 |
| 引用审计后删 | repository 文件树七件套与旧列表组件、`TaskInstanceManagement`、reminder 疑似遗留卡片、`NotificationPage` 重复实现 | §6 / §8 / §9 / §11 |

### 15.3 实施顺序（每步可独立合并、可回滚）

| 步骤        | 内容                                                                                                                                 | 依赖 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| P0 基建     | 5 个共享组件（§0.5）；`NavigationItem` 接口变更 + 双端宿主同步；导航分组/图标/铃铛；`/ai/chat` redirect；孤儿视图删除；i18n key 补齐 | 无   |
| P1 招牌路径 | §1 AI 工作台（按钮迁移 + 右栏三态）；§2 仪表盘压缩；§6 任务页（视图模式 + 危险区）                                                   | P0   |
| P2 对齐批   | §3–§5 目标、§7 日程（含 EventDetailSheet）、§8 提醒、§11 通知、§12 治理、§13 设置                                                    | P0   |
| P3 笔记收缩 | §9 / §10 阶段 0（退役 + 收敛 + 更名），与 Brief §13 架构专项（vault/pgvector/git）并行不阻塞                                         | P0   |

### 15.4 验收清单

1. 5 份 Playwright 配置全绿（`ai-workspace` 专项重点回归——testid 已随组件迁移）。
2. Electron 桌面端手动回归：导航、`isDesktopEnvironment` 分支、桌面通知弹窗路由 `/custom-notification`、IPC 数据链路。
3. 深链契约逐条验证：`?dialog=goal&goalId=`、`/repository?note=`、`/goals/:id`、`/ai/chat` redirect、`/account/center` redirect、schedule `/schedule/calendar` 单入口。
4. i18n：zh-CN / en-US 无缺 key（新增 `nav.group.*`、更名「笔记」「任务库」）。
5. 断点走查：xl / lg / md / sm 四档，每页首屏无横向滚动、主操作可达。
6. 移动端（RN）文案同步：模块更名（仓库→笔记、任务模板→任务库）通知 mobile 维护者（Brief §12-6）。
