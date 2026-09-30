# PVC-GOAL-1101 — Remove Reminder from Goal Create

Implemented and independently reviewed on 2026-09-30. Automated validation results are recorded below; browser visual acceptance was not run. No commit or push.

Scope: PVC-GOAL-1101 only, from the [execution master plan](../active/2026-09-29-product-vnext-execution-master-plan.md#pvc-goal-1101--remove-reminder-from-goal-create).

- Create mode does not mount `GoalReminderChip`. Create requests omit `reminderConfig` unconditionally and bypass reminder-only validation, so even a stale non-null draft cannot leak into the request or block submission.
- Reset watches mode as well as open/Goal identity. Create drafts ignore a retained edit Goal prop, clear validation/dirty state and start from Planned; reopening edit restores the persisted reminder. The KR draft editor is keyed by mode so its local unsaved edit form also clears when switching to Create while open.
- Edit keeps the existing chip selector, reminder payload, version handling and date prerequisites. Goal detail, reminder contracts/domain/persistence, GOAL-1102/1103/1301 and Review were not changed.
- Added 11 behavior cases: create hidden and schema-valid omission; injected stale draft; edit preserve/add/change/remove; three missing-date validation cases; open-mode switch and close/reopen reset. The focused suite passes all 25 tests.

Independent review findings and repairs:

- Correctness: the incoming diff reset the parent draft but retained an open KR editor's local form when switching edit to Create. The expanded switch test reproduced the stale unsaved KR form. Keying the editor by mode clears that form without changing the KR editor implementation.
- Test quality: the incoming cleanup only cleared mock call history, allowing application mock results to carry between cases. Application mocks now reset between tests; successful-create tests provide their own result. Reset assertions now cover populated summary/description/labels/KRs, local unsaved KR form removal, both date fields, Planned status, the exact clean request, schema validity and the created event.
- Standards review found no actionable documented-standard violations. Spec review found no additional scope or correctness issues after the repair. Edit tests verify chip availability, model wiring, payloads and date validation; they do not claim to exercise every Reminder menu interaction. Detail reminder code is unchanged.

Changed files:

```text
packages/app-vue/src/modules/goal/components/dialogs/GoalDialog.vue
packages/app-vue/src/modules/goal/components/dialogs/GoalDialog.spec.ts
docs/plan/active/2026-09-29-product-vnext-execution-master-plan.md
docs/plan/archive/2026-09-30-pvc-goal-1101-remove-create-reminder.md
```

Validation commands run from the worktree root:

| Command | Result |
| --- | --- |
| `NX_DAEMON=false NX_SKIP_NX_CACHE=true pnpm nx run app-vue:test -- src/modules/goal/components/dialogs/GoalDialog.spec.ts` | PASS: 1 file, 25 tests; fresh execution after review repairs |
| `NX_DAEMON=false pnpm nx run app-vue:typecheck` | PASS, including 28 dependency tasks |
| `pnpm exec eslint packages/app-vue/src/modules/goal/components/dialogs/GoalDialog.vue packages/app-vue/src/modules/goal/components/dialogs/GoalDialog.spec.ts` | PASS: no errors or warnings |
| `git diff --check` | PASS |
| `NX_DAEMON=false pnpm nx run memoflow:governance-check` | PASS |

The incoming suite also passed 25 tests before review repairs; the stronger switch regression exposed the child-state leak that those assertions missed. Dependencies were already installed and were not changed in this review. No locale keys or snapshot/visual fixtures changed. Validation uses mounted component behavior and the existing create request schema; no browser screenshot comparison was performed.
