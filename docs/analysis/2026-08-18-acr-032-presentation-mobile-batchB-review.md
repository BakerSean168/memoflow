# ACR-032 Batch B — Mobile (app-react) Presentation Raw-Message Ownership Review Evidence

> Date: 2026-08-18
> Branch: `refactor/acr-032-presentation-mobile`
> Base: `961a1cf52` (main, after PR #235)
> Scope: mobile presentation layer (`packages/app-react`) + shared `presentErrorMessage`.
> Implementing agent: opencode-go/deepseek-v4-flash.

## 1. Review outcome

Eliminates all 62 mobile `UI_RAW_RESULT_MESSAGE` findings by introducing a
framework-free `presentErrorMessage(error)` in `@memoflow/http-client` and routing every
mobile `setError(x.error.message)` through it. Mobile (React Native / Expo) has no i18n host,
so this is a deterministic code→stable-message mapper rather than the vue-i18n-backed
`translateResultError` used on Web/Desktop (Batch A).

Inventory moves **138 → 76**:

| Rule                         |  Before |  After |   Delta |
| ---------------------------- | ------: | -----: | ------: |
| `UI_RAW_RESULT_MESSAGE`      |      63 |      1 |     -62 |
| `RAW_RESULT_MESSAGE_RETHROW` |      20 |     20 |       0 |
| `DOMAIN_ERROR_SUBCLASS`      |      47 |     47 |       0 |
| `FAILURE_MESSAGE_BRANCH`     |       8 |      8 |       0 |
| **Total**                    | **138** | **76** | **-62** |

Scanner: `passed (no new or expired production findings)`. 87 stale baseline entries await the
next baseline rewrite.

## 2. Shared helper

`presentErrorMessage(error, fallbackMessage?)` in `packages/http-client/src/result-error.ts`:

- `normalizeResultError` → code → `getDefaultResultErrorMessage(code)` (stable zh-CN for
  BAD_REQUEST/UNAUTHORIZED/FORBIDDEN/NOT_FOUND/CONFLICT/VALIDATION_ERROR/RATE_LIMITED/
  INTERNAL_ERROR/SERVICE_UNAVAILABLE/TIMEOUT/CANCELED/UNKNOWN).
- fallbackMessage honored only when code unknown; else `'操作失败'`.
- **Never reads the raw provider message.** 7 unit tests cover code resolution, unknown-code
  fallback, PublicFailure shape, and fallbackMessage override.

## 3. app-react replacements (62 → 0)

- **14 hooks + 1 provider** (`app-session-provider.tsx`, 3 sites): uniform
  `setError(presentErrorMessage(<same expression>.error))` — receiver expression preserved.
- **12 screens** incl. non-`setError` setters: `setActionError`, `setSubmitError`,
  `setConflictError`, `setFormError`, `setLastError`.
- `useAIWorkspace` read `error.message` on a narrowed JS `Error` (a ResultErrorException from
  `unwrap`) → `presentErrorMessage(error)`.

## 4. Intentional leave

- `apps/desktop/src/renderer/main.ts:17` — the single remaining `UI_RAW_RESULT_MESSAGE`.
  Startup crash `formatError` (`error.stack ?? error.message`) is the documented internal
  developer surface from Batch A; not an app-react finding and correctly outside this batch.

## 5. Validation evidence

- Inventory: `passed`; summary
  `{"DOMAIN_ERROR_SUBCLASS":47,"FAILURE_MESSAGE_BRANCH":8,"RAW_RESULT_MESSAGE_RETHROW":20,"UI_RAW_RESULT_MESSAGE":1}`.
- http-client vitest: `present-error-message.test.ts` 7/7; full suite 11 passed
  (orchestrator re-run: 7/7 confirmed).
- app-react `tsc --noEmit`: exit 0, no errors (orchestrator re-run of scanner passed).

## 6. Gate

Review passes. ACR-032 presentation raw-message ownership is now complete across
Web/Desktop/app-vue (Batch A) and mobile/app-react (Batch B): `UI_RAW_RESULT_MESSAGE = 1`
(documented internal dev surface). Proceed to push + CI.
