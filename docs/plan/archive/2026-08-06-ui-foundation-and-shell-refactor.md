---
tags:
  - plan
  - active
  - ui
  - shell
description: 基础 UI 布局、入口交互与设置页结构重构方案
created: 2026-08-06T00:00:00Z
updated: 2026-08-06T00:00:00Z
---

> ✅ 已归档 2026-08-08：实现与 local-docker 验证完成（三栏最小宽度/拖拽收缩、compound capsule、设置页扁平化；产品旅程 7/7）。

# 基础 UI 与 Shell 重构

## 目标

在不引入视觉风格大改的前提下，修复 MemoFlow 桌面壳的基础布局和信息架构问题：恢复全局模块入口及摘要预览，移除设置页遗留场景栏，重写三栏宽度边界并支持拖拽越过最小宽度后平滑收缩。所有收缩均为可逆的 UI 状态变化，不卸载业务实例，不丢失 Tab、草稿、流式状态或用户宽度偏好。

## 已确认的产品决策

### 顶栏入口

2026-08-02 提交 `dcb275ebb` 删除胶囊的原始判断是：顶部胶囊与 BusinessPanel Tab 被视为并行导航，桌面宽度下造成拥挤并重复表达当前上下文。当前 Workspace launcher 只有回到 Home 的行为，无法替代 Goal、Task、Schedule、Notification 等稳定入口，因此恢复入口，但明确职责：顶部胶囊是全局模块启动器和摘要；BusinessPanel Tab 是当前已打开业务上下文的导航。

每个入口采用 compound capsule：左侧主按钮负责直接跳转/打开模块，右侧预览按钮负责摘要。预览按钮使用受控 Popover 语义（复用现有 HoverCard/Popover primitive）：鼠标悬停和键盘聚焦可预览，点击可固定，触屏点击打开，Escape 或外部点击关闭；浮层内的列表项和“查看全部”可继续交互。仅有展示内容的入口可由 HoverCard 实现，包含链接、按钮或表单的入口必须使用 Popover，以保证焦点、外部点击和触屏语义一致。

恢复 Schedule 入口，复用 `useCalendarView` 已有的当日日程摘要解析；Notification 入口复用现有未读摘要组件。Goal、Task、Note、Reminder 继续复用现有 capsule preview 组件。宽度不足时主入口自动切换为图标型（保留标题和可访问名称），utility 入口与窗控保持固定，不遮挡主导航。

### 设置页

设置是独立全屏场景，保留“返回应用 + 设置标题”的页头和一个设置分类导航栏，移除 `StandaloneSettingsLayout` 外层 260px 场景栏。页面只保留一个内容滚动容器；分类栏在宽屏固定、窄屏转为可访问的选择控件/横向导航。响应式判断基于设置内容容器宽度，而非整个窗口宽度，移动端返回按钮不能遮挡标题。

### 三栏几何和收缩

AI、业务面板和侧栏只保留最小可用宽度：AI `320px`、业务面板 `520px`、侧栏 `200px`。删除产品级固定最大宽度；`panelMax` 仍可由当前容器减去其它区域的最小宽度动态推导，这只是几何可行域，不是产品最大宽度。用户可以在大窗口中继续把任一区域拖宽。

拖拽或键盘调整越过区域最小宽度的吸附阈值时，进入与点击关闭相同的收缩状态：侧栏设置 `sidebarCollapsed`，业务面板调用现有关闭守卫后设置 `rightPanelOpen=false`。收缩使用短的宽度/网格过渡动画；跟手拖拽阶段禁用过渡，触发收缩后恢复过渡。DOM 和 KeepAlive 实例继续保留，重新打开时恢复最近一次有效用户宽度。脏表单或忙状态关闭守卫拒绝收缩时，宽度回到最小可用值并保留当前内容。

## 实施切片

1. **几何与状态机**：移除 `BUSINESS_MAX`、`SIDEBAR_MAX` 以及 store 内固定最大 clamp；增加区域最小值、动态合法边界、收缩吸附阈值和可逆宽度记忆；补齐 pointer、keyboard、viewport 下的 split/focus/collapsed 转移单测。
2. **壳层拖拽动画**：在 `AppShell` 中统一侧栏和业务面板 resize controller，拖拽期间锁定过渡，越过阈值触发收缩，处理脏/忙关闭守卫、pointer capture、Escape 取消和 reduced-motion。
3. **顶栏 compound capsules**：恢复 Goal/Task/Note/Reminder/Notification/Schedule 入口；主按钮与预览按钮分离，统一受控 Popover 交互、键盘语义、焦点回收和窄屏 launcher；新增 Schedule preview 和必要测试，清理“胶囊不存在”的过时断言。
4. **设置页扁平化**：移除 `StandaloneSettingsLayout` 场景栏，重排页头和正文，合并滚动容器，改用内容容器宽度适配；更新设置组件测试和 Web/Desktop E2E。
5. **入口与 surface 一致性**：建立模块入口注册表，确保胶囊、命令面板、Home launcher、Tab 使用同一模块元数据；检查 BusinessPanel/module surface 的 overflow 和固定高度，避免嵌套滚动。
6. **文档与治理**：更新 `docs/product/workspace-ui.md`、相关 ADR 和历史诊断计划的决策状态；运行治理检查、shell/settings 单测、Nx lint/typecheck 及受影响 E2E。

## 验收标准

- 在宽窗口中，AI/业务/侧栏均可超过旧 960/400px 上限继续扩展，且不会突破其它区域最小宽度。
- 拖到最小值后继续拖动，侧栏或业务面板以动画进入收缩；再次打开恢复宽度和原有业务状态。
- 关闭业务面板时脏表单/忙状态守卫仍生效；被拒绝时不丢内容。
- Goal/Task/Schedule/Notification 的主按钮可跳转，预览按钮可 hover/focus/click/touch 打开，Escape/外部点击关闭，浮层内操作可用。
- 设置页无 `settings-scene-rail`，只有一个设置主题布局和单一滚动容器，窄屏标题和返回按钮不重叠。
- 受影响单测、lint/typecheck、治理检查通过；E2E 断言与新入口/收缩语义一致。

## 风险与回滚

- 旧版持久化状态可能包含已废弃最大宽度和场景栏字段；hydrate 时只清理无效字段，不删除业务 Tab。
- Popover 与 HoverCard primitive 的事件语义不能叠加造成双重打开；交互式浮层统一走 Popover。
- 拖拽收缩必须避免误触发关闭；阈值、Escape 取消和关闭守卫均需单测覆盖。
- 如单个模块 preview 数据未就绪，保留入口并显示空状态，不阻塞其它模块恢复。

## 后续观察项

本轮只处理基础布局、入口职责和几何状态机；以下问题已记录，避免下一轮重新发现：

1. **入口元数据与预览渲染继续收敛**：当前入口路由已由 `MODULE_CAPSULES_KEY` 统一，但各模块预览仍由 `AppShell` 的具名 slot 装配。后续可增加 preview factory/能力字段，让宿主覆写入口时同时声明摘要组件、角标来源和数据加载策略。
2. **窄屏入口的优先级策略**：本轮 1000px 以下切换图标型入口，utility 与窗控固定；真实 Electron 最小窗口矩阵运行后，再决定是否需要“更多”菜单以及各入口的隐藏顺序。
3. **拖拽状态的可感知性**：当前拖拽阶段禁用过渡、越过阈值后收缩。下一轮可在把手上补充接近阈值的视觉/无障碍状态，但不应把阈值提示变成持续性装饰。
4. **设置分类导航语义**：当前宽/窄模式已按内容容器切换。真实移动端运行后复核横向 tabs 的滚动、当前项露出和长标题截断，必要时改为原生 select 或菜单。
5. **预览数据生命周期**：各摘要组件已有空态、错误态和局部缓存；后续结合真实 API 延迟检查 hover 预览是否需要取消未完成请求，以及通知已读操作后角标是否即时同步。
6. **单一滚动责任**：设置页已合并为单一正文滚动容器，业务面板内部仍有 surface 级滚动。后续在长列表、工作流和窄面板矩阵中检查是否出现嵌套滚动抢占。

## 状态

本轮实现与 local-docker 产品旅程验证均已完成。Docker 全栈使用当前 dirty revision 构建，Web、API、AI Service 与 PowerSync 均 healthy，migrator 正常以 `Exited (0)` 完成数据库初始化；Playwright Phase A–E 共 7 条产品旅程全部通过。Electron 专用布局矩阵不属于本次 local-docker 车道，留待后续真实桌面运行时复核。

- [x] 方案文档与 active 索引建立
- [x] 几何与拖拽收缩
- [x] 顶栏入口与 Schedule preview
- [x] 设置页扁平化
- [x] 文档、测试与治理验证
- [x] local-docker 全栈与 Playwright 产品旅程验证

## 验证记录

- Nx affected tests：159 files / 830 tests 通过；Home 今日任务激活刷新与 dashboard 投影聚焦测试 2 files / 5 tests 通过。
- `app-vue` 直接 `vue-tsc` 通过；Nx `app-vue:lint` 通过（仅仓库既有 warnings）。
- `memoflow:governance-check` 与 `git diff --check` 通过，测试 inventory 已同步。
- 仓库 `validate-local-deploy` 标准报告为 `pass` / `ready for PR: yes`；affected lint、typecheck、test 与 `docker:local:up` 均以 exit 0 完成。
- local-docker 端口使用 Web `58080`、API `53080`、AI `58100`、PowerSync `58081`、PostgreSQL `55432`、Redis `56379`；核心服务探针全部通过。
- migrator 为 `Exited (0)`，日志包含 `Database initialization completed`。
- `web:e2e:local-docker`：7/7 通过，覆盖 Goal→Task 闭环、任务投影、面板偏好/草稿、键盘可访问性、工作流与移动端面板交互；证据位于 `reports/local-deploy-validation/local-docker-playwright-evidence.json`。
- E2E 发现并修复 Home surface KeepAlive 后重新激活不刷新今日任务的问题；`DailyTodoWidget` 现在仅在 Home 激活时加载，并在 `false → true` 时刷新实例与模板。
- local-docker Playwright 显式使用 `Asia/Shanghai`，与 API/Compose 产品时区一致，避免全天任务在浏览器 UTC 日期边界下被错误排除。
