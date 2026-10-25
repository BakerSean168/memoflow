# Quality VNext — stage responsibility matrix

One pipeline, six stages. Each stage states what it must prove, what it may
reuse, and what evidence it emits. Implemented across Q1–Q6 of the Test &
CI/CD VNext refactor (PR #621); capability requirements for every change are
computed once by the delivery manifest (`laneDetails`: required / files /
targets / skipReason) and enforced by `ci-check`.

| Stage    | Entry                                    | Must prove                                                                           | Reuse rule                                                                  | Evidence out                                   |
| -------- | ---------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------- |
| Local    | `pnpm check:focus`, `pnpm check:changed` | Changed files formatted + linted; affected lint/typecheck/test green                 | Nx local cache                                                              | Terminal output only                           |
| Pre-push | `pnpm check:pre-push`                    | Local checks + target governance + test inventory consistency                        | —                                                                           | Terminal output only                           |
| PR       | `ci.yml`                                 | Every manifest-required lane and capability actually executed (ci-check)             | Nx cache; affected scoping                                                  | Manifest, lane evidence, fmt receipt, receipts |
| Main     | `ci.yml` (push) + candidate publish      | PR evidence is bound to the exact merge SHA, otherwise a full audit runs             | `prepare-ci-manifest` PR-evidence reuse (`execution.mode = reuse`)          | Candidate images + manifest chain              |
| Nightly  | `nightly-audit.yml` (02:00 UTC)          | Full-repo backstop: coverage gates, full Web audit, fault matrix, perf               | Nothing — full runs by design                                               | Coverage + audit + fault + fmt receipts        |
| Release  | `release-publish.yml`                    | Release consumes the candidate set and its evidence instead of re-running test lanes | Candidate evidence (candidate-set-v1, lane evidence from the draft release) | Published release + delivery channel           |

## PR lane map (ci.yml)

- Static Checks (Fmt + Governance) — one lightweight runner: changed-file
  format check with a `quality-fmt-receipt-v1` receipt, governance suite.
- Lint / Typecheck / Unit (3 LPT shards) — affected only, mutually
  independent, none of them waits for the Build job.
- Component Browser — independent job; Storybook interaction tests on the
  Vitest Browser Mode runner. Storybook-only changes select no Web E2E.
- Contract — `test:contract` targets, no database. The contracts suite's
  single primary execution lives here; Unit shards exclude it by the
  manifest routing rule.
- Verification Children — Integration, Boundary, Coverage, Performance
  sub-lanes with per-sublane receipts.
- Build — produces artifacts only for the jobs that consume them (Web Flow,
  Desktop boundary, candidate publish).
- Web Flow — affected E2E specs, duration-weighted shards.
- CI Check — the single authoritative gate: every required job, sub-lane,
  web shard receipt and wired capability (fmt, componentBrowser, contract)
  must report success; a skipped or missing producer fails the gate.

## Nightly responsibilities (nightly-audit.yml)

Full Web audit (all specs), governed coverage gates, the CI platform fault
matrix (fail-closed drills), the performance experiment, a full-repo format
audit (PRs check changed files only), and the release backlog audit.
