# SYS-3003 final validation

Date: 2026-09-19 UTC

Branch: `delegated/sys-3003-final-validation-luna`

Accepted SYS-3002 base: `5b1b302f179f32635923592463630d87fea4875e`
Validated source SHA: `85c4084bbb8ff9fffd4c091be1ef36f725d3f03f`

This record is for the exact source head above. The validation evidence was
collected before this evidence-only document was committed; the document does
not change product code or the validated source head.

## Result

All required non-credential gates and the local product/release journeys are
green at the validated source SHA. No push, PR, merge, or SYS-3004 work was
performed.

## Required quality gates

| Gate | Command | Result |
| --- | --- | --- |
| Test inventory | `pnpm test:inventory` | PASS — 1,184 files: unit 1,017; integration 34; smoke 3; boundary-ipc 8; boundary-main 6; E2E 57; perf 1; governance 58. |
| Documentation | `pnpm docs:check` | PASS. |
| Governance | `pnpm governance:check` | PASS — all audits passed. Nx reported its existing flaky-task warning for `assets:build`; it did not fail the gate. |
| TypeScript | `pnpm typecheck` | PASS — 37 projects / 68 tasks, 63 cache reads. |
| Lint | `pnpm lint` | PASS — 41 projects; warnings only. |
| Full tests | `pnpm test` | PASS — 36 projects plus 6 dependency tasks, 42/42 successful. |
| Build | `pnpm build` | PASS — 35 projects plus 1 dependency task. |
| AI replay | `pnpm nx run ai:eval:replay` | PASS — recorded replay; baseline and candidate pass rate 1.000; cost delta -4.81%; p95 latency delta -10.61%; report at `reports/apps/ai/evals/latest.json`. |
| Smoke | `pnpm test:smoke` | PASS — 3 files / 67 tests. |
| Canonical integration | `pnpm test:integration` | PASS — task 6 files / 31 tests; goal 4 / 18; schedule 2 / 24; scheduler 1 / 3; reminder 3 / 15. |
| Affected integration | `pnpm nx affected -t test:integration --base=main --parallel=1` | PASS — 11 projects / 20 tasks. |

## Fresh database and PowerSync validation

- `pnpm --filter @memoflow/database exec prisma validate --config ./prisma/prisma.config.ts` — PASS; all schemas valid.
- `pnpm nx run database:prisma-generate --skip-nx-cache` — PASS; Prisma 7.8 generated and five generated files normalized.
- `node tools/test/hard-7103-schema-boot.mjs` — PASS against a unique temporary PostgreSQL database: `db push`, pgvector 0.8.5, 74 public tables, 32 canonical required tables, vNext uniqueness fences, Task goal-binding v3, retired-table absence, and temporary database teardown all verified.
- `pnpm nx run desktop:db:reset:dry --skip-nx-cache` — PASS; zero affected default local databases.
- `pnpm nx run desktop:local-data:reset:dry --skip-nx-cache` — PASS; default user-data locations absent and zero affected.
- `pnpm nx run powersync-schema:test --skip-nx-cache` — PASS — 1 file / 8 tests.
- Read-only PowerSync/Prisma parity — PASS — 35 sync-config query tables matched 74 generated Prisma mapped tables; missing 0; duplicate queries 0.

## Exact-head local Docker validation

The current-worktree stack was rebuilt from the validated source SHA with a
process-only ephemeral `AI_PROVIDER_ENCRYPTION_KEY`; the key was never written
to the repository or evidence. The old unrelated local MemoFlow containers
were not part of this run. Staging and `MemoFlow-test-db` were left untouched.

- Docker image/runtime evidence: `reports/local-deploy-validation/local-docker-playwright-evidence.json` — PASS; expected and actual image revision both `85c4084bbb8ff9fffd4c091be1ef36f725d3f03f`.
- Compose services — PASS and healthy: API, PostgreSQL, PowerSync, Redis, and Web.
- Migrator — PASS; pgvector, schema reconciliation, AI-provider invariants, Task goal-binding constraint, AI knowledge index, vector probe, and database initialization completed.
- API `/healthz` — HTTP 200, `{"status":"ok"}`.
- API `/info` — HTTP 200, `@memoflow/api`, production environment.
- Web `/` — HTTP 200.
- PowerSync `/probes/liveness` — HTTP 200, `ready: true`, `started: true`.
- `pnpm nx run web:e2e:local-docker --skip-nx-cache` — PASS — 22/22 local-Docker Playwright tests, covering authentication, Goal/Key Result/Task lifecycle, AI workflow, persistence, mobile/panel behavior, and local-stack browser reachability.

## Canonical product and release journeys

- `PLAYWRIGHT_HTML_OPEN=never pnpm nx run web:e2e --skip-nx-cache` — PASS — 65/65 web tests.
- `pnpm nx affected -t e2e --base=main --parallel=1 --outputStyle=static` — PASS at the exact head under Xvfb, D-Bus, an ephemeral GNOME keyring, and the installed Playwright browser cache: Web 65/65 and Desktop 3/3. Nx completed successfully for 2 affected projects and 33 dependency tasks.
- Canonical Linux Electron auth runner — PASS — 2/2; includes guest adoption, re-authentication, data preservation, and offline reopen.
- `pnpm nx run desktop:package --skip-nx-cache --outputStyle=static` — PASS; packaged runtime dependency verification passed for 76 runtime packages.
- Canonical packaged smoke — PASS — `packaged MemoFlow boots through renderer readiness`, 1/1.

## Blockers repaired and regression evidence

1. Preserved the requested test-only Electron root-cause fix in `apps/desktop/src/renderer/platform/electron.spec.ts`: static `electron` import plus `vi.hoisted` fixtures removes the dynamic-import/mock-order failure without changing timeouts. The focused desktop profile/platform tests and the canonical Desktop E2E passed.
2. Fixed the real schedule owner-marker API 422 by replacing the unbounded page-size 500 request with bounded page-size 100 pagination in `useCalendarView`. Schedule integration and web E2E passed.
3. Aligned local-Docker Phase A/B test clocks explicitly to UTC, matching canonical Product Time while Playwright otherwise used the host Asia/Shanghai timezone. The local-Docker suite passed 22/22.
4. Fixed the stale desktop guest-to-cloud adoption SQL reference to retired `accounts.version` and added a regression assertion that the adoption SQL contains no version field. The canonical Linux auth suite passed 2/2, including the adoption path.
5. A host integration run after Electron native rebuild initially found the environment-only `better-sqlite3` ABI mismatch (Electron ABI 148 versus host Node ABI 137). Rebuilt the host native module with `pnpm rebuild better-sqlite3`; the complete integration suite then passed. No test was skipped or weakened.
6. The first affected E2E wrapper hid the installed Chromium cache by assigning the ephemeral keyring directory to `HOME`; all web cases consequently failed before browser launch. The corrected rerun retained the ephemeral keyring and set `PLAYWRIGHT_BROWSERS_PATH` to the installed cache; Web 65/65 and Desktop 3/3 passed.
7. The first packaged-smoke invocation was stopped by terminal job-control behavior while stdin remained attached to the nested runner. The canonical script was rerun with detached stdin; packaged smoke passed 1/1.

## Environment-only conditions and warnings

- No live OpenAI, OpenRouter, GitHub, or other external provider credentials
  were supplied. The real GitHub OAuth suite and the real OpenRouter acceptance
  test are explicitly opt-in (`auth-oauth-real.spec.ts` and the
  `[opt-in]` OpenRouter test); they were not enabled. Their non-credential
  product behavior was covered by the passing mock/loopback and local-provider
  suites. No mandatory non-credential gate was skipped and no pass was faked.
- The process-only encryption key used for local Docker startup is intentionally
  omitted from this record.
- Non-failing warnings included Nx flaky-task notices for `assets:build`, Vite
  configuration/chunk warnings, normal Prisma/pg deprecation messages,
  `ResizeObserver` loop messages, and the existing Vue `ListChecks` resolution
  warning during task-plan journeys. None caused a failing assertion or a
  failing gate.

## Acceptance conclusion

At source SHA `85c4084bbb8ff9fffd4c091be1ef36f725d3f03f`, the required final
validation matrix, fresh schema/bootstrap/reset checks, PowerSync parity,
exact-head Docker health, canonical product journeys, affected E2E, and
packaged release smoke are green. This worktree is safe for SYS-3003 acceptance
by the designated reviewer/integrator.
