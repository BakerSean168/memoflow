# ADR-080 — task/schedule/reminder/setting DomainError → ResultErrorException Migration Review Evidence

> Date: 2026-08-18
> Branch: `refactor/acr-080-rest-domainerrors`
> Base: `df68c767` (main, after PR #238 goal pilot)
> Scope: remaining 24 feature DomainError subclasses in task/schedule/reminder/setting.
> Implementing agent: opencode-go/deepseek-v4-flash.

## 1. Review outcome

All 24 feature DomainError subclasses migrated to `ResultErrorException`
(`@memoflow/contracts/result`) per the proven ACR-080 pattern:

- task (10): task-errors.ts ×9 + priority-calculation.error.ts ×1
- schedule (7): value-objects/errors.ts
- reminder (4): domain/errors/reminder-errors.ts
- setting (3): domain/errors/setting-errors.ts

**Inventory `DOMAIN_ERROR_SUBCLASS` 31 → 7** (only utils' 7 generic classes remain); total
**52 → 28**. Scanner `passed`.

## 2. Field mapping (careful cases)

- `operationId` (DomainError 5th arg) → merged into `context` as `{ field, operationId }`
  (ResultErrorException has no operationId; reminder `ReminderTemplateNotFoundError`).
- `originalError` (schedule `ScheduleTaskCreationError`/`UpdateError` override) → `cause`
  (position 6); the `override readonly originalError` declarations removed.
- `ScheduleStrategyNotFoundError` `override readonly context` declaration removed — context now
  passed at position 4 (ResultErrorException owns the field).
- Simple `super(code, msg)` forms → `super(msg, code)` (positions swapped).
- Messages/codes preserved exactly; reader constructor params (`sourceModule`, `taskId`,
  `templateId`, etc.) kept.

## 3. Mapper behavior

`task-write-support.ts`'s `isDomainError` branch no longer matches migrated errors, but they
fall through correctly to `mapInfraErrorToResultError` → `mapInfraErrorToFailure` →
`extractStructuredResultError` (recognizes ResultErrorException first) — behavior preserved,
no mapper/middleware change (per ACR-080 intended).

## 4. Test alignment

- `schedule/.../errors.spec.ts`: `error.originalError` → `error.cause` (same intent; cause now
  carries underlying error).
- `instanceof`-based assertions keep passing (class names unchanged).

## 5. Validation

- task 375, schedule 150, reminder 218, setting 24 tests pass; typecheck clean each.
- Inventory scanner `passed`; 135 stale baseline entries await next rewrite.

## 6. Gate

Review passes. Remaining `DOMAIN_ERROR_SUBCLASS = 7` are utils' generic classes
(BusinessRuleViolationError, NotFoundError, ValidationError, UnauthorizedError, ForbiddenError,
ConflictError, InternalServerError) + `DomainError` base itself — separate batch with wider
consumers.
