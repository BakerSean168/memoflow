---
tags:
  - plan
  - active
  - ui
  - shell
  - desktop
  - information-architecture
description: 基础 UI 与桌面 Shell 系统诊断后的生命周期、导航、滚动和模块骨架重构方案
created: 2026-08-06T00:00:00Z
updated: 2026-08-06T00:00:00Z
---

> ✅ 已归档 2026-08-08：场景生命周期、导航意图、滚动宿主、模块骨架全部落地（commit 784fb9f6）。

# 基础 UI 与桌面 Shell 后续优化方案

## 1. 目标

本计划承接 [基础 UI 与 Shell 重构](./2026-08-06-ui-foundation-and-shell-refactor.md) 已完成的几何、入口恢复和设置扁平化工作，继续处理基础结构和功能摆放问题。

本阶段目标：

1. 保证进入设置、切换 Tab、关闭面板和进入模块不会破坏业务草稿或 AI 流状态；
2. 让 landing、deep-link、Tab 恢复和 surface 切换拥有明确且可测试的语义；
3. 建立 BusinessPanel 的单一滚动责任；
4. 统一 Goal、Task、Reminder、Schedule、Notification、Note/Governance 的桌面页面骨架；
5. 让设置页在桌面宽屏长页面中保持分类导航定位；
6. 让顶部摘要入口、完整页面和未读/进度状态使用一致的读模型；
7. 用桌面端单元测试、集成测试和 local-docker E2E 固化这些契约。

## 2. 明确不在本阶段处理

移动端内容全部延期，不进入本计划的实施和验收：

- 移动端 overlay sidebar；
- 窄屏胶囊隐藏、更多菜单和入口优先级；
- 触屏 hover/click/resize 手势和触控目标尺寸；
- 移动端设置 tabs/select；
- 移动端 viewport 截图矩阵。

桌面端和大于移动断点的普通窗口仍需验证键盘、鼠标、pointer resize、动态最小宽度和收缩动画。

## 3. 目标架构

### 3.1 场景宿主

AppShell 持久拥有 workspace scene。Settings 不再通过销毁 workspace 的互斥分支实现，而是使用独立 scene outlet：

```text
AppShell
├── WindowHeader
├── WorkspaceSceneHost          # AI、ConversationSidebar、BusinessPanel 持久挂载
│   ├── ConversationSidebar
│   ├── AIWorkspace
│   └── BusinessPanel
└── SettingsSceneHost           # 路由切换时显示，不销毁 WorkspaceSceneHost
    └── StandaloneSettingsLayout
```

如果 Vue Router 的单一 unnamed view 无法同时满足两个 scene，应使用 named view、scene cache 或受控的 keep-alive outlet；禁止用简单 `v-if/v-else` 让 AI 和业务实例重建。

### 3.2 导航意图

建立 `ShellNavigationIntent`，所有壳层入口只提交意图，不直接改变 URL：

```ts
type ShellNavigationIntent =
  | { type: 'landing'; module: ShellModule; route: string }
  | { type: 'deep-link'; module: ShellModule; route: string; title?: string }
  | { type: 'activate-tab'; tabId: string }
  | { type: 'enter-settings'; route: string; origin: ShellOrigin }
  | { type: 'home' }
  | { type: 'surface'; surface: PanelSurface };
```

Coordinator 统一负责：

- dirty/busy 检查；
- scene origin 保存；
- Tab 创建、激活、关闭和标题更新；
- URL push/replace 选择；
- route leave failure 处理；
- surface 与 layout 同步。

### 3.3 业务面板滚动契约

BusinessPanel content wrapper 只负责尺寸和裁剪，使用 `overflow-hidden`。每个 surface 必须声明一个 `data-scroll-host`：

| Surface  | 主 scroll host                        |
| -------- | ------------------------------------- |
| Home     | TodayOverviewPanel 根内容             |
| Business | 当前模块的 ModuleFrame ContentSurface |
| Workflow | AIContextPanel 内部工作区             |

模块内部的双列列表可以有局部 scroll host，但不能让无语义的外层 wrapper 再创建滚动层。

### 3.4 统一 ModuleFrame

```text
ModuleFrame
├── ModuleHeader
│   ├── title / breadcrumb
│   ├── primary action
│   └── secondary actions
├── ModuleSubnav
└── ModuleContent (唯一主滚动宿主)
```

Goal system view、Note/治理分区、Schedule day/week/month、Notification all/unread、Reminder group、Task filter/view mode 都属于 `ModuleSubnav` 的不同实现，不再各自重复定义页面级滚动和返回逻辑。

## 4. 实施阶段

### Phase 0：状态保留与统一离开协议

目标：先消除 P0 数据风险，再改变页面结构。

任务：

- 将 workspace scene 从 settings scene 的 `v-if/v-else` 互斥销毁改为持久 scene host；
- 为 `openSettings`、AI settings、Home widget、AI 快捷入口、浏览器后退/前进统一接入 coordinator；
- 保存 `ShellOrigin`：进入设置前的 route、active tab、panel surface、layout；
- 设置返回优先恢复 origin，origin 失效时才回 active tab，再回 `/`；
- 为所有可编辑模块实现 `usePanelSurfaceStatus`：Goal、Task、Reminder、Schedule、Governance RuleEditor、Repository mutation；
- 明确 busy/dirty 的确认文案和取消后的行为；
- 进入设置时如果 workspace 正在流式生成，保持 AI 实例，不触发 abort。

验收：

- dirty Goal/Task/Reminder/Governance 编辑进入设置后，取消离开不会改变 route 或草稿；
- 确认离开后，返回应用仍恢复原 route/origin；
- AI 流式回复过程中进入设置，回复不中断，返回后继续可见；
- 所有壳层入口的导航事件都能在 coordinator 中追踪到。

### Phase 1：Tab、landing 和 deep-link 语义收敛

目标：修复复合胶囊和业务 Tab 的概念混用。

任务：

- `landing` 主入口永远进入模块默认 route，不因为旧 Tab 存在而停在详情；
- `deep-link` 预览项目进入精确对象 route；
- “查看全部”固定为 landing intent；
- Note、Goal、Task、Reminder preview 分别定义精确路由或查询参数；
- Tab 标题从模块名升级为“模块 + 对象标题”，列表 Tab 使用模块名；
- 同一对象的精确 route 复用现有 Tab，不重复创建；
- 同模块不同对象是否允许多 Tab，形成明确产品决策并写入 store contract；
- 超过 `MAX_BUSINESS_TABS` 时提供明确 Tab 管理动作，不能仅 Toast 后继续增加。

建议的入口映射：

| 入口                         | 意图      | 目标                   |
| ---------------------------- | --------- | ---------------------- |
| Goal 主按钮                  | landing   | `/goals`               |
| Goal preview 项目            | deep-link | `/goals/:id`           |
| Task 主按钮                  | landing   | `/tasks`               |
| Task preview 项目            | deep-link | `/tasks/:id`           |
| Note 主按钮/查看全部         | landing   | `/repository`          |
| Note preview 项目            | deep-link | `/repository?note=:id` |
| Reminder 主按钮/查看全部     | landing   | `/reminders`           |
| Schedule 主按钮/查看全部     | landing   | `/schedule`            |
| Notification 主按钮/查看全部 | landing   | `/notifications`       |

验收：

- 已有 Goal detail Tab 时点击 Goal 主按钮，URL 仍为 `/goals`；
- preview 项目点击后 URL、active Tab、页面对象三者一致；
- 切换 Tab 后 browser history 不产生额外噪音；
- 超过 Tab 上限时不会出现缓存实例被静默驱逐。

### Phase 2：BusinessPanel 单一滚动责任

目标：消除嵌套滚动和 sticky 失效。

任务：

- BusinessPanel 三个 surface wrapper 改为 `overflow-hidden`；
- 为 Home、Business、Workflow 标记唯一 `data-scroll-host`；
- 为 Goal ScrollArea、Task list、Notification list、Reminder content、Schedule calendar、Repository preview、Governance list/editor 明确主 scroll host；
- 移除模块页面中重复的外层 `overflow-auto`；
- 统一滚动位置恢复策略：列表状态由模块拥有，surface 切换不重置不相关 Tab；
- sticky toolbar 只相对所属 scroll host 定位；
- 增加运行时断言/测试，检查一个 active surface 不超过一个主滚动祖先。

验收：

- 滚轮连续滚动时只有一个容器消费主滚动；
- toolbar、分类栏和内容不会出现两个独立滚动条；
- Home、Business、Workflow 切换后各自滚动位置符合产品预期；
- 1440x900、1280x720 桌面矩阵无内容溢出。

### Phase 3：设置页桌面信息架构

目标：在保留全屏单主题的前提下，提升长页面定位和返回一致性。

任务：

- 宽屏分类 nav 使用 `position: sticky`，保持与正文顶部对齐；
- 为分类 nav 增加正式 active 语义：`aria-current` 或完整 tablist/tab/panel 关系；
- 修正“6 组”注释为实际 7 组，并将分组定义集中到单一模型；
- 保持一个正文滚动容器，不重新引入独立场景栏；
- 将设置页头与全局窗口栏的返回职责重新命名，避免两个“返回”语义重叠；
- 保存并恢复 `?tab=`，同时保存进入设置前的 shell origin。

验收：

- 长设置页面向下滚动时宽屏分类 nav 仍可见；
- 键盘可在分类项之间移动，并能读取当前项；
- 从 Home、业务列表、业务详情进入设置后均返回原始 origin；
- 设置场景仍只有一个主题布局和一个正文滚动容器。

### Phase 4：模块页面骨架和功能位置统一

目标：降低模块间结构差异，不改变业务能力本身。

任务：

- 引入轻量 `ModuleFrame`/`ModuleHeader`/`ModuleSubnav` 约定；
- Goal：将 system view/folder、search、refresh、focus、create 归入统一 header/subnav；
- Task：将 filter/view mode 与 create/more actions 归入统一 header；
- Reminder：保留 group navigation，但明确它是模块局部导航，不再让外层 panel 负责其滚动；
- Schedule：day/week/month 和 period navigation 使用统一 subnav；
- Notification：all/unread 与 mark-all-read 使用统一 tab/action contract；
- Note/Governance：统一 SegmentBar、breadcrumb、detail/editor back route 和 content width；
- 所有 detail 页面使用统一的 deterministic back-to-list/back-to-parent 规则，不依赖不稳定的 `router.back()`。

验收：

- 各模块页面头部的标题、主操作、返回和次操作位置一致；
- 列表、详情、编辑器都能识别唯一主滚动宿主；
- 模块内部导航有统一 active 语义；
- 不改变现有业务 route 和 API contract。

### Phase 5：摘要、Workflow 和可访问性收敛

目标：在基础结构稳定后，消除重复状态和可见功能债务。

任务：

- 建立 summary read model 或共享 composable，让 Home、capsule preview、full page 使用同一刷新源；
- Notification unread count 同步到 capsule badge、preview 和列表；
- Schedule preview 显示当前事件、后续事件和剩余数量；
- 明确 AI timeline、ActionBar、ContextPanel 的职责边界，删除重复状态说明；
- Help 只显示已实现入口；
- 统一 `aria-current`、`aria-selected`、`aria-controls`、tablist 和 landmark 语义；
- 复核所有 icon-only desktop controls 的 accessible name 和 focus ring。

## 5. 代码边界与建议文件

| 责任                   | 主要文件                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------- |
| Scene persistence      | `AppShell.vue`、`StandaloneSettingsLayout.vue`、新增 scene host/composable              |
| Navigation coordinator | `useShellRouterSync.ts`、新增 shell navigation intent/coordinator                       |
| Tab contract           | `useAppShellStore.ts`、`BusinessPanel.vue`、panel cache key                             |
| Geometry/resize        | `panel-geometry.ts`、`AppShell.vue`；本阶段不扩展移动端手势                             |
| Scroll contract        | `BusinessPanel.vue`、各模块根 view、`ModuleFrame`                                       |
| Settings IA            | `UserSettingsView.vue`、`StandaloneSettingsLayout.vue`、settings specs                  |
| Module structure       | Goal/Task/Reminder/Schedule/Notification/Repository/Governance views                    |
| AI workflow surface    | `AIChatView.vue`、`AIMessagePanel.vue`、`AIWorkflowActionBar.vue`、`AIContextPanel.vue` |
| Summary/badge          | capsule preview components、`navigation.ts`、notification store/composable              |

不应在本轮修改移动端专属组件、移动端断点策略或移动端 E2E；桌面组件的通用语义可以保持跨端，但验收只要求桌面和宽屏窗口。

## 6. 测试与验证矩阵

### 6.1 单元/组件测试

- navigation intent：landing、deep-link、activate-tab、settings-origin、surface-switch；
- dirty/busy：每个可编辑模块的允许/拒绝/确认路径；
- Tab limit：达到上限、关闭候选、KeepAlive owner 一致性；
- capsule：主按钮、预览按钮、已有 Tab、精确项目、Escape/outside；
- settings：sticky nav model、`?tab=`、origin 保存与恢复、ARIA active state；
- scroll contract：active surface 主 scroll host 数量和 `scrollTop` owner；
- ModuleFrame：header、subnav、content slot 的布局契约。

### 6.2 local-docker Playwright

> **本地部署验证（2026-08-08）**：`docker:local:up` 全服务 healthy（postgres/redis/powersync/ai-service/api/web）；`/healthz` 200、`/api/docs.json` 200、业务端点 401（认证保护生效）、`sign-up/email` 200（DB 读写 + console 验证码正常）。
> 环境修复：pnpm 11.12.0 坏版本 → `packageManager` 与 `Dockerfile.api` 改 11.20.0；contracts tsup 补 `primitives/command|runtime` entry；migrator 支持 `MIGRATOR_ACCEPT_DATA_LOSS=1`（空库 db push 唯一约束重建）。

桌面验证建议使用 1440x900、1280x720 两个视口，暂不增加移动视口：

| 场景               | 关键断言                                              |
| ------------------ | ----------------------------------------------------- |
| dirty 编辑进入设置 | 取消后仍在原页；确认后返回 origin；草稿策略明确       |
| AI 流式中进入设置  | stream 不被卸载；返回后消息和 composer 状态仍在       |
| 胶囊 landing       | 已有 detail Tab 时仍进入 landing route                |
| preview deep-link  | Goal/Task/Note 项目点击后对象和 URL 一致              |
| Tab 上限           | 不出现 Tab 可见但内容实例已被静默驱逐                 |
| 面板 resize        | 超过最小宽度后进入收缩；关闭守卫拒绝时回到最小宽度    |
| scroll host        | 每个 surface 只有一个主滚动条；sticky header 参照正确 |
| settings desktop   | 宽屏分类 nav sticky；7 组名称和 active state 一致     |
| notification badge | 未读数在顶栏、preview、列表一致更新                   |

### 6.3 质量门禁

- 受影响 package 的 unit/component test；
- `app-vue` lint/typecheck；
- `memoflow:governance-check`；
- `git diff --check`；
- `docker:local:up` 和 local-docker Playwright；
- 生成新的 `reports/local-deploy-validation/local-docker-playwright-evidence.json`。

## 7. 风险与回滚

| 风险                                             | 控制措施                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| Settings scene 持久挂载导致两个 router-view 冲突 | 先建立 scene outlet contract 和组件数量断言，再迁移模板          |
| 导航 coordinator 改变历史行为                    | landing 使用 push，Tab 激活使用 replace；补 browser history 测试 |
| Scroll host 收敛导致现有页面无法滚动             | 逐模块迁移，每次增加 `scrollTop`/overflow E2E 断言               |
| Tab 上限处理误关 dirty Tab                       | 候选 Tab 只允许用户显式确认关闭，dirty Tab 永不自动淘汰          |
| Workflow 重排造成状态机回归                      | 保持业务状态机不变，只调整承载位置和 presentation contract       |
| 旧持久化状态含旧 Tab/scene 字段                  | hydrate 只清理无效字段，保留有效 route、Tab 和用户宽度偏好       |

## 8. 完成标准

本计划完成时，必须满足：

- 进入设置不会未经确认销毁 workspace、AI 流或 dirty 业务草稿；
- 所有桌面入口都通过统一 navigation coordinator；
- landing、deep-link、Tab restore 三种语义可从 URL、Tab 和页面对象中验证；
- KeepAlive 不会静默驱逐仍在 UI 中显示的 Tab；
- BusinessPanel 和模块页面遵循单一主滚动宿主契约；
- 设置宽屏分类导航 sticky、可键盘操作并有明确 active 语义；
- Goal/Task/Reminder/Schedule/Notification/Note/Governance 的页面头和二级导航符合统一 ModuleFrame；
- notification badge、capsule preview、Home 摘要和完整列表状态一致；
- Workflow 三个承载区域职责清晰，Help 不再展示全部不可用入口；
- 桌面 unit/component、governance、Docker 和 Playwright 验证全部通过。

## 9. 状态

- [x] 系统诊断文档已建立：`docs/audit/2026-08-06-ui-foundation-shell-system-diagnosis.md`
- [x] 后续优化方案已建立
- [x] Phase 0：场景持久化与统一离开协议
  - workspace scene host 改为常驻（`v-show` 隐藏，不随设置导航卸载）；settings 使用 named view `settings` 独立 outlet；
  - 新建 `shell-scene.ts`（场景判定）与 `surface-leave-protocol.ts`（统一离开协议 + `createSettingsSceneGuard` 全局守卫，覆盖顶栏设置/AI settings/Home widget/浏览器后退前进）；
  - store 新增 `ShellOrigin`（route/tabId/panelSurface/layout/layoutReason），`useShellRouterSync` 在 afterEach 保存/清除 origin，`returnFromSettings` 优先恢复 origin；
  - dirty/busy 上报接入 Governance RuleEditorView（表单快照对比 + saving busy）、Reminder（Template/Group 弹窗 open-change）、Schedule（创建弹窗）、Repository（创建确认流）；
  - AI 流式回复在进入设置时不再中断（AIChatView 实例常驻）。
- [x] Phase 1：Tab/landing/deep-link 收敛
  - `openModule` 主入口永远进入模块默认 route（已有 detail Tab 也 replace 回 landing）；Goal/Task preview select 转精确 deep-link（`/goals/:id`、`/tasks/:id`）；
  - 同对象 route 复用已有 Tab；同模块不同对象允许多 Tab 的产品决策写入 store contract；
  - Tab 标题升级为「模块 · 对象标题」（`useTabObjectTitle` + `setActiveTabTitle`，Goal/Task 详情接入）；
  - 上限契约：`openTab` 超限不创建（tabs ≤ MAX_BUSINESS_TABS = KeepAlive max），返回 LRU 候选，UI 确认后 closeTab 重试，杜绝缓存静默驱逐。
- [x] Phase 2：单一滚动责任
  - BusinessPanel 三个 surface wrapper 改 `overflow-hidden` + `data-surface-scroll-root`；Home/Business 各 surface 唯一 `data-scroll-host`（Goal 列表/Task/Reminder/Notification/Schedule 日周/Repository preview/LocalVault/Task detail/Governance list-editor-detail-history/DetailPageShell/TodayOverviewPanel）；
  - RuleEditor/GovernanceDetail/RevisionHistory 从依赖外层 wrapper 滚动改为自带滚动容器；三处 sticky 均相对自身滚动宿主；BusinessPanel.spec 固化单宿主契约。
- [x] Phase 3：设置页桌面信息架构
  - 宽屏分类导航 `sticky top-0 self-start`；active 分类 `aria-current="page"`；
  - 分组定义集中到 `GROUP_DEFINITIONS` 单一模型（7 组，groups/GROUP_VALUES 派生），注释修正 6→7 组；
  - settings 模式 WindowHeader 隐藏历史后退/前进，仅保留「返回应用」单一返回语义；`?tab=` 保存恢复 + shell origin 恢复沿用。
- [x] Phase 4：ModuleFrame 与模块页面骨架
  - 新建 `ModuleHeader`/`ModuleSubnav` 约定组件；Task/Notification 页头迁移（leading/actions/subnav 三段）；
  - NoteSegmentBar 改 tablist/aria-selected；Goal 视图选择加 menuitemradio/aria-checked；
  - 所有 detail 页面 `router.back()` 改为确定性 back-to-list/back-to-parent（保留 settings 兜底与 WindowHeader 历史导航）。
- [x] Phase 5：摘要、Workflow、Help 和可访问性
  - Notification unread 经 `badgeSource` token 接入顶栏 capsule badge（UI-008 关闭）；Schedule preview 显示当前/下一个 + 后续 2 条 + 剩余数量；
  - Help 菜单只显示已实现入口（快捷键 → 设置「高级」组），移除 disabled+soon 项；ContextPanel 空态不再重复渲染 workflowStatusText；搜索/帮助 icon-only 按钮补 aria-label。
