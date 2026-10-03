---
tags:
  - plan
  - archive
  - goal
description: PVC-GOAL-1401 review window resolver implementation and local validation evidence
created: 2026-09-30T00:00:00Z
updated: 2026-09-30T00:00:00Z
---

# PVC-GOAL-1401 — Review window resolver

Implemented, validated, and independently reviewed on the integrated Product vNext line.

## Result and ownership

`ReviewWindowResolver` is a pure Goal application service receiving authoritative Goal review children, request selection, injected now and Product Time context. The composition root shares one resolver instance between `AddGoalReviewUseCase` and `GetGoalReviewContextUseCase`; the use cases have no window arithmetic. Both still load the identity-scoped aggregate with `includeChildren: true`, without a separate previous-review database query.

Previous authority is the child with greatest `systemContext.windowEndAt`, breaking ties with lexically greatest review ID using deterministic string comparison. Storage order (Prisma and PowerSync currently order by creation time), UI order, paged workspace projections and `reviewedAt` do not participate. The existing aggregate `getLatestReview()` is not used by window resolution.

- Omitted selection or explicit `since-last-review`: previous authoritative window end → captured now; without a previous review, seven Product Time calendar days before now → now.
- Explicit legacy `windowDays`: 1–365 calendar days before now → now, taking precedence over any valid typed selection; existing 7/30 requests retain behavior.
- Explicit `7d` / `30d`: Product Time calendar days before captured now → now.
- Custom: supplied integer start/end remain exact, independent of now. Non-finite/fractional/unsafe integers and start ≥ end fail runtime validation. Resolver repeats validation for direct application callers and returns `VALIDATION_ERROR` before facts reads or mutation.
- If previous end ≥ now, a default interval fails validation; it never adjusts the authoritative previous boundary.

The context builder, progress calculations, record/trend inclusion and manual/Task summary semantics were untouched. Its existing inclusive boundary predicates remain unchanged. Identity, authentication, policy checks, expected-version check/CAS persistence, mutation receipt and review entity behavior remain unchanged. No database schema migration was needed. GOAL-1402 diagnosis, GOAL-1403 UI/deep-link changes and AI logic are outside this implementation.

## Frozen additive contract and compatibility

Contracts infer `GoalReviewWindowSelection` and `GoalReviewWindowOptions` from Zod. Selection is one Goal-owned discriminated union:

```ts
{ mode: 'since-last-review' }
{ mode: '7d' }
{ mode: '30d' }
{ mode: 'custom', windowStartAt: number, windowEndAt: number }
```

Creation accepts optional `window` alongside legacy `windowDays`. Context client/application calls accept the existing optional numeric argument or an options object:

```ts
service.getGoalReviewContext(goalId, 7);
service.getGoalReviewContext(goalId); // authoritative default
service.getGoalReviewContext(goalId, { window: { mode: 'since-last-review' } });
service.getGoalReviewContext(goalId, {
  window: { mode: 'custom', windowStartAt: 101, windowEndAt: 987 },
});
```

HTTP GET retains `?windowDays=7` and adds a JSON-encoded `window` query parameter, encoded by the HTTP adapter. OpenAPI describes this parameter as a JSON string; a generator test verifies that representation. IPC retains positional `(goalId, 7)` and accepts `(goalId, options)`; the production registrations parse both transports with the same invocation schema. Body custom instants are strict numbers; JSON query selection also requires strict numeric instants. Preset objects reject extra supplied boundaries so they cannot be silently ignored.

`GoalReviewCreationView.vue` was read and left unchanged. It still sends explicit seven days to preview and creation, so current UI retains its existing seven-day behavior. Future Review UI can opt into the new modes through the additive contract. Preview/command resolve identically when input, loaded aggregate and clock are equal; separate live requests can have different authoritative clock values, as before.

## Validation evidence

| Check                                                      | Command                                                                                                                                                                     | Result                                                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Goal resolver/use-cases/facts/client/production transports | `NX_DAEMON=false pnpm nx run goal:test --args='review-window goal-review-window goal-review-context-builder add-goal-review get-goal-review-context goal-transport-parity'` | 7 files, 94 tests PASS                                                                   |
| Contracts and OpenAPI                                      | `pnpm exec vitest run --config packages/contracts/vitest.config.ts goal-review-window`                                                                                      | 1 file, 19 tests PASS                                                                    |
| Existing Review/deep-link compatibility                    | `NX_DAEMON=false pnpm nx run app-vue:test --args='GoalDeepLinks.characterization'`                                                                                          | 1 file, 8 tests PASS                                                                     |
| Goal/contracts/app-vue typechecks and dependencies         | `NX_DAEMON=false pnpm nx run-many --targets=typecheck --projects=goal,contracts,app-vue --output-style=static`                                                              | PASS, 31 tasks                                                                           |
| React consumer typecheck                                   | `NX_DAEMON=false pnpm nx run app-react:typecheck --excludeTaskDependencies`                                                                                                 | PASS; dependencies already built in prior lane                                           |
| Changed TypeScript ESLint                                  | `pnpm exec eslint <all changed .ts files>`                                                                                                                                  | PASS, zero errors; one pre-existing `no-explicit-any` warning at parity harness line 145 |
| Whitespace                                                 | `git diff --check`                                                                                                                                                          | PASS                                                                                     |
| Governance                                                 | `NX_DAEMON=false pnpm nx run memoflow:governance-check`                                                                                                                     | PASS                                                                                     |

Total focused evidence: **9 files / 121 tests passing**. Tests cover first/second/third default reviews on a real Goal aggregate, exact continuity, restored reviewedAt mismatch, unordered previous reviews and ID ties, explicit legacy 7/30 precedence, all typed modes, custom preservation and invalid ranges, query/command agreement with identical clock, New York spring-forward (seven days = 167 hours), client forwarding and production HTTP/IPC acceptance/rejection parity. Existing context-builder tests protect facts semantics.

Initial local tooling required pnpm dependency bootstrap and Prisma client generation (no DB mutation). An initial test invocation used unsupported Vitest `--testFile`; it was corrected to the repository target's `--args` forwarding. The first combined typecheck failed from an overlapping Nx contracts build deleting generated chunks while another task imported them. After the overlapping build completed, the combined lane was rerun sequentially and passed. The OpenAPI test initially expected no parameter-level duplicated description; the generator's output was accounted for while preserving an exact string schema assertion. These failures were resolved before recording this implementation marker.

Local logs: `/tmp/goal-1401-tests.log`, `/tmp/goal-1401-ui-compat.log`, `/tmp/goal-1401-typecheck.log`, `/tmp/goal-1401-react-typecheck.log`, `/tmp/goal-1401-governance.log`. Logs are local evidence, not committed artifacts.

## Remaining validation limit

Database integration was not run: `packages/test-utils/src/setup/database.ts` provisions schemas with `prisma db push --accept-data-loss`. The user authorized safe integration only when destructive safeguards need no bypass. No safeguards were weakened. This change has no persistence schema/adapter changes; aggregate/application and production registration tests provide local coverage, while real database integration remains unverified in this run.

## Exact changed files

- `docs/plan/active/2026-09-29-product-vnext-execution-master-plan.md`
- `docs/plan/archive/2026-09-30-pvc-goal-1401-implementation.md`
- `packages/contracts/src/modules/goal/api/goal-review-window.spec.ts`
- `packages/contracts/src/modules/goal/api/goal-review.dto.ts`
- `packages/goal/src/api/routes/review.routes.ts`
- `packages/goal/src/application-client/goal-client-service.ts`
- `packages/goal/src/application-client/ports/goal-api-client.port.ts`
- `packages/goal/src/electron/index.ts`
- `packages/goal/src/infrastructure-client/adapters/goal-review-window.spec.ts`
- `packages/goal/src/infrastructure-client/adapters/http/goal-http.adapter.ts`
- `packages/goal/src/infrastructure-client/adapters/ipc/goal-ipc.adapter.ts`
- `packages/goal/src/server/application/goal.application.port.ts`
- `packages/goal/src/server/application/services/review-window-resolver.spec.ts`
- `packages/goal/src/server/application/services/review-window-resolver.ts`
- `packages/goal/src/server/application/use-cases/commands/__tests__/review-window-continuity.test.ts`
- `packages/goal/src/server/application/use-cases/commands/add-goal-review.use-case.ts`
- `packages/goal/src/server/application/use-cases/queries/get-goal-review-context.use-case.ts`
- `packages/goal/src/server/infrastructure/goal.module.ts`
- `packages/goal/src/server/transport/__tests__/goal-transport-parity.spec.ts`
- `packages/goal/src/server/transport/goal.controller.ts`
