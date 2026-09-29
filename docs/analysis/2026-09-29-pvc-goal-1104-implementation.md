# PVC-GOAL-1104 — Single KR calculation presentation map

**Status:** Implemented / validated on 2026-09-29.

## Implemented

- Added Goal-owned `key-result-calculation-presentation.ts` as the presentation authority for the five KR calculation methods.
- Frozen order and user vocabulary:
  - `Sum` -> Cumulative / 累计
  - `Average` -> Average / 平均值
  - `Max` -> Maximum / 最高值
  - `Min` -> Minimum / 最低值
  - `Last` -> Latest / 最新值
- Centralized the future Record input semantic:
  - `Sum` -> `delta` / Change this time / 本次变化
  - `Average` / `Max` / `Min` / `Last` -> `sample` / Recorded value / 本次记录值
- The utility is presentation-only. It does not perform KR aggregation and does not manufacture units; the unit remains the KR-owned unit.
- Replaced duplicated/raw method presentation in:
  - `GoalKeyResultCardEditor.vue`
  - `GoalKeyResultDraftEditor.vue`
  - `KeyResultDetailView.vue`
  - `AIGoalDraftEditor.vue`
- Exported the Goal-owned presentation contract for owner reuse.
- Normalized zh-CN method wording from 最大值 / 最小值 / 最后一次 to the frozen 最高值 / 最低值 / 最新值 vocabulary.
- Task was intentionally not given method/unit projection here; `TASK-3301A` remains the owner of that contract expansion.

## Tests

The focused suite covers:

- exhaustive/ordered five-method mapping;
- zh-CN/en-US labels for every method;
- Sum delta vs other methods sample record semantics;
- Goal editor option labels and domain enum emissions;
- saved KR draft-row presentation and unit preservation;
- KeyResult Detail localized method presentation;
- AI Goal draft localized Goal-owned method options without changing draft payload;
- absence of a competing Task method-label map.

The component tests use deterministic local Select stubs to validate presentation and emitted domain values without coupling the unit suite to Reka portal/pointer behavior.

## Validation

| Check | Result |
| --- | --- |
| Focused app-vue suite | PASS — 7 files / 52 tests |
| `app-vue:typecheck` | PASS |
| Changed-file ESLint | PASS |
| Prettier on changed TS/Vue files | PASS / unchanged after formatting |
| `git diff --check` | PASS |
| `memoflow:governance-check` | PASS |

Nx reported the existing `time:build` flaky-task advisory during typecheck, but the `app-vue:typecheck` target completed successfully.

## Scope held

This ticket did **not** change GoalRecord write/aggregation behavior, Task Goal/KR binding contracts, AI workflow draft schemas, KR routes, or implement GOAL-1201/1202/1203.
