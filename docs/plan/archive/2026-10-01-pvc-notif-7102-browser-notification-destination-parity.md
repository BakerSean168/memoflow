# PVC-NOTIF-7102 — Browser notification destination parity

Status: Implemented / validated
Date: 2026-10-01

## Scope

Converge browser OS-notification click routing with the existing in-app/Desktop Notification destination policy. Preserve Notification Fact ownership, read state, typed owner actions, host-local presentation preferences, and the existing `/notifications` fallback.

## Implementation

- Extracted the destination decision into the host-neutral `notification-destination.ts` presentation policy.
  - explicit typed `navigationIntent` wins;
  - navigation params remain query parameters;
  - Task / Goal / Schedule retain their existing category landing fallback;
  - unknown / retired categories fall back to `/notifications`.
- Kept the existing Desktop import surface backward-compatible by re-exporting the canonical resolver from `desktop/notification-click-navigation.ts`. Inbox, item, and capsule presentation now import the host-neutral policy directly, removing their dependency on the Desktop-specific path while preserving behavior.
- Updated browser system-notification presentation to derive its destination from the canonical policy instead of always assigning `/notifications`.
  - The Web SSE dispatch still owns transport extraction: canonical `navigationIntent` is read from the durable outbox payload exposed as `event.data.navigationIntent`, then passed into the shared policy.
  - Browser navigation is constrained to the current origin. An unexpected external route fails closed to `/notifications`.
  - Click still focuses the window and closes the OS notification before navigation.
- Closed the real Desktop wiring gap discovered during review: the native/custom Desktop renderer now forwards the persisted `payload.navigationIntent` in notification click data, alongside the existing category/type identifiers. Desktop renderer navigation can therefore exercise the same explicit destination path that its resolver already supported.
- No Notification API, Fact, delivery, read/unread/archive, or owner-command semantics changed.

## Validation

- Focused cross-host destination regression:
  - browser system notification: Task typed destination + params, Goal typed destination, unknown fallback, same-origin fail-closed;
  - Desktop click navigation: explicit intent precedence, params, category fallback, unknown fallback, failure containment;
  - Web live presentation regression.
  - 3 files / 20 tests PASS.
- Full App-Vue Notification module regression: 15 files / 80 tests PASS.
- Desktop composition surface regression: `compose-modules.surface.spec.ts` — 35/35 PASS, including the new assertion that `payload.navigationIntent` reaches renderer click data.
- App-Vue Vue typecheck: PASS.
- Desktop TypeScript typecheck: PASS.
- Targeted ESLint: PASS.
- Targeted Prettier: PASS for the new/modified Notification files and Desktop surface spec. `main.ts` retains one pre-existing formatting shape outside this ticket rather than rewriting an unrelated measurement line.
- Test inventory: 1291 files, PASS.
- Repository governance: PASS.
- `git diff --check` and staged diff check: PASS.

## Browser behavior note

A fresh focused Playwright launch was attempted for the Notification Center panel-layout regression. The host already had an OpenAI-compatible E2E mock owned by another MemoFlow worktree on the default port. A second isolated-port attempt spawned the requested mock/API processes but Playwright then observed its strict non-reuse port as occupied; process cleanup through the current execution layer was blocked. No additional E2E servers were started after that point.

There is no visual delta in NOTIF-7102. The immediately preceding NOTIF-7101 browser regressions remain green for the Notification Center layout/inbox behavior, while this ticket's changed click policy is covered by the pure target-resolution and Desktop wiring tests above.

## Review notes

The shared resolver deliberately consumes only normalized destination inputs. It does not parse arbitrary transport/business payloads. Web extracts the typed intent from its SSE dispatch envelope at the browser presentation boundary; Desktop forwards the persisted typed intent into renderer click data at its host boundary.

This keeps one destination policy without turning the shared policy into another Notification transport parser and preserves the existing host capability boundaries.
