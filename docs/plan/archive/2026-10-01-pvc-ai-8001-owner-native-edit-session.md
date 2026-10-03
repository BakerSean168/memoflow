---
tags: [plan, archive, ai, goal, shell]
description: PVC-AI-8001 Owner Native Edit Session implementation and acceptance evidence
created: 2026-10-01T00:00:00+00:00
updated: 2026-10-01T00:00:00+00:00
---

# PVC-AI-8001 — Owner Native Edit Session

## Status

Accepted / frozen on 2026-10-01.

Implementation was delegated to Codex Team gpt-6.1-sol at medium reasoning effort in the isolated product/vnext-ai-8001 worktree. ChatGPT Web independently reviewed the resulting architecture and diff, identified lifecycle/semantic edge cases, commissioned a focused repair pass, and reran acceptance gates.

## Accepted architecture

ADR-112 is implemented as a narrow owner-native UI seam:

- OwnerNativeEditSession<Patch, Child, ChildId, Field, State> exposes only semantic edit operations;
- OwnerNativeEditSurface<Session> exposes openCreate, openExisting, and locate;
- Goal supplies the first typed adapter through GoalNativeEditSession;
- AppShell owns one shell-scoped Goal native-surface provider;
- GoalModuleLayout registers only the currently live Goal owner session;
- GoalDialog remains the canonical draft, validation, submit, cancel and focus owner.

No AI runtime types, Pinia internals, Vue refs/reactive objects, arbitrary path mutation, DOM selectors, global singleton, event bus, or universal form engine cross this boundary.

## Goal owner session behavior

The native Goal session supports patch over an explicit typed Goal patch shape, addChild/removeChild using Goal Key Result semantics, semantic focus using Goal-owned refs, requestSubmit through GoalDialog's existing save path, requestCancel through GoalDialog's native close path, and detached readDraftState snapshots.

Manual edits and semantic patches mutate the same GoalDialog reactive draft. There is no mirrored AI draft.

Values crossing the session boundary are detached before entering or leaving the owner draft. Existing nested KR targets are copied on reset, and rejected combined patches preflight all child constraints before mutating any field.

## Validation and lifecycle rules

Semantic edits obey owner rules that normal controls already enforced:

- lifecycle intent is checked with the canonical Goal transition rule before any persistence;
- invalid semantic lifecycle jumps remain on the owner form and issue no mutation;
- planning-window, reminder, request-schema and KR validation still gate canonical submit;
- create reminders are supported by the existing CreateGoalSchema and are persisted through the canonical create request without adding reminder chrome to the native create UI;
- create-mode session identity remains goalId: null.

Legal lifecycle-transition runtime failure retains the pre-existing GoalDialog owner behavior: already-saved Goal fields remain authoritative, the saved Goal result is emitted, and the native dialog closes. AI-8001 deliberately does not redefine that owner submit policy.

## Busy / cancellation behavior

GoalDialog now publishes its actual submission busy state to the BusinessPanel surface status.

While submit or lifecycle transition is in flight:

- semantic patch/add/remove/cancel/re-submit are rejected;
- native Dialog dismissal is ignored;
- supported native Goal mutation controls are disabled;
- submission status intent is captured before awaiting owner services.

This prevents overlay/Escape/native controls from racing a semantic submit.

## Shell orchestration

The AppShell-scoped Goal surface host opens Goal create/edit through the existing shell/router path, preserves shell leave-guard and business-tab decisions, waits for edit aggregate loading before publishing an edit session, rejects route exit/unavailable owner state/shell disposal rather than polling, rechecks disposal after async navigation before installing readiness watchers, preserves unrelated Goal filter query state, keeps query-only route changes bound to the same native draft, invalidates stale handles across KeepAlive deactivation, and prevents stale aggregate responses from replacing a newer owner session.

No AI workflow migration is part of this ticket.

## Preserved boundaries

The following remain intentionally unchanged for PVC-AI-8101 and later:

- AIGoalDraftEditor;
- useAIGoalWorkflow and the existing Goal AI workflow panel;
- workflow restart/retry/recovery behavior;
- Task native editing;
- Knowledge native capture;
- BusinessPanel workflow surface.

AI-8001 establishes the foundation only.

## Independent acceptance

Focused owner/shell regression suite:

- 4 files / 86 tests passed
- GoalDialog.spec.ts
- GoalModuleLayout.spec.ts
- AppShell.spec.ts
- useShellRouterSync.spec.ts

The focused suite locks manual edit ↔ semantic patch sharing one draft, detached values, KR add/remove/patch semantics, atomic rejected patches, create/edit identity, reminder validation and create reminder persistence, lifecycle preflight and owner fallback semantics, canonical expectedVersion/update/transition flow, busy dismissal and deferred-transition race protection, KeepAlive stale-handle invalidation, aggregate readiness/stale-response/disposal rejection, dirty/busy leave guards, tab-limit rejection, unrelated query preservation, and semantic focus without external DOM selection.

Repository gates:

- app-vue:typecheck --skip-nx-cache: passed with all 28 dependency tasks;
- memoflow:governance-check --skip-nx-cache: passed;
- targeted ESLint: passed;
- targeted Prettier: passed;
- test inventory: 1336 files (unit 1155, integration 34, smoke 3, boundary-ipc 8, boundary-main 8, e2e 63, perf 2, governance 63);
- git diff --check: passed.

An earlier attempt to run uncached typecheck and uncached governance simultaneously caused their dependency builds to race on shared generated dist output. Re-running uncached typecheck alone passed; this was validation-process interference, not an AI-8001 code failure.

## Result

PVC-AI-8001 is closed. Goal now proves ADR-112's Owner Native Edit Session / Surface Orchestrator foundation. The next dependent ticket is PVC-AI-8101 — Goal native AI workflow vertical slice.
