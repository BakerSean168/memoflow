# ADR-049 — FAILURE_MESSAGE_BRANCH Elimination Review Evidence

> Date: 2026-08-18
> Branch: `refactor/acr-049-message-branches`
> Base: `fcb499d14` (main, after PR #236)
> Scope: eliminate the 8 remaining message-text branch findings.
> Implementing agent: opencode-go/deepseek-v4-flash.

## 1. Review outcome

All 8 `FAILURE_MESSAGE_BRANCH` findings eliminated by upgrading to typed/structured control flow.
Inventory **76 → 68** (FAILURE_MESSAGE_BRANCH **8 → 0**). Scanner: `passed (no new or expired
production findings)`, 95 stale baseline entries await the next rewrite.

## 2. Changes per finding

| #   | File                                             | Before                                                  | After                                                                             |
| --- | ------------------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | `app-vue/useAIChatSession.ts:131`                | `message.includes('abort'\|'cancel')` fallback          | removed; keeps structured `name==='AbortError'`/`code==='ABORTED'`/`DOMException` |
| 2   | `goal/relation.use-cases.ts:40`                  | `e.message.includes('Unique')`                          | `isPrismaUniqueConstraintError` (P2002)                                           |
| 3   | `goal/wallet.use-cases.ts:54`                    | `e.message === 'ACCOUNT_NOT_FOUND'`                     | `e instanceof WalletAccountNotFoundError`; repo throws typed error                |
| 4   | `reminder/...calculation-service:214`            | `error.message.includes('Invalid or unknown timezone')` | `instanceof InvalidTimezoneError`                                                 |
| 5   | `schedule/schedule-domain-event-publisher:48-49` | `message.includes('lease lost')`                        | `instanceof ScheduleLeaseLostError`                                               |
| 6   | `schedule/schedule-rebuild-worker-service:82`    | `err.message.toLowerCase().includes(...)`               | `instanceof ScheduleLeaseLostError`                                               |

Supporting: 14 schedule lease-lost throws upgraded from `throw new Error('...(lease lost)')` to
`throw new ScheduleLeaseLostError(...)` in both prisma and powersync repositories;
`ScheduleLeaseLostError` constructor now accepts an optional message (default unchanged).

## 3. Notes

- `err.message` reads remaining in schedule services (L115/L83) are **diagnostic reporting**
  (writing the reason into the outbox failed field), not branch control flow — compliant.
- `isPrismaUniqueConstraintError` in `package/goal/src/server/application/errors/prisma-unique.ts`
  uses structured Prisma `P2002` (via existing `mapPrismaError`) rather than message text.
- New typed errors: `wallet-account-not-found-error.ts`, `InvalidTimezoneError` (reminder domain
  errors), `ScheduleLeaseLostError` usage. Messages preserved (super(message)) so integration
  asserts `.toThrow('ACCOUNT_NOT_FOUND')` / `/lease lost/` keep passing.

## 4. Validation

- app-vue composables: 16/288; goal use-cases+domain: 52/329; reminder domain: 18/218;
  schedule application+prisma+lease: 18/145. All passed (independent re-run of scanner passed).
- Per-package typecheck: `tsc --noEmit` with `node --stack_size=8192` (Node 26 TS stack-overflow workaround) — clean.
- Env note: `pnpm nx run *:typecheck` triggers a pnpm install that requires Prisma engines + is
  not usable here; direct tsc used per the memory note.

## 5. Gate

Review passes. `FAILURE_MESSAGE_BRANCH = 0`. Proceed to push + CI.
