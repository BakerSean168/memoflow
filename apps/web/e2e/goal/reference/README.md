# Goal reference browser acceptance

This isolated fixture renders production GoalDetail, GoalDialog, Record, KR Inspect,
and Review dialogs with Web production CSS, locale messages, Product Time and the
real Vue composables/store. Injected Goal/Label/Knowledge ports are deterministic
service doubles. AI is absent. It does not authenticate, start a backend, or mutate
a database. Server Review window/calculation authority is tested separately by Vitest;
the browser double's context is illustrative, not backend acceptance evidence.

From the repository root:

```sh
pnpm exec playwright test --config apps/web/playwright.goal-reference.config.ts --update-snapshots
pnpm exec playwright test --config apps/web/playwright.goal-reference.config.ts
pnpm exec vite build --config apps/web/e2e/goal/reference/vite.config.ts
```

The matrix covers 360/1280px, en-US/zh-CN and light/dark; captures empty creation,
no-KR, five-KR, expired-target Inspect, Review create and read-only Review; and checks a Record → trajectory → two
Review browser flow. Console/page errors fail every test. The fixed browser clock
and explicit Los Angeles Product Time preferences verify calendar-day semantics.
The create-with-KR capture explicitly returns the dialog body to its top position
after filling inputs, so browser focus scrolling cannot change that baseline.

Screenshots live in the ignored `reports/test-system-v2/goal-reference` artifact
folder. The archive acceptance report records the inspected captures and hashes.
Generate then compare on the same Chromium/Linux environment. These are repeatable
local visual baselines, not committed CI golden images or live backend E2E evidence.
