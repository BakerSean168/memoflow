---
tags:
  - plan
  - keyboard
description: Keyboard-first V1 implementation and acceptance evidence
created: 2026-10-08T00:00:00Z
updated: 2026-10-08T12:21:00Z
---

# MemoFlow Keyboard-first V1

User-authorized scope: the complete Keyboard-first V1 proposal, implemented in dependency order with unified acceptance. Baseline: `13fc29d05bc7fc145e29b8226530058c35215ba4` (origin/main). Isolated branch/worktree: `feat/keyboard-first-v1`, `memoflow-keyboard-v1`. Other development stays outside this branch.

## Observable behavior

- 1/2/3/4/9/0 toggle Goal/Task/Routine/Note/Schedule/Notification previews. Another number switches previews; Esc closes. Enter restores the module's most recently used tab unless an item is active, then opens that item. Alt+number restores a module directly. Capsule main buttons retain landing-page semantics.
- N creates a conversation; desktop additionally supports Mod+Shift+O. `/` opens conversation search. Mod+K opens the command palette, Mod+B toggles the sidebar, Mod+Backslash toggles the business panel. macOS uses Meta for Mod; other platforms use Control.
- J/K and Down/Up move within the focused list; Enter opens, X toggles selection on selectable lists, Shift+J/K extends selection on multiselect lists. Alt+J/K switch neighboring business tabs. Note trees retain Left/Right expansion semantics; calendar grids keep date semantics.
- `?` opens live shortcut help. Settings Hub provides recording, validation, enable/disable, reset, search and explicit JSON import/export. Only overrides are persisted; no cloud sync.

## Ownership and guardrails

- Frontend command definitions own stable IDs, defaults, scope, availability and execution. They are distinct from server CommandRegistry. UI/palette/keyboard invoke the same semantic handlers; business authorization stays in existing clients.
- One renderer shortcut runtime with VueUse-managed lifecycle; native widget/editor handlers retain their local behavior. Recorder/modal (including open select listboxes) > palette > preview > editor > focused visible list > workspace. Plain keys never run in editable controls. IME, AltGraph and disabled/hidden contexts fail closed; only list movement repeats.
- Preview controller owns the single active preview. List adapters identify items by stable IDs, separate active focus from selection, reconcile removed items and scroll only the active item. No application-wide J/K grab or Tab suppression.
- Shell navigation uses existing leave protection, route synchronization and tab limits. Restoring an existing module never resets its detail route.
- Device keymap is a versioned, runtime-validated override document. Desktop main owns active Profile resolution and atomic file writes (`ui/keyboard-keymap.json`); Web local storage is identity/browser scoped. Async reads/writes must not cross identity changes. Failed persistence must not claim success or change effective bindings.
- Imported unknown IDs, malformed chords and overlapping same-scope bindings are rejected. Explicit replacement is transactional; legal disjoint scopes may reuse chords. Browser/OS reservations are blocked or clearly warned. Electron system shortcuts stay in ShortcutManager and registration failure leaves no false registered state.

## Slices and acceptance

| Ticket  | Dependency | Deliverable / verification                                                                                      | State                                 |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| KBD-100 | baseline   | Registry, host keymap, context resolution, one listener, palette; input/IME/repeat/conflict tests               | implemented; behavior tests passed    |
| KBD-110 | 100        | Six previews, Enter/Esc, Alt navigation, MRU tab restore; route guard and preview tests                         | implemented; behavior tests passed    |
| KBD-120 | 110        | Goal and Task prove adapter, then Routine/Note/Notification/conversation/Schedule; focus/selection/filter tests | implemented; behavior tests passed    |
| KBD-130 | 100        | Device storage, settings, recording, reset, import/export, help; persistence/profile/failure tests              | implemented; behavior tests passed    |
| KBD-140 | all        | Desktop registration fix, integration/E2E, typecheck/lint/build/governance and acceptance audit                 | implemented; local acceptance passed; Windows/macOS hosts pending |

## Verification record

- `pnpm nx affected -t lint --base=main`: passed, 36 projects.
- `pnpm nx affected -t typecheck --base=main`: passed, 33 projects plus 32 dependency tasks.
- `pnpm nx affected -t test --base=main`: passed, 33 projects plus 4 dependency tasks (includes the complete app-vue and Desktop unit suites).
- `pnpm nx run memoflow:governance-check`: passed after preserving structured IPC failures and using the shared safe error presenter.
- Linux Electron `web:e2e:shell -- keyboard-first-desktop.spec.ts`: passed against the rebuilt desktop bundle. Uses a disposable test Profile and an explicit test-only safeStorage fixture; this does not certify Linux keyring security.
- Linux Chromium local Docker keyboard journey: all behavior assertions passed. The existing browser-proof fixture needed its non-secret request marker in User-Agent because production Nginx deliberately excludes query strings from logs. The refreshed browser request proof passed, including the actual Tab/Enter shortcut-save path.
- Machine-readable validation: `reports/local-deploy-validation/latest.json`; browser request and artifact identity: `reports/local-deploy-validation/local-docker-playwright-evidence.json`. Reports are generated, untracked artifacts.

### Acceptance coverage

| Requirement                                                                             | Evidence                                                                                |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Six numeric previews, switching/toggle, unchanged page, Esc                             | Chromium journey; ModuleCapsule and runtime tests                                       |
| Enter module entry / J then Enter opens a real Goal                                     | Chromium journey with self-registered account and created Goal                          |
| Alt navigation restores the existing detail; most recent tab wins                       | Chromium journey; router MRU tests                                                      |
| AI input accepts `1234jk`; contenteditable, IME and AltGraph remain native              | Real sequential Chromium input; engine/runtime tests                                    |
| Focused lists move/scroll, select/range-select; removed IDs never select another row    | Runtime DOM adapter and stable-ID model tests; real Goal J/X/Enter journey              |
| Goal, Task, Routine, Note, Notification, conversations, day events participate          | Owner primary-action adapters; tree Left/Right; calendar grid left with FullCalendar    |
| Live overrides, recording isolation, conflicts/replacement, reset and disable/re-enable | Settings, engine/keymap tests; Web and Electron persistence journeys                    |
| Profile isolation, late responses, failed persistence and atomic replacement            | Device controller and Desktop store fault/isolation tests                               |
| Existing leave protection and tab limits remain in the navigation path                  | Existing Shell router suite plus MRU cases; new conversation waits for successful leave |
| Browser reserved chords / Electron registration failure                                 | Six host-default variants, reservation tests, ShortcutManager registration/retry tests  |

### Default platform map

The executable catalog is `packages/app-vue/src/shared/keyboard/commands.ts`; the Settings and Help surfaces display its live device overrides.

| Action                       | Windows/Linux                      | macOS                           | Host restriction                                                       |
| ---------------------------- | ---------------------------------- | ------------------------------- | ---------------------------------------------------------------------- |
| Module preview               | `1 / 2 / 3 / 4 / 9 / 0`            | same                            | Outside editors and blocking overlays                                  |
| Restore module directly      | `Alt + number`                     | `Option + number`               | Physical digit positions; host/extension interception remains possible |
| Palette / sidebar / panel    | `Ctrl+K / Ctrl+B / Ctrl+Backslash` | `Cmd+K / Cmd+B / Cmd+Backslash` | Explicit combinations allowed in editors                               |
| New conversation             | `N`; Desktop also `Ctrl+Shift+O`   | `N`; Desktop also `Cmd+Shift+O` | The modified binding has no Web default                                |
| Conversation search / Help   | `/` / `?`                          | same                            | Plain text never intercepted in editors                                |
| Adjacent business tab        | `Alt+J / Alt+K`                    | `Option+J / Option+K`           | Outside editors                                                        |
| Focused list / preview       | `J/K`, `Down/Up`, `Enter`, `Esc`   | same                            | Only the applicable context; only movement repeats                     |
| Selectable lists             | `X`, `Shift+J/K`                   | same                            | Goal/Task selection; separate from active focus                        |
| Native show/hide application | `Ctrl+Shift+D`                     | `Cmd+Shift+D`                   | Electron-owned; forbidden as a renderer override                       |

Known browser tab/address/reload/window/devtools bindings, Windows-key combinations on Windows, and known OS exit/search bindings are rejected. `Ctrl+Alt` is rejected to preserve AltGraph. System, keyboard-layout and extension behavior beyond these rules needs real-host verification.

### Host acceptance boundary

| Host                 | Status                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Linux + Chromium Web | Behavior journey and matching container request proof passed                                                                                                              |
| Linux + Electron     | Keyboard behavior/persistence passed in Xvfb with the explicit disposable storage fixture                                                                                      |
| Windows and macOS    | Default maps, reserved chords and Option physical-key matching tested as rules; actual OS-level keyboard/IME acceptance remains unverified because those hosts are unavailable |

The V1 implementation is complete. Keep this plan active for Windows/macOS host acceptance; do not describe parameterized platform rules as OS-level test results.

Implementation decisions: VueUse manages the single window listener; a small matcher implements the supported chord grammar. Stable-ID DOM list adapters invoke each owner's existing primary button action (never inferred completion/delete buttons), preserving business authorization and avoiding duplicate click/keyboard behavior. Calendar grids retain native FullCalendar behavior; the day-detail event list participates in list navigation.

Platform rule unit tests are not OS-level acceptance: record which actual desktop/browser hosts were exercised, and leave unavailable host evidence explicitly unverified.

### Review decisions

- The small supported chord grammar plus VueUse listener is the sole renderer matching mechanism; no second hotkey library or component-global shortcut listeners were added. Temporary native drag-cancellation handlers remain local to that interaction.
- Natural button Tab stops are preserved; active keyboard focus and multi-selection are independent. Secondary completion/delete buttons are never inferred as row-open actions.
- Desktop's native show/hide accelerator is reserved from renderer overrides. `N` remains plain text in editors; the explicit desktop new-conversation chord is allowed there.
- Device-only overrides and disabled entries follow ADR-094. No retired cloud shortcut preference fields, business permission bypasses, or production deployment changes are introduced.

Final local source candidate: `13fc29d05bc7fc145e29b8226530058c35215ba4-dirty-b3a72a95d464`. Chromium and Electron journeys both passed. The local validation refresh preserves this candidate’s actual image build date while rechecking its source identity; it does not override `VCS_REF`.
