# Post-Review Fixes (GPT-5.6 secondary review findings) Review Evidence

> Date: 2026-08-19
> Branch: `fix/acr049-gpt56-review-findings`
> Base: `151e6aec` (main, after PR #242)
> Trigger: GPT-5.6-sol (worldclawpro, medium) secondary code review of ADR-049 migration found regressions missed by per-batch validation.
> Implementing agent: opencode-go/deepseek-v4-flash.

## 1. Review trigger & findings

GPT-5.6 secondary review of the DomainError→ResultErrorException migration (Range: #239/#240/#241)
returned: 1 false-positive P0 (timing artifact — reviewed a pre-#240 diff that still imported
isDomainError; current main does NOT import it, verified) + 3 real P1 + 1 P2. The real ones are
fixed here.

## 2. Fixes

### P1a — extractErrorInfo loses structured codes (AI controller regression)

`packages/utils/src/errors/extract-error-info.ts` returned UNKNOWN_ERROR/500 for every Error
(including ResultErrorException), so `ai-controller-errors.toAIControllerFailure` flattened
validation/conflict/not-found → INTERNAL_ERROR.
→ Added `extractStructuredResultError(error)` branch FIRST that preserves
`code/message/httpStatus(=statusCode ?? 400)/context`. Generic Error → UNKNOWN_ERROR fallback kept.
**ai transport 25/25 pass.**

### P1b — HTTP status default 400 → 500 for feature-specific codes

DomainError default httpStatus was 400; ResultErrorException leaves statusCode undefined, so
feature-specific codes (not in ResultCodeToHttpStatus) fell to 500.
→ Added explicit `statusCode: 400` to every migrated feature-specific error class that relied on
the 400 default (task/schedule/setting/goal domain error classes in value-objects/errors-*.ts).
Classes already passing explicit status (reminder 404/400/500, PriorityCalculation 400) left as-is.
ResultCode-mapped classes (VALIDATION_ERROR etc.) left as-is (ResultCodeToHttpStatus handles).

### P1c — hostProposalLifecycle stores raw string as cause

`packages/app-vue/.../hostProposalLifecycle.ts` passed `errorEvent.message` (raw string) as cause.
→ Wrapped the event message as an Error for cause (cause is now an Error/structured object), kept
the thrown message stable. **app-vue hostProposalLifecycle.spec 122/122 pass.**

### P2 — scanner bare `errorMessage` identifier false positive

`failure-contract-inventory.mjs` flagged any bare `errorMessage`/`errorMsg`/`errMessage`/`errMsg`.
→ Removed the bare-identifier branch in `containsResultErrorMessage`; only property-access
`.message` on result/error receivers flags now. Scanner unit test updated (`throw new Error(errorMessage)`
now NOT flagged; `.error.message` / `.failure.message` still flagged).

## 3. Validation

- utils 8 files/63, ai transport 25/25, app-vue hostProposal 122/122 pass (orchestrator re-run).
- Inventory: `{UI_RAW_RESULT_MESSAGE:1}`, `passed`, 0 stale.
- HTTP statuses for feature-specific errors restored to 400.

## 4. Gate

Review-driven fixes pass. Pre-existing dist/ptypo pnpm environment noise (prisma postinstall
EPERM) is unrelated. This validates the value of the GPT-5.6 medium secondary review channel.
