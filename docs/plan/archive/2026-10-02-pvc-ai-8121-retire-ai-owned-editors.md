---
tags: [plan, archive, ai, retirement]
description: PVC-AI-8121 retire AI-owned business editors after native parity
created: 2026-10-02T00:00:00+00:00
updated: 2026-10-02T11:35:00+00:00
---

# PVC-AI-8121 — Retire AI-owned product editors

Baseline: `0b82b710abd`, branch `product/vnext-ai-8121`. Sole implementation writer;
independent acceptance, repair, commit/push/merge belong to ChatGPT Web.

## Evidence-based retirement inventory (before product edits)

| Reference                                                                                    | Decision                  | Evidence / protected replacement                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AIGoalDraftEditor.vue`, component spec, barrel export                                       | Delete                    | No runtime panel import/render at baseline; GoalDialog and Goal native session own Goal/KR editing and validation.                                                                                                   |
| `AITaskDraftEditor.vue`                                                                      | Delete                    | Source-only; AITaskWorkflowPanel opens full TaskPlanDialog. No component spec/export found.                                                                                                                          |
| Knowledge AI editor                                                                          | Already absent            | AI-8112 AIKnowledgeCapturePanel opens Repository native review; Web remains projection-only.                                                                                                                         |
| `showGoalDraftEditor`, toggle, ActionBar edit button, persistence option, view wiring, tests | Delete                    | Flag gates only supporting Task/Knowledge controls, not GoalDialog. Keep controls available during review, with existing submission locks.                                                                           |
| `showTaskDraftEditor`, panel prop, composable reset/return, view wiring, tests               | Delete                    | No Task panel editor rendering consumes the prop.                                                                                                                                                                    |
| Shell Goal confirm during editable review                                                    | Migrate to native owner   | `coordinateSubmit(() => confirmGoalAgentRun())` already coordinates native Save. Keep owner-attempt reconciliation / approve-only retry after pending or completed owner submit, plus cancel/recovery/clarification. |
| Goal panel Goal/KR edit emits and view listeners                                             | Delete                    | No rendered Goal/KR business form emits these events. Native owner session is canonical.                                                                                                                             |
| Goal `editableGoal` / `editableKeyResults`                                                   | Retain internal/read-only | Computed native/durable projections used for status and submission reconciliation; not a second form. Remove unrelated persistence options/watch keys.                                                               |
| `editorOverlay` Task/Knowledge and clarification                                             | Retain supporting state   | AI-8101 expressly retains supporting follow-up overlays. Persistence snapshots differences against durable tasks/knowledge, validates same run/revision and schema on restore. No Goal/KR overlay is stored.         |
| Responsive/date boundary enumerations                                                        | Migrate coverage          | GoalDialog timeframe and Task native schedule coverage remain; remove deleted editor reads. Supporting panel keeps AI container coverage.                                                                            |
| Core architecture lock exceptions                                                            | Delete retired paths      | Deleted editor exemptions cannot serve any production surface.                                                                                                                                                       |
| E2E shell confirm expectations                                                               | Migrate                   | Assert native review entry and native Save; retain approval transport retry coverage.                                                                                                                                |
| Current product/module/guides                                                                | Update                    | Explain native surfaces and retained supporting overlays; archive/ADR context stays historical.                                                                                                                      |
| Existing vNext retirement audit                                                              | Extend                    | Lock deleted files and forbidden production editor/visibility symbols; require native replacement surfaces.                                                                                                          |

## Protected responsibilities

Mastra run/revision/draft DTOs, deterministic identities, receipts, restore, retries,
recovery and cancellation remain authoritative. Native GoalDialog, full TaskPlanDialog
and Repository review sessions remain canonical. Supporting Goal Task/Knowledge edits,
clarification, status, diagnostics, result/deep links and dirty/busy guards remain.
BusinessPanel workflow retirement is AI-8131. Quick Task remains separate.

## Implementation and validation

Record exact changes and executed gate evidence here before handoff. Run focused panel,
composable, persistence, chat/shell and static tests; serial uncached typechecks; targeted
format/lint, inventory and governance. Run canonical native E2E after builds finish when
runtime prerequisites permit. No commit, push, PR, merge or other worktree modification.

## Implemented retirement

Deleted files:

- `packages/app-vue/src/modules/ai/components/AIGoalDraftEditor.vue`;
- `packages/app-vue/src/modules/ai/components/AIGoalDraftEditor.spec.ts`;
- `packages/app-vue/src/modules/ai/components/AITaskDraftEditor.vue`.

Removed both visibility refs, resets, returned symbols and props; Goal editor toggle;
Goal/KR panel mutation emits/listeners and obsolete composable editor adapters;
Task panel unused editableTask/update-task contract; Goal/KR persistence inputs/watch keys;
editor barrel export; obsolete edit/hide locale keys; deleted editor audit exemptions.
Normal Goal Save remains coordinated by the native owner. Shell retry remains reachable
when the owner attempt is ambiguous or owner creation succeeded but approval did not.
Supporting Goal overlays are available without any editor visibility state, still disabled
while submission is busy/ambiguous. Supporting Knowledge links no longer display raw IDs.

No Knowledge AI-owned editor exists. AIKnowledgeCapturePanel and Repository native session
remain intact. Durable DTOs/runtime, native session abstractions, BusinessPanel workflow,
Quick Task and Web projection-only ownership are unchanged.

The vNext retirement manifest locks the three deleted paths and requires GoalDialog,
TaskPlanDialog and KnowledgeCaptureReviewDialog. The existing core architecture audit
rejects production editor names, visibility symbols and retired template props/controls.
Tests exercise the static rejection and allow retained native/supporting state.
Current product docs now describe the implemented native ownership; teaching guides mark
older flows as historical. One archived source link receives a retirement mapping only.
Generated reports and accepted archive/ADR narratives remain historical.

## Executed gate evidence

- Expanded App-Vue native/panel/composable/persistence/chat/shell/responsive/time matrix:
  **14 files / 166 tests passed**.
- Final action bar, chat and persistence regression run: **3 files / 25 tests passed**
  (overlaps the expanded matrix; counts are not additive).
- Focused architecture/retirement governance: **2 files / 19 tests passed**.
- Uncached serial `contracts:typecheck`, `ai:typecheck`, `app-vue:typecheck`: passed.
  App-Vue includes 28 dependency tasks. All dist writers completed before Vite E2E.
- Current-worktree uncached `api:build` plus 27 dependencies: passed.
- Changed-source ESLint `--max-warnings=0`: passed.
- Changed-file Prettier: passed.
- Generated test inventory/check: passed, **1,345 files** (unit 1,164; integration 34;
  smoke 3; boundary-ipc 8; boundary-main 8; e2e 63; perf 2; governance 63).
- Retirement path audit: **10 active / 0 staged locks**, passed.
- Production architecture audit: **1,859 files**, passed.
- Canonical AI Playwright compile/list: **13 tests**.
- Updated local-docker Phase E compile/list: **3 tests**; Docker runtime acceptance remains
  separate from this compile evidence.
- Read-only test DB schema comparison: **No difference detected**. No DB reset/push/migration.
- `git diff --check`: passed.

Logs and isolated browser configuration are under `/tmp/ai8121-*.log` and
`/tmp/ai8121-e2e/`. No tracked browser reports are used for this run.

## ChatGPT Web acceptance — 2026-10-02

**Accepted / frozen.** Independent review after implementation confirmed the retirement stayed
inside AI-8121's boundary:

- production code has zero runtime references to `AIGoalDraftEditor`, `AITaskDraftEditor`,
  `showGoalDraftEditor`, `showTaskDraftEditor` or the retired toggle path;
- Goal's retained Task/Knowledge supporting overlays remain visible during review and keep their
  existing busy/ambiguous-submission locks;
- Goal/Task restore, owner-submit reconciliation, retry/recovery, cancellation and native-open
  actions remain intact;
- Knowledge capture remains on the Repository native review introduced by AI-8112;
- BusinessPanel's `workflow` surface remains present for the separate AI-8131 decision;
- tracked Playwright report side effects were restored before acceptance.

ChatGPT Web independently reran the critical acceptance set:

- App-Vue retirement/native critical matrix: **11 files / 109 tests passed**;
- core vNext architecture lock: **18 / 18 tests passed** using the tools/governance Vitest runner;
- uncached `app-vue:typecheck` passed with its 28 dependency tasks;
- full `pnpm governance:check` passed, including runtime governance **34 / 34**, HARD-7101
  **22 / 22**, production architecture lock (**1,859 files**) and vNext retirement audit
  (**10 active / 0 staged locks**);
- changed-source ESLint (`--max-warnings=0`), changed-file Prettier, test inventory
  (**1,345 files**) and `git diff --check` passed.

No material P0/P1 finding remains. AI-8121 removes the duplicate business-editing system while
preserving durable workflow diagnostics and the workflow surface needed for AI-8131 evaluation.
