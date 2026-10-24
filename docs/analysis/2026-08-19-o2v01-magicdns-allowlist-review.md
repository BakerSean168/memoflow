# O2V-01 — MagicDNS WEB origin auto-include (API trustedOrigins/CORS + AI allowlist) Review Evidence

> Date: 2026-08-19
> Branch: `fix/o2v01-magicdns-allowlist`
> Base: `main` at `f03df49`
> Plan: `docs/plan/active/2026-08-18-oracle2-hermes-local-validation-hardening.md` batch O2V-01
> Implementing agent: opencode-go/deepseek-v4-flash.

## 1. Change

- NEW `apps/api/src/shared/infrastructure/config/web-origin.ts`: `deriveWebOrigin(url)`
  (MEMOFLOW_WEB_URL → origin, undefined-safe) + `getTrustedWebOrigins(corsOrigins, webUrl)`
  (dedupe append; unchanged list when no webUrl). Kept OUTSIDE `getCorsOrigins()` to respect
  residual 1189 keep-boundary.
- `apps/api/src/server.ts` cloudAuth: `trustedOrigins: getTrustedWebOrigins(CORS_ORIGIN list, MEMOFLOW_WEB_URL)`.
- `apps/api/src/shared/infrastructure/middleware/global.ts` CORS:
  `allowedOrigins = getTrustedWebOrigins(getCorsOrigins(), env.MEMOFLOW_WEB_URL)`.
- `apps/ai-service/.../settings.py`: `allowed_origins_list` appends MEMOFLOW_WEB_URL origin
  (deduped); comment documents canonical public Web URL.
- `docker-compose.local.yml`: verify/forward MEMOFLOW_WEB_URL to API + AI service env.
- Tests: `web-origin.spec.ts` (derive + dedupe + undefined) + `test_settings.py` (allowlist incl.
  public origin).

## 2. Validation (orchestrator re-run)

- keep-boundary `get-cors-origins-keep-boundary.surface.spec.ts`: 4/4 pass (getCorsOrigins untouched).
- api full suite: 61 files / 312 tests pass; direct tsc typecheck clean (nx database:build EPERM
  is pre-existing environment permission noise in copy-with-retry.mjs, unrelated).
- inventory regenerated (1135 files) for the 2 new test files.
- failure-contract-inventory: `{UI_RAW_RESULT_MESSAGE:1}` / passed (no new findings).

## 3. Behavior

When `.env.local` sets `MEMOFLOW_WEB_URL=http://oracle.taile92a8e.ts.net:58080`, the browser
hitting that public origin is CORS-accepted by the API (trusted origins + CORS) and the AI
service, with no need to duplicate the origin into CORS_ORIGIN. Loopback/default behavior
unchanged when MEMOFLOW_WEB_URL unset.

## 4. Gate

Review passes. Proceeds toward the O2V-04 Oracle2 MagicDNS deployment acceptance.
