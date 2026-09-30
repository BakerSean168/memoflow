# Task visual grammar acceptance

Renders production TaskPlanDialog/TaskPlanForm and TaskDetailView with production
Web CSS, en-US/zh-CN messages, Product Time, Vue Query, Pinia and Task composables.
Task/Goal/Label injected service ports are deterministic partial doubles;
unimplemented operations fail. Uses existing canonical Task test fixtures.
Owner navigation resolves to a sentinel route, proving routing separately from
editing without exercising Goal production behavior. No backend or DB starts.

Run from the repository root:

```sh
pnpm exec playwright test --config apps/web/playwright.task-visual-grammar.config.ts --update-snapshots
pnpm exec playwright test --config apps/web/playwright.task-visual-grammar.config.ts
```

Eight combinations cover 360/1280px, light/dark, en-US/zh-CN. Each captures create,
create property edit, populated detail, labels/reminders/binding editors, empty
optional rows, and reveal through More. Assertions cover keyboard opening/Escape
focus return, distinct owner routing, property-scoped writes, archived/busy
triggers, missing owner, console errors and document/scroll-host overflow.
Screenshots are ignored local artifacts under reports/test-system-v2/task-visual-grammar;
generate and compare on the same Linux Chromium environment. This is production
component acceptance with service doubles, not backend E2E or committed CI goldens.
