---
tags:
  - audit
  - ui
  - shell
  - information-architecture
  - desktop
description: MemoFlow 基础 UI、桌面壳层、导航语义与业务面板结构的系统诊断
created: 2026-08-06T00:00:00Z
updated: 2026-08-06T00:00:00Z
---

# 基础 UI 与 Shell 系统诊断

## 1. 审查结论

本轮审查的对象不是颜色、圆角、阴影或品牌风格，而是 MemoFlow 的基础界面系统：

- 页面场景如何切换以及切换时是否保留工作状态；
- 顶栏入口、预览浮层、BusinessPanel Tab 与 URL 各自表达什么；
- AI、业务面板、Home、Workflow 和设置页的生命周期边界；
- 面板宽度、最小宽度、收缩动作和滚动容器的职责；
- 各业务模块是否遵循一致的页面骨架；
- 设置页在桌面宽屏中的信息架构和定位反馈。

总体判断：当前壳层方向正确，已经完成了模块复合胶囊、Schedule/Notification 入口恢复、设置场景栏移除以及桌面三栏动态几何。但实现仍存在一处 P0 状态风险和多处 P1 壳层契约分裂。最重要的问题不是单个组件的样式，而是 route、Tab、surface、KeepAlive 和 scene 的状态边界没有形成单一导航协议。

复合胶囊的产品方向建议保留：左侧主按钮负责进入模块，右侧独立按钮负责摘要预览。现有 Popover primitive 适合承载 hover/focus/click/touch/Escape/outside 的预览生命周期；它不应取代主入口，也不应改变“进入 landing route”和“打开精确对象”的导航语义。

## 2. 审查范围与证据

### 2.1 范围

本轮覆盖：

- `packages/app-vue/src/layouts/shell/` 壳层、Tab、面板、设置场景和顶栏组件；
- `packages/app-vue/src/layouts/shell/useShellRouterSync.ts` 与 `useAppShellStore.ts`；
- Goal、Task、Reminder、Schedule、Notification、Repository、Governance 的路由和页面骨架；
- AIChatView、AIMessagePanel、AIWorkflowActionBar、AIContextPanel；
- 顶栏各模块 preview、Home widgets 和现有 Shell/Playwright 测试。

### 2.2 不纳入本轮实施范围的内容

移动端专属设计暂不处理，包括移动端 overlay sidebar、窄屏入口优先级、触屏手势、移动端标签折叠和移动端尺寸矩阵。桌面端的最小/最大几何、拖拽收缩、键盘可访问性和设置宽屏导航仍属于本轮诊断与后续方案范围。

### 2.3 运行时证据

- 当前工作分支为 `main`，工作区保留上一轮未提交改动；
- local Docker Web、API、AI Service、PowerSync、PostgreSQL、Redis 均已通过健康检查；
- 现有 local-docker Playwright 产品旅程为 7/7；
- 现有证据文件：`reports/local-deploy-validation/local-docker-playwright-evidence.json`；
- 当前测试主要覆盖几何、基本胶囊入口、设置独立场景和工作流，尚未覆盖本报告列出的 route intent、设置中断、Tab 缓存上限和统一 scroll host 场景。

## 3. 当前结构模型

当前 AppShell 实际同时维护五类状态：

| 状态维度 | 当前实现                         | 应表达的事实                   |
| -------- | -------------------------------- | ------------------------------ |
| Scene    | `workspace` / `settings`         | 当前是工作区还是独立设置场景   |
| Surface  | `home` / `business` / `workflow` | BusinessPanel 当前显示哪种内容 |
| Layout   | `split` / `focus`                | AI 与业务面板是否并列          |
| Tab      | `BusinessTab[]` + `activeTabId`  | 已打开的业务上下文和当前 URL   |
| Viewport | `showSidebar`、动态 panel clamp  | 当前窗口能否容纳这些区域       |

这些状态目前由不同组件分别修改：路由同步在 `useShellRouterSync`，面板动作在 `AppShell`，工作流状态在 AIChatView，宽度状态在 AppShell 和 Pinia store，设置场景通过模板分支切换。结果是同一件事存在多个入口和多个行为协议。

## 4. 分级问题总表

| ID     | 级别 | 问题                                                                | 用户影响                                              | 结论           |
| ------ | ---- | ------------------------------------------------------------------- | ----------------------------------------------------- | -------------- |
| UI-001 | P0   | 进入设置会卸载整个 workspace 和 AI 实例，且没有统一离开保护         | 未保存编辑可能丢失；AI 流式回复中断                   | 必须先修       |
| UI-002 | P1   | 入口导航分散，部分动作直接 `router.push`，绕过 Tab/dirty/busy 协议  | URL、Tab、返回行为不一致                              | 必须收敛       |
| UI-003 | P1   | 胶囊入口激活旧 Tab 时不保证 landing；preview 项目 ID 未转成精确深链 | “进入模块”和“恢复上下文”含义冲突                      | 必须收敛       |
| UI-004 | P1   | Dirty/busy 保护只覆盖 Goal/Task 的部分动作                          | Reminder、Schedule、Governance 等编辑页面可无提示离开 | 必须补齐       |
| UI-005 | P1   | KeepAlive `max=8` 与实际无限增长的 Tab 列表不一致                   | 超过上限后缓存静默驱逐，草稿可能丢失                  | 必须修正契约   |
| UI-006 | P1   | BusinessPanel wrapper 与模块内部重复声明滚动                        | 滚轮抢占、sticky 参照错误、滚动位置不稳定             | 必须统一       |
| UI-007 | P1   | 设置返回优先 activeTab，而不是进入设置前的 origin                   | 返回到过时后台 Tab                                    | 必须修正       |
| UI-008 | P1   | 顶栏 notification badgeSource 注册但未传入 header                   | 未读状态不可扫描                                      | 应补齐         |
| UI-009 | P2   | 各模块页面骨架、二级导航和返回语义差异大                            | 认知成本和维护成本持续增加                            | 建议统一       |
| UI-010 | P2   | AI workflow 状态同时出现在时间线、ActionBar 和右工作台              | 状态重复、下一步动作层级不清                          | 建议重排       |
| UI-011 | P2   | Help 菜单全部 disabled/soon                                         | 可见但不可用的功能债务                                | 应隐藏或实现   |
| UI-012 | P2   | preview 数据源和完整页面数据生命周期没有统一读模型                  | 摘要与完整页面可能短暂不一致                          | 建议收敛       |
| UI-013 | P2   | ARIA roles、active state、Tab semantics 在模块间不一致              | 键盘和辅助技术反馈不统一                              | 应纳入基础模板 |

## 5. 详细诊断

### 5.1 Scene 与生命周期边界：P0

`AppShell.vue` 使用 `StandaloneSettingsLayout v-if="isSettingsScene"` 和 workspace `v-else`。这意味着设置页不是一个覆盖在 workspace 上的场景，而是直接销毁 workspace 子树。Pinia 里的 Tab 元数据仍然存在，但 KeepAlive 组件实例、表单草稿、AIChatView 实例和 Teleport 宿主都不存在了。

`openSettings()` 只负责路由跳转，不调用 `canLeaveSurface()`；AI chat 的 lifecycle helper 在组件卸载时会调用 `abortActiveStream()`。因此“设置是独立场景”和“设置不会影响后台工作”这两个产品假设当前互相矛盾。

目标结构应是：workspace scene host 持久挂载；settings scene 以同一 Shell 内的独立 scene outlet 或 overlay 挂载；业务路由缓存和 AI 实例不因设置导航而销毁。只有用户明确确认放弃草稿时，才允许销毁 dirty surface。

### 5.2 导航协议：P1

当前存在以下入口分叉：

- Header capsule 经过 `useShellRouterSync.openModule()`；
- Home widget 通过 `openPanelRoute()` 直接 `router.push()`；
- AI 快捷入口直接跳 Goal/Task/Settings；
- 设置中的返回自己决定目标；
- 顶栏前进后退直接调用 router；
- preview 的“查看全部”和项目点击使用不同的 AppShell handler。

这些入口没有共同的“导航意图”模型。建议至少定义：

1. `landing`：进入模块默认列表；
2. `deep-link`：进入指定对象或查询状态；
3. `tab-activate`：恢复已经存在的 Tab；
4. `scene-enter`：进入设置等独立场景；
5. `surface-switch`：Home/Business/Workflow 之间切换。

所有会离开业务 surface 的意图都必须经过同一个 coordinator，统一检查 dirty/busy、更新 Tab、更新 URL 和保存 origin。

### 5.3 复合胶囊：P1/P2

复合入口的视觉与交互拆分是正确的，但当前契约仍有三处缺口：

- 主入口已有模块 Tab 时恢复旧路由，不一定进入模块 landing；
- Goal/Task/Reminder preview 发出的对象 ID被忽略；
- Notification 的 `badgeSource` 在 header mapping 时被丢弃。

建议：主按钮永远进入 landing；预览中的项目点击永远进入精确 deep-link；“查看全部”永远进入 landing；Tab 只负责恢复最近上下文。预览组件只提供摘要数据和 intent，不直接决定壳层 Tab 行为。

Schedule 当前只展示“当前或下一条”日程，不是完整当日安排。若产品目标是快速掌握当天日程，建议显示当前事件、接下来 2-3 条和当天剩余数量，而不是只返回一段字符串。

### 5.4 Dirty/Busy 与 Tab 缓存：P1

`canLeaveSurface()` 当前只用于切换 Tab、关闭 Tab、关闭右侧面板和 Home。只有 GoalModuleLayout、TaskManagementView 注册了 `usePanelSurfaceStatus`，而 Reminder、Schedule、Governance RuleEditor、Repository 创建流程等仍缺少统一状态上报。

同时，Tab 列表可超过 `MAX_BUSINESS_TABS`，KeepAlive 却固定 `max=8`。这会形成“Tab 看起来仍然存在，但实例已经被缓存层驱逐”的隐性数据丢失路径。

建议把状态从全局单值升级为按 Tab/route owner 归属的 status registry，并明确策略：

- `busy`：禁止离开；
- `dirty`：确认后离开；
- `clean`：直接离开；
- `background`：仅在组件实例确实仍受缓存保护时允许隐藏。

### 5.5 滚动和面板职责：P1

BusinessPanel 为 Home、Business、Workflow 都包了一层 `overflow-auto`，而 Task、Notification、Reminder、Goal、Repository 页面又自行创建 scroll host。不同模块因此有不同的滚动责任，导致滚轮、触控板和 sticky toolbar 的参照对象不一致。

目标契约：BusinessPanel content surface 只负责 `overflow-hidden` 和尺寸传递；每个 surface 只声明一个主 scroll host；内部双列布局可以有独立的列表滚动，但必须明确标记为局部 scroll host，不能再叠加一个无语义的外层滚动。

### 5.6 设置页桌面信息架构：P1/P2

上一轮移除遗留场景栏是正确方向。当前设置页已经是“设置页头 + 单一正文滚动 + 分类导航”的形态，但仍有三个问题：

- 宽屏分类导航不是 sticky，长页面中会消失；
- 分类按钮只有视觉 active，没有标准 `aria-current` 或 tab 语义；
- 注释仍写“6 组”，实际 `GROUP_VALUES` 和 `groups` 已经是 7 组，文档和代码漂移。

设置内容的 `max-w-5xl`/`max-w-3xl` 属于内容可读性限制，不应与三栏产品面板的固定最大宽度混淆。桌面壳层可以没有产品级最大宽度，设置正文仍然可以保留合理的阅读宽度。

### 5.7 模块页面骨架：P2

Goal 使用 `GoalModuleLayout + GoalPageToolbar`；Task 直接在 leaf view 中渲染 header；Reminder 有 toolbar、分组侧栏和内容区；Note 使用 `NoteSegmentBar`；Governance 的 detail/editor/revision 页面又采用独立的 breadcrumb 和 max-width 文档布局。

建议抽象统一的 `ModuleFrame` 结构：

```text
ModuleFrame
├── PageHeader: 标题、面包屑、主操作、次操作
├── SecondaryNav: 模块内部视图/分区/筛选
└── ContentSurface: 唯一主滚动宿主
```

模块只提供标题、导航项、操作项和内容，不再自行决定壳层滚动和返回策略。

### 5.8 Workflow、Help 与数据摘要：P2

AI workflow 内容当前分别出现在消息时间线、Composer 上方的 `AIWorkflowActionBar` 和右侧 `AIContextPanel`。建议固定职责：时间线是历史记录，ActionBar 是下一步行动，ContextPanel 是结构化编辑/审批/执行回执。

Help 菜单当前所有项目都是 disabled/soon。未实现入口不应继续占用导航位置；可以先开放已有的快捷键入口，其他入口等实现后再加入。

各 preview 组件和完整模块页面分别拉取数据，缺少统一的 summary read model。后续应让 Goal/Task/Reminder/Schedule/Notification preview 与 Home/full page 共享同一个摘要来源和刷新事件，避免顶部状态与正文短暂不一致。

## 6. 当前明确不处理的内容

以下项目延后，不进入本轮实施计划：

- 移动端 overlay sidebar；
- `<1000px` 胶囊隐藏/更多菜单策略；
- 触屏点击、触屏 resize 和移动端 hit area；
- 移动端设置 tabs/select；
- 移动端窗口宽度和截图矩阵。

## 7. 需要补充的验证

- 设置中打开 dirty Goal/Task 编辑后进入设置，确认草稿和 AI 流状态保持；
- 从 Home、Goal detail、Task detail 分别进入设置并验证返回 origin；
- 已有 Goal detail Tab 时点击 Goal 主按钮，确认进入 `/goals`；
- preview 项目点击进入精确 Goal/Task/Note deep-link；
- 创建第 9 个业务 Tab，确认不会出现“Tab 存在但组件被静默驱逐”；
- 每个模块检查主 scroll host 数量、sticky toolbar 参照对象和滚动位置恢复；
- Notification 未读数量在顶栏入口、preview 和列表之间即时一致；
- 宽屏设置长页面滚动时分类导航保持可见。
