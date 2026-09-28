# Routine notification convergence FT

Date: 2026-09-28
Status: implementation complete; dev user-action acceptance passed
Branch: `ui/remote-dev-vite83`
Execution: current worktree only; no new branch/worktree. ChatGPT Web implements and verifies. Codex may be used for auxiliary review, but there is only one writer at a time.

## Goal

Close the current Routine reminder semantic gap without turning Routine into a second Notification system.

Every user-visible Routine due event must follow:

```text
Routine trigger source
  -> canonical RoutineOccurrence
  -> durable NotificationRequested
  -> Notification Fact
  -> delivery / presentation surfaces
```

The trigger source may still differ:

- WallClock -> Scheduler / Temporal Engine
- Elapsed -> current local runtime in this FT
- ActiveUsage -> local activity runtime
- Protocol -> protocol runtime

Desktop InterventionWindow remains a richer presentation surface; it is no longer the only user-visible truth for local Routine due events.

## Scope

### RTN-FT1 — local Routine occurrence -> NotificationRequested

- Inject the existing NotificationRequested writer into Desktop Routine composition.
- Adapt it through the existing RoutineOccurrenceNotificationWriterPort/build helper.
- When Elapsed or ActiveUsage becomes due:
  1. ensure the canonical RoutineOccurrence;
  2. enqueue idempotent `routine.intervention` NotificationRequested;
  3. then create the Desktop InterventionWindow.
- Replays must not create duplicate notification facts.

### RTN-FT2 — Web browser presentation for InApp realtime

- Keep Notification Fact / InApp as the canonical Web truth.
- Reuse the authenticated Notification SSE delivery path.
- Add an optional browser system-notification presenter:
  - never auto-prompts for permission;
  - only shows when permission is already granted;
  - only shows while the page is hidden/minimized or the browser is unfocused, avoiding duplicate focused-foreground UI;
  - does not create a second Notification Fact/channel.
- Add an explicit Web setting to request/revoke the local presentation preference. Browser permission denial remains owned by the browser.

### RTN-FT3 — typed Notification actions

- Render Notification Fact owner-command actions directly in Web Notification Center.
- `complete` must resolve the RoutineOccurrence through `routine.complete`, not mark the Notification as read.
- `snooze-10m` must execute `routine.snooze`; archive remains a Notification concern.
- HTTP and IPC clients share the existing canonical `executeAction` contract.

### RTN-FT4 — product semantics / UI capability copy

- Web Routine UI must not imply that local-only ActiveUsage can run without a Desktop host.
- Preserve existing localRuntime capability signaling.
- Do not model browser presentation as a new server channel in this FT.

## Acceptance

1. Desktop Elapsed/ActiveUsage due produces one canonical RoutineOccurrence and one idempotent `routine.intervention` NotificationRequested.
2. Desktop InterventionWindow still appears for the same occurrence.
3. The resulting Notification Fact remains visible in Notification Center / InApp flow.
4. Web with browser-notification permission + local presentation enabled can show a system notification for an InApp dispatch while the page is hidden.
5. Foreground Web does not duplicate the same event as both drawer and OS popup.
6. Existing WallClock Scheduler -> Notification path is unchanged.
7. Web Notification cards expose Complete / Remind in 10 min without coupling either action to read state.
8. Focused Routine, Notification startup, Web bootstrap/settings tests and typechecks pass.

## Non-goals

- Web Push while the browser is fully closed;
- Email delivery implementation;
- moving Elapsed from local runtime to Scheduler in this FT;
- making ActiveUsage run in Web without a device activity sensor;
- changing ProtocolSession timing semantics;
- replacing Notification channel preference semantics.

## Implemented

- Desktop `Elapsed` and `ActiveUsage` due paths now adapt the shared `NotificationRequestedWriterPort` through the Routine occurrence notification seam before opening the InterventionWindow.
- WallClock and local-runtime lanes share the same Routine notification-request builder and `routine.intervention` workflow semantics.
- Web live InApp delivery is projected from the actual authenticated SSE lane without changing canonical Fact/Inbox ownership.
- Focused Web shows a transient actionable in-app reminder with `Complete` / `Remind in 10 min`; both call Notification's canonical typed-action endpoint and then invalidate the Notification server-state projection so handled buttons disappear immediately.
- The Notification capsule/bell preview exposes the same Routine quick actions, so users do not need to open the full Notification Center.
- Browser permission is requested only from an explicit Web settings control; focused foreground pages suppress the OS popup, while hidden/minimized/unfocused Web can surface it.
- Historical SSE receipt catch-up never replays browser OS popups or foreground toasts.
- Browser system presentation is available only in a secure HTTPS context (or localhost); insecure development origins keep the control visible but disabled with an explicit explanation.
- Clicking a browser OS notification focuses MemoFlow and opens `/notifications`.
- Notification HTTP/IPC clients expose the existing typed `executeAction` contract.
- Web Notification cards render Routine `complete` and `snooze-10m` owner commands as explicit quick actions; archive is available from the notification menu.
- Mark-as-read remains strictly a Notification read-state mutation and never completes a RoutineOccurrence.
- Accepted owner-command interactions now project a handled presentation state without mutating read/unread:
  - NotificationInteraction remains the durable provenance;
  - Inbox query batches interactions for the current page (no N+1);
  - once Complete/Snooze is accepted, stale owner-command buttons are removed from that source Notification DTO;
  - rejected/failed interactions keep the action available for retry;
  - Archive remains available as an independent Notification lifecycle action.
- Durable Elapsed snooze now re-presents the SAME open business occurrence exactly once at `snoozeUntil`:
  - projection creates a distinct Scheduler wake-up key;
  - NotificationRequested uses a distinct presentation idempotency key;
  - Complete/Snooze actions on the new notification still target the original RoutineOccurrence;
  - successful wake-up consumes the temporary snooze override so projection converges back to no desired invocation while the occurrence remains Open.
- Routine list/editor expose `localRuntime` capability truth. Durable Elapsed ownership was subsequently completed by `2026-09-28-routine-durable-elapsed-scheduler-ft.md`.

## Verification

Passed:

- `packages/reminder`: TypeScript `tsc --noEmit`.
- `packages/reminder`: full suite, 33 files / 180 tests.
- `reminder:build` and its dependency graph.
- Routine notification adapter + WallClock schedule execution: 12 tests.
- Desktop local Routine vertical slice: 7 tests, including NotificationRequested + InterventionWindow for ActiveUsage/Elapsed.
- App Vue Notification card/capsule actions + focused live toast + browser notification + SSE presentation + settings + i18n: 50 focused tests across 9 files.
- Notification HTTP/IPC typed-action adapters: 3 focused tests.
- `packages/notification`: full suite, 44 files / 233 tests.
- `notification:build`: passed with declaration emit.
- Web bootstrap SSE presentation wiring: 2 focused tests.
- `packages/notification`: TypeScript `tsc --noEmit`.
- `git diff --check`.
- direct Web Vite development build: 6,204 modules transformed, build succeeded.
- `schedule-orchestration:build`: passed with DTS emit.
- running Web dev surface on port `20200`: HTTP 200.
- API dev process reloaded on `20201` after the Reminder/Scheduler build.

Dev live action acceptance (synthetic fixture, cleaned up after each run):

- `complete` -> NotificationInteraction accepted -> RoutineInteraction `Completed` -> RoutineOccurrence `Satisfied / ExplicitComplete` -> next `routine.elapsed.fire` projected from `resolvedAt + 50 min`.
- `snooze-10m` -> NotificationInteraction accepted -> RoutineInteraction `Snoozed` -> RoutineOccurrence remains `Open` -> durable temporary override created -> next desired Scheduler intent points to the SAME occurrence at `snoozeUntil` with a distinct notification presentation key.
- handled-action query projection -> synthetic unread Routine Notification + accepted Complete interaction -> list API keeps `isRead=false` while returning only the independent Archive action; stale Complete/Snooze actions are removed. Fixture cleaned up.
- focused live-toast actions now perform the same Notification query invalidation as component/composable actions, so capsule/list state converges immediately after Complete/Snooze.

Known unrelated branch blockers:

- the latest full `app-vue` typecheck is currently blocked by an unrelated AI citation EntityRef mismatch in `useAIChatSession.ts` (the caller now permits notification/key-result/planner/routine/conversation refs while the downstream type still accepts only goal/task/knowledge-document);
- full Desktop typecheck is currently blocked by pre-existing Goal `startDate` mock drift and Repository live-projection interface errors;
- Nx `app-vue:build` is blocked upstream by the same in-progress Repository refactor (`listNoteTree` contract mismatch); the direct Web Vite build succeeds because it does not require that unrelated declaration-build edge first.

These failures do not originate in the FT files above.

## Follow-up

Scheduler-owned durable Elapsed was completed in `2026-09-28-routine-durable-elapsed-scheduler-ft.md`.

Web Push for fully closed-browser delivery, Notification Email delivery, and Service Worker notification action buttons remain separate channel/presentation work. They should reuse Notification Fact / typed actions rather than introducing Routine-owned transports or command paths.

Handled business actions intentionally do not mutate read/unread. The source Notification remains an Inbox Fact/audit surface, while accepted Interaction truth suppresses stale business buttons. A future visual “handled” badge can be added without changing those semantics.
