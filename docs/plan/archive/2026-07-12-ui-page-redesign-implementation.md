---
tags:
  - plan
  - archive
  - ui
  - frontend
description: 页面级 UI 重构（UI Page Redesign Plan）的执行记录
created: 2026-07-12T00:00:00
updated: 2026-07-12T00:00:00
---

# 页面级 UI 重构 — 实施记录

> 2026-07-14 归档说明：本记录中未收尾的 P3 事项已由 V2 重构的 S4/S5 取代或完成，后续 UI 工作以 V2 壳层诊断计划为准。本文件只保留 V1 实施历史。

> 方案真值：`docs/UI_PAGE_REDESIGN_PLAN.md`（下称 Plan），上游分析 `docs/UI_REDESIGN_BRIEF.md`（下称 Brief）。
> 本文只记录执行切片、状态与验收，不重复方案内容。范围：`packages/app-vue` + 两端宿主 `apps/web`、`apps/desktop`。

## 约束回顾（不可破坏）

- 双端同源：任何布局/导航改动在 Web + Electron 双端回归；保留 `isDesktopEnvironment` 分支。
- `data-testid` 随组件迁移（5 份 Playwright 配置锚定）：`main-nav-*` / `bottom-nav-*` 生成规则不变。
- 深链契约：`?dialog=goal&goalId=`、`/note/:id`、`/goals/:id`；删/改路由先加 redirect。
- 数据访问只走 DI 端口与 composable 门面，不直连 HTTP/IPC。
- `NavigationItem` 结构变更是破坏性接口变更 → 同步 `di/types.ts` + 两端 `di-app.ts` + `MainLayout.vue`。

## 实施顺序（Plan §15.3，每步可独立合并/回滚）

### P0 基建（本切片，无依赖）

- [x] 5 个共享组件（Plan §0.5）落 `packages/app-vue/src/components/shared/`：
  - `ListPageShell.vue`、`DetailPageShell.vue`、`ModuleSidebar.vue`、`AppEmptyState.vue`、`FilterBar.vue`
- [x] `NavigationItem` 接口扩展 `group? / icon? / badge?`（`di/types.ts`；两端宿主只透传默认数组，无需改 `di-app.ts`）
- [x] 导航分组 + 图标 + 铃铛：`di/navigation.ts` 重排（12→8+1 一级入口，含分组），`MainLayout.vue` 渲染分组/图标 + 侧栏底部 `NotificationBell` + `NotificationDrawer`
- [x] `/ai/chat` → `redirect: '/'`，导航项删除（`router/index.spec.ts` 断言改为重定向契约）
- [x] `/notifications`、`/account/center` 移出一级导航（路由保留深链）
- [x] 孤儿视图删除：`FocusModeView` / `FocusCycle` / `WeightSnapshotView`（goal）、`ScheduleWeekView`（schedule）
- [x] i18n key 补齐：`nav.group.workbench/plan/execute/knowledge`；`nav.repositories`「仓库」→「笔记」、`nav.governance`「治理」→「规范」；repository 路由 meta 硬编码中文 → `repository.route.*`；`common.collapse/expand`
- [x] `/goals/rules-demo` 加 `import.meta.env.DEV` 守卫（生产构建不注册该路由）
- [x] typecheck（app-vue tsc / web vue-tsc / desktop）+ app-vue 182 测试 + lint 0 error 通过

实现备注：

- `ModuleSidebar` 用简单可折叠 aside（w-64 ↔ w-10 细轨）而非 ResizablePanel 封装——ResizablePanel 要求 panel 是 group 直接子节点，无法在独立容器组件内封装；折叠行为契约不变。
- e2e 契约核对：`main-nav-home` 仍是第一个、`main-nav-dashboard` 第二个（dashboard-overview.spec.ts:107-109）、`bottom-nav-settings` 保留。

### P1 招牌路径（依赖 P0）

- §1 AI 工作台（按钮迁移 + 右栏三态）；§2 仪表盘压缩；§6 任务页（视图模式 + 危险区）

### P2 对齐批（依赖 P0）

- §3–§5 目标、§7 日程（含 EventDetailSheet）、§8 提醒、§11 通知、§12 治理、§13 设置

### P3 笔记收缩（依赖 P0）

- §9 / §10 阶段 0（退役 + 收敛 + 更名）

## 验收（Plan §15.4）

1. 5 份 Playwright 配置全绿（`ai-workspace` 重点）。
2. Electron 手动回归：导航、`isDesktopEnvironment`、桌面通知路由、IPC 链路。
3. 深链契约逐条验证。
4. i18n zh-CN / en-US 无缺 key。
5. 断点走查 xl / lg / md / sm。
6. RN 端文案同步（仓库→笔记、任务模板→任务库）通知维护者。

## 进度日志

- 2026-07-12：读方案 + Brief + 代码基线，确认现状（`MainLayout` 纯文字 12 入口、5 shared 组件待建、孤儿视图存在）。开工 P0。
- 2026-07-12：P0 完成（分支 `refactor/ui-redesign-p0-foundation`，PR #172）：共享壳 ×5、导航分组/图标/铃铛、`/ai/chat` redirect、孤儿视图删除、i18n 补齐、rules-demo DEV 守卫。app-vue tsc + web vue-tsc + desktop tsc + 182 unit tests + lint 全绿。开工 P1。
- 2026-07-12：P1 完成（分支 `refactor/ui-redesign-p1-signature-paths`，基于 P0 分支）：
  - §2 仪表盘：`DashboardView` 605→99 行；`DashboardStatsStrip`（6 卡压一行，testid 保留）+ `DashboardTrendPanel`（Collapsible 收起 + 延迟 ECharts init）+ `DashboardActivityTimeline`（Collapsible 收起）+ `GoalProgressWidget`（落 goal/components/widgets，纯 props）；快捷操作条删除（含 i18n key 清理）；错误改 inline Alert + 重试。
  - §6 任务库：`ListPageShell` + `TaskFilterBar`（状态 Tabs 含「全部」+ 关系过滤下拉 + 搜索 + 卡片/图谱切换）+ `TaskTemplateGrid`；依赖图从 1400px Dialog 升为图谱视图模式（<md 显示占位）；「全部删除」降级 ⋯ 危险区（输入 DELETE 强确认保留，去掉双重确认）；<lg 禁拖拽建依赖（`useViewportBreakpoint` 新建，§0.4 统一入口）；空态 `AppEmptyState` + AI 次链接；`TaskTemplateManagement` / `TaskInstanceManagement`（无引用）删除；文案「任务模板管理」→「任务库」；修复 `task.management.deleteTemplate` 缺 key 隐患。契约保留：`#task-template-management`、`create-task-template-button`、`create-first-task-template-button`、`view-dependency-graph-button`、`delete-all-templates-button`、`data-task-id`。
  - §1 AI 工作台：工作流生命周期按钮组整体迁 `AIWorkflowActionBar`（右栏顶部，状态机分支与 `goal-agent-*` testid 原样）；`AIContextPanel` 三态容器（空闲=今日概览三 widget ≥xl 常驻 / 工作流=操作条+产物 / QA=同+未接地原因提示）；composer 回归纯对话；legacy workflow 调试分支删除（含 3 个对应测试）；侧栏重构（会话置顶、AgentRun/最近目标/最近笔记折叠段默认收起、刷新/设置收 ⋯ 菜单、w-72→w-64）；chat 空态加三工作流入口卡。
  - 验证：web vue-tsc + desktop tsc + app-vue 179 tests（51 文件）+ lint 0 error 全绿。AIChatView.spec 补 DASHBOARD_SERVICE provide、AIContextPanel/AIWorkflowActionBar 真实渲染。
  - 遗留（后续切片）：`AIGoalWorkflowPanel` 1280 行内部拆分（§1-10，对外接口不变，纯内部整理）。
- 2026-07-12：P2 对齐批第一轮（分支 `refactor/ui-redesign-p2-alignment`，基于 P1 分支）：
  - §11 通知：`NotificationListPage` → ListPageShell + FilterBar 两态 Tab（全部/未读；「已读」Tab 删除，无 e2e 依赖）+ `max-w-4xl` 信箱宽度 + 行骨架 + `AppEmptyState`（空信箱无按钮）/未读空「已全部处理 ✓」；重复实现 `NotificationPage.vue`（仅 stories 引用）删除；`notification.title`「通知中心」→「通知」。契约保留：`notification-center`、`notification-filter-all/unread`、`notifications-list`、`mark-all-read-button`。
  - §12 治理：列表套 ListPageShell + FilterBar（状态/严重度双排按钮组 → 下拉；标签 chips → 多选下拉；过滤命中横幅删除 → 页头计数文本）；加载改卡片骨架、错误改 Alert+重试、空态 `AppEmptyState`；`SearchBar` → `GovernanceSearchBar`（防抖 + `/` 快捷键保留）；`TagFilterChips` 删除（并入下拉）；文案「治理规则」→「编码规范」。j/k 键盘导航保留。
  - §7 日程：`ScheduleDashboardView` → `ScheduleCalendarView`（路由 path 不变）；新增 `EventDetailSheet`（非任务事件只读详情，替代 toast 断层——全文唯一加法）；补齐缺失的 `schedule.source.*`/`schedule.dayDetail.*` i18n key（DayDetailSheet 此前渲染裸 key 的隐患修复）。
  - §8 提醒：头部「当前分组」徽章条删除（与正文分组卡重复）；分组卡 2×N 统计方块压一行内联数字；分组策略文案收进控制模式徽章 tooltip；`TemplateDesktopCard`→`ReminderTemplateCard`（含 spec/stories）；孤儿组件删除（`GroupDesktopCard`/`ReminderInstanceSidebar`/`ScheduleStatusCard`/`GridBlankItem`，仅 barrel 引用）；全局开关/黄色横幅/组接管禁用态原样保留。
  - §3 目标列表：`GoalSidebar` 从 `GoalModuleLayout` 抽出（系统视图计数常显 + `LinearSidebarItem` + 文件夹 + 专注入口）；专注模式未激活缩为一行虚线按钮、激活才展开卡片；列表页头主操作「新建目标」（`?dialog=goal` 契约保留）+「对比」收 ⋯ 菜单；搜索空集合隐藏；分视图空态（active=AppEmptyState+AI 次链接；其余=纯文案）；卡片骨架。
  - §4 目标详情：DetailPageShell（back+badges+meta 单行元数据）；四宫格压缩；进度环缩小与 KR 完成数并排概览行；主操作「记录进度」= KR 下拉 → `GoalRecordDialog`（此前该对话框无任何入口的缺口修复；无 KR 时禁用+tooltip 原因）；「创建复盘」移入复盘 Tab 首位；⋯ 菜单=编辑+危险区删除；KR 空态升级主引导；目标不存在=整页空态；`goal-detail`/`goal-detail-title` testid 保留（DetailPageShell 增加 `titleTestid` prop）。
  - 验证：web vue-tsc + app-vue 179 tests + lint 0 error 全绿。
  - 遗留（后续切片）：§13 设置分组重构 + 账户合并；§5 子页面（focus/compare/review/KR 详情）壳对齐；治理详情/编辑/历史三子页 DetailPageShell 套壳；§8 视图三拆分（ReminderGroupSidebar/TemplateList/GlobalBanner）；`NotificationPermissionWarning` 挂载（现无权限管理 plumbing，属新功能不在本轮）。
- 2026-07-12：P2 第二轮（同分支）：§13 设置完成：
  - 10 平铺 Tab → 6 组（外观与语言 / AI / 通知与提醒 / 账户与隐私 / 数据 / 高级），左侧垂直分组导航 w-48 + 内容 max-w-3xl；<md 导航转顶部横向滚动条。
  - `AccountProfileSection` 从 `AccountCenterView` 原样抽出（表单 + 登出确认逻辑不动）并入「账户与隐私」；`AccountCenterView` 删除；`/account/center` → `redirect: /settings?tab=account`（`?tab=` 为新增分组深链契约，双向同步 route query）。
  - e2e 契约保留：`settings-tab-appearance/notifications`（分组导航按钮沿用 testid 规则）、`account-center-view` + `account-logout-button` 随组件迁入设置页。
  - 数据组 = 原生文件对话框 + SettingAdvancedActions（导入导出/备份本就是该组件主体）；高级组 = 快捷键（只读现状）+ 实验性。
  - i18n：`setting.groups.*` zh/en 补齐。验证：web vue-tsc + 179 tests 全绿。
- 2026-07-12：P3 笔记收缩第一轮（分支 `refactor/ui-redesign-p3-notes-reduction`，基于 P2 分支）：
  - §10 `/note/:id`：**预览优先**（`useEditorScenePane` 增 `initialViewMode` 选项，linear scene 传 `'preview'`，工作区默认 `'live'` 不变）；右栏改 `NoteContextPanel`（反链/图谱 Tabs，图谱点击才挂载——link-index 全量遍历延迟；<lg 图谱不渲染）；加载失败改 `AppEmptyState`「笔记不存在」+「回到笔记库」（AI 深链死端出口）；未保存守卫/LinkSuggestion 原样。
  - §9 部分：`EditorSplitView` 退役（实为 25 行编辑/预览 v-if 容器，内联进 `ActiveDocumentPane`）；旧文件树/仓库列表组件集群删除 ×16（`FileTree/FileTreeItem/FileTreeNode/FileTreePanel/FilesPanel/FileExplorer/TreeNodeItem/RepoCard/RepoHeader/RepoInfoCard/ResourceCard/ResourceList/ResourcesPanel/TagsPanel/ObsidianEditor/ResourceEditor` + stories——互引闭包，仅 barrel 引用）；repository components barrel 重建（TypedFileTree 为唯一树实现）。
  - 验证：web vue-tsc + desktop tsc + 179 tests + lint 0 error 全绿。
  - **P3 剩余（下一切片，需专注处理）**：TabManager 多标签退役（牵动 `useEditorWorkspaceTabs` + `useEditorWorkspaceBootstrap` + `editor-workspace-store` 的 activeTabId/hydration 与未保存守卫耦合，单文档化需专门回归）；`BatchImportDialog`/`SelfContainedExportDialog` 退役（牵动 `useRepositoryResourceCommands` 上传链路与 EditorToolbar 导出按钮）；侧栏三模式图标条 → 搜索内联树顶 + 书签并入树折叠分区（重塑 workspace scene sidebar 契约）；`ReferenceRepairDialog` 入口降级 ⋯。
