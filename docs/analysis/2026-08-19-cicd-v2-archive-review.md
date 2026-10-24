# CI/CD Platform V2 — Operational Evidence Window Closure & Archive Review Evidence

> Date: 2026-08-19
> Branch: `docs/cicd-v2-archive`
> Base: `main` at `7b824cf` (after PR #245)
> Decision: per Alex — record the DoD performance deviation as accepted operational evidence and
> archive the plan WITHOUT spending more CI runs to optimize performance.

## 1. Status before

CI/CD V2 plan was "Active / architecture implementation + PR cutover complete; operational
evidence window pending". baseline-v1.json already had 7 same-scope comparable runs
(collected 2026-08-16), but the DoD performance items were not met.

## 2. Measured operational evidence (baseline-v1.json)

| Metric     | P50 (7 runs) | DoD target |      Deviation |
| ---------- | -----------: | ---------: | -------------: |
| wallClock  |    10.66 min |    7–8 min | -26% (not met) |
| runner-min |        49.88 |       42.3 | -15% (not met) |

Bottleneck (PR #245 run 32213541128 job wall-clock): total ~10.6 min bounded by the serial chain
`Scope → Unit Tests(6.3m) → Verification Children(6.5m) → Web Flow 4×shard(6.4m each) → Oracle`.
Runner-min is dominated by the 4 parallel Web Flow shards (~25 runner-min).

## 3. Archive decision

DoD performance items confirmed not-met; accepted-as-deviation and archived per Alex. Rationale:
forcing CI optimization (Unit/Typecheck parallelization, Web shard re-splitting) would consume
large runner time and risk workflow regressions, while the architecture/contracts/operational
closure are fully verified. W8/W11 main scheduled audits archived as evidence-sufficient
(contracts proven by the local fault-injection matrix + PR #210 evidence). CI performance can
be a separate backlog if needed.

## 4. Changes

- `docs/plan/archive/2026-08-05-ci-cd-platform-v2-refactor.md` (moved from active)
- status → **Archived (2026-08-19)**; added "运营证据窗口偏差记录" section with the measured
  table + bottleneck analysis + archive rationale.
- `docs/plan/active/README.md` — row updated to archived reference.

## 5. Gate

Document/archive only — no production code changed. No CI required beyond docs-check.
