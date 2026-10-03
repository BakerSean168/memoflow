# PVC-TASK-3003A — Task Home Today | Plans closure

Date: 2026-10-03. Canonical verification baseline: `68bbca12ec8`. Status: **Completed / evidence-reconciled.** This closure repairs a missing master-plan completion marker; it does not introduce new production behavior.

## Acceptance evidence

The current Task owner surface already satisfies all six TASK-3003A requirements:

1. `TaskSurface` and `TaskPageToolbar` expose only `today | plans`; no `upcoming` render/control path remains.
2. Today uses the canonical `useTaskToday` owner projection and `isTaskOccurrenceOnTodaySurface`, grouping unresolved overdue facts separately from current-day facts.
3. Occurrence status/sort controls are rendered only for Today and drive only the occurrence projection.
4. Plans has an independent `TaskPlanStateFilter` / server-scoped Plan query; Plan loading/error/pagination state does not leak into Today.
5. Future browsing uses the `task-open-schedule` CTA and routes to canonical `ScheduleCalendar` rather than recreating Upcoming inside Task.
6. Source/runtime contracts lock surface separation, bounded Today reads, Plan-state paging, Goal/KR scope changes, Today-vs-Plans loading/error isolation, and the two-surface toolbar.

UI-9004 subsequently removed the last duplicate DailyTodo/Capsule Today query orchestration by composing the same `useTaskToday` projection, strengthening rather than changing this ticket's ownership model.

## Independent closure validation

```sh
NX_DAEMON=false pnpm nx run app-vue:test --skip-nx-cache --output-style=stream -- \
  src/modules/task/views/TaskManagementView.spec.ts \
  src/modules/task/views/TaskManagementView.runtime.spec.ts \
  src/modules/task/components/TaskPageToolbar.spec.ts \
  --maxWorkers=2
```

Result: **3 files / 36 tests PASS**. No source file was changed for TASK-3003A during this closure. Existing Vue/Pinia duplicate-provide warnings in the runtime test harness are non-failing test diagnostics.

No browser/live-backend/Electron claim is added here; those broader product paths are covered by the later Task/Schedule/UI acceptance tickets and UI-9001/9002 matrices.
