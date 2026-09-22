---
tags:
  - plan
  - archive
  - routine
  - e2e
description: Close the remaining authenticated Routine product-journey verification gap with real Playwright coverage.
created: 2026-09-22T12:34:00+08:00
updated: 2026-09-22T16:40:00+08:00
---

# Routine Authenticated Product Journey Closure

## Context

The 2026-09-21 Routine Configuration Center recovery was archived with one explicit verification deviation: the real authenticated browser CRUD journey was not executed. The current Web E2E harness already supports self-registration, captured-email verification, and authenticated shell entry, so this gap can be closed without using personal credentials or weakening auth.

Canonical base: `main@bc9c4606686` (PR #394 merged).

## Scope

1. Add a real authenticated Web Playwright journey for canonical `/routines`.
2. Cover shell capsule navigation, profile creation, WallClock Routine creation + profile binding, enable/disable, edit, delete, Method Library prefill, and refresh persistence.
3. Add only stable test observability hooks required by the journey; do not alter Routine domain semantics.
4. Register the new journey in the canonical Web-flow inventory so CI cannot silently drop it.
5. Run focused unit/typecheck/lint plus the real Playwright journey and governance/inventory checks.
6. Repair any correctness defect exposed by that real journey without widening into unrelated refactors. The first run exposed Scheduler re-entry of a `superseded` stable scheduling identity; close it in the neutral Scheduler seam and protect it with focused tests.

## Out of scope

- Reintroducing legacy `/reminders` routes or compatibility aliases.
- Changing Routine trigger/domain semantics.
- Treating Web as owner of local-runtime-only profile activation. That behavior remains Desktop/local-runtime capability gated.
- Release publication or production rollout.

## Implementation

### RAE-2701 — Stable product selectors

Add semantic `data-testid` hooks for profile creation/items/actions, Routine card actions/toggle, profile membership checkboxes, and Method Library preset actions where role/name selectors would otherwise be ambiguous.

### RAE-2702 — Authenticated Web product journey

Create `apps/web/e2e/routine/routine-configuration.spec.ts` using `registerAndLogin` with a fresh self-registering account. Prove:

- authenticated shell -> Routine capsule -> `/routines`;
- profile create;
- WallClock Routine create and membership binding;
- disable then enable;
- edit;
- page refresh preserves owner truth;
- Method Library opens a prefilled Routine editor;
- delete Routine, then delete profile.

Assertions must wait on owner-backed UI state instead of arbitrary sleeps.

### RAE-2703 — CI/inventory integration

Add the spec to `apps/web/web-flow-specs.mjs`, refresh test inventory if required, and verify governance.

### RAE-2704 — Scheduler superseded-key re-entry repair

Preserve the stable scheduling-key contract while distinguishing owner-reconcile `superseded` from immutable execution outcomes. A stable key that re-enters the desired set must be re-armed as `pending`; true execution-terminal outcomes remain fail-closed. Cover unchanged and changed desired semantics plus the immutable-terminal guard.

## Acceptance gates

- `pnpm nx run app-vue:test -- --runInBand` or the closest supported focused test target for changed Routine UI.
- `pnpm nx run app-vue:typecheck`
- `pnpm nx run web:lint`
- targeted Playwright execution of the new Routine spec with the real API/Web E2E servers.
- `pnpm test:inventory:check`
- `pnpm docs:check`
- `pnpm governance:check`
- `git diff --check`

## Completion evidence

RAE-2701～2704 are complete locally.

- Authenticated Web product journey: `apps/web/e2e/routine/routine-configuration.spec.ts` self-registers a fresh account, verifies email through the E2E mail-capture path, enters the authenticated shell, navigates through the Routine capsule, and proves profile create, WallClock Routine create/bind, disable/enable, edit, refresh persistence, Method Library prefill, Routine delete, and profile delete. Targeted Chromium Playwright: **1/1 PASS**.
- The first real journey exposed a neutral Scheduler defect: a stable key temporarily marked `superseded` by owner reconcile could not be re-armed when it re-entered the desired set. Production Scheduler now re-arms only `superseded` rows to `pending`, preserves attempt/fencing history, and still rejects `succeeded / skipped / failed / dead_letter` resurrection.
- Persisted execution-terminal key collisions now use the existing `PERSISTED_KEY_COLLISION` failure code with `retryable=false` instead of being misclassified as generic `TRANSACTION_FAILED`.
- Scheduler focused tests: **32/32 PASS** across entity and SchedulingPort adapter coverage; Scheduler typecheck and lint PASS.
- Routine View focused Vitest: **2/2 PASS**; `app-vue` typecheck/lint PASS (repository-pre-existing warnings only, no errors); Web lint PASS (repository-pre-existing warning only, no error).
- Re-run of the authenticated Routine Playwright after the Scheduler repair: **1/1 PASS**; captured server log audit contains no `SchedulingReconcileError`, terminal-key collision, or changed-intent reuse error.
- Test inventory: **1205 files**, E2E **58**; `pnpm test:inventory:check` PASS.
- `pnpm docs:check`, `pnpm governance:check`, and `git diff --check` PASS.

The prior RUI-2502 authenticated-browser deviation is therefore closed for the canonical Web product journey without introducing real-user credentials or weakening authentication. Desktop local-runtime activation remains owned and verified through the existing Desktop capability/IPC lane; Web intentionally keeps `localRuntime=false`.
