# T3：关键键盘、焦点与浏览器历史验证

> **最新测试运行器（Issue #610）：** Storybook 已切换为 `@storybook/addon-vitest@10.6.3` + Vitest 4 Browser Mode，在真实 Chromium 中运行；旧 Jest Test Runner 已退休，当前 `ui-storybook:test:interaction` 正式执行 3 个 Story 文件、12 条交互用例。下文保留首次 T3 实施批次的历史记录（当时还使用旧 Runner），不代表最新执行状态。最新设计及 WSL 网络修复证据见 [Storybook Browser Mode 验收](./test-architecture-storybook-browser.md)。

> 本地实施：2026-10-24；MemoFlow WSL `/home/baker/projects/memoflow`，Git HEAD `88d452338`。当前全部 T1/T2/T3 修改均尚未 commit/push。Owner Issue：[#605](https://github.com/BakerSean168/memoflow/issues/605)。

## 目的与边界

T2 对 43 个模拟 DOM 键盘/焦点文件提出风险信号，其中大部分无需更换 Test Type 或测试运行器。T3 在**现有 Goal Reference Playwright Collector** 内补少量真实 Chromium 交互，不为所有组件重复增加独立 Browser 套件。

`packages/app-vue/src/shared/components/__stories__/BrowserInteractionFixture.vue` 挂载真实生产 Vue 组件，无替身化 Reka、真实 DOM 事件系统或键盘行为；`main.ts` 仍使用既有参考环境（Goal 业务服务是确定性 Service Double，不启动 API/DB/真实 Provider）。`goal-business-panel.spec.ts` 新增 8 条行为命名的 Playwright case，归于 `Browser component interactions` describe，原有两条 Goal Reference 测试不变。公共 fixture 同时被 Storybook 的六个 `play()` Stories 和 Playwright 原生测试复用。

### T3 浏览器场景（Chromium 153.0.8010.12）

| 核对边界                                        | 真实用户动作与断言                                                                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modal / ProductEditorFrame / ProductDialogShell | 真正的 `page.keyboard.press('Tab')` 和 `Shift+Tab`，焦点在输入/下一按钮之间切换，Escape 关闭并归还 Opener                                               |
| ProductDateTimePicker (Modal)                   | 连续 35 次 Tab、12 次 Shift+Tab 均不会逃逸 Portal Dialog；Escape 关闭并还焦                                                                             |
| 嵌套 Panel Picker                               | Picker 打开时业务 Editor 是 `inert`，Picker 可交互；Escape 不销毁 Editor 且归还打开 Picker 的按钮焦点                                                   |
| ProductSingleSelectFilter                       | Enter 原生打开 Menu/选择启用项，正确更新模型并将焦点归还下拉触发器；Escape 关闭菜单                                                                     |
| AIComposerControls                              | 真实 Popover 搜索、ArrowDown/Enter 选择可用模型，禁用实例行无法被聚焦/误选，查询状态保持                                                                |
| GoalDialog                                      | 对真实 Goal 创建表单输入未保存草稿，Escape 弹确认，取消保留原始草稿，确认丢弃不会创建 Goal                                                              |
| Task 周期 WeekdaySelector / MonthDaySelector    | Tab 导航 + Space/Enter 原生按钮激活，`aria-pressed` 与受控数组双向同步                                                                                  |
| Goal 深链接                                     | `createWebHistory('/t3-history')` 路由下，从 Goal 进入 KR Inspect 后执行真实 `page.goBack()` / `page.goForward()` / `page.reload()`，依然能重建业务详情 |

## 执行与证据

从仓库根目录：

```bash
cd apps/web
node ../../node_modules/@playwright/test/cli.js test --config playwright.goal-reference.config.ts goal-business-panel.spec.ts --grep 'Browser component interactions' --workers=1 --reporter=line
# 或保留既有两条 Goal Reference 验证一起跑：
node ../../node_modules/@playwright/test/cli.js test --config playwright.goal-reference.config.ts goal-business-panel.spec.ts --workers=1 --reporter=line
```

首次新增 5 条、增补 Goal / Task 后 7 条及最终 8 条 **均已在本地真实 Chromium 环境通过（8/8）**，禁止据此推断真实 Backend E2E 与 Live Provider 已通过。使用 `--grep 'Browser component interactions'` 与已有 `playwright.goal-reference.config.ts` 实际启动 Vite build/preview；不是 Vitest 模拟键盘回放。

本地审查的源码 SHA-256（迁移后）：

```text
main.ts                     38f114d958523f17d825dc9a7d1ef3cee62c495cd781e7bbf5df702b0a68e0a4
BrowserInteractionFixture.vue 646fb5dc8c234fe5d91024cdbbc69beaf56afecbccb6adeac07f2de86c2fcdd1
goal-business-panel.spec.ts 230bcd952a269f5af3ab04ba37dabc1bbc736c4189947d40e4a115f9b868800f
```

原有 `tools/test-system-v2/architecture-review-registry.json` 已重新复核 `goal-business-panel.spec.ts` 的行为断言并更新 SHA；旧 T2 风险处置未被新代码变更自动错误批准。运行 `node tools/test-system-v2/t2-closeout.mjs --check` 仍须通过。

## 不等价与后续

- 当前只证明**隔离生产组件 + 浏览器 DOM/Focus/Keyboard**，并没有启动真实云 Auth、数据库、PowerSync、Windows Electron 或第三方 AI Provider。
- Goal Browser History 采用生产 Goal Router 与真实 `createWebHistory`，但读写 Goal 事实来自可控 Service Doubles；真实 Goal 页面持久化闭环仍由 `apps/web/e2e/goal/goal-crud.spec.ts` 等已有 Web Flow E2E 承担。
- 本阶段没有修改 Playwright 主模式、GitHub Actions、CI required checks、Nx Primary Owner 或清理 43 个旧 Happy DOM 用例；真实执行何时进入 PR/Nightly 以及精确提交 SHA 收据由 T5 [#608](https://github.com/BakerSean168/memoflow/issues/608) 单独管理。
- 复用账号登录而不重复注册属于 T4 [#606](https://github.com/BakerSean168/memoflow/issues/606)；修改 `PanelErrorBoundary` 草稿保持断言属于 T4 [#607](https://github.com/BakerSean168/memoflow/issues/607)。

## 完整回归与已单独跟踪的稳定性风险

- 在实际 Chromium 153 上，包含原有 2 条与新增 8 条的完整业务 Reference Spec，使用 `--repeat-each=2 --workers=1` **连续 20/20 PASS（无 retry/skip）**。T2 Inventory 1,336、review 433 份/0 过期，Test System V2 **120/120 PASS**、Nx uncached Governance、Prettier/ESLint 与 `git diff --check` 均 PASS。
- 调查中曾发现 **原有** KR 编辑器自动滚动用例偶现 `scrollTop=0` 等待超时；单独 4 次运行 **4/4 PASS**，恢复干净测试和生产实现后完整 20/20 PASS。一次成功诊断看到 `scrollTo(top=416, behavior=auto)` 实际触发，但还不能证明失败时的具体时序根因。已建立独立 Issue [#609](https://github.com/BakerSean168/memoflow/issues/609)；**未删除旧测试、未放宽断言、未保留试探性双 rAF 修复**，不得宣称此偶现问题已修复。
- 基于参考测试专用 Vite Source Aliases 的临时局部 `vue-tsc` 检查被已有 App-Vue/Pinia `persist` 类型诊断阻断；没有将这次检查记为通过。生产组件的实际 Vite Build + Playwright 执行、ESLint 等独立验证已成功。

## Storybook 组件测试归属优化（本轮新增）

- Storybook 从 `10.6.0` 升级到已发布的稳定补丁版 `10.6.3`；`@storybook/test-runner` 升级到 `0.26.0` 解决新 Storybook 下的旧 Runner 兼容错误。
- `BrowserInteractionFixture.vue` 移动到 App-Vue 的 `__stories__` 目录，由 `BrowserInteraction.stories.ts` 描述 6 个可视化交互场景；原 GoalDialog/TaskPlanForm 6 条和新增 6 条统一纳入既有 `ui-storybook:test:interaction` 目标，**12/12 PASS**，无需新增 CI Workflow。
- Storybook `storybook/test` 的 `userEvent` 是 Testing Library 模拟路径；原 Playwright 验证保留真实 `page.keyboard.press` 的 `FocusTrap` 和菜单焦点恢复。实际观察到 Storybook 的 `userEvent.click` 对下拉菜单恢复焦点与 Playwright 不同，所以不把两种证据视为同一个 Oracle。
- **独立 Browser Mode 反例实测**：`vitest/browser` 在 Chromium 的 Playwright Provider 下执行 `userEvent.tab()`，键盘 `keydown.isTrusted === true`，焦点正确移到下一输入框，再执行 `Shift+Tab` 回到原输入框（1/1 PASS，临时探针已删除）。因此 Storybook 未来换到 Vitest Browser Mode 后并不需要凡事依赖独立 Playwright。
- `@storybook/addon-vitest` 10.6.3 的接入曾尝试两轮（完整 Storybook 索引和精简到 3 Story），实际因 Vite optimizer 初始化超时，**没有通过**。已移除插件、配置信息和未验证依赖，保持已认证的 Storybook Test Runner 目标；新版 Browser Addon 调优由 GitHub [#610](https://github.com/BakerSean168/memoflow/issues/610) 单独跟踪。**没有声称当前 Storybook UI 的 Vitest Addon Run Tests 可用。**
- 升级后正常 Storybook UI 可见 6 个新 Story；Storybook Build PASS。Storybook Test Runner 12/12 PASS；迁移后 Playwright 独立运行 8/8 PASS。原 Goal Editor 自动滚动偶发失败由 #609 跟踪，不因为本次重构被静默跳过或宣称修复。

详细对比见 [Storybook 浏览器组件测试分工](./test-architecture-storybook-browser.md)。
