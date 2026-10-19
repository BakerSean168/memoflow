---
tags:
  - analysis
  - governance
  - app-vue
  - source-locks
description: Issue #502 全量 app-vue source-lock 分类台账（A 保留 / C 迁 AST / D 行为测试 / B 删除）
created: 2026-10-19T00:00:00Z
updated: 2026-10-19T00:00:00Z
---

# app-vue source-lock 分类台账（Issue #502）

本台账逐条记录迁移前 372 个 source lock 的去向。迁移后保留 **60** 个文本锁（34 个 contract），新增 **334** 条 Vue SFC / TypeScript AST 结构规则；没有删除任何没有覆盖证据的锁。

## 分类汇总

| 类别 | 数量 | 含义 |
| --- | ---: | --- |
| A | 14 | 保留在 `tools/governance/app-vue-source-locks.json`（含完整保留 5 条与 Markdown 文档锁 9 条）。 |
| C | 295 | 迁移为 `tools/governance/app-vue-structure-rules.json` 中的 AST/类型结构规则。 |
| C+A | 58 | 结构部分迁为 AST 规则，仅把 AST 无法表达的 region/order/count/文本片段保留为带 `reason` 的残余锁。 |
| D | 5 | 由行为测试覆盖，同时保留 AST 规则作为防线。 |
| B | 0 | 无覆盖证据直接删除。 |
| **合计** | **372** | |

D 类证据：

- `clamp-dual:0` → `packages/app-vue/src/layouts/shell/clamp-dual.surface.spec.ts:13`
- `clamp-percentage-keep-boundary:0` → `packages/app-vue/src/modules/goal/utils/progress.spec.ts:9`
- `clamp-percentage-keep-boundary:2` → `packages/app-vue/src/modules/goal/utils/progress.spec.ts:20`
- `format-duration-keep-boundary:0` → `packages/app-vue/src/modules/task/utils/format-task-duration.spec.ts:5`
- `ProductEditorFrame:1` → `packages/app-vue/src/shared/components/ProductEditorFrame.spec.ts:114`

## 覆盖机制

- `tools/governance/lib/vue-source-ast.mjs` 把 `.vue` / `.ts` / `.tsx` 解析为模板元素、属性、class token、imports、exports、标识符、调用、类型引用、语句与表达式；注释和格式不再影响规则。
- `tools/governance/lib/app-vue-structure-rules.mjs` 校验并执行规则；同一文件在一次审计中只解析一次。
- `app-vue-source-lock-audit.mjs` 同时执行文本锁与结构规则，任一失败即退出非零。
- 文本锁 manifest 现在要求每个锁都有非空 `reason`；negative-only region 未命中时直接失败（`region did not match`），并有负向测试。

## 每个 contract 的分布

| Contract | 迁移前 | A | C | C+A | D | 结构规则 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| menu-labels-single-track | 3 | 0 | 3 | 0 | 0 | 3 |
| i18n-export | 1 | 0 | 1 | 0 | 0 | 1 |
| global-command-palette-shortcut-owner | 2 | 0 | 2 | 0 | 0 | 2 |
| get-importance-label-keep-boundary | 4 | 0 | 4 | 0 | 0 | 4 |
| result-helpers-dead | 2 | 0 | 2 | 0 | 0 | 2 |
| format-duration-keep-boundary | 2 | 0 | 0 | 1 | 1 | 2 |
| get-status-label-keep-boundary | 2 | 0 | 1 | 1 | 0 | 2 |
| parse-date-input-keep-boundary | 5 | 0 | 5 | 0 | 0 | 5 |
| format-timestamp-keep-boundary | 1 | 0 | 1 | 0 | 0 | 1 |
| format-event-time-keep-boundary | 1 | 0 | 1 | 0 | 0 | 1 |
| calendar-event-layout-keep-boundary | 3 | 0 | 3 | 0 | 0 | 3 |
| use-viewport-breakpoint-dead | 2 | 0 | 2 | 0 | 0 | 2 |
| use-ai-draft-persistence-dead | 3 | 0 | 3 | 0 | 0 | 3 |
| use-ai-chat-knowledge-deeplink | 3 | 0 | 3 | 0 | 0 | 3 |
| ai-knowledge-note-terminology | 7 | 0 | 5 | 2 | 0 | 7 |
| legacy-note-surface-docs | 10 | 4 | 4 | 2 | 0 | 6 |
| password-toast-only-keep-boundary | 2 | 0 | 1 | 1 | 0 | 2 |
| task-authority | 3 | 0 | 3 | 0 | 0 | 3 |
| normal-planner-scheduler-boundary | 2 | 0 | 2 | 0 | 0 | 2 |
| scheduler-boundary | 2 | 0 | 2 | 0 | 0 | 2 |
| planner-owner-command-boundary | 1 | 0 | 1 | 0 | 0 | 1 |
| schedule-router-single-track | 6 | 4 | 2 | 0 | 0 | 2 |
| theme-sync-desktop-api-dual | 2 | 0 | 0 | 2 | 0 | 2 |
| desktop-bridge-electron-bridge-dual | 3 | 0 | 2 | 1 | 0 | 3 |
| desktop-auth-api-key-dual | 2 | 0 | 1 | 1 | 0 | 2 |
| notification-authority | 4 | 0 | 4 | 0 | 0 | 4 |
| task-dag-viewmodel-export | 2 | 0 | 2 | 0 | 0 | 2 |
| SettingsPresentationPrimitives | 10 | 0 | 10 | 0 | 0 | 10 |
| desktop-update-service | 2 | 0 | 1 | 1 | 0 | 2 |
| service-client-port-facade-keep-boundary | 3 | 0 | 3 | 0 | 0 | 2 |
| clamp-dual | 3 | 0 | 0 | 2 | 1 | 3 |
| desktop-update-shell-indicator | 2 | 0 | 2 | 0 | 0 | 2 |
| panel-responsive | 7 | 0 | 7 | 0 | 0 | 7 |
| TaskCapsulePreview | 2 | 0 | 2 | 0 | 0 | 1 |
| unverified-email-banner | 2 | 2 | 0 | 0 | 0 | 0 |
| use-ai-chat-host-dispatch | 8 | 1 | 7 | 0 | 0 | 7 |
| AIChatView | 9 | 0 | 4 | 5 | 0 | 7 |
| GoalKnowledgeMenuItems | 4 | 0 | 4 | 0 | 0 | 4 |
| GoalRecordCard | 3 | 0 | 3 | 0 | 0 | 3 |
| GoalDialog | 4 | 0 | 4 | 0 | 0 | 4 |
| GoalKeyResultInspectDialog | 1 | 0 | 1 | 0 | 0 | 1 |
| goal-operations-keep-boundary | 5 | 0 | 4 | 1 | 0 | 5 |
| goal-vnext-ui-convergence | 12 | 0 | 12 | 0 | 0 | 11 |
| clamp-percentage-keep-boundary | 3 | 0 | 1 | 0 | 2 | 2 |
| GoalListView | 1 | 0 | 0 | 1 | 0 | 1 |
| notificationPanelAdaptation | 1 | 0 | 1 | 0 | 0 | 1 |
| DocumentPresentationPrimitives | 3 | 0 | 3 | 0 | 0 | 3 |
| notePanelAdaptation | 4 | 0 | 4 | 0 | 0 | 4 |
| routine-form-ui | 8 | 0 | 8 | 0 | 0 | 8 |
| PlannerCalendar | 1 | 0 | 1 | 0 | 0 | 1 |
| schedulePanelAdaptation | 4 | 0 | 3 | 1 | 0 | 4 |
| AISettings.provider-onboarding-v2 | 5 | 0 | 2 | 3 | 0 | 3 |
| notification-settings-preference | 3 | 0 | 1 | 2 | 0 | 3 |
| use-data-portability | 4 | 0 | 2 | 2 | 0 | 3 |
| UserSettingsView | 3 | 0 | 0 | 3 | 0 | 1 |
| react-mobile-settings-parity | 4 | 0 | 4 | 0 | 0 | 4 |
| settingsPanelAdaptation | 3 | 0 | 1 | 2 | 0 | 2 |
| TaskFilterBar.tiers | 1 | 0 | 1 | 0 | 0 | 1 |
| TaskPageToolbar | 1 | 0 | 1 | 0 | 0 | 1 |
| TaskPlanDialog | 1 | 0 | 1 | 0 | 0 | 1 |
| DailyTodoWidget | 2 | 0 | 2 | 0 | 0 | 1 |
| task-vnext-ui | 9 | 1 | 6 | 2 | 0 | 7 |
| TaskDetailView | 1 | 0 | 1 | 0 | 0 | 1 |
| TaskManagementView | 5 | 0 | 3 | 2 | 0 | 4 |
| taskPanelAdaptation | 2 | 0 | 2 | 0 | 0 | 2 |
| core-vnext-presentation-boundary | 9 | 0 | 9 | 0 | 0 | 9 |
| ProductDateTimePicker | 3 | 0 | 3 | 0 | 0 | 3 |
| ProductEditorFrame | 10 | 0 | 8 | 1 | 1 | 9 |
| ProductEntityMetadataPrimitives | 6 | 0 | 6 | 0 | 0 | 6 |
| ProductOverlayStateRecipes | 16 | 0 | 16 | 0 | 0 | 16 |
| ResponsivePrimaryAction | 4 | 0 | 4 | 0 | 0 | 4 |
| ResponsiveSegmentedFilter | 1 | 0 | 1 | 0 | 0 | 1 |
| product-form-language | 9 | 0 | 9 | 0 | 0 | 9 |
| product-surface-polish | 27 | 1 | 23 | 3 | 0 | 25 |
| use-desktop-window-controls | 4 | 0 | 2 | 2 | 0 | 4 |
| combine-date-and-time-keep-boundary | 4 | 0 | 2 | 2 | 0 | 3 |
| format-date-keep-boundary | 5 | 0 | 3 | 2 | 0 | 4 |
| format-datetime-keep-boundary | 2 | 0 | 2 | 0 | 0 | 2 |
| format-message-time-keep-boundary | 4 | 0 | 0 | 4 | 0 | 2 |
| format-time-range-keep-boundary | 6 | 0 | 4 | 2 | 0 | 5 |
| is-plain-object-keep-boundary | 4 | 0 | 4 | 0 | 0 | 3 |
| to-date-input-keep-boundary | 3 | 0 | 3 | 0 | 0 | 3 |
| to-time-input-keep-boundary | 4 | 0 | 1 | 3 | 0 | 3 |
| dead-surfaces | 7 | 0 | 7 | 0 | 0 | 7 |
| localePresentation | 6 | 0 | 6 | 0 | 0 | 6 |
| key-result-calculation-presentation | 1 | 0 | 0 | 1 | 0 | 1 |
| CapsulePreviewShell | 11 | 1 | 10 | 0 | 0 | 10 |

## 全量台账

| # | Contract | 目标 | 类别 | 去向 / 证据 |
| ---: | --- | --- | :---: | --- |
| 0 | menu-labels-single-track | packages/app-vue/src/components/shared/menu-labels.ts | C | rule-menu-labels-single-track-0 |
| 1 | menu-labels-single-track | packages/app-vue/src/components/shared/index.ts | C | rule-menu-labels-single-track-1 |
| 2 | menu-labels-single-track | packages/app-vue/src/modules/setting/composables/useLocaleSync.ts | C | rule-menu-labels-single-track-2 |
| 3 | i18n-export | packages/app-vue/src/plugins/i18n.ts | C | rule-i18n-export-3 |
| 4 | global-command-palette-shortcut-owner | packages/app-vue/src/shared/components/GlobalOverlays.vue | C | rule-global-command-palette-shortcut-owner-4 |
| 5 | global-command-palette-shortcut-owner | packages/app-vue/src/shared/components/GlobalCommandPalette.vue | C | rule-global-command-palette-shortcut-owner-5 |
| 6 | get-importance-label-keep-boundary | packages/app-vue/src/modules/goal/views/GoalDetailView.vue | C | rule-get-importance-label-keep-boundary-6 |
| 7 | get-importance-label-keep-boundary | packages/app-vue/src/modules/goal/components/GoalProgressRow.vue | C | rule-get-importance-label-keep-boundary-7 |
| 8 | get-importance-label-keep-boundary | packages/app-vue/src/modules/goal/components/dialogs/GoalDialog.vue | C | rule-get-importance-label-keep-boundary-8 |
| 9 | get-importance-label-keep-boundary | packages/app-vue/src/modules/goal/components/KRPreviewList.vue | C | rule-get-importance-label-keep-boundary-9 |
| 10 | result-helpers-dead | packages/app-vue/src/shared/utils/create-composable-handle-error.ts | C | rule-result-helpers-dead-10 |
| 11 | result-helpers-dead | packages/app-vue/src/shared/utils/dual-registry.surface.spec.ts, packages/app-vue/src/shared/utils/result-helpers.ts | C | rule-result-helpers-dead-11 |
| 12 | format-duration-keep-boundary | packages/app-vue/src/modules/task/utils/format-task-duration.ts | D | behaviour test packages/app-vue/src/modules/task/utils/format-task-duration.spec.ts:5; rule-format-duration-keep-boundary-12 |
| 13 | format-duration-keep-boundary | packages/app-react/src/screens/ScheduleEventEditorScreen.tsx | C+A | rule-format-duration-keep-boundary-13; residual lock in app-vue-source-locks.json |
| 14 | get-status-label-keep-boundary | packages/app-vue/src/modules/goal/views/GoalDetailView.vue | C | rule-get-status-label-keep-boundary-14 |
| 15 | get-status-label-keep-boundary | packages/app-vue/src/modules/goal/components/GoalProgressRow.vue | C+A | rule-get-status-label-keep-boundary-15; residual lock in app-vue-source-locks.json |
| 16 | parse-date-input-keep-boundary | packages/app-vue/src/modules/task/components/TaskPlanForm/sections/TimeConfigSection.vue | C | rule-parse-date-input-keep-boundary-16 |
| 17 | parse-date-input-keep-boundary | packages/app-vue/src/shared/components/ProductDatePicker.vue | C | rule-parse-date-input-keep-boundary-17 |
| 18 | parse-date-input-keep-boundary | packages/app-vue/src/shared/utils/parse-to-date.ts | C | rule-parse-date-input-keep-boundary-18 |
| 19 | parse-date-input-keep-boundary | packages/app-vue/src/shared/utils/handle-calendar-select.ts | C | rule-parse-date-input-keep-boundary-19 |
| 20 | parse-date-input-keep-boundary | packages/app-react/src/screens/GoalEditorScreen.tsx | C | rule-parse-date-input-keep-boundary-20 |
| 21 | format-timestamp-keep-boundary | packages/app-vue/src/modules/goal/components/timeline/TimelineControls.vue | C | rule-format-timestamp-keep-boundary-21 |
| 22 | format-event-time-keep-boundary | packages/app-vue/src/modules/schedule/planner/PlannerCalendar.vue | C | rule-format-event-time-keep-boundary-22 |
| 23 | calendar-event-layout-keep-boundary | packages/app-vue/src/modules/schedule/planner/PlannerCalendar.vue | C | rule-calendar-event-layout-keep-boundary-23 |
| 24 | calendar-event-layout-keep-boundary | packages/app-vue/src/modules/schedule/views/ScheduleCalendarView.vue | C | rule-calendar-event-layout-keep-boundary-24 |
| 25 | calendar-event-layout-keep-boundary | packages/app-vue/src/modules/schedule/composables/useCalendarView.ts | C | rule-calendar-event-layout-keep-boundary-25 |
| 26 | use-viewport-breakpoint-dead | packages/app-vue/src/shared/composables/useDesktopWindowControls.ts | C | rule-use-viewport-breakpoint-dead-26 |
| 27 | use-viewport-breakpoint-dead | packages/app-vue/src/shared/composables/useViewportBreakpoint.ts | C | rule-use-viewport-breakpoint-dead-27 |
| 28 | use-ai-draft-persistence-dead | packages/app-vue/src/modules/ai/composables/index.ts | C | rule-use-ai-draft-persistence-dead-28 |
| 29 | use-ai-draft-persistence-dead | packages/app-vue/src/modules/ai/composables/useAIWorkflowPersistence.ts | C | rule-use-ai-draft-persistence-dead-29 |
| 30 | use-ai-draft-persistence-dead | packages/app-vue/src/modules/ai/composables/useAIDraftPersistence.ts | C | rule-use-ai-draft-persistence-dead-30 |
| 31 | use-ai-chat-knowledge-deeplink | packages/app-vue/src/modules/ai/composables/useAIChatView.ts | C | rule-use-ai-chat-knowledge-deeplink-31 |
| 32 | use-ai-chat-knowledge-deeplink | packages/app-vue/src/modules/ai/composables/useAIKnowledgeCapture.ts | C | rule-use-ai-chat-knowledge-deeplink-32 |
| 33 | use-ai-chat-knowledge-deeplink | packages/app-vue/src/modules/repository/router/index.ts | C | rule-use-ai-chat-knowledge-deeplink-33 |
| 34 | ai-knowledge-note-terminology | packages/app-vue/src/locales/en-US/aiAssistant.ts | C+A | rule-ai-knowledge-note-terminology-34; residual lock in app-vue-source-locks.json |
| 35 | ai-knowledge-note-terminology | packages/app-vue/src/locales/zh-CN/aiAssistant.ts | C+A | rule-ai-knowledge-note-terminology-35; residual lock in app-vue-source-locks.json |
| 36 | ai-knowledge-note-terminology | packages/app-vue/src/modules/ai/composables/useAIChatView.ts | C | rule-ai-knowledge-note-terminology-36 |
| 37 | ai-knowledge-note-terminology | packages/app-vue/src/modules/ai/composables/useAIKnowledgeQaWorkflow.ts | C | rule-ai-knowledge-note-terminology-37 |
| 38 | ai-knowledge-note-terminology | packages/app-vue/src/modules/ai/composables/types.ts | C | rule-ai-knowledge-note-terminology-38 |
| 39 | ai-knowledge-note-terminology | packages/app-vue/src/locales/en-US/menu.ts | C | rule-ai-knowledge-note-terminology-39 |
| 40 | ai-knowledge-note-terminology | packages/app-vue/src/locales/zh-CN/menu.ts | C | rule-ai-knowledge-note-terminology-40 |
| 41 | legacy-note-surface-docs | docs/product/module-index/editor-files.md | A | residual lock in app-vue-source-locks.json |
| 42 | legacy-note-surface-docs | docs/product/module-index/repository-files.md | A | residual lock in app-vue-source-locks.json |
| 43 | legacy-note-surface-docs | packages/repository/src/infrastructure-client/adapters/http/repository-http.adapter.spec.ts | C | rule-legacy-note-surface-docs-41 |
| 44 | legacy-note-surface-docs | apps/web/src/mocks/handlers/repository.handlers.ts | C | rule-legacy-note-surface-docs-42 |
| 45 | legacy-note-surface-docs | apps/web/e2e/ai/goal-workflow/goal-workflow.fixture.ts | C | rule-legacy-note-surface-docs-43 |
| 46 | legacy-note-surface-docs | packages/app-vue/src/locales/en-US/menu.ts | C+A | rule-legacy-note-surface-docs-44; residual lock in app-vue-source-locks.json |
| 47 | legacy-note-surface-docs | packages/app-vue/src/locales/zh-CN/menu.ts | C+A | rule-legacy-note-surface-docs-45; residual lock in app-vue-source-locks.json |
| 48 | legacy-note-surface-docs | docs/UI_REDESIGN_BRIEF.md | A | residual lock in app-vue-source-locks.json |
| 49 | legacy-note-surface-docs | docs/UI_PAGE_REDESIGN_PLAN.md | A | residual lock in app-vue-source-locks.json |
| 50 | legacy-note-surface-docs | packages/app-vue/src/modules/repository/router/index.ts | C | rule-legacy-note-surface-docs-46 |
| 51 | password-toast-only-keep-boundary | packages/app-vue/src/modules/authentication/composables/usePassword.ts | C+A | rule-password-toast-only-keep-boundary-47; residual lock in app-vue-source-locks.json |
| 52 | password-toast-only-keep-boundary | packages/app-vue/src/shared/utils/create-composable-handle-error.ts | C | rule-password-toast-only-keep-boundary-48 |
| 53 | task-authority | packages/app-vue/src/modules/task/stores/task-store.ts | C | rule-task-authority-49 |
| 54 | task-authority | packages/app-vue/src/modules/task/views/TaskManagementView.vue | C | rule-task-authority-50 |
| 55 | task-authority | packages/app-vue/src/modules/task/views/TaskDetailView.vue | C | rule-task-authority-51 |
| 56 | normal-planner-scheduler-boundary | packages/app-vue/src/modules/schedule/views/ScheduleCalendarView.vue | C | rule-normal-planner-scheduler-boundary-52 |
| 57 | normal-planner-scheduler-boundary | packages/app-vue/src/modules/schedule/composables/useCalendarView.ts | C | rule-normal-planner-scheduler-boundary-53 |
| 58 | scheduler-boundary | packages/app-vue/src/modules/schedule/planner/calendar-event-projection.ts | C | rule-scheduler-boundary-54 |
| 59 | scheduler-boundary | packages/contracts/src/modules/schedule/planner.ts | C | rule-scheduler-boundary-55 |
| 60 | planner-owner-command-boundary | packages/app-vue/src/modules/schedule/planner/planner-owner-command.router.ts | C | rule-planner-owner-command-boundary-56 |
| 61 | schedule-router-single-track | packages/app-vue/src/modules/schedule/router/index.ts | C | rule-schedule-router-single-track-57 |
| 62 | schedule-router-single-track | docs/product/module-index/schedule-files.md | A | residual lock in app-vue-source-locks.json |
| 63 | schedule-router-single-track | docs/UI_REDESIGN_BRIEF.md | A | residual lock in app-vue-source-locks.json |
| 64 | schedule-router-single-track | docs/UI_REDESIGN_V2_PLAN.md | A | residual lock in app-vue-source-locks.json |
| 65 | schedule-router-single-track | docs/UI_PAGE_REDESIGN_PLAN.md | A | residual lock in app-vue-source-locks.json |
| 66 | schedule-router-single-track | apps/web/e2e/schedule/schedule-week-view.spec.ts, apps/web/e2e/schedule/schedule-calendar.spec.ts | C | rule-schedule-router-single-track-58 |
| 67 | theme-sync-desktop-api-dual | packages/app-vue/src/modules/setting/composables/useThemeSync.ts | C+A | rule-theme-sync-desktop-api-dual-59; residual lock in app-vue-source-locks.json |
| 68 | theme-sync-desktop-api-dual | packages/app-vue/src/shared/utils/desktop-auth-recovery.ts | C+A | rule-theme-sync-desktop-api-dual-60; residual lock in app-vue-source-locks.json |
| 69 | desktop-bridge-electron-bridge-dual | packages/app-vue/src/di/keys.ts | C+A | rule-desktop-bridge-electron-bridge-dual-61; residual lock in app-vue-source-locks.json |
| 70 | desktop-bridge-electron-bridge-dual | packages/app-vue/src/index.ts | C | rule-desktop-bridge-electron-bridge-dual-62 |
| 71 | desktop-bridge-electron-bridge-dual | packages/app-vue/src/shared/composables/useDesktopWindowControls.ts | C | rule-desktop-bridge-electron-bridge-dual-63 |
| 72 | desktop-auth-api-key-dual | packages/app-vue/src/di/keys.ts | C | rule-desktop-auth-api-key-dual-64 |
| 73 | desktop-auth-api-key-dual | packages/app-vue/src/shared/utils/desktop-auth-recovery.ts | C+A | rule-desktop-auth-api-key-dual-65; residual lock in app-vue-source-locks.json |
| 74 | notification-authority | packages/app-vue/src/modules/notification/stores/notification-store.ts | C | rule-notification-authority-66 |
| 75 | notification-authority | packages/app-vue/src/modules/notification/initialization/index.ts | C | rule-notification-authority-67 |
| 76 | notification-authority | packages/app-vue/src/modules/notification/initialization/notification-sse-invalidation-source.ts | C | rule-notification-authority-68 |
| 77 | notification-authority | scan packages/app-vue/src/modules/notification | C | rule-notification-authority-69 |
| 78 | task-dag-viewmodel-export | packages/app-vue/src/modules/task/components/dag/TaskDAGVisualization.vue, packages/app-vue/src/modules/task/types/task-dag.types.ts, packages/app-vue/src/modules/task/composables/useTaskPlanGraphQuery.ts | C | rule-task-dag-viewmodel-export-70 |
| 79 | task-dag-viewmodel-export | scan packages/app-vue/src/modules/task | C | rule-task-dag-viewmodel-export-71 |
| 80 | SettingsPresentationPrimitives | packages/app-vue/src/modules/setting/components/AppearanceSettings.vue | C | rule-settingspresentationprimitives-72 |
| 81 | SettingsPresentationPrimitives | packages/app-vue/src/modules/setting/components/LocaleSettings.vue | C | rule-settingspresentationprimitives-73 |
| 82 | SettingsPresentationPrimitives | packages/app-vue/src/modules/setting/components/SettingsResetSection.vue | C | rule-settingspresentationprimitives-74 |
| 83 | SettingsPresentationPrimitives | packages/app-vue/src/modules/setting/components/UserPreferenceSettingsSection.vue | C | rule-settingspresentationprimitives-75 |
| 84 | SettingsPresentationPrimitives | packages/app-vue/src/modules/account/components/AccountProfileSection.vue | C | rule-settingspresentationprimitives-76 |
| 85 | SettingsPresentationPrimitives | packages/app-vue/src/components/shared/settings/SettingsDialogShell.vue | C | rule-settingspresentationprimitives-77 |
| 86 | SettingsPresentationPrimitives | packages/app-vue/src/modules/setting/components/AISettings.vue | C | rule-settingspresentationprimitives-78 |
| 87 | SettingsPresentationPrimitives | packages/app-vue/src/modules/setting/components/MastraAgentSettings.vue | C | rule-settingspresentationprimitives-79 |
| 88 | SettingsPresentationPrimitives | packages/app-vue/src/modules/setting/components/AgentInstanceWizard.vue | C | rule-settingspresentationprimitives-80 |
| 89 | SettingsPresentationPrimitives | packages/app-vue/src/modules/setting/components/KnowledgeRepositorySettings.vue | C | rule-settingspresentationprimitives-81 |
| 90 | desktop-update-service | packages/app-vue/src/di/keys.ts | C | rule-desktop-update-service-82 |
| 91 | desktop-update-service | packages/app-vue/src/di/types.ts | C+A | rule-desktop-update-service-83; residual lock in app-vue-source-locks.json |
| 92 | service-client-port-facade-keep-boundary | packages/app-vue/src/di/types.ts | C | rule-service-client-port-facade-keep-boundary-84 |
| 93 | service-client-port-facade-keep-boundary | packages/app-vue/src/di/keys.ts | C | rule-service-client-port-facade-keep-boundary-85 |
| 94 | service-client-port-facade-keep-boundary | packages/app-vue/src/di/types.ts | C | rule-service-client-port-facade-keep-boundary-84 |
| 95 | clamp-dual | packages/app-vue/src/layouts/shell/clamp.ts | D | behaviour test packages/app-vue/src/layouts/shell/clamp-dual.surface.spec.ts:13; rule-clamp-dual-86 |
| 96 | clamp-dual | packages/app-vue/src/layouts/shell/panel-geometry.ts | C+A | rule-clamp-dual-87; residual lock in app-vue-source-locks.json |
| 97 | clamp-dual | packages/app-vue/src/layouts/shell/useAppShellStore.ts | C+A | rule-clamp-dual-88; residual lock in app-vue-source-locks.json |
| 98 | desktop-update-shell-indicator | packages/app-vue/src/layouts/shell/AppShell.vue | C | rule-desktop-update-shell-indicator-89 |
| 99 | desktop-update-shell-indicator | packages/app-vue/src/layouts/shell/WindowHeader.vue | C | rule-desktop-update-shell-indicator-90 |
| 100 | panel-responsive | packages/app-vue/src/modules/ai/views/AIChatView.vue | C | rule-panel-responsive-91 |
| 101 | panel-responsive | packages/app-vue/src/layouts/shell/BusinessPanel.vue | C | rule-panel-responsive-92 |
| 102 | panel-responsive | packages/app-vue/src/modules/ai/components/AIGoalWorkflowPanel.vue | C | rule-panel-responsive-93 |
| 103 | panel-responsive | packages/app-vue/src/modules/ai/components/AIMessagePanel.vue | C | rule-panel-responsive-94 |
| 104 | panel-responsive | packages/app-vue/src/modules/goal/components/weight/WeightSuggestionPanel.vue | C | rule-panel-responsive-95 |
| 105 | panel-responsive | packages/app-vue/src/modules/goal/components/weight-snapshot/WeightComparison.vue | C | rule-panel-responsive-96 |
| 106 | panel-responsive | packages/app-vue/src/modules/repository/components/KnowledgeProjectionRelationsView.vue | C | rule-panel-responsive-97 |
| 107 | TaskCapsulePreview | packages/app-vue/src/layouts/shell/previews/TaskCapsulePreview.vue | C | rule-taskcapsulepreview-98 |
| 108 | TaskCapsulePreview | packages/app-vue/src/layouts/shell/previews/TaskCapsulePreview.vue | C | rule-taskcapsulepreview-98 |
| 109 | unverified-email-banner | packages/app-vue/src/layouts/shell/AppShell.vue | A | residual lock in app-vue-source-locks.json |
| 110 | unverified-email-banner | packages/app-vue/src/layouts/shell/AppShell.vue | A | residual lock in app-vue-source-locks.json |
| 111 | use-ai-chat-host-dispatch | packages/app-vue/src/modules/ai/composables/types.ts | C | rule-use-ai-chat-host-dispatch-99 |
| 112 | use-ai-chat-host-dispatch | packages/app-vue/src/modules/ai/composables/useAIChatView.ts | C | rule-use-ai-chat-host-dispatch-100 |
| 113 | use-ai-chat-host-dispatch | apps/web/src/platform/di-app.ts | C | rule-use-ai-chat-host-dispatch-101 |
| 114 | use-ai-chat-host-dispatch | apps/desktop/src/renderer/platform/di-app.ts | C | rule-use-ai-chat-host-dispatch-102 |
| 115 | use-ai-chat-host-dispatch | packages/app-vue/src/modules/ai/components/AIFooterComposer.vue | C | rule-use-ai-chat-host-dispatch-103 |
| 116 | use-ai-chat-host-dispatch | packages/app-vue/src/modules/ai/views/AIChatView.vue | C | rule-use-ai-chat-host-dispatch-104 |
| 117 | use-ai-chat-host-dispatch | docs/architecture/ai-runtime-path-map.md | A | residual lock in app-vue-source-locks.json |
| 118 | use-ai-chat-host-dispatch | packages/app-vue/src/modules/ai/composables/useAIChatSession.ts, packages/app-vue/src/modules/ai/composables/useAssistantStream.ts, packages/app-vue/src/modules/ai/composables/useConversationProjection.ts, packages/app-vue/src/modules/ai/composables/useAIComposerContext.ts | C | rule-use-ai-chat-host-dispatch-105 |
| 119 | AIChatView | packages/app-vue/src/modules/ai/views/AIChatView.vue | C+A | rule-aichatview-106; residual lock in app-vue-source-locks.json |
| 120 | AIChatView | packages/app-vue/src/modules/ai/components/AIConversationSidebar.vue | C | rule-aichatview-107 |
| 121 | AIChatView | packages/app-vue/src/modules/ai/composables/useAIChatView.ts | C+A | rule-aichatview-108; residual lock in app-vue-source-locks.json |
| 122 | AIChatView | packages/app-vue/src/modules/ai/components/AIGoalWorkflowPanel.vue | C | rule-aichatview-109 |
| 123 | AIChatView | packages/app-vue/src/modules/ai/components/AITaskWorkflowPanel.vue | C | rule-aichatview-110 |
| 124 | AIChatView | packages/app-vue/src/modules/ai/components/AIKnowledgeCapturePanel.vue | C | rule-aichatview-111 |
| 125 | AIChatView | packages/app-vue/src/modules/ai/components/AIFooterComposer.vue | C+A | rule-aichatview-112; residual lock in app-vue-source-locks.json |
| 126 | AIChatView | packages/app-vue/src/modules/ai/views/AIChatView.vue | C+A | rule-aichatview-106; residual lock in app-vue-source-locks.json |
| 127 | AIChatView | packages/app-vue/src/modules/ai/composables/useAIChatView.ts | C+A | rule-aichatview-108; residual lock in app-vue-source-locks.json |
| 128 | GoalKnowledgeMenuItems | packages/app-vue/src/modules/goal/components/GoalKnowledgeMenuItems.vue | C | rule-goalknowledgemenuitems-113 |
| 129 | GoalKnowledgeMenuItems | packages/app-vue/src/modules/repository/composables/useReferenceableKnowledgeNotes.ts | C | rule-goalknowledgemenuitems-114 |
| 130 | GoalKnowledgeMenuItems | apps/web/src/platform/di-app.ts | C | rule-goalknowledgemenuitems-115 |
| 131 | GoalKnowledgeMenuItems | apps/desktop/src/renderer/platform/di-app.ts | C | rule-goalknowledgemenuitems-116 |
| 132 | GoalRecordCard | packages/app-vue/src/modules/goal/components/index.ts | C | rule-goalrecordcard-117 |
| 133 | GoalRecordCard | packages/app-vue/src/modules/goal/components/cards/GoalRecordCard.vue | C | rule-goalrecordcard-118 |
| 134 | GoalRecordCard | packages/app-vue/src/modules/goal/components/GoalRecordCard.vue | C | rule-goalrecordcard-119 |
| 135 | GoalDialog | packages/app-vue/src/modules/goal/components/dialogs/GoalDialog.vue | C | rule-goaldialog-120 |
| 136 | GoalDialog | packages/app-vue/src/modules/goal/components/dialogs/GoalFormFrame.vue | C | rule-goaldialog-121 |
| 137 | GoalDialog | packages/app-vue/src/modules/goal/components/GoalKeyResultDraftEditor.vue | C | rule-goaldialog-122 |
| 138 | GoalDialog | packages/app-vue/src/modules/goal/components/GoalKeyResultCardEditor.vue | C | rule-goaldialog-123 |
| 139 | GoalKeyResultInspectDialog | packages/app-vue/src/modules/goal/components/dialogs/GoalKeyResultInspectDialog.vue | C | rule-goalkeyresultinspectdialog-124 |
| 140 | goal-operations-keep-boundary | packages/app-vue/src/modules/goal/composables/goalOperations.ts | C+A | rule-goal-operations-keep-boundary-125; residual lock in app-vue-source-locks.json |
| 141 | goal-operations-keep-boundary | packages/app-vue/src/shared/utils/create-composable-handle-error.ts | C | rule-goal-operations-keep-boundary-126 |
| 142 | goal-operations-keep-boundary | packages/app-vue/src/modules/goal/composables/useGoal.ts | C | rule-goal-operations-keep-boundary-127 |
| 143 | goal-operations-keep-boundary | packages/app-vue/src/modules/goal/composables/useKeyResults.ts | C | rule-goal-operations-keep-boundary-128 |
| 144 | goal-operations-keep-boundary | packages/app-vue/src/modules/goal/composables/useGoalRecords.ts | C | rule-goal-operations-keep-boundary-129 |
| 145 | goal-vnext-ui-convergence | packages/app-vue/src/modules/goal/components/dialogs/GoalDialog.vue | C | rule-goal-vnext-ui-convergence-130 |
| 146 | goal-vnext-ui-convergence | packages/app-vue/src/shared/components/ProductTimeframePicker.vue | C | rule-goal-vnext-ui-convergence-131 |
| 147 | goal-vnext-ui-convergence | packages/app-vue/src/shared/components/ProductTemporalPickerSurface.vue | C | rule-goal-vnext-ui-convergence-132 |
| 148 | goal-vnext-ui-convergence | packages/app-vue/src/modules/goal/views/GoalDetailView.vue | C | rule-goal-vnext-ui-convergence-133 |
| 149 | goal-vnext-ui-convergence | packages/app-vue/src/modules/task/views/TaskManagementView.vue | C | rule-goal-vnext-ui-convergence-134 |
| 150 | goal-vnext-ui-convergence | packages/app-react/src/screens/TasksScreen.tsx | C | rule-goal-vnext-ui-convergence-135 |
| 151 | goal-vnext-ui-convergence | packages/app-react/src/hooks/useTaskPlans.ts | C | rule-goal-vnext-ui-convergence-136 |
| 152 | goal-vnext-ui-convergence | packages/app-react/src/screens/GoalEditorScreen.tsx | C | rule-goal-vnext-ui-convergence-137 |
| 153 | goal-vnext-ui-convergence | packages/app-react/src/screens/GoalKeyResultScreen.tsx | C | rule-goal-vnext-ui-convergence-138 |
| 154 | goal-vnext-ui-convergence | packages/app-react/src/screens/GoalDetailScreen.tsx | C | rule-goal-vnext-ui-convergence-139 |
| 155 | goal-vnext-ui-convergence | packages/app-react/src/utils/product-time.ts | C | rule-goal-vnext-ui-convergence-140 |
| 156 | goal-vnext-ui-convergence | packages/app-vue/src/shared/components/ProductTemporalPickerSurface.vue | C | rule-goal-vnext-ui-convergence-132 |
| 157 | clamp-percentage-keep-boundary | packages/app-vue/src/modules/goal/utils/progress.ts | D | behaviour test packages/app-vue/src/modules/goal/utils/progress.spec.ts:9; rule-clamp-percentage-keep-boundary-141 |
| 158 | clamp-percentage-keep-boundary | packages/app-vue/src/layouts/shell/clamp.ts | C | rule-clamp-percentage-keep-boundary-142 |
| 159 | clamp-percentage-keep-boundary | packages/app-vue/src/modules/goal/utils/progress.ts | D | behaviour test packages/app-vue/src/modules/goal/utils/progress.spec.ts:20; rule-clamp-percentage-keep-boundary-141 |
| 160 | GoalListView | packages/app-vue/src/modules/goal/views/GoalListView.vue | C+A | rule-goallistview-143; residual lock in app-vue-source-locks.json |
| 161 | notificationPanelAdaptation | packages/app-vue/src/modules/notification/views/NotificationListPage.vue | C | rule-notificationpaneladaptation-144 |
| 162 | DocumentPresentationPrimitives | packages/app-vue/src/modules/repository/components/KnowledgeNoteCatalog.vue | C | rule-documentpresentationprimitives-145 |
| 163 | DocumentPresentationPrimitives | packages/app-vue/src/modules/repository/views/KnowledgeProjectionWorkspaceView.vue | C | rule-documentpresentationprimitives-146 |
| 164 | DocumentPresentationPrimitives | packages/app-vue/src/modules/repository/views/LocalVaultWorkspaceView.vue | C | rule-documentpresentationprimitives-147 |
| 165 | notePanelAdaptation | packages/app-vue/src/modules/repository/router/index.ts | C | rule-notepaneladaptation-148 |
| 166 | notePanelAdaptation | packages/app-vue/src/modules/repository/views/RepositoryEntryView.vue | C | rule-notepaneladaptation-149 |
| 167 | notePanelAdaptation | packages/app-vue/src/modules/repository/views/KnowledgeProjectionWorkspaceView.vue | C | rule-notepaneladaptation-150 |
| 168 | notePanelAdaptation | packages/app-vue/src/modules/repository/views/LocalVaultWorkspaceView.vue | C | rule-notepaneladaptation-151 |
| 169 | routine-form-ui | packages/app-vue/src/modules/routine/components/RoutineEditorDialog.vue | C | rule-routine-form-ui-152 |
| 170 | routine-form-ui | packages/app-vue/src/modules/routine/components/WallClockTriggerEditor.vue | C | rule-routine-form-ui-153 |
| 171 | routine-form-ui | packages/app-vue/src/modules/routine/components/ElapsedTriggerEditor.vue | C | rule-routine-form-ui-154 |
| 172 | routine-form-ui | packages/app-vue/src/modules/routine/components/ActiveUsageTriggerEditor.vue | C | rule-routine-form-ui-155 |
| 173 | routine-form-ui | packages/app-vue/src/modules/routine/components/ProfileScopeControl.vue | C | rule-routine-form-ui-156 |
| 174 | routine-form-ui | packages/app-vue/src/modules/routine/components/RoutineProfileDialog.vue | C | rule-routine-form-ui-157 |
| 175 | routine-form-ui | packages/app-vue/src/modules/routine/views/RoutineConfigurationView.vue | C | rule-routine-form-ui-158 |
| 176 | routine-form-ui | packages/app-vue/src/modules/routine/components/WallClockTriggerEditor.vue, packages/app-vue/src/modules/routine/components/ElapsedTriggerEditor.vue, packages/app-vue/src/modules/routine/components/ActiveUsageTriggerEditor.vue, packages/app-vue/src/modules/routine/components/ProfileScopeControl.vue | C | rule-routine-form-ui-159 |
| 177 | PlannerCalendar | packages/app-vue/src/modules/schedule/planner/PlannerCalendar.vue | C | rule-plannercalendar-160 |
| 178 | schedulePanelAdaptation | packages/app-vue/src/modules/schedule/views/ScheduleCalendarView.vue | C+A | rule-schedulepaneladaptation-161; residual lock in app-vue-source-locks.json |
| 179 | schedulePanelAdaptation | packages/app-vue/src/modules/schedule/components/PlannerDayDialog.vue | C | rule-schedulepaneladaptation-162 |
| 180 | schedulePanelAdaptation | packages/app-vue/src/modules/schedule/components/PlannerEventDialog.vue | C | rule-schedulepaneladaptation-163 |
| 181 | schedulePanelAdaptation | packages/app-vue/src/modules/schedule/planner/PlannerCalendar.vue | C | rule-schedulepaneladaptation-164 |
| 182 | AISettings.provider-onboarding-v2 | packages/app-vue/src/modules/setting/components/AISettings.vue | C | rule-aisettings-provider-onboarding-v2-165 |
| 183 | AISettings.provider-onboarding-v2 | packages/app-vue/src/modules/setting/components/AgentInstanceWizard.vue | C | rule-aisettings-provider-onboarding-v2-166 |
| 184 | AISettings.provider-onboarding-v2 | packages/app-vue/src/modules/setting/components/MastraAgentSettings.vue | C+A | rule-aisettings-provider-onboarding-v2-167; residual lock in app-vue-source-locks.json |
| 185 | AISettings.provider-onboarding-v2 | packages/app-vue/src/modules/setting/components/MastraAgentSettings.vue | C+A | rule-aisettings-provider-onboarding-v2-167; residual lock in app-vue-source-locks.json |
| 186 | AISettings.provider-onboarding-v2 | packages/app-vue/src/modules/setting/components/MastraAgentSettings.vue | C+A | rule-aisettings-provider-onboarding-v2-167; residual lock in app-vue-source-locks.json |
| 187 | notification-settings-preference | packages/app-vue/src/modules/setting/components/NotificationSettings.vue | C | rule-notification-settings-preference-168 |
| 188 | notification-settings-preference | packages/app-vue/src/modules/notification/composables/useNotificationPreferences.ts | C+A | rule-notification-settings-preference-169; residual lock in app-vue-source-locks.json |
| 189 | notification-settings-preference | packages/notification/src/application-client/ports/notification-api-client.port.ts | C+A | rule-notification-settings-preference-170; residual lock in app-vue-source-locks.json |
| 190 | use-data-portability | packages/app-vue/src/modules/setting/composables/useDataPortability.ts | C | rule-use-data-portability-171 |
| 191 | use-data-portability | packages/data-portability/src/infrastructure-client/adapters/ipc/data-portability-ipc.adapter.ts | C+A | rule-use-data-portability-172; residual lock in app-vue-source-locks.json |
| 192 | use-data-portability | packages/data-portability/src/infrastructure-client/adapters/ipc/data-portability-ipc.adapter.ts | C+A | rule-use-data-portability-172; residual lock in app-vue-source-locks.json |
| 193 | use-data-portability | packages/app-vue/src/modules/setting/components/DataSettingsSection.vue | C | rule-use-data-portability-173 |
| 194 | UserSettingsView | packages/app-vue/src/modules/setting/views/UserSettingsView.vue | C+A | rule-usersettingsview-174; residual lock in app-vue-source-locks.json |
| 195 | UserSettingsView | packages/app-vue/src/modules/setting/views/UserSettingsView.vue | C+A | rule-usersettingsview-174; residual lock in app-vue-source-locks.json |
| 196 | UserSettingsView | packages/app-vue/src/modules/setting/views/UserSettingsView.vue | C+A | rule-usersettingsview-174; residual lock in app-vue-source-locks.json |
| 197 | react-mobile-settings-parity | apps/mobile/src/app/explore/settings.tsx | C | rule-react-mobile-settings-parity-175 |
| 198 | react-mobile-settings-parity | packages/app-react/src/providers/app-preference-provider.tsx | C | rule-react-mobile-settings-parity-176 |
| 199 | react-mobile-settings-parity | packages/app-react/src/screens/SettingsScreen.tsx | C | rule-react-mobile-settings-parity-177 |
| 200 | react-mobile-settings-parity | packages/app-react/src/hooks/useNotificationPreferences.ts | C | rule-react-mobile-settings-parity-178 |
| 201 | settingsPanelAdaptation | packages/app-vue/src/modules/setting/views/UserSettingsView.vue | C | rule-settingspaneladaptation-179 |
| 202 | settingsPanelAdaptation | packages/app-vue/src/modules/setting/components/SettingsNavigation.vue | C+A | rule-settingspaneladaptation-180; residual lock in app-vue-source-locks.json |
| 203 | settingsPanelAdaptation | packages/app-vue/src/modules/setting/components/SettingsNavigation.vue | C+A | rule-settingspaneladaptation-180; residual lock in app-vue-source-locks.json |
| 204 | TaskFilterBar.tiers | packages/app-vue/src/modules/task/components/TaskPageToolbar.vue | C | rule-taskfilterbar-tiers-181 |
| 205 | TaskPageToolbar | packages/app-vue/src/modules/task/components/TaskPageToolbar.vue | C | rule-taskpagetoolbar-182 |
| 206 | TaskPlanDialog | packages/app-vue/src/modules/task/components/dialogs/TaskPlanDialog.vue | C | rule-taskplandialog-183 |
| 207 | DailyTodoWidget | packages/app-vue/src/modules/task/components/widgets/DailyTodoWidget.vue | C | rule-dailytodowidget-184 |
| 208 | DailyTodoWidget | packages/app-vue/src/modules/task/components/widgets/DailyTodoWidget.vue | C | rule-dailytodowidget-184 |
| 209 | task-vnext-ui | packages/app-vue/src/modules/task/components/types.ts | A | residual lock in app-vue-source-locks.json |
| 210 | task-vnext-ui | packages/app-vue/src/modules/task/components/TaskPlanForm/TaskPlanForm.vue | C | rule-task-vnext-ui-185 |
| 211 | task-vnext-ui | packages/app-vue/src/modules/task/components/TaskPlanForm/sections/BasicInfoSection.vue | C | rule-task-vnext-ui-186 |
| 212 | task-vnext-ui | packages/app-vue/src/modules/task/components/dialogs/TaskPlanDialog.vue | C | rule-task-vnext-ui-187 |
| 213 | task-vnext-ui | packages/app-vue/src/modules/task/components/TaskPlanForm/sections/TimeConfigSection.vue | C | rule-task-vnext-ui-188 |
| 214 | task-vnext-ui | packages/app-vue/src/modules/task/components/TaskPlanForm/sections/ChecklistSection.vue | C | rule-task-vnext-ui-189 |
| 215 | task-vnext-ui | packages/app-vue/src/modules/task/views/TaskDetailView.vue | C+A | rule-task-vnext-ui-190; residual lock in app-vue-source-locks.json |
| 216 | task-vnext-ui | packages/app-vue/src/modules/task/components/TaskOccurrenceRow.vue | C | rule-task-vnext-ui-191 |
| 217 | task-vnext-ui | packages/app-vue/src/modules/task/views/TaskDetailView.vue | C+A | rule-task-vnext-ui-190; residual lock in app-vue-source-locks.json |
| 218 | TaskDetailView | packages/app-vue/src/modules/task/views/TaskDetailView.vue | C | rule-taskdetailview-192 |
| 219 | TaskManagementView | packages/app-vue/src/modules/task/views/TaskManagementView.vue | C+A | rule-taskmanagementview-193; residual lock in app-vue-source-locks.json |
| 220 | TaskManagementView | packages/app-vue/src/modules/task/components/TaskPageToolbar.vue | C | rule-taskmanagementview-194 |
| 221 | TaskManagementView | packages/app-vue/src/modules/task/views/TaskManagementView.vue | C+A | rule-taskmanagementview-193; residual lock in app-vue-source-locks.json |
| 222 | TaskManagementView | packages/app-vue/src/modules/task/composables/useTaskToday.ts | C | rule-taskmanagementview-195 |
| 223 | TaskManagementView | packages/app-vue/src/modules/task/router/index.ts | C | rule-taskmanagementview-196 |
| 224 | taskPanelAdaptation | packages/app-vue/src/modules/task/views/TaskManagementView.vue | C | rule-taskpaneladaptation-197 |
| 225 | taskPanelAdaptation | packages/app-vue/src/modules/task/components/TaskPageToolbar.vue | C | rule-taskpaneladaptation-198 |
| 226 | core-vnext-presentation-boundary | packages/app-vue/src/shared/utils/product-time.ts | C | rule-core-vnext-presentation-boundary-199 |
| 227 | core-vnext-presentation-boundary | packages/app-vue/src/modules/goal/components/GoalProgressRow.vue | C | rule-core-vnext-presentation-boundary-200 |
| 228 | core-vnext-presentation-boundary | packages/app-vue/src/modules/goal/views/GoalDetailView.vue | C | rule-core-vnext-presentation-boundary-201 |
| 229 | core-vnext-presentation-boundary | packages/app-vue/src/modules/goal/components/dialogs/GoalReviewInspectDialog.vue | C | rule-core-vnext-presentation-boundary-202 |
| 230 | core-vnext-presentation-boundary | packages/app-vue/src/modules/goal/components/dialogs/GoalDialog.vue | C | rule-core-vnext-presentation-boundary-203 |
| 231 | core-vnext-presentation-boundary | packages/app-vue/src/layouts/shell/previews/TaskCapsulePreview.vue | C | rule-core-vnext-presentation-boundary-204 |
| 232 | core-vnext-presentation-boundary | packages/app-vue/src/modules/task/components/TaskQuickSurface.vue | C | rule-core-vnext-presentation-boundary-205 |
| 233 | core-vnext-presentation-boundary | packages/app-vue/src/modules/task/components/TaskPageToolbar.vue | C | rule-core-vnext-presentation-boundary-206 |
| 234 | core-vnext-presentation-boundary | packages/app-vue/src/modules/task/views/TaskManagementView.vue | C | rule-core-vnext-presentation-boundary-207 |
| 235 | ProductDateTimePicker | packages/app-vue/src/shared/components/ProductDateTimePickerFields.vue | C | rule-productdatetimepicker-208 |
| 236 | ProductDateTimePicker | packages/app-vue/src/shared/components/ProductDateTimePicker.vue | C | rule-productdatetimepicker-209 |
| 237 | ProductDateTimePicker | packages/app-vue/src/modules/schedule/components/CreateScheduleDialog.vue | C | rule-productdatetimepicker-210 |
| 238 | ProductEditorFrame | packages/app-vue/src/shared/components/PaneScopedDialog.vue | C+A | rule-producteditorframe-211; residual lock in app-vue-source-locks.json |
| 239 | ProductEditorFrame | packages/app-vue/src/shared/components/ProductEditorFrame.vue | D | behaviour test packages/app-vue/src/shared/components/ProductEditorFrame.spec.ts:114; rule-producteditorframe-212 |
| 240 | ProductEditorFrame | packages/app-vue/src/shared/components/ResponsivePrimaryAction.vue | C | rule-producteditorframe-213 |
| 241 | ProductEditorFrame | packages/app-vue/src/modules/routine/views/RoutineConfigurationView.vue | C | rule-producteditorframe-214 |
| 242 | ProductEditorFrame | packages/app-vue/src/modules/task/views/TaskManagementView.vue | C | rule-producteditorframe-215 |
| 243 | ProductEditorFrame | packages/app-vue/src/modules/task/components/dialogs/TaskPlanDialog.vue | C | rule-producteditorframe-216 |
| 244 | ProductEditorFrame | packages/app-vue/src/modules/routine/views/RoutineConfigurationView.vue | C | rule-producteditorframe-214 |
| 245 | ProductEditorFrame | packages/app-vue/src/modules/routine/components/RoutineEditorDialog.vue | C | rule-producteditorframe-217 |
| 246 | ProductEditorFrame | packages/app-vue/src/modules/schedule/views/ScheduleCalendarView.vue | C | rule-producteditorframe-218 |
| 247 | ProductEditorFrame | packages/app-vue/src/modules/schedule/components/CreateScheduleDialog.vue | C | rule-producteditorframe-219 |
| 248 | ProductEntityMetadataPrimitives | packages/app-vue/src/modules/goal/views/GoalDetailView.vue | C | rule-productentitymetadataprimitives-220 |
| 249 | ProductEntityMetadataPrimitives | packages/app-vue/src/modules/task/views/TaskDetailView.vue | C | rule-productentitymetadataprimitives-221 |
| 250 | ProductEntityMetadataPrimitives | packages/app-vue/src/shared/components/ProductEntityIdentity.vue | C | rule-productentitymetadataprimitives-222 |
| 251 | ProductEntityMetadataPrimitives | packages/app-vue/src/shared/components/ProductMetadataRow.vue | C | rule-productentitymetadataprimitives-223 |
| 252 | ProductEntityMetadataPrimitives | packages/app-vue/src/shared/components/ProductMoreProperties.vue | C | rule-productentitymetadataprimitives-224 |
| 253 | ProductEntityMetadataPrimitives | packages/app-vue/src/shared/components/ProductPropertyChip.vue | C | rule-productentitymetadataprimitives-225 |
| 254 | ProductOverlayStateRecipes | packages/app-vue/src/shared/components/ProductPopoverSurface.vue | C | rule-productoverlaystaterecipes-226 |
| 255 | ProductOverlayStateRecipes | packages/app-vue/src/modules/goal/components/GoalKeyResultDirectControls.vue | C | rule-productoverlaystaterecipes-227 |
| 256 | ProductOverlayStateRecipes | packages/app-vue/src/modules/routine/components/ElapsedTriggerEditor.vue | C | rule-productoverlaystaterecipes-228 |
| 257 | ProductOverlayStateRecipes | packages/app-vue/src/modules/routine/components/ActiveUsageTriggerEditor.vue | C | rule-productoverlaystaterecipes-229 |
| 258 | ProductOverlayStateRecipes | packages/app-vue/src/shared/components/ProductDialogShell.vue | C | rule-productoverlaystaterecipes-230 |
| 259 | ProductOverlayStateRecipes | packages/app-vue/src/modules/task/components/dialogs/TaskOccurrenceInspectDialog.vue | C | rule-productoverlaystaterecipes-231 |
| 260 | ProductOverlayStateRecipes | packages/app-vue/src/modules/goal/components/dialogs/GoalKeyResultInspectDialog.vue | C | rule-productoverlaystaterecipes-232 |
| 261 | ProductOverlayStateRecipes | packages/app-vue/src/modules/goal/components/dialogs/GoalDialog.vue | C | rule-productoverlaystaterecipes-233 |
| 262 | ProductOverlayStateRecipes | packages/app-vue/src/modules/goal/components/dialogs/GoalFormFrame.vue | C | rule-productoverlaystaterecipes-234 |
| 263 | ProductOverlayStateRecipes | packages/app-vue/src/modules/task/components/dialogs/TaskPlanDialog.vue | C | rule-productoverlaystaterecipes-235 |
| 264 | ProductOverlayStateRecipes | packages/app-vue/src/modules/routine/components/RoutineEditorDialog.vue | C | rule-productoverlaystaterecipes-236 |
| 265 | ProductOverlayStateRecipes | packages/app-vue/src/modules/schedule/components/CreateScheduleDialog.vue | C | rule-productoverlaystaterecipes-237 |
| 266 | ProductOverlayStateRecipes | packages/app-vue/src/shared/components/ProductSheetSurface.vue | C | rule-productoverlaystaterecipes-238 |
| 267 | ProductOverlayStateRecipes | packages/app-vue/src/modules/repository/views/KnowledgeProjectionWorkspaceView.vue | C | rule-productoverlaystaterecipes-239 |
| 268 | ProductOverlayStateRecipes | packages/app-vue/src/modules/repository/components/DocumentWorkspaceState.vue | C | rule-productoverlaystaterecipes-240 |
| 269 | ProductOverlayStateRecipes | packages/app-vue/src/modules/notification/views/NotificationListPage.vue | C | rule-productoverlaystaterecipes-241 |
| 270 | ResponsivePrimaryAction | packages/app-vue/src/shared/components/ResponsivePrimaryAction.vue | C | rule-responsiveprimaryaction-242 |
| 271 | ResponsivePrimaryAction | packages/app-vue/src/modules/goal/components/GoalPageToolbar.vue | C | rule-responsiveprimaryaction-243 |
| 272 | ResponsivePrimaryAction | packages/app-vue/src/modules/task/components/TaskPageToolbar.vue | C | rule-responsiveprimaryaction-244 |
| 273 | ResponsivePrimaryAction | packages/app-vue/src/modules/schedule/views/ScheduleCalendarView.vue | C | rule-responsiveprimaryaction-245 |
| 274 | ResponsiveSegmentedFilter | packages/app-vue/src/shared/components/ResponsiveSegmentedFilter.vue | C | rule-responsivesegmentedfilter-246 |
| 275 | product-form-language | packages/app-vue/src/modules/goal/components/dialogs/GoalDialog.vue | C | rule-product-form-language-247 |
| 276 | product-form-language | packages/app-vue/src/modules/task/components/TaskPlanForm/TaskPlanForm.vue | C | rule-product-form-language-248 |
| 277 | product-form-language | packages/app-vue/src/modules/schedule/components/CreateScheduleDialog.vue | C | rule-product-form-language-249 |
| 278 | product-form-language | packages/app-vue/src/modules/goal/components/dialogs/GoalFormFrame.vue | C | rule-product-form-language-250 |
| 279 | product-form-language | packages/app-vue/src/modules/goal/components/dialogs/GoalRecordDialog.vue | C | rule-product-form-language-251 |
| 280 | product-form-language | packages/app-vue/src/modules/task/components/dialogs/TemplateSelectionDialog.vue | C | rule-product-form-language-252 |
| 281 | product-form-language | packages/app-vue/src/modules/task/components/dialogs/TaskPlanDialog.vue | C | rule-product-form-language-253 |
| 282 | product-form-language | packages/app-vue/src/shared/components/ProductEditorFrame.vue | C | rule-product-form-language-254 |
| 283 | product-form-language | packages/app-vue/src/modules/repository/views/KnowledgeProjectionWorkspaceView.vue | C | rule-product-form-language-255 |
| 284 | product-surface-polish | packages/app-vue/src/modules/goal/views/GoalDetailView.vue | C+A | rule-product-surface-polish-256; residual lock in app-vue-source-locks.json |
| 285 | product-surface-polish | packages/app-vue/src/modules/goal/components/GoalReminderMenuItems.vue | C+A | rule-product-surface-polish-257; residual lock in app-vue-source-locks.json |
| 286 | product-surface-polish | packages/app-vue/src/modules/goal/components/dialogs/GoalReviewCreateDialog.vue | C | rule-product-surface-polish-258 |
| 287 | product-surface-polish | packages/app-vue/src/modules/goal/components/dialogs/GoalReviewInspectDialog.vue | C | rule-product-surface-polish-259 |
| 288 | product-surface-polish | packages/app-vue/src/modules/goal/components/GoalReviewSnapshot.vue | C | rule-product-surface-polish-260 |
| 289 | product-surface-polish | packages/app-vue/src/modules/goal/components/dialogs/GoalKeyResultInspectDialog.vue | C | rule-product-surface-polish-261 |
| 290 | product-surface-polish | packages/app-vue/src/modules/goal/components/dialogs/GoalDialog.vue | C | rule-product-surface-polish-262 |
| 291 | product-surface-polish | packages/app-vue/src/modules/goal/components/dialogs/KeyResultDialog.vue | C | rule-product-surface-polish-263 |
| 292 | product-surface-polish | packages/app-vue/src/modules/goal/components/GoalKeyResultCardEditor.vue | C | rule-product-surface-polish-264 |
| 293 | product-surface-polish | packages/app-vue/src/modules/goal/components/GoalKeyResultTrajectoryPlot.vue | C | rule-product-surface-polish-265 |
| 294 | product-surface-polish | packages/app-vue/src/modules/task/views/TaskDetailView.vue | C | rule-product-surface-polish-266 |
| 295 | product-surface-polish | packages/app-vue/src/modules/goal/components/GoalKeyResultDraftEditor.vue | C | rule-product-surface-polish-267 |
| 296 | product-surface-polish | packages/app-vue/src/modules/task/components/TaskPlanForm/sections/ChecklistSection.vue | C | rule-product-surface-polish-268 |
| 297 | product-surface-polish | packages/app-vue/src/modules/task/components/TaskPlanForm/sections/ReminderSection.vue | C | rule-product-surface-polish-269 |
| 298 | product-surface-polish | packages/app-vue/src/modules/schedule/components/CreateScheduleDialog.vue | C | rule-product-surface-polish-270 |
| 299 | product-surface-polish | packages/app-vue/src/modules/notification/components/NotificationItem.vue | C | rule-product-surface-polish-271 |
| 300 | product-surface-polish | packages/app-vue/src/modules/schedule/components/PlannerDayDialog.vue | C | rule-product-surface-polish-272 |
| 301 | product-surface-polish | packages/app-vue/src/modules/schedule/components/PlannerEventDialog.vue | C | rule-product-surface-polish-273 |
| 302 | product-surface-polish | packages/app-vue/src/modules/setting/views/UserSettingsView.vue | C | rule-product-surface-polish-274 |
| 303 | product-surface-polish | packages/app-vue/src/modules/setting/components/SettingsNavigation.vue | C | rule-product-surface-polish-275 |
| 304 | product-surface-polish | packages/app-vue/src/modules/task/components/TaskPlanForm/sections/TimeConfigSection.vue | C | rule-product-surface-polish-276 |
| 305 | product-surface-polish | packages/app-vue/src/modules/task/components/TaskPageToolbar.vue | C | rule-product-surface-polish-277 |
| 306 | product-surface-polish | packages/app-vue/src/modules/goal/components/GoalPageToolbar.vue | C | rule-product-surface-polish-278 |
| 307 | product-surface-polish | packages/app-vue/src/modules/schedule/views/ScheduleCalendarView.vue | A | residual lock in app-vue-source-locks.json |
| 308 | product-surface-polish | packages/app-vue/src/modules/repository/components/DocumentWorkspaceToolbar.vue | C | rule-product-surface-polish-279 |
| 309 | product-surface-polish | packages/app-vue/src/modules/notification/views/SSEMonitorPage.vue | C | rule-product-surface-polish-280 |
| 310 | product-surface-polish | packages/app-vue/src/modules/goal/views/GoalDetailView.vue | C+A | rule-product-surface-polish-256; residual lock in app-vue-source-locks.json |
| 311 | use-desktop-window-controls | packages/app-vue/src/shared/composables/useDesktopWindowControls.ts | C | rule-use-desktop-window-controls-281 |
| 312 | use-desktop-window-controls | packages/app-vue/src/di/keys.ts | C | rule-use-desktop-window-controls-282 |
| 313 | use-desktop-window-controls | packages/app-vue/src/shared/utils/desktop-auth-recovery.ts | C+A | rule-use-desktop-window-controls-283; residual lock in app-vue-source-locks.json |
| 314 | use-desktop-window-controls | packages/app-vue/src/shared/types/electron.d.ts | C+A | rule-use-desktop-window-controls-284; residual lock in app-vue-source-locks.json |
| 315 | combine-date-and-time-keep-boundary | packages/app-react/src/screens/TaskEditorScreen.tsx | C | rule-combine-date-and-time-keep-boundary-285 |
| 316 | combine-date-and-time-keep-boundary | packages/app-react/src/screens/ScheduleEventEditorScreen.tsx | C+A | rule-combine-date-and-time-keep-boundary-286; residual lock in app-vue-source-locks.json |
| 317 | combine-date-and-time-keep-boundary | packages/app-react/src/screens/ScheduleEventEditorScreen.tsx | C+A | rule-combine-date-and-time-keep-boundary-286; residual lock in app-vue-source-locks.json |
| 318 | combine-date-and-time-keep-boundary | packages/utils/src/index.ts | C | rule-combine-date-and-time-keep-boundary-287 |
| 319 | format-date-keep-boundary | packages/app-vue/src/modules/goal/views/GoalDetailView.vue | C+A | rule-format-date-keep-boundary-288; residual lock in app-vue-source-locks.json |
| 320 | format-date-keep-boundary | packages/app-vue/src/modules/goal/components/GoalProgressRow.vue | C | rule-format-date-keep-boundary-289 |
| 321 | format-date-keep-boundary | packages/app-vue/src/modules/task/utils/task-plan-presentation.ts | C | rule-format-date-keep-boundary-290 |
| 322 | format-date-keep-boundary | packages/app-vue/src/modules/task/views/TaskDetailView.vue | C | rule-format-date-keep-boundary-291 |
| 323 | format-date-keep-boundary | packages/app-vue/src/modules/goal/views/GoalDetailView.vue | C+A | rule-format-date-keep-boundary-288; residual lock in app-vue-source-locks.json |
| 324 | format-datetime-keep-boundary | packages/app-react/src/utils/entity-presentation.ts | C | rule-format-datetime-keep-boundary-292 |
| 325 | format-datetime-keep-boundary | packages/app-vue/src/modules/goal/components/dialogs/GoalReviewInspectDialog.vue | C | rule-format-datetime-keep-boundary-293 |
| 326 | format-message-time-keep-boundary | packages/app-react/src/hooks/useAIWorkspace.ts | C+A | rule-format-message-time-keep-boundary-294; residual lock in app-vue-source-locks.json |
| 327 | format-message-time-keep-boundary | packages/app-vue/src/modules/notification/views/SSEMonitorPage.vue | C+A | rule-format-message-time-keep-boundary-295; residual lock in app-vue-source-locks.json |
| 328 | format-message-time-keep-boundary | packages/app-react/src/hooks/useAIWorkspace.ts | C+A | rule-format-message-time-keep-boundary-294; residual lock in app-vue-source-locks.json |
| 329 | format-message-time-keep-boundary | packages/app-vue/src/modules/notification/views/SSEMonitorPage.vue | C+A | rule-format-message-time-keep-boundary-295; residual lock in app-vue-source-locks.json |
| 330 | format-time-range-keep-boundary | packages/app-react/src/hooks/useScheduleAgenda.ts | C+A | rule-format-time-range-keep-boundary-296; residual lock in app-vue-source-locks.json |
| 331 | format-time-range-keep-boundary | packages/app-react/src/hooks/useScheduleAgenda.ts | C+A | rule-format-time-range-keep-boundary-296; residual lock in app-vue-source-locks.json |
| 332 | format-time-range-keep-boundary | packages/app-vue/src/modules/schedule/planner/planner-presentation.ts | C | rule-format-time-range-keep-boundary-297 |
| 333 | format-time-range-keep-boundary | packages/app-vue/src/modules/schedule/components/PlannerDayDialog.vue | C | rule-format-time-range-keep-boundary-298 |
| 334 | format-time-range-keep-boundary | packages/app-vue/src/modules/schedule/components/PlannerEventDialog.vue | C | rule-format-time-range-keep-boundary-299 |
| 335 | format-time-range-keep-boundary | packages/app-vue/src/shared/utils/format-calendar-event-time-range.ts | C | rule-format-time-range-keep-boundary-300 |
| 336 | is-plain-object-keep-boundary | packages/app-vue/src/shared/utils/ipc/sanitize-for-ipc.ts | C | rule-is-plain-object-keep-boundary-301 |
| 337 | is-plain-object-keep-boundary | packages/app-vue/src/shared/utils/ipc/sanitize-for-ipc.ts | C | rule-is-plain-object-keep-boundary-301 |
| 338 | is-plain-object-keep-boundary | apps/desktop/src/main/utils/http-envelope-guards.ts | C | rule-is-plain-object-keep-boundary-302 |
| 339 | is-plain-object-keep-boundary | packages/app-vue/src/modules/ai/composables/isRecord.ts | C | rule-is-plain-object-keep-boundary-303 |
| 340 | to-date-input-keep-boundary | packages/app-vue/src/modules/goal/components/dialogs/GoalDialog.vue | C | rule-to-date-input-keep-boundary-304 |
| 341 | to-date-input-keep-boundary | packages/app-vue/src/modules/task/components/TaskPlanForm/sections/TimeConfigSection.vue | C | rule-to-date-input-keep-boundary-305 |
| 342 | to-date-input-keep-boundary | packages/app-vue/src/shared/components/ProductDatePicker.vue | C | rule-to-date-input-keep-boundary-306 |
| 343 | to-time-input-keep-boundary | packages/app-react/src/screens/TaskEditorScreen.tsx | C | rule-to-time-input-keep-boundary-307 |
| 344 | to-time-input-keep-boundary | packages/app-react/src/screens/ScheduleEventEditorScreen.tsx | C+A | rule-to-time-input-keep-boundary-308; residual lock in app-vue-source-locks.json |
| 345 | to-time-input-keep-boundary | packages/app-react/src/screens/ScheduleEventEditorScreen.tsx | C+A | rule-to-time-input-keep-boundary-308; residual lock in app-vue-source-locks.json |
| 346 | to-time-input-keep-boundary | packages/utils/src/index.ts | C+A | rule-to-time-input-keep-boundary-309; residual lock in app-vue-source-locks.json |
| 347 | dead-surfaces | packages/app-vue/src/modules/goal/components/index.ts | C | rule-dead-surfaces-310 |
| 348 | dead-surfaces | packages/app-vue/src/modules/task/components/types.ts | C | rule-dead-surfaces-311 |
| 349 | dead-surfaces | packages/app-vue/src/modules/task/components/index.ts, packages/app-vue/src/modules/task/components/TaskAIGenerationDialog.vue, packages/app-vue/src/shared/utils/format-schedule-duration-minutes.ts | C | rule-dead-surfaces-312 |
| 350 | dead-surfaces | packages/app-vue/src/modules/account/components/index.ts | C | rule-dead-surfaces-313 |
| 351 | dead-surfaces | packages/app-vue/src/modules/account/components/ProfileCard.vue, packages/app-vue/src/modules/account/components/ProfileCard.stories.ts, packages/app-vue/src/modules/account/components/ProfileForm.vue, packages/app-vue/src/modules/account/components/ProfileForm.stories.ts | C | rule-dead-surfaces-314 |
| 352 | dead-surfaces | packages/app-vue/src/modules/schedule/components/index.ts | C | rule-dead-surfaces-315 |
| 353 | dead-surfaces | packages/app-vue/src/modules/schedule/components/ConflictAlert.vue, packages/app-vue/src/modules/schedule/components/ConflictAlert.stories.ts, packages/app-vue/src/modules/schedule/components/ScheduleConflictAlert.vue, packages/app-vue/src/modules/schedule/components/ScheduleConflictAlert.stories.ts, packages/app-vue/src/modules/schedule/components/ScheduleEventList.vue, packages/app-vue/src/modules/schedule/components/ScheduleEventList.stories.ts, packages/app-vue/src/modules/schedule/components/ScheduleFormDemo.vue, packages/app-vue/src/modules/schedule/components/ScheduleFormDemo.stories.ts | C | rule-dead-surfaces-316 |
| 354 | localePresentation | packages/app-vue/src/modules/schedule/components/CreateScheduleDialog.vue | C | rule-localepresentation-317 |
| 355 | localePresentation | packages/app-vue/src/modules/task/components/TaskPlanForm/sections/ReminderSection.vue | C | rule-localepresentation-318 |
| 356 | localePresentation | packages/app-vue/src/modules/task/components/TaskPlanForm/sections/RecurrenceSection.vue | C | rule-localepresentation-319 |
| 357 | localePresentation | packages/app-vue/src/modules/task/components/TaskPlanForm/sections/TimeConfigSection.vue | C | rule-localepresentation-320 |
| 358 | localePresentation | packages/app-vue/src/modules/goal/views/GoalDetailView.vue | C | rule-localepresentation-321 |
| 359 | localePresentation | packages/app-vue/src/modules/notification/views/SSEMonitorPage.vue | C | rule-localepresentation-322 |
| 360 | key-result-calculation-presentation | scan packages/app-vue/src/modules/task | C+A | rule-key-result-calculation-presentation-323; residual lock in app-vue-source-locks.json |
| 361 | CapsulePreviewShell | packages/app-vue/src/modules/task/components/TaskQuickSurface.vue | C | rule-capsulepreviewshell-324 |
| 362 | CapsulePreviewShell | packages/app-vue/src/layouts/shell/previews/GoalCapsulePreview.vue | C | rule-capsulepreviewshell-325 |
| 363 | CapsulePreviewShell | packages/app-vue/src/layouts/shell/previews/ScheduleCapsulePreview.vue | C | rule-capsulepreviewshell-326 |
| 364 | CapsulePreviewShell | packages/app-vue/src/modules/routine/components/RoutineCapsulePreview.vue | C | rule-capsulepreviewshell-327 |
| 365 | CapsulePreviewShell | packages/app-vue/src/modules/notification/components/NotificationCapsulePreview.vue | C | rule-capsulepreviewshell-328 |
| 366 | CapsulePreviewShell | packages/app-vue/src/layouts/shell/previews/NoteCapsulePreview.vue | C | rule-capsulepreviewshell-329 |
| 367 | CapsulePreviewShell | packages/app-vue/src/shared/components/index.ts | A | residual lock in app-vue-source-locks.json |
| 368 | CapsulePreviewShell | packages/app-vue/src/shared/components/CapsulePreviewShell.vue | C | rule-capsulepreviewshell-330 |
| 369 | CapsulePreviewShell | packages/app-vue/src/shared/components/CapsulePreviewHeader.vue | C | rule-capsulepreviewshell-331 |
| 370 | CapsulePreviewShell | packages/app-vue/src/shared/components/CapsulePreviewFooter.vue | C | rule-capsulepreviewshell-332 |
| 371 | CapsulePreviewShell | packages/app-vue/src/shared/components/CapsulePreviewState.vue | C | rule-capsulepreviewshell-333 |
