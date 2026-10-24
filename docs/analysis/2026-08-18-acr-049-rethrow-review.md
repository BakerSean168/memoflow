# ADR-049 — RAW_RESULT_MESSAGE_RETHROW Elimination + Scanner Precision Review Evidence

> Date: 2026-08-18
> Branch: `refactor/acr-049-rethrow`
> Base: `98151ca1` (main, after PR #240 ACR-080)
> Scope: eliminate the RETHROW finding category + refine scanner to kill false positives.
> Implementing agent: opencode-go/deepseek-v4-flash.

## 1. Review outcome

Eliminated the final failure-contract finding category. `RAW_RESULT_MESSAGE_RETHROW`
**20 → 0** (the last category); inventory **total 4 → 1** (only UI_RAW_RESULT_MESSAGE:1, the
documented desktop startup-crash internal developer surface).

| Rule                         | Before | After |
| ---------------------------- | -----: | ----: |
| `RAW_RESULT_MESSAGE_RETHROW` |     20 |     0 |
| `DOMAIN_ERROR_SUBCLASS`      |      0 |     0 |
| `FAILURE_MESSAGE_BRANCH`     |      0 |     0 |
| `PROVIDER_CODE_LEAKAGE`      |      0 |     0 |
| `UI_RAW_RESULT_MESSAGE`      |      1 |     1 |
| **Total**                    | **21** | **1** |

## 2. Code changes (12 files) — rethrow to ResultErrorException

17 genuine rethrows converted to `ResultErrorException` (raw message carried via `failure`/`cause`,
NOT embedded in the thrown message text):

- governance mappers ×4 (powersync + prisma rule mappers) — stable prefix + ResultErrorException
- goal task-goal-progress.handler ×2, repository module ×1
- apps/api ai repository adapters ×3
- apps/desktop main.ts ×2, desktop-cloud-connection-service ×2, github-knowledge-repository.live ×2
- app-vue hostProposalLifecycle.ts ×1 (client AI event failure → ResultErrorException)

Behavior preserved (same Error family, callers/observers unchanged; raw reason now on cause/failure).

## 3. Scanner precision fix (lib + test)

`tools/governance/lib/failure-contract-inventory.mjs`: `isRawMessageRethrow` previously flagged
ANY `throw new Error(...)` containing any `.message`/`message`. Now
`containsResultErrorMessage` only fires for a **result-failure context**:

- `.message` whose receiver chain contains a result/failure accessor (`result.error.message`,
  `envelope.error.message`, `x.failure.message`, `err.error.message`)
- bare identifiers `errorMessage`/`errorMsg`/`errMessage`/`errMsg`
  NOT flagged: bare `message` (generic param/label), plain `err.message`/`e.message` (non-Result Error).

This removes 3 false positives:

- `contracts/result/core.ts:167` `assertNever` (message is a generic label param)
- `test-utils/wait-for.ts:49` (message is a caller label)
- `utils/web-initialization-manager.ts:259` (`err` is a module-load Error diag, not a Result)

Unit test `failure-contract-inventory.test.mjs` +18 lines: asserts the 3 former false positives
no longer flag AND genuine rethrows (`result.error.message`, `envelope.error.message`,
`x.failure.message`, bare `errorMessage`) still flag.

## 4. Validation

- Inventory audit: `passed (no new/expired production findings)`; items = 1.
- touched packages' vitest + typecheck clean (rethrow conversions verified per package).
- scanner unit test added for precision (genuine vs false-positive).

## 5. Gate

Review passes. **ADR-049 production failure-contract inventory = 1** (documented internal dev
surface). Next: ACR-081 — retire the historical baseline, set inventory=0 (or finalize the
single documented surface), archive ADR-049 plan.
