# PVC-UI-9002 — Keyboard/focus/a11y/container closure

Date: 2026-10-03. Branch: `product/vnext-ui-9002`, base: `a1b54588a01`. Accepted / frozen after delegated implementation and independent ChatGPT Web review.

## Inventory and repairs

- Goal/Schedule already use native forms; existing tests characterize submit validation, duplicate-submit protection and owner coordination. TaskPlanForm suppressed native submit: it now emits a typed submit event to TaskPlanDialog's existing guarded coordinator. Escape still routes through owner cancel/busy guards. No business mutation or draft contract moved.
- ProductDialogShell now captures the focused opener before Reka autofocus and restores it on dismissal when connected. This closes the shared gap for route-controlled Goal/Task/Schedule dialogs without a DialogTrigger. Reopen/Escape and initial-focus tests exercise real mounted primitives; queued focus cannot run after closing. Registered primitive Dialog/Popover focus return remains covered.
- ModuleCapsule now returns Escape focus from preview content to its preview button. Hover/pinned timers, outside dismissal, owner navigation and no-open-on-focus behavior remain covered. Its responsive navigation button has an explicit accessible name.
- Popover and all four Sheet directions reuse a shared reduced-motion opt-out; Sheet backdrop reuses existing Dialog overlay motion. Sheet's close button has a 32px target and an overridable accessible name; ProductSheetSurface plus every direct App-Vue Sheet consumer supply localized `common.close` copy, so the primitive English fallback does not leak into product surfaces.
- WindowHeader/capsule/panel controls are 32px; business tabs are 36px high with 36px minimum inactive icon width. Tab/workflow names survive hidden labels; Home/workflow leaves one business tab in the Tab sequence. At icon density, inactive close overlays are hidden so a 32px close target cannot cover navigation; activate then close or use Delete. Active workflow retains a separate close target.
- No new scroll owner: AppShell/BusinessPanel wrappers still clip and owner content scrolls. Chromium measures a 520px panel with eight real store-created tabs, verifies no horizontal overflow, 32/36px targets, keyboard Home and exactly one Task business scroll host. Unit tests additionally cover eight tabs plus workflow, arrow wrap/End focus and workflow close reachability.

## Exact changed files

Production:

- `packages/app-vue/src/layouts/shell/BusinessPanel.vue`
- `packages/app-vue/src/layouts/shell/ModuleCapsule.vue`
- `packages/app-vue/src/layouts/shell/WindowHeader.vue`
- `packages/app-vue/src/modules/task/components/TaskPlanForm/TaskPlanForm.vue`
- `packages/app-vue/src/modules/task/components/dialogs/TaskPlanDialog.vue`
- `packages/app-vue/src/modules/task/components/types.ts`
- `packages/app-vue/src/modules/notification/components/NotificationDrawer.vue`
- `packages/app-vue/src/modules/schedule/components/PlannerDayDialog.vue`
- `packages/app-vue/src/modules/schedule/components/PlannerEventDialog.vue`
- `packages/app-vue/src/modules/setting/views/UserSettingsView.vue`
- `packages/app-vue/src/shared/components/GlobalSheet.vue`
- `packages/app-vue/src/shared/components/ProductDialogShell.vue`
- `packages/app-vue/src/shared/components/ProductSheetSurface.vue`
- `packages/ui-vue-shadcn/src/components/ui/popover/PopoverContent.vue`
- `packages/ui-vue-shadcn/src/components/ui/sheet/SheetContent.vue`
- `packages/ui-vue-shadcn/src/components/ui/sheet/index.ts`
- `packages/ui-vue-shadcn/src/lib/motion.ts`

Tests/fixtures:

- `packages/app-vue/src/layouts/shell/BusinessPanel.spec.ts`
- `packages/app-vue/src/layouts/shell/ModuleCapsule.spec.ts`
- `packages/app-vue/src/layouts/shell/WindowHeader.spec.ts`
- `packages/app-vue/src/modules/task/components/dialogs/TaskPlanDialog.spec.ts`
- `packages/app-vue/src/modules/schedule/views/ScheduleInspect.characterization.spec.ts`
- `packages/app-vue/src/shared/components/ProductDialogShell.spec.ts`
- `packages/app-vue/src/shared/reka-primitives.contract.spec.ts`
- `packages/ui-vue-shadcn/src/lib/motion.spec.ts`
- `apps/web/e2e/visual-regression/matrix.spec.ts`
- `apps/web/e2e/visual-regression/pages.ts`
- `apps/web/e2e/visual-regression/README.md`
- `tools/test-system-v2/test-inventory.json`

Reviewed PNGs in `apps/web/e2e/visual-regression/baselines/`:

- `shell-split-light-en-wide.png`
- `shell-narrow-dark-zh-wide.png`
- `shell-focus-light-en-wide.png`
- `shell-capsules-dark-zh-wide.png`
- `overlay-schedule-event-light-en-narrow.png`
- `specialized-ai-native-light-en-wide.png`

Status/evidence: active execution master plan and this archive note.

## Validation

- Focused App-Vue reviewer acceptance: **11 files / 112 tests passed**, including ProductDialogShell, ProductOverlayStateRecipes, Reka contracts, ModuleCapsule, BusinessPanel, WindowHeader, panel-responsive contracts, TaskPlanDialog/Form, GoalDialog and CreateScheduleDialog. Reproduction command below.
- Final reviewer follow-up: BusinessPanel/WindowHeader **2 files / 17 tests passed**; the added Home/Workflow remembered-active-tab cases keep a single roving tab stop and restore the remembered tab only on the business surface.
- Product Sheet close-label localization review: Schedule inspect/settings focused suite **3 files / 45 tests passed**; both narrow Planner sheets assert the zh-CN accessible close name and reject the English fallback. App-Vue typecheck passed again after all direct Sheet consumers were localized.
- `NX_DAEMON=false pnpm nx run ui-vue-shadcn:test --skip-nx-cache`: **2 files / 10 tests passed**.
- `NX_DAEMON=false pnpm nx run-many -t typecheck --projects=app-vue,ui-vue-shadcn --skip-nx-cache`: **passed**, including 27 dependency tasks.
- `pnpm exec playwright test --config apps/web/playwright.visual-regression.config.ts`: **29/29 compare-only passed**, 27 PNGs at zero differing pixels plus two interaction tests. Normal Popover animation and reduced `animation-name: none` are asserted using browser media emulation. Six target-size diffs were inspected before scoped `--update-snapshots`; the other 21 baselines were unchanged.
- `pnpm exec vue-tsc --noEmit -p apps/web/e2e/visual-regression/tsconfig.json`: **passed** after restoring dependency declarations with `NX_DAEMON=false pnpm nx run utils:build --skip-nx-cache`.
- Final shell/interaction compare after workflow-density follow-up: `pnpm exec playwright test --config apps/web/playwright.visual-regression.config.ts --grep 'UI-9002|shell\.'`: **6/6 passed**.
- Targeted ESLint and Prettier over changed Vue/TS/Markdown: **passed**; `git diff --check`: **passed**.
- `pnpm test:inventory`: **1301 files**, unit 1120 / integration 34 / smoke 3 / boundary-ipc 8 / boundary-main 8 / e2e 64 / perf 2 / governance 62. `pnpm test:targets:check`: **passed**.
- `NX_DAEMON=false pnpm nx run memoflow:governance-check --skip-nx-cache --parallel=1`: **passed**. First concurrent attempt hit collector timeouts; serial uncached retry passed without changing governance rules.

## Limits / remaining gaps

No Electron OS host, assistive-technology session, or authenticated prod-like deployment was run. Browser evidence uses the existing production-component fixtures with deterministic owner doubles. Compact owner-specific button variants were not globally enlarged; repaired sizes follow the workspace shell contract. No product-wide accessibility compliance claim is made.

The known full App-Vue shell-width/Task-capsule failures and contracts stale Goal index failure were not repaired or rerun; those suites are outside this scoped closure. An optional Nx visual-fixture typecheck initially encountered a concurrent dependency clean/build race, not a source error; dependency declarations were restored and the direct final fixture typecheck passed. Independent review re-ran the complete 11-file App-Vue matrix at **112/112**, UI primitives at **10/10**, the complete Chromium matrix at **29/29**, serial App-Vue/UI typechecks, inventory/target/sync checks and full uncached governance. No blockers remain for the implemented scope after independent review and final validation.

Focused App-Vue reproduction:

```sh
pnpm exec vitest run --config packages/app-vue/vitest.config.ts \
  packages/app-vue/src/shared/components/{ProductDialogShell,ProductOverlayStateRecipes}.spec.ts \
  packages/app-vue/src/shared/reka-primitives.contract.spec.ts \
  packages/app-vue/src/layouts/shell/{ModuleCapsule,BusinessPanel,WindowHeader,panel-responsive.contract}.spec.ts \
  packages/app-vue/src/modules/task/components/dialogs/TaskPlanDialog.spec.ts \
  packages/app-vue/src/modules/task/components/TaskPlanForm/TaskPlanForm.spec.ts \
  packages/app-vue/src/modules/goal/components/dialogs/GoalDialog.spec.ts \
  packages/app-vue/src/modules/schedule/components/CreateScheduleDialog.spec.ts
```
