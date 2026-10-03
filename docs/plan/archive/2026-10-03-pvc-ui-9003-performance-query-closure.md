# PVC-UI-9003 — Performance/query closure

Date: 2026-10-03. Branch: `product/vnext-ui-9003`; implementation baseline: `1f9f0a03afe5ec22a8fd4ea54d9335927c2a6c88`. **Status: Accepted / frozen after delegated implementation and independent ChatGPT Web review.** Final integration rebased this ticket onto canonical `10d4e098dbf`, whose only newer change is the UI-9002 acceptance-evidence document.

## Six-check inventory and evidence

Test paths below are under `packages/app-vue/src/` unless explicitly prefixed otherwise.

| Check                                           | Initial classification / change                                                 | Owner path and deterministic evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task Today bounded query                        | Already correct; characterization only                                          | `TaskManagementView` disables the Plan list on Today, queries the Product Time local day with `includeOverdueOpen: true`, and loads distinct referenced Plan details through identity-scoped query keys. Task client → HTTP/IPC → range use case → Prisma/PowerSync constrain owner/date in the query before materialization. `modules/task/views/TaskManagementView.runtime.spec.ts`, `modules/task/composables/useTaskPlanQueries.spec.ts`, Task `get-task-occurrences-by-date-range.test.ts`, `task-occurrence-range.spec.ts`, route/IPC specs. Added exact same-day query-predicate assertions for both adapters and explicit no-`LIMIT` assertions; existing tests cover overdue-open predicates, DST conversion, and deduplicated range/overdue results.                                                                                                                                                               |
| Capsule stale-window reuse                      | Already correct; characterization only                                          | Existing runtime QueryClient and owner keys survive Popover remounts. Existing policies: Task occurrences/Schedule/Routine 30s, Goal Home 45s, Task Plans/recent Knowledge 60s; Notification 30s. Added exact boundary/pending-consumer tests in `useTaskOccurrences.spec.ts`, `useGoalHomeSummary.spec.ts`, `useRecentKnowledgeNotes.spec.ts`, `useScheduleCalendar.cache.spec.ts`, `RoutineCapsulePreview.spec.ts`; existing Notification query tests cover concurrency/remount/expiry. No new TTL or cache.                                                                                                                                                                                                                                                                                                                                                                                                               |
| No duplicate hover requests                     | Already correct; characterization only                                          | `ModuleCapsule.spec.ts` mounts a real Goal owner composable through hover → focus → pin → close/reopen while pending → fresh reopen. Real focus plus pointer-leave grace proves focus retention; mount/unmount counts prove five actual mounts and four intervening unmounts. One service call covers pending/fresh remounts and the 45s−1ms reopen; exactly two calls at the 45s boundary prove required expiry refetch. The Popover, Goal composable and QueryClient are real; only the owner service response is controlled. Other owner concurrency contracts are covered by the preceding row.                                                                                                                                                                                                                                                                                                                          |
| Knowledge lazy catalog                          | Already correct; characterization only                                          | `KnowledgeProjectionWorkspaceView` → current Repository owner tree/list/detail APIs. New test starts with directory-only root, fetches only explicitly expanded `notes`, reuses collapse/reopen, never expands `other`, and makes zero list/body calls. Existing tests cover selected-body-only reads, paged search, cancellation and targeted deeplink ancestor reveal. Recent Knowledge list tests also assert zero body/tree calls. Desktop uses its existing Vault owner index; no second cache introduced.                                                                                                                                                                                                                                                                                                                                                                                                              |
| Schedule owner cache                            | Already correct; characterization only                                          | `useCalendarView` → `useScheduleCalendar` → identity-scoped account facts key; windows filter cached owner facts. New tests count concurrent different-window reads, verify expiry, and count one explicit initial visible-range fetch, then repeat inspect/rerender without another range fetch. The inspect test controls the owner projection; the separate cache test exercises the real composable/QueryClient and owner service call count. Existing mutation/cache tests preserve explicit forced conflict refresh. `useScheduleCalendar.cache.spec.ts`, `useCalendarView.owner-cache.spec.ts`, `ScheduleInspect.characterization.spec.ts`.                                                                                                                                                                                                                                                                           |
| AI native session no duplicate owner fetch loop | Partially correct; Goal/Task production repair, Knowledge characterization only | Existing live-session run/revision guards already avoid repeat probes. Overlapping restore/review before registration reproduced **3 owner reads each**. `useAIGoalWorkflow.ts` / `useAITaskWorkflow.ts` now share only equivalent pending run/revision projections within the composable session; clear on settle/retirement. Tests assert one pending probe/open, live edit preservation through restore/review/rerender, a new owner read after session retirement, shared read failure followed by a fresh successful retry, and independent reads for a newer revision with stale projection suppressed in both completion orders. An older `finally` cannot erase the newer pending projection. Knowledge keeps its registered owner session/draft; characterization asserts no re-projection or extra coordination. Workflow runtime refresh, lost-submit recovery, fail-closed reads and owner submit remain intact. |

## Exact validation commands

All commands run from the worktree root. File filters are positional Vitest arguments forwarded by the existing Nx target.

```bash
NX_DAEMON=false pnpm nx run app-vue:test --skip-nx-cache \
  src/modules/ai/composables/useAIGoalWorkflow.spec.ts \
  src/modules/ai/composables/useAITaskWorkflow.spec.ts \
  src/modules/ai/composables/useAIKnowledgeCapture.spec.ts \
  src/layouts/shell/ModuleCapsule.spec.ts \
  src/modules/goal/composables/useGoalHomeSummary.spec.ts \
  src/modules/repository/composables/useRecentKnowledgeNotes.spec.ts \
  src/modules/repository/views/KnowledgeProjectionWorkspaceView.spec.ts \
  src/modules/schedule/composables/useScheduleCalendar.cache.spec.ts

NX_DAEMON=false pnpm nx run app-vue:test --skip-nx-cache \
  src/modules/task/views/TaskManagementView.runtime.spec.ts \
  src/modules/task/composables/useTaskPlanQueries.spec.ts \
  src/modules/task/composables/useTaskOccurrences.spec.ts \
  src/modules/schedule/views/ScheduleInspect.characterization.spec.ts \
  src/modules/schedule/composables/useCalendarView.owner-cache.spec.ts \
  src/layouts/shell/previews/TaskCapsulePreview.spec.ts \
  src/layouts/shell/previews/GoalCapsulePreview.spec.ts \
  src/layouts/shell/previews/NoteCapsulePreview.spec.ts \
  src/layouts/shell/previews/ScheduleCapsulePreview.spec.ts

NX_DAEMON=false pnpm nx run app-vue:test --skip-nx-cache \
  src/modules/task/composables/useTaskOccurrences.spec.ts \
  src/modules/notification/composables/useNotificationListQuery.spec.ts \
  src/modules/notification/composables/useNotificationUnreadQuery.spec.ts \
  src/modules/routine/components/RoutineCapsulePreview.spec.ts

NX_DAEMON=false pnpm nx run task:test --skip-nx-cache \
  src/server/infrastructure/adapters/prisma/__tests__/task-occurrence-range.spec.ts \
  src/server/application/use-cases/queries/__tests__/get-task-occurrences-by-date-range.test.ts \
  src/api/routes/task-occurrence.routes.spec.ts src/electron/index.spec.ts

NX_DAEMON=false pnpm nx run-many -t typecheck --projects=app-vue,task --parallel=1
# Recheck both project typecheck targets uncached against the verified dependency outputs.
NX_DAEMON=false pnpm nx run-many -t typecheck --projects=app-vue,task --parallel=1 \
  --skip-nx-cache --excludeTaskDependencies
NX_DAEMON=false pnpm nx run-many -t lint --projects=app-vue,task --parallel=2
NX_DAEMON=false pnpm nx run-many -t lint --projects=app-vue,task --parallel=2 --skip-nx-cache
pnpm test:inventory:check
pnpm test:targets:check
NX_DAEMON=false pnpm nx sync:check
{ git diff --name-only -z; git ls-files --others --exclude-standard -z; } | \
  xargs -0 pnpm exec prettier --check
git diff --check
NX_DAEMON=false pnpm nx run memoflow:governance-check --skip-nx-cache --parallel=1
# Recheck the final documentation-only advisory/result update.
NX_DAEMON=false pnpm nx run memoflow:docs-check --skip-nx-cache
```

Results from the finishing review: App-Vue modified suite **8 files / 104 tests passed**; surface contracts **9 / 94 passed**; capsule queries **4 / 19 passed**; Task owner **4 / 47 passed**. These groups overlap in `useTaskOccurrences.spec.ts`; do not treat their sums as unique coverage. The surface group was repeated after strengthening its initial range-read assertion. The WIP adds **18 tests across 12 spec files**, with production changes confined to the two AI composables.

Relevant typechecks passed (2 project targets plus 27 dependency tasks; 28/29 initial tasks reused valid Nx outputs), followed by uncached serial project typechecks against those dependency outputs. Both project lint targets ran uncached and passed. Inventory **1301 files** (1120 unit, 34 integration, 3 smoke, 8 boundary-ipc, 8 boundary-main, 64 e2e, 2 perf, 62 governance), target governance and Nx sync passed. Final Prettier includes both tracked WIP and the untracked archive note; diff check passed. Full uncached governance passed with `--parallel=1`: the main target plus all 6 dependency tasks succeeded.

The earlier WIP note recorded an architecture-test timeout under concurrent load and a simultaneous Contracts rebuild interrupting utils declaration generation; serial retries passed without source/config/timeout changes. Those are prior transient validation failures, not reproduced baseline defects. Nx emitted flaky-task advisories for `utils:build`, `test-system-v2:test` and `test-system-v2:test:governance`; every named target passed in the finishing checks. No persistent baseline failure was encountered in the finishing validation. Independent ChatGPT Web acceptance additionally reran the two repaired AI workflow specs plus the real Capsule owner-reuse spec (**3 files / 60 tests**) and the Task range/use-case core (**2 files / 8 tests**); both passed uncached.

## Architectural review

- `pendingProjection` is one composable-session handle keyed by exact run ID/revision, sharing only the unresolved projection. Its identity-checked `finally` clears success and failure without clearing a newer handle; retirement clears the handle and advances the existing projection epoch. No settled owner result or `NOT_FOUND` survives in this handle.
- Existing live owner sessions retain unsaved edits. The existing epoch checks prevent older pending owner/label/surface responses from projecting after a newer revision. Explicit workflow `get`, owner-first/lost-submit recovery probes, native submit, and forced owner refresh paths remain authoritative and are unchanged.
- Today disables the general Plan list, fetches only its owner Product Time local-day range plus earlier Pending/InProgress facts, then reads each distinct referenced Plan through its existing owner detail key. Prisma `where` and PowerSync SQL apply owner/date/deleted/status predicates before mapping rows; neither path adds an arbitrary row cap.
- Knowledge keeps current root/explicit-branch/selected-note behavior; Schedule keeps its existing identity-scoped whole-account facts cache and forced conflict refresh. There is no production change to either owner, server-state policy, capsule component or visual surface.

## Explicit non-claims

- Task's bound is a **query window/predicate**, not a fixed row cap: local-day occurrences plus all earlier Pending/InProgress occurrences. Overdue history intentionally has no lower-date cutoff; arbitrarily large open backlogs can still yield large results. No silent truncation or claim of constant-memory behavior.
- Schedule caches the existing whole-account owner facts; this work does not add server pagination or claim a bounded Schedule universe. Desktop Vault still uses its current owner index/scan.
- No latency benchmark, wall-clock performance gain, browser/network production trace, Electron OS session, screenshot comparison, or production-load claim. Browser evidence was unnecessary for owner call counts; no visual harness or baseline changed.
- No global cache, generic memoization framework, background polling addition, schema/API changes, cache of failed owner existence probes, or suppression of required recovery/mutation refresh. Sequential explicit workflow `get` calls remain authoritative.
- No commit, push, merge, reset, stash, branch/worktree creation, publishing or independent acceptance performed.
