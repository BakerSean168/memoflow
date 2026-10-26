# MemoFlow quality tools: Oxfmt + Oxlint / ESLint residual

**Effective after the two independent CI-verified migration PRs.** The
GitHub Actions `Lint` job remains one required job and retains the same
`workspace:lint`, `workspace:format`, `workspace:sync`, and governance receipt
identities. No branch-protection or `CI Check` condition is bypassed.

## Canonical format

- `.oxfmtrc.json`, `oxfmt@0.74.0` are the formatter source of truth.
- `pnpm format:check`, `pnpm format`, and `pnpm format:changed` retain the
  Git-managed file selection, `.prettierignore` (supported natively by Oxfmt),
  `--all` / `--changed` / `--write`, strict exit codes, and the versioned
  `quality-fmt-receipt-v1` with `tool: oxfmt`.
- The first migration accepted 69 Prettier-clean files with mechanical Oxfmt
  differences. Nx 23.3 also detects Oxfmt for `nx format` and generators.

## Canonical lint

Run `pnpm lint` for the **full** CI lint behavior. The hybrid script starts
both mandatory checks concurrently and fails the entire operation if either
fails:

1. `@nx/oxlint@23.3.0` + `oxlint@1.89.0` use the inferred `lint-oxc`
   target on all Nx projects. Nx batches project targets into one Rust Oxlint
   invocation. This includes generic JS/TS correctness and the Nx
   `enforce-module-boundaries` JS bridge.
2. `tools/quality/eslint-residual.mjs` invokes the existing ESLint 10 config
   on its uncovered rule owners only: **all Vue SFCs**, Storybook story files,
   app-vue/app-react product time formatting restrictions, application test
   seam restrictions, and patterns JSON dependency governance. File selection
   includes all tracked and non-ignored new local files. No artificial skip
   or `|| true` is permitted.

The Nx boundary policy has **31 scoped/layered/tiered constraints** in the
current ESLint config. `tools/quality/oxlint-policy.mjs` verifies the Oxlint
bridge options deep-equal the authoritative ESLint options, failing closed
when they diverge. Update both configs together when editing constraints.
A negative-control test suite covers forbidden imports, allowed engine
exceptions, Vue `v-for :key`, product-time restrictions, and Storybook.

The source ESLint Nx targets remain available for `pnpm lint:affected`,
`pnpm lint:fix` and individual app/package checks. This is deliberate:
Nx's Oxlint JS-plugin API is still experimental, so fallback remains possible.
`pnpm lint:oxc` and `pnpm lint:residual` run each portion separately for
troubleshooting; **neither alone is an adequate merge gate**.

## Measured baseline (WSL, warm store, no Nx task cache)

| Command                                            |          Observed |
| -------------------------------------------------- | ----------------: |
| Previous full ESLint, 50 projects                  |             ~41 s |
| Nx Oxlint batch, 50 projects                       | ~3 s Nx execution |
| Residual ESLint, ~1,030 files                      |             ~10 s |
| Complete hybrid lint (both required)               |             ~12 s |
| Previous full Prettier format, 5,535 managed files |             ~61 s |
| Oxfmt full format, 5,545 managed files             |              ~7 s |

These are **local tool-run times**, not full GitHub Actions job durations.
CI still pays for checkout/install, Nx sync and governance tests. Compare
real PR/Main runs only at identical revision/test scope and note cold cache.

## Intentional limitation

The ESLint migration tool skipped 68 rules (primarily Vue templates, Storybook
JS rules, custom syntax). The Oxlint native checks are not a complete
substitute for ESLint; the strict residual is mandatory. If a new ESLint-only
rule is introduced, extend the residual selection and characterization tests
before relying on the fast lane alone. `oxlint` and Nx's JS-plugin bridge are
experimental, so upgrades need complete negative-control and real CI runs.

Useful commands:

```sh
pnpm lint
pnpm lint:oxc
pnpm lint:residual
pnpm format:check
node --test tools/quality/__tests__/*.test.mjs
```

References: [Nx Oxlint](https://nx.dev/docs/technologies/oxlint/introduction),
[Oxfmt migration](https://oxc.rs/docs/guide/usage/formatter/migrate-from-prettier),
[Nx formatter selection](https://nx.dev/docs/reference/code-formatting).
