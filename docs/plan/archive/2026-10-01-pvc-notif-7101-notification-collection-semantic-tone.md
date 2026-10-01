# PVC-NOTIF-7101 — Notification collection + semantic tone convergence

Status: Implemented / validated
Date: 2026-10-01

## Scope

Converge Notification Inbox onto the canonical Collection presentation grammar without changing Notification ownership, read/unread/archive semantics, typed owner actions, or destination behavior.

## Implementation

- Replaced the Notification page's bespoke All/Unread tab implementation with the shared `ResponsiveSegmentedFilter` grammar used by product collection surfaces.
- Extended `ResponsiveSegmentedFilter` with presentation-only capabilities required by compact inbox collections:
  - optional per-option counts;
  - optional stable compatibility test IDs;
  - an explicit non-collapsing mode for two-item collections;
  - optional tab semantics with `tablist` / `tab` / `aria-selected`.
- Kept Notification's filter DOM stable across Business Panel width/focus changes by using `collapseMode="none"`; this preserves the existing panel-layout contract rather than swapping the filter control for a dropdown at narrow widths.
- Preserved existing Notification Center test and automation contracts, including `notification-filter-all`, `notification-filter-unread`, `notification-unread-badge`, `notifications-list`, and `mark-all-read-button`.
- Converged loading rows and the notification list from a raised rounded-card shell to sparse collection rows with shared border rhythm.
- Migrated error, unread-empty, and all-empty states to `AppEmptyState`; the existing inline retry action and stable state test IDs remain intact.
- Introduced the shared presentation vocabulary `SemanticTone = primary | info | success | warning | destructive | muted` and a token-class resolver.
- Moved Notification source/category presentation onto semantic tones:
  - Task → success
  - Goal → warning
  - Reminder → primary
  - Schedule/System → info
  - Account → primary
  - unknown/general categories fall back to semantic Notification type.
- Removed NotificationItem's raw purple/cyan category colors and aligned source icons to normalized Notification categories instead of the stale legacy type vocabulary.
- Kept typed owner-command quick actions, archive intent, mark-read, delete, mark-all-read, unread query ownership, and destination routing unchanged.

## Validation

- Full App-Vue Notification module regression:
  - 15 files / 76 tests PASS.
- Shared filter + existing Routine consumer regression:
  - 2 files / 10 tests PASS.
- Focused collection/presentation suite:
  - `ResponsiveSegmentedFilter.spec.ts`
  - `notificationSemanticControls.spec.ts`
  - `NotificationListPage.spec.ts`
  - `notificationPanelAdaptation.spec.ts`
  - `NotificationCapsulePreview.spec.ts`
  - 5 files / 22 tests PASS.
- App-Vue typecheck, including dependent build tasks: PASS.
- Targeted ESLint for all changed TypeScript/Vue/test files: PASS.
- Prettier applied to the complete source batch.
- Test inventory check: 1291 files.
- Repository governance check: PASS.
- `git diff --check`: PASS.
- Browser behavior / layout regression:
  - Notification Center panel-layout test PASS, including stable filter DOM identity, `aria-selected` state, scroll-host containment, and panel fit checks.
  - Notification Center deterministic empty state, disabled mark-all-read state, and filter interaction tests PASS.
  - The first aggregate browser run was interrupted by host disk exhaustion; after capacity recovered, the relevant tests passed. One later aggregate run had a transient auth self-registration timeout on the simple open test, and the isolated rerun passed (1/1).
  - Notification inbox closed-loop E2E PASS (1/1): inbox fact creation plus single/all-read count closure.

## Review notes

The convergence is intentionally presentational. Notification Query Cache ownership, mutation behavior, typed owner actions, archive semantics, cross-host destination policy, SSE invalidation, and desktop/browser presentation authority were not moved into shared UI primitives.

The shared segmented-filter extension is backward-compatible: existing consumers retain the responsive dropdown behavior by default. Notification opts into the non-collapsing two-item form specifically because its established E2E and interaction contract requires the same filter node to survive panel-layout changes.

Raw priority-border colors in `InAppNotification` are not part of this ticket's category/source palette migration and remain unchanged. Browser system-notification destination parity is intentionally deferred to PVC-NOTIF-7102.
