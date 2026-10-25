# MemoFlow T2 定向风险收尾与阶段验收

> T2 只完成全量自动扫描、风险信号的人工处置与后续责任移交。未完成的 T3/T4/T5 真实行为验证不视为已通过。
> 基线为 WSL main@88d452338，本地 T1/T2 修改尚未 commit/push；未合并 PR #602，也未删除业务测试。

## 一、调整后的 T2 验收

| 检查项                                 | 结果      |
| -------------------------------------- | --------- |
| Inventory 唯一归属与 AST 静态扫描      | 1336/1336 |
| 本次定向风险候选人工复核               | 34/34     |
| 风险信号有明确处置                     | 46/46     |
| 保留现有模拟 DOM 组件测试              | 34        |
| 交给 T3 的 Browser 代表性验收候选      | 9         |
| 交给 T5 的专项 E2E 运行收据            | 3         |
| 业务风险矩阵已明确后续责任             | 11/11     |
| 累计代表性断言抽样（不再逐一读取剩余） | 433/1336  |
| 批准删除旧测试                         | 0         |

## 二、Issue 责任归属

- T3 [#605](https://github.com/BakerSean168/memoflow/issues/605)：合并成几条真正依赖 Chromium Tab、FocusTrap、Portal 和 Popover 语义的代表性场景，不将 43 个组件测试整体迁移。
- T4 [#606](https://github.com/BakerSean168/memoflow/issues/606)：Web E2E Worker 认证预备、会话缓存和每个 Test 独立业务数据；保留真实登录/注册专项。
- T4 [#607](https://github.com/BakerSean168/memoflow/issues/607)：PanelErrorBoundary 恢复草稿/实例保持的直接断言。
- PR [#602](https://github.com/BakerSean168/memoflow/pull/602)：63 个删除候选需先获得等价替代证据，不能直接整包删除。
- T5 [#608](https://github.com/BakerSean168/memoflow/issues/608)：三项特殊 E2E 真实门禁责任与 11 个高风险场景的目标 SHA Run/Release 证据。

## 三、11 个业务风险场景

| 场景                 | 后续 Issue | 仍需验证的证据                                                                                |
| -------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| AUTH-LOGIN           | #606, #608 | 实际注册/登录和权限拒绝的覆盖边界须由 Auth 领域 UI + API 验证，不因 Worker Session 优化跳过。 |
| GOAL-DRAFT           | #605, #607 | 草稿关闭/恢复/重试时的实例身份及浏览器导航需行为回归；PanelErrorBoundary 单独补断言。         |
| TASK-RECURRENCE-A11Y | #605       | 在真实 Browser 中从聚焦 Tab、Enter/Space 到实际选中周期完整动作验证，而非仅检查 ARIA。        |
| WEB-DESKTOP-SYNC     | #608       | Specialized Web/Desktop 同步双端实际运行收据、阶段归属与账户状态隔离。                        |
| AI-APPROVAL          | #608       | 实用 Provider / Tool Approval 端到端与 Mocked UI 分开，不强制所有 PR 调用收费 Provider。      |
| DESKTOP-IPC          | #608       | 沿用现有 Windows Release Installed E2E；补精确 SHA 运行回执并核实授权边界，不重复创建 CI。    |
| DESKTOP-UPDATE       | #608       | Installed Windows/Desktop 的下载/签名/升级/回滚执行回执，不以 Mock Updater 单测替代。         |
| DATA-MIGRATION       | #608       | 完整旧版 Postgres DB 至当前 Schema 的真实迁移和恢复演练，区别于 Mock SQL 生成测试。           |
| OWNER-ISOLATION      | #606, #608 | 两身份/多表 DB 权限拒绝必须实际执行，认证 Fixture 不能导致跨用例数据污染。                    |
| VISUAL-LAYOUT        | #605, #608 | 保留代表性真实 Browser Visual Matrix，核对 PR/Nightly 阶段和实际截图证据。                    |
| AI-EVAL-QUALITY      | #608       | Recorded Replay 与真实 Provider 质量评测明确区分执行阶段、费用准入和可重复结果。              |

## 四、46 个静态风险候选的具体处置

> 静态信号仍记录在原审查器中，不能把已经移交的验证缺口称为已修复。

| 文件                                                                                           | T2 判定                                | 后续 Issue   |
| ---------------------------------------------------------------------------------------------- | -------------------------------------- | ------------ |
| `apps/web/e2e/sync/goal-sync-regression.spec.ts`                                               | 保留专项 E2E，由 T5 核实实际执行       | #608         |
| `apps/desktop/e2e/authentication/desktop-auth-flow.spec.mts`                                   | 保留专项 E2E，由 T5 核实实际执行       | #608         |
| `apps/desktop/e2e/packaged-runtime/packaged-runtime.spec.ts`                                   | 保留专项 E2E，由 T5 核实实际执行       | #608         |
| `packages/app-vue/src/modules/goal/components/dialogs/GoalDialog.spec.ts`                      | 保留旧测试，仅需 T3 真实浏览器代表场景 | #605         |
| `apps/desktop/src/renderer/focus-window/FocusWindowApp.spec.ts`                                | 保持原组件执行器                       | 无需额外迁移 |
| `apps/desktop/src/renderer/intervention-window/InterventionWindowApp.spec.ts`                  | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/layouts/shell/AppShell.spec.ts`                                          | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/layouts/shell/BusinessPanel.spec.ts`                                     | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/layouts/shell/ConversationSidebar.spec.ts`                               | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/layouts/shell/ManageAccountsDialog.spec.ts`                              | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/layouts/shell/ModuleCapsule.spec.ts`                                     | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/layouts/shell/notificationCapsulePreview.spec.ts`                        | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/modules/ai/components/AIComposerControls.spec.ts`                        | 保留旧测试，仅需 T3 真实浏览器代表场景 | #605         |
| `packages/app-vue/src/modules/ai/components/AIFooterComposer.spec.ts`                          | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/modules/goal/components/dialogs/GoalKeyResultInspectDialog.spec.ts`      | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/modules/goal/components/dialogs/GoalRecordDialog.spec.ts`                | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/modules/goal/components/GoalKeyResultDirectControls.spec.ts`             | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/modules/goal/components/GoalRecordComposerSurface.spec.ts`               | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/modules/goal/views/GoalDeepLinks.characterization.spec.ts`               | 保留旧测试，仅需 T3 真实浏览器代表场景 | #605         |
| `packages/app-vue/src/modules/goal/views/GoalDetailView.spec.ts`                               | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/modules/goal/views/GoalModuleLayout.spec.ts`                             | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/modules/repository/components/DocumentPresentationPrimitives.spec.ts`    | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/modules/repository/views/LocalVaultWorkspaceView.spec.ts`                | 保留旧测试，仅需 T3 真实浏览器代表场景 | #605         |
| `packages/app-vue/src/modules/routine/components/RoutineEditorDialog.spec.ts`                  | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/modules/routine/components/RoutineProfileDialog.spec.ts`                 | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/modules/schedule/components/calendar-event-semantics.spec.ts`            | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/modules/setting/components/AISettings.spec.ts`                           | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/modules/setting/components/KeyboardSettings.spec.ts`                     | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/modules/task/components/dialogs/QuickTaskDialog.spec.ts`                 | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/modules/task/components/dialogs/TaskCompletionMeasurementDialog.spec.ts` | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/modules/task/components/dialogs/TaskPlanDialog.spec.ts`                  | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/modules/task/components/TaskPlanForm/sections/BasicInfoSection.spec.ts`  | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/modules/task/views/TaskManagementView.runtime.spec.ts`                   | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/shared/components/KeyboardHelp.spec.ts`                                  | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/shared/components/ProductDatePicker.spec.ts`                             | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/shared/components/ProductDateTimePicker.spec.ts`                         | 保留旧测试，仅需 T3 真实浏览器代表场景 | #605         |
| `packages/app-vue/src/shared/components/ProductDialogShell.spec.ts`                            | 保留旧测试，仅需 T3 真实浏览器代表场景 | #605         |
| `packages/app-vue/src/shared/components/ProductEditorFrame.spec.ts`                            | 保留旧测试，仅需 T3 真实浏览器代表场景 | #605         |
| `packages/app-vue/src/shared/components/ProductPropertyChip.spec.ts`                           | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/shared/components/ProductSingleSelectFilter.spec.ts`                     | 保留旧测试，仅需 T3 真实浏览器代表场景 | #605         |
| `packages/app-vue/src/shared/components/ProductTimeframePicker.spec.ts`                        | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/shared/components/ProductTimePicker.spec.ts`                             | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/shared/components/ProductTimeZoneSelector.spec.ts`                       | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/shared/keyboard/runtime.spec.ts`                                         | 保持原组件执行器                       | 无需额外迁移 |
| `packages/app-vue/src/shared/reka-primitives.contract.spec.ts`                                 | 保留旧测试，仅需 T3 真实浏览器代表场景 | #605         |
| `packages/app-vue/src/views/DesktopProfileAccessView.spec.ts`                                  | 保持原组件执行器                       | 无需额外迁移 |

## 五、交付边界与再检查

- 每项风险都在当前 SHA 对应的人工审查记录中有断言或执行阶段的证据。源码/清单变化、产生新静态风险、缺少 Issue 责任等都会使 T2 closeout check 失败。
- **未完成**：生产故障修复、真实 Chrome 键盘试验、Web/Desktop 数据同步成功 Run、Windows 安装版与真实 Provider 测试、旧测试安全退休。它们是后续 Issue 的独立验收。
- T2 不修改原 CI Workflow、Nx Primary Suite 归属，不扩大 skip，也不删除原测试。

校验：

    node tools/test-system-v2/t2-closeout.mjs --check
    node tools/test-system-v2/t2-closeout.mjs --write-report
