# PVC-ROUTINE-5101 — Product Time controls implementation

Date: 2026-10-01. Branch: `product/vnext-routine-5101`. Final review baseline: `bb90af8f52a4`.

## Implementation

Routine WallClock remains `recurrence.startDate: Ymd` + `localTime: Hm` + `timeZone: TimeZoneId`. The editor reuses ProductDatePicker with `allowedKinds=['day']`, ProductTimePicker and ProductTimeZoneSelector. No wall-clock-to-Instant or timezone conversion was introduced. New WallClock forms default to Product Time's zone and calendar today; persisted overrides retain their exact selected IANA ID.

ProductTimePicker uses hour/minute numeric text drafts, strict existing Product Time Hm codec validation, 24-hour display, padding and independent wrapping arrow-key steps. Invalid drafts never emit, preserving the last committed Hm; blur restores the invalid part from the latest controlled modelValue, and arrow stepping starts from that committed part. Controlled prop changes do not emit.

ProductTimeZoneSelector uses shared Command/Popover primitives and searches both exact IDs and humanized names. Its small provider prefers feature-detected `Intl.supportedValuesOf('timeZone')`; missing, empty or throwing providers use a deterministic curated fallback. UTC, the current Product zone and the current model's saved zone/alias are added and validated with the existing TimeZoneId primitive. IDs are never canonicalized or transformed before persistence. The Product zone is marked explicitly. Routine passes localized hour/minute accessibility labels and timezone default/search/empty text in en-US and zh-CN; the user-facing marker reads “Default time zone” / “默认时区”. Search text cannot create or persist a timezone. The fallback is a common-zone catalogue, not the complete IANA database; runtime enumeration supplies the full supported catalogue.

All four Routine numeric controls use the existing NumberField family, with minima 1 (duration), 1 (active duration), 0 (natural break), and 1 (recurrence interval). The family's missing public UI-package barrel export was added. Elapsed/ActiveUsage DTO construction and ownership are preserved. ROUTINE-5102/5103 and editor decomposition remain outside this change.

## Evidence

The surface specification was changed before production implementation. The intended red Nx run reported **1 failed / 2 passed** because the existing editor still contained `type="date"`. Log: `/tmp/memoflow-5101/surface-red.log`. An earlier quoting error in the test was corrected before this assertion-level red run.

Runtime editor coverage proves Product-zone/today defaults across a UTC/Product calendar-day boundary; unchanged `America/New_York`, `07:45`, `2026-10-15` round-trip; exact changed time/date/zone DTOs; day-only selection; invalid time drafts retaining the committed value; recurrence/duration/active/natural-break minima; Elapsed anchors and ActiveUsage ownership; busy controls and blocked submission. Tests mount actual shared controls and NumberField primitives, with a small Intl enumeration fixture for focused UI interactions. Separate option-provider cases validate fallback and saved IDs absent from enumeration.

The first UI run revealed the missing NumberField export and timed out rendering the full runtime zone catalogue under component-test load. The export was repaired and focused UI tests use a bounded catalogue fixture. Editor tests wait for the actual dialog's scheduled initial focus before interacting with nested popovers.

Final validation:

- `NX_DAEMON=false pnpm nx run app-vue:test -- src/shared/components/ProductTimePicker.spec.ts src/shared/components/ProductTimeZoneSelector.spec.ts src/shared/components/ProductDatePicker.spec.ts src/modules/routine --maxWorkers=2`: 8 files / 54 tests PASS (shared controls 3 files / 31 tests; Routine 5 files / 23 tests, including editor 12 and surface 3).
- `NX_DAEMON=false pnpm nx run app-vue:typecheck`: PASS, including UI package rebuild and dependencies.
- Changed-file ESLint and Prettier: PASS.
- `pnpm test:inventory` then `pnpm test:inventory:check`: PASS, 1,295 files (three new specs registered).
- `NX_DAEMON=false pnpm nx run memoflow:governance-check`: PASS.
- `git diff --check`: PASS.

Command logs are under `/tmp/memoflow-5101/` (`final-tests.log`, `typecheck-final.log`, `eslint-final.log`, `prettier-final.log`, `inventory-check.log`, `governance.log`, `diff-check.log`).

Browser harness **not added**: unit/component evidence is sufficient for this pass, and adding an isolated harness is not trivial. No browser or live-backend E2E acceptance is claimed.

## Review repair evidence

The two review gaps were repaired within ROUTINE-5101. Picker regressions cover invalid hour/minute blur restoring visible committed values without emission, restoration after a controlled prop change, and invalid arrow drafts stepping from committed parts. Existing valid edit/padding, wrapping, disabled and controlled no-emit cases remain passing. The Routine editor test mounts under zh-CN, opens the real timezone popover, and verifies Chinese hour/minute accessibility labels, timezone search placeholder, default marker and empty result text; existing en-US cases remain intact. The editor's invalid-hour test also verifies visible blur restoration before the unchanged DTO is saved. Locale files add only five keys each, preserving their existing style.

Repair validation logs: `/tmp/memoflow-5101-repair/` (`tests.log`, `typecheck.log`, `eslint.log`, `prettier.log`, `inventory-check.log`, `governance.log`, `diff-check.log`). These logs predate final delivery.

## Exact changed files

- `packages/app-vue/src/locales/en-US/routine.ts`
- `packages/app-vue/src/locales/zh-CN/routine.ts`
- `packages/app-vue/src/modules/routine/routine-form-ui.surface.spec.ts`
- `packages/app-vue/src/modules/routine/components/RoutineEditorDialog.vue`
- `packages/app-vue/src/modules/routine/components/RoutineEditorDialog.spec.ts`
- `packages/app-vue/src/shared/components/ProductTimePicker.vue`
- `packages/app-vue/src/shared/components/ProductTimePicker.spec.ts`
- `packages/app-vue/src/shared/components/ProductTimeZoneSelector.vue`
- `packages/app-vue/src/shared/components/ProductTimeZoneSelector.spec.ts`
- `packages/app-vue/src/shared/components/index.ts`
- `packages/app-vue/src/shared/utils/product-time-zone-options.ts`
- `packages/ui-vue-shadcn/src/index.ts`
- `tools/test-system-v2/test-inventory.json`
- `docs/plan/archive/2026-10-01-pvc-routine-5101-product-time-controls.md`
- `docs/plan/active/2026-09-29-product-vnext-execution-master-plan.md` (ROUTINE-5101 Execution paragraph only)

## Independent reviewer acceptance

After rebasing the uncommitted implementation onto accepted batch `bb90af8f52a4`, ChatGPT Web independently reviewed the shared control contracts and Routine integration. The review confirmed that WallClock persistence remains `Ymd + Hm + TimeZoneId`, ProductDatePicker is constrained to exact-day precision, timezone search cannot create arbitrary values, persisted IANA aliases are retained exactly, and NumberField replaces only native numeric UI without changing Elapsed/ActiveUsage ownership.

Fresh validation on that final-review baseline passed **8 files / 54 tests** with Nx cache disabled. `app-vue:typecheck --skip-nx-cache` completed through `vue-tsc`; changed-file ESLint and Prettier passed; the generated inventory is **1,295 files**; governance and `git diff --check` passed. The typecheck run emitted only the repository's existing Nx flaky-task annotations for `time:build` and `contracts:build`, with no TypeScript diagnostics.

No isolated browser or live-backend E2E harness was added for this ticket. Acceptance therefore rests on real mounted component/runtime tests plus static surface governance; no browser visual or live-backend claim is made.

**ROUTINE-5101 is accepted / frozen.**
