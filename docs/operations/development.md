# Development

## First checkout

MemoFlow's default development host is the Windows WSL environment, with repository at `~/projects/memoflow` (Linux path `/home/baker/projects/memoflow`). GCP Dev has been retired. Use the Node/pnpm versions pinned by the repository, install dependencies with `pnpm install --frozen-lockfile`, and inspect [runtime ports](./runtime.md) before starting services.

Run explicitly named Nx targets rather than inventing root `dev:*` wrappers:

```bash
pnpm nx run api:serve
pnpm nx run web:serve
pnpm nx run desktop:serve-safe
```

Use `pnpm nx run desktop:serve` only when dependency builds and native Electron modules are ready.

## Issue → PR

1. Read the Issue, relevant code and this repository's [AGENTS.md](../../AGENTS.md).
2. Implement one focused change. Iterate with the nearest test, then `pnpm check:changed` before pushing.
3. Open a PR with a short problem/fix explanation and actual test evidence; include before/after screenshots for visual changes.
4. Follow required PR checks and review comments. Resolve any reported conflicts and run affected checks.
5. Merge through GitHub once required checks pass. Main CI is a post-merge observation, not a requirement to delay independent work. Ordinary feature development does not trigger a Release.

GitHub Issues contain active plans, decisions and interruption checkpoints. No task-level Markdown plans in the repo. See [Testing](./testing.md) and [Release](./release.md) for their own boundaries. The actual required PR checks are defined by GitHub Actions and the [ruleset](../../.github/rulesets/main.json).
