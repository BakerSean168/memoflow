---
tags: [plan, archive, ai, shell, architecture]
description: PVC-AI-8131 evidence-based decision on BusinessPanel workflow surface retirement
created: 2026-10-02T11:40:00+00:00
updated: 2026-10-02T12:09:00+00:00
---

# PVC-AI-8131 — Evaluate BusinessPanel workflow-surface retirement

Baseline: `28f6daa5db3`, branch `product/vnext-ai-8131`.

## Decision

**Retain the BusinessPanel workflow surface for now. Do not retire it in AI-8131.**

AI-8101/8111/8112 and AI-8121 completed the intended product-ownership migration:
Goal/Task/Knowledge business editing now belongs to native owner surfaces and the duplicate AI-owned
business forms are gone. That does **not** make the workflow context surface redundant.

The retirement gate in the master plan requires equivalent replacements for clarification/recovery,
dirty/busy/attention, restart/retry and diagnostics. Current code/tests show several responsibilities
still live only in the workflow context surface.

## Gate matrix

| Responsibility                           | Native/business replacement           | Current evidence                                                                     | Decision                      |
| ---------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------- |
| Goal/Task/Knowledge business editing     | Complete                              | GoalDialog, full TaskPlanDialog, Repository Knowledge review                         | Not a reason to keep workflow |
| Goal clarification                       | Incomplete                            | Goal workflow panel + action bar carry durable questions/answers                     | Keep context                  |
| Task clarification                       | Missing outside workflow panel        | AITaskWorkflowPanel owns questions/answers/submit                                    | Keep context                  |
| Knowledge clarification                  | Missing outside workflow panel        | AIKnowledgeCapturePanel owns questions/answers/submit                                | Keep context                  |
| Recovery / retry details                 | Incomplete                            | all three workflow panels render recovery failures/retry state                       | Keep context                  |
| Goal supporting Task/Knowledge overlays  | No native owner replacement by design | retained AI-8101 follow-up overlays in AIGoalWorkflowPanel                           | Keep context                  |
| Revision / warnings / result diagnostics | No equivalent consolidated surface    | workflow panels expose revision, warnings, result status                             | Keep context                  |
| Dirty / busy auto-switch protection      | Unique shell behavior                 | requestWorkflowSurface('automatic') defers on dirty/busy business surface            | Keep context                  |
| Hidden-panel attention                   | Unique shell behavior                 | deferred workflow increments workflowAttentionCount; explicit request reopens        | Keep context                  |
| Restart / restore availability           | Coupled to AI session declaration     | AIChatView restores run, re-declares workflow availability and reopens native review | Keep context                  |
| Mobile context access                    | Unique                                | AI header context toggle exposes workflow context on mobile                          | Keep context                  |

## Architectural boundary after AI-8131

The retained surface is a **workflow context/status surface**, not a product owner surface.

Allowed responsibilities:

- durable workflow status/revision/warnings/result;
- clarification;
- recovery/retry/cancel controls;
- Goal supporting Task/Knowledge follow-up overlays accepted by AI-8101;
- native-owner reopen actions;
- workflow attention and deferred-open behavior;
- diagnostics that do not expose raw internal identity as normal product fields.

Forbidden responsibilities:

- Goal/KR business editing;
- full Task business editing;
- Knowledge content editing/persistence;
- direct owner mutation/service calls;
- a second validation model or duplicate business vocabulary;
- DOM automation of owner surfaces.

## Implementation

1. Document the retention decision and exact blocking responsibilities.
2. Rename comments/documentation semantics from generic "workbench" to workflow context/status where
   useful without changing user-facing behavior.
3. Add governance coverage that:
   - retired AI-owned business editors remain forbidden;
   - the canonical workflow context host remains present while AI-8131 is retained;
   - the workflow context wiring uses status/clarification/recovery/native-open panels and does not
     import native owner form components.
4. Add focused tests locking dirty/busy deferral, hidden-panel attention, business-surface
   preservation, and non-owner workflow-context composition.
5. Update product/master docs with **retained** outcome and explicit future retirement gate.

## Acceptance

AI-8131 is complete when the repository records an evidence-based **retain** decision, the workflow
surface is locked as non-owner context only, existing shell/native behavior remains green, and the
master plan no longer treats deletion as an open action.

Future retirement requires a separate replacement design for every remaining gate above; merely
moving owner editing to native surfaces is insufficient.

## Acceptance evidence — 2026-10-02

**Accepted / retained / frozen.** The evaluation found that business-editor parity is complete but
workflow-context parity is not. Deleting the surface would currently remove Task/Knowledge
clarification, recovery/retry detail, Goal supporting Task/Knowledge overlays, consolidated
revision/result diagnostics, and shell attention deferral while a business owner surface is dirty,
busy, or hidden.

The implemented outcome therefore keeps behavior unchanged and narrows/locks ownership:

- `AIContextPanel` and `BusinessPanel.workflow` are documented as non-owner context/status hosts;
- governance rejects owner dialogs/direct owner mutation symbols inside the canonical workflow
  context files;
- positive architecture locks require the workflow slot, dirty/busy attention guard and canonical
  Goal/Task/Knowledge context composition to remain while this decision is active;
- product docs now record the exact future retirement prerequisites.

Verification:

- workflow context focused matrix: **6 files / 48 tests passed**;
- shell workflow dirty/busy + hidden-panel attention behavior: **2 / 2 passed**;
- core vNext architecture lock: **23 / 23 passed**;
- uncached `app-vue:typecheck` passed with 28 dependency tasks;
- changed-file ESLint (`--max-warnings=0`), Prettier, docs config, test inventory
  (**1,345 files**) and `git diff --check` passed;
- full `pnpm governance:check` passed, including the production architecture scan over
  **1,859 files** and vNext retirement audit (**10 active / 0 staged**).

Three unrelated `useAppShellStore` panel-width numeric assertions fail identically on the untouched
canonical batch (`608/658/645` actual versus `620/666/653` expected). AI-8131 does not modify the
geometry implementation or those tests; the exact A/B reproduction is recorded as inherited
baseline drift rather than a ticket regression.

## ChatGPT Web independent acceptance — 2026-10-02

The retain decision was independently re-checked against the final runtime code rather than accepted
from the implementation note. The workflow surface still has unique canonical responsibilities for
clarification, recovery/retry/cancel/result context, Goal supporting Task/Knowledge overlays,
dirty/busy deferred attention, restore/reopen state and mobile context access. No equivalent owner
surface currently covers that complete set, so retirement would be a functional regression.

Independent reruns after minimizing the diff:

- BusinessPanel / AppShell / RouterSync / AIChatView matrix: **4 files / 56 tests passed**;
- workflow/settings-focused `useAppShellStore` behavior: **6 / 6 passed**;
- core vNext architecture lock: **23 / 23 passed**;
- uncached `app-vue:typecheck`: passed with all 28 dependency tasks;
- changed-source ESLint `--max-warnings=0`, changed-file Prettier, docs config, test inventory and
  `git diff --check`: passed;
- full `pnpm governance:check`: passed, including runtime governance **34 / 34**, HARD-7101
  **22 / 22**, production architecture scan over **1,859 files**, and vNext retirement audit
  (**10 active / 0 staged**).

The three geometry assertions were rerun in both this branch and the untouched canonical batch and
failed with the exact same actual/expected pairs, confirming inherited baseline drift. No P0/P1
finding remains for AI-8131.
