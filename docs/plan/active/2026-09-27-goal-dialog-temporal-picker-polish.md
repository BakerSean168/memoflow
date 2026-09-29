# Goal create dialog property chips + temporal picker refinement

Date: 2026-09-27
Status: implementation complete; visual QA pending
Branch: `ui/remote-dev-vite83`
Execution: ChatGPT Web implements and verifies; Codex CLI performs independent review.

## Outcome

Refine the Goal create/edit dialog toward the compact, low-noise interaction seen in Linear without copying product-specific branding. The Goal property row should read as a quiet set of inline properties, and Start date / Target should share one coherent temporal-picker interaction.

Observable result:

- status ("规划中") and labels no longer show a dropdown chevron;
- property chips stay visually light/neutral before and after a value is selected;
- an empty date chip reads its property name; after selection it reads only the localized value, with no `开始日期:` / `目标时间:` prefix;
- Start date and Target open the same visual picker shell and use the same density, header, input, precision controls, calendar, footer and motion;
- calendar heading, weekday labels, date formatting, month labels and week start follow the active MemoFlow regional/presentation preferences;
- Goal temporal picker is visibly more compact and deliberate: ~20rem popover, compact input, segmented precision row, tighter calendar, restrained borders/backgrounds and clear action;
- Goal Start and Target both preserve the user-selected semantic precision as `GoalTimeframe | null`; exact calendar boundaries are derived only for calculations/persistence.

## Baseline and resolved gaps

The original implementation split Start and Target across independent picker surfaces and duplicated visual/locale behavior. The current implementation resolves that baseline as follows:

- `ProductTemporalPickerSurface.vue` now owns the shared temporal panel and precision controls.
- `ProductTimeframePicker.vue` preserves semantic day/month/quarter/half-year/year precision and is reused by both Goal Start and Target through `GoalTimeframePicker.vue`.
- `ProductDatePicker.vue` reuses the same surface while retaining exact-Ymd adapter semantics for Task/Schedule and other exact-calendar callers.
- selected Goal temporal triggers are value-first rather than `${label}: value`.
- `GoalStatusPicker.vue` and compact `LabelPicker.vue` no longer require decorative dropdown chevrons.
- `ProductPropertyChip.vue` owns the quieter shared property-chip treatment.
- locale and `weekStartsOn` derive from `getProductTime().presentation/context` and react through `productTimeRevision`.
- the existing Reka calendar stack remains in place; no parallel calendar implementation was introduced.

## Protected contracts

The temporal UI plan is now aligned with the completed Scheme B decision archived at `docs/plan/archive/2026-09-27-goal-planning-timeframe-semantics.md`:

- Goal API/domain contract: `start: GoalTimeframe | null` and `target: GoalTimeframe | null`; both preserve selected precision.
- Task/Routine and other exact-calendar callers keep their existing `Ymd` / `startDate` semantics.
- existing input parser support for explicit day/month/quarter/half-year/year strings.
- Goal dialog test IDs, focus behavior, save/dirty state, reminder validation, label selection semantics.
- `ProductDatePicker` callers must not silently acquire semantic-precision storage; coarse choices there project to an exact boundary by adapter contract.
- the uncommitted modal-motion work already present in this worktree must be preserved.

## Decisions

### D1 — shared temporal picker surface, adapter-owned semantics

Extract/rework a shared temporal picker surface rather than maintaining two independently styled popovers.

Preferred shape:

```
ProductTemporalPickerSurface
  - common popover content/chrome
  - text query
  - precision selector
  - localized day calendar
  - month / quarter / half-year / year selectors
  - clear + current-value footer

ProductDatePicker adapter
  Ymd <-> day/coarse selection
  coarse selection projects through parsedProductDateStartYmd()
  exact-calendar callers keep exact Ymd output

ProductTimeframePicker adapter
  GoalTimeframe <-> temporal selection
  preserves selected precision
  used by both Goal Start and Goal Target
```

If a smaller extraction is cleaner in the current code, keep wrappers separate but share the entire panel/presentation component. Do not duplicate markup/styles between Start and Target.

For Goal Start specifically, expose the same precision UI as Target and preserve coarse precision directly. Boundary projection happens only where a concrete date is required (for example calendar projection, reminder arithmetic, or normalized persistence).

### D2 — canonical product regional context

The temporal surface derives presentation from MemoFlow product-time state:

- locale = `getProductTime().presentation.locale`
- week start = `getProductTime().context.weekStartsOn`
- react to `productTimeRevision`

Pass these into Reka Calendar. Do not hard-code `en-US`, English month names, or Sunday-first weekdays. Wrapper-specific i18n copy still comes from vue-i18n.

### D3 — trigger content is value-first

Empty:
- `开始日期`
- `目标时间`

Selected:
- exact day: localized product date only, e.g. `2026年9月12日`
- month: localized month only, e.g. `2026年9月`
- quarter/half/year: localized compact semantic value

Never:
- `开始日期: 2026年9月12日`
- `目标时间: 2026 Q4`

### D4 — low-emphasis property chip recipe

`ProductPropertyChip` becomes the canonical visual recipe.

Target visual intent:
- transparent/subtle border;
- very light neutral background;
- muted foreground by default;
- hover raises contrast slightly, not to a filled button;
- selected/value-present state remains in the same light family;
- icon/text communicates state instead of strong fill.

Remove local `bg-muted/40` / `hover:bg-muted/70` overrides where they defeat the shared recipe.

Status and compact labels remove dropdown chevrons entirely. Accessibility remains via role, `aria-expanded`, labels and menu/popover semantics.

## UI detail for the temporal popover

Use the current Linear screenshot as density/reference only:

- width around `w-80`, no oversized card;
- 12px-ish outer paddings;
- first row is compact property title;
- query input immediately below; no verbose always-visible help paragraph when input is valid;
- precision row uses quiet pill/segmented controls: Day / Month / Quarter / Half-year / Year, localized;
- day calendar uses locale + configured week start, compact header navigation and fixed stable grid;
- out-of-month days visibly muted;
- selected day uses one restrained accent;
- footer only shows useful current value + localized Clear;
- borders are subtle and sectioning is minimal;
- avoid nested cards, heavy fills, and redundant labels.

The input parser can continue accepting explicit formats; examples/help may be placeholder/accessible description rather than permanent multi-line instructional text.

## Tickets

### GDP-2101 — quiet property chips

Goal:
Property row reads as one consistent, low-emphasis control family.

Implementation:
1. Adjust shared `ProductPropertyChip.vue` recipe.
2. Remove `ChevronDown` from `GoalStatusPicker.vue`.
3. Remove compact `ChevronDown` from `LabelPicker.vue`.
4. Normalize compact label/status styles to the shared light recipe; preserve full-width LabelPicker behavior.
5. Add/update focused tests for absence of chevrons and accessible expanded/pressed semantics.

Acceptance:
No dropdown arrow beside Planning or Labels; selected values do not switch to a heavy fill.

### GDP-2102 — shared temporal surface

Goal:
Start and Target use one presentation implementation.

Implementation:
1. Extract the duplicated temporal popover presentation into a shared component or equivalent common primitive.
2. Reuse existing parse/date boundary helpers rather than duplicating date math.
3. Keep adapters explicit: exact Ymd vs semantic GoalTimeframe.
4. Use the semantic GoalTimeframe adapter for both Goal Start and Target, preserving coarse precision for each.
5. Keep existing test IDs where callers depend on them.

Acceptance:
Opening Start and Target yields the same shell, dimensions, precision row and calendar styling.

### GDP-2103 — internationalized calendar + value-first triggers

Goal:
Temporal UI obeys MemoFlow locale/regional preferences end-to-end.

Implementation:
1. Wire `productTimeRevision` + `getProductTime()` to obtain reactive locale/weekStartsOn.
2. Pass locale/weekStartsOn to Calendar.
3. Localize month names and calendar heading/weekdays through Reka/Intl; avoid manual English labels.
4. Change trigger labels to show only the value when set.
5. Ensure exact-day Target labels are localized instead of raw `YYYY-MM-DD` where appropriate at the presentation layer; do not change domain serialization.
6. Add zh-CN and en-US tests including week-start behavior.

Acceptance:
With zh-CN + Monday-first preferences, the calendar no longer shows `September 2026` and `S M T...`; values render using the active product presentation.

### GDP-2104 — Linear-like density polish + verification

Goal:
Temporal popover feels compact and desktop-native.

Implementation:
1. Tighten layout, input, precision controls, calendar spacing and footer.
2. Keep keyboard navigation/focus/ARIA intact.
3. Run focused unit tests, app-vue typecheck/test targets relevant to changed components, and web production build.
4. Perform source-level regression check that Goal no longer has two independent picker layouts.

Acceptance:
No layout regression at Goal dialog width; no console/type errors; build succeeds.

## Verification

Automated verification completed:

- App Vue typecheck passed.
- App Vue test shard 1: 106 files / 412 tests passed.
- App Vue test shard 2: 105 files / 436 tests passed.
- Focused Goal dialog, temporal picker, product surface and date-boundary tests passed.
- `web:build` completed successfully.
- Scheme B contracts/database/Goal/AI typechecks and domain/persistence tests passed.
- Independent Codex review reported no blocking or correctness findings after compatibility fixes.
- `git diff --check` passed.

Remaining acceptance work is visual QA in the running app at normal desktop width, especially popover alignment/density and zh-CN/en-US presentation.

Reference commands:

```bash
pnpm exec vitest run \
  src/shared/components/ProductPropertyChip.spec.ts \
  src/shared/components/LabelPicker.spec.ts \
  src/shared/components/ProductDatePicker.spec.ts \
  src/modules/goal/components/dialogs/GoalDialog.spec.ts

pnpm nx run app-vue:typecheck
pnpm nx run web:build
git diff --check
```

Add focused tests for the new shared temporal surface and Goal timeframe adapter if files are introduced.

## Non-goals

- no further temporal-domain redesign beyond the completed Scheme B Goal migration;
- no change to Task/Routine exact-date semantics;
- no replacement of Reka/shadcn calendar stack;
- no global redesign of dropdown menus or non-Goal forms in this pass;
- no reversion of the modal motion optimization already staged in the worktree.
