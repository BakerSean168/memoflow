# Development

## First checkout

MemoFlow's default development host is the Windows WSL environment, with repository at `~/projects/memoflow` (Linux path `/home/baker/projects/memoflow`). GCP Dev has been retired. Use the Node/pnpm versions pinned by the repository, install dependencies with `pnpm install --frozen-lockfile`, and inspect [runtime ports](./runtime.md) before starting services.

Run explicitly named Nx targets rather than inventing root `dev:*` wrappers:

```bash
pnpm nx run api:serve
pnpm nx run web:serve
pnpm nx run desktop:serve-safe
```

Use `pnpm nx run desktop:serve` only when dependency builds and native Electron modules are ready. Don't kill another worktree's ports or processes.

## Issue → branch → PR

1. Read the Issue, the active code and this repository's [AGENTS.md](../../AGENTS.md). `git status --short --branch` must be understood before any edits.
2. Fetch `main` and create a short-lived branch in an isolated worktree for this Issue. Keep one writer per worktree; a reviewer uses a fixed SHA/read-only copy.
3. Implement one small concern. Iterate with the nearest test, then `pnpm check:changed` before pushing.
4. Open a PR with a short problem/fix explanation and actual test evidence; include before/after screenshots for visual changes.
5. Follow required PR checks and review comments. If Git reports conflicts, resolve them on that branch and run affected checks. PRs are independent; the Ruleset does not require rechecking every PR against the newest `main` just because another PR merged.
6. When required checks pass, merge through GitHub. The next independent task may start without waiting for post-merge Main CI. Normal feature development does not trigger a Release.
7. Remove the branch/worktree only after confirming there are no unpublished commits, untracked changes or live processes.

GitHub Issues contain active plans, decisions and interruption checkpoints. No task-level Markdown plans in the repo. See [Testing](./testing.md) and [Release](./release.md) for their own boundaries.

## Parallel safety

Multiple agents may build independent PRs in parallel, but must not share a mutable worktree, test database, dev process or an uncommitted file. A root/shared configuration change should be disclosed in its PR and preferably isolated from unrelated feature work.

PR CI is a merge gate; Main CI is a post-merge observation, not a requirement for each developer to stay idle. The platform's CI workflow and [ruleset](../../.github/rulesets/main.json) are the source of truth for required checks.
