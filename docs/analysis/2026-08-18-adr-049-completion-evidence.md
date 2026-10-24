# ADR-049 — Application Failure-Contract Refactor: Completion Evidence (2026-08-18)

> Plan: `docs/plan/active/2026-08-17-application-contract-and-architecture-refactor.md`
> Status gate reached: **ADR-049 production failure-contract implementation COMPLETE** (inventory 219 → 1).
> Orchestrator: MemoFlow Hermes 开发 Agent; implementing agent: opencode-go/deepseek-v4-flash.
> All batches went through 实施 → 独立审查 → governance scanner → GitHub CI all-green → squash merge.

## 1. Final inventory state

```
% node tools/governance/failure-contract-inventory-audit.mjs
[failure-contract-inventory] summary {"UI_RAW_RESULT_MESSAGE":1}
[failure-contract-inventory] passed (no new or expired production findings).
```

| Rule                         | Baseline | Final |
| ---------------------------- | -------: | ----: |
| `DOMAIN_ERROR_SUBCLASS`      |       51 |     0 |
| `FAILURE_MESSAGE_BRANCH`     |       54 |     0 |
| `PROVIDER_CODE_LEAKAGE`      |        6 |     0 |
| `RAW_RESULT_MESSAGE_RETHROW` |       26 |     0 |
| `UI_RAW_RESULT_MESSAGE`      |       82 |    1* |
| **Total**                    |  **219** | **1** |

\* = `apps/desktop/src/renderer/main.ts:17` — startup-crash `formatError()` (error
boundary / programmer crash). Deliberately retained as the documented **internal developer
surface** (translating would hide the crash cause; NOT a public operation failure).

## 2. Batch ledger (all merged, CI-green)

| PR   | Scope                                                                    | Inventory delta | Merge commit |
| ---- | ------------------------------------------------------------------------ | --------------- | ------------ |
| #234 | app-vue surface-spec sync to typed error (fix #234 CI)                   | —               | `a244cb2`    |
| #235 | ACR-032 Batch A: app-vue + desktop renderer presentation                 | UI_RAW 82→63    | `961a1cf`    |
| #236 | ACR-032 Batch B: mobile (app-react) presentation + `presentErrorMessage` | UI_RAW 63→1     | `fcb499d`    |
| #237 | message-text control flow → typed (8 findings)                           | MSG_BRANCH 8→0  | `c48f8e4`    |
| #238 | Goal DomainError → ResultErrorException pilot (16)                       | DOMAIN 47→31    | `df68c76`    |
| #239 | task/schedule/reminder/setting DomainError → ResultErrorException (24)   | DOMAIN 31→7     | `386c228`    |
| #240 | **ACR-080**: retire DomainError base + isDomainError + 6 dead classes    | DOMAIN 7→0      | `98151ca`    |
| #241 | **RAW_RETHROW** 20→0 + scanner precision (3 false positives)             | RETHROW 20→0    | `0f0e5b0`    |

## 3. Architecture outcome (ACR-080)

- The legacy `DomainError` base class + `isDomainError` + 47 subclasses retired entirely
  (`packages/utils/src/errors/domain-error.ts` deleted, 313 lines).
- Canonical failure type is now **`ResultErrorException`** (`@memoflow/contracts/result`):
  pure `Error` subclass carrying `code / details[] / context / statusCode / cause / failure`.
- `extractStructuredResultError` → `mapInfraErrorToFailure` → API error middleware recognize
  ResultErrorException **first**, so the HTTP/IPC error contract is unchanged (zero
  mapper/middleware edits across all batches).
- `BusinessRuleViolationError` migrated to ResultErrorException (3 policy consumers unchanged,
  `instanceof` preserved).
- `presentErrorMessage` (framework-free) added to `@memoflow/http-client` for React
  Native/mobile presentation (no i18n host).

## 4. Supporting enforcement

- scanner `isRawMessageRethrow` refined to flag only **result-failure-context** rethrows
  (`result.error.message` / `failure.message` / `errorMessage`), removing 3 false positives
  with unit-test coverage (genuine rethrows still caught).
- test-inventory gate documented (new test file requires `pnpm test:inventory`).

## 5. Review evidence (per batch, in docs/analysis/)

- `2026-08-18-acr-032-presentation-raw-message-batchA-review.md`
- `2026-08-18-acr-032-presentation-mobile-batchB-review.md`
- `2026-08-18-acr-049-message-branches-review.md`
- `2026-08-18-acr-080-goal-domainerror-pilot-review.md`
- `2026-08-18-acr-080-rest-domainerrors-review.md`
- `2026-08-18-acr-080-retire-domainerror-review.md`
- `2026-08-18-acr-049-rethrow-review.md`
- (plus batch-1 review `2026-08-18-failure-contract-feature-migration-batch-1-review.md` from PR #234)

## 6. Remaining work tied to ADR-049 closure (ACR-081, in progress)

- Baseline convergence: `failure-contract-baseline.json` holds 163 stale entries (their findings
  are already eliminated) plus the 1 registered UI_RAW internal surface. ACR-081 = rewrite
  baseline to the single registered surface, mark it as a permitted internal developer surface
  (no expiring allowlist), enable fail-closed governance so any NEW leak/branch/raw-message
  fails CI.
- Mark **ADR-049 = implemented**, archive plan.
- ACR-071 (build/runtime/MagicDNS + LOCAL_VALIDATION) is a separate runtime/deploy ticket in the
  same plan (not part of failure-finding removal).
