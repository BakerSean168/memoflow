# Oxc toolchain pilot — MemoFlow (2026-10-26)

Status: **experimental only**. This branch does **not** change the default ESLint
or Prettier commands, CI job contracts, CI Check, formatter receipt, dependency
architecture, or production behavior.

## Baseline and measured results

Environment: WSL local Node 24, pnpm 11.20.0, 12 logical CPU cores, warm
dependency store, Nx daemon disabled, Nx remote/local task cache bypassed for
the lint measurements. Tool runs were sequential; CI Runner timings differ.

| Operation                                   |           Existing toolchain |                  Oxc pilot | Qualification                                    |
| ------------------------------------------- | ---------------------------: | -------------------------: | ------------------------------------------------ |
| Full Nx lint, 49 projects                   | ESLint 30 s wall (Nx 27.6 s) | Oxlint 6 s wall (Nx 2.9 s) | **Not equivalent rule coverage**                 |
| Nx lint, AI/Vue/Web, 3 projects             |  ESLint 10 s wall (Nx 8.4 s) | Oxlint 4 s wall (Nx 1.7 s) | Both green, incomplete rule parity               |
| Tracked full format comparison, 5,535 files |                Prettier 61 s |            Oxfmt 2.7–2.9 s | Oxfmt reports 69 baseline formatting differences |
| GitHub hosted Main Lint job (existing)      |  ~298 s in a recent Main run |               Not measured | Job also includes setup, sync, governance tests  |

The existing GitHub Lint job executes **four sequentially scheduled primary
tasks**: full Nx lint, full Git-managed formatting, Nx sync:check, and
governance-check (which itself depends on more tests). An Oxc speedup alone
cannot remove the non-linter portions of this critical path.

Oxfmt uses its bundled Prettier for Vue files rather than treating Vue
single-file components as fully Rust-native. The automated Prettier-to-Oxfmt
configuration transfer preserved semicolons, single quotes, 100-column width,
LF endings, and the ignore patterns; it also disabled default
`sortPackageJson` so package ordering does not change silently.

Of 5,535 existing Prettier-clean files, Oxfmt would rewrite **69**:
59 .ts, 4 .vue, 2 .mjs, 2 .md, 1 .mts, 1 .css. This is a small mechanical
migration set but must be reviewed separately from changes to business code.

## Current pilot wiring and how to reproduce

| Surface     | Pilot implementation                                           | Existing default                                        |
| ----------- | -------------------------------------------------------------- | ------------------------------------------------------- |
| Nx          | `@nx/oxlint@23.3.0` inferred, batched target `lint-oxc`        | ESLint target `lint` unchanged                          |
| Oxlint      | `oxlint@1.89.0`, auto-migrated JSON plus Nx boundary JS bridge | `eslint.config.ts` remains authoritative                |
| Oxfmt       | `oxfmt@0.74.0` with migrated `.oxfmtrc.json`                   | `.prettierrc` and git-aware `quality/fmt.mjs` unchanged |
| npm scripts | `pnpm lint:oxc:pilot`, `pnpm format:oxc:compare`               | `pnpm lint`, `pnpm format:check` unchanged              |
| CI          | No Oxlint/Oxfmt step on the required path                      | All previous fail-closed gates remain                   |

Useful checks:

```bash
NX_DAEMON=false node node_modules/nx/dist/bin/nx.js run-many -t lint-oxc --all --parallel=3
node tools/quality/oxc-format-compare.mjs # JSON report, read-only, non-gating
node tools/quality/fmt.mjs --check --all  # required Prettier baseline
node node_modules/nx/dist/bin/nx.js run-many -t lint --all --parallel=3
```

Use the direct Nx CLI in this isolated WSL experiment: pnpm 11 may
trigger its dependency-status auto-install and retry optional binaries for
unrelated operating systems when the lockfile has just changed. One attempted
`pnpm lint:oxc:pilot` invocation timed out in that preflight before reaching
Oxlint; this was an **environment preparation failure**, not a lint failure.
The same full 49-project lint command via `node .../nx.js` passed.

The compare command uses exactly the **Git-managed, ignore-filtered** file
list of `tools/quality/fmt.mjs`. It intentionally returns success when it
finds formatting differences: it is a **compatibility report**, not a
formatter gate. It never writes source files and never forges the existing
`quality-fmt-receipt-v1` artifact.

## Coverage and fail-closed controls

The automated ESLint migration converted **49 rules**, skipped **68**:
12 requiring JS plugins, 9 not implemented, and 47 unsupported, mostly Vue
template rules. It also warned about the special Vue parser and path-level
ignored overrides. The migration cannot be accepted as an equivalent policy.

Characterization probes with temporary source files (all removed afterward):

| Deliberate violation                        | ESLint baseline | Oxlint pilot                                   |
| ------------------------------------------- | --------------- | ---------------------------------------------- |
| `scope:ai` importing `@memoflow/task`       | Rejects         | **Rejects** via `@nx/oxlint/boundaries-plugin` |
| Vue `v-for` without `:key`                  | Rejects         | **Misses**                                     |
| Product code calling `toLocaleDateString()` | Rejects         | **Misses** (custom `no-restricted-syntax`)     |

The Nx boundary plugin reused the existing **31 depConstraints** with
`layer:*`, `scope:*`, `tier:*`, allowlisted modules, and dynamic dependency
exceptions. On this version pair its boundary bridge works against real
project metadata. However, the official Nx plugin and the Oxlint JS-plugin
interface remain **experimental**. Treat upgrades as requiring negative-control
tests, not just a green scan.

The auto-migrated Oxlint overrides initially also rejected legitimate
`packages/time/src/engine/date-fns-engine.ts` imports, configuration-script
imports, and `src/testing` fixture imports because it dropped ESLint's
ignored-file exceptions. Pilot overrides restored those examples. A full
project scan now passes 49/49, but **that is not proof of complete policy
parity**: no complete rule-by-rule or dynamic exception test matrix was
performed. It also emits different warnings.

## Recommended migration sequence

1. **Oxfmt first, separate mechanical change.** Review the 69 files and
   adopt the migrated config, preserving the same Git-managed scope,
   ignore rules, full/changed modes and formatter receipt contract.
   Update `tools/quality/fmt.mjs`, local format scripts, Nx format commands
   and test governance together. Keep 0 differences and exact-source CI
   identity. Do not silently reformat business code in unrelated PRs.
2. **Oxlint fast lane with ESLint residual.** Keep Oxlint batched within Nx
   and enforce native JS/TS checks. Retain ESLint for Vue template parsing,
   Storybook JS plugin checks, and custom restricted syntax/import
   semantics until tested equivalents exist. Consider
   `eslint-plugin-oxlint` to disable _only proven overlapping_ ESLint rules,
   not the required uncovered rules.
3. **Boundary parity and safer upgrades.** Keep a canary matrix for denied
   scope/layer/tier imports and allowed config/testing/engine exceptions.
   The Nx Oxlint JS plugin is experimental; ESLint boundary enforcement
   should remain a fallback if a future upgrade breaks that bridge.
4. **Production gate adoption only after evidence.** Require untouched
   `CI Check` receipts, genuine affected CI tests, format preservation,
   documented rule diff, and real PR/Main CI performance measurements.
   Switching `lint` to `lint-oxc` today would silently discard the
   Vue and time-handling checks demonstrated above.

## Reference contracts

- GitHub-hosted standard `ubuntu-latest` for this public repository:
  fresh 4-vCPU / 16-GB / 14-GB SSD runner per Job; Steps share only their
  own Job filesystem. Other jobs need explicit cache or artifacts.
- Nx 23.3 `@nx/oxlint:lint`: one process for the batch while retaining
  per-project cached targets; JS plugin boundary bridge is experimental.
- Nx 23.2 Oxfmt integration: Nx `format` detects Oxfmt, and both Oxfmt and
  Prettier configured in one workspace cause Oxfmt to take precedence.
  Do not flip Nx format by accident before migrating the existing receipts.
- Oxc ESLint migrator: automatic rule coverage is incomplete; Vue SFC
  template and user-defined syntax restrictions require explicit handling.

Sources:

- https://nx.dev/docs/technologies/oxlint/introduction
- https://nx.dev/blog/nx-23-3-release
- https://nx.dev/blog/nx-23-2-release
- https://docs.github.com/en/actions/reference/runners/github-hosted-runners

This study intentionally does not auto-merge the experimental branch.
