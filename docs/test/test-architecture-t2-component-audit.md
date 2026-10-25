---
tags:
  - testing
  - architecture
  - quality
description: MemoFlow T2 Web/Auth、Desktop Renderer 和 App-Vue Shell 组件测试的代表性断言与真实执行证据
created: 2026-10-24T00:00:00+08:00
updated: 2026-10-24T00:00:00+08:00
---

# T2：组件与 UI Shell 行为审查（2026-10-24）

> 审查基线：WSL `main@88d452338`。单 worktree；没有提交、删除旧测试或改动 GitHub CI。
> 单文件审查记录与 SHA-256 在 `tools/test-system-v2/architecture-review-registry.json`。
> 本文只记录有人工代表性断言核对的测试，不把批量 AST 扫描或模拟 DOM 误写为真实浏览器证据。

## 审查与执行

本批新增审查 **29** 个 Primary Test 文件，累计 **399/1,336**；余 **937** 个尚未获得同级别的代表性断言审查记录。

| 组别                                                              | 本批文件 | 独立 Vitest 用例 | 执行结果         |
| ----------------------------------------------------------------- | -------: | ---------------: | ---------------- |
| Web Auth 组件（Device Code / Consent / OAuth Popup / Cloud Auth） |        4 |               23 | 23/23 PASS       |
| Desktop Renderer（通知、Focus 和 Intervention Window）            |        3 |                7 | 7/7 PASS         |
| App-Vue Shared/Shell/Previews（含 Router Sync、账户管理、导入等） |       22 |              130 | 130/130 PASS     |
| **合计**                                                          |   **29** |          **160** | **160/160 PASS** |

**确认的执行边界**：29 个组件文件都使用 Vitest + Vue Test Utils / Happy DOM；Web Auth Service、桌面 `electronAPI`、Profile Bridge、Update Service 等服务在测试中由专用 Fake/Mock 注入。测试能证明组件消息、显示状态、合成键盘事件、草稿组件和服务调用，但不能据此宣称真实 OAuth/设备轮询、Electron 多进程、原生窗口或浏览器 Reka 焦点导航已经经过 E2E。

- **保持差异化的真实验证**：Device Authorization / OAuth Consent 各有真实协议与浏览器测试；Desktop Focus/Intervention 对 Main 的 Projection/Command 是本地替身；Shell Capsule / Menu 键盘行为必须与真实浏览器现有 E2E 比较，不能把 Happy DOM Focus 模拟当等价覆盖。
- **已证明的组件行为**：跨 Profile 管理对用户 ID 的操作边界、Cloud Connection 未决授权只恢复一次、Desktop Update 的「推送 Ready 早于快照读取」时序、Capsule Owner Query 缓存不重复网络读取、Panel Error Fallback 与 Retry 显示。
- **非退休结论**：本批 29 个文件均为 **retain**；没有把组件用例替换成 Playwright 也没有删除原 E2E。

## 新确认的待补测点：Panel Error Recovery

`packages/app-vue/src/layouts/shell/PanelErrorBoundary.spec.ts` 中用例名声称「retry clears the error without unmounting the routed draft subtree」。
目前断言覆盖错误态显示、重试后节点重新可见，以及 `contentKey` 自增，却**没有**用子组件的 `onMounted/onUnmounted` 计数或实际输入 `ref` 验证 Retry 前后的同一草稿组件与草稿数据不被销毁。

生产 `PanelErrorBoundary.vue` 当前使用 `v-show` 隐藏内容，按代码实现看有保留子树的意图；但**这个测试并未直接约束该安全属性**。
处理建议：在组件测试中新增有状态子组件并断言 Retry 前后状态与实例引用不变，再用真实浏览器抽验跨面板错误/恢复的焦点和草稿。
这是「测试断言覆盖缺口」，并非已复现的生产崩溃。

## 治理判断

本批与之前 370 份审查累加后，主要分类和执行器归属仍保持不变：Component 是 **Test Type**，`simulated-dom` 是 **Execution Environment**，`unit` 是当前 Vue 组件的 **Primary Collector**。不把「Component」重新命名成 `smoke` 或 `e2e`，也不声称 PR/Nightly 车道已经执行相同的跨层断言。

风险矩阵的 11 项高优先级行为缺口以及 PR #602 拟删除 63 个测试的替代等价责任均未放行。T2 累计仍为 **0 项批准安全退休**。下一批优先检查 AI Composer、Goal/Task Editor、Notification 和 Settings 组件中合成键盘事件与服务 Mock 是否掩盖了交互或真实持久化缺口。
