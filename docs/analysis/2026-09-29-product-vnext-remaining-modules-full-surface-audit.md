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
3. Governance is documented as MemoFlow's executable reference module, but its detail/editor/history UI still demonstrates older custom form/page primitives instead of the current product grammar.
4. AI workflow review surfaces expose draft refs, IDs, mutation/runtime terminology and generic form grids that no longer match the manual Goal/Task product language.
5. The repository has functional/E2E coverage, but there is still no systematic visual-regression matrix covering the representative surface archetypes of this large UI convergence.

The target is therefore:

> **shared grammar, specialized surfaces, owner-canonical actions.**

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
- Governance rules

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
- Governance Rule

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

## 3.8 AI collaborator surface

AI is a collaborator next to owner modules, not a second product model.

Contract:

- one composer;
- owner-domain draft review must use owner-domain product language;
- internal IDs, draft refs, mutation counters and execution internals belong in diagnostics, not normal review UI;
- AI applies changes only through owner ports;
- AI review should visually resemble the product object that will be created.

## 3.9 Diagnostic/developer surface

Governance is a real reference workbench; SSE Monitor is a diagnostic page.

Diagnostic surfaces may show technical detail, but still use current shared primitives, states, spacing and semantic tokens.

# 4. Finding ledger

| ID | Severity | Area | Finding |
| --- | --- | --- | --- |
| RUI-01 | P1 | Cross-module Task actions | Schedule, Task capsule and Today widget directly complete Task occurrences and would bypass completion-time KR measurement |
| RUI-02 | P1 | Schedule | CalendarEntry update/delete exist in owner APIs and edit dialog, but normal event inspect is read-only |
| RUI-03 | P1 | Governance | Executable reference module still demonstrates old custom page/form primitives |
| RUI-04 | P1 | AI | Workflow review surfaces expose internal refs/IDs and diverge from current Goal/Task interaction language |
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

# 10. Governance deep audit

## 10.1 Why Governance matters more than an ordinary dev page

Governance documentation says it is:

- a real development workbench;
- a permanent executable reference feature;
- the canonical demonstration of MemoFlow feature architecture.

That makes UI drift here a P1 reference-contract issue.

## 10.2 Current UI drift

GovernanceListView is partially modern:

- compact h-11 header;
- FilterBar;
- AppEmptyState;
- standard Button/Dropdown components.

But detail/editor/history are visibly from an older page generation:

- large breadcrumb + h1 blocks;
- repeated bordered cards;
- native input/select/textarea controls;
- hand-built spinners;
- custom router-link buttons;
- custom sticky action card;
- custom badge/status recipes.

A new feature author using Governance as a reference would learn the wrong current UI conventions.

## 10.3 Target Governance surface family

Rule list:
- canonical Collection surface;
- FilterBar remains appropriate;
- sparse Rule rows;
- standard state surfaces.

Rule detail:
- first-class Entity workspace;
- ModuleHeader;
- identity/status/severity/tags in current property grammar;
- standard action menu;
- code/examples remain content blocks.

Rule editor:
- a full editor route is justified because good/bad code examples can be large;
- use standard Input/Textarea/Select;
- standard page editor header/footer or action rail;
- no native controls;
- one scroll owner;
- responsive side metadata only if it carries real value.

Revision history:
- deep route is acceptable because RuleRevision is immutable/auditable and users may navigate revisions;
- use the same Rule workspace shell rather than a visually unrelated page.

Governance should become the **reference implementation for specialized full-page editor/detail surfaces**, while Goal/Task remain the reference for personal business entity surfaces.

# 11. AI workspace deep audit

## 11.1 Runtime/owner boundary is good

Keep:

- Mastra as runtime/workflow authority;
- owner-domain application ports;
- explicit draft/review/approve;
- bounded context;
- Knowledge citation identity;
- provider/secret/capability separation.

The main drift is now product language and surface presentation.

## 11.2 RUI-04 — AI review is a second product vocabulary

Current normal workflow UI exposes examples such as:

- draftRef;
- goalRef / keyResultRef;
- knowledgeSpaceId / documentId;
- raw aggregation enum names;
- revision counters;
- mutation count;
- result reference map IDs;
- technical failure operation/code blocks.

These are useful diagnostics, but they are not the product object the user is approving.

Target:

AI Goal draft
→ look and read like Goal Create/KR editor
→ same friendly calculation method labels
→ same Initial / Current / Target grammar
→ same timeframe/property semantics

AI Task draft
→ same Task schedule/importance/Goal-KR language
→ same target Task→KR modes when PVC-TASK-3301 lands
→ no raw IDs in normal copy

AI Knowledge capture
→ same Knowledge document/source language

Diagnostics:
- draft refs;
- run IDs;
- revision IDs;
- mutation receipts;
- low-level operation codes

move behind DEV/details/diagnostic affordance rather than normal review surface.

## 11.3 Composer

AIFooterComposer itself is a legitimate specialized control.

It does not need to use ProductPropertyChip everywhere.

But:

- arbitrary rgba box shadows should become semantic elevation tokens/utility;
- the AIChatView template currently wires the same composer once for Teleport and once for non-Teleport fallback;
- keep one logical composer mount path/wrapper to reduce event/prop drift.

This is P2 maintainability, not a functional redesign.

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
- Governance list

Entity:
- Goal detail
- TaskPlan detail
- Governance Rule detail

Specialized:
- Schedule month/week/day
- Knowledge wide/narrow
- Settings General + one capability-heavy section
- AI workspace with workflow review

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

## Pass C — reference and owner surfaces

10. Governance becomes current UI reference module;
11. Routine Product Time controls and toolbar convergence;
12. Knowledge Web/Desktop presentation convergence;
13. Notification collection convergence;
14. Settings/Account property-row and dialog convergence.

## Pass D — AI and shell convergence

15. AI owner-language draft review;
16. hide diagnostics from normal workflow review;
17. single composer host path;
18. shell/capsule final polish.

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
