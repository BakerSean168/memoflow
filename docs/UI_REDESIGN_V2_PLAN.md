# UI 重构 V2 方案：AI 优先的 ChatGPT 桌面式壳（Desktop-first）

> 状态：实施方案。**取代** `UI_PAGE_REDESIGN_PLAN.md`（下称 V1）的壳/导航/响应式/实施顺序体系；V1 各页面章节的**内容级结论**（主/次操作、信息删减清单、拆分退役清单）仍然有效，由本文 §6 引用为面板内容设计输入。
> **2026-09-18 Dashboard retirement:** HOME-1805 is implemented. The standalone Dashboard package, route, redirect, DTO/config, and persistence surfaces are deleted. Any remaining Dashboard wording in this historical design plan is context only; current Home and AI behavior uses owner read models and must not recreate `/dashboard`.
> 2026-07-14 修订：Electron 实机诊断后的 Settings 独立场景、Schedule 统一分栏入口、动态面板、Global Composer 与胶囊预览方案，见 [`docs/plan/active/2026-07-14-ui-shell-diagnostic-followup.md`](plan/active/2026-07-14-ui-shell-diagnostic-followup.md)。冲突部分以该修订为准。
> 上游分析仍见 `UI_REDESIGN_BRIEF.md`（下称 Brief）——其 §1–8（现状/问题/契约）与 §11–13（保留资产/风险/vault 专项）继续有效，但 **知识/笔记现状以 Brief 顶部 2026-07-21 supersede 与 ADR-034 为准**（`/note/:id` 与 Resource DTO 已退役）；§9/§10 的信息架构建议被本文取代。
> **2026-07-21**：文中 `openRecentKnowledgeNote→/note/:id` 深链描述已过时；当前着陆为 `/repository` 工作区 / Local Vault 投影。
> 参照原型：`D:\home\projects\chatgpt-desktop-ui`（Vue3 + Tailwind，模仿 ChatGPT/Codex 桌面客户端）。
> 生成日期：2026-07-12。范围：`packages/app-vue`（Web 与 Desktop 共用）+ 桌面宿主窗口改造。

---

## 0. 拍板记录（2026-07-12，全部已确认）

| # | 决策 |
|---|---|
| 1 | 新范式**取代** V1 页面级方案；V1 内容级结论迁移为面板内容设计 |
| 2 | 保留 vue-router，**URL ↔ 面板状态双向映射**；深链契约、AI 硬跳转、Playwright 路由锚定全部无损 |
| 3 | 顶部胶囊 **5 个**：Goal / Task / Note / Reminder / Notification；Dashboard 由 AI 空闲态承接后退役、Governance 并入 Note、Settings 走侧栏底部头像 |
| 4 | 左侧栏 = **纯 AI 会话列表**（不做 Projects 树、不放业务对象） |
| 5 | 日程 = 头部右侧**"当前时段"实时胶囊**（窗口控制按钮左侧），常态显示当前时间段与要做的事，点击进入日程面板——第 6 个模块面板，入口形态特殊 |
| 6 | Web 端**同壳去窗饰**：同一套三态壳，仅隐藏窗口控制/拖拽区（沿用 `isDesktopEnvironment` 分支模式） |
| 7 | 实施策略：**原地一次性切换**（重写 MainLayout 为新壳，模块视图先原样入面板，内容改造随后逐模块做） |
| 8 | 业务面板**多 Tab**（参照 Codex 桌面端右侧面板）：多个业务上下文以 Tab 并存，深链/AI 产物新开 Tab 不抢占（§2.3） |

---

## 1. 范式与心智模型

一句话：**应用 = 一个常驻的 AI 对话工作台 + 随时可召唤/可收起的业务面板**。

V1 的心智是"多页应用 + 分组侧栏导航"；V2 的心智是 ChatGPT 桌面客户端——对话是唯一的"地面"，业务模块不再是"页面"，而是叠加在地面之上的"面板"。用户不"切换页面"，而是"在对话旁边打开一块业务区域"。

### 1.1 三态布局

```
STATE A 纯 AI 态（/ 且无面板）            STATE B 分栏并行态（split）
┌──┬──────────────────────┐          ┌──┬──────────────┬───────────┐
│侧│  WindowHeader(胶囊栏) │          │侧│ WindowHeader(胶囊栏)      │
│栏│                      │          │栏│              │           │
│  │    AI 工作区          │          │  │  AI 工作区    │ 业务面板    │
│  │  （欢迎态/消息时间线） │          │  │              │ 320–750px │
│  │                      │          │  │              │ 可拖宽     │
│  ├──────────────────────┤          │  ├──────────────┤           │
│  │  Composer（常驻）     │          │  │ Composer     │           │
└──┴──────────────────────┘          └──┴──────────────┴───────────┘

STATE C 业务专注态（focus）
┌────────────────────────────┐
│  WindowHeader(胶囊栏)        │   侧栏隐藏；业务面板满屏；
│                            │   Composer 仍浮在底部——
│       业务面板（满屏）        │   AI 在任何状态下都一句话可达。
│                            │
├────────────────────────────┤
│  Composer（常驻）            │
└────────────────────────────┘
```

状态转换（沿用原型 `App.vue` 的交互语义）：

- 胶囊「进入」/ 深链路由 → STATE B（<1024px 窗口自动升 STATE C，分栏放不下）
- 面板头 Maximize ⇄ Minimize → B ⇄ C
- 面板头 ✕ / 侧栏「新对话」→ 回 STATE A（路由回 `/`）
- 侧栏折叠按钮在 C 态会先退回 B 态再展开侧栏（原型行为，保留）

### 1.2 与 V1 的关系

| V1 资产 | V2 处置 |
|---|---|
| §0.1 三种页面壳（List/Detail/Workspace） | **作废**。面板内部用轻量的"面板头 + 内容"结构，不再有页面壳 |
| §0.2 导航分组重构（工作台/计划/执行/知识） | **作废**。导航 = 5 胶囊 + 日程胶囊 + 侧栏底部 |
| §0.3 状态设计基线（空/加载/错误、AppEmptyState、skeleton） | **保留**，面板内容同样适用 |
| §0.4 响应式基线（xl/lg/md/sm 四档） | **作废**，换为 §7 的面板两档宽度模型 |
| §0.5 共享组件清单 | ListPageShell/DetailPageShell/ModuleSidebar 不再建；AppEmptyState/FilterBar 保留计划 |
| §0.6 不可破坏契约 | **全部继承**（见本文 §8） |
| §1–§14 各页"主/次操作、删减清单、拆分/退役、空态设计" | **保留**，作为对应面板的内容设计输入（本文 §6 逐条映射） |
| §15.3 实施顺序 P0–P3 | **作废**，换为本文 §10 |

---

## 2. 壳组件结构

新壳全部落在 `packages/app-vue/src/`（layouts + shell 组件），替换现 `MainLayout.vue`。

```
AppShell
├─ WindowHeader（h-48px，桌面端整条为拖拽区，交互元素 no-drag）
│   ├─ 左：侧栏折叠按钮 · 返回/前进
│   ├─ 中：模块胶囊 ×5（图标 + 计数角标；点击出预览浮层，浮层内「进入」开面板）
│   └─ 右：日程"当前时段"胶囊 · [桌面端] 最小化/最大化/关闭
├─ ConversationSidebar（默认 260px，200–400 可拖，可折叠为 0）
│   ├─ 头：品牌名「知行 MemoFlow」 · 搜索按钮
│   ├─ 「新对话」按钮
│   ├─ AI 会话列表（按时间分组：今天/近 7 天/更早；无树、无业务对象）
│   └─ 底：头像 + 用户名（点击 → 设置面板） · 帮助
├─ AIWorkspaceLayer（常驻层，见 §3 架构要点）
│   ├─ 欢迎态（无消息时：品牌 + 四张快捷指令卡）
│   └─ 消息时间线（AIMessagePanel 复用）
├─ GlobalComposer（常驻；AIFooterComposer 改造，见 §6.0）
└─ BusinessPanel（容器，**多 Tab**，参照 Codex 桌面端右侧面板）
    ├─ Tab 条：[模块图标+标题] ×N · [+] ｜ 右侧：Maximize/Minimize · ✕(关面板)
    └─ 内容：活动 Tab 的 <router-view>（业务模块视图挂载点，KeepAlive 按 Tab 保活）
```

### 2.1 架构要点：AI 工作区从"路由页面"提升为"壳常驻层"

现状 `/` 渲染 `AIChatView`，AI 是一个路由页面。V2 中分栏态下 AI 与业务面板**同屏**，因此：

- **`<router-view>` 只驱动 BusinessPanel 内容**；AI 工作区（会话侧栏 + 消息区 + Composer）变为壳的常驻层，不再经过路由。
- `AIChatView.vue` 拆解：`useAIChatView` 等 composable 及其 4 个 workflow 子 composable **原样保留**（Brief §11 契约），消费方从路由页面变为壳层组件。工作流生命周期按钮组的迁移目标从 V1 的"右栏操作条"改为**消息时间线内嵌 + Composer 上方条**（见 §6.0）。
- 路由 `/` = "无面板" 状态，不渲染任何 router-view 内容。

### 2.2 胶囊预览浮层

沿用原型 `WindowHeader.vue` 的交互：点击胶囊先出 264px 预览浮层（不直接开面板），浮层内容为该模块的 3–4 条摘要 + 「进入」按钮。数据源全部用现有 owner composable（Goal/Task/Notification summaries 等），不新增接口。再次点击胶囊或点外部关闭浮层。

### 2.3 业务面板多 Tab（2026-07-12 补充拍板）

面板不是单上下文容器，而是**Tab 化的业务工作区**（截图参照：Codex 桌面端右侧 Browser/Terminal 多 Tab 面板）：

- 每个 Tab = 一个独立的业务上下文（自己的路由位置 + 组件状态），Tab 标题 = 模块图标 + 当前视图名（如「🎯 知行 UI 重构」「📄 UI 设计方向.md」）。
- 打开规则：胶囊「进入」→ 已有该模块 Tab 则激活它，没有则新开；深链 / AI 工作流跳转 / 工作流产物 → **新开 Tab**（同路由已开着则激活），**不抢占**当前 Tab。
- 关闭规则：逐 Tab 关闭；关掉最后一个 Tab = 关面板回 STATE A。面板头 ✕ 关整个面板（所有 Tab）。
- Maximize/Minimize（B ⇄ C）作用于整个面板，Tab 条在两态下都保留。
- 非活动 Tab 用 `<KeepAlive>` 保活（编辑器脏状态、表单半成品不丢失）；未保存守卫在 Tab 关闭时同样触发。
- Tab 数上限建议 8，超出时最久未激活的可被提示关闭（不自动关，避免丢状态）。

> 注意与 V1 §9 的区分：这里的 Tab 是**壳级**的业务上下文 Tab，不是笔记模块内部的文档多标签（`TabManager`）。后者仍按 vault 阶段 0 退役——在新壳里"多开笔记"就是多开几个 Note Tab，天然取代了模块内自建标签页。

### 2.4 日程"当前时段"胶囊（决策 #5）

位置：WindowHeader 右侧、窗口控制按钮左边。形态：

```
[ 14:00–16:00 · UI 细节优化 ]        ← 有当前事件：起止时间 + 事件标题
[ 16:30 · 站会（30 分钟后） ]        ← 无当前事件：下一个事件 + 倒计时
[ 今日无安排 ]                       ← 空态（弱化样式）
```

- 数据源：`useCalendarView` 的当日窗口（含任务实例投影），取"正在进行"或"下一个"事件；每分钟刷新。
- 点击 → 打开日程面板（`/schedule/calendar`，STATE B）。它与 5 胶囊同级，只是**常态即展示内容**而非图标+计数。
- 窄窗口（<768px）退化为时钟图标按钮。

---

## 3. 模块矩阵

| 模块 | 入口 | 面板内容（一次性切换时先原样嵌入的现视图） | 路由 |
|---|---|---|---|
| Goal 目标 | 胶囊 1 | `GoalModuleLayout` 全子树（列表/详情/KR/复盘/专注/对比） | `/goals/**` 不变 |
| Task 任务 | 胶囊 2 | `TaskManagementView` / `TaskDetailView` | `/tasks/**` 不变 |
| Note 笔记 | 胶囊 3 | Knowledge projection / Local Vault 工作区 + **Governance 并入为"规范"区**（`/note/:id` 已退役） | `/repository`（`?note=` 深链）、`/governance/**` |
| Reminder 提醒 | 胶囊 4 | `ReminderLinearView` | `/reminders` 不变 |
| Notification 通知 | 胶囊 5（未读角标） | `NotificationListPage`（预览浮层承担 V1 的"铃铛弹层"职责） | `/notifications` 不变 |
| Schedule 日程 | 当前时段胶囊 | `ScheduleCalendarView`（日/周/月日历） | `/schedule` → `/schedule/calendar` 单入口 |
| Settings 设置 | 侧栏底部头像 | `UserSettingsView`（含账户中心迁入，沿 V1 §13 分组方案）——**默认以 STATE C 打开**（配置页不需要与 AI 并排） | `/settings` 不变 |
| Dashboard 仪表盘 | **退役** | 今日概览职责由 Home/AI owner read models 承接（§6.0）；趋势图/活动时间线随页退役 | 无 `/dashboard` 路由或兼容 redirect |
| Account 账户 | 并入 Settings | — | `/account/center` → `redirect: '/settings?tab=account'` |
| AI 对话 | 就是地面本身 | — | `/ai/chat` → `redirect: '/'` |
| Auth 登录 | 壳外 | `AuthLayout` 不变（V1 §14：流程勿动） | `/auth` 不变 |
| 桌面通知弹窗 | 壳外 | `CustomNotificationView` 独立窗口，不进壳 | `/custom-notification` 不变 |

---

## 4. 路由 ↔ 面板状态映射（决策 #2）

原则：**路由一条不删**（redirect 除外），URL 是面板状态的持久化形式。

```
面板状态 = { tabs: [{ id, module, 当前路由 }], activeTabId, layout: 'split' | 'focus' }
```

- **URL = 活动 Tab 的当前路由**；`/` = 无面板（STATE A）。
- **URL → 面板**：路由变化时按 §2.3 打开规则落到某个 Tab（激活已有或新开）；深链（AI 硬跳转 `openAutomatedGoal`→`/goals/:id`、`openRecentKnowledgeNote`→`/repository?note=`、通知点击）自然新开/激活 Tab 并定位。
- **面板 → URL**：Tab 内导航沿用现有 `router.push`，不改任何业务代码；**切换 Tab = `router.replace` 到该 Tab 的当前路由**（不污染 history）；关活动 Tab = 切到相邻 Tab 并 replace；关最后一个 Tab / 面板 ✕ = `router.push('/')`。
- **layout 与 Tab 集合不进 URL**：split/focus 与打开的 Tab 列表是视图状态，存壳级 UI store；URL 只承诺"这条链接能到达这个业务位置"。深链默认 split（<1024px 自动 focus）；Settings 默认 focus。
- **`?dialog=goal&goalId=` 契约**：路由查询参数原样保留，`syncGoalDialogFromRoute` 逻辑不动——面板化对它透明。
- 浏览器/窗口头的返回/前进 = `router.back()/forward()`，天然获得"面板历史"。

---

## 5. 会话侧栏（决策 #4）

- **只有 AI 会话**：按时间分组（今天 / 近 7 天 / 更早），条目 = 会话标题一行，hover 出 ⋯（重命名/删除）。
- 现 `AIConversationSidebar` 的其余内容处置：AgentRun 历史 → 收进会话条目内（该会话关联的 run 在消息流内可见，不单独列）；recentGoals / recentKnowledgeNotes → **删除**（胶囊预览浮层已承担"快速回到对象"职责）；刷新按钮 → 删除（切换会话隐式拉取）。
- 「新对话」= 新建会话 + 关面板回 STATE A。
- 底部：头像+用户名（→ Settings 面板）、帮助按钮。V1 的 NotificationBell 侧栏方案作废（通知已是胶囊）。

---

## 6. 面板内容设计（V1 内容级结论的迁移映射）

一次性切换时各视图**原样**进面板；随后按下表逐模块改造。改造时 V1 对应章节的"主/次操作、删减清单、空态、拆分/退役表"继续有效，本节只写**因面板化而变化**的部分。

### 6.0 AI 工作区（V1 §1 的替代）

- 欢迎态（新会话无消息）：品牌图标 + "今天想推进哪件事？" + 四张快捷指令卡（原型 `AiWorkspace.vue`），指令卡动作 = 预填 Composer 并设定工具模式（chat / goal-create / note / qa），取代 V1 的"三个工作流入口卡"。
- **今日概览（承接 Dashboard）**：欢迎态下方渲染轻量"今日"区——`DailyTodoWidget` + `UpcomingRemindersWidget` + 目标进度列表（V1 §2 拍板迁移的三 widget），有会话消息时不显示。
- 工作流生命周期按钮组（goal-agent 6+ 等待态）：V1 拍板"迁到右栏操作条"，V2 无右栏——改为**内嵌在消息时间线的工作流卡片上**（决策点出现在它发生的消息位置），Composer 回归纯对话不变。**状态机分支逻辑一行不改**（Brief §12-5），`goal-agent-*` testid 随迁。
- 工作流产物（`AIGoalWorkflowPanel` 草稿编辑）：产物就绪时**新开一个业务面板 Tab 展示草稿**（Goal 草稿→Goal Tab），不抢占用户正开着的其他 Tab（§2.3 打开规则）。`AIGoalWorkflowPanel` 对外 props/emits 不变（Brief §11）。
- Composer：`AIFooterComposer` 改造为壳级 GlobalComposer——纯 AI 态与分栏态在 AI 列底部，专注态浮在业务面板底部；模式选择/模型 ⚙ 收敛沿 V1 §1 表格执行。
- 知识问答证据列表与 `evidenceStatus==='grounded'` 校验：保留，渲染在问答消息卡内。

### 6.1–6.7 业务面板

| 面板 | 沿用 V1 章节 | 面板化差异 |
|---|---|---|
| Goal | §3 §4 §5 | 模块内第二侧栏（系统视图/文件夹）在 split 窄档收为顶部下拉，focus 档恢复侧栏；专注模式缩为一行按钮的拍板不变 |
| Task | §6 | 「任务库」更名、FilterBar、图谱视图模式、全部删除入危险区——全部照做；拖拽建依赖仅 focus 档启用（split 档 450px 内拖拽误操作率高） |
| Schedule | §7 | 日历天然要宽度：**进入即建议 focus 档**（split 档只渲染日视图）；`EventDetailSheet` 补位照做；主视图为 `ScheduleCalendarView`（已更名） |
| Reminder | §8 | 分组侧栏在 split 窄档收为下拉；全局开关任何档位保持面板头可达 |
| Note | §9 §10 + §12 | 阶段 0 收缩（退役多标签/分屏/导出/批量导入）照做；**Governance 以"规范"分区并入**：面板内顶部切换 [笔记 \| 规范]，`/governance/**` 路由渲染到规范分区，V1 §12 的 FilterBar 收敛照做 |
| Notification | §11 | 胶囊预览浮层 = V1 的铃铛弹层（最近 N 条 + 全部已读 + 查看全部）；完整面板 = 信箱归档页 |
| Settings | §13 | 默认 focus 打开；6 分组方案、账户中心迁入、`?tab=` 契约照做 |

### 6.8 空/加载/错误基线

V1 §0.3 原文适用（AppEmptyState / skeleton 镜像布局 / 区块级 inline Alert + 重试 / sonner toast）。

---

## 7. 响应式：从"视口四档"到"面板两档"

V1 §0.4 的 xl/lg/md/sm 页面断点作废。V2 的宽度适配对象是**面板本身**：

| 档位 | 触发 | 行为 |
|---|---|---|
| 窄档 | split 态（320–750px） | 模块第二侧栏收为下拉/Sheet；网格降为 1–2 列；重交互（拖拽、图谱）禁用并提示"最大化后可用" |
| 宽档 | focus 态（满屏） | 完整布局，等价于 V1 里该页的桌面形态 |

窗口级断点只剩两条：<1024px 分栏自动升 focus（B→C）；<768px 侧栏转 overlay、日程胶囊缩为图标。真正的移动端仍归 `apps/mobile`（RN 独立 UI），不变。

实现：面板内组件用 **container query**（或面板宽度 provide/inject），不用视口断点——同一组件在 split 和 focus 下自适应。

---

## 8. 不可破坏契约（继承 V1 §0.6 + Brief §11/§12）

1. `data-testid` 随组件迁移（5 份 Playwright 配置锚定）。
2. 路由契约：`?dialog=goal&goalId=`、`/repository?note=`（已有笔记预览，不再有 `/note/:id`）、`/goals/:id` 等 AI 硬引用路径；删改路由一律 redirect。
3. 数据访问只走 DI 端口与 composable 门面；壳重构不得直连 HTTP/IPC。
4. 三处高危状态机迁移时逻辑分支不重写：AI goal-agent 等待态按钮互斥、编辑器未保存守卫（双 composable）、提醒分组控制模式。
5. `MAIN_NAVIGATION_KEY` DI 覆写：新壳导航形态变了，`NavigationItem` 接口需重定义（胶囊模块清单可覆写）——仍属破坏性接口变更，同步 `di/types.ts` 与 web/desktop 两个 `di-app.ts`。
6. 双端回归：每步改动 Web + Electron 都要跑；`/custom-notification` 独立窗口路由不动。
7. SSE 通知启动钩子（`createNotificationStartupHook`）不动——胶囊未读角标的数据源。
8. i18n：新增 key（胶囊、面板头、日程胶囊空态等）补 zh-CN/en-US 两份；「仓库→笔记」「任务模板管理→任务库」更名照 V1 执行并同步 mobile 文案。

---

## 9. 桌面宿主工作项（新壳的 Electron 侧前置）

新壳的自绘窗口头要求桌面宿主配合（`apps/desktop`）：

1. 主窗口改无边框：`BrowserWindow({ frame: false })`（或 `titleBarStyle: 'hidden'` + overlay 评估）。
2. WindowHeader 整条 `-webkit-app-region: drag`，交互元素 `no-drag`（原型已有样式约定）。
3. 窗口控制 IPC：minimize / maximize-restore / close 三个通道 + 渲染端按钮接线；Web 端这组按钮不渲染（`isDesktopEnvironment`）。
4. 返回/前进按钮 = 渲染层 `router.back()/forward()`，无需宿主参与。
5. 回归点：桌面通知弹窗窗口、托盘、`hydrateDesktopBootstrapAuthState` 启动水合不受影响。

---

## 10. 实施顺序（决策 #7：原地一次性切换）

"一次性"指**壳的切换不留双轨**——不做 feature flag、不保留旧 MainLayout；但切换 PR 之前的准备和之后的内容改造仍分步。

| 步骤 | 内容 | 说明 |
|---|---|---|
| S0 准备 | 桌面宿主无边框窗口 + 窗口控制 IPC（§9）；壳组件在独立分支开发（WindowHeader / ConversationSidebar / BusinessPanel / GlobalComposer / 三态布局容器）；AIChatView → 常驻层拆解设计 | 不影响主干 |
| S1 **切换 PR** | 一次合入：新 AppShell 替换 MainLayout；router-view 移入 BusinessPanel；AI 常驻层接线；redirect（/ai/chat、/account/center）；导航 DI 接口重定义；模块视图**原样**进面板（允许窄档难看）；E2E 全量修复 | 单个大 PR，合入后中间态即可用：所有当前模块可达、深链全通 |
| S2 面板内容改造 | 按 §6.1–6.7 逐模块执行（每模块一个独立 PR），含 V1 的删减/退役/更名清单 | 顺序建议：Goal → Task → Schedule → Reminder → Notification → Settings |
| S3 AI 工作区精修 | §6.0：欢迎态 + 今日概览 + 工作流按钮内嵌消息卡 + 产物自动开面板 + 孤儿视图/legacy 分支删除 | 状态机回归重点 |
| S4 Note 阶段 0 | V1 §9/§10 收缩 + Governance 并入，与 Brief §13 vault 专项并行不阻塞 | — |

### 验收清单（S1 切换 PR 的门槛）

1. 5 份 Playwright 配置全绿（布局断言按新壳更新，路由与 testid 锚定不变）。
2. 深链逐条验证：`?dialog=goal&goalId=`、`/repository?note=`、`/goals/:id`、三个 redirect、schedule `/schedule/calendar` 单入口。
3. Electron 手动回归：无边框拖拽/窗口控制、桌面通知弹窗、IPC 数据链路、启动水合。
4. Web 回归：无窗饰形态、浏览器前进后退与面板历史一致。
5. AI 三工作流端到端各跑一遍（目标创建全生命周期 / 知识笔记 / 知识问答）。
6. i18n zh/en 无缺 key。

---

## 11. 待细化（不阻塞 S0/S1）

- 胶囊计数的数据源统一（复用 owner read models 还是各模块 composable 各自供数）——S1 可先只做通知未读角标。
- 会话列表分组的"今天/近 7 天/更早"边界与时区处理。
- 面板 layout 偏好（split/focus、宽度）与 **Tab 集合的会话恢复**（重启后是否还原上次打开的 Tabs）的持久化位置（localStorage vs 用户设置）。
- 日程胶囊的刷新策略（每分钟 tick vs 事件边界定时器）。
- 多 Tab 下 `<KeepAlive>` 的内存上界与浏览器端表现（大文档编辑器多开时）。
