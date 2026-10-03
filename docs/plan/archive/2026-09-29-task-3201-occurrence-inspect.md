# PVC-TASK-3201 implementation

Scope: Today row opens a local compact ProductDialogShell overlay. Explicit View Plan keeps the Task Plan route as owner. No occurrence route, Goal mutation, Schedule integration, or Quick Surface change.

1. Add dialog rendering/action tests and Today interaction coverage.
2. Implement read-only workspace context using the canonical Task workspace query; emit all mutation intents to the parent's existing coordinator.
3. Follow selected occurrence store updates, retaining latest facts when Today filters remove a corrected occurrence; clear selection on identity change.
4. Validate focused Vue tests, app-vue typecheck, changed-file ESLint, diff checks, and Playwright discovery.

## Result

Implemented. Today row body opens Inspect; explicit View Plan navigates to task-detail. Dialog facts follow store updates and coordinator results even after a bounded Today refresh removes the selected row. Selection clears on identity change. TaskDetail retains its existing row navigation behavior.

No occurrence route, second coordinator, direct mutation service call, Goal write, Quick Surface change, or Schedule integration was added.

## Validation

All commands ran from the repository root. Final results:

- Focused Vue tests: 5 files, 52 tests passed.
- app-vue typecheck: passed, including dependency builds.
- Changed-file ESLint: passed without findings.
- Governance: passed. An initial accessibility audit finding on a propagation guard was fixed by placing the guard on the checklist label.
- Playwright discovery: 1 Chromium test discovered with the new Today → Inspect → View Plan assertions.
- Browser execution was attempted twice. Both runs failed before reaching the Task assertions: the first timed out waiting for the sign-up response; the second completed registration but remained on the startup splash while waiting for `app-shell`. The 3201 Inspect path itself was therefore not exercised by a completed browser run.
- git diff --check: passed.

Exact validation commands:

```bash
NX_DAEMON=false pnpm nx run app-vue:test -- src/modules/task/components/dialogs/TaskOccurrenceInspectDialog.spec.ts src/modules/task/components/TaskOccurrenceRow.spec.ts src/modules/task/views/TaskManagementView.spec.ts src/modules/task/views/TaskManagementView.runtime.spec.ts src/modules/task/composables/useTaskOccurrenceActionCoordinator.spec.ts
NX_DAEMON=false pnpm nx run app-vue:typecheck
pnpm exec eslint packages/app-vue/src/modules/task/components/dialogs/TaskOccurrenceInspectDialog.vue packages/app-vue/src/modules/task/components/dialogs/TaskOccurrenceInspectDialog.spec.ts packages/app-vue/src/modules/task/components/TaskOccurrenceRow.vue packages/app-vue/src/modules/task/components/TaskOccurrenceRow.spec.ts packages/app-vue/src/modules/task/views/TaskManagementView.vue packages/app-vue/src/modules/task/views/TaskManagementView.spec.ts packages/app-vue/src/modules/task/views/TaskManagementView.runtime.spec.ts packages/app-vue/src/locales/en-US/task.ts packages/app-vue/src/locales/zh-CN/task.ts apps/web/e2e/task/task-completion-loop.spec.ts
NX_DAEMON=false pnpm nx run memoflow:governance-check
TEST_INVENTORY_LIST=1 NX_DAEMON=false pnpm nx run web:e2e -- --list e2e/task/task-completion-loop.spec.ts
git diff --check
```

The initial Nx invocations bootstrapped missing worktree dependencies and reported an Nx daemon startup error before successfully running. Final invocations disable the daemon. Nx also reported an existing flaky-task marker for `time:build`; final typecheck succeeded.

No product-code blocker is currently known. Browser E2E remains an infrastructure/startup validation caveat because both attempts failed before the changed Task surface was reached. No commit or push performed.
