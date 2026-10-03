# MemoFlow Product vNext — Remaining Modules Full Surface / UI Audit

Date: 2026-09-29
Branch: product/vnext-convergence
Status: discovery complete; remaining Web/Desktop Vue product surfaces audited; findings ready for convergence planning
Reference implementations: Goal vNext + Task vNext

> This document is a second-pass, page-level audit of the remaining product modules. It supersedes the remaining-module severity/order sections of the first-pass cross-module audit. Goal and Task are not re-audited here; their confirmed product interaction and UI grammar are used as the reference baseline.

# 1. Executive decision

The remaining MemoFlow modules do **not** need one universal page component.

They do need one product-wide visual and interaction grammar.

The main convergence problem is now:

- the domain boundaries are generally stronger than the presentation layer;
- each module has independently rebuilt headers, list/filter bars, inspect panels, empty/loading/error states, badges, form controls and status colors;
- some modules intentionally need different surface archetypes — Calendar, Knowledge, Settings and AI should not be forced into Goal-style entity pages;
- several cross-module actions bypass the owner module's canonical interaction, which will become correctness bugs as Goal/Task vNext behavior expands.

No new P0 blocker was found in the remaining modules during this pass.

The highest-priority remaining findings are P1:

1. Schedule owns CalendarEntry update/delete, and the edit-capable dialog/backend already exist, but the normal calendar inspect path is read-only and exposes no edit/delete.
2. Task completion is invoked directly from Schedule, Task capsule and Today widget. Once Task supports completion-time KR measurement, those entry points would bypass the canonical measurement prompt unless completion UI is centralized.
3. Governance's executable-reference-module role is no longer paying for its runtime/UI maintenance cost; the current UI drift is evidence that the fake reference feature does not stay canonical automatically. Product Governance Runtime should enter retirement evaluation rather than receive another UI modernization pass.
4. AI workflow review surfaces form a second Goal/Task/Knowledge product UI. The target is no longer merely "make AI draft forms look similar"; AI should orchestrate the owner-native business surfaces and retire AI-owned product editors.
5. The repository has functional/E2E coverage, but there is still no systematic visual-regression matrix covering the representative surface archetypes of this large UI convergence.

The target is therefore:

> **shared grammar, specialized surfaces, owner-canonical actions — with owner-native Full/Quick Surfaces as the reuse boundary and AI as a semantic surface orchestrator.**

# 2. Audit scope

## 2.1 Included

This pass covers the remaining current Vue Web/Desktop product surfaces:

- Schedule / Planner
- Routine
- Knowledge / Repository
- Notification
- Settings
- Account surface inside Settings
- AI workspace
- Shell / Capsules / Today Overview
- Governance
- main-shell Authentication redirect surface

All current app-vue modules are therefore accounted for:

- account
- ai
- authentication
- goal
- governance
- notification
- repository
- routine
- schedule
- setting
- task

Goal and Task were already deep-audited and are used as references in this document.

## 2.2 Not treated as the visual reference in this pass

Mobile/React surfaces remain protected contract-parity consumers, but are not forced to copy desktop geometry. After the Web/Desktop grammar stabilizes, mobile should receive semantic and interaction parity with mobile-appropriate layout.

Dedicated AuthApp/login visual design is also not re-designed here. The main Vue shell only owns the redirect sentinel.

## 2.3 Evidence reviewed

Product and architecture truth:

- workspace-ui.md
- schedule-planner-scheduler-vnext.md
- routine-coach-vnext.md
- knowledge-repository-vnext.md
- notification-vnext.md
- setting-vnext-settings-hub.md
- modules/schedule.md
- modules/repository.md
- modules/ai.md
- modules/governance.md
- modules/account.md
- relevant ADRs and existing Product vNext convergence plan

Vue surfaces:

- all remaining module route/view files
- Schedule dialogs/sheets/planner surfaces
- Routine configuration/editor/profile/capsule surfaces
- Knowledge Web projection and Desktop Local Vault workspaces
- Notification list/item/drawer/capsule/system notification navigation
- Settings Hub sections and Account profile surfaces
- AI Chat, composer, workflow panels and draft editors
- Governance list/detail/editor/history
- shell BusinessPanel, Today Overview and all module capsule previews

Test inventory:

- existing module unit/surface specs
- current Web E2E paths for Schedule, Routine, Notification, Settings, Account, AI and Shell
- existing screenshot-producing tests

# 3. Goal/Task-derived product UI grammar

The product should standardize **surface families**, not force one page template on every module.

## 3.1 Collection surface

Use for:

- Goal list
- Task Today/Plans
- Routine definitions
- Notification inbox
- Governance rules (current implementation only; Product Governance is now a retirement candidate)

Contract:

- one compact collection header/toolbar;
- primary view switch on the left;
- filters/search grouped consistently;
- primary create/action on the right;
- sparse list rows rather than a card grid when rows represent peer entities;
- shared empty/loading/error grammar;
- responsive primary action may collapse to an icon.

## 3.2 Entity workspace

Use for first-class owner entities that deserve their own route:

- Goal
- TaskPlan
- Governance Rule (current implementation only; do not build new UI abstraction around it while ADR-113 is unresolved)

Contract:

- ModuleHeader-style top shell;
- identity first;
- direct manipulation for high-frequency properties;
- quiet metadata/property treatment;
- bounded readable content width;
- low-frequency destructive/admin actions in More;
- no extra nested page merely because a child entity exists.

## 3.3 Create/edit configuration surface

Use for:

- Goal
- Task
- Routine
- Schedule CalendarEntry
- bounded settings/onboarding dialogs

Contract:

- ProductDialogShell or a semantically equivalent product shell;
- identity first;
- property chips/rows for optional configuration;
- progressive disclosure;
- one scroll owner;
- canonical footer/action placement;
- shared Product Time pickers rather than browser-native date/time fields where product-time semantics matter.

## 3.4 Inspect overlay

Use when the user needs more detail without losing context:

- Goal KR inspect
- Goal Review
- TaskOccurrence
- Schedule event
- day agenda/detail
- lightweight contextual information

Contract:

- Dialog/Sheet selected by information density and available panel width;
- same property-row, status, action and footer grammar;
- explicit "View owner" only when the owner has a real workspace route;
- no new route for high-frequency sub-entity inspection.

## 3.5 Document workspace

Use for Knowledge.

Contract:

- document toolbar can legally use the compact h-11 family;
- Catalog | Content | Context remains the product model;
- wide panel uses inline side areas;
- narrow panel uses Sheets;
- content stays primary;
- source/connection implementation details stay secondary.

Knowledge should share typography, button, state and token grammar with Goal/Task, but should **not** be turned into a Goal-style max-width entity form.

## 3.6 Calendar workspace

Use for Schedule.

Contract:

- Day / Week / Month, period navigation and Add are a legal specialized toolbar;
- Calendar canvas remains full workspace;
- owner projections use one shared presentation map;
- event inspect delegates owner-specific business actions instead of reimplementing them.

## 3.7 Settings scene

Settings is a separate scene and should keep its sidebar/sheet navigation.

Inside a settings section, converge toward:

- SettingsSection
- SettingsPropertyRow
- SettingsStatusBlock
- SettingsObjectCard only for real bounded objects
- SettingsDangerZone
- Product/Settings dialog shell

Do not convert Settings into Goal/Task list pages.

## 3.8 AI collaborator / surface orchestrator

AI is a collaborator next to owner modules, not a second product model and not a second form system.

Target contract:

- one composer;
- Mastra may retain internal draft/revision/receipt identity for durable workflow semantics;
- normal product editing/review happens inside Goal/Task/Knowledge owner-native surfaces in BusinessPanel;
- AI opens and patches typed owner Edit Sessions through semantic surface actions, not DOM automation;
- internal IDs, draft refs, mutation counters and execution internals stay diagnostic/internal;
- AI applies business changes only through owner validation and owner command ports;
- AIGoalDraftEditor / AITaskDraftEditor and equivalent AI-owned product editors enter retirement after native parity.

## 3.9 Diagnostic/developer surface

SSE Monitor is a diagnostic page. Product Governance is currently a development/reference workbench but, per ADR-113 proposal, should not be treated as the future canonical UI reference while its retirement is being evaluated.

Diagnostic surfaces may show technical detail, but still use current shared primitives, states, spacing and semantic tokens.

# 4. Finding ledger

| ID | Severity | Area | Finding |
| --- | --- | --- | --- |
| RUI-01 | P1 | Cross-module Task actions | Schedule, Task capsule and Today widget directly complete Task occurrences and would bypass completion-time KR measurement |
| RUI-02 | P1 | Schedule | CalendarEntry update/delete exist in owner APIs and edit dialog, but normal event inspect is read-only |
| RUI-03 | P1 | Governance | Fake Product Governance reference runtime has high maintenance cost and already drifted from real modules; evaluate retirement instead of UI modernization |
| RUI-04 | P1 | AI | AI owns duplicate Goal/Task/Knowledge editors; migrate to owner-native surface orchestration and retire AI-owned product forms |
| RUI-05 | P1 | Product-wide QA | No representative screenshot-regression matrix protects the converged surface families |
| RUI-06 | P2 | Product-wide shell | Header/toolbar/filter variants are implemented ad hoc instead of as documented legal surface variants |
| RUI-07 | P2 | Routine | WallClock editor uses native date/time/number inputs and free-text IANA timezone |
| RUI-08 | P2 | Knowledge | Web/Desktop document workspace presentation diverges where semantics are actually shared; catalog still has native select |
| RUI-09 | P2 | Notification | Browser system-notification click always opens Inbox while in-app/Desktop resolve owner destination |
| RUI-10 | P2 | Settings/Account | Settings is card-heavy and contains raw dialogs, raw palette states and a visible native select |
| RUI-11 | P2 | Capsules | Six capsule previews independently rebuild nearly the same preview shell/state/footer grammar |
| RUI-12 | P2 | AI/Shell | AI composer wiring is duplicated across Teleport/non-Teleport paths and uses bespoke elevation styling |
| RUI-13 | P2 | Schedule/Notification | owner/source tone mapping and badge styling are duplicated |
| RUI-14 | P2 | Product-wide states | Loading/error/empty patterns vary by module despite equivalent semantics |
| RUI-15 | P2 | Ownership/maintainability | Several large surface files combine stable sub-surfaces; split only along semantic boundaries, not by line count |
| RUI-16 | P3 | Account | ProfileCard/ProfileForm appear to be non-production/story-era alternate account surfaces |
| RUI-17 | P3 | Authentication | main-shell auth redirect sentinel uses a raw hard-coded visual fallback |
| RUI-18 | P3 | Diagnostics | SSE Monitor remains visually older but is correctly dev/diagnostic scoped |

# 5. Schedule / Planner deep audit

## 5.1 What is already correct

Current architecture is strong:

- CalendarEntry belongs to Schedule.
- Task/Goal/Routine remain owner projections.
- Scheduler/Temporal Engine is not exposed as a normal product object.
- CreateScheduleDialog already uses ProductDialogShell.
- CreateScheduleDialog already has edit mode.
- shared Product Time pickers are already used.
- dragging/resizing routes through owner-command infrastructure.
- planner source semantics already use semantic token classes rather than raw hex colors.

The Calendar-specific toolbar is legitimate and should remain specialized.

## 5.2 RUI-02 — CalendarEntry CRUD is vertically incomplete

Current facts:

- useSchedule exposes createCalendarEntry, updateCalendarEntry and deleteCalendarEntry.
- CreateScheduleDialog accepts an existing CalendarEntry and renders edit copy.
- ScheduleCalendarView only opens it for create.
- EventDetailSheet is explicitly read-only.
- normal Schedule-owned event click therefore has no Edit or Delete affordance.

Desired path:

Schedule-owned CalendarEntry
→ click event
→ Event Inspect
→ Edit
→ reuse CreateScheduleDialog in edit mode

and:

Event Inspect
→ More / Delete
→ confirmation
→ Schedule owner delete command

Owner projections remain different:

- Task event → Task occurrence inspect/action
- Goal date → Goal owner surface/command
- Routine marker → read-only until Routine has a canonical single-occurrence override
- CalendarEntry → Schedule edit/delete

This is a product completeness gap, not a request for a generic "edit every projection" button.

## 5.3 RUI-01 — Schedule must not own Task completion UI

Current direct paths include:

- DayDetailSheet complete button
- TaskEventActionPanel complete action
- ScheduleCalendarView.handleCompleteTask → task.completeOccurrence(id)

After Task vNext introduces completion-time KR measurement, a direct call with no measurement intent can no longer represent every valid completion.

Target boundary:

Schedule
→ request canonical Task occurrence action
→ Task action coordinator decides whether completion is direct or requires measurement dialog
→ Task completes with optional Goal measurement intent

Schedule may host the dialog visually, but Task owns the completion decision and Goal owns measurement aggregation.

## 5.4 UI convergence

Retain:

- calendar canvas;
- period navigation;
- Day/Week/Month switch;
- source differentiation.

Converge:

- one Schedule projection presentation map for dot/badge/source label;
- one inspect-sheet property-row grammar;
- one empty/loading/error treatment;
- semantic elevation/background tokens instead of arbitrary fractional surface classes where a standard token exists.

Do not replace the Calendar toolbar with a generic Goal ModuleHeader if that makes period navigation worse.

# 6. Routine deep audit

## 6.1 What is already correct

RoutineConfigurationView is already much closer to the target than older Reminder UI:

- compact list rows;
- ResponsiveSegmentedFilter;
- ProductDialogShell for editor/profile dialogs;
- clear Plan-like owner workspace concept;
- AppEmptyState and skeleton loading;
- Profile/Membership semantics preserved;
- Method Library exposed through create menu;
- temporary override and runtime capability remain owner-specific.

## 6.2 RUI-07 — WallClock configuration leaks browser-native/product-time details

RoutineEditorDialog currently uses:

- native input type=time;
- native input type=date;
- native number input;
- free-text timezone input.

The free-text timezone is the largest UX drift.

The domain correctly requires IANA timezone and validates it, but normal users should not be required to type an IANA string.

Target:

- date → shared ProductDatePicker;
- time → shared Product date-time/time picker grammar;
- timezone → default current Product Time timezone and use a canonical searchable timezone selector when override is needed;
- recurrence interval → quiet numeric field/stepper using standard Input treatment;
- keep exact IANA value in the domain contract.

This preserves Product Time while reducing user cognitive load.

## 6.3 Routine toolbar density

Current h-11 toolbar combines:

- state filter;
- global/profile pause state;
- profile enabled switch;
- profile selector;
- profile create/edit/delete/runtime actions;
- Routine create + Method Library.

The information is all legitimate, but the persistent top strip is too responsible for both scope selection and administration.

Recommended grammar:

left:
- status/system view

right:
- current Profile scope/gate
- Add Routine

inside Profile menu:
- profile selection
- create/edit/delete
- runtime activate/pause when host capability permits

This keeps Profile first-class without making every low-frequency management action permanent toolbar chrome.

## 6.4 Routine editor

Do not force Routine into the exact Goal/Task chip count.

Routine has a genuinely richer trigger algebra.

Use:

identity
→ trigger type
→ trigger-specific properties
→ membership/profile context
→ intervention/advanced behavior

Stable trigger-specific sections can be separate subcomponents during implementation, but splitting should follow trigger ownership, not line count.

# 7. Knowledge / Repository deep audit

## 7.1 Web workspace is already close to the target

KnowledgeProjectionWorkspaceView correctly follows the product constitution:

- Catalog | Content | Context;
- one-line document toolbar;
- catalog/context become Sheets on narrow panel;
- content remains primary;
- stable-reference adoption is low-frequency;
- no Web full-document editor;
- no resurrection of Repository/Folder/Resource CRUD.

This is a specialized surface that should remain specialized.

## 7.2 RUI-08 — shared document grammar still drifts across Web/Desktop

Desktop LocalVaultWorkspaceView has legitimate additional capabilities:

- vault binding/path;
- rescan;
- open in Obsidian;
- change/detach vault;
- local search.

But equivalent presentation concepts differ:

- different toolbar/header geometry;
- different empty states;
- different list-row spacing/selection;
- separate loading/error patterns;
- separate source summary presentation.

Target is **presentation convergence, not capability convergence**.

Share:

- DocumentWorkspaceToolbar
- CatalogSearch
- CatalogRow
- WorkspaceEmpty/Loading/Error grammar
- Context action placement
- source/status presentation rules

Keep different:

- Web projection/source operations;
- Desktop local vault/Obsidian actions;
- Web read-only content truth;
- Desktop external-editor flow.

## 7.3 Native connection select

KnowledgeNoteCatalog uses a native select when multiple connections exist.

Replace with the standard Select/quiet workspace selector so focus, menu width, typography and dark-mode treatment match the rest of the product.

## 7.4 Non-goals

Do not:

- add built-in Markdown editing;
- make Web imitate the local filesystem;
- expose projection/lease/webhook internals;
- bulk-load the vault to simplify UI.

# 8. Notification deep audit

## 8.1 Current product semantics are strong

Notification Fact / Inbox / Workflow / Delivery / Interaction boundaries are already materially stronger than the old UI.

The list page correctly keeps:

- Inbox read/unread semantics;
- typed owner actions;
- no business-completion ownership;
- capsule/inbox navigation;
- realtime invalidation.

## 8.2 Collection UI convergence

NotificationListPage uses another custom min-h-14 toolbar and its own tab implementation.

It should become a Collection surface sibling of Goal/Task/Routine:

- same collection gutter;
- same segmented/system-view grammar;
- same responsive primary/filter treatment;
- same empty/loading/error rhythm;
- retain Notification-specific unread/archive semantics.

## 8.3 RUI-09 — browser system click destination drifts

Current behavior:

- in-app list/capsule uses resolveNotificationDestination;
- Desktop click navigation uses the typed navigation intent;
- browser system notification click opens /notifications generically.

Target:

browser system click
→ same destination resolver
→ owner destination when safe/available
→ Inbox fallback only when no destination exists

This makes "click a notification" one product behavior across hosts.

## 8.4 RUI-13 — source/category visual language

NotificationItem still contains raw category palette mappings while Schedule already has semantic source tones.

Create one semantic source/tone presentation vocabulary:

- primary
- info
- success
- warning
- destructive
- muted

Owner/category identity can map into that vocabulary, but feature files should not invent purple/cyan/amber raw classes independently.

## 8.5 SSE Monitor

SSE Monitor is correctly development/diagnostic scoped.

It does not need to look like Notification Inbox.

It should eventually use the diagnostic shell/state grammar and semantic connection badge, but this is polish, not a product blocker.

# 9. Settings + Account + Authentication deep audit

## 9.1 Settings scene should stay distinct

UserSettingsView has the right large-scale IA:

- settings navigation;
- responsive sidebar/Sheet;
- selected capability section;
- lazy owner data;
- host-aware capabilities.

Do not replace this with business module tabs or Goal-style filters.

## 9.2 RUI-10 — card ocean

Settings contains many Card surfaces even when the content is just a property group.

This produces heavier visual hierarchy than Goal/Task and makes simple preferences feel like independent dashboard widgets.

Converge to:

SettingsSection
- section heading/description
- property rows
- inline status/help
- separators

Use SettingsObjectCard only when the object really has its own identity/lifecycle, for example:

- an AI provider connection;
- a Knowledge remote binding;
- a device capability object.

Use SettingsDangerZone for reset/disconnect/delete.

This will reduce borders, nested padding and visual weight without flattening owner boundaries.

## 9.3 Dialog/style drift

Current examples:

- AISettings onboarding uses raw DialogContent;
- KnowledgeRepositorySettings disconnect uses raw DialogContent;
- SettingsResetSection has native select;
- status feedback uses raw amber/emerald/green classes.

Target:

- ProductDialogShell or a SettingsDialogShell built on the same primitives;
- standard Select;
- semantic success/warning/destructive status tokens;
- shared confirmation grammar.

## 9.4 Account

Correct current IA:

- /account redirects into Settings Account tab;
- Account profile is not a second main workspace;
- auth identity stays owned by Better Auth;
- preferences stay in Setting/Notification.

AccountProfileSection can visually adopt Settings property-row grammar.

ProfileCard/ProfileForm appear to be non-production alternate surfaces; either keep them explicitly as story/reference components that follow the same grammar or retire their public export if unused. They should not remain a second visual truth.

## 9.5 Authentication

Main Vue shell owns only the redirect sentinel.

The hard-coded redirect fallback is P3 polish.

Do not merge Authentication identity UI into Account or Settings merely for visual uniformity.

# 10. Governance deep audit — revised direction

## 10.1 The drift is evidence against the reference-module premise

Governance was intentionally maintained as a complete fake product vertical slice so new work could use it as a live reference.

The second-pass review found the opposite behavior in UI practice: real Goal/Task surfaces moved forward while Governance detail/editor/history retained older native controls, card/page patterns and hand-built states.

Keeping the fake module canonical therefore requires an additional synchronization project every time the real product architecture changes.

That is a structural maintenance tax, not merely a styling defect.

## 10.2 Runtime blast radius is materially larger than the visible UI

Product Governance currently spans contracts, package/domain/application/infrastructure/transport, Prisma/PowerSync, HTTP/IPC, Web/Desktop clients, Vue routes/views, bundle export and reference-specific tests.

The repository also carries genuinely useful Engineering Governance under `tools/governance`, `docs/governance`, `docs/standards` and CI gates.

These are different assets and should no longer be conflated.

## 10.3 Revised recommendation

Do **not** spend the next convergence batch modernizing Governance UI.

ADR-113 proposes:

```text
Retire Product Governance Runtime
Keep Engineering Governance
```

Until that ADR is finally accepted/rejected:

- ADR-110 remains current implementation history/contract;
- Governance runtime is not destructively removed;
- no new shared UI abstraction should be justified by Governance;
- no additional Governance UI modernization should be prioritized;
- implementation planning should inventory the retirement blast radius and decouple Engineering Governance inputs first.

# 11. AI workspace deep audit — revised direction

## 11.1 Runtime/owner boundary remains good

Keep Mastra workflow authority, owner-domain application ports, draft/checkpoint/retry identity, bounded context, Knowledge citation identity and provider/secret/capability boundaries.

The problem is not that those internal runtime objects exist. The problem is that they have grown their own user-facing product editors.

## 11.2 RUI-04 — retire the second product UI

Current AI owns `AIGoalDraftEditor`, `AITaskDraftEditor`, workflow review panels and editable Goal/KR/Task/Knowledge overlays.

Making those forms merely "look more like" Goal/Task would preserve the duplication root cause.

Target is Native Surface Orchestration:

```text
Mastra plan / internal draft
        ↓
typed Surface Orchestrator
        ↓
Goal / Task / Knowledge Native Edit Session
        ↓
normal owner UI in BusinessPanel
        ↓
owner validation + owner command
```

The user observes the exact same surface that manual editing uses. A follow-up natural-language instruction patches the active owner edit session rather than an AI-only draft form.

This is semantic computer use, not DOM automation. The AI must not rely on selectors/click simulation or bypass owner validation by mutating arbitrary Vue/Pinia state.

## 11.3 Internal draft identity vs user surface

`draftRef`, run/revision IDs, receipts and reference maps may remain internally necessary for restart/retry/recovery and deterministic workflow identity.

They move behind the Surface Orchestrator boundary and stay out of normal product forms.

## 11.4 Workflow surface becomes conditional retirement candidate

Today BusinessPanel has `home | business | workflow`, and AI teleports dedicated WorkflowPanels into the workflow surface.

After Goal/Task/Knowledge native workflow vertical slices provide equivalent review/edit/recovery behavior, the workflow surface itself can be evaluated for retirement:

- planning/status remains in chat;
- business editing/review happens in owner business tabs;
- diagnostics remains a developer/details concern.

Do not delete the workflow surface before parity and dirty/busy/attention migration are proven.

## 11.5 Composer

AIFooterComposer remains a legitimate specialized control. Its duplicate Teleport/non-Teleport wiring and bespoke elevation are P2 cleanup items, independent of the larger native-surface migration.

# 12. Shell / Capsules / Today Overview deep audit

## 12.1 Shell geometry is protected

Keep:

- conversation/sidebar/business workspace split;
- business panel focus mode;
- panel resizing/minimum widths;
- tab strip;
- container-query behavior;
- one scroll owner per surface.

The BusinessPanel tab strip is a shell-specific control and does not need to look like a Goal ModuleHeader.

## 12.2 RUI-11 — Capsule previews repeat the same shell

Goal, Task, Note, Schedule, Routine and Notification previews all implement roughly:

header
→ loading/error/empty
→ bounded list/content
→ footer / View all

But each independently chooses:

- max-height;
- header gap/border opacity;
- count badge shape;
- loading skeleton grammar;
- empty/error layout;
- footer spacing.

Create light shared primitives:

- CapsulePreviewShell
- CapsulePreviewHeader
- CapsulePreviewFooter
- CapsulePreviewState

In addition, where the content is an owner business interaction, extract the owner Quick Surface below the capsule host. For Task this means TaskQuickSurface / TaskOccurrenceQuickRow rather than sharing `TaskCapsulePreview.vue` itself.

Do **not** create a universal item row. Goal progress, Task occurrence, Note, Schedule event, Routine occurrence and Notification fact have different semantics.

## 12.3 Today Overview and Task action contract

Today Overview currently embeds DailyTodoWidget and routes Quick Task via /tasks?dialog=quick-task.

Quick Task is intentionally retained, so the route contract should be repaired by Task work.

DailyTodoWidget should not own a second Task-completion behavior. It should delegate to the same Task action coordinator as Task Home and Capsules.

# 13. RUI-01 — Canonical Task occurrence action coordinator

This is the most important cross-module integration finding after the Task audit.

Current completion entry points include:

- TaskManagementView
- TaskDetailView
- TaskCapsulePreview
- DailyTodoWidget
- Schedule DayDetailSheet
- Schedule TaskEventActionPanel

Today these can all call completeOccurrence directly.

After completion-time KR recording, the product needs one front-end/application interaction contract:

request Complete occurrence
→ inspect Task/KR completion requirements
→ if no measurement required: complete directly
→ if Prompt mode: open canonical measurement dialog
→ user enters value
→ complete with durable measurement intent
→ if Goal context unavailable: explicit "complete without record" escape path

This coordinator can be rendered from different hosts, but the decision must not be reimplemented in every surface.

The same principle applies to correction/uncomplete semantics.

# 14. RUI-06 — Formalize legal header/toolbar variants

The current code contains several reasonable heights:

- document/configuration compact toolbars around h-11;
- ModuleHeader around the standard entity header height;
- Schedule/Notification business toolbars around h-14;
- BusinessPanel's own h-10 tab strip.

The problem is not that they differ.

The problem is that the variants are not formalized, so every module invents spacing/control recipes.

Define named presentation families such as:

- collection-compact
- entity-standard
- calendar-command
- document-compact
- settings-scene
- diagnostic

Then standardize:

- horizontal gutters;
- border/backdrop treatment;
- control heights;
- responsive collapse rules;
- subnav/filter placement.

Do not normalize all of them to one literal height.

# 15. RUI-14 — State surface convergence

Equivalent state semantics should look equivalent.

Current modules variously use:

- Loader2 centered spinners;
- hand-built CSS spinners;
- Skeleton rows;
- inline destructive text;
- Alert;
- bespoke empty illustrations;
- AppEmptyState.

Target state family:

Collection:
- row skeleton;
- inline retry/error;
- AppEmptyState.

Workspace:
- bounded skeleton/placeholder;
- non-destructive inline error with retry;
- content owner remains visible when possible.

Dialog:
- keep shell visible;
- body loading/error;
- action disabled/busy rather than replacing entire dialog.

Diagnostic:
- explicit technical status allowed.

The state primitive should encode presentation, not centralize business loading state.

# 16. RUI-15 — large component decomposition

Observed large surfaces include:

- KnowledgeProjectionWorkspaceView ~1169 lines;
- AppShell ~965 lines;
- RoutineConfigurationView ~871 lines;
- AIChatView ~650 lines;
- large Settings sections.

Line count alone is not a refactor reason.

Split only when a stable semantic owner exists.

Good candidate extractions:

Knowledge:
- toolbar/catalog/context/reading composition boundaries already exist; keep moving orchestration into composables rather than creating one mega UI abstraction.

Routine:
- WallClockTriggerEditor
- ElapsedTriggerEditor
- ActiveUsageTriggerEditor
- ProfileScopeControl

AI:
- one composer host wrapper;
- owner-specific draft review cards;
- diagnostic metadata details.

Shell:
- stable capsule registry/mount orchestration only after behavior characterization.

Avoid generic "UniversalModulePage", "UniversalDetailForm" or "UniversalEntityCard".

# 17. RUI-05 — visual regression as a release gate

The repository has meaningful functional/E2E tests, including:

- Schedule CRUD/calendar tests;
- Routine configuration tests;
- Notification inbox tests;
- Settings/Account tests;
- AI workflow tests;
- shell geometry tests.

There are also screenshots used for debug/thesis/layout capture.

What is not present is a systematic toHaveScreenshot-style baseline matrix that guards the actual converged product surfaces.

For this UI convergence, create representative visual baselines after the grammar stabilizes.

Minimum matrix:

Collection:
- Goal list
- Task Today
- Routine list
- Notification inbox

Entity:
- Goal detail
- TaskPlan detail

Specialized:
- Schedule month/week/day
- Knowledge wide/narrow
- Settings General + one capability-heavy section
- AI workspace with owner-native Goal/Task workflow surface

Overlays:
- Goal/KR or Record composer
- Task occurrence inspect
- Schedule event inspect
- Routine editor
- responsive narrow Sheet state

Shell:
- normal split
- narrow business panel
- focus mode
- capsule preview

Use deterministic seeded data and fixed viewport/theme/locale. Functional assertions remain necessary; screenshot diffs do not replace behavioral tests.

# 18. Product-wide token / presentation convergence

The UI should increasingly consume semantic tokens rather than feature-local palette decisions.

Recommended semantic vocabulary:

- foreground / muted
- primary
- info
- success
- warning
- destructive
- border
- surface/background/card/popover
- elevation levels

Feature-specific meaning maps into these tokens.

Examples:

- Schedule Task source and Notification Task-related tone should not invent separate cyan/blue recipes;
- Settings provider warning and Governance deprecated warning should share warning grammar;
- success feedback should not mix emerald/green/success tokens.

This is a migration, not a mass search-and-replace. Preserve intentional source identity only where it is meaningful and accessible.

# 19. Recommended convergence order

The remaining work should be sequenced by interaction risk, not by visual convenience.

## Pass A — cross-module correctness contracts

1. canonical Task occurrence action coordinator;
2. Schedule CalendarEntry inspect/edit/delete vertical slice;
3. browser Notification destination parity;
4. lock owner/action boundaries with tests.

## Pass B — product surface grammar

5. formalize page archetypes and toolbar variants;
6. shared Collection state/filter/header grammar;
7. shared Inspect overlay grammar;
8. shared Capsule preview shell;
9. semantic status/source tone mapping.

## Pass C — owner Quick Surface and specialized surface convergence

10. extract Task Quick Surface from Capsule/Home/Schedule duplication;
11. migrate Schedule day/event inspect to Dialog + owner Quick Surface composition;
12. Routine Product Time controls and toolbar convergence;
13. Knowledge Web/Desktop presentation convergence;
14. Notification collection convergence;
15. Settings/Account property-row and dialog convergence.

## Pass D — AI native surface convergence

16. define Owner Native Edit Session + typed Surface Orchestrator;
17. Goal native AI workflow vertical slice;
18. Task native AI workflow vertical slice;
19. Knowledge native AI workflow vertical slice;
20. retire AI-owned product editors after parity;
21. evaluate BusinessPanel workflow-surface retirement;
22. single composer host path and shell/capsule final polish.

## Parallel decision track — Governance

ADR-113 evaluates retiring Product Governance Runtime while preserving Engineering Governance. Do not modernize Governance UI unless the retirement proposal is rejected.

## Pass E — visual closure

19. representative screenshot matrix;
20. keyboard/focus/accessibility pass;
21. narrow/wide container matrix;
22. light/dark + zh-CN/en-US representative checks;
23. delete legacy/duplicate presentation paths only after parity.

# 20. Protected contracts

The convergence must preserve:

Schedule:
- CalendarEntry vs owner projection separation;
- Planner vs Scheduler/Temporal Engine separation;
- owner-command mutation routing;
- Product Time semantics.

Routine:
- Routine/Profile/Membership/TemporaryOverride ownership;
- deterministic runtime;
- host capability gating;
- no legacy Reminder CRUD resurrection.

Knowledge:
- Local Vault truth;
- GitHub authorization/source boundaries;
- stable KnowledgeDocument identity;
- Web read/search/link semantics;
- no built-in Markdown editor resurrection.

Notification:
- Fact/Inbox/Workflow/Delivery/Interaction separation;
- read state != business completion;
- SSE cursor/reconnect;
- typed owner actions.

Settings/Account/Auth:
- capability owners remain distributed;
- Account != Auth identity;
- device vs user preference semantics;
- host capability filtering.

AI:
- Mastra/runtime authority;
- HITL/draft approval;
- owner-domain application ports;
- no AI-owned business truth.

Shell:
- panel geometry/minimum widths;
- focus mode;
- route/tab leave guards;
- one-scroll-owner rule.

Governance:
- permanent reference module;
- Rule/RuleRevision semantics;
- HTTP/IPC and Prisma/PowerSync parity.

# 21. Explicit non-goals

This audit does not recommend:

- one universal page component;
- one toolbar height for every module;
- converting Knowledge into a Goal-style page;
- converting Schedule into a list;
- moving Settings into business-module tabs;
- removing TaskPlan/Governance entity routes merely to reduce navigation depth;
- exposing Scheduler raw invocation UI;
- moving owner-domain state into AI;
- restoring legacy Reminder/Repository models;
- splitting every large file just because it is large.

# 22. Closure criterion for the remaining-module audit

This audit is considered discovery-complete when the convergence plan carries these findings and the implementation phase can answer, for every changed surface:

1. Which surface family does it belong to?
2. Which owner owns the action?
3. Which shared grammar/primitives does it reuse?
4. Which specialization is intentionally retained?
5. What current contract must not break?
6. What behavioral test proves the owner path?
7. What representative visual baseline protects the resulting UI?

At that point the product should feel like one system without pretending every module is the same object.
