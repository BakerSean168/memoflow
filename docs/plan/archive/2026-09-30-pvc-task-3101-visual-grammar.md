# PVC-TASK-3101 — Task create/detail visual grammar convergence

Execution date: 2026-09-30. Worktree: `/home/dev/projects/_worktrees/memoflow-task-3101`.
Branch: `product/vnext-task-3101`; baseline HEAD: `6b8e50793022`.
Implementation was delegated to GPT-6.1 Sol medium; architecture, independent review, acceptance, commit and merge are owned by ChatGPT Web. Final reviewer acceptance: PASS.

## Audit and grammar decisions

Compared TaskPlanForm/TaskPlanDialog/TaskDetailView with the frozen GoalDialog and
GoalDetailView reference. Goal production code was not changed.

| Surface/property        | Before                                                                                                                                            | Decision / after                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task create             | ProductAutoTextarea, shared property chips, anchored editors, LabelPicker, bottom checklist and dialog footer already match the proven primitives | Keep unchanged; exercise the production dialog/form in the browser matrix                                                                                                                                     |
| Detail core metadata    | Goal-like label/value grid; shared status, schedule, recurrence and importance chips                                                              | Keep unchanged; retain Task Plan lifecycle and schedule meanings                                                                                                                                              |
| Goal/KR binding         | Owner badge, optional KR badge, tiny Pencil/Plus for editing                                                                                      | Explicit owner navigation chip with outward arrow and localized “Open Goal: {name}” accessible name; separate named “Edit Goal binding” chip opens the existing Task binding editor; KR badge remains context |
| Labels                  | Passive colored badges plus tiny Plus                                                                                                             | One shared property chip displays selected names and color swatches and opens the existing LabelCommandPanel; no separate Plus required                                                                       |
| Reminders               | Per-value removal dropdowns, separate tiny add menu and Pencil editor                                                                             | One value summary chip opens the existing ReminderSection for adding, changing, removing or disabling triggers; remove redundant view-level removal helpers                                                   |
| Empty optional metadata | Hidden rows, discoverable through More                                                                                                            | Preserve More quick actions and advanced editor routes; opening an empty editor reveals its row and dismissal hides it again                                                                                  |

Selected names/reminder summaries truncate within the value column at narrow widths;
the existing picker/editor exposes full values. Navigation is available independently
of editing, including on archived Plans. Missing/unavailable owners have passive
context and retain the binding editor; they do not receive a navigation control.
There is still one binding editor in each existing create/detail surface; More opens
the same detail editor rather than introducing another path or entity abstraction.

The browser exposed Escape being consumed by the nested label command panel.
A Task-local capture handler closes its popover and restores focus to the trigger;
the shared panel and frozen Goal code are unchanged. Reka/shadcn triggers, active
states, theme tokens, loading/saving/archive disabling and locale parity are retained.
The production diff does not change server/domain/query/measurement behavior,
TASK-3401 coordination, TASK-3301 measurement modes, or Plan/Occurrence ownership.

## Exact changed files

Production:

- `packages/app-vue/src/modules/task/views/TaskDetailView.vue`
- `packages/app-vue/src/locales/en-US/task.ts`
- `packages/app-vue/src/locales/zh-CN/task.ts`

Validation and inventory:

- `packages/app-vue/src/modules/task/views/TaskDetailView.spec.ts`
- `packages/app-vue/src/modules/task/task-vnext-ui.surface.spec.ts`
- `apps/web/playwright.task-visual-grammar.config.ts`
- `apps/web/e2e/task/visual-grammar/index.html`
- `apps/web/e2e/task/visual-grammar/main.ts`
- `apps/web/e2e/task/visual-grammar/vite.config.ts`
- `apps/web/e2e/task/visual-grammar/task-visual-grammar.spec.ts`
- `apps/web/e2e/task/visual-grammar/README.md`
- `tools/test-system-v2/test-inventory.json`

Documentation:

- `docs/plan/archive/2026-09-30-pvc-task-3101-visual-grammar.md`
- `docs/plan/active/2026-09-29-product-vnext-execution-master-plan.md` (TASK-3101 execution paragraph)

## Behavioral evidence

```sh
pnpm nx run app-vue:test --args='src/modules/task/components/TaskPlanForm/TaskPlanForm.spec.ts src/modules/task/views/TaskDetailView.spec.ts src/modules/task/task-vnext-ui.surface.spec.ts'
pnpm nx run app-vue:typecheck
pnpm nx run test-system-v2:test:inventory
pnpm nx run memoflow:governance-check
pnpm exec playwright test --config apps/web/playwright.task-visual-grammar.config.ts --update-snapshots
pnpm exec playwright test --config apps/web/playwright.task-visual-grammar.config.ts
```

Focused Vitest: **3 files, 19 tests passed**. Two new component runtime tests cover
empty optional rows/More and values on edit chips with owner navigation separated.
The surface lock adds shared-chip/owner-control assertions; existing create,
workspace and Prompt/Fixed/LinkOnly coordinator tests remain meaningful.
Typecheck passed; reviewer rerun also passed the App-Vue `vue-tsc` target with dependency outputs cached. A separate reviewer `--skip-nx-cache` attempt hit a generated `contracts/dist` cleanup `ENOENT` that Nx classified as flaky, not a TypeScript/Vue diagnostic. Changed-file ESLint passed with zero warnings/errors;
`git diff --check` passed. Inventory generation and Nx inventory check passed:
1,287 test files, 60 E2E files, no ownership-contract errors; the new browser spec
has one primary collector. Governance check passed.

Reference search confirmed no production `UniversalEntityDetail`, one
`openGoalContext` navigation handler, and the existing single detail
`KeyResultLinksSection` used by the named chip and More. No duplicate editor or
owner destination was introduced.

## Browser and visual evidence

The isolated harness builds production TaskPlanDialog/TaskPlanForm/TaskDetailView,
production Web CSS and locale messages, with real Task composables, Pinia,
Vue Query and Product Time. Only injected Task/Goal/Label ports are deterministic
partial service doubles. Unexpected operations fail. It starts no backend or DB.

| Locale | Theme | Width × height        | Create/detail + editors + More |
| ------ | ----- | --------------------- | ------------------------------ |
| en-US  | light | 360 × 900, 1280 × 900 | Passed                         |
| en-US  | dark  | 360 × 900, 1280 × 900 | Passed                         |
| zh-CN  | light | 360 × 900, 1280 × 900 | Passed                         |
| zh-CN  | dark  | 360 × 900, 1280 × 900 | Passed                         |

**11/11 browser baseline-generation and 11/11 comparison tests passed**: eight matrix cases and three behavior cases. Each
matrix case captures ten states: create, create property edit, populated detail,
labels edit, reminders edit, binding edit, empty detail, labels revealed via More,
Goal binding revealed via More and reminders revealed via More. **80 screenshots**.
Every capture asserts no document or Task scroll-host/dialog-body horizontal
overflow. Console/page errors fail each test. Keyboard Enter opens labels;
Escape closes and returns focus. More submenu discovery uses keyboard navigation,
avoiding narrow submenu pointer transit instability.

The behavior cases verify writes scoped to `labelIds`, `reminderConfig` or
`goalBinding`; editing does not navigate; owner navigation performs no write;
missing owner has no navigation trigger; archived property triggers are disabled
while owner navigation stays enabled; a pending mutation disables other edit
triggers. Screenshot inspection covered wide light create, narrow dark Chinese
create and reminders, and narrow light and wide dark detail; shared chip silhouettes and
wrapping remain coherent with the Goal reference.

Local artifacts: `reports/test-system-v2/task-visual-grammar/` (ignored), with the
HTML report in `html/`. These are local Chromium/Linux baselines and are compared
on the same environment, with a 0.002 pixel-diff ratio tolerance.

Representative inspected baseline SHA-256 values (all 80 hashes are recorded in
`screenshot-sha256.json` beside the ignored captures):

| Capture                                                                | SHA-256                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `en-US-light-1280-create-and-detail-property-grammar/create.png`       | `abba8e97354e28fffdad28f9f2d38d497825be13fad34e105dce0534c938eb8d` |
| `zh-CN-dark-360-create-and-detail-property-grammar/create.png`         | `bc3f94e11b236f2416b52998d14d260ca186ea09bf371253df6c36ff47afd2ff` |
| `en-US-dark-1280-create-and-detail-property-grammar/detail.png`        | `ffae1f8c4b93e14c87edd455b715e81c69d052a6b767645aca0fb4905cac26b7` |
| `zh-CN-dark-360-create-and-detail-property-grammar/reminders-edit.png` | `06c2dd9cd335c0bb44c7d482d377525ccc234b018907e76daccbf81f9f6d0040` |

## Limitations and handoff

- Production-component acceptance with service doubles is not authenticated
  backend E2E, persistence/concurrency acceptance or database evidence.
- Create acceptance exercises the real dialog/form and property editors, but does
  not submit a create request. Owner routing resolves to a sentinel destination;
  it proves route intent, not the already-frozen Goal destination implementation.
- Populated detail reminder editing now uses ReminderSection instead of separate
  per-value removal and add dropdowns. Empty-property presets/custom time remain
  discoverable through More; the existing editor handles populated triggers.
- Screenshots are ignored local artifacts, not committed CI golden images. The
  isolated Vite build emits a non-failing large-chunk warning.
- Known unrelated full-app shell geometry failures and prior Task capsule source
  assertion were not changed. The full app-vue suite was not rerun; required
  focused Task tests, typecheck and governance passed.
- No destructive DB bootstrap or `prisma db push` was run. Evidence was captured before
  final integration; ChatGPT Web performs commit/push only after the independent review
  gates above pass.
