# ADR-080 Pilot — Goal DomainError → ResultErrorException Migration Review Evidence

> Date: 2026-08-18
> Branch: `refactor/acr-080-goal-domainerror-pilot`
> Base: `c48f8e498` (main, after PR #237)
> Scope: goal package 16 DomainError subclasses → ResultErrorException (vertical slice of ACR-080).
> Implementing agent: opencode-go/deepseek-v4-flash.

## 1. Review outcome

Goal's 16 DomainError subclasses migrated to the established `ResultErrorException`
(`@memoflow/contracts/result`) shape:

- `domain/value-objects/errors.ts` (13): GoalNameRequiredError … GoalReviewRatingInvalidError
- `application/errors/weight-snapshot-errors.ts` (2): GoalNotFoundError, KeyResultNotFoundError
- `domain/value-objects/weight-errors.ts` (1): InvalidWeightError

Pattern: `extends DomainError` → `extends ResultErrorException`, constructor
`super(code, message, context?, httpStatus)` → `super(message, code, undefined, context, statusCode)`.
Messages and codes preserved exactly; `super()` argument positions swapped per
ResultErrorException signature. Old `.details` object members and `.statusCode` declarations
removed (ResultErrorException supplies statusCode; object details mapped to `context`).

**Inventory `DOMAIN_ERROR_SUBCLASS` 47 → 31** (goal 16 → 0); total 68 → 52. Scanner `passed`.

## 2. Why safe

- The API pipeline (`extractStructuredResultError` → `mapInfraErrorToFailure` → error
  middleware) recognizes `ResultErrorException` FIRST — no mapper/middleware change needed.
- No goal use-case branches on these class names (verified: only tests consume them).
- `goal.ts` aggregates throw the same classes (types compatible) — no change.
- Referenced-memory confirms ResultErrorException is the intended ACR-080 replacement.

## 3. Test alignment

- `weight-snapshot-errors.spec.ts`: 2 assertions `error.details` (object) → `error.context`
  (same information, now on the ResultErrorException.context field). Intent preserved.
- `instanceof`-based tests (goal-policy, value-objects specs) untouched and pass.

## 4. Validation

- Goal vitest 18 files / 128 passed; typecheck (tsc --noEmit) clean.
- goal no longer imports `DomainError` anywhere.
- Inventory scanner `passed`; 111 stale baseline entries await next rewrite.

## 5. Gate

Pilot passes. This proves the ResultErrorException migration pattern with zero API-contract
regression. Remaining DomainError classes (task 10, schedule 7, reminder 4, setting 3, utils 7,
plus goal's prisma-unique if it still extends DomainError) cleared in follow-on batches.
