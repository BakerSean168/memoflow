# PVC-TASK-3901 — Task reference acceptance

Date: 2026-09-30  
Branch/worktree: `product/vnext-task-3901` / `_worktrees/memoflow-task-3901`  
Baseline: `dfd9786d4068`  
Status: accepted / frozen. Source repair, focused/full Task validation, typecheck, lint, inventory, governance and isolated browser acceptance are green. Protected destructive database integration remains intentionally deferred.

## Scope

TASK-3901 is an acceptance/freeze ticket, not a redesign ticket. The resumed audit found one production defect that still required code change: T2-14. Task Detail rendered complete-history wording for `workspace.recentOccurrences`, although that projection is intentionally bounded recent history.

Current worktree repair:
- en-US heading: `Recent activity`
- zh-CN heading: `最近执行`
- description explicitly states the slice is not full history
- `TaskDetailView.spec.ts` locks both locales and verifies a five-item recent slice even when the Plan occurrence count is much larger
- no full-history endpoint, pagination, load-more path, or domain/query behavior was added

## T2 matrix

| Finding | Status | Owner | Accepted invariant |
| --- | --- | --- | --- |
| T2-01 Quick Task disconnected | Closed | TASK-3004 | Quick Task uses the canonical Task request surface and normal Task entry points. |
| T2-02 hidden occurrence filter controls Plans | Closed | TASK-3003A | Today occurrence filters and Plans lifecycle/outcome filters are independent. Current behavior is present even though the historical ticket section lacks an Execution paragraph. |
| T2-03 End plan = Archive | Closed | TASK-3002A/B | End Plan uses Abandon; Archive is not the normal lifecycle end action. |
| T2-04 outcome missing | Closed | TASK-3002D | Plan presentation distinguishes Succeeded, Failed, and Abandoned from lifecycle/archive state. |
| T2-05 completion policy residue | Closed | TASK-3002C | Canonical outcome evaluation owns product behavior; compatibility fields are not user-facing policy. |
| T2-06 invalid non-Sum fixed contribution | Closed | TASK-3301A | Fixed automatic recording is Sum-only. |
| T2-07 full occurrence history | Closed | TASK-3003B + 3901 | Task uses bounded occurrence reads; Detail now names the slice truthfully as recent activity. |
| T2-08 phantom page/limit | Closed | TASK-3003B | Plans use server-bound filtering/paging; Today uses a bounded Product Time query. |
| T2-09 KR filter/raw IDs | Closed | TASK-3003B | Goal/KR scope is canonical and user-facing presentation uses names/titles, not raw IDs. |
| T2-10 DailyTodo legacy surface | Closed | TASK-3401 | High-frequency Task hosts share the canonical occurrence action coordinator. |
| T2-11 detail grammar drift | Closed | TASK-3101 | Create/detail uses the Goal-proven property grammar; owner navigation and binding edit are separate. Accepted evidence: 19 focused tests plus 11/11 baseline and 11/11 comparison visual runs with 80 captures. |
| T2-12 Task Home IA conflict | Closed | TASK-3003A | Task Home is Today / Plans; future browsing belongs to Schedule. |
| T2-13 Archive normal UX | Closed | TASK-3002A/D | Archive is not ordinary End Plan UX. |
| T2-14 bounded recent history copy | Closed | TASK-3901 | `Recent activity / 最近执行` plus explicit bounded-history copy, bounded-query characterization and bilingual component/browser assertions. |
| T2-15 fixed-delta-only KR recording | Closed | GOAL-1201/1203 + TASK-3301A/B/C | LinkOnly / Fixed / Prompt are supported; Fixed is Sum-only and Prompt uses the canonical measurement/completion path. |

## User-visible acceptance states

| State | Reference behavior |
| --- | --- |
| Today | Actionable occurrence surface; includes unresolved overdue according to Product Time. |
| Overdue | Query/presentation state only; overdue alone does not fail a Plan. |
| Plans | Long-lived Plan management with independent plan-state/outcome filters. |
| Outcomes | Succeeded / Failed / Ended are visible independently of archive state. |
| Quick Task | Canonical Task creation path. |
| Inspect | Occurrence inspection is a Dialog; no separate occurrence-detail route. |
| Checklist | Operates on occurrence snapshot through the canonical coordinator. |
| Goal/KR LinkOnly | Completion does not write progress automatically. |
| Goal/KR Fixed | Sum-only automatic contribution through durable completion semantics. |
| Goal/KR Prompt | Completion prompts for canonical Goal measurement. |
| Large history | Task Detail shows a bounded recent slice and says so explicitly. |
| Narrow | Prior TASK-3101 browser acceptance covered 360px with no horizontal overflow. |
| Light/dark | Prior TASK-3101 browser acceptance covered both themes. |
| zh-CN/en-US | Prior visual acceptance covered both locales; 3901 adds explicit bilingual recent-activity assertions. |
| Error | Loading/mutation errors remain deterministic; unavailable Goal context does not corrupt Task-only completion behavior. |

## Files changed by 3901

Production:
- `packages/app-vue/src/locales/en-US/task.ts`
- `packages/app-vue/src/locales/zh-CN/task.ts`

Acceptance coverage:
- `packages/app-vue/src/modules/task/views/TaskDetailView.spec.ts`
- `packages/task/src/server/application/services/task-workspace-query.service.spec.ts`
- `apps/web/e2e/task/visual-grammar/task-visual-grammar.spec.ts`

No Task domain, application, query, persistence, Schedule, Goal, AI, or governance production code is changed by this repair.

## Validation boundary

The audit confirmed that the full Task integration target and live Task browser bootstrap enter protected destructive database setup. Those lanes are intentionally not run or bypassed for this ticket, and this report does not claim live-backend E2E coverage.

Final safe validation:
- focused App-Vue Task acceptance specs, including TaskManagementView, TaskDetailView, TaskOccurrenceInspectDialog, TaskOccurrenceRow, useTaskOccurrenceActionCoordinator, Quick Task/request coverage, and task-vnext-ui surface coverage
- fresh `task:test`
- `app-vue:typecheck`
- changed-file ESLint
- test inventory
- `git diff --check`
- governance check
- existing TASK-3101 visual harness if the changed copy affects the Task Detail snapshots

Final source checks:
- no top-level Task Upcoming surface
- no TaskOccurrenceDetailView route
- no normal Archive-as-End path
- no client Goal-record + Task-complete double-write
- bounded recent-history copy remains truthful
- scoped Goal/KR UI does not expose raw IDs
- Product Time remains the time authority

## Final validation and closure

Fresh validation on the development host is green:
- focused App-Vue Task acceptance: 6 files / 72 tests passed, including Task Management, Task Detail, occurrence inspect/row, canonical action coordinator and Task vNext UI surface;
- full `task:test`: 83 files / 755 tests passed, including the bounded workspace query characterization and TASK-3301 measurement/outbox paths;
- `app-vue:typecheck`: passed;
- changed-file ESLint: passed with no reported findings;
- test inventory check: passed at 1,287 test files / 60 E2E files;
- `git diff --check`: passed;
- `memoflow:governance-check`: passed, including core-vNext architecture, cross-domain ownership, Product Time and accessibility audits;
- isolated TASK-3101 production-component Chromium harness: snapshot regeneration passed 11/11 tests, then a clean comparison rerun passed 11/11 across 360/1280px, light/dark and en-US/zh-CN. The new `Recent activity / 最近执行` section is asserted in the browser matrix and captured without horizontal overflow.

One earlier browser attempt collided on the isolated harness port during a duplicated runner launch; the clean rerun after the port was free passed completely, so this is recorded as transient harness contention rather than a product failure.

Source review also confirms no top-level Task Upcoming surface, no TaskOccurrenceDetailView route, no Archive-as-End path, no client GoalRecord + Task completion double-write, truthful bounded recent-history copy, no raw Goal/KR IDs in the scoped UI, and continued Product Time authority.

The protected Task database integration lane is not run because its bootstrap can require destructive `prisma db push --accept-data-loss`. This ticket does not bypass that guard and does not claim live-backend E2E coverage. Within the declared safe acceptance boundary, TASK-3901 is accepted and frozen.
