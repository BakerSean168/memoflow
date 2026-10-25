# ACR-080 Final — Retire DomainError Base Class Review Evidence

> Date: 2026-08-18
> Branch: `refactor/acr-080-retire-domainerror`
> Base: `386c2283` (main, after PR #239)
> Scope: delete legacy DomainError base class + utils generic subclasses; migrate BusinessRuleViolationError.
> Implementing agent: opencode-go/deepseek-v4-flash.

## 1. Review outcome

Retired the legacy `DomainError` base class entirely. `DOMAIN_ERROR_SUBCLASS` **7 → 0**;
total findings **28 → 21** (only `RAW_RESULT_MESSAGE_RETHROW:20` + documented
`UI_RAW_RESULT_MESSAGE:1` remain). Scanner `passed`.

## 2. What changed

- **`BusinessRuleViolationError`** → moved to new
  `packages/utils/src/errors/business-rule-violation-error.ts` extending `ResultErrorException`
  (`super(message, 'BUSINESS_ERROR', undefined, context, 400)`). 3 consumers
  (notification-policy, reminder-policy, create-notification.use-case) unchanged (same import
  path `@memoflow/utils/errors`; same class name; `instanceof` still works).
- **6 dead generic classes deleted** (no production throw): NotFoundError, ValidationError,
  UnauthorizedError, ForbiddenError, ConflictError, InternalServerError. Two utils specs updated
  to use equivalent `ResultErrorException('CONFLICT', …, 409)` (same code/context/statusCode).
- **`domain-error.ts` deleted entirely** (313 lines) — `abstract DomainError` + `isDomainError` gone.
- **`extractErrorInfo`** (lived in domain-error.ts, consumed by ai-controller-errors.ts) moved to
  `packages/utils/src/errors/extract-error-info.ts`, deprecated-dead `isDomainError` branch removed.
- **`result-error-mapper.ts`** — removed the dead `isDomainError` branch + import (behavior-neutral).
- **`task-write-support.ts`** — `error instanceof ResultErrorException` only; `isDomainError` import removed.
- **exports** — `errors/index.ts` → business-rule-violation-error + extract-error-info;
  `utils/src/index.ts` → only `BusinessRuleViolationError` (removed dead names; no root consumer).
- **`packages/setting/src/server/domain/index.ts`** — doc comment no longer cites `DomainError`
  (residual reference fixed by orchestrator).

## 3. Validation

- utils 60, notification 237, reminder 376, task 167, ai transport 25 tests pass.
- Typecheck (`tsc --noEmit`) clean for utils, notification, reminder, task, ai.
- Inventory scanner `passed`; 142 stale baseline entries await next rewrite.
- No `DomainError` / `isDomainError` production references remain.

## 4. Gate

Review passes. **ACR-080 (remove DomainError / legacy plumbing) is complete.**
`DOMAIN_ERROR_SUBCLASS = 0`. Remaining inventory = `RAW_RESULT_MESSAGE_RETHROW:20` +
1 documented internal UI surface; those are the next batch (rethrow) then ACR-081 (baseline=0).
