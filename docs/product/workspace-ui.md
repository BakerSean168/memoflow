---
tags:
  - product
  - ui
  - workspace
  - desktop
description: MemoFlow 桌面工作区的信息架构、分栏几何与 UI primitive 当前契约
created: 2026-08-01T00:00:00+08:00
updated: 2026-09-29T13:35:00+08:00
---

# 桌面工作区与 UI 说明

## 产品结构

桌面工作区采用“会话侧栏 + AI 对话 + 业务工作区”的三栏模型。顶部保留全局模块复合胶囊：主按钮直接进入 Goal、Task、Note、Reminder、Schedule、Notification，右侧预览按钮展示摘要；业务工作区 Tab 只表达当前已打开的业务上下文，不与全局入口争夺职责。

AI 对话是可收窄的协作列，右侧业务工作区承载 Goal、Task、Schedule、Reminder、Repository 等需要较大编辑面积的内容。业务区在常见桌面尺寸下默认占主导，而不是 AI 区的附属抽屉。

2026-09-29 Product vNext 进一步确定：AI 不长期维护第二套 Goal/Task/Knowledge 编辑面。AI 通过 typed Surface Orchestrator 打开并操控右侧 BusinessPanel 中的 owner-native surface；Mastra internal draft/revision/retry identity 继续保留在 runtime 内部。当前独立 `workflow` surface 在 native parity 完成前保留，之后作为 retirement candidate 评估。详见 ADR-112 与 `native-surface-orchestration-and-quick-surfaces.md`。

## 几何契约

- AI 列硬下限：320 CSS px。
- 业务工作区硬下限：520 CSS px，必须大于 AI 下限。
- 会话侧栏硬下限：200 CSS px。
- 不存在产品级固定最大宽度；上限只由当前容器中其它区域的硬下限动态推导。
- 同时可容纳两列时，业务区默认占可用分栏宽度的 64%。
- 1280×900、侧栏展开的参考状态目标为 AI 340–390px、业务区 650–700px；当前矩阵实测约 367/653px。
- 用户拖动后的宽度只有在明确发生用户 resize 后才持久化；旧版本遗留的像素值不覆盖新的响应式默认值。
- 高缩放或窄视口无法满足两列下限时，先临时收起会话侧栏；仍无法满足时进入 AI 或业务聚焦态。自动收起不改写用户的侧栏偏好，空间恢复后自动还原。
- 拖动侧栏或业务面板越过最小值吸附阈值时，执行对应的收缩动作并播放短过渡；再次打开恢复最近一次有效用户宽度。关闭守卫拒绝时回到最小可用宽度，不丢失脏表单或忙状态。

设置是独立全屏场景，只有页头（返回应用 + 设置标题）和设置分类导航；遗留的场景栏已移除，正文使用单一滚动容器，窄/宽判断依据设置内容容器宽度。

AI 与业务容器分别使用 container query 适应自身宽度。业务操作在 520px 宽时仍需可达，AI 欢迎页、消息和 composer 在 320px 宽时仍需保持主要动作完整。

## 交互与无障碍契约

- Tab、关闭按钮与面板操作热区分别不小于 36px/32px。
- 图标按钮、可点击 Badge、自定义 Tab 和拖拽把手必须具有键盘语义、可见焦点和辅助名称。
- resize handle 使用 separator 语义并暴露当前值；动画尊重 reduced-motion。
- routed business content 的错误边界不得卸载并清空位于壳层之上的 Goal/Task 草稿。

## UI primitive 边界

Vue 业务代码只从 `@memoflow/ui-vue-shadcn` 消费 primitive。该包以 `reka-ui@2.10.1` 作为唯一实现并归一 model/open/focus/portal 语义；业务包不直接 import vendor。治理门禁要求 `radix-vue` 零依赖/零 import，以及 primitive 包外 `reka-ui` 零直接 import。

真实挂载 contract tests 覆盖 Select、Dialog、Dropdown、Popover 与 Tabs 的鼠标、键盘、动态选项、卸载和焦点恢复行为。

## 验证矩阵

Electron 实机矩阵覆盖 1024/1200/1280/1440 宽度，以及 125%/150% 缩放。截图证据位于 `reports/local-deploy-validation/product-review-2026-08-01/electron-layout-matrix/`。

长期决策见 [ADR-005](../architecture/adr/ADR-005-ui-package-multi-framework.md)；Goal/Task 一致性见 [ADR-038](../architecture/adr/ADR-038-goal-consistency-and-reliable-task-contributions.md)。
