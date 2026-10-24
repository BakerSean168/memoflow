# ACR-032 Batch A — Presentation Raw-Message Ownership Review Evidence

> Date: 2026-08-18
> Branch: `refactor/acr-032-presentation-raw-message`
> Base: `a244cb20a` (main, after PR #234 squash)
> Scope: app-vue composables + desktop renderer presentation surfaces.
> Implementing agent: opencode-go/deepseek-v4-flash.

## 1. Review outcome

Batch A eliminates direct `result.error.message` reads from every touched app-vue /
desktop-renderer presentation surface, routing them through the established
`translateResultError(error, t, { scope, fallbackKey })` translator
(`@memoflow/http-client`, re-exported via `app-vue/shared/utils/translate-result-error.ts`).

Inventory moves **163 → 138** grandfathered findings:

| Rule                         |  Before |   After |   Delta |
| ---------------------------- | ------: | ------: | ------: |
| `UI_RAW_RESULT_MESSAGE`      |      82 |      63 |     -19 |
| `RAW_RESULT_MESSAGE_RETHROW` |      26 |      20 |      -6 |
| `DOMAIN_ERROR_SUBCLASS`      |      47 |      47 |       0 |
| `FAILURE_MESSAGE_BRANCH`     |       8 |       8 |       0 |
| **Total**                    | **163** | **138** | **-25** |

Scanner: `passed (no new or expired production findings)`; 25 stale baseline entries
await the next baseline rewrite (normal after a finding-bearing batch).

## 2. Explicitly documented internal developer surfaces (intentional leaves)

The ACR-032 acceptance allows raw message to remain only on internal developer surfaces:

- `apps/desktop/src/renderer/main.ts:17` `formatError()` returns `error.stack ?? error.message`.
  This renders the **startup crash bootstrap** (error boundary / programmer crash), NOT a
  public operation failure. Translating would hide the crash cause. **Left unchanged.**
- `packages/app-vue/src/modules/notification/desktop/notification-click-navigation.ts:78`
  changed from `error.message` to `String(error)` — it is log-only (never assigned to
  user-visible state), so it stays as a developer diagnostic surface. A comment documents it.

## 3. Changes by file

| File                                          | Old                                                             | New                                                                                 |
| --------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `di-app.ts` L108/112                          | `throw new Error(lockResult.error.message)`                     | `throw new Error(getAppT()('common.operationFailed'))`                              |
| `di-app.ts` L127                              | toast desc `error.message`                                      | toast desc `getAppT()('common.operationFailed')`; `throw error` retained            |
| `chatViewHelpers.ts` L205                     | `error.message ?? ctx.translate('common.operationFailed')`      | `translateResultError(error, ctx.translate, { fallbackKey })`                       |
| `useAssistantDispatch.ts` L72                 | `error.message : 'Assistant dispatch failed'`                   | `translateResultError(error, t, { scope:'ai', fallbackKey })`                       |
| `reportAuthOperationFailure.ts` L38           | raw `error.message`                                             | reuse `deps.getLocalizedAuthError(error, 'auth.errors.UNKNOWN')`                    |
| `useKnowledgeWriteRequestLedger.ts` L47/68/71 | `result.error.message`                                          | `translateResultError(..., scope:'repository')`                                     |
| `useLocalVault.ts` L34/44                     | `throw new Error(result.error.message)` / `errorMessage(cause)` | `unwrapOrThrowError(result)` + `translateResultError(cause,...,scope:'repository')` |
| `useRecentKnowledgeNotes.ts` L47/68/71/100    | raw message/throw                                               | `unwrapOrThrowError` + `translateResultError(...,scope:'repository')`               |
| `useDataPortability.ts` L34/59/92/159         | raw message throws/assigns                                      | `translateResultError(...,scope:'setting', fallbackKey export/importFailed)`        |
| `usePresentationBootstrap.ts` L107            | `getI18nGlobal()?.t ? translate : raw`                          | unify on `getGlobalResultErrorT()` + `translateResultError`                         |

Supporting infrastructure:

- `app-vue/shared/utils/translate-result-error.ts` adds `getGlobalResultErrorT()` — a safe
  vue-i18n `t` resolver that returns an identity function when i18n is not yet installed
  (unit tests / pre-bootstrap), so `translateResultError` never throws outside a host app.

## 4. Compliance note

Several `scope`-specific locale keys (e.g. `repository.errors.<code>`) do not yet exist in
`en-US`/`zh-CN`. `translateResultError` falls back through `errors.<code>` → `normalized.message`
→ `fallbackKey`, so behavior is still compliant (UI never reads raw message directly; the
translator owns the last-resort fallback). Key-completeness deepening for each scope is a
follow-up inside ACR-032 (i18n registry completeness gate), not a blocker for this batch.

## 5. Validation evidence

- Inventory: `passed (no new or expired production findings)`; summary
  `{"DOMAIN_ERROR_SUBCLASS":47,"FAILURE_MESSAGE_BRANCH":8,"RAW_RESULT_MESSAGE_RETHROW":20,"UI_RAW_RESULT_MESSAGE":63}`.
- app-vue affected modules (repository/setting/authentication/ai-composables/notification-desktop):
  **43 files / 389 tests passed** (independent re-run by orchestrator).
- app-vue full suite: 187 files / 1024 tests passed (agent log).
- desktop renderer: 28 tests passed; utils dual-registry keep-boundary surface: 54 passed.
- ESLint: 0 errors on touched files. Typecheck: no new errors vs base.

## 6. Gate

Review passes. Proceed to push + CI. Follow-up (not in this batch): app-react/mobile
presentation (62 remaining UI_RAW findings) and server-side RAW_RESULT_MESSAGE_RETHROW
(20 remaining) under ACR-032 continuation / ACR-080.
